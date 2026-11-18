-- Dono 18/11: novo tipo de pedido "Vidros" (ET Klaasid, RU Стёкла, EN Glass).
-- O valor 'vidros' ja existe no enum tipo_servico desde a migracao 055 (ficou sem uso
-- quando o dono desistiu do tipo no "acabei de bater", 09/10) - aqui so garantimos
-- que ele existe (sem efeito onde ja existe) e deixamos a regra registrada.
--
-- Regra de quem recebe (sem mudanca de logica - mesma de packages/shared tipoCompativel):
--   * 'vidros' NAO e do grupo carroceria (colisao/funilaria/pintura) e NAO e 'outro':
--     so a oficina que marcou 'vidros' (ou que nao marcou especialidade nenhuma) recebe,
--     dentro do raio;
--   * 'outro' ("Outro / nao sei" para o motorista) continua indo para toda oficina no raio
--     (dono 03/11, migracao 067).
--
-- Aditiva e idempotente; roda dentro de transacao (psql -1): ADD VALUE IF NOT EXISTS
-- e permitido em transacao no PostgreSQL 12+ e o valor novo nao e usado nesta transacao.

ALTER TYPE tipo_servico ADD VALUE IF NOT EXISTS 'vidros';

-- mesma funcao da 067 (corpo identico), so reafirmada para a regra ficar num lugar so
CREATE OR REPLACE FUNCTION tipo_compativel(p_especialidades tipo_servico[], p_tipo tipo_servico)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_especialidades IS NULL OR cardinality(p_especialidades) = 0
      OR p_tipo::text = 'outro'
      OR p_tipo = ANY (p_especialidades)
      OR (p_tipo::text IN ('colisao', 'funilaria', 'pintura')
          AND p_especialidades && ARRAY['colisao', 'funilaria', 'pintura']::tipo_servico[]);
$$;

COMMENT ON FUNCTION tipo_compativel(tipo_servico[], tipo_servico) IS
  'A oficina atende este tipo? Sem especialidade = tudo; outro = toda oficina; colisao/funilaria/pintura = grupo carroceria; demais (revisao, mecanica, eletrica, pneu, vidros) = a oficina precisa ter marcado o tipo. Igual a tipoCompativel em packages/shared (095).';
