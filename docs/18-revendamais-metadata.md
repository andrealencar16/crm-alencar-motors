# Etapa 3.4.1 — metadados no recibo transacional

> Histórico: a etapa 3.4.4 substituiu o bloqueio por retenção pela omissão somente
> do texto não autorizado com registro de presença. Estado atual, locks e critérios
> para aplicação estão em `19-revendamais-final-blockers.md`.

Estado atual: código preparado e testado em memória, migration 0011 NÃO aplicada.
Nenhum SQL, operação remota ou recebimento real foi executado. Não há nova
migration: foi ajustada somente 0011, conforme autorização e por não estar aplicada.
Esta página substitui o bloqueio metadata_storage_required descrito na etapa 3.4.

## Campos e destinos

| Origem | Destino no recibo | Regra |
| --- | --- | --- |
| Integrador | provider | Sempre revendamais |
| dealer_id + id | external_id | Mantido dealer:9325:lead:<id>; não muda a organização |
| lead_channel_id | channel_external_id | Decimal textual opcional |
| channel_name | channel_name | Texto simples, até 100 caracteres, sem HTML |
| created_at | source_created_at | Texto original YYYY-MM-DD HH:mm:ss, sem timezone |
| Primeiro texto útil em interations | unknown_interaction_text | Texto simples, até 12.000 caracteres, acesso restrito |
| Classificação desse texto | unknown_interaction_authorship | Sempre unknown |
| Posição no array | unknown_interaction_index | Índice original, 0–49 |
| Data dessa interação | unknown_interaction_created_at | Texto local opcional, sem timezone |
| Limite de retenção | unknown_text_expires_at | Recepção + 30 dias, somente após aprovação operacional |

Campos ausentes permanecem null. Título e mensagem de autoria confirmada mantêm
seus destinos existentes: deals.title e activities.body; revisão conserva o
modelo normalizado mínimo em review_lead. Nenhum campo comercial novo foi criado
em contacts/deals, e vehicles continua opcional.

Canal não é necessariamente portal: pode ser campanha ou canal manual. O HTTP
agora envia portal=null e guarda o nome recebido em channel_name, sem classificar
automaticamente NaPista/Webmotors/etc. provider é o integrador e não a origem do
portal. Identificação de portal só deverá ser preenchida com regra confirmada.

## Contrato entre módulos e RPC

metadata.ts define LeadMetadata, independente do modelo comercial Lead. Handler
extrai metadados do adapter, processing.ts encaminha como contexto separado e
persistence.ts envia uma allowlist explícita. Não espalha o payload bruto.

Assinatura atual:
`revendamais_commit_lead(p_lead jsonb, p_identity_confirmed boolean DEFAULT false, p_metadata jsonb DEFAULT '{}', p_unknown_text_retention_approved boolean DEFAULT false)`.

Chamadas SQL com dois argumentos continuam resolvendo os defaults da mesma
função. Não foi criado overload antigo. O cliente atual envia todos os argumentos;
é incompatível com uma definição antiga da RPC que aceite somente dois. Como a
0011 não foi aplicada, revisar/aplicar sua versão final em etapa autorizada antes
de qualquer teste operacional. ACL e fixture PostgreSQL foram atualizadas para
a assinatura de quatro argumentos. Não foi refeito o journal nem criada 0012.

RPC revalida allowlists, tipos, tamanhos e calendário das datas sem inferir fuso.
Metadados e recibo são escritos na MESMA transação de contato, negócio e nota;
erro de validação/auditoria reverte tudo. Campos administrativos em p_lead ou
p_metadata são recusados. O HTTP ignora essas entradas antes de montar a RPC.
Privilégios permanecem EXECUTE somente service_role, auth.role() verificado,
search_path vazio e tabela sem acesso direto para papéis da aplicação, com RLS.
Organização continua main_org_id() com validação de Alencar Motors, não dealer.

## Autoria e minimização

Não há confirmação de direction/type_id. firstMessage continua null no HTTP;
texto desconhecido nunca vira atividade intitulada como mensagem do cliente.
Preserva-se apenas o primeiro texto não vazio após conversão HTML, na ORDEM DO
ARRAY. A posição fica explícita: não é prova de primeira mensagem cronológica
ou autoria. Outras interações ficam fora do escopo de armazenamento; esta etapa
não implementa histórico de conversa nem captura integral de interations.
Nenhum email é extraído da string “email:” ou dos dados da loja.

Textos de scripts/estilos e atributos são descartados pelo extrator existente.
Saída continua sendo texto para rendering com escaping, nunca HTML bruto.
Nenhum metadado/payload é logado ou devolvido na resposta HTTP.

## Retenção exige aprovação antes de gravar texto

`REVENDAMAIS_UNKNOWN_TEXT_RETENTION_APPROVED=false` permanece no .env.example.
O prazo de 30 dias é uma proposta técnica; este trabalho não constitui aprovação
da política de tratamento de dados. Após aprovação explícita, o operador poderá
habilitar a flag no servidor. Ela é passada como boolean à RPC, nunca extraída
do payload. Sem aprovação e havendo texto útil, HTTP retorna 503
retention_policy_required ANTES do banco. Canal/data sem texto podem seguir
para a RPC independentemente dessa flag. Nunca descartar texto para obter 2xx.

revendamais_purge_expired_reviews agora remove revisões vencidas E limpa texto,
autoria, índice e data da interação em recibos processados ao expirar. Preserva
identidade, vínculos e metadados de origem para rastreabilidade. Retorna quantidade
de recibos removidos/limpos, sem dados pessoais. Não existe cron instalado:
aprovar política, agendar limpeza, monitorar execução e tratar backups antes
de habilitar. Apenas timestamp de expiração não apaga dados automaticamente.

content_digest inclui lead+metadados canônicos, inclusive texto desconhecido.
É dado derivado restrito, NÃO anonimização; sua retenção e a dos demais metadados
precisam de política específica. Limpar texto não elimina esse digest, pois ele
é usado para reconhecer reenvios. Não expor digest nem prometer eliminação
completa de dados pessoais aos 30 dias. Removê-lo ou expirar recibos processados
altera a janela de idempotência e requer decisão operacional explícita.

## Idempotência e falhas

Identidade composta não muda. Com ID confirmado, igual identidade e conteúdo
canônico -> duplicate; alteração em canal/data/texto -> revisão identity_conflict.
A busca prioriza o mesmo digest antes do recibo original, reutilizando também
uma revisão divergente já existente em vez de multiplicá-la. Sem ID confiável,
permanece revisão por entrega, sem usar telefone/email como identidade.

Reenvio de processado depois da limpeza não regrava texto nem renova TTL: digest
reconhece a entrega antiga. Recibos de revisão podem expirar inteiramente; depois
disso não há garantia de reconhecer a entrega antiga. Falhas deixam zero escrita
parcial e HTTP não confirma 2xx. Timeout/resultado de commit desconhecido mantém
as ressalvas e o fluxo de retry da etapa 3.4.

## Testes e prontidão

Testes locais com RPC mockada cobrem payload no formato do exemplo (dealer 9325
e PII fictícia), encaminhamento completo de metadados, opcionais null, autoria
unknown, gates de retenção, resposta sem dados e espera pelo commit. Fake
transacional cobre retry, divergência em metadados e rollback simulado. Leituras
estáticas verificam configuração de retenção/limpeza; não comprovam PostgreSQL.

Fixture `tests/postgres/revendamais-leads.test.sql` ampliada, NÃO EXECUTADA: valida
colunas, rollback ao falhar recibo, ausência de nota com autoria desconhecida,
idempotência, conflito, retenção, não reidratação em retry, data inválida e ACL.
Continua exigindo banco descartável de nome exato e rollback das fixtures.

Comando sem SQL:
`node --test tests/revendamais-metadata.test.ts tests/revendamais-leads.test.ts tests/revendamais-adapter.test.ts tests/revendamais-persistence.test.ts tests/revendamais-processing.test.ts tests/stock-api.test.ts tests/stock-key-admin.test.ts`.

Pronto para revisão de código e preparação de teste LOCAL isolado. Ainda NÃO
pronto para ativação ou leads reais: executar testes PostgreSQL/Deno com aprovação,
validar schema/triggers, aprovar/aplicar 0011, confirmar enums/ID estável/retries,
aprovar retenção e fluxo humano de revisão, configurar limpeza e proteções de
querystrings/volume. Ingestão, identidade confirmada e aprovação de retenção
continuam desabilitadas no exemplo.
