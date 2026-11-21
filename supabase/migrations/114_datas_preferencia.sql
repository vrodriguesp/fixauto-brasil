-- 114: "Preciso de outra data" sempre visivel, preferencia de horario do motorista e motivo da recusa
-- (decisoes do dono 21/11; Documentos/Analises/Lembretes_datas_parcelas_2026-11-21/Plano.md, secao B;
--  Documentos/Analises/Datas_preferencia_2026-11-21/Relatorio.md). A 115 fica reservada aos lembretes.
--
--  (4) orcamento_pedido_datas (079) passa a aceitar o pedido com datas ainda validas (motivo 'nao_sobe'),
--      o modo "dias da semana x parte do dia" (tipo 'padrao', coluna padrao) e a janela de 2 h nas sugestoes
--      (dentro do proprio jsonb sugestoes: {data, turno, janela:{inicio,fim}}); a oficina pode responder
--      "nao posso" (resposta 'nao_pode' + resposta_texto); pendente sem resposta em 72 h cai com
--      cancelado_motivo 'sem_resposta_72h' e aviso ao motorista.
--  (5) solicitacoes.preferencia_horario: quando o motorista pode levar o carro (pergunta OPCIONAL depois do
--      envio; nunca trava o pedido). {dias:[1..6], partes:['manha','tarde'], opcao:'qualquer'|'urgente'|null, v:1}
--  (6) orcamentos.recusado_motivo (preco | data | distancia | resolvido | outro) + recusado_em.
--
-- Aditiva e idempotente (pode rodar 2x). Transacao unica: psql -1 -v ON_ERROR_STOP=1 -f 114_datas_preferencia.sql
-- Segura ANTES do build: o codigo no ar nao le as colunas novas (defaults mantem o comportamento de hoje).
-- App publicado: continua recusando direto (status='recusado', sem motivo) e lendo orcamento_pedido_datas
-- so com status='pendente' - nada muda para ele.
--
-- Rollback (so depois de voltar o codigo):
--   ALTER TABLE orcamento_pedido_datas DROP CONSTRAINT IF EXISTS orcamento_pedido_datas_resposta_check;
--   ALTER TABLE orcamento_pedido_datas ADD CONSTRAINT orcamento_pedido_datas_resposta_check CHECK (resposta IS NULL OR resposta IN ('confirmou','novas_datas'));
--   ALTER TABLE orcamento_pedido_datas DROP COLUMN IF EXISTS tipo, DROP COLUMN IF EXISTS padrao, DROP COLUMN IF EXISTS motivo,
--     DROP COLUMN IF EXISTS resposta_texto, DROP COLUMN IF EXISTS cancelado_motivo, DROP COLUMN IF EXISTS cancelado_em;
--   ALTER TABLE solicitacoes DROP COLUMN IF EXISTS preferencia_horario, DROP COLUMN IF EXISTS preferencia_em;
--   ALTER TABLE orcamentos DROP COLUMN IF EXISTS recusado_motivo, DROP COLUMN IF EXISTS recusado_em;
--   NOTIFY pgrst, 'reload schema';
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---------- (4) pedido de outra data ----------
-- 'datas' = sugestoes concretas (dia + turno, agora com janela de 2 h opcional) ou nenhuma; 'padrao' = dias da semana x parte do dia
ALTER TABLE orcamento_pedido_datas ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'datas';
-- {"dias":[1,2,5], "partes":["manha"]} (1 = segunda ... 6 = sabado; partes vazias = tanto faz)
ALTER TABLE orcamento_pedido_datas ADD COLUMN IF NOT EXISTS padrao jsonb;
-- por que o motorista pediu: as datas passaram (079) ou nenhuma serve (novo, dono 21/11)
ALTER TABLE orcamento_pedido_datas ADD COLUMN IF NOT EXISTS motivo text NOT NULL DEFAULT 'datas_passaram';
-- resposta "nao posso" da oficina: texto curto opcional
ALTER TABLE orcamento_pedido_datas ADD COLUMN IF NOT EXISTS resposta_texto text;
-- por que o pendente caiu (sem_resposta_72h, aceitou_original, recusou, orcamento_vencido, pedido_fechado, revisao, outra_oficina, datas_voltaram)
ALTER TABLE orcamento_pedido_datas ADD COLUMN IF NOT EXISTS cancelado_motivo text;
ALTER TABLE orcamento_pedido_datas ADD COLUMN IF NOT EXISTS cancelado_em timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamento_pedido_datas_tipo_check') THEN
    ALTER TABLE orcamento_pedido_datas ADD CONSTRAINT orcamento_pedido_datas_tipo_check CHECK (tipo IN ('datas', 'padrao'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamento_pedido_datas_motivo_check') THEN
    ALTER TABLE orcamento_pedido_datas ADD CONSTRAINT orcamento_pedido_datas_motivo_check CHECK (motivo IN ('datas_passaram', 'nao_sobe'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamento_pedido_datas_padrao_check') THEN
    ALTER TABLE orcamento_pedido_datas ADD CONSTRAINT orcamento_pedido_datas_padrao_check CHECK (padrao IS NULL OR jsonb_typeof(padrao) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamento_pedido_datas_resposta_texto_check') THEN
    ALTER TABLE orcamento_pedido_datas ADD CONSTRAINT orcamento_pedido_datas_resposta_texto_check CHECK (resposta_texto IS NULL OR char_length(resposta_texto) <= 300);
  END IF;
END $$;

-- resposta ganha 'nao_pode' (a constraint do 079 nasceu sem nome explicito: acha pelo texto e recria)
DO $$
DECLARE nome text;
BEGIN
  SELECT conname INTO nome FROM pg_constraint
   WHERE conrelid = 'orcamento_pedido_datas'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%resposta%' AND pg_get_constraintdef(oid) NOT LIKE '%resposta_texto%';
  IF nome IS NOT NULL AND nome <> 'orcamento_pedido_datas_resposta_v2_check' THEN
    EXECUTE format('ALTER TABLE orcamento_pedido_datas DROP CONSTRAINT %I', nome);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamento_pedido_datas_resposta_v2_check') THEN
    ALTER TABLE orcamento_pedido_datas ADD CONSTRAINT orcamento_pedido_datas_resposta_v2_check
      CHECK (resposta IS NULL OR resposta IN ('confirmou', 'novas_datas', 'nao_pode'));
  END IF;
END $$;

-- ---------- (5) preferencia de horario do motorista ----------
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS preferencia_horario jsonb;
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS preferencia_em timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solicitacoes_preferencia_horario_check') THEN
    ALTER TABLE solicitacoes ADD CONSTRAINT solicitacoes_preferencia_horario_check CHECK (preferencia_horario IS NULL OR jsonb_typeof(preferencia_horario) = 'object');
  END IF;
END $$;
-- RLS: nada novo. O cliente ja atualiza o proprio pedido (solicitacoes_update, 001) e a gravacao passa pela API
-- (chave de servico, validacao do formato). A oficina le o pedido como hoje (so os do raio/convidados/orcados).

-- ---------- (6) motivo da recusa ----------
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS recusado_motivo text;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS recusado_em timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentos_recusado_motivo_check') THEN
    ALTER TABLE orcamentos ADD CONSTRAINT orcamentos_recusado_motivo_check CHECK (recusado_motivo IS NULL OR recusado_motivo IN ('preco', 'data', 'distancia', 'resolvido', 'outro'));
  END IF;
END $$;
-- RLS: nada novo. O cliente ja atualiza o orcamento para recusar (policy existente); a oficina ve o proprio orcamento.

NOTIFY pgrst, 'reload schema';
COMMIT;
