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

