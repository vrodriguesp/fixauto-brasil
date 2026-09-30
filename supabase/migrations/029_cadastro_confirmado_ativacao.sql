-- 029: cadastro com confirmacao de e-mail + parceiro so ativo depois da
-- conferencia do registro da empresa (2026-09-30).
--
-- 1) Declaracao de responsavel: quem cadastra oficina/loja declara ser o
--    responsavel pela empresa e estar ciente de que o servico, hoje
--    gratuito, pode passar a ser cobrado (aviso previo de 30 dias corridos).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS responsavel_declarado_em TIMESTAMPTZ;

-- 2) Oficina/loja nova nasce inativa (nao aparece para clientes) ate o
--    admin conferir o registro da empresa e ativar.
ALTER TABLE oficinas ALTER COLUMN ativa SET DEFAULT false;
ALTER TABLE lojas_pecas ALTER COLUMN ativa SET DEFAULT false;

-- 3) So o admin (service role / eh_admin) ativa: o dono nao consegue se
--    ativar mudando a propria linha pelo cliente.
CREATE OR REPLACE FUNCTION proteger_ativacao_parceiro()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND NOT eh_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.ativa := false;
    ELSE
      NEW.ativa := OLD.ativa;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_ativacao_oficinas ON oficinas;
CREATE TRIGGER trg_proteger_ativacao_oficinas
  BEFORE INSERT OR UPDATE ON oficinas
  FOR EACH ROW EXECUTE FUNCTION proteger_ativacao_parceiro();

DROP TRIGGER IF EXISTS trg_proteger_ativacao_lojas ON lojas_pecas;
CREATE TRIGGER trg_proteger_ativacao_lojas
  BEFORE INSERT OR UPDATE ON lojas_pecas
  FOR EACH ROW EXECUTE FUNCTION proteger_ativacao_parceiro();
