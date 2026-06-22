# Fase 8 — Validação Pré-Aprovação

**Data:** 2026-06-22  
**Status:** Validado — sem divergências — aguardando aplicação da Migration 004

---

## 1. Enum de status — resultado da auditoria

Valor correto: **`visita`** (não `visita_agendada`).  
Consistente em todos os arquivos auditados. Nenhuma correção necessária.

| Arquivo | Valor encontrado | Consistente? |
|---------|-----------------|--------------|
| `supabase/schema.sql` | `'visita'` no enum `lead_status` | ✓ |
| `supabase/migrations/002_security_rls_multitenancy.sql` | Não redefine o enum — herda do schema | ✓ |
| `supabase/migrations/004_rpc_alterar_status.sql` | Declara `lead_status` como tipo — herda do banco | ✓ |
| `lib/types.ts` | `"visita"` | ✓ |
| `components/pipeline/StatusDropdown.tsx` | Usa `PIPELINE_ORDER` de `lib/types.ts` → `"visita"` | ✓ |
| `app/(app)/pipeline/page.tsx` | `visita: "#D4A636"` no `COLUMN_ACCENT` | ✓ |

---

## 2. Conteúdo completo da Migration 004

```sql
-- =====================================================================
-- Migration 004 — RPC: alterar_status_lead
-- Lead Master IA
-- =====================================================================
-- Cria a stored procedure que encapsula a alteração de status de um lead
-- + registro em historico_leads em uma única transação atômica.
--
-- POR QUE RPC:
--   O Supabase JS client não suporta BEGIN/COMMIT explícito.
--   Esta função garante que UPDATE leads e INSERT historico_leads
--   ocorrem juntos — qualquer falha reverte os dois.
--
-- RETORNO:
--   { status: 'ok', lead_id, status_anterior, status_novo }
--   { status: 'lead_nao_encontrado' }
--   { status: 'status_igual' }
--
-- NÃO ALTERA:
--   Nenhuma tabela. Nenhuma coluna. Apenas cria a função.
--
-- IDEMPOTÊNCIA:
--   CREATE OR REPLACE — seguro para reaplicar.
-- =====================================================================

CREATE OR REPLACE FUNCTION alterar_status_lead(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_lead_id         UUID;
  v_imob_id         UUID;
  v_usuario_id      UUID;
  v_status_novo     TEXT;
  v_status_anterior lead_status;
BEGIN
  v_lead_id     := (p->>'lead_id')::UUID;
  v_imob_id     := (p->>'imobiliaria_id')::UUID;
  v_usuario_id  := NULLIF(TRIM(COALESCE(p->>'usuario_id', '')), '')::UUID;
  v_status_novo := p->>'status_novo';

  -- Buscar status atual e travar a linha para evitar race condition
  SELECT status INTO v_status_anterior
  FROM leads
  WHERE id = v_lead_id AND imobiliaria_id = v_imob_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'lead_nao_encontrado');
  END IF;

  IF v_status_anterior::TEXT = v_status_novo THEN
    RETURN jsonb_build_object('status', 'status_igual');
  END IF;

  -- Atualizar status do lead
  UPDATE leads
  SET status = v_status_novo::lead_status
  WHERE id = v_lead_id;

  -- Registrar evento no histórico
  INSERT INTO historico_leads (
    lead_id, imobiliaria_id, tipo_evento, criado_por, usuario_id, dados
  )
  VALUES (
    v_lead_id, v_imob_id,
    'status_alterado', 'usuario', v_usuario_id,
    jsonb_build_object(
      'status_anterior', v_status_anterior,
      'status_novo',     v_status_novo
    )
  );

  RETURN jsonb_build_object(
    'status',          'ok',
    'lead_id',         v_lead_id,
    'status_anterior', v_status_anterior,
    'status_novo',     v_status_novo
  );
END;
$$;

COMMENT ON FUNCTION alterar_status_lead(JSONB)
  IS 'Altera status de um lead e registra evento status_alterado em historico_leads. Tudo em uma única transação.';
```

---

## 3. Arquivos alterados nesta fase

Nenhum arquivo foi alterado durante a validação.

---

## 4. Build

```
npm run build → ✓ Compiled successfully — 11/11 páginas geradas
```

Rota `/api/leads/[id]/status` presente e compilada.

---

## 5. Instruções para aplicar a Migration 004

**No Supabase Dashboard:**

1. Acesse **SQL Editor**
2. Clique em **New query**
3. Cole o conteúdo do arquivo `supabase/migrations/004_rpc_alterar_status.sql`
4. Clique em **Run**
5. Resultado esperado: `Success. No rows returned`

**Verificar que a função foi criada:**

```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'alterar_status_lead';
```

Resultado esperado: 1 linha com `alterar_status_lead | FUNCTION`.

---

## 6. Como testar no app após aplicar a migration

1. Acesse `/pipeline` no app
2. Troque o status de um lead no dropdown
3. A página atualiza — card some da coluna atual e aparece na nova

**Verificar no banco:**

```sql
-- Confirmar que leads.status foi atualizado
SELECT id, nome, status FROM leads ORDER BY created_at DESC LIMIT 5;

-- Confirmar que historico_leads registrou o evento
SELECT lead_id, tipo_evento, dados, created_at
FROM historico_leads
WHERE tipo_evento = 'status_alterado'
ORDER BY created_at DESC
LIMIT 5;
```

---

## 7. Critério de conclusão

- [ ] Migration 004 aplicada no Supabase
- [ ] Dropdown muda `leads.status` no banco
- [ ] `historico_leads` registra `status_alterado` com `status_anterior` e `status_novo`
- [ ] Card migra de coluna após `router.refresh()`
- [ ] Corretor não consegue alterar lead de outro (HTTP 403)
- [ ] `npm run build` ✓

claude --dangerously-skip-permissions
