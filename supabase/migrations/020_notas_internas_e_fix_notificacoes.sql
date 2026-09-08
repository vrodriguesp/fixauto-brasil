-- Migration 020:
-- 1) Corrige bug critico achado na varredura de 08/09/2026: a tabela
--    notificacoes tem RLS habilitado mas NUNCA teve uma policy de INSERT
--    nas migrations numeradas (001-019) - so existia num arquivo antigo
--    nao usado (FULL_MIGRATION.sql). Resultado: todo INSERT direto do
--    navegador em "notificacoes" (novo orcamento, nova solicitacao,
--    cotacao de peca respondida, checkin manual, etc - pelo menos 7
--    telas diferentes) falhava silenciosamente hoje em producao. So as
--    notificacoes criadas por rotas de servidor (service role) chegavam.
-- 2) Nova tabela veiculo_notas_internas: comunicacao interna da equipe da
--    oficina (mecanico <-> administrativo/dono) sobre um veiculo
--    especifico, nunca visivel ao cliente.

-- === Fix notificacoes ===
DROP POLICY IF EXISTS "notificacoes_insert" ON notificacoes;
CREATE POLICY "notificacoes_insert" ON notificacoes FOR INSERT WITH CHECK (true);

-- === Notas internas por veiculo ===
CREATE TABLE IF NOT EXISTS veiculo_notas_internas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id UUID NOT NULL REFERENCES agenda(id) ON DELETE CASCADE,
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  remetente_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_veiculo_notas_agenda ON veiculo_notas_internas(agenda_id, created_at);

ALTER TABLE veiculo_notas_internas ENABLE ROW LEVEL SECURITY;

-- Visivel e gravavel por qualquer um da equipe da oficina (dono ou
-- funcionario ativo) - nunca pelo cliente, mesmo que ele tenha acesso a
-- essa solicitacao/agenda por outras policies.
CREATE POLICY "notas_internas_select" ON veiculo_notas_internas FOR SELECT USING (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
  OR EXISTS (SELECT 1 FROM funcionarios WHERE oficina_id = veiculo_notas_internas.oficina_id AND profile_id = auth.uid() AND ativo = true)
);
CREATE POLICY "notas_internas_insert" ON veiculo_notas_internas FOR INSERT WITH CHECK (
  auth.uid() = remetente_id AND (
    EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM funcionarios WHERE oficina_id = veiculo_notas_internas.oficina_id AND profile_id = auth.uid() AND ativo = true)
  )
);

ALTER PUBLICATION supabase_realtime ADD TABLE veiculo_notas_internas;
