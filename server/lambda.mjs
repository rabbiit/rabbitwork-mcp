import {handleHttpRequest} from './http-app.mjs';

function eventBody(event) {
    if (!event.body) return '';
    if (event.isBase64Encoded) return Buffer.from(event.body, 'base64').toString('utf8');
    return event.body;
}

function eventPath(event) {
    const path = event.rawPath || event.path || '/';
    if (event.rawQueryString) return `${path}?${event.rawQueryString}`;
    const query = event.queryStringParameters;
    if (!query || typeof query !== 'object') return path;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value != null) params.append(key, String(value));
    }
    const text = params.toString();
    return text ? `${path}?${text}` : path;
}

export async function handler(event) {
    const method = event.requestContext?.http?.method || event.httpMethod;
    const path = eventPath(event);
    const out = await handleHttpRequest({
        method,
        path,
        headers: event.headers || {},
        body: eventBody(event),
    });
    return {statusCode: out.statusCode, headers: out.headers, body: out.body};
}
