-- Migration 015: Captura de erros client-side pro dashboard de monitoramento
CREATE TABLE IF NOT EXISTS app_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem TEXT NOT NULL,
  stack TEXT,
  url TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_errors_created_at ON app_errors(created_at DESC);

ALTER TABLE app_errors ENABLE ROW LEVEL SECURITY;
-- No client policies: only the service role (via /api/log-error and the
-- admin monitoring route) reads/writes this table.
