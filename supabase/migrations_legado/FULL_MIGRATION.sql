-- =================================================================
-- FIXAUTO BRASIL - FULL DATABASE MIGRATION
-- Copy this ENTIRE file and paste it in Supabase SQL Editor
-- Then click "Run" (Ctrl+Enter)
-- =================================================================

-- === ENUMS ===
CREATE TYPE tipo_usuario AS ENUM ('cliente', 'oficina');
CREATE TYPE tipo_servico AS ENUM ('colisao', 'funilaria', 'revisao', 'mecanica', 'eletrica', 'pneu', 'outro');
CREATE TYPE urgencia AS ENUM ('baixa', 'media', 'alta');
CREATE TYPE status_solicitacao AS ENUM ('aberta', 'em_orcamento', 'aceita', 'em_andamento', 'concluida', 'cancelada');
CREATE TYPE status_orcamento AS ENUM ('enviado', 'visualizado', 'aceito', 'recusado', 'expirado');
CREATE TYPE tipo_item_orcamento AS ENUM ('mao_de_obra', 'peca', 'material', 'outro');
CREATE TYPE tipo_agenda AS ENUM ('plataforma', 'externo');
CREATE TYPE status_agenda AS ENUM ('agendado', 'em_andamento', 'concluido', 'cancelado');

-- === TABLES ===

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo tipo_usuario NOT NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE oficinas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nome_fantasia TEXT NOT NULL,
  cnpj TEXT,
  endereco TEXT NOT NULL,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL,
  cep TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  raio_atendimento_km INTEGER DEFAULT 30,
  especialidades tipo_servico[] DEFAULT '{}',
  avaliacao_media NUMERIC(2,1) DEFAULT 0,
  total_avaliacoes INTEGER DEFAULT 0,
  ativa BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id)
);

CREATE TABLE veiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  fipe_tipo TEXT NOT NULL,
  fipe_marca TEXT NOT NULL,
  fipe_modelo TEXT NOT NULL,
  fipe_ano TEXT NOT NULL,
  fipe_codigo TEXT,
  fipe_valor TEXT,
  placa TEXT,
  cor TEXT,
  apelido TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE solicitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  veiculo_id UUID NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  tipo tipo_servico NOT NULL,
  descricao TEXT NOT NULL,
  urgencia urgencia NOT NULL DEFAULT 'media',
  status status_solicitacao NOT NULL DEFAULT 'aberta',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  endereco TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE solicitacao_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id UUID NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  foto_url TEXT NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id UUID NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  status status_orcamento NOT NULL DEFAULT 'enviado',
  valor_total NUMERIC(10,2) NOT NULL,
  prazo_dias INTEGER NOT NULL,
  tempo_execucao_horas INTEGER,
  observacoes TEXT,
  validade DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(solicitacao_id, oficina_id)
);

CREATE TABLE orcamento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  tipo tipo_item_orcamento NOT NULL,
  valor_unitario NUMERIC(10,2) NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  valor_total NUMERIC(10,2) NOT NULL
);

CREATE TABLE orcamento_disponibilidade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  data_checkin DATE NOT NULL,
  turno TEXT NOT NULL CHECK (turno IN ('manha', 'tarde')),
  data_previsao_entrega DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE orcamentos ADD COLUMN disponibilidade_escolhida_id UUID REFERENCES orcamento_disponibilidade(id);

CREATE TABLE agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  solicitacao_id UUID REFERENCES solicitacoes(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  data_inicio TIMESTAMPTZ NOT NULL,
  data_fim TIMESTAMPTZ NOT NULL,
  tipo tipo_agenda NOT NULL DEFAULT 'externo',
  status status_agenda NOT NULL DEFAULT 'agendado',
  cor TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE avaliacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id UUID NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  nota INTEGER NOT NULL CHECK (nota >= 1 AND nota <= 5),
  comentario TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(solicitacao_id, cliente_id)
);

CREATE TABLE notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  lida BOOLEAN DEFAULT false,
  dados JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- === INDEXES ===
CREATE INDEX idx_oficinas_location ON oficinas(latitude, longitude);
CREATE INDEX idx_oficinas_ativa ON oficinas(ativa) WHERE ativa = true;
CREATE INDEX idx_solicitacoes_status ON solicitacoes(status);
CREATE INDEX idx_solicitacoes_cliente ON solicitacoes(cliente_id);
CREATE INDEX idx_solicitacoes_location ON solicitacoes(latitude, longitude);
CREATE INDEX idx_orcamentos_solicitacao ON orcamentos(solicitacao_id);
CREATE INDEX idx_orcamentos_oficina ON orcamentos(oficina_id);
CREATE INDEX idx_agenda_oficina ON agenda(oficina_id);
CREATE INDEX idx_agenda_datas ON agenda(data_inicio, data_fim);
CREATE INDEX idx_notificacoes_profile ON notificacoes(profile_id, lida);
CREATE INDEX idx_disponibilidade_orcamento ON orcamento_disponibilidade(orcamento_id);

-- === RLS POLICIES ===
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE oficinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacao_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamento_disponibilidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE avaliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Oficinas
CREATE POLICY "oficinas_select" ON oficinas FOR SELECT USING (true);
CREATE POLICY "oficinas_insert" ON oficinas FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "oficinas_update" ON oficinas FOR UPDATE USING (auth.uid() = profile_id);

-- Veiculos
CREATE POLICY "veiculos_select" ON veiculos FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "veiculos_insert" ON veiculos FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "veiculos_update" ON veiculos FOR UPDATE USING (auth.uid() = profile_id);
CREATE POLICY "veiculos_delete" ON veiculos FOR DELETE USING (auth.uid() = profile_id);

-- Solicitacoes
CREATE POLICY "solicitacoes_select" ON solicitacoes FOR SELECT USING (true);
CREATE POLICY "solicitacoes_insert" ON solicitacoes FOR INSERT WITH CHECK (auth.uid() = cliente_id);
CREATE POLICY "solicitacoes_update" ON solicitacoes FOR UPDATE USING (auth.uid() = cliente_id);

-- Fotos
CREATE POLICY "fotos_select" ON solicitacao_fotos FOR SELECT USING (true);
CREATE POLICY "fotos_insert" ON solicitacao_fotos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM solicitacoes WHERE id = solicitacao_id AND cliente_id = auth.uid())
);

-- Orcamentos
CREATE POLICY "orcamentos_select" ON orcamentos FOR SELECT USING (true);
CREATE POLICY "orcamentos_insert" ON orcamentos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
);
CREATE POLICY "orcamentos_update" ON orcamentos FOR UPDATE USING (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
  OR EXISTS (SELECT 1 FROM solicitacoes s WHERE s.id = solicitacao_id AND s.cliente_id = auth.uid())
);

-- Orcamento Itens
CREATE POLICY "itens_select" ON orcamento_itens FOR SELECT USING (true);
CREATE POLICY "itens_insert" ON orcamento_itens FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM orcamentos o
    JOIN oficinas of2 ON of2.id = o.oficina_id
    WHERE o.id = orcamento_id AND of2.profile_id = auth.uid()
  )
);

-- Disponibilidade
CREATE POLICY "disponibilidade_select" ON orcamento_disponibilidade FOR SELECT USING (true);
CREATE POLICY "disponibilidade_insert" ON orcamento_disponibilidade FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM orcamentos o
    JOIN oficinas of2 ON of2.id = o.oficina_id
    WHERE o.id = orcamento_id AND of2.profile_id = auth.uid()
  )
);

-- Agenda
CREATE POLICY "agenda_select" ON agenda FOR SELECT USING (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
);
CREATE POLICY "agenda_insert" ON agenda FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
);
CREATE POLICY "agenda_update" ON agenda FOR UPDATE USING (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
);
CREATE POLICY "agenda_delete" ON agenda FOR DELETE USING (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
);

-- Avaliacoes
CREATE POLICY "avaliacoes_select" ON avaliacoes FOR SELECT USING (true);
CREATE POLICY "avaliacoes_insert" ON avaliacoes FOR INSERT WITH CHECK (auth.uid() = cliente_id);

-- Notificacoes
CREATE POLICY "notificacoes_select" ON notificacoes FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "notificacoes_update" ON notificacoes FOR UPDATE USING (auth.uid() = profile_id);
CREATE POLICY "notificacoes_insert" ON notificacoes FOR INSERT WITH CHECK (true);

-- === ENABLE REALTIME ===
ALTER PUBLICATION supabase_realtime ADD TABLE notificacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE orcamentos;
ALTER PUBLICATION supabase_realtime ADD TABLE solicitacoes;
