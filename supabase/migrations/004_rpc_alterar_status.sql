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
