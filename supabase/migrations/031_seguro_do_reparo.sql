-- 031: quem paga o reparo (2026-09-30).
-- No acidente o motorista diz quem vai pagar: ele mesmo, o seguro do outro
-- motorista, o proprio seguro (kasko / seguro auto) ou "ainda nao sei"; com
-- seguro, a seguradora, o numero do sinistro e a franquia (opcionais, podem
-- ser completados depois). A oficina ve isso no pedido: sabe de antemao que o
-- orcamento vai para a seguradora aprovar e quem paga.
-- Gravado pelo servidor (/api/emergencia...), lido pelas regras que ja valem
-- para a solicitacao (028).
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS pagamento_reparo TEXT
  CHECK (pagamento_reparo IN ('proprio', 'seguro_terceiro', 'seguro_proprio', 'nao_sei'));
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS seguradora TEXT CHECK (char_length(seguradora) <= 100);
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS sinistro_numero TEXT CHECK (char_length(sinistro_numero) <= 60);
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS franquia DECIMAL(10,2) CHECK (franquia IS NULL OR franquia >= 0);
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS seguro_atualizado_em TIMESTAMPTZ;
