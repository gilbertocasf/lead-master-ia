# Fase 5-R — Reset Controlado: RLS e Multi-tenancy
**Data:** 2026-06-19  
**Arquivo gerado:** `supabase/schema.v2.sql`  
**Status:** AGUARDANDO APROVAÇÃO — nenhuma execução realizada  
**Metodologia:** Auditoria do schema v1 + proposta de reset. Nenhum código alterado. Nenhum comando executado no Supabase.

---

## Por que estamos resetando

O schema inicial (`schema.sql`, Fase 5) foi projetado como MVP single-tenant sem autenticação — uma decisão consciente documentada em `DECISOES-ARQUITETURA.md §13`. Ele serviu para validar o modelo de negócio (distribuição de leads, round-robin, pipeline) mas tem três problemas estruturais que impossibilitam uso comercial real:

### Problema 1 — Sem RLS

Com o Supabase, a chave anon (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) é pública — está no código do frontend e pode ser extraída por qualquer pessoa. Sem RLS, qualquer requisição com essa chave pode ler ou gravar dados de qualquer imobiliária. Para um produto com dados de clientes (nomes, telefones, negociações), isso é inaceitável.

### Problema 2 — Sem multi-tenancy

Nenhuma tabela tem `imobiliaria_id`. Não é possível isolar dados entre imobiliárias no mesmo banco sem esse campo. Adicionar `imobiliaria_id` incrementalmente (sem reset) exigiria: ALTER TABLE + backfill + atualizar todas as queries + atualizar todas as políticas RLS — risco alto de inconsistência em banco com dados reais.

### Problema 3 — Sem gestão de usuários

Sem `usuarios` e sem `auth_user_id`, não há base para controle de acesso por role (admin, gestor, corretor). As políticas RLS do Supabase dependem de `auth.uid()`, que precisa ser mapeado para um `imobiliaria_id` e um `role`.

### Por que não incrementar em vez de resetar

Os três problemas têm dependência em cadeia:
- RLS depende de multi-tenancy (precisa do `imobiliaria_id` para isolar)
- Multi-tenancy depende de `imobiliaria_id` em todas as tabelas
- Permissões por role dependem da tabela `usuarios`
- A tabela `usuarios` depende de `auth.users` do Supabase

Adicionar um sem os outros cria um schema inconsistente. O custo de adicionar os três incrementalmente (migrations + backfill + testes) é maior do que um reset limpo — especialmente porque os dados atuais são apenas dados de seed, sem registros reais de clientes.

---

## Auditoria do schema v1

### Tabelas existentes

| Tabela | Colunas | Problemas para v2 |
|--------|---------|-------------------|
| `equipes` | id, nome, gerente, created_at | Sem `imobiliaria_id`. Sem `ativo`. Sem `ultimo_lead_recebido_em`. |
| `corretores` | id, nome, email, telefone, equipe_id, ordem_plantao, ativo, created_at | Sem `imobiliaria_id`. Sem `em_plantao`. Sem `ultimo_lead_recebido_em`. Sem `usuario_id`. |
| `leads` | id, nome, telefone, origem, equipe_id, corretor_id, status, observacoes, interesse, faixa_valor, created_at | Sem `imobiliaria_id`. Sem `telefone_normalizado`. Sem `distribuido_em`. |
| `vendas` | id, corretor_id, lead_id, valor_vgv, data_venda, created_at | Sem `imobiliaria_id`. Campo `valor_vgv` → renomear para `valor`. |

### Tabelas inexistentes (precisam ser criadas)

- `imobiliarias` — raiz do tenant
- `usuarios` — perfil vinculado ao Supabase Auth
- `historico_leads` — trilha de auditoria (era bloqueante para Fase 5, jamais aplicada)

### Enums existentes

| Enum | Valores | Status |
|------|---------|--------|
| `lead_origem` | Instagram, Facebook, Outro | Manter como está |
| `lead_status` | novo, em_contato, visita, proposta, fechado, perdido | Manter como está |

### Enum novo

| Enum | Valores |
|------|---------|
| `usuario_role` | admin, gestor, corretor |

### Migration 001 (não aplicada)

`supabase/migrations/001_fase5_schema_minimo.sql` contém `ADD COLUMN IF NOT EXISTS` para os campos que a Fase 5 planejou. Como estamos resetando, esse arquivo **não será aplicado**. Todos os campos estão incluídos diretamente no `schema.v2.sql`.

### O que o reset descarta vs. preserva

| Aspecto | Descartado | Preservado |
|---------|-----------|-----------|
| Estrutura das tabelas | Totalmente | — |
| Dados de seed | Todos (12 corretores, 11 leads, 10 vendas) | — |
| Enums `lead_origem`, `lead_status` | — | Recriados com mesmos valores |
| Lógica de domínio | — | Modelo conceitual (equipe→corretor→lead) mantido |
| Índices | Todos | Recriados no v2 com adições |
| Código da aplicação | — | Não alterado por este reset |

---

## Novo modelo de banco (schema v2)

### Diagrama de dependências

```
imobiliarias
    │
    ├── usuarios (auth_user_id → auth.users)
    │
    ├── equipes
    │       │
    │       └── corretores (usuario_id → usuarios, nullable)
    │               │
    │               └── leads (equipe_id → equipes, corretor_id → corretores)
    │                       │
    │                       ├── historico_leads (usuario_id → usuarios, nullable)
    │                       │
    │                       └── vendas (corretor_id → corretores)
```

### Tabelas e campos do schema v2

#### `imobiliarias`
| Campo | Tipo | Constraint |
|-------|------|-----------|
| `id` | uuid | PK |
| `nome` | text | NOT NULL |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |

#### `usuarios`
| Campo | Tipo | Constraint |
|-------|------|-----------|
| `id` | uuid | PK |
| `auth_user_id` | uuid | NOT NULL UNIQUE FK → auth.users |
| `imobiliaria_id` | uuid | NOT NULL FK → imobiliarias |
| `nome` | text | NOT NULL |
| `email` | text | NOT NULL |
| `role` | usuario_role | NOT NULL DEFAULT corretor |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |

#### `equipes`
| Campo | Tipo | Constraint | Novo? |
|-------|------|-----------|-------|
| `id` | uuid | PK | — |
| `imobiliaria_id` | uuid | NOT NULL FK → imobiliarias | **SIM** |
| `nome` | text | NOT NULL | — |
| `gerente` | text | NOT NULL | — |
| `ativo` | boolean | NOT NULL DEFAULT true | **SIM** |
| `ultimo_lead_recebido_em` | timestamptz | nullable | **SIM** |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | — |

#### `corretores`
| Campo | Tipo | Constraint | Novo? |
|-------|------|-----------|-------|
| `id` | uuid | PK | — |
| `imobiliaria_id` | uuid | NOT NULL FK → imobiliarias | **SIM** |
| `usuario_id` | uuid | nullable FK → usuarios | **SIM** |
| `equipe_id` | uuid | NOT NULL FK → equipes | — |
| `nome` | text | NOT NULL | — |
| `email` | text | nullable | — |
| `telefone` | text | nullable | — |
| `ordem_plantao` | integer | NOT NULL DEFAULT 0 | — |
| `ativo` | boolean | NOT NULL DEFAULT true | — |
| `em_plantao` | boolean | NOT NULL DEFAULT false | **SIM** |
| `ultimo_lead_recebido_em` | timestamptz | nullable | **SIM** |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | — |

**Nota:** `email` era UNIQUE global no v1. No v2 é UNIQUE por imobiliária (índice parcial `WHERE email IS NOT NULL`).

#### `leads`
| Campo | Tipo | Constraint | Novo? |
|-------|------|-----------|-------|
| `id` | uuid | PK | — |
| `imobiliaria_id` | uuid | NOT NULL FK → imobiliarias | **SIM** |
| `equipe_id` | uuid | NOT NULL FK → equipes | — |
| `corretor_id` | uuid | nullable FK → corretores | — |
| `nome` | text | NOT NULL | — |
| `telefone` | text | nullable | — |
| `telefone_normalizado` | text | nullable | **SIM** |
| `origem` | lead_origem | NOT NULL DEFAULT 'Outro' | — |
| `interesse` | text | nullable | — |
| `faixa_valor` | text | nullable | — |
| `status` | lead_status | NOT NULL DEFAULT 'novo' | — |
| `observacoes` | text | nullable | — |
| `distribuido_em` | timestamptz | nullable | **SIM** |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | — |

**Decisão sobre `equipe_id`:** NOT NULL. No fluxo, equipe é sempre definida antes da inserção (payload direto ou rodízio). Se rodízio falha (sem equipes ativas), a API retorna 503 e o lead não é criado. Nunca haverá lead sem equipe.

#### `historico_leads`
| Campo | Tipo | Constraint |
|-------|------|-----------|
| `id` | uuid | PK |
| `imobiliaria_id` | uuid | NOT NULL FK → imobiliarias |
| `lead_id` | uuid | NOT NULL FK → leads ON DELETE CASCADE |
| `tipo_evento` | text | NOT NULL CHECK (valores válidos) |
| `descricao` | text | nullable |
| `dados` | jsonb | nullable |
| `criado_por` | text | NOT NULL DEFAULT 'sistema' CHECK (valores válidos) |
| `usuario_id` | uuid | nullable FK → usuarios |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |

#### `vendas`
| Campo | Tipo | Constraint | Mudança? |
|-------|------|-----------|---------|
| `id` | uuid | PK | — |
| `imobiliaria_id` | uuid | NOT NULL FK → imobiliarias | **SIM** |
| `lead_id` | uuid | nullable FK → leads | — |
| `corretor_id` | uuid | NOT NULL FK → corretores | — |
| `valor` | numeric(14,2) | NOT NULL CHECK > 0 | Renomeado de `valor_vgv` |
| `data_venda` | date | NOT NULL DEFAULT CURRENT_DATE | — |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | — |

---

## Arquitetura RLS

### Quem pode fazer o quê

| Ator | Mecanismo | Capacidades |
|------|-----------|-------------|
| **anon** | Chave pública + sem policy | Bloqueado em tudo (default deny) |
| **authenticated** | JWT de sessão + policies | Leitura e escrita limitada por role |
| **service_role** | Chave privada | Bypassa RLS — para API routes server-side |

### Operações por canal

| Operação | Ator correto | Motivo |
|----------|-------------|--------|
| Leitura de equipes, corretores, leads na UI | authenticated | Sessão do usuário logado |
| Criação de lead via formulário | service_role (API route) | Necessita UPDATE em equipes e corretores |
| Criação de lead via webhook | service_role (API route) | Mesma razão |
| Distribuição de lead para corretor | service_role (API route) | UPDATE em leads + UPDATE em corretores |
| Inserção em historico_leads | service_role (API route) | Sempre automático, nunca direto pelo client |
| Mudança de status via pipeline | service_role (API route) | UPDATE em leads + INSERT em historico_leads |
| Onboarding (criar imobiliária, usuário admin) | service_role (script/dashboard) | Operação administrativa única |

### Funções helper (SECURITY DEFINER)

Três funções SQL são criadas para uso nas políticas RLS:

```sql
current_imobiliaria_id() → uuid   -- imobiliaria do usuário logado
current_user_role()      → role   -- admin / gestor / corretor
current_usuario_id()     → uuid   -- id interno na tabela usuarios
```

**Por que SECURITY DEFINER:** sem esse atributo, quando a função tenta ler `usuarios` para descobrir o `imobiliaria_id` do usuário atual, o RLS de `usuarios` seria avaliado — chamando a própria função novamente (recursão infinita). SECURITY DEFINER faz a função executar como dono do banco, evitando a recursão.

**Performance:** cada chamada à função executa `SELECT ... WHERE auth_user_id = auth.uid() LIMIT 1`. O índice `idx_usuarios_auth_user_id` torna isso O(log n). Como as funções são `STABLE`, o PostgreSQL pode cachear o resultado dentro de uma mesma query.

### Políticas por tabela

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| `imobiliarias` | authenticated (própria) | service_role | service_role | service_role |
| `usuarios` | authenticated (mesma imobiliária) | service_role | authenticated (próprio) | service_role |
| `equipes` | authenticated | admin/gestor | admin/gestor | service_role |
| `corretores` | authenticated | admin/gestor | admin/gestor | service_role |
| `leads` | admin/gestor: todos; corretor: próprios | service_role | admin/gestor | service_role |
| `historico_leads` | admin/gestor: todos; corretor: dos seus leads | service_role | bloqueado | bloqueado |
| `vendas` | admin/gestor: todas; corretor: próprias | service_role | service_role | service_role |

### Riscos identificados no modelo RLS

| Risco | Detalhe | Mitigação |
|-------|---------|-----------|
| Corretor sem `usuario_id` | Políticas de corretor dependem de `corretores.usuario_id`. Se NULL, políticas de corretor sempre retornam vazio. | Corretor sem acesso ao sistema não faz login — correto. Gestor administra por ele. |
| Performance das políticas de corretor em leads | A policy faz subquery em `corretores` para encontrar o registro vinculado. | Índice `idx_corretores_usuario` + `idx_leads_corretor` cobrem o join. |
| SECURITY DEFINER com bug retorna dados de outro tenant | Uma função helper mal escrita poderia vazar dados. | As funções são simples (1 SELECT, 1 WHERE). Risco baixo. |
| service_role exposto no client | Se a chave service_role vazar, RLS é bypassado. | service_role nunca vai para o frontend. Apenas variáveis de ambiente server-side (`process.env` sem prefixo `NEXT_PUBLIC_`). |

---

## Impacto no código da aplicação

### lib/supabase-queries.ts — alterações necessárias após o reset

| Função | Alteração |
|--------|-----------|
| `fetchEquipes()` | Adicionar `.eq('imobiliaria_id', imobiliariaId)` |
| `fetchCorretores()` | Idem + corrigir `emPlantao: Boolean(row.em_plantao)` (não mais proxy via `ativo`) |
| `fetchPistas()` | Idem + renomear constante `TABELA_PISTAS` de `"pistas"` para `"leads"` |
| `fetchVendas()` | Idem + mapear `valor` em vez de `valor_vgv` |
| Novas funções de escrita | Todas devem usar client com service_role, não o client anon público |

### Dois clients Supabase serão necessários

```ts
// lib/supabase.ts — client público (autenticado, com RLS)
// Usado em Server Components para leitura
export const supabaseClient = createClient(url, anonKey)

// lib/supabase-server.ts — client service_role (bypassa RLS)
// Usado apenas em API routes — NUNCA exportar para o frontend
export const supabaseAdmin = createClient(url, serviceRoleKey)
```

### Constante TABELA_PISTAS

```ts
// Antes (schema v1 usava "pistas" no código, "leads" no banco — inconsistência)
const TABELA_PISTAS = "pistas"

// Depois (schema v2 define a tabela como "leads")
const TABELA_LEADS = "leads"
```

### Variáveis de ambiente adicionais necessárias

```
SUPABASE_SERVICE_ROLE_KEY=...   # Chave service_role (apenas server-side)
```

Adicionar ao `.env.local` e ao painel de variáveis da Vercel (como variável privada, sem prefixo `NEXT_PUBLIC_`).

---

## Backup antes do reset

Executar no SQL Editor do Supabase e copiar os resultados (dados de seed):

```sql
SELECT * FROM equipes;
SELECT * FROM corretores;
SELECT * FROM leads;
SELECT * FROM vendas;
```

Os dados atuais são exclusivamente dados de seed — não há registros reais de clientes. Mesmo assim, os UUIDs dos corretores de exemplo podem ser úteis para recriar seeds com os mesmos nomes.

---

## Ordem de execução do reset

```
1. Exportar dados (SQL Editor → copiar resultado das 4 SELECTs acima)

2. Abrir SQL Editor no Supabase Dashboard

3. Executar supabase/schema.v2.sql inteiro
   (inclui DROP CASCADE no início — irreversível)

4. Verificar que as 7 tabelas foram criadas
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

5. Verificar RLS habilitado nas 7 tabelas
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

6. Criar imobiliária inicial
   INSERT INTO imobiliarias (nome) VALUES ('Nome da Imobiliária');
   -- Salvar o UUID gerado (será o imobiliaria_id de todos os registros)

7. Criar usuário admin via Supabase Dashboard
   Authentication → Users → Invite user → email do admin

8. Criar registro em usuarios vinculando ao auth user
   INSERT INTO usuarios (auth_user_id, imobiliaria_id, nome, email, role)
   VALUES ('<uuid-do-auth-user>', '<uuid-da-imobiliaria>', 'Nome Admin', 'email@admin.com', 'admin');

9. Reinserir dados de seed com imobiliaria_id correto
   (equipes → corretores → leads → vendas — nessa ordem por FKs)

10. Adaptar lib/supabase-queries.ts para filtrar por imobiliaria_id

11. Adicionar SUPABASE_SERVICE_ROLE_KEY ao .env.local

12. Testar localmente (npm run dev) com npm run build passando

13. Verificar que app funciona antes de qualquer deploy na Vercel
```

---

## Plano de rollback

Se o reset falhar ou o app quebrar:

| Situação | Rollback |
|----------|---------|
| Schema.v2 criado mas dados não reinseridos | Executar `supabase/schema.sql` (v1) no SQL Editor — ele tem DROP + dados de seed |
| App quebrou após deploy | Reverter para commit anterior no Vercel Dashboard (instant rollback) |
| Dados reais inseridos e corrompidos | Não aplicável — não há dados reais ainda |

**Limitação:** qualquer dado real inserido após o reset v2 e antes do rollback será perdido. Como estamos em ambiente de desenvolvimento sem usuários reais, o risco é zero.

---

## Validações pós-reset

```sql
-- 1. Tabelas criadas (esperado: 7 tabelas)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- 2. RLS em todas as tabelas (esperado: rowsecurity = true em todas)
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' ORDER BY tablename;

-- 3. Políticas criadas por tabela
SELECT tablename, policyname, cmd, qual
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- 4. Funções helper existem
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name LIKE 'current_%';

-- 5. imobiliaria_id em todas as tabelas de dados (esperado: 6 tabelas)
SELECT table_name FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'imobiliaria_id'
ORDER BY table_name;

-- 6. Testar isolamento (como usuário autenticado — não como service_role)
-- Com usuário logado, SELECT em leads deve retornar apenas leads da imobiliária do usuário.
-- Com anon key, SELECT deve retornar zero rows.
```

---

## Decisões pendentes de aprovação

| Decisão | Opções | Recomendação |
|---------|--------|-------------|
| Executar o reset agora? | Sim / Depois | Aguardando aprovação explícita |
| `equipes.gerente` texto ou FK para usuarios? | Texto (MVP) / FK (V2) | Manter como texto. FK exige que gerente tenha conta — aumenta complexidade do onboarding |
| `vendas.valor_vgv` → `valor` | Renomear agora / manter nome | Renomear no schema v2. Quebra o mapeamento atual em `fetchVendas()` — corrigir junto com a query |
| Quando implementar UI de login? | Antes do reset / Depois | Depois. O reset pode acontecer antes de ter login. Até lá, usar service_role para todas as operações |
| `TABELA_PISTAS = "pistas"` → `"leads"` | Corrigir junto com o reset | Sim — o reset é o momento certo para consolidar o nome |

---

## O que este reset NÃO cobre

- Implementação de UI de login (tela de autenticação para o app)
- Trigger automático de criação de `usuarios` após signup no Supabase Auth
- Configuração de JWT claims customizados para `imobiliaria_id` e `role`
- Rate limiting no webhook
- Autenticação do webhook via X-API-Key
- Multi-imobiliária real (onboarding de novos clientes via painel admin)

Esses itens são V2 e não bloqueiam o reset nem o MVP.

---

*Schema v2.0 gerado em `supabase/schema.v2.sql`. Aguardando aprovação para execução.*
