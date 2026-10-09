-- Regra UNICA de "esta oficina atende este pedido" (teste do dono 09/10,
-- ponto 1): antes a lista da oficina filtrava por especialidade e raio, mas o
-- banco deixava QUALQUER oficina ativa abrir um pedido aberto pelo link
-- direto (ver carro, fotos, descricao) e ate mandar orcamento.
-- Agora ver um pedido aberto e orcar exigem: oficina ativa, especialidade
-- compativel e o pedido dentro do raio de atendimento.
-- Especialidade: oficina sem especialidade marcada atende tudo; carroceria
-- (colisao, funilaria, pintura) e um grupo - qualquer uma atende qualquer uma;
-- os demais tipos precisam bater.

CREATE OR REPLACE FUNCTION tipo_compativel(p_especialidades tipo_servico[], p_tipo tipo_servico)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_especialidades IS NULL OR cardinality(p_especialidades) = 0
      OR p_tipo = ANY (p_especialidades)
      OR (p_tipo::text IN ('colisao', 'funilaria', 'pintura')
          AND p_especialidades && ARRAY['colisao', 'funilaria', 'pintura']::tipo_servico[]);
$$;

CREATE OR REPLACE FUNCTION distancia_km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)));
$$;

-- alguma oficina ATIVA do usuario atende o pedido (tipo + raio)
CREATE OR REPLACE FUNCTION minha_oficina_atende(p_sol uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM solicitacoes s
    JOIN oficinas o ON o.id IN (SELECT minhas_oficinas()) AND o.ativa
    WHERE s.id = p_sol
      AND tipo_compativel(o.especialidades, s.tipo)
      AND s.latitude IS NOT NULL AND o.latitude IS NOT NULL
      AND distancia_km(s.latitude, s.longitude, o.latitude, o.longitude) <= COALESCE(o.raio_atendimento_km, 30)
  );
$$;

CREATE OR REPLACE FUNCTION public.pode_ver_solicitacao(p_sol uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT eh_admin() OR EXISTS (
    SELECT 1 FROM solicitacoes s
    WHERE s.id = p_sol AND (
      s.cliente_id = auth.uid()
      OR (s.status IN ('aberta', 'em_orcamento') AND minha_oficina_atende(s.id))
      OR oficina_envolvida(s.id)
    )
  );
$function$;

-- orcamento novo so para pedido que a oficina pode ver
DROP POLICY IF EXISTS orcamentos_insert ON orcamentos;
CREATE POLICY orcamentos_insert ON orcamentos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM oficinas WHERE oficinas.id = orcamentos.oficina_id AND oficinas.profile_id = auth.uid() AND oficinas.ativa)
  AND pode_ver_solicitacao(orcamentos.solicitacao_id)
);
