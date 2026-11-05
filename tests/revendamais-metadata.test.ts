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
    assert.equal(args.p_lead.externalId, null);
    assert.equal(args.p_metadata.deliveryAttemptId, "100001");
    assert.equal(args.p_lead.phone, null);
    assert.equal(args.p_lead.firstMessage, null);
    assert.equal(args.p_lead.email, null);
    assert.equal(args.p_lead.portal, null);
    assert.equal(args.p_unknown_text_retention_approved, true);
    assert.deepEqual(args.p_metadata, { deliveryAttemptId: "100001", dealerId: "9325", interactionLeadIds: ["100001"], sourceLeadIdHint: "100001", channelId: "900002", channelName: "Canal ficticio", createdAt: "2026-09-17 08:49:53", unknownTextPresent: true,
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
    assert.deepEqual(args.p_metadata, { deliveryAttemptId: "100001", dealerId: "9325", interactionLeadIds: [], sourceLeadIdHint: null, channelId: null, channelName: null, createdAt: null, unknownInteraction: null, unknownTextPresent: false });
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

test("commercial comparison signals ambiguity but preserves every attempt; failures stage no writes", async () => {
  // In-memory specification, NOT a PostgreSQL concurrency/rollback proof.
  const receipts: { signature: string; attempt: string | null; related: number | null }[] = [];
  let fail = true;
  const h = setup(async (_, args) => {
    const { deliveryAttemptId, channelId, channelName, unknownInteraction, unknownTextPresent } = args.p_metadata;
    const l = args.p_lead;
    const commercial = { name: l.name?.toLowerCase(), phone: l.phone, email: l.email,
      title: l.title?.toLowerCase(), firstMessage: l.firstMessage, portal: l.portal,
      channelId, channelName: channelName?.toLowerCase(), unknownText: unknownInteraction?.text ?? null, unknownTextPresent };
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(commercial)));
    const signature = Buffer.from(hash).toString("hex");
    const index = receipts.findIndex(r => r.signature === signature);
    if (fail) throw new Error("fixture_receipt_failure");
    receipts.push({ signature, attempt: deliveryAttemptId ?? null, related: index < 0 ? null : index });
    return { data: { status: "review", receiptId: id }, error: null };
  }, true);
  assert.equal((await h(request(reference()))).status, 503);
  assert.equal(receipts.length, 0);
  fail = false;
  for (const attempt of ["100001", "100002", "100003", "100004"]) {
    assert.equal((await h(request(reference({ id: attempt })))).status, 202);
  }
  assert.equal(receipts.length, 4);
  assert.equal(new Set(receipts.map(r => r.signature)).size, 1);
  assert.deepEqual(receipts.map(r => r.related), [null,0,0,0]);
  assert.equal((await h(request(reference({ id: "100005", title: "Outro interesse legitimo" })))).status, 202);
  assert.equal(receipts.length, 5);
  assert.equal(receipts[4].related, null);
});

test("unapproved text is omitted, presence is retained, and durable intake is not blocked", async () => {
  let calls = 0;
  const rpc: ReceiptRpc = async (_, args) => {
    calls++;
    if (!args.p_unknown_text_retention_approved) {
      assert.equal(args.p_metadata.unknownTextPresent, true);
      assert.equal(args.p_metadata.unknownInteraction, null);
      assert.equal(JSON.stringify(args).includes("fiction@example.invalid"), false);
    }
    return { data: { status: "review", receiptId: id }, error: null };
  };
  const omitted = await setup(rpc, false, false)(request(reference()));
  assert.equal(omitted.status, 202);
  assert.equal(calls, 1);
  const res = await setup(rpc)(request(reference()));
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { status: "review_persisted" });
  const sql = readFileSync(new URL("../drizzle/migrations/0011_revendamais_lead_receipts.sql", import.meta.url), "utf8");
  assert.match(sql, /unknown_text_expires_at <= now\(\)/);
  assert.match(sql, /SET unknown_interaction_text=NULL/);
  assert.match(sql, /interval '30 days'/);
  assert.match(sql, /p_unknown_text_retention_approved boolean DEFAULT false/);
  assert.match(sql, /'unknownText',v_unknown/);
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

test("complete lead with unconfirmed ID remains durable review, never implicit auto-create", async () => {
  const res = await setup(async (_, args) => {
    assert.equal(args.p_identity_confirmed, false);
    assert.equal(args.p_lead.phone, "+5585999990000");
    assert.equal(args.p_lead.externalId, null);
    assert.equal(args.p_metadata.deliveryAttemptId, "100001");
    assert.equal(args.p_metadata.unknownInteraction, null);
    return { data: { status: "review", receiptId: id }, error: null };
  }, false, false)(request(reference({ client_phone: "85999990000" })));
  assert.equal(res.status, 202);
});

test("obsolete confirmation cannot enable automatic creation or text retention", async () => {
  const res = await setup(async (_, args) => {
    assert.equal(args.p_identity_confirmed, false);
    assert.equal(args.p_metadata.unknownTextPresent, true);
    assert.equal(args.p_metadata.unknownInteraction, null);
    assert.equal(args.p_lead.firstMessage, null);
    return { data: { status: "review", receiptId: id }, error: null };
  }, true, false)(request(reference({ client_phone: "85999990000" })));
  assert.equal(res.status, 202);
});

test("persistence adapter strips unapproved text even if a caller supplies it directly", async () => {
  const store = createReceiptPersistence(async (_, args) => {
    assert.equal(args.p_metadata.unknownInteraction, null);
    assert.equal(args.p_metadata.unknownTextPresent, true);
    assert.equal(JSON.stringify(args).includes("must-not-reach-database"), false);
    return { data: { status: "review", receiptId: id }, error: null };
  });
  await store.commit({ provider: "revendamais", identity: "manual_review",
    lead: { name: "Teste", phone: null, email: null, title: "Teste", portal: null, externalId: null, firstMessage: null },
    metadata: { channelId: null, channelName: null, createdAt: null,
      unknownInteraction: { text: "must-not-reach-database", sourceIndex: 0, createdAt: null, authorship: "unknown" } },
  });
});

test("lock protection is retained with fail-fast acquisition; default flags remain off (static)", () => {
  const sql = readFileSync(new URL("../drizzle/migrations/0011_revendamais_lead_receipts.sql", import.meta.url), "utf8");
  assert.match(sql, /LOCK TABLE public.contacts IN SHARE ROW EXCLUSIVE MODE NOWAIT/);
  assert.match(sql, /unknown_text_disposition='expired'/);
  const example = readFileSync(new URL("../supabase/functions/revendamais-leads/.env.example", import.meta.url), "utf8");
  assert.match(example, /REVENDAMAIS_EXTERNAL_ID_CONFIRMED=false/);
  assert.match(example, /REVENDAMAIS_INGESTION_ENABLED=false/);
  assert.match(example, /REVENDAMAIS_UNKNOWN_TEXT_RETENTION_APPROVED=false/);
});

test("four concurrent delivery attempts and repeated attempt IDs all get distinct durable receipts (mock)", async () => {
  const stored: { attempt: string | null | undefined; receipt: string }[] = [];
  const h = setup(async (_, args) => {
    await Promise.resolve(); // Transport scheduling only, not a PostgreSQL lock proof.
    const receipt = `aaaaaaaa-aaaa-4aaa-8aaa-${String(stored.length + 1).padStart(12, "0")}`;
    stored.push({ attempt: args.p_metadata.deliveryAttemptId, receipt });
    return { data: { status: "review", receiptId: receipt }, error: null };
  }, true, false);
  const responses = await Promise.all(["100001","100002","100003","100004"].map(id => h(request(reference({ id })))));
  assert.ok(responses.every(r => r.status === 202));
  assert.equal(stored.length, 4);
  assert.equal(new Set(stored.map(r => r.receipt)).size, 4);
  assert.equal((await h(request(reference({ id: "100001" })))).status, 202);
  assert.equal(stored.length, 5); // Four attempts is not a cutoff or a merge rule.
});

test("prepared comparison does not include delivery IDs, unconfirmed hints or timestamps (static)", () => {
  const sql = readFileSync(new URL("../drizzle/migrations/0011_revendamais_lead_receipts.sql", import.meta.url), "utf8");
  const comparison = sql.slice(sql.indexOf("  v_digest :="), sql.indexOf("  -- Confirmed retry scope"));
  assert.doesNotMatch(comparison, /v_attempt|v_hint|v_external|v_source_date|v_unknown_date|v_unknown_index/);
  assert.match(comparison, /v_phone/);
  assert.match(comparison, /v_title/);
  assert.match(sql, /possible_related_receipt_id uuid REFERENCES public.revendamais_lead_receipts/);
  assert.match(sql, /unstable_delivery_identity/);
  assert.match(sql, /identity_confirmed boolean NOT NULL CHECK \(NOT identity_confirmed\)/);
  const index = readFileSync(new URL("../supabase/functions/revendamais-leads/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(index, /Deno.env.get\("REVENDAMAIS_EXTERNAL_ID_CONFIRMED"\)/);
});
