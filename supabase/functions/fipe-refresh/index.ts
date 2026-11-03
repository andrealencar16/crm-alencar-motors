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

const FIPE_BASE = "https://parallelum.com.br/fipe/api/v1/carros";
const MAX_BATCH = 25;

type Input = {
  marca?: string;
  modelo?: string;
  ano?: number;
};

type FipeBrand = { codigo: string; nome: string };
type FipeModel = { codigo: number; nome: string };
type FipeYear = { codigo: string; nome: string };
type FipeValue = {
  Valor: string;
  Marca: string;
  Modelo: string;
  AnoModelo: number;
  Combustivel: string;
  CodigoFipe: string;
  MesReferencia: string;
  SiglaCombustivel: string;
  TipoVeiculo: number;
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function parseFipeValor(v: string): number | null {
  // "R$ 95.234,00" → 95234.00
  if (!v) return null;
  const cleaned = v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

async function fipeFetch<T>(url: string, attempt = 0): Promise<T> {
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (resp.ok) return (await resp.json()) as T;
  // 1 retry simples para 5xx/429
  if (attempt === 0 && (resp.status >= 500 || resp.status === 429)) {
    await new Promise((r) => setTimeout(r, 600));
    return fipeFetch<T>(url, 1);
  }
  throw new Error(`FIPE ${resp.status} ${url}`);
}

async function lookupOne(
  marca: string,
  modelo: string,
  ano: number,
): Promise<FipeValue | null> {
  const brands = await fipeFetch<FipeBrand[]>(`${FIPE_BASE}/marcas`);
  const nMarca = normalize(marca);
  const brand = brands.find((b) => normalize(b.nome) === nMarca)
    ?? brands.find((b) => normalize(b.nome).includes(nMarca));
  if (!brand) return null;

  const modelsResp = await fipeFetch<{ modelos: FipeModel[] }>(
    `${FIPE_BASE}/marcas/${brand.codigo}/modelos`,
  );
  const nModelo = normalize(modelo);
  const model = modelsResp.modelos.find((m) => normalize(m.nome) === nModelo)
    ?? modelsResp.modelos.find((m) => normalize(m.nome).startsWith(nModelo))
    ?? modelsResp.modelos.find((m) => normalize(m.nome).includes(nModelo));
  if (!model) return null;

  const years = await fipeFetch<FipeYear[]>(
    `${FIPE_BASE}/marcas/${brand.codigo}/modelos/${model.codigo}/anos`,
  );
  // Código formato "2024-1" (1=gasolina, 3=diesel, 2=alcool). Prioriza gasolina.
  const yearStr = String(ano);
  const yearMatch = years.find((y) => y.codigo.startsWith(`${yearStr}-1`))
    ?? years.find((y) => y.codigo.startsWith(`${yearStr}-`))
    ?? years.find((y) => y.nome.startsWith(yearStr));
  if (!yearMatch) return null;

  const value = await fipeFetch<FipeValue>(
    `${FIPE_BASE}/marcas/${brand.codigo}/modelos/${model.codigo}/anos/${yearMatch.codigo}`,
  );
  return value;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp({ error: "Unauthorized" }, 401);
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData?.user) return jsonResp({ error: "Unauthorized" }, 401);

    let body: Input = {};
    try { body = await req.json(); } catch { /* aceita vazio = batch */ }

    type Target = { marca: string; modelo: string; ano: number };
    let targets: Target[] = [];

    if (body.marca && body.modelo && body.ano) {
      targets.push({ marca: body.marca, modelo: body.modelo, ano: body.ano });
    } else {
      // Batch: pega veículos do estoque das orgs do user (RLS via userClient)
      const { data: vehicles, error: vErr } = await userClient
        .from("vehicles")
        .select("marca, modelo, ano")
        .not("marca", "is", null)
        .not("modelo", "is", null)
        .not("ano", "is", null)
        .limit(MAX_BATCH);
      if (vErr) {
        console.error("[fipe-refresh] erro estoque:", vErr);
        return jsonResp({ error: "Erro ao listar estoque" }, 500);
      }
      const seen = new Set<string>();
      for (const v of vehicles ?? []) {
        const key = `${v.marca}|${v.modelo}|${v.ano}`;
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push({ marca: v.marca as string, modelo: v.modelo as string, ano: v.ano as number });
      }
    }

    if (targets.length === 0) {
      return jsonResp({ refreshed: 0, results: [], message: "Nada a atualizar" });
    }

    const results: Array<{
      marca: string; modelo: string; ano: number;
      ok: boolean; valor?: number; fipe_code?: string; error?: string;
    }> = [];

    for (const t of targets) {
      try {
        const v = await lookupOne(t.marca, t.modelo, t.ano);
        if (!v) {
          results.push({ ...t, ok: false, error: "Não encontrado na FIPE" });
          continue;
        }
        const valor = parseFipeValor(v.Valor);
        if (valor === null) {
          results.push({ ...t, ok: false, error: "Valor inválido" });
          continue;
        }
        const { error: upErr } = await admin
          .from("fipe_cache")
          .upsert({
            fipe_code: v.CodigoFipe,
            ano_modelo: v.AnoModelo,
            marca: v.Marca,
            modelo: v.Modelo,
            valor,
            atualizado_em: new Date().toISOString(),
          }, { onConflict: "fipe_code,ano_modelo" });
        if (upErr) {
          console.error("[fipe-refresh] upsert erro:", upErr);
          results.push({ ...t, ok: false, error: "Erro ao gravar cache" });
          continue;
        }
        results.push({ ...t, ok: true, valor, fipe_code: v.CodigoFipe });
      } catch (e) {
        console.error("[fipe-refresh] erro lookup:", e);
        results.push({ ...t, ok: false, error: (e as Error).message });
      }
    }

    const refreshed = results.filter((r) => r.ok).length;
    const anyOk = refreshed > 0;
    if (!anyOk && targets.length > 0) {
      // Todas falharam -> 502 (provavelmente FIPE fora)
      return jsonResp({ refreshed, results, error: "Falha ao consultar FIPE" }, 502);
    }
    return jsonResp({ refreshed, results });
  } catch (e) {
    console.error("[fipe-refresh] erro:", e);
    return jsonResp({ error: "Erro interno" }, 500);
  }
});
