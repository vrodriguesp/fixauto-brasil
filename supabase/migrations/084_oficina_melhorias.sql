-- 084: pagina "Melhorias" da oficina + aviso "Novidades" (pedido do dono 15/11; Documentos/Analises/
-- Oficina_melhorias_aprender_guias_2026-11-15.md). Aditiva e idempotente (CREATE ... IF NOT EXISTS,
-- DROP POLICY IF EXISTS + CREATE, CREATE OR REPLACE): pode rodar de novo sem duplicar nada. Vai depois da
-- 083 e antes do site. NENHUM e-mail (confirmacao do dono 15/11): so o aviso no sino e o cartao em Pedidos.

-- 1) Quem cuida da oficina: o dono ou funcionario 'admin' ativo (o mecanico nao responde a pesquisa).
CREATE OR REPLACE FUNCTION public.oficinas_que_gerencio() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM oficinas WHERE profile_id = auth.uid()
  UNION
  SELECT oficina_id FROM funcionarios WHERE profile_id = auth.uid() AND ativo AND cargo = 'admin';
$$;
REVOKE ALL ON FUNCTION public.oficinas_que_gerencio() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.oficinas_que_gerencio() TO authenticated;

-- 2) Pesquisa do calendario: UMA resposta por oficina (editavel). Todas as perguntas sao opcionais.
CREATE TABLE IF NOT EXISTS oficina_pesquisa_calendario (
  oficina_id uuid PRIMARY KEY REFERENCES oficinas(id) ON DELETE CASCADE,
  -- 1. como marcam a entrada dos carros (varias)
  como_marcam text[] NOT NULL DEFAULT '{}'
    CHECK (como_marcam <@ ARRAY['telefone', 'mensageiro', 'email', 'site', 'programa', 'papel', 'outro']::text[]),
  como_marcam_outro text CHECK (como_marcam_outro IS NULL OR char_length(como_marcam_outro) <= 200),
  -- 2. programa de agenda / ordens de servico
  programa text CHECK (programa IS NULL OR programa IN ('nenhum', 'google', 'outlook', 'planilha', 'programa_oficina', 'outro')),
  programa_nome text CHECK (programa_nome IS NULL OR char_length(programa_nome) <= 200),
  -- 3. carros por dia
  carros_dia text CHECK (carros_dia IS NULL OR carros_dia IN ('1-3', '4-8', '9-15', '15+')),
  -- 4. como preferem dizer a hora de chegada ao cliente
  hora_cliente text CHECK (hora_cliente IS NULL OR hora_cliente IN ('exata', 'faixa', 'manha_tarde', 'telefone')),
  -- 5. ver os agendamentos do BipFix no Google/Outlook
  calendario_externo text CHECK (calendario_externo IS NULL OR calendario_externo IN ('sim', 'talvez', 'nao')),
  -- 6. o que mais toma tempo (texto livre)
  maior_tempo text CHECK (maior_tempo IS NULL OR char_length(maior_tempo) <= 2000),
  respondido_por uuid DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- quem respondeu e quando: sempre do servidor do banco (o navegador nao escolhe)
CREATE OR REPLACE FUNCTION pesquisa_calendario_carimbo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN NEW.created_at := now(); ELSE NEW.created_at := OLD.created_at; END IF;
  IF chamada_de_usuario() THEN NEW.respondido_por := auth.uid(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pesquisa_calendario_carimbo ON oficina_pesquisa_calendario;
CREATE TRIGGER trg_pesquisa_calendario_carimbo BEFORE INSERT OR UPDATE ON oficina_pesquisa_calendario
  FOR EACH ROW EXECUTE FUNCTION pesquisa_calendario_carimbo();

ALTER TABLE oficina_pesquisa_calendario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pesquisa_calendario_select ON oficina_pesquisa_calendario;
CREATE POLICY pesquisa_calendario_select ON oficina_pesquisa_calendario FOR SELECT TO authenticated
  USING (oficina_id IN (SELECT oficinas_que_gerencio()) OR eh_admin());
DROP POLICY IF EXISTS pesquisa_calendario_insert ON oficina_pesquisa_calendario;
CREATE POLICY pesquisa_calendario_insert ON oficina_pesquisa_calendario FOR INSERT TO authenticated
  WITH CHECK (oficina_id IN (SELECT oficinas_que_gerencio()));
DROP POLICY IF EXISTS pesquisa_calendario_update ON oficina_pesquisa_calendario;
CREATE POLICY pesquisa_calendario_update ON oficina_pesquisa_calendario FOR UPDATE TO authenticated
  USING (oficina_id IN (SELECT oficinas_que_gerencio()))
  WITH CHECK (oficina_id IN (SELECT oficinas_que_gerencio()));
REVOKE ALL ON oficina_pesquisa_calendario FROM anon;
GRANT SELECT, INSERT, UPDATE ON oficina_pesquisa_calendario TO authenticated;

-- 3) Sugestoes: caixa aberta, varias ao longo do tempo. A oficina ve as proprias; o admin le todas.
CREATE TABLE IF NOT EXISTS oficina_sugestoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oficina_id uuid NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  autor_id uuid DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  texto text NOT NULL CHECK (char_length(btrim(texto)) BETWEEN 3 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oficina_sugestoes_oficina_idx ON oficina_sugestoes (oficina_id, created_at DESC);

-- volume normal: poucas por dia; o navegador nao escolhe autor nem data
CREATE OR REPLACE FUNCTION oficina_sugestoes_limite() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN NEW; END IF;
  NEW.autor_id := auth.uid();
  NEW.created_at := now();
  IF (SELECT count(*) FROM oficina_sugestoes
      WHERE oficina_id = NEW.oficina_id AND created_at > now() - interval '1 day') >= 20 THEN
    RAISE EXCEPTION 'limite de sugestoes atingido' USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_oficina_sugestoes_limite ON oficina_sugestoes;
CREATE TRIGGER trg_oficina_sugestoes_limite BEFORE INSERT ON oficina_sugestoes
  FOR EACH ROW EXECUTE FUNCTION oficina_sugestoes_limite();

ALTER TABLE oficina_sugestoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oficina_sugestoes_select ON oficina_sugestoes;
CREATE POLICY oficina_sugestoes_select ON oficina_sugestoes FOR SELECT TO authenticated
  USING (oficina_id IN (SELECT oficinas_que_gerencio()) OR eh_admin());
DROP POLICY IF EXISTS oficina_sugestoes_insert ON oficina_sugestoes;
CREATE POLICY oficina_sugestoes_insert ON oficina_sugestoes FOR INSERT TO authenticated
  WITH CHECK (oficina_id IN (SELECT oficinas_que_gerencio()));
REVOKE ALL ON oficina_sugestoes FROM anon;
GRANT SELECT, INSERT ON oficina_sugestoes TO authenticated;

-- 4) Avisos fechados pela pessoa (cartao "Novidades" em Pedidos): guardado no banco, vale em qualquer
--    aparelho. Uma linha por pessoa e aviso (chave).
CREATE TABLE IF NOT EXISTS avisos_dispensados (
  profile_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  chave text NOT NULL CHECK (char_length(chave) BETWEEN 1 AND 80),
  dispensado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, chave)
);
ALTER TABLE avisos_dispensados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS avisos_dispensados_select ON avisos_dispensados;
CREATE POLICY avisos_dispensados_select ON avisos_dispensados FOR SELECT TO authenticated
  USING (profile_id = auth.uid());
DROP POLICY IF EXISTS avisos_dispensados_insert ON avisos_dispensados;
CREATE POLICY avisos_dispensados_insert ON avisos_dispensados FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());
REVOKE ALL ON avisos_dispensados FROM anon;
GRANT SELECT, INSERT ON avisos_dispensados TO authenticated;

-- 5) Aviso no sino "Novidades" (uma vez por pessoa): dono de cada oficina e funcionario admin ativo.
--    Idempotente: quem ja tem o aviso desta chave nao recebe outro. Texto nas 6 linguas em dados.textos
--    (o sino mostra a lingua da tela, lib/notif-textos.ts); titulo/mensagem na lingua da conta.
--    O cartao "Novidades" em Pedidos aparece para quem tem este aviso (components/oficina/NovidadesOficina.tsx).
CREATE OR REPLACE FUNCTION avisar_novidades_oficinas_2026_11() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  textos jsonb := jsonb_build_object(
    'pt', jsonb_build_object('titulo', 'Novidades no BipFix',
      'mensagem', 'No Perfil, agora você pode marcar o horário de recepção de carros e o almoço. Na nova página Melhorias, conte como vocês marcam os carros hoje e o que devemos criar.'),
    'pt-PT', jsonb_build_object('titulo', 'Novidades no BipFix',
      'mensagem', 'No Perfil, já pode indicar o horário de receção de carros e o almoço. Na nova página Melhorias, diga-nos como marcam os carros hoje e o que devemos criar.'),
    'en', jsonb_build_object('titulo', 'What''s new in BipFix',
      'mensagem', 'In your Profile you can now set car reception hours and a lunch break. On the new Improvements page, tell us how you book cars today and what we should build.'),
    'et', jsonb_build_object('titulo', 'Uut BipFixis',
      'mensagem', 'Profiilis saad nüüd märkida autode vastuvõtu aja ja lõunapausi. Uuel lehel „Ettepanekud” räägi, kuidas te praegu autosid broneerite ja mida peaksime lisama.'),
    'ru', jsonb_build_object('titulo', 'Новое в BipFix',
      'mensagem', 'В профиле теперь можно указать время приёма автомобилей и обеденный перерыв. На новой странице «Улучшения» расскажите, как вы сейчас записываете машины и что нам добавить.'),
    'it', jsonb_build_object('titulo', 'Novità su BipFix',
      'mensagem', 'Nel Profilo ora puoi indicare l''orario di accettazione auto e la pausa pranzo. Nella nuova pagina Miglioramenti raccontaci come prenotate le auto oggi e cosa dovremmo creare.')
  );
  n integer;
BEGIN
  WITH alvos AS (
    SELECT profile_id AS pid FROM oficinas WHERE profile_id IS NOT NULL
    UNION
    SELECT profile_id FROM funcionarios WHERE ativo AND cargo = 'admin' AND profile_id IS NOT NULL
  )
  INSERT INTO notificacoes (profile_id, tipo, titulo, mensagem, dados)
  SELECT a.pid, 'novidades', t.txt ->> 'titulo', t.txt ->> 'mensagem',
         jsonb_build_object('chave', 'oficina-2026-11', 'link', '/oficina/melhorias', 'textos', textos)
    FROM alvos a
    JOIN profiles p ON p.id = a.pid AND p.ativo
    CROSS JOIN LATERAL (SELECT coalesce(
      textos -> p.idioma,
      CASE WHEN p.idioma LIKE 'pt%' THEN textos -> 'pt' END,
      textos -> 'en') AS txt) t
   WHERE NOT EXISTS (SELECT 1 FROM notificacoes x
                      WHERE x.profile_id = a.pid AND x.tipo = 'novidades' AND x.dados ->> 'chave' = 'oficina-2026-11');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION avisar_novidades_oficinas_2026_11() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION avisar_novidades_oficinas_2026_11() TO service_role;

-- O aviso "Novidades" fica no sino, sem push no celular (o app e do motorista; a oficina usa o site).
-- Mesmo corpo da 066 + a linha do tipo 'novidades' (vale tambem se o site antigo ainda estiver no ar).
CREATE OR REPLACE FUNCTION avisar_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg push_config%ROWTYPE;
BEGIN
  IF NEW.tipo = 'novidades' THEN RETURN NEW; END IF;
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

SELECT avisar_novidades_oficinas_2026_11();
