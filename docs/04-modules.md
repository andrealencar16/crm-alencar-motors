# 04 — Módulos funcionais

Catálogo de módulos com rota, componentes principais e tabelas envolvidas.

## Geral

### Dashboard — `/dashboard`
- **Componentes**: `pages/Dashboard.tsx`, `DashboardAIChat`, `AIInsightsPanel`, `OnboardingChecklist`, `NotificationBell`.
- **Dados**: KPIs agregados de `deals`, `activities`, `sales_goals`.
- **Charts**: Recharts. Forecasting 80/50/30% probabilidade.

### Contatos — `/contacts`
- `ContactsKanbanByOwner`, `ContactCreateModal`, `ContactDrawer`, `CSVImportModal`.
- Tabelas: `contacts`, `contact_tags`, `companies` (FK), `custom_field_definitions`.
- Relação 1:N com companies. Industry como select customizável (`useIndustries`).
- DnD por owner.

### Empresas — `/companies`
- `CompanyCreateModal`, `CompanyDrawer`.
- Tabelas: `companies`, `contacts` (filhos).

### Negócios — `/deals` + `/deals/:id`
- `DealsKanban` (dnd-kit), `DealsList`, `DealsFilters`, `DealsForecast`, `DealQualification` (BANT), `DealDetail`.
- Tabelas: `deals`, `pipelines`, `pipeline_stages`, `deal_tags`, `loss_reasons`.
- **Realtime habilitado** para sync entre usuários no Kanban.
- 3 visualizações: Kanban, Lista, Forecast.

### Atividades — `/activities`
- Hierarquia estrita: **Deal → Contact → Company**. Auto-preenche ao selecionar deal.
- Tabela densa estilo Pipedrive.

### Tarefas — `/tasks`
- Página dedicada (removida do sidebar antigo).
- Filtros: hoje, atrasadas, próximas, concluídas.
- `TaskPanel` em drawer lateral.

### Em Risco (overlay)
- `AtRiskPanel` (drawer no sidebar).
- Tabela: `risk_rules` (gatilhos custom de inatividade/follow-up).
- `RiskRulesManager` em settings.

## Email

### Caixa de Entrada — `/inbox`
- Tabelas: `emails`, `email_connections`.
- Sync inicial: Edge `gmail-initial-sync`.

### Templates — `/email-templates`
- `email_templates` com variáveis interpoladas.

### Sequências — `/email-sequences`
- `email_sequences`, `email_sequence_steps`, `email_sequence_enrollments`.

### Envio
- `EmailComposeModal` — auto-preenche Deal → Contact.
- Backend: Resend via `integration_configs`.

## Analytics

### Metas — `/sales-goals`
- `sales_goals` — metas mensais por owner ou equipe (revenue/deals/activities/contacts).

### Lead Scoring — `/lead-scoring`
- `lead_scoring_rules` + `lead_score_history`.
- Eventos: email open/click, page visit (via `tracking_events`).

### Relatórios — `/reports`
- Recharts. Filtros por período, owner, pipeline.

### Automações — `/automations`
- Visual builder Trigger → Conditions → Actions.
- Tabelas: `automations`, `automation_logs`.
- Execução: pg_cron + Edge `process-automation`.

## Admin

### Equipe — `/team`
- RBAC via `role_permissions` (matriz que sobrescreve defaults).
- Convite via magic link → `invitations` → Edge `invite-member`.

### Configurações — `/settings`
- Pipelines, custom fields, loss reasons, signatures.

### Integrações — `/settings/integrations`
- UI sobre `integration_configs`. Validações via `validate-anthropic-key`, `validate-resend-key`.

### Segurança — `/settings/security`
- 2FA/TOTP, audit log viewer, `org_secrets` (write-only inputs).

## AI

### Copilot (global)
- `AICopilot` flutuante em `AppLayout`.
- Edge: `ai-copilot` (Lovable AI Gateway).
- Contexto: deal/contact ativo, histórico recente.

### Insights & Sales Manager
- `ai-insights`, `ai-sales-manager`, `ai-email` — diferentes prompts/modelos.

## Setup Wizard — `/setup`
- Rota **fullscreen fora de AppLayout**.
- 7 steps: Organization, Pipeline, AI, Resend, Slack, Contacts, Complete.
- Alternativa ao modal para reconfiguração explícita.

## Referências de memória

Detalhes de cada feature vivem em `mem://features/*` (ver `mem://index.md`). Consultar antes de modificar uma feature existente.
