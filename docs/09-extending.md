# 09 — Estendendo o projeto

Receitas para adicionar funcionalidade sem violar guardrails. Toda extensão segue SOLID + TDD do Workspace Knowledge.

## A. Nova entidade de domínio

Exemplo: adicionar `projects` (projetos vinculados a deals).

### 1. Migration

```sql
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_org ON public.projects(org_id);
CREATE INDEX idx_projects_deal ON public.projects(deal_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select" ON public.projects
FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "projects_write" ON public.projects
FOR ALL TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()))
WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

### 2. Tipos regenerados
Automático — `src/integrations/supabase/types.ts` é atualizado pelo Lovable Cloud.

### 3. Hook
```ts
// src/hooks/useProjects.ts
export function useProjects() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ['projects', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects').select('*').eq('org_id', orgId!);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}
```

### 4. Página + componentes
- `src/pages/Projects.tsx` (lazy em `App.tsx`).
- `src/components/crm/ProjectCreateModal.tsx`, `ProjectDrawer.tsx`.

### 5. Sidebar
Adicionar item em `AppSidebar.tsx` no grupo apropriado (Geral/Analytics/Admin).

### 6. Rota
```tsx
const Projects = lazy(() => import("./pages/Projects"));
// ...
<Route path="/projects" element={<SuspenseRoute><Projects /></SuspenseRoute>} />
```

### 7. Testes
- Unit: hooks (mock supabase).
- Integration: fluxo CRUD via RTL.

---

## B. Nova Edge Function

### 1. Criar arquivo
`supabase/functions/minha-funcao/index.ts` seguindo template do [07](./07-edge-functions.md).

### 2. config.toml (se público)
```toml
[functions.minha-funcao]
verify_jwt = false
```

### 3. Secrets
Se precisar de chave externa, `secrets--add_secret`.

### 4. Chamar do frontend
```ts
const { data, error } = await supabase.functions.invoke('minha-funcao', {
  body: { foo: 'bar' },
});
```

### 5. Testar
- `supabase--test_edge_functions` ou curl direto.
- Verificar logs com `supabase--edge_function_logs`.

---

## C. Nova integração externa

### 1. Registro em `integration_configs`
```ts
await supabase.from('integration_configs').insert({
  org_id,
  provider: 'meu_servico',
  config: { api_key: '***', endpoint: 'https://...' },
  is_active: true,
});
```

### 2. Edge `validate-meu_servico-key`
Faz request de health no provedor, retorna `{ valid: true | false, error? }`.

### 3. UI em `/settings/integrations`
- Input write-only para api_key (mostra `••••` se já configurado).
- Botão "Testar conexão" chama validador.

### 4. Consumo
Edge Functions internas leem `integration_configs` por `org_id` + `provider`.

---

## D. Novo step no Onboarding

### 1. Criar componente
`src/components/onboarding/MeuStep.tsx` implementando `OnboardingStepProps`.

### 2. Adicionar ao array de steps
`OnboardingModal.tsx`:
```ts
const steps = [
  { id: 'welcome', component: WelcomeStep, label: 'Boas-vindas' },
  // ...
  { id: 'meu_step', component: MeuStep, label: 'Meu Step' },
  { id: 'complete', component: CompleteStep, label: 'Pronto' },
];
```

### 3. Persistência
Em `persistence.ts`:
- Carregar estado prévio em `loadPersistedOnboardingState`.
- Adicionar ao `completedSteps.add('meu_step')` quando satisfeito.

### 4. Resume logic
Atualizar `getResumeStep` para considerar a posição do novo step.

### 5. Setup Wizard (`/setup`)
Espelhar o step em `src/components/setup/StepMeuStep.tsx` se aplicável.

---

## E. Nova role / permissão

### 1. Atualizar enum (se nova role)
```sql
ALTER TYPE public.app_role ADD VALUE 'analyst';
```

### 2. Atualizar `role_permissions`
Adicionar linhas com matriz de capacidades.

### 3. Helper no frontend
`hooks/useRole.ts` para checar capacidade granular.

### 4. UI em `/team`
Mostrar nova role no seletor.

---

## Checklist universal antes de mergear extensão

- [ ] Migration versionada criada (nunca editar applied).
- [ ] RLS habilitado + policies por `org_id`.
- [ ] Hook com `useQuery`/`useMutation` + invalidação correta.
- [ ] Componente < 150 linhas, função < 30 linhas.
- [ ] Sem `any` injustificado, sem cores hardcoded.
- [ ] Textos UI em PT-BR.
- [ ] Testes Vitest + RTL cobrindo comportamento observável.
- [ ] `supabase--linter` sem novos warnings.
- [ ] Memória atualizada (`mem://`) se a feature for permanente e estrutural.
