# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # install dependencies
npm run dev       # start dev server at http://localhost:3000
npm run build     # production build
npm run lint      # ESLint 9 (eslint.config.mjs)
```

There is no test suite in this project.

---

## Skill operacional

Antes de iniciar qualquer tarefa de implementação ou planejamento, invocar:

```
/lead-master-product-architect
```

Essa skill contém: identidade do produto, decisões aprovadas, ordem de prioridade, regras de execução e checklist de início de tarefa. Está em `.claude/commands/lead-master-product-architect.md`.

---

## Definição do produto

**Lead Master IA é um distribuidor inteligente de leads para imobiliárias** — não um CRM genérico.

O diferencial competitivo é a distribuição automática com fila de plantão por equipe: lead entra via webhook ou formulário, o sistema roteia para a equipe correta e distribui para o corretor de plantão sem intervenção do gestor.

Não tratar como CRM genérico. CRMs genéricos (RD Station, Pipedrive) não têm esse conceito de fila de plantão com múltiplas equipes. Esse é o diferencial do produto.

---

## Estado atual do projeto

- App publicado na Vercel (a partir de `main`) e conectado ao Supabase real
- Leitura de dados real funcionando; autenticação SSR (login/logout, middleware, RLS)
- **Escrita implementada**: cadastro de lead, distribuição automática, pipeline com histórico, plantão pelo app, distribuição da fila e atribuição manual
- **Migrations 001–011 em produção.** A 009 (segurança por equipe) foi aplicada em 20/10/2026 e a 010 e a 011 (estrutura Meta, RPCs de distribuição) em 27/10/2026, todas conferidas pelo item 4 de `docs/setup/aplicar-migrations-009-011.md`. O código que usa a 010 e a 011 entrou em `main` em 28/10/2026 (PR #1) e está em produção
- **Integração Meta (Lead Ads) implementada, aguardando configuração**: webhook `/api/webhooks/meta`, cron `/api/cron/meta`, tela `/integracoes`, página do lead `/leads/[id]`. Passo a passo em `docs/integracao-meta/configuracao.md` e `docs/integracao-meta/checklist-go-live.md`; contrato técnico em `docs/planejamento/contrato-tecnico-meta-leads.md`
- `npm run build` e `npm run lint` rodam localmente e passaram em 27/10/2026, já com Next.js 16; rodar de novo antes de publicar
- A fase de auditorias estratégicas foi **concluída** (Fases 1 a 3.1-D)

---

## Fase atual: implementação

As auditorias estratégicas foram concluídas. As decisões estão documentadas em:

- `docs/DECISOES-ARQUITETURA.md` — decisões aprovadas de arquitetura
- `docs/auditorias/` — análises detalhadas das fases anteriores

**Antes de implementar qualquer funcionalidade, consultar esses documentos.**

Não reabrir discussões sobre Vercel 404, Root Directory, ou mock-data vs. Supabase — essas questões foram resolvidas. Só revisitar se houver nova evidência concreta.

---

## Foco técnico imediato (Fases 4–6)

Implementar nesta ordem:

1. **Captura de leads** — formulário modal com campos mínimos + webhook `POST /api/leads`
2. **Origem obrigatória** — campo `origem` obrigatório em toda entrada de lead
3. **Deduplicação por telefone** — janela de 24h; se lead com mesmo telefone existir, não criar duplicata
4. **Roteamento para equipe** — `equipe_id` no payload usa a equipe diretamente; sem `equipe_id`, rodízio entre equipes ativas
5. **Distribuição automática para corretor** — round-robin com fairness (`ultimo_lead_recebido_em`)
6. **Histórico do lead** — tabela `historico_leads` registra cada evento desde a entrada
7. **Pipeline funcional** — mover lead entre status com registro de histórico e SLA visual

---

## Regras obrigatórias

1. **Nunca alterar `schema.sql`** sem confirmação explícita do usuário.
2. **Nunca alterar `package.json`** sem confirmação explícita do usuário.
3. **Nunca fazer deploy ou push** sem confirmação explícita do usuário.
4. Antes de implementar qualquer funcionalidade, consultar `docs/DECISOES-ARQUITETURA.md` e as auditorias relevantes.
5. Antes de sugerir qualquer correção em código de aplicação, descrever o que será feito e aguardar autorização.

---

## MCP Servers

| Servidor | Status |
|----------|--------|
| context7 | Instalado e conectado |
| supabase | Não instalado |
| playwright | Não instalar agora |

---

## Riscos conhecidos

- **Validação só manual**: em 28/10/2026 o preview do PR #1 foi testado contra o Supabase real (login, todas as telas, plantão, cadastro com distribuição, bloqueio de telefone repetido em 24h, `/integracoes`); a versão de celular não foi testada. A Vercel publica `main` automaticamente, então testar o preview antes de cada merge.
- **Escopo do gestor após a 009**: gestor sem `equipe_id` não vê nenhum lead, corretor ou venda. Ao criar gestores, sempre definir a equipe.
- **Integração Meta depende de configuração externa**: variáveis (`META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_ACCESS_TOKEN`, `CRON_SECRET`, `ALERTA_EMAILS`), app na Meta, webhook, instalação na Página e cron. Acesso Avançado (Análise do App e Verificação da Empresa) só é necessário para Páginas de terceiros.
- **Cron e plano da Vercel**: no plano Hobby só cron diário; um `vercel.json` com cron mais frequente faz o deploy falhar. Por isso o repositório não traz `vercel.json`. Em Hobby, usar agendador externo chamando `GET /api/cron/meta` com `Authorization: Bearer <CRON_SECRET>`.
- **Token da Meta**: token de 60 dias expira e interrompe a leitura de leads (há alerta por e-mail); preferir token de Usuário do Sistema sem expiração.
- **`valor_vgv` em `vendas`**: a coluna manteve o nome original após a migration 002 (que não renomeia colunas). `fetchVendas()` seleciona `valor_vgv` — correto. O arquivo `supabase/schema.v2.sql` planejou renomear para `valor`, mas nunca foi aplicado.
- **`schema.v2.sql` não deve ser aplicado**: começa com `DROP TABLE ... CASCADE`. Se executado sobre o banco com dados, apaga tudo. O banco usa as migrations, não o schema.v2.
- **Sem suíte de testes**: a validação é manual (ver roteiro de demo e checklist de go-live).
- **Next 16**: `cookies()`, `headers()`, `params` e `searchParams` são assíncronos (sempre com `await`). `middleware.ts` está obsoleto em favor de `proxy.ts` (que roda em Node, não em Edge); o build só avisa, a troca não foi feita. Exige Node 20.9 ou superior na Vercel. Se o `next dev` falhar com erro de fonte do `next/font/google`, apagar a pasta `.next`.

---

## O que não fazer agora

- Não instalar Playwright MCP.
- Não instalar Supabase MCP (ainda — avaliar quando a implementação avançar).
- Não criar novas páginas ou features além das definidas no foco técnico imediato.
- Não refatorar código existente sem autorização.
- Não assumir que qualquer parte do app funciona sem verificar.

---

## Architecture

**Lead Master IA** is a real-estate lead distribution platform built with Next.js 16 App Router (React 19), TypeScript, and Tailwind CSS. It has no external UI library — all icons are inline SVG.

### Data layer (dual-mode)

The app runs in two modes decided at boot by the presence of env vars:

- **Mock mode** (default, no `.env.local`): all data comes from `lib/mock-data.ts`. No network calls. Auth middleware bypasses all protection.
- **Supabase mode**: set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. `hasSupabaseEnv` (exported from `lib/supabase.ts`) is the boolean flag all queries check.

**Supabase clients (three distinct files):**
- `lib/supabase-browser.ts` — `createBrowserClient` for Client Components
- `lib/supabase-server.ts` — `createServerClient` with Next.js cookies, for Server Components and Server Actions
- `lib/supabase-admin.ts` — `createClient` with service_role key; server-only; throws if imported in browser

`lib/supabase-queries.ts` is the single data access layer. Each `fetch*` function uses `createSupabaseServer()` internally. In Supabase mode, errors throw clearly instead of falling back to mock — the silent fallback was removed. Pages call `fetchTudo()` (a `Promise.all` over all four fetch functions) and pass the result to derived functions (`getKPIs`, `getRanking`, `getFunil`, `getProximoPlantao`).

**Table name**: `TABELA_PISTAS = "leads"` — the constant was already corrected to match the real table name in the database.

### Domain model (`lib/types.ts`)

Key types: `Lead`, `Corretor`, `Equipe`, `Venda`, `RankingItem`. The pipeline has six statuses: `novo → em_contato → visita → proposta → fechado | perdido`. `PIPELINE_ORDER` excludes `perdido` from the active funnel. Ranking VGV counts only `Venda` records (closed sales), not leads with `status = "fechado"`.

### Pages (all Server Components)

Each page is an async Server Component that calls `fetchTudo()` and renders inline. No client-side data fetching. The only Client Component is `AppShell` (manages the mobile drawer state).

Protected pages live under the `app/(app)/` route group and are wrapped by `app/(app)/layout.tsx` (AppShell). The login page lives at `app/login/` with no shell.

| Route | File |
|-------|------|
| `/` | `app/(app)/page.tsx` |
| `/leads` | `app/(app)/leads/page.tsx` |
| `/pipeline` | `app/(app)/pipeline/page.tsx` |
| `/corretores` | `app/(app)/corretores/page.tsx` |
| `/equipes` | `app/(app)/equipes/page.tsx` |
| `/ranking` | `app/(app)/ranking/page.tsx` |
| `/login` | `app/login/page.tsx` |

### Layout

`app/layout.tsx` — root layout, fonts only (no shell).  
`app/(app)/layout.tsx` — protected group layout: `AppShell` → `Sidebar` + `Topbar` + `<main>`. The sidebar is a fixed 64-unit column on desktop; on mobile it becomes a drawer controlled by `AppShell`'s `menuOpen` state.  
`middleware.ts` — intercepts every request; in Supabase mode redirects unauthenticated users to `/login` and authenticated users away from `/login`.

### Design tokens (Tailwind)

The theme is dark ("sala de operação"): `base-*` for backgrounds, `ink-*` for text, `action` (blue `#3B82F6`) for interactive elements, `gold` (`#D4A636`) for ranking/VGV accents, `win`/`loss`/`warn` for semantic states. Use `.tnum` utility class for numeric values in tables and KPI cards.

### Formatting (`lib/format.ts`)

All currency/date formatting targets pt-BR locale. Use `formatBRLCompact` for abbreviated currency (e.g. "R$ 1,2 mi"), `formatPercent`, and `timeAgo` for relative timestamps.
