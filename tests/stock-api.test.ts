import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHandler } from "../supabase/functions/stock-api/handler.ts";
import type { Dependencies } from "../supabase/functions/stock-api/handler.ts";
import { parseQuery } from "../supabase/functions/stock-api/query.ts";
import { PUBLIC_FIELDS } from "../supabase/functions/stock-api/dto.ts";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secret = "stk_" + "A".repeat(43); // Known public fixture, never persisted.
const photoUrls = ["https://storage.example.invalid/org/cover.jpg", "https://storage.example.invalid/org/second.jpg"];
const row = { id, marca: "Volkswagen", modelo: "Polo", versao: null, ano_fabricacao: 2022, ano_modelo: 2023,
  km: 10000, cor: "Prata", combustivel: "flex", transmissao: "automatica", preco_venda: 89900,
  descricao: null, opcionais: ["Airbag"], accepts_trade: true, accepts_financing: true,
  fotos: photoUrls, status: "disponivel", updated_at: "2026-11-05T12:00:00Z" };
const forbidden = ["preco_custo", "commercial_notes", "placa", "chassi", "renavam", "owner_id", "org_id",
  "deal_id_atual", "fipe_code", "fipe_price", "data_entrada", "key_hash", "secret"];
const request = (path = "/vehicles", token = secret, init: RequestInit = {}) => new Request(
  `https://local.invalid/stock-api/v1${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
function handler(overrides: Partial<Dependencies> = {}) {
  return createHandler({ allowedOrigins: ["https://site.example.invalid"], read: async (args) => ({
    data: args.p_resource === "photos" ? { data: { vehicle_id: id, fotos: photoUrls } }
      : args.p_resource === "detail" ? { data: row }
      : { data: [row], pagination: { page: args.p_page, limit: args.p_limit, has_more: false } },
    error: null,
  }), ...overrides });
}

test("authentication hashes stock secret; RPC never receives raw secret or organization", async () => {
  let captured: Record<string, unknown> = {};
  const res = await handler({ read: async (args) => {
    captured = args;
    return { data: { data: [], pagination: { page: 1, limit: 20, has_more: false } }, error: null };
  } })(request());
  assert.equal(res.status, 200);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  assert.equal(captured.p_key_hash, Buffer.from(hash).toString("hex"));
  assert.equal(JSON.stringify(captured).includes(secret), false);
  assert.equal("p_org_id" in captured, false);
});

test("missing, malformed and CRM credentials are rejected without database access", async () => {
  let calls = 0;
  const h = handler({ read: async () => { calls++; throw new Error("must not call"); } });
  for (const token of ["fc_legacy", "invalid", "stk_short", "stk_" + "A".repeat(44)]) {
    assert.equal((await h(request("/vehicles", token))).status, 401);
  }
  assert.equal((await h(new Request("https://local.invalid/stock-api/v1/vehicles"))).status, 401);
  assert.equal(calls, 0);
});

test("invalid/revoked credentials and insufficient scope map to 401/403 (mock RPC)", async () => {
  for (const [code, status] of [["P0401", 401], ["42501", 403]] as const) {
    const res = await handler({ read: async () => ({ data: null, error: { code } }) })(request());
    assert.equal(res.status, status);
    assert.equal("data" in await res.json(), false);
  }
});

test("credential lookup fixture consults only stock records, never legacy records (mock RPC)", async () => {
  const digest = async (value: string) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))).toString("hex");
  const revoked = "stk_" + "B".repeat(43);
  const legacyOnly = "stk_" + "C".repeat(43);
  const noScope = "stk_" + "D".repeat(43);
  const stock = new Map([
    [await digest(secret), { active: true, scopes: ["stock:read"] }],
    [await digest(revoked), { active: false, scopes: ["stock:read"] }],
    [await digest(noScope), { active: true, scopes: [] }],
  ]);
  const legacy = new Map([[await digest(legacyOnly), { active: true }]]);
  assert.equal(legacy.has(await digest(legacyOnly)), true);
  const h = handler({ read: async (args) => {
    const credential = stock.get(String(args.p_key_hash));
    if (!credential?.active) return { data: null, error: { code: "P0401" } };
    if (credential.scopes.length !== 1 || credential.scopes[0] !== "stock:read") return { data: null, error: { code: "42501" } };
    return { data: { data: [], pagination: { page: 1, limit: 20, has_more: false } }, error: null };
  } });
  for (const [token, expected] of [[secret, 200], [revoked, 401], [legacyOnly, 401], [noScope, 403]] as const) {
    assert.equal((await h(request("/vehicles", token))).status, expected);
  }
});

test("public list DTO strips all private columns and preserves photo order", async () => {
  const polluted = { ...row, ...Object.fromEntries(forbidden.map((name) => [name, "PRIVATE"])) };
  const res = await handler({ read: async () => ({ data: {
    data: [polluted], pagination: { page: 1, limit: 20, has_more: true }, private: "PRIVATE",
  }, error: null }) })(request());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body.data[0]).sort(), [...PUBLIC_FIELDS].sort());
  assert.deepEqual(body.data[0].fotos, photoUrls);
  assert.deepEqual(body.pagination, { page: 1, limit: 20, has_more: true });
  assert.equal(JSON.stringify(body).includes("PRIVATE"), false);
});

test("detail and photos routes validate IDs and return explicit envelopes", async () => {
  const h = handler();
  assert.deepEqual((await (await h(request(`/vehicles/${id}`))).json()).data, row);
  assert.deepEqual(await (await h(request(`/vehicles/${id.toUpperCase()}/photos`))).json(), {
    data: { vehicle_id: id, fotos: photoUrls },
  });
  for (const path of ["/vehicles/bad", "/vehicles/bad/photos", `/vehicles/${id}?limit=10`]) {
    assert.equal((await h(request(path))).status, 400);
  }
  assert.equal((await h(request(`/vehicles/${id}/images`))).status, 404);
  assert.equal((await h(request("/images/token"))).status, 404);
});

test("missing, unavailable and inaccessible resources share the same 404", async () => {
  const h = handler({ read: async () => ({ data: null, error: { code: "P0002" } }) });
  for (const path of [`/vehicles/${id}`, `/vehicles/${id}/photos`]) {
    const res = await h(request(path));
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, "NOT_FOUND");
  }
});

test("defaults and full filters produce bounded typed RPC arguments", async () => {
  const q = parseQuery(new URLSearchParams());
  assert.equal(q.page, 1); assert.equal(q.limit, 20); assert.equal(q.sort, "recentes");
  let captured: Record<string, unknown> = {};
  const query = "marca=Volkswagen&modelo=50%25_&ano_min=2020&ano_max=2026&preco_min=0&preco_max=100000.50&combustivel=flex&transmissao=automatica&page=2&limit=100&sort=preco_asc";
  const res = await handler({ read: async (args) => {
    captured = args;
    return { data: { data: [], pagination: { page: 2, limit: 100, has_more: false } }, error: null };
  } })(request(`/vehicles?${query}`));
  assert.equal(res.status, 200);
  assert.equal(captured.p_modelo, "50%_");
  assert.equal(captured.p_ano_min, 2020); assert.equal(captured.p_preco_max, 100000.5);
  assert.equal(captured.p_page, 2); assert.equal(captured.p_limit, 100);
});

test("unknown/repeated/malformed/inverted filters fail before RPC", async () => {
  let calls = 0;
  const h = handler({ read: async () => { calls++; throw new Error("no call"); } });
  for (const q of ["org_id=x", "marca=A&marca=B", "page=0", "limit=101", "page=1.5", "page=2147483648",
    "page=10002&limit=1", "ano_min=2025&ano_max=2020", "preco_min=2&preco_max=1", "preco_min=-1",
    "preco_max=NaN", "preco_min=1.234", "combustivel=unknown", "transmissao=unknown", "sort=random",
    "marca=", "modelo=" + "x".repeat(101), "modelo=%00", "sort=recentes&sort=recentes"]) {
    assert.equal((await h(request(`/vehicles?${q}`))).status, 400, q);
  }
  assert.equal(calls, 0);
});

test("all approved sorts are accepted", () => {
  for (const sort of ["preco_asc", "preco_desc", "ano_desc", "recentes"]) {
    assert.equal(parseQuery(new URLSearchParams({ sort })).sort, sort);
  }
});

test("methods, CORS and gateway path prefix", async () => {
  const h = handler();
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD"]) {
    const res = await h(request("/vehicles", secret, { method }));
    assert.equal(res.status, 405); assert.equal(res.headers.get("Allow"), "GET, OPTIONS");
    assert.equal((await h(request("/vehicles", secret, { method, headers: { Origin: "https://evil.invalid" } }))).status, 405);
  }
  const preflight = await h(request("/vehicles", secret, { method: "OPTIONS", headers: { Origin: "https://site.example.invalid" } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "https://site.example.invalid");
  assert.equal((await h(request("/vehicles", secret, { headers: { Origin: "https://evil.invalid" } }))).status, 403);
  assert.equal((await handler({ allowedOrigins: [] })(request("/vehicles", secret, { headers: { Origin: "https://site.example.invalid" } }))).status, 403);
  assert.equal((await h(new Request("https://local.invalid/functions/v1/stock-api/v1/vehicles", { headers: { Authorization: `Bearer ${secret}` } }))).status, 200);
});

test("errors sanitized, request IDs present, rate/dependency errors mapped", async () => {
  for (const [code, status] of [["P0429", 429], ["57014", 503], ["55P03", 503], ["unexpected", 500]] as const) {
    const res = await handler({ read: async () => ({ data: { secret }, error: { code } }) })(request());
    assert.equal(res.status, status);
    const text = await res.text();
    assert.equal(text.includes(secret), false);
    assert.equal(typeof JSON.parse(text).error.request_id, "string");
  }
  const res = await handler({ read: async () => { throw new Error("PRIVATE DATABASE DIAGNOSTIC"); } })(request());
  assert.equal((await res.text()).includes("PRIVATE"), false);
});

test("deadline aborts slow dependency and malformed backend data fail closed", async () => {
  const res = await handler({ timeoutMs: 10, read: async () => new Promise(() => {}) })(request());
  assert.equal(res.status, 503);
  for (const badRow of [{ ...row, status: "vendido" }, { ...row, modelo: { secret } }]) {
    const r = await handler({ read: async () => ({ data: { data: badRow }, error: null }) })(request(`/vehicles/${id}`));
    assert.equal(r.status, 500);
  }
});

test("SQL read boundary: explicit fields, key store, publication and ordering (static only)", () => {
  const sql = readFileSync(new URL("../drizzle/migrations/0010_stock_catalog_read.sql", import.meta.url), "utf8");
  assert.match(sql, /FROM public.stock_api_keys k WHERE k.key_hash = p_key_hash/);
  assert.match(sql, /v_active IS DISTINCT FROM true OR v_revoked IS NOT NULL/);
  assert.match(sql, /v_scopes IS DISTINCT FROM ARRAY\['stock:read'\]/);
  assert.match(sql, /s.org_id = v_org AND s.status = 'disponivel'/);
  assert.match(sql, /v.id = p_id AND v.org_id = v_org AND v.status = 'disponivel'/);
  assert.match(sql, /strpos\(lower\(s.modelo\),lower\(btrim\(p_modelo\)\)\)/);
  assert.match(sql, /p_limit\+1/); assert.match(sql, /s.id ASC/); assert.match(sql, /NULLS LAST/);
  assert.match(sql, /TO anon;/);
  assert.doesNotMatch(sql, /public.api_keys|SELECT\s+\*|GRANT\s+SELECT|CREATE POLICY|INSERT INTO|UPDATE public|DELETE FROM/i);
  const projection = sql.split("SELECT s.id,")[1].split("FROM public.vehicles s")[0];
  for (const field of forbidden) assert.equal(projection.includes(`s.${field}`), false, field);
  const entry = readFileSync(new URL("../supabase/functions/stock-api/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(entry, /SUPABASE_SERVICE_ROLE_KEY|\.from\(/);
  assert.match(entry, /rpc\("stock_catalog_read", args\)/);
});
