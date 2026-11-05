// PREPARED ONLY. Successful DB path is never invoked by unit tests.
// Guard unit test invokes this script with a REMOTE URL and checks early rejection.
// Separate two-session test; SQL fixture above rolls back and leaves empty tables.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { validateLabUrl, assertCleanPgEnvironment, assertLocalLabContainer, lab } from './lab-connection.mjs';
if (process.env.REVENDAMAIS_TEST_DISPOSABLE !== 'YES') throw new Error('Explicit disposable test opt-in required');
const url = process.env.REVENDAMAIS_TEST_DATABASE_URL;
const connection = validateLabUrl(url); // Reject remote/query overrides BEFORE driver/Docker/SQL.
assertCleanPgEnvironment(process.env);
assertLocalLabContainer();
const postgres = createRequire(new URL('./lab/package.json', import.meta.url))('postgres');
const sql = postgres({ ...connection, onnotice: () => {},
  connection: { application_name: 'revendamais-disposable-lab', statement_timeout: 10000 } });
try {
  const [db] = await sql`select current_database() as name`;
  assert.equal(db.name, 'revendamais_leads_test');
  const [identity] = await sql`select current_setting('server_version_num')::integer / 10000 as major,
    current_user as actor, (select marker from public.revendamais_lab_identity) as marker`;
  assert.equal(identity.major, 17);
  assert.equal(identity.actor, lab.user);
  assert.equal(identity.marker, lab.marker);
  const [before] = await sql`select (select count(*) from public.contacts)::int as c,
    (select count(*) from public.deals)::int as d, (select count(*) from public.activities)::int as a,
    (select count(*) from public.revendamais_lead_receipts)::int as r`;
  assert.deepEqual(before, { c: 0, d: 0, a: 0, r: 0 });
  const lead = { name: 'Pessoa Ficticia', phone: '+5585999990000', email: 'fiction@example.invalid',
    title: 'Interesse A', firstMessage: null, portal: null, externalId: null };
  const deliver = (attemptId, commercial = lead, leadIds = ['999999','999999']) => sql.begin(async tx => {
    await tx`select set_config('request.jwt.claim.role','service_role',true)`;
    await tx`set local role service_role`;
    const metadata = { deliveryAttemptId: attemptId, dealerId: '9325', interactionLeadIds: leadIds, sourceLeadIdHint: leadIds[0] ?? null, channelId: '900002',
      channelName: 'Canal ficticio', createdAt: '2026-09-17 08:49:53', unknownInteraction: null, unknownTextPresent: false };
    const [row] = await tx`select public.revendamais_commit_lead(${tx.json(commercial)},false,${tx.json(metadata)},false) as result`;
    return row.result;
  });
  const results = await Promise.all(['100001','100002','100003','100004'].map(id => deliver(id)));
  assert.ok(results.every(r => r.status === 'review'));
  assert.equal(new Set(results.map(r => r.receiptId)).size, 4);
  const [after] = await sql`select (select count(*) from public.contacts)::int as c,
    (select count(*) from public.deals)::int as d, (select count(*) from public.activities)::int as a,
    (select count(*) from public.revendamais_lead_receipts)::int as r,
    (select count(distinct content_digest) from public.revendamais_lead_receipts)::int as comparisons,
    (select count(*) from public.revendamais_lead_receipts where possible_related_receipt_id is not null)::int as related`;
  assert.deepEqual(after, { c: 0, d: 0, a: 0, r: 4, comparisons: 1, related: 3 });
  const interests = await Promise.all([
    deliver('100005', { ...lead, title: 'Interesse B' }, ['1000000']),
    deliver('100006', { ...lead, title: 'Interesse C' }, ['1000001']),
  ]);
  assert.ok(interests.every(r => r.status === 'review'));
  assert.notEqual(interests[0].receiptId, interests[1].receiptId);
  const [final] = await sql`select (select count(*) from public.contacts)::int as c,
    (select count(*) from public.deals)::int as d, (select count(*) from public.activities)::int as a,
    (select count(*) from public.revendamais_lead_receipts)::int as r`;
  assert.deepEqual(final, { c: 0, d: 0, a: 0, r: 6 });
  const unreliable = await Promise.all([
    deliver('100007', lead, []), deliver('100008', lead, ['999999',null]),
    deliver('100009', lead, ['999999','1000000']),
  ]);
  assert.ok(unreliable.every(r => r.status === 'review'));
  const [invalidLinks] = await sql`select count(*)::int as n from public.revendamais_lead_receipts
    where retry_identity_status <> 'consistent' and possible_related_receipt_id is not null`;
  assert.equal(invalidLinks.n, 0);
  console.log('Concurrent delivery reviews preserved; no automatic business deduplication claimed. Discard lab after inspection.');
} finally { await sql.end(); }
