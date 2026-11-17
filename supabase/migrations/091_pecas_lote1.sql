-- 091: pecas lote 1 (17/11) - cotacao segura e completa.
-- Mapa: Documentos/Analises/Pecas_lote1_2026-11-17/Mapa_lote1.md; contrato: Fable_auditoria_mapa_lote1.md (sec. 7)
-- e Contrato_testids_lote1.md. Aditiva: o codigo no ar continua funcionando com o banco novo (padroes iguais a hoje).
--
-- Tudo o que muda o comportamento para o usuario fica atras do interruptor
-- plataforma_config.pecas_v3_ativo (ou conta de teste). Vai SEM interruptor (seguranca):
--  - oficina inativa nao cria cotacao; fornecedor inativo nao responde nem escreve;
--  - status e campos de controle da cotacao so mudam pelo servidor (trigger), exceto cancelar;
--  - conta de teste e conta real nao se veem nas pecas (antes so os avisos separavam);
--  - CHECKs de preco/prazo.
-- A validade (expira_em) NAO entra em politica: a cotacao so vence pelo status 'expirada',
-- gravado pela tarefa, que respeita o interruptor por cotacao.
--
-- ROLLBACK (se precisar; as colunas novas podem ficar, o codigo antigo nao as le):
--   DROP TRIGGER trg_proteger_cotacao_peca ON cotacoes_pecas; DROP FUNCTION proteger_cotacao_peca();
--   politicas: recriar cotacoes_pecas_select da 090, cotacoes_pecas_insert da 017, cotacoes_respostas_insert da 018,
--   pecas_mensagens_insert da 088; ALTER TABLE cotacoes_pecas_respostas DROP CONSTRAINT respostas_preco_positivo,
--   DROP CONSTRAINT respostas_prazo_faixa; DROP TABLE cotacoes_pecas_placa, fornecedores_contato;
--   (o valor 'expirada' do enum nao sai; quantidade numeric fica). NOTIFY pgrst, 'reload schema';

SET LOCAL lock_timeout = '5s';

-- ---------- cotacoes_pecas: colunas novas (padroes = comportamento de hoje) ----------
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'carro';
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS unidade text NOT NULL DEFAULT 'un';
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS expira_em timestamptz NOT NULL DEFAULT (now() + interval '7 days');
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS alvo text NOT NULL DEFAULT 'todos';
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS enviar_placa boolean NOT NULL DEFAULT true;
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS reaberta_vezes integer NOT NULL DEFAULT 0;

-- 4,5 litros de oleo: quantidade com casas decimais (cotacao e pedido)
ALTER TABLE cotacoes_pecas ALTER COLUMN quantidade TYPE numeric(10,2);
ALTER TABLE pedidos_pecas ALTER COLUMN quantidade TYPE numeric(10,2);

ALTER TABLE cotacoes_pecas DROP CONSTRAINT IF EXISTS cotacoes_pecas_tipo_check;
ALTER TABLE cotacoes_pecas ADD CONSTRAINT cotacoes_pecas_tipo_check CHECK (tipo IN ('carro', 'sem_carro'));
ALTER TABLE cotacoes_pecas DROP CONSTRAINT IF EXISTS cotacoes_pecas_unidade_check;
ALTER TABLE cotacoes_pecas ADD CONSTRAINT cotacoes_pecas_unidade_check CHECK (unidade IN ('un', 'jogo', 'par', 'litro', 'kg', 'metro', 'caixa'));
ALTER TABLE cotacoes_pecas DROP CONSTRAINT IF EXISTS cotacoes_pecas_alvo_check;
ALTER TABLE cotacoes_pecas ADD CONSTRAINT cotacoes_pecas_alvo_check CHECK (alvo IN ('todos', 'so_lojas'));
ALTER TABLE cotacoes_pecas DROP CONSTRAINT IF EXISTS cotacoes_pecas_quantidade_check;
ALTER TABLE cotacoes_pecas ADD CONSTRAINT cotacoes_pecas_quantidade_check CHECK (quantidade > 0 AND quantidade <= 9999);
ALTER TABLE cotacoes_pecas DROP CONSTRAINT IF EXISTS cotacoes_pecas_reaberta_check;
ALTER TABLE cotacoes_pecas ADD CONSTRAINT cotacoes_pecas_reaberta_check CHECK (reaberta_vezes BETWEEN 0 AND 3);

-- cotacao vencida: so a tarefa grava (nenhum corpo SQL abaixo usa o literal; comparacoes por ::text)
ALTER TYPE status_cotacao_peca ADD VALUE IF NOT EXISTS 'expirada';

-- ---------- respostas: preco e prazo sensatos ----------
ALTER TABLE cotacoes_pecas_respostas DROP CONSTRAINT IF EXISTS respostas_preco_positivo;
ALTER TABLE cotacoes_pecas_respostas ADD CONSTRAINT respostas_preco_positivo CHECK (preco > 0);
ALTER TABLE cotacoes_pecas_respostas DROP CONSTRAINT IF EXISTS respostas_prazo_faixa;
ALTER TABLE cotacoes_pecas_respostas ADD CONSTRAINT respostas_prazo_faixa CHECK (prazo_dias BETWEEN 0 AND 365);

-- ---------- placa: tabela propria, so a compradora le/escreve; fornecedores pela rota do servidor ----------
-- (cotacoes_pecas e legivel por todos os parceiros ativos e vai no tempo real: a placa nao pode ficar la)
CREATE TABLE IF NOT EXISTS cotacoes_pecas_placa (
  cotacao_id uuid PRIMARY KEY REFERENCES cotacoes_pecas(id) ON DELETE CASCADE,
  placa text NOT NULL CHECK (placa ~ '^[A-Z0-9]{2,12}$')
);
ALTER TABLE cotacoes_pecas_placa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cotacoes_pecas_placa_select ON cotacoes_pecas_placa;
CREATE POLICY cotacoes_pecas_placa_select ON cotacoes_pecas_placa FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM cotacoes_pecas c WHERE c.id = cotacao_id AND c.oficina_id IN (SELECT minhas_oficinas()))
);
DROP POLICY IF EXISTS cotacoes_pecas_placa_insert ON cotacoes_pecas_placa;
CREATE POLICY cotacoes_pecas_placa_insert ON cotacoes_pecas_placa FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM cotacoes_pecas c WHERE c.id = cotacao_id AND c.oficina_id IN (SELECT minhas_oficinas()))
);
DROP POLICY IF EXISTS cotacoes_pecas_placa_update ON cotacoes_pecas_placa;
CREATE POLICY cotacoes_pecas_placa_update ON cotacoes_pecas_placa FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM cotacoes_pecas c WHERE c.id = cotacao_id AND c.oficina_id IN (SELECT minhas_oficinas()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM cotacoes_pecas c WHERE c.id = cotacao_id AND c.oficina_id IN (SELECT minhas_oficinas()))
);
DROP POLICY IF EXISTS cotacoes_pecas_placa_delete ON cotacoes_pecas_placa;
CREATE POLICY cotacoes_pecas_placa_delete ON cotacoes_pecas_placa FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM cotacoes_pecas c WHERE c.id = cotacao_id AND c.oficina_id IN (SELECT minhas_oficinas()))
);

-- ---------- telefone comercial: fora das tabelas publicas (lojas_pecas/oficinas tem SELECT aberto) ----------
CREATE TABLE IF NOT EXISTS fornecedores_contato (
  fornecedor_tipo tipo_fornecedor_peca NOT NULL,
  fornecedor_id uuid NOT NULL,
  telefone text NOT NULL CHECK (char_length(telefone) <= 30),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fornecedor_tipo, fornecedor_id)
);
ALTER TABLE fornecedores_contato ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fornecedores_contato_select ON fornecedores_contato;
CREATE POLICY fornecedores_contato_select ON fornecedores_contato FOR SELECT TO authenticated USING (
  (fornecedor_tipo = 'loja' AND fornecedor_id IN (SELECT minhas_lojas()))
  OR (fornecedor_tipo = 'oficina' AND fornecedor_id IN (SELECT minhas_oficinas()))
);
DROP POLICY IF EXISTS fornecedores_contato_insert ON fornecedores_contato;
CREATE POLICY fornecedores_contato_insert ON fornecedores_contato FOR INSERT TO authenticated WITH CHECK (
  (fornecedor_tipo = 'loja' AND fornecedor_id IN (SELECT minhas_lojas()))
  OR (fornecedor_tipo = 'oficina' AND fornecedor_id IN (SELECT minhas_oficinas()))
);
DROP POLICY IF EXISTS fornecedores_contato_update ON fornecedores_contato;
CREATE POLICY fornecedores_contato_update ON fornecedores_contato FOR UPDATE TO authenticated USING (
  (fornecedor_tipo = 'loja' AND fornecedor_id IN (SELECT minhas_lojas()))
  OR (fornecedor_tipo = 'oficina' AND fornecedor_id IN (SELECT minhas_oficinas()))
) WITH CHECK (
  (fornecedor_tipo = 'loja' AND fornecedor_id IN (SELECT minhas_lojas()))
  OR (fornecedor_tipo = 'oficina' AND fornecedor_id IN (SELECT minhas_oficinas()))
);

-- ---------- interruptor ----------
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS pecas_v3_ativo boolean NOT NULL DEFAULT false;

-- ---------- conta de teste x conta real (paridade) ----------
-- conta_teste do dono de uma oficina (a compradora da cotacao)
CREATE OR REPLACE FUNCTION oficina_conta_teste(p_oficina uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce((SELECT p.conta_teste FROM oficinas o JOIN profiles p ON p.id = o.profile_id WHERE o.id = p_oficina), false);
$function$;
REVOKE ALL ON FUNCTION oficina_conta_teste(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION oficina_conta_teste(uuid) TO authenticated, service_role;

-- ---------- trigger: status e campos de controle so pelo servidor (cancelar continua pela tela) ----------
CREATE OR REPLACE FUNCTION proteger_cotacao_peca()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'aberta';
    NEW.expira_em := now() + interval '7 days';
    NEW.reaberta_vezes := 0;
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  NEW.oficina_id := OLD.oficina_id;
  NEW.created_at := OLD.created_at;
  NEW.expira_em := OLD.expira_em;
  NEW.reaberta_vezes := OLD.reaberta_vezes;
  IF NEW.status::text <> OLD.status::text
     AND NOT (OLD.status::text IN ('aberta', 'respondida') AND NEW.status::text = 'cancelada') THEN
    RAISE EXCEPTION 'mudanca de status da cotacao so pelo servidor' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_proteger_cotacao_peca ON cotacoes_pecas;
CREATE TRIGGER trg_proteger_cotacao_peca BEFORE INSERT OR UPDATE ON cotacoes_pecas
  FOR EACH ROW EXECUTE FUNCTION proteger_cotacao_peca();

-- ---------- politicas ----------
-- leitura: a dona e a equipe sempre; os outros so parceiro ATIVO (090), do mesmo tipo de conta
-- (teste x real), e oficina que vende so ve as cotacoes "lojas e oficinas" (alvo = 'todos')
DROP POLICY IF EXISTS cotacoes_pecas_select ON cotacoes_pecas;
CREATE POLICY cotacoes_pecas_select ON cotacoes_pecas FOR SELECT TO authenticated USING (
  eh_admin()
  OR oficina_id IN (SELECT minhas_oficinas())
  OR (
    alvo = 'todos'
    AND EXISTS (
      SELECT 1 FROM oficinas o
      WHERE o.id IN (SELECT minhas_oficinas()) AND o.ativa
        AND oficina_conta_teste(o.id) = oficina_conta_teste(cotacoes_pecas.oficina_id)
    )
  )
  OR EXISTS (
    SELECT 1 FROM lojas_pecas l JOIN profiles p ON p.id = l.profile_id
    WHERE l.profile_id = auth.uid() AND l.ativa
      AND p.conta_teste = oficina_conta_teste(cotacoes_pecas.oficina_id)
  )
);

-- criar: so a dona de uma oficina ATIVA
DROP POLICY IF EXISTS cotacoes_pecas_insert ON cotacoes_pecas;
CREATE POLICY cotacoes_pecas_insert ON cotacoes_pecas FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid() AND ativa)
);

-- responder: fornecedor ATIVO (loja; ou oficina que vende, nunca a compradora, so em "lojas e oficinas"),
-- cotacao aberta/respondida, mesmo tipo de conta (teste x real)
DROP POLICY IF EXISTS cotacoes_respostas_insert ON cotacoes_pecas_respostas;
CREATE POLICY cotacoes_respostas_insert ON cotacoes_pecas_respostas FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM cotacoes_pecas c
    WHERE c.id = cotacao_id AND c.status::text IN ('aberta', 'respondida')
      AND (
        (fornecedor_tipo = 'loja' AND EXISTS (
          SELECT 1 FROM lojas_pecas l JOIN profiles p ON p.id = l.profile_id
          WHERE l.id = loja_id AND l.profile_id = auth.uid() AND l.ativa
            AND p.conta_teste = oficina_conta_teste(c.oficina_id)
        ))
        OR (fornecedor_tipo = 'oficina' AND c.alvo = 'todos' AND EXISTS (
          SELECT 1 FROM oficinas o
          WHERE o.id = oficina_fornecedora_id AND o.profile_id = auth.uid() AND o.ativa AND o.vende_pecas
            AND o.id <> c.oficina_id
            AND oficina_conta_teste(o.id) = oficina_conta_teste(c.oficina_id)
        ))
      )
  )
);

-- conversa: 088 + fornecedor ATIVO (+ "lojas e oficinas" para oficina que vende) + mesmo tipo de conta;
-- a compradora escreve para qualquer fornecedor da conversa
DROP POLICY IF EXISTS pecas_mensagens_insert ON cotacoes_pecas_mensagens;
CREATE POLICY pecas_mensagens_insert ON cotacoes_pecas_mensagens FOR INSERT WITH CHECK (
  auth.uid() = remetente_id
  AND (
    -- oficina que pediu a peca
    EXISTS (
      SELECT 1 FROM cotacoes_pecas c JOIN oficinas o ON o.id = c.oficina_id
      WHERE c.id = cotacoes_pecas_mensagens.cotacao_id AND o.profile_id = auth.uid()
    )
    -- loja de pecas ativa da conversa
    OR (fornecedor_tipo = 'loja' AND EXISTS (
      SELECT 1 FROM lojas_pecas l JOIN profiles p ON p.id = l.profile_id
      JOIN cotacoes_pecas c ON c.id = cotacoes_pecas_mensagens.cotacao_id
      WHERE l.id = cotacoes_pecas_mensagens.fornecedor_id AND l.profile_id = auth.uid() AND l.ativa
        AND p.conta_teste = oficina_conta_teste(c.oficina_id)
    ))
    -- oficina ativa que vende sobra (nunca a propria compradora; so em "lojas e oficinas")
    OR (fornecedor_tipo = 'oficina' AND EXISTS (
      SELECT 1 FROM oficinas o JOIN cotacoes_pecas c ON c.id = cotacoes_pecas_mensagens.cotacao_id
      WHERE o.id = cotacoes_pecas_mensagens.fornecedor_id AND o.profile_id = auth.uid() AND o.id <> c.oficina_id
        AND o.ativa AND c.alvo = 'todos'
        AND oficina_conta_teste(o.id) = oficina_conta_teste(c.oficina_id)
    ))
  )
);

NOTIFY pgrst, 'reload schema';
