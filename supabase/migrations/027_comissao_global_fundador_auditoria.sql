-- 027: comissao em hierarquia (global + individual), selo de parceiro
-- fundador e auditoria das correcoes feitas pelo admin.
--
-- Hierarquia da comissao (servicos e pecas):
--   1. taxa individual da oficina/fornecedor (comissao_config.usa_override),
--      valida ate override_ate (NULL = sem prazo) -> vale sobre a global;
--   2. senao, a regra global de plataforma_config:
--        'isento'     -> 0% (fase de parceiros fundadores, como o site promete)
--        'fixa'       -> a mesma taxa para todos
--        'desempenho' -> taxa calculada por resposta/revisoes/avaliacao/volume
--
-- Tudo aqui so e lido/escrito pela service role (rotas /api/admin/*).

-- ---------- Configuracao global (linha unica) ----------
CREATE TABLE IF NOT EXISTS plataforma_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  comissao_servicos_modo TEXT NOT NULL DEFAULT 'isento'
    CHECK (comissao_servicos_modo IN ('isento', 'fixa', 'desempenho')),
  comissao_servicos_taxa DECIMAL(5,4) NOT NULL DEFAULT 0.10
    CHECK (comissao_servicos_taxa >= 0 AND comissao_servicos_taxa <= 0.5),
  comissao_pecas_modo TEXT NOT NULL DEFAULT 'isento'
    CHECK (comissao_pecas_modo IN ('isento', 'fixa', 'desempenho')),
  comissao_pecas_taxa DECIMAL(5,4) NOT NULL DEFAULT 0.03
    CHECK (comissao_pecas_taxa >= 0 AND comissao_pecas_taxa <= 0.5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);
INSERT INTO plataforma_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE plataforma_config ENABLE ROW LEVEL SECURITY;

-- ---------- Taxa individual com prazo e motivo ----------
ALTER TABLE comissao_config ADD COLUMN IF NOT EXISTS override_ate DATE;
ALTER TABLE comissao_config ADD COLUMN IF NOT EXISTS override_motivo TEXT;
ALTER TABLE comissao_pecas_config ADD COLUMN IF NOT EXISTS override_ate DATE;
ALTER TABLE comissao_pecas_config ADD COLUMN IF NOT EXISTS override_motivo TEXT;

-- Taxa individual 0% passa a ser valida (oferta de isencao para uma oficina)
ALTER TABLE comissao_config DROP CONSTRAINT IF EXISTS comissao_config_taxa_fixa_override_check;
ALTER TABLE comissao_config ADD CONSTRAINT comissao_config_taxa_fixa_override_check
  CHECK (taxa_fixa_override IS NULL OR (taxa_fixa_override >= 0 AND taxa_fixa_override <= 0.5));

-- ---------- Selo de parceiro fundador ----------
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS parceiro_fundador BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS parceiro_fundador_desde TIMESTAMPTZ;
ALTER TABLE lojas_pecas ADD COLUMN IF NOT EXISTS parceiro_fundador BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE lojas_pecas ADD COLUMN IF NOT EXISTS parceiro_fundador_desde TIMESTAMPTZ;

-- A oficina/loja pode editar a propria linha (policy de UPDATE por
-- profile_id). Sem esta trava ela conseguiria se marcar como fundadora.
-- So a service role (admin) muda o selo.
CREATE OR REPLACE FUNCTION proteger_parceiro_fundador()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.parceiro_fundador := false;
      NEW.parceiro_fundador_desde := NULL;
    ELSE
      NEW.parceiro_fundador := OLD.parceiro_fundador;
      NEW.parceiro_fundador_desde := OLD.parceiro_fundador_desde;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_fundador_oficinas ON oficinas;
CREATE TRIGGER trg_proteger_fundador_oficinas
  BEFORE INSERT OR UPDATE ON oficinas
  FOR EACH ROW EXECUTE FUNCTION proteger_parceiro_fundador();

DROP TRIGGER IF EXISTS trg_proteger_fundador_lojas ON lojas_pecas;
CREATE TRIGGER trg_proteger_fundador_lojas
  BEFORE INSERT OR UPDATE ON lojas_pecas
  FOR EACH ROW EXECUTE FUNCTION proteger_parceiro_fundador();

-- ---------- Auditoria das acoes do admin ----------
CREATE TABLE IF NOT EXISTS admin_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  entidade TEXT NOT NULL,
  entidade_id UUID,
  acao TEXT NOT NULL,
  antes JSONB,
  depois JSONB,
  motivo TEXT,
  solicitacao_id UUID REFERENCES solicitacoes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_auditoria_criado ON admin_auditoria(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_auditoria_solicitacao ON admin_auditoria(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_admin_auditoria_entidade ON admin_auditoria(entidade, entidade_id);
ALTER TABLE admin_auditoria ENABLE ROW LEVEL SECURITY;
