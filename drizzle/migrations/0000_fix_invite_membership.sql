-- 1. Profile creation only (no org assignment), idempotent
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar_url, onboarding_completed, onboarding_step)
  VALUES (NEW.id, lower(NEW.email),
          COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
          NEW.raw_user_meta_data->>'avatar_url', false, 1)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Stop auto-accepting invitations just because a profile exists
DROP TRIGGER IF EXISTS on_profile_created_mark_invite ON public.profiles;

-- 3. Pending invitations for the signed-in user (matched by verified auth email)
CREATE OR REPLACE FUNCTION public.get_my_pending_invitations()
RETURNS TABLE(id uuid, org_id uuid, org_name text, role app_role, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT i.id, i.org_id, o.name, i.role, i.created_at
    FROM public.invitations i
    JOIN public.organizations o ON o.id = i.org_id
    JOIN auth.users u ON u.id = auth.uid()
   WHERE i.accepted_at IS NULL
     AND lower(i.email) = lower(u.email)
     AND u.email_confirmed_at IS NOT NULL
   ORDER BY i.created_at DESC;
$$;

-- 4. Explicit, atomic invitation acceptance
CREATE OR REPLACE FUNCTION public.accept_invitation(p_invitation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_email text; v_confirmed timestamptz; v_inv public.invitations; v_cur_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT email, email_confirmed_at INTO v_email, v_confirmed FROM auth.users WHERE id = v_uid;
  IF v_confirmed IS NULL THEN RAISE EXCEPTION 'email_not_confirmed' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_inv FROM public.invitations WHERE id = p_invitation_id FOR UPDATE;
  IF v_inv.id IS NULL OR lower(v_inv.email) <> lower(v_email) THEN
    RAISE EXCEPTION 'invitation_not_found' USING ERRCODE='P0002'; END IF;
  IF v_inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'invitation_already_used' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_inv.org_id) THEN
    RAISE EXCEPTION 'organization_not_found' USING ERRCODE='P0002'; END IF;

  INSERT INTO public.profiles (id, email, name, onboarding_completed, onboarding_step)
  VALUES (v_uid, lower(v_email), split_part(v_email,'@',1), false, 1)
  ON CONFLICT (id) DO NOTHING;

  SELECT org_id INTO v_cur_org FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_cur_org IS NOT NULL AND v_cur_org <> v_inv.org_id THEN
    RAISE EXCEPTION 'already_member_of_other_org' USING ERRCODE='42501'; END IF;

  INSERT INTO public.user_roles (user_id, org_id, role)
  VALUES (v_uid, v_inv.org_id, COALESCE(v_inv.role,'member'))
  ON CONFLICT (user_id, org_id) DO NOTHING;

  UPDATE public.profiles SET org_id = v_inv.org_id, onboarding_completed = true WHERE id = v_uid;
  UPDATE public.invitations SET accepted_at = now() WHERE id = v_inv.id;
  RETURN v_inv.org_id;
END; $$;

-- 5. Org creation only for yourself, only if not already in an org and no pending invite
CREATE OR REPLACE FUNCTION public.create_organization_for_user(p_user_id uuid, p_name text, p_slug text, p_settings jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org_id uuid; v_cur uuid; v_email text;
BEGIN
  IF auth.uid() IS NULL OR p_user_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT org_id INTO v_cur FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_cur IS NOT NULL THEN RETURN v_cur; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'already_member' USING ERRCODE='42501'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF EXISTS (SELECT 1 FROM public.invitations WHERE accepted_at IS NULL AND lower(email) = lower(v_email)) THEN
    RAISE EXCEPTION 'pending_invitation_exists' USING ERRCODE='42501'; END IF;

  INSERT INTO public.organizations (name, slug, settings) VALUES (p_name, p_slug, p_settings) RETURNING id INTO v_org_id;
  INSERT INTO public.user_roles (user_id, org_id, role) VALUES (p_user_id, v_org_id, 'owner') ON CONFLICT (user_id, org_id) DO NOTHING;
  UPDATE public.profiles SET org_id = v_org_id WHERE id = p_user_id;
  RETURN v_org_id;
END; $$;

-- 6. Close privilege-escalation hole: unused helper that granted owner on any org
REVOKE EXECUTE ON FUNCTION public.initialize_org_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.accept_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_pending_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pending_invitations() TO authenticated;

-- 7. Profiles without org were readable by anyone signed in
DROP POLICY IF EXISTS "Users can view profiles in own org" ON public.profiles;
CREATE POLICY "Users can view profiles in own org" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR (org_id IS NOT NULL AND public.user_belongs_to_org(auth.uid(), org_id)));

-- 8. Backfill missing profiles (no org)
INSERT INTO public.profiles (id, email, name, onboarding_completed, onboarding_step)
SELECT u.id, lower(u.email), COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)), false, 1
  FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- 9. Reconcile the two already-accepted invitations (exact email + org match)
INSERT INTO public.user_roles (user_id, org_id, role)
SELECT u.id, i.org_id, COALESCE(i.role,'member')
  FROM public.invitations i JOIN auth.users u ON lower(u.email) = lower(i.email)
 WHERE i.id IN ('760b1390-2c88-4eb1-8200-8a6723096811','1f9ca62c-6996-4ea8-8194-a1988c144f1a')
   AND i.accepted_at IS NOT NULL
ON CONFLICT (user_id, org_id) DO NOTHING;

UPDATE public.profiles p SET org_id = i.org_id, onboarding_completed = true
  FROM public.invitations i JOIN auth.users u ON lower(u.email) = lower(i.email)
 WHERE p.id = u.id
   AND i.id IN ('760b1390-2c88-4eb1-8200-8a6723096811','1f9ca62c-6996-4ea8-8194-a1988c144f1a')
   AND i.accepted_at IS NOT NULL;