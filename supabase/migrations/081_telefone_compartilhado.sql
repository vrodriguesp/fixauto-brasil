-- 081: telefone que o motorista envia a UMA oficina antes do aceite (dono 13/11).
-- No pedido o celular so vai com "quero SMS"; quando uma oficina precisa ligar
-- (duvida sobre o carro), o motorista toca "enviar meu numero" no orcamento dela.
-- O numero fica registrado aqui para a oficina ter a mao na pagina do pedido (sem
-- procurar na conversa) e tambem vai como mensagem na conversa. So aquela oficina
-- (a equipe dela), o proprio motorista e o admin leem; as outras oficinas nao.
-- Escrita so pelo servidor (api/solicitacoes/[id]/compartilhar-telefone), que confere
-- que o pedido e do motorista e que a oficina mandou orcamento nele.

CREATE TABLE IF NOT EXISTS telefone_compartilhado (
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  oficina_id uuid NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  telefone text NOT NULL CHECK (char_length(telefone) BETWEEN 6 AND 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (solicitacao_id, oficina_id)
);
CREATE INDEX IF NOT EXISTS telefone_compartilhado_oficina_idx ON telefone_compartilhado (oficina_id);

ALTER TABLE telefone_compartilhado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON telefone_compartilhado FROM anon, authenticated;
GRANT SELECT ON telefone_compartilhado TO authenticated;
DROP POLICY IF EXISTS telefone_compartilhado_select ON telefone_compartilhado;
CREATE POLICY telefone_compartilhado_select ON telefone_compartilhado FOR SELECT TO authenticated USING (
  cliente_id = auth.uid()
  OR oficina_id IN (SELECT minhas_oficinas())
  OR eh_admin()
);
