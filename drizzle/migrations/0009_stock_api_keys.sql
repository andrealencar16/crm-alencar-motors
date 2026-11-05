-- Separate credentials: no changes to api_keys, vehicles, Storage or public-api.
-- Prerequisite only: do not install/move extensions implicitly.
DO $$ BEGIN
  IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL
     OR to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'Required pgcrypto functions missing from extensions schema';
  END IF;
END $$;
CREATE TABLE public.stock_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  key_prefix text NOT NULL CHECK (key_prefix ~ '^stk_[A-Za-z0-9_-]{8}$'),
  key_hash text NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] NOT NULL DEFAULT ARRAY['stock:read']::text[]
    CHECK (scopes = ARRAY['stock:read']::text[]),
  -- Historical actor IDs intentionally survive deletion of the Auth identity.
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  revoked_at timestamptz,
  revoked_by uuid,
  last_used_at timestamptz,
  CONSTRAINT stock_api_keys_revocation_valid CHECK (
    (is_active AND revoked_at IS NULL AND revoked_by IS NULL) OR
    (NOT is_active AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  )
);
CREATE INDEX stock_api_keys_org_created_idx
  ON public.stock_api_keys (org_id, created_at DESC, id);
ALTER TABLE public.stock_api_keys ENABLE ROW LEVEL SECURITY;
-- No direct access, including from service_role. Only user-context RPCs below.
REVOKE ALL ON TABLE public.stock_api_keys FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.stock_key_guard_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF ROW(NEW.id, NEW.org_id, NEW.name, NEW.key_hash, NEW.key_prefix, NEW.scopes,
         NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.org_id, OLD.name, OLD.key_hash, OLD.key_prefix, OLD.scopes,
         OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'immutable_stock_credential' USING ERRCODE = '42501';
  END IF;
  IF NOT OLD.is_active AND ROW(NEW.is_active, NEW.revoked_at, NEW.revoked_by)
     IS DISTINCT FROM ROW(OLD.is_active, OLD.revoked_at, OLD.revoked_by) THEN
    RAISE EXCEPTION 'stock_credential_revoked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER stock_api_keys_guard_update BEFORE UPDATE ON public.stock_api_keys
FOR EACH ROW EXECUTE FUNCTION public.stock_key_guard_update();
REVOKE ALL ON FUNCTION public.stock_key_guard_update() FROM PUBLIC, anon, authenticated, service_role;

-- Identity comes from the verified PostgREST JWT, not an RPC argument.
CREATE FUNCTION public.stock_key_admin_org()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '3s' AS $$
DECLARE v_org uuid; v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Same main organization used by existing CRM membership-management RPCs.
  -- No organization selection or inference from the user's other memberships.
  v_org := public.main_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Hold only this administrator's membership stable until transaction end.
  -- Concurrent demotion/deletion waits (or is observed before authorization).
  -- Other users' memberships remain writable; UNIQUE(user_id, org_id) already
  -- prevents a second role in the same main organization.
  PERFORM 1 FROM public.user_roles
    WHERE user_id = v_actor AND org_id = v_org AND role::text IN ('owner', 'admin')
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Also protect responses to direct PostgREST calls, not only Edge responses.
  PERFORM set_config('response.headers', '[{"Cache-Control":"no-store"}]', true);
  RETURN v_org;
END; $$;
REVOKE ALL ON FUNCTION public.stock_key_admin_org() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.stock_key_metadata(p_key public.stock_api_keys)
RETURNS jsonb LANGUAGE sql SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', (p_key).id, 'name', (p_key).name, 'key_prefix', (p_key).key_prefix,
    'scopes', (p_key).scopes, 'created_by', (p_key).created_by, 'created_at', (p_key).created_at,
    'is_active', (p_key).is_active, 'revoked_at', (p_key).revoked_at,
    'revoked_by', (p_key).revoked_by, 'last_used_at', (p_key).last_used_at
  )
$$;
REVOKE ALL ON FUNCTION public.stock_key_metadata(public.stock_api_keys)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.stock_key_admin_create(p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '3s' AS $$
DECLARE v_org uuid; v_key public.stock_api_keys; v_secret text; v_actor uuid := auth.uid();
BEGIN
  v_org := public.stock_key_admin_org();
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_parameters' USING ERRCODE = '22023';
  END IF;
  -- Serialize issuance per organization, so quotas also apply to direct RPCs.
  PERFORM 1 FROM public.organizations WHERE id = v_org FOR UPDATE;
  IF (SELECT count(*) FROM public.stock_api_keys WHERE org_id = v_org AND is_active) >= 20
     OR (SELECT count(*) FROM public.stock_api_keys
         WHERE org_id = v_org AND created_at >= now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'issuance_limit' USING ERRCODE = 'P0429';
  END IF;
  v_secret := 'stk_' || rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  INSERT INTO public.stock_api_keys (org_id, name, key_hash, key_prefix, created_by)
    VALUES (v_org, btrim(p_name), encode(extensions.digest(convert_to(v_secret, 'UTF8'), 'sha256'), 'hex'),
      left(v_secret, 12), v_actor) RETURNING * INTO v_key;
  INSERT INTO public.audit_logs (org_id, user_id, action, entity_type, entity_id)
    VALUES (v_org, v_actor, 'create', 'stock_api_keys', v_key.id);
  RETURN jsonb_build_object('data', public.stock_key_metadata(v_key), 'secret', v_secret);
END; $$;
REVOKE ALL ON FUNCTION public.stock_key_admin_create(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_key_admin_create(text) TO authenticated;

CREATE FUNCTION public.stock_key_admin_list(p_page integer DEFAULT 1, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '3s' AS $$
DECLARE v_org uuid;
BEGIN
  v_org := public.stock_key_admin_org();
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_parameters' USING ERRCODE = '22023';
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(k.metadata ORDER BY k.created_at DESC, k.id), '[]'::jsonb)
    FROM (
      SELECT public.stock_key_metadata(s) AS metadata, s.created_at, s.id
      FROM public.stock_api_keys s WHERE s.org_id = v_org
      ORDER BY s.created_at DESC, s.id LIMIT p_limit OFFSET ((p_page - 1) * p_limit)
    ) k
  );
END; $$;
REVOKE ALL ON FUNCTION public.stock_key_admin_list(integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_key_admin_list(integer, integer) TO authenticated;

CREATE FUNCTION public.stock_key_admin_revoke(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '3s' AS $$
DECLARE v_org uuid; v_key public.stock_api_keys; v_actor uuid := auth.uid();
BEGIN
  v_org := public.stock_key_admin_org();
  SELECT * INTO v_key FROM public.stock_api_keys WHERE id = p_id AND org_id = v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_key.is_active THEN
    UPDATE public.stock_api_keys SET is_active = false, revoked_at = now(), revoked_by = v_actor
      WHERE id = p_id AND org_id = v_org RETURNING * INTO v_key;
    INSERT INTO public.audit_logs (org_id, user_id, action, entity_type, entity_id)
      VALUES (v_org, v_actor, 'update', 'stock_api_keys', v_key.id);
  END IF;
  RETURN public.stock_key_metadata(v_key);
END; $$;
REVOKE ALL ON FUNCTION public.stock_key_admin_revoke(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_key_admin_revoke(uuid) TO authenticated;
