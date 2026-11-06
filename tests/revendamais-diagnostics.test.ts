import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../supabase/functions/revendamais-leads/handler.ts";
import { createReceiptPersistence } from "../supabase/functions/revendamais-leads/persistence.ts";

// Fictitious fixtures only.
const secret = "a".repeat(64);
const url = `https://local.invalid/revendamais-leads?secret=${secret}`;
const PII = ["Pessoa Ficticia Diagnostico", "85999990000", "ficticio@example.invalid", "MENSAGEM-SIGILOSA"];
const payload = (extra: Record<string, unknown> = {}) => ({ dealer_id: 9325, id: "100001",
  client_name: PII[0], client_phone: PII[1], title: "Interesse ficticio",
  interations: [{ lead_id: 1, html: `<p>${PII[3]} ${PII[2]}</p>`, created_at: "2026-11-06 10:00:00" }], ...extra });
const req = (value: unknown) => new Request(url, { method: "POST",
  headers: { "content-type": "application/json" }, body: JSON.stringify(value) });

async function capture(body: unknown) {
  let calls = 0;
  const h = createHandler({ secret, dealerId: "9325", persistenceFactory: () => createReceiptPersistence(async () => {
    calls++; return { data: { status: "review", receiptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, error: null };
  }) });
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    const res = await h(req(body));
    return { status: res.status, body: await res.text(), lines, calls };
  } finally { console.warn = original; }
}

function assertSafe(lines: string[]) {
  for (const line of lines) {
    for (const value of [...PII, secret]) assert.ok(!line.includes(value), "log must never contain lead data or secret");
  }
}

test("rejected payload logs failure code + controlled field; HTTP body stays generic", async () => {
  const r = await capture(payload({ created_at: "2026-11-06T10:00:00-03:00" }));
  assert.equal(r.status, 400);
  assert.equal(r.body, JSON.stringify({ status: "invalid_event" }));
  assert.equal(r.calls, 0);
  assert.equal(r.lines.length, 1);
  const log = JSON.parse(r.lines[0]);
  assert.equal(log.event, "revendamais_validation_rejected");
  assert.equal(log.failure_code, "length_exceeded");
  assert.equal(log.field, "created_at");
  assert.deepEqual(log.detail, { length: 25, limit: 19 });
  assertSafe(r.lines);
});

test("interaction-level failures name the indexed field and type only", async () => {
  const r = await capture(payload({ interations: [{ lead_id: 1, direction: "1", html: `<b>${PII[3]}</b>` }] }));
  assert.equal(r.status, 400);
  const log = JSON.parse(r.lines[0]);
  assert.equal(log.failure_code, "unexpected_type");
  assert.equal(log.field, "interations[0].direction");
  assert.equal(log.received_type, "string");
  assertSafe(r.lines);
});

test("phone normalization failure is attributed without logging the number", async () => {
  const r = await capture(payload({ client_phone: "0800 123 4567" }));
  assert.equal(r.status, 400);
  const log = JSON.parse(r.lines[0]);
  assert.equal(log.field, "phone");
  assert.match(log.failure_code, /^phone_/);
  assert.ok(!r.lines[0].includes("0800"));
  assertSafe(r.lines);
});

test("valid payload is still persisted for review and logs nothing", async () => {
  const r = await capture(payload());
  assert.equal(r.status, 202);
  assert.equal(r.calls, 1);
  assert.equal(r.lines.length, 0);
});
