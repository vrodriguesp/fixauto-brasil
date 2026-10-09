-- Auditoria Fable 08/10 (B-11): o tipo do acidente ficava so como marcador
-- "[TIPO:...]" no texto da descricao. Agora tem coluna propria (o marcador
-- continua como reserva para registros antigos).
ALTER TABLE emergencias ADD COLUMN IF NOT EXISTS tipo_acidente text CHECK (tipo_acidente IN ('eu_causei', 'outro_causou', 'sem_outro'));
ALTER TABLE solicitacoes ADD COLUMN IF NOT EXISTS tipo_acidente text CHECK (tipo_acidente IN ('eu_causei', 'outro_causou', 'sem_outro'));
UPDATE emergencias SET tipo_acidente = substring(descricao from '\[TIPO:(eu_causei|outro_causou|sem_outro)\]') WHERE tipo_acidente IS NULL AND descricao LIKE '%[TIPO:%';
UPDATE solicitacoes SET tipo_acidente = substring(descricao from '\[TIPO:(eu_causei|outro_causou|sem_outro)\]') WHERE tipo_acidente IS NULL AND descricao LIKE '%[TIPO:%';

CREATE OR REPLACE FUNCTION eh_pagador_do_reparo(p_sol uuid, p_profile uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p_profile IS NOT NULL AND EXISTS (
    SELECT 1 FROM emergencias e
    JOIN emergencia_outro_veiculo o ON o.emergencia_id = e.id
    WHERE e.solicitacao_id = p_sol
      AND coalesce(e.tipo_acidente, substring(e.descricao from '\[TIPO:(\w+)\]')) = 'outro_causou'
      AND (o.profile_id = p_profile
           OR (o.email IS NOT NULL AND lower(o.email) = (SELECT lower(email) FROM profiles WHERE id = p_profile)))
  );
$$;
