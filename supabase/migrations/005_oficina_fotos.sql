-- Workshop photos table
CREATE TABLE IF NOT EXISTS oficina_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  foto_url TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL DEFAULT 'estrutura' CHECK (tipo IN ('estrutura', 'servico', 'equipe')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oficina_fotos ON oficina_fotos(oficina_id);

ALTER TABLE oficina_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oficina_fotos_select" ON oficina_fotos FOR SELECT USING (true);
CREATE POLICY "oficina_fotos_insert" ON oficina_fotos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
);
CREATE POLICY "oficina_fotos_delete" ON oficina_fotos FOR DELETE USING (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
);
