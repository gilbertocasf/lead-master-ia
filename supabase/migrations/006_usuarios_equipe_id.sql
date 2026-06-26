-- =====================================================================
-- Migration 006 — Vínculo gestor → equipe via usuarios.equipe_id
-- Lead Master IA · BASILIO IMÓVEIS
-- =====================================================================
-- ATENÇÃO: NÃO executar automaticamente. Aplicar via SQL Editor do Supabase.
--
-- O QUE ESTA MIGRATION FAZ:
--   ✔ Adiciona coluna equipe_id em usuarios (FK para equipes, nullable)
--   ✔ Cria índice idx_usuarios_equipe
--
-- O QUE ESTA MIGRATION NÃO FAZ:
--   ✗ Não altera outras tabelas
--   ✗ Não cria ou altera RLS
--   ✗ Não altera policies
--   ✗ Não altera enums, triggers, funções ou RPCs
--   ✗ Não altera seed
--   ✗ Não executa nenhum comando destrutivo
--
-- IDEMPOTÊNCIA:
--   Segura para reaplicar. Usa ADD COLUMN IF NOT EXISTS e CREATE INDEX IF NOT EXISTS.
--
-- AÇÕES MANUAIS APÓS APLICAR:
--   1. Preencher equipe_id dos gestores existentes (ver SQL no final deste arquivo).
--   2. Verificar via SELECT que o vínculo foi aplicado corretamente.
-- =====================================================================

-- 1. Adicionar coluna equipe_id em usuarios
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS equipe_id UUID REFERENCES equipes(id) ON DELETE SET NULL;

-- 2. Índice para lookup por equipe
CREATE INDEX IF NOT EXISTS idx_usuarios_equipe ON usuarios(equipe_id);

-- 3. Comentário de documentação
COMMENT ON COLUMN usuarios.equipe_id IS
  'Para role = gestor: UUID da equipe que este usuário gerencia. '
  'A API usa este campo para restringir o escopo operacional do gestor. '
  'Para role = admin: deve ser NULL (admin vê e opera todas as equipes). '
  'Para role = corretor: equipe é resolvida via corretores.usuario_id — este campo não é utilizado.';

-- =====================================================================
-- SQL MANUAL DE PREENCHIMENTO (executar separadamente após a migration)
-- =====================================================================
-- Descubra o id de cada equipe:
--   SELECT id, nome FROM equipes;
--
-- Vincule cada gestor à sua equipe (substitua os UUIDs reais):
--   UPDATE usuarios
--     SET equipe_id = '<uuid-da-equipe>'
--     WHERE auth_user_id = '<uuid-auth-do-gestor>'
--       AND role = 'gestor';
--
-- Verifique o resultado:
--   SELECT u.nome, u.role, u.equipe_id, e.nome AS equipe_nome
--   FROM usuarios u
--   LEFT JOIN equipes e ON e.id = u.equipe_id
--   ORDER BY u.role, u.nome;
-- =====================================================================
