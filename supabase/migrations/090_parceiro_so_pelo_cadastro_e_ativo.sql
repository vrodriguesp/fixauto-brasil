-- 090: oficina e loja de pecas so nascem pelo cadastro do servidor, e so as
-- ATIVAS (conferidas pelo admin) enxergam o que e de outras contas.
--
-- Achado de 17/11 (inventario das pecas): qualquer conta logada podia criar a
-- propria linha em `oficinas` ou `lojas_pecas` pela API (politicas de INSERT
-- auth.uid() = profile_id, 017/001) e, mesmo inativa, passava a ler todas as
-- cotacoes de pecas (028) e o perfil (e-mail, telefone) dos donos de oficina
-- e de loja (pode_ver_perfil, 086). O cadastro normal tambem cria a linha
-- inativa (029) ate o admin conferir o registro: nesse intervalo valia o mesmo.
--
-- 1) Sem INSERT pelo cliente: o cadastro (/api/cadastro) cria a linha com o
--    service role; app e site nunca inserem direto.
-- 2) Cotacoes de pecas: a oficina sempre ve as proprias; as dos outros so com
--    oficina ATIVA (dono ou funcionario) ou loja ATIVA.
-- 3) pode_ver_perfil: dono de loja so ve donos de oficina com a loja ATIVA;
--    oficina so ve donos de loja com a oficina ATIVA. O resto igual ao 086.
-- 4) Auditoria Fable (17/11): o dono de oficina (mesmo inativa) inseria qualquer
--    profile_id em `funcionarios` pela API (politica FOR ALL da 008) e lia o
--    e-mail/telefone dessa pessoa pelo pode_ver_perfil. A equipe e gerida so
--    pela rota /api/funcionarios (service role): sai a escrita pelo cliente; a
--    leitura continua (funcionarios_select_colegas, 028, e o proprio registro).
-- minhas_oficinas()/minhas_lojas() nao mudam: o painel da conta inativa
-- (perfil, dados proprios) continua funcionando.
--
-- ROLLBACK (se precisar):
--   CREATE POLICY oficinas_insert ON oficinas FOR INSERT WITH CHECK (auth.uid() = profile_id);
--   CREATE POLICY lojas_pecas_insert ON lojas_pecas FOR INSERT WITH CHECK (auth.uid() = profile_id);
--   CREATE POLICY "Oficina admin pode gerenciar funcionários" ON funcionarios FOR ALL USING (EXISTS (SELECT 1 FROM oficinas WHERE oficinas.id = funcionarios.oficina_id AND oficinas.profile_id = auth.uid()));
--   DROP POLICY cotacoes_pecas_select ON cotacoes_pecas;
--   CREATE POLICY cotacoes_pecas_select ON cotacoes_pecas FOR SELECT TO authenticated USING (eh_admin() OR EXISTS (SELECT 1 FROM minhas_oficinas()) OR EXISTS (SELECT 1 FROM minhas_lojas()));
--   pode_ver_perfil: rodar de novo o CREATE OR REPLACE da 086 (086:27-57).
--   NOTIFY pgrst, 'reload schema';

-- nao fica na fila atras de consulta longa segurando o site (aplicar de novo se der timeout)
SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS oficinas_insert ON oficinas;
DROP POLICY IF EXISTS lojas_pecas_insert ON lojas_pecas;

-- escrita em funcionarios so pelo servidor (nome com acento: apaga pelo catalogo)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'funcionarios' AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  LOOP
    EXECUTE format('DROP POLICY %I ON funcionarios', r.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS cotacoes_pecas_select ON cotacoes_pecas;
CREATE POLICY cotacoes_pecas_select ON cotacoes_pecas FOR SELECT TO authenticated USING (
  eh_admin()
  OR oficina_id IN (SELECT minhas_oficinas())
  OR EXISTS (SELECT 1 FROM oficinas o WHERE o.id IN (SELECT minhas_oficinas()) AND o.ativa)
  OR EXISTS (SELECT 1 FROM lojas_pecas l WHERE l.profile_id = auth.uid() AND l.ativa)
);

CREATE OR REPLACE FUNCTION public.pode_ver_perfil(p uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p = auth.uid()
      OR eh_admin()
      -- dono de oficina: so para quem tem relacao com ela (cliente com orcamento,
      -- agenda ou conversa; a propria equipe; lojas de pecas ATIVAS que atendem oficinas)
      OR EXISTS (
        SELECT 1 FROM oficinas o WHERE o.profile_id = p AND (
          o.id IN (SELECT minhas_oficinas())
          OR EXISTS (SELECT 1 FROM solicitacoes s WHERE s.cliente_id = auth.uid() AND (
               EXISTS (SELECT 1 FROM orcamentos x WHERE x.solicitacao_id = s.id AND x.oficina_id = o.id)
            OR EXISTS (SELECT 1 FROM agenda x WHERE x.solicitacao_id = s.id AND x.oficina_id = o.id)
            OR EXISTS (SELECT 1 FROM mensagens x WHERE x.solicitacao_id = s.id AND x.oficina_id = o.id)))
          OR EXISTS (SELECT 1 FROM mensagens x WHERE x.pagador_id = auth.uid() AND x.oficina_id = o.id)
          OR EXISTS (SELECT 1 FROM lojas_pecas l WHERE l.profile_id = auth.uid() AND l.ativa)
        ))
      -- dono de loja de pecas: so para oficinas ATIVAS (clientes das lojas)
      OR (EXISTS (SELECT 1 FROM lojas_pecas WHERE profile_id = p)
          AND EXISTS (SELECT 1 FROM oficinas o2 WHERE o2.id IN (SELECT minhas_oficinas()) AND o2.ativa))
      OR EXISTS (SELECT 1 FROM funcionarios f WHERE f.profile_id = p AND f.oficina_id IN (SELECT minhas_oficinas()))
      -- (086) cliente: a oficina nao le mais a linha; contato por pedido em contato_clientes()
      OR EXISTS (
        SELECT 1 FROM funcionarios f
        JOIN solicitacoes s ON s.cliente_id = auth.uid()
        WHERE f.profile_id = p AND (
          f.oficina_id IN (SELECT oficina_id FROM orcamentos WHERE solicitacao_id = s.id)
          OR f.oficina_id IN (SELECT oficina_id FROM agenda WHERE solicitacao_id = s.id)
        )
      )
      -- responsavel pelo pagamento que conversa com a oficina
      OR EXISTS (SELECT 1 FROM mensagens m WHERE m.pagador_id = p AND m.oficina_id IN (SELECT minhas_oficinas()));
$function$;

NOTIFY pgrst, 'reload schema';
