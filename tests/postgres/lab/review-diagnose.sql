-- LAB ONLY: transaction-local instrumentation, synthetic fixture, always rollback.
\set ON_ERROR_STOP on
BEGIN;
DO $$ DECLARE definition text; BEGIN
  IF current_database()<>'revendamais_leads_test' OR current_user<>'revendamais_lab'
    OR current_setting('server_version_num')::int/10000<>17
    OR (SELECT marker FROM public.revendamais_lab_identity)<>'alencar-revendamais-pg17-disposable-v1'
    OR EXISTS(SELECT 1 FROM public.revendamais_lead_receipts)
    OR EXISTS(SELECT 1 FROM public.contacts) OR EXISTS(SELECT 1 FROM public.deals) THEN
    RAISE EXCEPTION 'Require empty disposable laboratory';
  END IF;
  definition := pg_get_functiondef('public.get_pending_revendamais_leads(integer,integer)'::regprocedure);
  IF position('RAISE EXCEPTION ''review_query_failed'' USING ERRCODE=''P0001'';' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected installed function';
  END IF;
  definition := replace(definition,'RAISE EXCEPTION ''review_query_failed'' USING ERRCODE=''P0001'';',
    'RAISE NOTICE ''lab_original SQLSTATE=% message=%'',SQLSTATE,SQLERRM; RAISE;');
  EXECUTE definition;
END $$;
-- Runner inlines the fixture without its BEGIN/ROLLBACK. On error,
-- ON_ERROR_STOP disconnect rolls everything back, including instrumentation.
\ir ../revendamais-review.test.sql
ROLLBACK;
