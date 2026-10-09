# Changelog

## 1.0.0 — first public release

- Covers all 129 non-deprecated routes of the Rabbitwork API v1 (133 tools).
- Approval cards (MCP elicitation) for destructive tools; `confirm: true` fallback for clients without elicitation.
- Active-only list defaults (`active: true | false | "all"`).
- Partial edits (only passed fields are sent; spec "required" applies to create only).
- Cursor Plugin manifest (`.cursor-plugin/plugin.json`) alongside the Agent Plugins manifest.

### Differences from the pre-release prototype (0.x)


Full machine diff: `docs/spec-diff-old-vs-new.txt`.

- **Output envelopes/names:** v0.1 hand-written shapes (`projects`, `members`, `billable`, `customer`, `memberId`, …) are replaced by spec-derived camelCase shapes in `items`/`item` (e.g. project `billable` → `isBillable`, `customer` → `customerName`; member `name` → `userName`, `memberId` → `id`). `list_time_entries` is unchanged (now also sends `is_invoiced` to the API and adds `totalMinutes`).
- **Edits:** v0.1 resent all current writable fields ("preserve" approach); the updated docs say omitted fields stay unchanged and that resending a full GET object overwrites every writable field, so v0.2 sends only the passed fields (spec-required fields are create-only).
- **Projects:** `active` integer 0/1 → boolean; `budget_by` adds `none`; `time_total` integer → string `HH:mm:ss`; `billable` and `contractor_id` now deprecated/read-only (`contractor_id` no longer writable); new `color`, `budget_options`, `only_admin_publish`, `only_admin_see_others`, `project_id_source` + `keep_from_source` (create from template), `total_pending_todos`, `custom_fields`, `todo_permissions`, `todo_allowed_actions`; list gains `only_active_projects`, `opt_sort_by`, `opt_sort_direction`, `opt_show_total`; get gains `opt_expand`.
- **Project members:** `billable` deprecated (use `is_billable`); new `budget` (writable), `user_role`, `user_profile_photo(_url)`. Available users gain `profile_photo(_url)`.
- **Project tasks:** new `budget`, `rate` (both writable), `color`, `user_id/user_name/user_email`; list gains `checked` filter. Available tasks gain `color`, `active`, `custom_fields`, lose `date_changed`.
- **To-dos:** new `due_on`, `parent_todo_id` (sub-to-dos), `external_ref`, `tag_ids`, `highlighted_tag_id` (writable) and read-only `tags`, `time_total`, sub-to-do sums, `time_progress`, counts (attachments/comments/subtodos), hierarchy paths, `depth`; list gains `trashed`, `only_my_projects`, `parent_todo_id`, `only_root_todos`, `has_name`, `enrich_hierarchy_display`, `external_ref_*` filters. `project_id` is writable on create (v0.1 generator missed it).
- **To-do lists:** new `color`; `changed_by` removed; list gains `id` filter; `project_id` writable on create.
- **Users:** `capacity_per_day` integer → number; `cost_rate_start_at` now read-only (write `cost_rate_start_at_new`); `assigned_team_ids` read-only (use assignments routes); `manage_restricted_teams` deprecated; new `auto_assign_new_users`, `last_calendar_id` + `last_calendar_start_at_new`, `permissions`, `custom_fields`, `profile_photo`, `total_projects`, `total_assigned_users`; `email` writable on create (v0.1 generator missed it).
- **Tasks:** new `color`, `active`, `custom_fields`; `is_billable_default` now writable; list gains `id` and `active` filters; `date_changed` removed.
- **Customers:** `active` 0/1 → boolean; new contact fields `email`, `phone`, `phone2`, `phone3`, `address`, `city`, `state`, `country`, `cnpj`, `cpf` (writable), `contact`, `type_person` (read-only), `custom_fields`; list gains `customer_id`.
- **Time entries:** `value_honorary_hour/total` → `rate_hour/rate_total`; new `has_overtime`, `overtime`, `regular_time`, `start_stopwatch`, `todo_id/todo_name`, `breaks_total`, `break_intervals`, `external_ref`, `custom_fields`, approval fields, cost/tax/margin amounts, colors, manager; start/stop accept `time_start`/`stopwatch_date_start` and `time_total`.
- **Detailed report:** `is_invoiced` boolean → integer, `todo_id` integer → string; new approval/overtime/break/manager fields; many new filters (`is_invoiced`, `only_active_users`, `only_active_projects`, `only_projects_member_of`, `project_privacy`, `description`, `manager_id`, `*_empty`, `todo_id`, `is_stopwatch_active`, `include_unregistered_projects`).
- **Summary report:** new `capacity_filter_type/scope/value`; templates include `users_and_weeks` and `users_and_months`.
- **New routes (81):** to-do tags, comments, teams + team members, user photo/projects/assignments/allocations/calendar history, custom fields (+ options, per-project settings), timesheet approvals, rates, calendars + holidays, webhooks; restore routes for to-dos and to-do lists. The plugin now also exposes every DELETE route (as DESTRUCTIVE).
- **Removed:** `POST /auth` and `DELETE /auth/revoke` are gone from the spec; User-Agent token binding no longer applies.

