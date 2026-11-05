import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler, MAX_BYTES } from "../supabase/functions/revendamais-leads/handler.ts";
import { createReceiptPersistence } from "../supabase/functions/revendamais-leads/persistence.ts";
import type { ReceiptRpc } from "../supabase/functions/revendamais-leads/persistence.ts";
const secret = "a".repeat(64); // Public fixture, never a real credential.
const dealer = "9325";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const url = `https://local.invalid/revendamais-leads?secret=${secret}`;
const payload = (extra: Record<string, unknown> = {}) => ({ dealer_id: Number(dealer), id: "100001",
  client_name: "Pessoa Ficticia", client_phone: "85999990000", title: "Interesse ficticio", interations: [], ...extra });
const req = (value: unknown = payload(), target = url) => new Request(target, { method: "POST",
  headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
const factory = (rpc: ReceiptRpc, confirmed = false) => () => createReceiptPersistence(rpc, { externalIdentityConfirmed: confirmed });
const success: ReceiptRpc = async () => ({ data: { status: "created", contactId: id, dealId: id }, error: null });
const handler = (extra: Partial<Parameters<typeof createHandler>[0]> = {}) => createHandler({
  secret, dealerId: dealer, persistenceFactory: factory(success), ...extra,
});

test("authentication precedes every privileged action, including credential/config access", async () => {
  let calls = 0;
  const h = handler({ persistenceFactory: () => { calls++; throw new Error("private"); } });
  for (const query of ["", "?secret=bad", `?secret=${"b".repeat(64)}`, `?secret=${secret}&secret=${secret}`]) {
    assert.equal((await h(req(payload(), `https://local.invalid/${query}`))).status, 401);
  }
  assert.equal(calls, 0);
});

test("secret and dealer configuration mandatory; persistence is opt-in", async () => {
  for (const value of [undefined, "", "short"]) assert.equal((await handler({ secret: value })(req())).status, 503);
  for (const value of [undefined, "", "bad"]) assert.equal((await handler({ dealerId: value })(req())).status, 503);
  assert.equal((await handler({ persistenceFactory: undefined })(req())).status, 503);
});

test("other dealer denied before persistence; official dealer accepted", async () => {
  let calls = 0;
  const h = handler({ persistenceFactory: factory(async (name, args) => { calls++; return success(name,args); }) });
  for (const value of [1136, "900003", null]) assert.equal((await h(req(payload({ dealer_id: value })))).status, 403);
  assert.equal(calls, 0);
  assert.equal((await h(req())).status, 201);
  assert.equal(calls, 1);
});

test("durable created, duplicate and review map to explicit 2xx without internal IDs", async () => {
  for (const [status, code, data] of [
    [201, "created", { status: "created", contactId: id, dealId: id }],
    [200, "duplicate", { status: "duplicate", contactId: id, dealId: id }],
    [202, "review_persisted", { status: "review", receiptId: id }],
  ] as const) {
    const res = await handler({ persistenceFactory: factory(async () => ({ data, error: null })) })(req());
    assert.equal(res.status, status);
    assert.deepEqual(await res.json(), { status: code });
    assert.equal(res.headers.get("Cache-Control"), "no-store");
  }
});

test("no response before durable confirmation, even after RPC invocation", async () => {
  let release!: (value: Awaited<ReturnType<ReceiptRpc>>) => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const pending = new Promise<Awaited<ReturnType<ReceiptRpc>>>(resolve => { release = resolve; });
  let responded = false;
  const response = handler({ persistenceFactory: factory(async () => { entered(); return pending; }) })(req()).then(r => { responded = true; return r; });
  await started;
  assert.equal(responded, false);
  release({ data: { status: "created", contactId: id, dealId: id }, error: null });
  assert.equal((await response).status, 201);
});

test("same event, new interest and divergent event delegate identity to one transactional RPC (mock)", async () => {
  let calls = 0;
  const h = handler({ externalIdIsStable: true, persistenceFactory: factory(async (_, args) => {
    assert.equal(args.p_identity_confirmed, true);
    assert.equal(args.p_lead.externalId, "dealer:9325:lead:100001");
    const status = calls++ === 0 ? "created" : args.p_lead.title === "Divergent" ? "review" : "duplicate";
    return { data: status === "review" ? { status, receiptId: id } : { status, contactId: id, dealId: id }, error: null };
  }, true) });
  assert.equal((await h(req())).status, 201);
  assert.equal((await h(req())).status, 200);
  assert.equal((await h(req(payload({ title: "Divergent" })))).status, 202);
  assert.equal(calls, 3);
});

test("missing phone/ID goes to review; administrative fields and dealer contacts never reach RPC", async () => {
  const h = handler({ persistenceFactory: factory(async (_, args) => {
    assert.equal(args.p_identity_confirmed, false);
    assert.equal(args.p_lead.phone, null);
    assert.equal(args.p_lead.email, null);
    assert.equal(args.p_lead.externalId, null);
    assert.equal(JSON.stringify(args).includes("forged"), false);
    return { data: { status: "review", receiptId: id }, error: null };
  }) });
  assert.equal((await h(req(payload({ id: null, client_phone: "", org_id: "forged", owner_id: "forged", stage_id: "forged", dealer_email: "forged" })))).status, 202);
});

test("channel/date reach RPC and unapproved text is omitted without blocking review", async () => {
  let calls = 0;
  const h = handler({ persistenceFactory: factory(async (_, args) => {
    calls++;
    if (calls === 1) {
      assert.equal(args.p_metadata.channelId, "10");
      assert.equal(args.p_metadata.createdAt, "2026-09-17 08:49:53");
      assert.equal(args.p_metadata.channelName, "Canal ficticio");
    } else {
      assert.equal(args.p_metadata.unknownTextPresent, true);
      assert.equal(args.p_metadata.unknownInteraction, null);
    }
    assert.equal(args.p_lead.portal, null);
    return { data: { status: "review", receiptId: id }, error: null };
  }) });
  assert.equal((await h(req(payload({ lead_channel_id: 10, channel_name: "<b>Canal ficticio</b>", created_at: "2026-09-17 08:49:53" })))).status, 202);
  const res = await h(req(payload({ interations: [{ lead_id: 100001, html: "<b>Unknown sender</b>", direction: 1, type_id: 3 }] })));
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { status: "review_persisted" });
  assert.equal(calls, 2);
});

test("RPC errors and malformed confirmations never produce 2xx or internal data", async () => {
  for (const rpc of [async () => { throw new Error(secret + "private@example.invalid"); },
    async () => ({ data: null, error: { message: "private@example.invalid" } }),
    async () => ({ data: { status: "created" }, error: null })] as ReceiptRpc[]) {
    const res = await handler({ persistenceFactory: factory(rpc) })(req());
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { status: "persistence_unavailable" });
  }
});

test("RPC timeout aborts signal, returns 504 and does not turn a late commit into success", async () => {
  let signal!: AbortSignal;
  let resolve!: (value: Awaited<ReturnType<ReceiptRpc>>) => void;
  const pending = new Promise<Awaited<ReturnType<ReceiptRpc>>>(r => { resolve = r; });
  const h = handler({ persistenceTimeoutMs: 30, persistenceFactory: s => { signal = s; return createReceiptPersistence(async () => pending); } });
  const res = await h(req());
  assert.equal(res.status, 504);
  assert.equal(signal.aborted, true);
  resolve({ data: { status: "created", contactId: id, dealId: id }, error: null });
  assert.deepEqual(await res.json(), { status: "persistence_timeout" });
});

test("POST only, JSON only, malformed/invalid bodies and actual byte limits", async () => {
  let calls = 0;
  const h = handler({ persistenceFactory: () => { calls++; throw new Error(); } });
  for (const method of ["GET", "PUT", "DELETE", "HEAD", "OPTIONS"]) assert.equal((await h(new Request(url, { method }))).status, 405);
  for (const body of ["", "{", "null", '"value"', "123"]) {
    assert.equal((await h(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body }))).status, 400);
  }
  assert.equal((await h(req(payload({ client_phone: "bad" })))).status, 400);
  assert.equal((await h(new Request(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "dealer_id=9325" }))).status, 415);
  for (const length of [undefined, "1", String(MAX_BYTES + 1)]) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (length) headers["content-length"] = length;
    assert.equal((await h(new Request(url, { method: "POST", headers, body: "x".repeat(MAX_BYTES + 1) }))).status, 413);
  }
  const chunks = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(40000)); c.enqueue(new Uint8Array(30000)); c.close(); } });
  assert.equal((await h(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: chunks, duplex: "half" } as RequestInit))).status, 413);
  assert.equal(calls, 0);
});

test("body timeout cancels stream and never touches persistence", async () => {
  let cancelled = false, calls = 0;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const request = new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
  const res = await handler({ bodyTimeoutMs: 10, persistenceFactory: () => { calls++; throw new Error(); } })(request);
  assert.equal(res.status, 408);
  assert.equal(cancelled, true);
  assert.equal(calls, 0);
});

test("lock contention, deadlock and database cancellation remain retryable without success", async () => {
  for (const code of ["55P03", "40P01", "57014"]) {
    const res = await handler({ persistenceFactory: factory(async () => ({ data: null, error: { code } })) })(req());
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("Retry-After"), "60");
    assert.deepEqual(await res.json(), { status: "persistence_unavailable" });
  }
});
