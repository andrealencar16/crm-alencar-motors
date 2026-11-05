import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createReceiptPersistence } from "../supabase/functions/revendamais-leads/persistence.ts";
import type { ReceiptRpc } from "../supabase/functions/revendamais-leads/persistence.ts";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const command = { provider: "revendamais", identity: "confirmed_external_id", lead: {
  name: "Pessoa Fictícia", phone: "+5585999990000", email: "fiction@example.invalid",
  title: "Interesse fictício", firstMessage: "Mensagem fictícia", portal: null, externalId: "fixture-1",
} } as const;

test("one RPC only, explicit field allowlist, trusted identity defaults off", async () => {
  for (const confirmed of [false, true]) {
    let calls = 0;
    const rpc: ReceiptRpc = async (name, args) => {
      calls++;
      assert.equal(name, "revendamais_commit_lead");
      assert.equal(args.p_identity_confirmed, confirmed);
      assert.deepEqual(Object.keys(args.p_lead).sort(), ["name","phone","email","title","firstMessage","portal","externalId"].sort());
      assert.equal(JSON.stringify(args).includes("forged"), false);
      return { data: { status: "created", contactId: id, dealId: id, ignored: "secret" }, error: null };
    };
    const store = createReceiptPersistence(rpc, confirmed ? { externalIdentityConfirmed: true } : undefined);
    const forged = { ...command, lead: { ...command.lead, org_id: "forged" } };
    assert.deepEqual(await store.commit(forged), { status: "created", contactId: id, dealId: id });
    assert.equal(calls, 1);
  }
});

test("manual review cannot be promoted by persistence configuration", async () => {
  const store = createReceiptPersistence(async (_, args) => {
    assert.equal(args.p_identity_confirmed, false);
    return { data: { status: "review", receiptId: id }, error: null };
  }, { externalIdentityConfirmed: true });
  assert.deepEqual(await store.commit({ ...command, identity: "manual_review" }), { status: "review", receiptId: id });
});

test("RPC failures and malformed replies expose only sanitized error and permit retry", async () => {
  let calls = 0;
  const store = createReceiptPersistence(async () => {
    calls++;
    if (calls === 1) throw new Error("private-data");
    return { data: { status: "duplicate", contactId: id, dealId: id }, error: null };
  });
  await assert.rejects(store.commit(command), { message: "lead_persistence_failed" });
  assert.equal((await store.commit(command)).status, "duplicate");
  for (const reply of [null, {}, { status: "created", contactId: "bad", dealId: id }]) {
    await assert.rejects(createReceiptPersistence(async () => ({ data: reply, error: null })).commit(command), { message: "lead_persistence_failed" });
  }
  await assert.rejects(createReceiptPersistence(async () => ({ data: null, error: { message: "private-data" } })).commit(command), { message: "lead_persistence_failed" });
});

test("prepared SQL boundary (static only, no PostgreSQL execution)", () => {
  const sql = readFileSync(new URL("../drizzle/migrations/0011_revendamais_lead_receipts.sql", import.meta.url), "utf8");
  assert.match(sql, /SECURITY DEFINER SET search_path = ''/);
  assert.match(sql, /auth.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /LOCK TABLE public.contacts IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(sql, /public.main_org_id\(\)/);
  assert.doesNotMatch(sql, /GRANT .* TO (anon|authenticated)/);
  assert.doesNotMatch(sql, /UNIQUE.*external_id/i);
  const index = readFileSync(new URL("../supabase/functions/revendamais-leads/index.ts", import.meta.url), "utf8");
  assert.match(index, /REVENDAMAIS_INGESTION_ENABLED/);
  assert.match(index, /abortSignal\(signal\)/);
});
