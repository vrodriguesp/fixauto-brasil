-- Teste do dono em 08/10/2026:
-- 1) foto do acidente invisivel para a oficina antes do aceite (so aparecia
--    depois): a foto fica em emergencia/<id>/ e a regra so liberava para quem
--    foi avisado do acidente. Agora vale tambem para quem pode ver o pedido.
-- 2) mecanico sem acesso ao portal: so nome/telefone, sem conta de login.
-- 3) historico do servico (quem atribuiu, troca de mecanico, check-in antecipado).
-- 4) seguradoras convencionadas da oficina; numero do endereco separado.
-- 5) notificacoes em tempo real (aviso dentro do app/site na hora).

-- 1) fotos do acidente
DROP POLICY IF EXISTS privado_select ON storage.objects;
CREATE POLICY privado_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'damage-photos' AND (
    eh_admin()
    OR ((storage.foldername(name))[1] = 'solicitacoes' AND pode_ver_solicitacao(uuid_ou_nulo((storage.foldername(name))[2])))
    OR ((storage.foldername(name))[1] = 'audio'
        AND participa_conversa_v2(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3]), uuid_ou_nulo((storage.foldername(name))[4])))
    OR ((storage.foldername(name))[1] = 'emergencia' AND (
          pode_ver_emergencia(uuid_ou_nulo((storage.foldername(name))[2]))
          OR EXISTS (SELECT 1 FROM emergencias e
                     WHERE e.id = uuid_ou_nulo((storage.foldername(name))[2])
                       AND e.solicitacao_id IS NOT NULL AND pode_ver_solicitacao(e.solicitacao_id))))
    OR ((storage.foldername(name))[1] = 'pecas-mensagens'
        AND participa_cotacao_peca(uuid_ou_nulo((storage.foldername(name))[2]), uuid_ou_nulo((storage.foldername(name))[3])))
  )
);

-- 2) mecanico sem login
ALTER TABLE funcionarios ALTER COLUMN profile_id DROP NOT NULL;
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS nome TEXT CHECK (nome IS NULL OR char_length(nome) <= 100);
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS telefone TEXT CHECK (telefone IS NULL OR char_length(telefone) <= 30);
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS acesso_portal BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE funcionarios DROP CONSTRAINT IF EXISTS funcionarios_quem;
ALTER TABLE funcionarios ADD CONSTRAINT funcionarios_quem CHECK (profile_id IS NOT NULL OR nome IS NOT NULL);

-- 3) historico do servico
CREATE TABLE IF NOT EXISTS agenda_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id UUID NOT NULL REFERENCES agenda(id) ON DELETE CASCADE,
  acao TEXT NOT NULL CHECK (acao IN ('checkin', 'checkin_antecipado', 'atribuido', 'etapa', 'entregue')),
  funcionario_id UUID REFERENCES funcionarios(id) ON DELETE SET NULL,
  por_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  detalhe JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agenda_historico ON agenda_historico (agenda_id, created_at);
ALTER TABLE agenda_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agenda_historico_select ON agenda_historico;
-- so a oficina (dono e equipe) le; grava so o servidor (/api/servico)
CREATE POLICY agenda_historico_select ON agenda_historico FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM agenda a WHERE a.id = agenda_historico.agenda_id AND a.oficina_id IN (SELECT minhas_oficinas()))
);
GRANT SELECT ON agenda_historico TO authenticated;

-- 4) seguradoras convencionadas e numero do endereco
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS seguradoras_convencionadas TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS numero TEXT CHECK (numero IS NULL OR char_length(numero) <= 20);

-- 5) notificacoes chegam na hora
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notificacoes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notificacoes;
  END IF;
END $$;
