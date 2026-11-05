# Revisão e aprovação manual Revenda Mais — etapa 3.5.2

## Regressão real 3.5.2.2

No laboratório PostgreSQL 17, ReviewDiagnose reproduziu SQLSTATE 42846:
`cannot cast type record to public.revendamais_lead_receipts`, com detalhe
`Input has too many columns`. O representante vinha do CTE keyed, contendo
também a coluna calculada g, mas scope_conflict exige o composto da tabela.
A correção conserva `r AS receipt_row` no CTE e passa somente esse valor tipado
ao helper. Não muda a identidade do grupo nem grants/RLS.

ReviewDiagnose é restrito ao laboratório vazio validado e revela o erro original
somente durante a fixture sintética, em transação revertida. ReviewRegression
extrai apenas a RPC de listagem do arquivo local corrigido e a substitui
temporariamente, executa a fixture completa e faz rollback. Nenhuma dessas
ações aplica novamente a migration inteira ou mantém instrumentação no banco.
ReviewRegression passou com ROLLBACK, incluindo aprovação, conflitos, contador,
paginação, permissões e falhas transacionais. Não substitui um novo ciclo integral
da 0012 em laboratório limpo. O laboratório existente volta à versão anterior da
função após o rollback; ReviewTests normal só deve ser repetido após reconstrução.
ReviewConcurrency não foi executado nesta correção.

Implementação local preparada. A migration 0012 não foi executada; a 0011 homologada permanece intacta. Não habilita ingestão nem criação automática. Homologação PostgreSQL e permissões ainda são obrigatórias.

## Contrato público

Somente JWT de usuário `authenticated`, membro owner/admin/member da Alencar Motors em `public.user_roles`. Não usa `profiles.org_id`. A organização é resolvida por `main_org_id()`, validando organização única e nome. Nenhum parâmetro seleciona organização, vendedor, etapa ou permissões.

`get_pending_revendamais_leads(p_limit integer = 50, p_offset integer = 0) -> jsonb`

- Limite 1–100; offset 0–100000. Retorna `{total, items}`; total conta grupos pendentes, não recibos, na mesma fotografia SQL da página.
- Item: `receipt_id`, `name`, `phone`, `email`, `title`, `portal`, `channel_name`, `source_created_at`, `received_at`, `attempt_count`, `identity_status`, `approval_blocker`. Ausências são null. A data original permanece texto sem timezone inferido; received_at é o recebimento real pelo servidor.
- Não retorna digests, chave do grupo, IDs do fornecedor, texto desconhecido ou primeira mensagem sem evidência de autoria. receipt_id é necessário para aprovar.
- Bloqueios preliminares: processed_group_conflict, retry_scope_conflict, review_expired, insufficient_contact. A aprovação também verifica contato, pipeline e etapa; a listagem não garante aprovação posterior.

`approve_revendamais_lead(p_receipt_id uuid) -> jsonb`

- `{status: "approved" | "already_processed", contact_id, deal_id}`.
- `{status: "conflict", code}`: processed_group_conflict, processed_links_missing, retry_scope_conflict, review_expired, insufficient_contact, ambiguous_contact, missing_name, pipeline_not_unique, stage_not_unique.
- Erros SQL sanitizados: 42501 forbidden; P0002 receipt_not_found (também para ID fora da organização); 22023 invalid_receipt; 40001 review_retry_required; 57014 review_timeout; P0001 review_operation_failed. Repetir erros transitórios exige nova chamada; sucesso depende do commit da requisição RPC.
- Listagem: 42501 forbidden, 22023 invalid_pagination ou P0001 review_query_failed. Respostas recebem Cache-Control: no-store; a interface futura deve evitar cache persistente de dados pessoais.

DTOs em `src/integrations/revendamais-review-contract.ts`. Não há implementação de interface nem alteração nos tipos gerados do Supabase; regenerá-los somente após homologar o schema.

## Grupo e concorrência

A mesma função privada calcula o grupo na listagem, no contador e na aprovação. Só agrupa identidade de retry consistente: organização + integrador + dealer + retry_lead_id unânime no array + digest comercial compatível. Não usa telefone, mensagem ou o id da tentativa como identidade. Ausência/ambiguidade/conflito gera grupo individual; qualquer divergência comercial no mesmo escopo impede nova conversão. O filtro `retry_relation <> automatic_resend` e os encadeamentos de possible_related_receipt_id não definem grupos.

A aprovação adquire o mutex organizacional usado pela ingestão 0011, carrega o recibo autorizado, recalcula o grupo e bloqueia seus membros antes de consultar o resultado. Uma tabela privada `revendamais_review_approvals`, com chave única organização/grupo, mantém o resultado mesmo se o recibo representante for eliminado pela retenção. Não duplica dados pessoais. Vínculos processados conflitantes ou ausentes bloqueiam reconciliação.

Retries tardios de grupo já aprovado não aparecem como novas pendências; uma aprovação repetida retorna already_processed e sincroniza os recibos então presentes. Sem alterar a ingestão 0011, esses retries podem estar fisicamente em status review até essa reconciliação, sujeitos à retenção existente. Cada entrega continua sendo recibo separado.

O lock SHARE ROW EXCLUSIVE/NOWAIT em contacts é mantido somente durante a aprovação: escritores atuais da interface não participam do mutex e não existe unicidade normalizada de telefone/email. Evita corrida de criação de contato, mas pode causar contenção global; conflito de lock retorna erro transitório. Não trocar por mero advisory lock sem proteger também os outros escritores. Pipeline/etapa e associação de usuário são bloqueados para leitura durante a transação.

## Conversão e segurança

Contato reutilizado apenas com um candidato por telefone/email normalizado e sem divergência nos demais canais informados. Múltiplos candidatos retornam conflito sem escrita. Completa somente canais vazios; não sobrescreve nome nem proprietário existente. Contato novo requer nome e pelo menos um canal. Novo interesse de outro grupo pode reutilizar contato e criar outro negócio.

Negócio: pipeline único Venda PF, etapa única Lead, owner auth.uid(), BRL, valor zero, vehicle_id null. Configuração ausente/duplicada gera conflito antes das escritas. Portal confiável e metadados continuam no recibo associado ao negócio, sem inventar campos comerciais redundantes. Texto auxiliar não vira origem.

A 0011 não possui evidência persistida suficiente para provar autoria/autorizar uma nota com firstMessage. Nesta versão nenhuma atividade é criada: texto desconhecido nunca é apresentado como mensagem do cliente. Canal, data original, portal e política existente do texto auxiliar permanecem nos recibos; review_lead é limpo ao processar conforme o contrato 0011. Futuras notas exigem contrato explícito de autoria/retenção.

As duas RPCs usam SECURITY DEFINER e search_path vazio, apenas SQL estático e grants EXECUTE para authenticated. Helpers e tabelas brutas/ledger não são acessíveis por anon/authenticated/service_role. Não há RLS permissiva nova nem logs adicionados. Aplicar com proprietário confiável; revisar privilégios efetivos/herdados no ambiente alvo. Escritas de contato, negócio, ledger e recibos são uma transação; falhas levantam erro sanitizado e desfazem efeitos.

## Risco de retenção não alterado

`revendamais_purge_expired_reviews()` da 0011 elimina revisões expiradas, inclusive leads comerciais nunca aprovados. A listagem mostra revisões expiradas ainda presentes, mas bloqueia sua aprovação. Antes de uso operacional é necessária decisão autorizada sobre preservação/expiração dessas pendências e agendamento da limpeza. Esta etapa não altera prazo, purge nem aprovação de retenção de texto pessoal. O ledger impede recriação de negócio aprovado; não recupera um lead pendente apagado pelo purge.

## Homologação futura, exclusivamente laboratório

Não executada nesta etapa. Usar banco Docker descartável limpo; Concurrency anterior deixa fixtures persistentes, portanto não reutilizar esse estado como se estivesse vazio. O runner recusa container não identificado, contexto remoto, URL externa e base operacional; não lê .env do CRM.

```powershell
# Após descartar/recriar conscientemente apenas o laboratório identificado:
.\tests\postgres\lab\Lab.ps1 -Action Start
.\tests\postgres\lab\Lab.ps1 -Action Bootstrap
.\tests\postgres\lab\Lab.ps1 -Action Migrate
.\tests\postgres\lab\Lab.ps1 -Action Verify
.\tests\postgres\lab\Lab.ps1 -Action SqlTests
.\tests\postgres\lab\Lab.ps1 -Action ReviewSetup
.\tests\postgres\lab\Lab.ps1 -Action ReviewMigrate
.\tests\postgres\lab\Lab.ps1 -Action ReviewVerify
.\tests\postgres\lab\Lab.ps1 -Action ReviewTests
# Somente após todos os anteriores aprovados; deixa fixtures no laboratório:
.\tests\postgres\lab\Lab.ps1 -Action ReviewConcurrency
.\tests\postgres\lab\Lab.ps1 -Action Destroy
```

ReviewSetup reproduz apenas dependências que o bootstrap mínimo 0011 não tinha: auth.uid, usuários/papéis sintéticos, pipelines/etapas, valor e FKs. Não é migration operacional. ReviewTests usa dados fictícios e rollback; ReviewConcurrency usa transações reais concorrentes no banco descartável. Testes Node de contrato são verificações estáticas e de isolamento do harness, não comprovam execução SQL. Não instalar dependências nem executar automaticamente estes comandos.
