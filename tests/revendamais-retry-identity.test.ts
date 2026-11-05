import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeRetryLeadIds } from "../supabase/functions/revendamais-leads/retry-identity.ts";
import { createRevendaMaisAdapter } from "../supabase/functions/revendamais-leads/revendamais-adapter.ts";
import { createHandler } from "../supabase/functions/revendamais-leads/handler.ts";
import { createReceiptPersistence } from "../supabase/functions/revendamais-leads/persistence.ts";
import type { ReceiptRpc } from "../supabase/functions/revendamais-leads/persistence.ts";

const secret = "a".repeat(64); // Public fixture only.
const payload = (attempt: string, ids: unknown[] = [777], text = "", extra: Record<string, unknown> = {}) => ({
  dealer_id: 9325, id: attempt, client_name: "Pessoa Ficticia", client_phone: "85999990000", title: "Interesse A",
  lead_channel_id: 900002, channel_name: "Canal ficticio", created_at: "2026-09-17 08:49:53",
  interations: ids.map(lead_id => ({ lead_id, html: text, direction: 1, type_id: 3 })), ...extra,
});
const request = (value: unknown) => new Request(`https://local.invalid/?secret=${secret}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value),
});
type Args = Parameters<ReceiptRpc>[1];

// Executable specification of the SQL decision, NOT a PostgreSQL lock/rollback proof.
class ReviewStore {
  rows: { id: string; dealer: string | null; retryId: string | null; status: string;
    relation: string; related: string | null; signature: string; args: Args }[] = [];
  failNext = false;
  private tail: Promise<unknown> = Promise.resolve();
  rpc: ReceiptRpc = async (_, args) => {
    const work = this.tail.then(async () => {
      if (this.failNext) { this.failNext = false; throw new Error("fixture receipt failure"); }
      const m = args.p_metadata, l = args.p_lead;
      const identity = analyzeRetryLeadIds(m.interactionLeadIds ?? []);
      const dealer = m.dealerId ?? null;
      const retryId = identity.status === "consistent" && dealer ? identity.leadId : null;
      const business = [l.name?.toLowerCase(),l.phone,l.email,l.title?.toLowerCase(),l.firstMessage,l.portal,
        m.channelId,m.channelName?.toLowerCase(),m.unknownInteraction?.text ?? null,m.unknownTextPresent];
      const signature = Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(business)))).toString("hex");
      const prior = retryId ? this.rows.filter(r => r.dealer === dealer && r.retryId === retryId) : [];
      const conflict = prior.some(r => r.signature !== signature);
      const relation = conflict ? "content_conflict" : prior.length ? "automatic_resend" : "none";
      const id = `aaaaaaaa-0000-4000-8000-${String(this.rows.length + 1).padStart(12,"0")}`;
      this.rows.push({ id,dealer,retryId,status: identity.status,relation,
        related: relation === "automatic_resend" ? prior[0].id : null, signature, args: structuredClone(args) });
      return { data: { status: "review", receiptId: id }, error: null };
    });
    this.tail = work.catch(() => {});
    return work;
  };
}
function setup(dealerId = "9325", store = new ReviewStore()) {
  return { store, handler: createHandler({ secret,dealerId,
    persistenceFactory: () => createReceiptPersistence(store.rpc), externalIdIsStable: false }) };
}

test("identity requires every interaction ID, not the first non-null one", () => {
  assert.deepEqual(analyzeRetryLeadIds(["777","777"]), { status: "consistent", leadId: "777" });
  for (const [ids,status] of [[[],"empty"],[[null],"incomplete"],[["777",null],"incomplete"],
    [["777","888"],"ambiguous"],[["777","888",null],"ambiguous"],[["bad"],"incomplete"]] as const) {
    assert.deepEqual(analyzeRetryLeadIds(ids), { status, leadId: null });
  }
  const adapter = createRevendaMaisAdapter({ authorizedDealerId: "9325" });
  const e = adapter.inspect(payload("100001",[777,"777"]));
  assert.equal(e.metadata.retryLeadId,"777");
  assert.equal(e.metadata.retryIdentityStatus,"consistent");
  assert.equal(e.fields.externalId,null); // Never an opportunity ID.
});

test("four concurrent automatic retries recognize one submission while preserving four receipts/metadatas", async () => {
  const { store,handler } = setup();
  const results = await Promise.all(["100001","100002","100003","100004"].map(id => handler(request(payload(id,[777,777])))));
  assert.ok(results.every(r => r.status === 202));
  assert.equal(store.rows.length,4);
  assert.equal(new Set(store.rows.map(r => r.id)).size,4);
  assert.deepEqual(store.rows.map(r => r.relation),["none","automatic_resend","automatic_resend","automatic_resend"]);
  assert.deepEqual(store.rows.map(r => r.args.p_metadata.deliveryAttemptId),["100001","100002","100003","100004"]);
  assert.ok(store.rows.every(r => r.dealer === "9325" && r.retryId === "777" && r.args.p_metadata.createdAt === "2026-09-17 08:49:53"));
  assert.ok(store.rows.every(r => r.args.p_identity_confirmed === false && r.args.p_lead.externalId === null));
});

test("legitimate submissions of same customer and same message with different lead_id never associate", async () => {
  const { store,handler } = setup();
  await handler(request(payload("100001",[777],"Mensagem igual")));
  await handler(request(payload("100002",[888],"Mensagem igual")));
  assert.equal(store.rows[0].signature,store.rows[1].signature);
  assert.ok(store.rows.every(r => r.related === null && r.relation === "none"));
  assert.ok(store.rows.every(r => r.args.p_lead.firstMessage === null && r.args.p_metadata.unknownInteraction === null));
});

test("empty, missing, invalid and divergent IDs persist without a commercial-only association", async () => {
  const { store,handler } = setup();
  await handler(request(payload("100001",[777])));
  for (const ids of [[],[777,null],[777,888],[null],["invalid"]]) {
    assert.equal((await handler(request(payload("100002",ids)))).status,202);
  }
  assert.equal(store.rows.length,6);
  assert.ok(store.rows.slice(1).every(r => r.retryId === null && r.related === null));
  assert.equal(new Set(store.rows.map(r => r.signature)).size,1); // No fingerprint fallback.
});

test("dealer is part of the retry scope and unauthorized incoming dealer is denied first", async () => {
  const { store,handler } = setup();
  await handler(request(payload("100001",[777])));
  assert.equal((await handler(request(payload("100002",[777],"",{dealer_id:900003})))).status,403);
  assert.equal(store.rows.length,1);
  const other = setup("900003",store); // Separate trusted fixture configuration only.
  await other.handler(request(payload("100002",[777],"",{dealer_id:900003})));
  assert.equal(store.rows[1].related,null);
});

test("commercial changes within the same retry identity remain conflict reviews", async () => {
  const { store,handler } = setup();
  await handler(request(payload("100001",[777])));
  await handler(request(payload("100002",[777],"",{title:"Conteudo alterado"})));
  assert.equal(store.rows[1].relation,"content_conflict");
  assert.equal(store.rows[1].related,null);
  assert.equal(store.rows.length,2);
});

test("transaction failure never acknowledges or consumes a receipt; retry is preserved", async () => {
  const { store,handler } = setup();
  store.failNext = true;
  assert.equal((await handler(request(payload("100001",[777])))).status,503);
  assert.equal(store.rows.length,0);
  assert.equal((await handler(request(payload("100002",[777])))).status,202);
  assert.equal(store.rows.length,1);
});
