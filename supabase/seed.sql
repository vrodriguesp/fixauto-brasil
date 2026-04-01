-- FixAuto Brasil - Seed Data for Development
-- Note: In production, users are created through Supabase Auth.
-- This seed data is for the prototype UI with mock data.

-- Mock Profiles
INSERT INTO profiles (id, tipo, nome, email, telefone) VALUES
  ('11111111-1111-1111-1111-111111111111', 'cliente', 'Joao Silva', 'joao@email.com', '(11) 99999-1111'),
  ('22222222-2222-2222-2222-222222222222', 'cliente', 'Maria Santos', 'maria@email.com', '(11) 99999-2222'),
  ('33333333-3333-3333-3333-333333333333', 'oficina', 'Carlos Mecanica', 'carlos@email.com', '(11) 99999-3333'),
  ('44444444-4444-4444-4444-444444444444', 'oficina', 'Ana Funilaria', 'ana@email.com', '(11) 99999-4444'),
  ('55555555-5555-5555-5555-555555555555', 'oficina', 'Pedro Auto Center', 'pedro@email.com', '(21) 99999-5555');

-- Mock Oficinas (Workshops) - Sao Paulo area
INSERT INTO oficinas (id, profile_id, nome_fantasia, cnpj, endereco, cidade, estado, cep, latitude, longitude, raio_atendimento_km, especialidades, avaliacao_media, total_avaliacoes) VALUES
  ('aaa11111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Carlos Auto Mecanica', '12.345.678/0001-01', 'Rua Augusta, 1500', 'Sao Paulo', 'SP', '01304-001', -23.5558, -46.6621, 25, '{mecanica,eletrica,manutencao}', 4.5, 127),
  ('bbb22222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'Ana Funilaria & Pintura', '98.765.432/0001-02', 'Av. Paulista, 900', 'Sao Paulo', 'SP', '01310-100', -23.5631, -46.6544, 20, '{funilaria,pintura,colisao}', 4.8, 89),
  ('ccc33333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 'Pedro Auto Center', '11.222.333/0001-03', 'Rua Oscar Freire, 300', 'Sao Paulo', 'SP', '01426-001', -23.5620, -46.6720, 30, '{mecanica,funilaria,pintura,colisao,manutencao,eletrica}', 4.2, 203);

-- Mock Veiculos
INSERT INTO veiculos (id, profile_id, fipe_tipo, fipe_marca, fipe_modelo, fipe_ano, fipe_codigo, fipe_valor, placa, cor, apelido) VALUES
  ('vvv11111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'cars', 'Volkswagen', 'Gol 1.0 12V', '2021', '005527-0', 'R$ 65.500,00', 'ABC-1234', 'Prata', 'Golzinho'),
  ('vvv22222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'cars', 'Fiat', 'Argo Drive 1.0', '2022', '009001-1', 'R$ 72.000,00', 'DEF-5678', 'Branco', 'Argo'),
  ('vvv33333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'cars', 'Chevrolet', 'Onix 1.0 Turbo', '2023', '007123-4', 'R$ 85.900,00', 'GHI-9012', 'Preto', NULL);

-- Mock Solicitacoes
INSERT INTO solicitacoes (id, cliente_id, veiculo_id, tipo, descricao, urgencia, status, latitude, longitude, endereco) VALUES
  ('sss11111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'vvv11111-1111-1111-1111-111111111111', 'colisao', 'Batida no para-choque traseiro. O carro foi atingido no estacionamento do shopping. Amassou o para-choque e trincou a lanterna traseira direita.', 'media', 'em_orcamento', -23.5505, -46.6333, 'Mooca, Sao Paulo - SP'),
  ('sss22222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'vvv22222-2222-2222-2222-222222222222', 'manutencao', 'Revisao dos 30.000km. Preciso trocar oleo, filtros e verificar freios.', 'baixa', 'aberta', -23.5505, -46.6333, 'Mooca, Sao Paulo - SP'),
  ('sss33333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'vvv33333-3333-3333-3333-333333333333', 'funilaria', 'Porta do motorista amassada apos acidente. Preciso de funilaria e pintura da porta inteira.', 'alta', 'aceita', -23.5700, -46.6500, 'Vila Mariana, Sao Paulo - SP');

-- Mock Fotos
INSERT INTO solicitacao_fotos (id, solicitacao_id, foto_url, descricao) VALUES
  ('fff11111-1111-1111-1111-111111111111', 'sss11111-1111-1111-1111-111111111111', '/images/mock-damage-1.jpg', 'Para-choque traseiro amassado'),
  ('fff22222-2222-2222-2222-222222222222', 'sss11111-1111-1111-1111-111111111111', '/images/mock-damage-2.jpg', 'Lanterna trincada'),
  ('fff33333-3333-3333-3333-333333333333', 'sss33333-3333-3333-3333-333333333333', '/images/mock-damage-3.jpg', 'Porta amassada');

-- Mock Orcamentos
INSERT INTO orcamentos (id, solicitacao_id, oficina_id, status, valor_total, prazo_dias, observacoes, validade) VALUES
  ('ooo11111-1111-1111-1111-111111111111', 'sss11111-1111-1111-1111-111111111111', 'bbb22222-2222-2222-2222-222222222222', 'enviado', 2850.00, 5, 'Inclui para-choque novo e lanterna original. Garantia de 6 meses na pintura.', '2026-04-30'),
  ('ooo22222-2222-2222-2222-222222222222', 'sss11111-1111-1111-1111-111111111111', 'ccc33333-3333-3333-3333-333333333333', 'enviado', 2200.00, 7, 'Para-choque recuperado (nao troca). Lanterna paralela de boa qualidade.', '2026-04-30'),
  ('ooo33333-3333-3333-3333-333333333333', 'sss33333-3333-3333-3333-333333333333', 'bbb22222-2222-2222-2222-222222222222', 'aceito', 3500.00, 4, 'Funilaria completa e pintura da porta. Peca original.', '2026-04-30');

-- Mock Orcamento Itens
INSERT INTO orcamento_itens (orcamento_id, descricao, tipo, valor_unitario, quantidade, valor_total) VALUES
  ('ooo11111-1111-1111-1111-111111111111', 'Para-choque traseiro novo', 'peca', 950.00, 1, 950.00),
  ('ooo11111-1111-1111-1111-111111111111', 'Lanterna traseira direita', 'peca', 450.00, 1, 450.00),
  ('ooo11111-1111-1111-1111-111111111111', 'Pintura para-choque', 'mao_de_obra', 800.00, 1, 800.00),
  ('ooo11111-1111-1111-1111-111111111111', 'Instalacao e acabamento', 'mao_de_obra', 650.00, 1, 650.00),
  ('ooo22222-2222-2222-2222-222222222222', 'Recuperacao para-choque', 'mao_de_obra', 600.00, 1, 600.00),
  ('ooo22222-2222-2222-2222-222222222222', 'Lanterna paralela', 'peca', 280.00, 1, 280.00),
  ('ooo22222-2222-2222-2222-222222222222', 'Pintura e polimento', 'mao_de_obra', 900.00, 1, 900.00),
  ('ooo22222-2222-2222-2222-222222222222', 'Material de pintura', 'material', 420.00, 1, 420.00),
  ('ooo33333-3333-3333-3333-333333333333', 'Funilaria porta motorista', 'mao_de_obra', 1200.00, 1, 1200.00),
  ('ooo33333-3333-3333-3333-333333333333', 'Pintura porta completa', 'mao_de_obra', 1500.00, 1, 1500.00),
  ('ooo33333-3333-3333-3333-333333333333', 'Material de pintura', 'material', 800.00, 1, 800.00);

-- Mock Agenda
INSERT INTO agenda (oficina_id, solicitacao_id, titulo, descricao, data_inicio, data_fim, tipo, status, cor) VALUES
  ('bbb22222-2222-2222-2222-222222222222', 'sss33333-3333-3333-3333-333333333333', 'Funilaria - Onix Preto', 'Porta motorista - Maria Santos', '2026-04-02 08:00:00', '2026-04-04 18:00:00', 'plataforma', 'agendado', '#3B82F6'),
  ('bbb22222-2222-2222-2222-222222222222', NULL, 'Polimento - Cliente externo', 'Polimento cristalizado Civic', '2026-04-05 09:00:00', '2026-04-05 17:00:00', 'externo', 'agendado', '#10B981'),
  ('aaa11111-1111-1111-1111-111111111111', NULL, 'Troca de oleo - Corolla', 'Cliente regular - Sr. Roberto', '2026-04-01 14:00:00', '2026-04-01 16:00:00', 'externo', 'agendado', '#F59E0B');

-- Mock Avaliacoes
INSERT INTO avaliacoes (solicitacao_id, cliente_id, oficina_id, nota, comentario) VALUES
  ('sss33333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'bbb22222-2222-2222-2222-222222222222', 5, 'Excelente trabalho! A porta ficou como nova. Muito profissional e cumpriu o prazo.');

-- Mock Notificacoes
INSERT INTO notificacoes (profile_id, tipo, titulo, mensagem, lida, dados) VALUES
  ('11111111-1111-1111-1111-111111111111', 'novo_orcamento', 'Novo orcamento recebido', 'Ana Funilaria & Pintura enviou um orcamento de R$ 2.850,00', false, '{"solicitacao_id": "sss11111-1111-1111-1111-111111111111", "orcamento_id": "ooo11111-1111-1111-1111-111111111111"}'),
  ('11111111-1111-1111-1111-111111111111', 'novo_orcamento', 'Novo orcamento recebido', 'Pedro Auto Center enviou um orcamento de R$ 2.200,00', false, '{"solicitacao_id": "sss11111-1111-1111-1111-111111111111", "orcamento_id": "ooo22222-2222-2222-2222-222222222222"}'),
  ('33333333-3333-3333-3333-333333333333', 'nova_solicitacao', 'Nova solicitacao proxima', 'Um cliente precisa de manutencao a 3km de voce', true, '{"solicitacao_id": "sss22222-2222-2222-2222-222222222222"}');
