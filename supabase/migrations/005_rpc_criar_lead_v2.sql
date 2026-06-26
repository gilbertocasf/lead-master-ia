-- =====================================================================
-- Migration 005 — RPC: criar_e_distribuir_lead v2
-- Lead Master IA
-- =====================================================================
-- Atualiza a stored procedure para suportar dois cenários de atribuição:
--
--   Cenário A — Captador conhecido (payload inclui corretor_id):
--     O gerente informa qual corretor captou o lead fora do sistema.
--     O sistema atribui diretamente esse corretor, sem round-robin.
--     Não exige em_plantao = true — corretor ativo é suficiente.
--
--   Cenário B — Distribuição automática (payload sem corretor_id):
--     Comportamento existente: round-robin com fairness por
--     ultimo_lead_recebido_em, restrito a em_plantao = true.
--
--   Cenário C — Lead externo / webhook:
--     Mesmo que Cenário B, mas equipe_id também pode ser omitido
--     (rodízio entre equipes ativas pelo menor recência).
--
-- MUDANÇAS EM RELAÇÃO À VERSÃO ANTERIOR (003):
--   + Extrai corretor_id do payload JSONB
--   + Se corretor_id fornecido → valida pertencimento à equipe/imobiliária/ativo
--   + Registra atribuicao_tipo em historico_leads.dados JSONB
--   + Sem mudança de schema (CREATE OR REPLACE apenas)
--
-- IDEMPOTÊNCIA:
--   CREATE OR REPLACE — seguro para reaplicar sem risco.
--
-- NÃO ALTERA:
--   Nenhuma tabela. Nenhuma coluna. Apenas substitui a função.
-- =====================================================================

CREATE OR REPLACE FUNCTION criar_e_distribuir_lead(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_imob_id         UUID;
  v_nome            TEXT;
  v_telefone        TEXT;
  v_tel_norm        TEXT;
  v_origem          TEXT;
  v_interesse       TEXT;
  v_faixa_valor     TEXT;
  v_observacoes     TEXT;
  v_criado_por      TEXT;
  v_equipe_id       UUID;
  v_lead_id         UUID;
  v_corretor_id     UUID;
  v_corretor_manual UUID;    -- corretor_id vindo do payload (Cenário A)
  v_corretor_nome   TEXT;
  v_dist_em         TIMESTAMPTZ;
  v_dup_id          UUID;
  v_dup_nome        TEXT;
  v_dup_em          TIMESTAMPTZ;
  v_atribuicao_tipo TEXT;
BEGIN
  -- Extrair campos do payload
  v_imob_id       := (p->>'imobiliaria_id')::UUID;
  v_nome          := p->>'nome';
  v_telefone      := p->>'telefone';
  v_tel_norm      := p->>'telefone_normalizado';
  v_origem        := p->>'origem';
  v_interesse     := NULLIF(TRIM(COALESCE(p->>'interesse',   '')), '');
  v_faixa_valor   := NULLIF(TRIM(COALESCE(p->>'faixa_valor', '')), '');
  v_observacoes   := NULLIF(TRIM(COALESCE(p->>'observacoes', '')), '');
  v_criado_por    := COALESCE(NULLIF(p->>'criado_por', ''), 'formulario');
  v_equipe_id     := NULLIF(TRIM(COALESCE(p->>'equipe_id',   '')), '')::UUID;
  v_corretor_manual := NULLIF(TRIM(COALESCE(p->>'corretor_id', '')), '')::UUID;

  -- Passo 1: Advisory lock por telefone — serializa chamadas com mesmo número
  PERFORM pg_advisory_xact_lock(hashtext(v_tel_norm || v_imob_id::TEXT));

  -- Passo 2: Deduplicação — mesmo telefone nas últimas 24h
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
    IF NOT EXISTS (
      SELECT 1 FROM equipes
      WHERE id = v_equipe_id AND imobiliaria_id = v_imob_id
    ) THEN
      RAISE EXCEPTION 'equipe_nao_pertence_imobiliaria';
    END IF;
  ELSE
    -- Webhook sem equipe_id → rodízio pela equipe com menor recência
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

  -- Passo 4: INSERT lead (status = novo, sem corretor ainda)
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

  -- Passo 6: Resolver corretor (Cenário A vs Cenário B/C)
  IF v_corretor_manual IS NOT NULL THEN
    -- ── Cenário A: captador conhecido ─────────────────────────────────
    -- Valida e bloqueia o corretor escolhido pelo gerente.
    -- Não exige em_plantao — apenas ativo. O corretor pode estar de folga
    -- mas ainda é o responsável pela captação desse lead específico.
    SELECT id, nome
    INTO v_corretor_id, v_corretor_nome
    FROM corretores
    WHERE id             = v_corretor_manual
      AND equipe_id      = v_equipe_id
      AND imobiliaria_id = v_imob_id
      AND ativo          = true
    FOR UPDATE;

    IF v_corretor_id IS NULL THEN
      RAISE EXCEPTION 'corretor_invalido_ou_fora_da_equipe';
    END IF;

    v_atribuicao_tipo := 'captador_conhecido';

  ELSE
    -- ── Cenário B/C: distribuição automática por round-robin ──────────
    -- Seleciona o corretor em plantão com menor recência.
    -- FOR UPDATE SKIP LOCKED garante que dois leads simultâneos não
    -- peguem o mesmo corretor.
    v_atribuicao_tipo := 'rodizio';

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
  END IF;

  -- Passo 7: Distribuir (ou fila)
  IF v_corretor_id IS NOT NULL THEN
    v_dist_em := NOW();

    UPDATE leads
    SET corretor_id    = v_corretor_id,
        distribuido_em = v_dist_em
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
        'corretor_id',     v_corretor_id,
        'corretor_nome',   v_corretor_nome,
        'distribuido_em',  v_dist_em,
        'atribuicao_tipo', v_atribuicao_tipo
      )
    );

    RETURN jsonb_build_object(
      'status',      'criado',
      'distribuido', true,
      'motivo',      NULL,
      'lead', jsonb_build_object(
        'id',              v_lead_id,
        'nome',            v_nome,
        'equipe_id',       v_equipe_id,
        'corretor_id',     v_corretor_id,
        'corretor_nome',   v_corretor_nome,
        'distribuido_em',  v_dist_em,
        'atribuicao_tipo', v_atribuicao_tipo
      )
    );

  ELSE
    -- Sem corretor em plantão — lead fica na fila aguardando distribuição manual
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
  IS 'v2: suporta corretor_id no payload (Cenário A: captador conhecido) além do round-robin automático (Cenário B/C). Tudo em uma única transação atômica.';
