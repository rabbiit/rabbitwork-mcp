// AES-256-GCM envelopes. The ciphertext carries the Rabbitwork personal token.
// There is no shared store: revoking that token in Rabbitwork is what stops later API calls.
import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {env} from './lib.mjs';

let now = () => Date.now();

export function setOauthClock(fn) {
    now = typeof fn === 'function' ? fn : () => Date.now();
}

export function oauthNow() {
    return now();
}

function aesKey() {
    const secret = env('RABBITWORK_OAUTH_SECRET');
    if (!secret || secret.length < 16) return null;
    return createHash('sha256').update(secret).digest();
}

export function oauthReady() {
    return aesKey() !== null;
}

export function seal(payload) {
    const key = aesKey();
    if (!key) {
        const error = new Error('OAuth secret is not configured');
        error.code = 'oauth_secret';
        throw error;
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `rw1.${Buffer.concat([iv, tag, enc]).toString('base64url')}`;
}

export function openSeal(token) {
    const key = aesKey();
    if (!key || typeof token !== 'string' || !token.startsWith('rw1.')) return null;
    const buf = Buffer.from(token.slice(4), 'base64url');
    if (buf.length < 30) return null;
    try {
        const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
        decipher.setAuthTag(buf.subarray(12, 28));
        const json = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
        const payload = JSON.parse(json);
        if (!payload || typeof payload.exp !== 'number') return null;
        if (payload.exp * 1000 + 60_000 < now()) return null;
        return payload;
    } catch {
        return null;
    }
}

export function credentialFromHeader(raw) {
    const value = String(raw || '').trim();
    if (!value) return undefined;
    if (!value.startsWith('rw1.')) return value;
    const payload = openSeal(value);
    if (!payload || payload.k !== 'access' || typeof payload.t !== 'string' || !payload.t) return undefined;
    return payload.t;
}
