# Etapa 3.3.1 — adaptador do JSON de referência

> Histórico do adaptador. A conexão local HTTP → RPC preparada na etapa 3.4,
> suas flags desligadas por padrão e bloqueios de metadados estão descritos em
> `17-revendamais-http-persistence.md`. Não foi ativado recebimento real.

Implementação local em `revendamais-adapter.ts`; nenhum import foi adicionado
ao index HTTP e nenhuma persistência foi ativada. Não executa fetch, SQL, HTML,
scripts nem logs. Payloads e metadados retornados podem conter dados pessoais:
nunca imprimir o resultado de inspect/map/normalizeLead.

## Uso e mapeamento

`createRevendaMaisAdapter({ authorizedDealerId })` exige ID decimal positivo
configurado no servidor. O ID oficial confirmado da Alencar Motors é **9325**.
Configuração preparada em `supabase/functions/revendamais-leads/.env.example`:
`REVENDAMAIS_DEALER_ID=9325`. Não é segredo nem seleciona organização do CRM.
`createRevendaMaisAdapterFromEnv(readEnv)` em `server-config.ts` carrega essa
variável de uma fonte confiável, por exemplo futuramente `Deno.env.get`, e falha
se estiver ausente/inválida. O receptor ainda não instancia esse factory.
Não há default, descoberta automática ou fallback para
dealer_id recebido. A configuração é copiada ao criar a instância; divergência
ou ausência de dealer_id falha antes do processamento. O número 1136 pertence
ao exemplo de OUTRA loja e é rejeitado com a configuração oficial. Somente a
loja configurada é aceita; o CRM continua resolvendo Alencar por main_org_id()
internamente. Nenhuma alteração na RPC ou resolução de organização foi feita.

API:
- `.map(raw)` é LeadAdapter compatível com `normalizeLead` e `createLeadProcessor`.
- `.inspect(raw)` retorna `{ fields, metadata }` para inspeção programática em
  memória; fields são pré-normalização, não substituem normalizeLead.

| Campo de referência | Destino |
| --- | --- |
| dealer_id | Validação de loja e metadata.dealerId |
| id | metadata.leadId original; compõe fields.externalId com loja |
| client_name | fields.name, normalizado pelo módulo existente |
| client_phone | fields.phone, normalizado pelo módulo existente |
| title | fields.title; fallback já existente no normalizador |
| lead_channel_id | metadata.channelId |
| channel_name | fields.portal como texto simples do canal, sem inferir portal |
| created_at | metadata.createdAt, string local; timezone = unspecified |
| interations | metadata.interactions com texto simples e campos tipados |

Email fica null: o exemplo não confirma campo estruturado de email do cliente.
Não extrair o conteúdo de `<b>email:</b>` como endereço, nem utilizar dealer_email,
dealer_phone ou nomes de campos não confirmados. stage_name e quaisquer org_id,
owner_id, stage_id, permissões e campos extras não são encaminhados. Campos
desconhecidos ainda são sujeitos aos limites globais de JSON.

Identidade lógica é `(revendamais, dealer_id, id)`. Para preservar o escopo de
loja sem alterar RPC/modelo, externalId transporta `dealer:<dealer_id>:lead:<id>`;
provider continua revendamais no processador existente. O ID original fica em
metadata.leadId. É uma codificação determinística, não criação de ID do fornecedor.
IDs aceitos são strings decimais positivas sem zeros iniciais (até 40 dígitos)
ou números inteiros positivos seguros em JavaScript. ID do lead ausente/inválido
vira null, usando manual_review no processador, nunca telefone/email como chave.
dealer_id inválido rejeita evento. Canal preenchido com ID inválido também rejeita.
A estabilidade/escopo efetivo do ID e política de reenvio ainda precisam ser
confirmados: flags externalIdIsStable/externalIdentityConfirmed seguem desligadas.
Não misturar futuros recibos com IDs crus e IDs compostos sem plano explícito.

## Primeira mensagem e limitações de autoria

Não há confirmação do significado de direction/type_id. Pesquisa na ajuda oficial
e na documentação pública não encontrou definição do contrato de saída do alerta.
O [artigo oficial sobre recebimento de webhooks](https://ajuda.revendamais.com.br/hc/rmais-ajuda/articles/1755104671-crm-_-configuracao-do-webhook-para-recebimento-de-dados)
trata do fluxo INVERSO (leads entrando no Revenda Mais). O link de API referenciado
nele não pôde ser acessado na consulta pública. Isso não confirma os enums do
payload de saída. Não interpretar direction=1/type_id=3 a partir de um exemplo.

Por padrão firstMessage é null e messageSelection = unconfirmed_sender;
interações convertidas permanecem disponíveis em memória sem atribuição de autoria.
Após confirmação escrita do fornecedor, configurar customerInteraction com
direction e typeIds de mensagens do cliente, exclusivamente no servidor. Valores
77/88 dos testes são fixtures, não semântica do fornecedor.

Com regra confirmada, selecionar somente interações não vazias que correspondam
ao ID do lead, direction e typeIds permitidos; ordenar pela data local validada,
não pela posição no array. Candidato sem data ou empate na primeira data com
textos diferentes -> ambiguous_order e firstMessage null. Interação com lead_id
ausente não é atribuída; ID divergente rejeita o payload. Datas precisam ser
comparáveis no mesmo relógio do fornecedor; confirmar isso antes de ativar regra.
Não inferir autoria, email ou relevância por palavras-chave dentro do HTML.

## HTML, datas e limites

Extrator conservador sem DOM/execução: descarta tags, atributos, comentários e
conteúdo script/style/svg/math/iframe/object/template/noscript. Decodifica uma
vez entidades numéricas e um conjunto limitado de entidades nomeadas. Outras
entidades são preservadas literalmente. Não é parser HTML completo nem sanitizer
para renderização; HTML malformado pode perder conteúdo. Saída deve ser tratada
sempre como TEXTO, nunca innerHTML, dangerouslySetInnerHTML ou HTML em Markdown.
Entidades podem produzir caracteres `<`/`>` literais; isso não torna o texto
seguro para inserção em HTML sem escaping. URLs e atributos nunca são acessados.

64 KiB de JSON UTF-8 (inclusive extras), profundidade 8, 2.048 nós, até 128
propriedades/elementos por container, chaves de 200 caracteres, até 50 interações.
HTML de cada campo: 12.000 caracteres, 512 tags e profundidade 32. Normalizador
existente aplica limites finais (canal 100, mensagem 10.000, nome 200, título 300,
telefone bruto 40). Rejeita excesso sem truncar silenciosamente. Ciclos,
accessors, protótipos não JSON e tipos incompatíveis são rejeitados. Entrada é
JSON já parseado; limites HTTP anteriores continuam necessários para o parsing.

Datas aceitas: `YYYY-MM-DD HH:mm:ss`, com validação de calendário, ou null/ausente.
Não adicionar timezone, converter para ISO ou usar Date.parse. Formatos novos
com timezone precisam de decisão explícita; hoje são rejeitados. Null/ausente em
campos opcionais não inventa dados. interations null/ausente equivale a vazio.

## Pendências para etapa 3.4

- Provisionar no futuro a configuração oficial do dealer já confirmado; confirmar enums, campo estruturado de
  email, estabilidade de IDs, possíveis lotes e Content-Type real.
- Confirmar semântica de channel_name: canal pode ser campanha/manual, não portal.
- Aprovar destino de metadata.createdAt/channelId/interactions; RPC 0011 atual
  recebe só os campos internos existentes, não esses metadados. Não expandir
  schema nesta etapa nem perder autoria/data ao ligar a persistência às cegas.
- Até confirmar autoria, não tratar interação de origem desconhecida como nota
  de cliente. Se preservação for necessária, definir armazenamento/retencão
  explicitamente. Interações em memória não são recuperação durável.
- Concluir testes reais PostgreSQL, retenção/revisão, controle de volume e
  querystrings, contrato de retries e teste isolado do fornecedor.

Nenhum receptor foi conectado e nenhum SQL/migration executado. Testes locais:
`node --test tests/revendamais-adapter.test.ts tests/revendamais-persistence.test.ts tests/revendamais-processing.test.ts tests/revendamais-leads.test.ts tests/stock-api.test.ts tests/stock-key-admin.test.ts`.
