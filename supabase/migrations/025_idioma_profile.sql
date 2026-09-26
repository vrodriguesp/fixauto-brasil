-- Idioma preferido do usuario (pt/en/et/it), capturado a partir do locale
-- da URL no momento do cadastro. Necessario pra enviar e-mails e
-- notificacoes in-app no idioma certo - antes disso, o idioma so era
-- conhecido durante a navegacao (via URL), nunca em contexto assincrono
-- (e-mail, job em background), entao todo texto assincrono saia sempre
-- em portugues, independente do idioma real do usuario.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS idioma TEXT NOT NULL DEFAULT 'pt';
