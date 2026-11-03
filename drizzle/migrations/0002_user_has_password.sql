-- Detecta se o usuário autenticado já definiu uma senha.
-- Usuários criados via convite (inviteUserByEmail) não têm senha até defini-la.
-- Somente leitura sobre auth.users; não altera schema gerenciado.
create or replace function public.user_has_password()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(length(u.encrypted_password) > 0, false)
  from auth.users u
  where u.id = auth.uid()
$$;

revoke all on function public.user_has_password() from public, anon;
grant execute on function public.user_has_password() to authenticated;