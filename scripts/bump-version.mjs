// Raise the patch number in server/version.mjs and copy it to the manifests.
// Production deploy runs this. Dev and staging leave the version alone.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeVersion } from './sync-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function nextPatch(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    if (!match) throw new Error(`Version must be major.minor.patch, got ${version}`);
    return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

export function bumpPatch(dir = root) {
    const file = path.join(dir, 'server/version.mjs');
    const text = readFileSync(file, 'utf8');
    const match = text.match(/export const VERSION = '(\d+\.\d+\.\d+)'/);
    if (!match) throw new Error('server/version.mjs has no VERSION');
    const next = nextPatch(match[1]);
    writeFileSync(file, text.replace(match[0], `export const VERSION = '${next}'`));
    writeVersion(next, dir);
    return next;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const next = bumpPatch();
    console.log(`VERSION bumped to ${next}`);
}
