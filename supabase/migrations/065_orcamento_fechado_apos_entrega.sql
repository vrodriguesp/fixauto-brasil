-- 065: orcamento fechado depois da entrega (teste do dono 31/10)
-- Carro entregue (solicitacao concluida) ou pedido cancelado: a oficina nao
-- muda mais o orcamento nem os itens pelo navegador. O orcamento aceito ja era
-- travado (045, proteger_orcamento); faltavam os itens e os orcamentos ainda
-- "enviados" de pedidos encerrados. O servidor (service role) continua livre.

CREATE OR REPLACE FUNCTION orcamento_encerrado(p_orc uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM orcamentos o JOIN solicitacoes s ON s.id = o.solicitacao_id
    WHERE o.id = p_orc AND (o.status = 'aceito' OR s.status IN ('concluida', 'cancelada'))
  )
$$;

CREATE OR REPLACE FUNCTION proteger_itens_orcamento() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF orcamento_encerrado(COALESCE(NEW.orcamento_id, OLD.orcamento_id)) THEN
    RAISE EXCEPTION 'SERVICO_ENCERRADO' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_proteger_itens_orcamento ON orcamento_itens;
CREATE TRIGGER trg_proteger_itens_orcamento BEFORE INSERT OR UPDATE OR DELETE ON orcamento_itens
  FOR EACH ROW EXECUTE FUNCTION proteger_itens_orcamento();

CREATE OR REPLACE FUNCTION proteger_orcamento_encerrado() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM oficinas WHERE id = OLD.oficina_id AND profile_id = auth.uid())
     AND EXISTS (SELECT 1 FROM solicitacoes WHERE id = OLD.solicitacao_id AND status IN ('concluida', 'cancelada')) THEN
    RAISE EXCEPTION 'SERVICO_ENCERRADO' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proteger_orcamento_encerrado ON orcamentos;
CREATE TRIGGER trg_proteger_orcamento_encerrado BEFORE UPDATE ON orcamentos
  FOR EACH ROW EXECUTE FUNCTION proteger_orcamento_encerrado();
