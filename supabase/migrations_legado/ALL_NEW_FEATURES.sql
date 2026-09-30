-- ============================================================
-- BipFix - SQL Consolidado: Todas as Novas Features
-- Rodar no Supabase SQL Editor em uma única execução
-- ============================================================

-- ============================================================
-- 1. EMERGÊNCIA MELHORADA
-- ============================================================
ALTER TABLE emergencias ADD COLUMN IF NOT EXISTS prioridade TEXT DEFAULT 'urgente';

CREATE TABLE IF NOT EXISTS emergencia_oficinas_notificadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergencia_id UUID NOT NULL REFERENCES emergencias(id) ON DELETE CASCADE,
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  notificada_em TIMESTAMPTZ DEFAULT NOW(),
  respondeu BOOLEAN DEFAULT false,
  respondeu_em TIMESTAMPTZ,
  distancia_km NUMERIC(6,2),
  UNIQUE(emergencia_id, oficina_id)
);

ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS emergencia_id UUID REFERENCES emergencias(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_emergencia ON solicitacoes(emergencia_id);

ALTER TABLE emergencia_oficinas_notificadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emergencia_notif_select" ON emergencia_oficinas_notificadas FOR SELECT USING (true);
CREATE POLICY "emergencia_notif_insert" ON emergencia_oficinas_notificadas FOR INSERT WITH CHECK (true);

-- ============================================================
-- 2. NO-SHOW DO CLIENTE
-- ============================================================
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS no_show BOOLEAN DEFAULT false;
ALTER TABLE agenda ADD COLUMN IF NOT EXISTS no_show_registrado_em TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS no_show_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  solicitacao_id UUID REFERENCES solicitacoes(id) ON DELETE SET NULL,
  agenda_id UUID REFERENCES agenda(id) ON DELETE SET NULL,
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  data_agendada DATE NOT NULL,
  registrado_em TIMESTAMPTZ DEFAULT NOW(),
  reagendado BOOLEAN DEFAULT false,
  reagendado_para DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_no_show_cliente ON no_show_historico(cliente_id);
CREATE INDEX IF NOT EXISTS idx_no_show_oficina ON no_show_historico(oficina_id);

ALTER TABLE no_show_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no_show_select" ON no_show_historico FOR SELECT USING (true);
CREATE POLICY "no_show_insert" ON no_show_historico FOR INSERT WITH CHECK (true);
CREATE POLICY "no_show_update" ON no_show_historico FOR UPDATE USING (true);

-- ============================================================
-- 3. SISTEMA DE COMISSÃO
-- ============================================================
CREATE TABLE IF NOT EXISTS comissao_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  taxa_base NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  taxa_calculada NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  taxa_fixa_override NUMERIC(5,4),
  usa_override BOOLEAN DEFAULT false,
  media_tempo_resposta_horas NUMERIC(6,2) DEFAULT 0,
  media_revisoes_orcamento NUMERIC(4,2) DEFAULT 0,
  media_avaliacao_clientes NUMERIC(3,2) DEFAULT 0,
  total_servicos_concluidos INTEGER DEFAULT 0,
  calculado_em TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(oficina_id)
);

CREATE TABLE IF NOT EXISTS comissao_lancamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  solicitacao_id UUID NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  orcamento_id UUID NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  valor_servico NUMERIC(10,2) NOT NULL,
  taxa_aplicada NUMERIC(5,4) NOT NULL,
  valor_comissao NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'faturado', 'pago', 'cancelado')),
  faturado_em TIMESTAMPTZ,
  pago_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(orcamento_id)
);

CREATE INDEX IF NOT EXISTS idx_comissao_config_oficina ON comissao_config(oficina_id);
CREATE INDEX IF NOT EXISTS idx_comissao_lanc_oficina ON comissao_lancamento(oficina_id);
CREATE INDEX IF NOT EXISTS idx_comissao_lanc_status ON comissao_lancamento(status);

ALTER TABLE comissao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE comissao_lancamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comissao_config_select" ON comissao_config FOR SELECT USING (
  EXISTS (SELECT 1 FROM oficinas WHERE oficinas.id = comissao_config.oficina_id AND oficinas.profile_id = auth.uid())
);
CREATE POLICY "comissao_lanc_select" ON comissao_lancamento FOR SELECT USING (
  EXISTS (SELECT 1 FROM oficinas WHERE oficinas.id = comissao_lancamento.oficina_id AND oficinas.profile_id = auth.uid())
);

-- ============================================================
-- 4. ADMIN PANEL
-- ============================================================
ALTER TYPE tipo_usuario ADD VALUE IF NOT EXISTS 'admin';

CREATE TABLE IF NOT EXISTS plataforma_metricas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo TEXT NOT NULL,
  data_referencia DATE NOT NULL,
  gmv NUMERIC(12,2) DEFAULT 0,
  total_solicitacoes INTEGER DEFAULT 0,
  total_orcamentos INTEGER DEFAULT 0,
  total_servicos_concluidos INTEGER DEFAULT 0,
  total_clientes_ativos INTEGER DEFAULT 0,
  total_oficinas_ativas INTEGER DEFAULT 0,
  comissao_total NUMERIC(10,2) DEFAULT 0,
  ticket_medio NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(periodo, data_referencia)
);

-- ============================================================
-- 5. ANÁLISE DE DANO COM IA
-- ============================================================
CREATE TABLE IF NOT EXISTS analise_dano (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id UUID NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  resumo TEXT NOT NULL,
  severidade TEXT NOT NULL CHECK (severidade IN ('leve', 'moderado', 'grave', 'severo')),
  checklist_inspecao JSONB NOT NULL DEFAULT '[]',
  pecas_afetadas JSONB DEFAULT '[]',
  estimativa_custo JSONB,
  confianca NUMERIC(3,2),
  modelo_usado TEXT,
  fotos_analisadas UUID[],
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(solicitacao_id)
);

ALTER TABLE analise_dano ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analise_dano_select" ON analise_dano FOR SELECT USING (true);

-- ============================================================
-- 6. MENSAGENS DE ÁUDIO
-- ============================================================
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'texto';
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS audio_duracao_segundos INTEGER;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS transcricao TEXT;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS transcricao_status TEXT DEFAULT 'pendente';

-- ============================================================
-- 7. POLICY DELETE PARA ORCAMENTO_DISPONIBILIDADE (fix duplicação)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'orcamento_disponibilidade' AND policyname = 'disponibilidade_delete'
  ) THEN
    CREATE POLICY "disponibilidade_delete" ON orcamento_disponibilidade FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM orcamentos o
        JOIN oficinas of ON of.id = o.oficina_id
        WHERE o.id = orcamento_id AND of.profile_id = auth.uid()
      )
    );
  END IF;
END $$;

-- ============================================================
-- 8. FIM
-- ============================================================
