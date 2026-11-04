-- SMS ao cliente (dono 04/11): aviso de servico "chegou orcamento" via Twilio,
-- so Estonia. Interruptor no admin (desligar quando o app estiver na loja: quem
-- tem o app recebe o push) e registro de cada envio/pulo para o admin ver e para
-- o envio manual pelo numero do pedido.

ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS sms_ativo boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS sms_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid REFERENCES solicitacoes(id) ON DELETE SET NULL,
  orcamento_id uuid REFERENCES orcamentos(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  -- so o final do numero (o admin reconhece sem guardar o numero de novo)
  telefone_final text,
  tipo text NOT NULL CHECK (tipo IN ('orcamento_auto', 'manual')),
  status text NOT NULL CHECK (status IN ('enviado', 'recusado', 'pulado')),
  motivo text,
  twilio_sid text,
  enviado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_envios_created_idx ON sms_envios (created_at DESC);
CREATE INDEX IF NOT EXISTS sms_envios_orcamento_idx ON sms_envios (orcamento_id);

-- so o servidor (service role) le e escreve
ALTER TABLE sms_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sms_envios FROM anon, authenticated;
