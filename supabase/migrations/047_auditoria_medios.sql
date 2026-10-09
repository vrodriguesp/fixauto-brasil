-- Auditoria Fable 08/10 - itens medios do banco (WEB_OFICINA_ADMIN_SERVIDOR.md)
--   M-05 avisos criados pelo navegador: guarda quem criou e limita o volume
--   M-07 pedidos de pecas: so o servidor muda preco/status
--   M-09 e-mail/telefone de donos de oficina/loja so para quem tem relacao
--   M-10 oficina ainda nao aprovada nao ve pedidos abertos nem orca

-- M-05 ----------------------------------------------------------------------
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS criado_por uuid;
CREATE INDEX IF NOT EXISTS notificacoes_criado_por_idx ON notificacoes(criado_por, created_at DESC);

CREATE OR REPLACE FUNCTION limitar_avisos_de_usuario() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN NEW; END IF;
  NEW.criado_por := auth.uid();
  -- uso normal: poucos avisos por hora (orcamento, check-in, nota interna...)
  IF (SELECT count(*) FROM notificacoes
      WHERE criado_por = auth.uid() AND created_at > now() - interval '1 hour') >= 40 THEN
    RAISE EXCEPTION 'limite de avisos atingido' USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_limitar_avisos ON notificacoes;
CREATE TRIGGER trg_limitar_avisos BEFORE INSERT ON notificacoes
  FOR EACH ROW EXECUTE FUNCTION limitar_avisos_de_usuario();

-- M-07: nenhuma tela altera pedidos_pecas (so /api/marcar-pedido-peca-entregue)
DROP POLICY IF EXISTS pedidos_pecas_update ON pedidos_pecas;

-- M-10 ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pode_ver_solicitacao(p_sol uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT eh_admin() OR EXISTS (
    SELECT 1 FROM solicitacoes s
    WHERE s.id = p_sol AND (
      s.cliente_id = auth.uid()
      OR (s.status IN ('aberta', 'em_orcamento')
          AND EXISTS (SELECT 1 FROM oficinas o WHERE o.ativa AND o.id IN (SELECT minhas_oficinas())))
      OR oficina_envolvida(s.id)
    )
  );
$$;

DROP POLICY IF EXISTS orcamentos_insert ON orcamentos;
CREATE POLICY orcamentos_insert ON orcamentos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM oficinas WHERE oficinas.id = orcamentos.oficina_id AND oficinas.profile_id = auth.uid() AND oficinas.ativa));

-- M-09 ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pode_ver_perfil(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p = auth.uid()
      OR eh_admin()
      -- dono de oficina: so para quem tem relacao com ela (cliente com orcamento,
      -- agenda ou conversa; a propria equipe; lojas de pecas que atendem oficinas)
      OR EXISTS (
        SELECT 1 FROM oficinas o WHERE o.profile_id = p AND (
          o.id IN (SELECT minhas_oficinas())
          OR EXISTS (SELECT 1 FROM solicitacoes s WHERE s.cliente_id = auth.uid() AND (
               EXISTS (SELECT 1 FROM orcamentos x WHERE x.solicitacao_id = s.id AND x.oficina_id = o.id)
            OR EXISTS (SELECT 1 FROM agenda x WHERE x.solicitacao_id = s.id AND x.oficina_id = o.id)
            OR EXISTS (SELECT 1 FROM mensagens x WHERE x.solicitacao_id = s.id AND x.oficina_id = o.id)))
          OR EXISTS (SELECT 1 FROM mensagens x WHERE x.pagador_id = auth.uid() AND x.oficina_id = o.id)
          OR EXISTS (SELECT 1 FROM lojas_pecas l WHERE l.profile_id = auth.uid())
        ))
      -- dono de loja de pecas: so para oficinas (clientes das lojas)
      OR (EXISTS (SELECT 1 FROM lojas_pecas WHERE profile_id = p) AND EXISTS (SELECT 1 FROM minhas_oficinas()))
      OR EXISTS (SELECT 1 FROM funcionarios f WHERE f.profile_id = p AND f.oficina_id IN (SELECT minhas_oficinas()))
      OR EXISTS (SELECT 1 FROM solicitacoes s WHERE s.cliente_id = p AND oficina_envolvida(s.id))
      OR EXISTS (
        SELECT 1 FROM funcionarios f
        JOIN solicitacoes s ON s.cliente_id = auth.uid()
        WHERE f.profile_id = p AND (
          f.oficina_id IN (SELECT oficina_id FROM orcamentos WHERE solicitacao_id = s.id)
          OR f.oficina_id IN (SELECT oficina_id FROM agenda WHERE solicitacao_id = s.id)
        )
      )
      OR EXISTS (SELECT 1 FROM mensagens m JOIN solicitacoes s ON s.id = m.solicitacao_id
                 WHERE s.cliente_id = p AND m.oficina_id IN (SELECT minhas_oficinas()))
      OR EXISTS (SELECT 1 FROM mensagens m WHERE m.pagador_id = p AND m.oficina_id IN (SELECT minhas_oficinas()));
$$;
