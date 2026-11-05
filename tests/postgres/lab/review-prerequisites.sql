-- LAB ONLY. Extra schema for 0012; never a production migration or data import.
DO $$ BEGIN
  IF current_database()<>'revendamais_leads_test' OR current_user<>'revendamais_lab'
    OR current_setting('server_version_num')::int/10000<>17
    OR (SELECT marker FROM public.revendamais_lab_identity)<>'alencar-revendamais-pg17-disposable-v1' THEN
    RAISE EXCEPTION 'Wrong disposable laboratory';
  END IF;
END $$;
CREATE TYPE public.app_role AS ENUM ('owner','admin','member');
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,service_role;
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
  org_id uuid NOT NULL REFERENCES public.organizations(id), role public.app_role NOT NULL,
  UNIQUE(user_id,org_id)
);
CREATE TABLE public.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,currency text DEFAULT 'BRL',is_default boolean DEFAULT false,created_at timestamptz DEFAULT now()
);
CREATE TABLE public.pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES public.organizations(id),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id),name text NOT NULL,"order" integer DEFAULT 0
);
ALTER TABLE public.deals ADD COLUMN value numeric DEFAULT 0;
ALTER TABLE public.contacts ADD CONSTRAINT review_lab_contact_owner_fkey FOREIGN KEY(owner_id) REFERENCES auth.users(id);
ALTER TABLE public.deals ADD CONSTRAINT review_lab_deal_owner_fkey FOREIGN KEY(owner_id) REFERENCES auth.users(id);
ALTER TABLE public.deals ADD CONSTRAINT review_lab_stage_fkey FOREIGN KEY(stage_id) REFERENCES public.pipeline_stages(id);
ALTER TABLE public.activities ADD CONSTRAINT review_lab_activity_user_fkey FOREIGN KEY(user_id) REFERENCES auth.users(id);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_roles,public.pipelines,public.pipeline_stages FROM PUBLIC,anon,authenticated,service_role;
