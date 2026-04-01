import type {
  Profile, Oficina, Veiculo, Solicitacao, SolicitacaoFoto,
  Orcamento, OrcamentoItem, Agenda, Avaliacao, Notificacao
} from '@fixauto/shared';

// === Mock Users ===
export const mockCliente: Profile = {
  id: '11111111-1111-1111-1111-111111111111',
  tipo: 'cliente',
  nome: 'Joao Silva',
  email: 'joao@email.com',
  telefone: '(11) 99999-1111',
  avatar_url: null,
  created_at: '2026-01-15T10:00:00Z',
};

export const mockCliente2: Profile = {
  id: '22222222-2222-2222-2222-222222222222',
  tipo: 'cliente',
  nome: 'Maria Santos',
  email: 'maria@email.com',
  telefone: '(11) 99999-2222',
  avatar_url: null,
  created_at: '2026-02-01T10:00:00Z',
};

export const mockOficinaProfile: Profile = {
  id: '33333333-3333-3333-3333-333333333333',
  tipo: 'oficina',
  nome: 'Carlos Mecanica',
  email: 'carlos@email.com',
  telefone: '(11) 99999-3333',
  avatar_url: null,
  created_at: '2026-01-01T10:00:00Z',
};

// === Mock Oficinas ===
export const mockOficinas: Oficina[] = [
  {
    id: 'aaa11111-1111-1111-1111-111111111111',
    profile_id: '33333333-3333-3333-3333-333333333333',
    nome_fantasia: 'Carlos Auto Mecanica',
    cnpj: '12.345.678/0001-01',
    endereco: 'Rua Augusta, 1500',
    cidade: 'Sao Paulo',
    estado: 'SP',
    cep: '01304-001',
    latitude: -23.5558,
    longitude: -46.6621,
    raio_atendimento_km: 25,
    especialidades: ['mecanica', 'eletrica', 'revisao'],
    avaliacao_media: 4.5,
    total_avaliacoes: 127,
    ativa: true,
    created_at: '2026-01-01T10:00:00Z',
  },
  {
    id: 'bbb22222-2222-2222-2222-222222222222',
    profile_id: '44444444-4444-4444-4444-444444444444',
    nome_fantasia: 'Ana Funilaria & Pintura',
    cnpj: '98.765.432/0001-02',
    endereco: 'Av. Paulista, 900',
    cidade: 'Sao Paulo',
    estado: 'SP',
    cep: '01310-100',
    latitude: -23.5631,
    longitude: -46.6544,
    raio_atendimento_km: 20,
    especialidades: ['funilaria', 'colisao'],
    avaliacao_media: 4.8,
    total_avaliacoes: 89,
    ativa: true,
    created_at: '2026-01-05T10:00:00Z',
  },
  {
    id: 'ccc33333-3333-3333-3333-333333333333',
    profile_id: '55555555-5555-5555-5555-555555555555',
    nome_fantasia: 'Pedro Auto Center',
    cnpj: '11.222.333/0001-03',
    endereco: 'Rua Oscar Freire, 300',
    cidade: 'Sao Paulo',
    estado: 'SP',
    cep: '01426-001',
    latitude: -23.5620,
    longitude: -46.6720,
    raio_atendimento_km: 30,
    especialidades: ['mecanica', 'funilaria', 'colisao', 'revisao', 'eletrica'],
    avaliacao_media: 4.2,
    total_avaliacoes: 203,
    ativa: true,
    created_at: '2026-01-10T10:00:00Z',
  },
];

// === Mock Veiculos ===
export const mockVeiculos: Veiculo[] = [
  {
    id: 'vvv11111-1111-1111-1111-111111111111',
    profile_id: '11111111-1111-1111-1111-111111111111',
    fipe_tipo: 'cars',
    fipe_marca: 'Volkswagen',
    fipe_modelo: 'Gol 1.0 12V',
    fipe_ano: '2021',
    fipe_codigo: '005527-0',
    fipe_valor: 'R$ 65.500,00',
    placa: 'ABC-1234',
    cor: 'Prata',
    apelido: 'Golzinho',
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'vvv22222-2222-2222-2222-222222222222',
    profile_id: '11111111-1111-1111-1111-111111111111',
    fipe_tipo: 'cars',
    fipe_marca: 'Fiat',
    fipe_modelo: 'Argo Drive 1.0',
    fipe_ano: '2022',
    fipe_codigo: '009001-1',
    fipe_valor: 'R$ 72.000,00',
    placa: 'DEF-5678',
    cor: 'Branco',
    apelido: 'Argo',
    created_at: '2026-02-10T10:00:00Z',
  },
];

// === Mock Fotos ===
export const mockFotos: SolicitacaoFoto[] = [
  {
    id: 'fff11111-1111-1111-1111-111111111111',
    solicitacao_id: 'sss11111-1111-1111-1111-111111111111',
    foto_url: '/images/mock-damage-1.jpg',
    descricao: 'Para-choque traseiro amassado',
    created_at: '2026-03-20T10:00:00Z',
  },
  {
    id: 'fff22222-2222-2222-2222-222222222222',
    solicitacao_id: 'sss11111-1111-1111-1111-111111111111',
    foto_url: '/images/mock-damage-2.jpg',
    descricao: 'Lanterna trincada',
    created_at: '2026-03-20T10:01:00Z',
  },
];

// === Mock Orcamento Itens ===
const mockItensOrcamento1: OrcamentoItem[] = [
  { id: '1', orcamento_id: 'ooo11111-1111-1111-1111-111111111111', descricao: 'Para-choque traseiro novo', tipo: 'peca', valor_unitario: 950, quantidade: 1, valor_total: 950 },
  { id: '2', orcamento_id: 'ooo11111-1111-1111-1111-111111111111', descricao: 'Lanterna traseira direita', tipo: 'peca', valor_unitario: 450, quantidade: 1, valor_total: 450 },
  { id: '3', orcamento_id: 'ooo11111-1111-1111-1111-111111111111', descricao: 'Pintura para-choque', tipo: 'mao_de_obra', valor_unitario: 800, quantidade: 1, valor_total: 800 },
  { id: '4', orcamento_id: 'ooo11111-1111-1111-1111-111111111111', descricao: 'Instalacao e acabamento', tipo: 'mao_de_obra', valor_unitario: 650, quantidade: 1, valor_total: 650 },
];

const mockItensOrcamento2: OrcamentoItem[] = [
  { id: '5', orcamento_id: 'ooo22222-2222-2222-2222-222222222222', descricao: 'Recuperacao para-choque', tipo: 'mao_de_obra', valor_unitario: 600, quantidade: 1, valor_total: 600 },
  { id: '6', orcamento_id: 'ooo22222-2222-2222-2222-222222222222', descricao: 'Lanterna paralela', tipo: 'peca', valor_unitario: 280, quantidade: 1, valor_total: 280 },
  { id: '7', orcamento_id: 'ooo22222-2222-2222-2222-222222222222', descricao: 'Pintura e polimento', tipo: 'mao_de_obra', valor_unitario: 900, quantidade: 1, valor_total: 900 },
  { id: '8', orcamento_id: 'ooo22222-2222-2222-2222-222222222222', descricao: 'Material de pintura', tipo: 'material', valor_unitario: 420, quantidade: 1, valor_total: 420 },
];

// === Mock Orcamentos ===
export const mockOrcamentos: Orcamento[] = [
  {
    id: 'ooo11111-1111-1111-1111-111111111111',
    solicitacao_id: 'sss11111-1111-1111-1111-111111111111',
    oficina_id: 'bbb22222-2222-2222-2222-222222222222',
    status: 'enviado',
    valor_total: 2850,
    prazo_dias: 5,
    tempo_execucao_horas: 40,
    observacoes: 'Inclui para-choque novo e lanterna original. Garantia de 6 meses na pintura.',
    validade: '2026-04-30',
    disponibilidade: [
      { id: 's1', data_checkin: '2026-04-07', turno: 'manha', data_previsao_entrega: '2026-04-11' },
      { id: 's2', data_checkin: '2026-04-09', turno: 'tarde', data_previsao_entrega: '2026-04-15' },
      { id: 's3', data_checkin: '2026-04-14', turno: 'manha', data_previsao_entrega: '2026-04-18' },
    ],
    agendamento_escolhido: null,
    created_at: '2026-03-21T14:00:00Z',
    itens: mockItensOrcamento1,
    oficina: mockOficinas[1],
  },
  {
    id: 'ooo22222-2222-2222-2222-222222222222',
    solicitacao_id: 'sss11111-1111-1111-1111-111111111111',
    oficina_id: 'ccc33333-3333-3333-3333-333333333333',
    status: 'enviado',
    valor_total: 2200,
    prazo_dias: 7,
    tempo_execucao_horas: 56,
    observacoes: 'Para-choque recuperado (nao troca). Lanterna paralela de boa qualidade.',
    validade: '2026-04-30',
    disponibilidade: [
      { id: 's4', data_checkin: '2026-04-03', turno: 'manha', data_previsao_entrega: '2026-04-10' },
      { id: 's5', data_checkin: '2026-04-07', turno: 'manha', data_previsao_entrega: '2026-04-14' },
    ],
    agendamento_escolhido: null,
    created_at: '2026-03-22T09:00:00Z',
    itens: mockItensOrcamento2,
    oficina: mockOficinas[2],
  },
];

// === Mock Solicitacoes ===
export const mockSolicitacoes: Solicitacao[] = [
  {
    id: 'sss11111-1111-1111-1111-111111111111',
    cliente_id: '11111111-1111-1111-1111-111111111111',
    veiculo_id: 'vvv11111-1111-1111-1111-111111111111',
    tipo: 'colisao',
    descricao: 'Batida no para-choque traseiro. O carro foi atingido no estacionamento do shopping. Amassou o para-choque e trincou a lanterna traseira direita.',
    urgencia: 'media',
    status: 'em_orcamento',
    latitude: -23.5505,
    longitude: -46.6333,
    endereco: 'Mooca, Sao Paulo - SP',
    created_at: '2026-03-20T10:00:00Z',
    veiculo: mockVeiculos[0],
    fotos: mockFotos,
    orcamentos: mockOrcamentos,
    cliente: mockCliente,
  },
  {
    id: 'sss22222-2222-2222-2222-222222222222',
    cliente_id: '11111111-1111-1111-1111-111111111111',
    veiculo_id: 'vvv22222-2222-2222-2222-222222222222',
    tipo: 'revisao',
    descricao: 'Revisao dos 30.000km. Preciso trocar oleo, filtros e verificar freios.',
    urgencia: 'baixa',
    status: 'aberta',
    latitude: -23.5505,
    longitude: -46.6333,
    endereco: 'Mooca, Sao Paulo - SP',
    created_at: '2026-03-25T08:00:00Z',
    veiculo: mockVeiculos[1],
    fotos: [],
    orcamentos: [],
    cliente: mockCliente,
  },
  {
    id: 'sss33333-3333-3333-3333-333333333333',
    cliente_id: '22222222-2222-2222-2222-222222222222',
    veiculo_id: 'vvv33333-3333-3333-3333-333333333333',
    tipo: 'funilaria',
    descricao: 'Porta do motorista amassada apos acidente. Preciso de funilaria e pintura da porta inteira.',
    urgencia: 'alta',
    status: 'aceita',
    latitude: -23.5700,
    longitude: -46.6500,
    endereco: 'Vila Mariana, Sao Paulo - SP',
    created_at: '2026-03-15T16:00:00Z',
    veiculo: {
      id: 'vvv33333-3333-3333-3333-333333333333',
      profile_id: '22222222-2222-2222-2222-222222222222',
      fipe_tipo: 'cars',
      fipe_marca: 'Chevrolet',
      fipe_modelo: 'Onix 1.0 Turbo',
      fipe_ano: '2023',
      fipe_codigo: '007123-4',
      fipe_valor: 'R$ 85.900,00',
      placa: 'GHI-9012',
      cor: 'Preto',
      apelido: null,
      created_at: '2026-02-15T10:00:00Z',
    },
    fotos: [
      { id: 'fff33333', solicitacao_id: 'sss33333-3333-3333-3333-333333333333', foto_url: '/images/mock-damage-3.jpg', descricao: 'Porta amassada', created_at: '2026-03-15T16:00:00Z' },
    ],
    orcamentos: [],
    cliente: mockCliente2,
  },
];

// === Mock Agenda ===
export const mockAgenda: Agenda[] = [
  {
    id: 'ag1',
    oficina_id: 'bbb22222-2222-2222-2222-222222222222',
    solicitacao_id: 'sss33333-3333-3333-3333-333333333333',
    titulo: 'Funilaria - Onix Preto',
    descricao: 'Porta motorista - Maria Santos',
    data_inicio: '2026-04-02T08:00:00Z',
    data_fim: '2026-04-04T18:00:00Z',
    tipo: 'plataforma',
    status: 'agendado',
    cor: '#3B82F6',
    created_at: '2026-03-28T10:00:00Z',
  },
  {
    id: 'ag2',
    oficina_id: 'bbb22222-2222-2222-2222-222222222222',
    solicitacao_id: null,
    titulo: 'Polimento - Cliente externo',
    descricao: 'Polimento cristalizado Civic',
    data_inicio: '2026-04-05T09:00:00Z',
    data_fim: '2026-04-05T17:00:00Z',
    tipo: 'externo',
    status: 'agendado',
    cor: '#10B981',
    created_at: '2026-03-28T10:00:00Z',
  },
  {
    id: 'ag3',
    oficina_id: 'aaa11111-1111-1111-1111-111111111111',
    solicitacao_id: null,
    titulo: 'Troca de oleo - Corolla',
    descricao: 'Cliente regular - Sr. Roberto',
    data_inicio: '2026-04-01T14:00:00Z',
    data_fim: '2026-04-01T16:00:00Z',
    tipo: 'externo',
    status: 'agendado',
    cor: '#F59E0B',
    created_at: '2026-03-28T10:00:00Z',
  },
  {
    id: 'ag4',
    oficina_id: 'bbb22222-2222-2222-2222-222222222222',
    solicitacao_id: null,
    titulo: 'Revisao - Hyundai HB20',
    descricao: 'Troca de oleo e filtros',
    data_inicio: '2026-04-07T08:00:00Z',
    data_fim: '2026-04-07T12:00:00Z',
    tipo: 'externo',
    status: 'agendado',
    cor: '#F59E0B',
    created_at: '2026-03-29T10:00:00Z',
  },
];

// === Mock Avaliacoes ===
export const mockAvaliacoes: Avaliacao[] = [
  {
    id: 'av1',
    solicitacao_id: 'sss33333-3333-3333-3333-333333333333',
    cliente_id: '22222222-2222-2222-2222-222222222222',
    oficina_id: 'bbb22222-2222-2222-2222-222222222222',
    nota: 5,
    comentario: 'Excelente trabalho! A porta ficou como nova. Muito profissional e cumpriu o prazo.',
    created_at: '2026-03-25T10:00:00Z',
    cliente: mockCliente2,
  },
];

// === Mock Notificacoes ===
export const mockNotificacoes: Notificacao[] = [
  {
    id: 'n1',
    profile_id: '11111111-1111-1111-1111-111111111111',
    tipo: 'novo_orcamento',
    titulo: 'Novo orcamento recebido',
    mensagem: 'Ana Funilaria & Pintura enviou um orcamento de R$ 2.850,00',
    lida: false,
    dados: { solicitacao_id: 'sss11111-1111-1111-1111-111111111111' },
    created_at: '2026-03-21T14:00:00Z',
  },
  {
    id: 'n2',
    profile_id: '11111111-1111-1111-1111-111111111111',
    tipo: 'novo_orcamento',
    titulo: 'Novo orcamento recebido',
    mensagem: 'Pedro Auto Center enviou um orcamento de R$ 2.200,00',
    lida: false,
    dados: { solicitacao_id: 'sss11111-1111-1111-1111-111111111111' },
    created_at: '2026-03-22T09:00:00Z',
  },
  {
    id: 'n3',
    profile_id: '11111111-1111-1111-1111-111111111111',
    tipo: 'solicitacao_aceita',
    titulo: 'Reparo em andamento',
    mensagem: 'Seu reparo do Onix foi aceito pela oficina',
    lida: true,
    dados: null,
    created_at: '2026-03-18T10:00:00Z',
  },
];
