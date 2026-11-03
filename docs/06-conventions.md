# 06 — Convenções

## Naming

| Artefato | Convenção | Exemplo |
|----------|-----------|---------|
| Componente React | PascalCase | `DealsKanban.tsx` |
| Hook custom | `useCamelCase` | `useDebounce.ts` |
| Página | PascalCase | `pages/Dashboard.tsx` |
| Tabela Postgres | snake_case | `pipeline_stages` |
| Coluna | snake_case | `created_at` |
| Edge Function | kebab-case | `slack-connect` |
| Migration | `YYYYMMDDHHMMSS_descricao.sql` | `20260420185454_add_role.sql` |
| Booleano | `is_/has_/should_/can_` | `is_active`, `has_paid` |

## Design system

### Tokens HSL semânticos

Todos os tokens vivem em `src/index.css` como HSL puro (sem `hsl()` wrapper):
```css
:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --primary: 221 83% 53%;
  /* ... */
}
```

Tailwind referencia via `tailwind.config.ts`. **Nunca usar cores diretas (`text-white`, `bg-blue-500`)** em componentes — sempre semantic tokens (`bg-primary`, `text-foreground`).

### Tema

- **Inspiração**: Attio + Linear (light, minimal, denso).
- **Default**: light theme. Persistido em `localStorage` como `fc-theme`.
- **Dark mode**: opt-in via `ThemeContext`.
- **NUNCA usar `next-themes`** (conflita com nosso ThemeProvider e quebra hidratação).
- **Fonte**: Inter (carregada via `index.html`).

### shadcn/ui

- Componentes em `src/components/ui/` — não editar diretamente. Adicionar variantes via CVA.
- Para customização, criar wrapper em `src/components/crm/`.

## Rotas

| Rota | Acesso | Layout |
|------|--------|--------|
| `/` | público | `Login` standalone |
| `/reset-password` | público | standalone |
| `/setup` | autenticado | **fullscreen, fora de AppLayout** |
| `/dashboard` e demais | autenticado | dentro de `AppLayout` (sidebar + header) |
| `*` | qualquer | `NotFound` |

**Regra**: `/` é estritamente auth. Pós-login redireciona para `/dashboard`.

## i18n

- **UI em PT-BR** (textos, labels, mensagens de erro, toasts).
- **Código em inglês** (nomes de variáveis, funções, comentários técnicos).
- **Datas/moedas formatadas com `Intl`** no display, UTC no DB.
- **Moeda padrão BRL** (configurável em `organizations.settings.default_currency`).

## React Query

- `staleTime: 5 * 60 * 1000` (5min) global.
- `gcTime: 10 * 60 * 1000`.
- `refetchOnWindowFocus: false`.
- **Query keys arrays** começando pela entidade: `['deals', orgId, filters]`.
- **Invalidate seletivo** após mutation: `queryClient.invalidateQueries({ queryKey: ['deals'] })`.

## Forms

- **react-hook-form + Zod** para validação.
- Mensagens de erro em PT-BR.
- Sanitizar entradas livres com **DOMPurify** antes de renderizar HTML.

## Acessibilidade

- Todo input tem `<label>` associado.
- Modais usam `Dialog` do shadcn (foco trap automático).
- Atalhos: `Cmd+K` (search), `N` (novo), `D` (deal), `T` (task).

## Logging & erros

- `console.warn` para condições recuperáveis com contexto.
- `console.error` apenas para erros não tratados.
- Toasts (`sonner`) para feedback ao usuário — nunca expor stack trace.
- `ErrorBoundary` envolvendo cada rota (`SuspenseRoute`).

## Mobile

- `useIsMobile` para alternar UX.
- `MobileBottomNav` substitui sidebar em telas pequenas.
- FAB para ação primária da página.

## Segurança no código

- Inputs sensíveis (api keys, tokens) **write-only** na UI: mostra `••••••••` + permite sobrescrever, nunca lê de volta.
- `service_role` **apenas em Edge Functions**.
- Validar `org_id` no backend mesmo com RLS — defesa em profundidade.
