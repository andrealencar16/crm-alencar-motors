# Stock API — credenciais administrativas (correção local)

Estado: arquivos preparados, sem SQL/migration/deploy executados. Não existem
endpoints de catálogo/imagens nesta entrega. public-api, api_keys, vehicles e
Storage não são modificados.

## Identidade: contexto de usuário, sem service role

A Edge Function usa SUPABASE_ANON_KEY como identificação do projeto e encaminha
`Authorization: Bearer <JWT original>` tanto para Auth.getUser quanto para RPCs.
O adapter user-backend.ts torna esse encaminhamento testável. Não há segredo ou
cliente service-role. O PostgreSQL deriva identidade por auth.uid() e exige
auth.role()='authenticated'. Não existe p_actor nem parâmetro org_id.

Os papéis owner/admin/member são comprovados pelo enum no SQL consolidado. As
associações vêm exclusivamente de user_roles, conforme AGENTS.md e migration 0003.
O CRM é de organização única: cada operação usa public.main_org_id(), a mesma
função da migration 0003 usada pela gestão existente de usuários. Nenhum UUID é
fixado, nenhuma organização é selecionada pelo cliente. Só vale o vínculo
owner/admin nessa organização; ausência de vínculo ou papel member é negada.
Não há contagem de associações nem suporte multi-tenant. Não se interpretam
papéis em user_metadata ou profiles.

main_org_id() atualmente escolhe a organização mais antiga. Antes de aplicar,
confirmar que há uma única organização, Alencar Motors, e que a função a resolve
corretamente. Se o ambiente não corresponder, interromper a aplicação e reconciliar
os dados com autorização separada. Não renomeamos organizações, não mudamos essa
função e não alteramos os fluxos de usuários para contornar divergências.

SECURITY DEFINER muda os privilégios de execução, não o sub nas claims verificadas
pelo PostgREST. Com authenticated, EXECUTE é concedido somente a criar/listar/
revogar; os helpers continuam privados e a tabela não tem grants diretos nem
policies de navegador. O dono das funções deve ser confiável e possuir privilégios
para tabelas, locks, auditoria e criptografia. search_path vazio, referências
qualificadas. anon/service_role não recebem EXECUTE.

Isso é uma garantia do desenho SQL, ainda NÃO demonstrada num banco real. O
PostgREST precisa validar o JWT e instalar suas claims; fixtures SQL de teste só
emulam esse contexto privilegiadamente. Não podem ser consideradas prova da
verificação de assinatura/expiração do gateway.

## Chamadas diretas e geração no servidor PostgreSQL

Administradores autenticados podem chamar as RPCs diretamente. Não é uma falha:
elas aplicam integralmente autorização, geração, cotas e auditoria no banco.
member/anon não podem criar. Nenhuma RPC aceita segredo, hash, prefixo, criador,
organização ou escopos. Não existe caminho para cadastrar um hash escolhido.

A geração saiu da Edge Function e foi para o servidor PostgreSQL. A RPC de
criação recebe somente p_name; gera 32 bytes via pgcrypto, codifica base64url com
stk_, persiste SHA-256 e retorna o segredo UMA vez. A Edge revalida o formato da
resposta e só devolve metadados explicitamente selecionados.

PRÉ-REQUISITO NÃO VERIFICADO: extensions.gen_random_bytes(integer) e
extensions.digest(bytea,text). A migration faz preflight e falha se ausentes.
Não instala nem move extensão e não oferece aleatoriedade alternativa. Se
pgcrypto estiver em outro schema, revisar e aprovar a qualificação antes de
aplicar. Este é um bloqueio real de prontidão, não uma suposição de instalação.

O segredo é variável transitória da RPC/resposta, nunca coluna, argumento de
entrada ou evento de auditoria. Não há logging explícito de JWT, segredo ou hash.
Precisam ser verificadas as configurações externas de logs/APM e triggers
genéricos para evitar captura da resposta ou cópia de hashes.

## Concorrência, quotas e atomicidade

O lock global foi removido. Cada operação executa FOR SHARE apenas no vínculo
owner/admin do usuário autenticado na organização principal. Isso mantém o papel
estável até o fim da transação, impedindo rebaixamento/remoção concorrente daquele
vínculo. Se a alteração ocorrer primeiro, a autorização observa o novo estado e
nega acesso. A unicidade existente (user_id, org_id) impede outro papel para a
mesma associação. Não é necessário bloquear inserções de outros usuários, nem
contar vínculos externos. Linhas de outros usuários continuam alteráveis.

Criação também bloqueia a linha da organização para serializar quotas: no máximo
20 chaves ativas e 10 criações na última hora para Alencar Motors, incluindo chaves
posteriormente revogadas. Limites iniciais locais, a revisar antes de publicar.
Chamadas diretas também ficam sujeitas a esses limites. Excesso retorna P0429,
mapeado para HTTP 429. Não substitui rate limiting distribuído de tráfego.

lock_timeout de 3 segundos evita espera indefinida por locks. Reavaliar contenção
em teste concorrente real. A Edge tem deadline de 10 segundos para Auth, corpo e
RPC, propagando AbortSignal ao fetch; corpo máximo 4096 bytes. Abortar o HTTP não
garante desfazer uma transação já confirmada: após resposta perdida, listar e
revogar a chave sem tentar recuperar o segredo.

Criação/revogação e audit_logs são atômicos na mesma RPC. Falha de auditoria faz
rollback. Revogação usa FOR UPDATE na chave e é idempotente. Trigger impede
reativação e mutação de identidade, organização, hash, escopo e proveniência.
Não há rename/delete/reactivate. created_by/revoked_by são UUIDs históricos sem
FK Auth, preservados na exclusão da conta. last_used_at continua reservado/nulo.

## Contrato HTTP

POST JSON com JWT de usuário; OPTIONS preflight. Exemplos:

```json
{"action":"create","name":"Site institucional"}
```

201: `{ "data": <metadados>, "secret": <segredo gerado no banco> }`.

```json
{"action":"list","page":1,"limit":20}
```

200: `{ "data": [...], "pagination": {"page":1,"limit":20} }`.
Página 1..10000 e limite 1..100, ordem created_at DESC/id ASC. Sem hash/segredo.

```json
{"action":"revoke","id":"UUID-da-chave"}
```

200 com metadados; chave não encontrada no estoque de credenciais do CRM retorna 404.
Parâmetros extras e querystring são rejeitados. Respostas no-store.
401 JWT inválido/expirado ou ausente; 403 autorização negada; 400 entrada inválida;
405 método; 413 tamanho; 415 tipo; 429 cota; 503 lock indisponível/cancelamento SQL;
504 deadline; 500 falha interna. Não expor diagnósticos do banco.

CORS: STOCK_KEY_ADMIN_ALLOWED_ORIGINS contém origens exatas separadas por vírgula.
Sem configuração, requisições com Origin são negadas. Sem Origin ainda exige JWT
e autorização integral no banco. CORS não protege acesso direto às RPCs, que
continuam seguras por seus próprios controles. Configuração JWT do gateway e
nomes de variáveis devem ser testados; nenhum config.toml foi alterado.

## Testes automatizados locais

`npm test` agora executa test:stock-keys e depois test:ui (Vitest existente).
`npm run test:stock-keys` usa Node 24, sem instalar dependências.

Testes Node usam fixtures públicas e mocks de Auth/RPC. Cobrem encaminhamento de
JWT, ausência de p_actor/hash nas chamadas, JWT inválido/expirado simulado,
autorização negada para member/sem vínculo, revogação, campos privados, timeout,
cotas e entradas. NÃO executam PostgreSQL, validam assinaturas reais nem
certificam RLS. Verificações de SQL são estáticas. Node --check não substitui
deno check ou resolução do import HTTPS.

## Testes PostgreSQL preparados, NÃO EXECUTADOS

`tests/postgres/stock-api-keys.test.sql` contém testes transacionais reais de
grants, RPCs diretas, owner/admin/member, ausência de vínculo, forja de actor/hash,
hash persistido, auditoria com rollback e revogação irreversível. Não cria outra
organização: reutiliza main_org_id(). Exige banco com nome EXATAMENTE
stock_keys_test, schema Supabase equivalente, uma única organização Alencar Motors
pré-provisionada, credenciais vazias, migration aplicada e execução como dono
confiável. A verificação do nome não usa LIKE/coringas e não substitui conferir o
destino e autorizar o ambiente. Assertivas usam IS DISTINCT FROM para falhar com
valores ausentes/nulos. Termina com ROLLBACK. Nunca executar em produção. A suite
é opt-in; npm test NÃO a executa.

Ainda preparar/executar teste multissessão em ambiente isolado autorizado:

1. Sessão A abre transação, define claims verificadas de admin e chama listagem;
   sem commit, B tenta rebaixar/remover esse mesmo vínculo e deve aguardar. Inserir
   ou alterar vínculo de OUTRO usuário não deve aguardar o lock de autorização.
2. A confirma; B confirma a alteração; próxima chamada deve refletir o novo papel
   ou negar member/sem vínculo. Repetir com B alterando primeiro.
3. Duas revogações concorrentes: somente um evento update, metadados iguais.
4. Onze criações concorrentes: no máximo dez confirmações/hora para o CRM,
   sem segredo em saídas de teste.
5. Forçar lock >3s e validar rollback/503; simular resposta perdida após commit.

## Bloqueios antes de migration/deploy

- Confirmar que main_org_id() resolve a única organização Alencar Motors.
- Confirmar extensão/schema criptográfico e privilégios do proprietário.
- Confirmar schema real de user_roles, audit_logs, RLS/grants, triggers e histórico
  de migrations; snapshot vazio segue convenção, não é schema autoritativo.
- Executar testes PostgreSQL e concorrentes; testar JWT real e contexto
  authenticated no gateway, inclusive rejeição de anon/service_role/member.
- Type-check Deno, dependência HTTPS, CORS, observabilidade e rate limiting.
- Rodar suite UI existente quando dependências estiverem disponíveis, sem instalar
  nada automaticamente. Novo componente UI ainda não foi implementado.

Somente a migration local NÃO APLICADA foi corrigida. Se surgir evidência de que
a versão antiga foi aplicada em qualquer ambiente, não reutilizar este arquivo:
preparar outra migration para remover assinaturas antigas/grants após autorização.
Nenhuma operação remota, SQL ou geração de credencial real é realizada pelos
testes Node. Endpoints de veículos/imagens permanecem fora do escopo.
