export const FIPE_API_BASE = 'https://parallelum.com.br/fipe/api/v2';

export const TIPOS_VEICULO = [
  { value: 'cars', label: 'Carro' },
  { value: 'motorcycles', label: 'Moto' },
  { value: 'trucks', label: 'Caminhao' },
] as const;

export const TIPOS_SERVICO = [
  { value: 'colisao', label: 'Colisao', icon: '💥', needsPhoto: true },
  { value: 'funilaria', label: 'Funilaria e Pintura', icon: '🎨', needsPhoto: true },
  { value: 'revisao', label: 'Revisoes', icon: '🔧', needsPhoto: false },
  { value: 'mecanica', label: 'Mecanica', icon: '⚙️', needsPhoto: false },
  { value: 'eletrica', label: 'Eletrico', icon: '⚡', needsPhoto: false },
  { value: 'pneu', label: 'Pneu', icon: '🔴', needsPhoto: false },
  { value: 'outro', label: 'Outro', icon: '📋', needsPhoto: true },
] as const;

export const SERVICOS_REVISAO = [
  'Troca de oleo e filtro',
  'Troca de filtro de ar',
  'Troca de filtro de combustivel',
  'Troca de filtro de cabine',
  'Verificacao de freios',
  'Troca de pastilhas de freio',
  'Troca de discos de freio',
  'Alinhamento e balanceamento',
  'Troca de correia dentada',
  'Troca de velas',
  'Revisao de suspensao',
  'Troca de amortecedores',
  'Troca de fluido de freio',
  'Troca de fluido de arrefecimento',
  'Revisao completa (km)',
] as const;

export const SERVICOS_MECANICA = [
  'Motor - barulho estranho',
  'Motor - perda de potencia',
  'Motor - superaquecimento',
  'Cambio - dificuldade para engatar',
  'Cambio - barulho ao trocar marcha',
  'Embreagem - patinando',
  'Embreagem - dura',
  'Freio - barulho ao frear',
  'Freio - pedal mole',
  'Suspensao - barulho',
  'Suspensao - carro puxando',
  'Escapamento - barulho',
  'Escapamento - vazamento',
  'Direcao - dura ou com folga',
  'Vazamento de oleo',
  'Vazamento de agua',
  'Outro problema mecanico',
] as const;

export const SERVICOS_ELETRICA = [
  'Bateria - nao liga',
  'Bateria - descarregando rapido',
  'Alternador - luz no painel',
  'Motor de arranque',
  'Farois / Lanternas',
  'Vidro eletrico',
  'Trava eletrica',
  'Ar condicionado',
  'Painel - luzes de alerta',
  'Central multimidia',
  'Sensores (estacionamento, re)',
  'Chicote eletrico',
  'Outro problema eletrico',
] as const;

export const SERVICOS_PNEU = [
  'Troca de pneu(s)',
  'Rodizio de pneus',
  'Conserto de furo',
  'Alinhamento',
  'Balanceamento',
  'Calibragem',
  'Troca de roda / calota',
] as const;

export const URGENCIAS = [
  { value: 'baixa', label: 'Baixa', description: 'Sem pressa, posso esperar', color: 'green' },
  { value: 'media', label: 'Media', description: 'Preciso em algumas semanas', color: 'yellow' },
  { value: 'alta', label: 'Alta', description: 'Urgente, preciso o mais rapido possivel', color: 'red' },
] as const;

export const STATUS_SOLICITACAO = {
  aberta: { label: 'Aberta', color: 'blue' },
  em_orcamento: { label: 'Orçamento Enviado', color: 'yellow' },
  aceita: { label: 'Orçamento Aceito', color: 'green' },
  em_andamento: { label: 'Em Andamento', color: 'purple' },
  concluida: { label: 'Concluida', color: 'gray' },
  cancelada: { label: 'Cancelada', color: 'red' },
} as const;

export const STATUS_ORCAMENTO = {
  enviado: { label: 'Enviado', color: 'blue' },
  visualizado: { label: 'Visualizado', color: 'yellow' },
  aceito: { label: 'Aceito', color: 'green' },
  recusado: { label: 'Recusado', color: 'red' },
  expirado: { label: 'Expirado', color: 'gray' },
} as const;

export const ESTADOS_BRASIL = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const;

export const CORES_AGENDA = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316',
] as const;

export const STATUS_MANUTENCAO = {
  recebido: { label: 'Recebido', icon: '📥', color: 'blue', description: 'Veiculo recebido na oficina' },
  diagnostico: { label: 'Em diagnostico', icon: '🔍', color: 'indigo', description: 'Diagnosticando o problema' },
  aguardando_pecas: { label: 'Aguardando pecas', icon: '📦', color: 'yellow', description: 'Aguardando pecas necessarias' },
  em_execucao: { label: 'Em execucao', icon: '🔧', color: 'green', description: 'Servico em andamento' },
  pausa_cliente: { label: 'Pausa - contato cliente', icon: '📞', color: 'orange', description: 'Aguardando retorno do cliente' },
  pausa_pecas: { label: 'Pausa - pecas em falta', icon: '⏳', color: 'red', description: 'Parado por falta de pecas' },
  pausa_geral: { label: 'Pausado', icon: '⏸️', color: 'gray', description: 'Servico temporariamente pausado' },
  teste_final: { label: 'Teste final', icon: '✅', color: 'teal', description: 'Realizando testes de qualidade' },
  concluido: { label: 'Concluido', icon: '🏁', color: 'emerald', description: 'Servico finalizado' },
  entregue: { label: 'Entregue', icon: '🚗', color: 'slate', description: 'Veiculo entregue ao cliente' },
} as const;

export const CARGOS_FUNCIONARIO = {
  admin: { label: 'Administrador', description: 'Acesso completo ao portal da oficina' },
  mecanico: { label: 'Mecanico', description: 'Acesso a pagina de veiculos em servico' },
} as const;
