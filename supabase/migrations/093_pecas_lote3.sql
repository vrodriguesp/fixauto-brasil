-- 093: pecas lote 3 (17/11) - "confianca": recebi/problema, cancelamento com motivo, avaliacao por
-- fornecedor, P-7 (avaliacao obrigatoria), oficina fornecedora (alcance "pais", condicao) e Web Push.
-- Mapa: Documentos/Analises/Pecas_lote3_2026-11-17/Mapa_lote3.md (sec. 3); contrato dos testes:
-- Contrato_testids_lote3.md (sec. 1 e 3); decisoes do dono: Decisoes_dono_2026-11-17.md (D-1..D-12).
--
-- Aditiva e idempotente (roda de novo sem erro): colunas novas todas NULL sem DEFAULT (exceto
-- lembretes_feedback 0 e pecas_p7_minimo 1); nenhum valor novo de enum; nenhum gatilho que reescreva as
-- colunas novas. O codigo no ar (lote 2) roda com a 093: select('*') e o tempo real ignoram as colunas
-- novas, o confirmar antigo grava v3 NULL e a funcao do P-7 devolve false sem pedido v3.
-- Atras do interruptor PELO DADO: pedido sem v3 = pedido de hoje (nunca entra no P-7, no lembrete, na
-- avaliacao nem na janela de contato). O P-7 tambem exige global OU conta de teste (dado sobrevive a um
-- liga/desliga do global). Politicas de cotacoes/respostas/mensagens/dispensas/placa/pedidos/contato/
-- oficinas/lojas/notificacoes NAO mudam (D-12: sem anonimato), exceto cotacoes_pecas_insert (P-7).
-- Escrita nas tabelas novas so pelo servidor (service role): RLS ligada sem politica de escrita.
--
-- ROLLBACK (se precisar; as colunas novas podem ficar, o codigo do lote 2 nao as le):
--   P-7 so: CREATE OR REPLACE FUNCTION oficina_feedback_pecas_pendente(uuid) ... SELECT false
--           (ou UPDATE plataforma_config SET pecas_p7_minimo = 9999 WHERE id = 1);
--   tudo:   recriar cotacoes_pecas_insert da 091 (dona de oficina ativa, sem o P-7);
--           DROP TABLE fornecedores_avaliacoes, push_navegador;
--           DROP FUNCTION oficina_feedback_pecas_pendente(uuid), fornecedor_resumo(tipo_fornecedor_peca, uuid),
--             parceiro_ve_fornecedor(tipo_fornecedor_peca, uuid), fornecedor_conta_teste(tipo_fornecedor_peca, uuid),
--             registro_normalizado(text);
--           ALTER TABLE avisos_email_pecas DROP CONSTRAINT avisos_email_pecas_motivo_check e recriar sem 'falha'
--           (antes: UPDATE avisos_email_pecas SET motivo = 'teto' WHERE motivo = 'falha');
--   NOTIFY pgrst, 'reload schema';

SET LOCAL lock_timeout = '5s';

-- ---------- pedidos_pecas: ciclo do pedido (todas NULL = pedido de hoje) ----------
ALTER TABLE pedidos_pecas ADD COLUMN IF NOT EXISTS v3 boolean;
ALTER TABLE pedidos_pecas ADD COLUMN IF NOT EXISTS recebido_em timestamptz;
ALTER TABLE pedidos_pecas ADD COLUMN IF NOT EXISTS problema text;
ALTER TABLE pedidos_pecas ADD COLUMN IF NOT EXISTS problema_em timestamptz;
ALTER TABLE pedidos_pecas ADD COLUMN IF NOT EXISTS problema_texto text;
ALTER TABLE pedidos_pecas ADD COLUMN IF NOT EXISTS cancelado_por text;
ALTER TABLE pedidos_pecas ADD COLUMN IF NOT EXISTS cancelado_motivo text;
ALTER TABLE pedidos_pecas ADD COLUMN IF NOT EXISTS cancelado_texto text;
ALTER TABLE pedidos_pecas ADD COLUMN IF NOT EXISTS cancelado_em timestamptz;
ALTER TABLE pedidos_pecas ADD COLUMN IF NOT EXISTS entregue_em timestamptz;
ALTER TABLE pedidos_pecas ADD COLUMN IF NOT EXISTS contato_visivel_ate timestamptz;
ALTER TABLE pedidos_pecas ADD COLUMN IF NOT EXISTS lembretes_feedback integer NOT NULL DEFAULT 0;
ALTER TABLE pedidos_pecas ADD COLUMN IF NOT EXISTS pos_cancelamento text;
-- SEM chave estrangeira (de proposito, desvio do contrato E.0d): uma 2a FK de pedidos_pecas para
-- cotacoes_pecas deixa ambiguo todo embed sem dica (cotacoes_pecas -> pedidos_pecas e o inverso) e o
-- PostgREST responde PGRST201 - o codigo no ar (lote 2) quebrava as telas de pecas com a 093 aplicada
-- (fase B, 18/11). Quem le trata id que nao existe mais como "sem nova cotacao".
ALTER TABLE pedidos_pecas ADD COLUMN IF NOT EXISTS nova_cotacao_id uuid;
ALTER TABLE pedidos_pecas DROP CONSTRAINT IF EXISTS pedidos_pecas_nova_cotacao_id_fkey;

ALTER TABLE pedidos_pecas DROP CONSTRAINT IF EXISTS pedidos_pecas_problema_check;
ALTER TABLE pedidos_pecas ADD CONSTRAINT pedidos_pecas_problema_check
  CHECK (problema IS NULL OR problema IN ('nao_entregou', 'peca_errada', 'avariada', 'outro'));
ALTER TABLE pedidos_pecas DROP CONSTRAINT IF EXISTS pedidos_pecas_problema_texto_check;
ALTER TABLE pedidos_pecas ADD CONSTRAINT pedidos_pecas_problema_texto_check
  CHECK (problema_texto IS NULL OR char_length(problema_texto) <= 300);
ALTER TABLE pedidos_pecas DROP CONSTRAINT IF EXISTS pedidos_pecas_cancelado_por_check;
ALTER TABLE pedidos_pecas ADD CONSTRAINT pedidos_pecas_cancelado_por_check
  CHECK (cancelado_por IS NULL OR cancelado_por IN ('compradora', 'fornecedor', 'admin'));
ALTER TABLE pedidos_pecas DROP CONSTRAINT IF EXISTS pedidos_pecas_cancelado_motivo_check;
ALTER TABLE pedidos_pecas ADD CONSTRAINT pedidos_pecas_cancelado_motivo_check
  CHECK (cancelado_motivo IS NULL OR cancelado_motivo IN ('sem_estoque', 'prazo', 'compradora_pediu', 'comprei_outro', 'carro_saiu', 'erro_pedido', 'nao_entregou', 'outro'));
ALTER TABLE pedidos_pecas DROP CONSTRAINT IF EXISTS pedidos_pecas_cancelado_texto_check;
ALTER TABLE pedidos_pecas ADD CONSTRAINT pedidos_pecas_cancelado_texto_check
  CHECK (cancelado_texto IS NULL OR char_length(cancelado_texto) <= 200);
ALTER TABLE pedidos_pecas DROP CONSTRAINT IF EXISTS pedidos_pecas_pos_cancelamento_check;
ALTER TABLE pedidos_pecas ADD CONSTRAINT pedidos_pecas_pos_cancelamento_check
  CHECK (pos_cancelamento IS NULL OR pos_cancelamento IN ('reaberta', 'nova_cotacao'));
-- coerencia numa direcao so: quem cancelou so existe em pedido cancelado; cancelado sem "quem"
-- continua valido (admin/corrigir de hoje grava so o status)
ALTER TABLE pedidos_pecas DROP CONSTRAINT IF EXISTS pedidos_pecas_cancelado_coerente;
ALTER TABLE pedidos_pecas ADD CONSTRAINT pedidos_pecas_cancelado_coerente
  CHECK (cancelado_por IS NULL OR status = 'cancelado');
-- P-7: so pedidos v3 de uma oficina
CREATE INDEX IF NOT EXISTS pedidos_pecas_v3_oficina_idx ON pedidos_pecas (oficina_id) WHERE v3;

-- ---------- P-7: quantos pedidos pendentes bloqueiam (1 = qualquer um) ----------
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS pecas_p7_minimo integer NOT NULL DEFAULT 1;
ALTER TABLE plataforma_config DROP CONSTRAINT IF EXISTS plataforma_config_pecas_p7_minimo_check;
ALTER TABLE plataforma_config ADD CONSTRAINT plataforma_config_pecas_p7_minimo_check CHECK (pecas_p7_minimo >= 1);

-- ---------- 3b: oficina fornecedora ----------
-- alcance da vendedora: NULL = raio de hoje; 'pais' = mesmo pais, sem limite de distancia (N-6)
ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS pecas_alcance text;
ALTER TABLE oficinas DROP CONSTRAINT IF EXISTS oficinas_pecas_alcance_check;
ALTER TABLE oficinas ADD CONSTRAINT oficinas_pecas_alcance_check CHECK (pecas_alcance IS NULL OR pecas_alcance IN ('pais', 'raio'));
-- condicao da peca ofertada (P-23); NULL = oferta de hoje
ALTER TABLE cotacoes_pecas_respostas ADD COLUMN IF NOT EXISTS condicao text;
ALTER TABLE cotacoes_pecas_respostas DROP CONSTRAINT IF EXISTS respostas_condicao_check;
ALTER TABLE cotacoes_pecas_respostas ADD CONSTRAINT respostas_condicao_check
  CHECK (condicao IS NULL OR condicao IN ('nova', 'sobra_nova', 'usada_propria', 'recondicionada'));

-- ---------- lote 2 (itens de qualidade do Fable) ----------
-- fornecedor do aviso (o resumo deixa de procurar o fornecedor pelo perfil); NULL = linha antiga
ALTER TABLE avisos_email_pecas ADD COLUMN IF NOT EXISTS fornecedor_id uuid;
-- imediato que falhou vai para a fila do resumo com o motivo 'falha'
ALTER TABLE avisos_email_pecas DROP CONSTRAINT IF EXISTS avisos_email_pecas_motivo_check;
ALTER TABLE avisos_email_pecas ADD CONSTRAINT avisos_email_pecas_motivo_check
  CHECK (motivo IS NULL OR motivo IN ('sem_pressa', 'teto', 'falha'));

-- ---------- funcoes de apoio ----------
-- codigo de registro (cnpj) normalizado: so letras e digitos, maiusculas; vazio = NULL (nunca casa)
CREATE OR REPLACE FUNCTION registro_normalizado(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path = public
AS $function$
  SELECT nullif(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '');
$function$;

-- conta de teste do DONO de um fornecedor (loja ou oficina): paridade teste x real
CREATE OR REPLACE FUNCTION fornecedor_conta_teste(p_tipo tipo_fornecedor_peca, p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT CASE WHEN p_tipo = 'loja'
    THEN coalesce((SELECT p.conta_teste FROM lojas_pecas l JOIN profiles p ON p.id = l.profile_id WHERE l.id = p_id), false)
    ELSE oficina_conta_teste(p_id)
  END;
$function$;
REVOKE ALL ON FUNCTION fornecedor_conta_teste(tipo_fornecedor_peca, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fornecedor_conta_teste(tipo_fornecedor_peca, uuid) TO authenticated, service_role;

-- quem chama e parceiro ATIVO (oficina da qual e dono/equipe, ou loja de que e dono) do mesmo tipo de
-- conta que o fornecedor (D-3: avaliacoes publicas para todos os parceiros logados, oficinas e lojas)
CREATE OR REPLACE FUNCTION parceiro_ve_fornecedor(p_tipo tipo_fornecedor_peca, p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT EXISTS (
      SELECT 1 FROM oficinas o
      WHERE o.id IN (SELECT minhas_oficinas()) AND o.ativa
        AND oficina_conta_teste(o.id) = fornecedor_conta_teste(p_tipo, p_id)
    )
    OR EXISTS (
      SELECT 1 FROM lojas_pecas l JOIN profiles p ON p.id = l.profile_id
      WHERE l.profile_id = auth.uid() AND l.ativa
        AND coalesce(p.conta_teste, false) = fornecedor_conta_teste(p_tipo, p_id)
    );
$function$;
REVOKE ALL ON FUNCTION parceiro_ve_fornecedor(tipo_fornecedor_peca, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION parceiro_ve_fornecedor(tipo_fornecedor_peca, uuid) TO authenticated, service_role;

-- ---------- avaliacao por fornecedor (fora do tempo real) ----------
CREATE TABLE IF NOT EXISTS fornecedores_avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL UNIQUE REFERENCES pedidos_pecas(id) ON DELETE CASCADE,
  -- oficina compradora (autora; o nome que aparece e oficinas.nome_fantasia, nunca o nome da pessoa - D-1)
  oficina_id uuid NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  -- so auditoria (quem apertou "enviar")
  autor_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  fornecedor_tipo tipo_fornecedor_peca NOT NULL,
  fornecedor_id uuid NOT NULL,
  nota smallint NOT NULL CHECK (nota >= 1 AND nota <= 5),
  peca_certa boolean,
  no_prazo boolean,
  nao_entregou boolean NOT NULL DEFAULT false,
  comentario text CHECK (comentario IS NULL OR char_length(comentario) <= 300),
  resposta text CHECK (resposta IS NULL OR char_length(resposta) <= 300),
  resposta_em timestamptz,
  editavel_ate timestamptz,
  oculta boolean NOT NULL DEFAULT false,
  oculta_motivo text CHECK (oculta_motivo IS NULL OR char_length(oculta_motivo) <= 300),
  oculta_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  denunciada_em timestamptz,
  denuncia_motivo text CHECK (denuncia_motivo IS NULL OR char_length(denuncia_motivo) <= 300),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fornecedores_avaliacoes_fornecedor_idx ON fornecedores_avaliacoes (fornecedor_tipo, fornecedor_id) WHERE NOT oculta;
CREATE INDEX IF NOT EXISTS fornecedores_avaliacoes_oficina_idx ON fornecedores_avaliacoes (oficina_id);
ALTER TABLE fornecedores_avaliacoes ENABLE ROW LEVEL SECURITY;
-- leitura: parceiros ativos do mesmo tipo de conta (nao ocultas); o proprio fornecedor (tambem as
-- ocultas, com o motivo); a autora (dona e equipe); o admin. Motorista e anon: nada (pagina publica = lote 4).
-- Escrita: nenhuma politica (so as rotas do servidor gravam).
DROP POLICY IF EXISTS fornecedores_avaliacoes_select ON fornecedores_avaliacoes;
CREATE POLICY fornecedores_avaliacoes_select ON fornecedores_avaliacoes FOR SELECT TO authenticated USING (
  eh_admin()
  OR oficina_id IN (SELECT minhas_oficinas())
  OR (fornecedor_tipo = 'loja' AND fornecedor_id IN (SELECT minhas_lojas()))
  OR (fornecedor_tipo = 'oficina' AND fornecedor_id IN (SELECT minhas_oficinas()))
  OR (NOT oculta AND parceiro_ve_fornecedor(fornecedor_tipo, fornecedor_id))
);

-- resumo do fornecedor (so agregados; nao e view: "entregues" conta pedidos de terceiros, que a RLS
-- de pedidos_pecas esconde). Nota e percentuais so a partir de 3 avaliacoes. Nao toca
-- oficinas.avaliacao_media (avaliacao do motorista, 048). Quem nao pode ver recebe 0 linhas.
CREATE OR REPLACE FUNCTION fornecedor_resumo(p_tipo tipo_fornecedor_peca, p_id uuid)
 RETURNS TABLE (media numeric, total integer, pct_peca_certa numeric, pct_no_prazo numeric, nao_entregou_n integer, entregues_n integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT (
    eh_admin()
    OR (p_tipo = 'loja' AND p_id IN (SELECT minhas_lojas()))
    OR (p_tipo = 'oficina' AND p_id IN (SELECT minhas_oficinas()))
    OR parceiro_ve_fornecedor(p_tipo, p_id)
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH a AS (
    SELECT fa.nota, fa.peca_certa, fa.no_prazo, fa.nao_entregou
    FROM fornecedores_avaliacoes fa
    WHERE fa.fornecedor_tipo = p_tipo AND fa.fornecedor_id = p_id AND NOT fa.oculta
  )
  SELECT
    CASE WHEN count(*) >= 3 THEN round(avg(a.nota)::numeric, 2) END,
    count(*)::integer,
    CASE WHEN count(*) >= 3 THEN round(100.0 * count(*) FILTER (WHERE a.peca_certa) / nullif(count(*) FILTER (WHERE a.peca_certa IS NOT NULL), 0), 2) END,
    CASE WHEN count(*) >= 3 THEN round(100.0 * count(*) FILTER (WHERE a.no_prazo) / nullif(count(*) FILTER (WHERE a.no_prazo IS NOT NULL), 0), 2) END,
    (count(*) FILTER (WHERE a.nao_entregou))::integer,
    (SELECT count(*)::integer FROM pedidos_pecas pp
      WHERE pp.fornecedor_tipo = p_tipo AND pp.status = 'entregue'
        AND (CASE WHEN p_tipo = 'loja' THEN pp.loja_id ELSE pp.oficina_fornecedora_id END) = p_id)
  FROM a;
END $function$;
REVOKE ALL ON FUNCTION fornecedor_resumo(tipo_fornecedor_peca, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fornecedor_resumo(tipo_fornecedor_peca, uuid) TO authenticated, service_role;

-- ---------- P-7 (D-7): retorno E avaliacao obrigatorios ----------
-- Pendente = pedido v3 sem avaliacao, entregue/recebido/com problema (nao cancelado) ou cancelado CONTRA
-- o fornecedor ("nao entregou", ou pelo fornecedor exceto "a compradora pediu"); nunca o par com o mesmo
-- codigo de registro (P-20: nao ha avaliacao possivel). Bloqueia quando a data de referencia passou de
-- 3 dias E ja houve o 1o lembrete, e o numero desses pedidos chega a pecas_p7_minimo; so com o global
-- ligado OU a oficina de teste. Guarda de dono: outra oficina recebe false (service role passa).
CREATE OR REPLACE FUNCTION oficina_feedback_pecas_pendente(p_oficina uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_n integer;
  v_minimo integer;
  v_registro text;
BEGIN
  IF p_oficina IS NULL THEN RETURN false; END IF;
  IF auth.uid() IS NOT NULL AND p_oficina NOT IN (SELECT minhas_oficinas()) THEN RETURN false; END IF;
  IF NOT (coalesce((SELECT pecas_v3_ativo FROM plataforma_config WHERE id = 1), false) OR oficina_conta_teste(p_oficina)) THEN
    RETURN false;
  END IF;
  SELECT registro_normalizado(cnpj) INTO v_registro FROM oficinas WHERE id = p_oficina;
  SELECT count(*) INTO v_n
  FROM pedidos_pecas pp
  WHERE pp.oficina_id = p_oficina AND pp.v3
    AND NOT EXISTS (SELECT 1 FROM fornecedores_avaliacoes fa WHERE fa.pedido_id = pp.id)
    AND (
      (pp.status <> 'cancelado' AND (pp.entregue_em IS NOT NULL OR pp.recebido_em IS NOT NULL OR pp.problema IS NOT NULL))
      OR (pp.status = 'cancelado' AND (
        pp.cancelado_motivo = 'nao_entregou'
        OR (pp.cancelado_por = 'fornecedor' AND coalesce(pp.cancelado_motivo, '') <> 'compradora_pediu')
      ))
    )
    AND (v_registro IS NULL OR v_registro IS DISTINCT FROM registro_normalizado(
      CASE WHEN pp.fornecedor_tipo = 'loja'
        THEN (SELECT l.cnpj FROM lojas_pecas l WHERE l.id = pp.loja_id)
        ELSE (SELECT o.cnpj FROM oficinas o WHERE o.id = pp.oficina_fornecedora_id)
      END))
    AND coalesce(pp.entregue_em, pp.recebido_em, pp.problema_em, pp.cancelado_em) < now() - interval '3 days'
    AND pp.lembretes_feedback >= 1;
  SELECT coalesce(pecas_p7_minimo, 1) INTO v_minimo FROM plataforma_config WHERE id = 1;
  RETURN v_n >= coalesce(v_minimo, 1);
END $function$;
REVOKE ALL ON FUNCTION oficina_feedback_pecas_pendente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION oficina_feedback_pecas_pendente(uuid) TO authenticated, service_role;

-- criar cotacao: a de hoje (dona de oficina ativa, 091) + sem feedback de pecas pendente (P-7)
DROP POLICY IF EXISTS cotacoes_pecas_insert ON cotacoes_pecas;
CREATE POLICY cotacoes_pecas_insert ON cotacoes_pecas FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM oficinas WHERE id = oficina_id AND profile_id = auth.uid() AND ativa)
  AND NOT oficina_feedback_pecas_pendente(oficina_id)
);

-- ---------- 3c: Web Push do navegador (so o servidor le e grava; fora do tempo real) ----------
-- nao reaproveita push_tokens (app Expo); uma linha por inscricao do navegador (endpoint unico:
-- quem entra no mesmo navegador fica com a inscricao)
CREATE TABLE IF NOT EXISTS push_navegador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (char_length(endpoint) <= 1000),
  p256dh text NOT NULL CHECK (char_length(p256dh) <= 200),
  auth text NOT NULL CHECK (char_length(auth) <= 100),
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 200),
  criado_em timestamptz NOT NULL DEFAULT now(),
  ultimo_ok timestamptz,
  ultimo_erro text,
  falhas integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_navegador_profile_idx ON push_navegador (profile_id);
ALTER TABLE push_navegador ENABLE ROW LEVEL SECURITY; -- sem politica: so service role

NOTIFY pgrst, 'reload schema';
