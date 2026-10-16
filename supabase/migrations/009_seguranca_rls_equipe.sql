-- =====================================================================
-- Migration 009 — Segurança: RPCs só pelo servidor + gestor limitado à equipe
-- Lead Master IA
-- Data: 2026-10-15
-- =====================================================================
-- ATENÇÃO: Aplicar via SQL Editor do Supabase. NÃO via CLI.
-- Ordem: 009 → 010 → 011 (ver docs/setup/aplicar-migrations-009-011.md).
-- O arquivo inteiro roda em uma única transação (BEGIN ... COMMIT).
--
-- O QUE ESTA MIGRATION FAZ:
--   ✔ Fecha as RPCs alterar_status_lead(jsonb) e criar_e_distribuir_lead(jsonb)
--     para anon e authenticated. No Supabase, toda função criada em `public`
--     recebe EXECUTE DIRETO para anon e authenticated (privilégio padrão do
--     schema). O "REVOKE ... FROM PUBLIC" da 007 não remove essas concessões
--     diretas — por isso aqui o REVOKE cita PUBLIC, anon e authenticated.
--     Só o service_role (usado pelas rotas do servidor) continua executando.
--   ✔ Cria current_equipe_id(): equipe do usuário autenticado e ativo
--     (mesmo padrão de current_imobiliaria_id / current_user_role).
--   ✔ Limita o gestor à própria equipe (admin continua vendo a imobiliária):
--       corretores      SELECT admin = imobiliária; gestor = própria equipe
--                       INSERT/UPDATE só admin
--       equipes         SELECT inalterado (imobiliária); INSERT/UPDATE só admin
--       leads           SELECT e UPDATE: admin = imobiliária; gestor = própria equipe
--       historico_leads SELECT admin = imobiliária; gestor = leads da própria equipe
--       vendas          SELECT admin = imobiliária; gestor = vendas de corretores
--                       da própria equipe
--   ✔ Gestor com usuarios.equipe_id NULL não vê nenhum corretor, lead,
--     histórico ou venda: a comparação "x = NULL" é NULL (nunca verdadeira).
--
-- O QUE ESTA MIGRATION NÃO FAZ:
--   ✗ Não altera as policies de corretor (*_select_corretor) nem de captador
--     (*_select_captador) — continuam exatamente como na 002 e na 007
--   ✗ Não altera imobiliarias_select, usuarios_select nem equipes_select
--   ✗ Não revoga current_imobiliaria_id / current_user_role / current_usuario_id
--     (as policies dependem delas para o papel authenticated)
--   ✗ Não altera tabelas, colunas nem dados
--
-- IMPACTO ESPERADO NO APP:
--   As escritas do app já passam pelo service_role (rotas /api/*), que ignora
--   RLS — nada muda nelas. As telas lidas com o cliente do usuário passam a
--   mostrar ao gestor somente a própria equipe (leads, corretores, vendas,
--   ranking). Isso é o comportamento desejado.
--
-- IDEMPOTÊNCIA:
--   Segura para reaplicar. CREATE OR REPLACE, DROP POLICY IF EXISTS antes de
--   cada CREATE POLICY, REVOKE/GRANT são idempotentes.
-- =====================================================================


BEGIN;


-- =====================================================================
-- SEÇÃO A: RPCs DE ESCRITA SÓ PARA O SERVICE_ROLE
-- =====================================================================
-- As rotas do app chamam estas funções com o admin client (service_role).
-- Um usuário logado NÃO pode chamá-las direto por /rest/v1/rpc/..., senão
-- passaria por cima das regras de papel que as rotas aplicam.

REVOKE ALL ON FUNCTION alterar_status_lead(JSONB)      FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION alterar_status_lead(JSONB)   TO service_role;

REVOKE ALL ON FUNCTION criar_e_distribuir_lead(JSONB)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION criar_e_distribuir_lead(JSONB) TO service_role;


-- =====================================================================
-- SEÇÃO B: FUNÇÃO HELPER current_equipe_id()
-- =====================================================================
-- Mesmo padrão das funções current_* da 002:
--   SECURITY DEFINER → lê usuarios sem disparar o RLS de usuarios (sem recursão)
--   STABLE           → o PostgreSQL pode reaproveitar o resultado na mesma query
--   search_path fixo → impede que um search_path manipulado troque a tabela lida
-- Retorna NULL para admin (equipe_id NULL), para usuário inativo e para
-- quem não está logado.
CREATE OR REPLACE FUNCTION current_equipe_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT equipe_id FROM usuarios
  WHERE auth_user_id = auth.uid() AND ativo = true
  LIMIT 1
$$;

COMMENT ON FUNCTION current_equipe_id()
  IS 'equipe_id (usuarios.equipe_id) do usuário autenticado e ativo. Usado nas policies de gestor. NULL para admin e para gestor sem equipe.';

-- Precisa ser executável pelo papel authenticated (as policies rodam com ele).
-- O Supabase já concede por padrão; o GRANT explícito documenta a intenção.
GRANT EXECUTE ON FUNCTION current_equipe_id() TO authenticated, service_role;


-- =====================================================================
-- SEÇÃO C: corretores
-- =====================================================================
-- Substitui corretores_select_admin_gestor (002) por duas policies.
-- Mantidas intactas: corretores_select_corretor (002), corretores_select_captador (007).
DROP POLICY IF EXISTS "corretores_select_admin_gestor" ON corretores;
DROP POLICY IF EXISTS "corretores_select_admin"        ON corretores;
DROP POLICY IF EXISTS "corretores_select_gestor"       ON corretores;

CREATE POLICY "corretores_select_admin" ON corretores
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'admin'
  );

-- Gestor: só corretores da própria equipe. equipe_id NULL → nenhum corretor.
CREATE POLICY "corretores_select_gestor" ON corretores
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'gestor'
    AND equipe_id = current_equipe_id()
  );

-- INSERT/UPDATE: só admin (as rotas usam service_role e não dependem disto).
DROP POLICY IF EXISTS "corretores_insert" ON corretores;
CREATE POLICY "corretores_insert" ON corretores
  FOR INSERT TO authenticated
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "corretores_update" ON corretores;
CREATE POLICY "corretores_update" ON corretores
  FOR UPDATE TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'admin'
  )
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()   -- impede mover corretor para outro tenant
    AND current_user_role() = 'admin'
  );


-- =====================================================================
-- SEÇÃO D: equipes
-- =====================================================================
-- equipes_select (002) fica como está: todos da imobiliária veem as equipes.
DROP POLICY IF EXISTS "equipes_insert" ON equipes;
CREATE POLICY "equipes_insert" ON equipes
  FOR INSERT TO authenticated
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "equipes_update" ON equipes;
CREATE POLICY "equipes_update" ON equipes
  FOR UPDATE TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'admin'
  )
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()   -- impede mover equipe para outro tenant
    AND current_user_role() = 'admin'
  );


-- =====================================================================
-- SEÇÃO E: leads
-- =====================================================================
-- Substitui leads_select_admin_gestor e leads_update_admin_gestor (002).
-- Mantidas intactas: leads_select_corretor (002), leads_select_captador (007).
DROP POLICY IF EXISTS "leads_select_admin_gestor" ON leads;
DROP POLICY IF EXISTS "leads_select_admin"        ON leads;
DROP POLICY IF EXISTS "leads_select_gestor"       ON leads;

CREATE POLICY "leads_select_admin" ON leads
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'admin'
  );

-- Gestor: só leads da própria equipe. equipe_id NULL → nenhum lead.
CREATE POLICY "leads_select_gestor" ON leads
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'gestor'
    AND equipe_id = current_equipe_id()
  );

DROP POLICY IF EXISTS "leads_update_admin_gestor" ON leads;
DROP POLICY IF EXISTS "leads_update_admin"        ON leads;
DROP POLICY IF EXISTS "leads_update_gestor"       ON leads;

-- Admin: qualquer lead da imobiliária. O corretor atribuído (se houver)
-- também precisa ser da imobiliária — a subconsulta roda com o RLS do
-- próprio usuário, então só enxerga corretores do tenant.
CREATE POLICY "leads_update_admin" ON leads
  FOR UPDATE TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'admin'
  )
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()   -- impede mover lead para outro tenant
    AND current_user_role() = 'admin'
    AND (
      corretor_id IS NULL
      OR corretor_id IN (
        SELECT id FROM corretores
        WHERE imobiliaria_id = current_imobiliaria_id()
      )
    )
  );

-- Gestor: só leads da própria equipe, sem poder mover o lead para outra
-- equipe nem entregá-lo a corretor de outra equipe.
CREATE POLICY "leads_update_gestor" ON leads
  FOR UPDATE TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'gestor'
    AND equipe_id = current_equipe_id()
  )
  WITH CHECK (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'gestor'
    AND equipe_id = current_equipe_id()
    AND (
      corretor_id IS NULL
      OR corretor_id IN (
        SELECT id FROM corretores
        WHERE imobiliaria_id = current_imobiliaria_id()
          AND equipe_id      = current_equipe_id()
      )
    )
  );


-- =====================================================================
-- SEÇÃO F: historico_leads
-- =====================================================================
-- Substitui historico_select_admin_gestor (002).
-- Mantida intacta: historico_select_corretor (002).
DROP POLICY IF EXISTS "historico_select_admin_gestor" ON historico_leads;
DROP POLICY IF EXISTS "historico_select_admin"        ON historico_leads;
DROP POLICY IF EXISTS "historico_select_gestor"       ON historico_leads;

CREATE POLICY "historico_select_admin" ON historico_leads
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'admin'
  );

-- Gestor: histórico dos leads da própria equipe. equipe_id NULL → nada.
CREATE POLICY "historico_select_gestor" ON historico_leads
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'gestor'
    AND lead_id IN (
      SELECT id FROM leads
      WHERE equipe_id      = current_equipe_id()
        AND imobiliaria_id = current_imobiliaria_id()
    )
  );


-- =====================================================================
-- SEÇÃO G: vendas
-- =====================================================================
-- Substitui vendas_select_admin_gestor (002).
-- Mantidas intactas: vendas_select_corretor (002), vendas_select_captador (007).
DROP POLICY IF EXISTS "vendas_select_admin_gestor" ON vendas;
DROP POLICY IF EXISTS "vendas_select_admin"        ON vendas;
DROP POLICY IF EXISTS "vendas_select_gestor"       ON vendas;

CREATE POLICY "vendas_select_admin" ON vendas
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'admin'
  );

-- Gestor: vendas de corretores da própria equipe. equipe_id NULL → nada.
CREATE POLICY "vendas_select_gestor" ON vendas
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'gestor'
    AND corretor_id IN (
      SELECT id FROM corretores
      WHERE equipe_id      = current_equipe_id()
        AND imobiliaria_id = current_imobiliaria_id()
    )
  );


COMMIT;


-- =====================================================================
-- VERIFICAÇÃO RÁPIDA (rodar depois, separadamente)
-- =====================================================================
-- Esperado: false, false, true (para cada uma das duas funções)
-- SELECT has_function_privilege('anon',          'alterar_status_lead(jsonb)', 'execute'),
--        has_function_privilege('authenticated', 'alterar_status_lead(jsonb)', 'execute'),
--        has_function_privilege('service_role',  'alterar_status_lead(jsonb)', 'execute');
--
-- Policies (não deve aparecer nenhuma *_admin_gestor):
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename, cmd, policyname;
-- =====================================================================
