-- Historico da agenda: acoes que o codigo grava e o banco recusava em
-- silencio (achado no teste de 09/10): 'retirado_revisao_recusada' (cliente
-- recusou a revisao de preco e retirou o carro, migracao 049) e 'elevador'
-- (troca de elevador/box, migracao 053).
ALTER TABLE agenda_historico DROP CONSTRAINT IF EXISTS agenda_historico_acao_check;
ALTER TABLE agenda_historico ADD CONSTRAINT agenda_historico_acao_check
  CHECK (acao = ANY (ARRAY['checkin', 'checkin_antecipado', 'atribuido', 'etapa', 'entregue', 'retirado_revisao_recusada', 'elevador']));
