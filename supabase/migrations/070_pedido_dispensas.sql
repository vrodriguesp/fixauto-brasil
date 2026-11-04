-- "Nao tenho interesse" no pedido (feedback de uma oficina 04/11: pedido com
-- lampadas + polimento, ela so faz parte e nao quer orcar so um pedaco).
-- A oficina tira o pedido da aba "Para responder" e diz o motivo; pode desfazer
-- enquanto o pedido estiver aberto. O admin ve quantas e quais oficinas
-- dispensaram cada pedido (e o motivo) para agir: dividir o pedido, procurar
-- outra oficina, ajustar especialidades.

CREATE TABLE IF NOT EXISTS pedido_dispensas (
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  oficina_id uuid NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  motivo text NOT NULL CHECK (motivo IN ('nao_faz', 'faz_parte', 'sem_agenda', 'longe', 'outro')),
  comentario text CHECK (comentario IS NULL OR char_length(comentario) <= 500),
  autor_id uuid DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (solicitacao_id, oficina_id)
);
CREATE INDEX IF NOT EXISTS pedido_dispensas_oficina_idx ON pedido_dispensas (oficina_id);

ALTER TABLE pedido_dispensas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pedido_dispensas_select ON pedido_dispensas;
CREATE POLICY pedido_dispensas_select ON pedido_dispensas FOR SELECT TO authenticated
  USING (oficina_id IN (SELECT minhas_oficinas()) OR eh_admin());
-- so pedido que a oficina pode ver/orcar (mesma regra do orcamento, migracao 056)
DROP POLICY IF EXISTS pedido_dispensas_insert ON pedido_dispensas;
CREATE POLICY pedido_dispensas_insert ON pedido_dispensas FOR INSERT TO authenticated
  WITH CHECK (oficina_id IN (SELECT minhas_oficinas()) AND minha_oficina_atende(solicitacao_id) AND (autor_id IS NULL OR autor_id = auth.uid()));
DROP POLICY IF EXISTS pedido_dispensas_update ON pedido_dispensas;
CREATE POLICY pedido_dispensas_update ON pedido_dispensas FOR UPDATE TO authenticated
  USING (oficina_id IN (SELECT minhas_oficinas()))
  WITH CHECK (oficina_id IN (SELECT minhas_oficinas()) AND minha_oficina_atende(solicitacao_id) AND (autor_id IS NULL OR autor_id = auth.uid()));
DROP POLICY IF EXISTS pedido_dispensas_delete ON pedido_dispensas;
CREATE POLICY pedido_dispensas_delete ON pedido_dispensas FOR DELETE TO authenticated
  USING (oficina_id IN (SELECT minhas_oficinas()));
REVOKE ALL ON pedido_dispensas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON pedido_dispensas TO authenticated;

-- contador do menu "Pedidos" (migracao 060) sem os pedidos dispensados
CREATE OR REPLACE FUNCTION pedidos_para_responder()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT json_build_object(
    'total', count(*),
    'atrasados', count(*) FILTER (WHERE s.created_at < now() - interval '4 hours' AND s.created_at > now() - interval '48 hours')
  )
  FROM solicitacoes s
  WHERE s.status IN ('aberta', 'em_orcamento')
    AND minha_oficina_atende(s.id)
    AND NOT EXISTS (SELECT 1 FROM orcamentos o WHERE o.solicitacao_id = s.id AND o.oficina_id IN (SELECT minhas_oficinas()))
    AND NOT EXISTS (SELECT 1 FROM pedido_dispensas d WHERE d.solicitacao_id = s.id AND d.oficina_id IN (SELECT minhas_oficinas()));
$$;
REVOKE ALL ON FUNCTION pedidos_para_responder() FROM anon, public;
GRANT EXECUTE ON FUNCTION pedidos_para_responder() TO authenticated;

-- quem dispensou e depois orcou deixa de contar como "sem interesse" (auditoria Fable 04/11)
CREATE OR REPLACE FUNCTION apagar_dispensa_ao_orcar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM pedido_dispensas WHERE solicitacao_id = NEW.solicitacao_id AND oficina_id = NEW.oficina_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orcamentos_apaga_dispensa ON orcamentos;
CREATE TRIGGER orcamentos_apaga_dispensa AFTER INSERT ON orcamentos
  FOR EACH ROW EXECUTE FUNCTION apagar_dispensa_ao_orcar();
