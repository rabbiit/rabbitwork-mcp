// Shared runtime: env, HTTP client (JSON + multipart), paging, argument validation. Zero dependencies.
// (generic route-based tools live in build.mjs)

export const DEFAULT_BASE_URL = 'https://app.rabbiit.com/api/v1';
export const USER_AGENT = 'rabbitwork-agent-plugin/1.0.0';

// Treat unexpanded "${VAR}" placeholders as unset.
export const env = (k) => {
  const v = process.env[k];
  return !v || /^\$\{[^}]*\}$/.test(v) ? undefined : v;
};

export class ToolError extends Error { constructor(m, status) { super(m); if (status) this.status = status; } }
export const redact = (s) => { const t = env('RABBITWORK_API_TOKEN'); return t ? String(s).split(t).join('[REDACTED]') : String(s); };

export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isIds = (s) => /^[\w-]+(,[\w-]+)*$/.test(s);
export const posInt = (v, name) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ToolError(`"${name}" must be a positive integer`);
  return n;
};
export async function request(method, path, { query, body } = {}) {
  const token = env('RABBITWORK_API_TOKEN');
  if (!token) {
    throw new ToolError(
      'RABBITWORK_API_TOKEN is not set. Create a personal token in the Rabbitwork app (Settings > You > My tokens; ' +
        'see https://api-docs.rabbiit.com/) and configure it as the plugin secret variable. No request was sent.'
    );
  }
  const base = (env('RABBITWORK_API_BASE_URL') || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query)}` : '';
  const headers = { 'x-api-token': token, accept: 'application/json', 'user-agent': USER_AGENT };
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${base}${path}${qs}`, { method, headers, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
  } catch (e) {
    throw new ToolError(`Network error on ${method} ${path}: ${redact(e.message)}`);
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  const rateLimit = res.headers.get('x-ratelimit-accountdaily');
  if (!res.ok) {
    const errs = json?.errors && typeof json.errors === 'object' ? ` ${JSON.stringify(json.errors).slice(0, 500)}` : '';
    const msg = redact((json?.message || json?.error || text.slice(0, 300) || res.statusText) + errs);
    const retry = res.headers.get('retry-after');
    const hint =
      res.status === 401 ? ' (token invalid or revoked)'
      : res.status === 403 ? ' (forbidden: the token owner lacks permission for this action)'
      : res.status === 404 ? ' (not found)'
      : res.status === 422 ? ' (validation failed)'
      : res.status === 429 ? ` (rate limit${retry ? `; Retry-After ${retry}s` : ''}; do not retry immediately)`
      : '';
    throw new ToolError(`Rabbitwork API ${res.status} on ${method} ${path}${hint}: ${msg}`, res.status);
  }
  if (json === null) {
    if (!text.trim()) return { json: null, rateLimit, status: res.status };
    throw new ToolError(`Unexpected non-JSON response from ${method} ${path}`);
  }
  return { json, rateLimit, status: res.status };
}

export async function paged(path, query, maxPages) {
  const rows = [];
  let q = { ...query }, pages = 0, hasNext = false, totals = null, rateLimit = null;
  while (pages < maxPages) {
    const r = await request('GET', path, { query: q });
    pages++;
    rateLimit = r.rateLimit || rateLimit;
    const data = Array.isArray(r.json) ? r.json : r.json.data;
    if (!Array.isArray(data)) throw new ToolError(`Unexpected response shape from GET ${path} (no "data" array).`);
    rows.push(...data);
    totals = r.json.totals ?? totals;
    hasNext = !!r.json.has_next_page;
    if (!hasNext || !r.json.next_page_query_params) break;
    q = { ...q, ...r.json.next_page_query_params };
  }
  return { rows, pages, hasNext, totals, rateLimit };
}

// Single objects may come wrapped in {data:{...}} (observed live) or bare (as in parts of the spec).
export const unwrap = (j) => (j && typeof j === 'object' && !Array.isArray(j) && 'data' in j && (j.data === null || (typeof j.data === 'object' && !Array.isArray(j.data))) ? j.data : j);

// ---------- declarative argument specs ----------
// spec: { type: 'id'|'ids'|'string'|'boolean'|'number'|'integer'|'date'|'time'|'duration'|'enum'|'enumList', required?, description?, values?, api? }
const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;
const DUR_RE = /^\d+:\d{2}(:\d{2})?$/;
export function schemaOf(args) {
  const properties = {}, required = [];
  for (const [k, s] of Object.entries(args)) {
    const p = { description: s.description };
    if (s.type === 'id') Object.assign(p, { type: 'integer', minimum: 1 });
    else if (s.type === 'integer') Object.assign(p, { type: 'integer', ...(s.min !== undefined ? { minimum: s.min } : {}), ...(s.max !== undefined ? { maximum: s.max } : {}) });
    else if (s.type === 'pathId') Object.assign(p, { type: ['integer', 'string'], description: s.description ?? 'ID' });
    else if (s.type === 'strArray') Object.assign(p, { type: 'array', items: { type: 'string' } });
    else if (s.type === 'array') Object.assign(p, { type: 'array' });
    else if (s.type === 'object') Object.assign(p, { type: 'object' });
    else if (s.type === 'any') Object.assign(p, {});
    else if (s.type === 'url') Object.assign(p, { type: 'string', format: 'uri' });
    else if (s.type === 'filePath') Object.assign(p, { type: 'string', description: `${s.description ?? ''} Absolute path to a local file.`.trim() });
    else if (s.type === 'number') Object.assign(p, { type: 'number', minimum: 0 });
    else if (s.type === 'boolean') p.type = 'boolean';
    else if (s.type === 'intArray') Object.assign(p, { type: 'array', items: { type: 'integer', minimum: s.min ?? 0, ...(s.max !== undefined ? { maximum: s.max } : {}) } });
    else if (s.type === 'email') Object.assign(p, { type: 'string', format: 'email' });
    else if (s.type === 'enum') Object.assign(p, { type: s.values.every((x) => typeof x === 'number') ? 'integer' : 'string', enum: s.values });
    else if (s.type === 'ids') Object.assign(p, { type: 'string', description: `${s.description ?? ''} (ID or comma-separated IDs)`.trim() });
    else if (s.type === 'enumList') Object.assign(p, { type: 'string', description: `${s.description ?? ''} Comma-separated; allowed: ${s.values.join(', ')}`.trim() });
    else if (s.type === 'date') Object.assign(p, { type: 'string', format: 'date' });
    else if (s.type === 'tri') Object.assign(p, { enum: [true, false, 'all'], default: true });
    else p.type = 'string';
    if (p.description === undefined) delete p.description;
    properties[k] = p;
    if (s.required) required.push(k);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false };
}
export function validate(args, spec) {
  const a = args || {};
  for (const k of Object.keys(a)) if (!(k in spec)) throw new ToolError(`Unknown argument "${k}"`);
  const out = {};
  for (const [k, s] of Object.entries(spec)) {
    let v = a[k];
    if (v === undefined || v === null) { if (s.required) throw new ToolError(`"${k}" is required`); continue; }
    switch (s.type) {
      case 'id': out[k] = posInt(v, k); break;
      case 'integer': { const n = Number(v); if (typeof v === 'boolean' || v === '' || !Number.isInteger(n) || (s.min !== undefined && n < s.min) || (s.max !== undefined && n > s.max)) throw new ToolError(`"${k}" must be an integer${s.min !== undefined ? ` >= ${s.min}` : ''}${s.max !== undefined ? ` <= ${s.max}` : ''}`); out[k] = n; break; }
      case 'pathId': { const str = String(v); if (!/^[A-Za-z0-9_-]+$/.test(str) || str === '0') throw new ToolError(`"${k}" must be an ID`); out[k] = typeof v === 'number' ? v : str; break; }
      case 'strArray': if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' && typeof x !== 'number')) throw new ToolError(`"${k}" must be an array of strings`); out[k] = v.map(String); break;
      case 'array': if (!Array.isArray(v)) throw new ToolError(`"${k}" must be an array`); out[k] = v; break;
      case 'object': if (typeof v !== 'object' || Array.isArray(v)) throw new ToolError(`"${k}" must be an object`); out[k] = v; break;
      case 'any': out[k] = v; break;
      case 'tri': if (v !== true && v !== false && v !== 'all') throw new ToolError(`"${k}" must be true, false or "all"`); out[k] = v; break;
      case 'url': { let u; try { u = new URL(v); } catch { throw new ToolError(`"${k}" must be a valid URL`); } if (s.httpsOnly && u.protocol !== 'https:') throw new ToolError(`"${k}" must use https://`); out[k] = String(v); break; }
      case 'filePath': if (typeof v !== 'string' || !v.startsWith('/')) throw new ToolError(`"${k}" must be an absolute file path`); out[k] = v; break;
      case 'number': { const n = Number(v); if (typeof v === 'boolean' || v === '' || !Number.isFinite(n) || n < 0) throw new ToolError(`"${k}" must be a non-negative number`); out[k] = n; break; }
      case 'boolean': if (typeof v !== 'boolean') throw new ToolError(`"${k}" must be a boolean`); out[k] = v; break;
      case 'intArray': {
        if (!Array.isArray(v) || v.some((x) => !Number.isInteger(x) || x < (s.min ?? 0) || (s.max !== undefined && x > s.max))) throw new ToolError(`"${k}" must be an array of integers${s.max !== undefined ? ` between ${s.min ?? 0} and ${s.max}` : ''}`);
        out[k] = [...v]; break;
      }
      case 'email': if (typeof v !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new ToolError(`"${k}" must be a valid email`); out[k] = v.trim(); break;
      case 'ids': if (Array.isArray(v)) v = v.join(','); if (!isIds(String(v))) throw new ToolError(`"${k}" must be an ID or comma-separated IDs`); out[k] = String(v); break;
      case 'date': if (typeof v !== 'string' || !isDate(v)) throw new ToolError(`"${k}" must be YYYY-MM-DD`); out[k] = v; break;
      case 'time': if (typeof v !== 'string' || !TIME_RE.test(v)) throw new ToolError(`"${k}" must be HH:mm or HH:mm:ss`); out[k] = v; break;
      case 'duration': if (typeof v !== 'string' || !DUR_RE.test(v)) throw new ToolError(`"${k}" must be H:mm or HH:mm:ss`); out[k] = v; break;
      case 'enum': if (!s.values.includes(v)) throw new ToolError(`"${k}" must be one of: ${s.values.join(', ')}`); out[k] = v; break;
      case 'enumList': {
        const parts = String(v).split(',').map((x) => x.trim()).filter(Boolean);
        const bad = parts.filter((p) => !s.values.some((allowed) => allowed === p || (allowed.endsWith('*') && p.startsWith(allowed.slice(0, -1)))));
        if (!parts.length || bad.length) throw new ToolError(`"${k}" has invalid value(s): ${bad.join(', ') || '(empty)'}; allowed: ${s.values.join(', ')}`);
        out[k] = parts.join(','); break;
      }
      default: if (typeof v !== 'string') throw new ToolError(`"${k}" must be a string`); if (s.required && !v.trim()) throw new ToolError(`"${k}" must not be empty`); out[k] = v;
    }
  }
  return out;
}

/** Map validated args to API fields using spec[k].api (skips args without api). */


/**
 * Read-before-write edit: GET current object, resend current values of `preserve` fields (required + other writable fields),
 * overlay `changes`, POST, then return normalized after-object, field diff and body sent.
 */

