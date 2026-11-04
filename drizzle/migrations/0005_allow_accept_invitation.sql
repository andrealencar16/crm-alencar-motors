REVOKE EXECUTE ON FUNCTION public.accept_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_pending_invitations() TO authenticated;
COMMENT ON FUNCTION public.accept_invitation(uuid) IS 'Invited user accepts own pending invitation (email must match, confirmed).';