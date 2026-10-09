export const FIPE_API_BASE = 'https://parallelum.com.br/fipe/api/v2';

export const TIPOS_VEICULO = [
  { value: 'cars', label: 'Carro' },
  { value: 'motorcycles', label: 'Moto' },
  { value: 'trucks', label: 'Caminhão' },
] as const;

export const TIPOS_SERVICO = [
  { value: 'colisao', label: 'Colisão', icon: '💥', needsPhoto: true },
  { value: 'funilaria', label: 'Funilaria e Pintura', icon: '🎨', needsPhoto: true },
  { value: 'revisao', label: 'Revisões', icon: '🔧', needsPhoto: false },
  { value: 'mecanica', label: 'Mecânica', icon: '⚙️', needsPhoto: false },
  { value: 'eletrica', label: 'Elétrico', icon: '⚡', needsPhoto: false },
  { value: 'pneu', label: 'Pneu', icon: '🔴', needsPhoto: false },
  { value: 'outro', label: 'Outro', icon: '📋', needsPhoto: true },
] as const;

// Grupo "carroceria": uma oficina com qualquer um destes atende pedido de
// qualquer um deles (acidente chega como 'colisao').
export const TIPOS_CARROCERIA = ['colisao', 'funilaria', 'pintura'] as const;

// Regra UNICA "a oficina atende este tipo de pedido" - a mesma do banco
// (tipo_compativel, migracao 056): sem especialidade marcada atende tudo;
// carroceria e um grupo; os demais precisam bater.
// (distancia: distanciaKm em format.ts - mesma formula do banco, distancia_km)
export function tipoCompativel(especialidades: readonly string[] | null | undefined, tipo: string): boolean {
  if (!especialidades || especialidades.length === 0) return true;
  if (especialidades.includes(tipo)) return true;
  const grupo = TIPOS_CARROCERIA as readonly string[];
  return grupo.includes(tipo) && especialidades.some((e) => grupo.includes(e));
}

// Cada item vira uma chave estavel (value) + label em portugues (usado so
// como fallback/referencia) - a exibicao de verdade vem da traducao em
// messages/*.json (namespace constants.servicosRevisao/Mecanica/Eletrica/
// Pneu), buscada pela pagina via o `value`.
export const SERVICOS_REVISAO = [
  { value: 'troca_oleo_filtro', label: 'Troca de óleo e filtro' },
  { value: 'troca_filtro_ar', label: 'Troca de filtro de ar' },
  { value: 'troca_filtro_combustivel', label: 'Troca de filtro de combustível' },
  { value: 'troca_filtro_cabine', label: 'Troca de filtro de cabine' },
  { value: 'verificacao_freios', label: 'Verificação de freios' },
  { value: 'troca_pastilhas_freio', label: 'Troca de pastilhas de freio' },
  { value: 'troca_discos_freio', label: 'Troca de discos de freio' },
  { value: 'alinhamento_balanceamento', label: 'Alinhamento e balanceamento' },
  { value: 'troca_correia_dentada', label: 'Troca de correia dentada' },
  { value: 'troca_velas', label: 'Troca de velas' },
  { value: 'revisao_suspensao', label: 'Revisão de suspensão' },
  { value: 'troca_amortecedores', label: 'Troca de amortecedores' },
  { value: 'troca_fluido_freio', label: 'Troca de fluido de freio' },
  { value: 'troca_fluido_arrefecimento', label: 'Troca de fluido de arrefecimento' },
  { value: 'revisao_completa_km', label: 'Revisão completa (km)' },
] as const;

export const SERVICOS_MECANICA = [
  { value: 'motor_barulho_estranho', label: 'Motor - barulho estranho' },
  { value: 'motor_perda_potencia', label: 'Motor - perda de potência' },
  { value: 'motor_superaquecimento', label: 'Motor - superaquecimento' },
  { value: 'cambio_dificuldade_engatar', label: 'Câmbio - dificuldade para engatar' },
  { value: 'cambio_barulho_troca_marcha', label: 'Câmbio - barulho ao trocar marcha' },
  { value: 'embreagem_patinando', label: 'Embreagem - patinando' },
  { value: 'embreagem_dura', label: 'Embreagem - dura' },
  { value: 'freio_barulho_frear', label: 'Freio - barulho ao frear' },
  { value: 'freio_pedal_mole', label: 'Freio - pedal mole' },
  { value: 'suspensao_barulho', label: 'Suspensão - barulho' },
  { value: 'suspensao_carro_puxando', label: 'Suspensão - carro puxando' },
  { value: 'escapamento_barulho', label: 'Escapamento - barulho' },
  { value: 'escapamento_vazamento', label: 'Escapamento - vazamento' },
  { value: 'direcao_dura_folga', label: 'Direção - dura ou com folga' },
  { value: 'vazamento_oleo', label: 'Vazamento de óleo' },
  { value: 'vazamento_agua', label: 'Vazamento de água' },
  { value: 'outro_problema_mecanico', label: 'Outro problema mecânico' },
] as const;

export const SERVICOS_ELETRICA = [
  { value: 'bateria_nao_liga', label: 'Bateria - não liga' },
  { value: 'bateria_descarregando_rapido', label: 'Bateria - descarregando rápido' },
  { value: 'alternador_luz_painel', label: 'Alternador - luz no painel' },
  { value: 'motor_arranque', label: 'Motor de arranque' },
  { value: 'farois_lanternas', label: 'Faróis / Lanternas' },
  { value: 'vidro_eletrico', label: 'Vidro elétrico' },
  { value: 'trava_eletrica', label: 'Trava elétrica' },
  { value: 'ar_condicionado', label: 'Ar condicionado' },
  { value: 'painel_luzes_alerta', label: 'Painel - luzes de alerta' },
  { value: 'central_multimidia', label: 'Central multimídia' },
  { value: 'sensores_estacionamento_re', label: 'Sensores (estacionamento, ré)' },
  { value: 'chicote_eletrico', label: 'Chicote elétrico' },
  { value: 'outro_problema_eletrico', label: 'Outro problema elétrico' },
] as const;

export const SERVICOS_PNEU = [
  { value: 'troca_pneus', label: 'Troca de pneu(s)' },
  { value: 'rodizio_pneus', label: 'Rodízio de pneus' },
  { value: 'conserto_furo', label: 'Conserto de furo' },
  { value: 'alinhamento', label: 'Alinhamento' },
  { value: 'balanceamento', label: 'Balanceamento' },
  { value: 'calibragem', label: 'Calibragem' },
  { value: 'troca_roda_calota', label: 'Troca de roda / calota' },
] as const;

export const URGENCIAS = [
  { value: 'baixa', label: 'Baixa', description: 'Sem pressa, posso esperar', color: 'green' },
  { value: 'media', label: 'Média', description: 'Preciso em algumas semanas', color: 'yellow' },
  { value: 'alta', label: 'Alta', description: 'Urgente, preciso o mais rapido possivel', color: 'red' },
] as const;

export const STATUS_SOLICITACAO = {
  aberta: { label: 'Aberta', color: 'blue' },
  em_orcamento: { label: 'Orçamento Enviado', color: 'yellow' },
  aceita: { label: 'Orçamento Aceito', color: 'green' },
  em_andamento: { label: 'Em Andamento', color: 'purple' },
  concluida: { label: 'Concluída', color: 'gray' },
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
  diagnostico: { label: 'Em diagnóstico', icon: '🔍', color: 'indigo', description: 'Diagnosticando o problema' },
  aguardando_pecas: { label: 'Aguardando peças', icon: '📦', color: 'yellow', description: 'Aguardando pecas necessarias' },
  em_execucao: { label: 'Em execução', icon: '🔧', color: 'green', description: 'Servico em andamento' },
  pausa_cliente: { label: 'Pausa - contato cliente', icon: '📞', color: 'orange', description: 'Aguardando retorno do cliente' },
  pausa_pecas: { label: 'Pausa - peças em falta', icon: '⏳', color: 'red', description: 'Parado por falta de pecas' },
  pausa_geral: { label: 'Pausado', icon: '⏸️', color: 'gray', description: 'Servico temporariamente pausado' },
  teste_final: { label: 'Teste final', icon: '✅', color: 'teal', description: 'Realizando testes de qualidade' },
  concluido: { label: 'Concluído', icon: '🏁', color: 'emerald', description: 'Servico finalizado' },
  entregue: { label: 'Entregue', icon: '🚗', color: 'slate', description: 'Veiculo entregue ao cliente' },
} as const;

export const CARGOS_FUNCIONARIO = {
  admin: { label: 'Administrador', description: 'Acesso completo ao portal da oficina' },
  mecanico: { label: 'Mecânico', description: 'Acesso a pagina de veiculos em servico' },
} as const;

export const COMISSAO_CONFIG = {
  TAXA_BASE: 0.15,
  TAXA_MIN: 0.05,
  TAXA_MAX: 0.15,
  BONUS_RESPOSTA_2H: 0.03,
  BONUS_RESPOSTA_4H: 0.02,
  BONUS_REVISAO_1_5: 0.02,
  BONUS_REVISAO_1_0: 0.01,
  BONUS_AVALIACAO_4_5: 0.03,
  BONUS_AVALIACAO_4_0: 0.02,
} as const;

// Comissao sobre venda de pecas (loja de pecas OU oficina fornecedora).
// Base bem mais baixa que a de servico (15%) porque a margem de peca e
// mais apertada e o objetivo aqui e so aprender se o canal pega - ver
// docs/NOVIDADES_RETENCAO_OFICINAS.md.
export const COMISSAO_PECAS_CONFIG = {
  TAXA_BASE: 0.03,
  TAXA_MIN: 0.01,
  TAXA_MAX: 0.03,
  BONUS_RESPOSTA_2H: 0.01,
  BONUS_RESPOSTA_6H: 0.005,
} as const;
