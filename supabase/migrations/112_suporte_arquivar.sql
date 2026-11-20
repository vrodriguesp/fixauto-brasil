-- Suporte: arquivar / excluir conversa vazia (dono 20/11: "adicionei sem querer a oficina
-- e nao posso remover da minha tela do suporte"; recomendacao Fable em
-- Documentos/Analises/Suporte_conversas_2026-11-20/Fable_recomendacao.md).
--  - arquivada_em: some da lista "Ativas" do admin, os dados ficam; volta sozinha quando a
--    pessoa escreve, quando o admin responde ou quando o admin "inicia" de novo com a conta.
--  - suporte_excluir_vazia(id): apaga a conversa SO se nao tiver nenhuma mensagem (de qualquer
--    autor). FOR UPDATE na conversa conflita com o FOR KEY SHARE da FK de uma mensagem sendo
--    gravada ao mesmo tempo: ou a mensagem entra antes (-> false) ou a conversa sai antes (a
--    gravacao falha pela FK e a pessoa tenta de novo). Nunca apaga mensagem.
-- Aditiva e idempotente: pode ser aplicada antes do build (o codigo atual ignora a coluna).

ALTER TABLE suporte_conversas ADD COLUMN IF NOT EXISTS arquivada_em timestamptz;
CREATE INDEX IF NOT EXISTS suporte_conversas_ativas ON suporte_conversas (ultima_mensagem_em DESC) WHERE arquivada_em IS NULL;

CREATE OR REPLACE FUNCTION suporte_excluir_vazia(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM suporte_conversas WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM suporte_mensagens WHERE conversa_id = p_id) THEN RETURN false; END IF;
  DELETE FROM suporte_conversas WHERE id = p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION suporte_excluir_vazia(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION suporte_excluir_vazia(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
