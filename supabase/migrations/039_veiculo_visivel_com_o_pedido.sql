-- A oficina so via o carro do pedido DEPOIS de mandar orcamento: na lista de
-- pedidos e na pagina do pedido o titulo (marca/modelo) ficava vazio, e ela
-- precisa saber o carro justamente para orcar. Agora o carro e visivel para
-- quem pode ver o pedido (oficinas enquanto o pedido esta aberto, oficinas
-- envolvidas, admin) - a mesma regra do proprio pedido.
DROP POLICY IF EXISTS veiculos_select_pedido ON veiculos;
CREATE POLICY veiculos_select_pedido ON veiculos FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM solicitacoes s WHERE s.veiculo_id = veiculos.id AND pode_ver_solicitacao(s.id))
);
