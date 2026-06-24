# Auditoria — Substituição dos dados fictícios pela Basílio Imóveis

**Data:** 2026-06-23  
**Objetivo:** Identificar exatamente onde os dados fictícios atuais estão armazenados e quais registros precisariam ser alterados para transformar a demo na Basílio Imóveis.  
**Escopo:** Análise apenas — nenhuma implementação, SQL ou alteração de banco.

---

## 1. Estado atual dos dados fictícios

### 1.1 Camada de dados

O projeto tem **dois modos de operação**:

- **Mock mode** (desenvolvimento local): todos os dados vêm de `lib/mock-data.ts`
- **Supabase mode** (produção/staging): dados lidos do banco PostgreSQL

**Comportamento atual:**
- Se `.env.local` não tiver `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`, app rodaem mock mode
- Se tem as env vars, app tenta ler do Supabase
- Em Supabase mode, qualquer erro de query lança exceção (fallback silencioso foi removido)

### 1.2 Dados fictícios em mock-data.ts

Arquivo: `lib/mock-data.ts`

**Estrutura:**

```
equipes (2)
├─ eq-azul: Equipe Atlântico (gerente: Roberto Tavares)
└─ eq-verde: Equipe Horizonte (gerente: Cláudia Menezes)

corretores (12)
├─ Equipe Atlântico (6):
│  ├─ c1: Rafael Mendes (ordem_plantao: 1)
│  ├─ c2: Beatriz Lima (ordem_plantao: 2)
│  ├─ c3: Diego Farias (ordem_plantao: 3)
│  ├─ c4: Camila Souza (ordem_plantao: 4)
│  ├─ c5: Henrique Alves (ordem_plantao: 5)
│  └─ c6: Patrícia Rocha (ordem_plantao: 6)
└─ Equipe Horizonte (6):
   ├─ c7: Lucas Pereira (ordem_plantao: 1)
   ├─ c8: Aline Castro (ordem_plantao: 2)
   ├─ c9: Marcos Vieira (ordem_plantao: 3)
   ├─ c10: Juliana Dias (ordem_plantao: 4)
   ├─ c11: Felipe Nunes (ordem_plantao: 5)
   └─ c12: Sofia Barros (ordem_plantao: 6)

leads (11)
├─ l1-l4: Na fila (corretorId: null)
├─ l5-l8: Distribuídos para Atlântico
└─ l9-l11: Distribuídos para Horizonte

vendas (10)
└─ v1-v10: Histórico de vendas fechadas (ranking VGV)
```

**Dados por lead:**

| ID  | Nome | Telefone | Origem | Equipe | Corretor | Status |
|-----|------|----------|--------|--------|----------|--------|
| l1  | Marina Costa | (62) 99812-3344 | Instagram | Atlântico | NULL | novo |
| l2  | Eduardo Ramos | (62) 99744-1290 | Facebook | Atlântico | NULL | novo |
| l3  | Fernanda Aguiar | (62) 99655-7781 | Instagram | Horizonte | NULL | novo |
| l4  | Gustavo Lemos | (62) 99533-4412 | Facebook | Horizonte | NULL | novo |
| l5  | Paula Andrade | (62) 99411-8820 | Instagram | Atlântico | c1 (Rafael) | em_contato |
| l6  | Ricardo Maia | (62) 99322-1170 | Facebook | Atlântico | c2 (Beatriz) | visita |
| l7  | Tatiane Reis | (62) 99288-6655 | Instagram | Atlântico | c1 (Rafael) | proposta |
| l8  | André Fontes | (62) 99177-2244 | Facebook | Atlântico | c4 (Camila) | perdido |
| l9  | Vanessa Pires | (62) 99066-3311 | Instagram | Horizonte | c7 (Lucas) | em_contato |
| l10 | Bruno Teixeira | (62) 98955-4400 | Facebook | Horizonte | c8 (Aline) | visita |
| l11 | Larissa Gomes | (62) 98844-7788 | Instagram | Horizonte | c9 (Marcos) | proposta |

**Dados de vendas (base do ranking):**

| ID  | Corretor | Imóvel | VGV | Dias atrás |
|-----|----------|--------|-----|-----------|
| v1  | Rafael Mendes | Apto Setor Bueno • 92m² | R$ 620.000 | 12 |
| v2  | Rafael Mendes | Casa Jardim Goiás • 210m² | R$ 1.150.000 | 20 |
| v3  | Beatriz Lima | Cobertura Setor Marista | R$ 1.980.000 | 9 |
| v4  | Lucas Pereira | Casa Aldeia do Vale • 320m² | R$ 2.450.000 | 6 |
| v5  | Lucas Pereira | Apto Setor Oeste • 88m² | R$ 540.000 | 15 |
| v6  | Marcos Vieira | Apto Setor Bueno • 110m² | R$ 780.000 | 3 |
| v7  | Henrique Alves | Apto Setor Sul • 75m² | R$ 460.000 | 22 |
| v8  | Aline Castro | Casa condomínio • 280m² | R$ 1.320.000 | 11 |
| v9  | Beatriz Lima | Apto Jardim Goiás • 130m² | R$ 890.000 | 2 |
| v10 | Felipe Nunes | Apto Setor Marista • 95m² | R$ 670.000 | 18 |

**Ranking VGV atual:**

1. Lucas Pereira (Horizonte): R$ 2.990.000 (2 vendas)
2. Rafael Mendes (Atlântico): R$ 1.770.000 (2 vendas)
3. Beatriz Lima (Atlântico): R$ 2.870.000 (2 vendas)
4. Marcos Vieira (Horizonte): R$ 780.000 (1 venda)
5. Aline Castro (Horizonte): R$ 1.320.000 (1 venda)
6. Henrique Alves (Atlântico): R$ 460.000 (1 venda)
7. Felipe Nunes (Horizonte): R$ 670.000 (1 venda)

---

## 2. Estado do banco de dados (Supabase)

### 2.1 Estrutura de tabelas

**Arquivo referência:** `supabase/schema.sql` + `supabase/migrations/002_security_rls_multitenancy.sql`

**Tabelas principais:**

| Tabela | Criada | Referência | Chave PK | Multi-tenancy |
|--------|--------|-----------|----------|--------------|
| `imobiliarias` | Migration 002 | Raiz do tenant | `id` (UUID) | N/A (é o tenant) |
| `usuarios` | Migration 002 | Usuários autenticados (Supabase Auth) | `id` (UUID) | `imobiliaria_id` |
| `equipes` | schema.sql | Equipes comerciais | `id` (UUID) | `imobiliaria_id` |
| `corretores` | schema.sql | Corretores vinculados a equipes | `id` (UUID) | `imobiliaria_id` |
| `leads` | schema.sql | Leads captados | `id` (UUID) | `imobiliaria_id` |
| `vendas` | schema.sql | Histórico de vendas | `id` (UUID) | `imobiliaria_id` |
| `historico_leads` | Migration 001/002 | Trilha de auditoria (imutável) | `id` (UUID) | `imobiliaria_id` |

### 2.2 Arquitetura multi-tenancy

**Conceito:**
- `imobiliarias` é a tabela raiz que define cada tenant
- Cada imobiliária tem um `id` UUID único
- Todas as outras tabelas têm uma coluna `imobiliaria_id` que aponta para `imobiliarias(id)`
- Row-Level Security (RLS) garante que cada usuário só vê dados de sua imobiliária

**Dados atuais no banco:**

Se o banco foi alimentado com `schema.sql`:

```
imobiliarias:
└─ 1 registro: "Imobiliária Padrão — Renomear após setup"

equipes:
├─ eq-azul → Equipe Atlântico (gerente: Roberto Tavares)
└─ eq-verde → Equipe Horizonte (gerente: Cláudia Menezes)
   Ambas com imobiliaria_id = "Imobiliária Padrão"

corretores:
├─ 6 em Atlântico
└─ 6 em Horizonte
   Todos com imobiliaria_id = "Imobiliária Padrão"

leads:
├─ 11 leads (de schema.sql data section)
   Todos com imobiliaria_id = "Imobiliária Padrão"

vendas:
├─ 10 vendas (de schema.sql data section)
   Todas com imobiliaria_id = "Imobiliária Padrão"

historico_leads:
├─ Vazio (não inserido dados por padrão)
```

### 2.3 RLS (Row-Level Security)

**Migration 002 habilitou RLS** em todas as tabelas com políticas por role:

- **admin**: acesso total aos dados da imobiliária
- **gestor**: dados operacionais (equipes, corretores, leads, vendas)
- **corretor**: apenas seus próprios leads

**Funções helper (SECURITY DEFINER):**

```sql
current_imobiliaria_id()  -- retorna imobiliaria_id do usuário autenticado
current_user_role()       -- retorna role (admin/gestor/corretor)
current_usuario_id()      -- retorna UUID interno do usuário
```

---

## 3. Mapeamento para Basílio Imóveis

### 3.1 Cenários de substituição

**Cenário A: Demo → Basílio em mock mode**

Se o objetivo é apenas alterar os dados fictícios em `lib/mock-data.ts`:

- Arquivo: `lib/mock-data.ts`
- Mudar nomes, telefones, equipes, corretores
- Nenhuma alteração no banco necessária
- Risco: muito baixo

**Cenário B: Demo → Basílio em Supabase**

Se o objetivo é alterar os dados reais no banco Supabase:

- Tabelas a alterar: `imobiliarias`, `equipes`, `corretores`, `leads`, `vendas`
- Operações: UPDATE em registros de imobiliária padrão
- Precisa de migrações SQL ou script de data fix
- Risco: médio (integridade referencial, RLS)

### 3.2 Registros que precisariam ser alterados

**Cenário A (mock-data.ts):**

| Categoria | Registro | Mudança |
|-----------|----------|--------|
| Equipes | Equipe Atlântico | Renomear (ex: "Equipe Basílio A") |
| Equipes | Equipe Horizonte | Renomear (ex: "Equipe Basílio B") |
| Gerentes | Roberto Tavares | Renomear ou manter |
| Gerentes | Cláudia Menezes | Renomear ou manter |
| Corretores | 12 nomes | Renomear com equipe Basílio |
| Leads | 11 registros (nomes, telefones, interesse) | Alteração completa (dados reais) |
| Vendas | 10 registros (nomes de corretor, imóvel, VGV) | Atualizar com histórico Basílio |

**Cenário B (Supabase):**

Mesmos registros, mas em tabelas do banco:

- `imobiliarias`: renomear "Imobiliária Padrão" → "Basílio Imóveis"
- `equipes`: 2 UUIDs para atualizar
- `corretores`: 12 UUIDs para atualizar
- `leads`: 11 UUIDs para atualizar
- `vendas`: 10 UUIDs para atualizar
- `usuarios`: 0 registros inicialmente (usuários criados via Supabase Auth)

---

## 4. Quais dados podem ser mantidos

### 4.1 Estrutura e configuração

- **Schema de banco**: não precisa alteração (é genérico)
- **RLS policies**: aplicáveis a qualquer imobiliária
- **Tipos ENUM**: `lead_origem`, `lead_status`, `usuario_role` — todos genéricos
- **Índices**: nenhuma alteração necessária
- **Funções SQL**: nenhuma alteração necessária
- **Migrations**: aplicadas com sucesso, nenhuma reaplicação necessária

### 4.2 Dados operacionais reutilizáveis

- **Ordem de plantão de corretores**: conceito funciona para Basílio
- **Status de leads**: pipeline (novo → em_contato → visita → proposta → fechado/perdido) é genérico
- **Campos de lead**: nome, telefone, origem, interesse, faixa_valor — todos aplicáveis
- **Ranking VGV**: lógica é genérica (soma de vendas por corretor)
- **Histórico de leads**: conceito de auditoria é reutilizável

---

## 5. Dados que obrigatoriamente devem ser substituídos

### 5.1 Identificação da imobiliária

**Campo:** `imobiliarias.nome`

- **Atual:** "Imobiliária Padrão — Renomear após setup"
- **Necessário:** "Basílio Imóveis"
- **Impacto:** Exibido no dashboard e em relatórios
- **Risco:** Nenhum (simples UPDATE)
- **Coluna:** `nome` (text)

### 5.2 Equipes

**Tabela:** `equipes` (2 registros)

| Campo | Atual | Necessário |
|-------|-------|-----------|
| `nome` | Equipe Atlântico | ? (novo nome Basílio) |
| `nome` | Equipe Horizonte | ? (novo nome Basílio) |
| `gerente` | Roberto Tavares | ? (gerente Basílio) |
| `gerente` | Cláudia Menezes | ? (gerente Basílio) |
| `ativo` | true | true (manter) |

- **Risco:** Baixo (nenhuma FK restritiva sobre `equipes.nome`)
- **Dependências:** Corretores apontam para `equipes(id)` — nenhuma quebra

### 5.3 Corretores

**Tabela:** `corretores` (12 registros)

| Campo | Mudança obrigatória |
|-------|-----------------|
| `nome` | Sim (12 nomes de Basílio) |
| `email` | Sim (12 emails válidos) |
| `telefone` | Sim (12 telefones Basílio) |
| `ordem_plantao` | Opcional (manter a ordem ou reordenar) |
| `ativo` | Opcional (manter true para todos) |
| `em_plantao` | Opcional (estado de plantão atual) |

- **Risco:** Baixo (nenhuma constraint sobre `nome`, `email` é UNIQUE mas pode ser NULL)
- **Email UNIQUE:** se vários corretores tiverem email NULL, não há conflito
- **Dependências:** Leads apontam para `corretores(id)` — nenhuma quebra

### 5.4 Leads

**Tabela:** `leads` (11 registros)

**Decisão crítica:** Manter os leads fictícios ou deletar e preencher com leads reais de Basílio?

**Opção A — Manter e atualizar:**

| Campo | Mudança |
|-------|--------|
| `nome` | Sim (11 novos nomes de leads Basílio) |
| `telefone` | Sim (11 novos telefones, verificar deduplicação) |
| `origem` | Sim (atualizar com origem real de Basílio) |
| `interesse` | Sim (atualizar com interesse real) |
| `faixa_valor` | Sim (atualizar com faixa real) |
| `status` | Opcional (manter status atual ou resetar) |
| `corretor_id` | Opcional (redistribuir ou manter) |

- **Risco:** Médio (deduplicação por telefone em 24h — se houver telefone duplicado, precisa lógica de tratamento)
- **Histórico:** `historico_leads` terá registro de "lead_criado" — terá data fictícia (não será impactado)

**Opção B — Deletar e recomeçar:**

- DELETE FROM leads; — apagaria 11 registros
- Impacto: `vendas` pode ter `lead_id = NULL` (FK permite NULL) — sem quebra
- Risco: Baixo
- Novo histórico seria criado à medida que novos leads entrassem

**Recomendação:** Opção B (deletar) é mais limpa — Basílio começa com banco vazio de leads.

### 5.5 Vendas

**Tabela:** `vendas` (10 registros)

**Decisão:** Manter histórico fictício de vendas ou deletar e preencher com histórico real de Basílio?

| Campo | Mudança |
|-------|--------|
| `corretor_id` | Sim (se manter registros, atualizar para UUIDs corretos de corretores Basílio) |
| `lead_id` | Opcional (NULL para vendas históricas — nenhum lead vinculado) |
| `valor_vgv` | Sim (atualizar com VGV real de Basílio) |
| `data_venda` | Sim (atualizar para datas reais) |

- **Risco:** Médio (FK `corretor_id` é NOT NULL — cada UUID deve existir em `corretores`)
- **Ranking:** Se manter vendas fictícias, ranking VGV será baseado em dados fictícios
- **Recomendação:** Opção B (deletar) — Basílio começa com ranking zerado

---

## 6. Contagem de registros por tabela

### Estado atual (após schema.sql + migration 002)

| Tabela | Registros | Modo |
|--------|-----------|------|
| `imobiliarias` | 1 | Mock + Supabase |
| `usuarios` | 0 | Mock: n/a; Supabase: criados via Auth |
| `equipes` | 2 | Mock + Supabase |
| `corretores` | 12 | Mock + Supabase |
| `leads` | 11 | Mock + Supabase |
| `vendas` | 10 | Mock + Supabase |
| `historico_leads` | 0 | Ambos (criado na migration, vazio) |

**Total de registros com dados de demo:** 36 registros

---

## 7. Quais riscos existem ao alterar os registros atuais

### 7.1 Risco de integridade referencial

**Risco: BAIXO (estrutura bem desenhada)**

- Todas as FKs usam `ON UPDATE CASCADE` — renomear ID não quebraria (mas UUIDs não mudam)
- Usar `ON DELETE RESTRICT` em `imobiliaria_id` — bom (impede delete acidental)
- `leads` → `corretores`: FK com `ON DELETE SET NULL` — seguro
- `vendas` → `leads`: FK com `ON DELETE SET NULL` — seguro

**Recomendação:** Manter FKs como estão. Nenhum risco ao alterar dados (nomes, emails, etc.).

### 7.2 Risco de RLS

**Risco: MÉDIO (se não entender RLS corretamente)**

- RLS filtra dados por `imobiliaria_id`
- Se renomear `imobiliarias.nome` para "Basílio Imóveis", RLS continua funcionando (compara por `id`, não por nome)
- Se criar nova imobiliária para Basílio: todos os dados atuais ficariam invisíveis (pertencem à "Imobiliária Padrão")
- **Decisão crítica:** Alterar os dados na imobiliária existente vs. criar nova imobiliária

**Recomendação:** Alterar a imobiliária existente (ID não muda). Risco zero se RLS não for quebrado.

### 7.3 Risco de Supabase Auth

**Risco: BAIXO (se gerenciado corretamente)**

- `usuarios` precisa ser criado manualmente ou via trigger
- Cada `usuario` tem `auth_user_id` que aponta para `auth.users(id)` (gerenciado pelo Supabase Auth)
- Deletar um usuário de Auth não deleta o registro em `usuarios` (há `ON DELETE CASCADE` — será deletado)
- **Recomendação:** Não alterar `usuarios` durante a substituição. Usuários de Basílio serão criados via sign-up ou dashboard do Supabase.

### 7.4 Risco de histórico (historico_leads)

**Risco: MÍNIMO (tabela é para auditoria futura)**

- Tabela está vazia (nenhum evento registrado ainda)
- Se deletar leads, `historico_leads` pode ficar com registros órfãos? Não — FK usa `ON DELETE CASCADE`
- **Recomendação:** Deletar `leads` limpará automaticamente o histórico.

### 7.5 Risco de deduplicação por telefone

**Risco: MÉDIO (se não implementado roteamento correto)**

- Cada lead novo passa por deduplicação em `POST /api/leads`
- Janela: 24h
- Se dois leads tiverem o mesmo telefone em 24h: segundo é rejeitado ou cria duplicata?
- **Status:** Deduplicação está planejada (Fase 6.2) mas não implementada
- **Recomendação:** Se manter leads actuais, usar telefones que não conflitem com dados reais de Basílio

### 7.6 Risco de modo mock vs. Supabase

**Risco: ALTO (se não alinhado corretamente)**

- Se app está em mock mode (sem `.env.local`): alterações em Supabase não aparecem
- Se app está em Supabase mode: `lib/mock-data.ts` é ignorado completamente
- **Decisão:** Qual é o objetivo?
  - **Apenas demo local:** alterar `lib/mock-data.ts`, não tocar Supabase
  - **Demo em produção:** alterar Supabase, `lib/mock-data.ts` fica como backup

**Recomendação:** Clarificar qual modo está sendo usado antes de proceder.

### 7.7 Risco de dados públicos (sem RLS no início)

**Risco: BAIXO (RLS já está implementado)**

- Migration 002 habilitou RLS em todas as tabelas
- Todas as políticas criadas (admin, gestor, corretor)
- Dados não são públicos por padrão
- **Recomendação:** Nenhum risco adicional.

---

## 8. Checklist de substituição por cenário

### Cenário A: Alterar mock-data.ts (demo local)

**Arquivo:** `lib/mock-data.ts`

**Passos:**

1. [ ] Verificar se app está em mock mode (sem `.env.local` com Supabase env vars)
2. [ ] Alterar `equipes` (nomes das duas equipes)
3. [ ] Alterar `gerentes` (nomes dos 2 gerentes)
4. [ ] Alterar `corretores` (nomes dos 12, emails, telefones, iniciais)
5. [ ] Alterar `leads` (todos os 11: nomes, telefones, origem, interesse, faixaValor)
6. [ ] Alterar `vendas` (todos os 10: corretorId para nomes corretos, imovel, vgv)
7. [ ] Testar: `npm run dev`, verificar dashboard, ranking, funil
8. [ ] Verificar que nenhuma função derivada quebrou (buildRanking, funilPorStatus, etc.)

**Registros a alterar:** 36 (2 equipes + 2 gerentes + 12 corretores + 11 leads + 10 vendas + estrutura)

**Risco:** Muito baixo (nenhuma alteração de estrutura, apenas dados)

**Tempo estimado:** 1–2 horas (preparação de dados reais de Basílio, testes)

---

### Cenário B: Alterar dados em Supabase

**Tabelas:** `imobiliarias`, `equipes`, `corretores`, `leads`, `vendas` (potencialmente)

**Passos:**

1. [ ] Verificar se app está em Supabase mode (`.env.local` tem Supabase env vars)
2. [ ] Conectar ao SQL Editor do Supabase
3. [ ] Backup (export das tabelas em CSV)
4. [ ] UPDATE `imobiliarias` SET nome = 'Basílio Imóveis' WHERE nome = 'Imobiliária Padrão'
5. [ ] UPDATE `equipes` (2 UUIDs para renomear + gerentes)
6. [ ] UPDATE `corretores` (12 UUIDs para renomear + emails + telefones)
7. [ ] DELETE `leads` (ou UPDATE todos os 11 com dados Basílio)
8. [ ] DELETE `vendas` (ou UPDATE todos os 10 com dados Basílio)
9. [ ] Verificar RLS: fazer login e validar que dados aparecem corretamente
10. [ ] Testar dashboard, leads, ranking

**Registros a alterar:** 2 + 12 + (11 ou 0) + (10 ou 0) = 25–35

**Risco:** Médio (RLS, FKs, deduplicação de telefone não implementada)

**Backup obrigatório:** Sim — usar Supabase backup antes

**Tempo estimado:** 2–4 horas (preparação SQL, testes, rollback se necessário)

---

## 9. Estrutura de arquivos afetados

### Cenário A (mock-data.ts)

```
lib/
└─ mock-data.ts ← ALTERAR
   ├─ equipes (2 nomes)
   ├─ corretores (12 nomes, emails, telefones, iniciais)
   ├─ leads (11 registros completos)
   └─ vendas (10 registros: VGV, nomes de corretor)
```

**Nenhum outro arquivo precisa ser alterado.**

---

### Cenário B (Supabase)

```
Supabase (banco PostgreSQL):
├─ imobiliarias (1 UPDATE)
├─ equipes (2 UPDATEs)
├─ corretores (12 UPDATEs)
├─ leads (11 DELETEs ou UPDATEs)
├─ vendas (10 DELETEs ou UPDATEs)
└─ historico_leads (0 alterações — vazio)
```

**Supabase Auth (gerenciado externamente):**

```
auth.users
└─ 0 alterações (criados via sign-up)
```

**Nenhum arquivo `.ts` ou `.js` precisa ser alterado** (código lê do banco, não tem dados embutidos).

---

## 10. Resumo executivo

### Dados fictícios atuais

- **Imobiliária:** "Imobiliária Padrão"
- **Equipes:** 2 (Atlântico, Horizonte)
- **Corretores:** 12 (6 + 6)
- **Leads:** 11 (4 na fila, 7 distribuídos)
- **Vendas:** 10 (histórico de ranking)
- **Registros totais:** 36

### Substituição pela Basílio Imóveis

**Cenário A (mock mode):**
- Arquivo: `lib/mock-data.ts`
- Registros a alterar: 36
- Risco: Muito baixo
- Tempo: 1–2 horas

**Cenário B (Supabase):**
- Tabelas: 5 (imobiliarias, equipes, corretores, leads, vendas)
- Registros a alterar: 25–35 (depende se manter leads/vendas ou não)
- Risco: Médio (RLS, FKs, deduplicação não implementada)
- Tempo: 2–4 horas
- **Backup obrigatório:** Sim

### Dados que podem ser mantidos

- Schema de banco (genérico)
- RLS policies (genéricas)
- Tipos ENUM (genéricos)
- Índices (nenhuma alteração necessária)
- Funções SQL (genéricas)

### Dados que obrigatoriamente devem ser substituídos

1. **imobiliarias.nome** — "Imobiliária Padrão" → "Basílio Imóveis"
2. **equipes** — nomes e gerentes
3. **corretores** — todos os 12 (nomes, emails, telefones)
4. **leads** — todos os 11 (nomes, telefones, origem, interesse, faixaValor)
5. **vendas** — todos os 10 (VGV, datas, nomes de corretor) — **recomendado: deletar**

### Riscos principais

1. **Deduplicação de telefone não implementada** — se manter leads, cuidado com duplicatas
2. **RLS:** Se criar nova imobiliária, dados antigos ficarão invisíveis
3. **Supabase Auth:** Usuários devem ser gerenciados via Auth, não alterados manualmente
4. **Modo de operação:** Clarificar se mock ou Supabase antes de proceder
5. **Backup:** Obrigatório para Cenário B

---

## Conclusão

A substituição é **viável e baixo-risco** em ambos os cenários. A estrutura foi desenhada genericamente para suportar múltiplas imobiliárias, e os dados fictícios atuais ocupam espaço claramente isolado.

**Próximo passo:** Definir qual cenário (A ou B) será executado e preparar dados reais de Basílio Imóveis (nomes, telefones, equipes, histórico de vendas).
