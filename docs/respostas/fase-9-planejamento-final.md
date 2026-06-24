# Fase 9 — Planejamento Final
**Data:** 2026-06-22  
**Status das fases anteriores:** 4, 5, 6.1, 6.2, 7 e 8 — todas concluídas  
**Método:** Análise do código real, documentação e estado pós-Fase 8

---

## 1. Objetivo de negócio da Fase 9

A Fase 9 **não é uma fase de implementação** — é uma fase de **validação comercial**.

O objetivo é executar um demo end-to-end diante de um prospect real, provando que o loop operacional mínimo funciona em produção (Vercel + Supabase real, sem dados mock, sem intervenção manual no banco durante o demo).

Critério de encerramento único: **demo executada sem erros em produção.**

O produto precisa mostrar o que nenhum CRM genérico mostra: lead entra, sistema distribui automaticamente para o corretor de plantão, sem o gestor tocar em nada.

---

## 2. Fluxo completo a ser demonstrado

O roteiro original de `docs/PROXIMAS-FASES.md` foi escrito antes da Fase 7 confirmar distribuição automática. O roteiro atualizado, baseado no estado real da implementação:

```
ROTEIRO ATUALIZADO — FASE 9

1. Abrir /leads
   └─ Mostrar fila vazia (ou limpa de dados de teste)

2. Cadastrar lead via formulário "Novo lead"
   ├─ Preencher: nome, telefone, origem, equipe
   └─ Clicar "Cadastrar lead"
   
3. [SISTEMA DISTRIBUI AUTOMATICAMENTE]
   ├─ RPC criar_e_distribuir_lead executa em < 1s
   ├─ Lead recebe corretor_id + distribuido_em na criação
   └─ Sem clique manual — esse é o diferencial do produto

4. Abrir /pipeline
   └─ Lead aparece na coluna "Novo" com:
       • Nome do lead
       • Corretor atribuído automaticamente
       • Badge SLA verde (recém chegado)

5. Mover lead para "Em contato" (dropdown no card)
   └─ Status muda → evento registrado em historico_leads
   
6. Retornar a /leads
   └─ Lead some da fila (tem corretor_id) e aparece na
      tabela "Todos os leads" com status "Em contato"
      
7. Abrir /corretores
   └─ Corretor que recebeu o lead aparece com status de plantão
```

**Nota sobre o passo original "Abrir /ranking":** o ranking atual mostra apenas VGV de vendas fechadas. Um lead recém-criado não aparece no ranking. O passo 6 original deve ser substituído por `/leads` (tabela completa) para fechar o loop visualmente de forma correta.

---

## 3. Funcionalidades a implementar

### 3.1 — Obrigatórias para o demo

**Nenhuma implementação de código é estritamente necessária para o demo funcionar.**

A infra está completa:
- `POST /api/leads` → criação + distribuição automática ✓
- `PATCH /api/leads/[id]/status` → alteração de status ✓
- `NovoLeadModal` → formulário completo ✓
- `StatusDropdown` → dropdown funcional no pipeline ✓
- `PipelineSlaBadge` → SLA visual ✓

### 3.2 — Desejáveis (melhoram a qualidade do demo)

| Item | Arquivo | Impacto |
|------|---------|---------|
| Filtros de ranking por equipe | `app/(app)/ranking/page.tsx:21–23` | Botões "Atlântico" e "Horizonte" não fazem nada. Visível durante o demo. |
| Limpar dados de teste da Fase 7 | Supabase Dashboard | Fila deve estar vazia no início. Leads `TESTE-FASE7-*` poluem a tela. |

### 3.3 — Não implementar agora

- Botão "Distribuir" manual: fallback operacional, fora do fluxo do demo
- Drag-and-drop no pipeline: V1 pós-MVP
- Registro de venda: V1 pós-MVP
- Alertas de inatividade: V1 pós-MVP
- Status de plantão editável na UI: V1 pós-MVP

---

## 4. Tabelas que serão alteradas

**Nenhuma.** Fase 9 não envolve alteração de schema.

Durante o demo, o fluxo normal de uso escreverá nas tabelas existentes:
- `leads` — INSERT ao criar lead, UPDATE de `corretor_id` e `distribuido_em`
- `historico_leads` — INSERT de eventos `lead_criado`, `lead_distribuido`, `status_alterado`
- `corretores` — UPDATE de `ultimo_lead_recebido_em`
- `equipes` — UPDATE de `ultimo_lead_recebido_em`

---

## 5. APIs que serão criadas

**Nenhuma.** As APIs necessárias já existem:

| API | Status |
|-----|--------|
| `POST /api/leads` | Implementada (Fase 7) |
| `PATCH /api/leads/[id]/status` | Implementada (Fase 8) |

Se os filtros de ranking forem implementados (item desejável 3.2), será necessária a query derivada `getRanking(dados, equipeId)` — que **já existe** em `lib/supabase-queries.ts:210`. Não é uma nova API — é conectar o `onClick` dos botões à função existente.

---

## 6. Componentes que serão alterados

### 6.1 — Se implementar os filtros de ranking (desejável)

**`app/(app)/ranking/page.tsx`**  
Transformar em Client Component ou usar Server Component com `searchParams`:
- Adicionar `onClick` nos botões "Atlântico" e "Horizonte"
- Passar `equipeId` para `getRanking(dados, equipeId)`
- Renderizar ranking filtrado

Isso requer converter a página de Server Component para Client Component (para estado local do filtro ativo) ou usar URL params (`/ranking?equipe=id`) com Server Component.

**`components/pipeline/PipelineSlaBadge.tsx`** (opcional)  
Converter de Server Component para Client Component com `setInterval` de 60s para o badge atualizar sem refresh. Melhora a experiência mas não é bloqueante.

### 6.2 — Sem nenhuma implementação

Todos os outros componentes permanecem inalterados.

---

## 7. Riscos da Fase 9

### Risco 1 — `em_plantao = false` para todos os corretores (ALTO)
**Impacto:** A distribuição automática falha silenciosamente. Lead é criado mas fica na fila sem corretor. O demo perde seu diferencial principal.  
**Probabilidade:** Alta. Migration 002 adicionou `em_plantao DEFAULT false`. A ação manual `UPDATE corretores SET em_plantao = true WHERE ativo = true` pode não ter sido executada.  
**Mitigação:** Executar o UPDATE no Supabase antes do demo. 1 minuto de ação.

### Risco 2 — Dados de teste poluindo a fila (MÉDIO)
**Impacto:** A Fase 7 gerou leads de teste (`TESTE-FASE7-001`, `TESTE-RR-001`, `TESTE-RR-002`, `TESTE-RR-003`). Eles aparecem na tela durante o demo.  
**Mitigação:** Deletar manualmente no Supabase antes do demo ou usar dados reais já distribuídos que fiquem no pipeline e não na fila.

### Risco 3 — Prospect confunde o passo "Distribuir" (MÉDIO)
**Impacto:** O roteiro antigo menciona clicar "Distribuir". O botão existe mas não faz nada. Clicar nele durante o demo gera confusão.  
**Mitigação:** Usar o roteiro atualizado (seção 2 deste documento). Enfatizar que a distribuição foi automática — isso é o diferencial, não um bug.

### Risco 4 — Ranking sem leads do demo (BAIXO)
**Impacto:** O passo original "Abrir /ranking — corretor aparece com lead ativo" não funciona como esperado. Ranking mostra VGV de vendas, não leads ativos.  
**Mitigação:** Substituir esse passo por `/leads` (tabela completa) conforme roteiro atualizado.

### Risco 5 — Autenticação expira durante o demo (BAIXO)
**Impacto:** Sessão do Supabase expira, middleware redireciona para `/login` no meio da demo.  
**Mitigação:** Fazer login fresco imediatamente antes do demo. Supabase sessões têm duração de 1 hora por padrão.

### Risco 6 — Build com erro no Vercel (BAIXO)
**Impacto:** Demo feita localmente mas produção com versão antiga.  
**Mitigação:** Confirmar que o último deploy do Vercel está na branch `main` com o commit `761e343` (última Fase 8).

---

## 8. Critérios objetivos de encerramento da Fase 9

A Fase 9 está encerrada quando **todos** os seguintes forem verdadeiros:

| # | Critério | Como verificar |
|---|---------|----------------|
| C1 | Lead criado via formulário em produção (Vercel) | `id` retornado pela API, lead visível em `/leads` |
| C2 | Lead distribuído automaticamente para corretor | `corretor_id` preenchido, `distribuido_em` não-nulo |
| C3 | Lead aparece no pipeline com badge SLA verde | Coluna "Novo" em `/pipeline` com corretor no card |
| C4 | Status alterado para "Em contato" | Dropdown funciona, pipeline atualiza sem reload completo |
| C5 | Histórico registrado em `historico_leads` | Verificar no Supabase Dashboard: 3 eventos — `lead_criado`, `lead_distribuido`, `status_alterado` |
| C6 | Nenhum erro 4xx/5xx durante o fluxo | Sem alerta de erro na UI |
| C7 | Demo executada em produção (não local) | URL `https://[projeto].vercel.app`, não `localhost` |

### Documento de encerramento obrigatório

Criar `docs/auditorias/fase-9-validacao-demo.md` com:
- Data e hora da demo
- URL de produção utilizada
- Screenshot ou descrição do resultado de cada critério C1–C7
- Próximo marco (V1 — CRM operacional pós-MVP)

---

## Resumo executivo

```
FASE 9 É UMA FASE DE VALIDAÇÃO, NÃO DE IMPLEMENTAÇÃO

Estado atual: o loop operacional mínimo está completo.
              Implementação foi feita nas Fases 4–8.

O que fazer antes do demo:
  1. Verificar em_plantao=true para corretores [1 min — SQL]
  2. Limpar dados de teste TESTE-FASE7-* [2 min — Supabase]
  3. Confirmar deploy Vercel no commit 761e343 [1 min]

O que fazer durante o demo:
  → Usar roteiro atualizado desta seção 2

O que implementar:
  → Nada obrigatório
  → Filtros de ranking (desejável, não bloqueante)

Tempo estimado para estar pronto para o demo: 5 minutos
```

---

*Nenhum arquivo foi alterado nesta análise. Apenas planejamento.*
