-- 079: orcamento com todas as datas vencidas -> "Tenho interesse, mande novas datas" (dono 11/11,
-- docs/DESENHO_079_novas_datas.md). O motorista pede novas datas a oficina (ate 3 sugestoes
-- dia + turno e uma mensagem curta); a oficina confirma uma sugestao (vira horario do orcamento
-- e o orcamento e aceito e agendado) ou manda outras datas (o orcamento continua igual: mesmo
-- preco, sem nova revisao). Lembrete a oficina em 24 h sem resposta. Sem aviso preventivo: a oficina
-- so e chamada quando o cliente pede (dono 11/11). Orcamento vencido (validade antes de hoje) nao
-- aceita pedido nem aceite. Escrita so pelo servidor (chave de servico).

-- de onde veio o horario: a oficina ofereceu ou foi a sugestao do cliente confirmada
ALTER TABLE orcamento_disponibilidade ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'oficina';
DO $$ BEGIN
  ALTER TABLE orcamento_disponibilidade ADD CONSTRAINT orcamento_disponibilidade_origem_check CHECK (origem IN ('oficina', 'cliente'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS orcamento_pedido_datas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id uuid NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  oficina_id uuid NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'atendido', 'cancelado')),
  -- [{ "data": "AAAA-MM-DD", "turno": "manha" | "tarde" }], no maximo 3
  sugestoes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sugestoes) = 'array' AND jsonb_array_length(sugestoes) <= 3),
  mensagem text CHECK (mensagem IS NULL OR char_length(mensagem) <= 300),
  resposta text CHECK (resposta IS NULL OR resposta IN ('confirmou', 'novas_datas')),
  created_at timestamptz NOT NULL DEFAULT now(),
  atendido_em timestamptz,
  lembrete_em timestamptz
);
-- um pedido pendente por orcamento (o motorista pode pedir a varias oficinas, um por orcamento)
CREATE UNIQUE INDEX IF NOT EXISTS orcamento_pedido_datas_um_pendente ON orcamento_pedido_datas (orcamento_id) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS orcamento_pedido_datas_oficina_pend_idx ON orcamento_pedido_datas (oficina_id) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS orcamento_pedido_datas_solicitacao_idx ON orcamento_pedido_datas (solicitacao_id);

-- leitura: o cliente do pedido, a equipe da oficina e o admin; escrita so pelo servidor
ALTER TABLE orcamento_pedido_datas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON orcamento_pedido_datas FROM anon, authenticated;
GRANT SELECT ON orcamento_pedido_datas TO authenticated;
DROP POLICY IF EXISTS pedido_datas_select ON orcamento_pedido_datas;
CREATE POLICY pedido_datas_select ON orcamento_pedido_datas FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM solicitacoes s WHERE s.id = orcamento_pedido_datas.solicitacao_id AND s.cliente_id = auth.uid())
  OR oficina_id IN (SELECT minhas_oficinas())
  OR eh_admin()
);

-- policy de DELETE dos horarios (so existia no legado, migrations_legado/ALL_NEW_FEATURES.sql): versionada igual
DROP POLICY IF EXISTS "disponibilidade_delete" ON orcamento_disponibilidade;
CREATE POLICY "disponibilidade_delete" ON orcamento_disponibilidade FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM orcamentos o
    JOIN oficinas of ON of.id = o.oficina_id
    WHERE o.id = orcamento_id AND of.profile_id = auth.uid()
  )
);

-- retrato do orcamento no momento do pedido (revisao Fable 079, M1): a oficina so confirma a data
-- sugerida (aceite automatico) se o orcamento for o MESMO que o cliente viu
ALTER TABLE orcamento_pedido_datas ADD COLUMN IF NOT EXISTS valor_total_pedido numeric(10,2);
ALTER TABLE orcamento_pedido_datas ADD COLUMN IF NOT EXISTS revisao_numero_pedido integer;

-- a oficina modificou/revisou o orcamento (valor ou revisao): o pedido de datas pendente cai.
-- Trigger porque "Modificar orcamento" grava pelo navegador (chave do usuario).
CREATE OR REPLACE FUNCTION cancelar_pedido_datas_ao_revisar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.valor_total IS DISTINCT FROM OLD.valor_total
     OR NEW.revisao_numero IS DISTINCT FROM OLD.revisao_numero
     OR NEW.revisado_em IS DISTINCT FROM OLD.revisado_em THEN
    UPDATE orcamento_pedido_datas SET status = 'cancelado' WHERE orcamento_id = NEW.id AND status = 'pendente';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orcamentos_cancela_pedido_datas ON orcamentos;
CREATE TRIGGER orcamentos_cancela_pedido_datas AFTER UPDATE OF valor_total, revisao_numero, revisado_em ON orcamentos
  FOR EACH ROW EXECUTE FUNCTION cancelar_pedido_datas_ao_revisar();
REVOKE ALL ON FUNCTION cancelar_pedido_datas_ao_revisar() FROM PUBLIC, anon, authenticated;

-- no maximo UM orcamento aceito por pedido (revisao Fable 079, M2): com 079 a oficina tambem dispara
-- o aceite (confirmar a data sugerida), entao cliente e oficina(s) podem aceitar ao mesmo tempo.
-- (conferido: nenhum pedido com dois aceitos no banco local; conferir na producao antes de aplicar:
--  SELECT solicitacao_id FROM orcamentos WHERE status = 'aceito' GROUP BY 1 HAVING count(*) > 1;)
CREATE UNIQUE INDEX IF NOT EXISTS orcamentos_um_aceito_por_pedido ON orcamentos (solicitacao_id) WHERE status = 'aceito';

-- selo "novas datas pedidas" na lista da oficina em tempo real (RLS de leitura ja cobre)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE orcamento_pedido_datas;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;
