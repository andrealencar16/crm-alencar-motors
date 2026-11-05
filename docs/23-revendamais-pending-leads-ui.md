# Gaveta de leads pendentes — etapa 3.5.3

Implementação local na barra superior de `/deals`, sem alteração visual nos cartões
ou na tabela. Não aplica SQL, não ativa webhook e não cria negócios automaticamente.

## Ativação futura

O botão Leads Pendentes abre o Sheet existente. O recurso começa desabilitado:
sem `VITE_REVENDAMAIS_REVIEW_ENABLED=true`, mostra integração indisponível e não
faz chamadas adicionais de leitura/aprovação. Nenhum .env foi alterado nesta etapa.
Essa flag é uma chave de disponibilização da interface, não uma autorização.
Somente habilitá-la em ambiente autorizado após aplicar/homologar 0011/0012 e
validar permissões; não apontar testes locais para o Lovable operacional.

A interface usa o cliente Supabase autenticado existente. Não recebe service_role,
organização, vendedor ou permissões. A autorização efetiva permanece nas RPCs e
em user_roles, independentemente dos dados do perfil usados pela página existente.

## Contrato e estados

- Contador: `total` retornado por `get_pending_revendamais_leads`, sem contar
  tentativas ou linhas da página no frontend. Páginas de 50 com p_offset.
- Lista e revisão: nome, canais de contato disponíveis, portal/canal, título,
  recebimento real e quantidade de tentativas apenas para identidade consistente.
  Data original permanece texto, com aviso de fuso não informado. Sem dados
  inventados e sem HTML bruto. O DTO atual não oferece mensagem com prova de
  autoria/retenção; por isso nenhuma mensagem é exibida.
- Seleção e confirmação via AlertDialog precedem a única escrita:
  `approve_revendamais_lead({p_receipt_id})`. Não há consultas aos recibos nem
  inserções diretas de contato, negócio ou atividade neste componente.
- approved e already_processed têm avisos distintos. Ambos recarregam a primeira
  página e executam fetchData da página Negócios, atualizando Kanban/Lista.
- conflict mantém o item e mostra motivo traduzido. Bloqueios preliminares da
  listagem desabilitam aprovação; conflitos de contato/configuração continuam
  sendo decididos exclusivamente pelo servidor.
- Carregamento, zero confirmado, erro e RPC ausente têm estados distintos.
  PGRST202/42883 mostram integração indisponível; erros brutos não são exibidos
  nem registrados. Falha de rede não é apresentada como rollback confirmado.
- Atualização/paginação limpam seleção. Cliques concorrentes na aprovação são
  bloqueados e respostas antigas de listagem são ignoradas. Troca de usuário
  remonta o componente; nenhum cache persistente de leads é criado.

O bridge TypeScript é restrito às duas RPCs porque os tipos Supabase gerados
ainda não incluem o schema operacional futuro. Respostas são validadas e campos
extras descartados. Não altera os tipos gerados nem contorna RPC ausente.

## Validação local

`node --test tests/revendamais-review-client.test.ts`: oito testes de transporte,
validação do contrato, erros, resultado durável e limites estáticos da interface.
Sem rede ou dados reais. A suíte Node completa também pode ser executada com os
arquivos `tests/*.test.ts`.

`src/test/pending-revendamais-leads.test.tsx` prepara testes Vitest/Testing Library
com Supabase e autenticação simulados: confirmação, espera pelo resultado,
approved/already_processed/conflict, RPC ausente e vazio confirmado. Exige as
dependências já declaradas no projeto; não instalar automaticamente. Build,
TypeScript e interação visual precisam ser validados quando essas dependências
estiverem disponíveis. Não iniciar o app conectado ao banco operacional para
testar essa funcionalidade.
