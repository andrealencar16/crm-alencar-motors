# Etapa 3.3 — persistência preparada, não aplicada

> Histórico da persistência. A conexão de código local com o endpoint foi feita
> na etapa 3.4, sem execução desta migration. Ver `17-revendamais-http-persistence.md`.

## Fontes locais e limites da investigação

Inspecionados `.lovable/consolidated_schema.sql`, tipos gerados Supabase,
migrations Drizzle, UI de contatos/negócios e lead.ts/processing.ts. Encontrado
agora o DDL inicial: corrige a limitação da investigação anterior que não havia
localizado esse arquivo. O consolidado é base histórica, não retrato remoto.

Contacts: id default UUID, org_id e first_name NOT NULL; phone/email/last_name,
company_id/owner_id opcionais; status default lead. Deals: id default UUID,
org_id/title NOT NULL; contact_id/vehicle_id/stage_id/owner_id opcionais conforme
tipos atuais; status open, currency BRL. Activities: org_id/type/title NOT NULL,
body/contact_id/deal_id/user_id opcionais; type aceita note. Org exige nome/slug;
user_roles tem user_id/org_id/role e UNIQUE(user_id,org_id), sendo a autoridade
de membership. `main_org_id()` é definido na migration 0003.

O consolidado contém triggers de updated_at em contacts/deals; nenhuma automação
de criação dessas entidades foi localizada nele. Há audit_logs e tabelas de
automação, mas não campos dedicados de origem/ID externo em contacts/deals.
Outros triggers/defaults/constraints remotos precisam de inspeção autorizada.
Não utilizar as funções antigas de autorização por profiles do consolidado:
as migrations posteriores migram autoridade para user_roles.

## Migration e autorização

`drizzle/migrations/0011_revendamais_lead_receipts.sql`, registrada no journal,
segue o diretório definido em drizzle.config.ts. Não foi gerado snapshot com
ferramenta nem executada migration. Nenhuma tabela existente foi alterada.

Tabela revendamais_lead_receipts com UUID, org_id, provider fixo revendamais,
portal/ID externo opcionais, identity_confirmed, status processed/review,
vínculos de contato/negócio, received_at/processed_at, motivo sanitizado, digest
restrito e conteúdo mínimo temporário de revisão. RLS habilitada SEM políticas;
REVOKE de todo acesso direto para anon/authenticated/service_role/PUBLIC.
Índice de ID externo não é UNIQUE: semântica de identidade do fornecedor ainda
não foi confirmada. Nada é criado em api_keys/stock_api_keys.

RPC revendamais_commit_lead(jsonb,boolean) SECURITY DEFINER, search_path vazio,
EXECUTE exclusivo de service_role e verificação de auth.role(). Essa função é
exclusivamente backend: autenticação própria do webhook NÃO habilita chamada
SQL para anon. Somente em etapa futura o endpoint autenticado poderá utilizar
cliente server-only com service credential, que jamais deve chegar ao browser.
Service role é privilégio amplo: o adapter chama apenas uma RPC fixa, mas não
transforma essa credencial em uma credencial restrita no restante do Supabase.

RPC não recebe org_id, ator, permissões, contato, negócio, proprietário ou etapa.
Rejeita campos desconhecidos e valida novamente tipos, limites e canais
normalizados. Resolve main_org_id() e exige uma única organização com nome
Alencar Motors; falha fechada se o cadastro divergir. Não cria organizações.

## Uma transação

Uma chamada RPC é uma única transação: matching, eventual contato novo, negócio,
nota e recibo. Nenhuma sequência de inserts por REST. Erros não são capturados
para continuar: qualquer falha, inclusive recibo final, reverte todas as escritas.
Por isso um erro não gera recibo de falha na mesma transação; a entrega deve ser
reenviada. Um ledger externo de falhas, se necessário, exige decisão posterior,
sem inserir payload/erros crus nos logs. Recibos de revisão registram motivos
fixos, nunca mensagens arbitrárias de exceções.

Chamadas são serializadas por advisory lock da organização. Matching automático
também obtém SHARE ROW EXCLUSIVE em contacts para coordenar com INSERT/UPDATE da
UI. É uma escolha conservadora para organização única: bloqueia escritas nessa
tabela durante a transação e pode reduzir throughput. Espera de lock limitada
a três segundos; confirmar impacto, deadlocks e volume em testes reais. Não há
constraint UNIQUE de telefone/email. A UI ainda pode criar duplicatas depois
da transação: a RPC evita corrida durante sua operação, não corrige todo o CRM.

Correspondência por telefone BR normalizado ou email case-insensitive dentro da
org. Mais de um candidato ou canais conflitantes -> revisão. Nome sozinho não
identifica pessoa. Um contato inequívoco é reutilizado e recebe apenas canais
ausentes, sem sobrescrever canais existentes. Novo contato requer nome e pelo
menos um canal. Sem nome, contato já existente pode ser reutilizado. Nome
completo vai em first_name; last_name null, owner_id null.

Novo interesse cria negócio open, BRL, contact_id resolvido, vehicle_id null,
stage_id/owner_id null. Mensagem não vazia cria activity note com vínculo aos
dois registros, título fixo e body. Sem mensagem, não cria nota vazia.
Etapa e distribuição comercial são decisões pendentes: negócios com etapa null
podem não aparecer no Kanban esperado. Não escolher etapa arbitrária para isso.

## Identidade e recuperação

Sem ID confiável: cada entrega gera revisão persistida e não cria CRM. ID
opcional é preservado, nunca inventado. Nenhum hash é tratado como ID do evento.

O adapter persistence.ts recebe RPC injetada e tem externalIdentityConfirmed
false por padrão. Para permitir criação, essa política e a do processador devem
estar explicitamente habilitadas no servidor DEPOIS da confirmação do escopo e
estabilidade de IDs pelo fornecedor. Hoje devem permanecer false.

Com ID confiável: lock serializa consulta dos recibos e gravação. Mesmo ID e
mesmo conteúdo retornam duplicate com IDs existentes; outro ID do mesmo cliente
gera novo negócio. ID igual com conteúdo divergente gera revisão, sem alterar o
CRM. Revisão prévia idêntica é reutilizada. Sem ID, entregas semelhantes não são
silenciosamente descartadas. Digest SHA-256 dos campos canônicos é restrito e
nunca devolvido: é dado derivado pessoal, não anonimização. Não é credencial.
Vínculos apagados resultam em revisão, não recriação automática de históricos.

Revisão armazena somente nome, telefone, email, título e mensagem normalizados
necessários para resolver contato/recuperar o interesse; portal/ID ficam nas
colunas do recibo. Não guarda HTTP bruto, headers, URL ou segredo. Processados
não duplicam nome, canais ou mensagem; estes permanecem em contato/atividade.
Revisão tem vencimento de 30 dias proposto. RPC service-only
revendamais_purge_expired_reviews remove recibos vencidos; não há cron instalado.
Definir job, alertas antes do vencimento, aprovação da retenção, backups e
processo humano antes da ativação. Após expirar pode não ser possível recuperar
o lead; não prolongar retenção por ausência de processo operacional. Retenção
dos metadados processados/digest precisa de aprovação específica (a idempotência
deixa de reconhecer eventos removidos). Não há interface pública de revisão ou
RPC de liberação ainda; não disponibilizar SELECT amplo para contornar isso.

## Adapter e HTTP

Adapter chama somente revendamais_commit_lead e retorna campos conhecidos com
UUIDs válidos. Erros SQL/rede e replies inválidos viram lead_persistence_failed;
processing.ts converte falha em retry. Não há retries automáticos ocultos.
Resposta perdida após commit exige reenvio idempotente, não insert manual.

index.ts/handler.ts não foram conectados à persistência. Autenticação, 64 KiB,
timeout de leitura e 503 ingestion_not_enabled permanecem. Antes de conectar,
configurar prazo total HTTP/PostgREST e cancelamento; SET statement_timeout na
função NÃO substitui timeout efetivo configurado no papel/sessão de entrada.
Timeout não comprova rollback remoto: consultar resultado por identidade.
Sucesso HTTP só após commit ou revisão durável. Política de retry do provedor
continua desconhecida. Não ativar alerta real nem somente confiar no 503.

## Testes

Executáveis localmente sem PostgreSQL:
`node --test tests/revendamais-persistence.test.ts tests/revendamais-processing.test.ts tests/revendamais-leads.test.ts tests/stock-api.test.ts tests/stock-key-admin.test.ts`

Mocks verificam uma RPC, allowlist, política desligada por padrão, sanitização e
retry. Teste estático lê SQL; não comprova sintaxe, privilégios ou atomicidade.

Preparados, NÃO executados:
- tests/postgres/revendamais-leads.test.sql: exige banco descartável com nome
  exato revendamais_leads_test, schema e migration previamente aplicados e CRM
  vazio; roda em transação com ROLLBACK. Injeta falhas por triggers temporários
  da fixture em contato, negócio, atividade e recibo, verificando rollback;
  cobre reutilização, novo interesse, duplicata, revisão, complemento e ACL.
- tests/postgres/revendamais-concurrency.mjs: duas sessões reais, opt-in explícito
  REVENDAMAIS_TEST_DISPOSABLE=YES e REVENDAMAIS_TEST_DATABASE_URL apontando ao
  banco de nome exato. Requer driver postgres já instalado. COMMIT de fixtures
  fictícias nesse banco descartável; exige tabelas vazias, confere um contato,
  negócio/nota/recibo após entrega concorrente e orienta destruir banco depois.
  Nunca usar URL de produção. Não imprime URL nem dados pessoais.

Executar esses testes requer autorização posterior para SQL local e preparação
de clone descartável. Nenhum SQL, migration, operação remota ou instalação foi
executado nesta etapa. Verificações adicionais pendentes: resultado perdido após
commit, concorrência com UI, lock_timeout/deadlock, purge e fixtures do schema
real. PostgreSQL real é pré-requisito de aprovação, não substituído pelos mocks.

## Bloqueios para ativação

Contrato HTTP e adapter oficial; confirmação de ID/portal e política de retry;
testes PostgreSQL reais; revisão/aplicação da migration no schema validado;
revisão da propriedade da função/ACL e do uso server-only de service role;
aprovação da retenção e processo de revisão/liberação; etapa comercial padrão;
configuração de prazos, proteção de volume e querystrings na infraestrutura.
Não usar public-api como bypass, não buscar URLs do payload e não integrar Nina.
