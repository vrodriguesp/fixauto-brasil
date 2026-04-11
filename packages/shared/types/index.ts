// === Enums ===

export type TipoUsuario = 'cliente' | 'oficina';

export type TipoServico =
  | 'colisao'
  | 'funilaria'
  | 'revisao'
  | 'mecanica'
  | 'eletrica'
  | 'pneu'
  | 'outro';

export type Urgencia = 'baixa' | 'media' | 'alta';

export type StatusSolicitacao =
  | 'aberta'
  | 'em_orcamento'
  | 'aceita'
  | 'em_andamento'
  | 'concluida'
  | 'cancelada';

export type StatusOrcamento =
  | 'enviado'
  | 'visualizado'
  | 'aceito'
  | 'recusado'
  | 'expirado';

export type TipoItemOrcamento = 'mao_de_obra' | 'peca' | 'material' | 'outro';

export type TipoAgenda = 'plataforma' | 'externo';

export type StatusAgenda = 'agendado' | 'em_andamento' | 'concluido' | 'cancelado';

export type CargoFuncionario = 'admin' | 'mecanico';

export type StatusManutencao =
  | 'recebido'
  | 'diagnostico'
  | 'aguardando_pecas'
  | 'em_execucao'
  | 'pausa_cliente'
  | 'pausa_pecas'
  | 'pausa_geral'
  | 'teste_final'
  | 'concluido'
  | 'entregue';

// === Database Models ===

export interface Profile {
  id: string;
  tipo: TipoUsuario;
  nome: string;
  email: string;
  telefone: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Oficina {
  id: string;
  profile_id: string;
  nome_fantasia: string;
  cnpj: string | null;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  latitude: number;
  longitude: number;
  raio_atendimento_km: number;
  especialidades: TipoServico[];
  avaliacao_media: number;
  total_avaliacoes: number;
  ativa: boolean;
  created_at: string;
  // Joined
  profile?: Profile;
}

export interface Veiculo {
  id: string;
  profile_id: string;
  fipe_tipo: string;
  fipe_marca: string;
  fipe_modelo: string;
  fipe_ano: string;
  fipe_codigo: string | null;
  fipe_valor: string | null;
  placa: string | null;
  cor: string | null;
  apelido: string | null;
  created_at: string;
}

export interface Solicitacao {
  id: string;
  cliente_id: string;
  veiculo_id: string;
  tipo: TipoServico;
  descricao: string;
  urgencia: Urgencia;
  status: StatusSolicitacao;
  latitude: number;
  longitude: number;
  endereco: string;
  created_at: string;
  // Joined
  veiculo?: Veiculo;
  fotos?: SolicitacaoFoto[];
  orcamentos?: Orcamento[];
  cliente?: Profile;
}

export interface SolicitacaoFoto {
  id: string;
  solicitacao_id: string;
  foto_url: string;
  descricao: string | null;
  created_at: string;
}

export interface DisponibilidadeSlot {
  id: string;
  data_checkin: string;
  turno: 'manha' | 'tarde';
  data_previsao_entrega: string;
}

export interface Orcamento {
  id: string;
  solicitacao_id: string;
  oficina_id: string;
  status: StatusOrcamento;
  valor_total: number;
  prazo_dias: number;
  tempo_execucao_horas: number | null;
  observacoes: string | null;
  validade: string;
  disponibilidade: DisponibilidadeSlot[];
  disponibilidade_escolhida_id: string | null;
  agendamento_escolhido: DisponibilidadeSlot | null;
  valor_original: number | null;
  revisao_numero: number;
  revisado_em: string | null;
  created_at: string;
  // Joined
  itens?: OrcamentoItem[];
  oficina?: Oficina;
}

export interface OrcamentoItem {
  id: string;
  orcamento_id: string;
  descricao: string;
  tipo: TipoItemOrcamento;
  valor_unitario: number;
  quantidade: number;
  valor_total: number;
}

export interface Agenda {
  id: string;
  oficina_id: string;
  solicitacao_id: string | null;
  funcionario_id: string | null;
  titulo: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string;
  tipo: TipoAgenda;
  status: StatusAgenda;
  cor: string;
  created_at: string;
  // Joined
  solicitacao?: Solicitacao;
  funcionario?: Funcionario;
  etapas?: ManutencaoEtapa[];
}

export interface Avaliacao {
  id: string;
  solicitacao_id: string;
  cliente_id: string;
  oficina_id: string;
  nota: number;
  nota_anterior: number | null;
  comentario: string | null;
  created_at: string;
  updated_at: string | null;
  // Joined
  cliente?: Profile;
}

export interface Notificacao {
  id: string;
  profile_id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  dados: Record<string, unknown> | null;
  created_at: string;
}

export interface Funcionario {
  id: string;
  profile_id: string;
  oficina_id: string;
  cargo: CargoFuncionario;
  especialidade: string | null;
  ativo: boolean;
  created_at: string;
  // Joined
  profile?: Profile;
  oficina?: Oficina;
}

export interface ManutencaoEtapa {
  id: string;
  agenda_id: string;
  funcionario_id: string | null;
  status: StatusManutencao;
  observacao: string | null;
  created_at: string;
  // Joined
  funcionario?: Funcionario;
}

// === FIPE API Types ===

export interface FipeMarca {
  code: string;
  name: string;
}

export interface FipeModelo {
  code: string;
  name: string;
}

export interface FipeAno {
  code: string;
  name: string;
}

export interface FipeVeiculo {
  brand: string;
  model: string;
  modelYear: number;
  fuel: string;
  codeFipe: string;
  price: string;
  priceNum: number;
  referenceMonth: string;
  vehicleType: number;
}
