-- =====================================================================
-- LEAD MASTER IA — Schema v2.0
-- Reset Controlado: RLS + Multi-tenancy + Supabase Auth
-- =====================================================================
-- ATENÇÃO: NÃO executar sem aprovação explícita.
-- Executar inteiro via SQL Editor do Supabase (não via CLI).
-- Inclui DROP das tabelas v1 — todos os dados existentes serão apagados.
-- Fazer backup dos dados antes de aplicar (ver fase-5r-reset-banco-rls.md).
-- =====================================================================


-- =====================================================================
-- 0. EXTENSÕES
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =====================================================================
-- 1. LIMPEZA (ordem inversa das dependências FK)
-- =====================================================================
-- Apaga estruturas v1 e v2 parciais, se existirem.
DROP TABLE  IF EXISTS historico_leads CASCADE;
DROP TABLE  IF EXISTS vendas          CASCADE;
DROP TABLE  IF EXISTS leads           CASCADE;
DROP TABLE  IF EXISTS corretores      CASCADE;
DROP TABLE  IF EXISTS equipes         CASCADE;
DROP TABLE  IF EXISTS usuarios        CASCADE;
DROP TABLE  IF EXISTS imobiliarias    CASCADE;

DROP TYPE   IF EXISTS lead_status    CASCADE;
DROP TYPE   IF EXISTS lead_origem    CASCADE;
DROP TYPE   IF EXISTS usuario_role   CASCADE;

DROP FUNCTION IF EXISTS current_imobiliaria_id();
DROP FUNCTION IF EXISTS current_user_role();
DROP FUNCTION IF EXISTS current_usuario_id();


-- =====================================================================
-- 2. TIPOS ENUM
-- =====================================================================

-- Roles de usuário (controla acesso e políticas RLS)
CREATE TYPE usuario_role AS ENUM ('admin', 'gestor', 'corretor');

-- Canais de origem do lead (espelha lib/types.ts LeadSource)
CREATE TYPE lead_origem AS ENUM ('Instagram', 'Facebook', 'Outro');

-- Etapas do pipeline (espelha lib/types.ts LeadStatus)
CREATE TYPE lead_status AS ENUM (
  'novo',
  'em_contato',
  'visita',
  'proposta',
  'fechado',
  'perdido'
);


-- =====================================================================
-- 3. TABELA: imobiliarias — raiz do tenant
-- =====================================================================
CREATE TABLE imobiliarias (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE imobiliarias
  IS 'Tenant raiz. Cada imobiliária é um contexto de dados isolado via RLS.';


-- =====================================================================
-- 4. TABELA: usuarios — perfil vinculado ao Supabase Auth
-- =====================================================================
-- auth_user_id referencia auth.users(id) — gerenciado pelo Supabase.
-- Criado automaticamente por trigger ou manualmente após signup.
CREATE TABLE usuarios (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id   UUID         NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  imobiliaria_id UUID         NOT NULL REFERENCES imobiliarias(id) ON DELETE CASCADE,
  nome           TEXT         NOT NULL,
  email          TEXT         NOT NULL,
  role           usuario_role NOT NULL DEFAULT 'corretor',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE usuarios
  IS 'Perfil do usuário do sistema. auth_user_id é o id em auth.users (Supabase Auth).';
COMMENT ON COLUMN usuarios.auth_user_id
  IS 'FK para auth.users. Excluir o auth user exclui este perfil em cascata.';
COMMENT ON COLUMN usuarios.role
  IS 'admin: acesso total à imobiliária. gestor: gerencia equipes/leads. corretor: vê apenas seus próprios leads.';


-- =====================================================================
-- 5. FUNÇÕES HELPER para RLS
-- =====================================================================
-- SECURITY DEFINER: executa como owner do banco, não como o chamador.
-- Necessário para evitar recursão (a política de usuarios usa a função
-- que lê usuarios, que tem RLS que chamaria a função...).
-- Os índices em auth_user_id garantem que cada chamada é O(log n).

CREATE OR REPLACE FUNCTION current_imobiliaria_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT imobiliaria_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS usuario_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION current_usuario_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
$$;

COMMENT ON FUNCTION current_imobiliaria_id
  IS 'Retorna o imobiliaria_id do usuário autenticado. Usado em todas as políticas RLS.';
COMMENT ON FUNCTION current_user_role
  IS 'Retorna o role (admin/gestor/corretor) do usuário autenticado. Usado em políticas RLS.';
COMMENT ON FUNCTION current_usuario_id
  IS 'Retorna o id (uuid interno) do usuário autenticado. Usado para encontrar o registro de corretor vinculado.';


-- =====================================================================
-- 6. TABELA: equipes
-- =====================================================================
CREATE TABLE equipes (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id          UUID        NOT NULL REFERENCES imobiliarias(id) ON DELETE CASCADE,
  nome                    TEXT        NOT NULL,
  gerente                 TEXT        NOT NULL,
  ativo                   BOOLEAN     NOT NULL DEFAULT true,
  ultimo_lead_recebido_em TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE equipes
  IS 'Equipes comerciais de uma imobiliária.';
COMMENT ON COLUMN equipes.ativo
  IS 'Equipes inativas não participam do rodízio automático de leads.';
COMMENT ON COLUMN equipes.gerente
  IS 'Nome do gerente responsável. Campo texto no MVP; V2 pode virar FK para usuarios.';
COMMENT ON COLUMN equipes.ultimo_lead_recebido_em
  IS 'Usado no rodízio sem equipe_id: ORDER BY COALESCE(ultimo_lead_recebido_em, ''1970-01-01'') ASC.';


-- =====================================================================
-- 7. TABELA: corretores
-- =====================================================================
CREATE TABLE corretores (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id          UUID        NOT NULL REFERENCES imobiliarias(id) ON DELETE CASCADE,
  usuario_id              UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  equipe_id               UUID        NOT NULL
                                        REFERENCES equipes(id)
                                        ON UPDATE CASCADE
                                        ON DELETE RESTRICT,
  nome                    TEXT        NOT NULL,
  email                   TEXT,
  telefone                TEXT,
  ordem_plantao           INTEGER     NOT NULL DEFAULT 0,
  ativo                   BOOLEAN     NOT NULL DEFAULT true,
  em_plantao              BOOLEAN     NOT NULL DEFAULT false,
  ultimo_lead_recebido_em TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE corretores
  IS 'Corretores vinculados a uma equipe. Têm usuário de sistema opcional.';
COMMENT ON COLUMN corretores.usuario_id
  IS 'Vínculo com conta de login. NULL = corretor sem acesso ao sistema (gerenciado pelo gestor).';
COMMENT ON COLUMN corretores.ativo
  IS 'Corretor está na empresa. false = desligado. Não confundir com em_plantao.';
COMMENT ON COLUMN corretores.em_plantao
  IS 'Disponível agora para receber leads. Um corretor ativo pode estar fora de plantão (folga, reunião).';
COMMENT ON COLUMN corretores.ultimo_lead_recebido_em
  IS 'Fairness do round-robin: ORDER BY COALESCE(ultimo_lead_recebido_em, ''1970-01-01'') ASC.';


-- =====================================================================
-- 8. TABELA: leads
-- =====================================================================
-- equipe_id é NOT NULL: no fluxo do sistema, a equipe é sempre definida
-- antes da inserção — diretamente pelo payload ou pelo rodízio automático.
-- O rodízio pode falhar (503 sem equipes ativas) mas nunca deixa o lead
-- sem equipe; nesse caso o lead não é criado.
CREATE TABLE leads (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id       UUID        NOT NULL REFERENCES imobiliarias(id) ON DELETE CASCADE,
  equipe_id            UUID        NOT NULL
                                     REFERENCES equipes(id)
                                     ON UPDATE CASCADE
                                     ON DELETE RESTRICT,
  corretor_id          UUID        REFERENCES corretores(id)
                                     ON UPDATE CASCADE
                                     ON DELETE SET NULL,
  nome                 TEXT        NOT NULL,
  telefone             TEXT,
  telefone_normalizado TEXT,
  origem               lead_origem NOT NULL DEFAULT 'Outro',
  interesse            TEXT,
  faixa_valor          TEXT,
  status               lead_status NOT NULL DEFAULT 'novo',
  observacoes          TEXT,
  distribuido_em       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE leads
  IS 'Leads captados. equipe_id sempre preenchido. corretor_id = NULL enquanto aguardando distribuição.';
COMMENT ON COLUMN leads.telefone_normalizado
  IS 'Telefone com apenas dígitos (sem máscara). Índice composto com created_at cobre deduplicação por 24h.';
COMMENT ON COLUMN leads.distribuido_em
  IS 'Timestamp da atribuição ao corretor. Início do SLA de primeiro contato (30min amarelo / 2h vermelho).';


-- =====================================================================
-- 9. TABELA: historico_leads — trilha de auditoria imutável
-- =====================================================================
-- Inserções apenas via service_role (operações do servidor).
-- Nunca atualizar ou apagar eventos. ON DELETE CASCADE acompanha o lead.
CREATE TABLE historico_leads (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id UUID        NOT NULL REFERENCES imobiliarias(id) ON DELETE CASCADE,
  lead_id        UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo_evento    TEXT        NOT NULL
                               CONSTRAINT historico_tipo_evento_check
                               CHECK (tipo_evento IN (
                                 'lead_criado',
                                 'lead_roteado',
                                 'lead_distribuido',
                                 'distribuicao_falhou',
                                 'status_alterado',
                                 'lead_redistribuido'
                               )),
  descricao      TEXT,
  dados          JSONB,
  criado_por     TEXT        NOT NULL DEFAULT 'sistema'
                               CONSTRAINT historico_criado_por_check
                               CHECK (criado_por IN (
                                 'sistema',
                                 'formulario',
                                 'webhook',
                                 'usuario'
                               )),
  usuario_id     UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE historico_leads
  IS 'Auditoria imutável de eventos do lead. Nunca alterar ou apagar registros — apenas inserir.';
COMMENT ON COLUMN historico_leads.dados
  IS 'Snapshot do estado no momento do evento. Estrutura por tipo: lead_criado={origem,equipe_id}, lead_distribuido={corretor_id,corretor_nome}, status_alterado={status_anterior,status_novo,motivo_perda?}, lead_roteado={equipe_id,motivo}.';
COMMENT ON COLUMN historico_leads.usuario_id
  IS 'Preenchido quando criado_por=usuario. NULL em eventos automáticos do sistema.';


-- =====================================================================
-- 10. TABELA: vendas — base do ranking VGV
-- =====================================================================
CREATE TABLE vendas (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id UUID          NOT NULL REFERENCES imobiliarias(id) ON DELETE CASCADE,
  lead_id        UUID          REFERENCES leads(id) ON UPDATE CASCADE ON DELETE SET NULL,
  corretor_id    UUID          NOT NULL
                                 REFERENCES corretores(id)
                                 ON UPDATE CASCADE
                                 ON DELETE RESTRICT,
  valor          NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  data_venda     DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE vendas
  IS 'Vendas fechadas. Base do ranking VGV. lead_id nullable para vendas históricas sem lead vinculado.';
COMMENT ON COLUMN vendas.valor
  IS 'Valor Geral de Vendas em reais. Renomeado de valor_vgv do schema v1.';


-- =====================================================================
-- 11. ÍNDICES
-- =====================================================================

-- usuarios (hot path de RLS — toda policy lê esta tabela)
CREATE UNIQUE INDEX idx_usuarios_auth_user_id  ON usuarios (auth_user_id);
CREATE        INDEX idx_usuarios_imobiliaria   ON usuarios (imobiliaria_id);

-- equipes
CREATE INDEX idx_equipes_imobiliaria  ON equipes (imobiliaria_id);
CREATE INDEX idx_equipes_ativo        ON equipes (imobiliaria_id) WHERE ativo = true;

-- corretores
CREATE INDEX idx_corretores_imobiliaria  ON corretores (imobiliaria_id);
CREATE INDEX idx_corretores_equipe       ON corretores (equipe_id);
CREATE INDEX idx_corretores_usuario      ON corretores (usuario_id) WHERE usuario_id IS NOT NULL;
-- Cobre a query do algoritmo de distribuição: WHERE equipe_id=? AND em_plantao=true AND ativo=true
CREATE INDEX idx_corretores_plantao ON corretores (equipe_id, em_plantao, ativo, ultimo_lead_recebido_em)
  WHERE em_plantao = true AND ativo = true;
-- Unicidade de email por imobiliária (parcial — permite email NULL)
CREATE UNIQUE INDEX idx_corretores_email_imobiliaria
  ON corretores (imobiliaria_id, email)
  WHERE email IS NOT NULL;

-- leads
CREATE INDEX idx_leads_imobiliaria   ON leads (imobiliaria_id);
CREATE INDEX idx_leads_equipe        ON leads (equipe_id);
CREATE INDEX idx_leads_corretor      ON leads (corretor_id);
CREATE INDEX idx_leads_status        ON leads (status);
-- Fila de distribuição (leads sem corretor)
CREATE INDEX idx_leads_fila          ON leads (equipe_id) WHERE corretor_id IS NULL;
-- Deduplicação por telefone com janela de 24h
CREATE INDEX idx_leads_deduplicacao  ON leads (telefone_normalizado, created_at);

-- historico_leads
CREATE INDEX idx_historico_imobiliaria  ON historico_leads (imobiliaria_id);
CREATE INDEX idx_historico_lead         ON historico_leads (lead_id, created_at DESC);

-- vendas
CREATE INDEX idx_vendas_imobiliaria  ON vendas (imobiliaria_id);
CREATE INDEX idx_vendas_corretor     ON vendas (corretor_id);
CREATE INDEX idx_vendas_lead         ON vendas (lead_id);
CREATE INDEX idx_vendas_data         ON vendas (data_venda);


-- =====================================================================
-- 12. HABILITAR RLS EM TODAS AS TABELAS
-- =====================================================================
ALTER TABLE imobiliarias    ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE corretores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas          ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 13. POLÍTICAS RLS
-- =====================================================================
-- Princípios:
--   A. service_role bypassa RLS automaticamente (Supabase).
--      → API routes (webhook, distribuição, histórico) usam service_role.
--   B. authenticated = usuário logado no app via Supabase Auth.
--   C. anon = bloqueado por ausência de políticas (default deny).
--   D. Sem política = operação bloqueada para authenticated/anon.


-- --- imobiliarias ---
-- SELECT: usuário vê somente a sua imobiliária.
-- INSERT/UPDATE/DELETE: sem policy = apenas service_role (onboarding).
CREATE POLICY "imobiliarias_select" ON imobiliarias
  FOR SELECT TO authenticated
  USING (id = current_imobiliaria_id());


-- --- usuarios ---
-- SELECT: todos os usuários da mesma imobiliária se veem.
-- UPDATE: cada usuário pode atualizar apenas o próprio perfil.
-- INSERT/DELETE: service_role (criação no onboarding, exclusão administrativa).
CREATE POLICY "usuarios_select" ON usuarios
  FOR SELECT TO authenticated
  USING (imobiliaria_id = current_imobiliaria_id());

CREATE POLICY "usuarios_update_own" ON usuarios
  FOR UPDATE TO authenticated
  USING  (auth_user_id = auth.uid())
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()
    AND auth_user_id = auth.uid()
  );


-- --- equipes ---
-- SELECT: qualquer usuário autenticado da imobiliária.
-- INSERT: admin ou gestor.
-- UPDATE: admin ou gestor.
-- DELETE: sem policy = service_role apenas (protege FK com corretores).
CREATE POLICY "equipes_select" ON equipes
  FOR SELECT TO authenticated
  USING (imobiliaria_id = current_imobiliaria_id());

CREATE POLICY "equipes_insert" ON equipes
  FOR INSERT TO authenticated
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() IN ('admin', 'gestor')
  );

CREATE POLICY "equipes_update" ON equipes
  FOR UPDATE TO authenticated
  USING  (imobiliaria_id = current_imobiliaria_id())
  WITH CHECK (current_user_role() IN ('admin', 'gestor'));


-- --- corretores ---
-- SELECT: qualquer usuário autenticado da imobiliária.
-- INSERT: admin ou gestor.
-- UPDATE: admin ou gestor.
-- DELETE: sem policy = service_role apenas.
CREATE POLICY "corretores_select" ON corretores
  FOR SELECT TO authenticated
  USING (imobiliaria_id = current_imobiliaria_id());

CREATE POLICY "corretores_insert" ON corretores
  FOR INSERT TO authenticated
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() IN ('admin', 'gestor')
  );

CREATE POLICY "corretores_update" ON corretores
  FOR UPDATE TO authenticated
  USING  (imobiliaria_id = current_imobiliaria_id())
  WITH CHECK (current_user_role() IN ('admin', 'gestor'));


-- --- leads ---
-- SELECT admin/gestor: todos os leads da imobiliária.
-- SELECT corretor: apenas leads onde é o corretor atribuído.
-- UPDATE admin/gestor: atualizar status, corretor_id, campos do lead.
-- UPDATE corretor: não permitido via client (movimentação de status via API route com service_role).
-- INSERT: service_role (criação via API route).
-- DELETE: service_role apenas.

CREATE POLICY "leads_select_admin_gestor" ON leads
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() IN ('admin', 'gestor')
  );

-- Corretor vê apenas leads atribuídos ao seu registro de corretor.
-- Pressuposto MVP: 1 usuario = 1 corretor. LIMIT 1 é guard defensivo.
CREATE POLICY "leads_select_corretor" ON leads
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'corretor'
    AND corretor_id = (
      SELECT id FROM corretores
      WHERE usuario_id = current_usuario_id()
        AND imobiliaria_id = current_imobiliaria_id()
      LIMIT 1
    )
  );

CREATE POLICY "leads_update_admin_gestor" ON leads
  FOR UPDATE TO authenticated
  USING  (imobiliaria_id = current_imobiliaria_id())
  WITH CHECK (current_user_role() IN ('admin', 'gestor'));


-- --- historico_leads ---
-- SELECT admin/gestor: todo histórico da imobiliária.
-- SELECT corretor: histórico dos seus próprios leads.
-- INSERT/UPDATE/DELETE: service_role apenas. Histórico é imutável.
CREATE POLICY "historico_select_admin_gestor" ON historico_leads
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() IN ('admin', 'gestor')
  );

CREATE POLICY "historico_select_corretor" ON historico_leads
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'corretor'
    AND lead_id IN (
      SELECT l.id FROM leads l
      WHERE l.corretor_id = (
        SELECT id FROM corretores
        WHERE usuario_id = current_usuario_id()
          AND imobiliaria_id = current_imobiliaria_id()
        LIMIT 1
      )
    )
  );


-- --- vendas ---
-- SELECT admin/gestor: todas as vendas da imobiliária.
-- SELECT corretor: apenas as suas próprias vendas.
-- INSERT/UPDATE/DELETE: service_role apenas.
CREATE POLICY "vendas_select_admin_gestor" ON vendas
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() IN ('admin', 'gestor')
  );

CREATE POLICY "vendas_select_corretor" ON vendas
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'corretor'
    AND corretor_id = (
      SELECT id FROM corretores
      WHERE usuario_id = current_usuario_id()
        AND imobiliaria_id = current_imobiliaria_id()
      LIMIT 1
    )
  );


-- =====================================================================
-- 14. VERIFICAÇÃO RÁPIDA (executar após aplicar para validar)
-- =====================================================================
-- Tabelas criadas:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;
-- Esperado: corretores, equipes, historico_leads, imobiliarias, leads, usuarios, vendas
--
-- RLS habilitado em todas:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' ORDER BY tablename;
-- Esperado: rowsecurity = true em todas as 7 tabelas
--
-- Políticas criadas:
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename, policyname;
--
-- Funções helper criadas:
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public' AND routine_name LIKE 'current_%';
-- Esperado: current_imobiliaria_id, current_usuario_id, current_user_role
--
-- imobiliaria_id em todas as tabelas de dados:
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND column_name = 'imobiliaria_id'
-- ORDER BY table_name;
-- Esperado: corretores, equipes, historico_leads, leads, usuarios, vendas
-- =====================================================================
