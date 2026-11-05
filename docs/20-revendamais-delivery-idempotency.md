# Etapa 3.4.8 — ID de tentativa, comparação conservadora e revisão

> Histórico: a etapa 3.4.11 incorporou a confirmação sobre interations[].lead_id.
> Reconhecimento atual exige array completo/unânime e mesmo dealer, sem fallback
> por fingerprint. Ver `21-revendamais-retry-submission.md`; criação continua suspensa.

## Evidência nova e limite lógico

Conforme confirmação oficial repassada pelo usuário, o `id` da raiz muda a cada
tentativa de entrega do mesmo lead, com até quatro tentativas. Portanto NÃO é
identidade estável de interesse comercial; dealer_id + id também não é.
Não foram informados intervalos, duração total dos retries ou identificador estável
alternativo. Esses dados não são inferidos do exemplo ou dos nomes dos campos.

Investigação do payload e código: `interations[].lead_id` é um candidato para
esclarecimento com o suporte, mas seu escopo/estabilidade não estão confirmados.
Não rejeitar mais uma interação só porque lead_id difere do ID da tentativa.
Primeiro hint válido é preservado como informação de origem; não participa de
identidade, comparação ou seleção de registro interno. Cliente/telefone/canal
não são IDs de interesse. O dealer autorizado permanece 9325 via configuração;
organização continua resolvida internamente por main_org_id().

## Política implementada

**Sem identificador estável confirmado, toda entrega válida gera revisão durável
própria. Não há criação automática nem reconhecimento definitivo de duplicata.**
Esta é uma decisão conservadora deliberada: evita criar negócios repetidos e
também evita apagar um segundo interesse legítimo indistinguível de um retry.
Uma primeira entrega completa não comprova que um futuro retry com outro ID seja
outro interesse. Não há uma regra segura de exactly-once com os dados atuais.

- Adapter retorna externalId=null. `metadata.deliveryAttemptId` preserva o ID
  original decimal, SEM compor chave de negócio. `sourceLeadIdHint` preserva o
  primeiro lead_id das interações como hint não confirmado.
- Campo interno externalId fica reservado para um futuro contrato de identidade
  estável. A RPC rejeita seu preenchimento, em vez de reaproveitar a semântica antiga.
- REVENDAMAIS_EXTERNAL_ID_CONFIRMED permanece false, é obsoleta e NÃO é lida pelo
  index. Mesmo configurações antigas true no processador/adapter não promovem
  identidade. A RPC rejeita p_identity_confirmed=true, e a tabela exige false.
- RPC cria um recibo distinto para CADA entrega, inclusive o mesmo ID novamente.
  ID de tentativa não é UNIQUE e não escolhe contato/negócio/recibo existente.
- Só retorna review com UUID após persistir. Adapter rejeita respostas de uma RPC
  antiga que ainda retornem created/duplicate. HTTP real atual responde 202 após
  confirmação durável, 400/401/403 para erro de entrada/autorização e 503/504 para
  falha/timeout, sem logs de dados pessoais e sem confirmação prematura.

## Comparação comercial: sinal, nunca descarte

content_digest representa comparação canônica de nome/título em minúsculas,
telefone/email normalizados, título, mensagem confirmada quando houver, portal
quando confirmado, canal (ID/nome) e texto desconhecido SOMENTE se sua retenção
estiver aprovada, mais indicador de presença de texto. Não usa só telefone/email
nem só mensagem; estes podem ser iguais em interesses legítimos diferentes.

Ficam EXCLUÍDOS: ID de tentativa, hint de lead_id, todos os timestamps, posição
das interações e horário de recepção. Datas são preservadas nas colunas próprias;
não são usadas para inferir janela de retry. Hash é dado derivado restrito, não
anonimização nem identificador externo. Texto sem autorização não é enviado,
armazenado ou hasheado: continua sendo omitido, com indicação de presença.

Depois de serializar a decisão com advisory lock transacional da organização,
RPC procura recibo anterior com mesmo digest e org. Se houver, grava
possible_related_receipt_id apontando para ele, sem reutilizar sua linha. Esse
ponteiro é gerado no servidor e nunca aceito do payload. ON DELETE SET NULL
permite expirar recibos antigos sem apagar os novos.

Razões de revisão:
- insufficient_contact: sem nome ou sem canais de contato suficientes;
- commercial_match_ambiguous: dados comerciais iguais a outro recibo, podendo
  ser retry OU outro interesse legítimo;
- untrusted_identity: demais entregas sem identidade comercial confiável.

Mesmo títulos/mensagens iguais produzem vários recibos, não merge ou exclusão.
Dados diferentes também não são automaticamente considerados novos negócios.
A comparação só auxilia revisão humana futura; não foi criada UI/RPC de liberação
nesta etapa. Não rotular um candidato como retry confirmado.

## Quatro tentativas, concorrência e recuperação

Até quatro tentativas informadas podem gerar quatro recibos com IDs distintos e
mesmos dados comerciais. Isso preserva evidência e possíveis interesses. Quatro
não é cutoff, janela, regra de merge nem autorização para ignorar uma quinta
chamada. Não presumir espaçamento dos retries ou garantia de entrega.

Reenvios concorrentes são serializados no banco para apontar possíveis relações,
mas TODOS inserem recibos. Sem contatos/negócios automáticos, não há duplicação
dessas entidades nesse fluxo. O lock global de contacts permanece somente no bloco
legado de escrita transacional, que agora é intencionalmente inalcançável.

A estrutura atômica contato+negócio+nota+recibo foi preservada na 0011, mas não há
critério autorizado para ativá-la. Reativar criação exigirá NOVO contrato seguro
(ID estável comprovado ou resolução explícita de revisão), implementação e testes;
não basta mudar a antiga flag. Não foi criada funcionalidade de aprovação manual.

Se recibo falha, transação inteira falha e HTTP não responde 2xx. Se commit ocorre
mas resposta se perde, um novo envio cria outro recibo para revisão. Sem identidade
estável, isso é mais seguro do que descartar silenciosamente interesse legítimo.
Retenção e expiração de revisões continuam sujeitas às decisões operacionais
anteriores; relações podem desaparecer com purge e não são prova histórica eterna.

## Arquivos e testes

Ajustados adapter, metadata, handler, processing, persistence, index e comentário
do modelo interno; 0011 local ainda não publicada; testes de adapter/HTTP/modelo,
metadados/persistência e fixtures SQL/concorrência. Não há migration nova ou SQL
executado. Revalidar a versão revisada da 0011 num laboratório novo quando houver
autorização. Não reaplicar uma CREATE migration em laboratório já inicializado;
se alguma versão tiver sido aplicada fora desta conversa, verificar antes de migrar.

Testes Node com transporte/fake em memória cobrem IDs diferentes, quatro tentativas,
repetição do mesmo ID, mensagens iguais com títulos distintos, concorrência simulada,
incompletos, erro de persistência e confirmação só após commit. Nenhum mock comprova
atomicidade ou locks reais de PostgreSQL. As fixtures SQL e duas sessões foram
atualizadas para esperar recibos distintos/relação possível e ZERO criação automática,
não created+duplicate. Continuam NÃO EXECUTADAS.

Comando local sem SQL:
`node --test tests/revendamais-lab-guards.test.ts tests/revendamais-metadata.test.ts tests/revendamais-leads.test.ts tests/revendamais-adapter.test.ts tests/revendamais-persistence.test.ts tests/revendamais-processing.test.ts tests/stock-api.test.ts tests/stock-key-admin.test.ts`.

## Pendências

Perguntar ao suporte se interations[].lead_id é estável/único e como obter ID
original do interesse; esclarecer intervalos e semântica de retry/ack; confirmar
direction/type_id. Sem isso, automação de criação e deduplicação definitiva ficam
inativas. Ingestão permanece desligada, dealer/segredo obrigatórios. Nenhum Supabase
remoto, Docker/SQL, migration, deploy, alerta, lead real, estoque, Nina, commit ou push.
