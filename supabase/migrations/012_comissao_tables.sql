-- Comissao config per oficina
CREATE TABLE IF NOT EXISTS comissao_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE UNIQUE,
  taxa_padrao DECIMAL(5,4) NOT NULL DEFAULT 0.10,
  taxa_fixa_override DECIMAL(5,4),
  usa_override BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comissao lancamentos (individual commission entries)
CREATE TABLE IF NOT EXISTS comissao_lancamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  orcamento_id UUID NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  valor_servico DECIMAL(12,2) NOT NULL,
  taxa_aplicada DECIMAL(5,4) NOT NULL,
  valor_comissao DECIMAL(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago')),
  pago_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comissao_config_oficina ON comissao_config(oficina_id);
CREATE INDEX IF NOT EXISTS idx_comissao_lancamento_oficina ON comissao_lancamento(oficina_id);
CREATE INDEX IF NOT EXISTS idx_comissao_lancamento_status ON comissao_lancamento(status);

-- RLS
ALTER TABLE comissao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE comissao_lancamento ENABLE ROW LEVEL SECURITY;

-- Admin can read/write all (using service_role bypasses RLS)
-- Oficina owners can read their own config
CREATE POLICY "oficina_read_own_comissao_config" ON comissao_config
  FOR SELECT USING (
    oficina_id IN (SELECT id FROM oficinas WHERE profile_id = auth.uid())
  );

CREATE POLICY "oficina_read_own_comissao_lancamento" ON comissao_lancamento
  FOR SELECT USING (
    oficina_id IN (SELECT id FROM oficinas WHERE profile_id = auth.uid())
  );
