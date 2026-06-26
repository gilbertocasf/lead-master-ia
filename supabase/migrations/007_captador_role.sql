-- =====================================================================
-- Migration 007 — Perfil Captador (v2 — endurecida)
-- Lead Master IA
-- Data: 2026-06-26
-- =====================================================================
-- ATENÇÃO: Aplicar via SQL Editor do Supabase. NÃO via CLI.
--
-- PASSO 1 e PASSO 2 devem ser executados SEPARADOS.
-- ALTER TYPE ADD VALUE NÃO pode rodar dentro de BEGIN/COMMIT no PostgreSQL.
--
-- O QUE ESTA MIGRATION FAZ:
--   ✔ Adiciona 'captador' ao enum usuario_role (Passo 1)
--   ✔ Coluna leads.captador_id + index (Passo 2)
--   ✔ RLS SELECT para captador em leads, corretores e vendas (Passo 2)
--   ✔ RPC criar_e_distribuir_lead v3:
--       - valida captador_id (existe, pertence à imobiliária, ativo, role=captador)
--       - SECURITY DEFINER com search_path fixado
--       - REVOKE ALL FROM PUBLIC + GRANT somente ao service_role
--
-- O QUE ESTA MIGRATION NÃO FAZ:
--   ✗ Não remove colunas nem policies existentes
--   ✗ Não altera dados existentes
--   ✗ Não aplica automaticamente — requer execução manual no Supabase SQL Editor
--
-- AÇÕES MANUAIS APÓS APLICAR:
--   1. Criar usuário captador no Supabase Authentication
--   2. Inserir em usuarios com role='captador'
--   3. Ver SQL de exemplo ao final deste arquivo
--
-- GRANTS — DECISÃO DOCUMENTADA:
--   A aplicação chama criar_e_distribuir_lead exclusivamente via admin client
--   (SUPABASE_SERVICE_ROLE_KEY). O role service_role é superusuário no Supabase
--   e mantém EXECUTE independentemente de GRANT explícito.
--   Por isso: REVOKE ALL FROM PUBLIC é seguro — remove acesso direto de qualquer
--   usuário authenticated ou anon, sem afetar o service_role que o app usa.
--   Isso impede que um usuário autenticado chame a RPC diretamente via PostgREST,
--   bypassando o enforcement de role que a API Route (/api/leads) faz.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- PASSO 1 — Execute este bloco SOZINHO, fora de transação
-- ─────────────────────────────────────────────────────────────────────
ALTER TYPE usuario_role ADD VALUE IF NOT EXISTS 'captador';


-- ─────────────────────────────────────────────────────────────────────
-- PASSO 2 — Execute este bloco separadamente (pode ser em transação)
-- ─────────────────────────────────────────────────────────────────────
BEGIN;

-- 2.1 — Coluna captador_id em leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS captador_id UUID
    REFERENCES usuarios(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL;

COMMENT ON COLUMN leads.captador_id
  IS 'Usuário captador que trouxe o lead. NULL se cadastrado por admin/gestor/webhook.';

CREATE INDEX IF NOT EXISTS idx_leads_captador_id ON leads (captador_id);

-- 2.2 — RLS: captador vê apenas seus próprios leads
DROP POLICY IF EXISTS "leads_select_captador" ON leads;
CREATE POLICY "leads_select_captador"
  ON leads
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'captador'
    AND captador_id = current_usuario_id()
  );

-- 2.3 — RLS: captador pode ver corretores da imobiliária (para exibir quem atende)
DROP POLICY IF EXISTS "corretores_select_captador" ON corretores;
CREATE POLICY "corretores_select_captador"
  ON corretores
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'captador'
  );

-- 2.4 — RLS: captador vê vendas apenas dos seus leads captados
DROP POLICY IF EXISTS "vendas_select_captador" ON vendas;
CREATE POLICY "vendas_select_captador"
  ON vendas
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'captador'
    AND lead_id IN (
      SELECT id FROM leads
      WHERE captador_id = current_usuario_id()
        AND imobiliaria_id = current_imobiliaria_id()
    )
  );

-- 2.5 — RPC v3: aceita captador_id com validação interna
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
  v_corretor_manual UUID;
  v_captador_id     UUID;
  v_corretor_nome   TEXT;
  v_dist_em         TIMESTAMPTZ;
  v_dup_id          UUID;
  v_dup_nome        TEXT;
  v_dup_em          TIMESTAMPTZ;
  v_atribuicao_tipo TEXT;
BEGIN
  -- Extrair campos do payload
  v_imob_id         := (p->>'imobiliaria_id')::UUID;
  v_nome            := p->>'nome';
  v_telefone        := p->>'telefone';
  v_tel_norm        := p->>'telefone_normalizado';
  v_origem          := p->>'origem';
  v_interesse       := NULLIF(TRIM(COALESCE(p->>'interesse',   '')), '');
  v_faixa_valor     := NULLIF(TRIM(COALESCE(p->>'faixa_valor', '')), '');
  v_observacoes     := NULLIF(TRIM(COALESCE(p->>'observacoes', '')), '');
  v_criado_por      := COALESCE(NULLIF(p->>'criado_por', ''), 'formulario');
  v_equipe_id       := NULLIF(TRIM(COALESCE(p->>'equipe_id',   '')), '')::UUID;
  v_corretor_manual := NULLIF(TRIM(COALESCE(p->>'corretor_id', '')), '')::UUID;
  v_captador_id     := NULLIF(TRIM(COALESCE(p->>'captador_id', '')), '')::UUID;

  -- Passo 1: Validar captador_id quando fornecido.
  --   Garante que quem está registrado como captador existe, pertence a esta
  --   imobiliária, está ativo e tem role = 'captador'.
  --   Mesmo que a API já bloqueie captador_id inválido, a validação aqui é
  --   uma segunda linha de defesa para chamadas diretas à RPC (ex.: webhooks).
  IF v_captador_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM usuarios
      WHERE id             = v_captador_id
        AND imobiliaria_id = v_imob_id
        AND role           = 'captador'
        AND ativo          = true
    ) THEN
      RAISE EXCEPTION 'captador_invalido';
    END IF;
  END IF;

  -- Passo 2: Advisory lock por telefone (evita race condition na deduplicação)
  PERFORM pg_advisory_xact_lock(hashtext(v_tel_norm || v_imob_id::TEXT));

  -- Passo 3: Deduplicação — mesmo telefone nas últimas 24h
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

  -- Passo 4: Validar ou resolver equipe_id
  IF v_equipe_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM equipes
      WHERE id = v_equipe_id AND imobiliaria_id = v_imob_id
    ) THEN
      RAISE EXCEPTION 'equipe_nao_pertence_imobiliaria';
    END IF;
  ELSE
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

  -- Passo 5: INSERT lead (inclui captador_id se fornecido e validado)
  INSERT INTO leads (
    nome, telefone, telefone_normalizado, origem,
    interesse, faixa_valor, observacoes,
    equipe_id, imobiliaria_id, status, captador_id
  )
  VALUES (
    v_nome, v_telefone, v_tel_norm, v_origem::lead_origem,
    v_interesse, v_faixa_valor, v_observacoes,
    v_equipe_id, v_imob_id, 'novo', v_captador_id
  )
  RETURNING id INTO v_lead_id;

  -- Passo 6: Histórico — lead_criado
  INSERT INTO historico_leads (lead_id, imobiliaria_id, tipo_evento, criado_por, dados)
  VALUES (
    v_lead_id, v_imob_id,
    'lead_criado', v_criado_por,
    jsonb_build_object(
      'nome',         v_nome,
      'telefone',     v_telefone,
      'origem',       v_origem,
      'equipe_id',    v_equipe_id,
      'captador_id',  v_captador_id
    )
  );

  -- Passo 7: Resolver corretor (Cenário A vs Cenário B/C)
  IF v_corretor_manual IS NOT NULL THEN
    -- Cenário A: corretor manual (admin ou gestor com captador conhecido)
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
    -- Cenário B/C: distribuição automática por round-robin
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

  -- Passo 8: Distribuir (ou colocar na fila)
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
  IS 'v3: aceita captador_id (validado internamente); REVOKE/GRANT restrito a service_role; chamada exclusivamente via admin client.';

-- 2.6 — Grants da função
--
-- DECISÃO: REVOKE ALL FROM PUBLIC + GRANT somente ao service_role.
--
-- Motivo: a aplicação chama esta RPC apenas via admin client (service_role),
-- nunca via cliente autenticado. REVOKE ALL FROM PUBLIC impede que usuários
-- autenticados chamem a função diretamente pelo PostgREST (/rest/v1/rpc/...),
-- bypassando o enforcement de role que a API Route (/api/leads) realiza.
-- O service_role é superusuário no Supabase e mantém EXECUTE mesmo após
-- REVOKE FROM PUBLIC, mas o GRANT explícito documenta a intenção.
--
-- Para reverter no futuro (ex.: formulário público sem backend):
--   GRANT EXECUTE ON FUNCTION criar_e_distribuir_lead(JSONB) TO authenticated;
--   (e adicionar validação de tenant dentro da função)
REVOKE ALL ON FUNCTION criar_e_distribuir_lead(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION criar_e_distribuir_lead(JSONB) TO service_role;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────
-- SQL DE EXEMPLO: Criar usuário captador teste (após aplicar migration)
-- ─────────────────────────────────────────────────────────────────────
-- 1. Criar o usuário no Supabase Authentication (Dashboard → Authentication → Add user)
--    Email: captador@teste.local
--    Senha: (definir no dashboard)
--    Copiar o UUID gerado (auth_user_id).
--
-- 2. Inserir em usuarios:
--
-- INSERT INTO usuarios (auth_user_id, imobiliaria_id, nome, email, role, ativo)
-- VALUES (
--   '<UUID_DO_AUTH_USER>',
--   (SELECT id FROM imobiliarias LIMIT 1),
--   'Captador Teste',
--   'captador@teste.local',
--   'captador',
--   true
-- );
--
-- 3. Verificar que a policy filtra corretamente (rodar como o usuário captador):
--    SELECT * FROM leads;
--    -- Deve retornar apenas leads onde captador_id = id do usuário autenticado
