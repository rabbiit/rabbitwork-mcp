// Copy server/version.mjs into the static manifests that cannot import it.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../server/version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['package.json', 'plugin.json', '.cursor-plugin/plugin.json'];

export function syncVersion(dir = root) {
  const changed = [];
  for (const rel of FILES) {
    const file = path.join(dir, rel);
    const text = readFileSync(file, 'utf8');
    if (!/"version"\s*:/.test(text)) throw new Error(`${rel} has no version field`);
    const next = text.replace(/("version"\s*:\s*")[^"]+(")/, `$1${VERSION}$2`);
    if (next === text) continue;
    writeFileSync(file, next);
    changed.push(rel);
  }
  return changed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changed = syncVersion();
  console.log(changed.length ? `version ${VERSION} written to ${changed.join(', ')}` : `version ${VERSION} already matches`);
}
