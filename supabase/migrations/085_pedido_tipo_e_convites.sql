-- 085: triagem do pedido no admin (Lote 2; Documentos/Analises/Fable_mapa_mudancas_pedido_triagem_2026-11-15.md, secao 2).
-- (a) o admin muda o tipo do pedido (so solicitacoes.tipo + admin_auditoria; NINGUEM e avisado) e, num passo
--     separado, avisa as oficinas do tipo novo (mesma regra do aviso automatico, preview = envio, teto 50);
-- (b) ou envia o pedido a oficinas escolhidas: pedido_convites. A oficina convidada passa a "atender" o pedido
--     (minha_oficina_atende), entao ve, orca, dispensa, conta no menu e acha na busca sem reescrever politica.
-- Decisao do dono 15/11: ao mudar o tipo, quem ja recebeu o pedido continua com acesso (linha com
-- origem = 'tipo_alterado', sem aviso nenhum).
-- Aditiva e idempotente (IF NOT EXISTS, OR REPLACE, DROP POLICY IF EXISTS + CREATE): pode rodar de novo sem
-- duplicar nada. Aplicar com psql -v ON_ERROR_STOP=1 -1 -f (uma transacao), depois do build do site e antes do
-- pm2 restart. pedido_convites nasce vazia: nenhuma visibilidade muda no deploy.
-- Rollback: recriar minha_oficina_atende com o corpo da 064 (sem o OR) e DROP FUNCTION oficina_convidada(uuid);
-- a tabela e o indice podem ficar.

-- 1) Convites: pedido enviado pela BipFix a uma oficina escolhida (ou acesso mantido ao mudar o tipo)
CREATE TABLE IF NOT EXISTS pedido_convites (
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  oficina_id     uuid NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  convidado_por  uuid REFERENCES profiles(id) ON DELETE SET NULL,   -- admin que convidou / mudou o tipo
  origem         text NOT NULL DEFAULT 'admin' CHECK (origem IN ('admin', 'tipo_alterado')),
  motivo         text CHECK (motivo IS NULL OR char_length(motivo) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (solicitacao_id, oficina_id)
);
CREATE INDEX IF NOT EXISTS pedido_convites_oficina_idx ON pedido_convites (oficina_id);

ALTER TABLE pedido_convites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pedido_convites_select ON pedido_convites;
-- a oficina le so os convites dela (dono e funcionarios); o admin le todos.
CREATE POLICY pedido_convites_select ON pedido_convites FOR SELECT TO authenticated
  USING (oficina_id IN (SELECT minhas_oficinas()) OR eh_admin());
-- sem INSERT/UPDATE/DELETE pelo navegador: so o servidor (service role) convida
REVOKE ALL ON pedido_convites FROM anon, authenticated, public;
GRANT SELECT ON pedido_convites TO authenticated;

-- 2) A oficina (minha) foi convidada para este pedido? Mesma separacao teste x real da 063/064.
CREATE OR REPLACE FUNCTION public.oficina_convidada(p_sol uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM pedido_convites c
    JOIN oficinas o ON o.id = c.oficina_id AND o.ativa
    JOIN profiles po ON po.id = o.profile_id
    JOIN solicitacoes s ON s.id = c.solicitacao_id
    LEFT JOIN profiles pc ON pc.id = s.cliente_id
    WHERE c.solicitacao_id = p_sol
      AND c.oficina_id IN (SELECT minhas_oficinas())
      -- conta de teste (revisor das lojas) so com oficina de teste, e vice-versa
      AND po.conta_teste = COALESCE(pc.conta_teste, false)
  );
$$;
REVOKE ALL ON FUNCTION public.oficina_convidada(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.oficina_convidada(uuid) TO authenticated;

-- 3) A oficina "atende" o pedido tambem quando a BipFix a convidou (pedido_convites).
-- Corpo da 064 + OR oficina_convidada. Tudo que ja usa esta funcao (pode_ver_solicitacao, orcamentos_insert via
-- pode_ver_solicitacao, pedido_dispensas, pedidos_para_responder, procurar_na_oficina, resumo_clientes, veiculos,
-- fotos, storage, chat) passa a valer para a convidada. pode_ver_solicitacao continua exigindo pedido aberto.
CREATE OR REPLACE FUNCTION minha_oficina_atende(p_sol uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM solicitacoes s
    JOIN oficinas o ON o.id IN (SELECT minhas_oficinas()) AND o.ativa
    JOIN profiles po ON po.id = o.profile_id
    LEFT JOIN profiles pc ON pc.id = s.cliente_id
    WHERE s.id = p_sol
      AND tipo_compativel(o.especialidades, s.tipo)
      AND s.latitude IS NOT NULL AND o.latitude IS NOT NULL
      AND distancia_km(s.latitude, s.longitude, o.latitude, o.longitude) <= COALESCE(o.raio_atendimento_km, 30)
      -- conta de teste (revisor das lojas) so com oficina de teste, e vice-versa
      AND po.conta_teste = COALESCE(pc.conta_teste, false)
  ) OR oficina_convidada(p_sol);
$$;

-- 4) Auditoria: sem tabela nova. admin_auditoria (027) com acao = 'mudar_tipo' (antes/depois.tipo,
--    depois.acesso_mantido), 'avisar_tipo_novo' (depois.oficinas) e 'convidar_oficinas' (depois.oficinas).

-- 5) "Quem ja recebeu este pedido": as rotas do admin e o aviso automatico procuram por dados->>'solicitacao_id'
--    (antes varria a tabela inteira). Condicao "IS NOT NULL" (e nao "dados ? 'solicitacao_id'", como no mapa): o
--    planejador so usa um indice parcial quando prova a condicao a partir do filtro, e de
--    "dados->>'solicitacao_id' = x" ele prova IS NOT NULL, mas nao o operador "?" (conferido com EXPLAIN).
CREATE INDEX IF NOT EXISTS notificacoes_solicitacao_idx
  ON notificacoes ((dados->>'solicitacao_id'))
  WHERE (dados->>'solicitacao_id') IS NOT NULL;

-- PostgREST: tabela nova embutivel (convites:pedido_convites(...))
NOTIFY pgrst, 'reload schema';
