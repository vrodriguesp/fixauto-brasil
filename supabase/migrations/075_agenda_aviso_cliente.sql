-- 075: e-mail de agendamento para o cliente com o evento de calendario (dono 07/11).
-- Guarda qual horario ja foi avisado e a versao do evento (.ics): se o horario
-- mudar, o cliente recebe outro e-mail e o mesmo evento e ATUALIZADO no
-- calendario (mesmo UID, SEQUENCE maior), sem duplicar.
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS aviso_cliente_inicio timestamptz;
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS aviso_cliente_seq integer NOT NULL DEFAULT 0;
