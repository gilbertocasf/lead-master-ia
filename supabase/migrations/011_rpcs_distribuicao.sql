-- =====================================================================
-- Migration 011 — RPCs de distribuição (v4 da criação + fila + manual + plantão)
-- Lead Master IA
-- Data: 2026-10-15
-- =====================================================================
-- ATENÇÃO: Aplicar via SQL Editor do Supabase. NÃO via CLI.
-- Ordem: 009 → 010 → 011 (ver docs/setup/aplicar-migrations-009-011.md).
-- Depende da 010 (colunas novas de leads, 'lead_reentrada' no CHECK do
-- histórico e a função normalizar_telefone_br).
-- O arquivo inteiro roda em uma única transação (BEGIN ... COMMIT).
--
-- O QUE ESTA MIGRATION FAZ:
--   ✔ criar_e_distribuir_lead(p) v4 — mesma assinatura e mesmo retorno da v3
--     para 'criado' e 'duplicata'; aceita os campos da Meta; devolve
--     'ja_processado' quando o meta_leadgen_id já virou lead; registra
--     'lead_reentrada' no lead existente quando o telefone se repete em 24 h
--   ✔ distribuir_fila_equipe(p)    — entrega leads parados na fila da equipe
--   ✔ atribuir_lead_manual(p)      — gestor/admin escolhe o corretor do lead
--   ✔ definir_plantao_corretor(p)  — liga/desliga plantão; ao ligar, distribui a fila
--   ✔ Todas: SECURITY DEFINER, search_path fixo, EXECUTE só para service_role
--
-- REGRA COMUM DE ESCOLHA DO CORRETOR:
--   Antes de escolher, trava a equipe com
--     pg_advisory_xact_lock(hashtext('equipe:' || equipe_id))
--   para que duas distribuições simultâneas na mesma equipe aconteçam uma
--   depois da outra (sem dois leads para o mesmo corretor "ao mesmo tempo").
--   Depois: corretor da equipe, da imobiliária, ativo e em plantão, ordenado por
--     COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC, ordem_plantao ASC
--   LIMIT 1 FOR UPDATE (sem SKIP LOCKED: se a linha estiver ocupada, espera).
--   O horário gravado usa clock_timestamp() (hora real), não now() (início da
--   transação): na fila, vários leads são entregues na mesma transação e cada
--   um precisa de um horário diferente para o rodízio continuar justo.
--
-- ORDEM DOS LOCKS (evita deadlock):
--   telefone/leadgen → equipe → linha do lead → linha do corretor.
--   definir_plantao_corretor trava a equipe ANTES de atualizar o corretor.
--
-- O QUE ESTA MIGRATION NÃO FAZ:
--   ✗ Não altera tabelas, colunas, policies nem dados existentes
--   ✗ Não muda alterar_status_lead
--
-- IDEMPOTÊNCIA:
--   Segura para reaplicar. CREATE OR REPLACE FUNCTION + REVOKE/GRANT.
-- =====================================================================


BEGIN;


-- =====================================================================
-- 0. PRÉ-REQUISITO: migration 010 aplicada
-- =====================================================================
-- Funções plpgsql não conferem tabelas/colunas ao serem criadas; sem esta
-- checagem, aplicar a 011 antes da 010 "funcionaria" e só quebraria na
-- primeira chamada. Aqui a 011 inteira é cancelada com mensagem clara.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'meta_leadgen_id'
  ) OR to_regprocedure('public.normalizar_telefone_br(text)') IS NULL THEN
    RAISE EXCEPTION 'Aplique a migration 010_estrutura_meta_leads.sql antes da 011.';
  END IF;
END;
$$;


-- =====================================================================
-- 1. criar_e_distribuir_lead(p) — v4
-- =====================================================================
-- Entrada (todas as chaves da v3 continuam iguais):
--   imobiliaria_id (obrigatório), nome, telefone, telefone_normalizado,
--   origem ('Instagram'|'Facebook'|'Outro'), interesse, faixa_valor,
--   observacoes, criado_por ('formulario' padrão | 'webhook' | 'sistema' | 'usuario'),
--   equipe_id?, corretor_id?, captador_id?
-- Chaves novas (opcionais):
--   email, canal ('manual'|'meta_lead_ads'), plataforma ('facebook'|'instagram'),
--   meta_leadgen_id, meta_page_id, meta_form_id, meta_ad_id, meta_adset_id,
--   meta_campaign_id, meta_ad_nome, meta_campanha_nome, meta_criado_em,
--   respostas_formulario (jsonb), consentimentos (jsonb)
--
-- Retorno:
--   { status:'criado', distribuido:true|false, motivo, lead:{id, nome, equipe_id,
--     corretor_id, corretor_nome, distribuido_em, atribuicao_tipo?, canal} }
--   { status:'duplicata', lead_existente:{id, nome, created_at, corretor_id} }
--   { status:'ja_processado', lead_id }
-- Erros (RAISE, iguais à v3 + novos): captador_invalido,
--   equipe_nao_pertence_imobiliaria, sem_equipe_disponivel,
--   corretor_invalido_ou_fora_da_equipe, imobiliaria_obrigatoria,
--   canal_invalido, criado_por_invalido.
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
  v_dup_corretor    UUID;
  v_atribuicao_tipo TEXT;
  -- campos novos (v4)
  v_email           TEXT;
  v_canal           TEXT;
  v_plataforma      TEXT;
  v_leadgen_id      TEXT;
  v_page_id         TEXT;
  v_form_id         TEXT;
  v_ad_id           TEXT;
  v_adset_id        TEXT;
  v_campaign_id     TEXT;
  v_ad_nome         TEXT;
  v_campanha_nome   TEXT;
  v_meta_criado_em  TIMESTAMPTZ;
  v_respostas       JSONB;
  v_consentimentos  JSONB;
  v_existente_id    UUID;
BEGIN
  -- -------------------------------------------------------------------
  -- Passo 0: extrair e limpar o payload
  -- -------------------------------------------------------------------
  v_imob_id := NULLIF(BTRIM(COALESCE(p->>'imobiliaria_id', '')), '')::UUID;
  IF v_imob_id IS NULL THEN
    RAISE EXCEPTION 'imobiliaria_obrigatoria';
  END IF;

  -- Nome: o app sempre envia; formulários da Meta podem vir sem nome.
  v_nome            := COALESCE(NULLIF(BTRIM(COALESCE(p->>'nome', '')), ''), 'Lead sem nome');
  v_telefone        := NULLIF(BTRIM(COALESCE(p->>'telefone', '')), '');
  v_origem          := p->>'origem';
  v_interesse       := NULLIF(TRIM(COALESCE(p->>'interesse',   '')), '');
  v_faixa_valor     := NULLIF(TRIM(COALESCE(p->>'faixa_valor', '')), '');
  v_observacoes     := NULLIF(TRIM(COALESCE(p->>'observacoes', '')), '');
  v_criado_por      := COALESCE(NULLIF(p->>'criado_por', ''), 'formulario');
  v_equipe_id       := NULLIF(TRIM(COALESCE(p->>'equipe_id',   '')), '')::UUID;
  v_corretor_manual := NULLIF(TRIM(COALESCE(p->>'corretor_id', '')), '')::UUID;
  v_captador_id     := NULLIF(TRIM(COALESCE(p->>'captador_id', '')), '')::UUID;

  IF v_criado_por NOT IN ('sistema', 'formulario', 'webhook', 'usuario') THEN
    RAISE EXCEPTION 'criado_por_invalido';
  END IF;

  -- Telefone normalizado: calculado AQUI com a mesma regra de lib/telefone.ts,
  -- para que a deduplicação não dependa da versão do app que chamou.
  -- Se não vier telefone, usa o telefone_normalizado enviado (compatível v3).
  v_tel_norm := COALESCE(
    NULLIF(normalizar_telefone_br(v_telefone), ''),
    NULLIF(BTRIM(COALESCE(p->>'telefone_normalizado', '')), '')
  );

  v_email         := NULLIF(BTRIM(COALESCE(p->>'email', '')), '');
  v_leadgen_id    := NULLIF(BTRIM(COALESCE(p->>'meta_leadgen_id', '')), '');
  v_page_id       := NULLIF(BTRIM(COALESCE(p->>'meta_page_id', '')), '');
  v_form_id       := NULLIF(BTRIM(COALESCE(p->>'meta_form_id', '')), '');
  v_ad_id         := NULLIF(BTRIM(COALESCE(p->>'meta_ad_id', '')), '');
  v_adset_id      := NULLIF(BTRIM(COALESCE(p->>'meta_adset_id', '')), '');
  v_campaign_id   := NULLIF(BTRIM(COALESCE(p->>'meta_campaign_id', '')), '');
  v_ad_nome       := NULLIF(BTRIM(COALESCE(p->>'meta_ad_nome', '')), '');
  v_campanha_nome := NULLIF(BTRIM(COALESCE(p->>'meta_campanha_nome', '')), '');

  -- Canal: padrão 'manual'; 'meta_lead_ads' quando vier meta_leadgen_id.
  v_canal := LOWER(NULLIF(BTRIM(COALESCE(p->>'canal', '')), ''));
  IF v_canal IS NULL THEN
    v_canal := CASE WHEN v_leadgen_id IS NOT NULL THEN 'meta_lead_ads' ELSE 'manual' END;
  END IF;
  IF v_canal NOT IN ('manual', 'meta_lead_ads') THEN
    RAISE EXCEPTION 'canal_invalido';
  END IF;

  -- Plataforma: aceita também os códigos curtos da Meta ('fb', 'ig').
  -- Valor desconhecido vira NULL (não bloqueia a entrada do lead).
  v_plataforma := CASE LOWER(NULLIF(BTRIM(COALESCE(p->>'plataforma', '')), ''))
    WHEN 'facebook'  THEN 'facebook'
    WHEN 'fb'        THEN 'facebook'
    WHEN 'instagram' THEN 'instagram'
    WHEN 'ig'        THEN 'instagram'
    ELSE NULL
  END;

  -- Data da Meta: formato inválido vira NULL (não bloqueia a entrada do lead).
  BEGIN
    v_meta_criado_em := NULLIF(BTRIM(COALESCE(p->>'meta_criado_em', '')), '')::TIMESTAMPTZ;
  EXCEPTION WHEN data_exception THEN
    v_meta_criado_em := NULL;
  END;

  -- JSON: só objeto ou lista; qualquer outra coisa (inclusive null) vira NULL.
  v_respostas := CASE
    WHEN jsonb_typeof(p->'respostas_formulario') IN ('object', 'array')
      THEN p->'respostas_formulario'
    ELSE NULL
  END;
  v_consentimentos := CASE
    WHEN jsonb_typeof(p->'consentimentos') IN ('object', 'array')
      THEN p->'consentimentos'
    ELSE NULL
  END;

  -- -------------------------------------------------------------------
  -- Passo 1: validar captador_id (igual à v3)
  -- -------------------------------------------------------------------
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

  -- -------------------------------------------------------------------
  -- Passo 2: lead da Meta já processado? (idempotência por leadgen_id)
  -- -------------------------------------------------------------------
  -- O lock serializa dois processamentos do mesmo leadgen_id (webhook e
  -- cron ao mesmo tempo): o segundo espera o primeiro terminar e então
  -- encontra o lead já criado.
  IF v_leadgen_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('leadgen:' || v_leadgen_id));

    SELECT id INTO v_existente_id
    FROM leads
    WHERE meta_leadgen_id = v_leadgen_id
    LIMIT 1;

    IF v_existente_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status',  'ja_processado',
        'lead_id', v_existente_id
      );
    END IF;
  END IF;

  -- -------------------------------------------------------------------
  -- Passo 3: lock por telefone + deduplicação de 24 h (igual à v3)
  -- -------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtext(v_tel_norm || v_imob_id::TEXT));

  SELECT id, nome, created_at, corretor_id
  INTO v_dup_id, v_dup_nome, v_dup_em, v_dup_corretor
  FROM leads
  WHERE telefone_normalizado = v_tel_norm
    AND imobiliaria_id       = v_imob_id
    AND created_at           > NOW() - INTERVAL '24 hours'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_dup_id IS NOT NULL THEN
    -- Registra a nova entrada no lead que já existe (sem nome/telefone).
    INSERT INTO historico_leads (
      lead_id, imobiliaria_id, tipo_evento, descricao, criado_por, dados
    )
    VALUES (
      v_dup_id, v_imob_id,
      'lead_reentrada',
      'O mesmo telefone entrou novamente em até 24 horas.',
      v_criado_por,
      jsonb_build_object(
        'canal',           v_canal,
        'origem',          v_origem,
        'meta_leadgen_id', v_leadgen_id,
        'meta_form_id',    v_form_id
      )
    );

    RETURN jsonb_build_object(
      'status',         'duplicata',
      'lead_existente', jsonb_build_object(
        'id',          v_dup_id,
        'nome',        v_dup_nome,
        'created_at',  v_dup_em,
        'corretor_id', v_dup_corretor
      )
    );
  END IF;

  -- -------------------------------------------------------------------
  -- Passo 4: validar ou resolver equipe_id
  -- -------------------------------------------------------------------
  IF v_equipe_id IS NOT NULL THEN
    -- v4: a equipe precisa ser da imobiliária E estar ativa.
    IF NOT EXISTS (
      SELECT 1 FROM equipes
      WHERE id             = v_equipe_id
        AND imobiliaria_id = v_imob_id
        AND ativo          = true
    ) THEN
      RAISE EXCEPTION 'equipe_nao_pertence_imobiliaria';
    END IF;
  ELSE
    -- Rodízio entre equipes ativas (igual à v3)
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

  -- -------------------------------------------------------------------
  -- Passo 5: INSERT do lead
  -- -------------------------------------------------------------------
  -- unique_violation em meta_leadgen_id (corrida rara que escapou do lock)
  -- → devolve ja_processado. Qualquer outra violação sobe como erro.
  BEGIN
    INSERT INTO leads (
      nome, telefone, telefone_normalizado, origem,
      interesse, faixa_valor, observacoes,
      equipe_id, imobiliaria_id, status, captador_id,
      email, canal, plataforma,
      meta_leadgen_id, meta_page_id, meta_form_id, meta_ad_id, meta_adset_id,
      meta_campaign_id, meta_ad_nome, meta_campanha_nome, meta_criado_em,
      respostas_formulario, consentimentos
    )
    VALUES (
      v_nome, v_telefone, v_tel_norm, v_origem::lead_origem,
      v_interesse, v_faixa_valor, v_observacoes,
      v_equipe_id, v_imob_id, 'novo', v_captador_id,
      v_email, v_canal, v_plataforma,
      v_leadgen_id, v_page_id, v_form_id, v_ad_id, v_adset_id,
      v_campaign_id, v_ad_nome, v_campanha_nome, v_meta_criado_em,
      v_respostas, v_consentimentos
    )
    RETURNING id INTO v_lead_id;
  EXCEPTION WHEN unique_violation THEN
    IF v_leadgen_id IS NOT NULL THEN
      SELECT id INTO v_existente_id
      FROM leads
      WHERE meta_leadgen_id = v_leadgen_id
      LIMIT 1;

      IF v_existente_id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'status',  'ja_processado',
          'lead_id', v_existente_id
        );
      END IF;
    END IF;
    RAISE;
  END;

  -- -------------------------------------------------------------------
  -- Passo 6: histórico — lead_criado (mesmos campos da v3 + canal/Meta)
  -- -------------------------------------------------------------------
  INSERT INTO historico_leads (lead_id, imobiliaria_id, tipo_evento, criado_por, dados)
  VALUES (
    v_lead_id, v_imob_id,
    'lead_criado', v_criado_por,
    jsonb_build_object(
      'nome',            v_nome,
      'telefone',        v_telefone,
      'origem',          v_origem,
      'equipe_id',       v_equipe_id,
      'captador_id',     v_captador_id,
      'canal',           v_canal,
      'plataforma',      v_plataforma,
      'meta_leadgen_id', v_leadgen_id,
      'meta_form_id',    v_form_id
    )
  );

  -- -------------------------------------------------------------------
  -- Passo 7: lock da equipe + escolha do corretor
  -- -------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtext('equipe:' || v_equipe_id::TEXT));

  IF v_corretor_manual IS NOT NULL THEN
    -- Cenário A: corretor escolhido (admin ou gestor com captador conhecido)
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
    -- Cenário B/C: rodízio entre corretores em plantão (sem SKIP LOCKED)
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
    FOR UPDATE;
  END IF;

  -- -------------------------------------------------------------------
  -- Passo 8: distribuir (ou deixar na fila) — igual à v3
  -- -------------------------------------------------------------------
  IF v_corretor_id IS NOT NULL THEN
    v_dist_em := clock_timestamp();

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
        'atribuicao_tipo', v_atribuicao_tipo,
        'canal',           v_canal
      )
    );

  ELSE
    UPDATE equipes
    SET ultimo_lead_recebido_em = clock_timestamp()
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
        'distribuido_em', NULL,
        'canal',          v_canal
      )
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION criar_e_distribuir_lead(JSONB)
  IS 'v4: cria lead (manual ou Meta), deduplica por telefone (24 h, registra lead_reentrada) e por meta_leadgen_id (ja_processado), roteia equipe e distribui com lock de equipe. Somente service_role.';

REVOKE ALL ON FUNCTION criar_e_distribuir_lead(JSONB)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION criar_e_distribuir_lead(JSONB) TO service_role;


-- =====================================================================
-- 2. distribuir_fila_equipe(p)
-- =====================================================================
-- Entrada: { imobiliaria_id, equipe_id, usuario_id?, limite? (padrão 50, máx. 500) }
-- Entrega, por ordem de chegada, os leads da equipe que estão sem corretor
-- (corretor_id IS NULL) e não estão fechados/perdidos, até acabar a fila,
-- acabar o limite ou não haver corretor em plantão.
-- Retorno:
--   { status:'ok', distribuidos, restantes, atribuicoes:[{lead_id, corretor_id, corretor_nome}] }
--   { status:'equipe_invalida' }   (equipe inexistente, de outra imobiliária ou inativa)
CREATE OR REPLACE FUNCTION distribuir_fila_equipe(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_imob_id       UUID;
  v_equipe_id     UUID;
  v_usuario_id    UUID;
  v_limite        INTEGER;
  v_criado_por    TEXT;
  v_lead_id       UUID;
  v_corretor_id   UUID;
  v_corretor_nome TEXT;
  v_agora         TIMESTAMPTZ;
  v_distribuidos  INTEGER := 0;
  v_restantes     INTEGER := 0;
  v_atribuicoes   JSONB   := '[]'::JSONB;
BEGIN
  v_imob_id    := NULLIF(BTRIM(COALESCE(p->>'imobiliaria_id', '')), '')::UUID;
  v_equipe_id  := NULLIF(BTRIM(COALESCE(p->>'equipe_id', '')), '')::UUID;
  v_usuario_id := NULLIF(BTRIM(COALESCE(p->>'usuario_id', '')), '')::UUID;

  BEGIN
    v_limite := NULLIF(BTRIM(COALESCE(p->>'limite', '')), '')::INTEGER;
  EXCEPTION WHEN data_exception THEN
    v_limite := NULL;
  END;
  IF v_limite IS NULL OR v_limite < 1 THEN
    v_limite := 50;
  ELSIF v_limite > 500 THEN
    v_limite := 500;
  END IF;

  -- Equipe precisa existir, ser da imobiliária e estar ativa.
  IF v_imob_id IS NULL OR v_equipe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM equipes
    WHERE id             = v_equipe_id
      AND imobiliaria_id = v_imob_id
      AND ativo          = true
  ) THEN
    RETURN jsonb_build_object('status', 'equipe_invalida');
  END IF;

  -- usuario_id só é gravado no histórico se for da mesma imobiliária.
  IF v_usuario_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = v_usuario_id AND imobiliaria_id = v_imob_id
  ) THEN
    v_usuario_id := NULL;
  END IF;
  v_criado_por := CASE WHEN v_usuario_id IS NOT NULL THEN 'usuario' ELSE 'sistema' END;

  -- Uma distribuição por vez nesta equipe.
  PERFORM pg_advisory_xact_lock(hashtext('equipe:' || v_equipe_id::TEXT));

  LOOP
    EXIT WHEN v_distribuidos >= v_limite;

    -- Próximo lead da fila (mais antigo primeiro)
    v_lead_id := NULL;
    SELECT id INTO v_lead_id
    FROM leads
    WHERE equipe_id      = v_equipe_id
      AND imobiliaria_id = v_imob_id
      AND corretor_id IS NULL
      AND status NOT IN ('fechado', 'perdido')
    ORDER BY created_at ASC, id ASC
    LIMIT 1
    FOR UPDATE;

    EXIT WHEN v_lead_id IS NULL;

    -- Próximo corretor do rodízio (regra comum)
    v_corretor_id   := NULL;
    v_corretor_nome := NULL;
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
    FOR UPDATE;

    EXIT WHEN v_corretor_id IS NULL;

    v_agora := clock_timestamp();

    UPDATE leads
    SET corretor_id    = v_corretor_id,
        distribuido_em = v_agora
    WHERE id = v_lead_id;

    UPDATE corretores
    SET ultimo_lead_recebido_em = v_agora
    WHERE id = v_corretor_id;

    UPDATE equipes
    SET ultimo_lead_recebido_em = v_agora
    WHERE id = v_equipe_id;

    INSERT INTO historico_leads (
      lead_id, imobiliaria_id, tipo_evento, criado_por, usuario_id, dados
    )
    VALUES (
      v_lead_id, v_imob_id,
      'lead_distribuido', v_criado_por, v_usuario_id,
      jsonb_build_object(
        'corretor_id',     v_corretor_id,
        'corretor_nome',   v_corretor_nome,
        'distribuido_em',  v_agora,
        'atribuicao_tipo', 'fila',
        'motivo',          'fila'
      )
    );

    v_atribuicoes := v_atribuicoes || jsonb_build_array(
      jsonb_build_object(
        'lead_id',       v_lead_id,
        'corretor_id',   v_corretor_id,
        'corretor_nome', v_corretor_nome
      )
    );
    v_distribuidos := v_distribuidos + 1;
  END LOOP;

  SELECT count(*) INTO v_restantes
  FROM leads
  WHERE equipe_id      = v_equipe_id
    AND imobiliaria_id = v_imob_id
    AND corretor_id IS NULL
    AND status NOT IN ('fechado', 'perdido');

  RETURN jsonb_build_object(
    'status',       'ok',
    'distribuidos', v_distribuidos,
    'restantes',    v_restantes,
    'atribuicoes',  v_atribuicoes
  );
END;
$$;

COMMENT ON FUNCTION distribuir_fila_equipe(JSONB)
  IS 'Distribui os leads parados na fila de uma equipe (sem corretor, não fechados/perdidos) aos corretores em plantão, por ordem de chegada. Somente service_role.';

REVOKE ALL ON FUNCTION distribuir_fila_equipe(JSONB)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION distribuir_fila_equipe(JSONB) TO service_role;


-- =====================================================================
-- 3. atribuir_lead_manual(p)
-- =====================================================================
-- Entrada: { imobiliaria_id, lead_id, corretor_id, usuario_id }
-- O corretor precisa estar ativo e ser da MESMA equipe do lead (não precisa
-- estar em plantão: é uma escolha manual).
-- Retorno:
--   { status:'ok', tipo:'distribuido'|'redistribuido', corretor_id, corretor_nome }
--     (+ sem_alteracao:true quando o lead já era desse corretor; nada é gravado)
--   { status:'lead_nao_encontrado' } | { status:'corretor_invalido' }
CREATE OR REPLACE FUNCTION atribuir_lead_manual(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_imob_id           UUID;
  v_lead_id           UUID;
  v_corretor_id       UUID;
  v_usuario_id        UUID;
  v_equipe_id         UUID;
  v_corretor_anterior UUID;
  v_corretor_nome     TEXT;
  v_tipo              TEXT;
  v_agora             TIMESTAMPTZ;
BEGIN
  v_imob_id     := NULLIF(BTRIM(COALESCE(p->>'imobiliaria_id', '')), '')::UUID;
  v_lead_id     := NULLIF(BTRIM(COALESCE(p->>'lead_id', '')), '')::UUID;
  v_corretor_id := NULLIF(BTRIM(COALESCE(p->>'corretor_id', '')), '')::UUID;
  v_usuario_id  := NULLIF(BTRIM(COALESCE(p->>'usuario_id', '')), '')::UUID;

  IF v_imob_id IS NULL OR v_lead_id IS NULL THEN
    RETURN jsonb_build_object('status', 'lead_nao_encontrado');
  END IF;

  -- Descobre a equipe do lead (sem travar) para pegar o lock da equipe
  -- antes de travar linhas — mesma ordem de locks da fila.
  SELECT equipe_id INTO v_equipe_id
  FROM leads
  WHERE id = v_lead_id AND imobiliaria_id = v_imob_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'lead_nao_encontrado');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('equipe:' || v_equipe_id::TEXT));

  -- Agora trava o lead e relê os dados atuais.
  SELECT equipe_id, corretor_id
  INTO v_equipe_id, v_corretor_anterior
  FROM leads
  WHERE id = v_lead_id AND imobiliaria_id = v_imob_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'lead_nao_encontrado');
  END IF;

  IF v_corretor_id IS NULL THEN
    RETURN jsonb_build_object('status', 'corretor_invalido');
  END IF;

  SELECT nome INTO v_corretor_nome
  FROM corretores
  WHERE id             = v_corretor_id
    AND equipe_id      = v_equipe_id
    AND imobiliaria_id = v_imob_id
    AND ativo          = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'corretor_invalido');
  END IF;

  -- Já é desse corretor: nada a fazer (não grava histórico repetido).
  IF v_corretor_anterior = v_corretor_id THEN
    RETURN jsonb_build_object(
      'status',        'ok',
      'tipo',          'redistribuido',
      'corretor_id',   v_corretor_id,
      'corretor_nome', v_corretor_nome,
      'sem_alteracao', true
    );
  END IF;

  -- usuario_id só é gravado se for da mesma imobiliária.
  IF v_usuario_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = v_usuario_id AND imobiliaria_id = v_imob_id
  ) THEN
    v_usuario_id := NULL;
  END IF;

  v_tipo  := CASE WHEN v_corretor_anterior IS NULL THEN 'distribuido' ELSE 'redistribuido' END;
  v_agora := clock_timestamp();

  UPDATE leads
  SET corretor_id    = v_corretor_id,
      distribuido_em = v_agora
  WHERE id = v_lead_id;

  UPDATE corretores
  SET ultimo_lead_recebido_em = v_agora
  WHERE id = v_corretor_id;

  INSERT INTO historico_leads (
    lead_id, imobiliaria_id, tipo_evento, criado_por, usuario_id, dados
  )
  VALUES (
    v_lead_id, v_imob_id,
    CASE WHEN v_tipo = 'distribuido' THEN 'lead_distribuido' ELSE 'lead_redistribuido' END,
    'usuario', v_usuario_id,
    jsonb_build_object(
      'corretor_id',          v_corretor_id,
      'corretor_nome',        v_corretor_nome,
      'corretor_anterior_id', v_corretor_anterior,
      'distribuido_em',       v_agora,
      'atribuicao_tipo',      'manual'
    )
  );

  RETURN jsonb_build_object(
    'status',        'ok',
    'tipo',          v_tipo,
    'corretor_id',   v_corretor_id,
    'corretor_nome', v_corretor_nome
  );
END;
$$;

COMMENT ON FUNCTION atribuir_lead_manual(JSONB)
  IS 'Atribui (lead na fila) ou redistribui (lead já com corretor) um lead a um corretor ativo da mesma equipe, com histórico. Somente service_role.';

REVOKE ALL ON FUNCTION atribuir_lead_manual(JSONB)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION atribuir_lead_manual(JSONB) TO service_role;


-- =====================================================================
-- 4. definir_plantao_corretor(p)
-- =====================================================================
-- Entrada: { imobiliaria_id, corretor_id, em_plantao:boolean, usuario_id? }
-- Só corretor ativo da imobiliária. Ao LIGAR o plantão, distribui a fila da
-- equipe do corretor na mesma transação.
-- Retorno:
--   { status:'ok', corretor_id, equipe_id, em_plantao,
--     fila: <retorno de distribuir_fila_equipe> | null }
--   { status:'corretor_nao_encontrado' }
-- Erro (RAISE): em_plantao_obrigatorio (chave ausente ou não booleana).
CREATE OR REPLACE FUNCTION definir_plantao_corretor(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_imob_id     UUID;
  v_corretor_id UUID;
  v_usuario_id  UUID;
  v_em_plantao  BOOLEAN;
  v_equipe_id   UUID;
  v_fila        JSONB := NULL;
BEGIN
  v_imob_id     := NULLIF(BTRIM(COALESCE(p->>'imobiliaria_id', '')), '')::UUID;
  v_corretor_id := NULLIF(BTRIM(COALESCE(p->>'corretor_id', '')), '')::UUID;
  v_usuario_id  := NULLIF(BTRIM(COALESCE(p->>'usuario_id', '')), '')::UUID;

  IF jsonb_typeof(p->'em_plantao') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'em_plantao_obrigatorio';
  END IF;
  v_em_plantao := (p->>'em_plantao')::BOOLEAN;

  IF v_imob_id IS NULL OR v_corretor_id IS NULL THEN
    RETURN jsonb_build_object('status', 'corretor_nao_encontrado');
  END IF;

  -- Descobre a equipe (sem travar) e pega o lock da equipe ANTES de
  -- atualizar o corretor: evita deadlock com uma criação de lead que já
  -- segura o lock da equipe e espera a linha deste corretor.
  SELECT equipe_id INTO v_equipe_id
  FROM corretores
  WHERE id = v_corretor_id AND imobiliaria_id = v_imob_id AND ativo = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'corretor_nao_encontrado');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('equipe:' || v_equipe_id::TEXT));

  UPDATE corretores
  SET em_plantao = v_em_plantao
  WHERE id = v_corretor_id AND imobiliaria_id = v_imob_id AND ativo = true
  RETURNING equipe_id INTO v_equipe_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'corretor_nao_encontrado');
  END IF;

  IF v_em_plantao THEN
    -- O lock da equipe é reentrante na mesma transação.
    v_fila := distribuir_fila_equipe(jsonb_build_object(
      'imobiliaria_id', v_imob_id,
      'equipe_id',      v_equipe_id,
      'usuario_id',     v_usuario_id
    ));
  END IF;

  RETURN jsonb_build_object(
    'status',      'ok',
    'corretor_id', v_corretor_id,
    'equipe_id',   v_equipe_id,
    'em_plantao',  v_em_plantao,
    'fila',        v_fila
  );
END;
$$;

COMMENT ON FUNCTION definir_plantao_corretor(JSONB)
  IS 'Liga/desliga o plantão de um corretor ativo; ao ligar, distribui a fila da equipe dele. Somente service_role.';

REVOKE ALL ON FUNCTION definir_plantao_corretor(JSONB)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION definir_plantao_corretor(JSONB) TO service_role;


COMMIT;


-- =====================================================================
-- VERIFICAÇÃO RÁPIDA (rodar depois, separadamente)
-- =====================================================================
-- Esperado: 4 linhas, anon = false, authenticated = false, service_role = true
-- SELECT f, has_function_privilege('anon', f, 'execute')          AS anon,
--           has_function_privilege('authenticated', f, 'execute') AS authenticated,
--           has_function_privilege('service_role', f, 'execute')  AS service_role
-- FROM unnest(ARRAY[
--   'criar_e_distribuir_lead(jsonb)', 'distribuir_fila_equipe(jsonb)',
--   'atribuir_lead_manual(jsonb)',    'definir_plantao_corretor(jsonb)'
-- ]) AS f;
-- =====================================================================
