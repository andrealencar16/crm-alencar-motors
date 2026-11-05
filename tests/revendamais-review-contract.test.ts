import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { lab } from "./postgres/lab-connection.mjs";

const sql=readFileSync(new URL("../drizzle/migrations/0012_revendamais_review_approval.sql",import.meta.url),"utf8");
test("listing passes the original typed receipt, not a CTE record extended by the group key (42846 regression)",()=>{
  assert.match(sql,/SELECT r\.\*,r AS receipt_row,public\.revendamais_review_group_key\(r\) AS g/);
  assert.match(sql,/public\.revendamais_review_scope_conflict\(representative\.receipt_row\)/);
  assert.doesNotMatch(sql,/public\.revendamais_review_scope_conflict\(representative\)/);
});
test("prepared RPC authorization/grants keep membership authoritative and raw tables private (static)",()=>{
  assert.match(sql,/auth\.role\(\) IS DISTINCT FROM 'authenticated'/);
  assert.match(sql,/public\.user_roles WHERE user_id=v_actor AND org_id=v_org/);
  assert.doesNotMatch(sql,/profiles|GRANT SELECT/i);
  assert.match(sql,/REVOKE ALL ON TABLE public\.revendamais_review_approvals FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.approve_revendamais_lead\(uuid\) TO authenticated/);
  assert.doesNotMatch(sql,/GRANT EXECUTE.*TO (anon|service_role)/);
});
test("list/count/approval use the same private key, independent of pointer chains/status (static)",()=>{
  const key=sql.slice(sql.indexOf("CREATE FUNCTION public.revendamais_review_group_key"),sql.indexOf("-- A conflict anywhere"));
  assert.match(key,/content_digest/); assert.match(key,/dealer_id/); assert.match(key,/retry_lead_id/);
  assert.doesNotMatch(key,/possible_related_receipt_id|received_at|\.status|review_lead/);
  assert.ok((sql.match(/public\.revendamais_review_group_key\(/g)??[]).length>=5);
  assert.match(sql,/SELECT count\(\*\) FROM pending_groups/);
  const dto=sql.slice(sql.indexOf("'receipt_id',id"),sql.indexOf("INTO v_result"));
  assert.doesNotMatch(dto,/unknown_interaction|firstMessage|digest|retry_lead_id|group_key/);
});
test("approval is group-idempotent and actor-owned, not client-directed (static)",()=>{
  assert.match(sql,/PRIMARY KEY\(org_id,group_key\)/);
  assert.match(sql,/pg_advisory_xact_lock\(pg_catalog\.hashtextextended\('revendamais:' \|\| v_org::text,0\)\)/);
  assert.match(sql,/ON CONFLICT\(org_id,group_key\) DO NOTHING/);
  assert.match(sql,/'open','BRL',0,v_stage,v_actor/);
  assert.match(sql,/lower\(btrim\(name\)\)='venda pf'/); assert.match(sql,/lower\(btrim\(name\)\)='lead'/);
  assert.match(sql,/WHERE id=ANY\(v_ids\) AND org_id=v_org/);
  assert.doesNotMatch(sql,/INSERT INTO public\.activities/);
  assert.match(sql,/review_operation_failed/);
});
test("review concurrency harness refuses remote targets before Docker/driver/SQL",()=>{
  const path=fileURLToPath(new URL("./postgres/revendamais-review-concurrency.mjs",import.meta.url));
  const result=spawnSync(process.execPath,[path],{encoding:"utf8",windowsHide:true,env:{...process.env,
    REVENDAMAIS_TEST_DISPOSABLE:"YES",
    REVENDAMAIS_TEST_DATABASE_URL:`postgresql://${lab.user}:${lab.password}@db.example.invalid:55432/revendamais_leads_test`}});
  assert.notEqual(result.status,0); assert.match(result.stderr,/Only the fixed loopback disposable/);
  assert.doesNotMatch(result.stderr,/Cannot find module|ENOTFOUND|ECONNREFUSED/);
});
