-- Leads de oficinas/lojas interessadas em virar parceiro fundador (pagina
-- publica /seja-parceiro). Insert publico (form sem login), leitura restrita
-- ao admin.
CREATE TABLE IF NOT EXISTS leads_parceiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('oficina', 'loja_pecas')),
  nome_responsavel TEXT NOT NULL,
  nome_negocio TEXT NOT NULL,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  email TEXT,
  observacao TEXT,
  contatado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE leads_parceiros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_parceiros_insert_publico" ON leads_parceiros FOR INSERT WITH CHECK (true);

CREATE POLICY "leads_parceiros_select_admin" ON leads_parceiros FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tipo = 'admin')
);

CREATE POLICY "leads_parceiros_update_admin" ON leads_parceiros FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tipo = 'admin')
);
