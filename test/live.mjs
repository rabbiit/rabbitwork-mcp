// LIVE read-only proof: ONE request to GET /reports/detailed (last 7 days, limit 5, maxPages 1).
// Prints only counts, field names and type checks. Never prints the token or entry contents.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv.includes('--yes-live')) { console.log('Refusing: this makes ONE live read-only request. Run with --yes-live only after the owner approves.'); process.exit(2); }
const token = process.env.RABBITWORK_API_TOKEN;
if (!token) { console.log('SKIP: RABBITWORK_API_TOKEN not set'); process.exit(2); }
const redact = (s) => String(s).split(token).join('[REDACTED]');
const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const proc = spawn('node', ['server/index.mjs'], { cwd: root, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
proc.stderr.on('data', () => {}); // swallow (could contain env-derived text)
let buf = '';
const send = (o) => proc.stdin.write(JSON.stringify(o) + '\n');
proc.stdout.on('data', (c) => {
  buf += c; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    if (m.id === 1) { send({ jsonrpc: '2.0', method: 'notifications/initialized' }); send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_time_entries', arguments: { from: d(7), to: d(0), limit: 5, maxPages: 1 } } }); }
    if (m.id === 2) {
      const r = m.result;
      if (r.isError) { console.log('LIVE ERROR:', redact(r.content[0].text)); proc.kill(); process.exit(1); }
      const o = r.structuredContent; const types = { id: 'number', date: 'string', person: 'string', project: 'string', durationMinutes: 'number', description: 'string', billable: 'boolean', invoiced: 'boolean' };
      const bad = o.entries.flatMap((e, i) => Object.entries(types).filter(([k, t]) => e[k] !== null && typeof e[k] !== t).map(([k]) => `${i}.${k}`));
      console.log(JSON.stringify({ range: `${d(7)}..${d(0)}`, count: o.count, pagesFetched: o.pagesFetched, hasMore: o.hasMore, fieldNames: o.entries[0] ? Object.keys(o.entries[0]) : [], typeMismatches: bad, apiTotalsKeys: o.apiTotals ? Object.keys(o.apiTotals) : [], dailyRateLimitHeaderPresent: !!o.accountDailyRateLimit }, null, 2));
      proc.kill(); process.exit(bad.length ? 1 : 0);
    }
  }
});
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'live-proof', version: '0' } } });
