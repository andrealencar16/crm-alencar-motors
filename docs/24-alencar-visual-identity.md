# Identidade visual Alencar Motors CRM

Identidade fixa em tokens CSS; sem temas por organização. Claro, escuro, sistema
e densidades existentes foram preservados. A preferência antiga `fc-accent` não
é mais lida e não sobrescreve a marca. Nenhum dado remoto foi alterado.

## Paleta

- Vinho principal: hsl(346 75% 32%), aproximadamente #8F1431.
- Hover: hsl(346 75% 26%).
- Vermelho do degradê: hsl(348 78% 45%), aproximadamente #CC193D.
- Grafite do menu: hsl(240 4% 9%), aproximadamente #161618.
- Fundo claro: hsl(240 5% 96%), aproximadamente #F4F4F5; cartões brancos.
- Primária escura: hsl(346 70% 43%); foco rosa claro para contraste.
- Sucesso, aviso, erro e cores de categorias/status existentes não foram alterados.

Tokens em src/index.css e mapeamento em tailwind.config.ts. Sombras surface e
overlay e raios compartilhados evitam estilos repetidos por página. Espaçamentos
permanecem na escala Tailwind existente; nenhum layout comercial foi reorganizado.

## Componentes e páginas

Button, Card, Input, Textarea, Select, Table, Dialog, AlertDialog e Sheet herdam a
mesma identidade. A gaveta Leads Pendentes herda esses componentes sem alteração
no seu processamento. Menu lateral usa tokens sidebar em ambos os modos, inclusive
item ativo e estados de hover. Dashboard, Contatos, Negócios, Atividades e demais
páginas que usam componentes/tokens compartilhados recebem a nova paleta.

Login mantém os handlers, campos e fluxo existentes. Apenas a apresentação passa
a cartão centralizado responsivo com cabeçalho vinho/vermelho e sem transições de
painel. Logo oficial será fornecida posteriormente pelo usuário; identificação
provisória é texto simples, sem reconstrução ou criação de logo.

Arquivos de implementação alterados:

- src/index.css; tailwind.config.ts; index.html.
- src/contexts/ThemeContext.tsx; src/pages/Settings.tsx.
- src/components/auth/auth.css; src/components/auth/LoginSignupForm.tsx.
- src/components/layout/AppSidebar.tsx; src/components/layout/AppHeader.tsx.
- src/components/ui/{button,card,input,textarea,select,table,dialog,alert-dialog,sheet}.tsx.
- src/pages/{Dashboard,Setup,Integrations}.tsx.
- src/components/onboarding/{WelcomeStep,TermosStep,CompleteStep,SlackStep,AICopilotStep}.tsx.
- src/components/setup/StepComplete.tsx.

## Pendências

Inserir a logo oficial quando fornecida. Não houve revisão visual autenticada de
todas as páginas com dados reais; nenhum dado real é necessário para homologar a
identidade. Cores azuis que representam categoria de atividade, auditoria ou métrica
foram preservadas por terem significado semântico, não por serem marca do produto.
Configurações funcionais, prompts e mensagens de integrações externas não foram
alterados para evitar efeitos fora da apresentação.

## Validação

Build Vite aprovado; avisos de Browserslist desatualizado e bundles acima de 500 kB.
Vitest: 19 testes aprovados, incluindo primeiro acesso e gaveta de leads. Suíte
Node: 106 testes aprovados. Não foram instaladas bibliotecas, nem executados deploy,
migrations, mudanças de autenticação, permissões ou webhook.

TypeScript (`tsc --noEmit -p tsconfig.app.json`) aprovado e diff sem erros de
whitespace. A revisão visual automatizada desktop/mobile não foi concluída: Edge
headless não iniciou no sandbox e, fora dele, não alcançou o servidor isolado. A
autorização para iniciar o servidor fora do sandbox não foi concedida. Servidores
temporários foram encerrados. Não considerar todas as páginas visualmente homologadas.
