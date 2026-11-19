-- 106: editor da pagina do Shop (pecas lote 5, pedido do dono 19/11 noite: "allow me to edit the shop page and make it nice").
-- Mapa: Documentos/Analises/Pecas_lote5_2026-11-20/Mapa_lote5.md sec. 8.
-- Versoes do conteudo (textos por idioma, banner, destaques, blocos, SEO): rascunho -> publicada; historico.
-- So o admin le e grava (RLS eh_admin); anon e demais contas: nada. O Shop le a versao publicada pelo servidor.
-- Imagens: bucket PRIVADO 'shop-pagina' SEM politica em storage.objects -> so o servidor (service role) grava e assina;
-- a rota /api/pecas/shop-imagem so entrega com o Shop valendo para a pessoa (interruptor ou conta de teste) ou ao admin.
-- Aditiva e idempotente; transacao unica: psql -1 -v ON_ERROR_STOP=1 -f 106_shop_pagina_editor.sql. Segura ANTES do build.
--
-- Rollback (depois de voltar o codigo): DROP TABLE IF EXISTS shop_pagina_versoes;
--   DELETE FROM storage.objects WHERE bucket_id = 'shop-pagina'; DELETE FROM storage.buckets WHERE id = 'shop-pagina';
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS shop_pagina_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estado text NOT NULL DEFAULT 'rascunho',
  conteudo jsonb NOT NULL DEFAULT '{}'::jsonb,
  nota text,
  criado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  publicado_em timestamptz,
  CONSTRAINT shop_pagina_versoes_check CHECK (
    estado IN ('rascunho', 'publicada', 'arquivada')
    AND jsonb_typeof(conteudo) = 'object'
    AND octet_length(conteudo::text) <= 200000
    AND (nota IS NULL OR char_length(nota) <= 200)
  )
);
-- no maximo UMA publicada (publicar arquiva a anterior antes; dois publicar ao mesmo tempo: o 2o falha e a rota devolve erro)
CREATE UNIQUE INDEX IF NOT EXISTS shop_pagina_uma_publicada ON shop_pagina_versoes ((estado)) WHERE estado = 'publicada';
CREATE INDEX IF NOT EXISTS idx_shop_pagina_versoes_estado ON shop_pagina_versoes (estado, criado_em DESC);

ALTER TABLE shop_pagina_versoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shop_pagina_versoes FROM anon;
DROP POLICY IF EXISTS shop_pagina_versoes_admin ON shop_pagina_versoes;
CREATE POLICY shop_pagina_versoes_admin ON shop_pagina_versoes FOR ALL TO authenticated
  USING ((SELECT eh_admin())) WITH CHECK ((SELECT eh_admin()));

-- bucket privado (5 MB por objeto depois de tratado; so JPEG - o servidor re-codifica e tira o EXIF)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('shop-pagina', 'shop-pagina', false, 5242880, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg'];

NOTIFY pgrst, 'reload schema';
COMMIT;
