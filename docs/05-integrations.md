# 05 — Integrações

## Lovable AI Gateway (padrão para IA)

**Sempre usar primeiro.** Não pede API key do usuário, modelos cobertos pelo `LOVABLE_API_KEY` (auto-provisionado).

Modelos disponíveis (ver system prompt completo):
- `google/gemini-2.5-pro` — raciocínio pesado + multimodal
- `google/gemini-2.5-flash` — balanceado custo/qualidade
- `google/gemini-2.5-flash-lite` — classificação/sumário rápido
- `openai/gpt-5`, `gpt-5-mini`, `gpt-5-nano`
- Famílias `gpt-5.4`, `gpt-5.5` para raciocínio avançado
- Image: `google/gemini-2.5-flash-image` (Nano Banana)

Uso em Edge Function:
```ts
const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
});
```

**Tratar 429 (rate limit) e 402 (créditos esgotados)** com mensagens claras ao usuário.

## Resend (email transacional + envio do CRM)

- Config em `integration_configs` (`provider='resend'`) com `from_email` e `api_key`.
- Validação: Edge `validate-resend-key`.
- Templates de email em `email_templates` com interpolação.
- Domínio próprio configurável via Lovable Email.

## Slack (notificações)

- Edge `slack-connect` faz OAuth.
- Config em `integration_configs` (`provider='slack'`) com `workspace`, `bot_token`, `channel`.
- Teste de envio: `slack-send-test`.

## API pública REST — `/functions/v1/public-api`

Auth: `Authorization: Bearer fc_xxx` (chave em `api_keys`).

Endpoints:
```
GET    /public-api/contacts
POST   /public-api/contacts
PUT    /public-api/contacts/:id
DELETE /public-api/contacts/:id
```
Entidades suportadas: `contacts`, `companies`, `deals`, `activities`.

**Rate limiting** por org_id da api_key.

## Webhooks de entrada — `/functions/v1/inbound-webhook?org_id=...`

POST JSON `{ entity, action, data }`. Entidades: `contact`, `company`, `deal`, `activity`. Actions: `create`, `update`. Sem auth — `org_id` no querystring identifica.

## Tracking (pixel/snippet) — `/functions/v1/tracking`

Snippet JS injetado em sites externos posta eventos em `tracking_events`. Alimenta lead scoring.

## Health — `/functions/v1/health`

GET retorna `{ status, db_latency_ms, timestamp }`. Útil para uptime monitors.

## Google Calendar / Gmail (opcional)

- `google_oauth_tokens` armazena tokens.
- Edge `gmail-initial-sync` puxa últimos N emails.
- Atualmente parcial — verificar se o remix precisa.

## WhatsApp (legado/desativado)

Tabelas `whatsapp_*` permanecem no schema mas a integração foi removida (Evolution API). Não usar em projetos novos sem reativar manualmente.

## Secrets necessárias por integração

| Integração | Secrets (Edge Function env) |
|------------|------------------------------|
| Lovable AI | `LOVABLE_API_KEY` (auto) |
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (auto) |
| Resend | armazenada em `integration_configs.config.api_key` |
| Slack | armazenada em `integration_configs.config.bot_token` |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Anthropic (legado) | `ANTHROPIC_API_KEY` — preferir Lovable AI |

Adicionar/atualizar via tool `secrets--add_secret`. Nunca expor service role no frontend.
