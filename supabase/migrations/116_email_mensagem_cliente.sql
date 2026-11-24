-- 116: e-mail ao MOTORISTA quando a OFICINA escreve no chat do pedido (dono 24/11; lib/email-mensagem-oficina.ts).
--  - so oficina -> motorista (motorista -> oficina continua so com o sino/push);
--  - emails_mensagem_cliente e a trava anti-spam: uma linha por conversa (pedido + oficina + quem recebe) com a hora
--    do ultimo e-mail. O servidor grava com INSERT (1.a vez; a chave primaria barra o segundo ao mesmo tempo) ou com
--    UPDATE ... WHERE ultimo_em < agora - 3 h (HORAS_ENTRE_EMAILS_MENSAGEM): duas mensagens juntas nunca mandam 2
--    e-mails. Envio que falhou apaga a linha (a proxima mensagem tenta de novo).
--  - sem o texto da mensagem: a tabela nao guarda nada da conversa.
--
-- Aditiva e idempotente (pode rodar 2x). Transacao unica: psql -1 -v ON_ERROR_STOP=1 -f 116_email_mensagem_cliente.sql
-- Segura ANTES do build: o codigo no ar nao le nada disto. Codigo novo SEM esta migracao: a reserva falha, o erro vai
-- ao log e nenhum e-mail sai (o chat e o sino seguem iguais).
--
-- Rollback (so depois de voltar o codigo):
--   DROP TABLE IF EXISTS emails_mensagem_cliente;
--   NOTIFY pgrst, 'reload schema';
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS emails_mensagem_cliente (
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  oficina_id uuid NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ultimo_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (solicitacao_id, oficina_id, profile_id)
);
CREATE INDEX IF NOT EXISTS emails_mensagem_cliente_profile_idx ON emails_mensagem_cliente (profile_id);
CREATE INDEX IF NOT EXISTS emails_mensagem_cliente_oficina_idx ON emails_mensagem_cliente (oficina_id);

-- so o servidor (chave de servico) le e grava; ninguem pelo app/site com a chave publica
ALTER TABLE emails_mensagem_cliente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON emails_mensagem_cliente FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
