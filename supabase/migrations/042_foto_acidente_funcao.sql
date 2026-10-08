-- A regra da 041 consultava "emergencias" com a permissao da oficina, que nao
-- enxerga o acidente antes de ser avisada - e a foto continuava bloqueada.
-- A conferencia roda numa funcao com permissao do sistema (como as demais).
CREATE OR REPLACE FUNCTION pode_ver_foto_emergencia(p_em UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pode_ver_emergencia(p_em) OR EXISTS (
    SELECT 1 FROM emergencias e WHERE e.id = p_em AND e.solicitacao_id IS NOT NULL AND pode_ver_solicitacao(e.solicitacao_id)
  );
$$;

DROP POLICY IF EXISTS privado_select ON storage.objects;
CREATE POLICY privado_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'damage-photos' AND (
    eh_admin()
    OR ((storage.foldername(name))[1] = 'solicitacoes' AND pode_ver_solicitacao(uuid_ou_nulo((storage.foldername(name))[2])))
    OR ((storage.foldername(name))[1] = 'audio'
        AND participa_conversa_v2(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3]), uuid_ou_nulo((storage.foldername(name))[4])))
    OR ((storage.foldername(name))[1] = 'emergencia' AND pode_ver_foto_emergencia(uuid_ou_nulo((storage.foldername(name))[2])))
    OR ((storage.foldername(name))[1] = 'pecas-mensagens'
        AND participa_cotacao_peca(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3])))
  )
);
