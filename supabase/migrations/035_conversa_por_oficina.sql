-- Conversa separada por oficina: antes um pedido tinha UMA conversa para o
-- cliente e todas as oficinas, entao a oficina so podia escrever depois de
-- orcar (senao veria a conversa das concorrentes). Agora a conversa e o par
-- (pedido, oficina): cada oficina ve so a dela e pode tirar duvidas antes de
-- orcar; o cliente ve todas as suas.

ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS oficina_id UUID REFERENCES oficinas(id) ON DELETE CASCADE;

-- Rede de seguranca para quem grava sem informar a oficina (versao antiga do
-- app, mensagem automatica): quem envia sendo oficina/funcionario -> a dele;
-- senao a oficina do orcamento aceito; senao a unica oficina que orcou.
CREATE OR REPLACE FUNCTION mensagens_definir_oficina() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.oficina_id IS NULL THEN
    SELECT id INTO NEW.oficina_id FROM oficinas WHERE profile_id = NEW.remetente_id LIMIT 1;
  END IF;
  IF NEW.oficina_id IS NULL THEN
    SELECT oficina_id INTO NEW.oficina_id FROM funcionarios WHERE profile_id = NEW.remetente_id AND ativo LIMIT 1;
  END IF;
  IF NEW.oficina_id IS NULL THEN
    SELECT oficina_id INTO NEW.oficina_id FROM orcamentos
     WHERE solicitacao_id = NEW.solicitacao_id AND status = 'aceito' LIMIT 1;
  END IF;
  IF NEW.oficina_id IS NULL THEN
    SELECT (array_agg(DISTINCT oficina_id))[1] INTO NEW.oficina_id FROM orcamentos
     WHERE solicitacao_id = NEW.solicitacao_id HAVING count(DISTINCT oficina_id) = 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS mensagens_definir_oficina ON mensagens;
CREATE TRIGGER mensagens_definir_oficina BEFORE INSERT ON mensagens
  FOR EACH ROW EXECUTE FUNCTION mensagens_definir_oficina();

-- mensagens antigas: mesma regra; o que nao der para atribuir e apagado
UPDATE mensagens m SET oficina_id = COALESCE(
  (SELECT id FROM oficinas WHERE profile_id = m.remetente_id LIMIT 1),
  (SELECT oficina_id FROM funcionarios WHERE profile_id = m.remetente_id AND ativo LIMIT 1),
  (SELECT oficina_id FROM orcamentos WHERE solicitacao_id = m.solicitacao_id AND status = 'aceito' LIMIT 1),
  (SELECT (array_agg(DISTINCT oficina_id))[1] FROM orcamentos WHERE solicitacao_id = m.solicitacao_id HAVING count(DISTINCT oficina_id) = 1)
) WHERE oficina_id IS NULL;
DELETE FROM mensagens WHERE oficina_id IS NULL;
ALTER TABLE mensagens ALTER COLUMN oficina_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON mensagens (solicitacao_id, oficina_id, created_at);

-- Ler a conversa: admin, o cliente do pedido, ou a propria oficina.
CREATE OR REPLACE FUNCTION participa_conversa_oficina(p_sol UUID, p_of UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT eh_admin()
      OR EXISTS (SELECT 1 FROM solicitacoes WHERE id = p_sol AND cliente_id = auth.uid())
      OR p_of IN (SELECT minhas_oficinas());
$$;

-- Escrever: a oficina enquanto pode ver o pedido (aberto/em orcamento, ou
-- ela ja esta envolvida); o cliente so para oficina que ja orcou, tem
-- agendamento, foi avisada da emergencia ou ja escreveu para ele.
CREATE OR REPLACE FUNCTION pode_escrever_conversa(p_sol UUID, p_of UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (p_of IN (SELECT minhas_oficinas()) AND pode_ver_solicitacao(p_sol))
      OR (
        EXISTS (SELECT 1 FROM solicitacoes WHERE id = p_sol AND cliente_id = auth.uid())
        AND (
          EXISTS (SELECT 1 FROM orcamentos WHERE solicitacao_id = p_sol AND oficina_id = p_of)
          OR EXISTS (SELECT 1 FROM agenda WHERE solicitacao_id = p_sol AND oficina_id = p_of)
          OR EXISTS (SELECT 1 FROM mensagens WHERE solicitacao_id = p_sol AND oficina_id = p_of)
          OR EXISTS (
            SELECT 1 FROM solicitacoes s
            JOIN emergencia_oficinas_notificadas n ON n.emergencia_id = s.emergencia_id
            WHERE s.id = p_sol AND n.oficina_id = p_of
          )
        )
      );
$$;

DROP POLICY IF EXISTS mensagens_select ON mensagens;
DROP POLICY IF EXISTS mensagens_insert ON mensagens;
DROP POLICY IF EXISTS mensagens_update ON mensagens;
CREATE POLICY mensagens_select ON mensagens FOR SELECT TO authenticated
  USING (participa_conversa_oficina(solicitacao_id, oficina_id));
CREATE POLICY mensagens_insert ON mensagens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = remetente_id AND pode_escrever_conversa(solicitacao_id, oficina_id));
CREATE POLICY mensagens_update ON mensagens FOR UPDATE TO authenticated
  USING (participa_conversa_oficina(solicitacao_id, oficina_id))
  WITH CHECK (participa_conversa_oficina(solicitacao_id, oficina_id));

-- Pelo site/app so se marca como lida; texto, remetente e conversa nao se
-- alteram (a transcricao de audio grava pelo servidor).
REVOKE UPDATE ON mensagens FROM anon, authenticated;
GRANT UPDATE (lida) ON mensagens TO authenticated;
REVOKE INSERT, DELETE, TRUNCATE ON mensagens FROM anon;

-- Audio: audio/<pedido>/<oficina>/<arquivo>
DROP POLICY IF EXISTS privado_select ON storage.objects;
DROP POLICY IF EXISTS privado_insert ON storage.objects;
CREATE POLICY privado_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'damage-photos' AND (
    eh_admin()
    OR ((storage.foldername(name))[1] = 'solicitacoes' AND pode_ver_solicitacao(uuid_ou_nulo((storage.foldername(name))[2])))
    OR ((storage.foldername(name))[1] = 'audio'
        AND participa_conversa_oficina(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3])))
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
        AND pode_escrever_conversa(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3])))
    OR ((storage.foldername(name))[1] = 'pecas-mensagens'
        AND participa_cotacao_peca(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3])))
  )
);

-- Mensagem nova aparece na hora do outro lado (faltava no tempo real)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'mensagens') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mensagens;
  END IF;
END $$;
