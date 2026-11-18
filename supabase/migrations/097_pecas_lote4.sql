-- 097: pecas lote 4 ("loja visivel": perfil + pagina publica + lista), 18/11/2026.
-- (Escrita como 094 no branch pecas-lote4; renumerada para 097 em 18/11 por ter entrado depois da 095/096
--  em producao. Mesmo conteudo + ajustes do veredito Fable: C-3 limites de marcas/horario, C-4 transacao unica.)
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
--   DROP FUNCTION IF EXISTS lojas_pecas_marcas_ok(text[]); DROP FUNCTION IF EXISTS lojas_pecas_horario_ok(jsonb);
--
-- Aplicar (C-4): psql -1 -v ON_ERROR_STOP=1 -f 097_pecas_lote4.sql (ensaiar antes com ROLLBACK no lugar do COMMIT).
-- O arquivo ja abre a propria transacao (BEGIN ... COMMIT): mesmo com `psql -f` sem -1 tudo vale ou nada vale,
-- o SET LOCAL lock_timeout vale de fato e o lock do ALTER TABLE impede INSERT concorrente entre ADD COLUMN numero e
-- SET NOT NULL. (Com -1 o psql so avisa "already a transaction in progress"; continua uma transacao so.)
BEGIN;
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
-- C-3: cada marca 1..40 caracteres (o perfil ja corta em 40; aqui vale tambem para quem grava pela API direta)
CREATE OR REPLACE FUNCTION lojas_pecas_marcas_ok(m text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT cardinality(m) <= 30 AND NOT EXISTS (SELECT 1 FROM unnest(m) x WHERE x IS NULL OR char_length(x) NOT BETWEEN 1 AND 40);
$$;
ALTER TABLE lojas_pecas ADD CONSTRAINT lojas_pecas_marcas_check CHECK (lojas_pecas_marcas_ok(marcas));
ALTER TABLE lojas_pecas DROP CONSTRAINT IF EXISTS lojas_pecas_horario_check;
-- C-3: horario = objeto so com os dias seg..dom; cada dia objeto {aberto bool, inicio/fim "HH:MM" ou ""}
-- (vai para opens/closes do JSON-LD; o input type=time do perfil manda "HH:MM" ou vazio)
CREATE OR REPLACE FUNCTION lojas_pecas_horario_ok(h jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT h IS NULL OR (
    jsonb_typeof(h) = 'object' AND octet_length(h::text) <= 2000
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(h) d
      WHERE d.key NOT IN ('seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom')
         OR jsonb_typeof(d.value) <> 'object'
         OR (d.value ? 'aberto' AND jsonb_typeof(d.value->'aberto') <> 'boolean')
         OR EXISTS (SELECT 1 FROM jsonb_each(d.value) c WHERE c.key NOT IN ('aberto', 'inicio', 'fim'))
         OR EXISTS (
           SELECT 1 FROM unnest(ARRAY['inicio', 'fim']) k
           WHERE d.value ? k AND (jsonb_typeof(d.value->k) <> 'string' OR (d.value->>k) !~ '^(([01][0-9]|2[0-3]):[0-5][0-9])?$')
         )
    )
  );
$$;
ALTER TABLE lojas_pecas ADD CONSTRAINT lojas_pecas_horario_check CHECK (lojas_pecas_horario_ok(horario_funcionamento));

-- interruptor global proprio da pagina publica
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS lojas_pagina_publica_ativo boolean NOT NULL DEFAULT false;

COMMIT;
