import { handleHttpRequest } from './http-app.mjs';

function eventBody(event) {
  if (!event.body) return '';
  if (event.isBase64Encoded) return Buffer.from(event.body, 'base64').toString('utf8');
  return event.body;
}

export async function handler(event) {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.rawPath || event.path || '/';
  const out = await handleHttpRequest({
    method,
    path,
    headers: event.headers || {},
    body: eventBody(event),
  });
  return { statusCode: out.statusCode, headers: out.headers, body: out.body };
}
