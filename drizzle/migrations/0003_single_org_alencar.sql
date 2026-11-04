-- ===== Single-organization model: Alencar Motors =====
CREATE OR REPLACE FUNCTION public.main_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1 $$;
GRANT EXECUTE ON FUNCTION public.main_org_id() TO authenticated, service_role;

-- user_roles is now the only source of authorization
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND org_id = _org_id) $$;

CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT org_id FROM public.user_roles WHERE user_id = _user_id LIMIT 1 $$;

-- No more organization creation
DROP POLICY IF EXISTS "Authenticated can create org" ON public.organizations;
REVOKE EXECUTE ON FUNCTION public.create_organization_for_user(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_invitation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_org_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.create_organization_for_user(uuid, text, text, jsonb) IS 'DEPRECATED: single-organization CRM';
COMMENT ON FUNCTION public.accept_invitation(uuid) IS 'DEPRECATED: membership is granted only by add_organization_member';

-- Block public sign-up: only invited accounts (invited_at set by the admin invite API)
DROP TRIGGER IF EXISTS on_auth_user_block_public_signup ON auth.users;
CREATE TRIGGER on_auth_user_block_public_signup
  BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.block_public_signup();

-- profiles.org_id cannot be manipulated from the client
CREATE OR REPLACE FUNCTION public.protect_profile_org_link()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.org_id := NULL;
    ELSIF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'org_link_protected' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_profile_org_link ON public.profiles;
CREATE TRIGGER trg_protect_profile_org_link BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_org_link();

-- user_roles: no direct writes from the client; only via RPCs
DROP POLICY IF EXISTS "Owners can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners can delete roles" ON public.user_roles;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Helper: caller role in main org
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT role FROM public.user_roles WHERE user_id = auth.uid() AND org_id = public.main_org_id() $$;
GRANT EXECUTE ON FUNCTION public.my_role() TO authenticated;

-- Add an existing account to Alencar Motors
CREATE OR REPLACE FUNCTION public.add_organization_member(p_user_id uuid, p_role app_role DEFAULT 'member')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_org uuid := public.main_org_id(); v_caller app_role; v_email text; v_meta jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF p_user_id IS NULL OR p_role IS NULL THEN RAISE EXCEPTION 'invalid_parameters' USING ERRCODE='22023'; END IF;
  SELECT role INTO v_caller FROM public.user_roles WHERE user_id = auth.uid() AND org_id = v_org;
  IF v_caller IS NULL OR v_caller NOT IN ('owner','admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_role = 'owner' THEN RAISE EXCEPTION 'cannot_assign_owner' USING ERRCODE='42501'; END IF;
  IF p_role = 'admin' AND v_caller <> 'owner' THEN RAISE EXCEPTION 'only_owner_can_assign_admin' USING ERRCODE='42501'; END IF;

  SELECT email, raw_user_meta_data INTO v_email, v_meta FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'user_not_found' USING ERRCODE='P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND org_id = v_org) THEN
    RAISE EXCEPTION 'already_member' USING ERRCODE='23505'; END IF;

  INSERT INTO public.profiles (id, email, name, onboarding_completed, onboarding_step)
  VALUES (p_user_id, lower(v_email), COALESCE(v_meta->>'full_name', v_meta->>'name', split_part(v_email,'@',1)), true, 1)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, org_id, role) VALUES (p_user_id, v_org, p_role);
  UPDATE public.profiles SET org_id = v_org, onboarding_completed = true WHERE id = p_user_id;
  UPDATE public.invitations SET accepted_at = now()
   WHERE org_id = v_org AND lower(email) = lower(v_email) AND accepted_at IS NULL;
END; $$;
REVOKE EXECUTE ON FUNCTION public.add_organization_member(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_organization_member(uuid, app_role) TO authenticated;

-- Change a member's role (hierarchy enforced)
CREATE OR REPLACE FUNCTION public.update_member_role(p_user_id uuid, p_role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_org uuid := public.main_org_id(); v_caller app_role; v_target app_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF p_user_id IS NULL OR p_role IS NULL THEN RAISE EXCEPTION 'invalid_parameters' USING ERRCODE='22023'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_change_own_role' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_caller FROM public.user_roles WHERE user_id = auth.uid() AND org_id = v_org;
  IF v_caller IS NULL OR v_caller NOT IN ('owner','admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_target FROM public.user_roles WHERE user_id = p_user_id AND org_id = v_org FOR UPDATE;
  IF v_target IS NULL THEN RAISE EXCEPTION 'member_not_found' USING ERRCODE='P0002'; END IF;
  IF p_role = 'owner' OR v_target = 'owner' THEN RAISE EXCEPTION 'owner_role_protected' USING ERRCODE='42501'; END IF;
  IF v_caller <> 'owner' AND (p_role = 'admin' OR v_target = 'admin') THEN
    RAISE EXCEPTION 'only_owner_can_manage_admins' USING ERRCODE='42501'; END IF;
  UPDATE public.user_roles SET role = p_role WHERE user_id = p_user_id AND org_id = v_org;
END; $$;
REVOKE EXECUTE ON FUNCTION public.update_member_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_member_role(uuid, app_role) TO authenticated;

-- Remove from organization (account preserved)
CREATE OR REPLACE FUNCTION public.remove_organization_member(p_org_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_caller uuid := auth.uid(); v_caller_role app_role; v_target_role app_role;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF p_org_id IS NULL OR p_user_id IS NULL THEN RAISE EXCEPTION 'invalid_parameters' USING ERRCODE='22023'; END IF;
  IF p_user_id = v_caller THEN RAISE EXCEPTION 'cannot_remove_self' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller AND org_id = p_org_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_target_role FROM public.user_roles WHERE user_id = p_user_id AND org_id = p_org_id FOR UPDATE;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'member_not_found' USING ERRCODE='P0002'; END IF;
  IF v_target_role = 'owner' THEN RAISE EXCEPTION 'cannot_remove_owner' USING ERRCODE='42501'; END IF;
  IF v_target_role = 'admin' AND v_caller_role <> 'owner' THEN RAISE EXCEPTION 'only_owner_can_remove_admin' USING ERRCODE='42501'; END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id AND org_id = p_org_id;
  DELETE FROM public.team_members tm USING public.teams t WHERE tm.team_id = t.id AND t.org_id = p_org_id AND tm.user_id = p_user_id;
  UPDATE public.profiles SET org_id = NULL WHERE id = p_user_id AND org_id = p_org_id;
END; $$;

-- Prepare permanent deletion: authorize, transfer commercial history, detach. Idempotent.
-- Called by the admin-users edge function with the caller's JWT, BEFORE the Auth Admin API deletion.
CREATE OR REPLACE FUNCTION public.prepare_user_deletion(p_user_id uuid, p_transfer_to uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_org uuid := public.main_org_id(); v_caller app_role; v_target app_role; v_to_role app_role; v jsonb := '{}'::jsonb; n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF p_user_id IS NULL OR p_transfer_to IS NULL THEN RAISE EXCEPTION 'invalid_parameters' USING ERRCODE='22023'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_delete_self' USING ERRCODE='42501'; END IF;
  IF p_transfer_to = p_user_id THEN RAISE EXCEPTION 'invalid_transfer_target' USING ERRCODE='22023'; END IF;
  SELECT role INTO v_caller FROM public.user_roles WHERE user_id = auth.uid() AND org_id = v_org;
  IF v_caller IS NULL OR v_caller NOT IN ('owner','admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_target FROM public.user_roles WHERE user_id = p_user_id AND org_id = v_org FOR UPDATE;
  IF v_target = 'owner' THEN RAISE EXCEPTION 'cannot_delete_owner' USING ERRCODE='42501'; END IF;
  IF v_target = 'admin' AND v_caller <> 'owner' THEN RAISE EXCEPTION 'only_owner_can_delete_admin' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_to_role FROM public.user_roles WHERE user_id = p_transfer_to AND org_id = v_org;
  IF v_to_role IS NULL THEN RAISE EXCEPTION 'transfer_target_not_member' USING ERRCODE='22023'; END IF;

  UPDATE public.deals SET owner_id = p_transfer_to WHERE owner_id = p_user_id; GET DIAGNOSTICS n = ROW_COUNT; v := v || jsonb_build_object('deals', n);
  UPDATE public.contacts SET owner_id = p_transfer_to WHERE owner_id = p_user_id; GET DIAGNOSTICS n = ROW_COUNT; v := v || jsonb_build_object('contacts', n);
  UPDATE public.companies SET owner_id = p_transfer_to WHERE owner_id = p_user_id; GET DIAGNOSTICS n = ROW_COUNT; v := v || jsonb_build_object('companies', n);
  UPDATE public.activities SET user_id = p_transfer_to WHERE user_id = p_user_id; GET DIAGNOSTICS n = ROW_COUNT; v := v || jsonb_build_object('activities', n);
  UPDATE public.trade_ins SET owner_id = p_transfer_to WHERE owner_id = p_user_id; GET DIAGNOSTICS n = ROW_COUNT; v := v || jsonb_build_object('trade_ins', n);
  UPDATE public.vehicles SET owner_id = p_transfer_to WHERE owner_id = p_user_id; GET DIAGNOSTICS n = ROW_COUNT; v := v || jsonb_build_object('vehicles', n);
  UPDATE public.emails SET user_id = p_transfer_to WHERE user_id = p_user_id; GET DIAGNOSTICS n = ROW_COUNT; v := v || jsonb_build_object('emails', n);
  UPDATE public.sales_goals SET user_id = p_transfer_to WHERE user_id = p_user_id; GET DIAGNOSTICS n = ROW_COUNT; v := v || jsonb_build_object('sales_goals', n);
  UPDATE public.whatsapp_conversations SET assigned_to = p_transfer_to WHERE assigned_to = p_user_id; GET DIAGNOSTICS n = ROW_COUNT; v := v || jsonb_build_object('whatsapp_conversations', n);
  UPDATE public.invitations SET invited_by = p_transfer_to WHERE invited_by = p_user_id;

  -- personal, non-historical data
  DELETE FROM public.email_connections WHERE user_id = p_user_id;
  DELETE FROM public.email_signatures WHERE user_id = p_user_id;
  DELETE FROM public.notification_preferences WHERE user_id = p_user_id;
  DELETE FROM public.onboarding_progress WHERE user_id = p_user_id;
  DELETE FROM public.team_members WHERE user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  UPDATE public.profiles SET org_id = NULL WHERE id = p_user_id;

  INSERT INTO public.audit_logs (org_id, user_id, action, entity_type, entity_id, new_values)
  VALUES (v_org, auth.uid(), 'user_deletion_prepared', 'user', p_user_id, v || jsonb_build_object('transfer_to', p_transfer_to));
  RETURN v;
END; $$;
REVOKE EXECUTE ON FUNCTION public.prepare_user_deletion(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_user_deletion(uuid, uuid) TO authenticated;

-- Dependency counts shown before deletion
CREATE OR REPLACE FUNCTION public.user_dependency_counts(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF public.my_role() IS NULL OR public.my_role() NOT IN ('owner','admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'deals', (SELECT count(*) FROM public.deals WHERE owner_id = p_user_id),
    'contacts', (SELECT count(*) FROM public.contacts WHERE owner_id = p_user_id),
    'companies', (SELECT count(*) FROM public.companies WHERE owner_id = p_user_id),
    'activities', (SELECT count(*) FROM public.activities WHERE user_id = p_user_id),
    'trade_ins', (SELECT count(*) FROM public.trade_ins WHERE owner_id = p_user_id),
    'vehicles', (SELECT count(*) FROM public.vehicles WHERE owner_id = p_user_id));
END; $$;
REVOKE EXECUTE ON FUNCTION public.user_dependency_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_dependency_counts(uuid) TO authenticated;