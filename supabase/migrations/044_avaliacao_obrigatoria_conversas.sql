-- Teste do dono 08/10 noite:
-- 1) aceito um orcamento, as outras oficinas nao escrevem mais (e saem da
--    lista do cliente); oficina com orcamento recusado tambem nao.
-- 2) avaliacao obrigatoria (como no Uber): com um servico entregue sem
--    avaliacao, o cliente nao cria pedido novo. O "acabei de bater" nao e
--    bloqueado (passa pelo servidor).

CREATE OR REPLACE FUNCTION conversa_aberta(p_sol UUID, p_of UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    -- outra oficina foi escolhida, ou o orcamento desta foi recusado
    WHEN EXISTS (SELECT 1 FROM orcamentos WHERE solicitacao_id = p_sol AND status = 'aceito' AND oficina_id <> p_of)
         AND NOT EXISTS (SELECT 1 FROM orcamentos WHERE solicitacao_id = p_sol AND status = 'aceito' AND oficina_id = p_of) THEN false
    WHEN EXISTS (SELECT 1 FROM orcamentos WHERE solicitacao_id = p_sol AND oficina_id = p_of AND status = 'recusado')
         AND NOT EXISTS (SELECT 1 FROM orcamentos WHERE solicitacao_id = p_sol AND oficina_id = p_of AND status = 'aceito') THEN false
    WHEN s.status NOT IN ('concluida', 'cancelada') THEN true
    ELSE EXISTS (
      SELECT 1 FROM orcamentos o
      JOIN agenda a ON a.solicitacao_id = o.solicitacao_id AND a.oficina_id = o.oficina_id AND a.status = 'concluido'
      WHERE o.solicitacao_id = p_sol AND o.oficina_id = p_of AND o.status = 'aceito'
        AND now() <= COALESCE(a.data_fim, a.data_inicio) + make_interval(days => GREATEST(COALESCE(o.garantia_dias, 0), 7))
    )
  END
  FROM solicitacoes s WHERE s.id = p_sol;
$$;

-- servico entregue ainda sem avaliacao do cliente?
CREATE OR REPLACE FUNCTION tem_avaliacao_pendente(p_cliente UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM solicitacoes s
    JOIN orcamentos o ON o.solicitacao_id = s.id AND o.status = 'aceito'
    WHERE s.cliente_id = p_cliente AND s.status = 'concluida'
      AND NOT EXISTS (SELECT 1 FROM avaliacoes a WHERE a.solicitacao_id = s.id)
  );
$$;
GRANT EXECUTE ON FUNCTION tem_avaliacao_pendente(UUID) TO authenticated;

DROP POLICY IF EXISTS solicitacoes_insert ON solicitacoes;
CREATE POLICY solicitacoes_insert ON solicitacoes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = cliente_id AND NOT tem_avaliacao_pendente(auth.uid()));
