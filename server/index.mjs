#!/usr/bin/env node
// Zero-dependency MCP server (JSON-RPC 2.0 over stdio, newline-delimited) for the Rabbiit/Rabbitwork API v1.
// Docs: https://api-docs.rabbiit.com/ — routes are fixed, generated from that spec into server/spec/routes.mjs.
// Tools are declared per area in server/tools/*.mjs. DESTRUCTIVE tools refuse unless called with confirm: true.
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { handleMessage } from './handle.mjs';

export { VERSION, TOOLS } from './catalog.mjs';

function startStdio() {
  let clientCanElicit = false;
  let outSeq = 0;
  const pending = new Map();
  const elicitTimeoutMs = Number(process.env.RABBITWORK_ELICIT_TIMEOUT_MS) > 0
    ? Number(process.env.RABBITWORK_ELICIT_TIMEOUT_MS)
    : 10 * 60 * 1000;
  const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');

  function clientRequest(method, params, timeoutMs = elicitTimeoutMs) {
    const id = `rw-srv-${++outSeq}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ action: 'cancel', timedOut: true });
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      send({ jsonrpc: '2.0', id, method, params });
    });
  }

  function onClientResponse(msg) {
    const pendingResponse = pending.get(msg.id);
    if (!pendingResponse) return;
    clearTimeout(pendingResponse.timer);
    pending.delete(msg.id);
    const cancelled = msg.error ? { action: 'cancel', error: msg.error.message } : msg.result;
    pendingResponse.resolve(cancelled);
  }

  const mcpContext = () => ({
    canElicit: clientCanElicit,
    elicit: (params) => clientRequest('elicitation/create', params),
  });

  const rl = createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    if (msg.id === undefined) return;
    if (msg.method === undefined && ('result' in msg || 'error' in msg)) return onClientResponse(msg);
    if (msg.method === 'initialize') {
      clientCanElicit = !!(msg.params?.capabilities && msg.params.capabilities.elicitation);
    }
    try {
      const result = await handleMessage(msg, mcpContext());
      send({ jsonrpc: '2.0', id: msg.id, result });
    } catch (e) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: e.code || -32603, message: e.message } });
    }
  });
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
const self = fileURLToPath(import.meta.url);
if (entry === self) startStdio();
