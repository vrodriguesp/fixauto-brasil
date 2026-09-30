-- 033: descricao da oficina (texto livre do dono, aparece no perfil publico) - 2026-09-30
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS descricao TEXT CHECK (descricao IS NULL OR char_length(descricao) <= 1000);
