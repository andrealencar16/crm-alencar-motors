# Etapa 3.4.11 — reconhecer reenvio automático sem fundir recibos

Contrato oficial informado pelo usuário: id da raiz muda por tentativa; até
quatro tentativas; interations[].lead_id permanece em retry automático após falha
e muda quando o cliente faz um novo envio. NÃO é ID permanente de oportunidade
no CRM do fornecedor. Essa confirmação permite reconhecer um envio e seus retries,
mas não habilita por si só criação automática de negócios nesta implementação.

## Inspeção e decisão antes da alteração

O código anterior selecionava apenas o primeiro lead_id não nulo como hint.
O exemplo contém um único item; isso não demonstra que arrays reais sejam sempre
uniformes. A implementação agora examina TODOS os itens, sem usar a posição 0
como prova e sem comparar o ID de origem com o id da tentativa.

| Array de IDs normalizados | Classificação | Associação |
| --- | --- | --- |
| ["777","777"] | consistent | Pode reconhecer retry dentro do mesmo dealer |
| [] ou interations ausente/null | empty | Nenhuma |
| ["777",null], [null] ou ID inválido | incomplete | Nenhuma |
| ["777","888"], inclusive com null | ambiguous | Nenhuma |
| IDs consistentes, dealer não fornecido à RPC | unscoped no SQL | Nenhuma |

IDs numéricos inteiros seguros e strings decimais canônicas são normalizados para
string. ID ausente/malformado vira null para persistir revisão, sem atribuir
identidade. Estrutura não JSON, arrays excessivos, interações não-objetos e tipos
inválidos nos demais campos continuam sujeitos às validações existentes.

## Reconhecimento e revisão

Escopo da busca: org resolvida no servidor + integrador fixo revendamais +
dealer validado + lead_id completo e unânime. dealer_id continua comparado com
REVENDAMAIS_DEALER_ID=9325 ANTES de acessar qualquer recurso privilegiado.
dealer não seleciona a organização. RPC recebe o dealer do contexto do adaptador,
não org_id/owner_id/permissões do corpo. Acesso direto continua só service_role.

retry-identity.ts classifica o array no adapter. O adapter retorna retryLeadId e
retryIdentityStatus para inspeção programática; HTTP encaminha dealerId e o array
completo de interactionLeadIds. A RPC NÃO confia numa flag de consistência nem
no antigo sourceLeadIdHint: revalida quantidade/tipos/IDs e recalcula unanimidade.

Colunas novas do recibo na 0011:
- dealer_id: escopo da loja; não organização do CRM;
- interaction_lead_ids: array limitado de strings/null, sem payload ou HTML bruto;
- retry_lead_id: somente para identidade consistente e com dealer;
- retry_identity_status: consistent/empty/incomplete/ambiguous/unscoped;
- retry_relation: none/automatic_resend/content_conflict.

delivery_attempt_id continua registrando id da raiz em cada recibo. source_lead_id_hint
permanece diagnóstico legado, nunca suficiente para reconhecer retry. external_id
continua null; identity_confirmed e a flag antiga continuam desabilitadas.

No mesmo scope com conteúdo comercial autorizado igual, uma nova tentativa recebe
retry_relation=automatic_resend e possible_related_receipt_id para um recibo anterior.
Recebe SEMPRE novo UUID/linha, sem UNIQUE no scope do recibo nem reaproveitamento
do retorno antigo. Ordem de parent considera received_at/id; empates não exigem
apontar sempre ao primeiro inserido (regressão da etapa 3.4.10 preservada).

Dentro do mesmo scope, se qualquer recibo anterior tiver conteúdo comercial
divergente, novo recibo fica content_conflict, motivo retry_payload_conflict e sem
ponteiro automático. Todos permanecem review. O hash compara apenas conteúdo
autorizado, sem id da tentativa, timestamps ou índices; texto sem autorização de
retenção não é armazenado/hasheado. Conteúdo igual não substitui lead_id.

IDs ausentes/divergentes não geram ponteiro MESMO que nome, telefone, canal e
mensagem coincidam. lead_id diferente não gera ponteiro MESMO com todos os dados
comerciais iguais. Não existe mais fallback de associação por fingerprint.
Assim, dois novos envios legítimos não são fundidos ou descartados.

O advisory lock transacional da organização serializa busca+inserção, e a consulta
ao parent usa FOR KEY SHARE. O índice de scope não é UNIQUE: quatro tentativas
devem produzir quatro recibos. Não se presume intervalo ou cutoff após quatro.

## Autoria, HTTP e segurança

direction/type_id continuam sem confirmação de semântica. HTTP não configura
política de remetente: firstMessage permanece null. Reconhecimento do envio não
prova autoria de cada mensagem. A opção isolada de política no adapter agora usa
o lead_id unânime em vez do id de tentativa; permanece sem uso no index real.

Grants, RLS, search_path vazio, auth.role(), segredo e validação da loja foram
preservados. Não há nova rota/RPC pública. Status de negócio/contato/atividade
continuam sem criação automática. p_identity_confirmed=true ainda falha; não
habilitar REVENDAMAIS_EXTERNAL_ID_CONFIRMED.

Cada tentativa válida só recebe HTTP 202 após confirmação de seu próprio recibo
durável. Erro de escrita/timeout não retorna sucesso. Reconhecimento não retorna
duplicate/200 nem descarta a entrega. Nenhum ID externo escolhe registro interno;
ponteiro é resolvido pelo SQL no scope controlado. Nenhum dado pessoal é logado.

## Testes e laboratório

Novo tests/revendamais-retry-identity.test.ts cobre classificação completa, quatro
tentativas com IDs distintos, dois envios idênticos do mesmo cliente com lead_id
diferente, arrays vazios/parciais/divergentes, dealer, conflito e falha transacional.
Transporte RPC e serialização são fakes em memória: NÃO comprovam locks PostgreSQL.
Demais testes HTTP/metadata foram atualizados para os novos campos.

Fixtures PostgreSQL e harness de duas sessões foram atualizados para esse scope,
incluindo os cenários sem fallback comercial e preservação dos metadados/recibos.
A regressão de UUIDs com timestamps empatados continua na fixture. Os testes de
grants/RLS existentes continuam aplicáveis. Nenhum SQL foi executado nesta etapa.

0011 foi modificada localmente; sua execução anterior no laboratório não valida
esta versão. É necessário testar novamente em PostgreSQL 17 descartável com schema
novo: reconstruir APENAS o laboratório via runner protegido em etapa autorizada,
Start → Bootstrap → Migrate → Verify → SqlTests. Somente se SqlTests passar,
executar Concurrency. Não reaplicar CREATE em laboratório já inicializado. Não
editar/aplicar diretamente uma versão operacional já aplicada; nenhuma foi
publicada nesta conversa.

## Garantias ainda necessárias para criação automática

Confirmar escopo/uniquidade e eventual reciclagem de lead_id por dealer, duração
do reconhecimento frente a retries tardios/retencão e comportamento de envelopes
incompletos ou múltiplos IDs. Não inferir ID de oportunidade permanente.
Demonstrar em PostgreSQL real atomicidade/ACL/concorrência e confirmação HTTP;
definir identidade única da operação comercial separada dos recibos por tentativa,
tratamento de conflitos e de revisão já existente. Não impor UNIQUE ao recibo
para obter um negócio único, pois isso perderia tentativas.

Também permanecem as políticas operacionais anteriores de retenção, revisão,
auth do endpoint, querystrings e controle de volume. Nenhuma dessas pendências
foi contornada por nome/telefone/mensagem. Criação automática, ingestão real,
deploy e Nina SDR continuam fora desta etapa.
