# FlowCRM — Documentação-mãe

Manual de fundação para qualquer projeto derivado (remix) do FlowCRM. Leia em ordem; cada documento assume os anteriores.

## Índice

1. [Arquitetura](./01-architecture.md) — Stack, camadas, princípios SOLID/TDD, pastas
2. [Schema do banco](./02-database-schema.md) — Tabelas, RLS, funções, triggers
3. [Auth & Onboarding](./03-auth-and-onboarding.md) — **Crítico.** Guardrail obrigatório pós-remix
4. [Módulos](./04-modules.md) — Catálogo funcional (Contatos, Pipeline, AI, Automações, etc.)
5. [Integrações](./05-integrations.md) — Lovable AI, Resend, Slack, API pública
6. [Convenções](./06-conventions.md) — Naming, design system, rotas, i18n PT-BR
7. [Edge Functions](./07-edge-functions.md) — Contratos, secrets, payloads
8. [Checklist pós-remix](./08-remix-checklist.md) — Validações obrigatórias
9. [Estendendo o projeto](./09-extending.md) — Receitas para nova entidade/módulo/integração

## Como usar este guia

- **Remixou o projeto agora?** Vá direto ao [checklist pós-remix](./08-remix-checklist.md).
- **Vai adicionar um módulo?** Leia [convenções](./06-conventions.md) + [estendendo](./09-extending.md).
- **Precisa entender o domínio?** Comece em [arquitetura](./01-architecture.md) e [módulos](./04-modules.md).

## Princípios não-negociáveis

- **Onboarding obrigatório**: todo usuário novo vê o `OnboardingModal` em `/dashboard`. Detalhes em [03](./03-auth-and-onboarding.md).
- **RLS sempre habilitado** em toda tabela nova, com isolamento por `org_id`.
- **Migrations versionadas**: nunca editar migration já aplicada.
- **Sem `next-themes`** — use o `ThemeContext` próprio.
- **Textos em PT-BR**, código em inglês.
- **Lovable AI Gateway por padrão** para qualquer chamada de IA (não pedir API key do usuário).
