# Etapa 3.2 — preparação local do processamento

> Histórico da etapa 3.2. A etapa 3.3 preparou migration/RPC e adapter de
> persistência, sem executá-los ou conectar o HTTP. Estado atual e decisões em
> `15-revendamais-persistence.md`; as propostas abaixo não significam ativação.

## Estado e limites

Sem adaptador Revenda Mais definitivo, persistência de produção ou ligação do
processador ao HTTP. `index.ts` continua usando somente o receptor diagnóstico.
Corpo válido agora retorna 503 `ingestion_not_enabled`, em vez de confirmar com
200 um evento descartado. Autenticação própria, limite de 64 KiB, timeout de
leitura de 5 segundos e respostas sanitizadas são preservados. Não ativar o
alerta 120618: a política de retries ainda é desconhecida, e 503 não garante
recuperação de nenhum lead. Nenhuma mensagem posterior ao primeiro contato é
esperada deste alerta.

## Investigação do repositório

- Inspecionados receptor, index, inbound-webhook, public-api, tipos gerados,
  fluxos de UI e migrations. APIs existentes não são reutilizadas nem alteradas.
- `src/integrations/supabase/types.ts`: inserção em contacts exige org_id e
  first_name; email, phone, last_name, company_id e owner_id aceitam null.
  Deals exige org_id e title; contact_id, vehicle_id, stage_id, owner_id, value,
  currency e status aceitam null nos tipos. IDs são opcionais na inserção.
- Activities exige org_id, title e type; body, contact_id, deal_id, user_id,
  due_date e completed_at aceitam null. UI utiliza type `note` e body para notas
  no histórico de contatos/negócios. Não há campo dedicado de origem/ID externo
  em contacts/deals nos tipos locais; qualification já tem outro propósito.
- ContactCreateModal exige primeiro nome, usa status lead e usuário logado como
  proprietário. Deals.tsx exige título, usa status open, BRL e etapa selecionada.
  Esses valores de usuário/etapa da UI não serão aceitos do webhook.
- Migrations estão em drizzle/migrations, numeradas com snapshots/journal.
  Há funções SECURITY DEFINER com search_path restrito, grants explícitos,
  constraints/índices e triggers de proteção. 0003_single_org_alencar.sql fornece
  main_org_id() e mantém user_roles como autoridade de associação/permissões.
- drizzle/schema.ts está vazio por geração. O histórico disponível não inclui
  o DDL original completo de contacts/deals/activities. Não é possível atestar
  defaults, índices únicos, RLS ou todos os triggers remotos a partir dos tipos.
  Nenhuma hipótese de equivalência com o banco remoto foi adotada.

## Normalização e adaptador

lead.ts define um contrato INTERNO: name, phone, email, title, firstMessage,
portal, externalId. Nenhum desses nomes é apresentado como campo do fornecedor.
normalizeLead(raw, adapter) exige adaptador de código confiável; não há adaptador
padrão, heurística de nomes nem configuração fornecida pelo cliente.

Após receber contrato oficial/amostra anonimizada, implementar adaptador
versionado separado que valide envelope, extraia somente campos aprovados e
defina explicitamente representação de IDs, mensagens e origem. Repetições de
campos de formulário, lotes e JSON embutido precisam de regras confirmadas.
Converter IDs numéricos somente conforme contrato, evitando perda de precisão.
O modelo atual não contém data externa ou veículo porque não foram confirmados.
Adicionar esses campos depois do contrato; a data de recepção será do servidor.

Regras locais:
- Nome ausente permanece null, sem inventar identidade. Nome incompleto é
  preservado; whitespace normalizado. Não separar sobrenomes automaticamente.
- Telefone BR com DDD, com/sem 55 ou 0055, converte para +55 e dígitos. Aceita
  fixo de oito dígitos iniciado em 2–5 ou celular de nove iniciado em 9. Não
  completa DDD, dígito nove ou prefixo de operadora. Não comprova titularidade,
  existência ou validade de DDD pela Anatel. Formato inválido rejeita evento
  para tratamento, em vez de silenciosamente perder um canal de contato.
- Email opcional é aparado e convertido para minúsculas por política de matching
  operacional; validação básica, sem consulta externa ou garantia de entrega.
- Título vazio recebe rótulo interno “Interesse recebido pelo Revenda Mais”. Não
  representa título original: permanece documentado como fallback de UI.
- Mensagem vazia vira null. Texto não vazio é preservado com trim nas bordas;
  apresentação futura deve escapar HTML. Sem buscar URLs contidas no texto.
- Portal desconhecido é preservado como texto limitado; ausente fica null.
  Revenda Mais é o integrador, não um portal inferido. Normalização de catálogo
  dos portais precisa de mapeamento futuro confirmado.
- ID externo ausente fica null. Limites: nome 200, email 254, telefone bruto 40,
  título 300, portal 100, ID 200 e mensagem 10.000 caracteres. Tipos errados,
  NUL, excesso ou payload não reconhecido retornam invalid_payload sanitizado.
  Não há truncamento silencioso. HTTP deve impor limite bruto antes do módulo.

## Persistência proposta, ainda sem implementação

processing.ts recebe LeadPersistence.commit. Uma implementação futura deve:

1. Resolver e validar exclusivamente main_org_id() no servidor. Política de
   etapa/responsável será configuração administrativa confiável da Alencar,
   validada contra a organização. Não usar profiles.org_id como autorização.
2. Persistir recibo e decisão de idempotência atomicamente com contato, negócio
   e nota. Rollback integral em falha; concorrência protegida no banco.
3. Buscar contatos por telefone/email normalizados dentro da organização.
   Um candidato inequívoco pode ser reutilizado, sem sobrescrever informações
   existentes automaticamente. Nome sozinho não identifica contato. Telefone e
   email que apontam para pessoas diferentes, múltiplos candidatos ou dados
   conflitantes vão para revisão. Valores legados exigem estratégia de matching
   normalizado sem interpolar entrada em filtros SQL/PostgREST.
4. Criar contato com first_name contendo nome completo preservado, last_name
   null, status lead. Sem nome/identidade suficientes, guardar recibo para
   revisão; não criar “cliente desconhecido”.
5. Criar negócio open para cada novo interesse, com título, contact_id e
   vehicle_id null. Não exigir veículo no CRM nem modificar estoque/anúncios.
6. Primeira mensagem não vazia vira uma activity note com body, contact_id e
   deal_id, na MESMA transação. Registrar origem, ID externo e proveniência
   separadamente; não sobrecarregar contacts.title nem deals.qualification.

commit retorna created/duplicate com IDs apenas após commit confirmado; review
exige recibo durável e identificável, não descarte. Falhas/exceções ou resposta
incompleta viram retry, sem logar mensagem de erro ou dados. Nenhum adaptador
real satisfaz essa interface nesta etapa. O fake dos testes é uma especificação
em memória, não prova de atomicidade/isolamento em PostgreSQL.

## Idempotência e reenvios

Se ID externo confiável for confirmado, externalIdIsStable poderá ser habilitado
somente no servidor. A decisão de unicidade futura deve considerar provedor e
escopo real do ID (global, loja ou portal), além da organização fixa. Não basta
telefone/email: outro ID do mesmo cliente representa novo negócio. O mesmo ID
retorna resultado já persistido; mesmo ID com conteúdo divergente precisa de
revisão, não sobrescrita silenciosa. A interface entrega o lead completo para
essa validação. Não foi criada constraint de ID presumido.

Sem ID confiável, o processador seleciona manual_review. Proposta conservadora:
preservar cada entrega em recibo durável restrito, agrupar possíveis reenvios
com HMAC de conteúdo normalizado e janela curta apenas como SINAL de revisão.
Não descartar automaticamente interesses idênticos. Hash não cria identidade
de evento nem remove obrigações de proteção de dados. TTL da janela, segredo
HMAC, retenção e regra de liberação aguardam aprovação e contrato do fornecedor.
Isso reduz automação nesta situação, mas evita perder interesse legítimo.

Futura camada HTTP: invalid -> 400; falha transitória -> 503; entrega persistida
ou duplicata comprovada -> 2xx; revisão -> 2xx somente após recibo durável.
Timeout de escrita exige cancelamento e resultado idempotente: commit pode ter
ocorrido mesmo que a resposta se perca. Consultar recibo em retry. Definir prazo
total, backoff, tentativas e fila de falhas após política do fornecedor. O módulo
atual não inicia retries automáticos nem promete timeout para um storage real.

## Proposta de banco — requer aprovação, nada criado

Provavelmente será necessário um recibo de integração com estados, data do
servidor, versão de adaptador, provedor, origem, ID externo opcional e vínculos
de contato/negócio, além dos campos normalizados estritamente necessários para
revisão. NÃO guardar payload bruto indiscriminadamente. Recibos passam a conter
dados pessoais e exigem RLS, grants restritos, retenção, exclusão e auditoria.

Uma RPC transacional poderá executar recibo+contato+negócio+nota e serializar
concorrência. Antes de escrever migration: validar schema real em etapa
autorizada, aprovar desenho/retencão, confirmar contrato de IDs e verificar
efeitos de triggers de automação/notificações. Índices/estratégia de matching de
contatos precisam ser avaliados; não criar UNIQUE de telefone/email às cegas.
Não é necessário multiempresa nem alteração de api_keys/stock_api_keys.

## Verificação local e pendências

```powershell
node --test tests/revendamais-processing.test.ts tests/revendamais-leads.test.ts tests/stock-api.test.ts tests/stock-key-admin.test.ts
```

Fixtures são explicitamente internas e fictícias. Não executar testes SQL nem
instalar dependências. Deno/typecheck dependem de ferramentas locais disponíveis.
Antes de receber eventos reais: contrato do fornecedor, isolamento do teste,
proteção de querystrings e volume, correções pendentes da auditoria 3.1.1,
adaptador confirmado, aprovação do banco, implementação transacional e testes
de concorrência/rollback/commit com resposta perdida. Nina SDR continua fora do
escopo; um futuro consumidor deverá usar somente eventos internos após commit.
