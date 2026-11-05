import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeLead } from "../supabase/functions/revendamais-leads/lead.ts";
import type { AdaptedLead, Lead, LeadAdapter } from "../supabase/functions/revendamais-leads/lead.ts";
import { createLeadProcessor } from "../supabase/functions/revendamais-leads/processing.ts";
import type { CommitResult, LeadPersistence } from "../supabase/functions/revendamais-leads/processing.ts";

// This fixture envelope is invented FOR TESTS ONLY, never a provider adapter.
const adapter: LeadAdapter = (raw) => (raw as { fixture: AdaptedLead }).fixture;
const payload = (fields: AdaptedLead = {}) => ({ fixture: {
  name: "Pessoa Fictícia", phone: "(85) 99999-0000", email: "fiction@example.invalid",
  title: "Interesse fictício A", firstMessage: "Olá, teste fictício", externalId: "fixture-1", ...fields,
} });

/** Executable specification, NOT a database adapter or concurrency proof. */
class MemoryPersistence implements LeadPersistence {
  contacts: { id: string; lead: Lead }[] = [];
  deals: { id: string; contactId: string; lead: Lead }[] = [];
  receipts = new Map<string, CommitResult>();
  reviews: Lead[] = [];
  fail = false;
  async commit(command: Parameters<LeadPersistence["commit"]>[0]): Promise<CommitResult> {
    if (this.fail) throw new Error("fixture failure, no changes committed");
    const { lead } = command;
    if (command.identity === "manual_review") {
      this.reviews.push(lead);
      return { status: "review", receiptId: `review-${this.reviews.length}` };
    }
    assert.fail("Unstable provider identity must always select review");
  }
}
const setup = (externalIdIsStable = true) => {
  const persistence = new MemoryPersistence();
  return { persistence, process: createLeadProcessor({ adapter, persistence, externalIdIsStable }) };
};

test("complete lead is reviewed with title/message preserved, without automatic CRM writes", async () => {
  const { persistence, process } = setup();
  assert.equal((await process(payload())).status, "review");
  assert.equal(persistence.contacts.length, 0);
  assert.equal(persistence.deals.length, 0);
  assert.equal(persistence.reviews[0].firstMessage, "Olá, teste fictício");
  assert.equal(persistence.reviews[0].title, "Interesse fictício A");
});

test("different attempt IDs and another commercial interest all preserve separate reviews", async () => {
  const { persistence, process } = setup();
  await process(payload());
  assert.equal((await process(payload())).status, "review");
  assert.equal((await process(payload({ externalId: "fixture-2", title: "Interesse B" }))).status, "review");
  assert.equal(persistence.contacts.length, 0);
  assert.equal(persistence.deals.length, 0);
  assert.equal(persistence.reviews.length, 3);
});

test("missing identifiers, ambiguous identity and missing name are reviewed without invented contact", async () => {
  for (const fields of [{ phone: null, email: null }, { name: null }]) {
    const { persistence, process } = setup();
    assert.equal((await process(payload(fields))).status, "review");
    assert.equal(persistence.contacts.length, 0);
    assert.equal(persistence.deals.length, 0);
  }
  const { persistence, process } = setup();
  await process(payload());
  await process(payload({ externalId: "fixture-2", email: "other@example.invalid", phone: "85988880000" }));
  assert.equal((await process(payload({ externalId: "fixture-3", email: "other@example.invalid" }))).status, "review");
  assert.equal(persistence.deals.length, 0);
  assert.equal(persistence.reviews.length, 3);
});

test("unknown origin, missing email, empty message and incomplete name", () => {
  const res = normalizeLead(payload({ name: "  Ana  ", email: "", portal: "Portal não catalogado", firstMessage: "  ", title: "" }), adapter);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.lead.name, "Ana");
    assert.equal(res.lead.email, null);
    assert.equal(res.lead.firstMessage, null);
    assert.equal(res.lead.portal, "Portal não catalogado");
    assert.equal(res.lead.title, "Interesse recebido pelo Revenda Mais");
  }
  const absent = normalizeLead(payload({ portal: undefined }), adapter);
  assert.ok(absent.ok && absent.lead.portal === null);
});

test("Brazilian phone variants converge without inferring missing numbers", () => {
  for (const phone of ["85999990000", "+55 (85) 99999-0000", "5585999990000", "005585999990000"]) {
    const r = normalizeLead(payload({ phone }), adapter);
    assert.ok(r.ok && r.lead.phone === "+5585999990000");
  }
  for (const phone of ["999990000", "+185999990000", "phone", "00000000000"]) {
    assert.equal(normalizeLead(payload({ phone }), adapter).ok, false);
  }
});

test("invalid payload, field types, oversized values and adapter exceptions do not persist", async () => {
  const { persistence, process } = setup();
  for (const raw of [null, [], "raw", {}, { fixture: {} }, payload({ email: "bad" }), payload({ name: 42 }), payload({ firstMessage: "x".repeat(10001) })]) {
    assert.equal((await process(raw)).status, "invalid");
  }
  assert.equal(persistence.contacts.length, 0);
  assert.equal(normalizeLead({}, () => { throw new Error("private"); }).ok, false);
});

test("missing or unconfirmed external ID goes to review; identical interests are not silently dropped", async () => {
  for (const trusted of [true, false]) {
    const { persistence, process } = setup(trusted);
    const raw = payload({ externalId: trusted ? null : "unconfirmed" });
    assert.equal((await process(raw)).status, "review");
    assert.equal((await process(raw)).status, "review");
    assert.equal(persistence.reviews.length, 2);
    assert.equal(persistence.deals.length, 0);
  }
});

test("persistence failure is retryable and every successful resubmission is reviewed", async () => {
  const { persistence, process } = setup();
  persistence.fail = true;
  assert.deepEqual(await process(payload()), { status: "retry" });
  assert.equal(persistence.deals.length, 0);
  assert.equal(persistence.receipts.size, 0);
  persistence.fail = false;
  assert.equal((await process(payload())).status, "review");
  assert.equal((await process(payload())).status, "review");
  assert.equal(persistence.deals.length, 0);
  assert.equal(persistence.reviews.length, 2);
});

test("privileged payload fields and arbitrary persistence output are not forwarded", async () => {
  let captured = "";
  const process = createLeadProcessor({ adapter, externalIdIsStable: false, persistence: {
    commit: async (command) => { captured = JSON.stringify(command); return { status: "review", receiptId: "receipt" }; },
  } });
  await process({ ...payload(), org_id: "evil", owner_id: "evil", permissions: "evil", stage_id: "evil" });
  assert.equal(captured.includes("evil"), false);
  const malformed = createLeadProcessor({ adapter, externalIdIsStable: true, persistence: { commit: async () => ({} as CommitResult) } });
  assert.deepEqual(await malformed(payload()), { status: "retry" });
});
