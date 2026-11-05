-- NOT EXECUTED. Requires an explicitly authorized disposable Supabase-compatible
-- database named EXACTLY stock_keys_test, migrations already applied, trusted owner role.
-- Run via psql with ON_ERROR_STOP; never point this file at a real environment.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() IS DISTINCT FROM 'stock_keys_test' THEN
    RAISE EXCEPTION 'Use a disposable stock_keys_test database only';
  END IF;
  IF to_regprocedure('public.stock_key_admin_create(text)') IS NULL THEN
    RAISE EXCEPTION 'Corrected migration must already be applied';
  END IF;
  IF (SELECT count(*) FROM public.organizations) IS DISTINCT FROM 1::bigint
     OR public.main_org_id() IS NULL
     OR (SELECT lower(btrim(name)) FROM public.organizations WHERE id=public.main_org_id())
        IS DISTINCT FROM 'alencar motors' THEN
    RAISE EXCEPTION 'Require one pre-provisioned Alencar Motors organization';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stock_api_keys) THEN
    RAISE EXCEPTION 'Require empty credential table in disposable database';
  END IF;
END $$;

-- Reuse main_org_id(); never invent or create another organization.
INSERT INTO auth.users(id, email, invited_at) VALUES
 ('b0000000-0000-4000-8000-000000000001','stock-owner@example.invalid',now()),
 ('b0000000-0000-4000-8000-000000000002','stock-admin@example.invalid',now()),
 ('b0000000-0000-4000-8000-000000000003','stock-member@example.invalid',now()),
 ('b0000000-0000-4000-8000-000000000004','stock-no-role@example.invalid',now());
-- Remove any fixture memberships introduced by project signup triggers.
DELETE FROM public.user_roles WHERE user_id IN (
 'b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002',
 'b0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000004');
INSERT INTO public.user_roles(user_id,org_id,role) VALUES
 ('b0000000-0000-4000-8000-000000000001',public.main_org_id(),'owner'),
 ('b0000000-0000-4000-8000-000000000002',public.main_org_id(),'admin'),
 ('b0000000-0000-4000-8000-000000000003',public.main_org_id(),'member');
CREATE TEMP TABLE issued(result jsonb);
GRANT SELECT, INSERT ON TABLE issued TO authenticated;

DO $$ DECLARE r text; p text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(r,'public.stock_api_keys',p) THEN
        RAISE EXCEPTION 'Unexpected direct table privilege';
      END IF;
    END LOOP;
    IF has_function_privilege(r,'public.stock_key_admin_org()','EXECUTE') THEN
      RAISE EXCEPTION 'Helper accessible';
    END IF;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['anon','service_role'] LOOP
    IF has_function_privilege(r,'public.stock_key_admin_create(text)','EXECUTE')
       OR has_function_privilege(r,'public.stock_key_admin_list(integer,integer)','EXECUTE')
       OR has_function_privilege(r,'public.stock_key_admin_revoke(uuid)','EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected administrative permission';
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated','public.stock_key_admin_create(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Missing user-context grant';
  END IF;
  IF (SELECT relrowsecurity FROM pg_class WHERE oid='public.stock_api_keys'::regclass) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RLS disabled';
  END IF;
END $$;

-- The trusted harness sets claims ONLY to emulate PostgREST's verified JWT context.
-- This is not a substitute for gateway tests of invalid/expired JWT signatures.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
  BEGIN PERFORM public.stock_key_admin_create('Denied'); RAISE EXCEPTION 'Member created key';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.stock_key_admin_list(); RAISE EXCEPTION 'Member listed keys';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.stock_key_admin_revoke('c0000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'Member revoked key';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.stock_key_admin_create(p_name=>'Forged',p_actor=>'b0000000-0000-4000-8000-000000000001'::uuid);
    RAISE EXCEPTION 'Actor override accepted'; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN PERFORM public.stock_key_admin_create(p_name=>'Forged',p_key_hash=>repeat('a',64));
    RAISE EXCEPTION 'Hash override accepted'; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN PERFORM key_hash FROM public.stock_api_keys; RAISE EXCEPTION 'Hash readable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

DO $$ BEGIN
    PERFORM set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000004',true);
    BEGIN PERFORM public.stock_key_admin_create('Denied'); RAISE EXCEPTION 'Invalid membership accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000001',true);
INSERT INTO issued SELECT public.stock_key_admin_create('Fixture only');
DO $$ DECLARE response jsonb; BEGIN
  SELECT result INTO response FROM issued;
  IF jsonb_typeof(response) IS DISTINCT FROM 'object'
    OR jsonb_typeof(response->'data') IS DISTINCT FROM 'object'
    OR jsonb_typeof(response->'secret') IS DISTINCT FROM 'string'
    OR (response->>'secret' ~ '^stk_[A-Za-z0-9_-]{43}$') IS DISTINCT FROM true
    OR (response->'data' ? 'key_hash') IS DISTINCT FROM false
    OR (response->'data'->>'created_by') IS DISTINCT FROM auth.uid()::text
    OR (response->'data'->'scopes') IS DISTINCT FROM '["stock:read"]'::jsonb THEN
    RAISE EXCEPTION 'Invalid creation response';
  END IF;
  IF jsonb_array_length(public.stock_key_admin_list()) IS DISTINCT FROM 1
    OR (public.stock_key_admin_list()::text LIKE '%"secret"%') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Invalid list response'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000002',true);
DO $$ DECLARE created jsonb; revoked jsonb; BEGIN
  IF jsonb_array_length(public.stock_key_admin_list()) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Main-org admin cannot list owner credential'; END IF;
  BEGIN PERFORM public.stock_key_admin_revoke('c0000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'Unknown key accepted';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  -- admin is also allowed, independently from owner.
  created := public.stock_key_admin_create('Admin fixture');
  revoked := public.stock_key_admin_revoke((created->'data'->>'id')::uuid);
  IF (revoked->>'is_active')::boolean IS DISTINCT FROM false
    OR revoked->>'revoked_by' IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION 'Admin cannot revoke'; END IF;
END $$;

RESET ROLE;
DO $$ DECLARE response jsonb; stored public.stock_api_keys; BEGIN
  SELECT result INTO response FROM issued;
  SELECT * INTO stored FROM public.stock_api_keys WHERE id=(response->'data'->>'id')::uuid;
  IF NOT FOUND OR stored.key_hash IS DISTINCT FROM encode(extensions.digest(convert_to(response->>'secret','UTF8'),'sha256'),'hex')
     OR stored.key_hash = response->>'secret'
     OR stored.org_id IS DISTINCT FROM public.main_org_id() THEN RAISE EXCEPTION 'Invalid persisted hash/organization'; END IF;
END $$;

-- Audit failure must roll back the revoke.
CREATE FUNCTION pg_temp.fail_stock_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.entity_type='stock_api_keys' AND NEW.action IN ('create','update') THEN
    RAISE EXCEPTION 'fixture audit failure' USING ERRCODE='P9001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_fail_stock_audit BEFORE INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_stock_audit();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE target uuid; before_count integer; target_data jsonb; BEGIN
  SELECT (result->'data'->>'id')::uuid INTO target FROM issued;
  BEGIN PERFORM public.stock_key_admin_revoke(target); RAISE EXCEPTION 'Audit failure ignored';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL; END;
  SELECT value INTO target_data FROM jsonb_array_elements(public.stock_key_admin_list()) WHERE value->>'id'=target::text;
  IF (target_data->>'is_active')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Revoke not rolled back'; END IF;
  before_count := jsonb_array_length(public.stock_key_admin_list());
  BEGIN PERFORM public.stock_key_admin_create('Audit rollback'); RAISE EXCEPTION 'Create audit failure ignored';
  EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL; END;
  IF jsonb_array_length(public.stock_key_admin_list()) IS DISTINCT FROM before_count THEN RAISE EXCEPTION 'Create not rolled back'; END IF;
END $$;
RESET ROLE;
DROP TRIGGER test_fail_stock_audit ON public.audit_logs;
SET LOCAL ROLE authenticated;
DO $$ DECLARE target uuid; first_result jsonb; BEGIN
  SELECT (result->'data'->>'id')::uuid INTO target FROM issued;
  first_result := public.stock_key_admin_revoke(target);
  IF (first_result->>'is_active')::boolean IS DISTINCT FROM false
    OR first_result IS DISTINCT FROM public.stock_key_admin_revoke(target) THEN RAISE EXCEPTION 'Non-idempotent revoke'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE target uuid; BEGIN
  SELECT (result->'data'->>'id')::uuid INTO target FROM issued;
  BEGIN UPDATE public.stock_api_keys SET is_active=true,revoked_at=NULL,revoked_by=NULL WHERE id=target;
    RAISE EXCEPTION 'Reactivated'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM public.audit_logs WHERE entity_id=target AND entity_type='stock_api_keys' AND action='update') <> 1 THEN
    RAISE EXCEPTION 'Duplicate revoke audit';
  END IF;
END $$;
-- Issuance quota includes revoked credentials and applies to direct RPC calls.
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  FOR i IN 1..8 LOOP PERFORM public.stock_key_admin_create('Quota fixture'); END LOOP;
  BEGIN PERFORM public.stock_key_admin_create('Over quota'); RAISE EXCEPTION 'Quota bypassed';
  EXCEPTION WHEN SQLSTATE 'P0429' THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.stock_key_admin_create('Anon'); RAISE EXCEPTION 'Anonymous created key';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
