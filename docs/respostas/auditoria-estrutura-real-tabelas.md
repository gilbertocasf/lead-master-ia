# Auditoria Estrutural Real das Tabelas
## Basílio Imóveis Demo

**Data**: 2026-06-23  
**Fonte**: `supabase/schema.v2.sql`  
**Status**: Estrutura conforme definição SQL (não inferida)

---

## Tabela: `imobiliarias`

**Descrição**: Tenant raiz. Cada imobiliária é um contexto de dados isolado via RLS.

### Colunas

| Coluna | Tipo | Nullable | Default | Restrição |
|--------|------|----------|---------|-----------|
| `id` | `UUID` | ✗ | `gen_random_uuid()` | PRIMARY KEY |
| `nome` | `TEXT` | ✗ | — | — |
| `created_at` | `TIMESTAMPTZ` | ✗ | `now()` | — |

### Primary Key
- `id`

### Foreign Keys
- Nenhuma

### Índices Relevantes
- Nenhum explícito (PK implícito)

---

## Tabela: `usuarios`

**Descrição**: Perfil do usuário do sistema vinculado ao Supabase Auth. O `auth_user_id` é FK para `auth.users(id)`.

### Colunas

| Coluna | Tipo | Nullable | Default | Restrição |
|--------|------|----------|---------|-----------|
| `id` | `UUID` | ✗ | `gen_random_uuid()` | PRIMARY KEY |
| `auth_user_id` | `UUID` | ✗ | — | UNIQUE, FK → `auth.users(id)` ON DELETE CASCADE |
| `imobiliaria_id` | `UUID` | ✗ | — | FK → `imobiliarias(id)` ON DELETE CASCADE |
| `nome` | `TEXT` | ✗ | — | — |
| `email` | `TEXT` | ✗ | — | — |
| `role` | `usuario_role` (ENUM) | ✗ | `'corretor'` | CHECK: `'admin'`, `'gestor'`, `'corretor'` |
| `created_at` | `TIMESTAMPTZ` | ✗ | `now()` | — |

### Primary Key
- `id`

### Foreign Keys
- `auth_user_id` → `auth.users(id)` ON DELETE CASCADE
- `imobiliaria_id` → `imobiliarias(id)` ON DELETE CASCADE

### Índices Relevantes
- `idx_usuarios_auth_user_id` UNIQUE ON `(auth_user_id)`
- `idx_usuarios_imobiliaria` ON `(imobiliaria_id)`

### Observações
- Exclusão em cascata: removendo auth user, o usuário é apagado.
- Exclusão em cascata: removendo imobiliária, todos seus usuários são apagados.

---

## Tabela: `equipes`

**Descrição**: Equipes comerciais de uma imobiliária.

### Colunas

| Coluna | Tipo | Nullable | Default | Restrição |
|--------|------|----------|---------|-----------|
| `id` | `UUID` | ✗ | `gen_random_uuid()` | PRIMARY KEY |
| `imobiliaria_id` | `UUID` | ✗ | — | FK → `imobiliarias(id)` ON DELETE CASCADE |
| `nome` | `TEXT` | ✗ | — | — |
| `gerente` | `TEXT` | ✗ | — | — |
| `ativo` | `BOOLEAN` | ✗ | `true` | — |
| `ultimo_lead_recebido_em` | `TIMESTAMPTZ` | ✓ | NULL | — |
| `created_at` | `TIMESTAMPTZ` | ✗ | `now()` | — |

### Primary Key
- `id`

### Foreign Keys
- `imobiliaria_id` → `imobiliarias(id)` ON DELETE CASCADE

### Índices Relevantes
- `idx_equipes_imobiliaria` ON `(imobiliaria_id)`
- `idx_equipes_ativo` ON `(imobiliaria_id)` WHERE `ativo = true` (índice parcial)

### Observações
- Equipes inativas não participam do rodízio automático.
- `ultimo_lead_recebido_em` usado no algoritmo de distribuição: `ORDER BY COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC`.

---

## Tabela: `corretores`

**Descrição**: Corretores vinculados a uma equipe. Podem ter usuário de login opcional.

### Colunas

| Coluna | Tipo | Nullable | Default | Restrição |
|--------|------|----------|---------|-----------|
| `id` | `UUID` | ✗ | `gen_random_uuid()` | PRIMARY KEY |
| `imobiliaria_id` | `UUID` | ✗ | — | FK → `imobiliarias(id)` ON DELETE CASCADE |
| `usuario_id` | `UUID` | ✓ | NULL | FK → `usuarios(id)` ON DELETE SET NULL |
| `equipe_id` | `UUID` | ✗ | — | FK → `equipes(id)` ON UPDATE CASCADE ON DELETE RESTRICT |
| `nome` | `TEXT` | ✗ | — | — |
| `email` | `TEXT` | ✓ | NULL | — |
| `telefone` | `TEXT` | ✓ | NULL | — |
| `ordem_plantao` | `INTEGER` | ✗ | `0` | — |
| `ativo` | `BOOLEAN` | ✗ | `true` | — |
| `em_plantao` | `BOOLEAN` | ✗ | `false` | — |
| `ultimo_lead_recebido_em` | `TIMESTAMPTZ` | ✓ | NULL | — |
| `created_at` | `TIMESTAMPTZ` | ✗ | `now()` | — |

### Primary Key
- `id`

### Foreign Keys
- `imobiliaria_id` → `imobiliarias(id)` ON DELETE CASCADE
- `usuario_id` → `usuarios(id)` ON DELETE SET NULL
- `equipe_id` → `equipes(id)` ON UPDATE CASCADE ON DELETE RESTRICT

### Índices Relevantes
- `idx_corretores_imobiliaria` ON `(imobiliaria_id)`
- `idx_corretores_equipe` ON `(equipe_id)`
- `idx_corretores_usuario` ON `(usuario_id)` WHERE `usuario_id IS NOT NULL` (índice parcial)
- `idx_corretores_plantao` ON `(equipe_id, em_plantao, ativo, ultimo_lead_recebido_em)` WHERE `em_plantao = true AND ativo = true` (cobre query de distribuição)
- `idx_corretores_email_imobiliaria` UNIQUE ON `(imobiliaria_id, email)` WHERE `email IS NOT NULL` (índice parcial)

### Observações
- `usuario_id` NULL = corretor sem acesso ao sistema (gerenciado pelo gestor).
- `ativo` = true significa está na empresa. `false` = desligado.
- `em_plantao` = true significa disponível para receber leads. Independente de `ativo`.
- Restrição ON DELETE RESTRICT em `equipe_id`: equipe não pode ser deletada enquanto houver corretores nela.
- Email único por imobiliária (permite NULL).

---

## Tabela: `leads`

**Descrição**: Leads captados. `equipe_id` sempre preenchido na criação. `corretor_id` = NULL enquanto aguardando distribuição.

### Colunas

| Coluna | Tipo | Nullable | Default | Restrição |
|--------|------|----------|---------|-----------|
| `id` | `UUID` | ✗ | `gen_random_uuid()` | PRIMARY KEY |
| `imobiliaria_id` | `UUID` | ✗ | — | FK → `imobiliarias(id)` ON DELETE CASCADE |
| `equipe_id` | `UUID` | ✗ | — | FK → `equipes(id)` ON UPDATE CASCADE ON DELETE RESTRICT |
| `corretor_id` | `UUID` | ✓ | NULL | FK → `corretores(id)` ON UPDATE CASCADE ON DELETE SET NULL |
| `nome` | `TEXT` | ✗ | — | — |
| `telefone` | `TEXT` | ✓ | NULL | — |
| `telefone_normalizado` | `TEXT` | ✓ | NULL | — |
| `origem` | `lead_origem` (ENUM) | ✗ | `'Outro'` | CHECK: `'Instagram'`, `'Facebook'`, `'Outro'` |
| `interesse` | `TEXT` | ✓ | NULL | — |
| `faixa_valor` | `TEXT` | ✓ | NULL | — |
| `status` | `lead_status` (ENUM) | ✗ | `'novo'` | CHECK: `'novo'`, `'em_contato'`, `'visita'`, `'proposta'`, `'fechado'`, `'perdido'` |
| `observacoes` | `TEXT` | ✓ | NULL | — |
| `distribuido_em` | `TIMESTAMPTZ` | ✓ | NULL | — |
| `created_at` | `TIMESTAMPTZ` | ✗ | `now()` | — |

### Primary Key
- `id`

### Foreign Keys
- `imobiliaria_id` → `imobiliarias(id)` ON DELETE CASCADE
- `equipe_id` → `equipes(id)` ON UPDATE CASCADE ON DELETE RESTRICT
- `corretor_id` → `corretores(id)` ON UPDATE CASCADE ON DELETE SET NULL

### Índices Relevantes
- `idx_leads_imobiliaria` ON `(imobiliaria_id)`
- `idx_leads_equipe` ON `(equipe_id)`
- `idx_leads_corretor` ON `(corretor_id)`
- `idx_leads_status` ON `(status)`
- `idx_leads_fila` ON `(equipe_id)` WHERE `corretor_id IS NULL` (fila de distribuição)
- `idx_leads_deduplicacao` ON `(telefone_normalizado, created_at)`

### Observações
- `equipe_id` NOT NULL: sempre definido no fluxo do sistema.
- `corretor_id` = NULL durante aguardamento de distribuição.
- `telefone_normalizado`: apenas dígitos (sem máscara), usado para deduplicação com janela de 24h.
- `distribuido_em`: timestamp da atribuição ao corretor, marca início do SLA (30min amarelo / 2h vermelho).
- Restrição ON DELETE RESTRICT em `equipe_id`: não deletar equipe com leads associados.

---

## Tabela: `historico_leads`

**Descrição**: Trilha de auditoria imutável de eventos do lead. Inserções apenas via `service_role`. Nunca atualizar ou apagar eventos.

### Colunas

| Coluna | Tipo | Nullable | Default | Restrição |
|--------|------|----------|---------|-----------|
| `id` | `UUID` | ✗ | `gen_random_uuid()` | PRIMARY KEY |
| `imobiliaria_id` | `UUID` | ✗ | — | FK → `imobiliarias(id)` ON DELETE CASCADE |
| `lead_id` | `UUID` | ✗ | — | FK → `leads(id)` ON DELETE CASCADE |
| `tipo_evento` | `TEXT` | ✗ | — | CHECK: `'lead_criado'`, `'lead_roteado'`, `'lead_distribuido'`, `'distribuicao_falhou'`, `'status_alterado'`, `'lead_redistribuido'` |
| `descricao` | `TEXT` | ✓ | NULL | — |
| `dados` | `JSONB` | ✓ | NULL | — |
| `criado_por` | `TEXT` | ✗ | `'sistema'` | CHECK: `'sistema'`, `'formulario'`, `'webhook'`, `'usuario'` |
| `usuario_id` | `UUID` | ✓ | NULL | FK → `usuarios(id)` ON DELETE SET NULL |
| `created_at` | `TIMESTAMPTZ` | ✗ | `now()` | — |

### Primary Key
- `id`

### Foreign Keys
- `imobiliaria_id` → `imobiliarias(id)` ON DELETE CASCADE
- `lead_id` → `leads(id)` ON DELETE CASCADE
- `usuario_id` → `usuarios(id)` ON DELETE SET NULL

### Índices Relevantes
- `idx_historico_imobiliaria` ON `(imobiliaria_id)`
- `idx_historico_lead` ON `(lead_id, created_at DESC)`

### Observações
- Política: inserção apenas via `service_role`. Sem políticas INSERT/UPDATE/DELETE para authenticated/anon.
- Auditoria imutável: nunca alterar ou apagar registros — apenas inserir.
- `tipo_evento` e `criado_por` restritos por CHECK constraint.
- `dados` JSONB com estrutura por tipo de evento:
  - `lead_criado`: `{origem, equipe_id}`
  - `lead_distribuido`: `{corretor_id, corretor_nome}`
  - `status_alterado`: `{status_anterior, status_novo, motivo_perda?}`
  - `lead_roteado`: `{equipe_id, motivo}`
- `usuario_id` preenchido quando `criado_por='usuario'`. NULL em eventos automáticos.

---

## Tabela: `vendas`

**Descrição**: Base do ranking VGV. Vendas fechadas com vínculo opcional ao lead de origem.

### Colunas

| Coluna | Tipo | Nullable | Default | Restrição |
|--------|------|----------|---------|-----------|
| `id` | `UUID` | ✗ | `gen_random_uuid()` | PRIMARY KEY |
| `imobiliaria_id` | `UUID` | ✗ | — | FK → `imobiliarias(id)` ON DELETE CASCADE |
| `lead_id` | `UUID` | ✓ | NULL | FK → `leads(id)` ON UPDATE CASCADE ON DELETE SET NULL |
| `corretor_id` | `UUID` | ✗ | — | FK → `corretores(id)` ON UPDATE CASCADE ON DELETE RESTRICT |
| `valor` | `NUMERIC(14,2)` | ✗ | — | CHECK: `valor > 0` |
| `data_venda` | `DATE` | ✗ | `CURRENT_DATE` | — |
| `created_at` | `TIMESTAMPTZ` | ✗ | `now()` | — |

### Primary Key
- `id`

### Foreign Keys
- `imobiliaria_id` → `imobiliarias(id)` ON DELETE CASCADE
- `lead_id` → `leads(id)` ON UPDATE CASCADE ON DELETE SET NULL
- `corretor_id` → `corretores(id)` ON UPDATE CASCADE ON DELETE RESTRICT

### Índices Relevantes
- `idx_vendas_imobiliaria` ON `(imobiliaria_id)`
- `idx_vendas_corretor` ON `(corretor_id)`
- `idx_vendas_lead` ON `(lead_id)`
- `idx_vendas_data` ON `(data_venda)`

### Observações
- `lead_id` nullable para vendas históricas sem lead vinculado no sistema.
- `valor` = Valor Geral de Vendas (VGV) em reais, precision 14 dígitos, scale 2 casas decimais.
- `corretor_id` NOT NULL: toda venda tem um corretor responsável.
- Restrição ON DELETE RESTRICT em `corretor_id`: não deletar corretor com vendas associadas.
- Todas as operações (INSERT/UPDATE/DELETE) via `service_role` apenas.

---

## Enumerações (ENUM Types)

### `usuario_role`
```
CREATE TYPE usuario_role AS ENUM ('admin', 'gestor', 'corretor');
```

### `lead_origem`
```
CREATE TYPE lead_origem AS ENUM ('Instagram', 'Facebook', 'Outro');
```

### `lead_status`
```
CREATE TYPE lead_status AS ENUM (
  'novo',
  'em_contato',
  'visita',
  'proposta',
  'fechado',
  'perdido'
);
```

---

## Resumo de Constraints

### NOT NULL (por coluna)
- **imobiliarias**: id, nome, created_at
- **usuarios**: id, auth_user_id, imobiliaria_id, nome, email, role, created_at
- **equipes**: id, imobiliaria_id, nome, gerente, ativo, created_at
- **corretores**: id, imobiliaria_id, equipe_id, nome, ordem_plantao, ativo, em_plantao, created_at
- **leads**: id, imobiliaria_id, equipe_id, nome, origem, status, created_at
- **historico_leads**: id, imobiliaria_id, lead_id, tipo_evento, criado_por, created_at
- **vendas**: id, imobiliaria_id, corretor_id, valor, data_venda, created_at

### UNIQUE
- `usuarios(auth_user_id)` UNIQUE
- `corretores(imobiliaria_id, email)` UNIQUE (parcial, WHERE email IS NOT NULL)

### CHECK
- `historico_leads(tipo_evento)` IN ('lead_criado', 'lead_roteado', 'lead_distribuido', 'distribuicao_falhou', 'status_alterado', 'lead_redistribuido')
- `historico_leads(criado_por)` IN ('sistema', 'formulario', 'webhook', 'usuario')
- `vendas(valor)` > 0

### DEFAULTS
- UUIDs: `gen_random_uuid()`
- Booleans: `true` ou `false`
- ENUMs: valor específico ('Outro', 'novo', 'corretor')
- Timestamps: `now()`
- Dates: `CURRENT_DATE`
- Integers: `0`

---

## Row Level Security (RLS)

**Status**: Habilitado em todas as 7 tabelas

### Aplicação
- `service_role` bypassa RLS automaticamente (operações do servidor)
- `authenticated` (usuário logado) segue políticas específicas por role
- `anon` (sem políticas) = operação bloqueada por padrão

### Tabelas com Políticas
1. **imobiliarias**: SELECT (filtra por `current_imobiliaria_id()`)
2. **usuarios**: SELECT, UPDATE (próprio perfil)
3. **equipes**: SELECT, INSERT (admin/gestor), UPDATE (admin/gestor)
4. **corretores**: SELECT, INSERT (admin/gestor), UPDATE (admin/gestor)
5. **leads**: SELECT (admin/gestor veem todos; corretor vê apenas atribuídos), UPDATE (admin/gestor)
6. **historico_leads**: SELECT (admin/gestor veem tudo; corretor vê apenas seus), INSERT/UPDATE/DELETE (service_role)
7. **vendas**: SELECT (admin/gestor veem tudo; corretor vê apenas suas), INSERT/UPDATE/DELETE (service_role)

---

## Funções Helper (SECURITY DEFINER)

```sql
current_imobiliaria_id()      -- Retorna imobiliaria_id do usuário autenticado
current_user_role()            -- Retorna role (admin/gestor/corretor) do usuário
current_usuario_id()           -- Retorna id (uuid interno) do usuário
```

Usadas em todas as políticas RLS. Executam como owner do banco (SECURITY DEFINER).

---

## Relações entre Tabelas

```
imobiliarias
  ├─ usuarios (1:N) — auth_user_id → auth.users, imobiliaria_id → imobiliarias
  ├─ equipes (1:N) — imobiliaria_id → imobiliarias
  ├─ corretores (1:N) — imobiliaria_id → imobiliarias, usuario_id → usuarios, equipe_id → equipes
  ├─ leads (1:N) — imobiliaria_id → imobiliarias, equipe_id → equipes, corretor_id → corretores
  ├─ historico_leads (1:N) — imobiliaria_id → imobiliarias, lead_id → leads, usuario_id → usuarios
  └─ vendas (1:N) — imobiliaria_id → imobiliarias, lead_id → leads, corretor_id → corretores
```

---

**Fim da Auditoria Estrutural**
