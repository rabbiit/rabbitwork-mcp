// Area: Custom Fields (+ options, per-project settings), Rates, Calendars & Holidays.
import { fromRoute } from '../build.mjs';
import { sameId } from './guards.mjs';
const T = (key, cfg) => fromRoute(key, { area: 'Settings', ...cfg });
const holidayBefore = (v) => `/calendars/${v.calendarId}/holidays`;

export const CONFIG_TOOLS = [
  T('GET /custom-fields', { name: 'list_custom_fields', active: 'query', area: 'Custom Fields' }),
  T('POST /custom-fields', { name: 'create_custom_field', area: 'Custom Fields' }),
  T('GET /custom-fields/:customFieldId', { name: 'get_custom_field', area: 'Custom Fields' }),
  T('POST /custom-fields/:customFieldId', { name: 'update_custom_field', area: 'Custom Fields' }),
  T('DELETE /custom-fields/:customFieldId', { name: 'delete_custom_field', area: 'Custom Fields' }),
  T('GET /custom-fields/:customFieldId/enum-options', { name: 'list_custom_field_options', active: 'local', area: 'Custom Fields' }),
  T('POST /custom-fields/:customFieldId/enum-options', { name: 'create_custom_field_option', area: 'Custom Fields' }),
  T('GET /custom-fields/:customFieldId/enum-options/:enumOptionId', { name: 'get_custom_field_option', area: 'Custom Fields' }),
  T('POST /custom-fields/:customFieldId/enum-options/:enumOptionId', { name: 'update_custom_field_option', area: 'Custom Fields' }),
  T('DELETE /custom-fields/:customFieldId/enum-options/:enumOptionId', { name: 'delete_custom_field_option', area: 'Custom Fields' }),
  T('GET /projects/:projectId/custom-fields-settings', { name: 'list_project_custom_field_settings', active: 'query', area: 'Custom Fields' }),
  T('GET /projects/:projectId/custom-fields-settings/:customFieldId', { name: 'get_project_custom_field_setting', area: 'Custom Fields' }),
  T('POST /projects/:projectId/custom-fields-settings/:customFieldId', { name: 'save_project_custom_field_setting', area: 'Custom Fields', beforeOptional: true, omit: ['custom_field_id', 'project_id'], summary: 'Create or update how a custom field behaves in one project (position, importance, required, active)' }),
  T('DELETE /projects/:projectId/custom-fields-settings/:customFieldId', { name: 'delete_project_custom_field_setting', area: 'Custom Fields' }),

  T('GET /rates', { name: 'list_rates', area: 'Rates' }),
  T('POST /rates', { name: 'save_rate', area: 'Rates', summary: 'Set a rate (type billable|cost|tax; scoped by project_id and/or user_id; optional start date rate_start_at_new)' }),
  T('GET /rates/latest', { name: 'get_latest_rate', area: 'Rates' }),
  T('DELETE /rates/latest', { name: 'delete_latest_rate', area: 'Rates', before: { path: () => '/rates/latest', query: (v) => Object.fromEntries(['type', 'project_id', 'user_id'].filter((k) => v[k] !== undefined).map((k) => [k, String(v[k])])) } }),

  T('GET /calendars', { name: 'list_calendars', area: 'Calendars' }),
  T('POST /calendars', { name: 'create_calendar', area: 'Calendars' }),
  T('GET /calendars/:calendarId', { name: 'get_calendar', area: 'Calendars' }),
  T('POST /calendars/:calendarId', { name: 'update_calendar', area: 'Calendars' }),
  T('DELETE /calendars/:calendarId', { name: 'delete_calendar', area: 'Calendars' }),
  T('GET /calendars/:calendarId/holidays', { name: 'list_holidays', area: 'Calendars' }),
  T('POST /calendars/:calendarId/holidays', { name: 'create_holiday', area: 'Calendars' }),
  T('POST /calendars/:calendarId/holidays/:holidayId', { name: 'update_holiday', area: 'Calendars', before: { path: holidayBefore, find: (row, v) => sameId(row.id, v.holidayId), missing: (v) => `Holiday ${v.holidayId} not found in calendar ${v.calendarId} (current year list); no request was sent.`, required: false } }),
  T('DELETE /calendars/:calendarId/holidays/:holidayId', { name: 'delete_holiday', area: 'Calendars', before: { path: holidayBefore, find: (row, v) => sameId(row.id, v.holidayId), required: false } }),
];
