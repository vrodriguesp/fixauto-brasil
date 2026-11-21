-- 113: botao "Pedir peca" na pagina do pedido do motorista com interruptor proprio e minimo de lojas
-- (aprovado pelo dono 21/11). Mapa: Documentos/Analises/Pecas_botao_pedido_2026-11-21/Mapa.md.
-- O botao so aparece quando: pecas v3 vale para a pessoa (global OU conta de teste) E (conta de teste OU
-- pecas_botao_pedido_ativo) E as lojas de pecas que seriam avisadas (ativas, mesmo pais, mesma paridade
-- teste/real) >= pecas_botao_min_lojas. Regra em apps/web/src/lib/pecas-botao-pedido.ts.
-- Aditiva e idempotente (pode rodar 2x). Transacao unica: psql -1 -v ON_ERROR_STOP=1 -f 113_pecas_botao_pedido.sql
-- Segura ANTES do build: o codigo no ar nao le as colunas novas. Sem as colunas, o codigo novo trata o
-- interruptor como desligado e o minimo como 3 (contas de teste continuam vendo o botao com >= 3 lojas de teste).
--
-- Rollback (so depois de voltar o codigo):
--   ALTER TABLE plataforma_config DROP CONSTRAINT IF EXISTS plataforma_config_pecas_botao_min_lojas_check;
--   ALTER TABLE plataforma_config DROP COLUMN IF EXISTS pecas_botao_pedido_ativo, DROP COLUMN IF EXISTS pecas_botao_min_lojas;
--   NOTIFY pgrst, 'reload schema';
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---------- interruptor proprio (padrao desligado) e minimo de lojas (padrao 3) ----------
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS pecas_botao_pedido_ativo boolean NOT NULL DEFAULT false;
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS pecas_botao_min_lojas integer NOT NULL DEFAULT 3;

-- 0 a 50 (o admin grava so nessa faixa; o CHECK segura gravacao direta)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plataforma_config_pecas_botao_min_lojas_check') THEN
    ALTER TABLE plataforma_config ADD CONSTRAINT plataforma_config_pecas_botao_min_lojas_check
      CHECK (pecas_botao_min_lojas >= 0 AND pecas_botao_min_lojas <= 50);
  END IF;
END $$;

COMMENT ON COLUMN plataforma_config.pecas_botao_pedido_ativo IS 'Botao "Pedir peca" no pedido do motorista para contas reais (113). Exige pecas v3 e o minimo de lojas.';
COMMENT ON COLUMN plataforma_config.pecas_botao_min_lojas IS 'Minimo de lojas de pecas avisaveis (ativas, mesmo pais, paridade teste/real) para o botao aparecer (113). 0 a 50.';

NOTIFY pgrst, 'reload schema';
COMMIT;
