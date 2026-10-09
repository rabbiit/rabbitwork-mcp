// Dev-time generator: reads the OpenAPI spec embedded in https://api-docs.rabbiit.com/ (saved to spec/openapi.en.json)
// and writes server/spec/routes.mjs — a FIXED, hardcoded route table used by the server at runtime.
// Usage: node scripts/gen-routes.mjs [spec/openapi.en.json]
import { readFileSync, writeFileSync } from 'node:fs';

const spec = JSON.parse(readFileSync(process.argv[2] || 'spec/openapi.en.json', 'utf8'));
let ptSpec = null; // pt-BR summaries/tags (used in the pt-BR approval card), optional
try { ptSpec = JSON.parse(readFileSync('spec/openapi.pt.json', 'utf8')); } catch {}
const deref = (o, d = 0) => {
  if (d > 12 || !o || typeof o !== 'object') return o;
  if (o.$ref) { let x = spec; for (const k of o.$ref.replace('#/', '').split('/')) x = x?.[k]; return deref(x, d + 1); }
  if (Array.isArray(o)) return o.map((v) => deref(v, d + 1));
  const r = {}; for (const [k, v] of Object.entries(o)) r[k] = deref(v, d + 1); return r;
};
function flat(s) {
  s = deref(s);
  if (!s || typeof s !== 'object') return {};
  if (s.allOf) {
    const parts = s.allOf.map(flat);
    const out = { type: 'object', properties: {}, required: [] };
    for (const p of parts) {
      for (const [k, v] of Object.entries(p.properties || {})) {
        const prev = out.properties[k];
        // allOf: merge property definitions; an explicit readOnly:false (e.g. users.body.newUser.email) overrides a readOnly:true from the base model.
        out.properties[k] = prev && (prev.readOnly === false || v.readOnly === false) ? { ...v, readOnly: false } : v;
      }
      out.required.push(...(p.required || []));
    }
    return out;
  }
  if (Array.isArray(s.items)) s = { ...s, items: s.items[0] };
  return s;
}
function field(p, requiredList, name) {
  p = flat(p);
  const t = Array.isArray(p.type) ? p.type[0] : p.type || (p.properties ? 'object' : p.items ? 'array' : 'any');
  const d = { t: ['integer', 'number', 'boolean', 'string', 'array', 'object'].includes(t) ? t : t === 'int' ? 'integer' : 'any' };
  if (p.format) d.f = p.format;
  if (p.enum) d.e = p.enum;
  if (d.t === 'array') { const it = flat(p.items || {}); d.it = it.properties ? 'object' : (Array.isArray(it.type) ? it.type[0] : it.type) || 'any'; }
  if (p.readOnly) d.ro = 1;
  if (p.writeOnly) d.wo = 1;
  if (p.deprecated) d.dep = 1;
  if (p.nullable) d.nul = 1;
  if ((requiredList || []).includes(name) || p.required === true) d.req = 1;
  return d;
}
const fieldsOf = (s) => { s = flat(s); const o = {}; for (const [k, v] of Object.entries(s.properties || {})) o[k] = field(v, s.required, k); return o; };

const routes = [];
for (const [path, ops] of Object.entries(spec.paths)) {
  for (const [m, op] of Object.entries(ops)) {
    if (!['get', 'post', 'delete', 'put', 'patch'].includes(m)) continue;
    const r = { key: `${m.toUpperCase()} ${path}`, method: m.toUpperCase(), path, tag: op.tags?.[0] || '', summary: op.summary || '' };
    const ptOp = ptSpec?.paths?.[path]?.[m];
    if (ptOp) { r.sumPt = ptOp.summary || ''; r.tagPt = ptOp.tags?.[0] || ''; }
    if (op.deprecated) r.deprecated = 1;
    if (op.description) r.desc = op.description.replace(/\s+/g, ' ').trim().slice(0, 400);
    r.pathParams = [...path.matchAll(/:(\w+)/g)].map((x) => x[1]);
    const q = (deref(op.parameters) || []).filter((p) => p?.in === 'query');
    r.query = q.map((p) => {
      const s = flat(p.schema || {});
      const t = Array.isArray(s.type) ? s.type[0] : s.type;
      const d = { n: p.name, t: t === 'array' || t === 'guid' ? 'ids' : t === 'boolean' ? 'boolean' : t === 'integer' ? 'integer' : s.format === 'date' ? 'date' : s.enum ? 'enum' : 'string' };
      if (s.enum) { d.e = s.enum; if (d.t !== 'ids') d.t = 'enum'; }
      if (p.required) d.req = 1;
      if (s.default !== undefined && s.default !== null) d.def = s.default;
      if (p.description) d.d = p.description.replace(/<br\s*\/?>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      return d;
    });
    if (op.requestBody) {
      const rb = deref(op.requestBody);
      const ct = Object.keys(rb.content || {})[0];
      const fs = fieldsOf(rb.content[ct].schema);
      for (const k of Object.keys(fs)) if (fs[k].ro || fs[k].dep) delete fs[k];
      r.body = { ct, fields: fs };
    }
    const res = deref(op.responses?.['200'] || op.responses?.['201']);
    const sch = res?.content ? flat(Object.values(res.content)[0].schema) : null;
    if (sch && sch.properties) {
      const P = sch.properties;
      if (P.data) {
        const d = flat(P.data);
        if (d.type === 'array' || d.items) { r.res = { mode: 'list', fields: fieldsOf(d.items || {}) }; if (d.items && !flat(d.items).properties) r.res.scalar = 1; }
        else r.res = { mode: 'object', fields: fieldsOf(d) };
        if (d.nullable) r.res.nullable = 1;
      } else r.res = { mode: 'raw', fields: fieldsOf(sch) };
      if (P.has_next_page) r.res.paged = 1;
      if (P.totals || P.total || P.total_rows) r.res.totals = 1;
    } else r.res = { mode: 'none' };
    routes.push(r);
  }
}
const out = `// GENERATED by scripts/gen-routes.mjs from the OpenAPI spec embedded in https://api-docs.rabbiit.com/ (EN; PT page is structurally identical).
// Spec version ${spec.info?.version} — ${routes.length} operations. Do not edit by hand; regenerate instead.
export const ROUTES = ${JSON.stringify(Object.fromEntries(routes.map((r) => [r.key, r])))};
`;
writeFileSync(process.argv[3] || 'server/spec/routes.mjs', out);
console.log(`wrote ${routes.length} routes`);
