---
name: rabbitwork-timesheets
description: Work with Rabbitwork (formerly Rabbiit) time tracking through its official API v1. Use it for time entries (lançamentos, horas, timesheet, cronômetro), reports, timesheet approvals, projects and members, project tasks, to-dos, tags and comments, customers, tasks, users and teams, custom fields, rates, calendars/holidays and webhooks. Reads are safe; writes need the user's confirmation; destructive actions need explicit confirmation plus confirm: true.
---

# Rabbitwork

133 fixed tools, one per documented route (plus a few safe variants). Every tool description starts with its kind:

- **READ.** Safe, but every call spends the account-wide daily quota (and 600 req/min per token). Prefer narrow filters and `maxPages: 1`.
- **WRITE (changes live data — confirm with the user first).** Say exactly what will change (record, fields, values) and get a yes before calling.
- **DESTRUCTIVE — confirm explicitly with the user first.** Deletes/removals. Name the record (fetch it first if needed) and ask the user before calling. Pass a short `reason` — it is shown to the user. If the MCP client supports elicitation (e.g. Cursor), the server then shows the user an approval card (pt-BR: recurso, nome, id, motivo) and deletes only on "aprovar"; `confirm: true` does not skip it. If the result says "Recusado pelo usuário, nada foi apagado", accept it — do not retry or work around it. On clients without elicitation, `confirm: true` is required (only after the user's explicit yes); without it the tool refuses and sends nothing. Never set `confirm: true` on your own initiative.

## Rules
- Edits are partial: pass only the fields to change. The tool reads the record first and returns `changed` [{field, before, after}] and `sent` (the exact body). Fields the spec marks as required are required only when creating; on edits every field is optional and anything omitted stays unchanged, so the tool sends only what you pass (never values from the read-before GET). An edit with no field to change is refused without a request.
- Lists return ONLY ACTIVE items by default (projects, customers, tasks, users, custom fields, project custom-field settings, team members, project members, available tasks/users/projects, user projects, custom-field options). Pass `active: false` for archived/inactive or `active: "all"` for everything — e.g. when the user asks about archived projects or a full roster. Time entries/reports are not filtered by default.
- Archive instead of delete when the user says "archive"/"deactivate": `update_project`/`update_customer`/`update_task` with `active: false`, `archive_user` for users (sends only `{"active": 0}`).
- Guards that refuse without writing: `add_project_member`/`add_team_member` (already a member or not available), `update_project_member`/`remove_project_member` (not a member), `add_project_task` (already linked), `update/remove/check/uncheck_project_task` (not linked), `create_user` (email exists), `archive_user` (already archived), time-entry edit/start/stop/delete (locked entry).
- Webhooks: URL must be https; `event_types` must come from `list_webhook_event_types`. The signing secret is returned only by `create_webhook_subscription` or `update_webhook_subscription` with `regenerate_secret: true`; tell the user to store it and do not repeat it later. Listings hide secrets.
- Never ask for or print the API token. If a tool says `RABBITWORK_API_TOKEN is not set`, tell the user to create a personal token in the app (Settings > You > My tokens) and set it as the plugin secret.
- On 429, wait for Retry-After; do not loop.
- Dates are `YYYY-MM-DD`; durations `HH:mm[:ss]`; ID filters accept one ID, comma-separated IDs or an array.

## Which tool (by area)

**Time** — `list_time_entries` (stable TimeEntry shape: id, date, person, personId, project, projectId, customer, activity, durationMinutes, description, billable, invoiced), `get_detailed_report` (all filters, full record), `get_summary_report` (grouped totals, templates incl. users_and_weeks/users_and_months), `get_current_timer`, `get_time_entry`, `create_time_entry`, `update_time_entry`, `start_stopwatch`, `stop_stopwatch`, `delete_time_entry`*.

**Timesheet approvals** — `list_timesheet_approvals`, `get_timesheet_approval`, `submit_timesheet` (week period), `approve_timesheet`, `reject_timesheet` (comment required), `undo_timesheet_approval` (approved → submitted), `undo_timesheet_submission` (submitted → open), `change_timesheet_approver`.

**Projects** — `list_projects`, `get_project`, `create_project`, `update_project`, `delete_project`*; members: `list_project_members`, `list_project_available_users`, `add_project_member`, `update_project_member`, `remove_project_member`*; project tasks: `list_project_tasks`, `list_project_available_tasks`, `add_project_task`, `update_project_task`, `check_project_task`, `uncheck_project_task`, `remove_project_task`*.

**To-dos** — lists: `list_todo_lists`, `get_todo_list`, `create_todo_list`, `update_todo_list`, `delete_todo_list`* (trash), `restore_todo_list`; to-dos: `list_todos`, `get_todo`, `create_todo`, `update_todo`, `delete_todo`* (trash), `restore_todo`; tags: `list_todo_tags`, `get_todo_tag`, `create_todo_tag`, `update_todo_tag`, `delete_todo_tag`*; comments: `list_comments`, `create_comment`, `update_comment`, `delete_comment`*.

**Customers & tasks** — `list_customers`, `get_customer`, `create_customer`, `update_customer`, `delete_customer`*; `list_tasks`, `get_task`, `create_task`, `update_task`, `delete_task`*.

**Users & teams** — `list_users`, `get_user`, `create_user`, `update_user`, `archive_user`, `delete_user`*; photo: `get_user_profile_photo`, `upload_user_profile_photo` (absolute path to a PNG/JPEG ≤ 2 MB), `delete_user_profile_photo`*; projects: `list_user_projects`, `list_user_available_projects`, `add_user_projects`, `remove_user_projects`*; assignments: `list_user_assignments`, `list_user_available_assignments`, `add_user_assignments`, `remove_user_assignments`*; allocations (vacation/leave): `list_user_allocations`, `create_user_allocation`, `update_user_allocation`, `delete_user_allocation`*; calendar history: `list_user_calendar_history`, `create_user_calendar_period`, `update_user_calendar_period`, `delete_user_calendar_period`*; teams: `list_teams`, `get_team`, `create_team`, `update_team`, `delete_team`*, `list_team_members`, `list_team_available_users`, `add_team_member`, `remove_team_member`*.

**Settings** — custom fields: `list_custom_fields`, `get_custom_field`, `create_custom_field`, `update_custom_field`, `delete_custom_field`*, options: `list_custom_field_options`, `get_custom_field_option`, `create_custom_field_option`, `update_custom_field_option`, `delete_custom_field_option`*, per project: `list_project_custom_field_settings`, `get_project_custom_field_setting`, `save_project_custom_field_setting`, `delete_project_custom_field_setting`*; rates: `list_rates`, `get_latest_rate`, `save_rate`, `delete_latest_rate`*; calendars: `list_calendars`, `get_calendar`, `create_calendar`, `update_calendar`, `delete_calendar`*, `list_holidays`, `create_holiday`, `update_holiday`, `delete_holiday`*.

**Webhooks** — `list_webhook_event_types`, `list_webhook_subscriptions`, `create_webhook_subscription`, `update_webhook_subscription`, `delete_webhook_subscription`*, `list_webhook_deliveries`.

\* DESTRUCTIVE (approval card when the client supports elicitation; otherwise explicit user confirmation + `confirm: true`).

## Common flows
- "How many hours did X log on project Y last week?" → `list_users`/`list_projects` to resolve IDs → `list_time_entries` with `from`/`to`/`person`/`project`; sum `durationMinutes`.
- "Make project P billable at 100/h" → `get_project` → confirm → `update_project` `{is_billable: true, rate: 100}` → report `changed`.
- "Submit my week" → confirm the period → `submit_timesheet` `{period_start, period_end}`.
- "Delete entry 123" → `get_time_entry` → show it → user confirms → `delete_time_entry` `{timeEntryId: 123, reason: "...", confirm: true}` (the approval card, when supported, is the final word).
