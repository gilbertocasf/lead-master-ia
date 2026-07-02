# Auditoria local - Lead Master IA - 2026-07-02

## 1. Resumo executivo

Auditoria tecnica e funcional realizada localmente no projeto Lead Master IA, em modo leitura, sem executar migrations, sem alterar banco, sem alterar variaveis, sem commit, sem push e sem deploy.

O build de producao passou com sucesso em Next.js 14.2.5. O `npm audit` retornou 8 vulnerabilidades, incluindo 1 critica em `next`, exigindo atualizacao planejada.

O modelo geral de seguranca esta bem direcionado: RLS por tenant, helpers `SECURITY DEFINER` com `search_path`, APIs server-side com `service_role`, `/setup-cliente` protegido por usuario autenticado e allowlist de e-mails internos, e RPC `criar_e_distribuir_lead` restrita ao `service_role`.

O principal problema real encontrado e critico: a rota de alteracao de status de lead nao bloqueia `captador`. Como a rota usa `service_role` e so valida explicitamente `gestor` e `corretor`, um captador autenticado pode chamar diretamente `PATCH /api/leads/[id]/status` e alterar o status de qualquer lead da mesma imobiliaria, nao apenas dos leads captados por ele.

Tambem ha riscos importantes de integridade multi-tenant em edicao de corretor/equipe, exposicao de detalhe interno de erro em uma API, fluxo visual incompleto para distribuicao manual de leads sem corretor, e mensagens pre-demo que mencionam migrations/tabelas/campos tecnicos para usuario final.

## 2. Achados criticos

### C1 - Captador pode alterar status de leads pela API

**Severidade:** Critica  
**Arquivo:** `app/api/leads/[id]/status/route.ts`  
**Linhas relevantes:** 71-108 e 110-118

O endpoint valida escopo apenas para `gestor` e `corretor`:

- Gestor: verifica se o lead pertence a sua equipe.
- Corretor: verifica se o lead pertence ao seu cadastro de corretor.
- Captador: nao entra em nenhum desses blocos e segue direto para a RPC com `service_role`.

Trecho relevante observado:

- linha 72: `if (usuario.role === "gestor")`
- linha 89: `if (usuario.role === "corretor")`
- linha 111: chamada `admin.rpc("alterar_status_lead", ...)`
- linhas 113-116: payload usa `lead_id`, `status_novo`, `imobiliaria_id` e `usuario_id`

Impacto:

- Captador autenticado pode alterar status de leads que nao captou, desde que saiba ou descubra o ID do lead dentro da mesma imobiliaria.
- Como a rota usa `service_role`, o RLS nao protege esse caminho.
- O texto da UI diz que captador tem pipeline em leitura, mas a API permite escrita.

Recomendacao:

- Bloquear explicitamente `captador` nessa rota com 403.
- Opcionalmente permitir somente leitura para captador e manter alteracao de status apenas para `admin`, `gestor` e `corretor` atribuido.
- Adicionar teste/API check cobrindo captador tentando alterar lead proprio e lead de outro usuario.

## 3. Achados importantes

### I1 - Edicao de corretor permite vincular equipe sem validar imobiliaria da equipe

**Severidade:** Alta  
**Arquivo:** `app/api/corretores/[id]/route.ts`  
**Linhas relevantes:** 147-159 e 209-213

Na edicao do corretor, o codigo valida que o corretor pertence a imobiliaria do admin nas linhas 130-135. Porem, quando recebe `equipe_id`, busca a equipe apenas por `id`, sem `imobiliaria_id`:

- linha 150: `admin.from("equipes")`
- linha 153: `.eq("id", String(equipe_id))`
- linha 154: `.single()`
- linha 210-213: aplica `update(updates).eq("id", corretor_id)`

Impacto:

- Um admin poderia, via chamada direta de API, mover um corretor da sua imobiliaria para uma equipe de outro tenant se conhecer o UUID da equipe.
- Isso cria inconsistencia de dados multi-tenant. Dependendo das FKs/policies e consultas futuras, pode gerar vazamento indireto ou quebra de visibilidade.

Recomendacao:

- Validar `equipe_id` com `.eq("imobiliaria_id", usuario.imobiliaria_id)`.
- Aplicar update tambem com `.eq("imobiliaria_id", usuario.imobiliaria_id)` como defesa adicional.

### I2 - Verificacao de conflito de usuario_id nao filtra por imobiliaria

**Severidade:** Media/Alta  
**Arquivo:** `app/api/corretores/[id]/route.ts`  
**Linhas relevantes:** 184-190

A checagem de conflito de vinculo do `usuario_id` consulta `corretores` por `usuario_id` e `neq("id", corretor_id)`, sem filtrar `imobiliaria_id`.

Impacto:

- Pode bloquear indevidamente uma operacao se houver algum dado inconsistente em outro tenant.
- Como `usuario_id` e validado antes como pertencente a mesma imobiliaria, o risco de exploracao e menor, mas ainda e uma fragilidade de isolamento em caminho com `service_role`.

Recomendacao:

- Adicionar `.eq("imobiliaria_id", usuario.imobiliaria_id)` na consulta de conflito.

### I3 - `POST /api/leads` expoe detalhe interno de erro da RPC ao cliente

**Severidade:** Media  
**Arquivo:** `app/api/leads/route.ts`  
**Linhas relevantes:** 202-221

Erros conhecidos sao tratados com codigos amigaveis. Para erro desconhecido, a resposta inclui:

- `detalhe: rpcError.message`
- `codigo: rpcError.code`

Impacto:

- Pode expor detalhes de schema, constraints, casts, nomes internos ou mensagens do Postgres para usuario autenticado.
- Em demo, mensagens tecnicas podem assustar cliente.

Recomendacao:

- Logar detalhes no servidor.
- Responder ao cliente apenas `{ erro: "erro_interno" }` ou mensagem funcional controlada.

### I4 - Botao "Distribuir" de leads na fila ainda nao executa distribuicao manual

**Severidade:** Alta funcional pre-demo  
**Arquivo:** `app/(app)/leads/page.tsx` e `components/ui/ComingSoonButton.tsx`  
**Linhas relevantes:** `app/(app)/leads/page.tsx:322-324`

Leads sem corretor aparecem na fila, mas o botao `Distribuir` e um `ComingSoonButton` que mostra "Disponivel em breve".

Impacto:

- Se a distribuicao automatica falhar por falta de corretor em plantao, o lead fica sem caminho operacional pela UI.
- Em demo, um botao principal aparentemente quebrado passa percepcao de produto incompleto.

Recomendacao:

- Antes da demo, ocultar o botao ou implementar distribuicao manual.
- Se nao for implementar agora, trocar por estado informativo claro: "Ative um corretor em plantao para distribuir automaticamente".

### I5 - Mensagens para usuario final citam migration e campos/tabelas internos

**Severidade:** Media UX/pre-demo  
**Arquivos:**

- `app/(app)/leads/page.tsx`
- `app/(app)/pipeline/page.tsx`
- `app/(app)/page.tsx`
- `app/(app)/corretores/page.tsx`
- `app/(app)/equipes/page.tsx`

Exemplos observados:

- `app/(app)/leads/page.tsx:115`: "migration 007 pode nao ter sido aplicada"
- `app/(app)/leads/page.tsx:42`: instrui preencher `usuario_id` na tabela `corretores`
- `app/(app)/leads/page.tsx:76`: instrui preencher `equipe_id` na tabela `usuarios`
- mensagens similares aparecem em dashboard, pipeline, corretores e equipes.

Impacto:

- Texto tecnico exposto ao cliente final.
- Passa sensacao de sistema em manutencao ou inacabado.

Recomendacao:

- Trocar por mensagens operacionais: "Seu acesso ainda nao foi configurado. Solicite ajuste ao administrador."
- Manter detalhes tecnicos somente em logs/admin interno.

### I6 - `fetchUsuarioAtual` tipa retorno sem incluir `captador`

**Severidade:** Media tecnica  
**Arquivo:** `lib/supabase-queries.ts`  
**Linhas relevantes:** 64 e retorno perto de 85-91

A interface `UsuarioAtual` inclui `captador`, mas o cast de retorno observado no arquivo restringe o role a `"admin" | "gestor" | "corretor"` em parte do mapeamento.

Impacto:

- O build atual passa, mas o tipo esta incoerente com a regra de negocio.
- Pode ocultar erro futuro em refactor ou gerar comportamento ruim em pontos que dependam de narrowing de TypeScript.

Recomendacao:

- Ajustar o cast para incluir `"captador"` e preferir funcao validadora de role.

### I7 - Modo captador usa `service_role` no carregamento de corretores e vendas

**Severidade:** Media  
**Arquivo:** `lib/supabase-queries.ts`  
**Linhas relevantes:** 257-320

No escopo de captador, o codigo usa `createSupabaseAdmin()` para carregar corretores e depois vendas de leads captados:

- linhas 257-263: cria admin client
- linhas 266-272: busca corretores via admin
- linhas 314-317: busca vendas via admin por `lead_id`

Impacto:

- A filtragem esta codificada manualmente e depende da disciplina da aplicacao.
- Como a migration 007 ja cria policies de captador para corretores/vendas, o uso de `service_role` aqui aumenta superficie de erro sem necessidade clara.

Mitigacao existente:

- Corretores filtram `imobiliaria_id` e nao selecionam email.
- Vendas filtram pelos IDs de leads retornados via RLS do captador.

Recomendacao:

- Preferir client normal com RLS para captador, salvo necessidade comprovada.
- Se mantiver admin client, adicionar testes de isolamento e filtros de tenant em todas as consultas.

## 4. Achados menores

### M1 - Dashboard e telas usam mock local em desenvolvimento sem Supabase

**Arquivos:** `lib/supabase.ts`, `lib/supabase-queries.ts`, `lib/mock-data.ts`, `middleware.ts`

O comportamento e intencional em desenvolvimento: sem env vars Supabase, `isMockMode` fica ativo fora de producao e o middleware libera acesso. Em producao sem env vars, o middleware retorna 503.

Risco:

- Em demo local, dados ficticios podem aparecer se `.env.local` nao estiver configurado.

Recomendacao:

- Antes da demo, confirmar visualmente que o ambiente esta em Supabase mode e com usuario real.

### M2 - Dados reais perdem campos que existem no mock

**Arquivo:** `lib/supabase-queries.ts`

Ao mapear leads reais, `regiao` e `captadorNome` ficam vazios para varios roles. Vendas reais tambem nao carregam `imovel`.

Impacto:

- Algumas telas podem parecer mais pobres em dados reais do que no mock.
- Pipeline mostra `regiao`/`faixaValor`; `regiao` tende a ficar vazia.

Recomendacao:

- Alinhar schema real e UI: ou adicionar campos reais, ou remover exibicao que so existe no mock.

### M3 - Textos com caracteres corrompidos em arquivos lidos no terminal

Varios arquivos apareceram com sequencias como `UsuÃ¡rio`, `ImobiliÃ¡ria`, `VocÃª` na leitura do PowerShell. Pode ser apenas diferenca de encoding do terminal, pois o build passou.

Recomendacao:

- Validar no navegador. Se aparecer corrompido para o usuario, padronizar encoding UTF-8 dos arquivos.

### M4 - `/setup-cliente` usa senha manual inicial

**Arquivo:** `app/setup-cliente/actions.ts`  
**Linhas relevantes:** 78-86

O proprio codigo documenta pendencia futura para convite por e-mail. A senha nao e logada, mas precisa ser transmitida por operador.

Recomendacao:

- Pos-demo, trocar para invite/reset de senha.

## 5. Falsos positivos / pontos que parecem problema mas nao sao

### FP1 - `service_role` existe, mas nao esta exposto ao browser

**Arquivo:** `lib/supabase-admin.ts`

O modulo verifica `typeof window !== "undefined"` e usa `SUPABASE_SERVICE_ROLE_KEY` sem prefixo `NEXT_PUBLIC_`. Nao encontrei import direto dele em Client Component. O uso em API routes/server actions e esperado.

### FP2 - `/setup-cliente` nao e publico para qualquer visitante

**Arquivos:** `app/setup-cliente/page.tsx` e `app/setup-cliente/actions.ts`

A pagina exige usuario autenticado e e-mail presente em `INTERNAL_OWNER_EMAILS`. A action repete a checagem, o que e correto. Se a allowlist estiver vazia, nega acesso.

### FP3 - Captador nao escolhe corretor ao criar lead

**Arquivo:** `app/api/leads/route.ts`

O endpoint ignora `corretor_id` quando `usuario.role === "captador"` e define `captador_id` pelo perfil autenticado. Isso esta correto.

### FP4 - RPC `criar_e_distribuir_lead` esta bem endurecida

**Arquivo:** `supabase/migrations/007_captador_role.sql`

A migration v3 valida `captador_id`, usa `SECURITY DEFINER` com `search_path`, faz deduplicacao com advisory lock, valida equipe/corretor por imobiliaria e revoga execucao publica da RPC, concedendo apenas ao `service_role`.

### FP5 - RLS de captador em leads existe

**Arquivo:** `supabase/migrations/007_captador_role.sql`

A policy `leads_select_captador` filtra por `captador_id = current_usuario_id()`. O problema critico nao esta nessa policy; esta na API de alteracao de status que usa `service_role`.

## 6. Recomendacoes priorizadas

1. Corrigir imediatamente `PATCH /api/leads/[id]/status` para bloquear `captador` e negar qualquer role nao explicitamente permitida.
2. Corrigir validacoes multi-tenant em `PATCH /api/corretores/[id]`: validar `equipe_id` por `imobiliaria_id`, filtrar conflito por `imobiliaria_id` e aplicar update com tenant.
3. Remover `detalhe: rpcError.message` das respostas publicas da API.
4. Resolver o botao `Distribuir`: implementar ou remover antes da demo.
5. Substituir mensagens tecnicas de migration/tabela/campo por mensagens funcionais.
6. Atualizar Next.js para versao segura compativel, com build/teste completos.
7. Rever uso de `service_role` em consultas de leitura do captador e preferir RLS.
8. Alinhar dados reais vs mock para `regiao`, `captadorNome` e `imovel`.

## 7. Plano de correcao em fases

### Fase 0 - Bloqueio de seguranca antes de demo

- Bloquear captador em `PATCH /api/leads/[id]/status`.
- Garantir deny-by-default para roles nao esperadas.
- Adicionar teste manual/API:
  - captador tentando alterar lead proprio: 403
  - captador tentando alterar lead de outro captador: 403
  - corretor alterando lead atribuido: 200
  - corretor alterando lead alheio: 403
  - gestor alterando lead da equipe: 200
  - gestor alterando lead de outra equipe: 403

### Fase 1 - Isolamento multi-tenant em APIs com service_role

- Revisar todos os endpoints que usam `createSupabaseAdmin()`.
- Em toda leitura/update/delete por ID, adicionar tambem `imobiliaria_id`.
- Corrigir `PATCH /api/corretores/[id]`.
- Criar checklist padrao: "se usa service_role, todo filtro deve validar tenant manualmente".

### Fase 2 - Acabamento pre-demo

- Remover textos de migration/tabela/campo da UI.
- Resolver botao `Distribuir`.
- Melhorar empty states.
- Confirmar que demo local esta usando Supabase real, nao mock.

### Fase 3 - Dependencias e hardening

- Atualizar Next.js para versao corrigida.
- Rodar build, lint/testes e smoke test de rotas protegidas.
- Avaliar atualizacao de `eslint-config-next`, `postcss`, `minimatch` e `glob`.

### Fase 4 - Produto e schema

- Alinhar campos mock vs reais.
- Decidir se `regiao`, `captadorNome` e `imovel` entram no schema ou saem da UI.
- Trocar senha manual do `/setup-cliente` por invite/reset.

## 8. Lista de arquivos analisados

- `package.json`
- `package-lock.json`
- `middleware.ts`
- `lib/supabase.ts`
- `lib/supabase-browser.ts`
- `lib/supabase-server.ts`
- `lib/supabase-admin.ts`
- `lib/supabase-queries.ts`
- `lib/auth.ts`
- `lib/types.ts`
- `lib/mock-data.ts`
- `app/api/leads/route.ts`
- `app/api/leads/[id]/status/route.ts`
- `app/api/corretores/route.ts`
- `app/api/corretores/[id]/route.ts`
- `app/api/equipes/route.ts`
- `app/api/equipes/[id]/route.ts`
- `app/setup-cliente/page.tsx`
- `app/setup-cliente/actions.ts`
- `app/setup-cliente/SetupClienteForm.tsx`
- `app/(app)/page.tsx`
- `app/(app)/leads/page.tsx`
- `app/(app)/pipeline/page.tsx`
- `app/(app)/ranking/page.tsx`
- `app/(app)/corretores/page.tsx`
- `app/(app)/equipes/page.tsx`
- `components/NovoLeadModal.tsx`
- `components/pipeline/StatusDropdown.tsx`
- `components/ui/ComingSoonButton.tsx`
- `components/Sidebar.tsx`
- `components/Topbar.tsx`
- `components/AppShell.tsx`
- `supabase/migrations/001_fase5_schema_minimo.sql`
- `supabase/migrations/002_security_rls_multitenancy.sql`
- `supabase/migrations/003_rpc_criar_lead.sql`
- `supabase/migrations/004_rpc_alterar_status.sql`
- `supabase/migrations/005_rpc_criar_lead_v2.sql`
- `supabase/migrations/006_usuarios_equipe_id.sql`
- `supabase/migrations/007_captador_role.sql`
- `supabase/migrations/008_imobiliarias_ativo.sql`
- `supabase/schema.sql`
- `supabase/schema.v2.sql`
- documentacao existente em `docs/auditorias` e `docs/respostas` foi localizada em buscas, mas nao foi tratada como fonte de verdade acima do codigo atual.

## 9. Comandos executados

Comandos de leitura/diagnostico:

- `git status --short`
- `git diff --stat`
- `git log --oneline -5`
- `Get-Location`
- `Get-ChildItem -Force`
- `rg --files`
- `Get-Content -Path package.json`
- `Get-Content -Path middleware.ts`
- `Get-ChildItem -Force supabase\migrations`
- `rg "service_role|SERVICE|SUPABASE|createClient|rpc\(|criar_e_distribuir_lead|mock|fake|placeholder|demo|TODO|FIXME|role|perfil|captador|gestor|corretor|admin|imobiliaria_id|RLS|policy|POLICY" app components lib supabase middleware.ts package.json -n`
- `Get-Content -Path lib\supabase-admin.ts`
- `Get-Content -Path lib\supabase-server.ts`
- `Get-Content -Path lib\supabase-queries.ts`
- `Get-Content -Path lib\auth.ts`
- `Get-Content -Path lib\mock-data.ts`
- `Get-Content -Path app\api\leads\route.ts`
- `Get-Content -LiteralPath 'app\api\leads\[id]\status\route.ts'`
- `Get-Content -Path app\api\corretores\route.ts`
- `Get-Content -LiteralPath 'app\api\corretores\[id]\route.ts'`
- `Get-Content -Path app\api\equipes\route.ts`
- `Get-Content -LiteralPath 'app\api\equipes\[id]\route.ts'`
- `Get-Content -Path app\setup-cliente\actions.ts`
- `Get-Content -Path app\setup-cliente\page.tsx`
- `Get-Content -Path app\setup-cliente\SetupClienteForm.tsx`
- `Get-Content -Path lib\supabase.ts`
- `Get-Content -Path lib\supabase-browser.ts`
- `Get-Content -Path lib\types.ts`
- `Get-Content -Path app\(app)\page.tsx`
- `Get-Content -Path app\(app)\leads\page.tsx`
- `Get-Content -Path app\(app)\pipeline\page.tsx`
- `Get-Content -Path app\(app)\ranking\page.tsx`
- `Get-Content -Path app\(app)\corretores\page.tsx`
- `Get-Content -Path app\(app)\equipes\page.tsx`
- `Get-Content -Path components\NovoLeadModal.tsx`
- `Get-Content -Path components\pipeline\StatusDropdown.tsx`
- `Get-Content -Path components\ui\ComingSoonButton.tsx`
- `Get-Content -Path supabase\migrations\002_security_rls_multitenancy.sql`
- `Get-Content -Path supabase\migrations\004_rpc_alterar_status.sql`
- `Get-Content -Path supabase\migrations\006_usuarios_equipe_id.sql`
- `Get-Content -Path supabase\migrations\007_captador_role.sql`
- `Get-Content -Path supabase\migrations\008_imobiliarias_ativo.sql`
- `Select-String` e `rg -n` para localizar evidencias com linhas.
- Comandos PowerShell de numeracao de linhas com `Get-Content` em rotas sensiveis.

Comandos de build/audit:

- `npm run build`
- `npm audit`  
  Resultado: falhou via `npm.ps1` por Execution Policy do PowerShell.
- `npm.cmd audit`  
  Resultado: falhou inicialmente por erro do endpoint/log do npm no sandbox.
- `npm.cmd audit` fora do sandbox, apenas diagnostico, sem `audit fix`  
  Resultado: retornou vulnerabilidades listadas abaixo.

Comandos com erros nao destrutivos:

- Algumas leituras de paths com `[id]` usando `Get-Content -Path` falharam porque PowerShell interpreta colchetes como padrao. Foram refeitas com `-LiteralPath`.
- Algumas buscas `Select-String`/`rg` com aspas e pipes falharam por escaping no PowerShell. Foram substituidas por buscas mais simples e leitura numerada.

## 10. Resultado do build, se executado

### Build

Comando:

```powershell
npm run build
```

Resultado:

- Sucesso.
- Next.js: 14.2.5.
- Ambiente: `.env.local`.
- Compilacao: `Compiled successfully`.
- Type check/lint do build: passou.
- Rotas geradas: 14/14.

Resumo de rotas:

- `/`
- `/login`
- `/setup-cliente`
- `/leads`
- `/pipeline`
- `/ranking`
- `/corretores`
- `/equipes`
- APIs: `/api/leads`, `/api/leads/[id]/status`, `/api/corretores`, `/api/corretores/[id]`, `/api/equipes`, `/api/equipes/[id]`

### npm audit

Comando final executado:

```powershell
npm.cmd audit
```

Resultado:

- 8 vulnerabilidades:
  - 1 moderada
  - 6 altas
  - 1 critica

Principais pontos:

- `next@14.2.5`: vulnerabilidade critica e varias advisories em Next.js. O audit sugere `next@14.2.35`, fora do range atual declarado.
- `postcss <8.5.10`: vulnerabilidade moderada, trazida tambem por Next.
- `glob 10.2.0 - 10.4.5`: alta, via `eslint-config-next`.
- `minimatch 9.0.0 - 9.0.6`: alta, via `@typescript-eslint`.

Nenhuma correcao automatica foi aplicada. Nao foi executado `npm audit fix`.

## Confirmacao de escopo

Nao foram alterados arquivos de codigo.

Unica alteracao realizada nesta tarefa: criacao deste relatorio em `docs/auditorias/auditoria-local-2026-07-02.md`.

Nao foram executadas migrations, comandos SQL, alteracoes de banco, alteracoes de Auth, alteracoes de variaveis, instalacoes, updates, commits, push ou deploy.
