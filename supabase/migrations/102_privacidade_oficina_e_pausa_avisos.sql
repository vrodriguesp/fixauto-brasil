-- 102: privacidade do cliente perante a oficina + pausa dos avisos (dono 19/11).
--  1) Antes de o orcamento ser ACEITO a oficina nao ve o NOME (nem a foto) do cliente - so o codigo; e nao ve a
--     RUA do pedido - so a area (bairro/cidade). Depois do aceite tudo como hoje.
--     - solicitacoes.area: derivada do endereco por gatilho (area_do_endereco), nunca com rua/numero; e o que as
--       telas, o sino, o push e o e-mail das oficinas mostram antes do aceite.
--     - resumo_clientes(p_ids): nome/foto so para o proprio, o admin ou a oficina com orcamento aceito de um pedido
--       desse cliente (telas por cliente: avaliacoes, garantias, agenda). Codigo, idioma e tipo continuam.
--     - resumo_clientes_pedidos(p_sols): o mesmo POR PEDIDO (lista, detalhe, formulario do orcamento, conversa):
--       nome/foto so quando oficina_atende(pedido) - orcamento aceito NESTE pedido.
--     - A RUA e as coordenadas exatas saem da linha de solicitacoes (que qualquer oficina do raio le pela API) para
--       solicitacoes_privado (RLS: so o motorista do pedido, o admin e a oficina com orcamento ACEITO). Um gatilho
--       BEFORE INSERT/UPDATE faz isso sozinho: o codigo que cria o pedido (site, app, pedido sem conta) continua a
--       gravar endereco/latitude/longitude em solicitacoes como sempre; na linha ficam so a area e as coordenadas
--       arredondadas a 0,01 grau (~1 km). Quem precisa do endereco completo embute privado:solicitacoes_privado(...)
--       (a RLS devolve null a quem nao pode). minha_oficina_atende usa as coordenadas exatas da tabela privada.
--     - Avisos antigos (notificacoes.mensagem / dados.textos) das oficinas: a rua e trocada pela area.
--  2) profiles.avisos_pausados_ate: a oficina pausa os avisos de pedido novo (sino/e-mail/push) por 7 ou 30 dias
--     em vez de apagar a conta (pagina /excluir-conta e cartao "Conta" do perfil). So a propria linha (RLS 001).
-- Idempotente. Rollback no fim.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1a) area do endereco: fora a parte com numero (rua), codigos postais e coordenadas; fica bairro/cidade/pais
CREATE OR REPLACE FUNCTION public.area_do_endereco(p text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE partes text[]; r text[] := '{}'; p2 text; i int; n int;
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  partes := regexp_split_to_array(p, '\s*,\s*');
  n := array_length(partes, 1);
  -- uma parte so e com numero ("Tartu mnt 50"): nao da para separar a rua - sem area
  IF n = 1 AND partes[1] ~ '\d' THEN RETURN NULL; END IF;
  FOR i IN 1..n LOOP
    p2 := btrim(partes[i]);
    IF p2 = '' THEN CONTINUE; END IF;
    IF i = 1 AND p2 ~ '\d' THEN CONTINUE; END IF;              -- rua + numero
    IF p2 ~ '^-?\d+([.,]\d+)?$' THEN CONTINUE; END IF;          -- coordenada ou codigo postal solto
    p2 := btrim(regexp_replace(p2, '^\d{4,6}\s+', ''));         -- "10115 Tallinn" -> "Tallinn"
    p2 := btrim(regexp_replace(p2, '\s+\d{4,6}$', ''));         -- "Tallinn 10115" -> "Tallinn"
    IF p2 = '' OR p2 ~ '\d' THEN CONTINUE; END IF;              -- sobrou numero: nao e area
    IF NOT (p2 = ANY (r)) THEN r := r || p2; END IF;
  END LOOP;
  RETURN nullif(array_to_string(r, ', '), '');
END $$;

ALTER TABLE public.solicitacoes ADD COLUMN IF NOT EXISTS area text;

CREATE OR REPLACE FUNCTION public.solicitacoes_area_trg() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.area := public.area_do_endereco(NEW.endereco);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS solicitacoes_area ON public.solicitacoes;
CREATE TRIGGER solicitacoes_area BEFORE INSERT OR UPDATE OF endereco ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.solicitacoes_area_trg();

UPDATE public.solicitacoes SET area = public.area_do_endereco(endereco) WHERE area IS DISTINCT FROM public.area_do_endereco(endereco);

-- 1b) nome/foto do cliente so depois do aceite
CREATE OR REPLACE FUNCTION public.resumo_clientes(p_ids uuid[])
RETURNS TABLE (id uuid, nome text, codigo bigint, avatar_url text, idioma text, tipo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
         CASE WHEN v.ve_nome THEN p.nome END,
         p.codigo,
         CASE WHEN v.ve_nome THEN p.avatar_url END,
         p.idioma, p.tipo::text
  FROM profiles p
  CROSS JOIN LATERAL (
    SELECT p.id = auth.uid() OR eh_admin()
        OR EXISTS (SELECT 1 FROM solicitacoes s WHERE s.cliente_id = p.id AND oficina_atende(s.id)) AS ve_nome
  ) v
  WHERE p.id = ANY (p_ids) AND (
    p.id = auth.uid() OR eh_admin()
    OR EXISTS (SELECT 1 FROM solicitacoes s WHERE s.cliente_id = p.id AND pode_ver_solicitacao(s.id) AND EXISTS (SELECT 1 FROM minhas_oficinas()))
  );
$$;

CREATE OR REPLACE FUNCTION public.resumo_clientes_pedidos(p_sols uuid[])
RETURNS TABLE (solicitacao_id uuid, id uuid, nome text, codigo bigint, avatar_url text, idioma text, tipo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, p.id,
         CASE WHEN p.id = auth.uid() OR eh_admin() OR oficina_atende(s.id) THEN p.nome END,
         p.codigo,
         CASE WHEN p.id = auth.uid() OR eh_admin() OR oficina_atende(s.id) THEN p.avatar_url END,
         p.idioma, p.tipo::text
  FROM solicitacoes s JOIN profiles p ON p.id = s.cliente_id
  WHERE s.id = ANY (p_sols) AND (p.id = auth.uid() OR eh_admin() OR (pode_ver_solicitacao(s.id) AND EXISTS (SELECT 1 FROM minhas_oficinas())));
$$;
REVOKE ALL ON FUNCTION public.resumo_clientes(uuid[]), public.resumo_clientes_pedidos(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.resumo_clientes(uuid[]), public.resumo_clientes_pedidos(uuid[]) TO authenticated;

-- 1c) rua e coordenadas exatas fora da linha publica
CREATE TABLE IF NOT EXISTS public.solicitacoes_privado (
  -- FK adiada ate o commit: o gatilho BEFORE INSERT grava aqui ANTES de a linha do pedido existir
  solicitacao_id uuid PRIMARY KEY REFERENCES public.solicitacoes(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  endereco text NOT NULL,
  latitude double precision,
  longitude double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.solicitacoes_privado DROP CONSTRAINT IF EXISTS solicitacoes_privado_solicitacao_id_fkey;
ALTER TABLE public.solicitacoes_privado ADD CONSTRAINT solicitacoes_privado_solicitacao_id_fkey FOREIGN KEY (solicitacao_id) REFERENCES public.solicitacoes(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.solicitacoes_privado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.solicitacoes_privado FROM anon, public;
GRANT SELECT ON public.solicitacoes_privado TO authenticated;
DROP POLICY IF EXISTS solicitacoes_privado_select ON public.solicitacoes_privado;
CREATE POLICY solicitacoes_privado_select ON public.solicitacoes_privado FOR SELECT TO authenticated USING (
  eh_admin()
  OR EXISTS (SELECT 1 FROM solicitacoes s WHERE s.id = solicitacao_id AND s.cliente_id = auth.uid())
  OR oficina_atende(solicitacao_id)
);
-- escrita so pelo gatilho (SECURITY DEFINER) e pela service role: nenhuma politica de INSERT/UPDATE/DELETE

-- gatilho: guarda o endereco completo e as coordenadas exatas em privado; na linha fica a area e ~1 km.
-- Substitui o gatilho da area (mesmo momento). Corre para qualquer papel (service role incluida).
DROP TRIGGER IF EXISTS solicitacoes_area ON public.solicitacoes;
CREATE OR REPLACE FUNCTION public.solicitacoes_privacidade_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_area text; v_cheio boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.endereco IS NOT DISTINCT FROM OLD.endereco AND NEW.latitude IS NOT DISTINCT FROM OLD.latitude AND NEW.longitude IS NOT DISTINCT FROM OLD.longitude THEN
    RETURN NEW;
  END IF;
  v_area := public.area_do_endereco(NEW.endereco);
  -- chegou um endereco "cheio" (mais do que a area) ou coordenadas exatas: vai para a tabela privada
  v_cheio := (NEW.endereco IS DISTINCT FROM v_area)
    OR (NEW.latitude IS NOT NULL AND NEW.latitude <> round(NEW.latitude::numeric, 2)::double precision)
    OR (NEW.longitude IS NOT NULL AND NEW.longitude <> round(NEW.longitude::numeric, 2)::double precision);
  IF v_cheio THEN
    INSERT INTO public.solicitacoes_privado (solicitacao_id, endereco, latitude, longitude, updated_at)
    VALUES (NEW.id, coalesce(NEW.endereco, ''), NEW.latitude, NEW.longitude, now())
    ON CONFLICT (solicitacao_id) DO UPDATE SET endereco = EXCLUDED.endereco, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, updated_at = now();
  END IF;
  NEW.area := v_area;
  NEW.endereco := coalesce(v_area, nullif(NEW.pais, ''), '');
  IF NEW.latitude IS NOT NULL THEN NEW.latitude := round(NEW.latitude::numeric, 2)::double precision; END IF;
  IF NEW.longitude IS NOT NULL THEN NEW.longitude := round(NEW.longitude::numeric, 2)::double precision; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS solicitacoes_privacidade ON public.solicitacoes;
CREATE TRIGGER solicitacoes_privacidade BEFORE INSERT OR UPDATE ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.solicitacoes_privacidade_trg();

-- pedidos existentes: a rua e as coordenadas exatas vao para a tabela privada; a linha fica com area + ~1 km
INSERT INTO public.solicitacoes_privado (solicitacao_id, endereco, latitude, longitude)
SELECT id, endereco, latitude, longitude FROM public.solicitacoes
WHERE endereco IS DISTINCT FROM public.area_do_endereco(endereco)
   OR (latitude IS NOT NULL AND latitude <> round(latitude::numeric, 2)::double precision)
   OR (longitude IS NOT NULL AND longitude <> round(longitude::numeric, 2)::double precision)
ON CONFLICT (solicitacao_id) DO NOTHING;
UPDATE public.solicitacoes SET endereco = coalesce(public.area_do_endereco(endereco), nullif(pais, ''), ''),
  latitude = round(latitude::numeric, 2)::double precision, longitude = round(longitude::numeric, 2)::double precision
WHERE endereco IS DISTINCT FROM coalesce(public.area_do_endereco(endereco), nullif(pais, ''), '')
   OR (latitude IS NOT NULL AND latitude <> round(latitude::numeric, 2)::double precision)
   OR (longitude IS NOT NULL AND longitude <> round(longitude::numeric, 2)::double precision);

-- quem atende o pedido: distancia pelas coordenadas EXATAS (privado), nao pelas arredondadas (085, 064)
CREATE OR REPLACE FUNCTION minha_oficina_atende(p_sol uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM solicitacoes s
    LEFT JOIN solicitacoes_privado sp ON sp.solicitacao_id = s.id
    JOIN oficinas o ON o.id IN (SELECT minhas_oficinas()) AND o.ativa
    JOIN profiles po ON po.id = o.profile_id
    LEFT JOIN profiles pc ON pc.id = s.cliente_id
    WHERE s.id = p_sol
      AND tipo_compativel(o.especialidades, s.tipo)
      AND coalesce(sp.latitude, s.latitude) IS NOT NULL AND o.latitude IS NOT NULL
      AND distancia_km(coalesce(sp.latitude, s.latitude), coalesce(sp.longitude, s.longitude), o.latitude, o.longitude) <= COALESCE(o.raio_atendimento_km, 30)
      -- conta de teste (revisor das lojas) so com oficina de teste, e vice-versa
      AND po.conta_teste = COALESCE(pc.conta_teste, false)
  ) OR oficina_convidada(p_sol);
$$;

-- avisos antigos das oficinas (sino/push/e-mail de pedido novo e convite): a rua vira a area
UPDATE public.notificacoes n
SET mensagem = replace(n.mensagem, sp.endereco, coalesce(s.area, '')),
    dados = replace(n.dados::text, sp.endereco, coalesce(s.area, ''))::jsonb
FROM public.solicitacoes s JOIN public.solicitacoes_privado sp ON sp.solicitacao_id = s.id
WHERE n.tipo IN ('nova_solicitacao', 'pedido_convite', 'cobranca_admin_solicitacao', 'lembrete_pedido')
  AND n.dados->>'solicitacao_id' = s.id::text
  AND length(sp.endereco) > 3
  AND (position(sp.endereco IN n.mensagem) > 0 OR position(sp.endereco IN n.dados::text) > 0);

-- 2) pausa dos avisos de pedido novo
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avisos_pausados_ate timestamptz;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Rollback:
-- DROP TRIGGER IF EXISTS solicitacoes_privacidade ON solicitacoes; DROP FUNCTION IF EXISTS solicitacoes_privacidade_trg();
-- UPDATE solicitacoes s SET endereco = sp.endereco, latitude = sp.latitude, longitude = sp.longitude FROM solicitacoes_privado sp WHERE sp.solicitacao_id = s.id;
-- DROP TABLE IF EXISTS solicitacoes_privado; (minha_oficina_atende: bloco da 085)
-- DROP FUNCTION IF EXISTS solicitacoes_area_trg();
-- ALTER TABLE solicitacoes DROP COLUMN IF EXISTS area; DROP FUNCTION IF EXISTS area_do_endereco(text);
-- DROP FUNCTION IF EXISTS resumo_clientes_pedidos(uuid[]); (resumo_clientes: bloco da 074)
-- ALTER TABLE profiles DROP COLUMN IF EXISTS avisos_pausados_ate;
