-- O cliente cancela o proprio pedido (dono 09/11, item 52): ate o carro chegar na oficina.
-- Quando e por que (opcional: resolvido / outra_oficina / desisti / outro ou texto curto).
-- A mudanca de status e feita pela API (/api/solicitacoes/[id]/cancelar e /reabrir) com a
-- chave de servico; o gatilho proteger_solicitacao continua valendo para chamadas do usuario.
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS cancelada_em timestamptz;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS motivo_cancelamento text;
DO $$ BEGIN
  ALTER TABLE solicitacoes ADD CONSTRAINT solicitacoes_motivo_cancelamento_check CHECK (motivo_cancelamento IS NULL OR char_length(motivo_cancelamento) <= 200);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
