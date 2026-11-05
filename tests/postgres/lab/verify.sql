-- LAB ONLY. Read-only assertions. Run after 0011 through the guarded runner.
DO $$ DECLARE r text; p text; f text; BEGIN
  IF current_database() <> 'revendamais_leads_test' OR current_user <> 'revendamais_lab'
    OR current_setting('server_version_num')::integer / 10000 <> 17
    OR (SELECT marker FROM public.revendamais_lab_identity) IS DISTINCT FROM 'alencar-revendamais-pg17-disposable-v1' THEN
    RAISE EXCEPTION 'Wrong laboratory';
  END IF;
  IF (SELECT count(*) FROM public.organizations) <> 1 OR
    (SELECT name FROM public.organizations WHERE id=public.main_org_id()) IS DISTINCT FROM 'Alencar Motors' THEN
    RAISE EXCEPTION 'Wrong synthetic organization';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='deals' AND column_name='vehicle_id')
    OR to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN RAISE EXCEPTION 'Missing prerequisites'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.revendamais_lead_receipts'::regclass) THEN
    RAISE EXCEPTION 'Receipt RLS missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.revendamais_lead_receipts'::regclass) THEN
    RAISE EXCEPTION 'Unexpected receipt policy';
  END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(r,'public.revendamais_lead_receipts',p) THEN RAISE EXCEPTION 'Receipt direct access'; END IF;
    END LOOP;
    FOREACH f IN ARRAY ARRAY['public.revendamais_match_phone(text)','public.revendamais_local_date_valid(text)'] LOOP
      IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION 'Private helper accessible'; END IF;
    END LOOP;
    FOREACH f IN ARRAY ARRAY['public.revendamais_commit_lead(jsonb,boolean,jsonb,boolean)','public.revendamais_purge_expired_reviews()'] LOOP
      IF has_function_privilege(r,f,'EXECUTE') IS DISTINCT FROM (r='service_role') THEN RAISE EXCEPTION 'Wrong RPC ACL'; END IF;
    END LOOP;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.revendamais_commit_lead(jsonb,boolean,jsonb,boolean)','public.revendamais_purge_expired_reviews()'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
      WHERE p.oid=to_regprocedure(f) AND p.prosecdef AND r.rolname='revendamais_lab'
      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg
        WHERE split_part(cfg,'=',1)='search_path' AND split_part(cfg,'=',2) IN ('','""')))
      THEN RAISE EXCEPTION 'Wrong definer owner/path'; END IF;
  END LOOP;
END $$;
