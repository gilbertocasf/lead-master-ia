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

## Definição do produto

**Lead Master IA é um distribuidor inteligente de leads para imobiliárias** — não um CRM genérico.

O diferencial competitivo é a distribuição automática com fila de plantão por equipe: lead entra via webhook ou formulário, o sistema roteia para a equipe correta e distribui para o corretor de plantão sem intervenção do gestor.

Não tratar como CRM genérico. CRMs genéricos (RD Station, Pipedrive) não têm esse conceito de fila de plantão com múltiplas equipes. Esse é o diferencial do produto.

---

## Estado atual do projeto

- App publicado na Vercel e conectado ao Supabase real
- Leitura de dados real funcionando
- Deploy Vercel resolvido (era problema de Root Directory — já corrigido)
- Operações de escrita ainda não implementadas
- A fase de auditorias estratégicas foi **concluída** (Fases 1 a 3.1-D)
- A próxima fase é implementação da captura e distribuição de leads

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

- **Tabela `pistas` vs `leads`**: o código usa `TABELA_PISTAS = "pistas"` mas o schema define `leads`. Se o banco real usa `leads`, a constante precisa ser atualizada. Verificar antes de implementar escrita.
- **Botões visuais**: ações como "cadastrar lead", "distribuir", "mover no pipeline" existem na UI mas não têm implementação real. São o principal alvo da próxima fase.
- **Campos ausentes no schema**: o schema atual não tem `historico_leads`, `ultimo_lead_recebido_em` em `equipes` e `corretores`, nem `em_plantao` em `corretores`. Precisam ser adicionados via migration antes da implementação.

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

- **Mock mode** (default, no `.env.local`): all data comes from `lib/mock-data.ts`. No network calls.
- **Supabase mode**: set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. The client is created once in `lib/supabase.ts`; `hasSupabaseEnv` is the boolean flag all queries check.

`lib/supabase-queries.ts` is the single data access layer. Each `fetch*` function gracefully falls back to mock if Supabase is unavailable. Pages call `fetchTudo()` (a `Promise.all` over all four fetch functions) and pass the result to derived functions (`getKPIs`, `getRanking`, `getFunil`, `getProximoPlantao`).

**Important naming mismatch**: the Supabase table for leads is called `pistas` in the code (`TABELA_PISTAS = "pistas"`) but the schema defines a `leads` table. Verify the actual table name in the real DB before implementing write operations.

### Domain model (`lib/types.ts`)

Key types: `Lead`, `Corretor`, `Equipe`, `Venda`, `RankingItem`. The pipeline has six statuses: `novo → em_contato → visita → proposta → fechado | perdido`. `PIPELINE_ORDER` excludes `perdido` from the active funnel. Ranking VGV counts only `Venda` records (closed sales), not leads with `status = "fechado"`.

### Pages (all Server Components)

Each page is an async Server Component that calls `fetchTudo()` and renders inline. No client-side data fetching. The only Client Component is `AppShell` (manages the mobile drawer state).

| Route | File |
|-------|------|
| `/` | `app/page.tsx` |
| `/leads` | `app/leads/page.tsx` |
| `/pipeline` | `app/pipeline/page.tsx` |
| `/corretores` | `app/corretores/page.tsx` |
| `/equipes` | `app/equipes/page.tsx` |
| `/ranking` | `app/ranking/page.tsx` |

### Layout

`app/layout.tsx` → `AppShell` → `Sidebar` + `Topbar` + `<main>`. The sidebar is a fixed 64-unit column on desktop; on mobile it becomes a drawer controlled by `AppShell`'s `menuOpen` state.

### Design tokens (Tailwind)

The theme is dark ("sala de operação"): `base-*` for backgrounds, `ink-*` for text, `action` (blue `#3B82F6`) for interactive elements, `gold` (`#D4A636`) for ranking/VGV accents, `win`/`loss`/`warn` for semantic states. Use `.tnum` utility class for numeric values in tables and KPI cards.

### Formatting (`lib/format.ts`)

All currency/date formatting targets pt-BR locale. Use `formatBRLCompact` for abbreviated currency (e.g. "R$ 1,2 mi"), `formatPercent`, and `timeAgo` for relative timestamps.
