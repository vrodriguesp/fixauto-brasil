-- 088: portal de pecas (auditoria Fable 16/11, B2 e A1/A2).
--
-- 1) pedidos_pecas: a confirmacao do pedido passou para a rota de servidor
--    /api/confirmar-pedido-peca (service role), que fecha a cotacao, grava o pedido
--    com o valor total e avisa vencedor e perdedores. O navegador nao grava mais em
--    pedidos_pecas; a regra de INSERT da 017 deixava a oficina gravar qualquer
--    preco_total e qualquer loja/oficina como fornecedora. Sai a regra (a service
--    role nao depende dela). SELECT/UPDATE ficam como estao.
--
-- 2) cotacoes_pecas_mensagens: a regra de INSERT da 018 so exigia remetente = quem
--    esta logado, entao qualquer conta podia escrever na conversa de outro par
--    (cotacao, fornecedor) - e agora a oficina compradora ve essas conversas no
--    cartao do pedido (A1) e cada mensagem gera aviso (A2). Passa a exigir que o
--    remetente seja PARTE da conversa: dono da oficina que pediu a peca, ou dono
--    do fornecedor da conversa (loja, ou oficina diferente da compradora).
--
-- Idempotente (DROP POLICY IF EXISTS / CREATE). Rollback:
--   CREATE POLICY "pedidos_pecas_insert" ON pedidos_pecas FOR INSERT WITH CHECK (
--     EXISTS (SELECT 1 FROM oficinas WHERE oficinas.id = pedidos_pecas.oficina_id AND oficinas.profile_id = auth.uid()));
--   DROP POLICY "pecas_mensagens_insert" ON cotacoes_pecas_mensagens;
--   CREATE POLICY "pecas_mensagens_insert" ON cotacoes_pecas_mensagens FOR INSERT WITH CHECK (auth.uid() = remetente_id);

DROP POLICY IF EXISTS "pedidos_pecas_insert" ON pedidos_pecas;

DROP POLICY IF EXISTS "pecas_mensagens_insert" ON cotacoes_pecas_mensagens;
CREATE POLICY "pecas_mensagens_insert" ON cotacoes_pecas_mensagens FOR INSERT WITH CHECK (
  auth.uid() = remetente_id
  AND (
    -- oficina que pediu a peca
    EXISTS (
      SELECT 1 FROM cotacoes_pecas c JOIN oficinas o ON o.id = c.oficina_id
      WHERE c.id = cotacoes_pecas_mensagens.cotacao_id AND o.profile_id = auth.uid()
    )
    -- loja de pecas da conversa
    OR (fornecedor_tipo = 'loja' AND EXISTS (
      SELECT 1 FROM lojas_pecas l
      WHERE l.id = cotacoes_pecas_mensagens.fornecedor_id AND l.profile_id = auth.uid()
    ))
    -- oficina que vende sobra (nunca a propria compradora)
    OR (fornecedor_tipo = 'oficina' AND EXISTS (
      SELECT 1 FROM oficinas o JOIN cotacoes_pecas c ON c.id = cotacoes_pecas_mensagens.cotacao_id
      WHERE o.id = cotacoes_pecas_mensagens.fornecedor_id AND o.profile_id = auth.uid() AND o.id <> c.oficina_id
    ))
  )
);
