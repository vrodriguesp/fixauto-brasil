-- 029: regras de acesso (RLS) por relacao, no lugar das politicas
-- `USING (true)` que deixavam qualquer um - inclusive sem login, com a chave
-- publica do site - ler perfis (nome, e-mail, telefone), pedidos,
-- orcamentos, mensagens e acidentes, e ate alterar mensagens.
-- Auditoria de 30/09/2026, itens 2.1 e 2.4. Docs do Supabase: "Row Level
-- Security" e "Storage access control".
--
-- Regra geral: cada pessoa ve o que e dela e o de quem tem relacao de
-- servico com ela (cliente <-> oficina que orcou/agendou/foi avisada; dono
-- da oficina <-> funcionarios; quem registrou o acidente <-> outro
-- motorista). Dados publicos de verdade (oficinas, lojas, catalogo,
-- avaliacoes, fotos da oficina) continuam publicos.
-- As rotas do servidor usam a service role e nao sao afetadas.

-- ---------- Funcoes auxiliares (SECURITY DEFINER: consultam sem cair nas
-- proprias regras e evitam recursao; search_path fixo) ----------

CREATE OR REPLACE FUNCTION public.uuid_ou_nulo(t text) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN t::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.eh_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tipo = 'admin' AND ativo);
$$;

-- Oficinas de que a pessoa e dona ou funcionaria ativa
CREATE OR REPLACE FUNCTION public.minhas_oficinas() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM oficinas WHERE profile_id = auth.uid()
  UNION
  SELECT oficina_id FROM funcionarios WHERE profile_id = auth.uid() AND ativo;
$$;

CREATE OR REPLACE FUNCTION public.minhas_lojas() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM lojas_pecas WHERE profile_id = auth.uid();
$$;

-- A oficina da pessoa ja se envolveu com a solicitacao (orcou, agendou ou
-- foi avisada do acidente ligado a ela)
CREATE OR REPLACE FUNCTION public.oficina_envolvida(p_sol uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM orcamentos WHERE solicitacao_id = p_sol AND oficina_id IN (SELECT minhas_oficinas()))
      OR EXISTS (SELECT 1 FROM agenda WHERE solicitacao_id = p_sol AND oficina_id IN (SELECT minhas_oficinas()))
      OR EXISTS (
        SELECT 1 FROM solicitacoes s
        JOIN emergencia_oficinas_notificadas n ON n.emergencia_id = s.emergencia_id
        WHERE s.id = p_sol AND n.oficina_id IN (SELECT minhas_oficinas())
      );
$$;

-- Solicitacao: o cliente; qualquer oficina enquanto esta aberta a
-- orcamentos (e o marketplace); a oficina envolvida depois; o admin.
CREATE OR REPLACE FUNCTION public.pode_ver_solicitacao(p_sol uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT eh_admin() OR EXISTS (
    SELECT 1 FROM solicitacoes s
    WHERE s.id = p_sol AND (
      s.cliente_id = auth.uid()
      OR (s.status IN ('aberta', 'em_orcamento') AND EXISTS (SELECT 1 FROM minhas_oficinas()))
      OR oficina_envolvida(s.id)
    )
  );
$$;

-- Conversa de uma solicitacao: so o cliente e a oficina envolvida (nao
-- qualquer oficina que ve o pedido aberto)
CREATE OR REPLACE FUNCTION public.participa_conversa(p_sol uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT eh_admin()
      OR EXISTS (SELECT 1 FROM solicitacoes WHERE id = p_sol AND cliente_id = auth.uid())
      OR oficina_envolvida(p_sol);
$$;

CREATE OR REPLACE FUNCTION public.pode_ver_orcamento(p_orc uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT eh_admin() OR EXISTS (
    SELECT 1 FROM orcamentos o
    JOIN solicitacoes s ON s.id = o.solicitacao_id
    WHERE o.id = p_orc AND (o.oficina_id IN (SELECT minhas_oficinas()) OR s.cliente_id = auth.uid())
  );
$$;

-- Acidente: quem registrou (logado), o outro motorista, oficinas avisadas
-- ou envolvidas e o admin. (Quem registrou sem login acessa pelas rotas do
-- servidor com o codigo secreto.) O e-mail NAO conta: com a confirmacao de
-- e-mail desligada, qualquer um criaria conta com o e-mail de outra pessoa.
CREATE OR REPLACE FUNCTION public.pode_ver_emergencia(p_em uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT eh_admin() OR EXISTS (
    SELECT 1 FROM emergencias e
    WHERE e.id = p_em AND (
      e.profile_id = auth.uid()
      OR EXISTS (SELECT 1 FROM emergencia_outro_veiculo o WHERE o.emergencia_id = e.id AND o.profile_id = auth.uid())
      OR EXISTS (SELECT 1 FROM emergencia_oficinas_notificadas n WHERE n.emergencia_id = e.id AND n.oficina_id IN (SELECT minhas_oficinas()))
      OR (e.solicitacao_id IS NOT NULL AND oficina_envolvida(e.solicitacao_id))
    )
  );
$$;

-- Perfil (nome, e-mail, telefone): a propria pessoa, o admin, donos de
-- oficina/loja (contato comercial), funcionarios da mesma oficina, o
-- cliente de um servico em que a oficina da pessoa esta envolvida e, para
-- o cliente, os funcionarios das oficinas que atendem os pedidos dele.
CREATE OR REPLACE FUNCTION public.pode_ver_perfil(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
      );
$$;

-- Conversa de cotacao de peca: a oficina que pediu e o fornecedor daquela conversa
CREATE OR REPLACE FUNCTION public.participa_cotacao_peca(p_cot uuid, p_forn uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT eh_admin()
      OR EXISTS (SELECT 1 FROM cotacoes_pecas c WHERE c.id = p_cot AND c.oficina_id IN (SELECT minhas_oficinas()))
      OR p_forn IN (SELECT minhas_lojas())
      OR p_forn IN (SELECT id FROM oficinas WHERE profile_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.eh_admin(), public.minhas_oficinas(), public.minhas_lojas(),
  public.oficina_envolvida(uuid), public.pode_ver_solicitacao(uuid), public.participa_conversa(uuid),
  public.pode_ver_orcamento(uuid), public.pode_ver_emergencia(uuid), public.pode_ver_perfil(uuid),
  public.participa_cotacao_peca(uuid, uuid) FROM anon;

-- ---------- profiles ----------
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated USING (pode_ver_perfil(id));

-- ---------- solicitacoes e dados do pedido ----------
DROP POLICY IF EXISTS solicitacoes_select ON solicitacoes;
CREATE POLICY solicitacoes_select ON solicitacoes FOR SELECT TO authenticated USING (pode_ver_solicitacao(id));

DROP POLICY IF EXISTS fotos_select ON solicitacao_fotos;
CREATE POLICY fotos_select ON solicitacao_fotos FOR SELECT TO authenticated USING (pode_ver_solicitacao(solicitacao_id));

DROP POLICY IF EXISTS analise_dano_select ON analise_dano;
CREATE POLICY analise_dano_select ON analise_dano FOR SELECT TO authenticated USING (pode_ver_solicitacao(solicitacao_id));

-- ---------- orcamentos (concorrentes nao veem o orcamento um do outro) ----------
DROP POLICY IF EXISTS orcamentos_select ON orcamentos;
CREATE POLICY orcamentos_select ON orcamentos FOR SELECT TO authenticated USING (pode_ver_orcamento(id));

DROP POLICY IF EXISTS itens_select ON orcamento_itens;
CREATE POLICY itens_select ON orcamento_itens FOR SELECT TO authenticated USING (pode_ver_orcamento(orcamento_id));

DROP POLICY IF EXISTS disponibilidade_select ON orcamento_disponibilidade;
CREATE POLICY disponibilidade_select ON orcamento_disponibilidade FOR SELECT TO authenticated USING (pode_ver_orcamento(orcamento_id));

-- ---------- mensagens cliente <-> oficina ----------
DROP POLICY IF EXISTS mensagens_select ON mensagens;
DROP POLICY IF EXISTS mensagens_update ON mensagens;
DROP POLICY IF EXISTS mensagens_insert ON mensagens;
CREATE POLICY mensagens_select ON mensagens FOR SELECT TO authenticated USING (participa_conversa(solicitacao_id));
CREATE POLICY mensagens_update ON mensagens FOR UPDATE TO authenticated
  USING (participa_conversa(solicitacao_id)) WITH CHECK (participa_conversa(solicitacao_id));
CREATE POLICY mensagens_insert ON mensagens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = remetente_id AND participa_conversa(solicitacao_id));

-- ---------- acidentes (criacao e acoes sem login so pelas rotas do servidor) ----------
ALTER TABLE emergencias ADD COLUMN IF NOT EXISTS acesso_token_hash text;

DROP POLICY IF EXISTS emergencias_select_anon ON emergencias;
DROP POLICY IF EXISTS emergencias_select ON emergencias;
DROP POLICY IF EXISTS emergencias_insert ON emergencias;
DROP POLICY IF EXISTS emergencias_update ON emergencias;
CREATE POLICY emergencias_select ON emergencias FOR SELECT TO authenticated USING (pode_ver_emergencia(id));
CREATE POLICY emergencias_update ON emergencias FOR UPDATE TO authenticated
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS emergencia_fotos_select ON emergencia_fotos;
DROP POLICY IF EXISTS emergencia_fotos_insert ON emergencia_fotos;
CREATE POLICY emergencia_fotos_select ON emergencia_fotos FOR SELECT TO authenticated USING (pode_ver_emergencia(emergencia_id));

DROP POLICY IF EXISTS msgs_select ON emergencia_mensagens;
DROP POLICY IF EXISTS msgs_insert ON emergencia_mensagens;
CREATE POLICY msgs_select ON emergencia_mensagens FOR SELECT TO authenticated USING (pode_ver_emergencia(emergencia_id));

DROP POLICY IF EXISTS outro_veiculo_select ON emergencia_outro_veiculo;
DROP POLICY IF EXISTS outro_veiculo_insert ON emergencia_outro_veiculo;
CREATE POLICY outro_veiculo_select ON emergencia_outro_veiculo FOR SELECT TO authenticated USING (pode_ver_emergencia(emergencia_id));

DROP POLICY IF EXISTS outro_fotos_select ON emergencia_outro_veiculo_fotos;
DROP POLICY IF EXISTS outro_fotos_insert ON emergencia_outro_veiculo_fotos;
CREATE POLICY outro_fotos_select ON emergencia_outro_veiculo_fotos FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM emergencia_outro_veiculo o WHERE o.id = outro_veiculo_id AND pode_ver_emergencia(o.emergencia_id))
);

DROP POLICY IF EXISTS emergencia_notif_select ON emergencia_oficinas_notificadas;
DROP POLICY IF EXISTS emergencia_notif_insert ON emergencia_oficinas_notificadas;
CREATE POLICY emergencia_notif_select ON emergencia_oficinas_notificadas FOR SELECT TO authenticated
  USING (oficina_id IN (SELECT minhas_oficinas()) OR pode_ver_emergencia(emergencia_id));
-- Oficina marca que respondeu
CREATE POLICY emergencia_notif_update ON emergencia_oficinas_notificadas FOR UPDATE TO authenticated
  USING (oficina_id IN (SELECT minhas_oficinas())) WITH CHECK (oficina_id IN (SELECT minhas_oficinas()));

-- ---------- faltas (no-show) ----------
DROP POLICY IF EXISTS no_show_select ON no_show_historico;
DROP POLICY IF EXISTS no_show_insert ON no_show_historico;
DROP POLICY IF EXISTS no_show_update ON no_show_historico;
CREATE POLICY no_show_select ON no_show_historico FOR SELECT TO authenticated
  USING (cliente_id = auth.uid() OR oficina_id IN (SELECT minhas_oficinas()) OR eh_admin());
CREATE POLICY no_show_insert ON no_show_historico FOR INSERT TO authenticated
  WITH CHECK (oficina_id IN (SELECT minhas_oficinas()));
CREATE POLICY no_show_update ON no_show_historico FOR UPDATE TO authenticated
  USING (oficina_id IN (SELECT minhas_oficinas()) OR cliente_id = auth.uid())
  WITH CHECK (oficina_id IN (SELECT minhas_oficinas()) OR cliente_id = auth.uid());

-- ---------- notificacoes: so para si ou para quem tem relacao ----------
DROP POLICY IF EXISTS notificacoes_insert ON notificacoes;
CREATE POLICY notificacoes_insert ON notificacoes FOR INSERT TO authenticated WITH CHECK (pode_ver_perfil(profile_id));

-- ---------- cotacoes de peca: so oficinas e lojas cadastradas ----------
DROP POLICY IF EXISTS cotacoes_pecas_select ON cotacoes_pecas;
CREATE POLICY cotacoes_pecas_select ON cotacoes_pecas FOR SELECT TO authenticated USING (
  eh_admin() OR EXISTS (SELECT 1 FROM minhas_oficinas()) OR EXISTS (SELECT 1 FROM minhas_lojas())
);

-- ---------- admin enxerga comissoes pelo navegador (pagina da oficina) ----------
CREATE POLICY comissao_lanc_select_admin ON comissao_lancamento FOR SELECT TO authenticated USING (eh_admin());
CREATE POLICY comissao_config_select_admin ON comissao_config FOR SELECT TO authenticated USING (eh_admin());

-- ---------- funcionarios: colegas da mesma oficina se enxergam ----------
CREATE POLICY funcionarios_select_colegas ON funcionarios FOR SELECT TO authenticated
  USING (oficina_id IN (SELECT minhas_oficinas()));

-- ---------- Storage ----------
-- Fotos de dano, audios e imagens de conversa: espaco PRIVADO, lido por link
-- temporario (createSignedUrl) por quem participa. Fotos e logo da oficina:
-- espaco PUBLICO proprio, com escrita so da dona.
UPDATE storage.buckets SET public = false WHERE id = 'damage-photos';
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('publico', 'publico', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS damage_photos_public_read ON storage.objects;
DROP POLICY IF EXISTS damage_photos_anon_insert ON storage.objects;
DROP POLICY IF EXISTS damage_photos_anon_update ON storage.objects;

-- Caminhos: solicitacoes/<solicitacao>/..., audio/<solicitacao>/...,
-- emergencia/<acidente>/..., pecas-mensagens/<cotacao>/<fornecedor>/...
CREATE POLICY privado_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'damage-photos' AND (
    eh_admin()
    OR ((storage.foldername(name))[1] = 'solicitacoes' AND pode_ver_solicitacao(uuid_ou_nulo((storage.foldername(name))[2])))
    OR ((storage.foldername(name))[1] = 'audio' AND participa_conversa(uuid_ou_nulo((storage.foldername(name))[2])))
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
    OR ((storage.foldername(name))[1] = 'audio' AND participa_conversa(uuid_ou_nulo((storage.foldername(name))[2])))
    OR ((storage.foldername(name))[1] = 'pecas-mensagens'
        AND participa_cotacao_peca(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3])))
  )
);

CREATE POLICY publico_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'publico' AND (storage.foldername(name))[1] = 'oficinas'
  AND uuid_ou_nulo((storage.foldername(name))[2]) IN (SELECT id FROM oficinas WHERE profile_id = auth.uid())
);
CREATE POLICY publico_update ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'publico' AND (storage.foldername(name))[1] = 'oficinas'
  AND uuid_ou_nulo((storage.foldername(name))[2]) IN (SELECT id FROM oficinas WHERE profile_id = auth.uid())
);
CREATE POLICY publico_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'publico' AND (storage.foldername(name))[1] = 'oficinas'
  AND uuid_ou_nulo((storage.foldername(name))[2]) IN (SELECT id FROM oficinas WHERE profile_id = auth.uid())
);
-- O envio com substituicao (upsert do logo) precisa ler o proprio objeto
CREATE POLICY publico_select_dona ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'publico' AND (storage.foldername(name))[1] = 'oficinas'
  AND uuid_ou_nulo((storage.foldername(name))[2]) IN (SELECT id FROM oficinas WHERE profile_id = auth.uid())
);
