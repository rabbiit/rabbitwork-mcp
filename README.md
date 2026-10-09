# Rabbitwork MCP — Agent Plugin

<img src="assets/logo.svg" width="72" alt="Rabbitwork logo" align="right">

Use **[Rabbitwork](https://rabbitwork.io)** (formerly Rabbiit) time tracking from AI agents such as Cursor: log and review hours, run the stopwatch, pull reports, submit and approve timesheets, and manage projects, members, to-dos, customers, users, teams, custom fields, rates, calendars and webhooks.

- **133 tools covering the entire official API v1** ([api-docs.rabbiit.com](https://api-docs.rabbiit.com/)): 51 read, 57 write, 25 destructive.
- **Safe by default:** lists return only active items; every delete asks for your approval on a card; edits send only the fields you change and report a before/after diff.
- **Zero dependencies:** a small Node.js (18+) MCP server over stdio plus an agent skill. No npm install, no build step.

> Rabbiit is becoming **Rabbitwork** (rabbitwork.io). The API host is still `app.rabbiit.com`, and the plugin uses it by default.

*Português:* plugin de agente para o Rabbitwork (antigo Rabbiit): lançar e consultar horas, cronômetro, relatórios, aprovação de timesheets, projetos, membros, to-dos, clientes, usuários, equipes, campos personalizados, valores/hora, calendários e webhooks. Listas trazem só itens ativos por padrão e toda exclusão pede aprovação num cartão.

## Install

**Cursor Marketplace** *(once the listing is approved)*: open **Customize**, search for "Rabbitwork", select **Install**.

**Manually / local test:** copy or clone this repository into `~/.cursor/plugins/local/rabbitwork`, then run **Developer: Reload Window**. Cursor loads `.cursor-plugin/plugin.json`. Other Agent Plugins clients load the root `plugin.json` + `mcp.json`.

Requirements: Node.js 18 or newer on the machine running the agent.

## Setup: API token

1. In Rabbitwork, open **Settings > You > My tokens** (*Configurações > Você > Meus tokens*) and create a personal token. It acts with your user's permissions. Personal tokens don't expire from inactivity and aren't tied to a device.
2. In Cursor, open the plugin's **Configure** and set **`RABBITWORK_API_TOKEN`** (secret). Optional: `RABBITWORK_API_BASE_URL` (default `https://app.rabbiit.com/api/v1`).

The token is only sent as the `x-api-token` header to the API. It is never written to disk or logs, and it's masked (`[REDACTED]`) if an API error echoes it. Without a token every tool fails with a setup message and sends nothing. Rate limits: 600 requests/min per token plus an account-wide daily quota.

## Usage

Ask in natural language. The bundled skill (`skills/rabbitwork-timesheets`) teaches the agent which tool to use.

- "How many hours did Ana log on the Website project last week?"
- "Start the timer on entry 812" / "What's running right now?"
- "Submit my timesheet for Oct 5–11" / "Approve Bruno's timesheet"
- "Make project Atlas billable at 150/h and show what changed"
- "List archived customers" (`active: false`) / "List all users, including archived" (`active: "all"`)
- "Delete the duplicate customer ACME (id 31)" → an approval card shows recurso, nome, id and motivo; nothing is deleted unless you approve.

### Tool groups

| Area | Tools |
|---|---|
| Time entries & stopwatch | list/get/create/update/delete time entries, current timer, start/stop |
| Reports | `list_time_entries` (compact), detailed report, summary report |
| Timesheet approvals | list, get, submit, approve, reject, undo approval, undo submission, change approver |
| Projects | projects, members, available users, project tasks (add, edit, check/uncheck, remove) |
| To-dos | to-do lists, to-dos (trash + restore), tags, comments |
| Customers & tasks | customers, account task catalog |
| Users & teams | users (create, edit, archive, delete), profile photo, user projects, assignments, allocations (vacation/leave), calendar history, teams and team members |
| Settings | custom fields + options + per-project settings, rates, calendars and holidays |
| Webhooks | event types, subscriptions (https only, HMAC-signed), deliveries |

The full list is in [Tools by area](#tools-by-area).

## Safety model

| Kind | Description prefix | Behaviour |
|---|---|---|
| READ | `READ.` | GET only. Spends quota (600 req/min/token, account daily limit). Paged lists fetch 1 page unless `maxPages` (≤ 20). |
| WRITE | `WRITE (changes live data — confirm with the user first).` | One write request. Edits read the record first and return `changed` [{field,before,after}] and `sent` (exact body). |
| DESTRUCTIVE | `DESTRUCTIVE — confirm explicitly with the user first; the server asks the user on an approval card (MCP elicitation) when the client supports it, otherwise requires confirm: true.` | All 24 `DELETE` routes + `POST /users/:userId/remove-assignments`. Approval card first (see below); on clients without elicitation, `confirm: true` is required, otherwise the tool refuses **before any request**. When a record can be read first, the result includes the `deleted` snapshot. |

MCP annotations mirror this (`readOnlyHint`, `destructiveHint`).

**Approval card for destructive tools (MCP elicitation, spec 2025-06-18).** On `initialize` the server records whether the client declared the `elicitation` capability. If it did, every destructive call:
1. resolves the target first (read-before GET / list-and-find, plus the usual guards — locked entry, not a member, etc. refuse here, before any card);
2. sends a server→client request `elicitation/create` with a pt-BR message (action, **Recurso**, **Nome**, **ID** — path IDs and scope query —, items being removed when there is no snapshot, and **Motivo** if the caller passed the optional `reason` argument) and `requestedSchema` `{approve: enum ["aprovar","recusar"]}` (required);
3. sends the DELETE only if the reply is `action: "accept"` with `approve: "aprovar"`. `decline`, `cancel`, `recusar`, a JSON-RPC error from the client, or no answer within 10 minutes (treated as cancel) → `{done: false, refused: true, message: "Recusado pelo usuário, nada foi apagado (…)"}` and **zero DELETE requests**.

When the client supports elicitation, `confirm: true` does **not** bypass the card. Clients without elicitation fall back to the previous rule: `confirm: true` required, otherwise refuse with zero requests. The card itself is rendered by the MCP client (e.g. Cursor); the server only sends the request. Successful results report `approvedVia: "elicitation" | "confirm"`. Outgoing request ids are `rw-srv-N`; responses are matched through a pending-promise map; `RABBITWORK_ELICIT_TIMEOUT_MS` can shorten the 10-minute timeout (used by tests).

**Edits are partial** (per the updated docs: "send only the attributes you want to change"). **Rule (confirmed by the API author):** fields marked `required` in the spec are required only on CREATE. On update/edit routes every field is optional and any omitted field is left unchanged. So edit tools send **only the fields the caller passed** — nothing is copied from the read-before GET into the body. In edit tools' input schemas only the path IDs are required; at least one field to change must be passed, otherwise the tool refuses without sending a request. Create tools keep the spec's required fields. The read-before GET is kept only for the `changed` diff and safety checks (membership, links, locked entries, already archived, webhook existence).

**Guards (refuse without writing):** `add_project_member` / `add_team_member` (already a member, or not in the available list), `update_project_member` / `remove_project_member` (not a member), `add_project_task` (already linked), `update/remove/check/uncheck_project_task` (not linked), `create_user` (email exists, case-insensitive; invalid email), `archive_user` (already archived; sends only `{"active":0}`), `update_time_entry` / `start_stopwatch` / `stop_stopwatch` / `delete_time_entry` (locked entry), `add/remove_user_assignments` (no IDs), `create/update_webhook_subscription` (non-https URL, unknown event types — validated against `GET /webhook-subscriptions/event-types`), `upload_user_profile_photo` (not PNG/JPEG, missing, > 2 MB, relative path).

**Active-only lists by default.** List tools return only active items unless told otherwise, via an `active` argument: `true` (default) | `false` (only inactive/archived) | `"all"` (no filter).
- API-side `active=1` / `active=0` (documented `active` query filter): `list_projects`, `list_customers`, `list_tasks`, `list_users`, `list_custom_fields`, `list_project_custom_field_settings`.
- API-side documented equivalent: `list_team_members` → `include_archived_users=false` by default; `"all"` sends `include_archived_users=true`; `false` sends `include_archived_users=true` and keeps archived users locally (the API has no archived-only filter).
- Local filter (no documented filter, but items carry `active`): `list_project_members`, `list_project_available_tasks`, `list_user_projects`, `list_user_available_projects`, `list_team_available_users`, `list_custom_field_options`. Results include `filteredLocally` (rows dropped).
- Unchanged (no active concept on the items, or a different meaning): `list_time_entries` / `get_detailed_report` (entries have no active flag; `only_active_projects` stays opt-in so hour totals don't silently drop archived projects), `get_summary_report` (API already defaults to active users; `include_archived_users` still available), `list_todos` (no active field; trash already excluded by default; `only_active_projects` opt-in), `list_todo_lists`, `list_todo_tags`, `list_comments`, `list_teams`, `list_calendars`, `list_holidays`, `list_rates`, `list_user_allocations`, `list_user_calendar_history`, `list_user_assignments`, `list_user_available_assignments`, `list_project_tasks`, `list_project_available_users`, `list_timesheet_approvals` and `list_webhook_deliveries` (their `status` is workflow state, not active/archived), `list_webhook_subscriptions` (`enabled` is a delivery switch, not archiving), `list_webhook_event_types`.

**Webhook secrets:** deliveries are signed with HMAC-SHA256 in `X-Signature`. The secret appears only in the result of `create_webhook_subscription` and of `update_webhook_subscription` with `regenerate_secret: true` (or a new `secret`); listings, diffs and `sent` echoes hide it.

## Data shapes

- **`list_time_entries`** keeps the stable TimeEntry shape: `{id, date, person, personId, project, projectId, customer, activity, durationMinutes, description, billable, invoiced}` (from `GET /reports/detailed`; `activity` = task + " / " + to-do). Output `{entries, count, totalMinutes, pagesFetched, hasMore, apiTotals, accountDailyRateLimit}`.
- **Every other tool** uses a shape derived from its route's response schema in the updated spec: the documented, non-deprecated fields, in camelCase (`is_billable` → `isBillable`), with numeric strings turned into numbers for integer/number fields and `0/1/"1"/"true"` into booleans for boolean fields. Undocumented fields are dropped; nested objects/arrays are passed through.
- Envelopes: lists `{items, count[, pagesFetched, hasMore, totals, accountDailyRateLimit]}`; single records `{item}` (`null` e.g. when no stopwatch runs); writes `{item, sent[, changed]}`; destructive `{done, deleted, response, sent[, query]}`.

## Tools by area

### Time (8)

| Tool | Kind | Route | What it does |
|---|---|---|---|
| `list_time_entries` | READ | `GET /reports/detailed` | List time entries in the stable TimeEntry shape {id,date,person,personId,project,projectId,customer,activity,durationMinutes,description,billable,invoiced}. Use get_detailed_report for every filter and the full record. |
| `create_time_entry` | WRITE | `POST /time-entries` | New Time Entry. |
| `get_current_timer` | READ | `GET /time-entries/current` | Get the active timer. |
| `get_time_entry` | READ | `GET /time-entries/:timeEntryId` | Get Time Entry. |
| `update_time_entry` | WRITE | `POST /time-entries/:timeEntryId` | Edit a time entry (send only the fields to change). Refuses locked entries. |
| `delete_time_entry` | DESTRUCTIVE | `DELETE /time-entries/:timeEntryId` | Delete Time Entry. |
| `start_stopwatch` | WRITE | `POST /time-entries/:timeEntryId/start` | Start stopwatch. |
| `stop_stopwatch` | WRITE | `POST /time-entries/:timeEntryId/stop` | Stop stopwatch. |

### Reports (2)

| Tool | Kind | Route | What it does |
|---|---|---|---|
| `get_detailed_report` | READ | `GET /reports/detailed` | Detailed report: time entries with every documented filter and the full record shape. |
| `get_summary_report` | READ | `GET /reports/summary-groups` | Summary Report. |

### Timesheet Approvals (8)

| Tool | Kind | Route | What it does |
|---|---|---|---|
| `list_timesheet_approvals` | READ | `GET /timesheet-approvals` | List timesheet approvals. |
| `get_timesheet_approval` | READ | `GET /timesheet-approvals/:timesheetApprovalId` | Get timesheet approval. |
| `submit_timesheet` | WRITE | `POST /timesheet-approvals/submit` | Submit a weekly timesheet (period_start..period_end, optionally for user_id) for approval. |
| `approve_timesheet` | WRITE | `POST /timesheet-approvals/:timesheetApprovalId/approve` | Approve a submitted timesheet (approver/admin). |
| `reject_timesheet` | WRITE | `POST /timesheet-approvals/:timesheetApprovalId/reject` | Reject a submitted timesheet with a mandatory comment explaining why. |
| `undo_timesheet_approval` | WRITE | `POST /timesheet-approvals/:timesheetApprovalId/undo-approve` | Undo an approval (back to submitted). |
| `undo_timesheet_submission` | WRITE | `POST /timesheet-approvals/:timesheetApprovalId/undo-submit` | Withdraw a submission (back to open/editable). |
| `change_timesheet_approver` | WRITE | `POST /timesheet-approvals/:timesheetApprovalId/update-approver` | Change who approves this timesheet (approver_user_id). |

### Projects (17)

| Tool | Kind | Route | What it does |
|---|---|---|---|
| `list_projects` | READ | `GET /projects` | List Project. Returns ONLY ACTIVE items by default (sends active=1); pass active:false for archived (active=0) or active:"all" for no filter. |
| `create_project` | WRITE | `POST /projects` | New Project. |
| `get_project` | READ | `GET /projects/:projectId` | Get Project. |
| `update_project` | WRITE | `POST /projects/:projectId` | Edit a project (send only the fields to change; archive with active=false, reactivate with active=true). |
| `delete_project` | DESTRUCTIVE | `DELETE /projects/:projectId` | Delete Project. |
| `list_project_members` | READ | `GET /projects/:projectId/users` | List project Users. Returns ONLY ACTIVE items by default; the route has no active filter, so items are filtered locally on their "active" field. Pass active:false for inactive only or active:"all" for everything. |
| `list_project_available_users` | READ | `GET /projects/:projectId/users/available` | List user available to project. |
| `add_project_member` | WRITE | `POST /projects/:projectId/users/:userId` | Add a user to a project (optionally with manager, is_billable, rate, budget). Refuses if the user is already a member or is not in the available-users list. |
| `update_project_member` | WRITE | `POST /projects/:projectId/users/:userId` | Edit an existing project member (manager, is_billable, rate, budget). Refuses for non-members. |
| `remove_project_member` | DESTRUCTIVE | `DELETE /projects/:projectId/users/:userId` | Delete a user from project. |
| `list_project_tasks` | READ | `GET /projects/:projectId/tasks` | List project Tasks. |
| `list_project_available_tasks` | READ | `GET /projects/:projectId/tasks/available` | List task available to project. Returns ONLY ACTIVE items by default; the route has no active filter, so items are filtered locally on their "active" field. Pass active:false for inactive only or active:"all" for everything. |
| `add_project_task` | WRITE | `POST /projects/:projectId/tasks/:taskId` | Link a task to a project (optionally is_billable, budget, rate). Refuses if already linked. |
| `update_project_task` | WRITE | `POST /projects/:projectId/tasks/:taskId` | Edit a task already linked to a project (is_billable, budget, rate). |
| `remove_project_task` | DESTRUCTIVE | `DELETE /projects/:projectId/tasks/:taskId` | Delete a task from project. |
| `check_project_task` | WRITE | `POST /projects/:projectId/tasks/:taskId/check` | Check a task. |
| `uncheck_project_task` | WRITE | `POST /projects/:projectId/tasks/:taskId/uncheck` | Uncheck a task. |

### To-dos (17)

| Tool | Kind | Route | What it does |
|---|---|---|---|
| `list_todo_lists` | READ | `GET /todo-lists` | List To-do Lists. |
| `create_todo_list` | WRITE | `POST /todo-lists` | New To-do List. |
| `get_todo_list` | READ | `GET /todo-lists/:todoListId` | Get To-do List. |
| `update_todo_list` | WRITE | `POST /todo-lists/:todoListId` | Edit To-do List. |
| `delete_todo_list` | DESTRUCTIVE | `DELETE /todo-lists/:todoListId` | Delete To-do List. Moves the list to the trash (restorable with restore_todo_list). |
| `restore_todo_list` | WRITE | `POST /todo-lists/:todoListId/restore` | Restore To-do List. |
| `list_todos` | READ | `GET /todos` | List To-dos. |
| `create_todo` | WRITE | `POST /todos` | New To-do. |
| `get_todo` | READ | `GET /todos/:todoId` | Get To-do. |
| `update_todo` | WRITE | `POST /todos/:todoId` | Edit To-do. |
| `delete_todo` | DESTRUCTIVE | `DELETE /todos/:todoId` | Delete To-do. Moves the to-do to the trash (restorable with restore_todo). |
| `restore_todo` | WRITE | `POST /todos/:todoId/restore` | Restore To-do. |
| `list_todo_tags` | READ | `GET /todo-tags` | List to-do tags. |
| `create_todo_tag` | WRITE | `POST /todo-tags` | New to-do tag. |
| `get_todo_tag` | READ | `GET /todo-tags/:todoTagId` | Get a to-do tag. |
| `update_todo_tag` | WRITE | `POST /todo-tags/:todoTagId` | Edit a to-do tag. |
| `delete_todo_tag` | DESTRUCTIVE | `DELETE /todo-tags/:todoTagId` | Delete a to-do tag. |

### Comments (4)

| Tool | Kind | Route | What it does |
|---|---|---|---|
| `list_comments` | READ | `GET /comments` | List comments. |
| `create_comment` | WRITE | `POST /comments` | New comment. |
| `update_comment` | WRITE | `POST /comments/:commentId` | Edit a comment. There is no GET for a single comment, so no before/after diff is computed. |
| `delete_comment` | DESTRUCTIVE | `DELETE /comments/:commentId` | Delete a comment. |

### Customers & Tasks (10)

| Tool | Kind | Route | What it does |
|---|---|---|---|
| `list_customers` | READ | `GET /customers` | List Customer. Returns ONLY ACTIVE items by default (sends active=1); pass active:false for archived (active=0) or active:"all" for no filter. |
| `create_customer` | WRITE | `POST /customers` | New Customer. |
| `get_customer` | READ | `GET /customers/:customerId` | Get Customer. |
| `update_customer` | WRITE | `POST /customers/:customerId` | Edit a customer (send only the fields to change; archive with active=false). |
| `delete_customer` | DESTRUCTIVE | `DELETE /customers/:customerId` | Delete Customer. |
| `list_tasks` | READ | `GET /tasks` | List Task. Returns ONLY ACTIVE items by default (sends active=1); pass active:false for archived (active=0) or active:"all" for no filter. |
| `create_task` | WRITE | `POST /tasks` | New Task. |
| `get_task` | READ | `GET /tasks/:taskId` | Get Task. |
| `update_task` | WRITE | `POST /tasks/:taskId` | Edit a task (send only the fields to change; archive with active=false). |
| `delete_task` | DESTRUCTIVE | `DELETE /tasks/:taskId` | Delete Task. |

### Users & Teams (34)

| Tool | Kind | Route | What it does |
|---|---|---|---|
| `list_users` | READ | `GET /users` | List Users. Returns ONLY ACTIVE items by default (sends active=1); pass active:false for archived (active=0) or active:"all" for no filter. |
| `create_user` | WRITE | `POST /users` | Create (invite) a user. Refuses if a user with the same email already exists. |
| `get_user` | READ | `GET /users/:userId` | Get User. |
| `update_user` | WRITE | `POST /users/:userId` | Edit a user (send only the fields to change; set active=1 to reactivate). Use archive_user to archive. |
| `archive_user` | WRITE | `POST /users/:userId` | Archive (deactivate) a user by sending only {"active": 0}. Refuses if the user is already archived. |
| `delete_user` | DESTRUCTIVE | `DELETE /users/:userId` | Delete User. |
| `get_user_profile_photo` | READ | `GET /users/:userId/profile-photo` | Get profile photo URL. |
| `upload_user_profile_photo` | WRITE | `POST /users/:userId/profile-photo` | Upload a user profile photo (multipart field "file"; PNG or JPEG, up to 2 MB; stored as a square thumbnail). |
| `delete_user_profile_photo` | DESTRUCTIVE | `DELETE /users/:userId/profile-photo` | Delete the profile photo. |
| `list_user_projects` | READ | `GET /users/:userId/projects` | List the user's projects. Returns ONLY ACTIVE items by default; the route has no active filter, so items are filtered locally on their "active" field. Pass active:false for inactive only or active:"all" for everything. |
| `list_user_available_projects` | READ | `GET /users/:userId/projects-available` | List projects the user can join. Returns ONLY ACTIVE items by default; the route has no active filter, so items are filtered locally on their "active" field. Pass active:false for inactive only or active:"all" for everything. |
| `add_user_projects` | WRITE | `POST /users/:userId/projects` | Add the user to one or more projects (project_id: an ID or array of IDs). |
| `remove_user_projects` | DESTRUCTIVE | `DELETE /users/:userId/projects` | Remove the user from one or more projects (project_id: an ID or array of IDs). |
| `list_user_assignments` | READ | `GET /users/:userId/assignments` | List user assignments. |
| `list_user_available_assignments` | READ | `GET /users/:userId/assignments-available` | List assignments available to add. |
| `add_user_assignments` | WRITE | `POST /users/:userId/assignments` | Assign users and/or teams to this user (users: [ids], teams: [ids]). |
| `remove_user_assignments` | DESTRUCTIVE | `POST /users/:userId/remove-assignments` | Remove assigned users and/or teams from this user (users: [ids], teams: [ids]). |
| `list_user_allocations` | READ | `GET /users/:userId/allocations` | List days off and vacation. |
| `create_user_allocation` | WRITE | `POST /users/:userId/allocations` | New day off or vacation. |
| `update_user_allocation` | WRITE | `POST /users/:userId/allocations/:allocationId` | Edit a day off or vacation. |
| `delete_user_allocation` | DESTRUCTIVE | `DELETE /users/:userId/allocations/:allocationId` | Delete a day off or vacation. |
| `list_user_calendar_history` | READ | `GET /users/:userId/calendar-history` | List calendar history. |
| `create_user_calendar_period` | WRITE | `POST /users/:userId/calendar-history` | New calendar period. |
| `update_user_calendar_period` | WRITE | `POST /users/:userId/calendar-history/:calendarHistoryId` | Edit a calendar period. |
| `delete_user_calendar_period` | DESTRUCTIVE | `DELETE /users/:userId/calendar-history/:calendarHistoryId` | Delete a calendar period. |
| `list_teams` | READ | `GET /teams` | List teams. |
| `create_team` | WRITE | `POST /teams` | New team. |
| `get_team` | READ | `GET /teams/:teamId` | Get team. |
| `update_team` | WRITE | `POST /teams/:teamId` | Edit team. |
| `delete_team` | DESTRUCTIVE | `DELETE /teams/:teamId` | Delete team. |
| `list_team_members` | READ | `GET /teams/:teamId/users` | List team members. Returns ONLY ACTIVE users by default (sends include_archived_users=false); active:"all" sends include_archived_users=true; active:false sends include_archived_users=true and keeps only archived users locally. |
| `list_team_available_users` | READ | `GET /teams/:teamId/users/available` | List users available to add. Returns ONLY ACTIVE items by default; the route has no active filter, so items are filtered locally on their "active" field. Pass active:false for inactive only or active:"all" for everything. |
| `add_team_member` | WRITE | `POST /teams/:teamId/users/:userId` | Add a user to a team. Refuses if the user is already a member or is not in the available-users list. |
| `remove_team_member` | DESTRUCTIVE | `DELETE /teams/:teamId/users/:userId` | Remove user from team. |

### Custom Fields (14)

| Tool | Kind | Route | What it does |
|---|---|---|---|
| `list_custom_fields` | READ | `GET /custom-fields` | List custom fields. Returns ONLY ACTIVE items by default (sends active=1); pass active:false for archived (active=0) or active:"all" for no filter. |
| `create_custom_field` | WRITE | `POST /custom-fields` | New custom field. |
| `get_custom_field` | READ | `GET /custom-fields/:customFieldId` | Get custom field. |
| `update_custom_field` | WRITE | `POST /custom-fields/:customFieldId` | Edit custom field. |
| `delete_custom_field` | DESTRUCTIVE | `DELETE /custom-fields/:customFieldId` | Delete custom field. |
| `list_custom_field_options` | READ | `GET /custom-fields/:customFieldId/enum-options` | List enum options. Returns ONLY ACTIVE items by default; the route has no active filter, so items are filtered locally on their "active" field. Pass active:false for inactive only or active:"all" for everything. |
| `create_custom_field_option` | WRITE | `POST /custom-fields/:customFieldId/enum-options` | New enum option. |
| `get_custom_field_option` | READ | `GET /custom-fields/:customFieldId/enum-options/:enumOptionId` | Get enum option. |
| `update_custom_field_option` | WRITE | `POST /custom-fields/:customFieldId/enum-options/:enumOptionId` | Edit enum option. |
| `delete_custom_field_option` | DESTRUCTIVE | `DELETE /custom-fields/:customFieldId/enum-options/:enumOptionId` | Delete enum option. |
| `list_project_custom_field_settings` | READ | `GET /projects/:projectId/custom-fields-settings` | List project custom field settings. Returns ONLY ACTIVE items by default (sends active=1); pass active:false for archived (active=0) or active:"all" for no filter. |
| `get_project_custom_field_setting` | READ | `GET /projects/:projectId/custom-fields-settings/:customFieldId` | Get project custom field setting. |
| `save_project_custom_field_setting` | WRITE | `POST /projects/:projectId/custom-fields-settings/:customFieldId` | Create or update how a custom field behaves in one project (position, importance, required, active). |
| `delete_project_custom_field_setting` | DESTRUCTIVE | `DELETE /projects/:projectId/custom-fields-settings/:customFieldId` | Remove project custom field setting. |

### Rates (4)

| Tool | Kind | Route | What it does |
|---|---|---|---|
| `list_rates` | READ | `GET /rates` | List rates. |
| `save_rate` | WRITE | `POST /rates` | Set a rate (type billable\|cost\|tax; scoped by project_id and/or user_id; optional start date rate_start_at_new). |
| `get_latest_rate` | READ | `GET /rates/latest` | Get the latest rate. |
| `delete_latest_rate` | DESTRUCTIVE | `DELETE /rates/latest` | Delete the latest rate. |

### Calendars (9)

| Tool | Kind | Route | What it does |
|---|---|---|---|
| `list_calendars` | READ | `GET /calendars` | List calendars. |
| `create_calendar` | WRITE | `POST /calendars` | New calendar. |
| `get_calendar` | READ | `GET /calendars/:calendarId` | Get a calendar. |
| `update_calendar` | WRITE | `POST /calendars/:calendarId` | Edit a calendar. |
| `delete_calendar` | DESTRUCTIVE | `DELETE /calendars/:calendarId` | Delete a calendar. |
| `list_holidays` | READ | `GET /calendars/:calendarId/holidays` | List holidays. |
| `create_holiday` | WRITE | `POST /calendars/:calendarId/holidays` | New holiday. |
| `update_holiday` | WRITE | `POST /calendars/:calendarId/holidays/:holidayId` | Edit a holiday. |
| `delete_holiday` | DESTRUCTIVE | `DELETE /calendars/:calendarId/holidays/:holidayId` | Delete a holiday. |

### Webhooks (6)

| Tool | Kind | Route | What it does |
|---|---|---|---|
| `list_webhook_event_types` | READ | `GET /webhook-subscriptions/event-types` | List webhook event types. |
| `list_webhook_subscriptions` | READ | `GET /webhook-subscriptions` | List webhook subscriptions. Signing secrets are hidden in this listing. |
| `create_webhook_subscription` | WRITE | `POST /webhook-subscriptions` | Create a webhook subscription. url must be https; event_types are validated against list_webhook_event_types. Deliveries are signed with HMAC-SHA256 in X-Signature; the signing secret is returned only in this response — store it safely and never paste it in chat logs. |
| `update_webhook_subscription` | WRITE | `POST /webhook-subscriptions/:webhookSubscriptionId` | Edit a webhook subscription (name, url, event_types, enabled). regenerate_secret=true issues a new signing secret (the old one stops validating) and returns it once. |
| `delete_webhook_subscription` | DESTRUCTIVE | `DELETE /webhook-subscriptions/:webhookSubscriptionId` | Delete webhook subscription. |
| `list_webhook_deliveries` | READ | `GET /webhook-deliveries` | List webhook deliveries. |

## Routes not included

| Route | Reason |
|---|---|
| `GET /time-entries` | Deprecated in the spec ("returns no data"); use `list_time_entries` / `get_detailed_report`. |
| `POST /auth` | Not in the updated spec (prose: "POST /auth is deprecated"). Even if it worked, it takes the user's email + password, so the plugin would have to hold a password; personal tokens from the app are the documented method and do not expire. |
| `DELETE /auth/revoke` | Not in the updated spec; revoke tokens in the app (Settings > You > My tokens). |
| `custom_fields.{id}` query filters (GET /projects, GET /reports/detailed) | Dynamic parameter names can't be expressed as fixed tool arguments; filter locally on `customFields` instead. |

The profile photo upload **is** included (`upload_user_profile_photo`): Node 18+ ships `FormData`/`Blob`, so a multipart upload needs no dependency.

## Ambiguities / assumptions

1. ~~Spec marks some edit fields "required"~~ — resolved: the API author confirmed `required` applies to create only; edits send only the passed fields.
2. `POST /projects/:projectId/users/:userId` and `POST /projects/:projectId/tasks/:taskId` both add and edit → split into add/update tools distinguished by a membership/link check.
3. No single-record GET for comments, holidays, allocations, calendar-history periods or webhook subscriptions → read-before uses list-and-find (holidays: list without `year`; if not found the edit/delete still proceeds, without a before snapshot); comment edits return no diff.
4. Some IDs are strings in the spec (custom fields, tags, comments, calendars, webhook subscriptions, approvals, `todo_id`); path IDs accept integers or `[A-Za-z0-9_-]` strings. `users`/`teams` in assignments are string arrays per spec.
5. Boolean query parameters are sent as `true`/`false`; integer `active` filters (projects, users) as given (0/1). Not verified live.
6. `project_id` on `add_user_projects` / `remove_user_projects` is untyped in the spec (single ID or array accepted). `DELETE /users/:userId/projects` takes a JSON body.
7. `delete_todo` / `delete_todo_list` move to trash (restore tools exist); the other deletes are treated as permanent.
8. Earlier live responses returned some numbers as strings (e.g. `rate: "100"`); generic shapes coerce numeric strings for numeric fields.
9. `save_project_custom_field_setting` takes `custom_field_id`/`project_id` from the path only (the duplicate body fields are omitted).
10. The event-types endpoint is documented as a list of strings; objects with `name`/`event_type` are also accepted.

## Layout

```
.cursor-plugin/plugin.json Cursor Plugin manifest (Marketplace): metadata, logo, variables, skills, MCP config path
.cursor-plugin/mcp.json   Cursor MCP config (uses ${CURSOR_PLUGIN_ROOT})
plugin.json, mcp.json     Agent Plugins 1.0.0 manifest + MCP config (portable; cwd "./")
assets/logo.svg           logo
skills/                   agent skill (SKILL.md)
server/index.mjs          MCP protocol (initialize, tools/list, tools/call, ping)
server/lib.mjs            env, HTTP client (JSON + multipart), paging, validation, redaction
server/build.mjs          generic tool builder over the route table (args, partial edits, confirm gate, diffs)
server/normalize.mjs      curated TimeEntry + generic spec-derived shapes
server/spec/routes.mjs    GENERATED fixed route table (130 routes) — do not edit
server/tools/*.mjs        tools by area: time, projects, todos, directory, people, config, webhooks
scripts/gen-routes.mjs    regenerate routes.mjs from spec/openapi.en.json
scripts/gen-docs.mjs      regenerate docs/tools.en.md and docs/tools.pt.md
spec/openapi.{en,pt}.json specs extracted from the Redoc pages
test/run.mjs              local mock tests (no network beyond 127.0.0.1)
test/live.mjs             optional single read-only live proof; refuses unless run with --yes-live
scripts/secret-scan.mjs   pre-publish scan (token value, keys, local paths, emails) — prints file + rule only
```

## Development & tests

`node test/run.mjs` — 260 tests, all local (mock HTTP server on 127.0.0.1; the live API is never called):
one test per tool/route (method, path, query, body, headers, single write), a refusal test for each of the 25 destructive tools on a client without elicitation (no `confirm` / `confirm: false` / non-boolean → zero requests), approval-card tests with a mock client that declares elicitation (card contents: recurso/nome/id/motivo/items; accept → one write; decline, cancel, `recusar`, missing content, client error and timeout → zero DELETE; `confirm: true` doesn't bypass the card; guards refuse before the card; one decline+accept test per destructive tool), guards, active-by-default lists (for each of the 13 affected tools: default sends/applies the active filter, `active:false` gives inactive, `"all"` sends no filter, invalid values refused), partial edits (for each of the 16 edit tools whose spec lists required fields: body contains only the passed field; empty edit refused with zero requests; edit schemas require only path IDs; create schemas keep required fields) and diffs, webhook validation and secret masking, profile-photo validation and multipart encoding, TimeEntry shape and paging, error hints (401/403/404/422/429 + Retry-After) with token redaction, missing-token handling, manifest checks (Agent Plugins schemas + `.cursor-plugin/plugin.json` consistency, relative paths, variables, logo, skill frontmatter), the pre-publish secret scan, and route coverage (all 129 non-deprecated routes).

Before publishing: `node scripts/secret-scan.mjs`.

Regenerate after a spec update: save the new spec to `spec/openapi.en.json`, then `node scripts/gen-routes.mjs && node scripts/gen-docs.mjs && node test/run.mjs`.

## License

MIT, see [LICENSE](LICENSE).
