-- Traducao automatica do texto livre (pedido, orcamento, chat) para a lingua
-- de quem le (dono 03/11). Cada texto e traduzido uma vez so por lingua de
-- destino: a chave e o sha256 de "<lingua>\n<texto>". traducao NULL = o texto
-- ja estava na lingua de destino (a tela mostra o original).
-- So o servidor (service role, /api/traduzir) le e grava: RLS ligado, sem
-- politica para anon/authenticated.

CREATE TABLE IF NOT EXISTS traducoes (
  hash text PRIMARY KEY,
  alvo text NOT NULL,
  origem text,
  traducao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE traducoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON traducoes FROM anon, authenticated;
