-- Migration 008 — adiciona status ativo em imobiliarias
-- Lead Master IA
--
-- Esta migration registra no repositório a coluna criada no Supabase
-- para compatibilizar /setup-cliente com a tabela imobiliarias.

ALTER TABLE imobiliarias
ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
