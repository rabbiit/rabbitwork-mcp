// HTTP/Lambda transport. Never calls the live API: fetch is replaced per test.
import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {handleMessage} from '../server/handle.mjs';
import {handleHttpRequest, readPersonalToken} from '../server/http-app.mjs';
import {handler} from '../server/lambda.mjs';
import {clearOauthClientCache, setOauthClock} from '../server/oauth.mjs';

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
const savedOauth = process.env.RABBITWORK_OAUTH_SECRET;
const savedDomain = process.env.RABBITWORK_MCP_DOMAIN;
const savedPublic = process.env.RABBITWORK_MCP_PUBLIC_URL;
delete process.env.RABBITWORK_API_TOKEN;
delete process.env.RABBITWORK_API_BASE_URL;
delete process.env.RABBITWORK_MCP_DOMAIN;
delete process.env.RABBITWORK_MCP_PUBLIC_URL;
process.env.RABBITWORK_OAUTH_SECRET = 'test-oauth-secret-0123456789';

function jsonRpc(method, params, id = 1) {
    return JSON.stringify({jsonrpc: '2.0', id, method, params});
}

function installFetch(onCall) {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
        calls.push({url: String(url), headers: opts?.headers || {}});
        if (onCall) await onCall();
        return new Response(JSON.stringify({data: [], has_next_page: false}), {
            status: 200,
            headers: {'content-type': 'application/json', 'x-ratelimit-accountdaily': '1'},
        });
    };
    return calls;
}

await t('mcp without a token returns 401 and does not call the API', async () => {
    const calls = installFetch();
    process.env.RABBITWORK_API_TOKEN = 'envtok';
    const init = await handleHttpRequest({
        method: 'POST',
        path: '/mcp',
        headers: {host: 'mcp.test'},
        body: jsonRpc('initialize', {protocolVersion: '2025-06-18', capabilities: {}}),
    });
    delete process.env.RABBITWORK_API_TOKEN;
    assert.equal(init.statusCode, 401);
    assert.match(init.headers['www-authenticate'], /resource_metadata="https:\/\/mcp\.test\/\.well-known\/oauth-protected-resource\/mcp"/);
    const initBody = JSON.parse(init.body);
    assert.equal(initBody.id, 1);
    assert.equal(initBody.error.code, -32001);
    const call = await handleHttpRequest({
        method: 'POST',
        path: '/mcp',
        headers: {},
        body: jsonRpc('tools/call', {name: 'list_projects', arguments: {}}),
    });
    assert.equal(call.statusCode, 401);
    assert.equal(calls.length, 0);
});

await t('x-api-token is forwarded and the default API base URL is used', async () => {
    const calls = installFetch();
    const res = await handleHttpRequest({
        method: 'POST',
        path: '/mcp',
        headers: {'x-api-token': 'htok'},
        body: jsonRpc('tools/call', {name: 'list_projects', arguments: {}}),
    });
    const body = JSON.parse(res.body);
    assert.equal(body.result.isError, undefined);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers['x-api-token'], 'htok');
    assert.ok(calls[0].url.startsWith('https://app.rabbiit.com/api/v1/projects'));
});

await t('Authorization Bearer and x-api-token produce the same API header', async () => {
    const fromHeader = readPersonalToken({'X-Api-Token': 'htok'});
    const fromBearer = readPersonalToken({Authorization: 'Bearer htok'});
    assert.equal(fromHeader, fromBearer);

    const calls = installFetch();
    await handleHttpRequest({
        method: 'POST',
        path: '/mcp',
        headers: {authorization: 'Bearer htok'},
        body: jsonRpc('tools/call', {name: 'list_projects', arguments: {}}),
    });
    assert.equal(calls[0].headers['x-api-token'], 'htok');
});

await t('concurrent requests keep their own tokens', async () => {
    const calls = installFetch(() => new Promise((resolve) => setTimeout(resolve, 30)));
    await Promise.all([
        handleMessage(
            {jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'list_projects', arguments: {}}},
            {token: 'tok-a', remote: true, canElicit: false},
        ),
        handleMessage(
            {jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'list_projects', arguments: {}}},
            {token: 'tok-b', remote: true, canElicit: false},
        ),
    ]);
    assert.deepEqual(calls.map((call) => call.headers['x-api-token']).sort(), ['tok-a', 'tok-b']);
});

await t('destructive tool without confirm does not call the API', async () => {
    const calls = installFetch();
    const res = await handleHttpRequest({
        method: 'POST',
        path: '/mcp',
        headers: {'x-api-token': 'htok'},
        body: jsonRpc('tools/call', {name: 'delete_customer', arguments: {customerId: 1}}),
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
        headers: {'x-api-token': 'htok'},
        body: jsonRpc('tools/call', {name: 'upload_user_profile_photo', arguments: {userId: 1, file: '/nope.png'}}),
    });
    const body = JSON.parse(res.body);
    assert.equal(body.result.isError, true);
    assert.match(body.result.content[0].text, /local disk/);
    assert.equal(calls.length, 0);
});

await t('Lambda handler maps the HTTP API event', async () => {
    const calls = installFetch();
    const out = await handler({
        requestContext: {http: {method: 'POST'}},
        rawPath: '/mcp',
        headers: {'x-api-token': 'htok'},
        body: jsonRpc('tools/call', {name: 'list_projects', arguments: {}}),
        isBase64Encoded: false,
    });
    assert.equal(out.statusCode, 200);
    assert.equal(calls[0].headers['x-api-token'], 'htok');
    const health = await handler({
        requestContext: {http: {method: 'GET'}},
        rawPath: '/health',
        headers: {},
        body: '',
    });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(JSON.parse(health.body), {ok: true});
});

const CLAUDE_CLIENT = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
const CHATGPT_CLIENT = 'https://chatgpt.com/oauth/client.json';
const CLAUDE_REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const CHATGPT_REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';

function originHeaders(extra = {}) {
    return {host: 'mcp.test', 'x-forwarded-proto': 'https', ...extra};
}

function pkcePair() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return {verifier, challenge};
}

function installOauthFetch(tokenStatus = 200) {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
        const target = String(url);
        calls.push({url: target, headers: opts?.headers || {}});
        if (target.startsWith('https://claude.ai/') || target.startsWith('https://chatgpt.com/')) {
            const redirect = target.startsWith('https://chatgpt.com/') ? CHATGPT_REDIRECT : CLAUDE_REDIRECT;
            return new Response(JSON.stringify({
                client_id: target,
                client_name: target.startsWith('https://chatgpt.com/') ? 'ChatGPT' : 'Claude',
                redirect_uris: [redirect, 'http://127.0.0.1/callback', 'http://localhost/callback'],
                token_endpoint_auth_method: 'none',
            }), {status: 200, headers: {'content-type': 'application/json'}});
        }
        if (target.includes('/auth/status')) {
            return new Response(JSON.stringify({valid: tokenStatus === 200}), {
                status: tokenStatus,
                headers: {'content-type': 'application/json'},
            });
        }
        return new Response(JSON.stringify({data: []}), {
            status: 200,
            headers: {'content-type': 'application/json'},
        });
    };
    return calls;
}

function authorizeQuery({
                            clientId,
                            redirectUri,
                            challenge,
                            redirect = redirectUri,
                            state = 'state-1',
                            resource = 'https://mcp.test/mcp'
                        }) {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirect,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        resource,
        scope: 'rabbitwork',
    });
    return `/authorize?${params}`;
}

await t('loopback without x-forwarded-proto is http', async () => {
    const res = await handleHttpRequest({
        method: 'GET',
        path: '/.well-known/oauth-authorization-server',
        headers: {host: '127.0.0.1:8787'},
        body: '',
    });
    assert.equal(JSON.parse(res.body).issuer, 'http://127.0.0.1:8787');
});

await t('oauth discovery documents describe this server', async () => {
    const headers = originHeaders();
    const resource = await handleHttpRequest({
        method: 'GET',
        path: '/.well-known/oauth-protected-resource/mcp',
        headers,
        body: '',
    });
    const root = await handleHttpRequest({
        method: 'GET',
        path: '/.well-known/oauth-protected-resource',
        headers,
        body: '',
    });
    const auth = await handleHttpRequest({
        method: 'GET',
        path: '/.well-known/oauth-authorization-server',
        headers,
        body: '',
    });
    assert.equal(resource.statusCode, 200);
    assert.deepEqual(JSON.parse(resource.body), JSON.parse(root.body));
    const resourceBody = JSON.parse(resource.body);
    assert.equal(resourceBody.resource, 'https://mcp.test/mcp');
    assert.deepEqual(resourceBody.authorization_servers, ['https://mcp.test']);
    const authBody = JSON.parse(auth.body);
    assert.equal(authBody.issuer, 'https://mcp.test');
    assert.equal(authBody.authorization_endpoint, 'https://mcp.test/authorize');
    assert.equal(authBody.token_endpoint, 'https://mcp.test/token');
    assert.deepEqual(authBody.code_challenge_methods_supported, ['S256']);
    assert.deepEqual(authBody.token_endpoint_auth_methods_supported, ['none']);
    assert.equal(authBody.client_id_metadata_document_supported, true);
    assert.equal(authBody.authorization_response_iss_parameter_supported, true);
    assert.equal(authBody.registration_endpoint, undefined);
});

await t('oauth rejects an unknown client without fetching it', async () => {
    clearOauthClientCache();
    let fetched = false;
    globalThis.fetch = async () => {
        fetched = true;
        throw new Error('should not fetch');
    };
    const {challenge} = pkcePair();
    const res = await handleHttpRequest({
        method: 'GET',
        path: authorizeQuery({
            clientId: 'https://evil.example/client.json',
            redirectUri: 'https://evil.example/callback',
            challenge,
        }),
        headers: originHeaders(),
        body: '',
    });
    assert.equal(res.statusCode, 400);
    assert.equal(fetched, false);
    assert.match(res.body, /was not recognized/);
});

await t('oauth code exchange stores the personal token inside the bearer', async () => {
    clearOauthClientCache();
    setOauthClock(null);
    const calls = installOauthFetch();
    const personal = 'persona-tok-1';
    const {verifier, challenge} = pkcePair();
    const page = await handleHttpRequest({
        method: 'GET',
        path: authorizeQuery({clientId: CLAUDE_CLIENT, redirectUri: CLAUDE_REDIRECT, challenge}),
        headers: originHeaders(),
        body: '',
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Personal token/);
    assert.match(page.body, /https:\/\/www\.rabbiit\.com\/help\/how-to-use-the-api-and-access-tokens/);
    assert.match(page.body, /src="\/oauth-logo.svg"/);
    assert.match(page.body, /alt="Rabbitwork"/);
    assert.match(page.body, /rgb\(7, 95, 227\)/);
    const logo = await handleHttpRequest({method: 'GET', path: '/oauth-logo.svg', headers: originHeaders(), body: ''});
    assert.equal(logo.statusCode, 200);
    assert.match(logo.headers['content-type'], /image\/svg\+xml/);
    assert.match(logo.body, /viewBox="0 0 290 56"/);
    assert.match(page.headers['content-security-policy'], /form-action 'self' https:\/\/claude\.ai/);
    assert.match(page.headers['content-security-policy'], /base-uri 'self'/);
    assert.match(page.body, /claude\.ai/);
    assert.doesNotMatch(page.body, /persona-tok-1/);

    const posted = await handleHttpRequest({
        method: 'POST',
        path: '/authorize',
        headers: originHeaders({'content-type': 'application/x-www-form-urlencoded'}),
        body: new URLSearchParams({
            response_type: 'code',
            client_id: CLAUDE_CLIENT,
            redirect_uri: CLAUDE_REDIRECT,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state: 'state-1',
            resource: 'https://mcp.test/mcp',
            scope: 'rabbitwork',
            token: personal,
        }).toString(),
    });
    assert.equal(posted.statusCode, 302);
    const location = new URL(posted.headers.location);
    assert.equal(location.origin + location.pathname, CLAUDE_REDIRECT);
    assert.equal(location.searchParams.get('state'), 'state-1');
    assert.equal(location.searchParams.get('iss'), 'https://mcp.test');
    const code = location.searchParams.get('code');
    assert.ok(code);
    assert.equal(location.search.includes(personal), false);
    assert.equal(calls.some((call) => call.url.endsWith('/auth/status') && call.headers['x-api-token'] === personal), true);
    assert.equal(calls.some((call) => call.url.includes('/projects')), false);

    const wrong = await handleHttpRequest({
        method: 'POST',
        path: '/token',
        headers: originHeaders(),
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: CLAUDE_CLIENT,
            redirect_uri: CLAUDE_REDIRECT,
            code_verifier: `${verifier}nope`,
        }).toString(),
    });
    assert.equal(wrong.statusCode, 400);
    assert.equal(JSON.parse(wrong.body).error, 'invalid_grant');

    const tokenRes = await handleHttpRequest({
        method: 'POST',
        path: '/token',
        headers: originHeaders(),
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: CLAUDE_CLIENT,
            redirect_uri: CLAUDE_REDIRECT,
            code_verifier: verifier,
            resource: 'https://mcp.test/mcp',
        }).toString(),
    });
    assert.equal(tokenRes.statusCode, 200);
    const issued = JSON.parse(tokenRes.body);
    assert.equal(issued.token_type, 'Bearer');
    assert.equal(issued.expires_in, 3600);
    assert.equal(issued.access_token.includes(personal), false);

    const mcpCalls = installOauthFetch();
    const mcp = await handleHttpRequest({
        method: 'POST',
        path: '/mcp',
        headers: originHeaders({authorization: `Bearer ${issued.access_token}`}),
        body: jsonRpc('tools/call', {name: 'list_projects', arguments: {}}),
    });
    assert.equal(mcp.statusCode, 200);
    assert.equal(JSON.parse(mcp.body).result.isError, undefined);
    assert.equal(mcpCalls.at(-1).headers['x-api-token'], personal);

    const refreshed = await handleHttpRequest({
        method: 'POST',
        path: '/token',
        headers: originHeaders(),
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: issued.refresh_token,
            client_id: CLAUDE_CLIENT,
        }).toString(),
    });
    assert.equal(refreshed.statusCode, 200);
    const next = JSON.parse(refreshed.body);
    assert.notEqual(next.access_token, issued.access_token);

    const asRefresh = await handleHttpRequest({
        method: 'POST',
        path: '/mcp',
        headers: originHeaders({authorization: `Bearer ${issued.refresh_token}`}),
        body: jsonRpc('tools/list', {}),
    });
    assert.equal(asRefresh.statusCode, 401);
});

await t('oauth accepts the ChatGPT redirect and a loopback port', async () => {
    clearOauthClientCache();
    installOauthFetch();
    const {challenge} = pkcePair();
    const chatgpt = await handleHttpRequest({
        method: 'GET',
        path: authorizeQuery({clientId: CHATGPT_CLIENT, redirectUri: CHATGPT_REDIRECT, challenge, state: 'cgpt'}),
        headers: originHeaders(),
        body: '',
    });
    assert.equal(chatgpt.statusCode, 200);
    assert.match(chatgpt.body, /ChatGPT/);
    assert.match(chatgpt.headers['content-security-policy'], /form-action 'self' https:\/\/chatgpt\.com/);
    const loop = await handleHttpRequest({
        method: 'GET',
        path: authorizeQuery({
            clientId: CLAUDE_CLIENT,
            redirectUri: CLAUDE_REDIRECT,
            redirect: 'http://127.0.0.1:3118/callback',
            challenge,
            state: 'loop',
        }),
        headers: originHeaders(),
        body: '',
    });
    assert.equal(loop.statusCode, 200);
    assert.match(loop.body, /on this computer/);
    assert.match(loop.headers['content-security-policy'], /form-action 'self' http:\/\/127\.0\.0\.1:3118/);
});

await t('oauth refuses an invalid personal token and an expired access token', async () => {
    clearOauthClientCache();
    const issuedAt = Date.now();
    setOauthClock(() => issuedAt);
    installOauthFetch(401);
    const {verifier, challenge} = pkcePair();
    const denied = await handleHttpRequest({
        method: 'POST',
        path: '/authorize',
        headers: originHeaders(),
        body: new URLSearchParams({
            response_type: 'code',
            client_id: CLAUDE_CLIENT,
            redirect_uri: CLAUDE_REDIRECT,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state: 'state-1',
            resource: 'https://mcp.test/mcp',
            token: 'persona-tok-1',
        }).toString(),
    });
    assert.equal(denied.statusCode, 400);
    assert.match(denied.body, /was not accepted/);
    assert.equal(denied.headers.location, undefined);

    installOauthFetch(500);
    const down = await handleHttpRequest({
        method: 'POST',
        path: '/authorize',
        headers: originHeaders(),
        body: new URLSearchParams({
            response_type: 'code',
            client_id: CLAUDE_CLIENT,
            redirect_uri: CLAUDE_REDIRECT,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state: 'state-1',
            resource: 'https://mcp.test/mcp',
            token: 'persona-tok-1',
        }).toString(),
    });
    assert.equal(down.statusCode, 400);
    assert.match(down.body, /could not be reached/);
    assert.equal(down.headers.location, undefined);

    installOauthFetch(200);
    const posted = await handleHttpRequest({
        method: 'POST',
        path: '/authorize',
        headers: originHeaders(),
        body: new URLSearchParams({
            response_type: 'code',
            client_id: CLAUDE_CLIENT,
            redirect_uri: CLAUDE_REDIRECT,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state: 'state-1',
            resource: 'https://mcp.test/mcp',
            token: 'persona-tok-1',
        }).toString(),
    });
    const code = new URL(posted.headers.location).searchParams.get('code');
    const tokenRes = await handleHttpRequest({
        method: 'POST',
        path: '/token',
        headers: originHeaders(),
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: CLAUDE_CLIENT,
            redirect_uri: CLAUDE_REDIRECT,
            code_verifier: verifier,
        }).toString(),
    });
    const issued = JSON.parse(tokenRes.body);
    setOauthClock(() => issuedAt + 2 * 60 * 60 * 1000);
    const expired = await handleHttpRequest({
        method: 'POST',
        path: '/mcp',
        headers: originHeaders({authorization: `Bearer ${issued.access_token}`}),
        body: jsonRpc('tools/list', {}),
    });
    assert.equal(expired.statusCode, 401);
    const stillFresh = await handleHttpRequest({
        method: 'POST',
        path: '/token',
        headers: originHeaders(),
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: issued.refresh_token,
            client_id: CLAUDE_CLIENT,
        }).toString(),
    });
    assert.equal(stillFresh.statusCode, 200);
    setOauthClock(null);
});

await t('Lambda passes the authorize query string and serves discovery', async () => {
    clearOauthClientCache();
    installOauthFetch();
    const {challenge} = pkcePair();
    const query = authorizeQuery({
        clientId: CLAUDE_CLIENT,
        redirectUri: CLAUDE_REDIRECT,
        challenge
    }).slice('/authorize?'.length);
    const page = await handler({
        requestContext: {http: {method: 'GET'}},
        rawPath: '/authorize',
        rawQueryString: query,
        headers: originHeaders(),
        body: '',
    });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Personal token/);
    assert.match(page.body, /https:\/\/www\.rabbiit\.com\/help\/how-to-use-the-api-and-access-tokens/);
    assert.match(page.body, /src="\/oauth-logo.svg"/);
    assert.match(page.body, /alt="Rabbitwork"/);
    assert.match(page.body, /rgb\(7, 95, 227\)/);
    const meta = await handler({
        requestContext: {http: {method: 'GET'}},
        rawPath: '/.well-known/oauth-authorization-server',
        headers: originHeaders(),
        body: '',
    });
    assert.equal(JSON.parse(meta.body).issuer, 'https://mcp.test');
});

globalThis.fetch = savedFetch;
setOauthClock(null);
clearOauthClientCache();
if (savedToken === undefined) delete process.env.RABBITWORK_API_TOKEN;
else process.env.RABBITWORK_API_TOKEN = savedToken;
if (savedBase === undefined) delete process.env.RABBITWORK_API_BASE_URL;
else process.env.RABBITWORK_API_BASE_URL = savedBase;
if (savedOauth === undefined) delete process.env.RABBITWORK_OAUTH_SECRET;
else process.env.RABBITWORK_OAUTH_SECRET = savedOauth;
if (savedDomain === undefined) delete process.env.RABBITWORK_MCP_DOMAIN;
else process.env.RABBITWORK_MCP_DOMAIN = savedDomain;
if (savedPublic === undefined) delete process.env.RABBITWORK_MCP_PUBLIC_URL;
else process.env.RABBITWORK_MCP_PUBLIC_URL = savedPublic;

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
    console.log(failures.join('\n'));
    process.exit(1);
}
