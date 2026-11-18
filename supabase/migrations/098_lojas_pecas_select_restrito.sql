-- 098: leitura de lojas_pecas pela chave publica restrita (seguranca, pre-existente; veredito Fable lote 4, 18/11/2026, sec. 1).
-- Antes: lojas_pecas_select (017) era FOR SELECT USING (true), para todos os papeis: qualquer um com a chave anon
-- (publica, vai no site e no app) lia TODAS as colunas de TODAS as lojas pelo REST (/rest/v1/lojas_pecas?select=*):
-- registro (cnpj), IVA, profile_id, coordenadas e as colunas novas da 097.
-- Depois: so usuario logado, e so quem precisa:
--   * a propria loja (perfil, auth-context: select('*') da propria linha);
--   * admin (as telas de admin usam o servidor/service role, mas fica coerente com o resto: eh_admin());
--   * oficina (dona ou funcionario ativo, qualquer estado) - ve o nome/pais da loja que respondeu a cotacao
--     (oficina/pecas, conversa) - mesmo que a loja tenha sido desativada depois (historico).
-- Cliente (motorista), outra loja e anon: nada. A pagina publica, a lista, o sitemap e as rotas de API leem pelo
-- servidor (service role) e nao mudam. As politicas de outras tabelas que consultam lojas_pecas so usam a propria
-- linha (l.profile_id = auth.uid()) ou funcoes SECURITY DEFINER (minhas_lojas, pode_ver_perfil,
-- parceiro_ve_fornecedor, fornecedor_conta_teste...) - continuam iguais.
-- Escrita: anon nao tinha como passar nas politicas (UPDATE exige auth.uid() = profile_id; INSERT saiu na 090);
-- aqui tambem se tiram os privilegios de tabela do anon (defesa em profundidade).
-- Aditiva/idempotente; transacao unica. Aplicar: psql -1 -v ON_ERROR_STOP=1 -f 098_lojas_pecas_select_restrito.sql
--
-- Rollback:
--   DROP POLICY IF EXISTS lojas_pecas_select ON lojas_pecas;
--   CREATE POLICY lojas_pecas_select ON lojas_pecas FOR SELECT USING (true);
--   GRANT ALL ON lojas_pecas TO anon;
--   NOTIFY pgrst, 'reload schema';
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS lojas_pecas_select ON lojas_pecas;
CREATE POLICY lojas_pecas_select ON lojas_pecas FOR SELECT TO authenticated USING (
  profile_id = auth.uid()
  OR (SELECT eh_admin())
  OR EXISTS (SELECT 1 FROM minhas_oficinas())
);

REVOKE ALL ON lojas_pecas FROM anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
