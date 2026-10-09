### Lançamentos de horas (8)

| Ferramenta | Tipo | Rota | O que faz |
|---|---|---|---|
| `list_time_entries` | leitura | `GET /reports/detailed` | Lista lançamentos no formato estável TimeEntry (via relatório detalhado) |
| `create_time_entry` | escrita | `POST /time-entries` | Novo lançamento de horas |
| `get_current_timer` | leitura | `GET /time-entries/current` | Obter o cronômetro ativo |
| `get_time_entry` | leitura | `GET /time-entries/:timeEntryId` | Obter lançamento de horas |
| `update_time_entry` | escrita | `POST /time-entries/:timeEntryId` | Editar lançamento de horas |
| `delete_time_entry` | DESTRUTIVA | `DELETE /time-entries/:timeEntryId` | Excluir lançamento de horas |
| `start_stopwatch` | escrita | `POST /time-entries/:timeEntryId/start` | Iniciar cronômetro |
| `stop_stopwatch` | escrita | `POST /time-entries/:timeEntryId/stop` | Parar cronômetro |

### Relatórios (2)

| Ferramenta | Tipo | Rota | O que faz |
|---|---|---|---|
| `get_detailed_report` | leitura | `GET /reports/detailed` | Relatório detalhado com todos os filtros e o registro completo |
| `get_summary_report` | leitura | `GET /reports/summary-groups` | Relatório resumido |

### Aprovação de timesheets (8)

| Ferramenta | Tipo | Rota | O que faz |
|---|---|---|---|
| `list_timesheet_approvals` | leitura | `GET /timesheet-approvals` | Lista as aprovações de horas |
| `get_timesheet_approval` | leitura | `GET /timesheet-approvals/:timesheetApprovalId` | Obtém uma aprovação de horas |
| `submit_timesheet` | escrita | `POST /timesheet-approvals/submit` | Enviar timesheet |
| `approve_timesheet` | escrita | `POST /timesheet-approvals/:timesheetApprovalId/approve` | Aprovar timesheet |
| `reject_timesheet` | escrita | `POST /timesheet-approvals/:timesheetApprovalId/reject` | Rejeita timesheet com comentário obrigatório |
| `undo_timesheet_approval` | escrita | `POST /timesheet-approvals/:timesheetApprovalId/undo-approve` | Desfazer aprovação |
| `undo_timesheet_submission` | escrita | `POST /timesheet-approvals/:timesheetApprovalId/undo-submit` | Desfazer envio |
| `change_timesheet_approver` | escrita | `POST /timesheet-approvals/:timesheetApprovalId/update-approver` | Trocar aprovador |

### Projetos, membros e tarefas do projeto (17)

| Ferramenta | Tipo | Rota | O que faz |
|---|---|---|---|
| `list_projects` | leitura | `GET /projects` | Listar projetos |
| `create_project` | escrita | `POST /projects` | Novo projeto |
| `get_project` | leitura | `GET /projects/:projectId` | Obter projeto |
| `update_project` | escrita | `POST /projects/:projectId` | Editar projeto |
| `delete_project` | DESTRUTIVA | `DELETE /projects/:projectId` | Excluir projeto |
| `list_project_members` | leitura | `GET /projects/:projectId/users` | Listar membros do projeto |
| `list_project_available_users` | leitura | `GET /projects/:projectId/users/available` | Lista usuários disponíveis para o projeto |
| `add_project_member` | escrita | `POST /projects/:projectId/users/:userId` | Adiciona usuário ao projeto; recusa se já for membro ou não estiver na lista de disponíveis |
| `update_project_member` | escrita | `POST /projects/:projectId/users/:userId` | Edita membro existente (gestor, faturável, valor/hora, orçamento); recusa não-membros |
| `remove_project_member` | DESTRUTIVA | `DELETE /projects/:projectId/users/:userId` | Remove um usuário do projeto |
| `list_project_tasks` | leitura | `GET /projects/:projectId/tasks` | Listar tarefas do projeto |
| `list_project_available_tasks` | leitura | `GET /projects/:projectId/tasks/available` | Lista tarefas disponíveis para o projeto |
| `add_project_task` | escrita | `POST /projects/:projectId/tasks/:taskId` | Vincula tarefa ao projeto; recusa se já vinculada |
| `update_project_task` | escrita | `POST /projects/:projectId/tasks/:taskId` | Edita tarefa já vinculada ao projeto (faturável, orçamento, valor/hora) |
| `remove_project_task` | DESTRUTIVA | `DELETE /projects/:projectId/tasks/:taskId` | Remove uma tarefa do projeto |
| `check_project_task` | escrita | `POST /projects/:projectId/tasks/:taskId/check` | Concluir tarefa |
| `uncheck_project_task` | escrita | `POST /projects/:projectId/tasks/:taskId/uncheck` | Desmarcar tarefa |

### Listas de to-dos, to-dos e tags (17)

| Ferramenta | Tipo | Rota | O que faz |
|---|---|---|---|
| `list_todo_lists` | leitura | `GET /todo-lists` | Listar listas de atividades |
| `create_todo_list` | escrita | `POST /todo-lists` | Nova lista de atividades |
| `get_todo_list` | leitura | `GET /todo-lists/:todoListId` | Obter lista de atividades |
| `update_todo_list` | escrita | `POST /todo-lists/:todoListId` | Editar lista de atividades |
| `delete_todo_list` | DESTRUTIVA | `DELETE /todo-lists/:todoListId` | Excluir lista de atividades |
| `restore_todo_list` | escrita | `POST /todo-lists/:todoListId/restore` | Restaurar lista de atividades |
| `list_todos` | leitura | `GET /todos` | Listar atividades |
| `create_todo` | escrita | `POST /todos` | Nova atividade |
| `get_todo` | leitura | `GET /todos/:todoId` | Obter atividade |
| `update_todo` | escrita | `POST /todos/:todoId` | Editar atividade |
| `delete_todo` | DESTRUTIVA | `DELETE /todos/:todoId` | Excluir atividade |
| `restore_todo` | escrita | `POST /todos/:todoId/restore` | Restaurar atividade |
| `list_todo_tags` | leitura | `GET /todo-tags` | Listar tags de atividades |
| `create_todo_tag` | escrita | `POST /todo-tags` | Nova tag de atividade |
| `get_todo_tag` | leitura | `GET /todo-tags/:todoTagId` | Obter uma tag de atividade |
| `update_todo_tag` | escrita | `POST /todo-tags/:todoTagId` | Editar uma tag de atividade |
| `delete_todo_tag` | DESTRUTIVA | `DELETE /todo-tags/:todoTagId` | Excluir uma tag de atividade |

### Comentários (4)

| Ferramenta | Tipo | Rota | O que faz |
|---|---|---|---|
| `list_comments` | leitura | `GET /comments` | Listar comentários |
| `create_comment` | escrita | `POST /comments` | Novo comentário |
| `update_comment` | escrita | `POST /comments/:commentId` | Editar um comentário |
| `delete_comment` | DESTRUTIVA | `DELETE /comments/:commentId` | Excluir um comentário |

### Clientes e tarefas (10)

| Ferramenta | Tipo | Rota | O que faz |
|---|---|---|---|
| `list_customers` | leitura | `GET /customers` | Listar clientes |
| `create_customer` | escrita | `POST /customers` | Novo cliente |
| `get_customer` | leitura | `GET /customers/:customerId` | Obter cliente |
| `update_customer` | escrita | `POST /customers/:customerId` | Editar cliente |
| `delete_customer` | DESTRUTIVA | `DELETE /customers/:customerId` | Excluir cliente |
| `list_tasks` | leitura | `GET /tasks` | Listar tarefas |
| `create_task` | escrita | `POST /tasks` | Nova tarefa |
| `get_task` | leitura | `GET /tasks/:taskId` | Obter tarefa |
| `update_task` | escrita | `POST /tasks/:taskId` | Editar tarefa |
| `delete_task` | DESTRUTIVA | `DELETE /tasks/:taskId` | Excluir tarefa |

### Usuários e equipes (34)

| Ferramenta | Tipo | Rota | O que faz |
|---|---|---|---|
| `list_users` | leitura | `GET /users` | Listar usuários |
| `create_user` | escrita | `POST /users` | Novo usuário (convite); recusa e-mail já existente |
| `get_user` | leitura | `GET /users/:userId` | Obter usuário |
| `update_user` | escrita | `POST /users/:userId` | Editar usuário |
| `archive_user` | escrita | `POST /users/:userId` | Arquiva usuário enviando só {"active": 0}; recusa se já arquivado |
| `delete_user` | DESTRUTIVA | `DELETE /users/:userId` | Excluir usuário |
| `get_user_profile_photo` | leitura | `GET /users/:userId/profile-photo` | Obter a URL da foto de perfil |
| `upload_user_profile_photo` | escrita | `POST /users/:userId/profile-photo` | Envia foto de perfil (multipart, PNG/JPEG até 2 MB) |
| `delete_user_profile_photo` | DESTRUTIVA | `DELETE /users/:userId/profile-photo` | Excluir a foto de perfil |
| `list_user_projects` | leitura | `GET /users/:userId/projects` | Listar os projetos do usuário |
| `list_user_available_projects` | leitura | `GET /users/:userId/projects-available` | Listar projetos disponíveis para o usuário |
| `add_user_projects` | escrita | `POST /users/:userId/projects` | Adicionar projetos ao usuário |
| `remove_user_projects` | DESTRUTIVA | `DELETE /users/:userId/projects` | Remover projetos do usuário |
| `list_user_assignments` | leitura | `GET /users/:userId/assignments` | Listar atribuições do usuário |
| `list_user_available_assignments` | leitura | `GET /users/:userId/assignments-available` | Listar atribuições disponíveis |
| `add_user_assignments` | escrita | `POST /users/:userId/assignments` | Adicionar atribuições |
| `remove_user_assignments` | DESTRUTIVA | `POST /users/:userId/remove-assignments` | Remover atribuições |
| `list_user_allocations` | leitura | `GET /users/:userId/allocations` | Listar folgas e férias |
| `create_user_allocation` | escrita | `POST /users/:userId/allocations` | Nova folga ou férias |
| `update_user_allocation` | escrita | `POST /users/:userId/allocations/:allocationId` | Editar uma folga ou férias |
| `delete_user_allocation` | DESTRUTIVA | `DELETE /users/:userId/allocations/:allocationId` | Excluir uma folga ou férias |
| `list_user_calendar_history` | leitura | `GET /users/:userId/calendar-history` | Listar histórico de calendário |
| `create_user_calendar_period` | escrita | `POST /users/:userId/calendar-history` | Novo período de calendário |
| `update_user_calendar_period` | escrita | `POST /users/:userId/calendar-history/:calendarHistoryId` | Editar um período de calendário |
| `delete_user_calendar_period` | DESTRUTIVA | `DELETE /users/:userId/calendar-history/:calendarHistoryId` | Excluir um período de calendário |
| `list_teams` | leitura | `GET /teams` | Listar equipes |
| `create_team` | escrita | `POST /teams` | Nova equipe |
| `get_team` | leitura | `GET /teams/:teamId` | Obter equipe |
| `update_team` | escrita | `POST /teams/:teamId` | Editar equipe |
| `delete_team` | DESTRUTIVA | `DELETE /teams/:teamId` | Excluir equipe |
| `list_team_members` | leitura | `GET /teams/:teamId/users` | Listar membros da equipe |
| `list_team_available_users` | leitura | `GET /teams/:teamId/users/available` | Lista usuários disponíveis para adicionar |
| `add_team_member` | escrita | `POST /teams/:teamId/users/:userId` | Adiciona usuário à equipe; recusa se já for membro ou não estiver disponível |
| `remove_team_member` | DESTRUTIVA | `DELETE /teams/:teamId/users/:userId` | Remove o usuário da equipe |

### Campos personalizados (14)

| Ferramenta | Tipo | Rota | O que faz |
|---|---|---|---|
| `list_custom_fields` | leitura | `GET /custom-fields` | Listar campos personalizados |
| `create_custom_field` | escrita | `POST /custom-fields` | Novo campo personalizado |
| `get_custom_field` | leitura | `GET /custom-fields/:customFieldId` | Obter campo personalizado |
| `update_custom_field` | escrita | `POST /custom-fields/:customFieldId` | Editar campo personalizado |
| `delete_custom_field` | DESTRUTIVA | `DELETE /custom-fields/:customFieldId` | Exclui o campo personalizado |
| `list_custom_field_options` | leitura | `GET /custom-fields/:customFieldId/enum-options` | Listar opções de enum |
| `create_custom_field_option` | escrita | `POST /custom-fields/:customFieldId/enum-options` | Nova opção de enum |
| `get_custom_field_option` | leitura | `GET /custom-fields/:customFieldId/enum-options/:enumOptionId` | Obter opção de enum |
| `update_custom_field_option` | escrita | `POST /custom-fields/:customFieldId/enum-options/:enumOptionId` | Editar opção de enum |
| `delete_custom_field_option` | DESTRUTIVA | `DELETE /custom-fields/:customFieldId/enum-options/:enumOptionId` | Excluir opção de enum |
| `list_project_custom_field_settings` | leitura | `GET /projects/:projectId/custom-fields-settings` | Lista a configuração de campos personalizados do projeto |
| `get_project_custom_field_setting` | leitura | `GET /projects/:projectId/custom-fields-settings/:customFieldId` | Obtém a configuração do campo personalizado no projeto |
| `save_project_custom_field_setting` | escrita | `POST /projects/:projectId/custom-fields-settings/:customFieldId` | Cria/atualiza a configuração de um campo personalizado no projeto |
| `delete_project_custom_field_setting` | DESTRUTIVA | `DELETE /projects/:projectId/custom-fields-settings/:customFieldId` | Remove a configuração do campo personalizado no projeto |

### Valores/hora (rates) (4)

| Ferramenta | Tipo | Rota | O que faz |
|---|---|---|---|
| `list_rates` | leitura | `GET /rates` | Listar taxas |
| `save_rate` | escrita | `POST /rates` | Salvar uma taxa |
| `get_latest_rate` | leitura | `GET /rates/latest` | Obter a taxa vigente |
| `delete_latest_rate` | DESTRUTIVA | `DELETE /rates/latest` | Excluir a taxa vigente |

### Calendários e feriados (9)

| Ferramenta | Tipo | Rota | O que faz |
|---|---|---|---|
| `list_calendars` | leitura | `GET /calendars` | Listar calendários |
| `create_calendar` | escrita | `POST /calendars` | Novo calendário |
| `get_calendar` | leitura | `GET /calendars/:calendarId` | Obter um calendário |
| `update_calendar` | escrita | `POST /calendars/:calendarId` | Editar um calendário |
| `delete_calendar` | DESTRUTIVA | `DELETE /calendars/:calendarId` | Excluir um calendário |
| `list_holidays` | leitura | `GET /calendars/:calendarId/holidays` | Listar feriados |
| `create_holiday` | escrita | `POST /calendars/:calendarId/holidays` | Novo feriado |
| `update_holiday` | escrita | `POST /calendars/:calendarId/holidays/:holidayId` | Editar um feriado |
| `delete_holiday` | DESTRUTIVA | `DELETE /calendars/:calendarId/holidays/:holidayId` | Excluir um feriado |

### Webhooks (6)

| Ferramenta | Tipo | Rota | O que faz |
|---|---|---|---|
| `list_webhook_event_types` | leitura | `GET /webhook-subscriptions/event-types` | Lista os tipos de evento de webhook |
| `list_webhook_subscriptions` | leitura | `GET /webhook-subscriptions` | Lista assinaturas de webhook (secrets ocultos) |
| `create_webhook_subscription` | escrita | `POST /webhook-subscriptions` | Cria assinatura de webhook (URL https, eventos validados; secret retornado só aqui) |
| `update_webhook_subscription` | escrita | `POST /webhook-subscriptions/:webhookSubscriptionId` | Edita assinatura de webhook; regenerate_secret=true gera novo secret |
| `delete_webhook_subscription` | DESTRUTIVA | `DELETE /webhook-subscriptions/:webhookSubscriptionId` | Exclui a assinatura de webhook |
| `list_webhook_deliveries` | leitura | `GET /webhook-deliveries` | Lista as entregas de webhook |

