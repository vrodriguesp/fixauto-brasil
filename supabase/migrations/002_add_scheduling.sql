-- Add scheduling fields to orcamentos
ALTER TABLE orcamentos ADD COLUMN tempo_execucao_horas INTEGER;

-- Disponibilidade (available check-in slots offered by workshop)
CREATE TABLE orcamento_disponibilidade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  data_checkin DATE NOT NULL,
  turno TEXT NOT NULL CHECK (turno IN ('manha', 'tarde')),
  data_previsao_entrega DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track which slot the client chose
ALTER TABLE orcamentos ADD COLUMN disponibilidade_escolhida_id UUID REFERENCES orcamento_disponibilidade(id);

-- RLS
ALTER TABLE orcamento_disponibilidade ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disponibilidade_select" ON orcamento_disponibilidade FOR SELECT USING (true);
CREATE POLICY "disponibilidade_insert" ON orcamento_disponibilidade FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM orcamentos o
    JOIN oficinas of ON of.id = o.oficina_id
    WHERE o.id = orcamento_id AND of.profile_id = auth.uid()
  )
);

CREATE INDEX idx_disponibilidade_orcamento ON orcamento_disponibilidade(orcamento_id);
