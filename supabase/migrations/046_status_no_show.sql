-- Auditoria Fable 08/10 (A-01): /api/registrar-no-show grava status 'no_show',
-- que nao existia no tipo (o update falhava em silencio e o pedido ficava
-- "aceito" sem agendamento). ADD VALUE nao roda dentro de transacao: aplicar
-- este arquivo sem -1.
ALTER TYPE status_solicitacao ADD VALUE IF NOT EXISTS 'no_show';
