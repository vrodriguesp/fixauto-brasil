-- ATENCAO (09/10, mais tarde): o dono desistiu de escolher o servico no
-- "acabei de bater" (fica so carroceria). O valor "vidros" ficou no tipo do
-- banco SEM USO (PostgreSQL nao remove valor de enum); o codigo nao o oferece.
-- Novo tipo de servico "vidros" (teste do dono 09/10, ponto 13: no "acabei de
-- bater" a pessoa escolhe o servico urgente - carroceria, vidro, pane eletrica,
-- pane mecanica, pneu - e o pedido vai so para oficinas habilitadas).
-- ALTER TYPE ... ADD VALUE nao roda dentro de transacao: aplicar sem -1.
ALTER TYPE tipo_servico ADD VALUE IF NOT EXISTS 'vidros';
