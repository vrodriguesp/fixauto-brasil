-- 077: mudanca de data unificada (dono 08/11). Toda mudanca de data feita pela oficina
-- (pelo orcamento aceito OU pela agenda) passa pela mesma proposta (orcamento_revisoes,
-- tipo 'data'):
--  - "pedir ao cliente": fica pendente ate o cliente responder;
--  - "ja combinei com o cliente": vale na hora; o cliente recebe aviso com "nao combinei
--    isso", que desfaz a mudanca e volta a proposta para pendente;
--  - a oficina diz se a data atual ainda serve: se nao, o cliente nao ve "manter";
--  - mudanca no MESMO dia so com "ja combinei";
--  - lembrete ao cliente (24 h sem resposta) e aos dois na vespera se nao confirmado.
ALTER TABLE orcamento_revisoes ADD COLUMN IF NOT EXISTS nova_hora text;                 -- HH:MM (agenda); sem ela, o turno
ALTER TABLE orcamento_revisoes ADD COLUMN IF NOT EXISTS data_atual_serve boolean;       -- null = proposta antiga (antes de 077)
ALTER TABLE orcamento_revisoes ADD COLUMN IF NOT EXISTS combinado boolean NOT NULL DEFAULT false;
ALTER TABLE orcamento_revisoes ADD COLUMN IF NOT EXISTS data_anterior timestamptz;      -- inicio da agenda antes da mudanca
ALTER TABLE orcamento_revisoes ADD COLUMN IF NOT EXISTS fim_anterior timestamptz;       -- fim previsto antes da mudanca
ALTER TABLE orcamento_revisoes ADD COLUMN IF NOT EXISTS contestada_em timestamptz;      -- cliente tocou "nao combinei isso"
ALTER TABLE orcamento_revisoes ADD COLUMN IF NOT EXISTS lembrete_cliente_em timestamptz;
ALTER TABLE orcamento_revisoes ADD COLUMN IF NOT EXISTS vespera_avisado_em timestamptz;

ALTER TABLE orcamento_revisoes DROP CONSTRAINT IF EXISTS orcamento_revisoes_tipo_check;
ALTER TABLE orcamento_revisoes ADD CONSTRAINT orcamento_revisoes_tipo_check CHECK (
  tipo IN ('valor', 'data')
  AND (tipo = 'valor' OR (nova_data_checkin IS NOT NULL AND (novo_turno IN ('manha', 'tarde') OR nova_hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')))
);

-- historico da agenda: mudanca combinada, contestada pelo cliente, cancelada pelo cliente
ALTER TABLE agenda_historico DROP CONSTRAINT IF EXISTS agenda_historico_acao_check;
ALTER TABLE agenda_historico ADD CONSTRAINT agenda_historico_acao_check CHECK (acao IN (
  'checkin', 'checkin_antecipado', 'atribuido', 'etapa', 'entregue', 'retirado_revisao_recusada', 'elevador', 'posto_reserva', 'reagendado',
  'data_mudada', 'data_proposta_aceita', 'cancelado_oficina',
  'data_combinada', 'data_contestada', 'cancelado_cliente'
));

-- lembretes: propostas de data pendentes
CREATE INDEX IF NOT EXISTS orcamento_revisoes_data_pendente_idx ON orcamento_revisoes (created_at) WHERE tipo = 'data' AND status = 'pendente';
