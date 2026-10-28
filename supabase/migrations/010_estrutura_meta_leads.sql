-- =====================================================================
-- Migration 010 — Estrutura para leads da Meta (Facebook/Instagram Lead Ads)
-- Lead Master IA
-- Data: 2026-10-15
-- =====================================================================
-- ATENÇÃO: Aplicar via SQL Editor do Supabase. NÃO via CLI.
-- Ordem: 009 → 010 → 011 (ver docs/setup/aplicar-migrations-009-011.md).
-- Aplique a 011 logo em seguida: esta migration reescreve
-- leads.telefone_normalizado no formato novo (com "55"), e a RPC v4 da 011
-- é a que calcula o telefone normalizado nesse mesmo formato.
-- O arquivo inteiro roda em uma única transação (BEGIN ... COMMIT).
--
-- O QUE ESTA MIGRATION FAZ:
--   ✔ Colunas novas (todas opcionais) em leads: email, canal, plataforma,
--     meta_* (ids e nomes de anúncio/campanha), respostas_formulario,
--     consentimentos; índice único parcial em meta_leadgen_id
--   ✔ CHECK de historico_leads.tipo_evento passa a aceitar 'lead_reentrada'
--     (preserva todos os valores já aceitos)
--   ✔ Tabelas integracoes_meta, meta_roteamento e meta_eventos, com RLS:
--     SELECT só para admin da própria imobiliária; escrita só via service_role
--   ✔ Função normalizar_telefone_br(text) — mesma regra de lib/telefone.ts
--   ✔ Recalcula leads.telefone_normalizado dos leads existentes com essa regra
--
-- O QUE ESTA MIGRATION NÃO FAZ:
--   ✗ Não apaga tabela, coluna nem linha
--   ✗ Não altera nome, telefone ou qualquer dado digitado do lead
--     (só a coluna derivada telefone_normalizado é recalculada)
--   ✗ Não guarda o token da Meta no banco (fica em META_ACCESS_TOKEN na Vercel)
--   ✗ Não altera policies existentes
--
-- IDEMPOTÊNCIA:
--   Segura para reaplicar. ADD COLUMN IF NOT EXISTS, CREATE TABLE/INDEX
--   IF NOT EXISTS, DROP CONSTRAINT/POLICY/TRIGGER IF EXISTS antes de recriar,
--   CREATE OR REPLACE FUNCTION. O UPDATE só toca linhas cujo valor muda.
-- =====================================================================


BEGIN;


-- =====================================================================
-- SEÇÃO A: COLUNAS NOVAS EM leads
-- =====================================================================
-- ADD COLUMN com DEFAULT constante não reescreve a tabela (PostgreSQL 11+).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email                TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS canal                TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS plataforma           TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_leadgen_id      TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_page_id         TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_form_id         TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_ad_id           TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_adset_id        TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_campaign_id     TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_ad_nome         TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_campanha_nome   TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS meta_criado_em       TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS respostas_formulario JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consentimentos       JSONB;

-- Valores permitidos (todos os leads existentes ficam com canal = 'manual'
-- pelo DEFAULT e plataforma = NULL, então os CHECKs passam).
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_canal_check;
ALTER TABLE leads ADD  CONSTRAINT leads_canal_check
  CHECK (canal IN ('manual', 'meta_lead_ads'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_plataforma_check;
ALTER TABLE leads ADD  CONSTRAINT leads_plataforma_check
  CHECK (plataforma IS NULL OR plataforma IN ('facebook', 'instagram'));

COMMENT ON COLUMN leads.email                IS 'E-mail do lead (opcional). Vem do formulário da Meta ou do cadastro manual.';
COMMENT ON COLUMN leads.canal                IS 'Por onde o lead entrou: manual (app/API) ou meta_lead_ads (formulário de anúncio da Meta).';
COMMENT ON COLUMN leads.plataforma           IS 'Para canal meta_lead_ads: facebook ou instagram. NULL nos demais.';
COMMENT ON COLUMN leads.meta_leadgen_id      IS 'ID do lead na Meta (leadgen_id). Único: garante que o mesmo lead da Meta não vira dois leads.';
COMMENT ON COLUMN leads.meta_page_id         IS 'ID da Página do Facebook que recebeu o lead.';
COMMENT ON COLUMN leads.meta_form_id         IS 'ID do formulário instantâneo da Meta.';
COMMENT ON COLUMN leads.meta_criado_em       IS 'Momento em que a Meta registrou o lead (created_time).';
COMMENT ON COLUMN leads.respostas_formulario IS 'Respostas do formulário da Meta que não viraram coluna própria.';
COMMENT ON COLUMN leads.consentimentos       IS 'Respostas a avisos/consentimentos personalizados do formulário da Meta.';

-- Um mesmo leadgen_id da Meta nunca gera dois leads.
-- Parcial: leads manuais (meta_leadgen_id NULL) ficam fora do índice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_meta_leadgen_id
  ON leads (meta_leadgen_id)
  WHERE meta_leadgen_id IS NOT NULL;


-- =====================================================================
-- SEÇÃO B: CHECK DE historico_leads.tipo_evento (+ lead_reentrada)
-- =====================================================================
-- O nome da constraint depende de qual migration criou a tabela:
--   001 → historico_leads_tipo_evento_check
--   002 → historico_tipo_evento_check
-- Removemos os dois nomes e, por segurança, qualquer outro CHECK desta
-- tabela que fale de tipo_evento. Depois recriamos com um nome fixo.
-- Todos os valores aceitos antes continuam aceitos.
ALTER TABLE historico_leads DROP CONSTRAINT IF EXISTS historico_tipo_evento_check;
ALTER TABLE historico_leads DROP CONSTRAINT IF EXISTS historico_leads_tipo_evento_check;

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.historico_leads'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo_evento%'
  LOOP
    EXECUTE format('ALTER TABLE public.historico_leads DROP CONSTRAINT %I', c.conname);
  END LOOP;
END;
$$;

ALTER TABLE historico_leads
  ADD CONSTRAINT historico_leads_tipo_evento_check
  CHECK (tipo_evento IN (
    'lead_criado',
    'lead_roteado',
    'lead_distribuido',
    'distribuicao_falhou',
    'status_alterado',
    'lead_redistribuido',
    'lead_reentrada'          -- novo: mesmo telefone voltou em até 24 h
  ));

COMMENT ON COLUMN historico_leads.tipo_evento
  IS 'Tipo do evento. Valores: lead_criado, lead_roteado, lead_distribuido, distribuicao_falhou, status_alterado, lead_redistribuido, lead_reentrada.';


-- =====================================================================
-- SEÇÃO C: TABELA integracoes_meta — Páginas do Facebook conectadas
-- =====================================================================
-- Uma Página pertence a uma única imobiliária (page_id único).
-- O token de acesso NÃO fica aqui: variável de ambiente META_ACCESS_TOKEN.
CREATE TABLE IF NOT EXISTS integracoes_meta (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id   UUID        NOT NULL
                                 REFERENCES imobiliarias(id) ON DELETE RESTRICT,
  page_id          TEXT        NOT NULL UNIQUE,
  page_nome        TEXT,
  ativo            BOOLEAN     NOT NULL DEFAULT true,
  ultimo_evento_em TIMESTAMPTZ,
  ultimo_erro      TEXT,
  ultimo_erro_em   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE integracoes_meta
  IS 'Páginas do Facebook ligadas a uma imobiliária. Resolve imobiliaria_id a partir do page_id do webhook. Sem tokens.';

CREATE INDEX IF NOT EXISTS idx_integracoes_meta_imobiliaria
  ON integracoes_meta (imobiliaria_id);


-- =====================================================================
-- SEÇÃO D: TABELA meta_roteamento — Página/formulário → equipe
-- =====================================================================
-- form_id NULL = regra padrão da Página (vale para formulários sem regra própria).
CREATE TABLE IF NOT EXISTS meta_roteamento (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id UUID        NOT NULL
                               REFERENCES imobiliarias(id) ON DELETE RESTRICT,
  page_id        TEXT        NOT NULL,
  form_id        TEXT,
  form_nome      TEXT,
  equipe_id      UUID        NOT NULL
                               REFERENCES equipes(id) ON DELETE RESTRICT,
  ativo          BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE meta_roteamento
  IS 'Para qual equipe vai o lead de cada Página/formulário da Meta. form_id NULL = regra padrão da Página.';

-- Uma única regra por (Página, formulário); a regra padrão (form_id NULL)
-- também é única por Página, graças ao COALESCE.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_roteamento_page_form
  ON meta_roteamento (page_id, COALESCE(form_id, ''));

CREATE INDEX IF NOT EXISTS idx_meta_roteamento_imobiliaria
  ON meta_roteamento (imobiliaria_id);

CREATE INDEX IF NOT EXISTS idx_meta_roteamento_equipe
  ON meta_roteamento (equipe_id);

-- updated_at automático em qualquer UPDATE
CREATE OR REPLACE FUNCTION meta_roteamento_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION meta_roteamento_set_updated_at()
  IS 'Trigger: atualiza meta_roteamento.updated_at a cada UPDATE.';

DROP TRIGGER IF EXISTS trg_meta_roteamento_updated_at ON meta_roteamento;
CREATE TRIGGER trg_meta_roteamento_updated_at
  BEFORE UPDATE ON meta_roteamento
  FOR EACH ROW
  EXECUTE FUNCTION meta_roteamento_set_updated_at();


-- =====================================================================
-- SEÇÃO E: TABELA meta_eventos — fila de eventos recebidos da Meta
-- =====================================================================
-- Cada notificação de lead (webhook, reconciliação ou manual) vira uma linha.
-- imobiliaria_id pode ser NULL quando a Página ainda não está cadastrada.
-- A notificação de webhook da Meta traz só ids (sem nome/telefone); os dados
-- pessoais do lead devem ficar apenas em leads, não em payload.
CREATE TABLE IF NOT EXISTS meta_eventos (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id       UUID
                                     REFERENCES imobiliarias(id) ON DELETE RESTRICT,
  recebido_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  origem               TEXT        NOT NULL DEFAULT 'webhook'
                                     CONSTRAINT meta_eventos_origem_check
                                     CHECK (origem IN ('webhook', 'reconciliacao', 'manual')),
  page_id              TEXT,
  form_id              TEXT,
  leadgen_id           TEXT,
  ad_id                TEXT,
  adgroup_id           TEXT,
  payload              JSONB,
  status               TEXT        NOT NULL DEFAULT 'recebido'
                                     CONSTRAINT meta_eventos_status_check
                                     CHECK (status IN (
                                       'recebido', 'processando', 'processado',
                                       'duplicado', 'ignorado', 'erro'
                                     )),
  tentativas           INTEGER     NOT NULL DEFAULT 0,
  ultimo_erro          TEXT,
  proxima_tentativa_em TIMESTAMPTZ,
  processado_em        TIMESTAMPTZ,
  lead_id              UUID
                                     REFERENCES leads(id) ON DELETE SET NULL
);

COMMENT ON TABLE meta_eventos
  IS 'Eventos de lead recebidos da Meta e seu processamento (fila com novas tentativas).';

-- Um evento por leadgen_id.
-- DECISÃO: índice único COMUM (não parcial). No PostgreSQL, NULLs nunca
-- conflitam entre si num índice único, então o efeito é o mesmo de um índice
-- parcial "WHERE leadgen_id IS NOT NULL" — mas só o índice comum é aceito
-- por "INSERT ... ON CONFLICT (leadgen_id)", que é o que o supabase-js gera
-- em upsert({ onConflict: 'leadgen_id', ignoreDuplicates: true }).
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_eventos_leadgen_id
  ON meta_eventos (leadgen_id);

-- Fila de reprocessamento: WHERE status IN (...) AND proxima_tentativa_em <= now()
CREATE INDEX IF NOT EXISTS idx_meta_eventos_status_proxima
  ON meta_eventos (status, proxima_tentativa_em);

-- Tela /integracoes: últimos eventos da imobiliária
CREATE INDEX IF NOT EXISTS idx_meta_eventos_imobiliaria_recebido
  ON meta_eventos (imobiliaria_id, recebido_em DESC);

CREATE INDEX IF NOT EXISTS idx_meta_eventos_lead
  ON meta_eventos (lead_id) WHERE lead_id IS NOT NULL;


-- =====================================================================
-- SEÇÃO F: RLS DAS TRÊS TABELAS NOVAS
-- =====================================================================
-- SELECT: só admin da própria imobiliária.
-- Escrita: nenhuma policy → só o service_role (rotas do servidor) escreve.
ALTER TABLE integracoes_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_roteamento  ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_eventos     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integracoes_meta_select_admin" ON integracoes_meta;
CREATE POLICY "integracoes_meta_select_admin" ON integracoes_meta
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "meta_roteamento_select_admin" ON meta_roteamento;
CREATE POLICY "meta_roteamento_select_admin" ON meta_roteamento
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'admin'
  );

-- Eventos sem imobiliaria_id (Página não cadastrada) não aparecem para
-- ninguém pelo RLS; a tela /integracoes os lê com service_role se precisar.
DROP POLICY IF EXISTS "meta_eventos_select_admin" ON meta_eventos;
CREATE POLICY "meta_eventos_select_admin" ON meta_eventos
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'admin'
  );

-- Defesa extra: o Supabase dá ALL nas tabelas novas de public para anon e
-- authenticated por privilégio padrão. O RLS já bloqueia, mas TRUNCATE não
-- passa por RLS — então retiramos tudo do anon e deixamos só SELECT para
-- authenticated (filtrado pelas policies acima).
REVOKE ALL ON integracoes_meta, meta_roteamento, meta_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON integracoes_meta, meta_roteamento, meta_eventos TO authenticated;
GRANT ALL    ON integracoes_meta, meta_roteamento, meta_eventos TO service_role;


-- =====================================================================
-- SEÇÃO G: FUNÇÃO normalizar_telefone_br(text)
-- =====================================================================
-- Mesma regra de lib/telefone.ts → normalizarTelefone(). As duas precisam
-- dar exatamente o mesmo resultado, senão a deduplicação por telefone falha.
--   1. Texto (sem espaços nas pontas) começa com "+" → só os dígitos.
--   2. Senão: só os dígitos, sem zeros à esquerda.
--   3. Com 10 ou 11 dígitos (DDD + número) → "55" + dígitos.
--   4. Outro tamanho → os dígitos como estão.
-- Exemplos (iguais aos de lib/telefone.ts):
--   '(62) 99999-0001'   → '5562999990001'
--   '+55 62 99999-0001' → '5562999990001'
--   '062 99999-0001'    → '5562999990001'
--   '62 3333-0001'      → '556233330001'
--   '+1 650 555 1234'   → '16505551234'
--
-- Detalhes de equivalência com o JavaScript:
--   - "trim()" do JS remove espaço, tab, quebras de linha e os espaços
--     Unicode (NBSP, U+2000..U+200A, U+3000 etc.). O padrão abaixo lista
--     exatamente esse conjunto antes do "+".
--   - "\D" do JS é "não for 0-9" (só ASCII); usamos [^0-9] pelo mesmo motivo
--     (o \d do PostgreSQL pode aceitar dígitos de outros alfabetos).
--   - Única diferença: NULL → NULL (o JS trata ausência como "" e devolve "").
--     NULL é o certo no banco: '' faria todos os leads sem telefone parecerem
--     duplicatas uns dos outros.
CREATE OR REPLACE FUNCTION normalizar_telefone_br(p_telefone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_telefone IS NULL THEN NULL
    WHEN p_telefone ~ '^[\t\n\v\f\r    -     　﻿]*\+'
      THEN d.digitos
    WHEN length(d.sem_zeros) IN (10, 11)
      THEN '55' || d.sem_zeros
    ELSE d.sem_zeros
  END
  FROM (
    SELECT x.digitos,
           regexp_replace(x.digitos, '^0+', '') AS sem_zeros
    FROM (
      SELECT regexp_replace(COALESCE(p_telefone, ''), '[^0-9]', '', 'g') AS digitos
    ) AS x
  ) AS d
$$;

COMMENT ON FUNCTION normalizar_telefone_br(TEXT)
  IS 'Normaliza telefone para só dígitos com código do país (Brasil: 55 + DDD + número). Mesma regra de lib/telefone.ts. NULL → NULL.';


-- =====================================================================
-- SEÇÃO H: RECALCULAR telefone_normalizado DOS LEADS EXISTENTES
-- =====================================================================
-- Antes: só dígitos (ex.: '62999990001'). Depois: com país ('5562999990001').
-- Só a coluna derivada muda; telefone (o que foi digitado) fica intacto.
-- O filtro IS DISTINCT FROM evita reescrever linhas que já estão certas
-- (reaplicar a migration não toca em nada).
UPDATE leads
SET telefone_normalizado = normalizar_telefone_br(telefone)
WHERE telefone IS NOT NULL
  AND telefone_normalizado IS DISTINCT FROM normalizar_telefone_br(telefone);


COMMIT;


-- =====================================================================
-- VERIFICAÇÃO RÁPIDA (rodar depois, separadamente)
-- =====================================================================
-- SELECT normalizar_telefone_br('(62) 99999-0001');   -- 5562999990001
-- SELECT normalizar_telefone_br('+1 650 555 1234');   -- 16505551234
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename IN ('integracoes_meta', 'meta_roteamento', 'meta_eventos');
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'historico_leads'::regclass AND contype = 'c';
-- =====================================================================
