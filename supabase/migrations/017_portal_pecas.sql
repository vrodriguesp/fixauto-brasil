-- Migration 017: Portal de pecas (oficina <-> loja de pecas)
-- Piloto: so cotacao e pedido, sem pagamento pela plataforma.

ALTER TYPE tipo_usuario ADD VALUE IF NOT EXISTS 'loja_pecas';

CREATE TYPE status_cotacao_peca AS ENUM ('aberta', 'respondida', 'fechada', 'cancelada');
CREATE TYPE status_pedido_peca AS ENUM ('confirmado', 'entregue', 'cancelado');

CREATE TABLE IF NOT EXISTS lojas_pecas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nome_fantasia TEXT NOT NULL,
  cnpj TEXT,
  endereco TEXT NOT NULL,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL,
  cep TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  raio_atendimento_km INTEGER NOT NULL DEFAULT 30,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pecas_catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id UUID NOT NULL REFERENCES lojas_pecas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  fipe_marca TEXT,
  fipe_modelo TEXT,
  fipe_ano TEXT,
  preco NUMERIC(12,2) NOT NULL,
  quantidade_estoque INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cotacoes_pecas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  peca_descricao TEXT NOT NULL,
  fipe_marca TEXT,
  fipe_modelo TEXT,
  fipe_ano TEXT,
  quantidade INTEGER NOT NULL DEFAULT 1,
  status status_cotacao_peca NOT NULL DEFAULT 'aberta',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cotacoes_pecas_respostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id UUID NOT NULL REFERENCES cotacoes_pecas(id) ON DELETE CASCADE,
  loja_id UUID NOT NULL REFERENCES lojas_pecas(id) ON DELETE CASCADE,
  peca_catalogo_id UUID REFERENCES pecas_catalogo(id) ON DELETE SET NULL,
  preco NUMERIC(12,2) NOT NULL,
  prazo_dias INTEGER NOT NULL DEFAULT 1,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cotacao_id, loja_id)
);

CREATE TABLE IF NOT EXISTS pedidos_pecas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id UUID NOT NULL REFERENCES cotacoes_pecas(id) ON DELETE CASCADE,
  resposta_id UUID NOT NULL REFERENCES cotacoes_pecas_respostas(id) ON DELETE CASCADE,
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  loja_id UUID NOT NULL REFERENCES lojas_pecas(id) ON DELETE CASCADE,
  preco_total NUMERIC(12,2) NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  status status_pedido_peca NOT NULL DEFAULT 'confirmado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lojas_pecas_profile ON lojas_pecas(profile_id);
CREATE INDEX IF NOT EXISTS idx_pecas_catalogo_loja ON pecas_catalogo(loja_id);
CREATE INDEX IF NOT EXISTS idx_cotacoes_pecas_oficina ON cotacoes_pecas(oficina_id);
CREATE INDEX IF NOT EXISTS idx_cotacoes_pecas_status ON cotacoes_pecas(status);
CREATE INDEX IF NOT EXISTS idx_cotacoes_respostas_cotacao ON cotacoes_pecas_respostas(cotacao_id);
CREATE INDEX IF NOT EXISTS idx_cotacoes_respostas_loja ON cotacoes_pecas_respostas(loja_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_pecas_oficina ON pedidos_pecas(oficina_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_pecas_loja ON pedidos_pecas(loja_id);

-- === RLS ===
ALTER TABLE lojas_pecas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pecas_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotacoes_pecas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotacoes_pecas_respostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_pecas ENABLE ROW LEVEL SECURITY;

-- lojas_pecas: qualquer um pode ver (perfil publico, como oficinas), so a
-- propria loja pode criar/editar
CREATE POLICY "lojas_pecas_select" ON lojas_pecas FOR SELECT USING (true);
CREATE POLICY "lojas_pecas_insert" ON lojas_pecas FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "lojas_pecas_update" ON lojas_pecas FOR UPDATE USING (auth.uid() = profile_id);

-- pecas_catalogo: catalogo e publico (oficinas navegam estoque excedente),
-- so a loja dona pode criar/editar/remover
CREATE POLICY "pecas_catalogo_select" ON pecas_catalogo FOR SELECT USING (true);
CREATE POLICY "pecas_catalogo_insert" ON pecas_catalogo FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM lojas_pecas WHERE id = loja_id AND profile_id = auth.uid())
);
CREATE POLICY "pecas_catalogo_update" ON pecas_catalogo FOR UPDATE USING (
  EXISTS (SELECT 1 FROM lojas_pecas WHERE id = loja_id AND profile_id = auth.uid())
);
CREATE POLICY "pecas_catalogo_delete" ON pecas_catalogo FOR DELETE USING (
  EXISTS (SELECT 1 FROM lojas_pecas WHERE id = loja_id AND profile_id = auth.uid())
);

-- cotacoes_pecas: publica pra leitura (lojas precisam navegar cotacoes
-- abertas pra responder, como oficinas navegam solicitacoes de cliente),
-- so a oficina dona pode criar/cancelar
CREATE POLICY "cotacoes_pecas_select" ON cotacoes_pecas FOR SELECT USING (true);
CREATE POLICY "cotacoes_pecas_insert" ON cotacoes_pecas FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
);
CREATE POLICY "cotacoes_pecas_update" ON cotacoes_pecas FOR UPDATE USING (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
);

-- cotacoes_pecas_respostas: a oficina dona da cotacao ve todas as
-- respostas; cada loja so ve a propria resposta (cotacao tipo lance
-- fechado, lojas nao veem preco da concorrencia)
CREATE POLICY "cotacoes_respostas_select" ON cotacoes_pecas_respostas FOR SELECT USING (
  EXISTS (SELECT 1 FROM lojas_pecas WHERE id = loja_id AND profile_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM cotacoes_pecas c
    JOIN oficinas o ON o.id = c.oficina_id
    WHERE c.id = cotacao_id AND o.profile_id = auth.uid()
  )
);
CREATE POLICY "cotacoes_respostas_insert" ON cotacoes_pecas_respostas FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM lojas_pecas WHERE id = loja_id AND profile_id = auth.uid())
);

-- pedidos_pecas: visivel pras duas partes envolvidas
CREATE POLICY "pedidos_pecas_select" ON pedidos_pecas FOR SELECT USING (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
  OR EXISTS (SELECT 1 FROM lojas_pecas WHERE id = loja_id AND profile_id = auth.uid())
);
CREATE POLICY "pedidos_pecas_insert" ON pedidos_pecas FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
);
CREATE POLICY "pedidos_pecas_update" ON pedidos_pecas FOR UPDATE USING (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
  OR EXISTS (SELECT 1 FROM lojas_pecas WHERE id = loja_id AND profile_id = auth.uid())
);
