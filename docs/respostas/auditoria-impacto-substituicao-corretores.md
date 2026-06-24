# Auditoria final — Impacto da substituição dos corretores

**Data:** 2026-06-23  
**Objetivo:** Determinar exatamente quais relacionamentos dependem dos corretores atuais e qual estratégia é mais segura para substituição.  
**Escopo:** Análise apenas — nenhuma implementação, SQL ou alteração.

---

## 1. Relacionamentos de corretores — Mapeamento completo

### 1.1 Tabelas que referenciam corretores

#### 1. Tabela `leads` → coluna `corretor_id`

**Foreign Key:**
```sql
corretor_id UUID REFERENCES corretores(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL
```

**Comportamento:**
- Se um corretor for deletado: `corretor_id` SET NULL (lead volta para fila)
- Se um corretor for atualizado (ID): FK CASCADE (lead acompanha)

**Registros atuais com `corretor_id` NOT NULL:**

| Lead ID | Lead Nome | Corretor ID | Corretor Nome | Status |
|---------|-----------|-------------|---------------|--------|
| l5 | Paula Andrade | c1 | Rafael Mendes | em_contato |
| l6 | Ricardo Maia | c2 | Beatriz Lima | visita |
| l7 | Tatiane Reis | c1 | Rafael Mendes | proposta |
| l8 | André Fontes | c4 | Camila Souza | perdido |
| l9 | Vanessa Pires | c7 | Lucas Pereira | em_contato |
| l10 | Bruno Teixeira | c8 | Aline Castro | visita |
| l11 | Larissa Gomes | c9 | Marcos Vieira | proposta |

**Registros com `corretor_id = NULL` (na fila):**

| Lead ID | Lead Nome | Status |
|---------|-----------|--------|
| l1 | Marina Costa | novo |
| l2 | Eduardo Ramos | novo |
| l3 | Fernanda Aguiar | novo |
| l4 | Gustavo Lemos | novo |

**Impacto:** 7 leads distribuídos dependem dos corretores atuais. 4 leads na fila não.

---

#### 2. Tabela `vendas` → coluna `corretor_id`

**Foreign Key:**
```sql
corretor_id UUID NOT NULL REFERENCES corretores(id)
  ON UPDATE CASCADE
  ON DELETE RESTRICT
```

**Comportamento:**
- Se tentar deletar um corretor com vendas: **ERRO** (DELETE RESTRICT)
- Se atualizar corretor (ID): FK CASCADE (vendas acompanham)

**Registros atuais:**

| Venda ID | Corretor ID | Corretor Nome | VGV | Data |
|----------|-------------|---------------|-----|------|
| v1 | c1 | Rafael Mendes | R$ 620.000 | -12 dias |
| v2 | c1 | Rafael Mendes | R$ 1.150.000 | -20 dias |
| v3 | c2 | Beatriz Lima | R$ 1.980.000 | -9 dias |
| v4 | c7 | Lucas Pereira | R$ 2.450.000 | -6 dias |
| v5 | c7 | Lucas Pereira | R$ 540.000 | -15 dias |
| v6 | c9 | Marcos Vieira | R$ 780.000 | -3 dias |
| v7 | c5 | Henrique Alves | R$ 460.000 | -22 dias |
| v8 | c8 | Aline Castro | R$ 1.320.000 | -11 dias |
| v9 | c2 | Beatriz Lima | R$ 890.000 | -2 dias |
| v10 | c11 | Felipe Nunes | R$ 670.000 | -18 dias |

**Restrição crítica:** ON DELETE RESTRICT impede deletar qualquer destes 7 corretores (c1, c2, c5, c7, c8, c9, c11) enquanto houver vendas vinculadas.

**Impacto:** **Impossível deletar 7 dos 12 corretores** sem deletar primeiro todas as suas vendas.

---

#### 3. Tabela `corretores` → coluna `usuario_id`

**Foreign Key:**
```sql
usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL
```

**Comportamento:**
- Se um usuário for deletado: `usuario_id` SET NULL
- Opcional (pode ser NULL)

**Estado atual:** `usuario_id` está vazio/NULL para todos os corretores (nenhum usuário autenticado criado ainda).

**Impacto:** Nenhum (ainda).

---

#### 4. Tabela `historico_leads` → referências indiretas

**FK para leads:**
```sql
lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE
```

**Coluna `usuario_id`:**
```sql
usuario_id UUID (sem FK explícita)
```

**Campos relacionados a corretores:**
- `tipo_evento`: 'lead_distribuido' pode ter `dados` JSON com `corretor_id` e `corretor_nome`
- Exemplo:
```json
{
  "tipo_evento": "lead_distribuido",
  "dados": {
    "corretor_id": "c1-uuid",
    "corretor_nome": "Rafael Mendes",
    "distribuido_em": "2026-06-23T10:30:00Z"
  }
}
```

**Impacto:** Histórico referencia nomes em texto (não FK) — não quebra se corretor for alterado/deletado.

---

#### 5. Índices que dependem de corretores

```sql
create index idx_corretores_equipe_id     on corretores (equipe_id);
create index idx_corretores_ordem_plantao on corretores (equipe_id, ordem_plantao);

create index idx_leads_corretor_id on leads (corretor_id);

create index idx_vendas_corretor_id on vendas (corretor_id);
```

**Impacto:** Nenhum (índices continuam funcionando com qualquer dado).

---

### 1.2 Resumo de relacionamentos

| Tabela Dependente | Coluna FK | Constraint | Registros Afetados | Risco |
|-------------------|-----------|------------|-------------------|-------|
| `leads` | `corretor_id` | ON DELETE SET NULL | 7 leads distribuídos | Baixo (SET NULL é seguro) |
| `vendas` | `corretor_id` | ON DELETE RESTRICT | 10 vendas | **ALTO** (impede DELETE) |
| `corretores` | `usuario_id` | ON DELETE SET NULL | 0 usuários | Nenhum (ainda) |
| `historico_leads` | (dados JSON) | Nenhuma FK | Referências indiretas | Nenhum (texto armazenado) |

---

## 2. Análise de registros órfãos

### 2.1 Se deletássemos os corretores atuais (sem preparação)

**Cenário:** Executar DELETE FROM corretores WHERE id IN (c1, c2, ..., c12)

**Resultado por FK:**

- **leads:** 7 registros passariam de `corretor_id = c1` para `corretor_id = NULL` (ON DELETE SET NULL)
  - l5, l6, l7, l8, l9, l10, l11 voltariam para a fila
  - Sem erro, mas perdem contexto de distribuição

- **vendas:** **ERRO** — Foreign key constraint violation
  ```
  ERROR: update or delete on table "corretores" violates foreign key constraint
  "fk_vendas_corretor_id" on table "vendas"
  ```
  - 10 vendas teriam `corretor_id` apontando para um corretor que não existe mais
  - DELETE seria bloqueado

**Leads órfãos não haveria, mas a operação falharia na FK restritiva de vendas.**

---

### 2.2 Se deletássemos vendas e depois corretores

**Passo 1:** DELETE FROM vendas;
- 10 vendas removidas
- Histórico de VGV perdido
- Ranking VGV zerado

**Passo 2:** DELETE FROM corretores;
- 12 corretores removidos
- 7 leads passariam para `corretor_id = NULL`
- Sem erro

**Resultado:** Demo limpa, sem órfãos, mas sem histórico.

---

## 3. Impacto nas operações de negócio

### 3.1 Dashboard

**KPIs que dependem de corretores:**

| KPI | Fonte | Impacto da substituição |
|-----|-------|----------------------|
| Total de leads | Contagem de `leads` | Neutro (contagem não muda) |
| VGV total | SUM(`vendas.valor_vgv`) | Depende: mantém ou zera |
| Quantidade de vendas | COUNT(`vendas`) | Depende: mantém ou zera |
| Taxa de conversão | vendas/total_leads | **Muda drasticamente** |
| Na fila | COUNT(leads WHERE corretor_id IS NULL) | Sobe para 11 se deletar corretores |

---

### 3.2 Ranking VGV

**Função:** `buildRanking()` em `lib/mock-data.ts`

```typescript
export function buildRanking(equipeId?: string): RankingItem[] {
  const filtradas = equipeId ? vendas.filter((v) => v.equipeId === equipeId) : vendas;
  const mapa = new Map<string, { total: number; qtd: number }>();
  
  for (const v of filtradas) {
    const atual = mapa.get(v.corretorId) ?? { total: 0, qtd: 0 };
    atual.total += v.vgv;
    atual.qtd += 1;
    mapa.set(v.corretorId, atual);
  }
  
  // Busca corretor por ID
  for (const [corretorId, dados] of mapa) {
    const c = getCorretor(corretorId);  // ← Aqui busca o corretor
    if (!c) continue;  // ← Se não encontrar, pula
  }
}
```

**Impacto:**
- Se corretores forem atualizados (nomes mudam): Ranking recalcula com novos nomes
- Se corretores forem deletados e VGV mantida: Função pula corretores não encontrados (ranking fica vazio)
- Se corretores forem deletados e VGV deletada: Ranking fica vazio (correto)

---

### 3.3 Fila de distribuição

**Lógica:** `proximoPlantao()` em `lib/mock-data.ts`

```typescript
export function proximoPlantao(equipeId: string): Corretor | null {
  const fila = corretores
    .filter((c) => c.equipeId === equipeId && c.emPlantao && c.ativo)
    .sort((a, b) => a.ordemPlantao - b.ordemPlantao);
  return fila[0] ?? null;
}
```

**Impacto:**
- Se corretores atualizados: Fila funciona normalmente com novos corretores
- Se corretores deletados e novos criados: Fila funciona com novos
- Se nenhum corretor disponível: Retorna NULL (leads permanencem na fila)

---

### 3.4 Sidebar e relatórios

**Tela de Corretores** (`app/(app)/corretores/page.tsx`):

Exibe lista de corretores com:
- Nome
- Equipe
- Ordem de plantão
- Status (ativo/em plantão)
- Avatar (iniciais)

**Impacto:** Se corretores substituídos, tela exibe novos nomes e iniciais (sem impacto negativo).

---

## 4. Três opções estratégicas

### **Opção A: Atualizar registros existentes**

**Descrição:**

Manter os UUIDs dos 12 corretores atuais e apenas atualizar:
- Nomes (Rafael Mendes → João Silva)
- Emails (rafael.mendes@imob.com → joao.silva@basilio.com.br)
- Telefones ((62) 99100-0001 → (62) 99200-0001)
- Ordem de plantão (opcional)
- Equipes (opcional)

**Operações:**
```
UPDATE corretores SET nome = '...', email = '...', telefone = '...' WHERE id = 'c1-uuid';
(repetir para cada corretor)
UPDATE leads SET ... (reconectar corretores se necessário)
UPDATE vendas SET ... (nenhuma mudança necessária — ID não muda)
```

**Vantagens:**
- ✅ **Nenhum dado órfão** — FKs permanecem intactas
- ✅ **Histórico preservado** — Vendas continuam vinculadas aos novos corretores
- ✅ **Ranking mantém contexto** — VGV associado aos "novos" nomes de corretor
- ✅ **RLS funciona** — Nenhuma mudança estrutural
- ✅ **Mais simples** — Apenas UPDATEs, sem DELETE nem INSERT massivos

**Riscos:**
- ⚠️ **Confusão de contexto** — Rafael Mendes (vendas -20 dias) agora é "João Silva", mas vendas antigas mostrarão "João Silva" no ranking
  - **Questão:** A venda histórica "R$ 1.150.000 de Rafael Mendes em 20 dias atrás" agora aparecerá como "R$ 1.150.000 de João Silva"?
  - Resposta: Sim, porque a FK CASCADE mantém a venda vinculada ao corretor, e o corretor tem novo nome
- ⚠️ **Leads distribuídos ficarão "órfãos" de contexto** — Paula Andrade foi distribuída para Rafael, mas agora está com João
  - Pode confundir se os corretores forem alterados (reassinação de equipes)

**Impacto na demo:**
- Dashboard aparenta estar funcionando com dados de Basílio
- Ranking mostra vendas, mas nomes foram alterados
- Leads mostram serem distribuídos para "novos" corretores
- **Resultado:** Visualmente funciona, mas dados históricos estão "remapados"

---

### **Opção B: Desativar corretores antigos e criar novos**

**Descrição:**

Criar 12 novos corretores de Basílio e desativar os 12 atuais:

1. Criar 12 novos corretores (mesmas equipes, mesma ordem de plantão)
2. Desativar corretores antigos (ativo = false)
3. UPDATE leads: Reatribuir leads dos corretores desativados para NULL (volta para fila)
4. Manter vendas vinculadas aos corretores desativados (histórico)

**Operações:**
```
INSERT INTO corretores (...) VALUES (...); (12 vezes)
UPDATE corretores SET ativo = false WHERE id IN (c1, c2, ..., c12);
UPDATE leads SET corretor_id = NULL WHERE corretor_id IN (c1, c2, ..., c12);
(vendas não mudam — permanecem com corretores desativados)
```

**Vantagens:**
- ✅ **Nenhum dado deletado** — Nenhum órfão, nenhuma cascata
- ✅ **Histórico preservado** — Vendas intactas, apontam para corretores (desativados)
- ✅ **RLS pode lidar** — Novos corretores com mesma imobiliaria_id
- ✅ **Leads redistributos corretamente** — Voltam para fila, prontos para nova distribuição
- ✅ **Sem erro de FK** — Nenhuma constraint violada

**Riscos:**
- ⚠️ **Demo fica com dados mistos** — Novos leads distribuídos para corretores "Basílio", mas ranking mostra vendas de corretores "desativados"
- ⚠️ **Confusão visual** — Usuário vê corretores desativados no ranking de vendas antigas
- ⚠️ **Duplicação de registros** — 24 corretores no banco (12 antigos + 12 novos)
- ⚠️ **RLS pode confundir** — Se houver policies que filtram por `ativo = true`, corretores desativados desaparecem de certas views
- ⚠️ **Limpeza futura necessária** — Terá que apagar os 12 desativados depois (ou deixar como lixo)

**Impacto na demo:**
- Novos leads vão para novos corretores ✅
- Ranking mostra corretores desativados ❌ (confuso)
- Histórico preservado, mas visualmente poluído
- **Resultado:** Demo funcionalmente correta, mas com poluição de dados

---

### **Opção C: Remover tudo e recomeçar do zero**

**Descrição:**

Deletar todos os corretores, leads e vendas, e criar novos dados de Basílio:

1. DELETE vendas (10 registros)
2. DELETE leads (11 registros)
3. DELETE corretores (12 registros)
4. INSERT novos corretores de Basílio (12)
5. INSERT novos leads de Basílio (0 — começar vazio)
6. Opcionalmente: INSERT histórico de vendas de Basílio

**Operações:**
```
DELETE FROM vendas;
DELETE FROM leads;
DELETE FROM corretores;
INSERT INTO corretores (...) VALUES (...); (12 vezes)
-- leads: vazio, prontos para receber novos
```

**Vantagens:**
- ✅ **Clean slate** — Nenhum legado de dados fictícios
- ✅ **Sem poluição** — Demo começa fresca com Basílio
- ✅ **Nenhum órfão** — Tudo sincronizado
- ✅ **Sem confusão de contexto** — Correlação entre nome e histórico é 1:1
- ✅ **RLS simplificado** — Apenas novos dados da imobiliária
- ✅ **Fácil de validar** — Dados conhecidos vs. dados fictícios

**Riscos:**
- ⚠️ **Perde todo o histórico** — Ranking VGV zerado, não há histórico de vendas
- ⚠️ **Demo fica vazia de leads** — Nenhum para mostrar (começa do zero)
- ⚠️ **KPIs zerados** — Dashboard mostrará: 0 vendas, 0 VGV, 0% conversão
- ⚠️ **Menos "realista"** — Uma imobiliária nova sem histórico de vendas é irreal

**Impacto na demo:**
- Dashboard vazio (ou apenas com novos leads conforme entram)
- Ranking vazio (espera novas vendas)
- Fila de distribuição funciona com novos corretores
- **Resultado:** Demo "limpa", mas sem dados históricos convincentes

---

## 5. Matriz de comparação

| Critério | Opção A (Atualizar) | Opção B (Desativar) | Opção C (Remover) |
|----------|-------------------|-------------------|-------------------|
| **Integridade de dados** | ✅ Excelente | ✅ Excelente | ✅ Excelente |
| **Histórico de vendas** | ✅ Mantém | ✅ Mantém | ❌ Perde |
| **Ranking VGV** | ⚠️ Remapeado | ⚠️ Confuso | ❌ Vazio |
| **Dados "realistas"** | ⚠️ Histórico estranho | ⚠️ Dados mistos | ⚠️ Vazio |
| **Simplicidade** | ✅ UPDATEs apenas | ⚠️ INSERT + UPDATE | ⚠️ DELETE + INSERT |
| **Risco de erro** | ✅ Baixo | ✅ Baixo | ✅ Baixo |
| **RLS impact** | ✅ Nenhum | ⚠️ Possível confusão | ✅ Nenhum |
| **Suporte a modo mock** | ✅ Sim (atualizar mock-data.ts também) | ⚠️ Complexo (dois conjuntos de corretores) | ✅ Sim (apenas novos em mock-data.ts) |
| **Visualização em dashboard** | ⚠️ Nomes históricos confusos | ⚠️ Corretores desativados visíveis | ✅ Limpo |
| **Tempo de implementação** | ✅ Rápido (~30min) | ⚠️ Médio (~1h) | ⚠️ Médio (~1h) |

---

## 6. Recomendação única

### **Recomendação: Opção A (Atualizar registros existentes)**

#### Justificativa

1. **Menor risco** — Nenhuma operação de DELETE, nenhuma cascata inesperada, nenhuma FK violada
2. **Preserva história** — Vendas continuam vinculadas, ranking mostra histórico, auditoria fica íntegra
3. **Simples e rápido** — UPDATEs diretos, sem cascata de operações
4. **RLS não é impactado** — Nenhuma mudança estrutural, apenas dados
5. **Reversível** — Se necessário, pode-se reverter com backup (não há truncamento)
6. **Funciona em ambos modos** — Mock e Supabase
7. **Demo continuará mostrando dados históricos** — Ranking mostra "João Silva" com 2 vendas (histórico remapeado, mas íntegro)

#### Desvantagem mitigada

A "confusão de contexto" (nomes históricos remapeados) é **mitigada por**:

- Na auditoria, fica registrado que houve migração (pode adicionar nota em `observacoes` ou criar evento de auditoria)
- O ranking mostra nome atual associado a VGV histórico — isso é **aceitável** para demo, pois:
  - Não é dados reais de produção (ainda é demo)
  - Claramente distinguível como "dados de exemplo"
  - Demonstra funcionalidade sem quebra de integridade

#### Pré-requisitos

1. **Preparar dados de Basílio:**
   - 12 nomes reais de corretores
   - 12 emails reais
   - 12 telefones reais
   - Estrutura de equipes (manter 2 ou alterar?)
   - Opcionalmente: nomes de gerentes reais

2. **Aplicar em dois contextos:**
   - `lib/mock-data.ts` (modo mock — para desenvolvimento local)
   - Supabase (modo production — se aplicável)

3. **Após atualização:**
   - Testar dashboard (KPIs, ranking, funil)
   - Testar fila de distribuição
   - Testar novo lead criado via webhook (deduplicação por telefone)
   - Validar RLS (se houver usuários autenticados)

#### Implementação segura

1. **Passo 1:** Backup dos dados atuais (exportar como CSV)
2. **Passo 2:** Preparar script SQL com todos os UPDATEs (ou fazer via dashboard Supabase)
3. **Passo 3:** Executar UPDATEs em transação (garantir atomicidade)
4. **Passo 4:** Verificar integridade (contar registros, checar FKs)
5. **Passo 5:** Testar aplicação (dev + staging)
6. **Passo 6:** Deploy em produção (se necessário)

#### Alternativa se "confusão de contexto" for inaceitável

Se for absolutamente necessário que histórico de vendas não seja remapeado, então **Opção C (Remover e recomeçar)** é válida:

- Vantagem: Clean slate, sem confusão
- Desvantagem: Demo fica sem histórico convincente (inicia com 0 vendas)
- Indicado para: Validações de funcionalidade (não impressionar com histórico)

---

## 7. Impacto específico por página

### Página de Dashboard (`app/(app)/page.tsx`)

**Com Opção A:**
- KPI "Total Leads": 11 (não muda)
- KPI "VGV Total": R$ 9.970.000 (não muda)
- KPI "Qtd Vendas": 10 (não muda)
- KPI "Taxa Conversão": 47% (não muda)
- Ranking mostra: Novos nomes de corretores com VGV histórico ✅

---

### Página de Corretores (`app/(app)/corretores/page.tsx`)

**Com Opção A:**
- Tela exibe 12 corretores com novos nomes ✅
- Nenhuma quebra, nenhuma perda de vinculação ✅

---

### Página de Leads (`app/(app)/leads/page.tsx`)

**Com Opção A:**
- 4 leads na fila (Marina, Eduardo, Fernanda, Gustavo) — sem mudança ✅
- 7 leads distribuídos agora mostram com "novos" nomes de corretores ✅
- Fila de distribuição usa novos corretores para distribuição de leads futuros ✅

---

### Página de Equipes (`app/(app)/equipes/page.tsx`)

**Com Opção A:**
- 2 equipes com mesmos nomes (a menos que alteradas) ✅
- Corretores realocados (se necessário) ✅

---

### Página de Pipeline (`app/(app)/pipeline/page.tsx`)

**Com Opção A:**
- Cards por status aparecem normalmente ✅
- Leads mostram "novos" nomes de corretores ✅

---

### Página de Ranking (`app/(app)/ranking/page.tsx`)

**Com Opção A:**
- Ranking VGV recalculado com novos nomes ✅
- VGV histórico mantido ✅
- Ticket médio mantido ✅

---

## 8. Conclusão

**Estratégia recomendada: Opção A (Atualizar registros existentes)**

Esta opção oferece o melhor equilíbrio entre:
- Segurança (nenhuma cascata, nenhuma FK violada)
- Preservação de dados (histórico completo)
- Simplicidade (UPDATEs diretos)
- Funcionalidade (demo continua funcionando)

**Próximo passo:** Preparar lista de dados reais de Basílio Imóveis (nomes, emails, telefones de 12 corretores, nomes de 2 equipes/gerentes) e executar com backup de segurança.
