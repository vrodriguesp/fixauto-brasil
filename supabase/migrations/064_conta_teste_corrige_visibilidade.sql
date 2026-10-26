-- 064: CORRIGE a 063 (26/10). A 063 redefiniu pode_ver_solicitacao a partir da
-- versao da 047 e apagou a regra da 056 (oficina so ve pedido aberto que ela
-- atende: especialidade compativel + dentro do raio). Achado no teste local
-- (site-atendimento: oficina de mecanica e de Milao liam um acidente de Tallinn).
-- Em producao nao houve exposicao: 0 oficinas cadastradas entre 063 e 064.
-- Aqui: a regra da 056 volta e a separacao teste x real (063) entra em
-- minha_oficina_atende, que tambem decide quem pode mandar orcamento.

CREATE OR REPLACE FUNCTION minha_oficina_atende(p_sol uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM solicitacoes s
    JOIN oficinas o ON o.id IN (SELECT minhas_oficinas()) AND o.ativa
    JOIN profiles po ON po.id = o.profile_id
    LEFT JOIN profiles pc ON pc.id = s.cliente_id
    WHERE s.id = p_sol
      AND tipo_compativel(o.especialidades, s.tipo)
      AND s.latitude IS NOT NULL AND o.latitude IS NOT NULL
      AND distancia_km(s.latitude, s.longitude, o.latitude, o.longitude) <= COALESCE(o.raio_atendimento_km, 30)
      -- conta de teste (revisor das lojas) so com oficina de teste, e vice-versa
      AND po.conta_teste = COALESCE(pc.conta_teste, false)
  );
$$;

CREATE OR REPLACE FUNCTION pode_ver_solicitacao(p_sol uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT eh_admin() OR EXISTS (
    SELECT 1 FROM solicitacoes s
    WHERE s.id = p_sol AND (
      s.cliente_id = auth.uid()
      OR (s.status IN ('aberta', 'em_orcamento') AND minha_oficina_atende(s.id))
      OR oficina_envolvida(s.id)
    )
  );
$$;
