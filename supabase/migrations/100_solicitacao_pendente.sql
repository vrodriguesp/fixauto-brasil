-- 100: liga o pedido ao "pedido guardado" (pedidos_pendentes) que o originou (dono 19/11).
-- O botao do e-mail de confirmacao (?p=<id do pendente>) continua a funcionar depois de o
-- pedido ser confirmado: a pagina leva a pessoa ao pedido (login se preciso) em vez de
-- "link invalido". O pendente e apagado ao confirmar; este campo e o rasto que fica.
alter table public.solicitacoes add column if not exists pendente_id uuid;
create index if not exists solicitacoes_pendente_id_idx on public.solicitacoes (pendente_id) where pendente_id is not null;
