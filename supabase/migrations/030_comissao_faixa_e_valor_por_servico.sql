-- 030: formas de cobranca configuraveis pelo admin (2026-09-30).
-- O valor da cobranca futura so sera decidido depois do piloto; aqui o admin
-- ganha as opcoes, globais e por oficina:
--   - percentual fixo ('fixa');
--   - por desempenho DENTRO DE UMA FAIXA escolhida (min..max, ex.: 1%..5%);
--   - valor fixo por servico concluido ('por_servico'), um valor por moeda.
-- Nada disso muda a cobranca atual: o modo global continua 'isento'.

-- ---------- Regra global ----------
ALTER TABLE plataforma_config DROP CONSTRAINT IF EXISTS plataforma_config_comissao_servicos_modo_check;
ALTER TABLE plataforma_config ADD CONSTRAINT plataforma_config_comissao_servicos_modo_check
  CHECK (comissao_servicos_modo IN ('isento', 'fixa', 'desempenho', 'por_servico'));

ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS comissao_servicos_min DECIMAL(5,4) NOT NULL DEFAULT 0.01
  CHECK (comissao_servicos_min >= 0 AND comissao_servicos_min <= 0.5);
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS comissao_servicos_max DECIMAL(5,4) NOT NULL DEFAULT 0.05
  CHECK (comissao_servicos_max >= 0 AND comissao_servicos_max <= 0.5);
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS comissao_pecas_min DECIMAL(5,4) NOT NULL DEFAULT 0.01
  CHECK (comissao_pecas_min >= 0 AND comissao_pecas_min <= 0.5);
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS comissao_pecas_max DECIMAL(5,4) NOT NULL DEFAULT 0.03
  CHECK (comissao_pecas_max >= 0 AND comissao_pecas_max <= 0.5);
-- valor fixo por servico, por moeda da oficina: {"EUR": 5, "BRL": 25}
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS comissao_servicos_valor_por_moeda JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE plataforma_config DROP CONSTRAINT IF EXISTS plataforma_config_faixas_check;
ALTER TABLE plataforma_config ADD CONSTRAINT plataforma_config_faixas_check
  CHECK (comissao_servicos_min <= comissao_servicos_max AND comissao_pecas_min <= comissao_pecas_max);

-- ---------- Condicao individual da oficina ----------
-- override_tipo: 'percentual' (taxa_fixa_override) ou 'valor_fixo'
-- (valor_fixo_override, na moeda da oficina, por servico concluido)
ALTER TABLE comissao_config ADD COLUMN IF NOT EXISTS override_tipo TEXT NOT NULL DEFAULT 'percentual'
  CHECK (override_tipo IN ('percentual', 'valor_fixo'));
ALTER TABLE comissao_config ADD COLUMN IF NOT EXISTS valor_fixo_override DECIMAL(10,2)
  CHECK (valor_fixo_override IS NULL OR valor_fixo_override >= 0);
