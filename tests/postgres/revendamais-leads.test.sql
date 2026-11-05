-- PREPARED ONLY. Do not run on operational Lovable/Supabase.
-- The root provider id is a delivery attempt, NOT a stable business identifier.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() IS DISTINCT FROM 'revendamais_leads_test'
    OR current_user IS DISTINCT FROM 'revendamais_lab'
    OR current_setting('server_version_num')::int / 10000 <> 17
    OR (SELECT marker FROM public.revendamais_lab_identity) IS DISTINCT FROM 'alencar-revendamais-pg17-disposable-v1'
    OR (SELECT count(*) FROM public.organizations) <> 1
    OR EXISTS (SELECT 1 FROM public.contacts) OR EXISTS (SELECT 1 FROM public.deals)
    OR EXISTS (SELECT 1 FROM public.activities) OR EXISTS (SELECT 1 FROM public.revendamais_lead_receipts) THEN
    RAISE EXCEPTION 'Require empty owned PostgreSQL 17 disposable laboratory';
  END IF;
END $$;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(r,'public.revendamais_commit_lead(jsonb,boolean,jsonb,boolean)','EXECUTE') THEN
      RAISE EXCEPTION 'Public writer';
    END IF;
  END LOOP;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.revendamais_commit_lead('{}',false); RAISE EXCEPTION 'Unauthorized call succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

CREATE FUNCTION public.revendamais_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fixture_id uuid;
BEGIN
  IF current_setting('revendamais_test.fail_receipt',true)='yes' THEN RAISE EXCEPTION 'fixture_receipt_failure'; END IF;
  -- Deterministic regression: now() ties inside this transaction. The second
  -- UUID sorts BEFORE the first, so an arbitrary matching predecessor is valid.
  -- Test-only trigger changes disappear at ROLLBACK; no production hook.
  fixture_id := CASE NEW.delivery_attempt_id
    WHEN '100001' THEN 'dddddddd-0000-4000-8000-000000000001'::uuid
    WHEN '100002' THEN 'aaaaaaaa-0000-4000-8000-000000000002'::uuid
    WHEN '100003' THEN 'bbbbbbbb-0000-4000-8000-000000000003'::uuid
    WHEN '100004' THEN 'cccccccc-0000-4000-8000-000000000004'::uuid END;
  -- Repeated attempt IDs must still create new receipts, never collide on UUID.
  IF fixture_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.revendamais_lead_receipts WHERE id=fixture_id) THEN
    NEW.id := fixture_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER revendamais_fixture_receipt BEFORE INSERT ON public.revendamais_lead_receipts
  FOR EACH ROW EXECUTE FUNCTION public.revendamais_fixture_fail();
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
DECLARE
  l jsonb := '{"name":"Pessoa Ficticia","phone":"+5585999990000","email":null,"title":"Interesse A","firstMessage":null,"portal":null,"externalId":null}';
  m jsonb := '{"dealerId":"9325","interactionLeadIds":["999","999"],"deliveryAttemptId":"100001","sourceLeadIdHint":"999","channelId":"900002","channelName":"Canal ficticio","createdAt":"2026-09-17 08:49:53","unknownTextPresent":true,"unknownInteraction":{"text":"Mensagem ficticia","sourceIndex":0,"createdAt":"2026-09-17 08:49:53","authorship":"unknown"}}';
  r jsonb; first_receipt uuid; i integer; n integer; fixture_diagnostic jsonb;
  receipt_ids uuid[] := ARRAY[]::uuid[]; current_receipt uuid; parent_receipt uuid;
BEGIN
  -- Even a privileged stale caller cannot re-enable the invalid premise.
  BEGIN PERFORM public.revendamais_commit_lead(l,true,m,false); RAISE EXCEPTION 'Unstable identity enabled';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.revendamais_commit_lead(l || '{"externalId":"dealer:9325:lead:100001"}',false,m,false);
    RAISE EXCEPTION 'Attempt used as commercial ID'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM set_config('revendamais_test.fail_receipt','yes',true);
  BEGIN PERFORM public.revendamais_commit_lead(l,false,m,false); RAISE EXCEPTION 'Missing receipt failure';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'fixture_receipt_failure' THEN RAISE; END IF; END;
  IF EXISTS (SELECT 1 FROM public.revendamais_lead_receipts) OR EXISTS (SELECT 1 FROM public.contacts)
    OR EXISTS (SELECT 1 FROM public.deals) THEN RAISE EXCEPTION 'Partial state survived'; END IF;
  PERFORM set_config('revendamais_test.fail_receipt','no',true);
  FOR i IN 1..4 LOOP
    r := public.revendamais_commit_lead(l,false,m || jsonb_build_object('deliveryAttemptId',(100000+i)::text),false);
    RAISE NOTICE 'fixture RPC attempt=% status=% receipt=%',i,r->>'status',r->>'receiptId';
    IF r->>'status' IS DISTINCT FROM 'review' THEN RAISE EXCEPTION 'Attempt discarded or auto-created'; END IF;
    current_receipt := (r->>'receiptId')::uuid;
    IF current_receipt IS NULL OR current_receipt=ANY(receipt_ids) OR NOT EXISTS (
      SELECT 1 FROM public.revendamais_lead_receipts WHERE id=current_receipt AND status='review'
        AND delivery_attempt_id=(100000+i)::text AND source_lead_id_hint='999'
        AND dealer_id='9325' AND retry_lead_id='999' AND retry_identity_status='consistent'
        AND interaction_lead_ids='["999","999"]'::jsonb
    ) THEN RAISE EXCEPTION 'RPC did not persist a distinct correctly mapped attempt'; END IF;
    SELECT possible_related_receipt_id INTO parent_receipt FROM public.revendamais_lead_receipts WHERE id=current_receipt;
    IF i=1 THEN
      first_receipt := current_receipt;
      IF parent_receipt IS NOT NULL THEN RAISE EXCEPTION 'First receipt unexpectedly related'; END IF;
    ELSIF parent_receipt IS NULL OR NOT (parent_receipt=ANY(receipt_ids)) OR NOT EXISTS (
      SELECT 1 FROM public.revendamais_lead_receipts prior
        JOIN public.revendamais_lead_receipts current ON current.id=current_receipt
      WHERE prior.id=parent_receipt AND prior.org_id=current.org_id AND prior.content_digest=current.content_digest
        AND prior.dealer_id=current.dealer_id AND prior.retry_lead_id=current.retry_lead_id
        AND current.retry_relation='automatic_resend'
    ) THEN RAISE EXCEPTION 'Relation does not reference a prior equivalent receipt'; END IF;
    receipt_ids := array_append(receipt_ids,current_receipt);
  END LOOP;
  SELECT jsonb_agg(jsonb_build_object('attempt',delivery_attempt_id,'receipt',id,
    'related',possible_related_receipt_id,'received_at',received_at) ORDER BY delivery_attempt_id)
    INTO fixture_diagnostic FROM public.revendamais_lead_receipts;
  RAISE NOTICE 'fixture receipt relations=%',fixture_diagnostic;
  RAISE NOTICE 'fixture counts receipts=% comparisons=% links_to_first=%',
    (SELECT count(*) FROM public.revendamais_lead_receipts),
    (SELECT count(DISTINCT content_digest) FROM public.revendamais_lead_receipts),
    (SELECT count(*) FROM public.revendamais_lead_receipts WHERE possible_related_receipt_id=first_receipt);
  IF (SELECT count(*) FROM public.revendamais_lead_receipts) <> 4
    OR (SELECT count(DISTINCT content_digest) FROM public.revendamais_lead_receipts) <> 1
    OR (SELECT count(DISTINCT delivery_attempt_id) FROM public.revendamais_lead_receipts) <> 4
    OR (SELECT count(*) FROM public.revendamais_lead_receipts WHERE possible_related_receipt_id IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'Attempt id changed comparison or receipts were merged';
  END IF;
  IF EXISTS (SELECT 1 FROM public.revendamais_lead_receipts WHERE unknown_interaction_text IS NOT NULL
    OR unknown_text_disposition<>'omitted_policy' OR external_id IS NOT NULL OR identity_confirmed) THEN
    RAISE EXCEPTION 'Unauthorized text/identity retained';
  END IF;
  -- No retry timing is assumed: date changes still only suggest a possible relationship.
  r := public.revendamais_commit_lead(l,false,m || '{"deliveryAttemptId":"100005","createdAt":"2026-10-20 09:00:00"}',false);
  IF NOT EXISTS (SELECT 1 FROM public.revendamais_lead_receipts WHERE id=(r->>'receiptId')::uuid
    AND possible_related_receipt_id=ANY(receipt_ids) AND source_created_at='2026-10-20 09:00:00') THEN
    RAISE EXCEPTION 'Commercial comparison relied on retry date'; END IF;
  -- Two legitimate interests from one contact with the SAME message stay separate.
  r := public.revendamais_commit_lead(l || '{"title":"Interesse B"}',false,m || '{"deliveryAttemptId":"100006","interactionLeadIds":["1006"],"sourceLeadIdHint":"1006"}',true);
  IF NOT EXISTS (SELECT 1 FROM public.revendamais_lead_receipts WHERE id=(r->>'receiptId')::uuid
    AND unknown_interaction_authorship='unknown' AND possible_related_receipt_id IS NULL
    AND review_lead->>'title'='Interesse B') THEN RAISE EXCEPTION 'New legitimate interest lost'; END IF;
  r := public.revendamais_commit_lead(l || '{"title":"Interesse C"}',false,m || '{"deliveryAttemptId":"100007","interactionLeadIds":["1007"],"sourceLeadIdHint":"1007"}',true);
  IF NOT EXISTS (SELECT 1 FROM public.revendamais_lead_receipts WHERE id=(r->>'receiptId')::uuid
    AND possible_related_receipt_id IS NULL) THEN RAISE EXCEPTION 'Message alone deduplicated business'; END IF;
  r := public.revendamais_commit_lead(l || '{"phone":null,"name":null}',false,'{}',false);
  IF NOT EXISTS (SELECT 1 FROM public.revendamais_lead_receipts WHERE id=(r->>'receiptId')::uuid
    AND reason='insufficient_contact') THEN RAISE EXCEPTION 'Incomplete delivery not reviewed'; END IF;
  -- Same attempt id again is still not a business identity: preserve another receipt.
  SELECT count(*) INTO n FROM public.revendamais_lead_receipts;
  r := public.revendamais_commit_lead(l,false,m,false);
  IF (SELECT count(*) FROM public.revendamais_lead_receipts) <> n+1 THEN RAISE EXCEPTION 'Repeated id silently discarded'; END IF;
  IF EXISTS (SELECT 1 FROM public.contacts) OR EXISTS (SELECT 1 FROM public.deals)
    OR EXISTS (SELECT 1 FROM public.activities) THEN RAISE EXCEPTION 'Review created automatic CRM records'; END IF;
  -- Same commercial data never links a new client submission with another lead_id.
  r := public.revendamais_commit_lead(l,false,m || '{"deliveryAttemptId":"100008","interactionLeadIds":["1008"],"sourceLeadIdHint":"1008"}',false);
  IF NOT EXISTS (SELECT 1 FROM public.revendamais_lead_receipts WHERE id=(r->>'receiptId')::uuid
    AND retry_relation='none' AND possible_related_receipt_id IS NULL) THEN RAISE EXCEPTION 'New submission linked by contact/message'; END IF;
  -- Missing, incomplete and conflicting arrays are persisted without association.
  FOR i IN 1..3 LOOP
    r := public.revendamais_commit_lead(l,false,m || jsonb_build_object('interactionLeadIds',
      CASE i WHEN 1 THEN '[]'::jsonb WHEN 2 THEN '["999",null]'::jsonb ELSE '["999","1000"]'::jsonb END),false);
    IF NOT EXISTS (SELECT 1 FROM public.revendamais_lead_receipts WHERE id=(r->>'receiptId')::uuid
      AND retry_lead_id IS NULL AND retry_identity_status IN ('empty','incomplete','ambiguous')
      AND retry_relation='none' AND possible_related_receipt_id IS NULL) THEN RAISE EXCEPTION 'Unreliable array associated'; END IF;
  END LOOP;
  r := public.revendamais_commit_lead(l,false,m || '{"dealerId":"900003"}',false);
  IF EXISTS (SELECT 1 FROM public.revendamais_lead_receipts WHERE id=(r->>'receiptId')::uuid
    AND possible_related_receipt_id IS NOT NULL) THEN RAISE EXCEPTION 'Dealer scope crossed'; END IF;
  r := public.revendamais_commit_lead(l || '{"title":"Content changed inside retry identity"}',false,m,false);
  IF NOT EXISTS (SELECT 1 FROM public.revendamais_lead_receipts WHERE id=(r->>'receiptId')::uuid
    AND retry_relation='content_conflict' AND reason='retry_payload_conflict' AND possible_related_receipt_id IS NULL) THEN
    RAISE EXCEPTION 'Conflicting retry not reviewed'; END IF;
  BEGIN PERFORM public.revendamais_commit_lead(l,false,m || '{"org_id":"forged"}',false);
    RAISE EXCEPTION 'Administrative metadata accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
ROLLBACK;
