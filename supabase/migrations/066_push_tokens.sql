-- 066: notificacoes push no celular (app fechado) - OK do dono 31/10
-- 1. push_tokens: aparelhos de cada conta (token Expo). Cada um so ve, grava
--    e apaga os proprios; o envio e do servidor (service role).
-- 2. Todo aviso novo em `notificacoes` (venha do servidor, do navegador ou do
--    app) chama o site (/api/push/notificacao) pelo pg_net, sem esperar a
--    resposta: o aviso nunca falha por causa do push. Endereco e chave ficam
--    em push_config (fora do git; ver docs/CHECKLIST_DEPLOY_2026-10-31.md).
--    Sem push_config preenchida, o gatilho nao faz nada.

CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  plataforma text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_tokens_profile_idx ON push_tokens(profile_id);
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_tokens_select ON push_tokens;
CREATE POLICY push_tokens_select ON push_tokens FOR SELECT TO authenticated USING (profile_id = auth.uid());
DROP POLICY IF EXISTS push_tokens_insert ON push_tokens;
CREATE POLICY push_tokens_insert ON push_tokens FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS push_tokens_update ON push_tokens;
CREATE POLICY push_tokens_update ON push_tokens FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS push_tokens_delete ON push_tokens;
CREATE POLICY push_tokens_delete ON push_tokens FOR DELETE TO authenticated USING (profile_id = auth.uid());

-- O mesmo aparelho pode trocar de conta (sair e entrar com outra): o token
-- passa para a conta nova. Pelo navegador/app nao da para "pegar" o token de
-- outra pessoa com UPDATE (RLS), entao o app registra por esta funcao.
CREATE OR REPLACE FUNCTION registrar_push_token(p_token text, p_plataforma text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sem login' USING ERRCODE = '42501'; END IF;
  IF p_token IS NULL OR length(p_token) < 10 OR length(p_token) > 300 THEN
    RAISE EXCEPTION 'token invalido' USING ERRCODE = '22023';
  END IF;
  INSERT INTO push_tokens (profile_id, token, plataforma)
  VALUES (auth.uid(), p_token, left(p_plataforma, 20))
  ON CONFLICT (token) DO UPDATE
    SET profile_id = auth.uid(), plataforma = EXCLUDED.plataforma, last_seen_at = now();
END $$;
REVOKE ALL ON FUNCTION registrar_push_token(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION registrar_push_token(text, text) TO authenticated;

-- Configuracao do envio (uma linha). Sem politicas: so o banco e o service role leem.
CREATE TABLE IF NOT EXISTS push_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  url text NOT NULL,
  chave text NOT NULL
);
ALTER TABLE push_config ENABLE ROW LEVEL SECURITY;

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION avisar_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg push_config%ROWTYPE;
BEGIN
  -- so quem tem aparelho registrado
  IF NOT EXISTS (SELECT 1 FROM push_tokens WHERE profile_id = NEW.profile_id) THEN RETURN NEW; END IF;
  SELECT * INTO cfg FROM push_config WHERE id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  PERFORM net.http_post(
    url := cfg.url,
    body := jsonb_build_object('id', NEW.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-chave', cfg.chave),
    timeout_milliseconds := 10000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- push e extra: nunca impede o aviso
  RAISE WARNING 'avisar_push: %', SQLERRM;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_avisar_push ON notificacoes;
CREATE TRIGGER trg_avisar_push AFTER INSERT ON notificacoes
  FOR EACH ROW EXECUTE FUNCTION avisar_push();
