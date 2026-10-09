#!/usr/bin/env node
// Zero-dependency MCP server (JSON-RPC 2.0 over stdio, newline-delimited) for the Rabbiit/Rabbitwork API v1.
// Docs: https://api-docs.rabbiit.com/ — routes are fixed, generated from that spec into server/spec/routes.mjs.
// Tools are declared per area in server/tools/*.mjs. DESTRUCTIVE tools refuse unless called with confirm: true.
import { createInterface } from 'node:readline';
import { ToolError, redact } from './lib.mjs';
import { TIME_TOOLS } from './tools/time.mjs';
import { PROJECT_TOOLS } from './tools/projects.mjs';
import { TODO_TOOLS } from './tools/todos.mjs';
import { DIRECTORY_TOOLS } from './tools/directory.mjs';
import { PEOPLE_TOOLS } from './tools/people.mjs';
import { CONFIG_TOOLS } from './tools/config.mjs';
import { WEBHOOK_TOOLS } from './tools/webhooks.mjs';

const PROTOCOL_VERSION = '2025-06-18';
export const VERSION = '1.0.0';
export const TOOLS = [...TIME_TOOLS, ...PROJECT_TOOLS, ...TODO_TOOLS, ...DIRECTORY_TOOLS, ...PEOPLE_TOOLS, ...CONFIG_TOOLS, ...WEBHOOK_TOOLS];
const BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
if (Object.keys(BY_NAME).length !== TOOLS.length) throw new Error('duplicate tool name');
const annotations = (k) => ({ readOnlyHint: k === 'READ', destructiveHint: k === 'DESTRUCTIVE', openWorldHint: true });

// ---- server -> client requests (MCP elicitation, spec 2025-06-18) ----
let clientCanElicit = false;
let outSeq = 0;
const pending = new Map(); // id -> { resolve, timer }
const ELICIT_TIMEOUT_MS = Number(process.env.RABBITWORK_ELICIT_TIMEOUT_MS) > 0 ? Number(process.env.RABBITWORK_ELICIT_TIMEOUT_MS) : 10 * 60 * 1000;
function clientRequest(method, params, timeoutMs = ELICIT_TIMEOUT_MS) {
  const id = `rw-srv-${++outSeq}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(id); resolve({ action: 'cancel', timedOut: true }); }, timeoutMs);
    pending.set(id, { resolve, timer });
    send({ jsonrpc: '2.0', id, method, params });
  });
}
function onClientResponse(msg) {
  const p = pending.get(msg.id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(msg.id);
  p.resolve(msg.error ? { action: 'cancel', error: msg.error.message } : msg.result);
}
const mcpContext = () => ({ canElicit: clientCanElicit, elicit: (params) => clientRequest('elicitation/create', params) });

async function handle(msg) {
  const { method, params } = msg;
  switch (method) {
    case 'initialize':
      clientCanElicit = !!(params?.capabilities && params.capabilities.elicitation);
      return { protocolVersion: params?.protocolVersion || PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'rabbitwork', version: VERSION } };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: annotations(t.kind) })) };
    case 'tools/call': {
      const tool = BY_NAME[params?.name];
      if (!tool) throw Object.assign(new Error(`Unknown tool: ${params?.name}`), { code: -32602 });
      try {
        const out = await tool.handler(params?.arguments || {}, mcpContext());
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: out };
      } catch (e) {
        const text = e instanceof ToolError ? e.message : `Request failed: ${e.message}`;
        return { content: [{ type: 'text', text: redact(text) }], isError: true };
      }
    }
    default:
      throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }
}

const send = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  if (msg.id === undefined) return; // notifications
  if (msg.method === undefined && ('result' in msg || 'error' in msg)) return onClientResponse(msg);
  try { send({ jsonrpc: '2.0', id: msg.id, result: await handle(msg) }); }
  catch (e) { send({ jsonrpc: '2.0', id: msg.id, error: { code: e.code || -32603, message: e.message } }); }
});
