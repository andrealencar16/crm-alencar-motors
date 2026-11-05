# Revenda Mais — recepção local, etapa 3.1

> Histórico: o diagnóstico estrutural e suporte a formulário foram substituídos
> na etapa 3.4. O contrato atual e os bloqueios estão em
> `17-revendamais-http-persistence.md`. Nenhum ambiente remoto foi alterado.

Alerta informado: Novo Lead, ID 120618. Não configurado por esta implementação.
Nenhuma documentação do formato real foi encontrada no repositório (busca por
Revenda Mais/120618). `inbound-webhook` recebe entity/action/data e escreve no
banco: esse contrato não foi reaproveitado nem considerado contrato do provedor.
A nova função é independente e não usa cliente Supabase, banco ou armazenamento.

## Contrato provisório e autenticação

`POST /functions/v1/revendamais-leads?secret=<SEGREDO>`.
Sem CORS; OPTIONS e demais métodos retornam 405, Allow: POST.
`verify_jwt = false` somente nesta função permite chegar ao handler sem JWT.
O handler exige exatamente um parâmetro `secret`, igual a
`REVENDAMAIS_WEBHOOK_SECRET`, com 64 caracteres hexadecimais minúsculos.
Compara hashes SHA-256 percorrendo todos os bytes, sem saída antecipada.
Configuração ausente/inválida retorna 503; autenticação inválida retorna 401.
Não usar chaves de usuário, service role, API ou Stock API.

Em futura preparação operacional, gerar 32 bytes com CSPRNG e codificar em hex
(exemplo de algoritmo: `crypto.getRandomValues(new Uint8Array(32))`). Não executar
nem imprimir credencial agora. Validação de formato não comprova aleatoriedade:
a geração segura é uma responsabilidade de provisionamento.

Aceita provisoriamente application/json (também application/*+json), com raiz
objeto ou array, e application/x-www-form-urlencoded. Não exige campos de lead.
Formulários preservam apenas a contagem, inclusive campos repetidos; campos com
JSON embutido continuam classificados como strings. Outros tipos recebem 415.
Isso é suporte de diagnóstico, não confirmação do contrato Revenda Mais.
Corpo inválido, vazio, JSON primitivo, UTF-8 inválido ou falha de leitura: 400.
Limite: 65.536 bytes reais do stream, mesmo sem Content-Length ou com tamanho
subdeclarado; excesso: 413. Leitura limitada a 5 segundos; corpo comprimido não
é aceito. Falha inesperada: 500 genérico, sem mensagem da exceção.
Desde a etapa 3.2, corpo válido retorna 503 com
`{"status":"ingestion_not_enabled"}` após diagnóstico. Não existe persistência
durável e o receptor não confirma entrega. O fornecedor pode reenviar eventos;
não ativar o alerta com leads reais. Ver `14-revendamais-processing.md`.

## Diagnóstico sem dados pessoais

Somente uma entrada técnica por requisição aceita: evento fixo, formato
normalizado, número de bytes e árvore de tipos, contagens e truncamento.
Árvore limitada a profundidade 4, 64 nós e 12 filhos por nó.
As posições dos filhos seguem a ordem do objeto/array, sem nomes ou valores.
Não imprime nomes de campos, valores, conteúdo, hashes do conteúdo, URL, query,
cabeçalhos, IP, user-agent ou erros recebidos. Até nomes de campos podem conter
informações pessoais; por isso são omitidos. Não há diagnóstico de requisições
rejeitadas, evitando amplificação de logs por chamadas sem autenticação.
Dados pessoais podem existir transitoriamente no corpo em memória e são
descartados; não são persistidos pela aplicação. Metadados ainda precisam de
acesso restrito e retenção curta em eventual ambiente operacional.

Essa árvore identifica características gerais, não os nomes nem a semântica dos
campos. Antes do mapeamento, obter contrato oficial ou amostra inteiramente
sintética do provedor em canal seguro. Não habilitar log de payload para isso.

## Testes locais seguros

Sem Supabase, Docker, banco, rede ou credenciais:

```powershell
node --test tests/revendamais-leads.test.ts
```

Os testes chamam o mesmo handler com Request/Response e segredo determinístico
público (`a` repetido 64 vezes), exclusivamente fictício. Nunca usar esse valor
em URL acessível externamente. Incluem autenticação, métodos, tipos, limites,
timeout, respostas e ausência de dados pessoais/segredos no diagnóstico.

Opcional, somente em ambiente local isolado já preparado: colocar o segredo
fictício em arquivo temporário ignorado pelo Git, fora dos arquivos versionados,
como `REVENDAMAIS_WEBHOOK_SECRET=<fixture pública dos testes>`, e iniciar
`supabase functions serve revendamais-leads --env-file <arquivo-local>`.
Enviar exclusivamente dados fictícios ao endereço de loopback usando POST e
um dos tipos aceitos. Não iniciar stack, executar migrations ou conectar projeto
remoto como parte desta etapa. Não usar túneis, ferramentas de captura públicas,
curl verbose, screenshots da URL ou dados reais. Apagar arquivo temporário após
o teste. A validação automatizada não depende desse procedimento opcional.

## Antes de qualquer deploy ou evento real

- Provisionar segredo aleatório exclusivo no ambiente da função e URL do alerta
  por canal restrito, verificar configuração JWT e testar ausência de segredo em
  logs de gateway, proxy, observabilidade, painel e ferramentas do provedor.
- HTTPS obrigatório fora de loopback. Segredo em URL pode vazar em logs,
  histórico, monitoramento, backups e referer; HTTPS não elimina esses riscos.
  O handler não controla logs externos. Bloquear uso real até verificar
  redação/retenção/acesso na infraestrutura. Rotacionar se houver exposição.
- Confirmar Content-Type, raiz, tamanho, codificação, prazo de resposta,
  significado dos códigos HTTP, política de retry e duplicação com o Revenda
  Mais. O 503 atual não garante reenvio; não ativar com leads de produção.
- Segredo compartilhado não autentica criptograficamente a origem nem impede
  replay. Não há deduplicação, fila, persistência ou rate limiting distribuído.
  Definir proteção de volume e monitoramento antes de exposição pública.
- Definir contrato de campos e regras de negócio em etapa futura. Não criar
  contatos/negócios, integrar Nina SDR ou alterar os portais nesta fase.

Referências consultadas:
- [Supabase: configuração por função e verify_jwt](https://supabase.com/docs/guides/functions/function-configuration)
- [OWASP: exposição de informações em query strings](https://community.owasp.org/vulnerabilities/Information_exposure_through_query_strings_in_url)

Nenhum deploy, configuração do alerta, SQL, migration, acesso remoto,
credencial real, commit ou push foi realizado nesta etapa.
