-- PREPARED, NOT EXECUTED. psql only; disposable Supabase-compatible clone.
-- Prerequisites: reviewed schema + 0011 already applied, one Alencar Motors org.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() IS DISTINCT FROM 'revendamais_leads_test' THEN
    RAISE EXCEPTION 'Disposable revendamais_leads_test database required';
  END IF;
  IF (SELECT count(*) FROM public.organizations) <> 1
    OR public.main_org_id() IS NULL
    OR EXISTS (SELECT 1 FROM public.contacts)
    OR EXISTS (SELECT 1 FROM public.deals)
    OR EXISTS (SELECT 1 FROM public.activities)
    OR EXISTS (SELECT 1 FROM public.revendamais_lead_receipts) THEN
    RAISE EXCEPTION 'Require empty CRM fixture tables and one organization';
  END IF;
END $$;

-- Permissions are checked against actual role grants, not just mocked claims.
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(r,'public.revendamais_commit_lead(jsonb,boolean,jsonb,boolean)','EXECUTE') THEN
      RAISE EXCEPTION 'Public writer';
    END IF;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(r,'public.revendamais_lead_receipts','SELECT')
      OR has_table_privilege(r,'public.revendamais_lead_receipts','INSERT')
      OR has_table_privilege(r,'public.revendamais_lead_receipts','UPDATE')
      OR has_table_privilege(r,'public.revendamais_lead_receipts','DELETE') THEN
      RAISE EXCEPTION 'Direct receipt access';
    END IF;
  END LOOP;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$ BEGIN
  BEGIN
    PERFORM public.revendamais_commit_lead('{}',false);
    RAISE EXCEPTION 'Unauthorized call succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- Test-owner controlled failure injection. No test hooks in production RPC.
CREATE FUNCTION public.revendamais_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('revendamais_test.fail_table',true) = TG_TABLE_NAME THEN
    RAISE EXCEPTION 'fixture_write_failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER revendamais_fixture_contact BEFORE INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.revendamais_fixture_fail();
CREATE TRIGGER revendamais_fixture_deal BEFORE INSERT ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.revendamais_fixture_fail();
CREATE TRIGGER revendamais_fixture_activity BEFORE INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.revendamais_fixture_fail();
CREATE TRIGGER revendamais_fixture_receipt BEFORE INSERT ON public.revendamais_lead_receipts
  FOR EACH ROW EXECUTE FUNCTION public.revendamais_fixture_fail();

SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
DECLARE l jsonb := '{"name":"Pessoa Ficticia","phone":"+5585999990000","email":"fiction@example.invalid","title":"Teste A","firstMessage":"Mensagem ficticia","portal":null,"externalId":"fixture-1"}';
  r jsonb; first_result jsonb; t text; n integer;
BEGIN
  -- Fail each stage. Each nested block is a subtransaction: no partial rows.
  FOREACH t IN ARRAY ARRAY['contacts','deals','activities','revendamais_lead_receipts'] LOOP
    PERFORM set_config('revendamais_test.fail_table',t,true);
    BEGIN
      PERFORM public.revendamais_commit_lead(l,true);
      RAISE EXCEPTION 'Expected write failure';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM IS DISTINCT FROM 'fixture_write_failure' THEN RAISE; END IF;
    END;
    IF EXISTS (SELECT 1 FROM public.contacts) OR EXISTS (SELECT 1 FROM public.deals)
      OR EXISTS (SELECT 1 FROM public.activities) OR EXISTS (SELECT 1 FROM public.revendamais_lead_receipts) THEN
      RAISE EXCEPTION 'Partial transaction survived %',t;
    END IF;
  END LOOP;
  PERFORM set_config('revendamais_test.fail_table','',true);
  first_result := public.revendamais_commit_lead(l,true);
  IF first_result->>'status' IS DISTINCT FROM 'created' THEN RAISE EXCEPTION 'New lead missing'; END IF;
  r := public.revendamais_commit_lead(l,true);
  IF r->>'status' IS DISTINCT FROM 'duplicate' OR r->>'dealId' IS DISTINCT FROM first_result->>'dealId' THEN
    RAISE EXCEPTION 'Retry duplicated';
  END IF;
  r := public.revendamais_commit_lead(l || '{"externalId":"fixture-2","title":"Teste B"}',true);
  IF r->>'status' IS DISTINCT FROM 'created' OR r->>'contactId' IS DISTINCT FROM first_result->>'contactId'
    OR r->>'dealId' IS NOT DISTINCT FROM first_result->>'dealId' THEN RAISE EXCEPTION 'New interest lost'; END IF;
  IF (SELECT count(*) FROM public.contacts) <> 1 OR (SELECT count(*) FROM public.activities) <> 2 THEN
    RAISE EXCEPTION 'Contact reuse or message note incorrect';
  END IF;
  IF EXISTS (SELECT 1 FROM public.activities a JOIN public.deals d ON a.deal_id=d.id
    WHERE a.contact_id IS DISTINCT FROM d.contact_id OR a.body IS DISTINCT FROM 'Mensagem ficticia') THEN
    RAISE EXCEPTION 'Incorrect activity linkage';
  END IF;
  r := public.revendamais_commit_lead(l || '{"externalId":null}',false);
  IF r->>'status' IS DISTINCT FROM 'review' THEN RAISE EXCEPTION 'Missing identity not reviewed'; END IF;
  r := public.revendamais_commit_lead(l || '{"externalId":"fixture-3","phone":null,"email":null}',true);
  IF r->>'status' IS DISTINCT FROM 'review' THEN RAISE EXCEPTION 'Insufficient identity not reviewed'; END IF;
  r := public.revendamais_commit_lead(l || '{"title":"Changed content"}',true);
  IF r->>'status' IS DISTINCT FROM 'review' THEN RAISE EXCEPTION 'Conflicting event not reviewed'; END IF;
  IF (SELECT count(*) FROM public.deals) <> 2 THEN RAISE EXCEPTION 'Review created deal'; END IF;
  -- Complementary channel: reuse without overwriting established information.
  UPDATE public.contacts SET email=NULL WHERE id=(first_result->>'contactId')::uuid;
  r := public.revendamais_commit_lead(l || '{"externalId":"fixture-4","firstMessage":null}',true);
  IF (SELECT email FROM public.contacts WHERE id=(first_result->>'contactId')::uuid) IS DISTINCT FROM 'fiction@example.invalid'
    OR (SELECT count(*) FROM public.activities) <> 2 THEN RAISE EXCEPTION 'Complement/empty message failed'; END IF;
  -- Two candidates must never be merged.
  INSERT INTO public.contacts(org_id,first_name,email) VALUES(public.main_org_id(),'Outra Pessoa','other@example.invalid');
  r := public.revendamais_commit_lead(l || '{"externalId":"fixture-5","email":"other@example.invalid"}',true);
  IF r->>'status' IS DISTINCT FROM 'review' THEN RAISE EXCEPTION 'Ambiguous match accepted'; END IF;
  BEGIN
    PERFORM public.revendamais_commit_lead(l || '{"org_id":"forged"}',true);
    RAISE EXCEPTION 'Privileged field accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
-- All fixture data and failure-injection triggers/functions disappear.
DO $$
DECLARE
  l jsonb := '{"name":"Pessoa Metadata","phone":"+5585988880000","email":null,"title":"Teste metadata","firstMessage":null,"portal":null,"externalId":"dealer:9325:lead:100009"}';
  m jsonb := '{"channelId":"900002","channelName":"Canal ficticio","createdAt":"2026-09-17 08:49:53","unknownInteraction":{"text":"Texto sem autoria","sourceIndex":0,"createdAt":"2026-09-17 08:49:53","authorship":"unknown"}}';
  r jsonb; receipt uuid; digest_before bytea; before_c integer; before_d integer; before_r integer;
BEGIN
  SELECT count(*) INTO before_c FROM public.contacts;
  SELECT count(*) INTO before_d FROM public.deals;
  SELECT count(*) INTO before_r FROM public.revendamais_lead_receipts;
  BEGIN
    PERFORM public.revendamais_commit_lead(l,true,m,false);
    RAISE EXCEPTION 'Unknown text without retention approval';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  -- Failure of receipt audit also rolls back CRM creations with metadata.
  PERFORM set_config('revendamais_test.fail_table','revendamais_lead_receipts',true);
  BEGIN
    PERFORM public.revendamais_commit_lead(l,true,m,true);
    RAISE EXCEPTION 'Expected metadata receipt failure';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'fixture_write_failure' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM public.contacts) <> before_c OR (SELECT count(*) FROM public.deals) <> before_d
    OR (SELECT count(*) FROM public.revendamais_lead_receipts) <> before_r THEN RAISE EXCEPTION 'Metadata rollback failed'; END IF;
  PERFORM set_config('revendamais_test.fail_table','',true);
  r := public.revendamais_commit_lead(l,true,m,true);
  IF r->>'status' IS DISTINCT FROM 'created' THEN RAISE EXCEPTION 'Metadata creation failed'; END IF;
  SELECT id,content_digest INTO receipt,digest_before FROM public.revendamais_lead_receipts
    WHERE external_id=l->>'externalId' AND status='processed';
  IF NOT EXISTS (SELECT 1 FROM public.revendamais_lead_receipts WHERE id=receipt
    AND provider='revendamais' AND portal IS NULL AND channel_external_id='900002' AND channel_name='Canal ficticio'
    AND source_created_at='2026-09-17 08:49:53' AND unknown_interaction_text='Texto sem autoria'
    AND unknown_interaction_authorship='unknown' AND unknown_interaction_index=0
    AND unknown_text_expires_at=received_at + interval '30 days') THEN RAISE EXCEPTION 'Metadata lost'; END IF;
  IF EXISTS (SELECT 1 FROM public.activities WHERE deal_id=(r->>'dealId')::uuid) THEN RAISE EXCEPTION 'Unknown author created customer note'; END IF;
  r := public.revendamais_commit_lead(l,true,m,true);
  IF r->>'status' IS DISTINCT FROM 'duplicate' THEN RAISE EXCEPTION 'Metadata duplicate failed'; END IF;
  r := public.revendamais_commit_lead(l,true,m || '{"channelId":"900003"}',true);
  IF r->>'status' IS DISTINCT FROM 'review' THEN RAISE EXCEPTION 'Divergent metadata not reviewed'; END IF;
  UPDATE public.revendamais_lead_receipts SET unknown_text_expires_at=now()-interval '1 second' WHERE id=receipt;
  PERFORM public.revendamais_purge_expired_reviews();
  IF NOT EXISTS (SELECT 1 FROM public.revendamais_lead_receipts WHERE id=receipt
    AND unknown_interaction_text IS NULL AND unknown_text_expires_at IS NULL
    AND source_created_at='2026-09-17 08:49:53' AND content_digest=digest_before) THEN RAISE EXCEPTION 'Retention purge failed'; END IF;
  r := public.revendamais_commit_lead(l,true,m,true);
  IF r->>'status' IS DISTINCT FROM 'duplicate'
    OR EXISTS (SELECT 1 FROM public.revendamais_lead_receipts WHERE id=receipt AND unknown_interaction_text IS NOT NULL)
    THEN RAISE EXCEPTION 'Retry rehydrated expired content'; END IF;
  BEGIN
    PERFORM public.revendamais_commit_lead(l,true,m || '{"org_id":"forged"}',true);
    RAISE EXCEPTION 'Metadata privilege injection accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.revendamais_commit_lead(l,true,m || '{"createdAt":"2026-02-30 08:00:00"}',true);
    RAISE EXCEPTION 'Invalid date accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
ROLLBACK;
