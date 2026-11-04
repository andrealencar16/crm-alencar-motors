
- Single-organization CRM: membership and permissions come only from `public.user_roles`; `profiles.org_id` is a mirror written only by SECURITY DEFINER RPCs (`add_organization_member`, `update_member_role`, `remove_organization_member`, `prepare_user_deletion`). Why: prevents client-side privilege escalation.
- Permanent account deletion goes through the `admin-users` edge function: DB step first (transfer history, detach), then Auth Admin API delete. Why: the Auth delete is outside the SQL transaction, so a failure leaves a safe, retryable state.
