-- Pedido sem senha (dono 12/11; Documentos/Analises/Revisao_Fable_pedido_sem_senha_2026-11-12.md).
-- O ultimo passo do pedido pede so nome, e-mail e telefone: o codigo de 6 digitos
-- prova o e-mail, manda o pedido as oficinas E entra na conta. A senha vira uma
-- conveniencia que a pessoa cria depois (tela "crie a sua senha", que pode pular).
-- Tres pecas novas:
--   1. profiles.senha_definida  - marca quem ainda nao tem senha (a tela de criar
--      senha aparece a cada login ate existir uma);
--   2. codigos_login            - "receber um codigo por e-mail" na tela de login
--      (site e app), para contas com ou sem senha;
--   3. links_acesso             - link de uso unico dos e-mails de orcamento
--      ("Ver orcamento"): abrir nao faz nada, o toque no botao entra na conta.

-- 1) ainda sem senha? Quem ja existe tem senha (cadastro, convite, acidente);
--    conta criada pelo pedido sem senha entra com false (lib/pedido-sem-conta.ts).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS senha_definida boolean NOT NULL DEFAULT true;

-- Qualquer caminho que grave uma senha (criar-senha, reset-password, definir-senha,
-- app) passa pelo auth.users: o servidor marca aqui, sem depender da tela.
-- O GoTrue guarda um hash mesmo para conta sem senha, por isso a marca nao pode
-- ser derivada da coluna - so a MUDANCA do hash diz que uma senha foi escolhida.
CREATE OR REPLACE FUNCTION public.marcar_senha_definida() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.profiles SET senha_definida = true WHERE id = NEW.id AND senha_definida = false;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_senha_definida() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_marcar_senha_definida ON auth.users;
CREATE TRIGGER trg_marcar_senha_definida
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  WHEN (OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password)
  EXECUTE FUNCTION public.marcar_senha_definida();

-- 2) Codigo de login por e-mail (tela de login). Mesmas regras do codigo do pedido:
--    so o hash, 5 tentativas contadas no banco, validade curta. E-mail SEM conta
--    tambem ganha uma linha (user_id nulo, codigo nunca enviado): a resposta e
--    igual para todo mundo, nao revela quais e-mails tem conta.
CREATE TABLE IF NOT EXISTS codigos_login (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  codigo_hash text NOT NULL,
  tentativas int NOT NULL DEFAULT 0,
  expira_em timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS codigos_login_expira_idx ON codigos_login (expira_em);
ALTER TABLE codigos_login ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION codigo_login_tentativa(p_id uuid, p_max int) RETURNS TABLE (user_id uuid, email text, codigo_hash text, tentativas int, expira_em timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE codigos_login c SET tentativas = c.tentativas + 1
  WHERE c.id = p_id AND c.tentativas < p_max
  RETURNING c.user_id, c.email, c.codigo_hash, c.tentativas, c.expira_em;
$$;
REVOKE ALL ON FUNCTION codigo_login_tentativa(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION codigo_login_tentativa(uuid, int) TO service_role;

-- 3) Link de acesso dos e-mails do pedido (orcamento novo, agendamento, novas datas,
--    cancelamento): token de 256 bits gerado por e-mail, so o hash aqui, preso ao
--    usuario e ao pedido, 7 dias, uso unico. Abrir o link nao gasta o token (leitores
--    automaticos de e-mail abrem links); so o toque em "Ver orcamento" (POST) gasta.
CREATE TABLE IF NOT EXISTS links_acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expira_em timestamptz NOT NULL,
  usado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS links_acesso_expira_idx ON links_acesso (expira_em);
ALTER TABLE links_acesso ENABLE ROW LEVEL SECURITY;

-- Gasta o token num passo so (dois toques ao mesmo tempo entram uma vez): devolve
-- a linha se ainda valia; nada se ja usado, vencido ou inexistente.
CREATE OR REPLACE FUNCTION link_acesso_usar(p_hash text) RETURNS TABLE (user_id uuid, solicitacao_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE links_acesso l SET usado_em = now()
  WHERE l.token_hash = p_hash AND l.usado_em IS NULL AND l.expira_em > now()
  RETURNING l.user_id, l.solicitacao_id;
$$;
REVOKE ALL ON FUNCTION link_acesso_usar(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION link_acesso_usar(text) TO service_role;
