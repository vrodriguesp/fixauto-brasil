-- Oficinas podem ler veículos que estejam em solicitações com orçamentos delas
CREATE POLICY "veiculos_select_oficina" ON veiculos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM solicitacoes s
    JOIN orcamentos o ON o.solicitacao_id = s.id
    JOIN oficinas of ON of.id = o.oficina_id
    WHERE s.veiculo_id = veiculos.id
    AND of.profile_id = auth.uid()
  )
);

-- Funcionarios da oficina também podem ler veículos
CREATE POLICY "veiculos_select_funcionario" ON veiculos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM solicitacoes s
    JOIN orcamentos o ON o.solicitacao_id = s.id
    JOIN funcionarios f ON f.oficina_id = o.oficina_id
    WHERE s.veiculo_id = veiculos.id
    AND f.profile_id = auth.uid()
    AND f.ativo = true
  )
);
