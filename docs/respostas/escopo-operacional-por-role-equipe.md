# Escopo Operacional por Role e Equipe

**Data:** 2026-06-26  
**Tarefa:** Aplicar escopo operacional por role/equipe em todas as telas e APIs

---

## Arquivos alterados nesta tarefa

| Arquivo | Tipo de mudança |
|---------|----------------|
| `lib/supabase-queries.ts` | Adicionado `fetchTudoEscopado()` + interface `DadosEscopados` |
| `app/(app)/page.tsx` | Dashboard escopado + controlled states |
| `app/(app)/leads/page.tsx` | Migrado para `fetchTudoEscopado`, removido scope manual |
| `app/(app)/pipeline/page.tsx` | Pipeline escopado + controlled states |
| `app/(app)/corretores/page.tsx` | Corretores escopados, botão "Adicionar corretor" restrito |
| `app/(app)/equipes/page.tsx` | Equipes escopadas, botão "Nova equipe" restrito |
| `app/(app)/ranking/page.tsx` | Ranking escopado, tabs por role |
| `app/api/leads/[id]/status/route.ts` | Validação de escopo para gestor (403 se lead de outra equipe) |

---

## Resumo técnico

### Função central: `fetchTudoEscopado()`

Adicionada em `lib/supabase-queries.ts`. Retorna `{ dados, usuario, semEquipe }`.

Lógica:
- **mock mode ou admin**: retorna dados completos sem filtro
- **gestor com `equipeId`**: filtra `equipes`, `corretores`, `pistas` e `vendas` para a equipe do gestor
- **gestor sem `equipeId`**: retorna coleções vazias e `semEquipe = true`
- **corretor**: retorna coleções vazias e `semEquipe = false`

### Páginas

Todas as 6 páginas do app foram migradas de `fetchTudo()` para `fetchTudoEscopado()`. Cada uma:
1. Retorna early com "Área restrita" para `role === "corretor"`
2. Retorna early com aviso de "Conta sem equipe vinculada" para `semEquipe === true`
3. Usa `dados.*` já filtrado para renderizar conteúdo

### Botões administrativos

- `Adicionar corretor` (`/corretores`): visível apenas para `role === "admin"`
- `Nova equipe` (`/equipes`): visível apenas para `role === "admin"`

### Ranking — lógica de tabs

- **`isGestorEscopado`**: `usuario?.role === "gestor" && dados.equipes.length === 1`
  - Evita importar `isMockMode` nas páginas
  - Em mock mode: `dados.equipes` tem múltiplas equipes → `isGestorEscopado = false` (comportamento normal)
  - Em modo real com gestor: `dados.equipes` tem 1 equipe → `isGestorEscopado = true`
- Para gestor: aba "Geral" oculta, aba da própria equipe sempre ativa, `searchParams.equipe` ignorado
- Para admin: comportamento original mantido

### API `PATCH /api/leads/[id]/status`

- `equipe_id` adicionado ao SELECT de `usuarios`
- Novo bloco "4a" antes do check de corretor:
  - Gestor sem `equipe_id` → 403 `gestor_sem_equipe`
  - Gestor com `equipe_id` diferente do lead → 403 `sem_permissao`

---

## Regras de negócio implementadas

| Role | Dashboard | Leads | Pipeline | Corretores | Equipes | Ranking | API status |
|------|-----------|-------|----------|-----------|---------|---------|------------|
| Admin | global | global | global | global + btn add | global + btn new | global + tabs | livre |
| Gestor | equipe | equipe | equipe | equipe (sem btn add) | equipe (sem btn new) | equipe (sem "Geral") | só própria equipe |
| Corretor | restrito | restrito | restrito | restrito | restrito | restrito | só lead próprio |
| Gestor s/ equipe | aviso | aviso | aviso | aviso | aviso | aviso | 403 |

---

## Comandos executados

```
npm run build        → ✓ passou
git status           → executado
git diff --name-only → executado
git diff --stat      → executado
```

---

## Resultado do `npm run build`

```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages (11/11)

Route (app)                              Size     First Load JS
├ ƒ /                                    149 B          87.2 kB
├ ƒ /corretores                          489 B          87.5 kB
├ ƒ /equipes                             489 B          87.5 kB
├ ƒ /leads                               2.89 kB        89.9 kB
├ ƒ /pipeline                            871 B          87.9 kB
└ ƒ /ranking                             149 B          87.2 kB
```

---

## Resultado do `git diff --stat`

```
 app/(app)/corretores/page.tsx      |  68 ++++++++++++++--
 app/(app)/equipes/page.tsx         |  80 ++++++++++++++++---
 app/(app)/leads/page.tsx           |  96 ++++++++++++++++++----
 app/(app)/page.tsx                 |  76 ++++++++++++++++--
 app/(app)/pipeline/page.tsx        |  59 ++++++++++++--
 app/(app)/ranking/page.tsx         |  88 +++++++++++++++++---
 app/api/leads/[id]/status/route.ts |  21 ++++-
 lib/supabase-queries.ts            |  86 ++++++++++++++++++++
```

---

## Pendências

- **Sidebar com usuário mock**: ainda exibe "João Carvalho / Administrador" fixo. Substituir pelo usuário autenticado real é trabalho pendente (Fase 6.2).
- **Corretor sem painel**: role `corretor` mostra "Área restrita" em todas as telas. Painel dedicado não foi implementado (fora do escopo desta tarefa).
- **Topbar**: pode exibir informações do usuário mock. Verificar se precisa de atualização junto com Sidebar.

---

## Riscos conhecidos

1. **Mock mode**: `fetchUsuarioAtual()` retorna `role: "gestor"` com `equipeId: null`. Em mock mode, `fetchTudoEscopado` retorna dados completos (short-circuit no `isMockMode`), então o mock renderiza como se fosse admin. Isso é intencional para desenvolvimento.

2. **Corretor sem vínculo**: se `corretor@teste.local` não tiver entrada em `corretores.usuario_id`, a API de status retorna 403 normalmente. Comportamento correto e documentado.

3. **`isGestorEscopado` assume dados.equipes.length === 1**: se por bug o banco retornar mais de 1 equipe para um gestor (RLS falha), a lógica de tabs do ranking não restringiria corretamente. Mitigação: o RLS deve garantir isso — verificar policies.

4. **Vendas sem `equipe_id` direto**: `fetchVendas()` não busca `equipe_id` da venda. O filtro de escopo usa `corretoresIds` (set de corretores da equipe). Se uma venda tiver `corretor_id` de outra equipe mas `lead_id` da equipe do gestor, ela pode ser excluída do resultado. Comportamento esperado pelo modelo de dados atual.

---

## Próximos passos recomendados

1. **Sidebar/Topbar com usuário real**: substituir "João Carvalho / Administrador" pelo `usuario.nome` e `usuario.role` do `fetchUsuarioAtual()` — alto impacto visual.
2. **Painel do corretor**: implementar visão restrita com os próprios leads (filtrando por `corretores.usuario_id`).
3. **Testar em produção** com `gestor@teste.local` e `corretor@teste.local` confirmando os critérios de aceite listados abaixo.
4. **Testar API de status** com Postman/cURL logado como gestor tentando alterar lead de outra equipe (espera 403).

---

## Checklist de teste manual

### Admin (`admin@teste.local`)
- [ ] Dashboard mostra métricas globais da imobiliária
- [ ] `/leads` mostra filas de Arkanjos e Genesis
- [ ] `/leads` mostra tabela com leads de ambas as equipes
- [ ] `/pipeline` mostra leads de ambas as equipes
- [ ] `/corretores` mostra corretores de ambas as equipes
- [ ] `/corretores` mostra botão "Adicionar corretor"
- [ ] `/equipes` mostra Arkanjos e Genesis
- [ ] `/equipes` mostra botão "Nova equipe"
- [ ] `/ranking` mostra aba "Geral", aba "Arkanjos", aba "Genesis"
- [ ] Ranking geral exibe todos os corretores

### Gestor Arkanjos (`gestor@teste.local`)
- [ ] Dashboard mostra eyebrow "Equipe Arkanjos" e descrição da equipe
- [ ] Dashboard KPIs refletem apenas dados Arkanjos
- [ ] `/leads` mostra apenas fila Arkanjos (sem fila Genesis)
- [ ] `/leads` tabela lista apenas leads Arkanjos
- [ ] `/pipeline` mostra apenas leads Arkanjos
- [ ] `/corretores` mostra apenas corretores Arkanjos
- [ ] `/corretores` NÃO mostra botão "Adicionar corretor"
- [ ] `/equipes` mostra apenas card Arkanjos (sem Genesis)
- [ ] `/equipes` NÃO mostra botão "Nova equipe"
- [ ] `/equipes` mostra descrição "Você gerencia a equipe Arkanjos…"
- [ ] `/ranking` mostra apenas aba "Arkanjos" (sem "Geral", sem "Genesis")
- [ ] Ranking exibe apenas corretores Arkanjos
- [ ] `PATCH /api/leads/{id_lead_genesis}/status` retorna 403

### Corretor (`corretor@teste.local`)
- [ ] Dashboard mostra "Área restrita"
- [ ] `/leads` mostra "Área restrita" (sem botão "Cadastrar lead")
- [ ] `/pipeline` mostra "Área restrita"
- [ ] `/corretores` mostra "Área restrita"
- [ ] `/equipes` mostra "Área restrita"
- [ ] `/ranking` mostra "Área restrita"
- [ ] `PATCH /api/leads/{lead_do_proprio_corretor}/status` funciona normalmente
- [ ] `PATCH /api/leads/{lead_de_outro_corretor}/status` retorna 403

### Gestor sem equipe_id (cenário de erro)
- [ ] Dashboard mostra aviso "Conta sem equipe vinculada"
- [ ] `/leads` mostra aviso "Conta sem equipe vinculada"
- [ ] Nenhuma tela vaza dados globais
