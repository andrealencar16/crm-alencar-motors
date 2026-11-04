CREATE OR REPLACE FUNCTION public.block_public_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  if new.invited_at is not null then return new; end if;
  if exists (select 1 from public.invitations i
             where lower(i.email) = lower(new.email) and i.accepted_at is null) then
    return new;
  end if;
  raise exception 'Cadastro publico desabilitado. Acesso somente por convite.' using errcode = '42501';
end; $$;