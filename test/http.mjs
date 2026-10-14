// HTTP/Lambda transport. Never calls the live API: fetch is replaced per test.
import assert from 'node:assert/strict';
import { handleMessage } from '../server/handle.mjs';
import { handleHttpRequest, readPersonalToken } from '../server/http-app.mjs';
import { handler } from '../server/lambda.mjs';

let passed = 0;
let failed = 0;
const failures = [];
async function t(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (e) {
    failed++;
    failures.push(name);
    console.log(`FAIL ${name}\n  ${e.stack}`);
  }
}

const savedFetch = globalThis.fetch;
const savedToken = process.env.RABBITWORK_API_TOKEN;
const savedBase = process.env.RABBITWORK_API_BASE_URL;
delete process.env.RABBITWORK_API_TOKEN;
delete process.env.RABBITWORK_API_BASE_URL;

function jsonRpc(method, params, id = 1) {
  return JSON.stringify({ jsonrpc: '2.0', id, method, params });
}

function installFetch(onCall) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), headers: opts?.headers || {} });
    if (onCall) await onCall();
    return new Response(JSON.stringify({ data: [], has_next_page: false }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-ratelimit-accountdaily': '1' },
    });
  };
  return calls;
}

await t('initialize and tools/list succeed without a token', async () => {
  const calls = installFetch();
  const init = await handleHttpRequest({
    method: 'POST',
    path: '/mcp',
    headers: {},
    body: jsonRpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} }),
  });
  assert.equal(init.statusCode, 200);
  const initBody = JSON.parse(init.body);
  assert.equal(initBody.result.serverInfo.name, 'rabbitwork');
  const list = await handleHttpRequest({
    method: 'POST',
    path: '/mcp',
    headers: {},
    body: jsonRpc('tools/list', {}),
  });
  const listBody = JSON.parse(list.body);
  assert.ok(listBody.result.tools.length > 0);
  assert.equal(calls.length, 0);
});

await t('tools/call without a token does not call the API', async () => {
  const calls = installFetch();
  process.env.RABBITWORK_API_TOKEN = 'envtok';
  const res = await handleHttpRequest({
    method: 'POST',
    path: '/mcp',
    headers: {},
    body: jsonRpc('tools/call', { name: 'list_projects', arguments: {} }),
  });
  delete process.env.RABBITWORK_API_TOKEN;
  const body = JSON.parse(res.body);
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /Personal token is missing/);
  assert.equal(calls.length, 0);
});

await t('x-api-token is forwarded and the default API base URL is used', async () => {
  const calls = installFetch();
  const res = await handleHttpRequest({
    method: 'POST',
    path: '/mcp',
    headers: { 'x-api-token': 'htok' },
    body: jsonRpc('tools/call', { name: 'list_projects', arguments: {} }),
  });
  const body = JSON.parse(res.body);
  assert.equal(body.result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers['x-api-token'], 'htok');
  assert.ok(calls[0].url.startsWith('https://app.rabbiit.com/api/v1/projects'));
});

await t('Authorization Bearer and x-api-token produce the same API header', async () => {
  const fromHeader = readPersonalToken({ 'X-Api-Token': 'htok' });
  const fromBearer = readPersonalToken({ Authorization: 'Bearer htok' });
  assert.equal(fromHeader, fromBearer);

  const calls = installFetch();
  await handleHttpRequest({
    method: 'POST',
    path: '/mcp',
    headers: { authorization: 'Bearer htok' },
    body: jsonRpc('tools/call', { name: 'list_projects', arguments: {} }),
  });
  assert.equal(calls[0].headers['x-api-token'], 'htok');
});

await t('concurrent requests keep their own tokens', async () => {
  const calls = installFetch(() => new Promise((resolve) => setTimeout(resolve, 30)));
  await Promise.all([
    handleMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_projects', arguments: {} } },
      { token: 'tok-a', remote: true, canElicit: false },
    ),
    handleMessage(
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_projects', arguments: {} } },
      { token: 'tok-b', remote: true, canElicit: false },
    ),
  ]);
  assert.deepEqual(calls.map((call) => call.headers['x-api-token']).sort(), ['tok-a', 'tok-b']);
});

await t('destructive tool without confirm does not call the API', async () => {
  const calls = installFetch();
  const res = await handleHttpRequest({
    method: 'POST',
    path: '/mcp',
    headers: { 'x-api-token': 'htok' },
    body: jsonRpc('tools/call', { name: 'delete_customer', arguments: { customerId: 1 } }),
  });
  const body = JSON.parse(res.body);
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /confirm: true/);
  assert.equal(calls.length, 0);
});

await t('remote upload of a local file does not call the API', async () => {
  const calls = installFetch();
  const res = await handleHttpRequest({
    method: 'POST',
    path: '/mcp',
    headers: { 'x-api-token': 'htok' },
    body: jsonRpc('tools/call', { name: 'upload_user_profile_photo', arguments: { userId: 1, file: '/nope.png' } }),
  });
  const body = JSON.parse(res.body);
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /local disk/);
  assert.equal(calls.length, 0);
});

await t('Lambda handler maps the HTTP API event', async () => {
  const calls = installFetch();
  const out = await handler({
    requestContext: { http: { method: 'POST' } },
    rawPath: '/mcp',
    headers: { 'x-api-token': 'htok' },
    body: jsonRpc('tools/call', { name: 'list_projects', arguments: {} }),
    isBase64Encoded: false,
  });
  assert.equal(out.statusCode, 200);
  assert.equal(calls[0].headers['x-api-token'], 'htok');
  const health = await handler({
    requestContext: { http: { method: 'GET' } },
    rawPath: '/health',
    headers: {},
    body: '',
  });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(JSON.parse(health.body), { ok: true });
});

globalThis.fetch = savedFetch;
if (savedToken === undefined) delete process.env.RABBITWORK_API_TOKEN;
else process.env.RABBITWORK_API_TOKEN = savedToken;
if (savedBase === undefined) delete process.env.RABBITWORK_API_BASE_URL;
else process.env.RABBITWORK_API_BASE_URL = savedBase;

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log(failures.join('\n'));
  process.exit(1);
}
