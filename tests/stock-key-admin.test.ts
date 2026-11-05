import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHandler } from "../supabase/functions/stock-key-admin/handler.ts";
import type { Action, Dependencies } from "../supabase/functions/stock-key-admin/handler.ts";
import { createUserBackend } from "../supabase/functions/stock-key-admin/user-backend.ts";

const actorA = "11111111-1111-4111-8111-111111111111";
const actorB = "22222222-2222-4222-8222-222222222222";
const keyId = "33333333-3333-4333-8333-333333333333";
const row = { id: keyId, name: "Site", key_prefix: "stk_AAECAwQF", scopes: ["stock:read"],
  created_by: actorA, created_at: "2026-11-05T12:00:00Z", is_active: true,
  revoked_at: null, revoked_by: null, last_used_at: null };
// Public deterministic fixture only; no usable credential is generated.
const fixtureSecret = "stk_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const request = (body: unknown, token = "test-jwt-a", origin?: string) => new Request("https://local.invalid/stock-key-admin", {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`,
    ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
});
const deps = (overrides: Partial<Dependencies> = {}): Dependencies => ({
  allowedOrigins: ["https://crm.example.invalid"],
  authenticate: async () => actorA,
  execute: async (_jwt, action) => ({ data: action === "create" ? { data: row, secret: fixtureSecret } : row, error: null }),
  ...overrides,
});

test("rejects unauthenticated identity before any RPC", async () => {
  let called = false;
  const h = createHandler(deps({ authenticate: async () => null, execute: async () => {
    called = true; throw new Error("must not execute");
  } }));
  assert.equal((await h(request({ action: "list" }))).status, 401);
  assert.equal(called, false);
});

test("forbids client-controlled authority and credentials for every operation", async () => {
  let calls = 0;
  const h = createHandler(deps({ execute: async () => { calls++; return { data: row, error: null }; } }));
  for (const base of [{ action: "create", name: "Site" }, { action: "list" }, { action: "revoke", id: keyId }]) {
    for (const field of ["org_id", "p_actor", "created_by", "key_hash", "secret", "scopes", "is_active"]) {
      assert.equal((await h(request({ ...base, [field]: actorB }))).status, 400);
    }
  }
  assert.equal(calls, 0);
});

test("create forwards original JWT and only name; secret originates in RPC", async () => {
  let captured: Record<string, unknown> = {};
  const h = createHandler(deps({ execute: async (jwt, action, args) => {
    assert.equal(jwt, "test-jwt-a");
    assert.equal(action, "create"); captured = args;
    return { data: { data: { ...row, key_hash: "private", org_id: "private" }, secret: fixtureSecret }, error: null };
  } }));
  const response = await h(request({ action: "create", name: " Site " }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json();
  assert.equal(body.secret, "stk_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8");
  assert.deepEqual(Object.keys(captured), ["p_name"]);
  assert.equal(captured.p_name, "Site");
  assert.equal(JSON.stringify(captured).includes(body.secret), false);
  assert.equal("key_hash" in body.data, false);
  assert.equal("org_id" in body.data, false);
});

test("database authorization failures (member or missing main-org membership) fail closed", async () => {
  const h = createHandler(deps({ execute: async () => ({ data: null, error: { code: "42501" } }) }));
  for (const body of [{ action: "create", name: "Site" }, { action: "list" }, { action: "revoke", id: keyId }]) {
    const res = await h(request(body));
    assert.equal(res.status, 403);
    assert.equal("secret" in await res.json(), false);
  }
});

test("authorized administrator revokes idempotently; member is denied (mocked RPC)", async () => {
  // Contract fake only: this does NOT execute or certify PostgreSQL RLS.
  const records = new Map([[keyId, { ...row }]]);
  let auditRevocations = 0;
  const rpc: Dependencies["execute"] = async (jwt, action: Action, args) => {
    if (jwt !== "test-jwt-a") return { data: null, error: { code: "42501" } };
    if (action === "list") return { data: [...records.values()], error: null };
    if (!records.has(String(args.p_id))) return { data: null, error: { code: "P0002" } };
    const current = records.get(String(args.p_id))!;
    if (current.is_active) { current.is_active = false; auditRevocations++; }
    return { data: current, error: null };
  };
  const h = createHandler(deps({ authenticate: async (jwt) => jwt === "test-jwt-b" ? actorB : actorA, execute: rpc }));
  assert.equal((await h(request({ action: "list" }, "test-jwt-b"))).status, 403);
  assert.equal((await h(request({ action: "revoke", id: keyId }, "test-jwt-b"))).status, 403);
  assert.equal((await h(request({ action: "revoke", id: actorB }))).status, 404);
  for (let i = 0; i < 2; i++) {
    const res = await h(request({ action: "revoke", id: keyId }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.is_active, false);
    assert.equal("secret" in body, false);
  }
  assert.equal(auditRevocations, 1);
  assert.equal((await h(request({ action: "reactivate", id: keyId }))).status, 400);
});

test("list and revoke responses strip hashes, secrets and unknown RPC columns", async () => {
  for (const action of ["list", "revoke"] as const) {
    const tainted = { ...row, key_hash: "private-hash", secret: "private-secret", org_id: "private-org" };
    const h = createHandler(deps({ execute: async () => ({ data: action === "list" ? [tainted] : tainted, error: null }) }));
    const text = await (await h(request(action === "list" ? { action } : { action, id: keyId }))).text();
    assert.equal(text.includes("private"), false);
  }
});

test("CORS, method restriction, malformed JSON and size limits", async () => {
  const h = createHandler(deps());
  assert.equal((await h(request({ action: "list" }, "jwt", "https://evil.invalid"))).status, 403);
  const options = await h(new Request("https://local.invalid", { method: "OPTIONS", headers: { Origin: "https://crm.example.invalid" } }));
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("Access-Control-Allow-Origin"), "https://crm.example.invalid");
  assert.equal((await h(new Request("https://local.invalid"))).status, 405);
  assert.equal((await h(request({ action: "create", name: "x".repeat(5000) }))).status, 413);
  assert.equal((await h(new Request("https://local.invalid", { method: "POST", headers: {
    Authorization: "Bearer jwt", "Content-Type": "application/json" }, body: "{" }))).status, 400);
});

test("pagination and names validated; unexpected errors never disclose diagnostics", async () => {
  const h = createHandler(deps({ execute: async () => { throw new Error("secret database diagnostic"); } }));
  for (const body of [{ action: "list", limit: 101 }, { action: "list", page: 0 },
    { action: "list", page: "1" }, { action: "create", name: " " }, { action: "revoke", id: "bad" }]) {
    assert.equal((await h(request(body))).status, 400);
  }
  const res = await h(request({ action: "list" }));
  assert.equal(res.status, 500);
  assert.equal((await res.text()).includes("diagnostic"), false);
});

test("migration access contract (static, no SQL executed)", () => {
  const sql = readFileSync(new URL("../drizzle/migrations/0009_stock_api_keys.sql", import.meta.url), "utf8");
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public.stock_api_keys FROM PUBLIC, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /CREATE POLICY|ALTER TABLE public\.(api_keys|vehicles)/);
  assert.match(sql, /v_org := public.main_org_id\(\)/);
  assert.match(sql, /role::text IN \('owner', 'admin'\)/);
  assert.match(sql, /WHERE id = p_id AND org_id = v_org FOR UPDATE/);
  assert.match(sql, /IF NOT OLD.is_active/);
  assert.match(sql, /scopes = ARRAY\['stock:read'\]/);
  assert.doesNotMatch(sql, /p_actor|p_key_hash|p_key_prefix|TO service_role;/);
  assert.match(sql, /v_actor uuid := auth.uid\(\)/);
  assert.doesNotMatch(sql, /LOCK TABLE|array_agg\(org_id\)|v_count|bool_and/);
  assert.match(sql, /WHERE user_id = v_actor AND org_id = v_org AND role::text IN \('owner', 'admin'\)\s+FOR SHARE/);
  assert.match(sql, /extensions.gen_random_bytes\(32\)/);
  assert.match(sql, /extensions.digest\(convert_to\(v_secret, 'UTF8'\), 'sha256'\)/);
  assert.equal((sql.match(/TO authenticated;/g) ?? []).length, 3);
});

test("user backend preserves JWT context for Auth and RPC; no actor argument", async () => {
  const seen: string[] = [];
  const backend = createUserBackend((jwt) => {
    seen.push(jwt);
    return {
      auth: { getUser: async (token) => {
        assert.equal(token, jwt);
        return { data: { user: { id: actorA } }, error: null };
      } },
      rpc: async (name, args) => {
        assert.equal(name, "stock_key_admin_list");
        assert.deepEqual(args, { p_page: 1, p_limit: 20 });
        return { data: [], error: null };
      },
    };
  });
  assert.equal((await createHandler(deps(backend))(request({ action: "list" }))).status, 200);
  assert.deepEqual(seen, ["test-jwt-a", "test-jwt-a"]);
  const entry = readFileSync(new URL("../supabase/functions/stock-key-admin/index.ts", import.meta.url), "utf8");
  assert.match(entry, /Authorization: `Bearer \$\{jwt\}`/);
  assert.doesNotMatch(entry, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("SQL fixture safety: exact disposable name, existing single organization, null-safe assertions (static)", () => {
  const sql = readFileSync(new URL("./postgres/stock-api-keys.test.sql", import.meta.url), "utf8");
  assert.match(sql, /current_database\(\) IS DISTINCT FROM 'stock_keys_test'/);
  assert.doesNotMatch(sql, /current_database\(\).*LIKE|INSERT INTO public.organizations|stock-multi-role|Cross-org/);
  assert.match(sql, /SELECT count\(\*\) FROM public.organizations\) IS DISTINCT FROM 1::bigint/);
  assert.match(sql, /public.main_org_id\(\)/);
  assert.match(sql, /jsonb_typeof\(response->'secret'\) IS DISTINCT FROM 'string'/);
  assert.match(sql, /target_data->>'is_active'\)::boolean IS DISTINCT FROM true/);
  assert.match(sql, /ROLLBACK;/);
});

test("invalid and expired JWTs rejected by Auth adapter never reach RPC (mocked Auth)", async () => {
  for (const jwt of ["invalid-jwt", "expired-jwt"]) {
    let calls = 0;
    const backend = createUserBackend(() => ({
      auth: { getUser: async () => ({ data: { user: null }, error: { message: "JWT rejected" } }) },
      rpc: async () => { calls++; return { data: null, error: null }; },
    }));
    assert.equal((await createHandler(deps(backend))(request({ action: "list" }, jwt))).status, 401);
    assert.equal(calls, 0);
  }
});

test("slow Auth/body/RPC time out and abort; quotas map to 429", async () => {
  const never = () => new Promise<never>(() => {});
  let h = createHandler(deps({ timeoutMs: 15, authenticate: never }));
  assert.equal((await h(request({ action: "list" }))).status, 504);
  h = createHandler(deps({ timeoutMs: 15, execute: never }));
  assert.equal((await h(request({ action: "list" }))).status, 504);
  h = createHandler(deps({ timeoutMs: 15 }));
  const slow = new Request("https://local.invalid", { method: "POST", duplex: "half",
    headers: { Authorization: "Bearer jwt", "Content-Type": "application/json" },
    body: new ReadableStream({ start() {} }),
  } as RequestInit);
  assert.equal((await h(slow)).status, 504);
  h = createHandler(deps({ execute: async () => ({ data: null, error: { code: "P0429" } }) }));
  assert.equal((await h(request({ action: "create", name: "Site" }))).status, 429);
});

test("malformed issuance response fails without leaking secrets", async () => {
  const h = createHandler(deps({ execute: async () => ({ data: { data: row, secret: "bad-secret" }, error: null }) }));
  const response = await h(request({ action: "create", name: "Site" }));
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes("bad-secret"), false);
});
