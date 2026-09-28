-- Avaliacao so de quem teve o servico feito pela oficina.
--
-- Antes: a policy de INSERT so conferia auth.uid() = cliente_id - pela API
-- qualquer cliente logado conseguia avaliar QUALQUER oficina, sem ter sido
-- atendido por ela (a restricao existia so na tela). Isso tambem impedia
-- dizer nos termos de uso (Diretiva Omnibus, UE) que as avaliacoes vem de
-- clientes reais.
--
-- Agora: o cliente so avalia a oficina cujo orcamento ele ACEITOU, num
-- pedido dele que esta CONCLUIDO. E nao existia policy de UPDATE - a edicao
-- de avaliacao (permitida pela tela por ate 2 meses) falhava em silencio.

CREATE OR REPLACE FUNCTION public.pode_avaliar(p_solicitacao_id UUID, p_oficina_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM solicitacoes s
    JOIN orcamentos o ON o.solicitacao_id = s.id
    WHERE s.id = p_solicitacao_id
      AND s.cliente_id = auth.uid()
      AND s.status = 'concluida'
      AND o.oficina_id = p_oficina_id
      AND o.status = 'aceito'
  );
$$;

DROP POLICY IF EXISTS "avaliacoes_insert" ON avaliacoes;
CREATE POLICY "avaliacoes_insert" ON avaliacoes FOR INSERT
  WITH CHECK (auth.uid() = cliente_id AND public.pode_avaliar(solicitacao_id, oficina_id));

DROP POLICY IF EXISTS "avaliacoes_update" ON avaliacoes;
CREATE POLICY "avaliacoes_update" ON avaliacoes FOR UPDATE
  USING (auth.uid() = cliente_id)
  WITH CHECK (auth.uid() = cliente_id AND public.pode_avaliar(solicitacao_id, oficina_id));
