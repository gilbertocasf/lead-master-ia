# Diagnóstico: Migration 004 — função alterar_status_lead

## 1. O arquivo existe localmente?

Sim. O arquivo está em:

```
supabase/migrations/004_rpc_alterar_status.sql
```

Aparece como `??` (untracked) no git — foi criado localmente mas **nunca commitado nem aplicado no banco**.

---

## 2. Foi aplicada no banco?

**Não.** A query abaixo confirmou que a função não existe:

```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'alterar_status_lead';
-- Resultado: No rows returned
```

---

## 3. SQL para executar agora no Supabase

Cole no **SQL Editor do Supabase** (Dashboard → SQL Editor → New query):

```sql
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

  UPDATE leads
  SET status = v_status_novo::lead_status
  WHERE id = v_lead_id;

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

## 4. Validar após aplicar

```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'alterar_status_lead';
```

Deve retornar uma linha: `alterar_status_lead | FUNCTION`.

---

## 5. Dependência importante

A função usa o tipo `lead_status` (enum do PostgreSQL). Se esse enum não existir no banco, o `CREATE OR REPLACE` vai falhar. Nesse caso, execute antes:

```sql
-- Verificar se o enum existe
SELECT typname FROM pg_type WHERE typname = 'lead_status';

-- Se não existir, criar:
CREATE TYPE lead_status AS ENUM (
  'novo',
  'em_contato',
  'visita',
  'proposta',
  'fechado',
  'perdido'
);
```
