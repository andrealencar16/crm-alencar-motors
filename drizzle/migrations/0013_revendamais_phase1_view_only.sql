SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
-- Phase 1 is view-only: approval stays revoked for every role until explicitly authorized.
REVOKE EXECUTE ON FUNCTION public.approve_revendamais_lead(uuid) FROM PUBLIC, anon, authenticated, service_role;