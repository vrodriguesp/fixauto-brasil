-- SMS do admin as OFICINAS avisadas de um pedido que ainda nao abriram (dono 20/11):
-- "Oficinas avisadas" no detalhe do pedido do admin (lib/sms-oficinas.ts). Cada tentativa
-- vai para sms_envios com tipo 'oficina_manual' (profile_id = dono da oficina).
-- Numero 111: o lote 6 das pecas ja usa 107-110; assim nao colide nos dois ramos.
-- So aditiva e idempotente: o CHECK passa a aceitar o tipo novo (os antigos continuam);
-- pode ser aplicada antes do build (o codigo atual so grava 'orcamento_auto'/'manual').

ALTER TABLE sms_envios DROP CONSTRAINT IF EXISTS sms_envios_tipo_check;
ALTER TABLE sms_envios ADD CONSTRAINT sms_envios_tipo_check
  CHECK (tipo IN ('orcamento_auto', 'manual', 'oficina_manual'));

-- "ultimo SMS desta oficina neste pedido" e a trava das 12 h leem por pedido
CREATE INDEX IF NOT EXISTS sms_envios_solicitacao_idx ON sms_envios (solicitacao_id, created_at DESC);
