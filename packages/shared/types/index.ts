// === Enums ===

export type TipoUsuario = 'cliente' | 'oficina' | 'admin' | 'loja_pecas';

export type TipoServico =
  | 'colisao'
  | 'funilaria'
  | 'revisao'
  | 'mecanica'
  | 'eletrica'
  | 'pneu'
  | 'pintura'
  | 'manutencao'
  | 'outro';

export type Urgencia = 'baixa' | 'media' | 'alta';

export type StatusSolicitacao =
  | 'aberta'
  | 'em_orcamento'
  | 'aceita'
  | 'em_andamento'
  | 'concluida'
  | 'cancelada'
  | 'no_show'
  | 'expirada';

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
  ativo: boolean;
  // Idioma preferido pra e-mails/notificacoes assincronas (pt/en/et/it) -
  // capturado do locale da URL no cadastro, nunca do pais/moeda.
  idioma: string;
  // false = conta criada pelo pedido sem senha e ainda sem senha (migracao 080):
  // a tela "crie a sua senha" aparece a cada login ate a pessoa criar uma
  senha_definida?: boolean;
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
  pais: string | null;
  latitude: number;
  longitude: number;
  raio_atendimento_km: number;
  especialidades: TipoServico[];
  avaliacao_media: number;
  total_avaliacoes: number;
  ativa: boolean;
  capacidade_servicos?: Record<string, number> | null;
  vende_pecas?: boolean;
  // lote 3 (093, N-6): alcance da oficina vendedora; NULL = raio de hoje
  pecas_alcance?: 'pais' | 'raio' | null;
  // 092: perfil fiscal de quem vende pecas (informacao publica)
  iva_registrado?: boolean | null;
  iva_pct?: number | null;
  regime_margem_usadas?: boolean;
  created_at: string;
  // Joined
  profile?: Profile;
}

// 'expirada' (091): cotacao vencida (7 dias), gravada so pela tarefa horaria (lote 1 de pecas)
export type StatusCotacaoPeca = 'aberta' | 'respondida' | 'fechada' | 'cancelada' | 'expirada';
export type StatusPedidoPeca = 'confirmado' | 'entregue' | 'cancelado';
export type TipoFornecedorPeca = 'loja' | 'oficina';
// lote 1 de pecas (091): pedido com ou sem carro (oleo, consumiveis), unidade da quantidade e a quem vai
export type TipoCotacaoPeca = 'carro' | 'sem_carro';
export type UnidadePeca = 'un' | 'jogo' | 'par' | 'litro' | 'kg' | 'metro' | 'caixa';
export type AlvoCotacaoPeca = 'todos' | 'so_lojas';
// lote 2 de pecas (092): urgencia da cotacao e IVA da oferta (retrato do perfil do fornecedor)
export type UrgenciaCotacaoPeca = 'hoje' | 'amanha' | 'sem_pressa';
export type IvaModoPeca = 'registrado' | 'nao_registrado' | 'margem';

export interface LojaPecas {
  id: string;
  profile_id: string;
  nome_fantasia: string;
  cnpj: string | null;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  pais: string | null;
  latitude: number | null;
  longitude: number | null;
  raio_atendimento_km: number;
  ativa: boolean;
  // 092: perfil fiscal de quem vende pecas (informacao publica)
  iva_registrado?: boolean | null;
  iva_pct?: number | null;
  regime_margem_usadas?: boolean;
  created_at: string;
  // Joined
  profile?: Profile;
}

export interface PecaCatalogo {
  id: string;
  loja_id: string;
  nome: string;
  descricao: string | null;
  fipe_marca: string | null;
  fipe_modelo: string | null;
  fipe_ano: string | null;
  preco: number;
  quantidade_estoque: number;
  ativo: boolean;
  created_at: string;
  // Joined
  loja?: LojaPecas;
}

export interface CotacaoPeca {
  id: string;
  oficina_id: string;
  peca_descricao: string;
  fipe_marca: string | null;
  fipe_modelo: string | null;
  fipe_ano: string | null;
  quantidade: number;
  observacao?: string | null;
  fotos?: string[] | null;
  status: StatusCotacaoPeca;
  created_at: string;
  // 091 (todas com padrao igual ao comportamento de hoje)
  tipo?: TipoCotacaoPeca;
  unidade?: UnidadePeca;
  alvo?: AlvoCotacaoPeca;
  enviar_placa?: boolean;
  expira_em?: string;
  reaberta_vezes?: number;
  // 092 (lote 2): NULL = nao informada (tela de hoje) = e-mail imediato
  urgencia?: UrgenciaCotacaoPeca | null;
  // Joined
  oficina?: Oficina;
  respostas?: CotacaoPecaResposta[];
}

export interface CotacaoPecaResposta {
  id: string;
  cotacao_id: string;
  fornecedor_tipo: TipoFornecedorPeca;
  loja_id: string | null;
  oficina_fornecedora_id: string | null;
  peca_catalogo_id: string | null;
  preco: number;
  prazo_dias: number;
  observacao: string | null;
  // 092: quantidade ofertada (NULL = a pedida) e IVA (NULL = oferta sem perfil fiscal, como hoje)
  quantidade_ofertada?: number | null;
  iva_pct?: number | null;
  iva_modo?: IvaModoPeca | null;
  // lote 3 (093, P-23): condicao da peca ofertada; NULL = oferta de hoje
  condicao?: 'nova' | 'sobra_nova' | 'usada_propria' | 'recondicionada' | null;
  created_at: string;
  // Joined
  loja?: LojaPecas;
  oficina_fornecedora?: Oficina;
}

export interface PedidoPeca {
  id: string;
  cotacao_id: string;
  resposta_id: string;
  oficina_id: string;
  fornecedor_tipo: TipoFornecedorPeca;
  loja_id: string | null;
  oficina_fornecedora_id: string | null;
  preco_total: number;
  quantidade: number;
  status: StatusPedidoPeca;
  created_at: string;
  // lote 3 de pecas (093): NULL = pedido de hoje
  v3?: boolean | null;
  recebido_em?: string | null;
  problema?: 'nao_entregou' | 'peca_errada' | 'avariada' | 'outro' | null;
  problema_em?: string | null;
  problema_texto?: string | null;
  cancelado_por?: 'compradora' | 'fornecedor' | 'admin' | null;
  cancelado_motivo?: string | null;
  cancelado_texto?: string | null;
  cancelado_em?: string | null;
  entregue_em?: string | null;
  contato_visivel_ate?: string | null;
  lembretes_feedback?: number;
  pos_cancelamento?: 'reaberta' | 'nova_cotacao' | null;
  nova_cotacao_id?: string | null;
  // Joined
  oficina?: Oficina;
  loja?: LojaPecas;
  oficina_fornecedora?: Oficina;
  resposta?: CotacaoPecaResposta;
}

export interface ComissaoPecasConfig {
  id: string;
  fornecedor_tipo: TipoFornecedorPeca;
  fornecedor_id: string;
  taxa_padrao: number;
  taxa_calculada: number | null;
  taxa_fixa_override: number | null;
  usa_override: boolean;
  media_tempo_resposta_horas: number | null;
  total_pedidos_90dias: number;
  updated_at: string;
  created_at: string;
}

export interface ComissaoPecasLancamento {
  id: string;
  fornecedor_tipo: TipoFornecedorPeca;
  fornecedor_id: string;
  pedido_id: string;
  valor_pedido: number;
  taxa_aplicada: number;
  valor_comissao: number;
  status: 'pendente' | 'pago';
  pago_em: string | null;
  created_at: string;
}

export interface CotacaoPecaMensagem {
  id: string;
  cotacao_id: string;
  fornecedor_tipo: TipoFornecedorPeca;
  fornecedor_id: string;
  remetente_id: string;
  texto: string | null;
  imagem_url: string | null;
  lida: boolean;
  created_at: string;
  // Joined
  remetente?: { nome: string; tipo: string };
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
  pais: string | null;
  created_at: string;
  // Joined
  veiculo?: Veiculo;
  fotos?: SolicitacaoFoto[];
  orcamentos?: Orcamento[];
  cliente?: Profile;
  // pedido enviado pela BipFix a esta oficina (migracao 085; a RLS so devolve os da propria oficina).
  // origem 'tipo_alterado' = acesso mantido ao mudar o tipo (sem selo "enviado pela BipFix")
  convites?: { oficina_id: string; origem?: 'admin' | 'tipo_alterado' }[];
}

export interface SolicitacaoFoto {
  id: string;
  solicitacao_id: string;
  foto_url: string;
  descricao: string | null;
  created_at: string;
  // migracao 096 (18/11): 'criacao' (com o pedido) ou 'adicionada' (depois do envio); tamanho tratado no servidor
  origem?: 'criacao' | 'adicionada';
  bytes?: number | null;
  largura?: number | null;
  altura?: number | null;
}

export interface DisponibilidadeSlot {
  id: string;
  data_checkin: string;
  turno: 'manha' | 'tarde';
  // janela de chegada (check-in v2, migracao 082); nulas = linha antiga (08-12 / 13-17)
  hora_inicio?: string | null;
  hora_fim?: string | null;
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
  no_show: boolean;
  no_show_registrado_em: string | null;
  created_at: string;
  // Joined
  solicitacao?: Solicitacao;
  funcionario?: Funcionario;
  etapas?: ManutencaoEtapa[];
}

export interface NoShowHistorico {
  id: string;
  agenda_id: string;
  solicitacao_id: string | null;
  cliente_id: string | null;
  registrado_em: string;
  reagendado: boolean;
  reagendado_em: string | null;
  created_at: string;
}

export interface AnaliseDano {
  id: string;
  solicitacao_id: string;
  resumo: string;
  severidade: 'leve' | 'moderado' | 'grave' | 'severo';
  checklist_inspecao: string[];
  pecas_afetadas: string[];
  // faixa APROXIMADA (total; pecas, mao de obra e horas quando a IA consegue - versao 2, 14/11)
  estimativa_custo: {
    min: number; max: number;
    pecas_min?: number | null; pecas_max?: number | null;
    mao_obra_min?: number | null; mao_obra_max?: number | null;
    horas_min?: number | null; horas_max?: number | null;
  } | null;
  confianca: number | null;
  raw_response?: { perguntas_sugeridas?: string[]; observacoes?: string[]; versao?: number; [key: string]: unknown };
  created_at: string;
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

export interface VeiculoNotaInterna {
  id: string;
  agenda_id: string;
  oficina_id: string;
  remetente_id: string;
  texto: string;
  created_at: string;
  // Joined
  remetente?: { nome: string };
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
  primeiro_login: boolean;
  capacidade_maxima: number | null;
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

// === Admin / Comissao Types ===

export interface ComissaoConfig {
  id: string;
  oficina_id: string;
  taxa_padrao: number;
  taxa_fixa_override: number | null;
  usa_override: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  oficina?: Oficina;
}

export interface ComissaoLancamento {
  id: string;
  oficina_id: string;
  orcamento_id: string;
  valor_servico: number;
  taxa_aplicada: number;
  valor_comissao: number;
  status: 'pendente' | 'pago';
  pago_em: string | null;
  created_at: string;
  // Joined
  oficina?: Oficina;
  orcamento?: Orcamento;
}

export interface PlataformaMetricas {
  total_clientes: number;
  total_oficinas: number;
  solicitacoes_mes: number;
  servicos_concluidos_mes: number;
  // Agrupado por moeda (ISO 4217) - oficinas de paises diferentes usam
  // moedas diferentes, entao um numero unico misturaria BRL com EUR.
  gmv_mes_por_moeda: Record<string, number>;
  comissao_total_mes_por_moeda: Record<string, number>;
  comissao_pecas_mes_por_moeda: Record<string, number>;
  // a receber (status pendente), servicos + pecas, de qualquer mes
  comissao_pendente_por_moeda: Record<string, number>;
  modo_comissao_servicos: string;
  modo_comissao_pecas: string;
}
