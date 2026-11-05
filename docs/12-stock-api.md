# Stock API de veículos — etapa 2.2B.2

Implementação local, sem migration/SQL/deploy executados. Depende da 0009, ainda
não validada em PostgreSQL. Não altera public-api, api_keys, veículos nem Storage.

## Acesso controlado ao banco

A 0009 revoga acesso direto a stock_api_keys, inclusive de service_role; suas RPCs
administrativas exigem Auth JWT. Elas NÃO servem para autenticar um consumidor de
estoque. A proposta 0010 adiciona uma única RPC `stock_catalog_read`, SECURITY
DEFINER, search_path vazio, sem SQL dinâmico. Somente anon recebe EXECUTE; não há
grants em tabelas nem novas policies de veículos. Proprietário confiável da
migration deve poder consultar stock_api_keys/vehicles e executar main_org_id().
Isso precisa ser validado; não se pressupõe bypass acidental de RLS.

A Edge usa a chave ANON do projeto para chamar essa RPC e nunca usa service role.
O Bearer stk_ NÃO é encaminhado ao PostgREST como JWT: a Edge calcula SHA-256 e
envia somente o hash. A RPC autentica exclusivamente em stock_api_keys, exige
is_active=true, revoked_at nulo e escopo exatamente [stock:read]. Organização vem
da chave e deve corresponder a main_org_id(), a organização operacional existente.
Não há org_id na entrada, seleção de organização ou suporte multi-tenant.

A RPC é invocável diretamente por quem tenha acesso à API anônima do projeto,
mas autentica todas as chamadas por hash e repete validação de filtros, limites,
publicação e projeção. Conhecer um hash válido equivale a uma credencial nessa
interface: nunca registrar hashes, parâmetros RPC ou Authorization em logs/APM.
Não se retorna hash, ID da chave ou organização. A função é VOLATILE para restringir
invocações PostgREST a POST e evitar credenciais em URLs; isso precisa de teste
real no gateway. Não contém DML: somente consultas e configuração transacional
de Cache-Control no-store. Não atualiza last_used_at ou contadores.

Revogação bloqueia requisições subsequentes após commit. Não cancela bytes já
entregues nem promete eliminar uma consulta em curso. Deadline HTTP não garante
cancelamento/rollback no banco; testar statement_timeout do papel/gateway.

## Rotas e contrato

Base lógica /stock-api/v1, com prefixo externo /functions/v1 no Supabase.

- GET /vehicles: `{data: [...], pagination: {page, limit, has_more}}`.
- GET /vehicles/:id: `{data: <veículo>}`.
- GET /vehicles/:id/photos: `{data: {vehicle_id, fotos: [...]}}`.
- OPTIONS nas rotas reconhecidas: 204, sem dados ou consulta ao banco.
- POST/PUT/PATCH/DELETE/HEAD e outros métodos: 405. Rotas não existentes: 404.
- Não há rota /images/:token nem sincronização incremental.

Autorização: `Authorization: Bearer <stk_...>` com formato de 32 bytes base64url.
Credenciais CRM/fc_ não são aceitas. Erros têm `{error:{code,message,request_id}}`;
401 chave ausente/inválida/revogada, 403 escopo/origem negados, 400 query inválida,
404 recurso ausente/inacessível/indisponível, 405 método, 429 limite externo,
500 erro inesperado, 503 dependência indisponível/deadline. Nenhum diagnóstico SQL
é enviado pela Edge. Erros de chamadas diretas ao PostgREST devem ser auditados
em ambiente isolado também.

## Projeção e disponibilidade

Somente disponível no banco (`status='disponivel'`) em lista, detalhe e fotos.
Toda consulta usa org_id da chave, inclusive lookup por ID. SQL usa colunas fixas,
sem SELECT *. O DTO da Edge também constrói campos explicitamente:

id, marca, modelo, versao, ano_fabricacao, ano_modelo, km, cor, combustivel,
transmissao, preco_venda, descricao, opcionais, accepts_trade, accepts_financing,
fotos, status, updated_at.

Preço de custo, notas internas, placa/chassi/RENAVAM, owner/org/deal, FIPE e data
de entrada não são selecionados nem serializados. org_id só aparece em predicado
interno, não no DTO. Nenhuma expansão arbitrária de relacionamentos/campos.

## Query

marca: igualdade sem distinção de caixa; modelo: substring literal sem distinção
de caixa (SQL strpos/lower, % e _ não são curingas). Textos trim, 1..100 caracteres,
sem controles. Ano-modelo: ano_min/max inteiros 1..9999, inclusivos. Preços:
preco_min/max não negativos, até duas casas, menores que 10^12, inclusivos.
combustivel/transmissao seguem os domínios declarados nos tipos automotivos locais.
Rejeitam-se parâmetros desconhecidos/repetidos, vazios inválidos, intervalos
invertidos e querystring em detalhe/fotos.

page=1 e limit=20 por padrão, limite 1..100. Offset máximo 10000 como proteção
operacional desta proposta; exceder retorna 400. Não há total; SQL busca limit+1.
Página além do fim: 200 com array vazio/has_more=false.

sort: preco_asc, preco_desc, ano_desc ou recentes (padrão). Nulos por último e
desempate id ASC. Paginação por offset não é snapshot nem sincronização confiável.

## Fotos provisórias: privacidade NÃO comprovada

fotos contém as URLs EXISTENTES, preservando exatamente sua ordem; primeira é a
capa. Não existem tokens, proxy, redirecionamento ou alteração no upload/limpeza.
O código existente usa getPublicUrl; documentação antiga chama o bucket de público,
mas a configuração real do vehicle-photos NÃO foi verificada.

Se o bucket for público, URLs diretas podem revelar caminhos e UUID da organização
e continuar acessíveis depois de venda, retirada do catálogo ou revogação da chave.
O 404 do endpoint /photos não revoga URLs já obtidas. Se o bucket for privado, as
URLs públicas atuais podem não funcionar. Não se presume privacidade nem
revogação de imagens. Confirmar a visibilidade e aprovar essa limitação antes de
qualquer integração externa. Gateway continua reservado para outra etapa.

## Configuração local preparada (não aplicada)

`[functions.stock-api] verify_jwt=false` é necessário porque o Bearer é opaco,
não Auth JWT. Autenticação obrigatória permanece no handler/RPC. Não muda a
configuração de public-api ou da função administrativa.

STOCK_API_ALLOWED_ORIGINS: origens exatas separadas por vírgula; vazio nega browsers
com Origin. Server-to-server sem Origin exige a mesma chave. CORS não é autorização.
Não embutir segredo em bundle de site público; usar backend do site.
SUPABASE_URL e SUPABASE_ANON_KEY seguem os nomes usados no projeto. Não foram lidos
valores nem criadas variáveis nesta tarefa. Validar chave anônima/JWT automático
do SDK e grants da RPC no ambiente isolado.

## Testes e bloqueios

`npm run test:stock-api` e `npm run test:stock-keys` usam Node 24, sem dependências
adicionais. npm test inclui as duas suites antes do Vitest da UI. Mocks não provam
PostgreSQL, RLS, ordenação/collation real ou gateway. O teste SQL é estático.

Antes de migration/deploy, mediante aprovação separada:

1. Preparar banco descartável compatível: bootstrap ainda incompleto no checkout,
   Docker/Supabase CLI indisponíveis na última inspeção, 0009 não validada.
2. Validar a 0010 com tipos reais das colunas, pgcrypto/0009 e proprietário. Provar
   que anon só executa a RPC e não lê tabelas/hashes; CRM JWT não substitui stock key.
3. Testar chamadas diretas e Edge: chaves inválidas/revogadas, escopos, organização
   operacional, status, campos proibidos, preços nulos/empates, filtros literais,
   páginas e alteração concorrente de disponibilidade.
4. Configurar/testar limites distribuídos de tráfego, consultas e banda. Nesta
   etapa NÃO há rate limiter implementado: 429 só é mapeado se a camada controlada
   devolver P0429. Não publicar sem proteção de abuso definida. Sem writes de
   contadores no catálogo; chave/permissão são verificadas em cada chamada.
5. Validar Deno/import HTTPS, JWT desabilitado SOMENTE na função nova, CORS,
   timeouts reais, ausência de hash/segredo em logs e comportamento de erros SQL.
6. Confirmar Storage e aprovação das URLs provisórias. Não criar promessa de
   revogação/ocultação de caminhos na fase atual.

Nada foi conectado ao site, aplicado no banco ou publicado. Não executar migration
0009/0010 até revisão/aprovação e testes PostgreSQL reais.
