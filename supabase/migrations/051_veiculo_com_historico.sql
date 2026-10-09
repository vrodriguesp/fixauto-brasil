-- Auditoria Fable 08/10 (B4): apagar um carro apagava em cascata todos os
-- pedidos dele (historico, orcamentos, garantia). Pelo app/site o carro com
-- pedidos nao se apaga; o servidor (exclusao de conta) continua decidindo.
CREATE OR REPLACE FUNCTION proteger_veiculo_com_historico() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF chamada_de_usuario() AND EXISTS (SELECT 1 FROM solicitacoes WHERE veiculo_id = OLD.id) THEN
    RAISE EXCEPTION 'veiculo com historico de pedidos' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_proteger_veiculo ON veiculos;
CREATE TRIGGER trg_proteger_veiculo BEFORE DELETE ON veiculos FOR EACH ROW EXECUTE FUNCTION proteger_veiculo_com_historico();
