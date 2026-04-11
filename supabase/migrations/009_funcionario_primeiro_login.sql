-- Migration 009: Adicionar primeiro_login na tabela funcionarios
ALTER TABLE funcionarios ADD COLUMN primeiro_login BOOLEAN DEFAULT true;
