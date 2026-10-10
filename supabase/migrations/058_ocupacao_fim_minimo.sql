-- Ocupacao fechada logo depois de aberta: o fim minimo era inicio + 1 minuto,
-- que podia cair no futuro e cruzar com o proximo carro do posto (falso
-- conflito no Quadro, achado no teste de 10/10). Agora inicio + 1 segundo.
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
    UPDATE posto_ocupacoes SET fim = GREATEST(now(), inicio + interval '1 second') WHERE agenda_id = NEW.id AND real AND fim IS NULL;
    DELETE FROM posto_ocupacoes WHERE agenda_id = NEW.id AND NOT real AND fim > now();
  END IF;
  RETURN NULL;
END $$;
