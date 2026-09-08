-- Migration 019: restringe a policy de UPDATE de cotacoes_pecas_mensagens
-- (marcar como lida), que tinha ficado "USING (true)" - qualquer usuario
-- autenticado conseguia alterar mensagem de qualquer conversa de peca de
-- terceiros. Encontrado na varredura de seguranca de 2026-09-08.

DROP POLICY IF EXISTS "pecas_mensagens_update" ON cotacoes_pecas_mensagens;
CREATE POLICY "pecas_mensagens_update" ON cotacoes_pecas_mensagens FOR UPDATE USING (
  (fornecedor_tipo = 'loja' AND EXISTS (SELECT 1 FROM lojas_pecas WHERE id = fornecedor_id AND profile_id = auth.uid()))
  OR (fornecedor_tipo = 'oficina' AND EXISTS (SELECT 1 FROM oficinas WHERE id = fornecedor_id AND profile_id = auth.uid()))
  OR EXISTS (
    SELECT 1 FROM cotacoes_pecas c
    JOIN oficinas o ON o.id = c.oficina_id
    WHERE c.id = cotacao_id AND o.profile_id = auth.uid()
  )
);
