-- 104: leitura de pecas_catalogo pela chave publica restrita (seguranca, pre-existente; mapa do lote 5 de pecas,
-- 20/11/2026, Documentos/Analises/Pecas_lote5_2026-11-20/Mapa_lote5.md sec. 1.1). Mesmo padrao da 098.
-- Antes: pecas_catalogo_select (017) era FOR SELECT USING (true), para todos os papeis: qualquer um com a chave
-- anon (publica, vai no site e no app) lia o catalogo inteiro de todas as lojas COM O PRECO pelo REST
-- (/rest/v1/pecas_catalogo?select=*) - inclusive motoristas (proposta v1 sec. 3: preco de loja nunca ao motorista).
-- Depois: so usuario logado, e so a loja dona (minhas_lojas) e admin. Nenhuma tela de hoje le o catalogo de outra
-- loja (so /loja/catalogo e /loja/dashboard, da propria loja). O Shop e a pagina publica (lote 5) leem pelo
-- servidor (service role), atras dos interruptores.
-- Escrita: politicas de hoje (017), intocadas. Tira-se tambem o privilegio de tabela do anon (defesa em profundidade).
-- Aditiva/idempotente; transacao unica. Aplicar: psql -1 -v ON_ERROR_STOP=1 -f 104_pecas_catalogo_select_restrito.sql
-- Segura ANTES do build (o codigo no ar nao depende da leitura publica).
--
-- Rollback:
--   DROP POLICY IF EXISTS pecas_catalogo_select ON pecas_catalogo;
--   CREATE POLICY pecas_catalogo_select ON pecas_catalogo FOR SELECT USING (true);
--   GRANT ALL ON pecas_catalogo TO anon;
--   NOTIFY pgrst, 'reload schema';
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS pecas_catalogo_select ON pecas_catalogo;
CREATE POLICY pecas_catalogo_select ON pecas_catalogo FOR SELECT TO authenticated USING (
  loja_id IN (SELECT minhas_lojas())
  OR (SELECT eh_admin())
);

REVOKE ALL ON pecas_catalogo FROM anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
