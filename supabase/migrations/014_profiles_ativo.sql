-- Migration 014: Permitir admin desativar contas (cliente, oficina, funcionario)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_profiles_ativo ON profiles(ativo) WHERE ativo = false;
