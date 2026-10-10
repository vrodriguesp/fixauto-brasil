-- Caixa de pedidos da oficina (auditoria do painel 10/10, docs/AUDITORIA_PAINEL_OFICINA_2026-10-10.md):
-- 1) "visto": a oficina abriu o pedido (nada guardava isso; o "visualizado"
--    do orcamento e o CLIENTE vendo o orcamento). Serve ao destaque do cartao
--    novo e ao tempo ate abrir.
-- 2) pedidos e orcamentos em tempo real: o contador de espera e as abas
--    (Para responder / Respondidos / Encerrados) mudam sem recarregar.

CREATE TABLE IF NOT EXISTS pedido_vistos (
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  oficina_id uuid NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  visto_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (solicitacao_id, oficina_id)
);
ALTER TABLE pedido_vistos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pedido_vistos_select ON pedido_vistos;
CREATE POLICY pedido_vistos_select ON pedido_vistos FOR SELECT TO authenticated
  USING (oficina_id IN (SELECT minhas_oficinas()) OR eh_admin());
DROP POLICY IF EXISTS pedido_vistos_insert ON pedido_vistos;
CREATE POLICY pedido_vistos_insert ON pedido_vistos FOR INSERT TO authenticated
  WITH CHECK (oficina_id IN (SELECT minhas_oficinas()));
REVOKE ALL ON pedido_vistos FROM anon;
GRANT SELECT, INSERT ON pedido_vistos TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['solicitacoes', 'orcamentos'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- 3) contador do menu "Pedidos": quantos pedidos esperam resposta DESTA
--    oficina (mesma regra de quem pode ver: especialidade + raio, migracao 056)
--    e quantos esperam ha mais de 4 h (contador fica vermelho)
CREATE OR REPLACE FUNCTION pedidos_para_responder()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT json_build_object(
    'total', count(*),
    'atrasados', count(*) FILTER (WHERE s.created_at < now() - interval '4 hours' AND s.created_at > now() - interval '48 hours')
  )
  FROM solicitacoes s
  WHERE s.status IN ('aberta', 'em_orcamento')
    AND minha_oficina_atende(s.id)
    AND NOT EXISTS (SELECT 1 FROM orcamentos o WHERE o.solicitacao_id = s.id AND o.oficina_id IN (SELECT minhas_oficinas()));
$$;
REVOKE ALL ON FUNCTION pedidos_para_responder() FROM anon, public;
GRANT EXECUTE ON FUNCTION pedidos_para_responder() TO authenticated;
