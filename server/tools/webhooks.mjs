// Area: Webhooks (subscriptions, event types, deliveries).
import { fromRoute } from '../build.mjs';
import { ToolError, request } from '../lib.mjs';
import { sameId } from './guards.mjs';
const T = (key, cfg) => fromRoute(key, { area: 'Webhooks', ...cfg });

const mask = (o) => (o && typeof o === 'object' && o.secret ? { ...o, secret: '[hidden: only returned on create or regenerate_secret]' } : o);
async function eventTypes() {
  const r = await request('GET', '/webhook-subscriptions/event-types');
  const rows = Array.isArray(r.json) ? r.json : r.json?.data;
  if (!Array.isArray(rows)) throw new ToolError('Unexpected response shape from GET /webhook-subscriptions/event-types');
  return rows.map((x) => (typeof x === 'string' ? x : x?.name ?? x?.event_type ?? x?.id)).filter(Boolean).map(String);
}
function checkUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw new ToolError('"url" must be a valid URL. No request was sent.'); }
  if (u.protocol !== 'https:') throw new ToolError('"url" must use https://. No request was sent.');
}
async function checkEvents(list) {
  if (!Array.isArray(list) || !list.length) throw new ToolError('"event_types" must be a non-empty array. No write request was sent.');
  const known = await eventTypes();
  const bad = list.filter((e) => !known.includes(e));
  if (bad.length) throw new ToolError(`Unknown event type(s): ${bad.join(', ')}. Valid: ${known.join(', ')}. No write request was sent.`);
}
const evArg = { event_types: { type: 'strArray', in: 'body', description: 'Event type names from list_webhook_event_types' } };

export const WEBHOOK_TOOLS = [
  T('GET /webhook-subscriptions/event-types', { name: 'list_webhook_event_types' }),
  T('GET /webhook-subscriptions', { name: 'list_webhook_subscriptions', postShape: mask, note: 'Signing secrets are hidden in this listing.' }),
  T('POST /webhook-subscriptions', {
    name: 'create_webhook_subscription',
    args: { ...evArg, event_types: { ...evArg.event_types, required: true } },
    summary: 'Create a webhook subscription. url must be https; event_types are validated against list_webhook_event_types. Deliveries are signed with HMAC-SHA256 in X-Signature; the signing secret is returned only in this response — store it safely and never paste it in chat logs',
    pre: async (v) => { checkUrl(v.url); await checkEvents(v.event_types); },
    finalize: (out) => (out.sent?.secret ? { ...out, sent: { ...out.sent, secret: '[hidden]' } } : out),
  }),
  T('POST /webhook-subscriptions/:webhookSubscriptionId', {
    name: 'update_webhook_subscription',
    args: evArg,
    summary: 'Edit a webhook subscription (name, url, event_types, enabled). regenerate_secret=true issues a new signing secret (the old one stops validating) and returns it once',
    before: { path: () => '/webhook-subscriptions', find: (row, v) => sameId(row.id, v.webhookSubscriptionId), missing: (v) => `Webhook subscription ${v.webhookSubscriptionId} not found; no request was sent.` },
    pre: async (v) => { if (v.url !== undefined) checkUrl(v.url); if (v.event_types !== undefined) await checkEvents(v.event_types); },
    finalize: (out, v) => {
      if (out.sent?.secret) out.sent = { ...out.sent, secret: '[hidden]' };
      if (out.changed) out.changed = out.changed.map((c) => (c.field === 'secret' ? { field: 'secret', before: '[hidden]', after: v.regenerate_secret || v.secret ? '[new secret — see item.secret]' : '[hidden]' } : c));
      if (!v.regenerate_secret && !v.secret) out.item = mask(out.item);
      return out;
    },
  }),
  T('DELETE /webhook-subscriptions/:webhookSubscriptionId', { name: 'delete_webhook_subscription', postShape: mask, before: { path: () => '/webhook-subscriptions', find: (row, v) => sameId(row.id, v.webhookSubscriptionId), missing: (v) => `Webhook subscription ${v.webhookSubscriptionId} not found; no request was sent.` } }),
  T('GET /webhook-deliveries', { name: 'list_webhook_deliveries' }),
];
