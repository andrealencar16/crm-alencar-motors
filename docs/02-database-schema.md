# 02 — Schema do banco

Schema completo vive em `.lovable/consolidated_schema.sql`. Toda alteração estrutural exige nova migration versionada em `supabase/migrations/`. **Nunca editar migration já aplicada.**

## Modelo de tenancy

Single-tenant white-label na UI, multi-tenant no DB. Todo dado de domínio carrega `org_id` e RLS filtra por `org_id` do usuário autenticado.

```
auth.users (Supabase)
    │
    ├── profiles (1:1)          ← onboarding_completed, onboarding_step, org_id
    │
    └── user_roles (1:N)        ← role: owner | admin | member
            │
            └── organizations   ← settings JSONB (currency, timezone, segment, ...)
```

## Entidades de domínio

### CRM core
- **organizations** — tenant raiz; `settings` JSONB guarda `segment`, `default_currency`, etc.
- **profiles** — espelho de `auth.users` + `onboarding_completed`, `onboarding_step`, `org_id`.
- **user_roles** — `(user_id, org_id, role)` com enum `app_role`.
- **companies** — empresas/contas. Relaciona 1:N com `contacts`.
- **contacts** — pessoas. FK opcional para `companies`.
- **pipelines** + **pipeline_stages** — funil customizável por org. Default criado no onboarding.
- **deals** — negócios no funil; FK para `pipeline_stages`, `contacts`, `companies`.
- **activities** — call/email/meeting/note/task. Hierarquia obrigatória Deal → Contact → Company.
- **tasks** (via `activities` com `type='task'`) — listadas em `/tasks`.
- **tags**, **contact_tags**, **deal_tags** — taxonomia compartilhada por org.

### Email
- **email_connections** — provedor sincronizado (Gmail/Outlook).
- **emails** — mensagens sincronizadas e enviadas.
- **email_templates** — modelos com variáveis.
- **email_sequences** + **email_sequence_steps** + **email_sequence_enrollments** — cadências.
- **email_signatures** — por usuário.

### Inteligência & automação
- **lead_scoring_rules** + **lead_score_history** — pontuação dinâmica.
- **automations** + **automation_logs** — trigger → conditions → actions.
- **segments** — filtros salvos.
- **risk_rules** — gatilhos custom para "deal em risco".
- **sales_goals** — metas mensais por owner/equipe.
- **tracking_events** — eventos vindos do pixel/snippet público.

### Configuração & ops
- **integration_configs** — config de cada provedor (Resend, Slack, Anthropic, ...).
- **api_keys** — chaves `fc_xxx` da API pública.
- **webhooks** — endpoints de saída.
- **invitations** — convite por magic link; trigger `mark_invitation_accepted`.
- **custom_field_definitions** — campos dinâmicos por entidade.
- **teams** + **team_members** — agrupamento opcional.
- **role_permissions** — matriz RBAC (sobrescreve defaults por role).
- **notification_preferences** — por usuário.
- **loss_reasons** — motivos de perda configuráveis.
- **onboarding_progress** — passos já completados (suporta resume).
- **audit_logs** — ações sensíveis com `actor`, `entity`, `before/after`.
- **org_secrets** — segredos por org (alternativa a `vault.secrets` para chaves não-críticas).

### Outras (legado/opcional)
- **whatsapp_*** — integração WhatsApp (atualmente desativada, mantida no schema).
- **google_oauth_tokens** — tokens Google Calendar/Gmail.

## Funções (Postgres)

Todas com `SECURITY DEFINER` + `SET search_path = public` quando aplicável.

| Função | Propósito |
|--------|-----------|
| `handle_new_user()` | **Trigger AFTER INSERT em auth.users.** Cria profile, vincula org (1º vira owner), atribui role. Ver [03](./03-auth-and-onboarding.md). |
| `has_role(user, org, role)` | Checagem de RBAC sem recursão de RLS. |
| `user_belongs_to_org(user, org)` | Predicado para policies. |
| `get_user_org_id(user)` | Resolve `org_id` do usuário. |
| `create_organization_for_user(user, name, slug, settings)` | Cria org + role owner + vincula profile. |
| `initialize_org_owner(org, user)` | Idempotente — garante role + vínculo. |
| `mark_invitation_accepted()` | Trigger ao criar profile, marca convite usado. |
| `update_updated_at_column()` | Trigger genérico para `updated_at`. |

## Triggers obrigatórios

```sql
-- CRÍTICO: sem isto, signup não cria profile/org
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## RLS — política padrão

Para qualquer tabela nova com `org_id`:

```sql
ALTER TABLE public.minha_tabela ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation_select" ON public.minha_tabela
FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "org_isolation_write" ON public.minha_tabela
FOR ALL TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()))
WITH CHECK (org_id = public.get_user_org_id(auth.uid()));
```

Para policies sensíveis a role, usar `public.has_role(auth.uid(), org_id, 'admin')`.

## Convenções de coluna

- PK: `id uuid default gen_random_uuid()`.
- Timestamps: `created_at timestamptz default now()` e `updated_at timestamptz default now()` com trigger `update_updated_at_column()`.
- Dinheiro: `numeric(14,2)`.
- Datas de domínio: `timestamptz` em UTC; converter no display.
- Enum quando o domínio é fechado (`app_role`, `activity_type`).
