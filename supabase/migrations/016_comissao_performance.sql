-- Migration 016: completa o sistema de comissao por performance/fidelidade
-- (o frontend em oficina/comissao/page.tsx ja esperava essas colunas, mas
-- elas nunca tinham sido criadas - a pagina sempre mostrava dado incompleto)
ALTER TABLE comissao_config ADD COLUMN IF NOT EXISTS taxa_calculada DECIMAL(5,4) NOT NULL DEFAULT 0.15;
ALTER TABLE comissao_config ADD COLUMN IF NOT EXISTS media_tempo_resposta_horas DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE comissao_config ADD COLUMN IF NOT EXISTS media_revisoes_orcamento DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE comissao_config ADD COLUMN IF NOT EXISTS media_avaliacao_clientes DECIMAL(3,2) NOT NULL DEFAULT 0;
ALTER TABLE comissao_config ADD COLUMN IF NOT EXISTS total_servicos_concluidos INTEGER NOT NULL DEFAULT 0;
