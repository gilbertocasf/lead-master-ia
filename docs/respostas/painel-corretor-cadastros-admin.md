# Painel do corretor, sidebar por role e cadastros admin

**Data:** 2026-06-26  
**Tarefa:** Corrigir painel do corretor + sidebar role-based + cadastro real de equipe e corretor

---

## Arquivos alterados

| Arquivo | Tipo |
|---------|------|
| `components/Sidebar.tsx` | Filtro de navegação por role |
| `app/(app)/leads/loading.tsx` | NOVO — skeleton específico da página de leads |
| `app/(app)/leads/page.tsx` | Correção corretor + `semCorretorVinculado` |
| `app/(app)/page.tsx` | Dashboard corretor individual |
| `app/(app)/pipeline/page.tsx` | Pipeline corretor |
| `app/(app)/corretores/page.tsx` | Modal real de cadastro + editar vínculo |
| `app/(app)/equipes/page.tsx` | Modal real de cadastro |
| `app/(app)/ranking/page.tsx` | "Área administrativa" para corretor |
| `lib/types.ts` | `usuarioId?: string | null` em `Corretor` |
| `lib/supabase-queries.ts` | `fetchTudoEscopado` + `fetchUsuariosCorretores` |

---

## APIs criadas/alteradas

| Rota | Tipo | Descrição |
|------|------|-----------|
| `POST /api/equipes` | NOVO | Admin cria equipe; `imobiliaria_id` do admin |
| `POST /api/corretores` | NOVO | Admin cria corretor; `ordem_plantao` auto; `imobiliaria_id` do admin |
| `PATCH /api/corretores/[id]` | Existente | Admin edita vínculo `equipe_id` / `usuario_id` |

---

## Componentes criados/alterados

| Componente | Tipo | Descrição |
|-----------|------|-----------|
| `components/NovaEquipeModal.tsx` | NOVO | Modal admin para criar equipe (nome, gerente) |
| `components/NovoCorretorModal.tsx` | NOVO | Modal admin para criar corretor (nome, equipe, email, telefone, em_plantao, ativo) |
| `components/EditarVinculoCorretorModal.tsx` | Existente | Sem alteração |
| `components/Sidebar.tsx` | Alterado | Nav filtrada: corretor vê apenas Dashboard / Leads / Pipeline |

---

## Resumo técnico

### 1. Sidebar por role
`NAV_TODOS` = todos os 6 links. `HREFS_CORRETOR = {"/", "/leads", "/pipeline"}`. Quando `profile?.role === "corretor"`, filtra o array antes de renderizar. Admin e gestor veem tudo.

### 2. Skeleton específico para `/leads`
`app/(app)/leads/loading.tsx` criado com layout de tabela (em vez do skeleton de KPI cards do dashboard global). Isso garante que mesmo durante o carregamento, o visual é coerente com o conteúdo esperado da página.

### 3. Corretor em `/leads`
- `semCorretorVinculado` → aviso "Usuário não vinculado"
- `semEquipe` → aviso (gestor sem equipe)
- `isCorretor` → tabela com próprios leads, estado vazio controlado, sem fila, sem botão "Cadastrar lead"
- Admin/gestor → fluxo original (fila + tabela + `NovoLeadModal`)

### 4. POST /api/equipes
- Requer role `admin`
- Campos: `nome` (obrigatório), `gerente` (obrigatório)
- `imobiliaria_id` vem do perfil do admin autenticado (não aceita do payload)
- Revalida: `/`, `/equipes`, `/corretores`, `/leads`, `/ranking`

### 5. POST /api/corretores
- Requer role `admin`
- Campos: `nome` (obrigatório), `equipe_id` (obrigatório), `email` (opcional), `telefone` (opcional), `em_plantao` (default false), `ativo` (default true)
- `ordem_plantao` calculado automaticamente: `MAX(ordem_plantao) + 1` da equipe
- `imobiliaria_id` vem do perfil do admin autenticado
- Valida que `equipe_id` pertence à mesma `imobiliaria_id`
- Trata conflito de email único (409 `email_ja_cadastrado`)
- Revalida: `/`, `/corretores`, `/equipes`, `/leads`, `/ranking`

### 6. Regras de role nas páginas
| Role | Dashboard | Leads | Pipeline | Corretores | Equipes | Ranking |
|------|-----------|-------|----------|-----------|---------|---------|
| Admin | Global | Global + cadastrar | Global | Global + criar + editar vínculo | Global + criar | Global |
| Gestor | Equipe própria | Equipe própria + cadastrar | Equipe própria | Equipe própria (sem criar/editar) | Equipe própria (sem criar) | Equipe própria |
| Corretor | Individual | Próprios leads | Próprios leads | "Área administrativa" | "Área administrativa" | "Área administrativa" |

---

## Comandos executados

```bash
npm run build  # ✓ passou sem erros
git status
git status --short
git diff --name-only
git diff --stat
```

---

## Resultado do build

```
✓ Compiled successfully
✓ Generating static pages (13/13)
```
Zero erros TypeScript ou ESLint.

---

## Git status --short

```
 M app/(app)/corretores/page.tsx
 M app/(app)/equipes/page.tsx
 M app/(app)/leads/page.tsx
 M app/(app)/page.tsx
 M app/(app)/pipeline/page.tsx
 M app/(app)/ranking/page.tsx
 M components/Sidebar.tsx
 M lib/supabase-queries.ts
 M lib/types.ts
?? app/(app)/leads/loading.tsx
?? app/api/corretores/
?? app/api/equipes/
?? components/EditarVinculoCorretorModal.tsx
?? components/NovaEquipeModal.tsx
?? components/NovoCorretorModal.tsx
?? docs/respostas/painel-corretor-vinculo-admin.md
```

---

## Git diff --stat

```
 app/(app)/corretores/page.tsx |  38 +++++++----
 app/(app)/equipes/page.tsx    |  15 ++--
 app/(app)/leads/page.tsx      | 155 ++++++++++++++++++++++++++++++++++--------
 app/(app)/page.tsx            | 142 ++++++++++++++++++++++++++++++++++----
 app/(app)/pipeline/page.tsx   |  52 ++++++++++----
 app/(app)/ranking/page.tsx    |   6 +-
 components/Sidebar.tsx        |  13 +++-
 lib/supabase-queries.ts       |  62 ++++++++++++++++-
 lib/types.ts                  |   1 +
 9 files changed, 397 insertions(+), 87 deletions(-)
```

---

## Pendências

1. **Usuário de login para corretor**: `POST /api/corretores` cria o corretor operacional mas não cria usuário no Supabase Auth. O vínculo `usuario_id` é feito depois via "Editar vínculo". Conforme escopo aprovado.
2. **migration 006**: `usuarios.equipe_id` — arquivo existe em `supabase/migrations/006_usuarios_equipe_id.sql` mas ainda não aplicado. Necessário para gestor ter `equipe_id` no banco.
3. **Sidebar gestor**: O gestor ainda vê links de Corretores/Equipes/Ranking. Conforme spec — gestor tem acesso às páginas, mas vê apenas dados da própria equipe.

---

## Riscos conhecidos

- `POST /api/equipes`: Se o admin não tiver `imobiliaria_id` no perfil (usuário sem imobiliária associada), retorna 403 com mensagem clara.
- Email único em `corretores`: Supabase pode retornar diferentes códigos de erro dependendo da versão. A detecção usa `.includes("unique") || code === "23505"`.
- RLS nas queries: `fetchTudoEscopado()` usa `createSupabaseServer()` (sessão do usuário). Se as políticas RLS bloquearem o corretor de ler equipes/corretores, `fetchTudoEscopado()` pode retornar arrays vazios levando a `semCorretorVinculado = true`. Isso é comportamento esperado — o aviso orienta o admin a fazer o vínculo.

---

## Próximos passos recomendados

1. Aplicar `supabase/migrations/006_usuarios_equipe_id.sql` para testar gestor com equipe real
2. Testar criação de equipe via admin em produção (verificar RLS na tabela `equipes`)
3. Testar criação de corretor via admin (verificar `imobiliaria_id` sendo populado)
4. Validar que o corretor vinculado vê apenas seus próprios dados nas 3 telas (Dashboard, Leads, Pipeline)

---

## Checklist de teste manual

### Corretor (`corretor@teste.local`)
- [ ] Sidebar mostra apenas: Dashboard, Leads, Pipeline (sem Corretores, Equipes, Ranking VGV)
- [ ] Dashboard carrega com KPIs individuais
- [ ] `/leads` carrega sem skeleton infinito
- [ ] `/leads` mostra apenas leads próprios (sem fila de distribuição)
- [ ] `/leads` sem leads → estado vazio controlado "Nenhum lead atribuído ainda."
- [ ] `/leads` sem botão "Cadastrar lead"
- [ ] `/pipeline` mostra apenas próprios leads no kanban
- [ ] Acesso via URL a `/corretores` → mostra "Área administrativa"
- [ ] Acesso via URL a `/equipes` → mostra "Área administrativa"
- [ ] Acesso via URL a `/ranking` → mostra "Área administrativa"

### Admin
- [ ] Sidebar mostra todos os links
- [ ] `/equipes` mostra botão "Nova equipe"
- [ ] Clicar "Nova equipe" abre modal com campos nome e gerente
- [ ] Criar equipe → aparece em `/equipes` após refresh
- [ ] `/corretores` mostra botão "Adicionar corretor"
- [ ] Clicar "Adicionar corretor" abre modal com campos
- [ ] Criar corretor → aparece em `/corretores` com ordem de plantão correto
- [ ] Botão "Editar vínculo" visível em cada card de corretor
- [ ] Editar vínculo → permite mudar equipe e usuário de login

### Gestor (`gestor@teste.local`)
- [ ] Sidebar mostra todos os links
- [ ] `/corretores` sem botão "Adicionar corretor"
- [ ] `/equipes` sem botão "Nova equipe"
- [ ] `/corretores` sem botão "Editar vínculo"
- [ ] Vê apenas dados da própria equipe em todas as telas
