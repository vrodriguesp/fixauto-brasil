-- 096: fotos do pedido depois do envio (lote 0 endurecimento + lote A; auditoria Fable 18/11,
-- Documentos/Analises/Fotos_e_anexos_2026-11-18). Decisoes do dono 18/11: so em aberta/em_orcamento,
-- ate 10 fotos por pedido, o motorista apaga so as que adicionou, aviso as oficinas so no painel + push.
-- 1. solicitacao_fotos: origem (criacao / adicionada), bytes, largura, altura.
-- 2. RLS: o cliente so insere (tabela e storage solicitacoes/<id>/) com o pedido aberta/em_orcamento -
--    segunda barreira; a tela usa a rota do servidor, que reencoda a foto (sem EXIF/GPS) e aplica os limites.
-- 3. Bucket damage-photos: limite de tamanho e tipos (antes: nenhum).

ALTER TABLE solicitacao_fotos ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'criacao';
ALTER TABLE solicitacao_fotos DROP CONSTRAINT IF EXISTS solicitacao_fotos_origem_check;
ALTER TABLE solicitacao_fotos ADD CONSTRAINT solicitacao_fotos_origem_check CHECK (origem IN ('criacao', 'adicionada'));
ALTER TABLE solicitacao_fotos ADD COLUMN IF NOT EXISTS bytes integer;
ALTER TABLE solicitacao_fotos ADD COLUMN IF NOT EXISTS largura integer;
ALTER TABLE solicitacao_fotos ADD COLUMN IF NOT EXISTS altura integer;
CREATE INDEX IF NOT EXISTS solicitacao_fotos_sol_origem_idx ON solicitacao_fotos (solicitacao_id, origem, created_at);

-- tabela: dono do pedido, e so com o pedido aberto (001 deixava em qualquer status)
DROP POLICY IF EXISTS fotos_insert ON solicitacao_fotos;
CREATE POLICY fotos_insert ON solicitacao_fotos FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM solicitacoes s WHERE s.id = solicitacao_id AND s.cliente_id = auth.uid() AND s.status IN ('aberta', 'em_orcamento'))
);

-- storage: mesma regra no ramo solicitacoes/ (o resto da politica 043 nao muda)
DROP POLICY IF EXISTS privado_insert ON storage.objects;
CREATE POLICY privado_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'damage-photos' AND (
    ((storage.foldername(name))[1] = 'solicitacoes' AND EXISTS (
      SELECT 1 FROM solicitacoes s WHERE s.id = uuid_ou_nulo((storage.foldername(name))[2]) AND s.cliente_id = auth.uid()
        AND s.status IN ('aberta', 'em_orcamento')
    ))
    OR ((storage.foldername(name))[1] = 'audio'
        AND pode_escrever_conversa_v2(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3]), uuid_ou_nulo((storage.foldername(name))[4])))
    OR ((storage.foldername(name))[1] = 'orcamentos'
        AND uuid_ou_nulo((storage.foldername(name))[3]) IN (SELECT minhas_oficinas())
        AND pode_ver_solicitacao(uuid_ou_nulo((storage.foldername(name))[2])))
    OR ((storage.foldername(name))[1] = 'pecas-mensagens'
        AND participa_cotacao_peca(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3])))
  )
);

-- bucket: 15 MB por objeto; imagens, audio (site webm/mp4, app mp4) e PDF (anexo de orcamento).
-- Curinga para nao recusar variantes ("audio/webm;codecs=opus" do navegador, "image/jpg" de alguns Android).
UPDATE storage.buckets SET file_size_limit = 15728640,
  allowed_mime_types = ARRAY['image/*', 'audio/*', 'application/pdf']
WHERE id = 'damage-photos';
