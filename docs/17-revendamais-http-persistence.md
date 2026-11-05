# Etapa 3.4 — conexão local HTTP → RPC

> Histórico: o bloqueio `metadata_storage_required` foi substituído na etapa
> 3.4.1 por armazenamento no recibo e aprovação de retenção para texto desconhecido.
> Contrato atual: `18-revendamais-metadata.md`. Nenhum ambiente remoto foi alterado.

Código conectado localmente, sem executar SQL, migration, deploy ou chamadas
remotas. `REVENDAMAIS_INGESTION_ENABLED=false` no exemplo mantém a persistência
desligada por padrão. Não ativar recebimento real com esta etapa isoladamente.

## Fluxo e autorização

POST → segredo da querystring → configuração obrigatória de dealer → JSON com
limite de bytes/prazo → adaptador e validação da loja → normalização pelo
processador → verificação de destinos dos metadados → factory backend → uma RPC
transacional → validação da confirmação → resposta HTTP.

`index.ts` injeta factory lazy de LeadPersistence. Apenas depois da autenticação,
dealer e normalização válidos ela lê SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY e
constrói cliente backend, sem persistência de sessão nem refresh. Cliente não é
compartilhado com browser, e dados do payload não controlam URL/credenciais.
Não há inserts/updates REST independentes. Usa apenas revendamais_commit_lead.
Organização continua resolvida pela RPC com main_org_id(), nunca dealer_id ou
org_id do evento. Sem dependência de vehicles ou mudança nas APIs existentes.

Configuração de servidor:
- REVENDAMAIS_WEBHOOK_SECRET: obrigatório, 64 caracteres hex minúsculos, gerados
  por CSPRNG em etapa operacional autorizada; nenhuma credencial criada agora.
- REVENDAMAIS_DEALER_ID=9325: obrigatório, fonte de autorização da loja. Não é
  organização do CRM; outras lojas retornam 403, sem construir cliente.
- REVENDAMAIS_INGESTION_ENABLED: somente string exata true permite factory real;
  ausente/false não habilita banco, e evento compatível retorna 503.
- REVENDAMAIS_EXTERNAL_ID_CONFIRMED: false por padrão; somente habilitar após
  confirmação do fornecedor da estabilidade/escopo do ID. Controla ambas as
  políticas existentes de processamento e persistência.
- SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY: necessários apenas ao executar
  factory real; não usar chaves da Stock API/public-api nem VITE_ variables.

verify_jwt=false permanece limitado às funções configuradas em config.toml;
não significa escrita anônima na RPC, que exige papel service_role. O segredo
próprio é verificado antes de qualquer operação privilegiada. Risco de query
em logs externos permanece: não presumir redação automática pela infraestrutura.

## Respostas

| HTTP | status | Condição |
| --- | --- | --- |
| 201 | created | RPC confirmou novo processamento com IDs válidos |
| 200 | duplicate | RPC confirmou evento já processado |
| 202 | review_persisted | RPC confirmou recibo de revisão com UUID válido |
| 400 | invalid_body / invalid_event | JSON, tipos ou normalização inválidos |
| 401 | unauthorized | Segredo inválido, ausente ou repetido |
| 403 | dealer_not_authorized | Loja ausente/divergente da configuração |
| 405 | method_not_allowed | Método diferente de POST; Allow: POST |
| 408 | body_timeout | Leitura do corpo excedeu cinco segundos |
| 413 | payload_too_large | Corpo excedeu 65.536 bytes reais |
| 415 | unsupported_media_type | Formato diferente de JSON/+json ou compressão |
| 503 | unavailable | Configuração de segredo/dealer ausente ou inválida |
| 503 | persistence_unavailable | Persistência desabilitada, erro de RPC/rede ou confirmação inválida |
| 503 | metadata_storage_required | Metadados sem destino persistente seguro |
| 504 | persistence_timeout | Processamento/RPC excedeu oito segundos |
| 500 | internal_error | Falha inesperada sanitizada |

Somente os três primeiros são 2xx; nenhum é enviado antes da Promise da RPC
concluir e seu retorno ser validado pelo adapter. Respostas não contêm dados
pessoais, SQL, IDs internos ou segredos. No-store/nosniff/no-referrer permanecem.
503/504 incluem Retry-After: 60 como sugestão, não promessa de retry do fornecedor.

Deadline de oito segundos começa na fase de processamento/persistência; leitura
tem prazo separado de cinco segundos. AbortSignal é encaminhado à chamada RPC.
Cancelar HTTP não garante rollback no PostgreSQL: pode haver commit com resposta
perdida. Reenvio precisa seguir a idempotência no banco. Não há retry automático
oculto. Limite adicional de 4.096 leituras impede chunks vazios ilimitados;
buffer fixo de 64 KiB evita overhead de milhares de buffers retidos. JSON only:
o suporte diagnóstico anterior de formulário foi removido pois não existe
contrato confirmado para sua interpretação como eventos Revenda Mais.

## Idempotência e dados

Preserva externalId codificado `dealer:9325:lead:<id>`; provider é revendamais.
Outro ID pode gerar outro negócio do mesmo contato. Mesmo ID/conteúdo retorna
duplicate quando a política de identidade está confirmada; divergência vai para
revisão pela RPC. Sem confirmação de ID, fluxo conservador de revisão. Eventos
sem ID mantêm externalId null; não usam telefone/email como identidade.

Título, nome do canal (portal no modelo atual) e mensagem de autoria confirmada
têm destino no schema 0011. O index atual NÃO configura enums de cliente e não
atribui textos das interações a firstMessage. Não inventa email/telefone/origem.

**Bloqueio importante:** 0011 não recebe data original nem ID externo do canal.
Também não tem destino aprovado para texto de interações de autoria desconhecida.
Se channelId, createdAt ou qualquer texto de interação estiver presente, handler
retorna 503 metadata_storage_required ANTES de construir cliente/chamar RPC.
O exemplo oficial contém esses campos e será bloqueado. Não remover os campos
do evento para contornar a proteção. Isso evita descarte silencioso e sucesso
indevido; não substitui recibo durável. Eventos bloqueados não foram recebidos
duravelmente por este CRM, e retries precisam ser confirmados com o fornecedor.

Necessário aprovar extensão do contrato RPC/recibo para metadados tipados e
política de retenção/autoria, com migration posterior e testes PostgreSQL.
Não foi alterada migration 0011 nem sobrecarregado título, mensagem ou portal
com JSON para acomodar metadados. IDs originais são recuperáveis do identificador
composto, mas data/canal não podem ser inventados ou descartados. Enquanto esses
bloqueios existirem, não habilitar fluxo de produção.

## Logs e testes

Removido o diagnóstico estrutural anterior. Handler/index/processador/adapter
de persistência não registram payload, metadados, exceções ou mensagens de erro.
Não há logs da integração nesta versão; observabilidade futura deverá emitir
somente códigos fixos e métricas sem input. Gateway/provedor/DB continuam exigindo
revisão de logging e acesso própria antes de qualquer evento real.

Testes em memória usam o handler real, adaptador real, normalizador/processador
e adapter RPC, com transporte SQL MOCKADO. Cobrem autenticação antes do banco,
dealer, códigos, aguardando commit, revisão, divergência delegada à RPC,
ausência de canais/ID, erro/timeout, confirmação inválida e bloqueio de metadados.
Não provam atomicidade, matching ou concorrência PostgreSQL: fixtures reais
preparadas na etapa 3.3 continuam NÃO EXECUTADAS.

Comando local:
`node --test tests/revendamais-leads.test.ts tests/revendamais-adapter.test.ts tests/revendamais-persistence.test.ts tests/revendamais-processing.test.ts tests/stock-api.test.ts tests/stock-key-admin.test.ts`

## Antes da ativação

Resolver destinos dos metadados; confirmar direction/type_id, email, retries e
ID estável; testar runtime Deno e PostgreSQL descartável com autorização;
revisar schema/triggers e aplicar migrations autorizadas; aprovar retenção,
revisão humana e etapa comercial; configurar timeout efetivo PostgREST/DB,
limites de volume e proteção de querystrings; testar evento isolado do fornecedor.
Nenhum alerta Revenda Mais foi configurado. Nenhum lead real, Nina, commit ou push.
