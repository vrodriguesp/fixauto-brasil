-- Agenda em tempo real (09/10/2026): o calendario atual e o "Quadro" da
-- oficina leem os mesmos agendamentos; com a tabela publicada, uma mudanca
-- feita em uma tela ou em outro aparelho (dono, mecanico no celular) aparece
-- nas outras sem recarregar. As regras de acesso (RLS) valem tambem para o
-- tempo real: cada oficina so recebe os proprios agendamentos.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'agenda') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda;
  END IF;
END $$;
