-- Auditoria Fable 08/10 (docs/AUDITORIA_FABLE_2026-10-08/WEB_OFICINA_ADMIN_SERVIDOR.md)
-- Regras que o banco passa a impor mesmo que alguem chame a API do Supabase
-- direto com a chave publica. Rotas do servidor (service role) nao sao afetadas.
--   C-01 ninguem vira admin nem se reativa sozinho (profiles.tipo/ativo/email)
--   A-03 cliente so recusa orcamento; oficina nao mexe em orcamento aceito
--   A-04 cliente nao muda status (so cancela pedido aberto), dono, nem poe carro de outro
--   A-08 etapas do conserto so pelo servidor (/api/servico)
--   A-09 plataforma_metricas fechada
--   M-04 uma comissao por orcamento
--   M-06 oficina nao escreve a propria nota
--   M-17 leads so pela rota (com limite)
--   B-04 indices das consultas quentes

-- quem chama pelo navegador/app (chave publica) - nao o servidor (service_role)
-- nem o psql. Pelo papel do token (auth.role()), que vale tambem dentro de
-- funcoes SECURITY DEFINER (onde current_user e o dono da funcao).
CREATE OR REPLACE FUNCTION chamada_de_usuario() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT coalesce(auth.role(), '') IN ('anon', 'authenticated') $$;

-- C-01 ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION proteger_perfil() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.tipo = 'admin' THEN RAISE EXCEPTION 'tipo de conta nao permitido' USING ERRCODE = '42501'; END IF;
    NEW.ativo := true;
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.tipo := OLD.tipo;
  NEW.ativo := OLD.ativo;
  NEW.email := OLD.email;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proteger_perfil ON profiles;
CREATE TRIGGER trg_proteger_perfil BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION proteger_perfil();

-- A-03 ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION proteger_orcamento() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  eh_oficina boolean;
  novo_status text;
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN NEW; END IF;
  eh_oficina := EXISTS (SELECT 1 FROM oficinas WHERE id = OLD.oficina_id AND profile_id = auth.uid());
  IF eh_oficina THEN
    NEW.oficina_id := OLD.oficina_id;
    NEW.solicitacao_id := OLD.solicitacao_id;
    -- aceito/recusado/expirado sao do cliente e do servidor; aceito nao se altera
    IF OLD.status = 'aceito' THEN RAISE EXCEPTION 'orcamento aceito nao pode ser alterado' USING ERRCODE = '42501'; END IF;
    IF NEW.status = 'aceito' THEN RAISE EXCEPTION 'aceite so pelo cliente' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  END IF;
  -- cliente do pedido: so muda o status, e so para visualizado/recusado
  novo_status := NEW.status;
  IF novo_status NOT IN ('visualizado', 'recusado') OR OLD.status NOT IN ('enviado', 'visualizado') THEN
    RAISE EXCEPTION 'alteracao de orcamento nao permitida' USING ERRCODE = '42501';
  END IF;
  NEW := OLD;
  NEW.status := novo_status;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proteger_orcamento ON orcamentos;
CREATE TRIGGER trg_proteger_orcamento BEFORE UPDATE ON orcamentos
  FOR EACH ROW EXECUTE FUNCTION proteger_orcamento();

-- A-04 ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION proteger_solicitacao() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN NEW; END IF;
  NEW.cliente_id := OLD.cliente_id;
  NEW.created_at := OLD.created_at;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (NEW.status = 'cancelada' AND OLD.status IN ('aberta', 'em_orcamento')) THEN
    RAISE EXCEPTION 'mudanca de status nao permitida' USING ERRCODE = '42501';
  END IF;
  IF NEW.veiculo_id IS DISTINCT FROM OLD.veiculo_id
     AND NOT EXISTS (SELECT 1 FROM veiculos WHERE id = NEW.veiculo_id AND profile_id = OLD.cliente_id) THEN
    RAISE EXCEPTION 'veiculo de outra pessoa' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proteger_solicitacao ON solicitacoes;
CREATE TRIGGER trg_proteger_solicitacao BEFORE UPDATE ON solicitacoes
  FOR EACH ROW EXECUTE FUNCTION proteger_solicitacao();

-- A-08: etapas so pelo servidor (as telas ja usam /api/servico)
DROP POLICY IF EXISTS "Funcionário pode inserir etapas" ON manutencao_etapas;
DROP POLICY IF EXISTS "Admin da oficina pode inserir etapas" ON manutencao_etapas;

-- A-09
ALTER TABLE IF EXISTS plataforma_metricas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE plataforma_metricas FROM anon, authenticated;

-- M-04
CREATE UNIQUE INDEX IF NOT EXISTS comissao_lancamento_orcamento_unico ON comissao_lancamento(orcamento_id);

-- M-06: nota e dono da oficina so pelo servidor
CREATE OR REPLACE FUNCTION proteger_oficina_campos() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN NEW; END IF;
  NEW.profile_id := OLD.profile_id;
  NEW.avaliacao_media := OLD.avaliacao_media;
  NEW.total_avaliacoes := OLD.total_avaliacoes;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_proteger_oficina_campos ON oficinas;
CREATE TRIGGER trg_proteger_oficina_campos BEFORE UPDATE ON oficinas
  FOR EACH ROW EXECUTE FUNCTION proteger_oficina_campos();

-- M-17
DROP POLICY IF EXISTS leads_parceiros_insert_publico ON leads_parceiros;
REVOKE INSERT ON leads_parceiros FROM anon, authenticated;

-- B-04
CREATE INDEX IF NOT EXISTS agenda_solicitacao_idx ON agenda(solicitacao_id);
CREATE INDEX IF NOT EXISTS agenda_status_idx ON agenda(status);
CREATE INDEX IF NOT EXISTS veiculos_profile_idx ON veiculos(profile_id);
CREATE INDEX IF NOT EXISTS profiles_email_lower_idx ON profiles(lower(email));
CREATE INDEX IF NOT EXISTS solicitacoes_veiculo_idx ON solicitacoes(veiculo_id);
CREATE INDEX IF NOT EXISTS emergencias_solicitacao_idx ON emergencias(solicitacao_id);
CREATE INDEX IF NOT EXISTS etapas_funcionario_idx ON manutencao_etapas(funcionario_id);
CREATE INDEX IF NOT EXISTS notificacoes_perfil_data_idx ON notificacoes(profile_id, created_at DESC);
