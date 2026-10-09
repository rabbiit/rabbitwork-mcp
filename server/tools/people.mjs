// Area: Users (and per-user sub-resources), Teams, Team Members.
import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { fromRoute } from '../build.mjs';
import { ToolError } from '../lib.mjs';
import { listRows, sameId } from './guards.mjs';
const T = (key, cfg) => fromRoute(key, { area: 'Users & Teams', ...cfg });

const MAX_PHOTO = 2 * 1024 * 1024;
const PHOTO_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

const needAssign = async (v) => { if (!(v.users?.length || v.teams?.length)) throw new ToolError('Pass at least one ID in "users" or "teams". No request was sent.'); };
const findIn = (listPath, idKey = 'id', label = 'Record') => ({
  path: listPath,
  find: (row, v) => sameId(row.id, v[idKey]),
  missing: (v) => `${label} ${v[idKey]} not found; no request was sent.`,
});

export const PEOPLE_TOOLS = [
  T('GET /users', { name: 'list_users', active: 'query' }),
  T('POST /users', {
    name: 'create_user',
    summary: 'Create (invite) a user. Refuses if a user with the same email already exists',
    pre: async (v) => {
      if (!v.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) throw new ToolError('"email" must be a valid email. No request was sent.');
      const users = await listRows('/users');
      const hit = users.find((u) => String(u.email || '').toLowerCase() === v.email.trim().toLowerCase());
      if (hit) throw new ToolError(`A user with email ${v.email} already exists (id ${hit.id}). No write request was sent.`);
    },
  }),
  T('GET /users/:userId', { name: 'get_user' }),
  T('POST /users/:userId', { name: 'update_user', summary: 'Edit a user (send only the fields to change; set active=1 to reactivate). Use archive_user to archive' }),
  T('POST /users/:userId', {
    name: 'archive_user', op: 'edit', omitAllBody: true,
    summary: 'Archive (deactivate) a user by sending only {"active": 0}. Refuses if the user is already archived',
    body: async (v, ctx) => {
      if (ctx.before && (ctx.before.active === 0 || ctx.before.active === '0' || ctx.before.active === false)) throw new ToolError(`User ${v.userId} is already archived. No write request was sent.`);
      return { active: 0 };
    },
  }),
  T('DELETE /users/:userId', { name: 'delete_user' }),

  T('GET /users/:userId/profile-photo', { name: 'get_user_profile_photo' }),
  T('POST /users/:userId/profile-photo', {
    name: 'upload_user_profile_photo', op: 'action', before: false, require: ['file'],
    summary: 'Upload a user profile photo (multipart field "file"; PNG or JPEG, up to 2 MB; stored as a square thumbnail)',
    sentLabel: (v) => ({ multipart: { file: basename(v.file) } }),
    body: async (v) => {
      const type = PHOTO_TYPES[extname(v.file).toLowerCase()];
      if (!type) throw new ToolError('"file" must be a .png, .jpg or .jpeg file. No request was sent.');
      let st;
      try { st = await stat(v.file); } catch { throw new ToolError(`Cannot read file ${v.file}. No request was sent.`); }
      if (!st.isFile()) throw new ToolError(`${v.file} is not a file. No request was sent.`);
      if (st.size > MAX_PHOTO) throw new ToolError(`File is ${st.size} bytes; the limit is 2 MB. No request was sent.`);
      const fd = new FormData();
      fd.append('file', new Blob([await readFile(v.file)], { type }), basename(v.file));
      return fd;
    },
  }),
  T('DELETE /users/:userId/profile-photo', { name: 'delete_user_profile_photo', before: false }),

  T('GET /users/:userId/projects', { name: 'list_user_projects', active: 'local' }),
  T('GET /users/:userId/projects-available', { name: 'list_user_available_projects', active: 'local' }),
  T('POST /users/:userId/projects', { name: 'add_user_projects', summary: 'Add the user to one or more projects (project_id: an ID or array of IDs)' }),
  T('DELETE /users/:userId/projects', { name: 'remove_user_projects', before: false, require: ['project_id'], summary: 'Remove the user from one or more projects (project_id: an ID or array of IDs)' }),

  T('GET /users/:userId/assignments', { name: 'list_user_assignments' }),
  T('GET /users/:userId/assignments-available', { name: 'list_user_available_assignments' }),
  T('POST /users/:userId/assignments', { name: 'add_user_assignments', summary: 'Assign users and/or teams to this user (users: [ids], teams: [ids])', pre: needAssign }),
  T('POST /users/:userId/remove-assignments', { name: 'remove_user_assignments', op: 'destructive', before: false, summary: 'Remove assigned users and/or teams from this user (users: [ids], teams: [ids])', pre: needAssign }),

  T('GET /users/:userId/allocations', { name: 'list_user_allocations' }),
  T('POST /users/:userId/allocations', { name: 'create_user_allocation' }),
  T('POST /users/:userId/allocations/:allocationId', { name: 'update_user_allocation', before: { ...findIn((v) => `/users/${v.userId}/allocations`, 'allocationId', 'Allocation'), find: (row, v) => sameId(row.id, v.allocationId) } }),
  T('DELETE /users/:userId/allocations/:allocationId', { name: 'delete_user_allocation', before: { path: (v) => `/users/${v.userId}/allocations`, find: (row, v) => sameId(row.id, v.allocationId), missing: (v) => `Allocation ${v.allocationId} not found for user ${v.userId}; no request was sent.` } }),

  T('GET /users/:userId/calendar-history', { name: 'list_user_calendar_history' }),
  T('POST /users/:userId/calendar-history', { name: 'create_user_calendar_period' }),
  T('POST /users/:userId/calendar-history/:calendarHistoryId', { name: 'update_user_calendar_period', before: { path: (v) => `/users/${v.userId}/calendar-history`, find: (row, v) => sameId(row.id, v.calendarHistoryId), missing: (v) => `Calendar period ${v.calendarHistoryId} not found for user ${v.userId}; no request was sent.` } }),
  T('DELETE /users/:userId/calendar-history/:calendarHistoryId', { name: 'delete_user_calendar_period', before: { path: (v) => `/users/${v.userId}/calendar-history`, find: (row, v) => sameId(row.id, v.calendarHistoryId), missing: (v) => `Calendar period ${v.calendarHistoryId} not found for user ${v.userId}; no request was sent.` } }),

  T('GET /teams', { name: 'list_teams' }),
  T('POST /teams', { name: 'create_team' }),
  T('GET /teams/:teamId', { name: 'get_team' }),
  T('POST /teams/:teamId', { name: 'update_team' }),
  T('DELETE /teams/:teamId', { name: 'delete_team' }),
  T('GET /teams/:teamId/users', { name: 'list_team_members', active: 'archivedUsers' }),
  T('GET /teams/:teamId/users/available', { name: 'list_team_available_users', active: 'local' }),
  T('POST /teams/:teamId/users/:userId', {
    name: 'add_team_member', op: 'action', before: false,
    summary: 'Add a user to a team. Refuses if the user is already a member or is not in the available-users list',
    pre: async (v) => {
      const members = await listRows(`/teams/${v.teamId}/users`, { include_archived_users: 'true' });
      if (members.some((m) => sameId(m.id, v.userId))) throw new ToolError(`User ${v.userId} is already a member of team ${v.teamId}. No write request was sent.`);
      const avail = await listRows(`/teams/${v.teamId}/users/available`);
      if (!avail.some((u) => sameId(u.id, v.userId))) throw new ToolError(`User ${v.userId} is not in the available-users list of team ${v.teamId}. No write request was sent.`);
    },
  }),
  T('DELETE /teams/:teamId/users/:userId', { name: 'remove_team_member', before: { path: (v) => `/teams/${v.teamId}/users`, query: () => ({ include_archived_users: 'true' }), find: (row, v) => sameId(row.id, v.userId), missing: (v) => `User ${v.userId} is not a member of team ${v.teamId}. No request was sent.` } }),
];
