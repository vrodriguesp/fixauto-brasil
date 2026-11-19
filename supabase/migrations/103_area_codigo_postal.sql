-- 103 (dono 19/11 noite, pedido 100151): endereco que comeca por "codigo postal + localidade" ("76505 Saue linn, Estonia")
-- perdia a localidade - a 1a parte com numero era tratada como rua e a area ficava so "Estonia". Agora a 1a parte so
-- e descartada como rua quando nao e "codigo postal + nome". Recalcula a area dos pedidos com a tabela privada e troca a
-- area antiga pela nova nos avisos das oficinas. Idempotente.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.area_do_endereco(p text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE partes text[]; r text[] := '{}'; p2 text; i int; n int;
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  partes := regexp_split_to_array(p, '\s*,\s*');
  n := array_length(partes, 1);
  -- uma parte so e com numero ("Tartu mnt 50"): nao da para separar a rua - sem area (mas "76505 Saue" e area)
  IF n = 1 AND partes[1] ~ '\d' AND partes[1] !~ '^\s*\d{4,6}\s+\D+$' THEN RETURN NULL; END IF;
  FOR i IN 1..n LOOP
    p2 := btrim(partes[i]);
    IF p2 = '' THEN CONTINUE; END IF;
    IF i = 1 AND p2 ~ '\d' AND p2 !~ '^\d{4,6}\s+\D+$' THEN CONTINUE; END IF;  -- rua + numero
    IF p2 ~ '^-?\d+([.,]\d+)?$' THEN CONTINUE; END IF;          -- coordenada ou codigo postal solto
    p2 := btrim(regexp_replace(p2, '^\d{4,6}\s+', ''));         -- "10115 Tallinn" -> "Tallinn"
    p2 := btrim(regexp_replace(p2, '\s+\d{4,6}$', ''));         -- "Tallinn 10115" -> "Tallinn"
    IF p2 = '' OR p2 ~ '\d' THEN CONTINUE; END IF;              -- sobrou numero: nao e area
    IF NOT (p2 = ANY (r)) THEN r := r || p2; END IF;
  END LOOP;
  RETURN nullif(array_to_string(r, ', '), '');
END $$;

-- area nova nos avisos das oficinas (antes de mudar a linha: precisa da area antiga)
CREATE TEMP TABLE _area_nova ON COMMIT DROP AS
SELECT s.id, s.area AS antiga, public.area_do_endereco(sp.endereco) AS nova
FROM public.solicitacoes s JOIN public.solicitacoes_privado sp ON sp.solicitacao_id = s.id
WHERE public.area_do_endereco(sp.endereco) IS NOT NULL
  AND public.area_do_endereco(sp.endereco) IS DISTINCT FROM s.area;

UPDATE public.notificacoes n
SET mensagem = regexp_replace(n.mensagem, ' - ' || a.antiga || '$', ' - ' || a.nova),
    dados = replace(n.dados::text, '"' || a.antiga || '"', '"' || a.nova || '"')::jsonb
FROM _area_nova a
WHERE n.dados->>'solicitacao_id' = a.id::text AND a.antiga IS NOT NULL
  AND n.tipo IN ('nova_solicitacao', 'pedido_convite', 'cobranca_admin_solicitacao', 'lembrete_pedido');

-- a linha publica: area e endereco (que na linha e a propria area). Direto, sem passar pelo gatilho de privacidade.
ALTER TABLE public.solicitacoes DISABLE TRIGGER USER;
UPDATE public.solicitacoes s SET area = a.nova, endereco = a.nova FROM _area_nova a WHERE s.id = a.id;
ALTER TABLE public.solicitacoes ENABLE TRIGGER USER;

COMMIT;
