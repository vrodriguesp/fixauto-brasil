-- Pedido sem cadastro (dono 06/11): o motorista descreve o problema, o carro e
-- o local, informa nome, e-mail e senha e recebe um CODIGO de 6 digitos no
-- e-mail. So depois do codigo certo a conta e ativada e o pedido vai para as
-- oficinas (prova que o e-mail e dele; e-mail digitado errado nao some no
-- vazio). Ate la o pedido fica aqui, invisivel para as oficinas, e e apagado
-- (junto com a conta nao ativada e as fotos) depois de 24 h sem confirmacao.
-- Site e app usam as mesmas rotas (/api/pedido-sem-conta).

CREATE TABLE IF NOT EXISTS pedidos_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- conta nova (criada sem confirmar) ou a conta que ja existia com este e-mail
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conta_nova boolean NOT NULL,
  email text NOT NULL,
  nome text NOT NULL,
  telefone text,
  idioma text,
  origem text NOT NULL DEFAULT 'site' CHECK (origem IN ('site', 'app')),
  -- o pedido ja validado (tipo, descricao, carro, local) - so vira solicitacao no codigo certo
  dados jsonb NOT NULL,
  -- caminhos no storage (damage-photos/pendentes/<id>/...)
  fotos text[] NOT NULL DEFAULT '{}',
  -- so o hash do codigo (sha256 de id + codigo)
  codigo_hash text NOT NULL,
  tentativas int NOT NULL DEFAULT 0,
  envios int NOT NULL DEFAULT 1,
  ultimo_envio_em timestamptz NOT NULL DEFAULT now(),
  termos_aceitos_em timestamptz NOT NULL,
  termos_versao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- lembrete unico ~2 h depois (dono 06/11): link de uso unico para confirmar ou
  -- cancelar sem o codigo; so o hash do link fica aqui
  lembrete_enviado_em timestamptz,
  retomar_hash text
);
ALTER TABLE pedidos_pendentes ADD COLUMN IF NOT EXISTS lembrete_enviado_em timestamptz;
ALTER TABLE pedidos_pendentes ADD COLUMN IF NOT EXISTS retomar_hash text;
CREATE INDEX IF NOT EXISTS pedidos_pendentes_email_idx ON pedidos_pendentes (lower(email));
CREATE INDEX IF NOT EXISTS pedidos_pendentes_created_idx ON pedidos_pendentes (created_at);
-- so o servidor (service role) le e grava: sem nenhuma politica para os papeis publicos
ALTER TABLE pedidos_pendentes ENABLE ROW LEVEL SECURITY;

-- Tentativa de codigo: conta ANTES de comparar, num passo so (pedidos em
-- paralelo nao passam do limite de 5). Sem linha = pedido nao existe ou esgotou.
CREATE OR REPLACE FUNCTION pendente_tentativa(p_id uuid, p_max int) RETURNS TABLE (codigo_hash text, tentativas int)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE pedidos_pendentes p SET tentativas = p.tentativas + 1
  WHERE p.id = p_id AND p.tentativas < p_max
  RETURNING p.codigo_hash, p.tentativas;
$$;
REVOKE ALL ON FUNCTION pendente_tentativa(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pendente_tentativa(uuid, int) TO service_role;

-- Contagem dos passos do pedido (onde as pessoas desistem): so numeros por dia,
-- sem IP, sem cookie, sem identificar ninguem.
CREATE TABLE IF NOT EXISTS funil_contagem (
  dia date NOT NULL,
  funil text NOT NULL,
  etapa text NOT NULL,
  total int NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, funil, etapa)
);
ALTER TABLE funil_contagem ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION funil_incrementar(p_funil text, p_etapa text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO funil_contagem (dia, funil, etapa, total)
  VALUES ((now() AT TIME ZONE 'Europe/Tallinn')::date, left(p_funil, 30), left(p_etapa, 30), 1)
  ON CONFLICT (dia, funil, etapa) DO UPDATE SET total = funil_contagem.total + 1;
$$;
REVOKE ALL ON FUNCTION funil_incrementar(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION funil_incrementar(text, text) TO service_role;
