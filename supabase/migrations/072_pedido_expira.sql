-- Pedido expira (dono 04/11): pedido aberto ha 30 dias (conta de novo a partir
-- de quando o cliente reabre) sem orcamento escolhido fecha como "expirada" e sai
-- das listas das oficinas. Os orcamentos NAO mudam: ao reabrir o cliente volta a
-- ver os mesmos. A tarefa diaria /api/tarefas/expirar-pedidos faz a troca e avisa
-- cliente e oficinas que orcaram (no sino).

ALTER TYPE status_solicitacao ADD VALUE IF NOT EXISTS 'expirada';

ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS expirada_em timestamptz;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS reaberta_em timestamptz;

-- prazo em dias (por enquanto 30; admin pode mudar no banco)
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS pedido_validade_dias integer NOT NULL DEFAULT 30
  CHECK (pedido_validade_dias BETWEEN 7 AND 365);

-- trava de status (045): passa a aceitar expirada -> aberta/em_orcamento SO quando
-- vem de reabrir_pedido() (marca 'bipfix.reabrindo' na transacao; o cliente nao
-- consegue marcar isso direto pela API). Resto igual a 045.
CREATE OR REPLACE FUNCTION proteger_solicitacao() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN NEW; END IF;
  NEW.cliente_id := OLD.cliente_id;
  NEW.created_at := OLD.created_at;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (NEW.status = 'cancelada' AND OLD.status IN ('aberta', 'em_orcamento'))
     AND NOT (OLD.status = 'expirada' AND NEW.status IN ('aberta', 'em_orcamento')
              -- coalesce: sem a marca current_setting da NULL e o NOT(...) viraria NULL = passa
              AND coalesce(current_setting('bipfix.reabrindo', true), '') = '1') THEN
    RAISE EXCEPTION 'mudanca de status nao permitida' USING ERRCODE = '42501';
  END IF;
  IF NEW.veiculo_id IS DISTINCT FROM OLD.veiculo_id
     AND NOT EXISTS (SELECT 1 FROM veiculos WHERE id = NEW.veiculo_id AND profile_id = OLD.cliente_id) THEN
    RAISE EXCEPTION 'veiculo de outra pessoa' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- o cliente reabre o proprio pedido expirado: volta a "em_orcamento" se ainda tem
-- orcamento valido, senao "aberta"; o prazo recomeca (reaberta_em)
CREATE OR REPLACE FUNCTION reabrir_pedido(p_solicitacao uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM solicitacoes WHERE id = p_solicitacao AND cliente_id = auth.uid() AND status = 'expirada') THEN
    RAISE EXCEPTION 'PEDIDO_NAO_REABRIVEL' USING ERRCODE = 'P0001';
  END IF;
  v_status := CASE WHEN EXISTS (SELECT 1 FROM orcamentos WHERE solicitacao_id = p_solicitacao AND status IN ('enviado', 'visualizado'))
                   THEN 'em_orcamento' ELSE 'aberta' END;
  PERFORM set_config('bipfix.reabrindo', '1', true);
  UPDATE solicitacoes SET status = v_status::status_solicitacao, reaberta_em = now(), expirada_em = NULL
   WHERE id = p_solicitacao;
  PERFORM set_config('bipfix.reabrindo', '', true);
  RETURN v_status;
END;
$$;
REVOKE ALL ON FUNCTION reabrir_pedido(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION reabrir_pedido(uuid) TO authenticated;

-- orcamento de pedido expirado fica fechado para a oficina (como em 065) ate o
-- cliente reabrir. Compara como texto: o valor novo do enum nao pode ser usado
-- na mesma transacao do ALTER TYPE (corpo SQL e conferido ao criar).
CREATE OR REPLACE FUNCTION orcamento_encerrado(p_orc uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM orcamentos o JOIN solicitacoes s ON s.id = o.solicitacao_id
    WHERE o.id = p_orc AND (o.status = 'aceito' OR s.status::text IN ('concluida', 'cancelada', 'expirada'))
  )
$$;

CREATE OR REPLACE FUNCTION proteger_orcamento_encerrado() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM oficinas WHERE id = OLD.oficina_id AND profile_id = auth.uid())
     AND EXISTS (SELECT 1 FROM solicitacoes WHERE id = OLD.solicitacao_id AND status::text IN ('concluida', 'cancelada', 'expirada')) THEN
    RAISE EXCEPTION 'SERVICO_ENCERRADO' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
