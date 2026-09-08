-- Migration 018: comissao sobre venda de pecas + oficina como fornecedora de
-- pecas (vende excedente) + chat cotacao<->fornecedor + capacidade por
-- funcionario.

-- === Oficina pode se inscrever como fornecedora de pecas ===
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS vende_pecas BOOLEAN NOT NULL DEFAULT false;

-- === Generaliza "fornecedor" de peca: loja_pecas OU oficina ===
CREATE TYPE tipo_fornecedor_peca AS ENUM ('loja', 'oficina');

ALTER TABLE cotacoes_pecas_respostas
  ALTER COLUMN loja_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS fornecedor_tipo tipo_fornecedor_peca NOT NULL DEFAULT 'loja',
  ADD COLUMN IF NOT EXISTS oficina_fornecedora_id UUID REFERENCES oficinas(id) ON DELETE CASCADE;

ALTER TABLE cotacoes_pecas_respostas DROP CONSTRAINT IF EXISTS fornecedor_resposta_check;
ALTER TABLE cotacoes_pecas_respostas ADD CONSTRAINT fornecedor_resposta_check CHECK (
  (fornecedor_tipo = 'loja' AND loja_id IS NOT NULL AND oficina_fornecedora_id IS NULL) OR
  (fornecedor_tipo = 'oficina' AND oficina_fornecedora_id IS NOT NULL AND loja_id IS NULL)
);

ALTER TABLE cotacoes_pecas_respostas DROP CONSTRAINT IF EXISTS cotacoes_pecas_respostas_cotacao_id_loja_id_key;
DROP INDEX IF EXISTS cotacoes_respostas_unico_por_fornecedor;
CREATE UNIQUE INDEX cotacoes_respostas_unico_por_fornecedor ON cotacoes_pecas_respostas (
  cotacao_id, fornecedor_tipo, COALESCE(loja_id, oficina_fornecedora_id)
);

ALTER TABLE pedidos_pecas
  ALTER COLUMN loja_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS fornecedor_tipo tipo_fornecedor_peca NOT NULL DEFAULT 'loja',
  ADD COLUMN IF NOT EXISTS oficina_fornecedora_id UUID REFERENCES oficinas(id) ON DELETE CASCADE;

ALTER TABLE pedidos_pecas DROP CONSTRAINT IF EXISTS fornecedor_pedido_check;
ALTER TABLE pedidos_pecas ADD CONSTRAINT fornecedor_pedido_check CHECK (
  (fornecedor_tipo = 'loja' AND loja_id IS NOT NULL AND oficina_fornecedora_id IS NULL) OR
  (fornecedor_tipo = 'oficina' AND oficina_fornecedora_id IS NOT NULL AND loja_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_pedidos_pecas_oficina_fornecedora ON pedidos_pecas(oficina_fornecedora_id);
CREATE INDEX IF NOT EXISTS idx_cotacoes_respostas_oficina_fornecedora ON cotacoes_pecas_respostas(oficina_fornecedora_id);

-- Atualiza policies que dependiam so de loja_id
DROP POLICY IF EXISTS "cotacoes_respostas_select" ON cotacoes_pecas_respostas;
CREATE POLICY "cotacoes_respostas_select" ON cotacoes_pecas_respostas FOR SELECT USING (
  (fornecedor_tipo = 'loja' AND EXISTS (SELECT 1 FROM lojas_pecas WHERE id = loja_id AND profile_id = auth.uid()))
  OR (fornecedor_tipo = 'oficina' AND EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_fornecedora_id AND profile_id = auth.uid()))
  OR EXISTS (
    SELECT 1 FROM cotacoes_pecas c
    JOIN oficinas o ON o.id = c.oficina_id
    WHERE c.id = cotacao_id AND o.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "cotacoes_respostas_insert" ON cotacoes_pecas_respostas;
CREATE POLICY "cotacoes_respostas_insert" ON cotacoes_pecas_respostas FOR INSERT WITH CHECK (
  (fornecedor_tipo = 'loja' AND EXISTS (SELECT 1 FROM lojas_pecas WHERE id = loja_id AND profile_id = auth.uid()))
  OR (fornecedor_tipo = 'oficina' AND EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_fornecedora_id AND profile_id = auth.uid()))
);

DROP POLICY IF EXISTS "pedidos_pecas_select" ON pedidos_pecas;
CREATE POLICY "pedidos_pecas_select" ON pedidos_pecas FOR SELECT USING (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
  OR (fornecedor_tipo = 'loja' AND EXISTS (SELECT 1 FROM lojas_pecas WHERE id = loja_id AND profile_id = auth.uid()))
  OR (fornecedor_tipo = 'oficina' AND EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_fornecedora_id AND profile_id = auth.uid()))
);

DROP POLICY IF EXISTS "pedidos_pecas_update" ON pedidos_pecas;
CREATE POLICY "pedidos_pecas_update" ON pedidos_pecas FOR UPDATE USING (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
  OR (fornecedor_tipo = 'loja' AND EXISTS (SELECT 1 FROM lojas_pecas WHERE id = loja_id AND profile_id = auth.uid()))
  OR (fornecedor_tipo = 'oficina' AND EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_fornecedora_id AND profile_id = auth.uid()))
);

-- === Comissao sobre venda de pecas (loja OU oficina fornecedora) ===
-- Espelha comissao_config/comissao_lancamento (migration 012/016), mas
-- generico por fornecedor_tipo+fornecedor_id pra servir os dois casos.
CREATE TABLE IF NOT EXISTS comissao_pecas_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_tipo tipo_fornecedor_peca NOT NULL,
  fornecedor_id UUID NOT NULL,
  taxa_padrao DECIMAL(5,4) NOT NULL DEFAULT 0.03,
  taxa_calculada DECIMAL(5,4),
  taxa_fixa_override DECIMAL(5,4),
  usa_override BOOLEAN NOT NULL DEFAULT false,
  media_tempo_resposta_horas DECIMAL(6,2),
  total_pedidos_90dias INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(fornecedor_tipo, fornecedor_id)
);

CREATE TABLE IF NOT EXISTS comissao_pecas_lancamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_tipo tipo_fornecedor_peca NOT NULL,
  fornecedor_id UUID NOT NULL,
  pedido_id UUID NOT NULL REFERENCES pedidos_pecas(id) ON DELETE CASCADE UNIQUE,
  valor_pedido DECIMAL(12,2) NOT NULL,
  taxa_aplicada DECIMAL(5,4) NOT NULL,
  valor_comissao DECIMAL(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago')),
  pago_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comissao_pecas_config_fornecedor ON comissao_pecas_config(fornecedor_tipo, fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_comissao_pecas_lancamento_fornecedor ON comissao_pecas_lancamento(fornecedor_tipo, fornecedor_id);

ALTER TABLE comissao_pecas_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE comissao_pecas_lancamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fornecedor_read_own_comissao_pecas_config" ON comissao_pecas_config FOR SELECT USING (
  (fornecedor_tipo = 'loja' AND fornecedor_id IN (SELECT id FROM lojas_pecas WHERE profile_id = auth.uid()))
  OR (fornecedor_tipo = 'oficina' AND fornecedor_id IN (SELECT id FROM oficinas WHERE profile_id = auth.uid()))
);

CREATE POLICY "fornecedor_read_own_comissao_pecas_lancamento" ON comissao_pecas_lancamento FOR SELECT USING (
  (fornecedor_tipo = 'loja' AND fornecedor_id IN (SELECT id FROM lojas_pecas WHERE profile_id = auth.uid()))
  OR (fornecedor_tipo = 'oficina' AND fornecedor_id IN (SELECT id FROM oficinas WHERE profile_id = auth.uid()))
);

-- === Chat entre oficina (dona da cotacao) e cada fornecedor que respondeu ===
-- Uma cotacao pode ter varias respostas (uma por fornecedor); a conversa e
-- por par (cotacao, fornecedor) pra nao vazar entre concorrentes, igual ao
-- "lance fechado" das respostas.
CREATE TABLE IF NOT EXISTS cotacoes_pecas_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id UUID NOT NULL REFERENCES cotacoes_pecas(id) ON DELETE CASCADE,
  fornecedor_tipo tipo_fornecedor_peca NOT NULL,
  fornecedor_id UUID NOT NULL,
  remetente_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  texto TEXT,
  imagem_url TEXT,
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pecas_mensagens_thread ON cotacoes_pecas_mensagens(cotacao_id, fornecedor_tipo, fornecedor_id, created_at);

ALTER TABLE cotacoes_pecas_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pecas_mensagens_select" ON cotacoes_pecas_mensagens FOR SELECT USING (
  (fornecedor_tipo = 'loja' AND EXISTS (SELECT 1 FROM lojas_pecas WHERE id = fornecedor_id AND profile_id = auth.uid()))
  OR (fornecedor_tipo = 'oficina' AND EXISTS (SELECT 1 FROM oficinas WHERE id = fornecedor_id AND profile_id = auth.uid()))
  OR EXISTS (
    SELECT 1 FROM cotacoes_pecas c
    JOIN oficinas o ON o.id = c.oficina_id
    WHERE c.id = cotacao_id AND o.profile_id = auth.uid()
  )
);
CREATE POLICY "pecas_mensagens_insert" ON cotacoes_pecas_mensagens FOR INSERT WITH CHECK (auth.uid() = remetente_id);
CREATE POLICY "pecas_mensagens_update" ON cotacoes_pecas_mensagens FOR UPDATE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE cotacoes_pecas_mensagens;

-- === Gestao de capacidade por funcionario ===
-- Numero maximo de veiculos que um funcionario (mecanico) consegue atender
-- simultaneamente. NULL = sem limite definido (nao entra na conta).
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS capacidade_maxima INTEGER;
