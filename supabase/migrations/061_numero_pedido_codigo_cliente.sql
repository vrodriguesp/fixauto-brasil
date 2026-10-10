-- Procurar o carro/pedido na oficina (pedido do dono 10/10): o cliente chega no
-- balcao e a oficina acha o pedido pela placa, pelo nome, pelo numero do pedido
-- ou pelo codigo de cliente (placa nao e obrigatoria, por isso os numeros).
-- 1) solicitacoes.numero: numero curto do pedido (a partir de 100001), em ordem de criacao
-- 2) profiles.codigo: codigo do cliente (a partir de 500001), mostrado no perfil do app/site
-- 3) procurar_na_oficina(q): busca com as permissoes de quem chama (RLS), nos
--    carros da agenda da oficina e nos pedidos que ela pode ver

CREATE SEQUENCE IF NOT EXISTS solicitacoes_numero_seq START 100001;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS numero bigint;
UPDATE solicitacoes s SET numero = x.n
  FROM (SELECT id, 100000 + row_number() OVER (ORDER BY created_at, id) AS n FROM solicitacoes) x
  WHERE s.id = x.id AND s.numero IS NULL;
SELECT setval('solicitacoes_numero_seq', GREATEST(100001, COALESCE((SELECT max(numero) + 1 FROM solicitacoes), 100001)), false);
ALTER TABLE solicitacoes ALTER COLUMN numero SET DEFAULT nextval('solicitacoes_numero_seq');
ALTER TABLE solicitacoes ALTER COLUMN numero SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS solicitacoes_numero_key ON solicitacoes(numero);

CREATE SEQUENCE IF NOT EXISTS profiles_codigo_seq START 500001;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS codigo bigint;
UPDATE profiles p SET codigo = x.n
  FROM (SELECT id, 500000 + row_number() OVER (ORDER BY created_at, id) AS n FROM profiles) x
  WHERE p.id = x.id AND p.codigo IS NULL;
SELECT setval('profiles_codigo_seq', GREATEST(500001, COALESCE((SELECT max(codigo) + 1 FROM profiles), 500001)), false);
ALTER TABLE profiles ALTER COLUMN codigo SET DEFAULT nextval('profiles_codigo_seq');
ALTER TABLE profiles ALTER COLUMN codigo SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_codigo_key ON profiles(codigo);
-- o numero e o codigo sao do sistema: ninguem muda (o UPDATE da tabela e
-- liberado no nivel da tabela, entao um REVOKE por coluna nao bastaria)
CREATE OR REPLACE FUNCTION manter_numero_pedido() RETURNS trigger LANGUAGE plpgsql AS $
BEGIN NEW.numero := OLD.numero; RETURN NEW; END $;
DROP TRIGGER IF EXISTS trg_manter_numero_pedido ON solicitacoes;
CREATE TRIGGER trg_manter_numero_pedido BEFORE UPDATE OF numero ON solicitacoes FOR EACH ROW EXECUTE FUNCTION manter_numero_pedido();
CREATE OR REPLACE FUNCTION manter_codigo_cliente() RETURNS trigger LANGUAGE plpgsql AS $
BEGIN NEW.codigo := OLD.codigo; RETURN NEW; END $;
DROP TRIGGER IF EXISTS trg_manter_codigo_cliente ON profiles;
CREATE TRIGGER trg_manter_codigo_cliente BEFORE UPDATE OF codigo ON profiles FOR EACH ROW EXECUTE FUNCTION manter_codigo_cliente();

CREATE OR REPLACE FUNCTION procurar_na_oficina(p_q text)
RETURNS TABLE (
  solicitacao_id uuid, numero bigint, pedido_status text, tipo text, criado_em timestamptz,
  cliente_nome text, cliente_codigo bigint, telefone text, placa text, carro text,
  agenda_id uuid, agenda_status text, data_inicio timestamptz, titulo text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  WITH q AS (
    SELECT btrim(p_q) AS txt,
           regexp_replace(upper(p_q), '[^A-Z0-9]', '', 'g') AS placa,
           CASE WHEN btrim(p_q) ~ '^#?[0-9]{4,9}$' THEN ltrim(btrim(p_q), '#')::bigint END AS num
  ),
  -- carros da agenda desta oficina (com pedido ou sem pedido, pelo titulo)
  ag AS (
    SELECT DISTINCT ON (coalesce(a.solicitacao_id, a.id))
      a.solicitacao_id, s.numero, s.status::text AS pedido_status, s.tipo::text AS tipo, coalesce(s.created_at, a.created_at) AS criado_em,
      p.nome AS cliente_nome, p.codigo AS cliente_codigo, p.telefone,
      v.placa, nullif(btrim(coalesce(v.fipe_marca, '') || ' ' || coalesce(v.fipe_modelo, '')), '') AS carro,
      a.id AS agenda_id, a.status::text AS agenda_status, a.data_inicio, a.titulo
    FROM agenda a
    LEFT JOIN solicitacoes s ON s.id = a.solicitacao_id
    LEFT JOIN veiculos v ON v.id = s.veiculo_id
    LEFT JOIN profiles p ON p.id = s.cliente_id
    CROSS JOIN q
    WHERE a.oficina_id IN (SELECT minhas_oficinas())
      AND a.status::text <> 'cancelado'
      AND length(q.txt) >= 2
      AND (s.numero = q.num OR p.codigo = q.num
           OR (length(q.placa) >= 2 AND regexp_replace(upper(coalesce(v.placa, '')), '[^A-Z0-9]', '', 'g') LIKE '%' || q.placa || '%')
           OR p.nome ILIKE '%' || q.txt || '%'
           OR a.titulo ILIKE '%' || q.txt || '%'
           OR (length(q.placa) >= 3 AND regexp_replace(upper(a.titulo), '[^A-Z0-9]', '', 'g') LIKE '%' || q.placa || '%'))
    ORDER BY coalesce(a.solicitacao_id, a.id), a.data_inicio DESC
  ),
  -- pedidos que a oficina pode ver e que ainda nao viraram carro na agenda dela
  pe AS (
    SELECT s.id AS solicitacao_id, s.numero, s.status::text, s.tipo::text, s.created_at,
      p.nome, p.codigo, p.telefone, v.placa, nullif(btrim(coalesce(v.fipe_marca, '') || ' ' || coalesce(v.fipe_modelo, '')), ''),
      NULL::uuid, NULL::text, NULL::timestamptz, NULL::text
    FROM solicitacoes s
    LEFT JOIN veiculos v ON v.id = s.veiculo_id
    LEFT JOIN profiles p ON p.id = s.cliente_id
    CROSS JOIN q
    WHERE length(q.txt) >= 2
      AND NOT EXISTS (SELECT 1 FROM agenda a WHERE a.solicitacao_id = s.id AND a.oficina_id IN (SELECT minhas_oficinas()))
      AND (EXISTS (SELECT 1 FROM orcamentos o WHERE o.solicitacao_id = s.id AND o.oficina_id IN (SELECT minhas_oficinas()))
           OR (s.status IN ('aberta', 'em_orcamento') AND minha_oficina_atende(s.id)))
      AND (s.numero = q.num OR p.codigo = q.num
           OR (length(q.placa) >= 2 AND regexp_replace(upper(coalesce(v.placa, '')), '[^A-Z0-9]', '', 'g') LIKE '%' || q.placa || '%')
           OR p.nome ILIKE '%' || q.txt || '%')
  )
  SELECT * FROM (SELECT * FROM ag UNION ALL SELECT * FROM pe) r
  ORDER BY (r.numero = (SELECT num FROM q) OR r.cliente_codigo = (SELECT num FROM q)) DESC NULLS LAST, coalesce(r.data_inicio, r.criado_em) DESC
  LIMIT 40;
$$;
REVOKE ALL ON FUNCTION procurar_na_oficina(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION procurar_na_oficina(text) TO authenticated;
