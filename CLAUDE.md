# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # install dependencies
npm run dev       # start dev server at http://localhost:3000
npm run build     # production build
npm run lint      # ESLint via next lint
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

- App publicado na Vercel e conectado ao Supabase real
- Leitura de dados real funcionando
- Deploy Vercel resolvido (era problema de Root Directory — já corrigido)
- **Autenticação SSR implementada** (Fase 6.1): login/logout, middleware, RLS funcional
- **Migration 002 aplicada no banco**: RLS em 7 tabelas, multi-tenancy, `usuarios`, `imobiliarias`, `historico_leads`
- Operações de escrita (leads, distribuição, pipeline) ainda não implementadas
- A fase de auditorias estratégicas foi **concluída** (Fases 1 a 3.1-D)
- A próxima fase é implementação da captura e distribuição de leads (Fase 6.2)

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

- **Botões visuais**: ações como "cadastrar lead", "distribuir", "mover no pipeline" existem na UI mas não têm implementação real. São o principal alvo da Fase 6.2.
- **`valor_vgv` em `vendas`**: a coluna manteve o nome original após a migration 002 (que não renomeia colunas). `fetchVendas()` seleciona `valor_vgv` — correto. O arquivo `supabase/schema.v2.sql` planejou renomear para `valor`, mas esse arquivo nunca foi aplicado e **não deve ser aplicado** (começa com DROP TABLE).
- **Sidebar com usuário mock**: a Sidebar exibe "João Carvalho / Administrador" fixo. Substituir pelo usuário autenticado real é trabalho da Fase 6.2 (ou antes, se necessário).
- **`schema.v2.sql` não deve ser aplicado**: começa com `DROP TABLE ... CASCADE`. Se executado sobre o banco com dados, apaga tudo. O banco usa a migration 002, não o schema.v2.

---

## O que não fazer agora

- Não instalar Playwright MCP.
- Não instalar Supabase MCP (ainda — avaliar quando a implementação avançar).
- Não criar novas páginas ou features além das definidas no foco técnico imediato.
- Não refatorar código existente sem autorização.
- Não assumir que qualquer parte do app funciona sem verificar.

---

## Architecture

**Lead Master IA** is a real-estate lead distribution platform built with Next.js 14 App Router, TypeScript, and Tailwind CSS. It has no external UI library — all icons are inline SVG.

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
