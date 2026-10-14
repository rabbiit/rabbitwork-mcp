#!/usr/bin/env node
// Local stand-in for the Lambda. Production is server/lambda.mjs behind API Gateway.
import { createServer } from 'node:http';
import { handleHttpRequest } from './http-app.mjs';

const port = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 8787;

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  const out = await handleHttpRequest({
    method: req.method,
    path: req.url,
    headers: req.headers,
    body,
  });
  res.writeHead(out.statusCode, out.headers);
  res.end(out.body);
});

server.listen(port, () => {
  process.stdout.write(`rabbit-mcp listening on http://127.0.0.1:${port}/mcp\n`);
});
