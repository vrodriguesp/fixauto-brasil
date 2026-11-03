-- Dono 03/11, com a primeira oficina real:
-- 1) Pedido do tipo "outro" vai para toda oficina no raio, qualquer que seja a
--    especialidade. Antes so chegava a oficina sem especialidade marcada ou que
--    marcou "outro" - na pratica a quase ninguem (um pedido aberto a 4,5 km nao aparecia
--    para ela). Mesma regra em packages/shared (tipoCompativel).
-- 2) Endereco ganha "complemento" (predio, nome do centro, andar): a oficina
--    escreveu o nome do centro no campo numero e o endereco ficou sem o 6.

CREATE OR REPLACE FUNCTION tipo_compativel(p_especialidades tipo_servico[], p_tipo tipo_servico)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_especialidades IS NULL OR cardinality(p_especialidades) = 0
      OR p_tipo::text = 'outro'
      OR p_tipo = ANY (p_especialidades)
      OR (p_tipo::text IN ('colisao', 'funilaria', 'pintura')
          AND p_especialidades && ARRAY['colisao', 'funilaria', 'pintura']::tipo_servico[]);
$$;

ALTER TABLE oficinas ADD COLUMN IF NOT EXISTS complemento text;
ALTER TABLE lojas_pecas ADD COLUMN IF NOT EXISTS complemento text;
