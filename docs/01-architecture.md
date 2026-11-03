# 01 — Arquitetura

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript estrito + Vite 5 |
| Styling | Tailwind CSS v3 + shadcn/ui + tokens HSL semânticos |
| Estado servidor | TanStack Query 5 (staleTime 5min, gcTime 10min, refetchOnWindowFocus off) |
| Estado cliente | React Context (Auth, Theme) — sem Redux/Zustand |
| Backend | Lovable Cloud (Supabase: Postgres + Auth + Realtime + Edge Functions Deno) |
| AI | Lovable AI Gateway (sem API key do usuário) |
| Email | Resend |
| Roteamento | react-router-dom v6 com lazy + Suspense por rota |
| Testes | Vitest + RTL (frontend), Deno.test (backend) |

## Camadas

```
pages/          # Rotas — orquestram hooks, não contêm lógica de negócio
  ↓
components/     # UI reutilizável (crm/, layout/, onboarding/, setup/, ui/)
  ↓
hooks/          # Lógica de estado/efeito encapsulada (useOrg, useDebounce, ...)
  ↓
contexts/       # Auth, Theme — apenas o que precisa ser global
  ↓
integrations/   # Cliente Supabase tipado (NÃO EDITAR)
  ↓
lib/            # Utilidades puras (audit, utils)
```

## Estrutura de pastas

```
src/
├── App.tsx                      # Routes + Providers
├── main.tsx                     # Bootstrap
├── index.css                    # Tokens HSL + base Tailwind
├── pages/                       # 1 arquivo por rota (lazy)
├── components/
│   ├── ui/                      # shadcn (não tocar exceto pra variantes)
│   ├── layout/                  # AppLayout, AppHeader, AppSidebar, MobileBottomNav
│   ├── crm/                     # Domínio CRM (Drawers, Kanban, AICopilot, ...)
│   ├── onboarding/              # OnboardingModal + 6 Steps + persistence
│   └── setup/                   # Wizard fullscreen /setup
├── contexts/                    # AuthContext, ThemeContext
├── hooks/                       # use-mobile, useOrg, useDebounce, ...
├── integrations/supabase/       # client.ts + types.ts (AUTO-GERADOS — não editar)
└── lib/                         # audit.ts, utils.ts

supabase/
├── config.toml                  # NÃO editar project_id
├── functions/                   # Edge Functions (kebab-case)
└── migrations/                  # Versionadas YYYYMMDDHHMMSS_*.sql

.lovable/
├── consolidated_schema.sql      # Schema completo (referência)
└── plan.md                      # Plano da iteração atual
```

## Princípios obrigatórios

Aderem ao Workspace Knowledge (constituição do workspace):

- **SOLID** em toda camada; componente React > 150 linhas, função > 30 linhas, arquivo > 200 linhas = sinal pra dividir.
- **TDD** Red → Green → Refactor. Teste descreve comportamento observável.
- **Imutabilidade** por padrão (`const`, spread, map/filter).
- **`strict: true`** sem `any` não-justificado. Discriminated unions pra estado.
- **Erros explícitos** — nunca `catch {}` silencioso.

## Pontos onde NÃO mexer

| Arquivo | Motivo |
|---------|--------|
| `src/integrations/supabase/client.ts` | Auto-gerado pelo Lovable Cloud |
| `src/integrations/supabase/types.ts` | Auto-gerado a partir do schema |
| `.env` | Auto-populado pelo Cloud |
| `supabase/config.toml` (project_id) | Identidade do projeto |
| Migrations já aplicadas | Criar nova migration ao invés de editar |

## Code splitting

Toda página é `lazy()` em `App.tsx`, envolvida em `<SuspenseRoute>` que combina `ErrorBoundary + Suspense`. Não importar pages estaticamente.

## Performance

- TanStack Query com `staleTime: 5min` para reduzir round-trips.
- Listas longas: virtualização (`@tanstack/react-virtual`).
- Realtime apenas onde há colaboração simultânea (Kanban de deals).
- `memo()` em componentes que recebem props estáveis e re-renderizam frequente.
