-- =====================================================================
-- Migration 003 — RPC: criar_e_distribuir_lead
-- Lead Master IA
-- =====================================================================
-- Cria a stored procedure que encapsula toda a lógica de criação de
-- lead + deduplicação + roteamento + distribuição em uma única transação.
--
-- POR QUE RPC:
--   O Supabase JS client não suporta BEGIN/COMMIT explícito.
--   Esta função roda em uma transação implícita — qualquer falha reverte
--   todos os passos (dedup, INSERT leads, INSERT historico, UPDATE corretor).
--
-- RACE CONDITIONS:
--   pg_advisory_xact_lock serializa requisições com mesmo telefone.
--   FOR UPDATE SKIP LOCKED garante que dois leads simultâneos não peguem
--   o mesmo corretor.
--
-- IDEMPOTÊNCIA:
--   CREATE OR REPLACE — seguro para reaplicar.
--
-- NÃO ALTERA:
--   Nenhuma tabela. Nenhuma coluna. Apenas cria a função.
-- =====================================================================

CREATE OR REPLACE FUNCTION criar_e_distribuir_lead(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_imob_id       UUID;
  v_nome          TEXT;
  v_telefone      TEXT;
  v_tel_norm      TEXT;
  v_origem        TEXT;
  v_interesse     TEXT;
  v_faixa_valor   TEXT;
  v_observacoes   TEXT;
  v_criado_por    TEXT;
  v_equipe_id     UUID;
  v_lead_id       UUID;
  v_corretor_id   UUID;
  v_corretor_nome TEXT;
  v_dist_em       TIMESTAMPTZ;
  v_dup_id        UUID;
  v_dup_nome      TEXT;
  v_dup_em        TIMESTAMPTZ;
BEGIN
  -- Extrair campos do payload
  v_imob_id     := (p->>'imobiliaria_id')::UUID;
  v_nome        := p->>'nome';
  v_telefone    := p->>'telefone';
  v_tel_norm    := p->>'telefone_normalizado';
  v_origem      := p->>'origem';
  v_interesse   := NULLIF(TRIM(COALESCE(p->>'interesse', '')), '');
  v_faixa_valor := NULLIF(TRIM(COALESCE(p->>'faixa_valor', '')), '');
  v_observacoes := NULLIF(TRIM(COALESCE(p->>'observacoes', '')), '');
  v_criado_por  := COALESCE(NULLIF(p->>'criado_por', ''), 'formulario');
  v_equipe_id   := NULLIF(TRIM(COALESCE(p->>'equipe_id', '')), '')::UUID;

  -- Passo 1: Advisory lock por telefone
  -- Serializa chamadas concorrentes com o mesmo número. A segunda requisição
  -- aguarda a primeira terminar antes de checar a deduplicação.
  PERFORM pg_advisory_xact_lock(hashtext(v_tel_norm || v_imob_id::TEXT));

  -- Passo 2: Deduplicação — mesmo telefone_normalizado nas últimas 24h
  SELECT id, nome, created_at
  INTO v_dup_id, v_dup_nome, v_dup_em
  FROM leads
  WHERE telefone_normalizado = v_tel_norm
    AND imobiliaria_id       = v_imob_id
    AND created_at           > NOW() - INTERVAL '24 hours'
  LIMIT 1;

  IF v_dup_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status',         'duplicata',
      'lead_existente', jsonb_build_object(
        'id',         v_dup_id,
        'nome',       v_dup_nome,
        'created_at', v_dup_em
      )
    );
  END IF;

  -- Passo 3: Validar ou resolver equipe_id
  IF v_equipe_id IS NOT NULL THEN
    -- Validar que a equipe fornecida pertence à imobiliária do usuário.
    -- Impede que um caller externo (webhook) aponte para equipe de outro tenant.
    IF NOT EXISTS (
      SELECT 1 FROM equipes
      WHERE id = v_equipe_id AND imobiliaria_id = v_imob_id
    ) THEN
      RAISE EXCEPTION 'equipe_nao_pertence_imobiliaria';
    END IF;
  ELSE
    -- Webhook sem equipe_id → rodízio pela equipe com menor recência.
    SELECT id INTO v_equipe_id
    FROM equipes
    WHERE imobiliaria_id = v_imob_id
      AND ativo = true
    ORDER BY COALESCE(ultimo_lead_recebido_em, '1970-01-01'::TIMESTAMPTZ) ASC
    LIMIT 1;

    IF v_equipe_id IS NULL THEN
      RAISE EXCEPTION 'sem_equipe_disponivel';
    END IF;
  END IF;

  -- Passo 4: INSERT lead
  INSERT INTO leads (
    nome, telefone, telefone_normalizado, origem,
    interesse, faixa_valor, observacoes,
    equipe_id, imobiliaria_id, status
  )
  VALUES (
    v_nome, v_telefone, v_tel_norm, v_origem::lead_origem,
    v_interesse, v_faixa_valor, v_observacoes,
    v_equipe_id, v_imob_id, 'novo'
  )
  RETURNING id INTO v_lead_id;

  -- Passo 5: Histórico — lead_criado
  INSERT INTO historico_leads (lead_id, imobiliaria_id, tipo_evento, criado_por, dados)
  VALUES (
    v_lead_id, v_imob_id,
    'lead_criado', v_criado_por,
    jsonb_build_object(
      'nome',      v_nome,
      'telefone',  v_telefone,
      'origem',    v_origem,
      'equipe_id', v_equipe_id
    )
  );

  -- Passo 6: Selecionar corretor de plantão (round-robin com fairness)
  -- FOR UPDATE SKIP LOCKED: dois leads simultâneos nunca pegam o mesmo corretor.
  SELECT id, nome
  INTO v_corretor_id, v_corretor_nome
  FROM corretores
  WHERE equipe_id      = v_equipe_id
    AND imobiliaria_id = v_imob_id
    AND em_plantao     = true
    AND ativo          = true
  ORDER BY COALESCE(ultimo_lead_recebido_em, '1970-01-01'::TIMESTAMPTZ) ASC,
           ordem_plantao ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_corretor_id IS NOT NULL THEN
    -- Passo 7a: Distribuição bem-sucedida
    v_dist_em := NOW();

    UPDATE leads
    SET corretor_id = v_corretor_id, distribuido_em = v_dist_em
    WHERE id = v_lead_id;

    UPDATE corretores
    SET ultimo_lead_recebido_em = v_dist_em
    WHERE id = v_corretor_id;

    UPDATE equipes
    SET ultimo_lead_recebido_em = v_dist_em
    WHERE id = v_equipe_id;

    INSERT INTO historico_leads (lead_id, imobiliaria_id, tipo_evento, criado_por, dados)
    VALUES (
      v_lead_id, v_imob_id,
      'lead_distribuido', 'sistema',
      jsonb_build_object(
        'corretor_id',   v_corretor_id,
        'corretor_nome', v_corretor_nome,
        'distribuido_em', v_dist_em
      )
    );

    RETURN jsonb_build_object(
      'status',       'criado',
      'distribuido',  true,
      'motivo',       NULL,
      'lead', jsonb_build_object(
        'id',             v_lead_id,
        'nome',           v_nome,
        'equipe_id',      v_equipe_id,
        'corretor_id',    v_corretor_id,
        'corretor_nome',  v_corretor_nome,
        'distribuido_em', v_dist_em
      )
    );

  ELSE
    -- Passo 7b: Sem corretor em plantão — lead fica na fila
    UPDATE equipes
    SET ultimo_lead_recebido_em = NOW()
    WHERE id = v_equipe_id;

    INSERT INTO historico_leads (lead_id, imobiliaria_id, tipo_evento, criado_por, dados)
    VALUES (
      v_lead_id, v_imob_id,
      'distribuicao_falhou', 'sistema',
      jsonb_build_object(
        'equipe_id', v_equipe_id,
        'motivo',    'sem_corretor_em_plantao'
      )
    );

    RETURN jsonb_build_object(
      'status',      'criado',
      'distribuido', false,
      'motivo',      'sem_corretor_em_plantao',
      'lead', jsonb_build_object(
        'id',             v_lead_id,
        'nome',           v_nome,
        'equipe_id',      v_equipe_id,
        'corretor_id',    NULL,
        'corretor_nome',  NULL,
        'distribuido_em', NULL
      )
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION criar_e_distribuir_lead(JSONB)
  IS 'Cria lead, verifica deduplicação por telefone (24h), resolve equipe, distribui para corretor de plantão. Tudo em uma única transação.';
