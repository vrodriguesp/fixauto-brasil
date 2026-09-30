-- 032: quem cria uma linha consegue le-la de volta no mesmo comando
-- (INSERT ... RETURNING / .insert().select()) - 2026-09-30.
--
-- As regras de leitura da 028 usam funcoes que consultam a propria tabela
-- (pode_ver_solicitacao(id) etc.). No INSERT ... RETURNING a linha nova ainda
-- nao e visivel para essa consulta, e o Postgres recusa com "new row violates
-- row-level security policy". Achado no teste do app (nova solicitacao).
-- Correcao: checar primeiro a coluna de dono da PROPRIA linha, depois a funcao.

DROP POLICY IF EXISTS solicitacoes_select ON solicitacoes;
CREATE POLICY solicitacoes_select ON solicitacoes FOR SELECT TO authenticated
  USING (cliente_id = auth.uid() OR pode_ver_solicitacao(id));

DROP POLICY IF EXISTS orcamentos_select ON orcamentos;
CREATE POLICY orcamentos_select ON orcamentos FOR SELECT TO authenticated
  USING (oficina_id IN (SELECT minhas_oficinas()) OR pode_ver_orcamento(id));

DROP POLICY IF EXISTS emergencias_select ON emergencias;
CREATE POLICY emergencias_select ON emergencias FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR pode_ver_emergencia(id));

DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR pode_ver_perfil(id));
