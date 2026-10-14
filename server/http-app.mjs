import {handleMessage} from './handle.mjs';
import {jsonResponse, normalizeHeaders} from './http-util.mjs';
import {credentialFromHeader, handleOAuthRequest, publicOrigin, wwwAuthenticate} from './oauth.mjs';

const OAUTH_PATHS = new Set([
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/mcp',
    '/.well-known/oauth-authorization-server',
    '/authorize',
    '/token',
]);

export function readPersonalToken(headers) {
    const normalized = normalizeHeaders(headers);
    const apiToken = normalized['x-api-token'];
    if (apiToken && String(apiToken).trim()) return credentialFromHeader(apiToken);
    const authorization = String(normalized.authorization || '');
    const bearer = /^Bearer\s+(\S+)/i.exec(authorization);
    if (bearer) return credentialFromHeader(bearer[1]);
    return undefined;
}

function pathnameOf(rawPath) {
    try {
        return new URL(rawPath || '/', 'http://mcp.local').pathname.replace(/\/+$/, '') || '/';
    } catch {
        return '/';
    }
}

function unauthorized(origin, id) {
    return jsonResponse(401, {
        jsonrpc: '2.0',
        id: id ?? null,
        error: {
            code: -32001,
            message: 'Authentication required. Connect with OAuth, or send the x-api-token header.',
        },
    }, {
        'cache-control': 'no-store',
        'www-authenticate': wwwAuthenticate(origin),
    });
}

/**
 * Stateless Streamable HTTP: one JSON-RPC body in, one JSON body out.
 * No session and no SSE. Destructive tools fall back to confirm: true.
 * Remote clients without a credential get 401 so ChatGPT and Claude start OAuth.
 */
export async function handleHttpRequest({method, path, headers, body}) {
    const pathname = pathnameOf(path);
    const verb = String(method || '').toUpperCase();
    const origin = publicOrigin(headers);

    if (verb === 'GET' && pathname === '/health') {
        return jsonResponse(200, {ok: true});
    }
    if (OAUTH_PATHS.has(pathname)) {
        return handleOAuthRequest({method: verb, pathname, rawPath: path, body, origin});
    }
    if (verb !== 'POST' || pathname !== '/mcp') {
        return jsonResponse(404, {message: 'Not found'});
    }

    let msg;
    let parsed = true;
    try {
        msg = JSON.parse(body || '');
    } catch {
        parsed = false;
    }
    const token = readPersonalToken(headers);
    const requestId = parsed && msg && typeof msg === 'object' && !Array.isArray(msg) ? msg.id : null;
    if (!token) return unauthorized(origin, requestId);
    if (!parsed) {
        return jsonResponse(400, {jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Parse error'}});
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
        return jsonResponse(400, {jsonrpc: '2.0', id: null, error: {code: -32600, message: 'Invalid request'}});
    }
    if (msg.id === undefined) {
        return jsonResponse(202, '');
    }

    try {
        const result = await handleMessage(msg, {token, remote: true, canElicit: false});
        return jsonResponse(200, {jsonrpc: '2.0', id: msg.id, result});
    } catch (e) {
        return jsonResponse(200, {
            jsonrpc: '2.0',
            id: msg.id,
            error: {code: e.code || -32603, message: e.message},
        });
    }
}
