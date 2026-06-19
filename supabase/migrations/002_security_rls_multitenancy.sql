-- =====================================================================
-- Migration 002 — Security Hardening: RLS + Multi-tenancy + Supabase Auth
-- Lead Master IA
-- =====================================================================
-- ATENÇÃO: NÃO executar sem aprovação explícita do responsável técnico.
-- Aplicar via SQL Editor do Supabase (não via CLI).
--
-- O QUE ESTA MIGRATION FAZ:
--   ✔ Cria tabelas imobiliarias e usuarios (multi-tenancy)
--   ✔ Adiciona imobiliaria_id em todas as tabelas existentes (com backfill)
--   ✔ Incorpora todos os campos de 001_fase5_schema_minimo.sql (não aplicada)
--   ✔ Cria historico_leads (se ainda não existir)
--   ✔ Habilita RLS em todas as tabelas
--   ✔ Cria políticas RLS por role (admin, gestor, corretor)
--   ✔ Cria funções helper SECURITY DEFINER para isolamento de tenant
--
-- O QUE ESTA MIGRATION NÃO FAZ:
--   ✗ Não apaga nenhuma tabela
--   ✗ Não remove nenhuma coluna existente
--   ✗ Não renomeia nenhuma coluna existente
--   ✗ Não apaga dados existentes
--
-- IDEMPOTÊNCIA:
--   Segura para reaplicar. Toda criação usa IF NOT EXISTS.
--   Constraints FK usam verificação em pg_constraint antes de criar.
--   Policies são dropadas e recriadas (idempotente).
--
-- AÇÕES MANUAIS OBRIGATÓRIAS APÓS APLICAR (ver Seção FINAL).
-- =====================================================================


-- =====================================================================
-- SEÇÃO A: EXTENSÃO
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


BEGIN;


-- =====================================================================
-- SEÇÃO B: NOVO TIPO ENUM — usuario_role
-- =====================================================================
DO $$ BEGIN
  CREATE TYPE usuario_role AS ENUM ('admin', 'gestor', 'corretor');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- =====================================================================
-- SEÇÃO C: TABELA imobiliarias — raiz do tenant
-- =====================================================================
CREATE TABLE IF NOT EXISTS imobiliarias (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE imobiliarias
  IS 'Tenant raiz. Cada imobiliária é um contexto de dados isolado via RLS.';


-- =====================================================================
-- SEÇÃO D: TABELA usuarios — perfil vinculado ao Supabase Auth
-- =====================================================================
-- auth_user_id referencia auth.users(id) — gerenciado pelo Supabase Auth.
-- Criado após signup (via trigger ou manualmente no Dashboard).
CREATE TABLE IF NOT EXISTS usuarios (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id   UUID         NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  imobiliaria_id UUID         NOT NULL REFERENCES imobiliarias(id) ON DELETE RESTRICT,
  nome           TEXT         NOT NULL,
  email          TEXT         NOT NULL,
  role           usuario_role NOT NULL DEFAULT 'corretor',
  ativo          BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE usuarios
  IS 'Perfil do usuário. auth_user_id é o id em auth.users (Supabase Auth).';
COMMENT ON COLUMN usuarios.role
  IS 'admin: acesso total à imobiliária. gestor: dados operacionais. corretor: apenas seus próprios leads.';
COMMENT ON COLUMN usuarios.ativo
  IS 'Usuário desativado não consegue operar mesmo com login ativo. Para revogar acesso sem deletar o auth.user.';


-- =====================================================================
-- SEÇÃO E: FUNÇÕES HELPER PARA RLS (SECURITY DEFINER)
-- =====================================================================
-- Por que SECURITY DEFINER: as funções leem a tabela `usuarios`, que tem
-- RLS habilitado. Sem SECURITY DEFINER, a avaliação do RLS de `usuarios`
-- chamaria a função novamente — recursão infinita. SECURITY DEFINER faz
-- a função rodar como dono do banco, evitando a recursão.
-- Os índices em auth_user_id garantem custo O(log n) por chamada.
-- STABLE permite que o PostgreSQL cache o resultado na mesma query.

-- SET search_path fixa o caminho de busca de objetos durante a execução.
-- Sem isso, um usuário malicioso poderia manipular o search_path e fazer
-- a função SECURITY DEFINER ler de uma tabela `usuarios` falsa.
CREATE OR REPLACE FUNCTION current_imobiliaria_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT imobiliaria_id FROM usuarios
  WHERE auth_user_id = auth.uid() AND ativo = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS usuario_role LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT role FROM usuarios
  WHERE auth_user_id = auth.uid() AND ativo = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION current_usuario_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT id FROM usuarios
  WHERE auth_user_id = auth.uid() AND ativo = true
  LIMIT 1
$$;

COMMENT ON FUNCTION current_imobiliaria_id
  IS 'imobiliaria_id do usuário autenticado e ativo. Usado em todas as policies RLS.';
COMMENT ON FUNCTION current_user_role
  IS 'Role (admin/gestor/corretor) do usuário autenticado. Usado nas policies de escrita.';
COMMENT ON FUNCTION current_usuario_id
  IS 'UUID interno do usuário. Usado para encontrar o registro de corretor vinculado ao login.';


-- =====================================================================
-- SEÇÃO F: CRIAR historico_leads (BASE — se ainda não existir)
-- =====================================================================
-- Cobre o caso em que 001_fase5_schema_minimo.sql nunca foi aplicada.
-- Se a tabela já existe (001 aplicada), este CREATE é ignorado e as
-- colunas ausentes serão adicionadas na Seção H via ADD COLUMN IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS historico_leads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID        NOT NULL
                            REFERENCES leads(id)
                            ON UPDATE CASCADE
                            ON DELETE CASCADE,
  tipo_evento TEXT        NOT NULL
                            CONSTRAINT historico_tipo_evento_check
                            CHECK (tipo_evento IN (
                              'lead_criado',
                              'lead_roteado',
                              'lead_distribuido',
                              'distribuicao_falhou',
                              'status_alterado',
                              'lead_redistribuido'
                            )),
  descricao   TEXT,
  dados       JSONB,
  criado_por  TEXT        NOT NULL DEFAULT 'sistema'
                            CONSTRAINT historico_criado_por_check
                            CHECK (criado_por IN (
                              'sistema', 'formulario', 'webhook', 'usuario'
                            )),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE historico_leads
  IS 'Trilha de auditoria imutável de eventos do lead. Nunca alterar ou apagar registros.';


-- =====================================================================
-- SEÇÃO G: IMOBILIÁRIA PADRÃO + BACKFILL DE imobiliaria_id
-- =====================================================================
-- Adiciona imobiliaria_id como NULL em cada tabela, faz o backfill
-- com a imobiliária padrão (criada aqui se não existir nenhuma),
-- e então define NOT NULL para garantir integridade futura.
DO $$
DECLARE
  imob_id UUID;
BEGIN
  -- Criar ou localizar imobiliária padrão
  IF NOT EXISTS (SELECT 1 FROM imobiliarias LIMIT 1) THEN
    INSERT INTO imobiliarias (nome)
    VALUES ('Imobiliária Padrão — Renomear após setup')
    RETURNING id INTO imob_id;
  ELSE
    SELECT id INTO imob_id
    FROM imobiliarias
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- equipes
  ALTER TABLE equipes ADD COLUMN IF NOT EXISTS imobiliaria_id UUID;
  UPDATE equipes SET imobiliaria_id = imob_id WHERE imobiliaria_id IS NULL;
  ALTER TABLE equipes ALTER COLUMN imobiliaria_id SET NOT NULL;

  -- corretores
  ALTER TABLE corretores ADD COLUMN IF NOT EXISTS imobiliaria_id UUID;
  UPDATE corretores SET imobiliaria_id = imob_id WHERE imobiliaria_id IS NULL;
  ALTER TABLE corretores ALTER COLUMN imobiliaria_id SET NOT NULL;

  -- leads
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS imobiliaria_id UUID;
  UPDATE leads SET imobiliaria_id = imob_id WHERE imobiliaria_id IS NULL;
  ALTER TABLE leads ALTER COLUMN imobiliaria_id SET NOT NULL;

  -- vendas
  ALTER TABLE vendas ADD COLUMN IF NOT EXISTS imobiliaria_id UUID;
  UPDATE vendas SET imobiliaria_id = imob_id WHERE imobiliaria_id IS NULL;
  ALTER TABLE vendas ALTER COLUMN imobiliaria_id SET NOT NULL;

  -- historico_leads (pode ser vazia — backfill é no-op se não houver linhas)
  ALTER TABLE historico_leads ADD COLUMN IF NOT EXISTS imobiliaria_id UUID;
  UPDATE historico_leads SET imobiliaria_id = imob_id WHERE imobiliaria_id IS NULL;
  ALTER TABLE historico_leads ALTER COLUMN imobiliaria_id SET NOT NULL;

END;
$$;


-- =====================================================================
-- SEÇÃO H: COLUNAS ADICIONAIS (de 001 e novas de 002)
-- =====================================================================
-- Todas as colunas que a 001_fase5_schema_minimo.sql adicionaria,
-- mais as novas colunas desta migration.
-- IF NOT EXISTS garante idempotência se 001 já tiver sido aplicada.

-- equipes: campo ativo (novo em 002) e ultimo_lead_recebido_em (de 001)
ALTER TABLE equipes
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE equipes
  ADD COLUMN IF NOT EXISTS ultimo_lead_recebido_em TIMESTAMPTZ;

-- corretores: campos de 001 + usuario_id de 002
ALTER TABLE corretores
  ADD COLUMN IF NOT EXISTS em_plantao BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE corretores
  ADD COLUMN IF NOT EXISTS ultimo_lead_recebido_em TIMESTAMPTZ;
ALTER TABLE corretores
  ADD COLUMN IF NOT EXISTS usuario_id UUID;

-- leads: campos de 001
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS telefone_normalizado TEXT;
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS distribuido_em TIMESTAMPTZ;

-- historico_leads: usuario_id (novo em 002, não estava na 001)
ALTER TABLE historico_leads
  ADD COLUMN IF NOT EXISTS usuario_id UUID;


-- =====================================================================
-- SEÇÃO I: FOREIGN KEYS
-- =====================================================================
-- Verificação em pg_constraint antes de criar (idempotente).
-- Adicionadas APÓS o backfill (seção G) — todos os rows já têm imobiliaria_id.
--
-- DECISÃO DE SEGURANÇA: todas as FKs *.imobiliaria_id usam ON DELETE RESTRICT.
-- Isso impede que uma imobiliária seja deletada enquanto houver dados vinculados.
-- Um DELETE acidental não pode destruir toda a operação de um tenant.
-- Para deletar uma imobiliária, é necessário deletar todos os dados na ordem
-- correta primeiro (operação administrativa explícita, não acidental).

DO $$
BEGIN
  -- equipes → imobiliarias
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_equipes_imobiliaria') THEN
    ALTER TABLE equipes
      ADD CONSTRAINT fk_equipes_imobiliaria
        FOREIGN KEY (imobiliaria_id) REFERENCES imobiliarias(id) ON DELETE RESTRICT;
  END IF;

  -- corretores → imobiliarias
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_corretores_imobiliaria') THEN
    ALTER TABLE corretores
      ADD CONSTRAINT fk_corretores_imobiliaria
        FOREIGN KEY (imobiliaria_id) REFERENCES imobiliarias(id) ON DELETE RESTRICT;
  END IF;

  -- corretores → usuarios (usuario_id)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_corretores_usuario') THEN
    ALTER TABLE corretores
      ADD CONSTRAINT fk_corretores_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;
  END IF;

  -- leads → imobiliarias
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_leads_imobiliaria') THEN
    ALTER TABLE leads
      ADD CONSTRAINT fk_leads_imobiliaria
        FOREIGN KEY (imobiliaria_id) REFERENCES imobiliarias(id) ON DELETE RESTRICT;
  END IF;

  -- vendas → imobiliarias
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vendas_imobiliaria') THEN
    ALTER TABLE vendas
      ADD CONSTRAINT fk_vendas_imobiliaria
        FOREIGN KEY (imobiliaria_id) REFERENCES imobiliarias(id) ON DELETE RESTRICT;
  END IF;

  -- historico_leads → imobiliarias
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_historico_imobiliaria') THEN
    ALTER TABLE historico_leads
      ADD CONSTRAINT fk_historico_imobiliaria
        FOREIGN KEY (imobiliaria_id) REFERENCES imobiliarias(id) ON DELETE RESTRICT;
  END IF;

  -- historico_leads → usuarios (usuario_id)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_historico_usuario') THEN
    ALTER TABLE historico_leads
      ADD CONSTRAINT fk_historico_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;
  END IF;

END;
$$;


-- =====================================================================
-- SEÇÃO J: ÍNDICES
-- =====================================================================

-- usuarios (hot path de RLS — toda policy lê esta tabela)
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_auth_user_id ON usuarios (auth_user_id);
CREATE        INDEX IF NOT EXISTS idx_usuarios_imobiliaria  ON usuarios (imobiliaria_id);

-- imobiliaria_id nas tabelas de dados (tenant isolation — usado em toda query com RLS)
CREATE INDEX IF NOT EXISTS idx_equipes_imobiliaria    ON equipes     (imobiliaria_id);
CREATE INDEX IF NOT EXISTS idx_corretores_imobiliaria ON corretores  (imobiliaria_id);
CREATE INDEX IF NOT EXISTS idx_leads_imobiliaria      ON leads       (imobiliaria_id);
CREATE INDEX IF NOT EXISTS idx_vendas_imobiliaria     ON vendas      (imobiliaria_id);
CREATE INDEX IF NOT EXISTS idx_historico_imobiliaria  ON historico_leads (imobiliaria_id);

-- corretores: algoritmo de distribuição
-- Cobre: WHERE equipe_id = $1 AND em_plantao = true AND ativo = true
-- ORDER BY COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC
CREATE INDEX IF NOT EXISTS idx_corretores_plantao
  ON corretores (equipe_id, em_plantao, ativo, ultimo_lead_recebido_em)
  WHERE em_plantao = true AND ativo = true;

-- corretores: lookup por usuario_id (policies de corretor)
CREATE INDEX IF NOT EXISTS idx_corretores_usuario
  ON corretores (usuario_id) WHERE usuario_id IS NOT NULL;

-- leads: deduplicação por telefone (janela 24h)
-- Cobre: WHERE telefone_normalizado = $1 AND created_at > NOW() - INTERVAL '24h'
CREATE INDEX IF NOT EXISTS idx_leads_deduplicacao
  ON leads (telefone_normalizado, created_at);

-- leads: fila de distribuição (leads sem corretor)
CREATE INDEX IF NOT EXISTS idx_leads_fila
  ON leads (equipe_id) WHERE corretor_id IS NULL;

-- historico_leads: busca por lead com ordenação temporal
CREATE INDEX IF NOT EXISTS idx_historico_lead
  ON historico_leads (lead_id, created_at DESC);

-- equipes ativas no rodízio (apenas equipes com ativo = true)
CREATE INDEX IF NOT EXISTS idx_equipes_ativas
  ON equipes (imobiliaria_id, ultimo_lead_recebido_em)
  WHERE ativo = true;


-- =====================================================================
-- SEÇÃO K: HABILITAR RLS EM TODAS AS TABELAS
-- =====================================================================
-- Seguro reaplicar — não tem efeito se já estiver habilitado.
ALTER TABLE imobiliarias    ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE corretores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas          ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- SEÇÃO L: POLÍTICAS RLS
-- =====================================================================
-- Estratégia: DROP + CREATE para idempotência total.
-- service_role bypassa RLS automaticamente no Supabase.
-- Operações de escrita (INSERT em leads, historico_leads, UPDATE de
-- distribuição) devem ocorrer via API routes server-side com service_role.
-- Client anon tem acesso zero (default deny sem policy).

-- Remover todas as policies existentes nas tabelas afetadas
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'imobiliarias','usuarios','equipes','corretores',
        'leads','historico_leads','vendas'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------
-- imobiliarias
-- SELECT: usuário vê apenas a sua imobiliária.
-- INSERT/UPDATE/DELETE: sem policy → apenas service_role (onboarding).
-- -----------------------------------------------------------------
CREATE POLICY "imobiliarias_select" ON imobiliarias
  FOR SELECT TO authenticated
  USING (id = current_imobiliaria_id());


-- -----------------------------------------------------------------
-- usuarios
-- SELECT: todos os usuários da mesma imobiliária se enxergam.
-- UPDATE: REMOVIDO — policy usuarios_update_own foi eliminada por
--   risco crítico de escalamento de privilégio: sem restrição de coluna,
--   qualquer corretor poderia executar SET role='admin' no próprio registro.
--   Alterações de perfil (nome, email) devem passar por API route
--   com service_role, que valida explicitamente quais campos são permitidos.
-- INSERT/DELETE: service_role (criação no onboarding, exclusão administrativa).
-- -----------------------------------------------------------------
CREATE POLICY "usuarios_select" ON usuarios
  FOR SELECT TO authenticated
  USING (imobiliaria_id = current_imobiliaria_id());


-- -----------------------------------------------------------------
-- equipes
-- SELECT: qualquer usuário autenticado da imobiliária.
-- INSERT/UPDATE: restrito a admin e gestor.
-- DELETE: sem policy → service_role (protege FK com corretores).
-- -----------------------------------------------------------------
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
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()   -- impede mover equipe para outro tenant
    AND current_user_role() IN ('admin', 'gestor')
  );


-- -----------------------------------------------------------------
-- corretores
-- SELECT admin/gestor: todos os corretores da imobiliária.
-- SELECT corretor: apenas o próprio registro (não vê telefone/email de colegas).
-- INSERT/UPDATE: restrito a admin e gestor.
-- DELETE: service_role (protege FK com leads e vendas existentes).
-- -----------------------------------------------------------------
CREATE POLICY "corretores_select_admin_gestor" ON corretores
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() IN ('admin', 'gestor')
  );

-- Corretor vê apenas o próprio registro de corretor.
-- Acesso via usuario_id = current_usuario_id() (linkado ao login).
-- Se usuario_id for NULL (corretor sem login), a policy retorna false — correto.
CREATE POLICY "corretores_select_corretor" ON corretores
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'corretor'
    AND usuario_id = current_usuario_id()
  );

CREATE POLICY "corretores_insert" ON corretores
  FOR INSERT TO authenticated
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() IN ('admin', 'gestor')
  );

CREATE POLICY "corretores_update" ON corretores
  FOR UPDATE TO authenticated
  USING  (imobiliaria_id = current_imobiliaria_id())
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()   -- impede mover corretor para outro tenant
    AND current_user_role() IN ('admin', 'gestor')
  );


-- -----------------------------------------------------------------
-- leads
-- SELECT admin/gestor: todos os leads da imobiliária.
-- SELECT corretor: apenas leads onde é o corretor atribuído.
-- UPDATE admin/gestor: status, observações, redistribuição manual.
-- INSERT: service_role (criação via API route, não direto do client).
-- DELETE: service_role apenas.
-- -----------------------------------------------------------------
CREATE POLICY "leads_select_admin_gestor" ON leads
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() IN ('admin', 'gestor')
  );

-- Corretor vê apenas leads atribuídos ao seu registro de corretor.
-- Pressuposto MVP: 1 usuario_id → 1 corretor. LIMIT 1 é guard defensivo.
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
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()   -- impede mover lead para outro tenant
    AND current_user_role() IN ('admin', 'gestor')
  );


-- -----------------------------------------------------------------
-- historico_leads
-- SELECT admin/gestor: todo histórico da imobiliária.
-- SELECT corretor: histórico dos seus próprios leads.
-- INSERT/UPDATE/DELETE: service_role (eventos são imutáveis, gerados pelo sistema).
-- -----------------------------------------------------------------
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
      SELECT id FROM leads
      WHERE corretor_id = (
          SELECT id FROM corretores
          WHERE usuario_id = current_usuario_id()
            AND imobiliaria_id = current_imobiliaria_id()
          LIMIT 1
        )
        AND imobiliaria_id = current_imobiliaria_id()
    )
  );


-- -----------------------------------------------------------------
-- vendas
-- SELECT admin/gestor: todas as vendas da imobiliária.
-- SELECT corretor: apenas as suas próprias vendas.
-- INSERT/UPDATE/DELETE: service_role (registro de venda é operação administrativa).
-- -----------------------------------------------------------------
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


COMMIT;


-- =====================================================================
-- AÇÕES MANUAIS OBRIGATÓRIAS APÓS APLICAR
-- =====================================================================
-- Executar estas queries no SQL Editor do Supabase após a migration:

-- 1. Confirmar que a migration rodou (esperar: 7 tabelas com rowsecurity=true)
--    SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- 2. Renomear imobiliária padrão com o nome real:
--    UPDATE imobiliarias SET nome = 'Nome Real da Imobiliária' WHERE nome LIKE 'Imobiliária Padrão%';

-- 3. Definir corretores em plantão (todos os ativos começam como em_plantao=false):
--    UPDATE corretores SET em_plantao = true WHERE ativo = true;
--    (ou selecionar apenas os que realmente estão de plantão agora)

-- 4. Criar usuário admin via Supabase Dashboard:
--    Authentication → Users → Invite user (email do admin)
--    Após aceitar o convite:
--    INSERT INTO usuarios (auth_user_id, imobiliaria_id, nome, email, role)
--    VALUES (
--      '<uuid-do-auth.users>',
--      (SELECT id FROM imobiliarias LIMIT 1),
--      'Nome do Admin',
--      'email@imobiliaria.com',
--      'admin'
--    );

-- 5. Adicionar SUPABASE_SERVICE_ROLE_KEY ao .env.local e à Vercel:
--    SUPABASE_SERVICE_ROLE_KEY=<chave service_role do Supabase Dashboard>
--    (Settings → API → Service Role Key — NUNCA prefixar com NEXT_PUBLIC_)

-- 6. Verificar RLS com anon key (esperar: 0 rows):
--    No SQL Editor, mudar role para "anon" e executar: SELECT * FROM leads;

-- =====================================================================
-- VERIFICAÇÃO COMPLETA PÓS-MIGRATION
-- =====================================================================
-- Tabelas com RLS (esperado: 7 tabelas, rowsecurity=true):
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename;

-- Policies por tabela:
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' ORDER BY tablename, cmd;

-- Funções helper criadas:
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema='public' AND routine_name LIKE 'current_%';

-- imobiliaria_id em todas as tabelas de dados (esperado: 5 tabelas):
-- SELECT table_name FROM information_schema.columns
-- WHERE table_schema='public' AND column_name='imobiliaria_id' ORDER BY table_name;

-- Colunas de corretores (verificar em_plantao, ultimo_lead_recebido_em, usuario_id):
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns WHERE table_name='corretores' ORDER BY ordinal_position;

-- Colunas de leads (verificar telefone_normalizado, distribuido_em):
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name='leads' ORDER BY ordinal_position;
-- =====================================================================
