-- FixAuto Brasil - Migration 008: Funcionários e Acompanhamento de Manutenção

-- === ENUMS ===
CREATE TYPE cargo_funcionario AS ENUM ('admin', 'mecanico');

CREATE TYPE status_manutencao AS ENUM (
  'recebido',
  'diagnostico',
  'aguardando_pecas',
  'em_execucao',
  'pausa_cliente',
  'pausa_pecas',
  'pausa_geral',
  'teste_final',
  'concluido',
  'entregue'
);

-- === TABLES ===

-- Funcionários (vincula um profile a uma oficina com cargo)
CREATE TABLE funcionarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  cargo cargo_funcionario NOT NULL DEFAULT 'mecanico',
  especialidade TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, oficina_id)
);

-- Associação mecânico ↔ evento da agenda (quem é responsável pelo veículo)
ALTER TABLE agenda ADD COLUMN funcionario_id UUID REFERENCES funcionarios(id);

-- Etapas da manutenção (cada mudança de status é um registro)
CREATE TABLE manutencao_etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id UUID NOT NULL REFERENCES agenda(id) ON DELETE CASCADE,
  funcionario_id UUID REFERENCES funcionarios(id),
  status status_manutencao NOT NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Coluna de capacidade por serviço na oficina (JSONB)
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS capacidade_servicos JSONB DEFAULT '{}';

-- === INDEXES ===
CREATE INDEX idx_funcionarios_oficina ON funcionarios(oficina_id);
CREATE INDEX idx_funcionarios_profile ON funcionarios(profile_id);
CREATE INDEX idx_manutencao_etapas_agenda ON manutencao_etapas(agenda_id);
CREATE INDEX idx_agenda_funcionario ON agenda(funcionario_id);

-- === RLS ===
ALTER TABLE funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE manutencao_etapas ENABLE ROW LEVEL SECURITY;

-- Funcionários: oficina admin pode CRUD, funcionário pode ler próprio registro
CREATE POLICY "Oficina admin pode gerenciar funcionários" ON funcionarios
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM oficinas WHERE oficinas.id = funcionarios.oficina_id
      AND oficinas.profile_id = auth.uid()
    )
  );

CREATE POLICY "Funcionário pode ler próprio registro" ON funcionarios
  FOR SELECT USING (profile_id = auth.uid());

-- Manutencao etapas: funcionários da oficina podem inserir, todos envolvidos podem ler
CREATE POLICY "Funcionário pode inserir etapas" ON manutencao_etapas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM funcionarios WHERE funcionarios.id = manutencao_etapas.funcionario_id
      AND funcionarios.profile_id = auth.uid()
    )
  );

CREATE POLICY "Admin da oficina pode inserir etapas" ON manutencao_etapas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM agenda
      JOIN oficinas ON oficinas.id = agenda.oficina_id
      WHERE agenda.id = manutencao_etapas.agenda_id
      AND oficinas.profile_id = auth.uid()
    )
  );

CREATE POLICY "Funcionários da oficina podem ler etapas" ON manutencao_etapas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM agenda
      JOIN oficinas ON oficinas.id = agenda.oficina_id
      WHERE agenda.id = manutencao_etapas.agenda_id
      AND (
        oficinas.profile_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM funcionarios
          WHERE funcionarios.oficina_id = oficinas.id
          AND funcionarios.profile_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Cliente pode ler etapas do próprio veículo" ON manutencao_etapas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM agenda
      JOIN solicitacoes ON solicitacoes.id = agenda.solicitacao_id
      WHERE agenda.id = manutencao_etapas.agenda_id
      AND solicitacoes.cliente_id = auth.uid()
    )
  );

-- === REALTIME ===
ALTER PUBLICATION supabase_realtime ADD TABLE manutencao_etapas;
