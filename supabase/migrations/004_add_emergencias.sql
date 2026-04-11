-- Emergency / "Acabei de Bater" tables

-- Emergencias (emergency reports, may or may not be linked to a registered user)
CREATE TABLE emergencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- If user is logged in, link to profile; otherwise null
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Contact info for non-registered users
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT NOT NULL,
  descricao TEXT,
  endereco TEXT NOT NULL,
  latitude DOUBLE PRECISION DEFAULT -23.5505,
  longitude DOUBLE PRECISION DEFAULT -46.6333,
  -- Automatically create a solicitação from this emergency
  solicitacao_id UUID REFERENCES solicitacoes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'em_orcamento', 'resolvida', 'cancelada')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Photos for emergencies
CREATE TABLE emergencia_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergencia_id UUID NOT NULL REFERENCES emergencias(id) ON DELETE CASCADE,
  foto_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Other vehicle involved in the accident
CREATE TABLE emergencia_outro_veiculo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergencia_id UUID NOT NULL REFERENCES emergencias(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  placa TEXT NOT NULL,
  veiculo_descricao TEXT,
  observacoes TEXT,
  -- If the other person registers, link to their profile
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notificado BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Photos of the other vehicle
CREATE TABLE emergencia_outro_veiculo_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outro_veiculo_id UUID NOT NULL REFERENCES emergencia_outro_veiculo(id) ON DELETE CASCADE,
  foto_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages between the two drivers
CREATE TABLE emergencia_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergencia_id UUID NOT NULL REFERENCES emergencias(id) ON DELETE CASCADE,
  remetente_tipo TEXT NOT NULL CHECK (remetente_tipo IN ('proprietario', 'outro')),
  remetente_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- === INDEXES ===
CREATE INDEX idx_emergencias_profile ON emergencias(profile_id);
CREATE INDEX idx_emergencias_email ON emergencias(email);
CREATE INDEX idx_emergencia_fotos ON emergencia_fotos(emergencia_id);
CREATE INDEX idx_emergencia_outro ON emergencia_outro_veiculo(emergencia_id);
CREATE INDEX idx_emergencia_msgs ON emergencia_mensagens(emergencia_id);

-- === RLS ===
ALTER TABLE emergencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergencia_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergencia_outro_veiculo ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergencia_outro_veiculo_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergencia_mensagens ENABLE ROW LEVEL SECURITY;

-- Emergencias: anyone can insert (even anonymous), owner can read
CREATE POLICY "emergencias_insert" ON emergencias FOR INSERT WITH CHECK (true);
CREATE POLICY "emergencias_select" ON emergencias FOR SELECT USING (
  profile_id = auth.uid() OR email = (SELECT email FROM profiles WHERE id = auth.uid())
);
-- Also allow reading by email match for not-yet-registered users via anon key
CREATE POLICY "emergencias_select_anon" ON emergencias FOR SELECT USING (true);
CREATE POLICY "emergencias_update" ON emergencias FOR UPDATE USING (
  profile_id = auth.uid() OR profile_id IS NULL
);

-- Fotos: anyone can insert, viewable by all
CREATE POLICY "emergencia_fotos_insert" ON emergencia_fotos FOR INSERT WITH CHECK (true);
CREATE POLICY "emergencia_fotos_select" ON emergencia_fotos FOR SELECT USING (true);

-- Outro veiculo: anyone can insert, viewable by all related
CREATE POLICY "outro_veiculo_insert" ON emergencia_outro_veiculo FOR INSERT WITH CHECK (true);
CREATE POLICY "outro_veiculo_select" ON emergencia_outro_veiculo FOR SELECT USING (true);

CREATE POLICY "outro_fotos_insert" ON emergencia_outro_veiculo_fotos FOR INSERT WITH CHECK (true);
CREATE POLICY "outro_fotos_select" ON emergencia_outro_veiculo_fotos FOR SELECT USING (true);

-- Messages: anyone can insert and read (for the accident context)
CREATE POLICY "msgs_insert" ON emergencia_mensagens FOR INSERT WITH CHECK (true);
CREATE POLICY "msgs_select" ON emergencia_mensagens FOR SELECT USING (true);
