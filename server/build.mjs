// Generic tool builder over the fixed route table (server/spec/routes.mjs).
import { ROUTES } from './spec/routes.mjs';
import { shapeFrom, diff, camel } from './normalize.mjs';
import { request, paged, unwrap, schemaOf, validate, ToolError } from './lib.mjs';

export const KIND_TEXT = {
  READ: 'READ.',
  WRITE: 'WRITE (changes live data — confirm with the user first).',
  DESTRUCTIVE: 'DESTRUCTIVE — confirm explicitly with the user first; the server asks the user on an approval card (MCP elicitation) when the client supports it, otherwise requires confirm: true.',
};
export const route = (key) => { const r = ROUTES[key]; if (!r) throw new Error(`route not in spec: ${key}`); return r; };
export const shapeOf = (key) => shapeFrom(route(key).res?.fields || {});

function bodyType(d) {
  if (d.f === 'binary') return 'filePath';
  if (d.e && d.t !== 'array') return 'enum';
  if (d.t === 'integer') return 'integer';
  if (d.t === 'number') return 'number';
  if (d.t === 'boolean') return 'boolean';
  if (d.t === 'array') return d.it === 'integer' ? 'intArray' : d.it === 'string' ? 'strArray' : 'array';
  if (d.t === 'object') return 'object';
  if (d.t === 'string') return d.f === 'date' ? 'date' : d.f === 'uri' ? 'url' : 'string';
  return 'any';
}
const queryType = (q) => (q.t === 'enum' ? 'enum' : q.t === 'ids' ? 'ids' : q.t === 'boolean' ? 'boolean' : q.t === 'integer' ? 'integer' : q.t === 'date' ? 'date' : 'string');

export function autoOp(r) {
  if (r.method === 'GET') return 'read';
  if (r.method === 'DELETE') return 'destructive';
  const last = r.path.split('/').pop();
  if (last.startsWith(':')) return 'edit';
  return r.body ? 'create' : 'action';
}

/** Path for GET of the same resource (for read-before), if documented. */
function getTwin(r) {
  if (ROUTES[`GET ${r.path}`] && r.method !== 'GET') return ROUTES[`GET ${r.path}`];
  return null;
}

export function argsFor(r, op, cfg = {}) {
  const args = {};
  for (const p of r.pathParams) args[p] = { type: 'pathId', required: true, in: 'path' };
  for (const q of r.query) {
    if (q.n.includes('{')) continue; // dynamic custom_fields.{id} filters: not exposed (see README)
    const a = { type: queryType(q), in: 'query', required: !!q.req };
    if (q.e) a.values = q.e;
    if (q.d) a.description = q.d;
    if (q.n === 'opt_page_limit') Object.assign(a, { type: 'integer', min: 1, max: 100 });
    args[q.n] = a;
  }
  if (r.res?.paged && op === 'read') args.maxPages = { type: 'integer', min: 1, max: 20, in: 'none', description: 'Pages to fetch (default 1); each page costs one request' };
  for (const [f, d] of Object.entries(r.body?.fields || {})) {
    const a = { type: bodyType(d), in: 'body', required: op === 'create' && !!d.req }; // edit/action: spec 'required' ignored (create-only)
    if (d.e) a.values = d.e;
    if (d.t === 'integer' && d.e) a.type = 'enum';
    args[f] = a;
  }
  if (op === 'destructive' || cfg.kind === 'DESTRUCTIVE') {
    args.confirm = { type: 'boolean', in: 'none', description: 'Fallback only: must be true (after the user explicitly confirmed) when the MCP client cannot show an approval card. Ignored when the card is shown.' };
    args.reason = { type: 'string', in: 'none', description: 'Optional reason, shown to the user on the approval card' };
  }
  if (cfg.omitAllBody) for (const k of Object.keys(args)) if (args[k].in === 'body') delete args[k];
  for (const k of cfg.omit || []) delete args[k];
  for (const k of cfg.require || []) if (args[k]) args[k].required = true;
  for (const k of cfg.optional || []) if (args[k]) args[k].required = false;
  Object.assign(args, cfg.args || {});
  return args;
}

export { queryOf };
export const APPROVAL_SCHEMA = {
  type: 'object',
  properties: { approve: { type: 'string', title: 'Decisão', description: 'Aprovar ou recusar esta exclusão', enum: ['aprovar', 'recusar'], enumNames: ['Aprovar (apagar)', 'Recusar'] } },
  required: ['approve'],
};
const NAME_KEYS = ['name', 'title', 'user_name', 'task_name', 'description', 'content', 'holiday_date', 'email', 'url', 'type'];
/** Build the pt-BR approval card text from the route, path IDs, read-before snapshot, body and reason. */
export function approvalCard({ r, v, args, before, body, name }) {
  const ids = r.pathParams.map((p) => `${p}=${v[p]}`);
  const q = Object.entries(args).filter(([k, a]) => a.in === 'query' && v[k] !== undefined).map(([k]) => `${k}=${v[k]}`);
  let label = null;
  if (before && typeof before === 'object') for (const k of NAME_KEYS) if (before[k] !== undefined && before[k] !== null && String(before[k]).trim()) { label = String(before[k]).slice(0, 120); break; }
  const extra = body && typeof body === 'object' && !(typeof FormData !== 'undefined' && body instanceof FormData) && Object.keys(body).length ? JSON.stringify(body).slice(0, 300) : null;
  const target = { recurso: r.tagPt || r.tag, nome: label, id: [...ids, ...q].join(', ') || null, rota: `${r.method} ${r.path}` };
  const lines = [
    `Aprovar ação DESTRUTIVA no Rabbitwork: ${r.sumPt || r.summary}?`,
    `Recurso: ${target.recurso}`,
    `Nome: ${label ?? '(não disponível)'}`,
    `ID: ${target.id ?? '(nenhum)'}`,
    ...(extra ? [`Itens: ${extra}`] : []),
    ...(v.reason ? [`Motivo: ${String(v.reason).slice(0, 500)}`] : []),
    `Ferramenta: ${name} (${r.method} ${r.path})`,
    'Essa ação muda dados reais e pode não ter volta.',
  ];
  return { message: lines.join('\n'), target };
}
const isActive = (a) => a === true || a === 1 || a === '1' || a === 'true';
export const pathOf = (r, v) => r.path.replace(/:(\w+)/g, (_, p) => encodeURIComponent(String(v[p])));
function queryOf(args, v) {
  const q = {};
  for (const [k, a] of Object.entries(args)) if (a.in === 'query' && v[k] !== undefined) q[k] = String(v[k]);
  return q;
}
function bodyOf(args, v) {
  const b = {};
  for (const [k, a] of Object.entries(args)) if (a.in === 'body' && v[k] !== undefined) b[k] = v[k];
  return b;
}

/**
 * Build one MCP tool from a route.
 * cfg: { name, kind?, op?, summary?, note?, args?, omit?, require?, optional?, before?: false | {key, path(v), query(v), find(row,v)},
 *        pre?(v, ctx), body?(v, ctx) -> body, shape?, run? (full override), postShape?(obj) }
 */
export function fromRoute(key, cfg) {
  const r = route(key);
  const op = cfg.op || autoOp(r);
  const kind = cfg.kind || (op === 'read' ? 'READ' : op === 'destructive' ? 'DESTRUCTIVE' : 'WRITE');
  const args = argsFor(r, op, { ...cfg, kind });
  const twin = getTwin(r);
  const shapeFn = cfg.shape || shapeFrom((twin && op !== 'read' ? { ...r.res?.fields, ...twin.res?.fields } : r.res?.fields) || {});
  const post = cfg.postShape || ((x) => x);
  const norm = (x) => (x === null || x === undefined ? null : post(shapeFn(x)));
  const summary = cfg.summary || r.summary;
  const act = cfg.active; // active-by-default filtering for list tools: 'query' | 'local' | 'archivedUsers'
  if (act) {
    if (act === 'query') delete args.active;
    if (act === 'archivedUsers') delete args.include_archived_users;
    args.active = { type: 'tri', in: 'none', description: 'Default true = only active items. false = only inactive/archived. "all" = no filter.' };
  }
  const ACT_NOTE = {
    query: 'Returns ONLY ACTIVE items by default (sends active=1); pass active:false for archived (active=0) or active:"all" for no filter.',
    local: 'Returns ONLY ACTIVE items by default; the route has no active filter, so items are filtered locally on their "active" field. Pass active:false for inactive only or active:"all" for everything.',
    archivedUsers: 'Returns ONLY ACTIVE users by default (sends include_archived_users=false); active:"all" sends include_archived_users=true; active:false sends include_archived_users=true and keeps only archived users locally.',
  };
  const description = `${KIND_TEXT[kind]} ${summary.replace(/\.?$/, '.')}${act ? ` ${ACT_NOTE[act]}` : ''}${cfg.note ? ` ${cfg.note}` : ''} Route: ${r.method} ${r.path}.`;

  async function readBefore(v) {
    if (cfg.before === false) return null;
    if (cfg.before) {
      const b = cfg.before;
      const res = await request('GET', b.path(v), { query: b.query ? b.query(v) : undefined });
      const rows = Array.isArray(res.json) ? res.json : res.json?.data;
      if (b.find) {
        const row = (Array.isArray(rows) ? rows : []).find((x) => b.find(x, v));
        if (!row && b.required !== false) throw new ToolError(b.missing ? b.missing(v) : `Record not found via ${b.path(v)}; no write request was sent.`);
        return row || null;
      }
      return unwrap(res.json);
    }
    if (twin && op !== 'create') {
      try {
        const res = await request('GET', pathOf(twin, v));
        return unwrap(res.json);
      } catch (e) {
        if (cfg.beforeOptional && e.status === 404) return null;
        throw e;
      }
    }
    return null;
  }

  async function run(v, mcp) {
    if (cfg.run) return cfg.run(v, { r, args, norm });
    const path = pathOf(r, v);
    if (op === 'read') {
      const query = queryOf(args, v);
      const want = act ? (v.active === undefined ? true : v.active) : 'all'; // true | false | 'all'
      if (act === 'query' && want !== 'all') query.active = want ? '1' : '0';
      if (act === 'archivedUsers') query.include_archived_users = want === true ? 'false' : 'true';
      const localFilter = (act === 'local' || (act === 'archivedUsers' && want === false)) && want !== 'all';
      const keep = (rows) => (localFilter ? rows.filter((x) => isActive(x?.active) === want) : rows);
      if (r.res?.paged) {
        const pr = await paged(path, query, Math.min(20, Math.max(1, v.maxPages ?? 1)));
        const rowsP = keep(pr.rows);
        return { items: rowsP.map((x) => (r.res.scalar ? x : norm(x))), count: rowsP.length, ...(act ? { activeFilter: want } : {}), pagesFetched: pr.pages, hasMore: pr.hasNext, totals: pr.totals ?? undefined, accountDailyRateLimit: pr.rateLimit };
      }
      const res = await request('GET', path, { query });
      if (r.res?.mode === 'list') {
        const rows = Array.isArray(res.json) ? res.json : res.json?.data;
        if (!Array.isArray(rows)) throw new ToolError(`Unexpected response shape from GET ${path}`);
        const kept = keep(rows);
        return { items: kept.map((x) => (r.res.scalar ? x : norm(x))), count: kept.length, ...(act ? { activeFilter: want } : {}), ...(localFilter ? { filteredLocally: rows.length - kept.length } : {}) };
      }
      if (r.res?.mode === 'raw') return { item: norm(res.json) };
      return { item: norm(unwrap(res.json)) };
    }
    const useCard = op === 'destructive' && !!mcp?.canElicit;
    if (op === 'destructive' && !useCard && v.confirm !== true) {
      throw new ToolError(`Refused: ${cfg.name} is DESTRUCTIVE (${r.method} ${r.path}). Ask the user to confirm explicitly, then call again with confirm: true. No request was sent.`);
    }
    let body = cfg.body ? null : bodyOf(args, v);
    if (op === 'edit' && !cfg.body && !Object.keys(body).length) throw new ToolError('Nothing to update: pass at least one field to change.');
    const ctx = { v, path, r };
    ctx.before = await readBefore(v);
    // Edits send ONLY the fields the caller passed (confirmed by the API author: spec "required" applies to
    // create only; omitted fields stay unchanged). The read-before record is used for diffs/guards, never for the body.
    if (cfg.pre) await cfg.pre(v, ctx);
    if (cfg.body) body = await cfg.body(v, ctx);
    if (useCard) {
      // Approval card via MCP elicitation. confirm:true does NOT bypass it when the client supports elicitation.
      const card = approvalCard({ r, v, args, before: ctx.before, body, name: cfg.name });
      let decision;
      try {
        decision = await mcp.elicit({ message: card.message, requestedSchema: APPROVAL_SCHEMA });
      } catch (e) {
        decision = { action: 'cancel', error: e.message };
      }
      const approved = decision?.action === 'accept' && decision?.content?.approve === 'aprovar';
      if (!approved) {
        const why = decision?.timedOut ? 'sem resposta no prazo (tratado como cancelado)' : decision?.action === 'accept' ? 'opção "recusar"' : decision?.action === 'decline' ? 'recusado no cartão' : 'cancelado';
        return { done: false, refused: true, message: `Recusado pelo usuário, nada foi apagado (${why}).`, action: decision?.action ?? 'cancel', target: card.target };
      }
    }
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const sendBody = !body || (!isForm && !Object.keys(body).length) ? undefined : body;
    const query = queryOf(args, v);
    const res = await request(r.method, path, { query, body: sendBody });
    const sent = isForm ? cfg.sentLabel?.(v) ?? '(multipart)' : sendBody ?? null;
    const fin = (o) => (cfg.finalize ? cfg.finalize(o, v) : o);
    if (op === 'destructive') return fin({ done: true, ...(useCard ? { approvedVia: 'elicitation' } : { approvedVia: 'confirm' }), deleted: norm(ctx.before), response: res.json ?? null, sent, ...(Object.keys(query).length ? { query } : {}) });
    let afterRaw = res.json && typeof res.json === 'object' && !Array.isArray(res.json) ? unwrap(res.json) : null;
    if ((!afterRaw || typeof afterRaw !== 'object' || Array.isArray(afterRaw)) && twin && op !== 'create') afterRaw = unwrap((await request('GET', pathOf(twin, v))).json);
    const item = norm(afterRaw);
    const out = { item, sent };
    if (ctx.before) { const present = new Set(Object.keys(afterRaw || {}).map(camel)); out.changed = diff(norm(ctx.before), item || {}).filter((c) => present.has(c.field)); }
    return fin(out);
  }

  return { name: cfg.name, description, inputSchema: schemaOf(args), handler: (a, mcp) => run(validate(a, args), mcp), route: `${r.method} ${r.path}`, kind, area: cfg.area };
}
