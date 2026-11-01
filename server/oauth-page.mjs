// Authorize page. The pasted value is the Rabbitwork personal token.
// The document lives in oauth-page.html. Values passed to fill() are already escaped.
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isLoopbackHost} from './http-util.mjs';

const pageDir = dirname(fileURLToPath(import.meta.url));
const logo = readFileSync(join(pageDir, 'oauth-logo.svg'), 'utf8');
const pageTemplate = readFileSync(join(pageDir, 'oauth-page.html'), 'utf8');

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

function contentSecurityPolicy() {
    // Do not set form-action. Chrome applies it to the redirect after POST and often
    // blocks the submit to /authorize even when 'self' and the client origin are listed.
    // The form target is fixed in oauth-page.html; there is no script on this page.
    return "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'";
}

function authorizeActionUrl(pageOrigin) {
    const base = String(pageOrigin || '').replace(/\/+$/, '');
    return base ? `${base}/authorize` : '/authorize';
}

function pageResponse(statusCode, values) {
    return {
        statusCode,
        headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
            'x-frame-options': 'DENY',
            'content-security-policy': contentSecurityPolicy(),
        },
        body: fill(pageTemplate, values),
    };
}

export function htmlResponse(statusCode, title, message, pageOrigin = '') {
    return pageResponse(statusCode, {
        title: esc(title),
        messageAttrs: '',
        message: esc(message),
        alertAttrs: 'hidden',
        alert: '',
        formAttrs: 'hidden',
        clientName: '',
        host: '',
        localAttrs: 'hidden',
        fields: '',
        cancel: '',
        authorizeAction: esc(authorizeActionUrl(pageOrigin)),
    });
}

export function logoResponse() {
    return {
        statusCode: 200,
        headers: {'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400'},
        body: logo,
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

export function authorizeForm({clientName, redirectUri, fields, message, pageOrigin = ''}) {
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
    return pageResponse(message ? 400 : 200, {
        title: esc('Connect Rabbitwork'),
        messageAttrs: 'hidden',
        message: '',
        alertAttrs: message ? '' : 'hidden',
        alert: esc(message),
        formAttrs: '',
        clientName: esc(clientName),
        host: esc(host),
        localAttrs: loop ? '' : 'hidden',
        fields: fields.map(([name, value]) => hidden(name, value)).join(''),
        cancel: esc(cancelHref(redirectUri, fields)),
        authorizeAction: esc(authorizeActionUrl(pageOrigin)),
    });
}
