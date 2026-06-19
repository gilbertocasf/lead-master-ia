# Fase 1 — Planejamento Técnico: MVP Funcional de Leads
**Data:** 2026-06-19  
**Referência:** [auditoria-produto-completa-2026-06-19.md](./auditoria-produto-completa-2026-06-19.md)  
**Status:** Aguardando autorização para implementação

---

## Objetivo

Transformar o Lead Master IA de sistema somente-leitura em sistema funcional de entrada e distribuição de leads. Ao final desta fase, um usuário conseguirá:

1. Cadastrar um novo lead via formulário
2. Ver o lead aparecer na fila de distribuição da equipe correta
3. Clicar "Distribuir" e o lead ir automaticamente para o corretor de plantão
4. Ver o lead aparecer no pipeline do corretor

---

## Parte 1 — Análise de Bugs Bloqueantes

### BUG-01 — Diretório `app/corretores ` com espaço no nome

**Arquivo:** `app/corretores /page.tsx`  
**Diagnóstico:**

O diretório foi criado com um espaço no final do nome (`corretores ` em vez de `corretores`). Confirmado via `ls app/` — o diretório aparece como `corretores ` na listagem.

**Por que é crítico:**
- URLs geradas pelo Next.js App Router para `/corretores` mapeiam para o diretório `app/corretores/`. Com o espaço, há ambiguidade de resolução que pode falhar em ambientes Linux case-sensitive.
- Sistemas de CI/CD, scripts de build e ferramentas de análise estática podem não escapar o espaço corretamente.
- Um `git mv` futuro ou clone em outro ambiente pode criar um diretório diferente.
- O problema é silencioso: localmente parece funcionar, mas é uma bomba-relógio em qualquer mudança de ambiente.

**Correção necessária:** 1 comando git.

```bash
git mv "app/corretores " "app/corretores"
```

**Impacto em outros arquivos:** Zero. O Next.js App Router usa o sistema de arquivos como roteador — não há nenhum `import` explícito do diretório `corretores` em outros arquivos. A rota `/corretores` passa a funcionar pelo caminho correto automaticamente.

**Esforço:** 5 minutos.  
**Risco:** Mínimo — é apenas uma renomeação de diretório.

---

### BUG-04 — Texto "demonstração visual com dados fictícios" exposto ao usuário

**Arquivo:** `app/pipeline/page.tsx`, linhas 90–92  
**Trecho atual:**

```tsx
<p className="mt-2 text-xs text-ink-faint">
  Dica: na versão final, os cards serão arrastáveis entre colunas. Aqui é uma demonstração visual com dados fictícios.
</p>
```

**Por que é crítico:**
- Esta frase aparece na tela para qualquer visitante da página `/pipeline`.
- Em uma apresentação para uma imobiliária real, destrói a credibilidade do produto imediatamente.
- Não há nenhuma utilidade funcional no texto.

**Correção necessária:** Remover o bloco `<p>` das linhas 90–92.

**Impacto em outros arquivos:** Zero.  
**Esforço:** 2 minutos.  
**Risco:** Zero.

---

## Parte 2 — Análise da Implementação do Fluxo de Leads

### 2.1 Diagnóstico da Arquitetura Atual

O sistema usa um padrão Server Components com uma camada de dados centralizada:

```
app/leads/page.tsx          ← Server Component assíncrono
    └── fetchTudo()          ← Promise.all de 4 queries
         └── supabase-queries.ts ← dual-mode (Supabase ou mock)
```

**Problema central:** Botões em Server Components não suportam `onClick`. Os botões "Cadastrar lead" (`leads/page.tsx:31`) e "Distribuir" (`leads/page.tsx:80`) nunca terão ação enquanto a página for Server Component puro.

**Solução no Next.js 14:** Há duas abordagens — e ambas não exigem transformar a página inteira em Client Component:

| Abordagem | Quando usar | Trade-off |
|---|---|---|
| **Server Action + `<form>`** | Ações simples sem estado local | Sem JS no cliente, recarrega a rota |
| **Client Component filho** | Formulários com estado, modais, validação | Precisa de `"use client"` no componente filho |

Para o "Distribuir" (ação simples, 1 clique): Server Action direto via `<form>`.  
Para o "Cadastrar lead" (modal com formulário): Client Component novo.

---

### 2.2 Fluxo Completo a Implementar

```
[Usuário clica "Cadastrar lead"]
         ↓
[LeadModal abre (Client Component)]
         ↓
[Usuário preenche: nome, telefone, origem, interesse, faixa, equipe]
         ↓
[Submit chama Server Action: criarLead()]
         ↓
[INSERT INTO leads ... no Supabase]
         ↓
[revalidatePath("/leads") → página recarrega]
         ↓
[Lead aparece na fila da equipe selecionada]
         ↓
[Gerente vê fila, clica "Distribuir"]
         ↓
[Server Action: distribuirLead(leadId, corretorId)]
         ↓
[UPDATE leads SET corretor_id = {próximo de plantão}]
         ↓
[revalidatePath("/leads") + revalidatePath("/pipeline")]
         ↓
[Lead some da fila e aparece no pipeline do corretor]
```

---

## Parte 3 — Arquivos Identificados para Alteração

### 3.1 Novos arquivos (criação)

#### `app/actions/leads.ts` — Server Actions

Arquivo novo. Contém as 2 ações de escrita do sistema.

```
Função: criarLead(formData: FormData)
  - Valida campos obrigatórios (nome, telefone, equipe_id)
  - Chama supabase.from("leads").insert(...)
  - Chama revalidatePath("/leads") e revalidatePath("/")
  - Retorna { success: true } ou { error: string }
  - Em modo mock (sem Supabase): retorna erro explícito

Função: distribuirLead(leadId: string, corretorId: string)
  - Chama supabase.from("leads").update({ corretor_id: corretorId }).eq("id", leadId)
  - Chama revalidatePath("/leads"), revalidatePath("/pipeline"), revalidatePath("/")
  - Retorna { success: true } ou { error: string }
  - Em modo mock: retorna erro explícito
```

#### `components/LeadModal.tsx` — Formulário de cadastro (Client Component)

Arquivo novo. Modal com formulário de cadastro de lead.

```
Props:
  equipes: Equipe[]   ← recebidas do Server Component pai

Estado interno (useState):
  open: boolean        ← controla visibilidade do modal
  pending: boolean     ← controla estado de loading (useTransition)
  erro: string | null  ← erro da Server Action

Campos do formulário:
  - nome (text, obrigatório)
  - telefone (text, obrigatório)
  - origem (select: Instagram | Facebook | Outro)
  - interesse (text, placeholder: "Compra • Apto 2 quartos")
  - faixa_valor (text, opcional)
  - equipe_id (select: lista de equipes — já recebida como prop)

Comportamento:
  - onSubmit chama criarLead(formData)
  - Em sucesso: fecha modal, exibe feedback brevemente
  - Em erro: exibe mensagem de erro no modal
  - Em modo mock: exibe aviso "Configure Supabase para salvar"
```

#### `components/BotaoDistribuir.tsx` — Botão de distribuição (Client Component)

Arquivo novo. Substitui o botão "Distribuir" atual (que não faz nada).

```
Props:
  leadId: string
  corretorId: string    ← ID do próximo de plantão (calculado no Server Component)
  disabled: boolean     ← true quando não há corretor de plantão disponível

Comportamento:
  - Envolve a ação em useTransition para mostrar estado de loading
  - Chama distribuirLead(leadId, corretorId) via Server Action
  - Mostra spinner enquanto processa
  - Em erro: exibe toast ou alerta inline
```

### 3.2 Arquivos existentes que serão editados

#### `app/pipeline/page.tsx` (linhas 90–92)
- **Mudança:** Remover o `<p>` com o texto "demonstração visual" (BUG-04)
- **Impacto:** Zero em outros arquivos

#### `app/corretores /page.tsx` → `app/corretores/page.tsx`
- **Mudança:** Renomear diretório via `git mv` (BUG-01)
- **Impacto:** Zero em outros arquivos (App Router usa filesystem)

#### `app/leads/page.tsx`
- **Mudança 1:** Importar e renderizar `<LeadModal equipes={equipes} />` na prop `action` do `<PageHeader>` em vez do `<button>` atual
- **Mudança 2:** Importar e renderizar `<BotaoDistribuir>` no lugar do `<button>Distribuir</button>` atual
- **Mudança 3:** Calcular `proximo` uma vez por lead na fila, passar `proximo.id` como prop para `<BotaoDistribuir>`
- **A página continua sendo Server Component** — apenas embute novos Client Components filhos

#### `components/Topbar.tsx`
- **Mudança:** O botão "Novo lead" se torna um `<Link href="/leads">` (Next.js Link)
- **Justificativa:** Topbar fica no layout e não tem acesso às equipes. A página `/leads` já carrega as equipes e tem o `LeadModal` montado. Navegar para `/leads` é a forma mais simples e segura.
- **Sem mudança de arquitetura:** Topbar já é `"use client"` (importa `onClick`)

---

## Parte 4 — Componentes que Precisam Virar Client Components

| Componente | Situação atual | O que muda |
|---|---|---|
| `app/leads/page.tsx` | Server Component | **Não muda** — permanece Server Component |
| `components/LeadModal.tsx` | Não existe | Criado como **Client Component** (`"use client"`) |
| `components/BotaoDistribuir.tsx` | Não existe | Criado como **Client Component** (`"use client"`) |
| `components/Topbar.tsx` | Já é Client Component | Nenhuma mudança de tipo |

**Nota importante:** A estratégia de manter `leads/page.tsx` como Server Component é deliberada. O Next.js 14 permite que Server Components contenham Client Components como folhas da árvore. Os dados (leads, equipes, corretores) são carregados no servidor e passados como props para os Client Components filhos. Isso evita re-fetches no cliente e mantém a arquitetura atual intacta.

---

## Parte 5 — Server Actions Necessárias

### `criarLead(formData: FormData)`

```
Arquivo: app/actions/leads.ts
Diretiva: "use server"

Fluxo:
  1. Extrair campos do FormData
  2. Validar obrigatórios (nome, equipe_id)
  3. Checar hasSupabaseEnv — se false, retornar erro claro
  4. supabase.from("leads").insert({ nome, telefone, origem, interesse, faixa_valor, equipe_id, status: "novo", corretor_id: null })
  5. Em erro do Supabase: retornar { error: message }
  6. revalidatePath("/leads") — força recarregamento do Server Component
  7. revalidatePath("/") — atualiza KPIs do dashboard
  8. Retornar { success: true }

Não faz:
  - Distribuição automática (separar responsabilidades)
  - Validação de telefone (Phase 1 — mínimo viável)
  - Deduplicação por telefone (Phase 2)
```

### `distribuirLead(leadId: string, corretorId: string)`

```
Arquivo: app/actions/leads.ts
Diretiva: "use server"

Fluxo:
  1. Checar hasSupabaseEnv
  2. supabase.from("leads").update({ corretor_id: corretorId }).eq("id", leadId)
  3. Em erro: retornar { error: message }
  4. revalidatePath("/leads")
  5. revalidatePath("/pipeline")
  6. revalidatePath("/")
  7. Retornar { success: true }

Distribuição "automática":
  - O corretor já é calculado no Server Component via getProximoPlantao()
  - O BotaoDistribuir recebe corretorId como prop
  - A ação apenas persiste a decisão já calculada pelo servidor
  - Não há lógica de round-robin nesta fase (Phase 2: atualizar ordem_plantao após distribuição)
```

---

## Parte 6 — Alterações no Banco de Dados

**Resposta curta: nenhuma alteração necessária no schema para a Fase 1.**

A tabela `leads` no `supabase/schema.sql` já tem todos os campos necessários:

| Campo | Tipo | Mapeamento |
|---|---|---|
| `nome` | `text NOT NULL` | Campo obrigatório do formulário |
| `telefone` | `text` | Campo do formulário |
| `origem` | `lead_origem` enum | Select: Instagram/Facebook/Outro |
| `interesse` | `text` | Campo do formulário |
| `faixa_valor` | `text` | Campo do formulário |
| `equipe_id` | `uuid NOT NULL` | Select de equipes |
| `corretor_id` | `uuid` (nullable) | null ao criar, preenchido ao distribuir |
| `status` | `lead_status` | Padrão `'novo'` definido no banco |
| `observacoes` | `text` | Campo opcional (não incluído na Fase 1) |

**O que não precisa de schema change:**
- O INSERT vai usar os campos existentes
- O UPDATE do `corretor_id` usa campo já existente
- Os índices `idx_leads_fila` e `idx_leads_equipe_id` já cobrem as queries que serão feitas

**Nota sobre mock mode:** As Server Actions verificam `hasSupabaseEnv`. Em modo mock, as ações retornam erro e não tentam escrever no Supabase. O mock-data continua somente-leitura — isso é aceitável para Fase 1.

---

## Parte 7 — Riscos da Implementação

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | `revalidatePath` não invalida o cache corretamente | Baixa | Alto | Testar após implementar; adicionar `{ type: 'layout' }` se necessário |
| R2 | `LeadModal` perde contexto de equipes após refresh | Baixa | Médio | As equipes são prop do Server Component — sempre atualizadas no mount |
| R3 | Server Action falha silenciosamente em modo mock | Certa | Baixo | Exibir mensagem explícita "Configure Supabase para salvar dados" |
| R4 | `getProximoPlantao()` retorna null (sem corretor de plantão) | Possível | Médio | `BotaoDistribuir` recebe `disabled={!corretorId}` — botão desabilitado se não há próximo |
| R5 | BUG-01: `git mv` em sistema case-insensitive | Baixa | Alto | Ambiente é Linux (case-sensitive) — comando funcionará corretamente |
| R6 | Usuário submete formulário em modo mock e espera persistência | Média | Alto | Exibir banner na página de leads quando `!hasSupabaseEnv` |

---

## Parte 8 — Estimativa de Esforço por Tarefa

| Etapa | Tarefa | Arquivo(s) | Esforço |
|---|---|---|---|
| E1 | BUG-04: Remover texto de demo | `pipeline/page.tsx:90-92` | 5 min |
| E2 | BUG-01: Renomear diretório corretores | `app/corretores ` → `app/corretores` | 10 min |
| E3 | Criar Server Actions | `app/actions/leads.ts` (novo) | 45 min |
| E4 | Criar BotaoDistribuir | `components/BotaoDistribuir.tsx` (novo) | 20 min |
| E5 | Criar LeadModal (UI + integração) | `components/LeadModal.tsx` (novo) | 2h |
| E6 | Atualizar leads/page.tsx | `app/leads/page.tsx` | 20 min |
| E7 | Atualizar Topbar | `components/Topbar.tsx` | 10 min |
| E8 | Verificação end-to-end (Supabase) | — | 30 min |
| **Total** | | | **~4h 20min** |

---

## Parte 9 — Plano de Execução em Etapas Seguras

A ordem foi escolhida para: (1) começar com as tarefas mais seguras, (2) nunca quebrar o que já funciona, (3) testar incrementalmente.

### Etapa 1 — Correções visuais (sem risco, sem dependências)

```
1a. Remover texto "demonstração visual" do pipeline/page.tsx
    → Testar: /pipeline não mostra mais o texto
    
1b. Renomear app/corretores  → app/corretores via git mv
    → Testar: /corretores ainda carrega a página
```

**Critério de saída:** `/pipeline` e `/corretores` funcionam, BUG-01 e BUG-04 fechados.

---

### Etapa 2 — Server Actions (novo arquivo, sem tocar código existente)

```
2a. Criar app/actions/leads.ts
    - Implementar criarLead()
    - Implementar distribuirLead()
    - Testar com mock manual (import direto no REPL ou curl)
```

**Critério de saída:** Arquivo existe, TypeScript compila sem erro (`npm run build`).

---

### Etapa 3 — BotaoDistribuir (novo componente, sem alterar página)

```
3a. Criar components/BotaoDistribuir.tsx
    - Props: leadId, corretorId, disabled
    - Chama distribuirLead via Server Action
    - Estado de loading com useTransition
```

**Critério de saída:** Componente compila sem erro TypeScript.

---

### Etapa 4 — Integrar BotaoDistribuir na página de leads

```
4a. Editar app/leads/page.tsx:
    - Importar BotaoDistribuir
    - Calcular proximo de plantão por lead
    - Substituir <button>Distribuir</button> por <BotaoDistribuir ...>
    
4b. Testar: Com Supabase configurado, clicar Distribuir e verificar
    que o lead some da fila e aparece no pipeline com corretor atribuído
```

**Critério de saída:** Distribuição funciona end-to-end em modo Supabase.

---

### Etapa 5 — LeadModal (novo componente + integrar na página)

```
5a. Criar components/LeadModal.tsx
    - Trigger button + modal overlay
    - Formulário com campos definidos
    - Integração com criarLead() Server Action
    - Feedback de sucesso/erro
    
5b. Editar app/leads/page.tsx:
    - Substituir <button>Cadastrar lead</button> por <LeadModal equipes={equipes} />
    
5c. Testar: Cadastrar lead via formulário, verificar que aparece na fila
    da equipe selecionada
```

**Critério de saída:** Lead cadastrado aparece na fila imediatamente após submit.

---

### Etapa 6 — Topbar (polish final)

```
6a. Editar components/Topbar.tsx:
    - Transformar <button>Novo lead</button> em <Link href="/leads">
    - Estilizar como botão (manter aparência visual)
    
6b. Testar: Clicar "Novo lead" de qualquer página navega para /leads
```

**Critério de saída:** Navegação funciona de todas as páginas.

---

## Parte 10 — O Que Esta Fase NÃO Cobre (Phase 2)

As seguintes funcionalidades estão fora do escopo desta Fase 1 e serão abordadas separadamente:

- Rotação de plantão após distribuição (atualizar `ordem_plantao` no banco)
- Movimentação de status no pipeline (botões de avançar no Kanban)
- Filtros de ranking por equipe (BUG-03)
- Autenticação de usuários
- RLS no Supabase
- Integração com canais externos (Google Sheets, Meta Ads)
- Notificações ao gerente

---

## Resumo dos Arquivos por Ação

| Arquivo | Ação | Etapa |
|---|---|---|
| `app/pipeline/page.tsx` | Editar (remover 3 linhas) | 1a |
| `app/corretores /page.tsx` | Renomear diretório (git mv) | 1b |
| `app/actions/leads.ts` | Criar (novo arquivo) | 2a |
| `components/BotaoDistribuir.tsx` | Criar (novo arquivo) | 3a |
| `app/leads/page.tsx` | Editar (integrar BotaoDistribuir) | 4a |
| `components/LeadModal.tsx` | Criar (novo arquivo) | 5a |
| `app/leads/page.tsx` | Editar (integrar LeadModal) | 5b |
| `components/Topbar.tsx` | Editar (Link em vez de button) | 6a |

**Novos arquivos:** 3  
**Arquivos editados:** 4  
**Schema SQL:** sem alterações  
**package.json:** sem alterações  
**Dependências externas:** nenhuma nova

---

*Planejamento da Fase 1 concluído. Aguardando autorização para implementação.*
