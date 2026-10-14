import { ToolError, redact, requestContext } from './lib.mjs';
import { PROTOCOL_VERSION, VERSION, TOOLS, BY_NAME, annotations } from './catalog.mjs';

async function dispatch(msg, ctx) {
  const { method, params } = msg;
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'rabbitwork', version: VERSION },
      };
    case 'ping':
      return {};
    case 'tools/list':
      return {
        tools: TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: annotations(tool.kind),
        })),
      };
    case 'tools/call': {
      const tool = BY_NAME[params?.name];
      if (!tool) throw Object.assign(new Error(`Unknown tool: ${params?.name}`), { code: -32602 });
      const mcp = { canElicit: !!ctx.canElicit, elicit: ctx.elicit };
      try {
        const out = await tool.handler(params?.arguments || {}, mcp);
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

/**
 * One JSON-RPC message.
 * ctx.remote + ctx.token bind the personal token to this call (HTTP/Lambda).
 * Without that, tools keep reading RABBITWORK_API_TOKEN from the environment (stdio).
 */
export function handleMessage(msg, ctx = {}) {
  const run = () => dispatch(msg, ctx);
  const hasRequestToken = Object.prototype.hasOwnProperty.call(ctx, 'token');
  if (ctx.remote || hasRequestToken) {
    return requestContext.run({ token: ctx.token, remote: !!ctx.remote }, run);
  }
  return run();
}
