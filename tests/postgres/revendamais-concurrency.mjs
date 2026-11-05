// PREPARED ONLY. Never invoked by npm/node unit tests. Requires installed postgres.
// Separate two-session test; SQL fixture above rolls back and leaves empty tables.
import assert from 'node:assert/strict';
if (process.env.REVENDAMAIS_TEST_DISPOSABLE !== 'YES') throw new Error('Explicit disposable test opt-in required');
const url = process.env.REVENDAMAIS_TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/revendamais_leads_test') throw new Error('Wrong disposable database name');
const { default: postgres } = await import('postgres');
const sql = postgres(url, { max: 2, onnotice: () => {} });
try {
  const [db] = await sql`select current_database() as name`;
  assert.equal(db.name, 'revendamais_leads_test');
  const [before] = await sql`select (select count(*) from public.contacts)::int as c,
    (select count(*) from public.deals)::int as d, (select count(*) from public.revendamais_lead_receipts)::int as r`;
  assert.deepEqual(before, { c: 0, d: 0, r: 0 });
  const lead = { name: 'Pessoa Ficticia', phone: '+5585999990000', email: 'fiction@example.invalid',
    title: 'Concorrencia ficticia', firstMessage: 'Teste', portal: null, externalId: 'concurrency-fixture' };
  const deliver = (event = lead) => sql.begin(async tx => {
    await tx`select set_config('request.jwt.claim.role','service_role',true)`;
    await tx`set local role service_role`;
    const [row] = await tx`select public.revendamais_commit_lead(${tx.json(event)},true) as result`;
    return row.result;
  });
  const results = await Promise.all([deliver(), deliver()]);
  assert.deepEqual(results.map(r => r.status).sort(), ['created','duplicate']);
  assert.equal(results[0].dealId, results[1].dealId);
  const [after] = await sql`select (select count(*) from public.contacts)::int as c,
    (select count(*) from public.deals)::int as d, (select count(*) from public.activities)::int as a,
    (select count(*) from public.revendamais_lead_receipts)::int as r`;
  assert.deepEqual(after, { c: 1, d: 1, a: 1, r: 1 });
  const interests = await Promise.all([
    deliver({ ...lead, externalId: 'concurrency-interest-a' }),
    deliver({ ...lead, externalId: 'concurrency-interest-b' }),
  ]);
  assert.ok(interests.every(r => r.status === 'created'));
  assert.equal(interests[0].contactId, interests[1].contactId);
  assert.notEqual(interests[0].dealId, interests[1].dealId);
  const [final] = await sql`select (select count(*) from public.contacts)::int as c,
    (select count(*) from public.deals)::int as d, (select count(*) from public.activities)::int as a,
    (select count(*) from public.revendamais_lead_receipts)::int as r`;
  assert.deepEqual(final, { c: 1, d: 3, a: 3, r: 3 });
  console.log('Two-session duplicate delivery passed. Destroy disposable DB after inspection.');
} finally { await sql.end(); }
