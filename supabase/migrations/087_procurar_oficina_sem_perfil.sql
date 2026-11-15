-- 087: busca da oficina (procurar_na_oficina) depois da 086 (achado no e2e site-painel-oficina, 15/11 noite).
-- A funcao e SECURITY INVOKER e lia o cliente direto em profiles. A 086 tirou da oficina a leitura da linha
-- do cliente em profiles, entao a busca parou de achar pelo CODIGO e pelo NOME do cliente e o resultado
-- veio sem o nome. Agora le como o resto do painel:
--   nome/codigo -> resumo_clientes (074; SECURITY DEFINER, so clientes de pedidos que a oficina pode ver);
--   telefone    -> contato_clientes (086; so nos pedidos em que o orcamento DESTA oficina foi aceito).
-- Mesmo corpo da 061 nas outras partes (filtros, ordem, limite). Idempotente (OR REPLACE).
-- Rollback: rodar de novo o bloco da funcao da 061.

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
      p.nome AS cliente_nome, p.codigo AS cliente_codigo, (SELECT c.telefone FROM contato_clientes(ARRAY[s.id]) c LIMIT 1) AS telefone,
      v.placa, nullif(btrim(coalesce(v.fipe_marca, '') || ' ' || coalesce(v.fipe_modelo, '')), '') AS carro,
      a.id AS agenda_id, a.status::text AS agenda_status, a.data_inicio, a.titulo
    FROM agenda a
    LEFT JOIN solicitacoes s ON s.id = a.solicitacao_id
    LEFT JOIN veiculos v ON v.id = s.veiculo_id
    LEFT JOIN LATERAL (SELECT r.nome, r.codigo FROM resumo_clientes(ARRAY[s.cliente_id]) r) p ON true
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
      p.nome, p.codigo, (SELECT c.telefone FROM contato_clientes(ARRAY[s.id]) c LIMIT 1), v.placa, nullif(btrim(coalesce(v.fipe_marca, '') || ' ' || coalesce(v.fipe_modelo, '')), ''),
      NULL::uuid, NULL::text, NULL::timestamptz, NULL::text
    FROM solicitacoes s
    LEFT JOIN veiculos v ON v.id = s.veiculo_id
    LEFT JOIN LATERAL (SELECT r.nome, r.codigo FROM resumo_clientes(ARRAY[s.cliente_id]) r) p ON true
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
