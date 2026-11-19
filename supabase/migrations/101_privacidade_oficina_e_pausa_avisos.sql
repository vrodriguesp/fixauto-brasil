-- 101: privacidade do cliente perante a oficina + pausa dos avisos (dono 19/11).
--  1) Antes de o orcamento ser ACEITO a oficina nao ve o NOME (nem a foto) do cliente - so o codigo; e nao ve a
--     RUA do pedido - so a area (bairro/cidade). Depois do aceite tudo como hoje.
--     - solicitacoes.area: derivada do endereco por gatilho (area_do_endereco), nunca com rua/numero; e o que as
--       telas, o sino, o push e o e-mail das oficinas mostram antes do aceite.
--     - resumo_clientes(p_ids): nome/foto so para o proprio, o admin ou a oficina com orcamento aceito de um pedido
--       desse cliente (telas por cliente: avaliacoes, garantias, agenda). Codigo, idioma e tipo continuam.
--     - resumo_clientes_pedidos(p_sols): o mesmo POR PEDIDO (lista, detalhe, formulario do orcamento, conversa):
--       nome/foto so quando oficina_atende(pedido) - orcamento aceito NESTE pedido.
--     Limite conhecido: a coluna solicitacoes.endereco continua legivel pela API para a oficina que pode ver o
--     pedido (a RLS e por linha; esconder a coluna exige mover a rua para outra tabela - decisao a parte).
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

-- 2) pausa dos avisos de pedido novo
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avisos_pausados_ate timestamptz;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Rollback:
-- DROP TRIGGER IF EXISTS solicitacoes_area ON solicitacoes; DROP FUNCTION IF EXISTS solicitacoes_area_trg();
-- ALTER TABLE solicitacoes DROP COLUMN IF EXISTS area; DROP FUNCTION IF EXISTS area_do_endereco(text);
-- DROP FUNCTION IF EXISTS resumo_clientes_pedidos(uuid[]); (resumo_clientes: bloco da 074)
-- ALTER TABLE profiles DROP COLUMN IF EXISTS avisos_pausados_ate;
