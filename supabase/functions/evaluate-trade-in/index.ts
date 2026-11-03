import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const PHOTO_BUCKET = "trade-in-photos";
const MAX_PHOTOS = 6;
const FIPE_BASE = "https://parallelum.com.br/fipe/api/v1/carros";

// FIPE inline lookup (fallback quando cache miss). Mesma normalização do
// supabase/functions/fipe-refresh — mantida inline aqui pra evitar shared
// imports entre Edge Functions e simplificar deploy.
function fipeNormalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function parseFipeValor(v: string): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
async function fipeFetch<T>(url: string, attempt = 0): Promise<T> {
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (resp.ok) return (await resp.json()) as T;
  if (attempt === 0 && (resp.status >= 500 || resp.status === 429)) {
    await new Promise((r) => setTimeout(r, 600));
    return fipeFetch<T>(url, 1);
  }
  throw new Error(`FIPE ${resp.status} ${url}`);
}
type FipeBrand = { codigo: string; nome: string };
type FipeModel = { codigo: number; nome: string };
type FipeYear = { codigo: string; nome: string };
type FipeValue = {
  Valor: string; Marca: string; Modelo: string; AnoModelo: number;
  CodigoFipe: string;
};
// Procura ano alvo na lista (qualquer sufixo de combustível), com tolerância ±1 ano.
// Retorna {codigo, anoUsado} ou null.
function pickYear(years: FipeYear[], target: number): { codigo: string; ano: number } | null {
  for (const delta of [0, -1, 1, -2, 2]) {
    const t = target + delta;
    const found = years.find((y) => y.codigo.startsWith(`${t}-`));
    if (found) return { codigo: found.codigo, ano: t };
  }
  return null;
}

// Lookup robusto: muitos modelos FIPE têm versão (ex.: "HB20 1.0 SENSE", "HB20 Comfort").
// Estratégia: coleta TODOS os candidatos que contêm o termo do usuário, ordena por
// distância de tamanho do nome (pra preferir o mais "puro"), e percorre buscando o
// primeiro que tenha o ano alvo (ou ±1/±2). Limita a 8 candidatos pra controlar latência.
async function fipeLookup(marca: string, modelo: string, ano: number): Promise<{ value: FipeValue; anoUsado: number } | null> {
  const brands = await fipeFetch<FipeBrand[]>(`${FIPE_BASE}/marcas`);
  const nMarca = fipeNormalize(marca);
  const brand = brands.find((b) => fipeNormalize(b.nome) === nMarca)
    ?? brands.find((b) => fipeNormalize(b.nome).includes(nMarca));
  if (!brand) return null;

  const modelsResp = await fipeFetch<{ modelos: FipeModel[] }>(`${FIPE_BASE}/marcas/${brand.codigo}/modelos`);
  const nModelo = fipeNormalize(modelo);

  // Coleta candidatos: exact > startsWith > includes (dedup mantendo prioridade).
  const seen = new Set<number>();
  const candidates: FipeModel[] = [];
  const pushIf = (pred: (n: string) => boolean) => {
    for (const m of modelsResp.modelos) {
      if (seen.has(m.codigo)) continue;
      if (pred(fipeNormalize(m.nome))) { candidates.push(m); seen.add(m.codigo); }
    }
  };
  pushIf((n) => n === nModelo);
  pushIf((n) => n.startsWith(nModelo + " ") || n === nModelo);
  pushIf((n) => n.startsWith(nModelo));
  pushIf((n) => n.includes(nModelo));

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.nome.length - b.nome.length);
  const trimmed = candidates.slice(0, 8);

  for (const m of trimmed) {
    try {
      const years = await fipeFetch<FipeYear[]>(`${FIPE_BASE}/marcas/${brand.codigo}/modelos/${m.codigo}/anos`);
      const picked = pickYear(years, ano);
      if (!picked) continue;
      const value = await fipeFetch<FipeValue>(`${FIPE_BASE}/marcas/${brand.codigo}/modelos/${m.codigo}/anos/${picked.codigo}`);
      return { value, anoUsado: picked.ano };
    } catch (e) {
      console.error("[evaluate-trade-in] FIPE candidato falhou:", m.nome, e);
    }
  }
  return null;
}

type Payload = {
  trade_in_id: string;
  photos?: string[];
  marca?: string;
  modelo?: string;
  ano?: number;
  km?: number;
  cor?: string;
  condicao?: string;
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function downloadPhotoAsDataUri(
  admin: ReturnType<typeof createClient>,
  ref: string,
): Promise<string | null> {
  try {
    let path = ref;
    if (ref.startsWith("http")) {
      const url = new URL(ref);
      const marker = `/object/sign/${PHOTO_BUCKET}/`;
      const idx = url.pathname.indexOf(marker);
      if (idx >= 0) {
        path = url.pathname.slice(idx + marker.length);
      } else {
        const resp = await fetch(ref);
        if (!resp.ok) return null;
        const buf = new Uint8Array(await resp.arrayBuffer());
        const mime = resp.headers.get("content-type") || "image/jpeg";
        return `data:${mime};base64,${btoa(String.fromCharCode(...buf))}`;
      }
    }
    const { data, error } = await admin.storage.from(PHOTO_BUCKET).download(path);
    if (error || !data) return null;
    const buf = new Uint8Array(await data.arrayBuffer());
    const mime = data.type || "image/jpeg";
    // chunked base64 (evita stack overflow em fotos grandes)
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return `data:${mime};base64,${btoa(bin)}`;
  } catch (e) {
    console.error("[evaluate-trade-in] erro download foto:", e);
    return null;
  }
}

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      try { return JSON.parse(fence[1]); } catch { /* noop */ }
    }
    const obj = text.match(/\{[\s\S]*\}/);
    if (obj) {
      try { return JSON.parse(obj[0]); } catch { /* noop */ }
    }
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "Method not allowed" }, 405);

  try {
    if (!LOVABLE_API_KEY) {
      console.error("[evaluate-trade-in] LOVABLE_API_KEY ausente");
      return jsonResp({ error: "Erro interno" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp({ error: "Unauthorized" }, 401);
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData?.user) return jsonResp({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    let body: Payload;
    try { body = await req.json(); } catch { return jsonResp({ error: "Invalid JSON" }, 400); }
    if (!body?.trade_in_id) return jsonResp({ error: "trade_in_id obrigatório" }, 400);

    const { data: tradeIn, error: tiErr } = await admin
      .from("trade_ins")
      .select("id, org_id, marca, modelo, ano, km, cor, condicao, fotos, status")
      .eq("id", body.trade_in_id)
      .maybeSingle();
    if (tiErr || !tradeIn) return jsonResp({ error: "Trade-in não encontrado" }, 404);

    const { data: belongs, error: belongsErr } = await admin.rpc("user_belongs_to_org", {
      _user_id: userId,
      _org_id: tradeIn.org_id,
    });
    if (belongsErr || belongs !== true) return jsonResp({ error: "Forbidden" }, 403);

    const marca = body.marca ?? tradeIn.marca ?? "";
    const modelo = body.modelo ?? tradeIn.modelo ?? "";
    const ano = body.ano ?? tradeIn.ano ?? null;
    const km = body.km ?? tradeIn.km ?? null;
    const cor = body.cor ?? tradeIn.cor ?? "";
    const condicao = body.condicao ?? tradeIn.condicao ?? "";
    const photos = (body.photos && body.photos.length > 0
      ? body.photos
      : (tradeIn.fotos as string[] | null) ?? []
    ).slice(0, MAX_PHOTOS);

    // FIPE cache cross-check (best-effort, marca+modelo+ano com TTL 7d).
    // Quando cache miss, fallback inline na API Parallelum + write-through.
    let estimativaFipe: number | null = null;
    let fipeCacheHit = false;
    let fipeSource: "cache" | "live" | "miss" = "miss";
    if (marca && modelo && ano) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: fipeRow } = await admin
        .from("fipe_cache")
        .select("valor, atualizado_em")
        .ilike("marca", marca)
        .ilike("modelo", modelo)
        .eq("ano_modelo", ano)
        .gte("atualizado_em", sevenDaysAgo)
        .order("atualizado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fipeRow?.valor) {
        estimativaFipe = Number(fipeRow.valor);
        fipeCacheHit = true;
        fipeSource = "cache";
      } else {
        // Fallback inline (cache miss). Latência ~500ms-1s. Erros não bloqueiam.
        try {
          const live = await fipeLookup(marca, modelo, ano);
          if (live) {
            const valor = parseFipeValor(live.value.Valor);
            if (valor !== null) {
              estimativaFipe = valor;
              fipeSource = "live";
              if (live.anoUsado !== ano) {
                console.log("[evaluate-trade-in] FIPE ano vizinho:", { pedido: ano, usado: live.anoUsado, modelo: live.value.Modelo });
              }
              // Write-through pro cache (próxima avaliação vira hit)
              const { error: upErr } = await admin.from("fipe_cache").upsert({
                fipe_code: live.value.CodigoFipe,
                ano_modelo: live.value.AnoModelo,
                marca: live.value.Marca,
                modelo: live.value.Modelo,
                valor,
                atualizado_em: new Date().toISOString(),
              }, { onConflict: "fipe_code,ano_modelo" });
              if (upErr) console.error("[evaluate-trade-in] FIPE upsert erro:", upErr);
            }
          } else {
            console.log("[evaluate-trade-in] FIPE live miss:", { marca, modelo, ano });
          }
        } catch (e) {
          console.error("[evaluate-trade-in] FIPE live lookup falhou:", e);
        }
      }
    }

    // Baixa fotos em paralelo
    const imageParts: { type: "image_url"; image_url: { url: string } }[] = [];
    if (photos.length > 0) {
      const downloads = await Promise.all(photos.map((p) => downloadPhotoAsDataUri(admin, p)));
      for (const d of downloads) {
        if (d) imageParts.push({ type: "image_url", image_url: { url: d } });
      }
    }

    const userText = [
      "Avalie este veículo usado no mercado brasileiro a partir das fotos e dados abaixo.",
      "",
      `Marca: ${marca || "n/i"}`,
      `Modelo: ${modelo || "n/i"}`,
      `Ano: ${ano ?? "n/i"}`,
      `Quilometragem: ${km ?? "n/i"}`,
      `Cor: ${cor || "n/i"}`,
      `Condição declarada: ${condicao || "n/i"}`,
      estimativaFipe !== null ? `Referência FIPE (${fipeSource}): R$ ${estimativaFipe.toFixed(2)}` : "Referência FIPE: indisponível",
      "",
      "Responda APENAS com JSON válido no formato:",
      `{"estimativa_ia": <number BRL>, "estimativa_ia_justificativa": "<texto até 400 chars>", "estado_visual_pontos": ["<obs curtas>"]}`,
    ].join("\n");

    const messages = [
      {
        role: "system",
        content:
          "Você é um avaliador de veículos usados no Brasil. Analise as fotos e dados informados e estime o preço justo de mercado e o estado real do veículo. Sempre retorne JSON válido conforme solicitado, sem texto extra.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          ...imageParts,
        ],
      },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text().catch(() => "");
      console.error("[evaluate-trade-in] AI Gateway erro:", aiResp.status, errText);
      await admin
        .from("trade_ins")
        .update({ status: "aguardando" })
        .eq("id", tradeIn.id);
      if (aiResp.status === 429) {
        return jsonResp({ error: "Limite de requisições da IA atingido. Tente novamente em instantes." }, 502);
      }
      if (aiResp.status === 402) {
        return jsonResp({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }, 502);
      }
      return jsonResp({ error: "Falha ao avaliar com IA" }, 502);
    }

    const aiJson = await aiResp.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? "";
    const parsed = safeParseJson(content);
    if (!parsed) {
      console.error("[evaluate-trade-in] resposta IA não-JSON:", content);
      await admin.from("trade_ins").update({ status: "aguardando" }).eq("id", tradeIn.id);
      return jsonResp({ error: "Resposta da IA inválida" }, 502);
    }

    const estimativaIa = Number(parsed.estimativa_ia);
    const justificativa = String(parsed.estimativa_ia_justificativa ?? "").slice(0, 400);
    const estadoVisual = Array.isArray(parsed.estado_visual_pontos)
      ? parsed.estado_visual_pontos.map((x) => String(x)).slice(0, 10)
      : [];

    if (!Number.isFinite(estimativaIa) || estimativaIa <= 0) {
      console.error("[evaluate-trade-in] estimativa inválida:", parsed);
      await admin.from("trade_ins").update({ status: "aguardando" }).eq("id", tradeIn.id);
      return jsonResp({ error: "Estimativa da IA inválida" }, 502);
    }

    const update: Record<string, unknown> = {
      estimativa_ia: estimativaIa,
      estimativa_ia_justificativa: justificativa,
      status: "avaliado",
      updated_at: new Date().toISOString(),
    };
    if (estimativaFipe !== null) update.estimativa_fipe = estimativaFipe;

    const { error: updErr } = await admin
      .from("trade_ins")
      .update(update)
      .eq("id", tradeIn.id);
    if (updErr) {
      console.error("[evaluate-trade-in] erro ao atualizar trade_in:", updErr);
      return jsonResp({ error: "Erro interno" }, 500);
    }

    return jsonResp({
      trade_in_id: tradeIn.id,
      estimativa_ia: estimativaIa,
      estimativa_ia_justificativa: justificativa,
      estado_visual_pontos: estadoVisual,
      estimativa_fipe: estimativaFipe,
      fipe_cache_hit: fipeCacheHit,
      fipe_source: fipeSource,
      photos_analyzed: imageParts.length,
      status: "avaliado",
    });
  } catch (e) {
    console.error("[evaluate-trade-in] erro:", e);
    return jsonResp({ error: "Erro interno" }, 500);
  }
});
