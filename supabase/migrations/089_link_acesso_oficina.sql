-- Link de acesso direto das OFICINAS pelos e-mails de pedido (dono 16/11: oficina
-- clicou no link do e-mail, caiu no login e saiu). Reaproveita o link de uso unico
-- dos clientes (080): token de 256 bits, so o hash, uso unico, nada ao abrir.
-- Para a oficina: 72 h, preso ao dono da oficina (user_id), a oficina e ao pedido.
-- "Nao tenho interesse" pelo e-mail grava pedido_dispensas com origem 'email'.
-- Aditiva e idempotente; aplicar com psql -v ON_ERROR_STOP=1 -1 antes do restart.

ALTER TABLE links_acesso ADD COLUMN IF NOT EXISTS oficina_id uuid REFERENCES oficinas(id) ON DELETE CASCADE;
ALTER TABLE links_acesso ADD COLUMN IF NOT EXISTS finalidade text NOT NULL DEFAULT 'cliente';
ALTER TABLE links_acesso ADD COLUMN IF NOT EXISTS visto_em timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'links_acesso_finalidade_check') THEN
    ALTER TABLE links_acesso ADD CONSTRAINT links_acesso_finalidade_check CHECK (finalidade IN ('cliente', 'oficina'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'links_acesso_finalidade_coerente') THEN
    ALTER TABLE links_acesso ADD CONSTRAINT links_acesso_finalidade_coerente
      CHECK ((finalidade = 'cliente' AND oficina_id IS NULL) OR (finalidade = 'oficina' AND oficina_id IS NOT NULL));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS links_acesso_oficina_idx ON links_acesso (oficina_id, solicitacao_id);

-- o tipo de retorno muda: o Postgres nao deixa trocar com OR REPLACE (42P13)
DROP FUNCTION IF EXISTS link_acesso_usar(text);
CREATE FUNCTION link_acesso_usar(p_hash text) RETURNS TABLE (user_id uuid, solicitacao_id uuid, oficina_id uuid, finalidade text)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE links_acesso l SET usado_em = now()
  WHERE l.token_hash = p_hash AND l.usado_em IS NULL AND l.expira_em > now()
  RETURNING l.user_id, l.solicitacao_id, l.oficina_id, l.finalidade;
$$;
REVOKE ALL ON FUNCTION link_acesso_usar(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION link_acesso_usar(text) TO service_role;

-- de onde veio o "nao tenho interesse": painel da oficina ou link do e-mail
ALTER TABLE pedido_dispensas ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'painel';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_dispensas_origem_check') THEN
    ALTER TABLE pedido_dispensas ADD CONSTRAINT pedido_dispensas_origem_check CHECK (origem IN ('painel', 'email'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
