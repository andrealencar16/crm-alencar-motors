ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_scopes_allowed CHECK (scopes <@ ARRAY['stock:read']::text[]);

COMMENT ON COLUMN public.api_keys.scopes IS 'Explicit permissions for scoped APIs. Empty = legacy key (public-api only, unchanged behavior). stock-api requires exactly stock:read; no wildcard is honored.';

CREATE INDEX IF NOT EXISTS idx_vehicles_org_status_updated
  ON public.vehicles (org_id, status, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_vehicles_sync
  ON public.audit_logs (org_id, created_at DESC, id)
  WHERE entity_type = 'vehicles';