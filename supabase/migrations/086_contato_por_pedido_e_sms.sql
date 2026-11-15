-- 086: contato do cliente POR PEDIDO + SMS por pedido (dono 15/11, teste dele no pedido 100143).
-- (a) Vazamento: pode_ver_perfil (074) liberava o perfil INTEIRO do cliente (telefone, e-mail) para a
--     oficina escolhida em QUALQUER pedido dele. A regra de linha e por perfil, nao por pedido: a oficina
--     que atendeu o cliente uma vez via o telefone dele em todo pedido novo, antes de ser escolhida
--     (100143: aceite do 100141 as 09:46 liberou o numero no 100143 das 15:54 ate o aceite as 15:59).
--     Agora a oficina NAO le a linha do cliente em profiles. O contato vem por pedido:
--       contato_clientes(ids de pedidos) -> telefone/e-mail so dos pedidos em que o orcamento DELA foi
--       aceito (oficina_ve_contato); nome/codigo/foto/idioma continuam por resumo_clientes (074).
--     Ficam como estavam: acidente com "podem me ligar" (telefone_acidente, 074) e o numero enviado a
--     uma oficina pelo motorista (telefone_compartilhado, 081).
-- (b) SMS por pedido: solicitacoes.sms_avisos. A caixa "quero SMS" do pedido passa a valer tambem para
--     quem ja tem telefone no perfil (antes o SMS ia para o telefone do perfil sempre). DEFAULT true: os
--     pedidos que ja existem continuam recebendo SMS como hoje; o pedido novo grava a escolha.
-- Aditiva e idempotente (ADD COLUMN IF NOT EXISTS, OR REPLACE): pode rodar de novo. Aplicar com
-- psql -v ON_ERROR_STOP=1 -1 -f (uma transacao), depois do build do site e antes do pm2 restart (o site
-- novo chama contato_clientes e grava sms_avisos; o site antigo continua funcionando com o banco novo,
-- so sem mostrar o telefone ao escolhido ate o restart).
-- Rollback: recriar pode_ver_perfil com o corpo da 074 (volta a linha "cliente: so a oficina escolhida");
-- contato_clientes e a coluna podem ficar.

-- (b) SMS por pedido
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS sms_avisos boolean NOT NULL DEFAULT true;

-- (a) corpo da 074 SEM a linha "cliente: so a oficina escolhida" (o contato agora e por pedido).
-- O resto fica igual: o proprio, admin, dono de oficina para quem tem relacao com ela, lojas, equipe,
-- funcionarios das oficinas do pedido do cliente, responsavel pelo pagamento.
CREATE OR REPLACE FUNCTION public.pode_ver_perfil(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p = auth.uid()
      OR eh_admin()
      -- dono de oficina: so para quem tem relacao com ela (cliente com orcamento,
      -- agenda ou conversa; a propria equipe; lojas de pecas que atendem oficinas)
      OR EXISTS (
        SELECT 1 FROM oficinas o WHERE o.profile_id = p AND (
          o.id IN (SELECT minhas_oficinas())
          OR EXISTS (SELECT 1 FROM solicitacoes s WHERE s.cliente_id = auth.uid() AND (
               EXISTS (SELECT 1 FROM orcamentos x WHERE x.solicitacao_id = s.id AND x.oficina_id = o.id)
            OR EXISTS (SELECT 1 FROM agenda x WHERE x.solicitacao_id = s.id AND x.oficina_id = o.id)
            OR EXISTS (SELECT 1 FROM mensagens x WHERE x.solicitacao_id = s.id AND x.oficina_id = o.id)))
          OR EXISTS (SELECT 1 FROM mensagens x WHERE x.pagador_id = auth.uid() AND x.oficina_id = o.id)
          OR EXISTS (SELECT 1 FROM lojas_pecas l WHERE l.profile_id = auth.uid())
        ))
      -- dono de loja de pecas: so para oficinas (clientes das lojas)
      OR (EXISTS (SELECT 1 FROM lojas_pecas WHERE profile_id = p) AND EXISTS (SELECT 1 FROM minhas_oficinas()))
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
$$;

-- Contato do cliente por pedido: so os pedidos em que o orcamento da MINHA oficina foi aceito
-- (oficina_ve_contato = oficina_atende). O admin le todos. Sem linha = sem contato.
CREATE OR REPLACE FUNCTION public.contato_clientes(p_sols uuid[])
RETURNS TABLE (solicitacao_id uuid, cliente_id uuid, telefone text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, p.id, p.telefone, p.email
  FROM solicitacoes s JOIN profiles p ON p.id = s.cliente_id
  WHERE s.id = ANY (p_sols) AND (eh_admin() OR oficina_ve_contato(s.id));
$$;

REVOKE ALL ON FUNCTION public.contato_clientes(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.contato_clientes(uuid[]) TO authenticated;
