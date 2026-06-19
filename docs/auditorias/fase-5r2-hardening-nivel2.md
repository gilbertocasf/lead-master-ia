# Fase 5-R.2 — Hardening Nível 2: Ajustes Pré-Produção
**Data:** 2026-06-19  
**Arquivo ajustado:** `supabase/migrations/002_security_rls_multitenancy.sql`  
**Status:** PRONTA PARA REVISÃO FINAL — nenhuma execução realizada

---

## Alterações aplicadas

### 1. ON DELETE CASCADE → RESTRICT em todas as FKs de imobiliarias

**Tabelas afetadas:**
- `usuarios.imobiliaria_id`
- `equipes.imobiliaria_id` (via ALTER TABLE no bloco FK)
- `corretores.imobiliaria_id`
- `leads.imobiliaria_id`
- `vendas.imobiliaria_id`
- `historico_leads.imobiliaria_id`

**Por quê:** `ON DELETE CASCADE` na entidade raiz de tenant significa que um `DELETE FROM imobiliarias WHERE id = '...'` com service_role destrói **toda** a operação de uma imobiliária em cascata — irreversivelmente. Com `RESTRICT`, o banco bloqueia o DELETE enquanto existirem dados vinculados. A exclusão de um tenant exige remoção explícita e ordenada de todos os dados antes — operação impossível de fazer por acidente.

**O que não mudou:** `historico_leads.lead_id ON DELETE CASCADE` e `usuarios.auth_user_id ON DELETE CASCADE` — esses são comportamentos corretos (histórico sem lead não tem sentido; perfil sem auth user idem).

---

### 2. corretores_select: policy única → duas policies por role

**Antes:**
```sql
CREATE POLICY "corretores_select" ON corretores
  FOR SELECT TO authenticated
  USING (imobiliaria_id = current_imobiliaria_id());
-- corretor via este USING vê todos os corretores: nome, email, telefone de todos
```

**Depois:**
```sql
-- admin/gestor veem todos
CREATE POLICY "corretores_select_admin_gestor" ON corretores
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() IN ('admin', 'gestor')
  );

-- corretor vê apenas o próprio registro
CREATE POLICY "corretores_select_corretor" ON corretores
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'corretor'
    AND usuario_id = current_usuario_id()
  );
```

**Por quê:** um corretor não precisa saber o telefone pessoal ou e-mail dos colegas via query de banco. Dados de contato de colegas devem ser gerenciados pelo gestor/admin. Essa restrição também é relevante para LGPD (minimização de acesso a dados pessoais de terceiros).

---

### 3. usuarios sem UPDATE (confirmação)

Policy `usuarios_update_own` **não existe** na migration. Bloqueio verificado. UPDATE em `usuarios` é exclusivo do service_role. Perfis serão alterados por API route que valida quais campos são permitidos.

---

### 4. docs/skills/seguranca-lgpd-rls.md atualizado

Adicionado ao bloco "Nunca fazer":
- `ON DELETE CASCADE` em FK para entidade raiz de tenant
- Policy UPDATE sem `imobiliaria_id` no WITH CHECK
- Escrita direta do client em `leads`, `vendas`, `historico_leads`
- `SUPABASE_SERVICE_ROLE_KEY` com prefixo `NEXT_PUBLIC_`
- Função `SECURITY DEFINER` sem `SET search_path`

Adicionado ao bloco "Sempre fazer":
- `ON DELETE RESTRICT` em FKs para `imobiliarias(id)`
- `imobiliaria_id` no WITH CHECK de policies UPDATE (não só no USING)
- `SET search_path` em funções SECURITY DEFINER

Checklist atualizado com as novas regras.

---

## Riscos eliminados nesta fase

| Risco | Status |
|-------|--------|
| DELETE acidental destrói toda imobiliária | ✅ Eliminado — RESTRICT bloqueia |
| Corretor vê email/telefone de colegas | ✅ Eliminado — policy split por role |
| Role escalation via UPDATE próprio | ✅ Eliminado (fase 5-R.1) |
| Cross-tenant via UPDATE sem WITH CHECK | ✅ Eliminado (fase 5-R.1) |
| SECURITY DEFINER sem search_path | ✅ Eliminado (fase 5-R.1) |

---

## Riscos residuais documentados

| Risco | Severidade | Quando resolver |
|-------|-----------|----------------|
| App sem tela de login | ALTO | Antes de qualquer cliente real |
| Webhook sem autenticação (X-API-Key) | ALTO | V1 |
| Rate limiting ausente no webhook | MÉDIO | V1 |
| Corretor vê nomes/emails de todos os usuarios da imobiliária | MÉDIO | Aceitável MVP — membros se conhecem |
| Admin = Gestor nas policies | BAIXO | V1 — coluna `role` existe para uso futuro |
| Cascade delete de imobiliária ainda possível via service_role | BAIXO | Mitigação no app: não implementar rota DELETE |
| Logs de acesso (quem visualizou o quê) | BAIXO | V2 |
| Retenção automática de dados (LGPD §15) | BAIXO | V2 |

---

## Matriz final de acesso (pós-hardening)

| Tabela | anon | corretor | gestor | admin | service_role |
|--------|------|----------|--------|-------|-------------|
| imobiliarias | — | SELECT própria | SELECT própria | SELECT própria | tudo |
| usuarios | — | SELECT todos da imob. | SELECT todos | SELECT todos | tudo |
| equipes | — | SELECT todas | SELECT + INSERT + UPDATE | idem | tudo |
| corretores | — | SELECT **só o próprio** | SELECT todos + INSERT + UPDATE | idem | tudo |
| leads | — | SELECT **só os próprios** | SELECT todos + UPDATE | idem | tudo |
| historico_leads | — | SELECT **só dos próprios leads** | SELECT todos | idem | tudo |
| vendas | — | SELECT **só as próprias** | SELECT todas | idem | tudo |

(`—` = zero acesso, default deny)

---

## Queries de validação pós-aplicação

```sql
-- 1. RLS habilitado nas 7 tabelas (esperado: rowsecurity = true em todas)
SELECT tablename, rowsecurity
FROM pg_tables WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. Policies criadas (esperado: 16 policies no total)
SELECT tablename, policyname, cmd
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- 3. ON DELETE nas FKs de imobiliarias (esperado: RESTRICT em todas)
SELECT
  conname,
  confdeltype  -- 'r' = RESTRICT, 'c' = CASCADE, 'n' = SET NULL
FROM pg_constraint
WHERE confrelid = 'imobiliarias'::regclass
ORDER BY conname;

-- 4. anon vê zero rows
-- (executar com role = anon no SQL Editor)
SELECT COUNT(*) FROM leads;      -- esperado: 0
SELECT COUNT(*) FROM equipes;    -- esperado: 0
SELECT COUNT(*) FROM corretores; -- esperado: 0

-- 5. Funções helper com search_path fixo
SELECT
  routine_name,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE 'current_%';
-- verificar que cada definição contém SET search_path

-- 6. imobiliaria_id em todas as tabelas de dados (esperado: 5 tabelas)
SELECT table_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'imobiliaria_id'
ORDER BY table_name;

-- 7. Após criar usuário admin e inserir em usuarios:
-- Verificar que current_imobiliaria_id() retorna UUID correto
SELECT current_imobiliaria_id(), current_user_role();
```

---

*Migration pronta. Aguardando aprovação para execução no Supabase.*
