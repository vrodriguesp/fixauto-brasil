-- Chat de suporte (dono 03/11): oficina, loja, cliente ou visitante sem conta
-- falam direto com o admin por um botao no canto do site. Visitante sem conta
-- se identifica com nome + e-mail e acessa a conversa por uma chave secreta
-- guardada no navegador (aqui so o sha256 dela). Traducao automatica (DeepL)
-- ligada/desligada pelo admin. Tudo passa pelas rotas /api/suporte e
-- /api/admin/suporte (service role): RLS ligado, sem politica para o publico.

CREATE TABLE IF NOT EXISTS suporte_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  visitante_nome text,
  visitante_email text,
  token_hash text,
  idioma text NOT NULL DEFAULT 'et',
  pagina text,
  ultima_mensagem_em timestamptz NOT NULL DEFAULT now(),
  nao_lidas_admin integer NOT NULL DEFAULT 0,
  nao_lidas_usuario integer NOT NULL DEFAULT 0,
  usuario_visto_em timestamptz,
  admin_avisado_em timestamptz,
  usuario_avisado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (profile_id IS NOT NULL OR (visitante_email IS NOT NULL AND token_hash IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS suporte_conversas_profile ON suporte_conversas (profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS suporte_conversas_ultima ON suporte_conversas (ultima_mensagem_em DESC);

CREATE TABLE IF NOT EXISTS suporte_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid NOT NULL REFERENCES suporte_conversas(id) ON DELETE CASCADE,
  autor text NOT NULL CHECK (autor IN ('usuario', 'admin', 'auto')),
  texto text NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 2000),
  -- traducao para quem le do outro lado (NULL = sem traducao: mesma lingua ou desligada)
  traducao text,
  origem text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suporte_mensagens_conversa ON suporte_mensagens (conversa_id, created_at);

ALTER TABLE suporte_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE suporte_mensagens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON suporte_conversas, suporte_mensagens FROM anon, authenticated;

-- interruptor da traducao e "admin online" (visto pela ultima vez com o admin aberto)
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS suporte_traducao boolean NOT NULL DEFAULT true;
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS admin_visto_em timestamptz;
