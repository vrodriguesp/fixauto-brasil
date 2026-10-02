-- O outro motorista do acidente e cadastrado pelo e-mail que o cliente
-- informou (profile_id fica vazio ate ele ter conta). O aceite ja o acha pelo
-- e-mail para avisar e abrir a conversa de pagamento, mas a regra de leitura
-- so olhava profile_id - entao a lista de mensagens dele vinha vazia. Agora a
-- conta com esse e-mail tambem ve o acidente.
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
      OR EXISTS (SELECT 1 FROM emergencia_oficinas_notificadas n WHERE n.emergencia_id = e.id AND n.oficina_id IN (SELECT minhas_oficinas()))
      OR (e.solicitacao_id IS NOT NULL AND oficina_envolvida(e.solicitacao_id))
    )
  );
$function$;
