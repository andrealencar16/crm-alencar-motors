# Etapa 3.4.4 — decisões finais de ingestão local

O banco conectado pelo Lovable é operacional. Não existe staging remoto separado.
Nenhum SQL, teste PostgreSQL, migration, deploy, acesso remoto ou configuração de
alerta foi executado nesta etapa. 0011 e Edge Function permanecem não publicadas.
Esta página substitui o comportamento de bloqueio por retenção das etapas anteriores.

## Identidade: existência não confirma estabilidade

O payload comprova que o fornecedor envia id e dealer_id. Não comprova que id
seja imutável, único por loja, não reciclável ou mantido em retries. Identidade
lógica permanece revendamais + dealer_id + id, codificada dealer:9325:lead:<id>.
REVENDAMAIS_EXTERNAL_ID_CONFIRMED continua false; não foi automaticamente habilitada.
REVENDAMAIS_INGESTION_ENABLED também permanece false.

Ambas as políticas de identidade (processador e adapter RPC) precisam concordar
para enviar p_identity_confirmed=true. Apenas configuração de servidor pode fazer
isso; nenhum campo do payload altera flag, organização, IDs internos ou permissões.
Antes de mudar a flag: obter confirmação escrita do fornecedor sobre escopo,
estabilidade, reenvio/reciclagem, corrigir fixtures se necessário e planejar a
resolução das revisões já existentes. A RPC agora considera revisões antigas
também na busca por ID: habilitar a flag não as promove silenciosamente.

## Retenção não bloqueia os demais dados

REVENDAMAIS_UNKNOWN_TEXT_RETENTION_APPROVED=false agora significa:
- Primeiro texto útil é identificado em memória, mas NÃO segue para RPC.
- Metadado unknownTextPresent=true registra presença sem conteúdo, preview,
  tamanho, hash ou data específica da interação omitida.
- Recibo registra unknown_text_present=true e unknown_text_disposition=omitted_policy.
- Nome, telefone, título, canal e data original do lead seguem para persistência
  normal, inclusive revisão durável se a identidade não estiver confirmada.
- firstMessage continua null: direction/type_id ainda não identificam remetente.

Isso é descarte explícito APENAS do texto sem autorização, não do lead. Ele não
poderá ser recuperado do CRM. Não prometer histórico de conversa. As demais
interações tampouco são armazenadas integralmente. Não classificar o texto como
mensagem do cliente nem extrair email de seu HTML.

Há defesa em três camadas: handler omite, persistence.ts omite independentemente
do caller e SQL ignora unknownInteraction antes de extrair/hashar seu texto se
p_unknown_text_retention_approved=false. A operação não retorna mais
retention_policy_required. Em chamadas HTTP normais o banco sequer recebe texto
não autorizado. Não há logs de payload ou dados pessoais.

Com aprovação explícita true, permanece o armazenamento anterior como unknown,
com prazo proposto de 30 dias e limpeza operacional necessária. Os estados do
recibo são absent, omitted_policy, retained e expired. Ao limpar texto vencido,
preserva presence=true e marca expired, sem recriar o texto em retry reconhecido.
Digest continua dado derivado restrito quando contém campos pessoais autorizados;
sua retenção própria não é resolvida por apagar o texto. Não habilitar retenção
antes de aprovar política, job de limpeza, controle de acesso e backups.

## Decisão por evento

| Evento válido | Comportamento |
| --- | --- |
| ID existe, estabilidade ainda não confirmada | Recibo review; nenhum contato/negócio automático |
| ID ausente/inválido | Revisão durável, sem inventar identidade |
| ID confirmado, nome e canal de contato válidos, sem match | Novo contato + negócio + recibo na mesma transação |
| ID confirmado, contato inequívoco existente | Reutiliza contato; preenche só canais vazios; novo interesse cria novo negócio |
| Nome ausente, contato inequívoco já existente | Pode reutilizar contato; não inventa nome |
| Nome ausente sem contato seguro, ou nenhum telefone/email | Revisão, sem criar contato fictício |
| Telefone/email apontam a pessoas diferentes ou conflitam | Revisão, sem merge ou overwrite |
| ID confirmado + conteúdo autorizado idêntico | Duplicate com resultado persistido; revisão idêntica é reutilizada |
| Mesmo ID confirmado + dados autorizados divergentes | Revisão identity_conflict, sem segundo negócio automático |
| Novo ID confirmado do mesmo contato | Novo negócio vinculado ao mesmo contato |
| Registros vinculados de recibo antigo foram apagados | Nova revisão linked_records_missing para recuperar o interesse, sem recriação automática |
| Segredo/dealer inválido | 401/403 antes de acesso privilegiado |
| Falha de banco/lock ocupado | 503 sanitizado, sem sucesso |
| Timeout | 408 na leitura ou 504 na persistência; commit remoto pode ter ocorrido |

Nome sem canais/ID não basta para identificar pessoa. Valores ausentes diferem
de tipos/formato inválidos: estes continuam retornando 400. Sem ID confiável,
cada entrega pode gerar revisão separada para não descartar interesses legítimos;
isso pode duplicar recibos de revisão, mas não contatos/negócios. Não há promessa
de deduplicação perfeita sem um identificador estável.

Quando texto é omitido, mudanças somente nesse texto NÃO participam do digest.
O comparável é o conjunto autorizado e persistido, mais a indicação de presença.
Não armazenar hash do texto rejeitado apenas para detectar divergência. Aprovar
retenção depois pode mudar a representação canônica e gerar revisão; não fazer
reprocessamento em massa ou promoção de fila automaticamente.

## Concorrência no banco operacional

Não removido SHARE ROW EXCLUSIVE em contacts. É adquirido apenas ao tentar
criação/reutilização automática, depois de resolver identidade, duplicates e
revisão por falta de canais. Revisões não confirmadas e duplicatas não passam
por ele. Advisory lock da organização serializa chamadas da integração, mas os
writers da UI não usam esse lock; FOR UPDATE só protege linhas que já existem
e não protege a ausência de um match (phantom de INSERT).

Não há UNIQUE seguro de telefone/email nem protocolo de locks nos writers do
CRM. Retirar o lock e manter apenas advisory daria falsa garantia de unicidade.
Uma alternativa correta exigiria identidade de contato única bem definida ou
coordenação de TODOS os writers/triggers; isso tem impacto maior e depende de
validação do schema/fluxos. Não foi introduzido nesta correção de ingestão.

A aquisição agora é NOWAIT: se UI mantém lock incompatível, falha imediatamente
e o endpoint retorna 503 para possível retry, sem colocar um waiter global na
fila. Enquanto adquirido, AINDA pode bloquear novas escritas da UI até o fim da
transação. Não afirmar que o bloqueio global desapareceu. Transação não faz rede;
limites efetivos de duração no PostgREST/DB e impacto sob carga exigem teste real.
Advisory lock continua com lock_timeout; definir statement_timeout na entrada,
pois configuração dentro de função não garante deadline integral da chamada.

A busca do recibo usa FOR UPDATE para coordenar com purge/delete e prioriza
digest idêntico, processado com vínculos válidos e revisão durável. Registro
antigo com vínculos apagados não é devolvido como se fosse revisão já persistida.
Tudo continua em uma RPC; qualquer falha reverte todas as escritas. Estoque e
vehicles não participam. main_org_id(), não dealer_id, resolve Alencar Motors.

## Verificação local e critérios para aplicação

Testes Node com mocks verificam as políticas de flags, ausência de texto nos
argumentos SQL, presença sem conteúdo, fluxo criado/revisão e espera por commit.
Fixtures PostgreSQL preparadas (não executadas) cobrem omissão defensiva na RPC,
metadados, rollback, alteração de flag sem promoção e reconhecimento sem hash de
texto não autorizado. Harness de duas sessões foi ampliado para dois IDs novos
do mesmo cliente, além de reenvios simultâneos; exige banco LOCAL descartável.
Mocks e leitura estática não comprovam sintaxe SQL, ACL, RLS, locks ou atomicidade.

Antes de qualquer aplicação controlada na base operacional:
1. Revisar/testar 0011 em PostgreSQL LOCAL descartável Supabase-compatível com
   fixtures sintéticas, sem dados pessoais de produção; não usar o banco
   conectado como ambiente de teste nem considerar ROLLBACK um isolamento seguro.
2. Validar ACL/RLS, ownership SECURITY DEFINER, pgcrypto, signatures/defaults,
   schema/triggers reais e efeitos de automações em etapa explicitamente autorizada.
3. Validar concorrência com UI, NOWAIT, deadlocks/timeouts e resultado perdido
   após commit. Ainda não há evidência real dessas garantias.
4. Preparar backup/recuperação e aplicação atômica de DDL com limites de lock,
   janela controlada e ingestão DESLIGADA. Não executar limpeza/destruição de
   recibos como rollback automático depois que dados reais existirem.
5. Confirmar contratos do fornecedor e operar revisão/retencão, logging de
   querystrings, limites de volume e retries antes de ligar qualquer alerta.

Pronto para revisão final do código e validação PostgreSQL local isolada; NÃO
aprovado ainda para aplicar na base operacional, ativar produção ou receber leads
reais. A confirmação de estabilidade do ID é pendência externa, não uma falha de
código que deva ser contornada habilitando a flag.
