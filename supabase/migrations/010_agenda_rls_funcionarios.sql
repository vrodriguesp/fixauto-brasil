-- Migration 010: Allow funcionarios and clients to read agenda entries

-- Funcionarios can SELECT agenda for their oficina
CREATE POLICY "agenda_select_funcionario" ON agenda FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM funcionarios
    WHERE funcionarios.oficina_id = agenda.oficina_id
    AND funcionarios.profile_id = auth.uid()
    AND funcionarios.ativo = true
  )
);

-- Funcionarios can UPDATE agenda (for check-in actions)
CREATE POLICY "agenda_update_funcionario" ON agenda FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM funcionarios
    WHERE funcionarios.oficina_id = agenda.oficina_id
    AND funcionarios.profile_id = auth.uid()
    AND funcionarios.ativo = true
  )
);

-- Clients can read agenda entries for their own solicitacoes
CREATE POLICY "agenda_select_cliente" ON agenda FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM solicitacoes
    WHERE solicitacoes.id = agenda.solicitacao_id
    AND solicitacoes.cliente_id = auth.uid()
  )
);
