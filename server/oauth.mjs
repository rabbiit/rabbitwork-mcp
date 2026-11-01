// OAuth 2.1 authorization-code + PKCE (CIMD, no client store).
// Access and refresh tokens are sealed envelopes around the Rabbitwork personal token.
// Refresh tokens are rotated, and the previous one stays valid until it expires.
// Revoking the personal token in Rabbitwork is what stops later API calls.
import {createHash, timingSafeEqual} from 'node:crypto';
import {DEFAULT_BASE_URL, USER_AGENT, env} from './lib.mjs';
import {isLoopbackHost, jsonResponse as respondJson, normalizeHeaders} from './http-util.mjs';
import {credentialFromHeader, oauthNow, oauthReady, openSeal, seal, setOauthClock} from './oauth-seal.mjs';
import {authorizeForm, htmlResponse, logoResponse} from './oauth-page.mjs';

export {credentialFromHeader, setOauthClock};

const SCOPE = 'rabbitwork';
const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const CLIENT_CACHE_MS = 10 * 60 * 1000;

const clientCache = new Map();

export function clearOauthClientCache() {
    clientCache.clear();
}

export function publicOrigin(headers) {
    const configured = env('RABBITWORK_MCP_PUBLIC_URL');
    if (configured) return configured.replace(/\/+$/, '');
    const domain = env('RABBITWORK_MCP_DOMAIN');
    if (domain) return `https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
    const normalized = normalizeHeaders(headers);
    const host = String(normalized['x-forwarded-host'] || normalized.host || '').split(',')[0].trim();
    if (/^[A-Za-z0-9.-]+(?::\d+)?$/.test(host)) {
        const forwarded = String(normalized['x-forwarded-proto'] || '').split(',')[0].trim();
        const hostname = host.replace(/:\d+$/, '');
        const proto = forwarded === 'http' || (!forwarded && isLoopbackHost(hostname)) ? 'http' : 'https';
        return `${proto}://${host}`;
    }
    return 'https://mcp.rabbitwork.io';
}

export function protectedResourceMetadata(origin) {
    return {
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        scopes_supported: [SCOPE],
        bearer_methods_supported: ['header'],
    };
}

export function authorizationServerMetadata(origin) {
    return {
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        client_id_metadata_document_supported: true,
        authorization_response_iss_parameter_supported: true,
        scopes_supported: [SCOPE],
    };
}

function jsonResponse(statusCode, body, extraHeaders) {
    return respondJson(statusCode, body, {'cache-control': 'no-store', ...extraHeaders});
}

function oauthError(statusCode, error, description) {
    return jsonResponse(statusCode, {error, error_description: description});
}

function queryOf(rawPath) {
    try {
        return Object.fromEntries(new URL(rawPath || '/', 'http://mcp.local').searchParams);
    } catch {
        return {};
    }
}

function formOf(body) {
    return Object.fromEntries(new URLSearchParams(String(body || '')));
}

function limited(value, max) {
    const text = String(value || '');
    if (!text || text.length > max) return '';
    return text;
}

function clientIdUrl(clientId) {
    let url;
    try {
        url = new URL(clientId);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port) return null;
    return url;
}

function acceptableRedirect(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    if (url.username || url.password || url.hash) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && isLoopbackHost(url.hostname);
}

function redirectsMatch(registered, requested) {
    let listed;
    let asked;
    try {
        listed = new URL(registered);
        asked = new URL(requested);
    } catch {
        return false;
    }
    if (listed.origin === asked.origin && listed.pathname === asked.pathname && listed.search === asked.search) return true;
    if (listed.protocol !== 'http:' || asked.protocol !== 'http:') return false;
    if (!isLoopbackHost(listed.hostname) || listed.hostname !== asked.hostname) return false;
    return listed.pathname === asked.pathname && listed.search === asked.search;
}

async function loadClient(clientId) {
    const cached = clientCache.get(clientId);
    if (cached && cached.until > oauthNow()) return cached.doc;
    const response = await fetch(clientId, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        headers: {accept: 'application/json', 'user-agent': USER_AGENT},
    });
    if (!response.ok) throw new Error(`client metadata ${response.status}`);
    const text = await response.text();
    if (text.length > 65536) throw new Error('client metadata too large');
    const doc = JSON.parse(text);
    if (!doc || typeof doc !== 'object' || doc.client_id !== clientId) throw new Error('client_id mismatch');
    if (!Array.isArray(doc.redirect_uris) || !doc.redirect_uris.length) throw new Error('redirect_uris missing');
    const methods = []
        .concat(doc.token_endpoint_auth_method || [])
        .concat(doc.token_endpoint_auth_methods_supported || []);
    if (methods.length && !methods.includes('none')) throw new Error('public client required');
    clientCache.set(clientId, {until: oauthNow() + CLIENT_CACHE_MS, doc});
    return doc;
}

function resourceOk(origin, resource) {
    if (!resource) return true;
    return resource === `${origin}/mcp` || resource === origin;
}

function pkceOk(challenge, method) {
    return method === 'S256' && /^[A-Za-z0-9_-]{43,128}$/.test(challenge || '');
}

function verifierOk(verifier) {
    return /^[A-Za-z0-9._~-]{43,128}$/.test(verifier || '');
}

function s256(verifier) {
    return createHash('sha256').update(verifier).digest('base64url');
}

function challengesMatch(expected, actual) {
    const a = Buffer.from(expected);
    const b = Buffer.from(actual);
    return a.length === b.length && timingSafeEqual(a, b);
}

function redirectBack(redirectUri, params) {
    const url = new URL(redirectUri);
    for (const [key, value] of Object.entries(params)) {
        if (value) url.searchParams.set(key, value);
    }
    return {
        statusCode: 302,
        headers: {location: url.toString(), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer'},
        body: '',
    };
}

async function resolveClient(params, origin) {
    const clientId = limited(params.client_id, 512);
    const redirectUri = limited(params.redirect_uri, 512);
    const state = limited(params.state, 512);
    if (!clientIdUrl(clientId) || !acceptableRedirect(redirectUri) || !state) {
        return {error: htmlResponse(400, 'Connection refused', 'The app that asked for access was not recognized.', origin)};
    }
    let doc;
    try {
        doc = await loadClient(clientId);
    } catch {
        return {error: htmlResponse(400, 'Connection refused', 'The app could not be confirmed. Try connecting again.', origin)};
    }
    const allowed = doc.redirect_uris.some((item) => typeof item === 'string' && redirectsMatch(item, redirectUri));
    if (!allowed) {
        return {error: htmlResponse(400, 'Connection refused', 'That app\'s return address is not allowed.', origin)};
    }
    return {clientId, redirectUri, state, clientName: String(doc.client_name || 'aplicativo').slice(0, 80)};
}

function formFields(params, origin) {
    return [
        ['client_id', params.client_id || ''],
        ['redirect_uri', params.redirect_uri || ''],
        ['state', params.state || ''],
        ['code_challenge', params.code_challenge || ''],
        ['code_challenge_method', params.code_challenge_method || ''],
        ['response_type', 'code'],
        ['resource', params.resource || `${origin}/mcp`],
        ['scope', params.scope || SCOPE],
        ['iss', origin],
    ];
}

// GET /auth/status is internal (LoginController::verify_token). The body echoes the
// token, so only the valid flag is read. Revoking that token in Rabbitwork makes
// this check and every later API call fail.
async function personalTokenWorks(token) {
    const base = (env('RABBITWORK_API_BASE_URL') || DEFAULT_BASE_URL).replace(/\/+$/, '');
    let response;
    try {
        response = await fetch(`${base}/auth/status`, {
            method: 'GET',
            redirect: 'manual',
            headers: {'x-api-token': token, accept: 'application/json', 'user-agent': USER_AGENT},
            signal: AbortSignal.timeout(8000),
        });
    } catch {
        return 'network';
    }
    const text = await response.text().catch(() => '');
    let valid = false;
    try {
        valid = text.length <= 4096 && JSON.parse(text).valid === true;
    } catch {
        valid = false;
    }
    if (response.status === 200 && valid) return 'ok';
    if (response.status === 401 || (response.status === 200 && !valid)) return 'invalid';
    return 'network';
}

function issuePair(personalToken, clientId) {
    const accessExp = Math.floor((oauthNow() + ACCESS_TTL_MS) / 1000);
    const refreshExp = Math.floor((oauthNow() + REFRESH_TTL_MS) / 1000);
    return {
        access_token: seal({k: 'access', t: personalToken, cid: clientId, exp: accessExp}),
        token_type: 'Bearer',
        expires_in: ACCESS_TTL_MS / 1000,
        refresh_token: seal({k: 'refresh', t: personalToken, cid: clientId, exp: refreshExp}),
    };
}

async function handleAuthorize(method, rawPath, body, origin) {
    if (!oauthReady()) {
        return htmlResponse(500, 'Connection unavailable', 'The server does not have the OAuth key configured yet.', origin);
    }
    const params = method === 'POST' ? formOf(body) : queryOf(rawPath);
    const client = await resolveClient(params, origin);
    if (client.error) return client.error;
    const fields = formFields(params, origin);
    if (params.response_type !== 'code' || !pkceOk(params.code_challenge, params.code_challenge_method) || !resourceOk(origin, params.resource)) {
        return redirectBack(client.redirectUri, {error: 'invalid_request', state: client.state, iss: origin});
    }
    if (method === 'GET') {
        return authorizeForm({clientName: client.clientName, redirectUri: client.redirectUri, fields, pageOrigin: origin});
    }
    if (method !== 'POST') return htmlResponse(405, 'Invalid method', 'Use the Connect button.', origin);
    const token = String(params.token || '').trim();
    if (!token || token.length > 512 || /\s/.test(token)) {
        return authorizeForm({
            clientName: client.clientName,
            redirectUri: client.redirectUri,
            fields,
            pageOrigin: origin,
            message: 'Paste the Rabbitwork personal token.',
        });
    }
    const check = await personalTokenWorks(token);
    if (check !== 'ok') {
        return authorizeForm({
            clientName: client.clientName,
            redirectUri: client.redirectUri,
            fields,
            pageOrigin: origin,
            message: check === 'invalid'
                ? 'That token was not accepted. Check that it is still active in My tokens.'
                : 'The Rabbitwork API could not be reached. Try again.',
        });
    }
    let code;
    try {
        code = seal({
            k: 'code',
            t: token,
            cid: client.clientId,
            ru: client.redirectUri,
            ch: params.code_challenge,
            res: params.resource || `${origin}/mcp`,
            exp: Math.floor((oauthNow() + CODE_TTL_MS) / 1000),
        });
    } catch {
        return htmlResponse(500, 'Connection unavailable', 'The server does not have the OAuth key configured yet.', origin);
    }
    return redirectBack(client.redirectUri, {code, state: client.state, iss: origin});
}

function handleToken(body, origin) {
    if (!oauthReady()) return oauthError(500, 'server_error', 'OAuth secret is not configured');
    const params = formOf(body);
    if (params.grant_type === 'refresh_token') {
        const payload = openSeal(limited(params.refresh_token, 4000));
        if (!payload || payload.k !== 'refresh' || !payload.t || payload.cid !== params.client_id) {
            return oauthError(400, 'invalid_grant', 'Refresh token is invalid or expired');
        }
        if (params.resource && !resourceOk(origin, params.resource)) {
            return oauthError(400, 'invalid_target', 'Resource does not match this server');
        }
        try {
            return jsonResponse(200, issuePair(payload.t, payload.cid));
        } catch {
            return oauthError(500, 'server_error', 'OAuth secret is not configured');
        }
    }
    if (params.grant_type !== 'authorization_code') {
        return oauthError(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token');
    }
    const payload = openSeal(limited(params.code, 4000));
    if (!payload || payload.k !== 'code' || !payload.t) {
        return oauthError(400, 'invalid_grant', 'Authorization code is invalid or expired');
    }
    if (payload.cid !== params.client_id || payload.ru !== params.redirect_uri) {
        return oauthError(400, 'invalid_grant', 'Authorization code does not match this client');
    }
    if (!verifierOk(params.code_verifier) || !challengesMatch(payload.ch, s256(params.code_verifier))) {
        return oauthError(400, 'invalid_grant', 'PKCE verification failed');
    }
    if (params.resource && payload.res && params.resource !== payload.res) {
        return oauthError(400, 'invalid_target', 'Resource does not match the authorization request');
    }
    try {
        return jsonResponse(200, issuePair(payload.t, payload.cid));
    } catch {
        return oauthError(500, 'server_error', 'OAuth secret is not configured');
    }
}

export async function handleOAuthRequest({method, pathname, rawPath, body, origin}) {
    if (pathname === '/.well-known/oauth-protected-resource' || pathname === '/.well-known/oauth-protected-resource/mcp') {
        if (method !== 'GET') return jsonResponse(405, {message: 'Method not allowed'});
        return jsonResponse(200, protectedResourceMetadata(origin), {'cache-control': 'public, max-age=300'});
    }
    if (pathname === '/.well-known/oauth-authorization-server') {
        if (method !== 'GET') return jsonResponse(405, {message: 'Method not allowed'});
        return jsonResponse(200, authorizationServerMetadata(origin), {'cache-control': 'public, max-age=300'});
    }
    if (pathname === '/oauth-logo.svg') {
        if (method !== 'GET') return jsonResponse(405, {message: 'Method not allowed'});
        return logoResponse();
    }
    if (pathname === '/authorize') return handleAuthorize(method, rawPath, body, origin);
    if (pathname === '/token') {
        if (method !== 'POST') return oauthError(405, 'invalid_request', 'POST the token request');
        return handleToken(body, origin);
    }
    return jsonResponse(404, {message: 'Not found'});
}

export function wwwAuthenticate(origin) {
    return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="${SCOPE}"`;
}
