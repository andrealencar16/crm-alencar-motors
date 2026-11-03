// ============================================================================
// nina-webhook — endpoint público (verify_jwt=false) para leads da Nina Automotiva.
//
// Autenticação:
//   - Header X-Nina-Timestamp: unix seconds (string). Janela aceita: ±300s.
//   - Header X-Nina-Signature: HMAC-SHA256( `${timestamp}.${rawBody}`, secret )
//     em hex lowercase. Prefixo "sha256=" é tolerado.
//   - O secret vem do Vault (vault_get('nina_webhook_secret')), com fallback
//     pra env NINA_WEBHOOK_SECRET em dev local.
//
// Assinar APENAS o body é vulnerável a replay (CWE-294). O timestamp entra
// dentro do conteúdo assinado pra que mensagens antigas com assinatura
// válida sejam rejeitadas pelo drift de 5 min. Padrão Stripe/GitHub/Slack.
//
// Exemplo (Node):
//   const ts = Math.floor(Date.now() / 1000).toString();
//   const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
//   headers: { 'X-Nina-Timestamp': ts, 'X-Nina-Signature': sig }
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nina-signature, x-nina-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type NinaContato = {
  nome: string;
  telefone?: string;
  email?: string;
  cpf?: string;
  preferred_brand?: string;
};

type NinaVehicleInterest = {
  marca?: string;
  modelo?: string;
  ano_target?: number;
};

type NinaPayload = {
  org_id: string;
  contato: NinaContato;
  lead_summary?: string;
  qualification_score?: number;
  vehicle_interest?: NinaVehicleInterest;
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function hexFromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return hexFromBuffer(sig);
}

function splitName(full: string): { first: string; last: string | null } {
  const parts = (full ?? "").trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { first: "Lead Nina", last: null };
  const first = parts.shift()!;
  const last = parts.length > 0 ? parts.join(" ") : null;
  return { first, last };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "Method not allowed" }, 405);

  try {
    const rawBody = await req.text();
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Resolve secret (Vault preferencial; fallback env NINA_WEBHOOK_SECRET)
    let secret: string | null = null;
    try {
      const { data: vaultSecret, error: vErr } = await admin.rpc("vault_get", {
        p_key: "nina_webhook_secret",
      });
      if (!vErr && typeof vaultSecret === "string" && vaultSecret.length > 0) {
        secret = vaultSecret;
      }
    } catch (e) {
      console.error("[nina-webhook] vault_get falhou:", e);
    }
    if (!secret) {
      const env = Deno.env.get("NINA_WEBHOOK_SECRET");
      if (env && env.length > 0) secret = env;
    }
    if (!secret || secret === "CHANGE-ME-IN-PRODUCTION") {
      console.error("[nina-webhook] secret indisponível ou placeholder");
      return jsonResp({ error: "Webhook secret não configurado" }, 503);
    }

    // 2. Replay protection: timestamp obrigatório, janela de 5 min
    const tsHeader = req.headers.get("X-Nina-Timestamp");
    if (!tsHeader) return jsonResp({ error: "Missing timestamp" }, 401);
    const ts = Number(tsHeader);
    if (!Number.isFinite(ts)) return jsonResp({ error: "Invalid timestamp" }, 401);
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - ts) > 300) {
      return jsonResp({ error: "Timestamp out of window" }, 401);
    }

    // 3. Valida assinatura sobre timestamp + "." + rawBody
    const sigHeader = req.headers.get("X-Nina-Signature");
    if (!sigHeader) return jsonResp({ error: "Missing signature" }, 401);
    const expected = await hmacSha256Hex(secret, `${tsHeader}.${rawBody}`);
    const received = sigHeader.replace(/^sha256=/, "").toLowerCase();
    if (!timingSafeEqual(expected, received)) {
      return jsonResp({ error: "Invalid signature" }, 401);
    }

    // 4. Parse + validação
    let payload: NinaPayload;
    try { payload = JSON.parse(rawBody); } catch { return jsonResp({ error: "Invalid JSON" }, 400); }
    if (!payload?.org_id) return jsonResp({ error: "org_id obrigatório" }, 400);
    if (!payload?.contato?.nome) return jsonResp({ error: "contato.nome obrigatório" }, 400);

    // 5. Match/cria contato (telefone > email)
    let contactId: string | null = null;
    const { contato } = payload;
    // cpf não é coluna direta — vai pra title (workaround mínimo se não houver campo)
    const lookups: Array<Promise<{ data: { id: string } | null }>> = [];
    if (contato.telefone) {
      lookups.push(
        admin.from("contacts").select("id").eq("org_id", payload.org_id).eq("phone", contato.telefone).maybeSingle() as any,
      );
    }
    if (contato.email) {
      lookups.push(
        admin.from("contacts").select("id").eq("org_id", payload.org_id).eq("email", contato.email).maybeSingle() as any,
      );
    }
    for (const p of lookups) {
      const { data } = await p;
      if (data?.id) { contactId = data.id; break; }
    }

    if (!contactId) {
      const { first, last } = splitName(contato.nome);
      const { data: inserted, error: insErr } = await admin
        .from("contacts")
        .insert({
          org_id: payload.org_id,
          first_name: first,
          last_name: last,
          email: contato.email ?? null,
          phone: contato.telefone ?? null,
          status: "prospect",
        })
        .select("id")
        .single();
      if (insErr || !inserted) {
        console.error("[nina-webhook] erro insert contact:", insErr);
        return jsonResp({ error: "Erro interno" }, 500);
      }
      contactId = inserted.id;
    }

    // 6. Localiza pipeline 'Venda PF' + stage 'Qualificado' da org
    const { data: pipeline, error: pErr } = await admin
      .from("pipelines")
      .select("id")
      .eq("org_id", payload.org_id)
      .eq("name", "Venda PF")
      .maybeSingle();
    if (pErr || !pipeline) {
      console.error("[nina-webhook] pipeline Venda PF ausente:", pErr);
      return jsonResp({ error: "Pipeline 'Venda PF' não encontrado para a org" }, 409);
    }

    const { data: stage, error: sErr } = await admin
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", pipeline.id)
      .eq("name", "Qualificado")
      .maybeSingle();
    if (sErr || !stage) {
      console.error("[nina-webhook] stage Qualificado ausente:", sErr);
      return jsonResp({ error: "Stage 'Qualificado' não encontrado" }, 409);
    }

    // 7. Cria deal
    const { data: deal, error: dErr } = await admin
      .from("deals")
      .insert({
        org_id: payload.org_id,
        title: `Lead Nina - ${contato.nome}`,
        contact_id: contactId,
        stage_id: stage.id,
        value: null,
        status: "open",
      })
      .select("id")
      .single();
    if (dErr || !deal) {
      console.error("[nina-webhook] erro insert deal:", dErr);
      return jsonResp({ error: "Erro interno" }, 500);
    }

    // 8. Activity (note) se houve vehicle_interest ou lead_summary
    const summaryLines: string[] = [];
    if (payload.lead_summary) summaryLines.push(payload.lead_summary);
    if (typeof payload.qualification_score === "number") {
      summaryLines.push(`Qualification score: ${payload.qualification_score}`);
    }
    if (payload.vehicle_interest?.marca) {
      const vi = payload.vehicle_interest;
      summaryLines.push(
        `Interesse: ${vi.marca}${vi.modelo ? " " + vi.modelo : ""}${vi.ano_target ? " " + vi.ano_target : ""}`,
      );
    }
    if (contato.preferred_brand) summaryLines.push(`Marca preferida: ${contato.preferred_brand}`);
    if (contato.cpf) summaryLines.push(`CPF: ${contato.cpf}`);

    if (summaryLines.length > 0) {
      const { error: aErr } = await admin.from("activities").insert({
        org_id: payload.org_id,
        type: "note",
        title: "Lead qualificado pela Nina",
        body: summaryLines.join("\n"),
        contact_id: contactId,
        deal_id: deal.id,
      });
      if (aErr) console.error("[nina-webhook] erro insert activity:", aErr);
    }

    return jsonResp({
      ok: true,
      contact_id: contactId,
      deal_id: deal.id,
    });
  } catch (e) {
    console.error("[nina-webhook] erro:", e);
    return jsonResp({ error: "Erro interno" }, 500);
  }
});
