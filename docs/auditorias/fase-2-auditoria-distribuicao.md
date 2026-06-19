# Fase 2 — Auditoria Funcional da Distribuição
**Data:** 2026-06-19  
**Referência:** [fase-1-6-definicao-produto.md](./fase-1-6-definicao-produto.md)  
**Status:** Aguardando autorização para implementação da Fase 3  
**Metodologia:** Leitura direta de todos os arquivos do projeto. Nenhuma inferência sem evidência no código.

---

## Sumário Executivo

O sistema possui **zero operações de escrita**. Não existe um único `INSERT`, `UPDATE` ou `DELETE` em nenhum arquivo. Não existe nenhum Server Action, nenhuma API route, nenhum `<form>`. O fluxo Lead → Fila → Distribuição → Corretor → Pipeline está **completamente bloqueado em todas as etapas**. O produto funciona apenas como painel de leitura de dados — mockados em desenvolvimento, e presumivelmente em produção também (pois as variáveis de ambiente do Supabase não estão confirmadas na Vercel).

Adicionalmente, há um bug estrutural no sistema de arquivos que provavelmente faz a rota `/corretores` retornar 404 em produção.

---

## 1. Páginas que Retornam Erro

### Bug Crítico: Rota `/corretores` — diretório com espaço no nome

**Evidência:**
```
python3 → repr('corretores ') # espaço no final
```

O diretório `app/corretores ` (com espaço ao final) não gera a rota `/corretores`. Em sistemas Linux (Vercel usa Linux), o Next.js App Router mapeia o nome do diretório literalmente. O resultado é:

- Rota servida pelo Next.js: `/corretores%20` (ou equivalente com espaço)
- Link no menu lateral: `/corretores` (sem espaço)
- **Resultado em produção: 404 garantido** ao clicar em "Corretores" no menu

Localmente o comportamento pode diferir dependendo do filesystem do OS (macOS é case-insensitive e faz normalização), mas no Vercel (Linux) a rota falha.

Isso também pode ser **uma das causas do 404 geral** reportado no Vercel, se o build do Next.js falha silenciosamente ao processar o diretório com espaço.

### Páginas sem tratamento de erro

Nenhuma página possui:
- `error.tsx` (captura erros de Server Components)
- `not-found.tsx` (página 404 customizada)
- `loading.tsx` (skeleton de carregamento)

Se `fetchTudo()` lançar uma exceção (ex.: timeout no Supabase), o Next.js renderizará a tela de erro padrão do framework — sem contexto para o usuário.

---

## 2. Rotas Quebradas

| Rota | Arquivo | Status | Problema |
|------|---------|--------|----------|
| `/` | `app/page.tsx` | Funciona (leitura) | — |
| `/leads` | `app/leads/page.tsx` | Funciona (leitura) | Botões sem ação |
| `/pipeline` | `app/pipeline/page.tsx` | Funciona (leitura) | Kanban visual apenas |
| `/corretores` | `app/corretores /page.tsx` | **404 em produção** | Espaço no nome do diretório |
| `/equipes` | `app/equipes/page.tsx` | Funciona (leitura) | Botão sem ação |
| `/ranking` | `app/ranking/page.tsx` | Funciona (leitura) | Filtros sem ação |
| `/api/leads` | — | **Não existe** | Necessário para webhook |
| `/api/leads/[id]/distribuir` | — | **Não existe** | Necessário para distribuição |
| `/api/leads/[id]/status` | — | **Não existe** | Necessário para pipeline |

---

## 3. Links do Menu que Não Funcionam

**Sidebar (`components/Sidebar.tsx`, linha 6–13):**

```typescript
const NAV = [
  { href: "/", label: "Dashboard" },         // ✓ funciona
  { href: "/leads", label: "Leads" },         // ✓ funciona (parcial — botões mortos)
  { href: "/pipeline", label: "Pipeline" },   // ✓ funciona (visual apenas)
  { href: "/corretores", label: "Corretores" }, // ✗ 404 em produção
  { href: "/equipes", label: "Equipes" },     // ✓ funciona (botão morto)
  { href: "/ranking", label: "Ranking VGV" }, // ✓ funciona (filtros mortos)
];
```

**Link no Dashboard:**
- `<a href="/ranking">` (linha 55 de `app/page.tsx`) → funciona

---

## 4. Botões sem Ação

Total encontrado: **9 elementos `<button>`** no projeto.  
Botões com `onClick` real: **1** (hambúrguer do menu mobile).  
Botões sem nenhuma ação: **8**.

| # | Botão | Arquivo | Linha | Impacto |
|---|-------|---------|-------|---------|
| 1 | "Novo lead" | `Topbar.tsx` | 28 | Duplica o botão de leads, sem ação |
| 2 | "Cadastrar lead" | `leads/page.tsx` | 31 | **Bloqueio de entrada de leads** |
| 3 | "Distribuir" | `leads/page.tsx` | 80 | **Bloqueio da distribuição** |
| 4 | "Adicionar corretor" | `corretores /page.tsx` | 33 | Sem ação de escrita |
| 5 | "Nova equipe" | `equipes/page.tsx` | 28 | Sem ação de escrita |
| 6 | Filtro "Geral" | `ranking/page.tsx` | 21 | Visual — aparece como ativo mas não filtra |
| 7 | Filtro "Atlântico" | `ranking/page.tsx` | 22 | Visual — não filtra nada |
| 8 | Filtro "Horizonte" | `ranking/page.tsx` | 23 | Visual — não filtra nada |

**Nota sobre o botão "Distribuir":** aparece uma vez por lead na fila. Com 4 leads na fila (no mock), são 4 instâncias do mesmo botão morto. Em produção com dados reais, o número cresceria com o volume.

---

## 5. Componentes Apenas Visuais

### 5.1 Interações completamente decorativas

| Componente | Localização | O que aparenta fazer | O que faz de verdade |
|------------|-------------|---------------------|----------------------|
| Filtro de período "Junho 2026" | `Topbar.tsx:20–25` | Seletor de período | `<div>` estático com texto fixo |
| Pipeline Kanban | `pipeline/page.tsx` | Cards arrastáveis entre colunas | Colunas fixas, sem drag-and-drop. O próprio código avisa: *"na versão final, os cards serão arrastáveis"* (linha 90–92) |
| Perfil lateral "João Carvalho / Administrador" | `Sidebar.tsx:81–91` | Usuário logado com papel | Hard-coded. Sem autenticação, sem logout, sem troca de usuário |
| Filtros de ranking (Geral / Atlântico / Horizonte) | `ranking/page.tsx:21–23` | Filtra ranking por equipe | Nenhuma lógica vinculada. `getRanking` aceita `equipeId` mas não é chamada com ele |

### 5.2 Elementos com lógica real mas sem escrita

| Componente | O que calcula corretamente | O que não executa |
|------------|---------------------------|-------------------|
| Sugestão "Próximo de plantão" | `getProximoPlantao()` retorna o corretor correto | Clicar em "Distribuir" não usa o valor sugerido |
| KPIs do dashboard | VGV, conversão, naFila calculados de dados reais | `naFila` não diminui porque distribuição não existe |
| Funil de pipeline | Conta leads por status corretamente | Status nunca muda porque não há escrita |

---

## 6. Telas Prontas para Receber Operações Reais

Classificação por grau de preparação:

### Prontas (lógica de leitura completa, precisam de escrita)

**`/leads` — tela de distribuição**  
É a tela mais preparada do sistema. A lógica de fila (`naFila`/`distribuidos`), sugestão de plantão e separação por equipe já funcionam. Falta apenas o `onClick` do botão "Distribuir" conectado a uma Server Action ou API route que faça `.update()` no banco.

**`/pipeline` — kanban visual**  
Renderiza os cards corretamente por coluna. A estrutura de colunas (`PIPELINE_ORDER`), cores e contadores estão prontos. Falta: tornar os cards clicáveis para editar status, ou implementar drag-and-drop.

**`/ranking` — tabela VGV**  
Cálculo correto de posição, VGV total e ticket médio. Falta: conectar os três botões de filtro à função `getRanking(dados, equipeId)` que já aceita o parâmetro.

### Parcialmente prontas (precisam de ajustes além da escrita)

**`/corretores` — quadro de corretores**  
Exibe dados corretamente. Dois problemas: (a) nome do diretório com espaço (rota 404); (b) não há como alterar `emPlantao` porque o banco não tem coluna `em_plantao` separada — código usa `ativo` como proxy.

**`/equipes` — visão de equipes**  
Funciona bem para leitura. Para escrita, precisaria de formulário de nova equipe e de edição de membros.

### Não pronta (dependente de outras implementações)

**`/` — dashboard**  
Os KPIs são corretos, mas o "Leads recentes" e o "Funil" dependem de leads reais entrando. Com mock permanente, o dashboard nunca muda.

---

## 7. Bloqueios do Fluxo Lead → Fila → Distribuição → Corretor → Pipeline

```
╔══════════════════════════════════════════════════════════════════╗
║  FLUXO IDEAL          BLOQUEIO ATUAL         CAUSA              ║
╠══════════════════════════════════════════════════════════════════╣
║  Lead entra           ✗ BLOQUEADO            Sem formulário;    ║
║                                              sem API webhook;   ║
║                                              sem Server Action  ║
╠══════════════════════════════════════════════════════════════════╣
║  Lead → Fila          ✗ DEPENDE DO ANTERIOR  Lead não entra,   ║
║  (equipe_id null →    A lógica de fila       não há fila real   ║
║   corretorId null)    EXISTE mas com         no banco           ║
║                       dados mock apenas       ║                 ║
╠══════════════════════════════════════════════════════════════════╣
║  Fila →               ✗ BLOQUEADO            Botão "Distribuir" ║
║  Distribuição         Botão renderiza,        sem onClick;      ║
║                       não executa             sem .update()     ║
║                                              no banco           ║
╠══════════════════════════════════════════════════════════════════╣
║  Distribuição →       ✗ DEPENDE DO ANTERIOR  corretorId nunca  ║
║  Corretor             A query de exibição     é gravado no banco ║
║  (corretor_id set)    funciona; o UPDATE      ║                 ║
║                       não existe              ║                 ║
╠══════════════════════════════════════════════════════════════════╣
║  Corretor →           ✗ BLOQUEADO            Cards não são     ║
║  Pipeline             Visualização correta    interativos;      ║
║  (status evolui)      das colunas; status     sem .update()     ║
║                       nunca muda              no banco           ║
╚══════════════════════════════════════════════════════════════════╝
```

**Resumo:** 5 de 5 etapas do fluxo estão bloqueadas. As etapas 2 e 4 têm lógica de leitura correta, mas dependem de etapas anteriores para ter dados reais no banco.

---

## 8. Problemas de Schema vs Código

### 8.1 Coluna `em_plantao` não existe no banco

**Schema `corretores`:** `id, nome, email, telefone, equipe_id, ordem_plantao, ativo, created_at`  
**Tipo `Corretor`:** inclui campo `emPlantao: boolean`

O código contorna isso em `fetchCorretores()` (`supabase-queries.ts:97`):
```typescript
emPlantao: Boolean(row.ativo),  // "ativo" usado como proxy
```

**Consequência:** em Supabase mode, `emPlantao === ativo` sempre. Um corretor não pode estar ativo (visível no sistema) mas fora de plantão (não recebe leads). O toggle de plantão por turno/dia não é suportado.

### 8.2 Campos `regiao` e `captadorNome` não existem no banco

**Schema `leads`:** não tem `regiao` nem `captador_nome`  
**Tipo `Lead`:** declara `regiao: string` e `captadorNome: string`

O código mapeia com strings vazias (`supabase-queries.ts:122–129`):
```typescript
regiao: "",         // sem coluna no banco
captadorNome: "",   // sem coluna no banco
```

**Consequência:** dados de região e captador exibidos no mock (`"Setor Bueno"`, `"Tiago (captador)"`) desaparecem em Supabase mode. A UI mostra campos em branco sem alertar.

### 8.3 `motivoPerda` mapeado a partir de `observacoes`

O tipo `Lead` tem `motivoPerda?: string`. No banco não há coluna dedicada — o código usa `observacoes` quando `status === "perdido"`:
```typescript
motivoPerda: comoStatus(row.status) === "perdido" ? row.observacoes ?? undefined : undefined,
```

**Consequência:** um lead com `status = "perdido"` perde qualquer observação legítima. E ao mover um lead para "perdido", o campo `observacoes` seria sobrescrito com o motivo de perda (se a escrita existisse).

### 8.4 Campos `imovel` e `equipeId` ausentes na tabela `vendas`

**Schema `vendas`:** `id, corretor_id, lead_id, valor_vgv, data_venda, created_at`  
**Tipo `Venda`:** inclui `imovel: string` e `equipeId: string`

O código resolve equipe via join com corretores no `getRanking()` (correto). `imovel` fica como string vazia. No mock, `imovel` é exibido como `"Apto Setor Bueno • 92m²"` — esse dado some em Supabase mode.

---

## 9. Problemas Adicionais Identificados

### 9.1 Autenticação inexistente

- `lib/supabase.ts`: `auth: { persistSession: false }` — sem sessão
- `UserRole` definido em `types.ts` mas **nunca utilizado em nenhuma página ou componente**
- Sidebar: `"João Carvalho / Administrador"` é texto hard-coded
- Sem login, sem logout, sem controle de acesso
- Todas as queries rodam com `anon_key` — dependem de RLS do Supabase
- O schema SQL **não define nenhuma policy RLS** — se o Supabase tem RLS habilitado por padrão nas tabelas, **todas as queries retornam 0 registros** em produção (silenciosamente caindo para mock)

### 9.2 Sem feedback de carregamento

Todas as páginas são Server Components com `await fetchTudo()`. Sem `loading.tsx`, o usuário vê uma tela em branco enquanto a query executa no Supabase. Em conexões lentas, pode parecer que a página quebrou.

### 9.3 Filtro de período decorativo

O "Junho 2026" na Topbar (`Topbar.tsx:20–25`) é um `<div>` estático. Nenhuma query filtra por período. Todos os dados retornados são o conjunto completo do banco, sem janela temporal. KPIs de "VGV do mês" na verdade mostram VGV de todos os tempos.

### 9.4 Duplicação do botão "Novo lead"

- Topbar tem "Novo lead" (visível em telas ≥ sm) → sem ação
- `/leads` tem "Cadastrar lead" → sem ação  
São dois botões diferentes apontando para a mesma funcionalidade inexistente.

### 9.5 Perfil de usuário hard-coded incompatível com multi-usuário

O sistema foi concebido com 4 papéis (`UserRole`: `admin`, `captador`, `gerente`, `corretor`), mas a Sidebar exibe sempre "João Carvalho / Administrador". Implementar qualquer controle de acesso baseado em papel exigirá remover esse hard-code e conectar a sessão real.

---

## 10. Lista Priorizada de Correções

### CRÍTICO — Bloqueiam o uso real do sistema

| ID | Problema | Arquivo afetado | Esforço estimado |
|----|----------|-----------------|------------------|
| C1 | Diretório `corretores ` com espaço → rota 404 em produção | `app/corretores /` | **15 min** — renomear diretório |
| C2 | Nenhuma operação de escrita existe no sistema | `lib/supabase-queries.ts` + novas API routes | **8–16h** — core do produto |
| C3 | Botão "Cadastrar lead" sem ação (entrada do fluxo) | `app/leads/page.tsx:31` + novo modal | **4–6h** — formulário + Server Action |
| C4 | Botão "Distribuir" sem ação (etapa central do fluxo) | `app/leads/page.tsx:80` + nova Server Action | **2–3h** — update de corretor_id |
| C5 | Variáveis de ambiente não confirmadas na Vercel | Painel Vercel | **30 min** — verificação e configuração |
| C6 | Possível ausência de policies RLS no Supabase | Painel Supabase | **1h** — criar policies ou desabilitar RLS em dev |

### ALTO — Impedem o pipeline de funcionar após distribuição

| ID | Problema | Arquivo afetado | Esforço estimado |
|----|----------|-----------------|------------------|
| A1 | Pipeline sem interatividade — status de lead nunca muda | `app/pipeline/page.tsx` + Server Action | **6–10h** — drag-and-drop ou botões de avanço |
| A2 | `em_plantao` não existe no banco — impossível fazer toggle de turno | Schema `corretores` + UI | **2–3h** — adicionar coluna + UI de toggle |
| A3 | Sem `error.tsx` — erros de Server Component mostram tela branca | `app/error.tsx` (criar) | **1h** — página de erro básica |
| A4 | Sem `loading.tsx` — usuário vê tela em branco durante fetch | `app/loading.tsx` (criar) | **1h** — skeleton básico |
| A5 | Botão "Novo lead" na Topbar duplica "Cadastrar lead" sem ação | `components/Topbar.tsx:28` | **30 min** — conectar ao mesmo modal de C3 |

### MÉDIO — Degradam a experiência mas não bloqueiam o fluxo

| ID | Problema | Arquivo afetado | Esforço estimado |
|----|----------|-----------------|------------------|
| M1 | Filtros de ranking (Geral/Atlântico/Horizonte) sem ação | `app/ranking/page.tsx:21–23` | **2–3h** — estado local + chamada com equipeId |
| M2 | `regiao` e `captadorNome` ausentes do schema | Schema `leads` + queries | **1–2h** — adicionar colunas ou remover campos do tipo |
| M3 | `motivoPerda` compartilha coluna `observacoes` — conflito semântico | Schema `leads` + queries | **1–2h** — coluna dedicada `motivo_perda` |
| M4 | Filtro de período "Junho 2026" puramente decorativo | `Topbar.tsx` + todas as queries | **4–8h** — filtro real com seletor + queries com `WHERE data >= ?` |
| M5 | Campos `imovel` em vendas — dado visível no mock some em Supabase mode | Schema `vendas` + UI | **1h** — adicionar coluna `imovel` ao schema |
| M6 | `not-found.tsx` ausente — 404 sem contexto | `app/not-found.tsx` (criar) | **30 min** |

### BAIXO — Melhorias de experiência e manutenibilidade

| ID | Problema | Arquivo afetado | Esforço estimado |
|----|----------|-----------------|------------------|
| B1 | Perfil "João Carvalho" hard-coded na Sidebar | `Sidebar.tsx:81–91` | Bloqueado até autenticação existir |
| B2 | `UserRole` declarado em `types.ts` mas nunca usado | `types.ts:3` | Bloqueado até autenticação existir |
| B3 | `captadorNome` no tipo `Lead` nunca preenchido em Supabase mode | `lib/supabase-queries.ts:129` | **30 min** — remover campo ou preencher via join |
| B4 | Sem feedback visual quando fila está vazia e nenhum lead existe | `app/leads/page.tsx` | **1h** — estado de tela vazia aprimorado |
| B5 | Sem policies RLS definidas no schema.sql | `supabase/schema.sql` | **2–3h** — definir policies por papel |
| B6 | Funil some VGV de vendas vs leads-fechados (possível dupla contagem) | `supabase-queries.ts:259` | **1h** — revisar lógica de contagem |

---

## Resumo de Esforço Total

| Prioridade | Itens | Esforço estimado |
|------------|-------|------------------|
| CRÍTICO (6 itens) | C1–C6 | 15–26h |
| ALTO (5 itens) | A1–A5 | 10–15h |
| MÉDIO (6 itens) | M1–M6 | 10–17h |
| BAIXO (6 itens) | B1–B6 | ~5h (parcialmente bloqueado) |
| **Total** | **23 itens** | **~40–63h** |

**Caminho mínimo para um loop funcional (demo ao vivo):**  
C1 (15 min) + C5 (30 min) + C6 (1h) + C3 (4–6h) + C4 (2–3h) + A3 (1h) = **~9–12h de trabalho**

Depois dessas 9–12h, o ciclo Lead → Fila → Distribuição → Corretor funcionaria em produção com dados reais.

---

## Mapa de Dependências para Implementação

```
C5 (env Vercel) ──────┐
C6 (RLS Supabase) ────┤
                      ├──→ C3 (cadastrar lead) ──→ C4 (distribuir) ──→ A1 (pipeline)
C1 (dir corretores) ──┘
                               ↑
                         A2 (em_plantao)
                         [necessário para distribuição funcionar corretamente]
```

A ordem recomendada de implementação na Fase 3:

1. **C1** — Renomear diretório (minutos, zero risco)
2. **C5 + C6** — Confirmar infra (verificação, sem código)
3. **A3 + M6** — Páginas de erro/not-found (1h, zero risco)
4. **C3** — Formulário de cadastro de lead (core da entrada)
5. **C4** — Server Action de distribuição (core do produto)
6. **A2** — Coluna `em_plantao` + toggle (necessário para distribuição fazer sentido)
7. **A1** — Pipeline interativo (fecha o loop)

---

Auditoria funcional concluída. Aguardando autorização para implementação da Fase 3.
