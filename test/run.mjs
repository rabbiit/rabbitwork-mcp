// Zero-dependency local tests. Never calls the live Rabbitwork API: every HTTP request goes to a local mock server.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ROUTES } from '../server/spec/routes.mjs';
import { normalizeTimeEntry, parseDurationMinutes, shapeFrom } from '../server/normalize.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; failures.push(name); console.log(`FAIL ${name}\n  ${e.stack}`); }
}

// ===================== minimal JSON Schema subset check =====================
function check(schema, obj, defs, where = '$') {
  const errs = [];
  if (schema.$ref) return check(defs[schema.$ref.split('/').pop()], obj, defs, where);
  if (schema.oneOf) {
    const ok = schema.oneOf.filter((s) => check(s, obj, defs, where).length === 0).length;
    if (ok !== 1) errs.push(`${where}: matches ${ok} of oneOf`);
    return errs;
  }
  if (schema.const !== undefined && obj !== schema.const) errs.push(`${where}: must equal ${schema.const}`);
  if (schema.type === 'object') {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return [`${where}: not an object`];
    for (const r of schema.required || []) if (!(r in obj)) errs.push(`${where}: missing ${r}`);
    for (const [k, v] of Object.entries(obj)) {
      if (schema.propertyNames?.not?.enum?.includes(k)) errs.push(`${where}: forbidden key ${k}`);
      const ps = schema.properties?.[k];
      if (ps) errs.push(...check(ps, v, defs, `${where}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${where}: unexpected property ${k}`);
      else if (typeof schema.additionalProperties === 'object') errs.push(...check(schema.additionalProperties, v, defs, `${where}.${k}`));
    }
  }
  if (schema.type === 'string') {
    if (typeof obj !== 'string') errs.push(`${where}: not a string`);
    else if (schema.pattern && !new RegExp(schema.pattern).test(obj)) errs.push(`${where}: fails pattern`);
  }
  if (schema.type === 'array') {
    if (!Array.isArray(obj)) errs.push(`${where}: not an array`);
    else obj.forEach((x, i) => schema.items && errs.push(...check(schema.items, x, defs, `${where}[${i}]`)));
  }
  return errs;
}


// ===================== synthesized example data (not real) =====================
function sampleValue(name, d) {
  if (name === 'is_locked') return false;
  if (name === 'active') return d.t === 'boolean' ? true : 1;
  if (name.includes('email')) return 'someone@example.com';
  if (d.e) return d.e[0];
  switch (d.t) {
    case 'integer': return 1;
    case 'number': return 1.5;
    case 'boolean': return true;
    case 'array': return [];
    case 'object': return {};
    case 'string':
      if (d.f === 'date') return '2026-01-05';
      if (d.f === 'date-time') return '2026-01-05T10:00:00Z';
      if (name.endsWith('_id') || name === 'id') return '1';
      return 'x';
    default: return 'x';
  }
}
const sampleObj = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([k, d]) => [k, sampleValue(k, d)]));
const EVENT_TYPES = ['time_entry.created', 'time_entry.updated', 'project.created'];
function synth(r) {
  const m = r.res?.mode;
  if (!m || m === 'none') return { status: 204, json: undefined };
  if (r.res.scalar) return { status: 200, json: { data: EVENT_TYPES } };
  const one = { id: 1, ...sampleObj(r.res.fields) };
  if (m === 'list') return { status: 200, json: { data: [one], ...(r.res.paged ? { has_next_page: false } : {}) } };
  if (m === 'raw') return { status: 200, json: sampleObj(r.res.fields) };
  return { status: 200, json: { data: one } };
}

// ===================== mock Rabbitwork API =====================
const ROUTE_LIST = Object.values(ROUTES)
  .map((r) => ({ r, re: new RegExp(`^${r.path.replace(/:\w+/g, '[^/]+')}$`), params: r.pathParams.length }))
  .sort((a, b) => a.params - b.params);
let records = [];
let overrides = {};
const mockServer = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname.replace(/^\/api\/v1/, '');
    const ct = req.headers['content-type'] || '';
    let body;
    if (raw) body = ct.includes('application/json') ? JSON.parse(raw) : raw;
    const rec = { method: req.method, path: p, query: Object.fromEntries(u.searchParams), headers: req.headers, body, ct };
    records.push(rec);
    const send = ({ status, json, headers = {} }) => {
      res.writeHead(status, { 'content-type': 'application/json', 'x-ratelimit-accountdaily': '2499', ...headers });
      res.end(json === undefined ? '' : JSON.stringify(json));
    };
    const key = `${req.method} ${p}`;
    if (overrides[key]) { const o = overrides[key]; return send(typeof o === 'function' ? o(rec) : o); }
    const hit = ROUTE_LIST.find((x) => x.r.method === req.method && x.re.test(p));
    if (!hit) return send({ status: 404, json: { message: 'route not in mock' } });
    return send(synth(hit.r));
  });
});
await new Promise((r) => mockServer.listen(0, '127.0.0.1', r));
const MOCK_URL = `http://127.0.0.1:${mockServer.address().port}/api/v1`;

// ===================== MCP client helper =====================
const TEST_TOKEN = 'dummy-test-token-123';
function startServer(extraEnv = {}, { onElicit } = {}) {
  const env = { ...process.env, RABBITWORK_API_TOKEN: TEST_TOKEN, RABBITWORK_API_BASE_URL: MOCK_URL, ...extraEnv };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const proc = spawn('node', ['server/index.mjs'], { cwd: root, env, stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = ''; const waiters = new Map(); let nextId = 1;
  proc.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      const msg = JSON.parse(line);
      if (msg.method === 'elicitation/create') { // server -> client request (approval card)
        Promise.resolve(onElicit ? onElicit(msg.params, msg) : { error: { code: -32601, message: 'no elicitation' } }).then((reply) => {
          if (reply === null) return; // simulate no answer (timeout)
          proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...reply }) + '\n');
        });
        continue;
      }
      waiters.get(msg.id)?.(msg); waiters.delete(msg.id);
    }
  });
  const request = (method, params) => new Promise((res, rej) => {
    const id = nextId++; const to = setTimeout(() => rej(new Error(`timeout ${method}`)), 10000);
    waiters.set(id, (m) => { clearTimeout(to); res(m); });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const call = async (name, args) => (await request('tools/call', { name, arguments: args })).result;
  return { request, call, notify: (m) => proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: m }) + '\n'), stop: () => proc.kill() };
}
const S = startServer();
await S.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
S.notify('notifications/initialized');
const reset = (o = {}) => { records = []; overrides = o; };
const writes = () => records.filter((r) => r.method !== 'GET');
const assertHeaders = (rec) => {
  assert.equal(rec.headers['x-api-token'], TEST_TOKEN);
  assert.match(rec.headers['user-agent'], /^rabbitwork-agent-plugin\//);
  assert.equal(rec.headers.accept, 'application/json');
};
const ok = (res) => { assert.ok(!res.isError, res.content?.[0]?.text); return res.structuredContent; };
const err = (res, re) => { assert.equal(res.isError, true, 'expected an error'); if (re) assert.match(res.content[0].text, re); return res.content[0].text; };

const LIST = (await S.request('tools/list')).result.tools;
const { TOOLS } = await import('../server/index.mjs');
const META = Object.fromEntries(TOOLS.map((x) => [x.name, x]));

// ===================== manifests =====================
await t('plugin.json valid vs Agent Plugins 1.0.0 schema; counts in description', () => {
  const schema = JSON.parse(readFileSync(path.join(root, 'test/schemas/plugin.schema.json'), 'utf8'));
  const doc = JSON.parse(readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  assert.deepEqual(check(schema, doc, schema.$defs || {}), []);
  assert.equal(doc.version, '1.0.0');
  const c = { READ: 0, WRITE: 0, DESTRUCTIVE: 0 }; TOOLS.forEach((x) => c[x.kind]++);
  assert.ok(doc.description.includes(`${TOOLS.length} tools`), doc.description);
  assert.equal(doc.author.email, 'dyorg@rabbiit.com'); assert.equal(doc.homepage, 'https://rabbitwork.io'); assert.equal(doc.license, 'MIT');
});
await t('mcp.json valid vs schema; env only ${VAR} placeholders; every placeholder declared; no UA vars', () => {
  const schema = JSON.parse(readFileSync(path.join(root, 'test/schemas/mcp.schema.json'), 'utf8'));
  const doc = JSON.parse(readFileSync(path.join(root, 'mcp.json'), 'utf8'));
  const vars = JSON.parse(readFileSync(path.join(root, 'plugin.json'), 'utf8')).extensions['com.cursor'].variables.properties;
  assert.deepEqual(check(schema, doc, schema.$defs), []);
  for (const v of Object.values(doc.mcpServers.rabbitwork.env)) { assert.match(v, /^\$\{[A-Z_]+\}$/); assert.ok(vars[v.slice(2, -1)], v); }
  assert.deepEqual(Object.keys(doc.mcpServers.rabbitwork.env).sort(), ['RABBITWORK_API_BASE_URL', 'RABBITWORK_API_TOKEN']);
});

await t('.cursor-plugin/plugin.json (Cursor Marketplace format): valid, consistent with plugin.json, relative paths, logo present, variables cover every ${VAR}', () => {
  const cp = JSON.parse(readFileSync(path.join(root, '.cursor-plugin/plugin.json'), 'utf8'));
  const ap = JSON.parse(readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  assert.match(cp.name, /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);
  for (const k of ['name', 'version', 'description', 'homepage', 'repository', 'license']) assert.equal(cp[k], ap[k], k);
  assert.deepEqual(cp.author, ap.author); assert.deepEqual(cp.keywords, ap.keywords);
  assert.deepEqual(cp.variables, ap.extensions['com.cursor'].variables);
  assert.equal(cp.variables.type, 'object');
  for (const k of ['logo', 'skills', 'mcpServers']) { assert.ok(!cp[k].includes('..') && !cp[k].startsWith('/'), k); assert.ok(existsSync(path.join(root, cp[k])), `${k} path exists`); }
  const mcp = JSON.parse(readFileSync(path.join(root, cp.mcpServers), 'utf8'));
  const srv = mcp.mcpServers.rabbitwork;
  assert.equal(srv.command, 'node'); assert.deepEqual(srv.args, ['${CURSOR_PLUGIN_ROOT}/server/index.mjs']); assert.equal(srv.cwd, '${CURSOR_PLUGIN_ROOT}');
  for (const v of Object.values(srv.env)) { assert.match(v, /^\$\{[A-Z_]+\}$/); assert.ok(cp.variables.properties[v.slice(2, -1)], v); }
  const skill = readFileSync(path.join(root, 'skills/rabbitwork-timesheets/SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: rabbitwork-timesheets\ndescription: .+\n---\n/);
  for (const f of ['LICENSE', 'README.md', '.gitignore', 'assets/logo.svg']) assert.ok(existsSync(path.join(root, f)), f);
  assert.match(readFileSync(path.join(root, 'LICENSE'), 'utf8'), /^MIT License/);
});
await t('pre-publish secret scan passes (token value compared, never printed)', () => {
  const r = spawnSync('node', ['scripts/secret-scan.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(JSON.parse(r.stdout).findings, []);
});

// ===================== protocol / catalog =====================
await t('initialize + ping + unknown method + unknown tool', async () => {
  const S2 = startServer();
  const init = await S2.request('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
  assert.equal(init.result.serverInfo.version, '1.0.0');
  assert.deepEqual((await S2.request('ping')).result, {});
  assert.equal((await S2.request('nope')).error.code, -32601);
  assert.equal((await S2.request('tools/call', { name: 'nope', arguments: {} })).error.code, -32602);
  S2.stop();
});
await t('every documented non-deprecated route has exactly one primary tool; only GET /time-entries is excluded', () => {
  const covered = new Set(TOOLS.map((x) => x.route));
  const missing = Object.keys(ROUTES).filter((k) => !covered.has(k));
  assert.deepEqual(missing, ['GET /time-entries']);
  assert.ok(ROUTES['GET /time-entries'].deprecated);
  assert.equal(Object.keys(ROUTES).length, 130);
  assert.ok(!Object.keys(ROUTES).some((k) => k.includes('/auth')), 'auth routes are not in the updated spec');
});
await t('tool descriptions carry the kind marker; annotations match; schemas closed', () => {
  assert.equal(LIST.length, TOOLS.length);
  for (const tool of LIST) {
    const k = META[tool.name].kind;
    if (k === 'READ') assert.ok(tool.description.startsWith('READ.'), tool.name);
    if (k === 'WRITE') assert.ok(tool.description.startsWith('WRITE (changes live data — confirm with the user first)'), tool.name);
    if (k === 'DESTRUCTIVE') {
      assert.ok(tool.description.startsWith('DESTRUCTIVE — confirm explicitly with the user first; the server asks the user on an approval card (MCP elicitation)'), tool.name);
      assert.ok(tool.inputSchema.properties.reason, `${tool.name} needs reason arg`);
      assert.ok(tool.inputSchema.properties.confirm, `${tool.name} needs confirm arg`);
    }
    assert.equal(tool.annotations.readOnlyHint, k === 'READ');
    assert.equal(tool.annotations.destructiveHint, k === 'DESTRUCTIVE');
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.ok(!('custom_fields.{id}' in tool.inputSchema.properties));
  }
  const destructive = TOOLS.filter((x) => x.kind === 'DESTRUCTIVE').map((x) => x.route);
  assert.equal(destructive.length, 25);
  assert.ok(destructive.every((r) => r.startsWith('DELETE ') || r === 'POST /users/:userId/remove-assignments'));
  assert.equal(destructive.filter((r) => r.startsWith('DELETE ')).length, 24);
});

// ===================== one mock test per tool / route =====================
const TMP = mkdtempSync(path.join(tmpdir(), 'rw-test-'));
const PNG = path.join(TMP, 'photo.png');
writeFileSync(PNG, Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'));
function sampleArg(name, prop) {
  if (name === 'url') return 'https://example.com/hook';
  if (name === 'event_types') return ['time_entry.created'];
  if (name === 'file') return PNG;
  if (name.includes('email')) return 'new.person@example.com';
  if (prop.enum) return prop.enum[0];
  const ty = Array.isArray(prop.type) ? prop.type[0] : prop.type;
  if (ty === 'integer') return 1;
  if (ty === 'number') return 2.5;
  if (ty === 'boolean') return true;
  if (ty === 'array') return prop.items?.type === 'string' ? ['1'] : [1];
  if (ty === 'object') return {};
  if (prop.format === 'date' || /YYYY-MM-DD/.test(prop.description || '')) return '2026-01-05';
  if (name.startsWith('work_') || name.startsWith('time_')) return '09:00';
  if (name === 'project_id') return '1';
  return 'sample';
}
const OVERRIDES = {
  add_project_member: { 'GET /projects/1/users': { status: 200, json: { data: [] } } },
  add_project_task: { 'GET /projects/1/tasks': { status: 200, json: { data: [] } } },
  add_team_member: { 'GET /teams/1/users': { status: 200, json: { data: [] } } },
};
const routeBody = (r) => Object.keys(r.body?.fields || {});
for (const tool of LIST) {
  const meta = META[tool.name];
  if (tool.name === 'list_time_entries') continue; // curated tool, tested below
  const r = ROUTES[meta.route];
  await t(`route ${meta.route} -> ${tool.name} (${meta.kind})`, async () => {
    const props = tool.inputSchema.properties, req = tool.inputSchema.required || [];
    const args = {};
    for (const k of req) args[k] = sampleArg(k, props[k]);
    for (const p of r.pathParams) args[p] = 1;
    const bodyNames = routeBody(r).filter((k) => k in props);
    const isEdit = meta.kind === 'WRITE' && r.method === 'POST' && r.path.split('/').pop().startsWith(':') && !['add_project_member', 'add_project_task', 'add_team_member'].includes(tool.name);
    if (isEdit && !bodyNames.some((k) => k in args) && bodyNames.length) {
      const pick = bodyNames.find((k) => k === 'description') || bodyNames.find((k) => props[k].type === 'string' && !props[k].enum) || bodyNames[0];
      args[pick] = sampleArg(pick, props[pick]);
    }
    if (meta.kind === 'DESTRUCTIVE') args.confirm = true;
    if (/^(add|remove)_user_assignments$/.test(tool.name)) args.users = ['3'];
    reset(OVERRIDES[tool.name] || {});
    const out = ok(await S.call(tool.name, args));
    const expectedPath = r.path.replace(/:\w+/g, '1');
    const hits = records.filter((x) => x.method === r.method && x.path === expectedPath);
    assert.ok(hits.length >= 1, `expected ${r.method} ${expectedPath}; got ${records.map((x) => `${x.method} ${x.path}`).join(', ')}`);
    const rec = hits[hits.length - 1];
    assertHeaders(rec);
    // Query: only declared query params, stringified.
    for (const k of Object.keys(rec.query)) assert.ok(r.query.some((q) => q.n === k), `undeclared query ${k}`);
    for (const q of r.query) if (args[q.n] !== undefined) assert.equal(rec.query[q.n], String(args[q.n]));
    if (r.method === 'GET') {
      assert.equal(rec.body, undefined);
      assert.equal(writes().length, 0, 'READ tool must not write');
      assert.ok('items' in out || 'item' in out);
    } else {
      assert.equal(writes().length, 1, 'exactly one write request');
      if (tool.name === 'upload_user_profile_photo') {
        assert.match(rec.ct, /^multipart\/form-data; boundary=/);
        assert.match(rec.body, /name="file"; filename="photo.png"/);
        assert.match(rec.body, /Content-Type: image\/png/);
      } else if (tool.name === 'archive_user') {
        assert.deepEqual(rec.body, { active: 0 });
      } else {
        const sentBody = rec.body || {};
        const expected = {};
        for (const k of bodyNames) if (args[k] !== undefined) expected[k] = args[k];
        // Body = exactly the fields the caller passed (nothing copied from a read-before GET).
        assert.deepEqual(sentBody, expected, 'body must contain only passed fields');
        assert.ok(!('resentUnchanged' in out));
        if (Object.keys(sentBody).length) assert.match(rec.ct, /^application\/json/);
      }
    }
  });
}

// ===================== destructive gate =====================
for (const tool of TOOLS.filter((x) => x.kind === 'DESTRUCTIVE')) {
  await t(`DESTRUCTIVE ${tool.name} refuses without confirm:true and sends no request`, async () => {
    const r = ROUTES[tool.route];
    const props = LIST.find((x) => x.name === tool.name).inputSchema;
    const args = {};
    for (const k of props.required || []) args[k] = sampleArg(k, props.properties[k]);
    for (const p of r.pathParams) args[p] = 1;
    for (const c of [undefined, false]) {
      reset();
      const a = { ...args }; if (c !== undefined) a.confirm = c;
      err(await S.call(tool.name, a), /Refused: .*DESTRUCTIVE.*confirm: true\. No request was sent\./);
      assert.equal(records.length, 0);
    }
    reset();
    err(await S.call(tool.name, { ...args, confirm: 'yes' }), /"confirm" must be a boolean/);
    assert.equal(records.length, 0);
  });
}

// ===================== approval card (MCP elicitation) =====================
let cards = [];
let cardReply = () => ({ result: { action: 'accept', content: { approve: 'aprovar' } } });
const SE = startServer({ RABBITWORK_ELICIT_TIMEOUT_MS: '400' }, { onElicit: (params, msg) => { cards.push({ params, id: msg.id }); return cardReply(params); } });
await SE.request('initialize', { protocolVersion: '2025-06-18', capabilities: { elicitation: {} }, clientInfo: { name: 'test-elicit', version: '0' } });
SE.notify('notifications/initialized');
const CUST = { 'GET /customers/3': { status: 200, json: { data: { id: 3, name: 'ACME Ltda', active: 1 } } } };
const deletes = () => records.filter((x) => x.method === 'DELETE');
await t('elicitation: card shows recurso, nome, id, motivo; accept+aprovar deletes', async () => {
  reset(CUST); cards = []; cardReply = () => ({ result: { action: 'accept', content: { approve: 'aprovar' } } });
  const out = ok(await SE.call('delete_customer', { customerId: 3, reason: 'cliente duplicado' }));
  assert.equal(cards.length, 1);
  const { message, requestedSchema } = cards[0].params;
  assert.match(message, /Excluir cliente/); assert.match(message, /Recurso: Clientes/); assert.match(message, /Nome: ACME Ltda/);
  assert.match(message, /ID: customerId=3/); assert.match(message, /Motivo: cliente duplicado/);
  assert.deepEqual(requestedSchema.properties.approve.enum, ['aprovar', 'recusar']); assert.deepEqual(requestedSchema.required, ['approve']);
  assert.match(String(cards[0].id), /^rw-srv-\d+$/);
  assert.equal(out.done, true); assert.equal(out.approvedVia, 'elicitation');
  assert.deepEqual(deletes().map((x) => x.path), ['/customers/3']);
  const gIdx = records.findIndex((x) => x.method === 'GET'), dIdx = records.findIndex((x) => x.method === 'DELETE');
  assert.ok(gIdx >= 0 && gIdx < dIdx, 'target resolved (GET) before the card/DELETE');
});
for (const [label, reply, re] of [
  ['decline', { result: { action: 'decline' } }, /recusado no cartão/],
  ['cancel', { result: { action: 'cancel' } }, /cancelado/],
  ['accept + recusar', { result: { action: 'accept', content: { approve: 'recusar' } } }, /opção "recusar"/],
  ['accept without content', { result: { action: 'accept' } }, /opção "recusar"|cancelado/],
  ['client JSON-RPC error', { error: { code: -1, message: 'boom' } }, /cancelado/],
]) {
  await t(`elicitation: ${label} -> "Recusado pelo usuário, nada foi apagado", zero DELETE`, async () => {
    reset(CUST); cards = []; cardReply = () => reply;
    const out = ok(await SE.call('delete_customer', { customerId: 3, confirm: true }));
    assert.equal(cards.length, 1);
    assert.equal(out.done, false); assert.equal(out.refused, true);
    assert.match(out.message, /^Recusado pelo usuário, nada foi apagado/); assert.match(out.message, re);
    assert.equal(out.target.nome, 'ACME Ltda');
    assert.equal(deletes().length, 0); assert.equal(writes().length, 0);
  });
}
await t('elicitation: no answer before timeout -> treated as cancelled, zero DELETE', async () => {
  reset(CUST); cards = []; cardReply = () => null;
  const out = ok(await SE.call('delete_customer', { customerId: 3 }));
  assert.equal(out.refused, true); assert.match(out.message, /sem resposta no prazo/);
  assert.equal(deletes().length, 0);
  // a late reply after the timeout is ignored safely
  cardReply = () => ({ result: { action: 'accept', content: { approve: 'aprovar' } } });
});
await t('elicitation: confirm:true alone does NOT bypass the card', async () => {
  reset(CUST); cards = []; cardReply = () => ({ result: { action: 'decline' } });
  const out = ok(await SE.call('delete_customer', { customerId: 3, confirm: true }));
  assert.equal(cards.length, 1); assert.equal(out.refused, true); assert.equal(deletes().length, 0);
});
await t('elicitation: guards still refuse before any card (locked entry, non-member)', async () => {
  reset({ 'GET /time-entries/5': { status: 200, json: { data: { id: 5, is_locked: true } } }, 'GET /projects/7/users': { status: 200, json: { data: [] } } }); cards = [];
  err(await SE.call('delete_time_entry', { timeEntryId: 5 }), /locked/);
  err(await SE.call('remove_project_member', { projectId: 7, userId: 9 }), /not a member/);
  assert.equal(cards.length, 0); assert.equal(writes().length, 0);
});
await t('elicitation: card for routes without a snapshot shows the items / query', async () => {
  cardReply = () => ({ result: { action: 'decline' } });
  reset(); cards = [];
  ok(await SE.call('remove_user_projects', { userId: 2, project_id: [7, 8], reason: 'saiu do time' }));
  assert.match(cards[0].params.message, /Remover projetos do usuário/); assert.match(cards[0].params.message, /ID: userId=2/);
  assert.match(cards[0].params.message, /Itens: \{"project_id":\[7,8\]\}/); assert.match(cards[0].params.message, /Motivo: saiu do time/);
  reset(); cards = [];
  ok(await SE.call('delete_latest_rate', { type: 'cost', user_id: '4' }));
  assert.match(cards[0].params.message, /ID: type=cost, user_id=4/);
  assert.equal(writes().length, 0);
});
for (const tool of TOOLS.filter((x) => x.kind === 'DESTRUCTIVE')) {
  await t(`elicitation: ${tool.name} shows a card; decline -> no write; accept -> exactly one write`, async () => {
    const r = ROUTES[tool.route];
    const props = LIST.find((x) => x.name === tool.name).inputSchema;
    const args = {};
    for (const k of props.required || []) args[k] = sampleArg(k, props.properties[k]);
    for (const p of r.pathParams) args[p] = 1;
    if (tool.name === 'remove_user_assignments') args.users = ['3'];
    cardReply = () => ({ result: { action: 'decline' } });
    reset(); cards = [];
    const o1 = ok(await SE.call(tool.name, args));
    assert.equal(cards.length, 1); assert.equal(o1.refused, true); assert.equal(writes().length, 0);
    assert.match(cards[0].params.message, /Recurso: /); assert.match(cards[0].params.message, /ID: /);
    cardReply = () => ({ result: { action: 'accept', content: { approve: 'aprovar' } } });
    reset(); cards = [];
    const o2 = ok(await SE.call(tool.name, args));
    assert.equal(o2.done, true); assert.equal(writes().length, 1);
    assert.equal(writes()[0].method, r.method);
  });
}
await t('non-elicitation client: fallback keeps confirm gate (false/missing refused with zero requests; true deletes, no card)', async () => {
  reset(CUST);
  err(await S.call('delete_customer', { customerId: 3, confirm: false }), /confirm: true\. No request was sent/);
  err(await S.call('delete_customer', { customerId: 3 }), /confirm: true\. No request was sent/);
  assert.equal(records.length, 0);
  const out = ok(await S.call('delete_customer', { customerId: 3, confirm: true, reason: 'x' }));
  assert.equal(out.approvedVia, 'confirm'); assert.equal(deletes().length, 1);
});

// ===================== guards =====================
const MEMBERS = { status: 200, json: { data: [{ id: 88, project_id: 7, user_id: 5, user_name: 'Bruno', manager: 0, is_billable: false, rate: '80' }] } };
await t('add_project_member refuses an existing member (no write)', async () => {
  reset({ 'GET /projects/7/users': MEMBERS });
  err(await S.call('add_project_member', { projectId: 7, userId: 5 }), /already a member.*update_project_member/);
  assert.equal(writes().length, 0);
});
await t('add_project_member refuses a user not in available list (no write)', async () => {
  reset({ 'GET /projects/7/users': MEMBERS, 'GET /projects/7/users/available': { status: 200, json: { data: [{ id: 9 }] } } });
  err(await S.call('add_project_member', { projectId: 7, userId: 10 }), /not in the available-users list/);
  assert.equal(writes().length, 0);
});
await t('add_project_member adds an available user with only the given fields', async () => {
  reset({ 'GET /projects/7/users': MEMBERS, 'GET /projects/7/users/available': { status: 200, json: { data: [{ id: 9 }] } } });
  ok(await S.call('add_project_member', { projectId: 7, userId: 9, is_billable: true }));
  assert.deepEqual(writes()[0].body, { is_billable: true });
});
await t('update_project_member refuses non-members; diff for members', async () => {
  reset({ 'GET /projects/7/users': MEMBERS });
  err(await S.call('update_project_member', { projectId: 7, userId: 6, rate: '90' }), /not a member.*add_project_member/);
  assert.equal(writes().length, 0);
  reset({ 'GET /projects/7/users': MEMBERS, 'POST /projects/7/users/5': { status: 200, json: { data: { ...MEMBERS.json.data[0], rate: '90' } } } });
  const out = ok(await S.call('update_project_member', { projectId: 7, userId: 5, rate: '90' }));
  assert.deepEqual(writes()[0].body, { rate: '90' });
  assert.deepEqual(out.changed, [{ field: 'rate', before: '80', after: '90' }]);
});
await t('remove_project_member refuses non-members (no DELETE)', async () => {
  reset({ 'GET /projects/7/users': MEMBERS });
  err(await S.call('remove_project_member', { projectId: 7, userId: 6, confirm: true }), /not a member/);
  assert.equal(writes().length, 0);
});
await t('add_project_task refuses already linked; check/uncheck/remove/update refuse unlinked', async () => {
  const TASKS = { status: 200, json: { data: [{ id: 1, project_id: 7, task_id: 10, checked: 0 }] } };
  reset({ 'GET /projects/7/tasks': TASKS });
  err(await S.call('add_project_task', { projectId: 7, taskId: 10 }), /already linked/);
  for (const name of ['check_project_task', 'uncheck_project_task', 'update_project_task']) {
    err(await S.call(name, { projectId: 7, taskId: 11, ...(name === 'update_project_task' ? { rate: 5 } : {}) }), /not linked/);
  }
  err(await S.call('remove_project_task', { projectId: 7, taskId: 11, confirm: true }), /not linked/);
  assert.equal(writes().length, 0);
});
await t('add_team_member refuses existing member; remove_team_member refuses non-member', async () => {
  reset({ 'GET /teams/3/users': { status: 200, json: { data: [{ id: 5, name: 'B' }] } } });
  err(await S.call('add_team_member', { teamId: 3, userId: 5 }), /already a member of team 3/);
  err(await S.call('remove_team_member', { teamId: 3, userId: 6, confirm: true }), /not a member of team 3/);
  assert.equal(writes().length, 0);
  assert.equal(records[0].query.include_archived_users, 'true');
});
await t('create_user refuses duplicate email (case-insensitive) and invalid email before any request', async () => {
  reset({ 'GET /users': { status: 200, json: { data: [{ id: 4, email: 'Ana@Example.com' }] } } });
  err(await S.call('create_user', { name: 'Ana', email: 'ana@example.com' }), /already exists \(id 4\)/);
  assert.equal(writes().length, 0);
  reset();
  err(await S.call('create_user', { name: 'Ana', email: 'not-an-email' }), /valid email/);
  assert.equal(records.length, 0);
});
await t('add/remove_user_assignments require at least one user or team', async () => {
  reset();
  err(await S.call('add_user_assignments', { userId: 2 }), /at least one ID/);
  err(await S.call('remove_user_assignments', { userId: 2, users: [], confirm: true }), /at least one ID/);
  assert.equal(records.length, 0);
});
await t('archive_user sends only {active:0}; refuses already archived', async () => {
  reset({ 'GET /users/4': { status: 200, json: { data: { id: 4, name: 'A', active: 0 } } } });
  err(await S.call('archive_user', { userId: 4 }), /already archived/);
  assert.equal(writes().length, 0);
  reset({ 'GET /users/4': { status: 200, json: { data: { id: 4, name: 'A', active: 1 } } }, 'POST /users/4': { status: 200, json: { data: { id: 4, name: 'A', active: 0 } } } });
  const out = ok(await S.call('archive_user', { userId: 4 }));
  assert.deepEqual(writes()[0].body, { active: 0 });
  assert.deepEqual(out.changed, [{ field: 'active', before: 1, after: 0 }]);
});
await t('locked time entries: update/start/stop/delete refuse without writing', async () => {
  reset({ 'GET /time-entries/5': { status: 200, json: { data: { id: 5, is_locked: true, locked_reason: 'invoiced' } } } });
  err(await S.call('update_time_entry', { timeEntryId: 5, description: 'x' }), /locked \(invoiced\)/);
  err(await S.call('start_stopwatch', { timeEntryId: 5 }), /locked/);
  err(await S.call('stop_stopwatch', { timeEntryId: 5 }), /locked/);
  err(await S.call('delete_time_entry', { timeEntryId: 5, confirm: true }), /locked/);
  assert.equal(writes().length, 0);
});

// ===================== partial edits =====================
const EDIT_TOOLS = TOOLS.filter((x) => x.kind === 'WRITE' && x.route.startsWith('POST ') && ROUTES[x.route].path.split('/').pop().startsWith(':') && !['add_project_member', 'add_project_task', 'add_team_member', 'archive_user'].includes(x.name));
const SPEC_REQ_EDITS = EDIT_TOOLS.filter((x) => Object.values(ROUTES[x.route].body?.fields || {}).some((d) => d.req));
await t('edit tools: only path IDs are required in the input schema (spec "required" is create-only)', () => {
  assert.equal(EDIT_TOOLS.length, 20);
  assert.equal(SPEC_REQ_EDITS.length, 16);
  for (const x of EDIT_TOOLS) {
    const schema = LIST.find((l) => l.name === x.name).inputSchema;
    assert.deepEqual([...(schema.required || [])].sort(), [...ROUTES[x.route].pathParams].sort(), x.name);
  }
});
await t('create tools keep spec-required fields required', () => {
  for (const x of TOOLS.filter((y) => y.kind === 'WRITE' && y.route.startsWith('POST ') && !ROUTES[y.route].path.split('/').pop().startsWith(':'))) {
    const r = ROUTES[x.route]; const schema = LIST.find((l) => l.name === x.name).inputSchema;
    const static_ = r.path.split('/').pop();
    if (!r.body || ['restore', 'check', 'uncheck', 'start', 'stop', 'approve', 'undo-approve', 'undo-submit'].includes(static_)) continue;
    for (const [k, d] of Object.entries(r.body.fields)) if (d.req && k in schema.properties) assert.ok((schema.required || []).includes(k), `${x.name}.${k}`);
  }
});
for (const x of SPEC_REQ_EDITS) {
  await t(`${x.name}: sends only the passed field, never spec-required fields from the GET; refuses empty edits`, async () => {
    const r = ROUTES[x.route];
    const ids = Object.fromEntries(r.pathParams.map((p) => [p, 1]));
    reset();
    err(await S.call(x.name, ids), /Nothing to update/);
    assert.equal(records.length, 0);
    const optional = Object.entries(r.body.fields).find(([k, d]) => !d.req && d.t === 'string' && !d.e && !d.f) || Object.entries(r.body.fields).find(([, d]) => d.t === 'boolean');
    const [field] = optional || Object.entries(r.body.fields).find(([, d]) => d.req && d.t === 'string');
    const value = r.body.fields[field].t === 'boolean' ? false : field === 'url' ? 'https://example.com/new' : 'changed';
    reset();
    ok(await S.call(x.name, { ...ids, [field]: value }));
    assert.deepEqual(writes()[0].body, { [field]: value });
  });
}
await t('update_project: body has only the changed field; diff from the read-before GET', async () => {
  const before = { id: 7, name: 'API', customer_id: 3, privacy: 2, is_billable: false, rate: 0, description: 'old', active: true };
  reset({ 'GET /projects/7': { status: 200, json: { data: before } }, 'POST /projects/7': { status: 200, json: { data: { ...before, rate: 100 } } } });
  const out = ok(await S.call('update_project', { projectId: 7, rate: 100 }));
  assert.deepEqual(writes()[0].body, { rate: 100 });
  assert.ok(!('resentUnchanged' in out));
  assert.deepEqual(out.changed, [{ field: 'rate', before: 0, after: 100 }]);
});
await t('update_webhook_subscription: only passed fields sent (no name/url/event_types from current)', async () => {
  const sub = { id: 3, name: 'n', url: 'https://example.com', event_types: ['project.created'], enabled: true };
  reset({ 'GET /webhook-subscriptions': { status: 200, json: { data: [sub] } } });
  ok(await S.call('update_webhook_subscription', { webhookSubscriptionId: 3, enabled: false }));
  assert.deepEqual(writes()[0].body, { enabled: false });
});
await t('edit with no fields refuses before any request', async () => {
  reset();
  err(await S.call('update_task', { taskId: 3 }), /Nothing to update/);
  assert.equal(records.length, 0);
});

// ===================== active-by-default list filters =====================
const ACTIVE_TOOLS = TOOLS.filter((x) => /Returns ONLY ACTIVE/.test(x.description));
await t('active-by-default: 13 list tools (6 API active=, 1 include_archived_users, 6 local)', () => {
  assert.deepEqual(ACTIVE_TOOLS.map((x) => x.name).sort(), ['list_custom_field_options', 'list_custom_fields', 'list_customers', 'list_project_available_tasks', 'list_project_custom_field_settings', 'list_project_members', 'list_projects', 'list_tasks', 'list_team_available_users', 'list_team_members', 'list_user_available_projects', 'list_user_projects', 'list_users']);
  for (const x of ACTIVE_TOOLS) {
    const p = LIST.find((l) => l.name === x.name).inputSchema.properties.active;
    assert.deepEqual(p.enum, [true, false, 'all']); assert.equal(p.default, true);
  }
});
for (const x of ACTIVE_TOOLS) {
  const r = ROUTES[x.route];
  const ids = Object.fromEntries(r.pathParams.map((p) => [p, 1]));
  const pathReal = r.path.replace(/:\w+/g, '1');
  const mode = r.query.some((q) => q.n === 'active') ? 'query' : r.query.some((q) => q.n === 'include_archived_users') ? 'archived' : 'local';
  const rows = { status: 200, json: { data: [{ id: 1, active: 1 }, { id: 2, active: 0 }, { id: 3, active: true }, { id: 4, active: false }] } };
  await t(`${x.name} (${mode}): default active only; active:false inactive; "all" no filter`, async () => {
    const run = async (extra) => { reset({ [`GET ${pathReal}`]: rows }); const out = ok(await S.call(x.name, { ...ids, ...extra })); assert.equal(records.length, 1); return { out, q: records[0].query }; };
    const d = await run({}), f = await run({ active: false }), a = await run({ active: 'all' }), tr = await run({ active: true });
    if (mode === 'query') {
      assert.equal(d.q.active, '1'); assert.equal(tr.q.active, '1'); assert.equal(f.q.active, '0'); assert.ok(!('active' in a.q));
      assert.equal(d.out.count, 4, 'API-side filter: rows not re-filtered locally');
    } else if (mode === 'archived') {
      assert.equal(d.q.include_archived_users, 'false'); assert.equal(f.q.include_archived_users, 'true'); assert.equal(a.q.include_archived_users, 'true');
      assert.equal(d.out.count, 4); assert.deepEqual(f.out.items.map((i) => i.id), [2, 4]); assert.equal(a.out.count, 4);
    } else {
      for (const o of [d, f, a]) assert.ok(!('active' in o.q));
      assert.deepEqual(d.out.items.map((i) => i.id), [1, 3]); assert.deepEqual(tr.out.items.map((i) => i.id), [1, 3]);
      assert.deepEqual(f.out.items.map((i) => i.id), [2, 4]); assert.equal(a.out.count, 4);
      assert.equal(d.out.filteredLocally, 2);
    }
    assert.equal(d.out.activeFilter, true); assert.equal(a.out.activeFilter, 'all');
    reset();
    err(await S.call(x.name, { ...ids, active: 'yes' }), /must be true, false or "all"/);
    err(await S.call(x.name, { ...ids, active: 1 }), /must be true, false or "all"/);
    assert.equal(records.length, 0);
  });
}
await t('list tools without an active concept are unchanged (no active arg, no filter sent)', async () => {
  for (const name of ['list_teams', 'list_calendars', 'list_todo_tags', 'list_holidays', 'list_rates', 'list_webhook_subscriptions', 'list_todo_lists']) {
    assert.ok(!('active' in LIST.find((l) => l.name === name).inputSchema.properties), name);
  }
});

// ===================== webhooks =====================
await t('create_webhook_subscription: https only, event types validated, secret shown once and masked in sent', async () => {
  reset();
  err(await S.call('create_webhook_subscription', { name: 'n', url: 'http://example.com', event_types: ['time_entry.created'] }), /https/);
  assert.equal(records.length, 0);
  err(await S.call('create_webhook_subscription', { name: 'n', url: 'https://example.com', event_types: ['nope.event'] }), /Unknown event type\(s\): nope\.event/);
  assert.equal(writes().length, 0);
  reset({ 'POST /webhook-subscriptions': { status: 201, json: { data: { id: 3, name: 'n', url: 'https://example.com', event_types: ['project.created'], enabled: true, secret: 'whsec_once' } } } });
  const out = ok(await S.call('create_webhook_subscription', { name: 'n', url: 'https://example.com', event_types: ['project.created'], secret: 'mysecret' }));
  assert.equal(out.item.secret, 'whsec_once');
  assert.equal(out.sent.secret, '[hidden]');
  assert.equal(writes()[0].body.secret, 'mysecret');
});
await t('list_webhook_subscriptions masks secrets; update masks unless regenerate_secret', async () => {
  const sub = { id: 3, name: 'n', url: 'https://example.com', event_types: ['project.created'], enabled: true, secret: 'whsec_old' };
  reset({ 'GET /webhook-subscriptions': { status: 200, json: { data: [sub] } } });
  const l = ok(await S.call('list_webhook_subscriptions', {}));
  assert.ok(!JSON.stringify(l).includes('whsec_old'));
  reset({ 'GET /webhook-subscriptions': { status: 200, json: { data: [sub] } }, 'POST /webhook-subscriptions/3': { status: 200, json: { data: { ...sub, enabled: false } } } });
  const u = ok(await S.call('update_webhook_subscription', { webhookSubscriptionId: 3, enabled: false }));
  assert.ok(!JSON.stringify(u).includes('whsec_old'));
  assert.equal(writes()[0].body.enabled, false);
  reset({ 'GET /webhook-subscriptions': { status: 200, json: { data: [sub] } }, 'POST /webhook-subscriptions/3': { status: 200, json: { data: { ...sub, secret: 'whsec_new' } } } });
  const g = ok(await S.call('update_webhook_subscription', { webhookSubscriptionId: 3, regenerate_secret: true }));
  assert.equal(g.item.secret, 'whsec_new');
  assert.ok(!JSON.stringify(g.changed).includes('whsec_old'));
  reset({ 'GET /webhook-subscriptions': { status: 200, json: { data: [sub] } } });
  err(await S.call('update_webhook_subscription', { webhookSubscriptionId: 4, enabled: false }), /not found/);
  err(await S.call('update_webhook_subscription', { webhookSubscriptionId: 3, url: 'http://insecure' }), /https/);
  assert.equal(writes().length, 0);
});

// ===================== profile photo =====================
await t('upload_user_profile_photo validates type, existence and 2 MB limit before any request', async () => {
  reset();
  const gif = path.join(TMP, 'a.gif'); writeFileSync(gif, 'GIF89a');
  err(await S.call('upload_user_profile_photo', { userId: 1, file: gif }), /\.png, \.jpg or \.jpeg/);
  err(await S.call('upload_user_profile_photo', { userId: 1, file: path.join(TMP, 'missing.png') }), /Cannot read file/);
  const big = path.join(TMP, 'big.jpg'); writeFileSync(big, Buffer.alloc(2 * 1024 * 1024 + 1));
  err(await S.call('upload_user_profile_photo', { userId: 1, file: big }), /limit is 2 MB/);
  err(await S.call('upload_user_profile_photo', { userId: 1, file: 'relative.png' }), /absolute file path/);
  assert.equal(records.length, 0);
});

// ===================== time entries / reports =====================
await t('list_time_entries: curated TimeEntry shape, filters mapped, paging', async () => {
  const E = { id: 127, date_execution: '2024-01-01', user_id: 1, user_name: 'Anna', project_id: 12, project_name: 'Site', customer_name: 'ACME', task_name: 'Meeting', todo_name: 'Login', time_total: '01:30:00', description: '', is_billable: true, is_invoiced: 0 };
  let n = 0;
  reset({ 'GET /reports/detailed': () => (++n === 1 ? { status: 200, json: { data: [E], has_next_page: true, next_page_query_params: { opt_page_start: 'abc' } } } : { status: 200, json: { data: [{ ...E, id: 128, is_billable: false }], has_next_page: false } }) });
  const out = ok(await S.call('list_time_entries', { from: '2024-01-01', to: '2024-01-31', project: '12', person: [1, 2], invoiced: false, billable: true, maxPages: 3, limit: 10 }));
  assert.deepEqual(records[0].query, { opt_page_limit: '10', date_execution_start: '2024-01-01', date_execution_end: '2024-01-31', project_id: '12', user_id: '1,2', is_invoiced: 'false' });
  assert.equal(records[1].query.opt_page_start, 'abc');
  assert.deepEqual(out.entries, [{ id: 127, date: '2024-01-01', person: 'Anna', personId: 1, project: 'Site', projectId: 12, customer: 'ACME', activity: 'Meeting / Login', durationMinutes: 90, description: '', billable: true, invoiced: false }]);
  assert.equal(out.totalMinutes, 90);
  assert.equal(out.pagesFetched, 2);
  err(await S.call('list_time_entries', { from: '01/01/2024' }), /YYYY-MM-DD/);
});
await t('get_current_timer returns item null when no stopwatch runs', async () => {
  reset({ 'GET /time-entries/current': { status: 200, json: { data: null } } });
  assert.deepEqual(ok(await S.call('get_current_timer', {})), { item: null });
});
await t('generic shapes: camelCase, numeric strings -> numbers, 0/1 -> booleans, undocumented fields dropped', () => {
  const shape = shapeFrom(ROUTES['GET /projects/:projectId'].res.fields);
  const s = shape({ id: '7', is_billable: 1, active: 0, rate: '100', name: 'X', secret_internal: 'drop' });
  assert.equal(s.id, 7); assert.equal(s.isBillable, true); assert.equal(s.active, false); assert.equal(s.rate, 100);
  assert.ok(!('secretInternal' in s)); assert.ok(!('billable' in s), 'deprecated field omitted');
  assert.equal(parseDurationMinutes('2422:24:00'), 2422 * 60 + 24);
  assert.equal(normalizeTimeEntry({ task_name: 'Dev' }).activity, 'Dev');
});
await t('enum and type validation rejects bad arguments before any request', async () => {
  reset();
  err(await S.call('save_rate', { type: 'bogus', rate: 1 }), /must be one of: billable, cost, tax/);
  err(await S.call('get_project', { projectId: '1;DROP' }), /must be an ID/);
  err(await S.call('get_project', { projectId: 1, extra: 1 }), /Unknown argument "extra"/);
  err(await S.call('reject_timesheet', { timesheetApprovalId: 1 }), /"comment" is required/);
  assert.equal(records.length, 0);
});

// ===================== errors / security =====================
await t('missing token -> clear error, no request; "${VAR}" placeholder treated as unset', async () => {
  for (const tok of [undefined, '${RABBITWORK_API_TOKEN}']) {
    const S2 = startServer({ RABBITWORK_API_TOKEN: tok });
    reset();
    err(await S2.call('list_projects', {}), /RABBITWORK_API_TOKEN is not set.*My tokens.*No request was sent/);
    assert.equal(records.length, 0);
    S2.stop();
  }
});
await t('401/403/404/422/429 errors carry hints; token never echoed', async () => {
  const cases = [
    [401, /401.*token invalid or revoked/],
    [403, /403.*forbidden/],
    [404, /404.*not found/],
    [422, /422.*validation failed.*name/],
    [429, /429.*Retry-After 30s/],
  ];
  for (const [status, re] of cases) {
    reset({ 'GET /customers/1': { status, json: { message: `bad ${TEST_TOKEN}`, errors: { name: ['required'] } }, headers: { 'retry-after': '30' } } });
    const text = err(await S.call('get_customer', { customerId: 1 }), re);
    assert.ok(!text.includes(TEST_TOKEN), 'token redacted');
    assert.ok(text.includes('[REDACTED]'));
  }
});
await t('destructive success returns the deleted snapshot', async () => {
  reset({ 'GET /customers/3': { status: 200, json: { data: { id: 3, name: 'ACME', active: 1 } } } });
  const out = ok(await S.call('delete_customer', { customerId: 3, confirm: true }));
  assert.equal(out.done, true); assert.equal(out.deleted.name, 'ACME');
  assert.deepEqual(writes().map((x) => `${x.method} ${x.path}`), ['DELETE /customers/3']);
});
await t('delete_latest_rate forwards the scope query to both GET and DELETE', async () => {
  reset();
  ok(await S.call('delete_latest_rate', { type: 'billable', project_id: '7', confirm: true }));
  assert.deepEqual(records.map((x) => [x.method, x.query]), [['GET', { type: 'billable', project_id: '7' }], ['DELETE', { type: 'billable', project_id: '7' }]]);
});
await t('remove_user_projects sends DELETE with JSON body', async () => {
  reset();
  ok(await S.call('remove_user_projects', { userId: 2, project_id: [7, 8], confirm: true }));
  assert.deepEqual(writes()[0].body, { project_id: [7, 8] });
});
await t('no token value or secret-looking literal stored in plugin files', () => {
  const files = ['plugin.json', '.cursor-plugin/plugin.json', '.cursor-plugin/mcp.json', 'mcp.json', 'server/lib.mjs', 'server/build.mjs', 'README.md', 'skills/rabbitwork-timesheets/SKILL.md'];
  for (const f of files) {
    const s = readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/x-api-token['"]?\s*[:=]\s*['"][A-Za-z0-9]{16,}/.test(s), f);
    if (process.env.RABBITWORK_API_TOKEN && process.env.RABBITWORK_API_TOKEN.length > 8) assert.ok(!s.includes(process.env.RABBITWORK_API_TOKEN), `${f} contains the token`);
  }
});

S.stop();
SE.stop();
mockServer.closeAllConnections?.();
mockServer.close();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) console.log('Failures:\n - ' + failures.join('\n - '));
process.exit(failed ? 1 : 0);
