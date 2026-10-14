// Authorize page. The pasted value is the Rabbitwork personal token.
// The document lives in oauth-page.html. Values passed to fill() are already escaped.
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isLoopbackHost} from './http-util.mjs';

const [pageTemplate, formTemplate] = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'oauth-page.html'),
    'utf8',
).split(/\r?\n<!-- form -->\r?\n/);

if (!formTemplate) throw new Error('oauth-page.html is missing the form template');

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

function fill(template, values) {
    return template.replace(/\{\{(\w+)\}\}/g, (token, key) => {
        if (!Object.hasOwn(values, key)) throw new Error(`Missing page placeholder ${key}`);
        return values[key];
    });
}

export function htmlResponse(statusCode, title, inner) {
    return {
        statusCode,
        headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
            'x-frame-options': 'DENY',
            'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
        },
        body: fill(pageTemplate, {title: esc(title), inner}),
    };
}

function hidden(name, value) {
    return `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;
}

function cancelHref(redirectUri, fields) {
    const state = fields.find(([name]) => name === 'state')?.[1] || '';
    const iss = fields.find(([name]) => name === 'iss')?.[1] || '';
    const url = new URL(redirectUri);
    url.searchParams.set('error', 'access_denied');
    if (state) url.searchParams.set('state', state);
    if (iss) url.searchParams.set('iss', iss);
    return url.toString();
}

export function authorizeForm({clientName, redirectUri, fields, message}) {
    let host = '';
    try {
        host = new URL(redirectUri).host;
    } catch {
        host = '';
    }
    const loop = (() => {
        try {
            return isLoopbackHost(new URL(redirectUri).hostname);
        } catch {
            return false;
        }
    })();
    const inner = fill(formTemplate, {
        alert: message ? `<p class="error">${esc(message)}</p>` : '',
        clientName: esc(clientName),
        host: esc(host),
        local: loop ? '<p>The return address is on this computer. Confirm that you started this connection.</p>' : '',
        fields: fields.map(([name, value]) => hidden(name, value)).join(''),
        cancel: esc(cancelHref(redirectUri, fields)),
    });
    return htmlResponse(message ? 400 : 200, 'Connect Rabbitwork', inner);
}
