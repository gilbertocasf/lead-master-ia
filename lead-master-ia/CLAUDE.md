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

## Estado atual real

- O projeto foi gerado inicialmente como protótipo por IA (não foi construído manualmente do zero).
- O Supabase foi criado manualmente **antes** de existir GitHub, VS Code ou Claude Code no projeto.
- O GitHub foi criado depois do Supabase.
- O projeto foi recuperado de um arquivo `lead-master-ia.tar.gz` e o repositório GitHub agora contém o projeto completo.
- O app roda localmente em `http://localhost:3000` via `npm run dev`.
- A Vercel está criada e conectada ao repositório, mas o deploy está retornando **404** — causa ainda não investigada.
- **Não sabemos com certeza** se o app está usando Supabase real ou mock-data em produção. É necessário auditar o `.env.local` e as variáveis de ambiente na Vercel.
- Muitos botões e interações da UI podem ser apenas visuais (sem lógica real por trás). Ainda não foram auditados.
- O projeto está em fase de **auditoria e organização** — não de desenvolvimento ativo.

### MCP Servers

| Servidor | Status |
|----------|--------|
| context7 | Instalado e conectado |
| supabase | Não instalado |
| playwright | Não instalar agora |

---

## Próximas prioridades

1. Descobrir por que o deploy na Vercel está retornando 404.
2. Confirmar se o app em produção usa Supabase real ou mock-data (checar variáveis de ambiente na Vercel).
3. Auditar quais botões/ações da UI têm lógica real e quais são apenas visuais.
4. Verificar o mismatch de nomes entre a tabela `pistas` (usada no código) e `leads` (definida no `supabase/schema.sql`).
5. Só após a auditoria: decidir o que corrigir e em que ordem.

---

## Regras obrigatórias antes de alterar código

1. **Perguntar antes de alterar qualquer arquivo de aplicação** — o projeto está em auditoria, não em desenvolvimento.
2. **Nunca alterar `schema.sql`** sem confirmação explícita do usuário.
3. **Nunca alterar `package.json`** sem confirmação explícita do usuário.
4. **Nunca fazer deploy ou push** sem confirmação explícita do usuário.
5. Antes de sugerir qualquer correção, descrever o problema encontrado e aguardar autorização.
6. Usar Context7 para consultar documentação de bibliotecas (Next.js, Supabase, Tailwind etc.) antes de responder com base em memória de treinamento.

---

## Riscos conhecidos

- **Tabela `pistas` vs `leads`**: o código usa `TABELA_PISTAS = "pistas"` mas o schema define `leads`. Se o banco real usa um nome diferente do que o código espera, todas as queries falham silenciosamente e o app cai em mock-data sem avisar.
- **Deploy 404 na Vercel**: causa desconhecida. Pode ser falta de variáveis de ambiente, configuração de rota, ou build quebrado.
- **Botões visuais**: ações como "cadastrar lead", "mover no pipeline" etc. podem não ter implementação real — risco de o usuário assumir que o app funciona quando não funciona.
- **Origem do projeto**: por ter sido gerado por IA como protótipo, partes do código podem ser inconsistentes ou incompletas sem sinalização óbvia.
- **`.env.local` não versionado**: o Git não rastreia `.env.local`. Se o arquivo existir localmente com as chaves do Supabase, o app usa Supabase; se não existir, usa mock. O estado real de produção depende das variáveis configuradas na Vercel.

---

## O que não fazer agora

- Não instalar Playwright MCP.
- Não instalar Supabase MCP (ainda — avaliar quando a auditoria avançar).
- Não alterar código da aplicação sem auditoria prévia.
- Não criar novas páginas ou features.
- Não refatorar código existente.
- Não tentar "consertar" o 404 da Vercel sem antes entender a causa.
- Não assumir que qualquer parte do app funciona corretamente sem verificação.

---

## Architecture

**Lead Master IA** is a real-estate lead management platform built with Next.js 14 App Router, TypeScript, and Tailwind CSS. It has no external UI library — all icons are inline SVG.

### Data layer (dual-mode)

The app runs in two modes decided at boot by the presence of env vars:

- **Mock mode** (default, no `.env.local`): all data comes from `lib/mock-data.ts`. No network calls.
- **Supabase mode**: set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. The client is created once in `lib/supabase.ts`; `hasSupabaseEnv` is the boolean flag all queries check.

`lib/supabase-queries.ts` is the single data access layer. Each `fetch*` function gracefully falls back to mock if Supabase is unavailable. Pages call `fetchTudo()` (a `Promise.all` over all four fetch functions) and pass the result to derived functions (`getKPIs`, `getRanking`, `getFunil`, `getProximoPlantao`).

**Important naming mismatch**: the Supabase table for leads is called `pistas` (not `leads`). The constant `TABELA_PISTAS = "pistas"` in `supabase-queries.ts` centralizes this. The schema (`supabase/schema.sql`) defines a `leads` table — if the real DB uses `pistas`, the schema may need updating.

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
