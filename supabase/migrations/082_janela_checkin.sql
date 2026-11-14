-- 082: janela de check-in (check-in v2, decisoes finais do dono 14/11 noite:
-- Documentos/Analises/Checkin_v2_decisoes_finais_2026-11-14.md; spec Fable v2 secao D e mapa de
-- propagacao da spec v1 secao 7). Aditiva: nada antigo muda de valor.
--
-- Uma fonte de verdade por fase:
--  - antes do aceite: orcamento_disponibilidade.hora_inicio/hora_fim (gravados no envio, nunca
--    recalculados; nulos = linha antiga -> o site/app mostram 08:00-12:00 / 13:00-17:00 como antes);
--  - depois do aceite: agenda.data_inicio (inicio) + agenda.checkin_ate (fim da janela de chegada).

-- 1) janela por horario oferecido (minimo 30 min); turno passa a ser derivado do inicio (< 12:00 = manha)
ALTER TABLE orcamento_disponibilidade
  ADD COLUMN IF NOT EXISTS hora_inicio time,
  ADD COLUMN IF NOT EXISTS hora_fim time;
ALTER TABLE orcamento_disponibilidade DROP CONSTRAINT IF EXISTS orcamento_disponibilidade_janela_chk;
ALTER TABLE orcamento_disponibilidade ADD CONSTRAINT orcamento_disponibilidade_janela_chk CHECK (
  (hora_inicio IS NULL) = (hora_fim IS NULL)
  AND (hora_inicio IS NULL OR hora_fim - hora_inicio >= interval '30 minutes')
  AND (hora_inicio IS NULL OR turno = CASE WHEN hora_inicio < time '12:00' THEN 'manha' ELSE 'tarde' END)
);

-- 2) agenda: fim da janela de chegada + o fim avisado no ultimo e-mail (par de aviso_cliente_inicio, 075):
--    o e-mail/.ics e reenviado quando o inicio OU o fim muda
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS checkin_ate timestamptz;
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS aviso_cliente_ate timestamptz;

-- 3) perfil da oficina: recepcao de carros (UM par para a semana, cortado pelo horario de cada dia;
--    hora fixa = inicio + 30 min; nulos = horario de funcionamento) e almoco (UM par para a semana;
--    as faixas pulam o almoco). recepcao_confirmada_em = "o horario de funcionamento serve" (o convite
--    em Pedidos nao aparece mais).
ALTER TABLE oficinas
  ADD COLUMN IF NOT EXISTS recepcao_inicio time,
  ADD COLUMN IF NOT EXISTS recepcao_fim time,
  ADD COLUMN IF NOT EXISTS almoco_inicio time,
  ADD COLUMN IF NOT EXISTS almoco_fim time,
  ADD COLUMN IF NOT EXISTS recepcao_confirmada_em timestamptz;
ALTER TABLE oficinas DROP CONSTRAINT IF EXISTS oficinas_recepcao_chk;
ALTER TABLE oficinas ADD CONSTRAINT oficinas_recepcao_chk CHECK (
  (recepcao_inicio IS NULL) = (recepcao_fim IS NULL)
  AND (recepcao_inicio IS NULL OR recepcao_fim - recepcao_inicio >= interval '30 minutes')
);
ALTER TABLE oficinas DROP CONSTRAINT IF EXISTS oficinas_almoco_chk;
ALTER TABLE oficinas ADD CONSTRAINT oficinas_almoco_chk CHECK (
  (almoco_inicio IS NULL) = (almoco_fim IS NULL)
  AND (almoco_inicio IS NULL OR almoco_fim - almoco_inicio >= interval '15 minutes')
);

-- 4) 077 (mudanca de data): fim da janela proposta (nova_hora = inicio) e o fim da janela anterior (o
--    "nao combinei isso" do cliente volta a agenda inteira, inicio e fim)
ALTER TABLE orcamento_revisoes ADD COLUMN IF NOT EXISTS nova_hora_fim time;
ALTER TABLE orcamento_revisoes ADD COLUMN IF NOT EXISTS checkin_ate_anterior timestamptz;

-- 5) rede de seguranca da validade (dono 14/11 noite, item 4): validade >= maior data de check-in.
--    O formulario ja exige (vermelho ao enviar); o insert e direto do navegador (RLS), entao o banco
--    garante: horario novo depois da validade empurra a validade para o dia dele (mesma regra do
--    estenderValidade do 079). Um CHECK nao da (duas tabelas). So atualiza quando precisa.
CREATE OR REPLACE FUNCTION validade_cobre_checkin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE orcamentos SET validade = NEW.data_checkin
   WHERE id = NEW.orcamento_id AND (validade IS NULL OR validade < NEW.data_checkin);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validade_cobre_checkin ON orcamento_disponibilidade;
CREATE TRIGGER trg_validade_cobre_checkin AFTER INSERT OR UPDATE OF data_checkin ON orcamento_disponibilidade
  FOR EACH ROW EXECUTE FUNCTION validade_cobre_checkin();
