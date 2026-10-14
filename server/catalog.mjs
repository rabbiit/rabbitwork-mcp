import { TIME_TOOLS } from './tools/time.mjs';
import { PROJECT_TOOLS } from './tools/projects.mjs';
import { TODO_TOOLS } from './tools/todos.mjs';
import { DIRECTORY_TOOLS } from './tools/directory.mjs';
import { PEOPLE_TOOLS } from './tools/people.mjs';
import { CONFIG_TOOLS } from './tools/config.mjs';
import { WEBHOOK_TOOLS } from './tools/webhooks.mjs';

export const PROTOCOL_VERSION = '2025-06-18';
export const VERSION = '1.0.0';
export const TOOLS = [...TIME_TOOLS, ...PROJECT_TOOLS, ...TODO_TOOLS, ...DIRECTORY_TOOLS, ...PEOPLE_TOOLS, ...CONFIG_TOOLS, ...WEBHOOK_TOOLS];
export const BY_NAME = Object.fromEntries(TOOLS.map((tool) => [tool.name, tool]));
if (Object.keys(BY_NAME).length !== TOOLS.length) throw new Error('duplicate tool name');

export const annotations = (kind) => ({
  readOnlyHint: kind === 'READ',
  destructiveHint: kind === 'DESTRUCTIVE',
  openWorldHint: true,
});
