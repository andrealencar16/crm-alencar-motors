import { test } from "node:test";
import assert from "node:assert/strict";
import { createRevendaMaisAdapter, htmlToPlainText } from "../supabase/functions/revendamais-leads/revendamais-adapter.ts";
import { normalizeLead } from "../supabase/functions/revendamais-leads/lead.ts";
import { createLeadProcessor } from "../supabase/functions/revendamais-leads/processing.ts";
import { createReceiptPersistence } from "../supabase/functions/revendamais-leads/persistence.ts";
import { createRevendaMaisAdapterFromEnv } from "../supabase/functions/revendamais-leads/server-config.ts";

// Official dealer ID; all customer/lead/channel data and enum meanings are fictitious.
const dealer = "9325";
const config = { authorizedDealerId: dealer };
const adapter = createRevendaMaisAdapterFromEnv(() => dealer);
const payload = (overrides: Record<string, unknown> = {}) => ({
  dealer_id: Number(dealer), id: "100001", client_name: "Pessoa Fictícia", client_phone: "(85) 99999-0000",
  title: "Interesse fictício", lead_channel_id: 900002,
  channel_name: '<span class="fa" style="color:red"></span>&nbsp;Canal fictício',
  stage_name: "Novo Lead", created_at: "2026-09-17 08:49:53", interations: [], ...overrides,
});
const interaction = (overrides: Record<string, unknown> = {}) => ({
  lead_id: 100001, type_id: 88, direction: 77, html: "<b>Mensagem fictícia</b>",
  created_at: "2026-09-17 08:49:53", ...overrides,
});
const confirmed = () => createRevendaMaisAdapter({ ...config, customerInteraction: { direction: 77, typeIds: [88] } });

test("complete payload maps confirmed keys and preserves source metadata", () => {
  const raw = payload({ interations: [interaction()] });
  const event = adapter.inspect(raw);
  const result = normalizeLead(raw, adapter.map);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.lead.phone, "+5585999990000");
  assert.equal(result.lead.name, "Pessoa Fictícia");
  assert.equal(result.lead.portal, "Canal fictício");
  assert.equal(result.lead.email, null);
  assert.equal(result.lead.externalId, null);
  assert.equal(result.lead.firstMessage, null);
  assert.equal(event.metadata.messageSelection, "unconfirmed_sender");
  assert.equal(event.metadata.channelId, "900002");
  assert.equal(event.metadata.deliveryAttemptId, "100001");
  assert.equal(event.metadata.sourceLeadIdHint, "100001");
  assert.equal(event.metadata.createdAt, "2026-09-17 08:49:53");
  assert.equal(event.metadata.timezone, "unspecified");
  assert.equal(event.metadata.interactions[0].text, "Mensagem fictícia");
});

test("empty phone, absent name, null fields and empty interactions remain absent", () => {
  const raw = payload({ client_phone: "", client_name: null, title: null, channel_name: null, lead_channel_id: null, created_at: null, interations: null });
  const r = normalizeLead(raw, adapter.map);
  assert.ok(r.ok && r.lead.phone === null && r.lead.name === null && r.lead.portal === null && r.lead.firstMessage === null);
  const missing = payload();
  delete (missing as Record<string, unknown>).client_name;
  assert.equal(adapter.inspect(missing).fields.name, null);
});

test("missing or invalid event IDs remain null and select persisted-review route (mock)", async () => {
  for (const value of [null, undefined, "", "0", -1, 1.5, Number.MAX_SAFE_INTEGER + 1, {}, "../bad", "00123"]) {
    const raw = payload({ id: value });
    if (value === undefined) delete (raw as Record<string, unknown>).id;
    let called = false;
    const process = createLeadProcessor({ adapter: adapter.map, externalIdIsStable: true, persistence: {
      commit: async c => { called = true; assert.equal(c.identity, "manual_review"); assert.equal(c.lead.externalId, null); return { status: "review", receiptId: "fixture-review" }; },
    } });
    assert.equal((await process(raw)).status, "review");
    assert.equal(called, true);
  }
});

test("dealer identity is mandatory, exact, server-owned and has no sample default", () => {
  for (const value of [1136, null, "900002", {}, 1.5]) {
    assert.equal(normalizeLead(payload({ dealer_id: value }), adapter.map).ok, false);
  }
  assert.throws(() => createRevendaMaisAdapter({ authorizedDealerId: "" }), /configuration/);
  const mutable = { authorizedDealerId: dealer };
  const fixed = createRevendaMaisAdapter(mutable);
  mutable.authorizedDealerId = "1136";
  assert.equal(normalizeLead(payload({ dealer_id: 1136 }), fixed.map).ok, false);
});

test("changing root delivery id does not invalidate interations.lead_id or turn that hint into identity", () => {
  const r = adapter.inspect(payload({ id: "100002", interations: [interaction({ lead_id: 100001 })] }));
  assert.equal(r.metadata.deliveryAttemptId, "100002");
  assert.equal(r.metadata.sourceLeadIdHint, "100001");
  assert.equal(r.fields.externalId, null);
  assert.equal(r.fields.firstMessage, null);
});

test("HTML is reduced to text, with scripts/attributes/URLs never executed or copied", () => {
  const html = '<script>steal()</script><style>hide</style><svg><script>bad()</script></svg><p onclick="evil()">Olá &amp; teste<br> &#x1f697;</p><img src="https://example.invalid/a" onerror="evil()">';
  assert.equal(htmlToPlainText(html), "Olá & teste 🚗");
  assert.equal(htmlToPlainText('<a title="x > y" href="javascript:bad()">Texto</a>'), "Texto");
  assert.equal(htmlToPlainText('<!--secret--><b>email:</b> teste <br>'), "email: teste");
  assert.equal(htmlToPlainText('<script>unclosed'), "");
  // Entity-encoded tags are literal TEXT: no recursive parsing or rendering.
  assert.equal(htmlToPlainText('&lt;script&gt;x&lt;/script&gt;'), '<script>x</script>');
  const r = normalizeLead(payload({ channel_name: html, interations: [interaction({ html })] }), confirmed().map);
  assert.ok(r.ok && r.lead.firstMessage === "Olá & teste 🚗");
});

test("first customer message uses confirmed enum policy and chronological order", () => {
  const raw = payload({ interations: [
    interaction({ html: "Vendedor", direction: 66, created_at: "2026-09-16 08:00:00" }),
    interaction({ html: "Posterior", created_at: "2026-09-18 08:00:00" }),
    interaction({ html: "Primeira", created_at: "2026-09-17 08:00:00" }),
    interaction({ html: "Sistema", type_id: 99, created_at: "2026-09-15 08:00:00" }),
  ] });
  assert.equal(confirmed().inspect(raw).fields.firstMessage, "Primeira");
  assert.equal(adapter.inspect(raw).fields.firstMessage, null);
});

test("missing date, conflicting timestamp ties, missing lead linkage do not guess ordering", () => {
  for (const interations of [
    [interaction(), interaction({ html: "Outra", created_at: null })],
    [interaction(), interaction({ html: "Outra" })],
  ]) {
    const e = confirmed().inspect(payload({ interations }));
    assert.equal(e.fields.firstMessage, null);
    assert.equal(e.metadata.messageSelection, "ambiguous_order");
  }
  assert.equal(confirmed().inspect(payload({ interations: [interaction({ lead_id: null })] })).fields.firstMessage, null);
  assert.equal(confirmed().inspect(payload({ interations: [interaction({ html: "<br>" })] })).fields.firstMessage, null);
});

test("dates validate calendar without interpreting timezone", () => {
  for (const value of ["2026-02-30 12:00:00", "2026-09-17T08:49:53Z", "2026-09-17 24:00:00", 42]) {
    assert.equal(normalizeLead(payload({ created_at: value }), adapter.map).ok, false);
  }
  assert.equal(adapter.inspect(payload({ created_at: "2024-02-29 12:00:00" })).metadata.createdAt, "2024-02-29 12:00:00");
});

test("dealer contacts and unknown administrative fields are never mapped", () => {
  const raw = payload({ dealer_email: "dealer@example.invalid", dealer_phone: "+5585888888888",
    org_id: "forged", owner_id: "forged", stage_id: "forged", permissions: ["admin"], unknown: { harmless: true }, client_phone: null });
  const event = adapter.inspect(raw);
  assert.equal(event.fields.email, null);
  assert.equal(event.fields.phone, null);
  assert.equal(JSON.stringify(event).includes("forged"), false);
  assert.equal(JSON.stringify(event).includes("dealer@example"), false);
});

test("invalid known types, cross-lead interactions and invalid configuration fail closed", () => {
  for (const change of [{ client_name: {} }, { client_phone: 123 }, { title: [] }, { interations: {} },
    { interations: [null] },
    { interations: [interaction({ direction: "1" })] }, { lead_channel_id: "bad" }]) {
    assert.equal(normalizeLead(payload(change), adapter.map).ok, false);
  }
  assert.throws(() => createRevendaMaisAdapter({ ...config, customerInteraction: { direction: 1, typeIds: [] } }));
});

test("size, structural depth, interaction count, HTML depth, cycles and accessors are bounded", () => {
  let deep: Record<string, unknown> = {};
  const root = deep;
  for (let i = 0; i < 10; i++) { const next = {}; deep.child = next; deep = next; }
  for (const raw of [payload({ unknown: "x".repeat(65536) }), payload({ unknown: root }),
    payload({ interations: Array.from({ length: 51 }, () => interaction()) }),
    payload({ channel_name: '<div>'.repeat(33) + 'text' + '</div>'.repeat(33) }),
    payload({ channel_name: '<br>'.repeat(513) }), payload({ channel_name: "x".repeat(12001) })]) {
    assert.equal(normalizeLead(raw, adapter.map).ok, false);
  }
  const cycle: Record<string, unknown> = payload(); cycle.self = cycle;
  assert.equal(normalizeLead(cycle, adapter.map).ok, false);
  let accessed = false;
  const getter = payload(); Object.defineProperty(getter, "extra", { enumerable: true, get() { accessed = true; return "bad"; } });
  assert.equal(normalizeLead(getter, adapter.map).ok, false);
  assert.equal(accessed, false);
});

test("root ID is delivery metadata only; another dealer never grants business identity", async () => {
  const other = createRevendaMaisAdapter({ authorizedDealerId: "900003" });
  assert.equal(adapter.inspect(payload()).fields.externalId, null);
  assert.equal(other.inspect(payload({ dealer_id: 900003 })).fields.externalId, null);
  const persistence = createReceiptPersistence(async (name, args) => {
    assert.equal(name, "revendamais_commit_lead");
    assert.equal(args.p_lead.externalId, null);
    assert.equal(args.p_identity_confirmed, false);
    return { data: { status: "review", receiptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, error: null };
  });
  const process = createLeadProcessor({ adapter: adapter.map, persistence, externalIdIsStable: false });
  assert.equal((await process(payload())).status, "review");
});

test("server env accepts official dealer as number/string and fails closed without config", () => {
  const configured = createRevendaMaisAdapterFromEnv(name => {
    assert.equal(name, "REVENDAMAIS_DEALER_ID");
    return dealer;
  });
  for (const value of [Number(dealer), dealer]) {
    assert.equal(normalizeLead(payload({ dealer_id: value }), configured.map).ok, true);
  }
  for (const value of [undefined, "", " 9325 ", "0", "invalid"]) {
    assert.throws(() => createRevendaMaisAdapterFromEnv(() => value), /configuration/);
  }
});

test("other dealers are rejected before any persistence call, regardless of claimed CRM org", async () => {
  let calls = 0;
  const process = createLeadProcessor({ adapter: adapter.map, externalIdIsStable: true, persistence: {
    commit: async () => { calls++; return { status: "review", receiptId: "fixture" }; },
  } });
  for (const value of [1136, "1136", 900003, null, "09325"]) {
    assert.deepEqual(await process(payload({ dealer_id: value, org_id: "alencar", authorizedDealerId: value })), { status: "invalid" });
  }
  assert.equal(calls, 0);
  await process(payload({ org_id: "forged-other-org" }));
  assert.equal(calls, 1);
});
