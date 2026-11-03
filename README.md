# FlowCRM

CRM B2B completo com AI nativa, pipeline visual e automações.

> **📚 Vai derivar (remixar) este projeto?** Leia primeiro [`docs/README.md`](./docs/README.md) — manual de fundação com schema, guardrails de auth/onboarding, convenções e checklist pós-remix obrigatório.

## Stack

- **Frontend:** React 18 + TypeScript + Tailwind CSS + Vite
- **Backend:** Lovable Cloud (Supabase — PostgreSQL, Auth, Realtime, Edge Functions)
- **AI:** Claude via Edge Function `ai-copilot`
- **Componentes:** shadcn/ui, Recharts, @dnd-kit

## Instalação Local

```bash
# Clonar o repositório
git clone <YOUR_GIT_URL>
cd flowcrm

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais Supabase

# Iniciar servidor de desenvolvimento
npm run dev
```

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|------------|-----------|
| `VITE_SUPABASE_URL` | ✅ | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Chave pública (anon) do Supabase |
| `VITE_SUPABASE_PROJECT_ID` | ✅ | ID do projeto |

### Secrets (Edge Functions)

Configurar via Lovable Cloud:

| Secret | Uso |
|--------|-----|
| `ANTHROPIC_API_KEY` | AI Copilot (Claude) |
| `GOOGLE_CLIENT_ID/SECRET` | Google Calendar |
| `SLACK_BOT_TOKEN` | Notificações Slack |
| `EVOLUTION_API_URL/KEY` | WhatsApp |
| `SENTRY_DSN` | Monitoramento de erros |

## Módulos

- **Dashboard** — KPIs, gráficos, métricas em tempo real
- **Contatos & Empresas** — CRUD completo, filtros, tags, lead scoring
- **Pipeline Kanban** — Drag-and-drop, 3 visualizações, qualificação BANT
- **Atividades** — Calls, emails, reuniões, notas, tarefas
- **Email** — Sync Gmail/Outlook, templates, sequências, tracking
- **Automações** — Builder visual trigger→conditions→actions
- **AI Copilot** — Chat contextual, insights, geração de email
- **Integrações** — Slack, Google Calendar, WhatsApp, Zapier/Make, API REST
- **Configurações** — Pipelines, campos customizados, RBAC, billing

## Segurança

- RLS em todas as tabelas (isolamento por `org_id`)
- RBAC: Owner / Admin / Member
- Audit log de ações sensíveis
- Sanitização de inputs (DOMPurify)
- Error boundaries por componente
- Detecção de modo offline

## API Pública

Endpoints disponíveis:

```
GET    /functions/v1/public-api/contacts
POST   /functions/v1/public-api/contacts
PUT    /functions/v1/public-api/contacts/:id
DELETE /functions/v1/public-api/contacts/:id
```

Autenticação: `Authorization: Bearer fc_xxx`

Entidades: `contacts`, `companies`, `deals`, `activities`

## Health Check

```
GET /functions/v1/health
```

Retorna status do banco, latência e timestamp.

## Deploy

1. Abra o projeto no [Lovable](https://lovable.dev)
2. Clique em **Share → Publish**
3. (Opcional) Conecte um domínio customizado em **Settings → Domains**

## Licença

Proprietário — todos os direitos reservados.
