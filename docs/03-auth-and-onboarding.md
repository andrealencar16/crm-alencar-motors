# 03 — Auth & Onboarding (Guardrail obrigatório)

> Este documento codifica o guardrail do Project Knowledge. **Qualquer remix DEVE passar pelo checklist em [08](./08-remix-checklist.md) após restaurar.**

## Princípio inegociável

Todo usuário novo VÊ o `OnboardingModal` imediatamente após entrar em `/dashboard`, sem ação manual. Nunca deixar usuário autenticado sem `profile`.

## Fluxo completo

```
[Login] /
   │  signup OR signin
   ▼
auth.users (INSERT)
   │  TRIGGER on_auth_user_created
   ▼
handle_new_user()
   ├── INSERT profiles (onboarding_completed=false, onboarding_step=1)
   ├── INSERT organizations (se for 1º usuário) ou vincula à org existente
   ├── INSERT user_roles (owner | member)
   └── UPDATE profiles.org_id
   ▼
AuthContext.loadProfile()
   │  retry com backoff [0,200,500,1000,1500]ms
   │  self-repair: INSERT profile direto se trigger falhou
   ▼
Navigate → /dashboard
   ▼
AppLayout → OnboardingModal (abre se profile.onboarding_completed != true)
```

## Configuração de Auth

- **Auto-confirm email**: HABILITADO. Usuário entra direto após signup.
- **Sem anonymous sign-ups.**
- **Social login**: Google opcional, configurado via `supabase--configure_social_auth`.
- **Reset de senha**: rota `/reset-password`.

## Trigger obrigatório

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_user_name text;
BEGIN
  v_user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, name, avatar_url, onboarding_completed, onboarding_step)
  VALUES (NEW.id, NEW.email, v_user_name, NEW.raw_user_meta_data->>'avatar_url', false, 1)
  ON CONFLICT (id) DO NOTHING;

  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, settings)
    VALUES ('Minha Empresa', 'minha-empresa',
            '{"timezone":"America/Sao_Paulo","currency":"BRL"}'::jsonb)
    RETURNING id INTO v_org_id;

    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, v_org_id, 'owner')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, v_org_id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.profiles SET org_id = v_org_id WHERE id = NEW.id AND org_id IS NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## Self-repair no frontend

`src/contexts/AuthContext.tsx`:

1. **Retry com backoff** ao carregar profile (cobre lag de trigger): `[0, 200, 500, 1000, 1500]ms`.
2. **Self-repair**: se mesmo após retries não houver profile, faz `INSERT` direto (RLS permite `id = auth.uid()`).
3. **Sem `await` dentro de `onAuthStateChange`** — usa `setTimeout(..., 0)` para evitar deadlocks do Supabase.

## OnboardingModal — regras de abertura

`src/components/onboarding/OnboardingModal.tsx` abre quando:

- `user != null`
- `profile != null`
- `profile.onboarding_completed !== true`

Não bloquear por estado legado. Profile sem conclusão → modal abre.

## 6 steps do modal

| # | Step | Persiste em | Completo quando |
|---|------|-------------|-----------------|
| 0 | Welcome | — | Sempre |
| 1 | Company | `organizations.name` + `settings.segment` | `segment` preenchido |
| 2 | Pipeline | `pipelines` + `pipeline_stages` | Pipeline criado com stages |
| 3 | AI Copilot | `integration_configs` (`provider='anthropic'` ou `lovable_ai`) | Ativo |
| 4 | Email | `integration_configs` (`provider='resend'`) | Configurado com from_email |
| 5 | Slack | `integration_configs` (`provider='slack'`) | Configurado |
| 6 | Complete | `profiles.onboarding_completed=true` | Final |

`loadPersistedOnboardingState()` (`persistence.ts`) reconstrói `stepData` e `completedSteps` a partir do DB. `getResumeStep()` decide onde retomar.

## Backfill pós-remix (obrigatório)

Se houver usuários em `auth.users` sem profile (estado órfão), executar:

```sql
INSERT INTO public.profiles (id, email, name, onboarding_completed, onboarding_step)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name',
           u.raw_user_meta_data->>'name',
           split_part(u.email,'@',1)),
  false,
  1
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
```

E garantir `org_id` + `user_roles` para esses usuários (via `initialize_org_owner` ou insert manual).

## Anti-padrões

- ❌ Marcar `onboarding_completed=true` no trigger.
- ❌ Usar Supabase anonymous sign-up.
- ❌ Async/await direto em `onAuthStateChange`.
- ❌ Bloquear modal por flag local (`localStorage`).
- ❌ Permitir `/dashboard` carregar sem profile (sempre mostrar loader e tentar self-repair).
