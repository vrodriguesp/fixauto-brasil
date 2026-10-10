-- Quadro profissional (projeto docs/PROJETO_QUADRO_OFICINA_2026-10-09.md, fase 1).
-- 1) Tempo REAL do carro na oficina: clique de check-in e de entrega gravados
--    em colunas proprias (antes so dava para deduzir pelo historico, e o
--    check-in antecipado/entrega sobrescreviam data_inicio/data_fim).
-- 2) Ocupacao dos postos (elevador, posto no chao, vaga de espera) por
--    INTERVALO de horas, inclusive reservas: um carro de 3 dias pode ficar
--    2 h no elevador - antes o elevador ficava "ocupado" os 3 dias.
-- 3) Limite geral de carros da oficina e modo Monitoramento (liga/desliga).
-- Os carimbos e o fechamento das ocupacoes sao feitos AQUI, por gatilho:
-- vale para todos os caminhos que mudam o status (check-in, entrega,
-- cancelamento pelo admin, falta, revisao recusada, exclusao de conta).

-- ---------- 1. agenda: carimbos reais e entrada prevista ----------
ALTER TABLE agenda
  ADD COLUMN IF NOT EXISTS data_inicio_prevista timestamptz,
  ADD COLUMN IF NOT EXISTS checkin_em timestamptz,
  ADD COLUMN IF NOT EXISTS entregue_em timestamptz;

UPDATE agenda SET data_inicio_prevista = data_inicio WHERE data_inicio_prevista IS NULL;
UPDATE agenda SET data_fim_prevista = data_fim WHERE data_fim_prevista IS NULL;
UPDATE agenda a SET checkin_em = h.t FROM (
  SELECT agenda_id, min(created_at) t FROM agenda_historico WHERE acao IN ('checkin', 'checkin_antecipado') GROUP BY agenda_id
) h WHERE h.agenda_id = a.id AND a.checkin_em IS NULL;
UPDATE agenda a SET checkin_em = e.t FROM (
  SELECT agenda_id, min(created_at) t FROM manutencao_etapas WHERE status = 'recebido' GROUP BY agenda_id
) e WHERE e.agenda_id = a.id AND a.checkin_em IS NULL;
UPDATE agenda SET checkin_em = data_inicio WHERE checkin_em IS NULL AND status IN ('em_andamento', 'concluido');
UPDATE agenda a SET entregue_em = e.t FROM (
  SELECT agenda_id, max(created_at) t FROM manutencao_etapas WHERE status = 'entregue' GROUP BY agenda_id
) e WHERE e.agenda_id = a.id AND a.entregue_em IS NULL AND a.status = 'concluido';
UPDATE agenda SET entregue_em = data_fim WHERE entregue_em IS NULL AND status = 'concluido';

CREATE OR REPLACE FUNCTION agenda_carimbos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.data_inicio_prevista := COALESCE(NEW.data_inicio_prevista, NEW.data_inicio);
    NEW.data_fim_prevista := COALESCE(NEW.data_fim_prevista, NEW.data_fim);
    IF NEW.status = 'em_andamento' AND NEW.checkin_em IS NULL THEN NEW.checkin_em := now(); END IF;
    RETURN NEW;
  END IF;
  -- a tela (usuario logado) nao altera os carimbos reais: so o servidor/gatilho
  IF auth.role() = 'authenticated' AND (
     NEW.checkin_em IS DISTINCT FROM OLD.checkin_em OR NEW.entregue_em IS DISTINCT FROM OLD.entregue_em
     OR NEW.data_inicio_prevista IS DISTINCT FROM OLD.data_inicio_prevista) THEN
    RAISE EXCEPTION 'carimbos reais so pelo servidor' USING ERRCODE = '42501';
  END IF;
  -- reagendamento antes do check-in: a nova data e a nova promessa
  IF NEW.status = 'agendado' AND OLD.status = 'agendado' THEN
    IF NEW.data_inicio IS DISTINCT FROM OLD.data_inicio THEN NEW.data_inicio_prevista := NEW.data_inicio; END IF;
    IF NEW.data_fim IS DISTINCT FROM OLD.data_fim AND NEW.data_fim_prevista IS NOT DISTINCT FROM OLD.data_fim_prevista THEN
      NEW.data_fim_prevista := NEW.data_fim;
    END IF;
  END IF;
  IF OLD.status = 'agendado' AND NEW.status = 'em_andamento' AND NEW.checkin_em IS NULL THEN NEW.checkin_em := now(); END IF;
  IF NEW.status = 'concluido' AND OLD.status IS DISTINCT FROM 'concluido' AND NEW.entregue_em IS NULL THEN NEW.entregue_em := now(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS agenda_carimbos ON agenda;
CREATE TRIGGER agenda_carimbos BEFORE INSERT OR UPDATE ON agenda FOR EACH ROW EXECUTE FUNCTION agenda_carimbos();
CREATE INDEX IF NOT EXISTS agenda_oficina_checkin_idx ON agenda (oficina_id, checkin_em) WHERE checkin_em IS NOT NULL;

-- ---------- 2. postos: capacidade (vaga de espera cabe varios) ----------
ALTER TABLE oficina_boxes ADD COLUMN IF NOT EXISTS capacidade integer NOT NULL DEFAULT 1;
ALTER TABLE oficina_boxes DROP CONSTRAINT IF EXISTS oficina_boxes_capacidade_check;
ALTER TABLE oficina_boxes ADD CONSTRAINT oficina_boxes_capacidade_check CHECK (capacidade BETWEEN 1 AND 50);
UPDATE oficina_boxes SET capacidade = 20 WHERE tipo = 'vaga' AND capacidade = 1;

-- ---------- 3. ocupacoes de posto (intervalos; reserva = real false) ----------
CREATE TABLE IF NOT EXISTS posto_ocupacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oficina_id uuid NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  box_id uuid NOT NULL REFERENCES oficina_boxes(id) ON DELETE CASCADE,
  agenda_id uuid NOT NULL REFERENCES agenda(id) ON DELETE CASCADE,
  inicio timestamptz NOT NULL,
  fim timestamptz,
  real boolean NOT NULL DEFAULT false,
  observacao text CHECK (observacao IS NULL OR char_length(observacao) <= 200),
  funcionario_id uuid REFERENCES funcionarios(id) ON DELETE SET NULL,
  por_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posto_ocupacoes_fim_check CHECK (fim IS NULL OR fim > inicio),
  CONSTRAINT posto_ocupacoes_reserva_fim CHECK (real OR fim IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS posto_ocupacoes_box_idx ON posto_ocupacoes (box_id, inicio);
CREATE INDEX IF NOT EXISTS posto_ocupacoes_agenda_idx ON posto_ocupacoes (agenda_id);
CREATE INDEX IF NOT EXISTS posto_ocupacoes_oficina_idx ON posto_ocupacoes (oficina_id, inicio);
-- um carro so pode estar fisicamente em um posto por vez
CREATE UNIQUE INDEX IF NOT EXISTS posto_ocupacoes_uma_aberta ON posto_ocupacoes (agenda_id) WHERE real AND fim IS NULL;

ALTER TABLE posto_ocupacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS posto_ocupacoes_select ON posto_ocupacoes;
CREATE POLICY posto_ocupacoes_select ON posto_ocupacoes FOR SELECT TO authenticated
  USING (oficina_id IN (SELECT minhas_oficinas()) OR eh_admin());
-- grava so o servidor (/api/servico) e os gatilhos, como agenda_historico
REVOKE ALL ON posto_ocupacoes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON posto_ocupacoes FROM authenticated;
GRANT SELECT ON posto_ocupacoes TO authenticated;

CREATE OR REPLACE FUNCTION posto_ocupacao_valida() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM oficina_boxes b WHERE b.id = NEW.box_id AND b.oficina_id = NEW.oficina_id)
     OR NOT EXISTS (SELECT 1 FROM agenda a WHERE a.id = NEW.agenda_id AND a.oficina_id = NEW.oficina_id) THEN
    RAISE EXCEPTION 'posto ou agendamento de outra oficina' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS posto_ocupacao_valida ON posto_ocupacoes;
CREATE TRIGGER posto_ocupacao_valida BEFORE INSERT OR UPDATE ON posto_ocupacoes FOR EACH ROW EXECUTE FUNCTION posto_ocupacao_valida();

-- agenda.box_id = cache do posto ATUAL do carro em servico (telas antigas e
-- app continuam lendo box_id). Carro ainda agendado: box_id = posto planejado.
CREATE OR REPLACE FUNCTION posto_ocupacao_sincroniza_box() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE aid uuid := COALESCE(NEW.agenda_id, OLD.agenda_id); atual uuid;
BEGIN
  SELECT box_id INTO atual FROM posto_ocupacoes WHERE agenda_id = aid AND real AND fim IS NULL ORDER BY inicio DESC LIMIT 1;
  UPDATE agenda SET box_id = atual WHERE id = aid AND status = 'em_andamento' AND box_id IS DISTINCT FROM atual;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS posto_ocupacao_sincroniza ON posto_ocupacoes;
CREATE TRIGGER posto_ocupacao_sincroniza AFTER INSERT OR UPDATE OR DELETE ON posto_ocupacoes
  FOR EACH ROW EXECUTE FUNCTION posto_ocupacao_sincroniza_box();

-- mudanca de status do carro: check-in com posto planejado abre a ocupacao;
-- entrega/cancelamento/falta fecham as abertas e apagam as reservas futuras
CREATE OR REPLACE FUNCTION agenda_status_postos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status = 'agendado' AND NEW.status = 'em_andamento' AND NEW.box_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM oficina_boxes b WHERE b.id = NEW.box_id AND b.ativo)
     AND NOT EXISTS (SELECT 1 FROM posto_ocupacoes WHERE agenda_id = NEW.id AND real AND fim IS NULL) THEN
    -- reserva do mesmo carro neste posto cobrindo agora vira ocupacao real
    UPDATE posto_ocupacoes SET real = true, inicio = now(), fim = NULL
     WHERE id = (SELECT id FROM posto_ocupacoes WHERE agenda_id = NEW.id AND box_id = NEW.box_id AND NOT real AND inicio <= now() + interval '2 hours' AND fim > now() ORDER BY inicio LIMIT 1);
    IF NOT FOUND THEN
      INSERT INTO posto_ocupacoes (oficina_id, box_id, agenda_id, inicio, real, funcionario_id)
      VALUES (NEW.oficina_id, NEW.box_id, NEW.id, now(), true, NEW.funcionario_id);
    END IF;
  END IF;
  IF NEW.status IN ('concluido', 'cancelado') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE posto_ocupacoes SET fim = GREATEST(now(), inicio + interval '1 minute') WHERE agenda_id = NEW.id AND real AND fim IS NULL;
    DELETE FROM posto_ocupacoes WHERE agenda_id = NEW.id AND NOT real AND fim > now();
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS agenda_status_postos ON agenda;
CREATE TRIGGER agenda_status_postos AFTER UPDATE OF status ON agenda FOR EACH ROW EXECUTE FUNCTION agenda_status_postos();

-- dados de hoje: carro em servico com elevador vira ocupacao real aberta
INSERT INTO posto_ocupacoes (oficina_id, box_id, agenda_id, inicio, real, funcionario_id)
SELECT a.oficina_id, a.box_id, a.id, COALESCE(a.checkin_em, a.data_inicio), true, a.funcionario_id
FROM agenda a JOIN oficina_boxes b ON b.id = a.box_id AND b.ativo
WHERE a.status = 'em_andamento'
  AND NOT EXISTS (SELECT 1 FROM posto_ocupacoes p WHERE p.agenda_id = a.id AND p.real AND p.fim IS NULL);

-- historico: reservas e reagendamento
ALTER TABLE agenda_historico DROP CONSTRAINT IF EXISTS agenda_historico_acao_check;
ALTER TABLE agenda_historico ADD CONSTRAINT agenda_historico_acao_check
  CHECK (acao = ANY (ARRAY['checkin', 'checkin_antecipado', 'atribuido', 'etapa', 'entregue', 'retirado_revisao_recusada', 'elevador', 'posto_reserva', 'reagendado']));

-- ---------- 4. oficina: limite geral e monitoramento ----------
ALTER TABLE oficinas
  ADD COLUMN IF NOT EXISTS capacidade_total integer,
  ADD COLUMN IF NOT EXISTS monitoramento_ativo boolean NOT NULL DEFAULT false;
ALTER TABLE oficinas DROP CONSTRAINT IF EXISTS oficinas_capacidade_total_check;
ALTER TABLE oficinas ADD CONSTRAINT oficinas_capacidade_total_check CHECK (capacidade_total IS NULL OR capacidade_total BETWEEN 1 AND 500);

-- ---------- 5. tempo real ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'posto_ocupacoes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.posto_ocupacoes;
  END IF;
END $$;
