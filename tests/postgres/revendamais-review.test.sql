-- PREPARED ONLY. Requires ReviewSetup + 0012 in the guarded disposable PG17 lab.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database()<>'revendamais_leads_test' OR current_user<>'revendamais_lab'
    OR (SELECT marker FROM public.revendamais_lab_identity)<>'alencar-revendamais-pg17-disposable-v1'
    OR EXISTS(SELECT 1 FROM public.revendamais_lead_receipts) OR EXISTS(SELECT 1 FROM public.deals)
    OR EXISTS(SELECT 1 FROM public.contacts) OR EXISTS(SELECT 1 FROM public.revendamais_review_approvals) THEN
    RAISE EXCEPTION 'Require empty disposable review laboratory';
  END IF;
END $$;
INSERT INTO auth.users(id,email) VALUES
 ('d0000000-0000-4000-8000-000000000001','operator-a@example.invalid'),
 ('d0000000-0000-4000-8000-000000000002','operator-b@example.invalid'),
 ('d0000000-0000-4000-8000-000000000003','outsider@example.invalid');
INSERT INTO public.user_roles(user_id,org_id,role) VALUES
 ('d0000000-0000-4000-8000-000000000001',public.main_org_id(),'member'),
 ('d0000000-0000-4000-8000-000000000002',public.main_org_id(),'admin');
INSERT INTO public.pipelines(id,org_id,name) VALUES
 ('e0000000-0000-4000-8000-000000000001',public.main_org_id(),'Venda PF');
INSERT INTO public.pipeline_stages(id,org_id,pipeline_id,name) VALUES
 ('e0000000-0000-4000-8000-000000000002',public.main_org_id(),'e0000000-0000-4000-8000-000000000001','Lead');
CREATE TEMP TABLE review_refs(name text PRIMARY KEY,id uuid);
CREATE TEMP TABLE review_results(result jsonb);
GRANT SELECT,INSERT ON TABLE review_results TO authenticated;
GRANT SELECT ON TABLE review_refs TO authenticated;

CREATE FUNCTION public.review_fixture_emit(p_attempt text,p_retry text,p_phone text,p_title text DEFAULT 'Interesse A')
RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE saved text := current_setting('request.jwt.claim.role',true); r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  r := public.revendamais_commit_lead(jsonb_build_object('name','Pessoa Ficticia','phone',p_phone,
    'email',NULL,'title',p_title,'firstMessage','UNVERIFIED TEXT','portal','Webmotors','externalId',NULL),false,
    jsonb_build_object('dealerId','9325','deliveryAttemptId',p_attempt,'sourceLeadIdHint',p_retry,
      'interactionLeadIds',CASE WHEN p_retry IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p_retry) END,
      'channelId','900002','channelName','Campanha ficticia','createdAt','2026-09-17 08:49:53',
      'unknownTextPresent',true,'unknownInteraction',jsonb_build_object('text','AUXILIARY UNKNOWN TEXT',
        'sourceIndex',0,'createdAt',NULL,'authorship','unknown')),true);
  PERFORM set_config('request.jwt.claim.role',coalesce(saved,''),true);
  RETURN (r->>'receiptId')::uuid;
END $$;
REVOKE ALL ON FUNCTION public.review_fixture_emit(text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO review_refs VALUES
 ('a1',public.review_fixture_emit('100001','777','+5585999990000')),
 ('a2',public.review_fixture_emit('100002','777','+5585999990000')),
 ('a3',public.review_fixture_emit('100003','777','+5585999990000'));
-- Explicit chain: grouping must not depend on the direct root pointer.
UPDATE public.revendamais_lead_receipts SET possible_related_receipt_id=(SELECT id FROM review_refs WHERE name='a2')
  WHERE id=(SELECT id FROM review_refs WHERE name='a3');

SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
  r := public.get_pending_revendamais_leads();
  IF (r->>'total')::int<>1 OR jsonb_array_length(r->'items')<>1
    OR (r->'items'->0->>'attempt_count')::int<>3 THEN RAISE EXCEPTION 'Pending group/count incorrect'; END IF;
  -- Regression 42846: the representative includes a computed group key, but
  -- scope_conflict must receive only the original table composite value.
  IF r->'items'->0->>'approval_blocker' IS NOT NULL THEN RAISE EXCEPTION 'Typed representative falsely conflicted'; END IF;
  r := public.get_pending_revendamais_leads(1,1);
  IF (r->>'total')::int<>1 OR jsonb_array_length(r->'items')<>0 THEN RAISE EXCEPTION 'Pagination lost group total'; END IF;
  r := public.get_pending_revendamais_leads();
  IF r::text LIKE '%digest%' OR r::text LIKE '%UNVERIFIED%' OR r::text LIKE '%AUXILIARY%'
    OR r::text LIKE '%retry_lead_id%' THEN RAISE EXCEPTION 'Internal data exposed'; END IF;
  BEGIN PERFORM 1 FROM public.revendamais_lead_receipts; RAISE EXCEPTION 'Raw SELECT granted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.revendamais_review_approvals; RAISE EXCEPTION 'Ledger SELECT granted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO review_results SELECT public.approve_revendamais_lead((SELECT id FROM review_refs WHERE name='a2'));
RESET ROLE;
DO $$ DECLARE r jsonb; BEGIN
  SELECT result INTO r FROM review_results LIMIT 1;
  IF r->>'status' IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Approval failed'; END IF;
  IF (SELECT count(*) FROM public.contacts)<>1 OR (SELECT count(*) FROM public.deals)<>1
    OR (SELECT count(*) FROM public.revendamais_review_approvals)<>1 THEN RAISE EXCEPTION 'Partial/duplicate approval'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.deals WHERE id=(r->>'deal_id')::uuid AND value=0 AND currency='BRL'
    AND owner_id='d0000000-0000-4000-8000-000000000001' AND vehicle_id IS NULL
    AND stage_id='e0000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Business defaults incorrect'; END IF;
  IF EXISTS(SELECT 1 FROM public.activities) THEN RAISE EXCEPTION 'Unverified text became note'; END IF;
  IF (SELECT count(*) FROM public.revendamais_lead_receipts WHERE status='processed' AND review_lead IS NULL
      AND portal='Webmotors' AND channel_name='Campanha ficticia' AND unknown_interaction_authorship='unknown')<>3 THEN
    RAISE EXCEPTION 'Group/metadatas not atomically preserved'; END IF;
  IF (public.get_pending_revendamais_leads()->>'total')::int<>0 THEN RAISE EXCEPTION 'Processed group still pending'; END IF;
END $$;
-- Another operator, another receipt of the same group: no second business/owner change.
SELECT set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
  r := public.approve_revendamais_lead((SELECT id FROM review_refs WHERE name='a3'));
  IF r->>'status' IS DISTINCT FROM 'already_processed' THEN RAISE EXCEPTION 'Double approval not idempotent'; END IF;
END $$;
RESET ROLE;
-- Late retry is not a new pending opportunity. Explicit repeat reconciles its state.
INSERT INTO review_refs VALUES ('late',public.review_fixture_emit('100004','777','+5585999990000'));
DO $$ DECLARE r jsonb; BEGIN
  IF (public.get_pending_revendamais_leads()->>'total')::int<>0 THEN RAISE EXCEPTION 'Late retry inflated counter'; END IF;
  r := public.approve_revendamais_lead((SELECT id FROM review_refs WHERE name='late'));
  IF r->>'status' IS DISTINCT FROM 'already_processed' OR (SELECT count(*) FROM public.deals)<>1 THEN
    RAISE EXCEPTION 'Late retry duplicated opportunity'; END IF;
END $$;

-- New submission of existing customer, then truly new contact.
INSERT INTO review_refs VALUES
 ('new_interest',public.review_fixture_emit('100005','888','+5585999990000','Interesse B')),
 ('new_contact',public.review_fixture_emit('100006','889','+5585988880000','Interesse C'));
DO $$ DECLARE r jsonb; BEGIN
  r := public.approve_revendamais_lead((SELECT id FROM review_refs WHERE name='new_interest'));
  IF r->>'status' IS DISTINCT FROM 'approved' OR (SELECT count(*) FROM public.contacts)<>1 THEN RAISE EXCEPTION 'Existing contact not reused'; END IF;
  r := public.approve_revendamais_lead((SELECT id FROM review_refs WHERE name='new_contact'));
  IF r->>'status' IS DISTINCT FROM 'approved' OR (SELECT count(*) FROM public.contacts)<>2 THEN RAISE EXCEPTION 'New contact missing'; END IF;
  IF (SELECT count(*) FROM public.deals)<>3 THEN RAISE EXCEPTION 'Legitimate interest lost'; END IF;
END $$;
INSERT INTO public.contacts(org_id,first_name,phone) VALUES
 (public.main_org_id(),'Ambigua A','+5585977770000'),(public.main_org_id(),'Ambigua B','+5585977770000');
INSERT INTO review_refs VALUES ('ambiguous',public.review_fixture_emit('100007','890','+5585977770000'));
DO $$ DECLARE r jsonb; BEGIN
  r := public.approve_revendamais_lead((SELECT id FROM review_refs WHERE name='ambiguous'));
  IF r->>'code' IS DISTINCT FROM 'ambiguous_contact' OR (SELECT count(*) FROM public.deals)<>3 THEN
    RAISE EXCEPTION 'Ambiguous contact wrote business'; END IF;
END $$;
-- Without retry identity each receipt is a separate explicitly reviewed interest.
INSERT INTO review_refs VALUES
 ('single1',public.review_fixture_emit('100008',NULL,'+5585999990000','Sem identidade')),
 ('single2',public.review_fixture_emit('100009',NULL,'+5585999990000','Sem identidade'));
DO $$ DECLARE r jsonb; BEGIN
  IF (public.get_pending_revendamais_leads()->>'total')::int<>3 THEN RAISE EXCEPTION 'Singletons merged in counter'; END IF;
  r := public.approve_revendamais_lead((SELECT id FROM review_refs WHERE name='single1'));
  IF r->>'status' IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Explicit singleton approval failed'; END IF;
  IF (public.get_pending_revendamais_leads()->>'total')::int<>2 THEN RAISE EXCEPTION 'Singleton approval consumed another lead'; END IF;
END $$;
INSERT INTO review_refs VALUES
 ('conflict1',public.review_fixture_emit('100010','891','+5585999990000','Conflito A')),
 ('conflict2',public.review_fixture_emit('100011','891','+5585999990000','Conflito B'));
DO $$ DECLARE r jsonb; BEGIN
  IF (public.get_pending_revendamais_leads()->>'total')::int<>4 THEN RAISE EXCEPTION 'Conflict hidden/merged'; END IF;
  r := public.approve_revendamais_lead((SELECT id FROM review_refs WHERE name='conflict1'));
  IF r->>'code' IS DISTINCT FROM 'retry_scope_conflict' THEN RAISE EXCEPTION 'Conflicting scope approved'; END IF;
  r := public.approve_revendamais_lead((SELECT id FROM review_refs WHERE name='conflict2'));
  IF r->>'code' IS DISTINCT FROM 'retry_scope_conflict' THEN RAISE EXCEPTION 'Conflict singleton approved'; END IF;
END $$;

-- Failure at each write stage rolls back CRM + ledger + group updates.
CREATE FUNCTION public.review_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('review_test.fail_table',true)=TG_TABLE_NAME THEN RAISE EXCEPTION 'fixture_review_failure'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER review_fail_contact BEFORE INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.review_fixture_fail();
CREATE TRIGGER review_fail_deal BEFORE INSERT ON public.deals FOR EACH ROW EXECUTE FUNCTION public.review_fixture_fail();
CREATE TRIGGER review_fail_approval BEFORE INSERT ON public.revendamais_review_approvals FOR EACH ROW EXECUTE FUNCTION public.review_fixture_fail();
CREATE TRIGGER review_fail_receipt BEFORE UPDATE ON public.revendamais_lead_receipts FOR EACH ROW EXECUTE FUNCTION public.review_fixture_fail();
INSERT INTO review_refs VALUES ('fail',public.review_fixture_emit('100012','892','+5585966660000'));
DO $$ DECLARE t text; c bigint; d bigint; a bigint; BEGIN
  SELECT count(*) INTO c FROM public.contacts; SELECT count(*) INTO d FROM public.deals;
  SELECT count(*) INTO a FROM public.revendamais_review_approvals;
  FOREACH t IN ARRAY ARRAY['contacts','deals','revendamais_review_approvals','revendamais_lead_receipts'] LOOP
    PERFORM set_config('review_test.fail_table',t,true);
    BEGIN
      PERFORM public.approve_revendamais_lead((SELECT id FROM review_refs WHERE name='fail'));
      RAISE EXCEPTION 'Expected approval failure';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'review_operation_failed' THEN RAISE; END IF; END;
    IF (SELECT count(*) FROM public.contacts)<>c OR (SELECT count(*) FROM public.deals)<>d
      OR (SELECT count(*) FROM public.revendamais_review_approvals)<>a
      OR (SELECT status FROM public.revendamais_lead_receipts WHERE id=(SELECT id FROM review_refs WHERE name='fail'))<>'review' THEN
      RAISE EXCEPTION 'Approval partially committed'; END IF;
  END LOOP;
  PERFORM set_config('review_test.fail_table','',true);
END $$;
-- Authorization from membership, never a caller-supplied actor/org.
SELECT set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.get_pending_revendamais_leads(); RAISE EXCEPTION 'Outsider listed PII'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.approve_revendamais_lead((SELECT id FROM review_refs WHERE name='fail')); RAISE EXCEPTION 'Outsider approved'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
  BEGIN PERFORM public.approve_revendamais_lead('ffffffff-ffff-4fff-8fff-ffffffffffff'); RAISE EXCEPTION 'Unknown receipt accepted';
  EXCEPTION WHEN no_data_found THEN NULL; END;
END $$;
-- No purge executed here: retention risk is documented, policy unchanged.
ROLLBACK;
