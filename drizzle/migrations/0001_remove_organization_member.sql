CREATE OR REPLACE FUNCTION public.remove_organization_member(p_org_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_caller uuid := auth.uid(); v_caller_role app_role; v_target_role app_role;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF p_user_id = v_caller THEN RAISE EXCEPTION 'cannot_remove_self' USING ERRCODE='42501'; END IF;

  SELECT role INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller AND org_id = p_org_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  SELECT role INTO v_target_role FROM public.user_roles WHERE user_id = p_user_id AND org_id = p_org_id FOR UPDATE;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'member_not_found' USING ERRCODE='P0002'; END IF;
  IF v_target_role = 'owner' THEN RAISE EXCEPTION 'cannot_remove_owner' USING ERRCODE='42501'; END IF;
  IF v_target_role = 'admin' AND v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'only_owner_can_remove_admin' USING ERRCODE='42501'; END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id AND org_id = p_org_id;
  DELETE FROM public.team_members tm USING public.teams t
   WHERE tm.team_id = t.id AND t.org_id = p_org_id AND tm.user_id = p_user_id;

  -- Only clear the org link if no other legitimate role in this org remains
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND org_id = p_org_id) THEN
    UPDATE public.profiles SET org_id = NULL WHERE id = p_user_id AND org_id = p_org_id;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.remove_organization_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_organization_member(uuid, uuid) TO authenticated;