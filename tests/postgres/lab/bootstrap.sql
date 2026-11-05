-- LAB ONLY. Run through Lab.ps1 Bootstrap, never against Lovable/Supabase.
DO $$ BEGIN
  IF current_database() <> 'revendamais_leads_test' OR current_user <> 'revendamais_lab'
    OR current_setting('server_version_num')::integer / 10000 <> 17 THEN
    RAISE EXCEPTION 'Wrong disposable laboratory or PostgreSQL major version';
  END IF;
END $$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

-- Minimal emulation of verified PostgREST claim context, NOT a JWT verifier.
-- Only the trusted local fixture owner supplies claims; do not expose this DB.
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')
$$;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;

CREATE TYPE public.contact_status AS ENUM ('lead','prospect','customer','churned');
CREATE TYPE public.deal_status AS ENUM ('open','won','lost');
CREATE TYPE public.activity_type AS ENUM ('call','email','meeting','note','task');
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  slug text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.organizations(id,name,slug) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001','Alencar Motors','alencar-motors-lab');
CREATE FUNCTION public.main_org_id() RETURNS uuid LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = '' AS $$
  SELECT id FROM public.organizations ORDER BY created_at,id LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.main_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.main_org_id() TO authenticated,service_role;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id), first_name text NOT NULL,
  last_name text, phone text, email text, status public.contact_status DEFAULT 'lead', owner_id uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id),
  title text NOT NULL, contact_id uuid REFERENCES public.contacts(id),
  -- Intentionally nullable, no vehicles table: intake must not depend on stock.
  vehicle_id uuid, status public.deal_status DEFAULT 'open', currency text DEFAULT 'BRL',
  owner_id uuid, stage_id uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations(id),
  contact_id uuid REFERENCES public.contacts(id), deal_id uuid REFERENCES public.deals(id),
  type public.activity_type NOT NULL, title text NOT NULL, body text, user_id uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organizations,public.contacts,public.deals,public.activities FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE public.revendamais_lab_identity (
  marker text PRIMARY KEY CHECK(marker='alencar-revendamais-pg17-disposable-v1')
);
INSERT INTO public.revendamais_lab_identity VALUES ('alencar-revendamais-pg17-disposable-v1');
REVOKE ALL ON TABLE public.revendamais_lab_identity FROM PUBLIC,anon,authenticated,service_role;
-- Simulate permissive platform defaults: 0011 MUST revoke these on its new table.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
