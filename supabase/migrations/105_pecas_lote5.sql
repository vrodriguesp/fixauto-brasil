-- 105: pecas lote 5 (20/11/2026) - catalogo v3, promocoes, Shop e "pedir de novo" (cotacao de 1 fornecedor).
-- Mapa: Documentos/Analises/Pecas_lote5_2026-11-20/Mapa_lote5.md (+ Fable_auditoria_mapa_lote5.md).
-- Aditiva e idempotente (pode rodar 2x). Transacao unica: psql -1 -v ON_ERROR_STOP=1 -f 105_pecas_lote5.sql
-- Segura ANTES do build: o codigo no ar nao le as colunas/tabela novas e nunca grava alvo = 'fornecedor_unico';
-- as politicas novas sao RESTRITIVAS e so cortam linhas com alvo = 'fornecedor_unico' (nenhuma existe antes do lote 5);
-- as politicas permissivas de hoje ficam identicas (md5 do M0b do pecas-v3-lote3-desligado).
-- Interruptor proprio (padrao false): pecas_shop_ativo (Shop + "pedir" + "pedir de novo"; exige tambem pecas_v3_ativo).
-- Contas de teste veem antes. Itens/promocoes na pagina publica: CORTADO do lote 5 (auditoria Fable do mapa, achado 5).
-- Itens antigos do catalogo ficam 'interno' (a tela de hoje promete "as oficinas ainda nao veem esta lista"):
-- so entram no Shop quando a loja escolher "oficinas" (auditoria, achado 1).
--
-- Rollback (so depois de voltar o codigo):
--   DROP POLICY IF EXISTS cotacoes_pecas_alvo_lote5 ON cotacoes_pecas;
--   DROP POLICY IF EXISTS cotacoes_respostas_alvo_lote5 ON cotacoes_pecas_respostas;
--   DROP POLICY IF EXISTS pecas_mensagens_alvo_lote5 ON cotacoes_pecas_mensagens;
--   DROP TRIGGER IF EXISTS trg_p5_cotacao_alvo ON cotacoes_pecas; DROP FUNCTION IF EXISTS p5_cotacao_alvo();
--   DROP FUNCTION IF EXISTS cotacao_alvo_permite(uuid, text, uuid);
--   ALTER TABLE cotacoes_pecas DROP CONSTRAINT IF EXISTS cotacoes_pecas_alvo_check;
--   ALTER TABLE cotacoes_pecas ADD CONSTRAINT cotacoes_pecas_alvo_check CHECK (alvo IN ('todos', 'so_lojas'));  -- (falha se houver linhas 'fornecedor_unico': apagar/mudar antes)
--   ALTER TABLE cotacoes_pecas DROP COLUMN IF EXISTS fornecedor_alvo_tipo, DROP COLUMN IF EXISTS fornecedor_alvo_id,
--     DROP COLUMN IF EXISTS catalogo_item_id, DROP COLUMN IF EXISTS promocao_id, DROP COLUMN IF EXISTS preco_referencia,
--     DROP COLUMN IF EXISTS origem;
--   DROP TABLE IF EXISTS promocoes_pecas; DROP FUNCTION IF EXISTS p5_promocao_regras();
--   DROP TRIGGER IF EXISTS trg_p5_catalogo ON pecas_catalogo; DROP FUNCTION IF EXISTS p5_catalogo_regras();
--   ALTER TABLE pecas_catalogo DROP CONSTRAINT IF EXISTS pecas_catalogo_p5_check;
--   ALTER TABLE pecas_catalogo DROP COLUMN IF EXISTS codigo, DROP COLUMN IF EXISTS especificacao, DROP COLUMN IF EXISTS unidade,
--     DROP COLUMN IF EXISTS embalagem, DROP COLUMN IF EXISTS condicao, DROP COLUMN IF EXISTS visibilidade,
--     DROP COLUMN IF EXISTS atualizado_em, DROP COLUMN IF EXISTS oculto, DROP COLUMN IF EXISTS oculto_motivo, DROP COLUMN IF EXISTS oculto_em;
--   DROP POLICY IF EXISTS pecas_catalogo_delete_oculto_lote5 ON pecas_catalogo; DROP POLICY IF EXISTS promocoes_pecas_delete_oculta_lote5 ON promocoes_pecas;
--   ALTER TABLE plataforma_config DROP COLUMN IF EXISTS pecas_shop_ativo;
--   NOTIFY pgrst, 'reload schema';
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---------- interruptores ----------
ALTER TABLE plataforma_config ADD COLUMN IF NOT EXISTS pecas_shop_ativo boolean NOT NULL DEFAULT false;

-- ---------- pecas_catalogo: colunas v3 (padroes = hoje; itens antigos ficam 'interno' = ninguem alem da loja ve) ----------
ALTER TABLE pecas_catalogo ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE pecas_catalogo ADD COLUMN IF NOT EXISTS especificacao text;
ALTER TABLE pecas_catalogo ADD COLUMN IF NOT EXISTS unidade text NOT NULL DEFAULT 'un';
ALTER TABLE pecas_catalogo ADD COLUMN IF NOT EXISTS embalagem text;
ALTER TABLE pecas_catalogo ADD COLUMN IF NOT EXISTS condicao text NOT NULL DEFAULT 'nova';
ALTER TABLE pecas_catalogo ADD COLUMN IF NOT EXISTS visibilidade text NOT NULL DEFAULT 'interno';
-- atualizado_em dos itens antigos = created_at (nao "atualizado hoje"); depois o gatilho mantem
ALTER TABLE pecas_catalogo ADD COLUMN IF NOT EXISTS atualizado_em timestamptz;
DROP TRIGGER IF EXISTS trg_p5_catalogo ON pecas_catalogo;  -- recriado abaixo (o UPDATE nao pode carimbar now())
UPDATE pecas_catalogo SET atualizado_em = created_at WHERE atualizado_em IS NULL;
ALTER TABLE pecas_catalogo ALTER COLUMN atualizado_em SET DEFAULT now();
ALTER TABLE pecas_catalogo ALTER COLUMN atualizado_em SET NOT NULL;
ALTER TABLE pecas_catalogo ADD COLUMN IF NOT EXISTS oculto boolean NOT NULL DEFAULT false;
ALTER TABLE pecas_catalogo ADD COLUMN IF NOT EXISTS oculto_motivo text;
ALTER TABLE pecas_catalogo ADD COLUMN IF NOT EXISTS oculto_em timestamptz;
-- NOT VALID: vale para linhas novas/alteradas; linhas antigas de producao fora da regra nao travam a migracao
ALTER TABLE pecas_catalogo DROP CONSTRAINT IF EXISTS pecas_catalogo_p5_check;
ALTER TABLE pecas_catalogo ADD CONSTRAINT pecas_catalogo_p5_check CHECK (
  unidade IN ('un', 'jogo', 'par', 'litro', 'kg', 'metro', 'caixa')
  AND condicao IN ('nova', 'usada', 'recondicionada')
  AND visibilidade IN ('interno', 'oficinas', 'publico')
  AND preco > 0 AND preco < 1000000
  AND quantidade_estoque >= 0
  AND char_length(nome) BETWEEN 1 AND 120
  AND (descricao IS NULL OR char_length(descricao) <= 600)
  AND (codigo IS NULL OR char_length(codigo) <= 60)
  AND (especificacao IS NULL OR char_length(especificacao) <= 200)
  AND (embalagem IS NULL OR char_length(embalagem) <= 40)
  AND (oculto_motivo IS NULL OR char_length(oculto_motivo) <= 300)
  AND (fipe_marca IS NULL OR char_length(fipe_marca) <= 60)
  AND (fipe_modelo IS NULL OR char_length(fipe_modelo) <= 80)
  AND (fipe_ano IS NULL OR char_length(fipe_ano) <= 20)
) NOT VALID;

-- loja dona fixa; oculto/motivo so pelo servidor/admin; atualizado_em pelo banco
CREATE OR REPLACE FUNCTION p5_catalogo_regras()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF chamada_de_usuario() AND NOT eh_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.oculto := false; NEW.oculto_motivo := NULL; NEW.oculto_em := NULL;
    ELSE
      NEW.loja_id := OLD.loja_id;
      NEW.oculto := OLD.oculto; NEW.oculto_motivo := OLD.oculto_motivo; NEW.oculto_em := OLD.oculto_em;
    END IF;
  END IF;
  -- "atualizado ha" so muda quando muda o que a oficina compara (auditoria dos testes B4): moderacao, quem ve e ativo nao contam
  IF TG_OP = 'INSERT' OR NEW.preco IS DISTINCT FROM OLD.preco OR NEW.nome IS DISTINCT FROM OLD.nome OR NEW.codigo IS DISTINCT FROM OLD.codigo
     OR NEW.especificacao IS DISTINCT FROM OLD.especificacao OR NEW.unidade IS DISTINCT FROM OLD.unidade OR NEW.embalagem IS DISTINCT FROM OLD.embalagem
     OR NEW.condicao IS DISTINCT FROM OLD.condicao OR NEW.descricao IS DISTINCT FROM OLD.descricao THEN
    NEW.atualizado_em := now();
  ELSE
    NEW.atualizado_em := OLD.atualizado_em;
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_p5_catalogo ON pecas_catalogo;
CREATE TRIGGER trg_p5_catalogo BEFORE INSERT OR UPDATE ON pecas_catalogo
  FOR EACH ROW EXECUTE FUNCTION p5_catalogo_regras();
CREATE INDEX IF NOT EXISTS idx_pecas_catalogo_ativo ON pecas_catalogo (loja_id) WHERE ativo AND NOT oculto;
-- moderacao nao se contorna apagando e recriando: item oculto pelo admin nao se apaga (RESTRITIVA; a de hoje fica igual)
DROP POLICY IF EXISTS pecas_catalogo_delete_oculto_lote5 ON pecas_catalogo;
CREATE POLICY pecas_catalogo_delete_oculto_lote5 ON pecas_catalogo AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT oculto OR (SELECT eh_admin()));

-- ---------- promocoes_pecas (D-11: sem limite de produto, 3 em destaque, ate 30 dias; P-14 teto 50; P-15 30 dias) ----------
CREATE TABLE IF NOT EXISTS promocoes_pecas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES lojas_pecas(id) ON DELETE CASCADE,
  item_id uuid REFERENCES pecas_catalogo(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  descricao text,
  preco numeric(12,2) NOT NULL,
  unidade text NOT NULL DEFAULT 'un',
  preco_anterior numeric(12,2),
  confirmo_30_dias boolean NOT NULL DEFAULT false,
  visibilidade text NOT NULL DEFAULT 'oficinas',
  destaque boolean NOT NULL DEFAULT false,
  valido_de timestamptz NOT NULL DEFAULT now(),
  valido_ate timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  oculta boolean NOT NULL DEFAULT false,
  oculta_motivo text,
  oculta_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promocoes_pecas_check CHECK (
    char_length(titulo) BETWEEN 1 AND 120
    AND (descricao IS NULL OR char_length(descricao) <= 600)
    AND preco > 0 AND preco < 1000000
    AND (preco_anterior IS NULL OR (preco_anterior > preco AND preco_anterior < 1000000))
    AND unidade IN ('un', 'jogo', 'par', 'litro', 'kg', 'metro', 'caixa')
    AND visibilidade IN ('oficinas', 'publico')
    -- P-15 (Diretiva 98/6/CE art. 6a): publica com preco anterior so com a confirmacao do menor preco dos 30 dias
    AND (visibilidade <> 'publico' OR preco_anterior IS NULL OR confirmo_30_dias)
    AND valido_ate > valido_de AND valido_ate <= valido_de + interval '30 days 1 minute'
    AND (oculta_motivo IS NULL OR char_length(oculta_motivo) <= 300)
  )
);
CREATE INDEX IF NOT EXISTS idx_promocoes_pecas_loja ON promocoes_pecas (loja_id, valido_ate);

-- regras: loja fixa; item da mesma loja; oculta so admin; datas pelo banco no INSERT do usuario (valido_de >= agora - 1 h);
-- teto de 50 ativas e 3 em destaque por loja (lock por loja contra corrida)
CREATE OR REPLACE FUNCTION p5_promocao_regras()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF chamada_de_usuario() AND NOT eh_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.oculta := false; NEW.oculta_motivo := NULL; NEW.oculta_em := NULL; NEW.created_at := now();
      IF NEW.valido_de < now() - interval '1 hour' THEN NEW.valido_de := now(); END IF;
    ELSE
      NEW.loja_id := OLD.loja_id; NEW.created_at := OLD.created_at;
      NEW.oculta := OLD.oculta; NEW.oculta_motivo := OLD.oculta_motivo; NEW.oculta_em := OLD.oculta_em;
      -- prorrogar sem fim nao: o inicio so anda para frente
      IF NEW.valido_de < OLD.valido_de THEN NEW.valido_de := OLD.valido_de; END IF;
    END IF;
  END IF;
  NEW.updated_at := now();
  IF NEW.item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pecas_catalogo WHERE id = NEW.item_id AND loja_id = NEW.loja_id) THEN
    RAISE EXCEPTION 'item de outra loja' USING ERRCODE = '42501';
  END IF;
  IF NOT NEW.oculta AND NEW.valido_ate > now() THEN
    PERFORM pg_advisory_xact_lock(hashtext('promocoes_pecas:' || NEW.loja_id::text));
    SELECT count(*) INTO n FROM promocoes_pecas
      WHERE loja_id = NEW.loja_id AND id <> NEW.id AND NOT oculta AND valido_ate > now();
    IF n >= 50 THEN RAISE EXCEPTION 'limite de 50 promocoes ativas' USING ERRCODE = '23514'; END IF;
    IF NEW.destaque THEN
      SELECT count(*) INTO n FROM promocoes_pecas
        WHERE loja_id = NEW.loja_id AND id <> NEW.id AND destaque AND NOT oculta AND valido_ate > now();
      IF n >= 3 THEN RAISE EXCEPTION 'limite de 3 promocoes em destaque' USING ERRCODE = '23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_p5_promocao ON promocoes_pecas;
CREATE TRIGGER trg_p5_promocao BEFORE INSERT OR UPDATE ON promocoes_pecas
  FOR EACH ROW EXECUTE FUNCTION p5_promocao_regras();

ALTER TABLE promocoes_pecas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON promocoes_pecas FROM anon;
DROP POLICY IF EXISTS promocoes_pecas_select ON promocoes_pecas;
CREATE POLICY promocoes_pecas_select ON promocoes_pecas FOR SELECT TO authenticated USING (
  loja_id IN (SELECT minhas_lojas()) OR (SELECT eh_admin())
);
DROP POLICY IF EXISTS promocoes_pecas_insert ON promocoes_pecas;
CREATE POLICY promocoes_pecas_insert ON promocoes_pecas FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM lojas_pecas l WHERE l.id = loja_id AND l.profile_id = auth.uid() AND l.ativa)
);
DROP POLICY IF EXISTS promocoes_pecas_update ON promocoes_pecas;
CREATE POLICY promocoes_pecas_update ON promocoes_pecas FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM lojas_pecas l WHERE l.id = loja_id AND l.profile_id = auth.uid() AND l.ativa)
) WITH CHECK (
  EXISTS (SELECT 1 FROM lojas_pecas l WHERE l.id = loja_id AND l.profile_id = auth.uid() AND l.ativa)
);
DROP POLICY IF EXISTS promocoes_pecas_delete ON promocoes_pecas;
CREATE POLICY promocoes_pecas_delete ON promocoes_pecas FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM lojas_pecas l WHERE l.id = loja_id AND l.profile_id = auth.uid())
);
DROP POLICY IF EXISTS promocoes_pecas_delete_oculta_lote5 ON promocoes_pecas;
CREATE POLICY promocoes_pecas_delete_oculta_lote5 ON promocoes_pecas AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT oculta OR (SELECT eh_admin()));

-- ---------- cotacoes_pecas: cotacao de 1 fornecedor (Shop / "pedir de novo"), so pelo servidor ----------
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS fornecedor_alvo_tipo text;
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS fornecedor_alvo_id uuid;
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS catalogo_item_id uuid REFERENCES pecas_catalogo(id) ON DELETE SET NULL;
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS promocao_id uuid REFERENCES promocoes_pecas(id) ON DELETE SET NULL;
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS preco_referencia numeric(12,2);
ALTER TABLE cotacoes_pecas ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE cotacoes_pecas DROP CONSTRAINT IF EXISTS cotacoes_pecas_alvo_check;
ALTER TABLE cotacoes_pecas ADD CONSTRAINT cotacoes_pecas_alvo_check CHECK (alvo IN ('todos', 'so_lojas', 'fornecedor_unico'));
ALTER TABLE cotacoes_pecas DROP CONSTRAINT IF EXISTS cotacoes_pecas_alvo_p5_check;
ALTER TABLE cotacoes_pecas ADD CONSTRAINT cotacoes_pecas_alvo_p5_check CHECK (
  (alvo = 'fornecedor_unico') = (fornecedor_alvo_id IS NOT NULL)
  AND (fornecedor_alvo_id IS NULL OR fornecedor_alvo_tipo = 'loja')
  AND (origem IS NULL OR origem IN ('shop', 'pedir_de_novo'))
  AND (preco_referencia IS NULL OR preco_referencia > 0)
);
CREATE INDEX IF NOT EXISTS idx_cotacoes_pecas_alvo ON cotacoes_pecas (fornecedor_alvo_id) WHERE fornecedor_alvo_id IS NOT NULL;

-- o usuario nunca grava a cotacao de 1 fornecedor nem os campos dela (a rota /api/pecas/pedir grava com service role)
CREATE OR REPLACE FUNCTION p5_cotacao_alvo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.alvo = 'fornecedor_unico' OR NEW.fornecedor_alvo_id IS NOT NULL OR NEW.fornecedor_alvo_tipo IS NOT NULL
       OR NEW.catalogo_item_id IS NOT NULL OR NEW.promocao_id IS NOT NULL OR NEW.preco_referencia IS NOT NULL OR NEW.origem IS NOT NULL THEN
      RAISE EXCEPTION 'cotacao de 1 fornecedor so pelo servidor' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.alvo = 'fornecedor_unico') <> (NEW.alvo = 'fornecedor_unico') THEN
    RAISE EXCEPTION 'alvo da cotacao de 1 fornecedor so pelo servidor' USING ERRCODE = '42501';
  END IF;
  NEW.fornecedor_alvo_tipo := OLD.fornecedor_alvo_tipo; NEW.fornecedor_alvo_id := OLD.fornecedor_alvo_id;
  -- NULL vindo do ON DELETE SET NULL (loja apagou o item/promocao) passa; trocar por outro id nao
  NEW.catalogo_item_id := CASE WHEN NEW.catalogo_item_id IS NULL THEN NULL ELSE OLD.catalogo_item_id END;
  NEW.promocao_id := CASE WHEN NEW.promocao_id IS NULL THEN NULL ELSE OLD.promocao_id END;
  NEW.preco_referencia := OLD.preco_referencia; NEW.origem := OLD.origem;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_p5_cotacao_alvo ON cotacoes_pecas;
CREATE TRIGGER trg_p5_cotacao_alvo BEFORE INSERT OR UPDATE ON cotacoes_pecas
  FOR EACH ROW EXECUTE FUNCTION p5_cotacao_alvo();

-- o fornecedor (tipo, id) pode agir nesta cotacao? (sem RLS: SECURITY DEFINER; so diz "nao" para quem nao e o alvo
-- de uma cotacao de 1 fornecedor; cotacao inexistente = true, as politicas permissivas de hoje decidem)
CREATE OR REPLACE FUNCTION cotacao_alvo_permite(p_cotacao uuid, p_tipo text, p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce((
    SELECT c.alvo IS DISTINCT FROM 'fornecedor_unico'
           OR (c.fornecedor_alvo_tipo = p_tipo AND c.fornecedor_alvo_id = p_id)
    FROM cotacoes_pecas c WHERE c.id = p_cotacao), true);
$function$;
REVOKE ALL ON FUNCTION cotacao_alvo_permite(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cotacao_alvo_permite(uuid, text, uuid) TO authenticated, service_role;

-- RESTRITIVAS (somam-se as permissivas de hoje, que ficam identicas): cotacao de 1 fornecedor so para a compradora
-- (+ equipe), o fornecedor-alvo e admin
DROP POLICY IF EXISTS cotacoes_pecas_alvo_lote5 ON cotacoes_pecas;
CREATE POLICY cotacoes_pecas_alvo_lote5 ON cotacoes_pecas AS RESTRICTIVE FOR SELECT TO authenticated USING (
  alvo IS DISTINCT FROM 'fornecedor_unico'
  OR oficina_id IN (SELECT minhas_oficinas())
  OR (fornecedor_alvo_tipo = 'loja' AND fornecedor_alvo_id IN (SELECT minhas_lojas()))
  OR (SELECT eh_admin())
);
DROP POLICY IF EXISTS cotacoes_respostas_alvo_lote5 ON cotacoes_pecas_respostas;
CREATE POLICY cotacoes_respostas_alvo_lote5 ON cotacoes_pecas_respostas AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
  cotacao_alvo_permite(cotacao_id, fornecedor_tipo::text, CASE WHEN fornecedor_tipo::text = 'loja' THEN loja_id ELSE oficina_fornecedora_id END)
);
DROP POLICY IF EXISTS pecas_mensagens_alvo_lote5 ON cotacoes_pecas_mensagens;
CREATE POLICY pecas_mensagens_alvo_lote5 ON cotacoes_pecas_mensagens AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
  cotacao_alvo_permite(cotacao_id, fornecedor_tipo::text, fornecedor_id)
);

NOTIFY pgrst, 'reload schema';
COMMIT;
