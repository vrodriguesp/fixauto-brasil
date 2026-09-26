-- Mesma logica da migration anterior (023): "solicitacoes" tambem precisa
-- saber o pais do cliente que abriu o pedido, pra estimativas de preco
-- mostradas ANTES de qualquer oficina responder (ex: analise de dano por
-- IA) nao ficarem presas em BRL so porque e o default do sistema.
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS pais TEXT;
UPDATE solicitacoes SET pais = 'BR' WHERE pais IS NULL;
