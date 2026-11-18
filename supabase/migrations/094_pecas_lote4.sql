-- 094: pecas lote 4 ("loja visivel": perfil + pagina publica + lista), 18/11/2026.
-- Mapa: Documentos/Analises/Pecas_lote4_2026-11-18/Mapa_lote4.md
-- Aditiva e idempotente (pode rodar 2x). Sem politica RLS nova ou alterada: a pagina publica le pelo
-- servidor (service role) so campos escolhidos; a loja grava as colunas novas pela politica de UPDATE do dono.
-- Interruptor PROPRIO (lojas_pagina_publica_ativo, padrao false), separado de pecas_v3_ativo: desligado, so
-- lojas de conta de teste tem pagina (noindex).
--
-- Rollback (so depois de voltar o codigo):
--   DROP TRIGGER IF EXISTS lojas_pecas_numero_fixo ON lojas_pecas;
--   DROP FUNCTION IF EXISTS lojas_pecas_numero_fixo();
--   ALTER TABLE lojas_pecas DROP COLUMN IF EXISTS pagina_publica, DROP COLUMN IF EXISTS entrega,
--     DROP COLUMN IF EXISTS horario_funcionamento, DROP COLUMN IF EXISTS marcas, DROP COLUMN IF EXISTS categorias,
--     DROP COLUMN IF EXISTS descricao, DROP COLUMN IF EXISTS numero;
--   DROP SEQUENCE IF EXISTS lojas_pecas_numero_seq;
--   ALTER TABLE plataforma_config DROP COLUMN IF EXISTS lojas_pagina_publica_ativo;
SET LOCAL lock_timeout = '5s';

-- numero curto da loja (vai na URL no lugar do UUID; permite renomear sem quebrar o link)
CREATE SEQUENCE IF NOT EXISTS lojas_pecas_numero_seq START 1001;
ALTER TABLE lojas_pecas ADD COLUMN IF NOT EXISTS numero bigint;
DO $$
DECLARE r record;
BEGIN
  PERFORM setval('lojas_pecas_numero_seq', GREATEST(1001, COALESCE((SELECT max(numero) + 1 FROM lojas_pecas), 1001)), false);
  FOR r IN SELECT id FROM lojas_pecas WHERE numero IS NULL ORDER BY created_at, id LOOP
    UPDATE lojas_pecas SET numero = nextval('lojas_pecas_numero_seq') WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE lojas_pecas ALTER COLUMN numero SET DEFAULT nextval('lojas_pecas_numero_seq');
ALTER TABLE lojas_pecas ALTER COLUMN numero SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lojas_pecas_numero_key ON lojas_pecas (numero);

-- o numero nao muda depois de criado (a loja tem UPDATE na propria linha pela politica de hoje)
CREATE OR REPLACE FUNCTION lojas_pecas_numero_fixo() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.numero := OLD.numero;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lojas_pecas_numero_fixo ON lojas_pecas;
CREATE TRIGGER lojas_pecas_numero_fixo BEFORE UPDATE OF numero ON lojas_pecas
  FOR EACH ROW WHEN (NEW.numero IS DISTINCT FROM OLD.numero) EXECUTE FUNCTION lojas_pecas_numero_fixo();

-- perfil publico
ALTER TABLE lojas_pecas ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE lojas_pecas ADD COLUMN IF NOT EXISTS categorias text[] NOT NULL DEFAULT '{}';
ALTER TABLE lojas_pecas ADD COLUMN IF NOT EXISTS marcas text[] NOT NULL DEFAULT '{}';
ALTER TABLE lojas_pecas ADD COLUMN IF NOT EXISTS horario_funcionamento jsonb;
ALTER TABLE lojas_pecas ADD COLUMN IF NOT EXISTS entrega boolean NOT NULL DEFAULT false;
ALTER TABLE lojas_pecas ADD COLUMN IF NOT EXISTS pagina_publica boolean NOT NULL DEFAULT false;
ALTER TABLE lojas_pecas DROP CONSTRAINT IF EXISTS lojas_pecas_descricao_check;
ALTER TABLE lojas_pecas ADD CONSTRAINT lojas_pecas_descricao_check CHECK (descricao IS NULL OR char_length(descricao) <= 600);
ALTER TABLE lojas_pecas DROP CONSTRAINT IF EXISTS lojas_pecas_categorias_check;
ALTER TABLE lojas_pecas ADD CONSTRAINT lojas_pecas_categorias_check CHECK (cardinality(categorias) <= 20);
ALTER TABLE lojas_pecas DROP CONSTRAINT IF EXISTS lojas_pecas_marcas_check;
ALTER TABLE lojas_pecas ADD CONSTRAINT lojas_pecas_marcas_check CHECK (cardinality(marcas) <= 30);
ALTER TABLE lojas_pecas DROP CONSTRAINT IF EXISTS lojas_pecas_horario_check;
ALTER TABLE lojas_pecas ADD CONSTRAINT lojas_pecas_horario_check CHECK (horario_funcionamento IS NULL OR jsonb_typeof(horario_funcionamento) = 'object');

-- interruptor global proprio da pagina publica
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS lojas_pagina_publica_ativo boolean NOT NULL DEFAULT false;
