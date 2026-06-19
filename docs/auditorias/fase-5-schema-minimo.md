# Fase 5 — Schema Mínimo: Auditoria e Migration
**Data:** 2026-06-19  
**Referências:** [DECISOES-ARQUITETURA.md](../DECISOES-ARQUITETURA.md) · [fase-4-planejamento-tecnico-captura-distribuicao.md](./fase-4-planejamento-tecnico-captura-distribuicao.md)  
**Status:** APROVADO — migration revisada e pronta para aplicação  
**Metodologia:** Auditoria do schema atual + geração de migration. Nenhum código de aplicação alterado. Nenhuma migration aplicada.

---

## 1. Auditoria do Schema Atual

### 1.1 Tabelas e colunas existentes

#### `equipes` — 4 colunas
| Coluna | Tipo | Constraint |
|--------|------|-----------|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `nome` | `text` | `NOT NULL` |
| `gerente` | `text` | `NOT NULL` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

#### `corretores` — 8 colunas
| Coluna | Tipo | Constraint |
|--------|------|-----------|
| `id` | `uuid` | PK |
| `nome` | `text` | `NOT NULL` |
| `email` | `text` | `UNIQUE` |
| `telefone` | `text` | — |
| `equipe_id` | `uuid` | `NOT NULL REFERENCES equipes(id)` |
| `ordem_plantao` | `integer` | `NOT NULL DEFAULT 0` |
| `ativo` | `boolean` | `NOT NULL DEFAULT true` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

#### `leads` — 11 colunas
| Coluna | Tipo | Constraint |
|--------|------|-----------|
| `id` | `uuid` | PK |
| `nome` | `text` | `NOT NULL` |
| `telefone` | `text` | — |
| `origem` | `lead_origem` | `NOT NULL DEFAULT 'Outro'` |
| `interesse` | `text` | — |
| `faixa_valor` | `text` | — |
| `equipe_id` | `uuid` | `NOT NULL REFERENCES equipes(id)` |
| `corretor_id` | `uuid` | `REFERENCES corretores(id) ON DELETE SET NULL` |
| `status` | `lead_status` | `NOT NULL DEFAULT 'novo'` |
| `observacoes` | `text` | — |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

#### `vendas` — 6 colunas (sem alterações na Fase 5)

#### Enums existentes
- `lead_origem`: `'Instagram'` · `'Facebook'` · `'Outro'`
- `lead_status`: `'novo'` · `'em_contato'` · `'visita'` · `'proposta'` · `'fechado'` · `'perdido'`

### 1.2 Índices existentes (9)

| Índice | Tabela | Colunas | Propósito |
|--------|--------|---------|-----------|
| `idx_corretores_equipe_id` | corretores | `equipe_id` | Filtro por equipe |
| `idx_corretores_ordem_plantao` | corretores | `(equipe_id, ordem_plantao)` | Ordenação de plantão |
| `idx_leads_equipe_id` | leads | `equipe_id` | Fila por equipe |
| `idx_leads_corretor_id` | leads | `corretor_id` | Leads por corretor |
| `idx_leads_status` | leads | `status` | Kanban/funil |
| `idx_leads_fila` | leads | `equipe_id WHERE corretor_id IS NULL` | Fila de distribuição |
| `idx_vendas_corretor_id` | vendas | `corretor_id` | Ranking |
| `idx_vendas_lead_id` | vendas | `lead_id` | Join vendas↔leads |
| `idx_vendas_data_venda` | vendas | `data_venda` | Filtro por período |

### 1.3 O que falta para a Fase 5

| Campo | Tabela | Criticidade | Razão |
|-------|--------|-------------|-------|
| `em_plantao` | `corretores` | **BLOQUEANTE** | Algoritmo de distribuição usa `WHERE em_plantao = true`. Sem ele, impossível filtrar corretores elegíveis |
| `ultimo_lead_recebido_em` | `corretores` | **BLOQUEANTE** | Fairness round-robin: `ORDER BY COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC` |
| `ultimo_lead_recebido_em` | `equipes` | **BLOQUEANTE** | Rodízio automático de equipes (webhook sem `equipe_id`) |
| `telefone_normalizado` | `leads` | **BLOQUEANTE** | Deduplicação 24h sem risco de falso negativo por variação de máscara |
| `distribuido_em` | `leads` | **BLOQUEANTE** | Início do SLA (30 min amarelo / 2h vermelho). Sem timestamp não há base de cálculo |
| `historico_leads` | *(nova tabela)* | **BLOQUEANTE** | Decisão aprovada: obrigatória desde a primeira operação de escrita |

**Campos que a tarefa lista como candidatos e já existem (nada a fazer):**
- `leads.origem` ✓
- `leads.corretor_id` ✓
- `leads.equipe_id` ✓

**Índices existentes que cobrem os campos candidatos (nada a fazer):**
- `idx_leads_corretor_id` ✓
- `idx_leads_equipe_id` ✓

---

## 2. Migration Gerada

**Arquivo:** `supabase/migrations/001_fase5_schema_minimo.sql`

### 2.1 Colunas adicionadas

| Tabela | Coluna | Tipo | DEFAULT | Nullable |
|--------|--------|------|---------|----------|
| `corretores` | `em_plantao` | `BOOLEAN` | `false` | `NOT NULL` |
| `corretores` | `ultimo_lead_recebido_em` | `TIMESTAMPTZ` | — | nullable |
| `equipes` | `ultimo_lead_recebido_em` | `TIMESTAMPTZ` | — | nullable |
| `leads` | `telefone_normalizado` | `TEXT` | — | nullable |
| `leads` | `distribuido_em` | `TIMESTAMPTZ` | — | nullable |

### 2.2 Tabela criada

**`historico_leads`**

| Coluna | Tipo | Constraint |
|--------|------|-----------|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `lead_id` | `uuid` | `NOT NULL REFERENCES leads(id) ON DELETE CASCADE` |
| `tipo_evento` | `text` | `NOT NULL` + CHECK (valores listados abaixo) |
| `descricao` | `text` | nullable |
| `dados` | `jsonb` | nullable |
| `criado_por` | `text` | `NOT NULL DEFAULT 'sistema'` + CHECK (`sistema`, `formulario`, `webhook`, `usuario`) |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT NOW()` |

**CHECK constraint em `tipo_evento`** — aceita apenas:  
`lead_criado` · `lead_roteado` · `lead_distribuido` · `distribuicao_falhou` · `status_alterado` · `lead_redistribuido`

**Exemplos de uso de `dados JSONB` por tipo de evento:**

| tipo_evento | dados |
|-------------|-------|
| `lead_criado` | `{ "origem": "Instagram", "canal": "formulario", "equipe_id": "..." }` |
| `lead_distribuido` | `{ "corretor_id": "...", "corretor_nome": "Rafael Mendes" }` |
| `status_alterado` | `{ "status_anterior": "novo", "status_novo": "em_contato" }` |
| `lead_roteado` | `{ "equipe_id": "...", "equipe_nome": "Atlântico", "motivo": "rodizio" }` |

### 2.3 Índices criados

| Índice | Tabela | Colunas | Justificativa |
|--------|--------|---------|---------------|
| `idx_leads_deduplicacao` | leads | `(telefone_normalizado, created_at)` | Composto cobre `WHERE telefone_normalizado = $1 AND created_at > NOW() - '24h'` em uma varredura |
| `idx_historico_leads_lead_id` | historico_leads | `(lead_id, created_at DESC)` | Composto cobre `WHERE lead_id = $1 ORDER BY created_at DESC` |

**Por que índices compostos em vez de simples:**  
`idx_leads_deduplicacao` substitui dois índices simples (`telefone_normalizado` + `created_at`). O planner usa `telefone_normalizado` para encontrar o conjunto e `created_at` para restringir a janela sem segunda varredura de índice.

### 2.4 Foreign keys criadas

| FK | Tabela | Coluna | Referência | On Delete |
|----|--------|--------|-----------|-----------|
| *(sem nome)* | `historico_leads` | `lead_id` | `leads(id)` | `CASCADE` |

---

## 3. Relatório Técnico de Impactos

### 3.1 Impactos imediatos na aplicação

**`fetchCorretores()` em `lib/supabase-queries.ts`**  
A função atualmente usa `ativo` como proxy para `em_plantao`:
```ts
emPlantao: Boolean(row.ativo)  // mapeamento incorreto — proxy temporário
```
Após a migration, corrigir para:
```ts
emPlantao: Boolean(row.em_plantao)
```
Este ajuste deve ser feito na Fase 6, antes de implementar a distribuição automática.

### 3.2 Ação manual obrigatória após aplicar a migration

`corretores.em_plantao` recebe `DEFAULT false` — todos os corretores sairão de plantão após a migration. Executar no SQL Editor do Supabase imediatamente após aplicar:

```sql
-- Opção A: colocar todos os corretores ativos em plantão
UPDATE corretores SET em_plantao = true WHERE ativo = true;

-- Opção B: selecionar corretores específicos
UPDATE corretores SET em_plantao = true WHERE nome IN ('Rafael Mendes', 'Lucas Pereira', ...);
```

### 3.3 Campos planejados na Fase 4 não incluídos nesta migration

| Campo | Tabela | Decisão |
|-------|--------|---------|
| `campanha_nome` | `leads` | Opcional no MVP. Pode entrar em migration futura sem impacto |

### 3.5 Segurança da migration

- Todos os `ADD COLUMN` usam `IF NOT EXISTS` — seguro para reexecutar
- `CREATE TABLE IF NOT EXISTS` — idempotente
- Nenhum DROP, TRUNCATE ou RENAME
- Colunas novas são nullable ou têm DEFAULT — nenhum constraint quebrará dados existentes
- `ON DELETE CASCADE` em `historico_leads.lead_id`: ao apagar um lead, o histórico vai junto (comportamento esperado)

---

## 4. Próximos passos (Fase 6)

Após aprovação e aplicação desta migration:

1. Executar `UPDATE corretores SET em_plantao = true WHERE ativo = true`
2. Corrigir mapeamento em `fetchCorretores()`: `emPlantao: Boolean(row.em_plantao)`
3. Adicionar tipos TypeScript novos em `lib/types.ts`
4. Implementar `lib/validations.ts` (normalização de telefone)
5. Implementar `lib/distribuicao.ts` (algoritmo de distribuição)
6. Adicionar funções de escrita em `lib/supabase-queries.ts`
7. Criar `app/api/leads/route.ts` (POST /api/leads)

---

*Schema mínimo definido. Aguardando aprovação para aplicar a migration no Supabase.*
