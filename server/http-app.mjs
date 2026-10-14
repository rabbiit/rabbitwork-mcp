import { handleMessage } from './handle.mjs';

const JSON_HEADERS = { 'content-type': 'application/json' };

export function readPersonalToken(headers) {
  const normalized = {};
  for (const [name, value] of Object.entries(headers || {})) {
    normalized[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }
  const apiToken = normalized['x-api-token'];
  if (apiToken && String(apiToken).trim()) return String(apiToken).trim();
  const authorization = String(normalized.authorization || '');
  const bearer = /^Bearer\s+(\S+)/i.exec(authorization);
  if (bearer) return bearer[1];
  return undefined;
}

function pathnameOf(rawPath) {
  try {
    return new URL(rawPath || '/', 'http://mcp.local').pathname;
  } catch {
    return '/';
  }
}

function jsonResponse(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

/**
 * Stateless Streamable HTTP: one JSON-RPC body in, one JSON body out.
 * No session and no SSE. Destructive tools fall back to confirm: true.
 */
export async function handleHttpRequest({ method, path, headers, body }) {
  const pathname = pathnameOf(path);
  const verb = String(method || '').toUpperCase();

  if (verb === 'GET' && pathname === '/health') {
    return jsonResponse(200, { ok: true });
  }
  if (verb !== 'POST' || pathname !== '/mcp') {
    return jsonResponse(404, { message: 'Not found' });
  }

  let msg;
  try {
    msg = JSON.parse(body || '');
  } catch {
    return jsonResponse(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return jsonResponse(400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } });
  }
  if (msg.id === undefined) {
    return { statusCode: 202, headers: JSON_HEADERS, body: '' };
  }

  const token = readPersonalToken(headers);
  try {
    const result = await handleMessage(msg, { token, remote: true, canElicit: false });
    return jsonResponse(200, { jsonrpc: '2.0', id: msg.id, result });
  } catch (e) {
    return jsonResponse(200, {
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: e.code || -32603, message: e.message },
    });
  }
}
