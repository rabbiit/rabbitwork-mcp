// Shared list-and-find helpers for membership/link guards.
import { request, ToolError } from '../lib.mjs';
export async function listRows(path, query) {
  const r = await request('GET', path, { query });
  const rows = Array.isArray(r.json) ? r.json : r.json?.data;
  if (!Array.isArray(rows)) throw new ToolError(`Unexpected response shape from GET ${path}`);
  return rows;
}
export const sameId = (a, b) => a !== undefined && a !== null && String(a) === String(b);
