# Fase 10 — Loading Global (Etapa 1 de Performance)
**Data:** 2026-06-24  
**Escopo:** Criação de `app/(app)/loading.tsx`  
**Referência:** `docs/auditorias/performance-navegacao.md` — Etapa 1

---

## Objetivo

Implementar feedback visual imediato ao clicar em qualquer item da Sidebar, eliminando a percepção de congelamento identificada na auditoria de performance.

---

## O que foi implementado

**Arquivo criado:** `app/(app)/loading.tsx`

O arquivo `loading.tsx` na raiz do route group `(app)/` é o mecanismo nativo do Next.js App Router para exibir um estado de carregamento enquanto o Server Component da página executa. Ele é apresentado **instantaneamente** ao clicar no link — sem esperar nenhuma query Supabase.

### Estrutura do skeleton

O skeleton criado reproduz a estrutura visual das páginas do app:

| Bloco | Reproduz | Componente referência |
|-------|----------|----------------------|
| Eyebrow + título + descrição + botão de ação | `PageHeader` | Todas as páginas |
| 4 cards com label + valor + hint | `KpiCard` | Dashboard (`/`) |
| 2 cards com header + linhas de conteúdo | `Card` + `CardHeader` | Dashboard, Leads, Equipes |

### Técnica de animação

`animate-pulse` do Tailwind CSS — reduz opacidade de 1 → 0.5 → 1 em loop. Respeita `prefers-reduced-motion` via a regra global já existente em `globals.css`.

### Tokens de design usados

- `bg-base-raised` — cor de fundo dos ossos do skeleton
- `border-base-border` — bordas dos cards
- `bg-base-surface` — fundo dos cards
- `shadow-card` — sombra dos cards
- `rounded-2xl` / `rounded-xl` — border-radius padrão do projeto

Nenhum token foi criado. Nenhuma variável nova foi introduzida.

---

## Resultado do build e lint

```
npm run build → ✓ Compiled successfully — 11/11 páginas geradas
npm run lint  → ✓ No ESLint warnings or errors
```

---

## Comportamento após a implementação

**Antes:**
```
Usuário clica em "Pipeline"
  → tela anterior permanece congelada
  → (300–800ms de queries Supabase)
  → página nova aparece
```

**Depois:**
```
Usuário clica em "Pipeline"
  → skeleton aparece instantaneamente (~0ms)
  → (300–800ms de queries Supabase em background)
  → página nova substitui o skeleton
```

O tempo real de navegação não muda. A percepção muda: o usuário recebe confirmação visual imediata de que a ação foi registrada.

---

## Escopo propositalmente limitado

Não foram alterados:
- Queries Supabase (`fetchTudo`, `fetchEquipes`, etc.)
- Cache ou `revalidate`
- Middleware
- Layout `app/(app)/layout.tsx`
- Qualquer componente existente

As demais etapas da auditoria (cache de dados estáticos, queries específicas por página, `React.cache()` para `getCurrentProfile`) permanecem como próximas ações independentes.

---

## Arquivos alterados

| Arquivo | Tipo | Ação |
|---------|------|------|
| `app/(app)/loading.tsx` | Novo | Criado — skeleton global do route group `(app)/` |

---

*Nenhum outro arquivo foi alterado.*
