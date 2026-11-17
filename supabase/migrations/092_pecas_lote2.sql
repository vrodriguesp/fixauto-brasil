-- 092: pecas lote 2 (17/11) - avisos que nao inundam a loja.
-- Mapa: Documentos/Analises/Pecas_lote2_2026-11-17/Mapa_lote2.md; contrato: Fable_auditoria_mapa_lote2.md
-- ("Contrato final do lote 2") e Contrato_testids_lote2.md. Aditiva: o codigo no ar (lote 1) continua
-- funcionando com o banco novo - nenhuma coluna nova tem padrao que mude o comportamento de hoje.
--
-- Atras do interruptor (plataforma_config.pecas_v3_ativo ou conta de teste), PELO DADO:
--  - urgencia NULL (sem DEFAULT) = "nao informada" = e-mail imediato de hoje, sem teto nem fila;
--    so a tela nova grava hoje/amanha/sem_pressa;
--  - oferta sem quantidade_ofertada/iva = oferta de hoje.
-- Sem interruptor (seguranca): telefone comercial da oficina so pelo DONO (antes a equipe tambem).
-- Fora do lote 2 (cortado na auditoria): solicitacao_id na cotacao, visto_em, Web Push.
--
-- ROLLBACK (se precisar; as colunas novas podem ficar, o codigo do lote 1 nao as le):
--   DROP TABLE cotacoes_pecas_dispensas, avisos_email_pecas, pecas_links_email;
--   recriar fornecedores_contato_insert/_update da 091 (ramo da oficina com minhas_oficinas());
--   NOTIFY pgrst, 'reload schema';

SET LOCAL lock_timeout = '5s';

-- ---------- cotacao: urgencia (sem DEFAULT: a tela de hoje grava NULL = imediato) ----------
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS urgencia text;
ALTER TABLE cotacoes_pecas DROP CONSTRAINT IF EXISTS cotacoes_pecas_urgencia_check;
ALTER TABLE cotacoes_pecas ADD CONSTRAINT cotacoes_pecas_urgencia_check
  CHECK (urgencia IS NULL OR urgencia IN ('hoje', 'amanha', 'sem_pressa'));

-- ---------- oferta: quantidade ofertada e IVA (retrato do perfil do fornecedor na hora da oferta) ----------
ALTER TABLE cotacoes_pecas_respostas ADD COLUMN IF NOT EXISTS quantidade_ofertada numeric(10,2);
ALTER TABLE cotacoes_pecas_respostas ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2);
ALTER TABLE cotacoes_pecas_respostas ADD COLUMN IF NOT EXISTS iva_modo text;
ALTER TABLE cotacoes_pecas_respostas DROP CONSTRAINT IF EXISTS respostas_quantidade_ofertada_check;
ALTER TABLE cotacoes_pecas_respostas ADD CONSTRAINT respostas_quantidade_ofertada_check
  CHECK (quantidade_ofertada IS NULL OR (quantidade_ofertada > 0 AND quantidade_ofertada <= 9999));
ALTER TABLE cotacoes_pecas_respostas DROP CONSTRAINT IF EXISTS respostas_iva_pct_check;
ALTER TABLE cotacoes_pecas_respostas ADD CONSTRAINT respostas_iva_pct_check
  CHECK (iva_pct IS NULL OR (iva_pct >= 0 AND iva_pct <= 100));
ALTER TABLE cotacoes_pecas_respostas DROP CONSTRAINT IF EXISTS respostas_iva_modo_check;
ALTER TABLE cotacoes_pecas_respostas ADD CONSTRAINT respostas_iva_modo_check
  CHECK (iva_modo IS NULL OR iva_modo IN ('registrado', 'nao_registrado', 'margem'));
-- registrado tem aliquota; nao registrado e regime de margem nao tem; sem modo, sem aliquota
ALTER TABLE cotacoes_pecas_respostas DROP CONSTRAINT IF EXISTS respostas_iva_coerente;
ALTER TABLE cotacoes_pecas_respostas ADD CONSTRAINT respostas_iva_coerente CHECK (
  (iva_modo IS NULL AND iva_pct IS NULL)
  OR (iva_modo = 'registrado' AND iva_pct IS NOT NULL)
  OR (iva_modo IN ('nao_registrado', 'margem') AND iva_pct IS NULL)
);

-- ---------- perfil fiscal do fornecedor (registro no IVA e informacao publica; dono edita pela politica de hoje) ----------
ALTER TABLE lojas_pecas ADD COLUMN IF NOT EXISTS iva_registrado boolean;
ALTER TABLE lojas_pecas ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2);
ALTER TABLE lojas_pecas ADD COLUMN IF NOT EXISTS regime_margem_usadas boolean NOT NULL DEFAULT false;
ALTER TABLE lojas_pecas DROP CONSTRAINT IF EXISTS lojas_pecas_iva_pct_check;
ALTER TABLE lojas_pecas ADD CONSTRAINT lojas_pecas_iva_pct_check CHECK (iva_pct IS NULL OR (iva_pct >= 0 AND iva_pct <= 100));
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS iva_registrado boolean;
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2);
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS regime_margem_usadas boolean NOT NULL DEFAULT false;
ALTER TABLE oficinas DROP CONSTRAINT IF EXISTS oficinas_iva_pct_check;
ALTER TABLE oficinas ADD CONSTRAINT oficinas_iva_pct_check CHECK (iva_pct IS NULL OR (iva_pct >= 0 AND iva_pct <= 100));

-- ---------- "nao tenho": o fornecedor dispensa a cotacao (painel pela RLS; e-mail pela rota do servidor) ----------
-- espelho de pedido_dispensas (070); fora do tempo real
CREATE TABLE IF NOT EXISTS cotacoes_pecas_dispensas (
  cotacao_id uuid NOT NULL REFERENCES cotacoes_pecas(id) ON DELETE CASCADE,
  fornecedor_tipo tipo_fornecedor_peca NOT NULL,
  fornecedor_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  motivo text CHECK (motivo IS NULL OR motivo IN ('sem_estoque', 'nao_trabalho', 'outro')),
  origem text NOT NULL CHECK (origem IN ('painel', 'email')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cotacao_id, fornecedor_tipo, fornecedor_id)
);
CREATE INDEX IF NOT EXISTS cotacoes_pecas_dispensas_profile_idx ON cotacoes_pecas_dispensas (profile_id);
ALTER TABLE cotacoes_pecas_dispensas ENABLE ROW LEVEL SECURITY;
-- quem dispensou le a propria; a compradora (dona/equipe) le as da sua cotacao (para contar)
DROP POLICY IF EXISTS cotacoes_pecas_dispensas_select ON cotacoes_pecas_dispensas;
CREATE POLICY cotacoes_pecas_dispensas_select ON cotacoes_pecas_dispensas FOR SELECT TO authenticated USING (
  profile_id = auth.uid()
  OR EXISTS (SELECT 1 FROM cotacoes_pecas c WHERE c.id = cotacao_id AND c.oficina_id IN (SELECT minhas_oficinas()))
);
-- grava so para o proprio fornecedor; a subconsulta em cotacoes_pecas roda COM a RLS dela (091):
-- paridade teste x real, "so lojas" e fornecedor ativo valem de graca
DROP POLICY IF EXISTS cotacoes_pecas_dispensas_insert ON cotacoes_pecas_dispensas;
CREATE POLICY cotacoes_pecas_dispensas_insert ON cotacoes_pecas_dispensas FOR INSERT TO authenticated WITH CHECK (
  profile_id = auth.uid()
  AND (
    (fornecedor_tipo = 'loja' AND fornecedor_id IN (SELECT minhas_lojas()))
    OR (fornecedor_tipo = 'oficina' AND EXISTS (
      SELECT 1 FROM oficinas o WHERE o.id = fornecedor_id AND o.profile_id = auth.uid() AND o.vende_pecas
    ))
  )
  AND EXISTS (SELECT 1 FROM cotacoes_pecas c WHERE c.id = cotacao_id)
);
DROP POLICY IF EXISTS cotacoes_pecas_dispensas_delete ON cotacoes_pecas_dispensas;
CREATE POLICY cotacoes_pecas_dispensas_delete ON cotacoes_pecas_dispensas FOR DELETE TO authenticated USING (
  profile_id = auth.uid()
);

-- ---------- log e fila dos e-mails de pecas (teto diario, resumo de 2 h); so o servidor ----------
-- uma linha por fornecedor, cotacao e rodada de aviso (reaberta = cotacoes_pecas.reaberta_vezes):
-- dentro da rodada nada sai 2 vezes; o re-aviso do "reabrir" ganha linha (e token) novos
CREATE TABLE IF NOT EXISTS avisos_email_pecas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cotacao_id uuid NOT NULL REFERENCES cotacoes_pecas(id) ON DELETE CASCADE,
  fornecedor_tipo tipo_fornecedor_peca NOT NULL,
  reaberta integer NOT NULL DEFAULT 0,
  tipo text NOT NULL CHECK (tipo IN ('imediato', 'resumo')),
  motivo text CHECK (motivo IS NULL OR motivo IN ('sem_pressa', 'teto')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  slot text,
  tentativas integer NOT NULL DEFAULT 0,
  erro text,
  CONSTRAINT avisos_email_pecas_unico UNIQUE (profile_id, cotacao_id, reaberta)
);
-- banco de teste que ja tinha a 1a versao desta tabela (unica por fornecedor + cotacao)
ALTER TABLE avisos_email_pecas ADD COLUMN IF NOT EXISTS reaberta integer NOT NULL DEFAULT 0;
ALTER TABLE avisos_email_pecas DROP CONSTRAINT IF EXISTS avisos_email_pecas_profile_id_cotacao_id_key;
ALTER TABLE avisos_email_pecas DROP CONSTRAINT IF EXISTS avisos_email_pecas_unico;
ALTER TABLE avisos_email_pecas ADD CONSTRAINT avisos_email_pecas_unico UNIQUE (profile_id, cotacao_id, reaberta);
CREATE INDEX IF NOT EXISTS avisos_email_pecas_teto_idx ON avisos_email_pecas (profile_id, tipo, enviado_em);
CREATE INDEX IF NOT EXISTS avisos_email_pecas_pendentes_idx ON avisos_email_pecas (profile_id) WHERE enviado_em IS NULL;
ALTER TABLE avisos_email_pecas ENABLE ROW LEVEL SECURITY; -- sem politica: so service role

-- ---------- token do link "nao tenho" do e-mail (uso unico; NUNCA da login - nada de links_acesso) ----------
CREATE TABLE IF NOT EXISTS pecas_links_email (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cotacao_id uuid NOT NULL REFERENCES cotacoes_pecas(id) ON DELETE CASCADE,
  fornecedor_tipo tipo_fornecedor_peca NOT NULL,
  fornecedor_id uuid NOT NULL,
  expira_em timestamptz NOT NULL,
  usado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pecas_links_email_expira_idx ON pecas_links_email (expira_em);
ALTER TABLE pecas_links_email ENABLE ROW LEVEL SECURITY; -- sem politica: so service role

-- ---------- telefone comercial da oficina so pelo DONO (a equipe so le) ----------
DROP POLICY IF EXISTS fornecedores_contato_insert ON fornecedores_contato;
CREATE POLICY fornecedores_contato_insert ON fornecedores_contato FOR INSERT TO authenticated WITH CHECK (
  (fornecedor_tipo = 'loja' AND fornecedor_id IN (SELECT minhas_lojas()))
  OR (fornecedor_tipo = 'oficina' AND EXISTS (SELECT 1 FROM oficinas o WHERE o.id = fornecedor_id AND o.profile_id = auth.uid()))
);
DROP POLICY IF EXISTS fornecedores_contato_update ON fornecedores_contato;
CREATE POLICY fornecedores_contato_update ON fornecedores_contato FOR UPDATE TO authenticated USING (
  (fornecedor_tipo = 'loja' AND fornecedor_id IN (SELECT minhas_lojas()))
  OR (fornecedor_tipo = 'oficina' AND EXISTS (SELECT 1 FROM oficinas o WHERE o.id = fornecedor_id AND o.profile_id = auth.uid()))
) WITH CHECK (
  (fornecedor_tipo = 'loja' AND fornecedor_id IN (SELECT minhas_lojas()))
  OR (fornecedor_tipo = 'oficina' AND EXISTS (SELECT 1 FROM oficinas o WHERE o.id = fornecedor_id AND o.profile_id = auth.uid()))
);

NOTIFY pgrst, 'reload schema';
