// Dev-time: writes the tools tables (EN + pt-BR) grouped by area into docs/tools.en.md and docs/tools.pt.md.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const { TOOLS } = await import('../server/index.mjs');
const pt = JSON.parse(readFileSync(new URL('../spec/openapi.pt.json', import.meta.url)));
const ptSummary = (route) => { const [m, p] = route.split(' '); return pt.paths[p]?.[m.toLowerCase()]?.summary; };
const AREA_PT = { Time: 'Lançamentos de horas', Reports: 'Relatórios', 'Timesheet Approvals': 'Aprovação de timesheets', Projects: 'Projetos, membros e tarefas do projeto', 'To-dos': 'Listas de to-dos, to-dos e tags', Comments: 'Comentários', 'Customers & Tasks': 'Clientes e tarefas', 'Users & Teams': 'Usuários e equipes', 'Custom Fields': 'Campos personalizados', Rates: 'Valores/hora (rates)', Calendars: 'Calendários e feriados', Webhooks: 'Webhooks' };
const KIND_PT = { READ: 'leitura', WRITE: 'escrita', DESTRUCTIVE: 'DESTRUTIVA' };
const PT_OVERRIDE = {
  list_time_entries: 'Lista lançamentos no formato estável TimeEntry (via relatório detalhado)',
  get_detailed_report: 'Relatório detalhado com todos os filtros e o registro completo',
  add_project_member: 'Adiciona usuário ao projeto; recusa se já for membro ou não estiver na lista de disponíveis',
  update_project_member: 'Edita membro existente (gestor, faturável, valor/hora, orçamento); recusa não-membros',
  add_project_task: 'Vincula tarefa ao projeto; recusa se já vinculada',
  update_project_task: 'Edita tarefa já vinculada ao projeto (faturável, orçamento, valor/hora)',
  archive_user: 'Arquiva usuário enviando só {"active": 0}; recusa se já arquivado',
  create_user: 'Novo usuário (convite); recusa e-mail já existente',
  add_team_member: 'Adiciona usuário à equipe; recusa se já for membro ou não estiver disponível',
  create_webhook_subscription: 'Cria assinatura de webhook (URL https, eventos validados; secret retornado só aqui)',
  update_webhook_subscription: 'Edita assinatura de webhook; regenerate_secret=true gera novo secret',
  list_webhook_subscriptions: 'Lista assinaturas de webhook (secrets ocultos)',
  upload_user_profile_photo: 'Envia foto de perfil (multipart, PNG/JPEG até 2 MB)',
  reject_timesheet: 'Rejeita timesheet com comentário obrigatório',
  save_project_custom_field_setting: 'Cria/atualiza a configuração de um campo personalizado no projeto',
};
const enSummary = (t) => t.description.replace(/^(READ\.|WRITE \(changes live data — confirm with the user first\)\.|DESTRUCTIVE — confirm explicitly with the user first; the server asks the user on an approval card \(MCP elicitation\) when the client supports it, otherwise requires confirm: true\.)\s*/, '').replace(/\s*Route: .*$/, '');
const areas = [...new Set(TOOLS.map((t) => t.area))];
let en = '', ptmd = '';
for (const a of areas) {
  const ts = TOOLS.filter((t) => t.area === a);
  en += `### ${a} (${ts.length})\n\n| Tool | Kind | Route | What it does |\n|---|---|---|---|\n`;
  ptmd += `### ${AREA_PT[a] || a} (${ts.length})\n\n| Ferramenta | Tipo | Rota | O que faz |\n|---|---|---|---|\n`;
  for (const t of ts) {
    en += `| \`${t.name}\` | ${t.kind} | \`${t.route}\` | ${enSummary(t).replace(/\|/g, '\\|')} |\n`;
    ptmd += `| \`${t.name}\` | ${KIND_PT[t.kind]} | \`${t.route}\` | ${(PT_OVERRIDE[t.name] || ptSummary(t.route) || enSummary(t)).replace(/\|/g, '\\|')} |\n`;
  }
  en += '\n'; ptmd += '\n';
}
const c = { READ: 0, WRITE: 0, DESTRUCTIVE: 0 }; TOOLS.forEach((t) => c[t.kind]++);
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/tools.en.md', import.meta.url), en);
writeFileSync(new URL('../docs/tools.pt.md', import.meta.url), ptmd);
console.log(JSON.stringify({ total: TOOLS.length, ...c, areas }));
process.exit(0);
