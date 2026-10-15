-- Interessados em ser parceiro (/seja-parceiro em todos os paises): de qual
-- mercado veio o contato (pedido do dono 15/10 - antes ficavam misturados).
ALTER TABLE leads_parceiros ADD COLUMN IF NOT EXISTS pais text CHECK (pais IN ('EE', 'IT', 'PT', 'BR'));
-- o unico contato existente ate aqui e de Sao Paulo (SP)
UPDATE leads_parceiros SET pais = 'BR' WHERE pais IS NULL AND estado = 'SP';
CREATE INDEX IF NOT EXISTS leads_parceiros_pais_idx ON leads_parceiros (pais, created_at DESC);
