// PREPARED ONLY. Commits synthetic fixtures ONLY in the guarded disposable lab.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { validateLabUrl, assertCleanPgEnvironment, assertLocalLabContainer, lab } from './lab-connection.mjs';
if (process.env.REVENDAMAIS_TEST_DISPOSABLE !== 'YES') throw new Error('Disposable opt-in required');
const connection = validateLabUrl(process.env.REVENDAMAIS_TEST_DATABASE_URL);
assertCleanPgEnvironment(process.env);
assertLocalLabContainer();
const postgres = createRequire(new URL('./lab/package.json',import.meta.url))('postgres');
const sql = postgres({ ...connection,max:3,onnotice:()=>{},connection:{application_name:'revendamais-review-lab',statement_timeout:10000} });
try {
  const [identity] = await sql`select current_database() as db,current_user as actor,
    current_setting('server_version_num')::int/10000 as major,(select marker from public.revendamais_lab_identity) as marker`;
  assert.deepEqual(identity,{db:lab.database,actor:lab.user,major:17,marker:lab.marker});
  const [empty] = await sql`select (select count(*) from public.contacts)::int as c,
    (select count(*) from public.deals)::int as d,(select count(*) from public.activities)::int as a,
    (select count(*) from public.revendamais_lead_receipts)::int as r,
    (select count(*) from public.revendamais_review_approvals)::int as l,
    (select count(*) from public.user_roles)::int as u,(select count(*) from public.pipelines)::int as p`;
  assert.ok(Object.values(empty).every(n=>n===0),'Fresh disposable review schema required');
  const actors=['d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002'];
  await sql.begin(async tx=>{
    for (const [i,id] of actors.entries()) {
      await tx`insert into auth.users(id,email) values(${id},${`review-${i}@example.invalid`})`;
      await tx`insert into public.user_roles(user_id,org_id,role) values(${id},public.main_org_id(),'member')`;
    }
    const [pipeline]=await tx`insert into public.pipelines(org_id,name) values(public.main_org_id(),'Venda PF') returning id`;
    await tx`insert into public.pipeline_stages(org_id,pipeline_id,name) values(public.main_org_id(),${pipeline.id},'Lead')`;
  });
  const lead={name:'Pessoa Ficticia',phone:'+5585999990000',email:null,title:'Interesse ficticio',firstMessage:null,portal:null,externalId:null};
  const emit=attempt=>sql.begin(async tx=>{
    await tx`select set_config('request.jwt.claim.role','service_role',true)`;
    await tx`set local role service_role`;
    const m={dealerId:'9325',deliveryAttemptId:attempt,interactionLeadIds:['777','777'],sourceLeadIdHint:'777',
      channelId:'900002',channelName:'Canal ficticio',createdAt:'2026-09-17 08:49:53',unknownTextPresent:false,unknownInteraction:null};
    const [row]=await tx`select public.revendamais_commit_lead(${tx.json(lead)},false,${tx.json(m)},false) as result`;
    return row.result.receiptId;
  });
  const approve=(actor,receipt)=>sql.begin(async tx=>{
    await tx`select set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.sub',${actor},true)`;
    await tx`set local role authenticated`;
    const [row]=await tx`select public.approve_revendamais_lead(${receipt}) as result`;
    return row.result;
  });
  const pending=actor=>sql.begin(async tx=>{
    await tx`select set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.sub',${actor},true)`;
    await tx`set local role authenticated`;
    const [row]=await tx`select public.get_pending_revendamais_leads() as result`;
    return row.result;
  });
  const r1=await emit('100001'),r2=await emit('100002');
  assert.equal((await pending(actors[0])).total,1);
  // Different receipt IDs, different approving users, and concurrent inbound retry.
  const [a,b,r3]=await Promise.all([approve(actors[0],r1),approve(actors[1],r2),emit('100003')]);
  assert.deepEqual([a.status,b.status].sort(),['already_processed','approved']);
  assert.equal(a.deal_id,b.deal_id);
  assert.equal(a.contact_id,b.contact_id);
  assert.equal((await pending(actors[0])).total,0);
  assert.equal((await approve(actors[1],r3)).status,'already_processed');
  const [counts]=await sql`select (select count(*) from public.contacts)::int as c,
    (select count(*) from public.deals)::int as d,(select count(*) from public.activities)::int as a,
    (select count(*) from public.revendamais_review_approvals)::int as approvals,
    (select count(*) from public.revendamais_lead_receipts where status='processed')::int as processed`;
  assert.deepEqual(counts,{c:1,d:1,a:0,approvals:1,processed:3});
  const [deal]=await sql`select owner_id,value,currency,vehicle_id from public.deals where id=${a.deal_id}`;
  assert.equal(deal.owner_id,a.status==='approved'?actors[0]:actors[1]);
  assert.equal(Number(deal.value),0); assert.equal(deal.currency,'BRL'); assert.equal(deal.vehicle_id,null);
  console.log('Review concurrency passed in disposable lab; synthetic commits remain for inspection.');
} finally { await sql.end(); }
