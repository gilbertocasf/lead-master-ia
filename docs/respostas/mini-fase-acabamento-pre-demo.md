## Planejamento técnico — Mini Fase de Acabamento Pré-Demo

### Escopo

| Item | Ação |
|------|------|
| Filtros do Ranking VGV | Tornar funcionais via URL search params |
| Botão "Novo Lead" no Dashboard | Redirecionar para `/leads` |
| Botão "Distribuir" (Leads) | Substituir por feedback "Disponível em breve" |
| Botão "Adicionar corretor" (Corretores) | Substituir por feedback "Disponível em breve" |
| Botão "Nova equipe" (Equipes) | Substituir por feedback "Disponível em breve" |

---

### 1. Filtros do Ranking VGV

**Diagnóstico atual:**
- `app/(app)/ranking/page.tsx` — Server Component
- Os botões "Geral", "Atlântico", "Horizonte" existem na UI mas são estáticos (sem `onClick`, sem navegação)
- Os nomes das equipes estão hardcoded
- `getRanking(dados, equipeId?)` **já aceita filtro por equipe** — o data layer está pronto

**Abordagem:** filtro por URL search param (`/ranking?equipe=<uuid>`). Zero JS de cliente, adequado para Server Component.

**Mudanças em `app/(app)/ranking/page.tsx`:**

1. Adicionar `{ searchParams }` ao argumento da função:
   ```ts
   export default async function RankingPage({
     searchParams,
   }: {
     searchParams: { equipe?: string };
   })
   ```
   Next.js 14 entrega `searchParams` como objeto síncrono — sem Promise.

2. Resolver qual equipe está ativa:
   ```ts
   const equipeAtiva = dados.equipes.find((e) => e.id === searchParams.equipe) ?? null;
   const ranking = getRanking(dados, equipeAtiva?.id);
   ```

3. Substituir os botões hardcoded por links dinâmicos gerados a partir de `dados.equipes`:
   - "Geral" → `<a href="/ranking">` (ativo quando `!searchParams.equipe`)
   - Para cada equipe → `<a href={`/ranking?equipe=${eq.id}`}>` (ativo quando `searchParams.equipe === eq.id`)
   - Estilo ativo: `bg-action text-white`; inativo: `text-ink-muted hover:text-ink`

4. O pódio e a tabela são renderizados com o `ranking` já filtrado — **sem alterações adicionais** nessas seções.

**Arquivo tocado:** `app/(app)/ranking/page.tsx` (apenas)

---

### 2. Botão "Novo Lead" no Dashboard

**Diagnóstico atual:**
- `app/(app)/page.tsx` — Server Component
- `PageHeader` **não tem** `action` prop atualmente no Dashboard (linha 33-38 mostra só `eyebrow`, `title`, `description`)
- A página de Leads já tem o `NovoLeadModal` funcional com `POST /api/leads`

**Abordagem:** adicionar um `<a href="/leads">` estilizado como botão no `action` do `PageHeader`. O usuário é redirecionado para `/leads` onde o modal já existe e funciona.

**Por que não abrir o modal direto no Dashboard:** o `NovoLeadModal` precisa de `equipes: Equipe[]` como prop, e o Dashboard é Server Component sem necessidade de hidratação extra. Redirecionar para `/leads` é a solução com menor footprint.

**Mudança em `app/(app)/page.tsx`:**
```tsx
<PageHeader
  eyebrow="Visão geral"
  title="Dashboard"
  description="..."
  action={
    <a
      href="/leads"
      className="flex items-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action/90"
    >
      <svg ...>...</svg>
      Novo lead
    </a>
  }
/>
```

Ícone: `+` inline SVG — mesmo padrão usado em Corretores e Equipes.

**Arquivo tocado:** `app/(app)/page.tsx` (apenas)

---

### 3. Feedback "Disponível em breve" — três botões

**Diagnóstico dos três botões:**

| Botão | Arquivo | Linha | Contexto |
|-------|---------|-------|---------|
| "Distribuir" | `app/(app)/leads/page.tsx` | 74 | Dentro de cards de fila, `text-xs` |
| "Adicionar corretor" | `app/(app)/corretores/page.tsx` | 33 | `PageHeader` action, com ícone `+` |
| "Nova equipe" | `app/(app)/equipes/page.tsx` | 28 | `PageHeader` action, com ícone `+` |

**Abordagem:** criar um componente `ComingSoonButton` reutilizável (`"use client"`).

**Arquivo a criar:** `components/ui/ComingSoonButton.tsx`

**Comportamento do componente:**
- Aceita `children` (conteúdo do botão), `className` (para herdar o estilo do botão original)
- Ao clicar: exibe um tooltip posicionado absolutamente **acima** do botão com o texto "Disponível em breve"
- O tooltip desaparece após **1,8 segundos**
- Container do botão: `relative inline-flex` para ancorar o tooltip
- Tooltip: `absolute bottom-full left-1/2 -translate-x-1/2 mb-2` — texto em `text-xs`, fundo `bg-base-raised`, borda `border-base-border`, `rounded-lg px-2 py-1 text-ink-muted whitespace-nowrap`
- Não altera o estilo nem o conteúdo do botão — zero layout shift

**Vantagem desta abordagem vs. troca de texto:** não quebra o layout do botão "Distribuir" (que é pequeno e está em flex row dentro de cada card de lead).

**Mudança nos três arquivos de página:**
- Importar `ComingSoonButton`
- Substituir o `<button>` pelo `<ComingSoonButton className={mesmoClassName}>` preservando filhos (ícone + texto)

---

### Resumo de arquivos tocados

| Arquivo | Tipo de mudança |
|---------|----------------|
| `components/ui/ComingSoonButton.tsx` | **CRIAR** — componente client |
| `app/(app)/ranking/page.tsx` | **MODIFICAR** — searchParams + links dinâmicos |
| `app/(app)/page.tsx` | **MODIFICAR** — adicionar action "Novo lead" |
| `app/(app)/leads/page.tsx` | **MODIFICAR** — trocar `<button>` por `<ComingSoonButton>` |
| `app/(app)/corretores/page.tsx` | **MODIFICAR** — trocar `<button>` por `<ComingSoonButton>` |
| `app/(app)/equipes/page.tsx` | **MODIFICAR** — trocar `<button>` por `<ComingSoonButton>` |

Total: **1 arquivo criado, 5 modificados**. Nenhuma migration, nenhuma alteração em `package.json`, nenhum push.
