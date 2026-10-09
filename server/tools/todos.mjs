// Area: To-do Lists, To-dos, To-do Tags, Comments.
import { fromRoute } from '../build.mjs';
const T = (key, cfg) => fromRoute(key, { area: 'To-dos', ...cfg });

export const TODO_TOOLS = [
  T('GET /todo-lists', { name: 'list_todo_lists' }),
  T('POST /todo-lists', { name: 'create_todo_list' }),
  T('GET /todo-lists/:todoListId', { name: 'get_todo_list' }),
  T('POST /todo-lists/:todoListId', { name: 'update_todo_list' }),
  T('DELETE /todo-lists/:todoListId', { name: 'delete_todo_list', note: 'Moves the list to the trash (restorable with restore_todo_list).' }),
  T('POST /todo-lists/:todoListId/restore', { name: 'restore_todo_list', before: false }),

  T('GET /todos', { name: 'list_todos' }),
  T('POST /todos', { name: 'create_todo' }),
  T('GET /todos/:todoId', { name: 'get_todo' }),
  T('POST /todos/:todoId', { name: 'update_todo' }),
  T('DELETE /todos/:todoId', { name: 'delete_todo', note: 'Moves the to-do to the trash (restorable with restore_todo).' }),
  T('POST /todos/:todoId/restore', { name: 'restore_todo', before: false }),

  T('GET /todo-tags', { name: 'list_todo_tags' }),
  T('POST /todo-tags', { name: 'create_todo_tag' }),
  T('GET /todo-tags/:todoTagId', { name: 'get_todo_tag' }),
  T('POST /todo-tags/:todoTagId', { name: 'update_todo_tag' }),
  T('DELETE /todo-tags/:todoTagId', { name: 'delete_todo_tag' }),

  T('GET /comments', { name: 'list_comments', area: 'Comments' }),
  T('POST /comments', { name: 'create_comment', area: 'Comments' }),
  T('POST /comments/:commentId', { name: 'update_comment', area: 'Comments', note: 'There is no GET for a single comment, so no before/after diff is computed.' }),
  T('DELETE /comments/:commentId', { name: 'delete_comment', area: 'Comments' }),
];
