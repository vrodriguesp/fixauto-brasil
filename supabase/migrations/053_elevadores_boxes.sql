-- Elevadores / boxes da oficina (09/10/2026, pedido do dono): um carro no
-- elevador ocupa DOIS recursos ao mesmo tempo - o mecanico e o elevador.
-- O Quadro da agenda mostra por mecanico ou por elevador; o mesmo agendamento
-- aparece nas duas visoes. Um elevador recebe um carro por vez (o conflito e
-- mostrado na tela; nao e bloqueado no banco porque a oficina pode trocar o
-- carro de elevador ao longo do servico).

CREATE TABLE IF NOT EXISTS oficina_boxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oficina_id uuid NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 40),
  tipo text NOT NULL DEFAULT 'elevador' CHECK (tipo IN ('elevador', 'box', 'vaga')),
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oficina_boxes_oficina_idx ON oficina_boxes (oficina_id, ativo, ordem);

ALTER TABLE oficina_boxes ENABLE ROW LEVEL SECURITY;
-- dono e equipe ativa veem; so o dono cadastra/edita (apagar = desativar, o historico fica)
DROP POLICY IF EXISTS oficina_boxes_select ON oficina_boxes;
CREATE POLICY oficina_boxes_select ON oficina_boxes FOR SELECT TO authenticated
  USING (oficina_id IN (SELECT minhas_oficinas()) OR eh_admin());
DROP POLICY IF EXISTS oficina_boxes_insert ON oficina_boxes;
CREATE POLICY oficina_boxes_insert ON oficina_boxes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM oficinas o WHERE o.id = oficina_id AND o.profile_id = auth.uid()));
DROP POLICY IF EXISTS oficina_boxes_update ON oficina_boxes;
CREATE POLICY oficina_boxes_update ON oficina_boxes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM oficinas o WHERE o.id = oficina_id AND o.profile_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM oficinas o WHERE o.id = oficina_id AND o.profile_id = auth.uid()));
REVOKE ALL ON oficina_boxes FROM anon;
GRANT SELECT, INSERT, UPDATE ON oficina_boxes TO authenticated;

-- carro no elevador
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS box_id uuid REFERENCES oficina_boxes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS agenda_box_idx ON agenda (box_id) WHERE box_id IS NOT NULL;

-- o elevador tem de ser da mesma oficina do agendamento
CREATE OR REPLACE FUNCTION agenda_box_da_oficina() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.box_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.box_id IS DISTINCT FROM OLD.box_id) THEN
    IF NOT EXISTS (SELECT 1 FROM oficina_boxes b WHERE b.id = NEW.box_id AND b.oficina_id = NEW.oficina_id AND b.ativo) THEN
      RAISE EXCEPTION 'elevador/box de outra oficina ou desativado' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS agenda_box_da_oficina ON agenda;
CREATE TRIGGER agenda_box_da_oficina BEFORE INSERT OR UPDATE OF box_id ON agenda
  FOR EACH ROW EXECUTE FUNCTION agenda_box_da_oficina();

-- tempo real (as telas abertas veem um elevador novo/desativado)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'oficina_boxes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oficina_boxes;
  END IF;
END $$;
