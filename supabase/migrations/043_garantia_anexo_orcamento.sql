-- 1) Garantia do servico (dias), informada pela oficina no orcamento. Conta a
--    partir da entrega do carro. A conversa com a oficina escolhida fica aberta
--    ate a garantia acabar (no minimo 7 dias apos a entrega); com as outras
--    oficinas, a conversa fecha quando o servico termina.
-- 2) Orcamento feito em outro sistema: documento (foto/PDF) anexado.

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS garantia_dias INTEGER CHECK (garantia_dias IS NULL OR garantia_dias BETWEEN 0 AND 3650);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS anexo_url TEXT CHECK (anexo_url IS NULL OR char_length(anexo_url) <= 500);

-- conversa ainda aberta para escrever?
CREATE OR REPLACE FUNCTION conversa_aberta(p_sol UUID, p_of UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN s.status NOT IN ('concluida', 'cancelada') THEN true
    ELSE EXISTS (
      SELECT 1 FROM orcamentos o
      JOIN agenda a ON a.solicitacao_id = o.solicitacao_id AND a.oficina_id = o.oficina_id AND a.status = 'concluido'
      WHERE o.solicitacao_id = p_sol AND o.oficina_id = p_of AND o.status = 'aceito'
        AND now() <= COALESCE(a.data_fim, a.data_inicio) + make_interval(days => GREATEST(COALESCE(o.garantia_dias, 0), 7))
    )
  END
  FROM solicitacoes s WHERE s.id = p_sol;
$$;
GRANT EXECUTE ON FUNCTION conversa_aberta(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION pode_escrever_conversa_v2(p_sol UUID, p_of UUID, p_pag UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(conversa_aberta(p_sol, p_of), false) AND CASE WHEN p_pag IS NULL THEN pode_escrever_conversa(p_sol, p_of)
    ELSE eh_pagador_do_reparo(p_sol, p_pag)
      AND EXISTS (SELECT 1 FROM orcamentos WHERE solicitacao_id = p_sol AND oficina_id = p_of AND status = 'aceito')
      AND (p_pag = auth.uid() OR p_of IN (SELECT minhas_oficinas()))
  END;
$$;

-- documento do orcamento: orcamentos/<pedido>/<oficina>/<arquivo>
CREATE OR REPLACE FUNCTION pode_ver_anexo_orcamento(p_sol UUID, p_of UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT eh_admin()
      OR p_of IN (SELECT minhas_oficinas())
      OR EXISTS (SELECT 1 FROM solicitacoes WHERE id = p_sol AND cliente_id = auth.uid());
$$;

DROP POLICY IF EXISTS privado_select ON storage.objects;
DROP POLICY IF EXISTS privado_insert ON storage.objects;
CREATE POLICY privado_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'damage-photos' AND (
    eh_admin()
    OR ((storage.foldername(name))[1] = 'solicitacoes' AND pode_ver_solicitacao(uuid_ou_nulo((storage.foldername(name))[2])))
    OR ((storage.foldername(name))[1] = 'audio'
        AND participa_conversa_v2(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3]), uuid_ou_nulo((storage.foldername(name))[4])))
    OR ((storage.foldername(name))[1] = 'emergencia' AND pode_ver_foto_emergencia(uuid_ou_nulo((storage.foldername(name))[2])))
    OR ((storage.foldername(name))[1] = 'orcamentos'
        AND pode_ver_anexo_orcamento(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3])))
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
    OR ((storage.foldername(name))[1] = 'orcamentos'
        AND uuid_ou_nulo((storage.foldername(name))[3]) IN (SELECT minhas_oficinas())
        AND pode_ver_solicitacao(uuid_ou_nulo((storage.foldername(name))[2])))
    OR ((storage.foldername(name))[1] = 'pecas-mensagens'
        AND participa_cotacao_peca(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3])))
  )
);
