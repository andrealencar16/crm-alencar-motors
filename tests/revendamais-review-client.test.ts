import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { approvePendingReview, getPendingReview, parsePendingReview, parseReviewApproval, ReviewUnavailable, reviewConflictMessage, type ReviewTransport } from "../src/integrations/revendamais-review-client.ts";

const id = "a0000000-0000-4000-8000-000000000001";
const item = { receipt_id: id, name: "Pessoa Fictícia", phone: null, email: null, title: "Interesse fictício",
  portal: null, channel_name: null, source_created_at: "2026-09-17 08:49:53", received_at: "2026-09-17T11:49:53Z",
  attempt_count: 4, identity_status: "consistent", approval_blocker: null };

test("listing uses only the paginated RPC and preserves its grouped total", async () => {
  const transport: ReviewTransport = { rpc: async (name,args) => {
    assert.equal(name,"get_pending_revendamais_leads"); assert.deepEqual(args,{p_limit:50,p_offset:50});
    return {data:{total:51,items:[item]},error:null};
  }};
  assert.deepEqual(await getPendingReview(transport,50),{total:51,items:[item]});
});
test("listing strips unexpected message/administrative fields and keeps missing values absent",()=>{
  const page = parsePendingReview({total:1,items:[{...item,firstMessage:"UNVERIFIED",unknown_interaction_text:"PRIVATE",org_id:id}]});
  assert.deepEqual(page.items[0],item);
  assert.equal(page.items[0].source_created_at,"2026-09-17 08:49:53");
  assert.deepEqual(parsePendingReview({total:0,items:[]}),{total:0,items:[]});
});
test("malformed listing fails closed instead of showing fabricated zero or unsafe data",()=>{
  for (const data of [null,{}, {total:-1,items:[]},{total:0,items:[item]}, {total:1,items:[{...item,received_at:"invalid"}]},
    {total:1,items:[{...item,approval_blocker:"unknown"}]}, {total:2,items:[item,item]}, {total:1,items:[{...item,phone:42}]}]) {
    assert.throws(()=>parsePendingReview(data));
  }
});
test("missing RPC is unavailable, authorization/database errors stay sanitized",async()=>{
  for (const code of ["PGRST202","42883"]) await assert.rejects(getPendingReview({rpc:async()=>({data:null,error:{code}})}),ReviewUnavailable);
  for (const code of ["42501","P0001","40001"]) await assert.rejects(getPendingReview({rpc:async()=>({data:null,error:{code}})}),{message:"request_failed"});
});
test("approval sends only receipt UUID, awaits server result and accepts both durable outcomes",async()=>{
  for (const status of ["approved","already_processed"] as const) {
    let resolve!: (v:{data:unknown;error:null})=>void;
    const deferred = new Promise<{data:unknown;error:null}>(r=>{resolve=r;}); let complete=false;
    const result = approvePendingReview({rpc:(name,args)=>{
      assert.equal(name,"approve_revendamais_lead");assert.deepEqual(args,{p_receipt_id:id});return deferred;
    }},id).then(value=>{complete=true;return value;});
    await Promise.resolve(); assert.equal(complete,false);
    resolve({data:{status,contact_id:id,deal_id:id},error:null});
    assert.equal((await result).status,status);
  }
});
test("conflicts are explicit, unknown successes and broken replies cannot become approval",()=>{
  for (const code of Object.keys(reviewConflictMessage)) assert.deepEqual(parseReviewApproval({status:"conflict",code}),{status:"conflict",code});
  for (const data of [null,{status:"created"},{status:"approved"},{status:"approved",contact_id:id,deal_id:"bad"},{status:"conflict",code:"raw internal error"}]) assert.throws(()=>parseReviewApproval(data));
});
test("invalid receipt IDs never reach the transport",async()=>{
  let calls=0;
  await assert.rejects(approvePendingReview({rpc:async()=>{calls++;return {data:null,error:null};}},"invalid"));
  assert.equal(calls,0);
});
test("UI keeps an explicit activation gate, confirmation and no raw-table/HTML bypass (static)",()=>{
  const ui=readFileSync(new URL("../src/components/crm/PendingRevendaMaisLeads.tsx",import.meta.url),"utf8");
  assert.match(ui,/VITE_REVENDAMAIS_REVIEW_ENABLED === "true"/);
  assert.match(ui,/!confirm/);assert.match(ui,/busy\.current/);
  assert.match(ui,/AlertDialogAction/);assert.match(ui,/await approvePendingReview/);
  assert.doesNotMatch(ui,/\.from\(|\.insert\(|dangerouslySetInnerHTML|console\./);
  assert.match(ui,/await load\(0\)/);assert.match(ui,/await onApproved\(\)/);
});
