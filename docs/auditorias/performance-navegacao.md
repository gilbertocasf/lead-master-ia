# Auditoria de Performance — Navegação
**Data:** 2026-06-24  
**Método:** Leitura estática do código — sem profiling ao vivo  
**Escopo:** App Router, Server Components, consultas Supabase, cache, Sidebar, layout

---

## Diagnóstico em uma linha

> A navegação parece travada porque **não existe nenhum `loading.tsx`** no projeto — o usuário clica, vê a página antiga congelada, e espera em silêncio até 4+ queries Supabase terminarem no servidor.

---

## 1. Estrutura do App Router

```
app/
├── layout.tsx                  ← Root layout (fonts only, Server Component leve)
├── (app)/
│   ├── layout.tsx              ← Layout protegido — async Server Component
│   ├── page.tsx                ← Dashboard
│   ├── leads/page.tsx
│   ├── pipeline/page.tsx
│   ├── corretores/page.tsx
│   ├── equipes/page.tsx
│   └── ranking/page.tsx
└── login/page.tsx
```

**Não existe nenhum `loading.tsx` em nenhuma rota.**

---

## 2. Server Components vs Client Components

| Arquivo | Tipo | Observação |
|---------|------|-----------|
| `app/(app)/layout.tsx` | Server Component async | Chama `getCurrentProfile()` → 2 queries Supabase |
| `app/(app)/page.tsx` | Server Component async | Chama `fetchTudo()` → 4 queries Supabase |
| `app/(app)/leads/page.tsx` | Server Component async | Chama `fetchTudo()` → 4 queries |
| `app/(app)/pipeline/page.tsx` | Server Component async | Chama `fetchTudo()` → 4 queries |
| `app/(app)/corretores/page.tsx` | Server Component async | Chama `fetchTudo()` → 4 queries |
| `app/(app)/equipes/page.tsx` | Server Component async | Chama `fetchTudo()` → 4 queries |
| `app/(app)/ranking/page.tsx` | Server Component async | Chama `fetchTudo()` → 4 queries |
| `components/AppShell.tsx` | **Client Component** | `"use client"` — estado do drawer mobile |
| `components/Sidebar.tsx` | **Client Component** | `"use client"` — usa `usePathname()` |
| `components/pipeline/StatusDropdown.tsx` | **Client Component** | `"use client"` — chama API PATCH |
| `components/NovoLeadModal.tsx` | **Client Component** | `"use client"` — formulário de cadastro |
| `components/pipeline/PipelineSlaBadge.tsx` | Server Component | Cálculo de tempo em `Date.now()` no render |

---

## 3. Sidebar — navegação e prefetch

**Usa `Link` do `next/link`:** sim — correto. Em produção, Next.js pré-carrega links visíveis no viewport automaticamente.

**Prefetch ocorre sobre o quê?** No App Router, `Link` prefetcha o RSC payload do segmento de rota. Para rotas que usam `cookies()` (todas as páginas aqui, via `createSupabaseServer`), o prefetch busca apenas o "shell" estático — sem dados. Isso limita a eficácia do prefetch.

**Problema:** como não existe `loading.tsx`, o prefetch não tem nada de "loading state" para mostrar antecipadamente. O navegador busca os dados do servidor em background, mas sem loading UI o usuário não vê nada enquanto espera.

---

## 4. Layout — rerenderização por navegação

O layout `app/(app)/layout.tsx`:

```tsx
export default async function ProtectedLayout({ children }) {
  let profile: UserProfile | null = null;
  if (hasSupabaseEnv) {
    profile = await getCurrentProfile(); // ← 2 calls Supabase
  }
  return <AppShell profile={profile}>{children}</AppShell>;
}
```

`getCurrentProfile()` chama `createSupabaseServer()` → que chama `cookies()` de `next/headers`.

**Consequência crítica:** chamar `cookies()` torna o layout um **Dynamic Server Component**. Layouts dinâmicos são **re-executados no servidor a cada navegação de página**. O `profile` é re-buscado do banco em toda troca de rota — mesmo que o usuário logado não mude.

---

## 5. Consultas Supabase — mapeamento completo

### Por requisição de página (navegação normal)

| Fase | Função | Queries | Observação |
|------|--------|---------|-----------|
| Middleware | `supabase.auth.getUser()` | 1 | Valida JWT via rede contra Supabase Auth |
| Layout | `getCurrentProfile()` | 2 | `getUser()` + `SELECT usuarios` |
| Página | `fetchTudo()` | 4 | `Promise.all([equipes, corretores, leads, vendas])` |
| **Total** | | **7** | **Por navegação, em Supabase mode** |

As 4 queries de `fetchTudo()` rodam em paralelo via `Promise.all`. As 2 do layout e a 1 do middleware são sequenciais entre si, mas paralelas à requisição da página no pipeline do App Router.

### Queries redundantes entre páginas

Todas as 6 páginas chamam `fetchTudo()` identicamente. Não há compartilhamento de cache entre elas.

| Página | Usa equipes | Usa corretores | Usa leads | Usa vendas |
|--------|-------------|----------------|-----------|-----------|
| Dashboard | ✓ | ✓ | ✓ | ✓ |
| Leads | ✓ | ✓ | ✓ | — (busca mas não usa) |
| Pipeline | ✓ | ✓ | ✓ | — (busca mas não usa) |
| Corretores | ✓ | ✓ | ✓ | ✓ |
| Equipes | ✓ | ✓ | ✓ | ✓ |
| Ranking | ✓ | ✓ | — (busca mas não usa) | ✓ |

`/leads`, `/pipeline` e `/ranking` buscam dados que não utilizam.

---

## 6. Cache — estado atual

| Função | Cache configurado | Supabase client | Next.js cache |
|--------|------------------|-----------------|---------------|
| `fetchEquipes()` | Nenhum | `createServerClient` interno | Sem `unstable_cache`, sem `revalidate` |
| `fetchCorretores()` | Nenhum | idem | idem |
| `fetchPistas()` | Nenhum | idem | idem |
| `fetchVendas()` | Nenhum | idem | idem |
| `getCurrentProfile()` | Nenhum | idem | idem |

O Supabase JS Client usa `fetch` internamente com `cache: 'no-store'` por padrão (necessário para dados com RLS — cache sem contexto de usuário retornaria dados errados). Não é possível usar `force-cache` sem `unstable_cache` com chave de tenant.

**Resultado:** cada navegação dispara queries frescas ao banco. Não existe reuso de resultado entre navegações.

---

## 7. `loading.tsx` — ausência total

```
app/(app)/            ← sem loading.tsx
app/(app)/leads/      ← sem loading.tsx
app/(app)/pipeline/   ← sem loading.tsx
app/(app)/corretores/ ← sem loading.tsx
app/(app)/equipes/    ← sem loading.tsx
app/(app)/ranking/    ← sem loading.tsx
```

**O que acontece sem `loading.tsx`:**

1. Usuário clica em "Pipeline" na Sidebar
2. Next.js inicia a requisição ao servidor (middleware + layout + página = 7 queries Supabase)
3. A tela anterior permanece congelada — sem spinner, sem skeleton, sem nenhum feedback
4. Quando todas as queries terminam, a nova página substitui a anterior

O usuário interpreta o congelamento como lentidão — mesmo que o servidor responda em 600ms, a experiência percebida é de "a página não reagiu".

---

## 8. Possíveis gargalos classificados

### Impacto ALTO

| # | Gargalo | Causa raiz | Onde |
|---|---------|-----------|------|
| G1 | **Ausência de `loading.tsx`** | Nenhum feedback visual durante navegação | Todas as rotas de `app/(app)/` |
| G2 | **7 queries Supabase por navegação** | Middleware + layout dinâmico + fetchTudo() sem cache | `middleware.ts`, `(app)/layout.tsx`, todas as páginas |
| G3 | **Layout dinâmico re-executado a cada navegação** | `getCurrentProfile()` chama `cookies()` → layout vira Dynamic | `app/(app)/layout.tsx` |

### Impacto MÉDIO

| # | Gargalo | Causa raiz | Onde |
|---|---------|-----------|------|
| G4 | **Dados não utilizados sendo buscados** | `fetchTudo()` padronizado em páginas que não precisam de todas as tabelas | `/leads`, `/pipeline`, `/ranking` |
| G5 | **`getCurrentProfile()` cria novo cliente Supabase** | `createSupabaseServer()` é chamado dentro do layout e também nas queries de página — duas instâncias de cliente por render | `lib/auth.ts`, `lib/supabase-queries.ts` |
| G6 | **Latência de rede Vercel → Supabase** | Distância geográfica entre edge Vercel e banco Supabase | Infraestrutura |
| G7 | **`PipelineSlaBadge` é Server Component estático** | Badge calculado no render; não atualiza sem reload | `components/pipeline/PipelineSlaBadge.tsx` |

### Impacto BAIXO

| # | Gargalo | Causa raiz | Onde |
|---|---------|-----------|------|
| G8 | **Middleware amplo demais** | `matcher` captura todas as rotas incluindo API routes — `getUser()` roda em cada chamada à API | `middleware.ts` |
| G9 | **`novoLeadModal` usa `router.refresh()`** | Após cadastro, força novo render de toda a página (re-executa `fetchTudo()`) | `components/NovoLeadModal.tsx` |
| G10 | **Sidebar cria `AppShell` como Client Component** | `usePathname()` na Sidebar obriga o wrapper a ser Client Component, impedindo streaming server-side do layout | `components/AppShell.tsx`, `components/Sidebar.tsx` |

---

## 9. Causa mais provável da lentidão

A causa dominante é **G1 + G2 combinados**:

- **G2** (7 queries por navegação) cria latência real de 300–800ms por troca de rota dependendo da localização do usuário relativa ao banco.
- **G1** (sem `loading.tsx`) torna esse tempo totalmente invisível — o usuário vê congelamento em vez de carregamento.

Se existisse um `loading.tsx` com um skeleton simples, o usuário veria feedback imediato (~0ms) e a latência real de 300–800ms seria percebida como "carregando" em vez de "travado".

---

## 10. O que pode ser corrigido rapidamente

Mudanças de 1 arquivo, sem refatoração, sem alterar banco:

| Correção rápida | Arquivo | Impacto esperado |
|----------------|---------|-----------------|
| Criar `app/(app)/loading.tsx` com skeleton simples | Arquivo novo | Elimina percepção de congelamento — feedback imediato ao clicar |
| Criar `loading.tsx` por rota (leads, pipeline, ranking) | 3–5 arquivos novos | Skeletons específicos por rota |

---

## 11. O que exige refatoração

| Refatoração | Esforço | Impacto |
|-------------|---------|---------|
| Extrair `getCurrentProfile()` do layout para passar via prop apenas quando necessário, evitando re-execução em navegação | Médio | Reduz de 7 para 5 queries por navegação |
| Usar `unstable_cache` ou React `cache()` em `fetchEquipes` e `fetchCorretores` (dados mudam raramente) | Médio | Elimina 2 das 4 queries de fetchTudo em navegações subsequentes |
| Separar `fetchTudo()` em fetches específicos por página | Alto | Cada página busca apenas o que usa; reduz payload e tempo |
| Converter `getCurrentProfile()` para usar React `cache()` com escopo de request | Baixo-médio | Evita 2 chamadas separadas a `getUser()` (middleware + layout) no mesmo request |
| Mover `usePathname()` para fora do `AppShell` ou usar CSS `data-active` em vez de JS | Alto | Permite que o layout seja Server Component puro, habilitando streaming |

---

## 12. Plano recomendado em ordem de execução

### Etapa 1 — Correção de percepção (30 min, alto impacto imediato)

**Criar `app/(app)/loading.tsx`**

Um skeleton global para o group route `(app)/`. Qualquer conteúdo serve: spinner, barra de progresso, ou layout em branco com colunas fantasmas. O usuário recebe feedback instantâneo ao clicar em qualquer item da Sidebar.

---

### Etapa 2 — Skeletons por rota (1–2h, impacto médio)

**Criar `loading.tsx` nas rotas mais lentas:**
- `app/(app)/pipeline/loading.tsx` — skeleton de colunas kanban
- `app/(app)/leads/loading.tsx` — skeleton de tabela
- `app/(app)/ranking/loading.tsx` — skeleton de pódio

Esses skeletons são específicos por tela e reduzem ainda mais o CLS (Cumulative Layout Shift).

---

### Etapa 3 — Cache de dados estáticos (2–3h, impacto médio)

**Envolver `fetchEquipes()` e `fetchCorretores()` em `unstable_cache` com tag e revalidação.**

Equipes e corretores raramente mudam. Cacheá-los com `revalidate: 60` eliminaria 2 das 4 queries de `fetchTudo()` em navegações subsequentes sem custo de consistência perceptível.

---

### Etapa 4 — Cache do perfil no layout (1h, impacto médio)

**Usar `React.cache()` para deduplicate a chamada `getUser()` entre middleware e layout.**

Hoje: middleware chama `getUser()`, depois o layout chama `getUser()` novamente na mesma requisição. Com `React.cache()`, a segunda chamada reutiliza o resultado da primeira.

---

### Etapa 5 — Queries específicas por página (3–4h, impacto baixo-médio)

**Substituir `fetchTudo()` por fetches específicos em páginas que não usam todos os dados.**

- `/leads`: remove `fetchVendas()`
- `/pipeline`: remove `fetchVendas()`
- `/ranking`: remove `fetchPistas()`

Reduz payload de resposta e tempo de serialização, especialmente quando a tabela `leads` crescer.

---

## Resumo executivo

```
CAUSA PRINCIPAL:    Sem loading.tsx → congelamento percebido
CAUSA SECUNDÁRIA:   7 queries Supabase por navegação sem cache

CORREÇÃO IMEDIATA:  Criar app/(app)/loading.tsx → 30 minutos
IMPACTO ESPERADO:   Elimina percepção de "travado"; lentidão real
                    continua mas o usuário recebe feedback imediato

CORREÇÃO ESTRUTURAL: cache em equipes/corretores + queries por página
IMPACTO ESPERADO:   Reduz de 7 para ~4 queries por navegação
```

---

*Auditoria gerada por leitura estática do código. Nenhum arquivo foi alterado.*
