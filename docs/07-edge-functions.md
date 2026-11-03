# 07 — Edge Functions

Todas em `supabase/functions/`, runtime Deno. Deploy automático via Lovable. CORS habilitado em todas.

| Function | Método | Auth | Propósito | Secrets |
|----------|--------|------|-----------|---------|
| `health` | GET | público | Status + latência do DB | — |
| `ai-copilot` | POST | JWT user | Chat contextual do Copilot | `LOVABLE_API_KEY` |
| `ai-email` | POST | JWT user | Geração de email com IA | `LOVABLE_API_KEY` |
| `ai-insights` | POST | JWT user | Insights sobre deals/atividades | `LOVABLE_API_KEY` |
| `ai-sales-manager` | POST | JWT user | "Gerente de vendas" virtual | `LOVABLE_API_KEY` |
| `validate-anthropic-key` | POST | JWT user | Testa chave Anthropic (legado) | — |
| `validate-resend-key` | POST | JWT user | Testa chave Resend antes de salvar | — |
| `slack-connect` | GET/POST | JWT user | OAuth Slack | — |
| `slack-send-test` | POST | JWT user | Envia mensagem teste | — |
| `invite-member` | POST | JWT user (admin/owner) | Cria invitation + envia magic link | service role |
| `gmail-initial-sync` | POST | JWT user | Importa últimos N emails Gmail | `GOOGLE_*` |
| `process-automation` | POST | service | Executa automation enfileirada (pg_cron) | service role |
| `public-api` | GET/POST/PUT/DELETE | Bearer `fc_xxx` | CRUD REST público | service role |
| `inbound-webhook` | POST | querystring `org_id` | Recebe dados externos | service role |
| `tracking` | GET/POST | público (CORS) | Pixel/snippet de eventos | service role |

## Padrão de implementação

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. Auth (se JWT): extrair user de Authorization header via supabase.auth.getUser(jwt)
    // 2. Validar payload (zod recomendado)
    // 3. Resolver org_id e checar permissão
    // 4. Operação com service role OR client com JWT do user
    // 5. Retornar JSON

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("function-name error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

## config.toml por função

Funções públicas (sem JWT) precisam de bloco em `supabase/config.toml`:

```toml
[functions.health]
verify_jwt = false

[functions.tracking]
verify_jwt = false

[functions.inbound-webhook]
verify_jwt = false

[functions.public-api]
verify_jwt = false  # auth própria via fc_xxx
```

**Não alterar `project_id`.**

## Princípios

- **service_role nunca volta ao cliente.**
- **Sempre validar `org_id`** mesmo quando RLS protege — defesa em profundidade.
- **Tratar 429/402 do Lovable AI** com mensagem clara.
- **Logs estruturados**: `console.log` com objeto JSON, não strings concatenadas.
- **Idempotência** em webhooks/automations: aceitar re-entrega sem duplicar efeito.
- **Timeouts**: chamadas externas com `AbortController` + timeout < 30s.
