CREATE OR REPLACE FUNCTION public.user_has_password()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  -- Invited accounts: the first_access_completed flag is the source of truth
  -- (invites get a random hash, so encrypted_password is meaningless for them).
  -- Accounts invited before this flag existed are grandfathered.
  select case
    when u.invited_at is null then coalesce(length(u.encrypted_password) > 0, false)
    when u.invited_at < '2026-11-04 13:00:00+00'::timestamptz then true
    else coalesce((u.raw_user_meta_data->>'first_access_completed')::boolean, false)
  end
  from auth.users u where u.id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.user_has_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_password() TO authenticated;