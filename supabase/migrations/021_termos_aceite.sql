-- Registro de aceite dos Termos de Uso / Politica de Privacidade no cadastro.
-- Necessario para respaldar a exigibilidade das clausulas de comissao e
-- desligamento de parceiros (ver docs/JURIDICO_TERMOS_2026-09-08.md).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS termos_aceitos_em TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS termos_versao TEXT;
