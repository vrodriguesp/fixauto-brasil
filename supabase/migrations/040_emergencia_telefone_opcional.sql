-- Cliente logado sem telefone no perfil nao conseguia registrar acidente
-- ("null value in column telefone"): o telefone e pedido so a quem registra
-- sem conta; com conta, o contato ja e o e-mail/notificacoes do perfil.
ALTER TABLE emergencias ALTER COLUMN telefone DROP NOT NULL;
