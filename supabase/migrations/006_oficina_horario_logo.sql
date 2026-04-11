-- Add working hours and logo to oficinas
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS horario_funcionamento JSONB DEFAULT '{"seg":{"aberto":true,"inicio":"08:00","fim":"18:00"},"ter":{"aberto":true,"inicio":"08:00","fim":"18:00"},"qua":{"aberto":true,"inicio":"08:00","fim":"18:00"},"qui":{"aberto":true,"inicio":"08:00","fim":"18:00"},"sex":{"aberto":true,"inicio":"08:00","fim":"18:00"},"sab":{"aberto":true,"inicio":"08:00","fim":"12:00"},"dom":{"aberto":false,"inicio":"","fim":""}}';
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add previous_nota to avaliacoes for tracking changes
ALTER TABLE avaliacoes ADD COLUMN IF NOT EXISTS nota_anterior INTEGER;
ALTER TABLE avaliacoes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Messages table for client-workshop communication
CREATE TABLE IF NOT EXISTS mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id UUID NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  remetente_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  lida BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensagens_solicitacao ON mensagens(solicitacao_id);
ALTER TABLE mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mensagens_select" ON mensagens FOR SELECT USING (true);
CREATE POLICY "mensagens_insert" ON mensagens FOR INSERT WITH CHECK (auth.uid() = remetente_id);
CREATE POLICY "mensagens_update" ON mensagens FOR UPDATE USING (true);
