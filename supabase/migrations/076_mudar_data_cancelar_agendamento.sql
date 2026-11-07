-- 076: mudar a data ou cancelar um agendamento antes do check-in (dono 07/11).
--  a) pela revisao do orcamento: a oficina PROPOE uma nova data de entrega com uma
--     justificativa; o cliente aceita (a agenda muda) ou recusa (fica a data antiga,
--     o servico continua). Mesma tabela da revisao de valor (049), tipo 'data';
--  b) pela agenda da oficina: "mudar data" e "cancelar agendamento", sempre com
--     justificativa, registrados no historico da agenda e avisados ao cliente.
ALTER TABLE orcamento_revisoes ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'valor';
ALTER TABLE orcamento_revisoes ADD COLUMN IF NOT EXISTS nova_data_checkin date;
ALTER TABLE orcamento_revisoes ADD COLUMN IF NOT EXISTS novo_turno text;
ALTER TABLE orcamento_revisoes ADD COLUMN IF NOT EXISTS nova_previsao_entrega date;
ALTER TABLE orcamento_revisoes DROP CONSTRAINT IF EXISTS orcamento_revisoes_tipo_check;
ALTER TABLE orcamento_revisoes ADD CONSTRAINT orcamento_revisoes_tipo_check CHECK (
  tipo IN ('valor', 'data')
  AND (tipo = 'valor' OR (nova_data_checkin IS NOT NULL AND novo_turno IN ('manha', 'tarde')))
);

-- historico da agenda: as novas acoes
ALTER TABLE agenda_historico DROP CONSTRAINT IF EXISTS agenda_historico_acao_check;
ALTER TABLE agenda_historico ADD CONSTRAINT agenda_historico_acao_check CHECK (acao IN (
  'checkin', 'checkin_antecipado', 'atribuido', 'etapa', 'entregue', 'retirado_revisao_recusada', 'elevador', 'posto_reserva', 'reagendado',
  'data_mudada', 'data_proposta_aceita', 'cancelado_oficina'
));

-- orcamentos recusados AUTOMATICAMENTE quando o cliente aceitou outro (so esses voltam
-- se a oficina escolhida cancelar; o que o proprio cliente recusou continua recusado -
-- auditoria 07/11, M2)
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS recusado_no_aceite boolean NOT NULL DEFAULT false;
