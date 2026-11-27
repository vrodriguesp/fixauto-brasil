-- 118 (27/11, app da oficina 1.1.0): versao do app em cada token de push.
-- O servidor passa a escolher canal do Android / prioridade / badge por tipo de aviso (push-canal.ts),
-- mas o app 1.0.0 so criou o canal 'avisos' - um push com channelId que nao existe no aparelho NAO aparece
-- (docs da Expo). Entao: token sem versao (app antigo) continua recebendo como hoje ('avisos', alta, sem
-- badge); so o token que declarou versao >= 1.1.0 recebe os canais novos. Nada de FK nova (sem risco PGRST201).
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS versao_app text;

-- a funcao ganha o 3o parametro (opcional): o app antigo segue chamando com 2 e cai no DEFAULT
DROP FUNCTION IF EXISTS registrar_push_token(text, text);
CREATE OR REPLACE FUNCTION registrar_push_token(p_token text, p_plataforma text, p_versao text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sem login' USING ERRCODE = '42501'; END IF;
  IF p_token IS NULL OR length(p_token) < 10 OR length(p_token) > 300 THEN
    RAISE EXCEPTION 'token invalido' USING ERRCODE = '22023';
  END IF;
  INSERT INTO push_tokens (profile_id, token, plataforma, versao_app)
  VALUES (auth.uid(), p_token, left(p_plataforma, 20), left(p_versao, 20))
  ON CONFLICT (token) DO UPDATE
    SET profile_id = auth.uid(), plataforma = EXCLUDED.plataforma, versao_app = EXCLUDED.versao_app, last_seen_at = now();
END $$;
REVOKE ALL ON FUNCTION registrar_push_token(text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION registrar_push_token(text, text, text) TO authenticated;
