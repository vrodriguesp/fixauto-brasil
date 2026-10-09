-- Auditoria Fable 08/10 (M-13): a nota media da oficina passa a ser calculada
-- pelo proprio banco a cada avaliacao criada/editada/apagada. Antes dependia de
-- uma rota que qualquer usuario logado podia chamar para qualquer oficina.

-- protecao da nota (045) aceita o recalculo feito por este gatilho
CREATE OR REPLACE FUNCTION proteger_oficina_campos() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN NEW; END IF;
  NEW.profile_id := OLD.profile_id;
  NEW.created_at := OLD.created_at;
  IF coalesce(current_setting('bipfix.recalculo_nota', true), '') <> '1' THEN
    NEW.avaliacao_media := OLD.avaliacao_media;
    NEW.total_avaliacoes := OLD.total_avaliacoes;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION recalcular_nota_oficina() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE alvo uuid := coalesce(NEW.oficina_id, OLD.oficina_id);
BEGIN
  PERFORM set_config('bipfix.recalculo_nota', '1', true);
  UPDATE oficinas o SET
    avaliacao_media = coalesce((SELECT round(avg(nota)::numeric, 1) FROM avaliacoes WHERE oficina_id = alvo), 0),
    total_avaliacoes = (SELECT count(*) FROM avaliacoes WHERE oficina_id = alvo)
  WHERE o.id = alvo;
  PERFORM set_config('bipfix.recalculo_nota', '', true);
  IF TG_OP = 'UPDATE' AND OLD.oficina_id IS DISTINCT FROM NEW.oficina_id THEN
    PERFORM set_config('bipfix.recalculo_nota', '1', true);
    UPDATE oficinas o SET
      avaliacao_media = coalesce((SELECT round(avg(nota)::numeric, 1) FROM avaliacoes WHERE oficina_id = OLD.oficina_id), 0),
      total_avaliacoes = (SELECT count(*) FROM avaliacoes WHERE oficina_id = OLD.oficina_id)
    WHERE o.id = OLD.oficina_id;
    PERFORM set_config('bipfix.recalculo_nota', '', true);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_recalcular_nota ON avaliacoes;
CREATE TRIGGER trg_recalcular_nota AFTER INSERT OR UPDATE OR DELETE ON avaliacoes
  FOR EACH ROW EXECUTE FUNCTION recalcular_nota_oficina();
