-- Acidente em que o OUTRO motorista causou: ele paga o reparo e precisa
-- combinar o pagamento com a oficina. Antes a mensagem automatica caia na
-- conversa do cliente, que ele nao podia ler. Agora ele tem uma conversa
-- particular com a oficina do orcamento aceito (pagador_id = ele); o cliente
-- nao ve essa, e ele nao ve a do cliente.

ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS pagador_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_mensagens_pagador ON mensagens (solicitacao_id, oficina_id, pagador_id) WHERE pagador_id IS NOT NULL;

-- Responsavel pelo pagamento deste pedido: o "outro veiculo" de um acidente
-- marcado como outro_causou (pela conta ligada ou pelo e-mail informado).
CREATE OR REPLACE FUNCTION eh_pagador_do_reparo(p_sol UUID, p_profile UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_profile IS NOT NULL AND EXISTS (
    SELECT 1 FROM emergencias e
    JOIN emergencia_outro_veiculo o ON o.emergencia_id = e.id
    WHERE e.solicitacao_id = p_sol
      AND strpos(e.descricao, '[TIPO:outro_causou]') > 0
      AND (o.profile_id = p_profile
           OR (o.email IS NOT NULL AND lower(o.email) = (SELECT lower(email) FROM profiles WHERE id = p_profile)))
  );
$$;

CREATE OR REPLACE FUNCTION participa_conversa_v2(p_sol UUID, p_of UUID, p_pag UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_pag IS NULL THEN participa_conversa_oficina(p_sol, p_of)
    ELSE eh_admin()
      OR p_of IN (SELECT minhas_oficinas())
      OR (p_pag = auth.uid() AND eh_pagador_do_reparo(p_sol, p_pag))
  END;
$$;

CREATE OR REPLACE FUNCTION pode_escrever_conversa_v2(p_sol UUID, p_of UUID, p_pag UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_pag IS NULL THEN pode_escrever_conversa(p_sol, p_of)
    ELSE eh_pagador_do_reparo(p_sol, p_pag)
      AND EXISTS (SELECT 1 FROM orcamentos WHERE solicitacao_id = p_sol AND oficina_id = p_of AND status = 'aceito')
      AND (p_pag = auth.uid() OR p_of IN (SELECT minhas_oficinas()))
  END;
$$;

DROP POLICY IF EXISTS mensagens_select ON mensagens;
DROP POLICY IF EXISTS mensagens_insert ON mensagens;
DROP POLICY IF EXISTS mensagens_update ON mensagens;
CREATE POLICY mensagens_select ON mensagens FOR SELECT TO authenticated
  USING (participa_conversa_v2(solicitacao_id, oficina_id, pagador_id));
CREATE POLICY mensagens_insert ON mensagens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = remetente_id AND pode_escrever_conversa_v2(solicitacao_id, oficina_id, pagador_id));
CREATE POLICY mensagens_update ON mensagens FOR UPDATE TO authenticated
  USING (participa_conversa_v2(solicitacao_id, oficina_id, pagador_id))
  WITH CHECK (participa_conversa_v2(solicitacao_id, oficina_id, pagador_id));

-- Audio: audio/<pedido>/<oficina>/<arquivo>, ou na conversa do pagador
-- audio/<pedido>/<oficina>/<pagador>/<arquivo>
DROP POLICY IF EXISTS privado_select ON storage.objects;
DROP POLICY IF EXISTS privado_insert ON storage.objects;
CREATE POLICY privado_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'damage-photos' AND (
    eh_admin()
    OR ((storage.foldername(name))[1] = 'solicitacoes' AND pode_ver_solicitacao(uuid_ou_nulo((storage.foldername(name))[2])))
    OR ((storage.foldername(name))[1] = 'audio'
        AND participa_conversa_v2(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3]), uuid_ou_nulo((storage.foldername(name))[4])))
    OR ((storage.foldername(name))[1] = 'emergencia' AND pode_ver_emergencia(uuid_ou_nulo((storage.foldername(name))[2])))
    OR ((storage.foldername(name))[1] = 'pecas-mensagens'
        AND participa_cotacao_peca(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3])))
  )
);
CREATE POLICY privado_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'damage-photos' AND (
    ((storage.foldername(name))[1] = 'solicitacoes' AND EXISTS (
      SELECT 1 FROM solicitacoes s WHERE s.id = uuid_ou_nulo((storage.foldername(name))[2]) AND s.cliente_id = auth.uid()
    ))
    OR ((storage.foldername(name))[1] = 'audio'
        AND pode_escrever_conversa_v2(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3]), uuid_ou_nulo((storage.foldername(name))[4])))
    OR ((storage.foldername(name))[1] = 'pecas-mensagens'
        AND participa_cotacao_peca(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3])))
  )
);
