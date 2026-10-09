// Pre-publish secret scan of the files that would be committed (git ls-files if a repo exists, else the tree minus .gitignore'd dirs).
// Never prints secret values: only file names and the rule that matched.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'tmp', 'coverage']);
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(path.relative(root, p));
  }
  return out;
}
let files;
try { files = execSync('git ls-files --cached --others --exclude-standard', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); }
catch { files = walk(root); }
if (!files.length) files = walk(root);

const token = process.env.RABBITWORK_API_TOKEN;
const PUBLIC_SPEC = /^spec\/openapi\.(en|pt)\.json$|^server\/spec\/routes\.mjs$/; // copies of the public API docs
const ALLOWED_EMAILS = /@(example\.com|rabbiit\.com|rabbit\.com|acme\.com)$/i;
// Built from parts so this file does not match itself.
const ACCOUNT_RE = new RegExp(['Many' + ' Meds', '2025' + '/06/17', 'project ' + '103\\b'].join('|'), 'i');
const RULES = [
  ['RABBITWORK_API_TOKEN value', (s) => !!token && token.length >= 8 && s.includes(token)],
  ['x-api-token literal value', (s) => /x-api-token['"]?\s*[:=]\s*['"][A-Za-z0-9_\-]{12,}['"]/i.test(s)],
  ['AWS access key', (s) => /\bAKIA[0-9A-Z]{16}\b/.test(s)],
  ['GitHub token', (s) => /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/.test(s)],
  ['Slack token', (s) => /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/.test(s)],
  ['private key block', (s) => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(s)],
  ['generic bearer secret', (s) => /Bearer\s+[A-Za-z0-9_\-.]{24,}/.test(s)],
  ['local absolute path (/tmp, /workspace, /home)', (s, f) => !PUBLIC_SPEC.test(f) && /(^|[\s'"`(])\/(tmp|workspace|home\/box)\//.test(s.replace(/path\.join\(tmpdir\(\)[^)]*\)/g, ''))],
  ['owner account-specific data', (s) => ACCOUNT_RE.test(s)],
  ['unexpected email address', (s, f) => !PUBLIC_SPEC.test(f) && (s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).some((e) => !ALLOWED_EMAILS.test(e))],
];
const hits = [];
for (const f of files) {
  let s;
  try { s = readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
  for (const [rule, test] of RULES) if (test(s, f)) hits.push(`${f}: ${rule}`);
}
console.log(JSON.stringify({ filesScanned: files.length, tokenCheck: token ? 'compared against RABBITWORK_API_TOKEN (value not printed)' : 'RABBITWORK_API_TOKEN not set in this environment', findings: hits }, null, 2));
process.exit(hits.length ? 1 : 0);
