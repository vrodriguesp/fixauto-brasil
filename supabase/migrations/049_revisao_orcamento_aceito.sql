-- Revisao de orcamento JA ACEITO (dano oculto, peca extra...). Padrao do
-- mercado (ClickMechanic: "Any additional work requires your approval before
-- it starts"; leis de consumidor: trabalho alem do orcamento so com nova
-- autorizacao). A oficina PROPOE; o orcamento aceito so muda se o cliente
-- aprovar. O cliente pode: aprovar | recusar (segue o preco original) |
-- recusar e retirar o carro (servico encerrado, sem comissao).
-- Monitoramento de oficinas mal-intencionadas (orcamento baixo, depois sobe):
-- revisao_numero/valor_original do orcamento (selo de ajuste no perfil
-- publico e bonus de comissao por poucas revisoes) + esta tabela (quantas
-- propostas, quanto subiu, quantas recusadas/carro retirado) no admin.
CREATE TABLE IF NOT EXISTS orcamento_revisoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id uuid NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  oficina_id uuid NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  numero integer NOT NULL,
  valor_anterior numeric(10,2) NOT NULL,
  valor_novo numeric(10,2) NOT NULL,
  prazo_dias_novo integer,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  motivo text NOT NULL CHECK (char_length(motivo) BETWEEN 5 AND 1000),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'recusada', 'retirada', 'cancelada')),
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  decidido_em timestamptz,
  decidido_por uuid
);
-- uma proposta pendente por orcamento
CREATE UNIQUE INDEX IF NOT EXISTS orcamento_revisoes_uma_pendente ON orcamento_revisoes(orcamento_id) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS orcamento_revisoes_solicitacao_idx ON orcamento_revisoes(solicitacao_id);
CREATE INDEX IF NOT EXISTS orcamento_revisoes_oficina_idx ON orcamento_revisoes(oficina_id, created_at DESC);

ALTER TABLE orcamento_revisoes ENABLE ROW LEVEL SECURITY;
-- leitura: cliente do pedido, equipe da oficina, admin. Escrita: so o servidor.
DROP POLICY IF EXISTS orcamento_revisoes_select ON orcamento_revisoes;
CREATE POLICY orcamento_revisoes_select ON orcamento_revisoes FOR SELECT TO authenticated USING (
  eh_admin()
  OR oficina_id IN (SELECT minhas_oficinas())
  OR EXISTS (SELECT 1 FROM solicitacoes s WHERE s.id = solicitacao_id AND s.cliente_id = auth.uid())
);
REVOKE INSERT, UPDATE, DELETE ON orcamento_revisoes FROM anon, authenticated;
GRANT SELECT ON orcamento_revisoes TO authenticated;
