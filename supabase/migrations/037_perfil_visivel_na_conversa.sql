-- Oficina ve o nome (e pode avisar) quem ja conversa com ela: o cliente
-- antes do orcamento e o responsavel pelo pagamento de um acidente. Antes o
-- aviso de "nova mensagem" dessas conversas era recusado sem aparecer erro.
CREATE OR REPLACE FUNCTION public.pode_ver_perfil(p uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p = auth.uid()
      OR eh_admin()
      OR EXISTS (SELECT 1 FROM oficinas WHERE profile_id = p)
      OR EXISTS (SELECT 1 FROM lojas_pecas WHERE profile_id = p)
      OR EXISTS (SELECT 1 FROM funcionarios f WHERE f.profile_id = p AND f.oficina_id IN (SELECT minhas_oficinas()))
      OR EXISTS (SELECT 1 FROM solicitacoes s WHERE s.cliente_id = p AND oficina_envolvida(s.id))
      OR EXISTS (
        SELECT 1 FROM funcionarios f
        JOIN solicitacoes s ON s.cliente_id = auth.uid()
        WHERE f.profile_id = p AND (
          f.oficina_id IN (SELECT oficina_id FROM orcamentos WHERE solicitacao_id = s.id)
          OR f.oficina_id IN (SELECT oficina_id FROM agenda WHERE solicitacao_id = s.id)
        )
      )
      -- conversa ja aberta com a minha oficina: cliente (oficina que escreveu
      -- antes de orcar) e responsavel pelo pagamento de acidente
      OR EXISTS (SELECT 1 FROM mensagens m JOIN solicitacoes s ON s.id = m.solicitacao_id
                 WHERE s.cliente_id = p AND m.oficina_id IN (SELECT minhas_oficinas()))
      OR EXISTS (SELECT 1 FROM mensagens m WHERE m.pagador_id = p AND m.oficina_id IN (SELECT minhas_oficinas()));
$function$;
