-- 034: pedido de peca com descricao e fotos (relato do teste, 01/10/2026).
-- Fotos ficam no bucket publico, pasta da propria oficina
-- (oficinas/<oficina>/pecas/<cotacao>/...), que a regra publico_insert ja permite.
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS observacao TEXT CHECK (observacao IS NULL OR char_length(observacao) <= 1000);
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS fotos TEXT[] NOT NULL DEFAULT '{}';
