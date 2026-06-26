# Painel operacional do corretor + gestão de vínculo (admin)

**Data:** 2026-06-26  
**Fase:** Tarefa 2 — Escopo de corretor e gestão de vínculo admin

---

## O que foi implementado

### Parte A — `fetchTudoEscopado()` para corretor
`lib/supabase-queries.ts` atualizado com:
- Interface `DadosEscopados` ampliada com `semCorretorVinculado: boolean` e `corretorId: string | null`
- Lógica de escopo para corretor: `corretores.usuario_id === usuario.id` → filtra equipe, leads e vendas do próprio corretor
- Estado `semCorretorVinculado: true` quando o usuário com role=corretor não tem correspondência em `corretores.usuario_id`
- `fetchCorretores` mapeando `usuarioId: row.usuario_id`
- `fetchUsuariosCorretores()` — lista usuários com role=corretor para o select do modal de admin
- Interface `UsuarioCorretor` exportada

### Parte B — Dashboard individual do corretor
`app/(app)/page.tsx` — três fluxos:
1. **`semCorretorVinculado`** → aviso amarelo "Usuário não vinculado"
2. **`semEquipe`** → aviso amarelo (gestor sem equipe)
3. **`isCorretor`** → painel individual com KPIs (VGV, leads ativos, conversão, total), funil próprio, leads recentes
4. **admin/gestor** → dashboard global com pódio e funil

### Parte C — Leads do corretor
`app/(app)/leads/page.tsx`:
- Corretor: tabela com próprios leads (sem seção de fila, sem botão "Cadastrar")
- `semCorretorVinculado` → aviso
- Admin/gestor: fluxo original completo (fila + tabela + botão NovoLeadModal)

### Parte D — Pipeline do corretor
`app/(app)/pipeline/page.tsx`:
- Corretor vê kanban com os próprios leads (dados já escopados por `fetchTudoEscopado`)
- `semCorretorVinculado` → aviso
- Eyebrow/descrição adaptados: "Meu pipeline" para corretor

### Partes E/F — Corretores/Equipes/Ranking
Todas as três páginas:
- Corretor → "Área administrativa" (não "Área restrita")
- Gestor sem equipe → aviso warn

### Parte G — API status
`app/api/leads/[id]/status/route.ts` — sem alterações necessárias (já implementado na Tarefa 1)

### Parte H — API PATCH corretores
`app/api/corretores/[id]/route.ts` — endpoint admin-only:
- Validações: corretor na imobiliária, equipe válida, usuário com role=corretor+ativo+mesma imobiliária, sem duplicidade de `usuario_id`
- `revalidatePath` em `/`, `/corretores`, `/equipes`, `/leads`, `/pipeline`, `/ranking`
- Erros: `sem_permissao` (403), `corretor_nao_encontrado` (404), `equipe_invalida` (400), `usuario_invalido` (400), `usuario_ja_vinculado` (409)

### Componente EditarVinculoCorretorModal
`components/EditarVinculoCorretorModal.tsx` — Client Component:
- Select de equipe (pré-populado com `corretor.equipeId`)
- Select de usuário de login (pré-populado com `corretor.usuarioId`, opção "Sem usuário vinculado")
- `PATCH /api/corretores/[id]` com tratamento de erros por código
- `router.refresh()` no sucesso
- Botão "Editar vínculo" aparece apenas para admin nos cards de corretor

---

## Arquivos alterados

| Arquivo | Tipo |
|---------|------|
| `lib/types.ts` | Adicionado `usuarioId?: string | null` em `Corretor` |
| `lib/supabase-queries.ts` | `fetchCorretores`, `DadosEscopados`, `fetchTudoEscopado`, `fetchUsuariosCorretores` |
| `app/(app)/page.tsx` | Dashboard — 4 fluxos por role |
| `app/(app)/leads/page.tsx` | Leads — corretor vê tabela própria |
| `app/(app)/pipeline/page.tsx` | Pipeline — corretor vê próprio kanban |
| `app/(app)/corretores/page.tsx` | Admin vê botão "Editar vínculo" por card |
| `app/(app)/equipes/page.tsx` | Corretor → "Área administrativa" |
| `app/(app)/ranking/page.tsx` | Corretor → "Área administrativa" |
| `app/api/corretores/[id]/route.ts` | NOVO — PATCH admin-only |
| `components/EditarVinculoCorretorModal.tsx` | NOVO — modal de vínculo |

---

## Resultado do build

```
✓ Compiled successfully
✓ Generating static pages (11/11)
```
Sem erros TypeScript ou ESLint.

---

## Próximo passo

Migration 006: adicionar coluna `equipe_id` à tabela `usuarios` (já existe como arquivo `supabase/migrations/006_usuarios_equipe_id.sql`). Aguarda confirmação para aplicar no banco.
