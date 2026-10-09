// Area: Customers, Tasks (account-wide catalog).
import { fromRoute } from '../build.mjs';
const T = (key, cfg) => fromRoute(key, { area: 'Customers & Tasks', ...cfg });

export const DIRECTORY_TOOLS = [
  T('GET /customers', { name: 'list_customers', active: 'query' }),
  T('POST /customers', { name: 'create_customer' }),
  T('GET /customers/:customerId', { name: 'get_customer' }),
  T('POST /customers/:customerId', { name: 'update_customer', summary: 'Edit a customer (send only the fields to change; archive with active=false)' }),
  T('DELETE /customers/:customerId', { name: 'delete_customer' }),

  T('GET /tasks', { name: 'list_tasks', active: 'query' }),
  T('POST /tasks', { name: 'create_task' }),
  T('GET /tasks/:taskId', { name: 'get_task' }),
  T('POST /tasks/:taskId', { name: 'update_task', summary: 'Edit a task (send only the fields to change; archive with active=false)' }),
  T('DELETE /tasks/:taskId', { name: 'delete_task' }),
];
