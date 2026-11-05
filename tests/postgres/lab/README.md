# Laboratório Revenda Mais — PostgreSQL 17 descartável

> Atualização 3.4.11: a versão local da 0011 agora reconhece retries por dealer e
> array completo/unânime de interations[].lead_id. Recibos continuam distintos;
> arrays vazios/divergentes não associam. Esta versão requer NOVO ciclo no laboratório
> descartável, antes de Concurrency. Ver `docs/21-revendamais-retry-submission.md`.

> Atualização 3.4.8: ID do fornecedor é de tentativa, não interesse. Fixtures agora
> verificam revisão durável de cada entrega e relação comercial possível, sem
> criação automática. Não esperar created+duplicate. Contrato atual descrito em
> `docs/20-revendamais-delivery-idempotency.md` na raiz do repositório.

PREPARADO, NÃO INICIALIZADO. Nenhum SQL foi executado na etapa 3.4.6.
Não usar Lovable Cloud, Supabase operacional, URL do CRM nem dados reais.

## Ferramentas e instalação futura

Verificação desta etapa: Node/npm disponíveis; docker, psql e postgres ausentes
do PATH. Não foram instalados componentes. Esta é a rota Windows/Docker Desktop;
PostgreSQL e psql ficam na imagem, sem instalação nativa adicional.

Somente depois de autorização de instalação:
1. Conferir Windows/virtualização e requisitos atuais na
   [documentação oficial Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/).
2. Preparar WSL 2 conforme essa documentação, se necessário, instalar Docker
   Desktop e selecionar backend Linux/WSL 2. Reiniciar se o instalador exigir.
   Nenhum desses passos é executado pelo runner.
3. Verificar manualmente que o Docker Engine local está disponível. O runner usa
   exclusivamente `npipe:////./pipe/docker_engine`, nunca contexto remoto.
4. Baixar explicitamente a imagem oficial. Este comando é futuro, NÃO executado:

```powershell
docker --host npipe:////./pipe/docker_engine pull postgres:17-bookworm
```

A imagem fixa a major 17, com patch atualizado pela tag. Registrar seu digest no
resultado da homologação para reproduzir a mesma imagem. PostgreSQL executado
também é validado como major 17. Referência: [imagem oficial](https://hub.docker.com/_/postgres).

Somente para o harness Node de concorrência, em etapa autorizada de instalação:

```powershell
npm --prefix tests/postgres/lab install --ignore-scripts --no-audit --no-fund
```

Instala apenas o driver postgres 3.4.9 no package separado do laboratório. Não
executar npm ci no CRM para essa finalidade; nenhum runner instala dependências.
Sem driver, bootstrap/migration/teste SQL ainda usam psql dentro do container;
concorrência Node fica pendente. Não há dependência de Supabase CLI ou Deno para
os testes SQL. A validação do runtime Edge Function é uma homologação separada.

## Identidade e limites

Configuração única em settings.json, só fixtures públicas, sem segredos reais:
- Container exato: alencar-revendamais-pg17-lab, label de laboratório pg17-v1.
- Imagem postgres:17-bookworm, dados em tmpfs, sem bind mounts nem volumes de dados.
- Única publicação: 127.0.0.1:55432 → 5432. NÃO alterar para 0.0.0.0.
- Database revendamais_leads_test e login proprietário revendamais_lab.
- Senha é fixture pública descartável, não credencial operacional. Não reutilizar.
- Organização sintética única Alencar Motors. Nenhuma organização real é copiada.

Loopback não é controle de acesso entre usuários locais. Usar computador confiável
e ambiente efêmero; nunca dados reais. A imagem não recebe arquivos, credenciais
ou configuração do CRM. Nenhum .env é lido/montado. Não há conexão com projetos
Supabase nem uso de LOVABLE_DB_MIGRATION_URL.

O bootstrap reproduz somente campos e relações usados pela 0011: organizations,
contacts, deals com vehicle_id nullable, activities, enums, main_org_id(), auth.role()
e pgcrypto em extensions. Não cria vehicles, user_roles, auth.users ou um Auth
server porque a RPC não os consulta. Papéis anon/authenticated/service_role são
NOLOGIN; service_role tem BYPASSRLS como papel de serviço, mas não grants diretos
nos recibos. Claim role é emulação controlada pelo owner local, NÃO valida JWT.
Não representa todos os triggers/RLS/automações do ambiente operacional.

## Inicialização futura, por fases explícitas

Executar a partir da raiz do repositório, após autorização para inicializar banco
local/executar SQL. Usar sessão sem overrides DOCKER_HOST/DOCKER_CONTEXT/etc.
Nenhum comando abaixo foi executado nesta preparação.

```powershell
.\tests\postgres\lab\Lab.ps1 -Action Start
.\tests\postgres\lab\Lab.ps1 -Action Bootstrap
.\tests\postgres\lab\Lab.ps1 -Action Migrate
.\tests\postgres\lab\Lab.ps1 -Action Verify
```

Start exige imagem já presente (`--pull=never`), nome ainda não ocupado, cria
somente o container fixo e espera healthcheck por no máximo 30 segundos. Não
auto-reutiliza nem apaga container anterior. Dados são voláteis: ao parar/reiniciar
o container podem desaparecer, enquanto o entrypoint pode recriar só o cluster.
Para repetir, destruir e iniciar laboratório novo; não tentar recuperar dados.

Bootstrap executa bootstrap.sql em transação única. É intencionalmente de execução
única: segunda execução deve falhar, não alterar/mesclar ambiente existente.
Migrate valida marcador e aplica SOMENTE drizzle/migrations/0011...sql, inteira
em uma transação. Não chama Drizzle Kit nem carrega migration URL/journal do CRM.
Verify lê catálogos, grants, RLS, owner/search_path e dependências. Qualquer erro
interrompe a fase; não trocar URL/banco para fazer o teste passar.

## Testes SQL e concorrência futuros

```powershell
.\tests\postgres\lab\Lab.ps1 -Action SqlTests
.\tests\postgres\lab\Lab.ps1 -Action Concurrency
```

SqlTests executa a fixture existente via psql -X/ON_ERROR_STOP. Ela exige tabelas
CRM vazias e termina em ROLLBACK. Valida recibos por tentativa, comparação comercial
sem descarte, metadados, omissão de texto sem autorização e falha de persistência.
Os triggers de falha são da fixture e desaparecem no rollback. Isso não torna
seguro executar a fixture na base operacional: triggers externos poderiam ter
efeitos fora da transação. Aqui não existe acesso a dados/serviços reais.

Concurrency exige o driver separado já instalado, usa duas sessões reais e faz
COMMIT de fixtures: quatro tentativas simultâneas geram quatro revisões distintas
e relação comercial possível; títulos diferentes do mesmo contato também são
preservados, sem criar contatos/negócios automaticamente. Deve ser o último
teste porque deixa as tabelas preenchidas. Para repetir, destruir/recriar lab.
Harness exige opt-in, loopback, porta/usuário/senha/database exatos, sem query,
sem fragmento, sem DNS ou PG* overrides; verifica container e marcador/version
antes de qualquer escrita. Lab.ps1 define temporariamente SOMENTE a URL pública
de fixture do laboratório e restaura o ambiente ao sair.

Ainda são necessários em etapa futura testes de UI concorrente/NOWAIT, timeout
efetivo e resposta perdida após commit. Os testes reais acima continuam não
executados nesta etapa. Schema mínimo não atesta equivalência com Lovable Cloud.

## Proteções e descarte

Lab.ps1 verifica nome, label, imagem, tmpfs e publicação loopback antes de qualquer
SQL ou destruição. SQL é enviado só ao Unix socket do PostgreSQL dentro desse
container via docker exec. O harness rejeita URL remota ANTES de Docker/driver/SQL
e usa opções de conexão explícitas; não aceita query de URL para trocar host.
Postgres confirma nome/major/user/marcador sintético para operações pós-bootstrap.

```powershell
.\tests\postgres\lab\Lab.ps1 -Action Status
.\tests\postgres\lab\Lab.ps1 -Action Destroy
```

Destroy remove à força APENAS o container fixo após validar propriedade e storage.
Funciona também com container parado. tmpfs é descartado. Não executa SQL DROP,
docker prune, remoção recursiva de pastas, limpeza de outros containers ou remoção
de imagem. Se identidade divergir, recusa apagar: investigar manualmente, sem
contornar guardas. Nenhuma pasta do host está montada para ser removida.

## Checks permitidos sem banco

```powershell
node --test tests/revendamais-lab-guards.test.ts
node --check tests/postgres/lab-connection.mjs
node --check tests/postgres/revendamais-concurrency.mjs
```

Testes de guardas usam apenas URLs/snapshots fictícios. Uma chamada propositalmente
remota ao harness é testada e rejeitada antes de qualquer conexão; Docker e driver
não são executados nessa chamada. Lab.ps1 foi apenas analisado pelo parser do
PowerShell. Bootstrap/SQL/runner precisam de execução autorizada em laboratório
para serem considerados validados. Flags do webhook não são alteradas por estes
arquivos. Nenhum deploy ou alerta Revenda Mais faz parte do laboratório.
