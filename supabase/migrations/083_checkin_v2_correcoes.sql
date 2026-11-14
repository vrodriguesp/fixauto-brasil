-- 083: correcoes da auditoria Fable + QA do check-in v2 (15/11; Documentos/Analises/
-- Auditoria_Fable_checkin_v2_codigo_2026-11-14.md e QA_checkin_v2_2026-11-14.md). Aditiva e idempotente
-- (DROP ... IF EXISTS + CREATE / CREATE OR REPLACE). Vai junto com a 082, antes do site.

-- 1) QA D4 (bug antigo, tambem em producao): orcamento_itens so tinha politicas INSERT/SELECT. A revisao do
--    orcamento pelo navegador (hooks/use-orcamentos.ts update) apaga e regrava os itens; o DELETE nao apagava
--    nada (RLS filtra, sem erro) e os itens duplicavam. Mesmo predicado do itens_insert (dono da oficina do
--    orcamento - funcionario tambem nao insere itens), e nunca num orcamento aceito (a revisao do aceito e
--    pelo servidor, /api/orcamento-revisao, com service role).
DROP POLICY IF EXISTS itens_delete ON orcamento_itens;
CREATE POLICY itens_delete ON orcamento_itens FOR DELETE USING (EXISTS (
  SELECT 1 FROM orcamentos o JOIN oficinas of ON of.id = o.oficina_id
   WHERE o.id = orcamento_itens.orcamento_id AND of.profile_id = auth.uid() AND o.status <> 'aceito'
));

-- 2) Fable R-12: o orcamento novo e gravado pelo navegador em passos (orcamento -> itens -> horarios). Se os
--    horarios forem recusados pelo banco (CHECK da 082, dia fechado abaixo), o orcamento ficava sem horario
--    nenhum e o pedido sem 'em_orcamento'. O navegador agora apaga o orcamento que acabou de criar - e so
--    esse: da propria oficina, 'enviado', criado ha menos de 10 min e SEM nenhum horario (itens vao junto,
--    ON DELETE CASCADE). Nenhum outro orcamento pode ser apagado pelo navegador.
DROP POLICY IF EXISTS orcamentos_delete_orfao ON orcamentos;
CREATE POLICY orcamentos_delete_orfao ON orcamentos FOR DELETE USING (
  EXISTS (SELECT 1 FROM oficinas WHERE oficinas.id = orcamentos.oficina_id AND oficinas.profile_id = auth.uid())
  AND status = 'enviado'
  AND created_at > now() - interval '10 minutes'
  AND NOT EXISTS (SELECT 1 FROM orcamento_disponibilidade d WHERE d.orcamento_id = orcamentos.id)
);

-- 3) QA D16 + Fable R-08: rede de seguranca do dia fechado. O formulario ja desativa os dias fechados e
--    bloqueia o envio (DIA_FECHADO), mas o insert dos horarios e direto do navegador (RLS): um horario num
--    dia em que a oficina esta fechada pelo proprio perfil (horario_funcionamento.<dia>.aberto = false) e
--    recusado. So INSERT e so o caminho do navegador/app (chamada_de_usuario): as rotas do servidor ja
--    validam (079 confirmar/outras datas: DIA_FECHADO) e os scripts/fixtures usam service role.
--    Nao recusa (de proposito):
--     - horario sem perfil, sem o dia ou com JSON estragado (o site usa o padrao da 006; aqui so o "false"
--       explicito conta);
--     - data antes de hoje NO FUSO DA OFICINA (mesmo mapa de lib/fuso.ts; o dia UTC fica um dia atras de
--       madrugada em Tallinn): a revisao apaga e regrava as datas salvas; uma data passada nao pode mais
--       ser aceita (HORARIO_VENCIDO) e o formulario ja bloqueia datas passadas;
--     - pedido em_andamento (carro ja na oficina): o cartao das datas fica escondido e as datas salvas sao
--       regravadas sem validar (e769e31, auditoria Fable R1) - inclusive um sabado antigo.
CREATE OR REPLACE FUNCTION recusar_checkin_dia_fechado() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h jsonb;
  dia jsonb;
  st text;
  pais_of text;
  fuso text;
BEGIN
  IF NOT chamada_de_usuario() THEN RETURN NEW; END IF;
  IF NEW.data_checkin IS NULL THEN RETURN NEW; END IF;
  SELECT of.horario_funcionamento, s.status::text, upper(coalesce(of.pais, '')) INTO h, st, pais_of
    FROM orcamentos o JOIN oficinas of ON of.id = o.oficina_id JOIN solicitacoes s ON s.id = o.solicitacao_id
   WHERE o.id = NEW.orcamento_id;
  fuso := CASE pais_of WHEN 'BR' THEN 'America/Sao_Paulo' WHEN 'PT' THEN 'Europe/Lisbon' WHEN 'IT' THEN 'Europe/Rome'
    WHEN 'LV' THEN 'Europe/Riga' WHEN 'LT' THEN 'Europe/Vilnius' WHEN 'FI' THEN 'Europe/Helsinki' ELSE 'Europe/Tallinn' END;
  IF NEW.data_checkin < (now() AT TIME ZONE fuso)::date THEN RETURN NEW; END IF;
  IF st = 'em_andamento' THEN RETURN NEW; END IF;
  IF h IS NULL OR jsonb_typeof(h) <> 'object' THEN RETURN NEW; END IF;
  dia := h -> (ARRAY['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'])[extract(dow FROM NEW.data_checkin)::int + 1];
  IF dia IS NOT NULL AND jsonb_typeof(dia) = 'object' AND dia -> 'aberto' = 'false'::jsonb THEN
    RAISE EXCEPTION 'DIA_FECHADO' USING ERRCODE = 'P0001', HINT = 'dia fechado pelo horario de funcionamento da oficina';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_checkin_dia_fechado ON orcamento_disponibilidade;
CREATE TRIGGER trg_checkin_dia_fechado BEFORE INSERT ON orcamento_disponibilidade
  FOR EACH ROW EXECUTE FUNCTION recusar_checkin_dia_fechado();
