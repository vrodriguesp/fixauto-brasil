-- 074: contato do cliente (telefone, e-mail) so para a oficina ESCOLHIDA (dono 07/11).
-- Antes, a regra do perfil (pode_ver_perfil) liberava a linha inteira do cliente
-- (nome, e-mail, telefone) para qualquer oficina "envolvida": quem mandou orcamento
-- (inclusive a que perdeu), quem conversou no chat e todas as oficinas avisadas de
-- um acidente. O painel nao mostrava, mas com o proprio login a oficina lia pela API.
-- Agora:
--   - perfil completo: oficina com agenda ou orcamento aceito no pedido; no acidente,
--     tambem as oficinas avisadas SE o cliente marcou "as oficinas podem me ligar"
--     (emergencias.oficinas_podem_ligar, desmarcado por padrao);
--   - quem so orcou/conversou ve nome, codigo, foto e idioma por resumo_clientes();
--   - os dados do acidente (emergencias: nome/e-mail/telefone; outro motorista)
--     seguem a mesma regra para as oficinas.

ALTER TABLE emergencias ADD COLUMN IF NOT EXISTS oficinas_podem_ligar boolean NOT NULL DEFAULT false;

-- a oficina (dono ou equipe) atende o pedido: agenda ou orcamento aceito dela
CREATE OR REPLACE FUNCTION public.oficina_atende(p_sol uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM agenda WHERE solicitacao_id = p_sol AND oficina_id IN (SELECT minhas_oficinas()))
      OR EXISTS (SELECT 1 FROM orcamentos WHERE solicitacao_id = p_sol AND status = 'aceito' AND oficina_id IN (SELECT minhas_oficinas()));
$$;

-- acidente: oficina avisada e o cliente deixou as oficinas ligarem
CREATE OR REPLACE FUNCTION public.oficina_pode_ligar_acidente(p_em uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM emergencias e
    JOIN emergencia_oficinas_notificadas n ON n.emergencia_id = e.id
    WHERE e.id = p_em AND e.oficinas_podem_ligar AND n.oficina_id IN (SELECT minhas_oficinas())
  );
$$;

-- contato do cliente liberado para a oficina neste pedido
CREATE OR REPLACE FUNCTION public.oficina_ve_contato(p_sol uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT oficina_atende(p_sol) OR EXISTS (
    SELECT 1 FROM solicitacoes s WHERE s.id = p_sol AND s.emergencia_id IS NOT NULL AND oficina_pode_ligar_acidente(s.emergencia_id)
  );
$$;

-- mesma funcao da 047, trocando so as tres regras do lado da oficina
-- (orcamento/chat/acidente) por oficina_ve_contato
CREATE OR REPLACE FUNCTION pode_ver_perfil(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p = auth.uid()
      OR eh_admin()
      -- dono de oficina: so para quem tem relacao com ela (cliente com orcamento,
      -- agenda ou conversa; a propria equipe; lojas de pecas que atendem oficinas)
      OR EXISTS (
        SELECT 1 FROM oficinas o WHERE o.profile_id = p AND (
          o.id IN (SELECT minhas_oficinas())
          OR EXISTS (SELECT 1 FROM solicitacoes s WHERE s.cliente_id = auth.uid() AND (
               EXISTS (SELECT 1 FROM orcamentos x WHERE x.solicitacao_id = s.id AND x.oficina_id = o.id)
            OR EXISTS (SELECT 1 FROM agenda x WHERE x.solicitacao_id = s.id AND x.oficina_id = o.id)
            OR EXISTS (SELECT 1 FROM mensagens x WHERE x.solicitacao_id = s.id AND x.oficina_id = o.id)))
          OR EXISTS (SELECT 1 FROM mensagens x WHERE x.pagador_id = auth.uid() AND x.oficina_id = o.id)
          OR EXISTS (SELECT 1 FROM lojas_pecas l WHERE l.profile_id = auth.uid())
        ))
      -- dono de loja de pecas: so para oficinas (clientes das lojas)
      OR (EXISTS (SELECT 1 FROM lojas_pecas WHERE profile_id = p) AND EXISTS (SELECT 1 FROM minhas_oficinas()))
      OR EXISTS (SELECT 1 FROM funcionarios f WHERE f.profile_id = p AND f.oficina_id IN (SELECT minhas_oficinas()))
      -- cliente: so a oficina escolhida (ou, no acidente, avisada com permissao para ligar)
      OR EXISTS (SELECT 1 FROM solicitacoes s WHERE s.cliente_id = p AND oficina_ve_contato(s.id))
      OR EXISTS (
        SELECT 1 FROM funcionarios f
        JOIN solicitacoes s ON s.cliente_id = auth.uid()
        WHERE f.profile_id = p AND (
          f.oficina_id IN (SELECT oficina_id FROM orcamentos WHERE solicitacao_id = s.id)
          OR f.oficina_id IN (SELECT oficina_id FROM agenda WHERE solicitacao_id = s.id)
        )
      )
      -- responsavel pelo pagamento que conversa com a oficina
      OR EXISTS (SELECT 1 FROM mensagens m WHERE m.pagador_id = p AND m.oficina_id IN (SELECT minhas_oficinas()));
$$;

-- acidente: o dono, o outro motorista, o admin; oficina so se escolhida ou com
-- permissao para ligar (antes: toda oficina avisada e toda oficina que orcou)
CREATE OR REPLACE FUNCTION public.pode_ver_emergencia(p_em uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT eh_admin() OR EXISTS (
    SELECT 1 FROM emergencias e
    WHERE e.id = p_em AND (
      e.profile_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM emergencia_outro_veiculo o
        WHERE o.emergencia_id = e.id AND (
          o.profile_id = auth.uid()
          OR (o.email IS NOT NULL AND lower(o.email) = (SELECT lower(email) FROM profiles WHERE id = auth.uid()))
        )
      )
      OR oficina_pode_ligar_acidente(e.id)
      OR (e.solicitacao_id IS NOT NULL AND oficina_atende(e.solicitacao_id))
    )
  );
$function$;

-- Resumo do cliente para a oficina que ve o pedido (nome, codigo, foto, idioma):
-- sem e-mail nem telefone. Vale para pedido aberto que ela pode orcar e para
-- pedido em que ela esta envolvida (orcou, conversou, foi avisada).
CREATE OR REPLACE FUNCTION public.resumo_clientes(p_ids uuid[])
RETURNS TABLE (id uuid, nome text, codigo bigint, avatar_url text, idioma text, tipo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nome, p.codigo, p.avatar_url, p.idioma, p.tipo::text
  FROM profiles p
  WHERE p.id = ANY (p_ids) AND (
    p.id = auth.uid() OR eh_admin()
    OR EXISTS (SELECT 1 FROM solicitacoes s WHERE s.cliente_id = p.id AND pode_ver_solicitacao(s.id) AND EXISTS (SELECT 1 FROM minhas_oficinas()))
  );
$$;

REVOKE ALL ON FUNCTION public.oficina_atende(uuid), public.oficina_pode_ligar_acidente(uuid), public.oficina_ve_contato(uuid), public.resumo_clientes(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.oficina_atende(uuid), public.oficina_pode_ligar_acidente(uuid), public.oficina_ve_contato(uuid), public.resumo_clientes(uuid[]) TO authenticated;
