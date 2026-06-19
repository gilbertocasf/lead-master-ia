# Fase 5-R.1 — Auditoria de Segurança: Migration 002
**Data:** 2026-06-19  
**Arquivo auditado:** `supabase/migrations/002_security_rls_multitenancy.sql`  
**Status:** VULNERABILIDADES ENCONTRADAS — migration corrigida em `002_security_rls_multitenancy.sql`  
**Metodologia:** Revisão linha a linha de policies, funções SECURITY DEFINER, FKs e ON DELETE. Simulação de cada ator (admin, gestor, corretor, anon).

---

## Resumo executivo

A migration 002 estava **correta na arquitetura** mas continha falhas de implementação que, se aplicada sem correção, permitiriam escalamento de privilégio e corrupção de dados entre tenants. Nenhum dado estaria exposto para atores externos (anon protegida corretamente), mas usuários internos poderiam abusar de suas permissões.

As vulnerabilidades foram corrigidas antes de qualquer execução. A migration no repositório já está na versão corrigida.

---

## Vulnerabilidades encontradas e corrigidas

### CRÍTICO-1 — Escalamento de privilégio via `usuarios_update_own`

**Linha original:** 412–418

**Código vulnerável:**
```sql
CREATE POLICY "usuarios_update_own" ON usuarios
  FOR UPDATE TO authenticated
  USING  (auth_user_id = auth.uid())
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()
    AND auth_user_id = auth.uid()
  );
```

**Ataque:**
Um corretor poderia executar diretamente no banco (via Supabase client):
```sql
UPDATE usuarios SET role = 'admin' WHERE auth_user_id = auth.uid();
```
O `WITH CHECK` valida apenas que `imobiliaria_id` e `auth_user_id` não mudam — mas não restringe a coluna `role`. Resultado: corretor vira admin instantaneamente, ganha acesso a todos os leads e vendas da imobiliária.

O mesmo ataque funciona com `ativo = false` (auto-desativação) ou `ativo = true` para um usuário já desativado reativar o próprio acesso.

**Correção aplicada:** Policy `usuarios_update_own` **removida completamente**.

Justificativa: no MVP, corretores não precisam editar o próprio perfil. Quando essa funcionalidade for necessária, a atualização deve passar por uma API route (service_role) que valide explicitamente quais campos são permitidos (`nome`, `email`) e bloqueie mudanças em `role`, `ativo`, `imobiliaria_id` e `auth_user_id`.

---

### CRÍTICO-2 — WITH CHECK incompleto permite mover dados entre imobiliárias

**Linhas originais:** 438–441 (`equipes_update`), 461–464 (`corretores_update`), 497–500 (`leads_update_admin_gestor`)

**Código vulnerável (exemplo em equipes):**
```sql
CREATE POLICY "equipes_update" ON equipes
  FOR UPDATE TO authenticated
  USING  (imobiliaria_id = current_imobiliaria_id())
  WITH CHECK (current_user_role() IN ('admin', 'gestor'));
  -- ↑ falta: AND imobiliaria_id = current_imobiliaria_id()
```

**Ataque:**
Um gestor/admin malicioso poderia executar:
```sql
UPDATE equipes
  SET imobiliaria_id = '<uuid-de-outra-imobiliaria>'
  WHERE id = '<uuid-da-equipe-atual>';
```

O `USING` garante que só pode acessar equipes da **própria** imobiliária.  
O `WITH CHECK` **não** garante que o **novo valor** de `imobiliaria_id` seja da própria imobiliária.

Resultado: a equipe (e cascata: corretores, leads, historico, vendas) passa a "pertencer" ao tenant alheio. Vazamento de dados entre imobiliárias e corrupção estrutural do banco.

O mesmo ataque se aplica a `corretores_update` e `leads_update_admin_gestor` — qualquer registro poderia ser "exportado" para outro tenant via UPDATE.

**Correção aplicada:** `imobiliaria_id = current_imobiliaria_id()` adicionado ao `WITH CHECK` das três policies.

```sql
-- Versão corrigida (equipes_update):
CREATE POLICY "equipes_update" ON equipes
  FOR UPDATE TO authenticated
  USING  (imobiliaria_id = current_imobiliaria_id())
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() IN ('admin', 'gestor')
  );
```

---

### ALTO-3 — SECURITY DEFINER sem SET search_path

**Linhas originais:** 98–117 (as três funções helper)

**Código vulnerável:**
```sql
CREATE OR REPLACE FUNCTION current_imobiliaria_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT imobiliaria_id FROM usuarios ...
$$;
-- falta: SET search_path = public, pg_catalog
```

**Vulnerabilidade:**
Funções `SECURITY DEFINER` executam com os privilégios do dono (geralmente `postgres`) mas herdam o `search_path` do chamador. Um usuário que controla seu search_path poderia criar um schema com uma tabela `usuarios` falsa que a função leria em vez da tabela real — retornando um `imobiliaria_id` arbitrário.

Na prática, no Supabase o risco é mitigado pelo fato de que usuários não têm permissão para criar schemas arbitrários por padrão. Mas a boa prática é sempre fixar o search_path em funções SECURITY DEFINER, e o próprio Supabase recomenda isso explicitamente em sua documentação de RLS.

**Correção aplicada:** `SET search_path = public, pg_catalog` adicionado às três funções.

```sql
CREATE OR REPLACE FUNCTION current_imobiliaria_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT imobiliaria_id FROM usuarios
  WHERE auth_user_id = auth.uid() AND ativo = true
  LIMIT 1
$$;
```

---

## Simulação completa por ator

### anon (sem sessão autenticada)

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| imobiliarias | 0 rows ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |
| usuarios | 0 rows ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |
| equipes | 0 rows ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |
| corretores | 0 rows ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |
| leads | 0 rows ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |
| historico_leads | 0 rows ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |
| vendas | 0 rows ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |

Mecanismo: `auth.uid()` retorna NULL → `current_imobiliaria_id()` retorna NULL → `imobiliaria_id = NULL` é sempre false → zero rows.

---

### corretor autenticado com usuario_id preenchido

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| imobiliarias | apenas a própria ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |
| usuarios | todos da imobiliária ⚠️¹ | bloqueado ✅ | **bloqueado** ✅² | bloqueado ✅ |
| equipes | todas da imobiliária ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |
| corretores | todos da imobiliária ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |
| leads | apenas os próprios ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |
| historico_leads | histórico dos próprios leads ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |
| vendas | apenas as próprias ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |

¹ Corretor vê nomes e emails de admins/gestores. Aceitável para MVP — membros de uma equipe se conhecem.  
² Policy `usuarios_update_own` foi removida. UPDATE em usuarios: bloqueado para todos os roles authenticated.

---

### gestor autenticado (após correções)

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| imobiliarias | apenas a própria ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |
| usuarios | todos da imobiliária ✅ | bloqueado ✅ | bloqueado ✅ | bloqueado ✅ |
| equipes | todas da imobiliária ✅ | somente na própria ✅ | somente na própria, imobiliaria_id imutável ✅ | bloqueado ✅ |
| corretores | todos da imobiliária ✅ | somente na própria ✅ | somente na própria, imobiliaria_id imutável ✅ | bloqueado ✅ |
| leads | todos da imobiliária ✅ | bloqueado (service_role) ✅ | somente na própria, imobiliaria_id imutável ✅ | bloqueado ✅ |
| historico_leads | todos da imobiliária ✅ | bloqueado (service_role) ✅ | bloqueado ✅ | bloqueado ✅ |
| vendas | todas da imobiliária ✅ | bloqueado (service_role) ✅ | bloqueado ✅ | bloqueado ✅ |

---

### admin autenticado

Idêntico ao gestor nas políticas atuais. A diferença de role está registrada no campo `usuarios.role` para uso futuro em V1, mas as policies do MVP tratam admin = gestor em todos os casos. Decisão deliberada: documentada abaixo.

---

### Tentativa de vazamento entre tenants (após correções)

Cenário: Gestor da Imobiliária A tenta acessar dados da Imobiliária B.

```sql
-- Tentativa 1: SELECT direto de outra imobiliária
SELECT * FROM leads WHERE imobiliaria_id = '<uuid-imobiliaria-B>';
-- Resultado: 0 rows (USING filtra para imobiliaria_id = current_imobiliaria_id()) ✅

-- Tentativa 2: UPDATE movendo lead para outra imobiliária
UPDATE leads SET imobiliaria_id = '<uuid-imobiliaria-B>' WHERE id = '<uuid-do-lead>';
-- Resultado: bloqueado (WITH CHECK rejeita imobiliaria_id ≠ current_imobiliaria_id()) ✅

-- Tentativa 3: INSERT com imobiliaria_id de outro tenant
INSERT INTO equipes (imobiliaria_id, nome, gerente) 
VALUES ('<uuid-imobiliaria-B>', 'Equipe X', 'Fake');
-- Resultado: bloqueado (WITH CHECK garante imobiliaria_id = current_imobiliaria_id()) ✅
```

---

## Comportamentos aceitos como deliberados (não são bugs)

### Admin = Gestor nas policies (BAIXO)

Nenhuma policy diferencia admin de gestor. Ambos têm as mesmas permissões. Decisão deliberada para MVP: a coluna `role` existe no banco e será usada em V1 para implementar limites adicionais ao gestor (ex: gestor não pode deletar imobiliária, gestor não pode criar outros admins).

### Corretor sem usuario_id vê zero dados (BAIXO)

Se `corretores.usuario_id IS NULL`, as policies de SELECT para corretor retornam zero rows. Esse corretor não tem conta de login — correto que não veja dados. Gestor acessa os dados dele pelo painel admin.

### Cascade delete de imobiliária (BAIXO)

`DELETE FROM imobiliarias` em cascade apaga TODAS as equipes, corretores, leads, histórico e vendas. Operação catastrófica e irreversível. Só possível via service_role. Mitigação: nunca implementar rota DELETE /api/imobiliarias. Exigir confirmação dupla em qualquer interface admin futura.

### Performance das policies de corretor (BAIXO)

As policies `historico_select_corretor` e outras para corretor usam subqueries aninhadas. Para MVP com dados de desenvolvimento, performance é aceitável. Em produção com volume, os índices `idx_corretores_usuario`, `idx_leads_corretor` e `idx_historico_lead` mitigan o custo. Revisitar em V1 com dados reais.

---

## ON DELETE — análise de cada FK

| FK | Comportamento | Avaliação |
|----|--------------|-----------|
| `usuarios.auth_user_id → auth.users CASCADE` | Deletar auth user → deleta perfil | ✅ Correto |
| `usuarios.imobiliaria_id → imobiliarias CASCADE` | Deletar imobiliária → deleta usuários | ✅ Correto |
| `equipes.imobiliaria_id → imobiliarias CASCADE` | Deletar imobiliária → deleta equipes | ✅ Correto |
| `corretores.equipe_id → equipes RESTRICT` | Não pode deletar equipe com corretores | ✅ Correto |
| `corretores.imobiliaria_id → imobiliarias CASCADE` | Deletar imobiliária → deleta corretores | ✅ Correto |
| `corretores.usuario_id → usuarios SET NULL` | Deletar usuário → corretor fica sem login | ✅ Correto (corretor permanece no histórico) |
| `leads.equipe_id → equipes RESTRICT` | Não pode deletar equipe com leads | ✅ Correto |
| `leads.corretor_id → corretores SET NULL` | Deletar corretor → lead fica sem corretor | ✅ Correto (lead permanece, va para re-distribuição) |
| `leads.imobiliaria_id → imobiliarias CASCADE` | Deletar imobiliária → deleta leads | ✅ Correto |
| `vendas.corretor_id → corretores RESTRICT` | Não pode deletar corretor com vendas | ✅ Correto (preserva histórico financeiro) |
| `vendas.lead_id → leads SET NULL` | Deletar lead → venda mantém VGV | ✅ Correto |
| `vendas.imobiliaria_id → imobiliarias CASCADE` | Deletar imobiliária → deleta vendas | ✅ Correto |
| `historico_leads.lead_id → leads CASCADE` | Deletar lead → histórico vai junto | ✅ Correto (histórico é de um lead) |
| `historico_leads.imobiliaria_id → imobiliarias CASCADE` | Deletar imobiliária → deleta histórico | ✅ Correto |
| `historico_leads.usuario_id → usuarios SET NULL` | Deletar usuário → evento mantém mas sem autor | ✅ Correto (auditoria não perde o evento) |

**Nenhuma FK tem comportamento incorreto.**

---

## Verificações manuais recomendadas após aplicar

### Teste 1 — anon vê zero rows
```sql
-- Executar com role = anon no SQL Editor
SELECT COUNT(*) FROM leads;     -- esperado: 0
SELECT COUNT(*) FROM usuarios;  -- esperado: 0
SELECT COUNT(*) FROM equipes;   -- esperado: 0
```

### Teste 2 — usuário sem registro em usuarios vê zero rows
```sql
-- Criar auth user sem inserir em usuarios
-- Executar com JWT desse usuário:
SELECT current_imobiliaria_id();  -- esperado: NULL
SELECT COUNT(*) FROM leads;       -- esperado: 0
```

### Teste 3 — WITH CHECK bloqueia mudança de imobiliaria_id
```sql
-- Como gestor autenticado:
UPDATE equipes
  SET imobiliaria_id = '00000000-0000-0000-0000-000000000099'  -- uuid inexistente
  WHERE id = (SELECT id FROM equipes LIMIT 1);
-- Esperado: ERROR ou 0 rows affected (WITH CHECK rejeita)
```

### Teste 4 — Corretor não vê leads de outro corretor
```sql
-- Como corretor A: verificar que não consegue ver leads do corretor B
SELECT COUNT(*) FROM leads WHERE corretor_id != current_usuario_id();
-- Esperado: 0 (policy filtra apenas os próprios)
```

### Teste 5 — Corretor não pode alterar próprio role
```sql
-- Como corretor:
UPDATE usuarios SET role = 'admin' WHERE auth_user_id = auth.uid();
-- Esperado: ERROR new row violates row-level security policy
-- (policy usuarios_update_own foi removida — UPDATE bloqueado)
```

---

## Status final

| Vulnerabilidade | Severidade | Status |
|----------------|-----------|--------|
| Role escalation via usuarios_update_own | CRÍTICO | ✅ Corrigida (policy removida) |
| WITH CHECK sem imobiliaria_id em updates | CRÍTICO | ✅ Corrigida (WITH CHECK atualizado) |
| SECURITY DEFINER sem search_path | ALTO | ✅ Corrigida (SET search_path adicionado) |
| Corretor vê emails de admin/gestor | MÉDIO | ⚠️ Aceito para MVP, revisar em V1 |
| Admin = Gestor nas policies | BAIXO | ⚠️ Decisão deliberada para MVP |
| DELETE imobiliaria catastrófico | BAIXO | ⚠️ Mitigação no app code, não no banco |

**A migration 002 está aprovada para revisão final após estas correções.**

---

*Auditoria concluída antes da aplicação. Nenhum dado foi alterado no Supabase.*
