// Area: Projects, Project Members, Project Tasks.
import { fromRoute } from '../build.mjs';
import { ToolError } from '../lib.mjs';
import { listRows, sameId } from './guards.mjs';
const T = (key, cfg) => fromRoute(key, { area: 'Projects', ...cfg });

const memberBefore = (missing) => ({
  path: (v) => `/projects/${v.projectId}/users`,
  find: (row, v) => sameId(row.user_id ?? row.id, v.userId),
  missing,
});
const taskBefore = (missing) => ({
  path: (v) => `/projects/${v.projectId}/tasks`,
  find: (row, v) => sameId(row.task_id, v.taskId),
  missing,
});

export const PROJECT_TOOLS = [
  T('GET /projects', { name: 'list_projects', active: 'query' }),
  T('POST /projects', { name: 'create_project' }),
  T('GET /projects/:projectId', { name: 'get_project' }),
  T('POST /projects/:projectId', { name: 'update_project', summary: 'Edit a project (send only the fields to change; archive with active=false, reactivate with active=true)' }),
  T('DELETE /projects/:projectId', { name: 'delete_project' }),

  T('GET /projects/:projectId/users', { name: 'list_project_members', active: 'local' }),
  T('GET /projects/:projectId/users/available', { name: 'list_project_available_users' }),
  T('POST /projects/:projectId/users/:userId', {
    name: 'add_project_member', op: 'action', before: false,
    summary: 'Add a user to a project (optionally with manager, is_billable, rate, budget). Refuses if the user is already a member or is not in the available-users list',
    pre: async (v) => {
      const members = await listRows(`/projects/${v.projectId}/users`);
      if (members.some((m) => sameId(m.user_id ?? m.id, v.userId))) throw new ToolError(`User ${v.userId} is already a member of project ${v.projectId}; use update_project_member instead. No write request was sent.`);
      const avail = await listRows(`/projects/${v.projectId}/users/available`);
      if (!avail.some((u) => sameId(u.id, v.userId))) throw new ToolError(`User ${v.userId} is not in the available-users list of project ${v.projectId}. No write request was sent.`);
    },
  }),
  T('POST /projects/:projectId/users/:userId', {
    name: 'update_project_member', op: 'edit', before: memberBefore((v) => `User ${v.userId} is not a member of project ${v.projectId}; use add_project_member to add them. No write request was sent.`),
    summary: 'Edit an existing project member (manager, is_billable, rate, budget). Refuses for non-members',
  }),
  T('DELETE /projects/:projectId/users/:userId', { name: 'remove_project_member', before: memberBefore((v) => `User ${v.userId} is not a member of project ${v.projectId}. No request was sent.`) }),

  T('GET /projects/:projectId/tasks', { name: 'list_project_tasks' }),
  T('GET /projects/:projectId/tasks/available', { name: 'list_project_available_tasks', active: 'local' }),
  T('POST /projects/:projectId/tasks/:taskId', {
    name: 'add_project_task', op: 'action', before: false,
    summary: 'Link a task to a project (optionally is_billable, budget, rate). Refuses if already linked',
    pre: async (v) => {
      const rows = await listRows(`/projects/${v.projectId}/tasks`);
      if (rows.some((t) => sameId(t.task_id, v.taskId))) throw new ToolError(`Task ${v.taskId} is already linked to project ${v.projectId}; use update_project_task instead. No write request was sent.`);
    },
  }),
  T('POST /projects/:projectId/tasks/:taskId', { name: 'update_project_task', op: 'edit', before: taskBefore((v) => `Task ${v.taskId} is not linked to project ${v.projectId}; use add_project_task. No write request was sent.`), summary: 'Edit a task already linked to a project (is_billable, budget, rate)' }),
  T('DELETE /projects/:projectId/tasks/:taskId', { name: 'remove_project_task', before: taskBefore((v) => `Task ${v.taskId} is not linked to project ${v.projectId}. No request was sent.`) }),
  T('POST /projects/:projectId/tasks/:taskId/check', { name: 'check_project_task', before: taskBefore((v) => `Task ${v.taskId} is not linked to project ${v.projectId}. No write request was sent.`) }),
  T('POST /projects/:projectId/tasks/:taskId/uncheck', { name: 'uncheck_project_task', before: taskBefore((v) => `Task ${v.taskId} is not linked to project ${v.projectId}. No write request was sent.`) }),
];
