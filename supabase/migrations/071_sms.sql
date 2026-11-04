-- SMS ao cliente (dono 04/11): aviso de servico "chegou orcamento" via Twilio,
-- so Estonia. Interruptor no admin (desligar quando o app estiver na loja: quem
-- tem o app recebe o push) e registro de cada envio/pulo para o admin ver e para
-- o envio manual pelo numero do pedido.

ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS sms_ativo boolean NOT NULL DEFAULT true;
-- orcamento criado antes disto nunca gera SMS automatico (dono 04/11: quem ja
-- estava cotado recebe so pelo envio manual) - a data e a da migracao
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS sms_desde timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS sms_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid REFERENCES solicitacoes(id) ON DELETE SET NULL,
  orcamento_id uuid REFERENCES orcamentos(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  -- so o final do numero (o admin reconhece sem guardar o numero de novo)
  telefone_final text,
  tipo text NOT NULL CHECK (tipo IN ('orcamento_auto', 'manual')),
  -- 'enviando' = reserva antes de chamar a Twilio (ver indice unico abaixo)
  status text NOT NULL CHECK (status IN ('enviando', 'enviado', 'recusado', 'pulado')),
  motivo text,
  twilio_sid text,
  enviado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_envios_created_idx ON sms_envios (created_at DESC);
CREATE INDEX IF NOT EXISTS sms_envios_orcamento_idx ON sms_envios (orcamento_id);
-- no maximo 1 SMS automatico por orcamento, mesmo com dois avisos ao mesmo tempo
-- (auditoria Fable 04/11): a reserva 'enviando' entra antes da Twilio
CREATE UNIQUE INDEX IF NOT EXISTS sms_envios_auto_unico ON sms_envios (orcamento_id)
  WHERE tipo = 'orcamento_auto' AND status IN ('enviando', 'enviado');

-- so o servidor (service role) le e escreve
ALTER TABLE sms_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sms_envios FROM anon, authenticated;
