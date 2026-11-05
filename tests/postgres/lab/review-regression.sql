-- LAB ONLY: replace only the listing function within a rolled-back transaction.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database()<>'revendamais_leads_test' OR current_user<>'revendamais_lab'
    OR current_setting('server_version_num')::int/10000<>17
    OR (SELECT marker FROM public.revendamais_lab_identity)<>'alencar-revendamais-pg17-disposable-v1'
    OR EXISTS(SELECT 1 FROM public.revendamais_lead_receipts)
    OR EXISTS(SELECT 1 FROM public.contacts) OR EXISTS(SELECT 1 FROM public.deals) THEN
    RAISE EXCEPTION 'Require empty disposable laboratory';
  END IF;
END $$;
-- LAB_RPC_DEFINITION
-- LAB_FIXTURE
ROLLBACK;
