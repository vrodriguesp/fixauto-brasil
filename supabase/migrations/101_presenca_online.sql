-- 101: presenca ("online agora" / "visto ha X") para o admin (dono 19/11: "um status
-- online que a gente veja pelo painel do admin").
-- Uma linha por conta logada com SO a hora do ultimo sinal (sem IP, sem pagina, sem
-- aparelho). O site e o app mandam um sinal por minuto com a tela visivel
-- (/api/presenca, limitado no servidor); visitante sem login nao manda nada.
-- Quem le: so o admin (eh_admin()). Quem escreve: a propria conta (a rota usa a
-- service role, mas a politica fica para o app/cliente direto e para o teste de RLS).
-- Rollback: DROP TABLE public.presenca;

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.presenca (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  visto_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS presenca_visto_em ON public.presenca (visto_em DESC);

ALTER TABLE public.presenca ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.presenca FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.presenca TO authenticated;
REVOKE DELETE ON public.presenca FROM authenticated;

DROP POLICY IF EXISTS presenca_select_admin ON public.presenca;
CREATE POLICY presenca_select_admin ON public.presenca FOR SELECT TO authenticated
  USING (public.eh_admin() OR profile_id = auth.uid());
DROP POLICY IF EXISTS presenca_insert_propria ON public.presenca;
CREATE POLICY presenca_insert_propria ON public.presenca FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS presenca_update_propria ON public.presenca;
CREATE POLICY presenca_update_propria ON public.presenca FOR UPDATE TO authenticated
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

COMMIT;
NOTIFY pgrst, 'reload schema';
