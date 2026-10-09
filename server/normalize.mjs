// TimeEntry data shape + normalizer.
// Source fields: "timeEntry" object of GET /reports/detailed
// (components.schemas.reports.detailedReport.responses.timeEntry at https://api-docs.rabbiit.com/).

/**
 * @typedef {Object} TimeEntry
 * @property {number|null} id              <- id
 * @property {string|null} date            <- date_execution (YYYY-MM-DD)
 * @property {string|null} person          <- user_name
 * @property {number|null} personId        <- user_id
 * @property {string|null} project         <- project_name
 * @property {number|null} projectId       <- project_id
 * @property {string|null} customer        <- customer_name
 * @property {string|null} activity        <- task_name (todo_name appended when present)
 * @property {number|null} durationMinutes <- time_total ("HH:mm:ss", hours may exceed 24)
 * @property {string}      description     <- description
 * @property {boolean}     billable        <- is_billable (bool or 0/1)
 * @property {boolean}     invoiced        <- is_invoiced (bool or 0/1)
 */

export function parseDurationMinutes(v) {
  if (v == null || v === '') return null;
  const m = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(String(v).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + Math.round(Number(m[3] || 0) / 60);
}

const toBool = (v) => v === true || v === 1 || v === '1' || v === 'true';
const str = (v) => (v == null || v === '' ? null : String(v));
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** @returns {TimeEntry} */
export function normalizeTimeEntry(raw = {}) {
  const task = str(raw.task_name);
  const todo = str(raw.todo_name);
  return {
    id: num(raw.id),
    date: str(raw.date_execution),
    person: str(raw.user_name),
    personId: num(raw.user_id),
    project: str(raw.project_name),
    projectId: num(raw.project_id),
    customer: str(raw.customer_name),
    activity: task && todo ? `${task} / ${todo}` : task ?? todo,
    durationMinutes: parseDurationMinutes(raw.time_total),
    description: raw.description == null ? '' : String(raw.description),
    billable: toBool(raw.is_billable),
    invoiced: toBool(raw.is_invoiced),
  };
}

/** Field-level diff between two normalized objects: [{field, before, after}]. */
export function diff(before, after, ignore = []) {
  const out = [];
  for (const k of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
    if (ignore.includes(k)) continue;
    if (JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])) out.push({ field: k, before: before?.[k] ?? null, after: after?.[k] ?? null });
  }
  return out;
}

// ---- Generic spec-derived shapes (v0.2) ----
// Every resource shape is derived from the response schema of its route in the updated spec:
// keys are the documented, non-deprecated, non-write-only fields, converted to camelCase; values are coerced by the
// documented type (integer/number: numeric strings -> numbers; boolean: 0/1/"1"/"true" -> boolean; others as-is).
// Undocumented fields are dropped.
export const camel = (k) => k.replace(/[_.-]+([a-z0-9])/g, (_, c) => c.toUpperCase());
function coerce(v, d) {
  if (v === undefined || v === null) return null;
  if (d.t === 'integer' || d.t === 'number') return typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
  if (d.t === 'boolean') return v === true || v === 1 || v === '1' || v === 'true' ? true : v === false || v === 0 || v === '0' || v === 'false' ? false : v;
  return v;
}
export function shapeFrom(fields = {}) {
  const entries = Object.entries(fields).filter(([, d]) => !d.dep && !d.wo);
  return (raw) => {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const o = {};
    for (const [k, d] of entries) o[camel(k)] = coerce(raw[k], d);
    return o;
  };
}
