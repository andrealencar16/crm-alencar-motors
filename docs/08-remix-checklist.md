# 08 — Checklist pós-remix (obrigatório)

Execute na ordem após cada remix. Não pular itens.

## 1. Trigger de auth

Confirmar que `on_auth_user_created` existe em `auth.users`:

```sql
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created';
```

Se vazio, recriar:

```sql
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## 2. Função handle_new_user

```sql
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace AND proname = 'handle_new_user';
```

Se ausente, executar migration com a função (ver [03](./03-auth-and-onboarding.md)).

## 3. Profiles órfãos

```sql
SELECT u.id, u.email
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
```

Se houver linhas, backfill:

```sql
INSERT INTO public.profiles (id, email, name, onboarding_completed, onboarding_step)
SELECT u.id, u.email,
       COALESCE(u.raw_user_meta_data->>'full_name',
                u.raw_user_meta_data->>'name',
                split_part(u.email,'@',1)),
       false, 1
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
```

E para cada profile sem `org_id`, vincular à org default (ou criar uma).

## 4. Auth settings

- `auto_confirm_email = true` (via `supabase--configure_auth`).
- Anonymous sign-up **desabilitado**.
- Google OAuth configurado (se aplicável) via `supabase--configure_social_auth`.

## 5. Teste end-to-end com conta nova

1. Acessar `/` e criar conta de teste.
2. Confirmar redirect automático para `/dashboard`.
3. **OnboardingModal deve abrir sozinho.**
4. Verificar no DB:
   ```sql
   SELECT id, email, org_id, onboarding_completed, onboarding_step
   FROM public.profiles WHERE email = '<email-de-teste>';
   ```
   Esperado: `org_id` preenchido, `onboarding_completed=false`, `onboarding_step=1`.
5. Verificar role:
   ```sql
   SELECT role FROM public.user_roles
   WHERE user_id = (SELECT id FROM auth.users WHERE email = '<email-de-teste>');
   ```

## 6. Teste com conta existente

Login → `/dashboard` → se `onboarding_completed=false`, modal abre; se `true`, app normal.

## 7. Secrets

Confirmar disponíveis (via tool `secrets--fetch_secrets`):

| Secret | Obrigatório? |
|--------|--------------|
| `LOVABLE_API_KEY` | ✅ (qualquer IA) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | ✅ (auto) |
| `GOOGLE_CLIENT_ID/SECRET` | se usar Google OAuth |
| `SLACK_*` | se publicar Slack app própria (caso contrário Lovable gateway resolve) |

## 8. Linter Supabase

Rodar `supabase--linter` e endereçar warnings de:
- RLS desabilitado em tabela nova
- Função sem `search_path` fixo
- Policy permissiva demais

## 9. RLS em tabelas novas

Para cada tabela criada após o remix:

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT tablename FROM pg_policies WHERE schemaname = 'public'
  );
```

Se aparecer alguma, criar policy de isolamento por `org_id` (ver [02](./02-database-schema.md)).

## 10. Edge Functions

- Verificar logs recentes via `supabase--edge_function_logs`.
- Testar `health`:
  ```bash
  curl https://<project>.functions.supabase.co/health
  ```

## 11. Build & preview

- Build automático do Lovable não pode falhar.
- Console do preview sem `Error` ou `Warning` crítico no carregamento.

## 12. Memória do projeto

Conferir `mem://index.md` — se algum guardrail foi violado pelo remix, restaurar antes de prosseguir.

---

**Só considerar o remix "verde" quando todos os 12 itens passarem.**
