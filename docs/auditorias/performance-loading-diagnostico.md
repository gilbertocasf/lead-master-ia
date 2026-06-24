# Diagnóstico — Por que loading.tsx não resolveu o delay
**Data:** 2026-06-24  
**Método:** Leitura estática de código + inspeção do filesystem  
**Referência:** `docs/auditorias/performance-navegacao.md`

---

## Descoberta principal

**O arquivo `app/(app)/loading.tsx` não existe no disco.**

```bash
find /workspaces/lead-master-ia -name "loading.tsx"
# → nenhum resultado

ls app/(app)/
# layout.tsx  page.tsx  corretores/  equipes/  leads/  pipeline/  ranking/
# loading.tsx está ausente
```

O tool `Write` reportou sucesso na sessão anterior, mas o arquivo não foi gravado. A causa provável é que o nome do diretório contém parênteses — `(app)` — o que pode causar falha silenciosa em operações de arquivo dependendo do shell ou ambiente.

O build passou porque `loading.tsx` é **opcional** no Next.js: a ausência do arquivo não é um erro de compilação. O build de 11 páginas reflete exatamente a ausência do arquivo — nenhuma das 11 rotas inclui um loading state.

---

## Por que loading.tsx seria suficiente se existisse

### Como Next.js processa loading.tsx

`loading.tsx` no route group `(app)/` cria uma fronteira de `<Suspense>` implícita ao redor do segmento PAGE:

```
ProtectedLayout (Server Component)
  └── AppShell (Client Component — "use client")
        └── <main>
              └── <Suspense fallback={<Loading />}>   ← injeta loading.tsx aqui
                    └── <Page />                       ← qualquer page.tsx
```

O skeleton aparece dentro do `<main>` — o Sidebar e Topbar permanecem visíveis. Esse comportamento é correto para este app.

### Prefetch e timing do skeleton

Por padrão, `<Link>` no App Router prefetcha o "shell estático" de cada rota visível no viewport — que inclui o `loading.tsx`. Quando o usuário clica:

1. Router detecta o clique
2. Mostra imediatamente o `loading.tsx` cacheado do prefetch (~0ms)
3. Dispara a requisição RSC para a nova página
4. Quando o RSC chega, substitui o skeleton pela página real

Com `loading.tsx` existindo e prefetched → feedback visual imediato.  
Sem `loading.tsx` → router não tem nada para mostrar → tela congelada até RSC chegar.

---

## Análise complementar: o que ancora o delay mesmo com loading.tsx

### 1. Middleware executa `getUser()` em TODAS as requisições, incluindo prefetch

```typescript
// middleware.ts
const { data: { user } } = await supabase.auth.getUser();
```

`getUser()` valida o JWT contra os servidores de Auth do Supabase. Isso adiciona 50–200ms em cada requisição — incluindo os prefetch requests que o `<Link>` faz em background. Se o prefetch não completar antes do clique (porque o middleware o tornou lento), o `loading.tsx` não estará cacheado e haverá um breve delay antes do skeleton aparecer.

**Impacto real:** loading.tsx aparece em ~50–200ms depois do clique, não em ~0ms.

### 2. Active state da Sidebar não muda de forma otimista

```tsx
// Sidebar.tsx
const pathname = usePathname();
const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
```

`usePathname()` no Next.js 14 App Router usa `startTransition` internamente. O estado `pathname` é atualizado como uma transição React — não é síncrono com o clique. Na prática, **o link clicado não muda visualmente de "inativo" para "ativo" até a navegação terminar**.

O usuário clica em "Pipeline" → o link "Pipeline" permanece sem o `bg-action/15` → a tela fica parada → a página aparece → o link Pipeline fica ativo. Zero feedback intermediário.

### 3. `onClick={onClose}` dispara setState antes da navegação

```tsx
<Link href={href} onClick={onClose} ...>
```

`onClose` chama `setMenuOpen(false)`. Qualquer `setState` num handler de clique causa um re-render síncrono de `AppShell` antes que o router processe a navegação. No desktop isso é no-op (valor já é `false`), mas no mobile causa um re-render visível do drawer antes da transição de página.

---

## Causa raiz consolidada

| Causa | Impacto | Corrige com |
|-------|---------|-------------|
| **`loading.tsx` não existe no disco** | Total — sem feedback algum | Criar o arquivo corretamente |
| Middleware `getUser()` atrasa prefetch | Parcial — loading aparece 50–200ms depois | Ignorar no MVP / futuro: memoizar getUser |
| `usePathname()` não é síncrono | Visual — link ativo não muda no clique | Pending state explícito na Sidebar |

---

## Melhor solução de menor risco

**Dois arquivos. Sem alterar queries, cache, banco ou middleware.**

---

### Arquivo 1 — `app/(app)/loading.tsx`

Recriar o arquivo. Verificar que existe no disco antes de declarar concluído.

O skeleton atual (PageHeader + 4 KPIs + 2 cards) é adequado. O único risco é o mesmo de antes: a ferramenta de escrita com parênteses no caminho. Verificar com `ls app/(app)/` imediatamente após escrever.

---

### Arquivo 2 — `components/Sidebar.tsx`

Adicionar indicador de navegação pendente nos links.

**Estratégia:** usar `useRouter` + `useTransition` para detectar que uma navegação está em andamento, e aplicar um estado visual no link clicado enquanto o RSC está sendo carregado.

**Implementação proposta (sem alterar a estrutura atual):**

```tsx
// Adicionar no topo de Sidebar.tsx
import { useTransition } from "react";
import { useRouter } from "next/navigation";

// Dentro do componente Sidebar, substituir os Links:
const [isPending, startTransition] = useTransition();
const [pendingHref, setPendingHref] = useState<string | null>(null);
const router = useRouter();

// Em vez de <Link href={href} onClick={onClose}>
// usar handler manual:
<button
  onClick={() => {
    setPendingHref(href);
    onClose();
    startTransition(() => {
      router.push(href);
    });
  }}
  className={`... ${pendingHref === href ? "opacity-70" : ""}`}
>
```

Quando o usuário clica em "Pipeline":
1. `setPendingHref("/pipeline")` → link Pipeline fica com `opacity-70` imediatamente
2. `router.push("/pipeline")` dentro de `startTransition` → loading.tsx aparece no main
3. Quando RSC chega → pathname muda → `pendingHref` é resetado → link Pipeline fica `active`

Resultado: dois níveis de feedback visual, ambos instantâneos após o clique.

**Alternativa mais simples (se pendingHref for complexo demais):**

Apenas substituir `usePathname()` por uma variante otimista: usar `window.location.pathname` para o estado inicial e atualizar via callback. Não recomendado — menos robusto.

A abordagem com `useTransition` é a idiomática para este padrão no Next.js 14.

---

## Plano de implementação

```
Etapa 1 — Criar loading.tsx corretamente (5 min)
  ├── Escrever o arquivo
  ├── Confirmar com: ls app/(app)/loading.tsx
  └── Rodar build para validar

Etapa 2 — Pending state na Sidebar (20 min)
  ├── Adicionar useTransition + useRouter + pendingHref
  ├── Substituir <Link> por <button onClick> no NAV
  └── Rodar build e lint para validar

Critério de sucesso:
  Clicar em "Pipeline" → ícone Pipeline muda visualmente antes
  da página aparecer.
```

---

## O que NÃO precisa mudar

- Queries Supabase — não alteram percepção de feedback de clique
- Cache — não altera feedback de clique
- Middleware — lento mas não é o gargalo principal agora
- Layout — não altera percepção de feedback de clique

---

*Auditoria gerada por leitura estática de código e inspeção do filesystem.*  
*Nenhum arquivo foi alterado.*
