// Deploy do MCP para a Lambda.
// Rode na raiz do repositório:
//   npm run deploy              -> dev
//   npm run deploy -- staging   -> staging
//   npm run deploy -- prod      -> prod
// Os testes locais rodam antes. O deploy só segue se eles passarem.
// Em prod, confirme digitando prod. A patch sobe sozinha (1.1.0 vira 1.1.1). O log fica em log/.
// A AWS usa o profile local "rabbiit", o mesmo do Rabbit App.

import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import readline from 'node:readline/promises';
import path from 'node:path';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const lockFile = path.join(root, '.deploy.lock');
const logDir = path.join(root, 'log');
const stages = ['dev', 'staging', 'prod'] as const;
type Stage = (typeof stages)[number];

const blue = '\x1b[36m';
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const white = '\x1b[37m';
const reset = '\x1b[0m';
const bold = '\x1b[1m';
const bgRed = '\x1b[41m';
const check = '\u2714';

const tests = ['test/run.mjs', 'test/http.mjs'];
const awsProfile = 'rabbiit';
const standardBranches = new Set(['dev', 'master', 'main']);

let stage: Stage = 'dev';
let lockAcquired = false;
let finishing = false;
let logFile = '';
let logStream: ReturnType<typeof createWriteStream> | undefined;
let activeChild: ChildProcess | undefined;

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}

function write(text: string): void {
  process.stdout.write(text);
  logStream?.write(stripAnsi(text));
}

function timestamp(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function usage(): string {
  return 'Uso: npx tsx deploy.ts [dev|staging|prod]\nSem argumento, o stage é dev.';
}

function parseStage(): Stage {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] && !stages.includes(args[0] as Stage))) {
    console.error(`${red}Argumento invalido: ${args.join(' ')}${reset}`);
    console.error(usage());
    process.exit(1);
  }
  return (args[0] as Stage | undefined) ?? 'dev';
}

function acquireLock(): void {
  if (existsSync(lockFile)) {
    console.error(`${red}Deploy ja em andamento (lock: ${lockFile}).${reset}`);
    console.error(`${red}Se nao houver deploy rodando, remova: .deploy.lock${reset}`);
    process.exit(1);
  }
  writeFileSync(lockFile, `${process.pid} ${new Date().toISOString()}\n`);
  lockAcquired = true;
}

function releaseLock(): void {
  if (lockAcquired && existsSync(lockFile)) {
    rmSync(lockFile);
    lockAcquired = false;
  }
}

function initLog(): void {
  mkdirSync(logDir, { recursive: true });
  logFile = path.join(logDir, `deploy-${timestamp()}-${stage}.log`);
  logStream = createWriteStream(logFile, { flags: 'a' });
  write(`Deploy log file: ${logFile}\n`);
}

function finish(code: number): void {
  if (finishing) return;
  finishing = true;
  if (activeChild && !activeChild.killed) activeChild.kill();
  if (logFile) write(`Deploy log saved to: ${logFile}\n`);
  releaseLock();
  if (!logStream) process.exit(code);
  logStream.end(() => process.exit(code));
}

function currentBranch(): string {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    throw new Error('Nao foi possivel detectar a branch atual do git');
  }
}

async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(question)).trim();
    logStream?.write(stripAnsi(`${question}${answer}\n`));
    return answer;
  } finally {
    rl.close();
  }
}

async function confirmProd(): Promise<void> {
  if (stage !== 'prod') return;

  if (!stdin.isTTY) {
    throw new Error(`Deploy para prod requer confirmacao interativa`);
  }

  const branch = currentBranch();
  if (!standardBranches.has(branch)) {
    write(`\n${bgRed}${white}${bold}  ATENCAO: DEPLOY PARA PROD COM BRANCH NAO PADRAO  ${reset}\n`);
    write(`${yellow}Branch atual: ${bold}${branch}${reset}\n`);
    const typedBranch = await ask(`Digite o nome da branch '${branch}' para confirmar: `);
    if (typedBranch !== branch) throw new Error('Deploy cancelado');
  }

  write(`\n${bgRed}${white}${bold}  ATENCAO: DEPLOY PARA PRODUCAO  ${reset}\n`);
  const typedProd = await ask(`Digite 'prod' para confirmar: `);
  if (typedProd !== 'prod') throw new Error('Deploy para prod cancelado');
}

function runCommand(command: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  write(`${blue}Running: ${command}${reset}\n`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: root,
      shell: true,
      env,
    });
    activeChild = child;
    child.stdout.on('data', (chunk: Buffer) => write(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => write(chunk.toString()));
    child.on('error', (error) => {
      if (activeChild === child) activeChild = undefined;
      reject(error);
    });
    child.on('close', (code) => {
      if (activeChild === child) activeChild = undefined;
      if (finishing) return;
      if (code === 0) resolve();
      else reject(new Error(`Command failed: ${command}`));
    });
  });
}

async function main(): Promise<void> {
  stage = parseStage();
  acquireLock();
  initLog();
  process.on('SIGINT', () => finish(1));
  process.on('SIGTERM', () => finish(1));

  write(`\nStarting deploying process...\n\n`);
  write(`Stage: ${bold}${blue}${stage}${reset}\n`);
  write(`Domain: o hostname vem do SSM na hora do deploy.\n\n`);

  await confirmProd();
  await bumpProdVersion();

  for (const test of tests) {
    write(`${blue}Running ${test}...${reset}\n`);
    await runCommand(`node ${test}`);
    write(`${green}${test} passed.${reset}\n\n`);
  }

  const awsEnv = { ...process.env, AWS_PROFILE: awsProfile, AWS_SDK_LOAD_CONFIG: '1' };
  write(`${blue}Creating or updating the ${stage} domain...${reset}\n`);
  await runCommand(`serverless create_domain --stage ${stage} --aws-profile ${awsProfile}`, awsEnv);
  write(`${green}Domain ready.${reset}\n\n`);

  write(`${blue}Deploying to ${stage}...${reset}\n`);
  await runCommand(`serverless deploy --stage ${stage} --aws-profile ${awsProfile}`, awsEnv);
  write(`${green}${bold}${check} Deployment to ${stage} completed.${reset}\n`);
  if (stage === 'prod') {
    write(`${yellow}Lembrete: commite server/version.mjs, package.json, plugin.json e .cursor-plugin/plugin.json juntos.${reset}\n`);
  }
  finish(0);
}

async function bumpProdVersion(): Promise<void> {
  if (stage !== 'prod') return;
  write(`${blue}Bumping patch version for production deploy...${reset}\n`);
  await runCommand('node scripts/bump-version.mjs');
  write(`${green}Patch version bumped.${reset}\n\n`);
}

main().catch((error: Error) => {
  write(`${red}${error.message}. Exiting...${reset}\n`);
  finish(1);
});
