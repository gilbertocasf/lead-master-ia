-- =====================================================================
-- Migration 001 — Fase 5: Schema Mínimo
-- Lead Master IA
-- =====================================================================
-- Objetivo: preparar o banco para suportar
--   Lead → Equipe → Corretor → Pipeline → Histórico
--
-- Aplicar no SQL Editor do Supabase APÓS aprovação explícita.
-- Segura para reaplicar: todos os comandos usam IF NOT EXISTS.
-- NÃO remove nem renomeia colunas existentes.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. CORRETORES — disponibilidade em plantão
-- ---------------------------------------------------------------------
-- Campo separado de "ativo" (decisão aprovada — DECISOES-ARQUITETURA.md §6 e §7).
-- ativo      = corretor está na empresa (não desligado)
-- em_plantao = corretor está disponível agora para receber leads
-- DEFAULT false: após aplicar, executar manualmente:
--   UPDATE corretores SET em_plantao = true WHERE ativo = true;
-- (ou selecionar os corretores específicos em plantão)
ALTER TABLE corretores
  ADD COLUMN IF NOT EXISTS em_plantao BOOLEAN NOT NULL DEFAULT false;


-- ---------------------------------------------------------------------
-- 2. CORRETORES — fairness do round-robin
-- ---------------------------------------------------------------------
-- Usado no algoritmo de distribuição:
--   ORDER BY COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC
-- NULL = nunca recebeu lead (prioridade máxima na fila).
ALTER TABLE corretores
  ADD COLUMN IF NOT EXISTS ultimo_lead_recebido_em TIMESTAMPTZ;


-- ---------------------------------------------------------------------
-- 3. EQUIPES — rodízio de equipes (fallback sem equipe_id)
-- ---------------------------------------------------------------------
-- Quando webhook chega sem equipe_id, seleciona a equipe que há mais
-- tempo não recebe lead:
--   ORDER BY COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC LIMIT 1
-- NULL = nunca recebeu lead (prioridade máxima no rodízio).
ALTER TABLE equipes
  ADD COLUMN IF NOT EXISTS ultimo_lead_recebido_em TIMESTAMPTZ;


-- ---------------------------------------------------------------------
-- 4. LEADS — telefone normalizado (deduplicação por janela de 24h)
-- ---------------------------------------------------------------------
-- Busca de duplicatas usa telefone sem máscara para evitar falsos
-- negativos por diferença de formatação.
-- Preenchido pela aplicação ao criar o lead (remove tudo que não é dígito).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS telefone_normalizado TEXT;


-- ---------------------------------------------------------------------
-- 5. LEADS — momento da distribuição (início do SLA)
-- ---------------------------------------------------------------------
-- Preenchido quando o lead recebe corretor_id (automático ou manual).
-- NULL = lead ainda na fila.
-- SLA visual: (NOW() - distribuido_em) em minutos → verde / amarelo / vermelho.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS distribuido_em TIMESTAMPTZ;


-- ---------------------------------------------------------------------
-- 6. TABELA: historico_leads
-- ---------------------------------------------------------------------
-- Obrigatória desde a primeira operação de escrita (decisão aprovada).
-- Registra cada evento relevante do lead: criação, roteamento,
-- distribuição, mudança de status.
-- ON DELETE CASCADE: ao apagar o lead, o histórico vai junto.
CREATE TABLE IF NOT EXISTS historico_leads (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID        NOT NULL
                             REFERENCES leads(id)
                             ON UPDATE CASCADE
                             ON DELETE CASCADE,
  tipo_evento  TEXT        NOT NULL
                             CONSTRAINT historico_leads_tipo_evento_check CHECK (
                               tipo_evento IN (
                                 'lead_criado',
                                 'lead_roteado',
                                 'lead_distribuido',
                                 'distribuicao_falhou',
                                 'status_alterado',
                                 'lead_redistribuido'
                               )
                             ),
  descricao    TEXT,
  dados        JSONB,
  -- Exemplos de uso do campo dados:
  --   lead_criado:      { origem, canal, equipe_id }
  --   lead_distribuido: { corretor_id, corretor_nome }
  --   status_alterado:  { status_anterior, status_novo, motivo_perda? }
  --   lead_roteado:     { equipe_id, equipe_nome, motivo: 'payload_direto' | 'rodizio' }
  criado_por   TEXT        NOT NULL DEFAULT 'sistema'
                             CONSTRAINT historico_leads_criado_por_check CHECK (
                               criado_por IN (
                                 'sistema',
                                 'formulario',
                                 'webhook',
                                 'usuario'
                               )
                             ),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE historico_leads
  IS 'Trilha de auditoria de eventos do lead: criação, roteamento, distribuição e pipeline.';

COMMENT ON COLUMN historico_leads.tipo_evento
  IS 'Tipo do evento. Valores: lead_criado, lead_roteado, lead_distribuido, distribuicao_falhou, status_alterado, lead_redistribuido.';

COMMENT ON COLUMN historico_leads.dados
  IS 'Snapshot do estado no momento do evento. Estrutura varia por tipo_evento.';

COMMENT ON COLUMN historico_leads.criado_por
  IS 'Origem do evento. Valores: sistema, formulario, webhook, usuario.';


-- ---------------------------------------------------------------------
-- 7. ÍNDICES
-- ---------------------------------------------------------------------

-- Índice composto para deduplicação por telefone com janela de 24h.
-- Cobre a query: WHERE telefone_normalizado = $1 AND created_at > NOW() - INTERVAL '24h'
-- O composto é mais eficiente que dois índices simples porque o planner
-- usa telefone_normalizado para filtrar o conjunto e created_at para
-- restringir a janela sem segunda varredura.
CREATE INDEX IF NOT EXISTS idx_leads_deduplicacao
  ON leads (telefone_normalizado, created_at);

-- Busca do histórico de um lead específico:
--   WHERE lead_id = $1 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_historico_leads_lead_id
  ON historico_leads (lead_id, created_at DESC);


-- =====================================================================
-- VERIFICAÇÃO RÁPIDA (opcional — executar após aplicar para validar)
-- =====================================================================
-- Colunas novas em corretores:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'corretores'
--   AND column_name IN ('em_plantao', 'ultimo_lead_recebido_em');
--
-- Colunas novas em equipes:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'equipes' AND column_name = 'ultimo_lead_recebido_em';
--
-- Colunas novas em leads:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'leads'
--   AND column_name IN ('telefone_normalizado', 'distribuido_em');
--
-- Estrutura completa de historico_leads:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'historico_leads'
-- ORDER BY ordinal_position;
--
-- CHECK constraint ativa:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'historico_leads'::regclass AND contype = 'c';
--
-- Índices criados:
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename IN ('leads', 'historico_leads')
--   AND indexname LIKE 'idx_%';
--
-- AÇÃO MANUAL OBRIGATÓRIA APÓS APLICAR:
-- UPDATE corretores SET em_plantao = true WHERE ativo = true;
-- =====================================================================
