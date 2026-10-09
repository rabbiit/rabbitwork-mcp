// Area: Time Entries, Reports, Timesheet Approvals.
import { fromRoute } from '../build.mjs';
import { normalizeTimeEntry } from '../normalize.mjs';
import { ToolError, paged, validate, schemaOf } from '../lib.mjs';
const T = (key, cfg) => fromRoute(key, { area: 'Time', ...cfg });

const isLocked = (raw) => raw && (raw.is_locked === true || raw.is_locked === 1 || raw.is_locked === '1');
const lockGuard = (v, ctx) => {
  if (isLocked(ctx.before)) throw new ToolError(`Time entry ${v.timeEntryId} is locked${ctx.before.locked_reason ? ` (${ctx.before.locked_reason})` : ''}; it cannot be changed. No write request was sent.`);
};
const entryBefore = { path: (v) => `/time-entries/${v.timeEntryId}` };

// Curated TimeEntry list (stable core shape) over GET /reports/detailed.
const LTE_ARGS = {
  from: { type: 'date', description: 'Start date YYYY-MM-DD (date_execution_start)' },
  to: { type: 'date', description: 'End date YYYY-MM-DD (date_execution_end)' },
  project: { type: 'ids', description: 'Project ID(s)' },
  person: { type: 'ids', description: 'User ID(s)' },
  customer: { type: 'ids', description: 'Customer ID(s)' },
  billable: { type: 'boolean', description: 'Keep only billable (true) or non-billable (false) entries (filtered locally)' },
  invoiced: { type: 'boolean', description: 'Invoiced filter (sent to the API as is_invoiced)' },
  limit: { type: 'integer', min: 1, max: 100, description: 'Page size (default 50)' },
  maxPages: { type: 'integer', min: 1, max: 20, description: 'Pages to fetch (default 1)' },
};
const listTimeEntries = {
  name: 'list_time_entries', area: 'Time', kind: 'READ', route: 'GET /reports/detailed',
  description: 'READ. List time entries in the stable TimeEntry shape {id,date,person,personId,project,projectId,customer,activity,durationMinutes,description,billable,invoiced}. Use get_detailed_report for every filter and the full record. Route: GET /reports/detailed.',
  inputSchema: schemaOf(LTE_ARGS),
  handler: async (a) => {
    const v = validate(a, LTE_ARGS);
    const q = { opt_page_limit: String(v.limit ?? 50) };
    if (v.from) q.date_execution_start = v.from;
    if (v.to) q.date_execution_end = v.to;
    if (v.project) q.project_id = v.project;
    if (v.person) q.user_id = v.person;
    if (v.customer) q.customer_id = v.customer;
    if (v.invoiced !== undefined) q.is_invoiced = String(v.invoiced);
    const r = await paged('/reports/detailed', q, v.maxPages ?? 1);
    let entries = r.rows.map(normalizeTimeEntry);
    if (v.billable !== undefined) entries = entries.filter((e) => e.billable === v.billable);
    if (v.invoiced !== undefined) entries = entries.filter((e) => e.invoiced === v.invoiced);
    return { entries, count: entries.length, totalMinutes: entries.reduce((s, e) => s + (e.durationMinutes || 0), 0), pagesFetched: r.pages, hasMore: r.hasNext, apiTotals: r.totals, accountDailyRateLimit: r.rateLimit };
  },
};

export const TIME_TOOLS = [
  listTimeEntries,
  T('GET /reports/detailed', { name: 'get_detailed_report', summary: 'Detailed report: time entries with every documented filter and the full record shape', area: 'Reports' }),
  T('GET /reports/summary-groups', { name: 'get_summary_report', area: 'Reports' }),

  T('POST /time-entries', { name: 'create_time_entry' }),
  T('GET /time-entries/current', { name: 'get_current_timer' }),
  T('GET /time-entries/:timeEntryId', { name: 'get_time_entry' }),
  T('POST /time-entries/:timeEntryId', { name: 'update_time_entry', pre: lockGuard, summary: 'Edit a time entry (send only the fields to change). Refuses locked entries' }),
  T('DELETE /time-entries/:timeEntryId', { name: 'delete_time_entry', pre: lockGuard }),
  T('POST /time-entries/:timeEntryId/start', { name: 'start_stopwatch', before: entryBefore, pre: lockGuard }),
  T('POST /time-entries/:timeEntryId/stop', { name: 'stop_stopwatch', before: entryBefore, pre: lockGuard }),

  T('GET /timesheet-approvals', { name: 'list_timesheet_approvals', area: 'Timesheet Approvals' }),
  T('GET /timesheet-approvals/:timesheetApprovalId', { name: 'get_timesheet_approval', area: 'Timesheet Approvals' }),
  T('POST /timesheet-approvals/submit', { name: 'submit_timesheet', area: 'Timesheet Approvals', summary: 'Submit a weekly timesheet (period_start..period_end, optionally for user_id) for approval' }),
  T('POST /timesheet-approvals/:timesheetApprovalId/approve', { name: 'approve_timesheet', area: 'Timesheet Approvals', before: { path: (v) => `/timesheet-approvals/${v.timesheetApprovalId}` }, summary: 'Approve a submitted timesheet (approver/admin)' }),
  T('POST /timesheet-approvals/:timesheetApprovalId/reject', { name: 'reject_timesheet', area: 'Timesheet Approvals', require: ['comment'], before: { path: (v) => `/timesheet-approvals/${v.timesheetApprovalId}` }, summary: 'Reject a submitted timesheet with a mandatory comment explaining why' }),
  T('POST /timesheet-approvals/:timesheetApprovalId/undo-approve', { name: 'undo_timesheet_approval', area: 'Timesheet Approvals', before: { path: (v) => `/timesheet-approvals/${v.timesheetApprovalId}` }, summary: 'Undo an approval (back to submitted)' }),
  T('POST /timesheet-approvals/:timesheetApprovalId/undo-submit', { name: 'undo_timesheet_submission', area: 'Timesheet Approvals', before: { path: (v) => `/timesheet-approvals/${v.timesheetApprovalId}` }, summary: 'Withdraw a submission (back to open/editable)' }),
  T('POST /timesheet-approvals/:timesheetApprovalId/update-approver', { name: 'change_timesheet_approver', area: 'Timesheet Approvals', before: { path: (v) => `/timesheet-approvals/${v.timesheetApprovalId}` }, summary: 'Change who approves this timesheet (approver_user_id)' }),
];
