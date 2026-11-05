import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHandler } from "../supabase/functions/revendamais-leads/handler.ts";
import { createReceiptPersistence } from "../supabase/functions/revendamais-leads/persistence.ts";
import type { ReceiptRpc } from "../supabase/functions/revendamais-leads/persistence.ts";
const secret = "a".repeat(64);
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
// Shape of vendor reference, with official authorized dealer and fictional PII/IDs.
const reference = (extra: Record<string, unknown> = {}) => ({
  dealer_id: 9325, id: "100001", client_name: "Pessoa Ficticia", client_phone: "",
  title: "Proposta ficticia", lead_channel_id: 900002,
  channel_name: '<span class="fa" style="color:red"></span>&nbsp;Canal ficticio',
  stage_name: "Novo Lead", created_at: "2026-09-17 08:49:53",
  interations: [{ lead_id: 100001, type_id: 3, html: '<b>email:</b> fiction@example.invalid <br>', direction: 1, created_at: "2026-09-17 08:49:53" }], ...extra,
});
const request = (value: unknown) => new Request(`https://local.invalid/?secret=${secret}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value),
});
const setup = (rpc: ReceiptRpc, stable = false, approved = true) => createHandler({
  secret, dealerId: "9325", externalIdIsStable: stable, unknownTextRetentionApproved: approved,
  persistenceFactory: () => createReceiptPersistence(rpc, { externalIdentityConfirmed: stable, unknownTextRetentionApproved: approved }),
});

test("reference channel/date and unknown text are sent atomically, with no customer attribution", async () => {
  let calls = 0;
  const h = setup(async (_, args) => {
    calls++;
    assert.equal(args.p_lead.externalId, "dealer:9325:lead:100001");
    assert.equal(args.p_lead.phone, null);
    assert.equal(args.p_lead.firstMessage, null);
    assert.equal(args.p_lead.email, null);
    assert.equal(args.p_lead.portal, null);
    assert.equal(args.p_unknown_text_retention_approved, true);
    assert.deepEqual(args.p_metadata, { channelId: "900002", channelName: "Canal ficticio", createdAt: "2026-09-17 08:49:53",
      unknownInteraction: { text: "email: fiction@example.invalid", sourceIndex: 0, createdAt: "2026-09-17 08:49:53", authorship: "unknown" } });
    return { data: { status: "review", receiptId: id }, error: null };
  });
  const res = await h(request(reference()));
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { status: "review_persisted" });
  assert.equal(calls, 1);
});

test("missing optional metadata is explicit null, not fabricated", async () => {
  const h = setup(async (_, args) => {
    assert.deepEqual(args.p_metadata, { channelId: null, channelName: null, createdAt: null, unknownInteraction: null });
    return { data: { status: "review", receiptId: id }, error: null };
  });
  assert.equal((await h(request({ dealer_id: 9325, id: "100001", title: "Teste" }))).status, 202);
});

test("first useful interaction uses source position without treating it as first customer message", async () => {
  const h = setup(async (_, args) => {
    assert.equal(args.p_metadata.unknownInteraction?.sourceIndex, 1);
    assert.equal(args.p_metadata.unknownInteraction?.text, "Texto desconhecido");
    assert.equal(args.p_lead.firstMessage, null);
    return { data: { status: "review", receiptId: id }, error: null };
  });
  const interations = [
    { lead_id: 100001, html: "<script>ignore()</script>" },
    { lead_id: 100001, html: "<b>Texto desconhecido</b>", created_at: "2026-10-01 10:00:00" },
    { lead_id: 100001, html: "Outra interacao", created_at: "2026-09-01 10:00:00" },
  ];
  assert.equal((await h(request(reference({ interations })))).status, 202);
});

test("metadata participates in simulated idempotency/conflict and staged rollback", async () => {
  // In-memory transaction specification only; NOT a PostgreSQL rollback test.
  const receipts: { signature: string; status: string }[] = [];
  let fail = true, contacts = 0, deals = 0;
  const h = setup(async (_, args) => {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([args.p_lead, args.p_metadata])));
    const signature = Buffer.from(hash).toString("hex");
    const prior = receipts.find(r => r.signature === signature);
    if (prior) return { data: prior.status === "created" ? { status: "duplicate", contactId: id, dealId: id } : { status: "review", receiptId: id }, error: null };
    const status = receipts.length ? "review" : "created";
    // Stage all mutations; injected final receipt failure cannot commit CRM state.
    const nextContacts = contacts + (status === "created" ? 1 : 0);
    const nextDeals = deals + (status === "created" ? 1 : 0);
    if (fail) throw new Error("fixture_audit_failure");
    receipts.push({ signature, status }); contacts = nextContacts; deals = nextDeals;
    return { data: status === "created" ? { status, contactId: id, dealId: id } : { status, receiptId: id }, error: null };
  }, true);
  assert.equal((await h(request(reference()))).status, 503);
  assert.deepEqual([contacts, deals, receipts.length], [0,0,0]);
  fail = false;
  assert.equal((await h(request(reference()))).status, 201);
  assert.equal((await h(request(reference()))).status, 200);
  assert.equal((await h(request(reference({ lead_channel_id: 900003 })))).status, 202);
  assert.equal((await h(request(reference({ lead_channel_id: 900003 })))).status, 202);
  assert.deepEqual([contacts, deals, receipts.length], [1,1,2]);
});

test("retention is opt-in and response does not expose text, metadata or credentials", async () => {
  let calls = 0;
  const rpc: ReceiptRpc = async () => { calls++; return { data: { status: "review", receiptId: id }, error: null }; };
  const blocked = await setup(rpc, false, false)(request(reference()));
  assert.equal(blocked.status, 503);
  assert.equal(calls, 0);
  const res = await setup(rpc)(request(reference()));
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { status: "review_persisted" });
  const sql = readFileSync(new URL("../drizzle/migrations/0011_revendamais_lead_receipts.sql", import.meta.url), "utf8");
  assert.match(sql, /unknown_text_expires_at <= now\(\)/);
  assert.match(sql, /SET unknown_interaction_text=NULL/);
  assert.match(sql, /interval '30 days'/);
  assert.match(sql, /p_unknown_text_retention_approved boolean DEFAULT false/);
  assert.match(sql, /'metadata',v_meta/);
  for (const file of ["handler.ts","index.ts","processing.ts","persistence.ts"]) {
    const source = readFileSync(new URL(`../supabase/functions/revendamais-leads/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /console\.(log|error|warn)/);
  }
});

test("metadata reference cannot receive 2xx before RPC durable confirmation", async () => {
  let release!: (reply: Awaited<ReturnType<ReceiptRpc>>) => void;
  let entered!: () => void;
  const started = new Promise<void>(r => { entered = r; });
  const waiting = new Promise<Awaited<ReturnType<ReceiptRpc>>>(r => { release = r; });
  let replied = false;
  const pending = setup(async () => { entered(); return waiting; })(request(reference())).then(r => { replied = true; return r; });
  await started; assert.equal(replied, false);
  release({ data: { status: "review", receiptId: id }, error: null });
  assert.equal((await pending).status, 202);
});
