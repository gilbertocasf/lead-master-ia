# Exclusão segura de corretores e equipes

Data: 2026-06-26

---

## Arquivos alterados

- `app/(app)/corretores/page.tsx` — importa e exibe `DesativarCorretorModal` para admin
- `app/(app)/equipes/page.tsx` — importa e exibe `ExcluirEquipeModal` para admin
- `app/(app)/leads/page.tsx` — corrige lookup de corretor inativo (mostra "—" em vez de "Na fila")
- `app/api/corretores/[id]/route.ts` — adiciona handler `DELETE`
- `lib/supabase-queries.ts` — filtra `ativo = true` em `fetchCorretores` e `fetchEquipes`

---

## APIs criadas/alteradas

### `DELETE /api/corretores/[id]`
- **Criada** no arquivo já existente `app/api/corretores/[id]/route.ts`
- Exige autenticação e role `admin`
- Valida que o corretor pertence à mesma `imobiliaria_id` do admin
- Executa **soft delete**: `ativo = false`, `em_plantao = false`
- Mantém `equipe_id` e `usuario_id` para preservar histórico e leitura operacional
- Revalida 6 paths: `/`, `/corretores`, `/equipes`, `/leads`, `/pipeline`, `/ranking`

### `DELETE /api/equipes/[id]`
- **Criada** no novo arquivo `app/api/equipes/[id]/route.ts`
- Exige autenticação e role `admin`
- Valida que a equipe pertence à mesma `imobiliaria_id` do admin
- **Bloqueia** se houver corretores ativos na equipe (código: `equipe_com_corretores`)
- Executa **soft delete**: `ativo = false`
- Revalida 6 paths: `/`, `/equipes`, `/corretores`, `/leads`, `/pipeline`, `/ranking`

---

## Componentes criados/alterados

### `components/DesativarCorretorModal.tsx` (novo)
- Client component com modal de confirmação
- Botão "Remover corretor" com estilo `loss` (vermelho)
- Exibe aviso claro sobre preservação de histórico
- Chama `DELETE /api/corretores/[id]`
- Trata todos os códigos de erro via `MENSAGENS` dict
- Faz `router.refresh()` após sucesso

### `components/ExcluirEquipeModal.tsx` (novo)
- Client component com modal de confirmação
- Botão "Remover equipe" com estilo `loss`
- Exibe aviso sobre necessidade de transferir corretores antes
- Chama `DELETE /api/equipes/[id]`
- Trata `equipe_com_corretores` com mensagem específica
- Faz `router.refresh()` após sucesso

---

## Regra aplicada para remover corretor

**Soft delete**: `ativo = false`, `em_plantao = false`

Razão: `vendas.corretor_id` tem `ON DELETE RESTRICT` no schema — hard delete seria bloqueado se o corretor tiver vendas. Mesmo sem vendas, soft delete é preferível para consistência.

- `equipe_id` é **preservado** (mantém referência histórica)
- `usuario_id` é **preservado** (evita invalidar login existente)
- Leads vinculados: `leads.corretor_id` tem `ON DELETE SET NULL` — se fosse hard delete, os leads voltariam à fila. Com soft delete, o `corretor_id` permanece no banco mas o corretor não aparece mais na lista ativa.

---

## Regra aplicada para remover equipe

**Soft delete**: `ativo = false`

Razão:
- `corretores.equipe_id ON DELETE RESTRICT` → hard delete bloqueado se há corretores (mesmo inativos)
- `leads.equipe_id ON DELETE RESTRICT` → hard delete bloqueado se há leads

Fluxo:
1. Verifica corretores com `ativo = true` na equipe → bloqueia se existirem
2. Se não houver corretores ativos → soft delete (`ativo = false`)
3. Corretores inativos vinculados à equipe são preservados
4. Leads históricos são preservados

---

## Filtros para ativos/inativos

`lib/supabase-queries.ts`:
- `fetchEquipes()`: adicionado `.eq("ativo", true)` → equipes inativas não aparecem em nenhuma tela
- `fetchCorretores()`: adicionado `.eq("ativo", true)` → corretores inativos não aparecem em nenhuma tela

`app/(app)/leads/page.tsx`:
- Lookup de corretor agora distingue `corretorId === null` ("Na fila") de corretor não encontrado na lista ativa ("—")

Impacto operacional dos filtros:
- Corretores inativos não aparecem no card de corretores
- Corretores inativos não entram no `getProximoPlantao()` (já filtrava por `ativo && emPlantao`)
- Corretores inativos não aparecem como opção no `NovoLeadModal` (usa `dados.corretores`)
- Equipes inativas não aparecem como opção para novos leads ou novos corretores
- Leads históricos com `corretor_id` de corretor inativo mostram "—" na coluna Corretor

---

## Resumo técnico

| Item | Decisão |
|------|---------|
| Corretor com vendas | Hard delete bloqueado por FK; soft delete aplicado |
| Corretor sem vendas | Soft delete por consistência |
| Equipe com corretores ativos | Bloqueado na API (`equipe_com_corretores`) |
| Equipe com corretores inativos | Soft delete permitido |
| Equipe com leads históricos | Soft delete (FK `ON DELETE RESTRICT` bloquearia hard delete) |
| Autorização | Apenas `admin`; verificado por `role` + `imobiliaria_id` |
| RLS/schema | Não alterados |
| Migration | Não criada |

---

## Regras de negócio preservadas

1. ✅ Apenas `admin` pode excluir corretor (verificado na API)
2. ✅ Apenas `admin` pode excluir equipe (verificado na API)
3. ✅ Gestor não vê botão de excluir (condição `isAdmin` na UI)
4. ✅ Corretor não acessa área administrativa
5. ✅ Leads antigos não são apagados
6. ✅ Vendas antigas não são apagadas
7. ✅ Histórico de leads da equipe preservado
8. ✅ Corretores não são apagados automaticamente ao excluir equipe
9. ✅ Verificação de corretores ativos bloqueia remoção de equipe com membros
10. ✅ Sem alteração de usuário Auth
11. ✅ Sem migration
12. ✅ Sem alteração de RLS/policies/schema

---

## Comandos executados

```bash
npm run build
git status
git status --short
git diff --name-only
git diff --stat
```

---

## Resultado do `npm run build`

```
✓ Compiled successfully
✓ Generating static pages (13/13)

Route (app)                              Size     First Load JS
├ ƒ /api/corretores/[id]                 0 B                0 B
├ ƒ /api/equipes/[id]                    0 B                0 B  ← nova rota
├ ƒ /corretores                          3.69 kB        90.7 kB
├ ƒ /equipes                             2.58 kB        89.6 kB
```

Build passou sem erros de tipo ou compilação.

---

## Resultado do `git status`

```
On branch main
Changes not staged for commit:
  modified:   app/(app)/corretores/page.tsx
  modified:   app/(app)/equipes/page.tsx
  modified:   app/(app)/leads/page.tsx
  modified:   app/api/corretores/[id]/route.ts
  modified:   lib/supabase-queries.ts

Untracked files:
  app/api/equipes/[id]/
  components/DesativarCorretorModal.tsx
  components/ExcluirEquipeModal.tsx
```

## Resultado do `git status --short`

```
 M app/(app)/corretores/page.tsx
 M app/(app)/equipes/page.tsx
 M app/(app)/leads/page.tsx
 M app/api/corretores/[id]/route.ts
 M lib/supabase-queries.ts
?? app/api/equipes/[id]/
?? components/DesativarCorretorModal.tsx
?? components/ExcluirEquipeModal.tsx
```

## Resultado do `git diff --name-only`

```
app/(app)/corretores/page.tsx
app/(app)/equipes/page.tsx
app/(app)/leads/page.tsx
app/api/corretores/[id]/route.ts
lib/supabase-queries.ts
```

## Resultado do `git diff --stat`

```
app/(app)/corretores/page.tsx    | 16 +++++----
app/(app)/equipes/page.tsx       |  7 ++++
app/(app)/leads/page.tsx         |  7 +++-
app/api/corretores/[id]/route.ts | 70 ++++++++++++++++++++++++++++++++++++++++
lib/supabase-queries.ts          |  2 ++
5 files changed, 95 insertions(+), 7 deletions(-)
```

---

## Pendências

1. **Corretor inativo com `corretor_id` em leads históricos**: a coluna "Corretor" na tabela de leads mostra "—" para corretores inativos. Se necessário no futuro, isso pode ser melhorado com uma query que inclua corretores inativos separadamente para resolução de nomes.

2. **Reativar corretor**: não há UI para reativar um corretor desativado. Pode ser feito via `PATCH /api/corretores/[id]` se necessário, mas não foi incluído no escopo desta tarefa.

3. **Reativar equipe**: não há UI para reativar uma equipe desativada. Idem.

4. **Ordenação de plantão após desativar**: os números de `ordem_plantao` dos demais corretores não são reorganizados após desativar um. A fila simplesmente pula o inativo.

---

## Riscos conhecidos

- **Corretor com leads na fila**: se um corretor for desativado mas tiver leads com `corretor_id` apontando para ele e `status = 'novo'`, esses leads continuam existindo no banco com o `corretor_id` do corretor inativo. A fila operacional não os exibirá (pois a equipe e o corretor saem da tela ativa), mas os leads permanecem no banco com `status = 'novo'`. Eles precisam ser redistribuídos manualmente se necessário.

- **Equipe com corretores inativos**: a regra bloqueia apenas corretores **ativos**. Uma equipe pode ser desativada mesmo que tenha corretores inativos vinculados a ela. Isso é intencional para não bloquear a remoção de equipes com membros já desligados.

---

## Checklist de teste manual

### Admin

- [ ] Abre card de corretor → vê botão "Remover corretor"
- [ ] Clica em "Remover corretor" → abre modal com aviso sobre histórico
- [ ] Confirma remoção → corretor desaparece da lista (refresh)
- [ ] Corretor removido não aparece na fila de plantão
- [ ] Corretor removido não aparece como opção de captador no NovoLeadModal
- [ ] Lead antigo com `corretor_id` do corretor removido mostra "—" na coluna Corretor
- [ ] Abre card de equipe → vê botão "Remover equipe"
- [ ] Tenta remover equipe com corretores ativos → recebe erro claro "Transfira ou desative os corretores..."
- [ ] Desativa todos os corretores da equipe → tenta remover equipe → sucesso
- [ ] Equipe removida não aparece como opção para novos leads
- [ ] Equipe removida não aparece na lista de equipes

### Gestor

- [ ] Abre página de corretores → NÃO vê botão "Remover corretor"
- [ ] Abre página de equipes → NÃO vê botão "Remover equipe"
- [ ] Tenta `DELETE /api/corretores/[id]` diretamente → recebe 403 `sem_permissao`
- [ ] Tenta `DELETE /api/equipes/[id]` diretamente → recebe 403 `sem_permissao`

### Corretor

- [ ] Não acessa área administrativa (redirecionado ou vê mensagem bloqueada)
- [ ] Tenta `DELETE /api/corretores/[id]` diretamente → recebe 403 `sem_permissao`
- [ ] Tenta `DELETE /api/equipes/[id]` diretamente → recebe 403 `sem_permissao`
