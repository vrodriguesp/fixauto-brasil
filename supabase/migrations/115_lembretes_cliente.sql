-- 115: lembretes por e-mail ao MOTORISTA (decisoes do dono 21-22/11; Documentos/Analises/Lembretes_2026-11-23,
--      plano em Documentos/Analises/Lembretes_datas_parcelas_2026-11-21/Plano.md secoes A.3/A.4/A.6).
--  - so ao motorista (nada as oficinas); o e-mail "chegou orcamento" continua igual (1 por orcamento);
--  - no maximo UM e-mail por TIPO por pedido, cada um junta todos os orcamentos pendentes do pedido:
--      nao_decidiu (D+1 do 1.o orcamento) | vencem (~48 h antes de o 1.o orcamento deixar de poder ser aceito)
--      | venceram (todos os orcamentos pendentes venceram, pedido aberto) | checkin (vespera do check-in agendado);
--  - no maximo UM SMS de lembrete por pedido (so quem marcou "quero SMS"), registrado aqui e em sms_envios;
--  - lembretes_cliente e o registro + a trava: o indice unico (pedido, tipo, canal) impede o cron de hora em hora
--    de mandar duas vezes, mesmo com duas passadas ao mesmo tempo;
--  - token_hash: o link "parar lembretes" de cada e-mail (bipfix.com/r/<n>?s=<token>, sem login) aponta para a
--    linha; so o hash fica no banco;
--  - solicitacoes.lembretes_pausados_em: o motorista parou os lembretes deste pedido (null = ligados);
--  - plataforma_config.lembretes_cliente_ativo (interruptor do admin/psql) e lembretes_cliente_desde: so pedidos
--    cujo 1.o orcamento (ou agendamento, para a vespera) e POSTERIOR a esta hora entram - sem rajada de e-mails a
--    pedidos antigos no dia do deploy (o default now() grava a hora em que a migracao rodou).
--
-- Aditiva e idempotente (pode rodar 2x). Transacao unica: psql -1 -v ON_ERROR_STOP=1 -f 115_lembretes_cliente.sql
-- Segura ANTES do build: o codigo no ar nao le nada disto.
--
-- Rollback (so depois de voltar o codigo):
--   DROP TABLE IF EXISTS lembretes_cliente;
--   ALTER TABLE solicitacoes DROP COLUMN IF EXISTS lembretes_pausados_em;
--   ALTER TABLE plataforma_config DROP COLUMN IF EXISTS lembretes_cliente_ativo, DROP COLUMN IF EXISTS lembretes_cliente_desde;
--   ALTER TABLE sms_envios DROP CONSTRAINT IF EXISTS sms_envios_tipo_check;
--   ALTER TABLE sms_envios ADD CONSTRAINT sms_envios_tipo_check CHECK (tipo IN ('orcamento_auto', 'manual', 'oficina_manual'));
--   NOTIFY pgrst, 'reload schema';
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS lembretes_pausados_em timestamptz;

ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS lembretes_cliente_ativo boolean NOT NULL DEFAULT true;
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS lembretes_cliente_desde timestamptz DEFAULT now();
-- linha ja existente que por algum motivo ficou sem data: nada antigo entra
UPDATE plataforma_config SET lembretes_cliente_desde = now() WHERE lembretes_cliente_desde IS NULL;

CREATE TABLE IF NOT EXISTS lembretes_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  canal text NOT NULL,
  -- enviando = reservado (envio em curso); enviado; falhou (Resend/Twilio recusou; o e-mail tenta de novo ate 3x);
  -- pulado = decidido nao mandar (conta de teste, sem e-mail, coberto por outro lembrete, vespera tarde demais...)
  status text NOT NULL DEFAULT 'enviando',
  motivo text,
  tentativas smallint NOT NULL DEFAULT 1,
  -- orcamentos que o e-mail listou
  orcamento_ids uuid[] NOT NULL DEFAULT '{}',
  token_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  CONSTRAINT lembretes_cliente_tipo_check CHECK (tipo IN ('nao_decidiu', 'vencem', 'venceram', 'checkin')),
  CONSTRAINT lembretes_cliente_canal_check CHECK (canal IN ('email', 'sms')),
  CONSTRAINT lembretes_cliente_status_check CHECK (status IN ('enviando', 'enviado', 'falhou', 'pulado'))
);
-- a trava: um por tipo e canal por pedido; e um SMS de lembrete por pedido no total
CREATE UNIQUE INDEX IF NOT EXISTS lembretes_cliente_unico ON lembretes_cliente (solicitacao_id, tipo, canal);
CREATE UNIQUE INDEX IF NOT EXISTS lembretes_cliente_um_sms ON lembretes_cliente (solicitacao_id) WHERE canal = 'sms';
CREATE UNIQUE INDEX IF NOT EXISTS lembretes_cliente_token ON lembretes_cliente (token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS lembretes_cliente_criado_idx ON lembretes_cliente (created_at DESC);

-- so o servidor (chave de servico) le e grava; ninguem pelo app/site com a chave publica
ALTER TABLE lembretes_cliente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lembretes_cliente FROM anon, authenticated;

-- SMS de lembrete ao motorista entra no registro geral dos SMS (o admin ve na mesma lista)
ALTER TABLE sms_envios DROP CONSTRAINT IF EXISTS sms_envios_tipo_check;
ALTER TABLE sms_envios ADD CONSTRAINT sms_envios_tipo_check
  CHECK (tipo IN ('orcamento_auto', 'manual', 'oficina_manual', 'lembrete_cliente'));

NOTIFY pgrst, 'reload schema';
COMMIT;
