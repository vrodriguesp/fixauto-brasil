-- 063: contas de teste (revisor do Google Play / App Store, testes do dono).
-- Pedido do dono (26/10): o revisor do Google testa o app em producao; os
-- pedidos e acidentes dele nao podem chegar a oficinas reais. Regra: pedido
-- de conta de teste so e visto/avisado a oficinas de conta de teste, e pedido
-- real nunca vai a oficina de teste. Marcar so pelo servidor/psql.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS conta_teste boolean NOT NULL DEFAULT false;

-- ninguem se marca (ou se desmarca) como conta de teste pelo navegador/app
CREATE OR REPLACE FUNCTION proteger_perfil() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.tipo = 'admin' THEN RAISE EXCEPTION 'tipo de conta nao permitido' USING ERRCODE = '42501'; END IF;
    NEW.ativo := true;
    NEW.conta_teste := false;
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.tipo := OLD.tipo;
  NEW.ativo := OLD.ativo;
  NEW.email := OLD.email;
  NEW.created_at := OLD.created_at;
  NEW.conta_teste := OLD.conta_teste;
  RETURN NEW;
END $$;

-- pedidos abertos: a oficina so ve os do mesmo "mundo" (teste x real)
CREATE OR REPLACE FUNCTION pode_ver_solicitacao(p_sol uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT eh_admin() OR EXISTS (
    SELECT 1 FROM solicitacoes s
    WHERE s.id = p_sol AND (
      s.cliente_id = auth.uid()
      OR (s.status IN ('aberta', 'em_orcamento')
          AND EXISTS (
            SELECT 1 FROM oficinas o JOIN profiles po ON po.id = o.profile_id
            WHERE o.ativa AND o.id IN (SELECT minhas_oficinas())
              AND po.conta_teste = coalesce((SELECT pc.conta_teste FROM profiles pc WHERE pc.id = s.cliente_id), false)))
      OR oficina_envolvida(s.id)
    )
  );
$$;
