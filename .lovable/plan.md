## Plano

Usuário encontrado: **Tiago Della Nina** (`dellanina@teste.com`), atualmente com role `member` na org `70b877c5-d5ca-402d-b58f-baa5ec7fa1c2`.

### Ação
Atualizar `public.user_roles` para definir `role = 'owner'` no registro do Tiago nessa org.

```sql
UPDATE public.user_roles
SET role = 'owner'
WHERE user_id = 'e2855a65-b0a3-46a1-acf8-0f0b6749c973'
  AND org_id = '70b877c5-d5ca-402d-b58f-baa5ec7fa1c2';
```

### Normalizações
- `profiles.org_id` já está corretamente preenchido — sem ajuste necessário.
- Não removerei outros owners existentes (uma org pode ter múltiplos owners no schema atual). Se quiser que ele seja o **único** owner, me avise e eu rebaixo os demais para `admin`.

### Verificação pós-execução
Re-consultar `user_roles` para confirmar `role = 'owner'`.