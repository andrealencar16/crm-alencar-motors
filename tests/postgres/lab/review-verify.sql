-- LAB ONLY. No data exposure; owner must use the guarded runner/preflight.
DO $$ DECLARE r text; p text; f text; BEGIN
  IF current_database()<>'revendamais_leads_test' OR current_user<>'revendamais_lab'
    OR (SELECT marker FROM public.revendamais_lab_identity)<>'alencar-revendamais-pg17-disposable-v1' THEN RAISE EXCEPTION 'Wrong lab'; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(r,'public.revendamais_lead_receipts',p)
        OR has_table_privilege(r,'public.revendamais_review_approvals',p) THEN RAISE EXCEPTION 'Raw access'; END IF;
    END LOOP;
    FOREACH f IN ARRAY ARRAY['public.get_pending_revendamais_leads(integer,integer)','public.approve_revendamais_lead(uuid)'] LOOP
      IF has_function_privilege(r,f,'EXECUTE') IS DISTINCT FROM (r='authenticated') THEN RAISE EXCEPTION 'RPC grant'; END IF;
    END LOOP;
    FOREACH f IN ARRAY ARRAY['public.revendamais_review_org()',
      'public.revendamais_review_group_key(public.revendamais_lead_receipts)',
      'public.revendamais_review_group_completed(uuid,text)',
      'public.revendamais_review_scope_conflict(public.revendamais_lead_receipts)'] LOOP
      IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION 'Private helper grant'; END IF;
    END LOOP;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid IN ('public.revendamais_lead_receipts'::regclass,
      'public.revendamais_review_approvals'::regclass))
    OR EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('public.revendamais_lead_receipts'::regclass,
      'public.revendamais_review_approvals'::regclass) AND NOT relrowsecurity) THEN RAISE EXCEPTION 'RLS boundary'; END IF;
  FOREACH f IN ARRAY ARRAY['public.get_pending_revendamais_leads(integer,integer)','public.approve_revendamais_lead(uuid)'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_proc pr JOIN pg_roles ro ON ro.oid=pr.proowner WHERE pr.oid=to_regprocedure(f)
      AND pr.prosecdef AND ro.rolname='revendamais_lab' AND EXISTS(SELECT 1 FROM unnest(pr.proconfig) cfg
        WHERE split_part(cfg,'=',1)='search_path' AND split_part(cfg,'=',2) IN ('','""'))) THEN RAISE EXCEPTION 'Definer owner/path'; END IF;
  END LOOP;
END $$;
