import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// Movidos para packages/shared/format.ts (24/09 - reaproveitados pelo app
// mobile). Re-exportados aqui pra nao quebrar os arquivos que ja importam
// de '@/lib/utils'.
export { INTL_LOCALE, formatCurrency, formatDate, formatDateTime, timeAgo, distanciaKm } from '@fixauto/shared';

export function calcDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    aberta: 'bg-blue-100 text-blue-800',
    em_orcamento: 'bg-yellow-100 text-yellow-800',
    aceita: 'bg-green-100 text-green-800',
    em_andamento: 'bg-purple-100 text-purple-800',
    concluida: 'bg-gray-100 text-gray-800',
    cancelada: 'bg-red-100 text-red-800',
    no_show: 'bg-orange-100 text-orange-800',
    enviado: 'bg-blue-100 text-blue-800',
    visualizado: 'bg-yellow-100 text-yellow-800',
    aceito: 'bg-green-100 text-green-800',
    recusado: 'bg-red-100 text-red-800',
    expirado: 'bg-gray-100 text-gray-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

export function getUrgenciaColor(urgencia: string): string {
  const colors: Record<string, string> = {
    baixa: 'bg-green-100 text-green-800',
    media: 'bg-yellow-100 text-yellow-800',
    alta: 'bg-red-100 text-red-800',
  };
  return colors[urgencia] || 'bg-gray-100 text-gray-800';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    aberta: 'Aberta',
    em_orcamento: 'Orçamento Enviado',
    aceita: 'Orçamento Aceito',
    em_andamento: 'Em Andamento',
    concluida: 'Concluída',
    cancelada: 'Cancelada',
    no_show: 'Não compareceu',
    enviado: 'Enviado',
    visualizado: 'Visualizado',
    aceito: 'Aceito',
    recusado: 'Recusado',
    expirado: 'Expirado',
  };
  return labels[status] || status;
}

export function cleanDescricao(desc: string | null | undefined): string {
  if (!desc) return '';
  return desc.replace(/\[TIPO:\w+\]\s*/g, '').replace(/\[RESP:\w+\]\s*/g, '').replace(/\[COMISSAO:[^\]]+\]\s*/g, '').trim();
}

// "aguardando_pecas" -> "aguardandoPecasDesc" (chave da descricao da etapa nas mensagens)
export const chaveDesc = (status: string) => status.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase()) + 'Desc';

// Pedido do "acabei de bater" leva [TIPO:eu_causei|outro_causou|sem_outro] na
// descricao e tipo "colisao" (para chegar as oficinas de carroceria). Para a
// oficina, o rotulo certo e o da ocorrencia - um pneu furado sem outro
// veiculo nao e "colisao".
export function rotuloTipoPedido(tc: { (k: string): string; has: (k: string) => boolean }, tipo: string, descricao?: string | null) {
  const oc = descricao?.match(/\[TIPO:(\w+)\]/)?.[1];
  if (oc && tc.has(`tiposOcorrencia.${oc}`)) return tc(`tiposOcorrencia.${oc}`);
  return tc.has(`tiposServico.${tipo}`) ? tc(`tiposServico.${tipo}`) : tipo;
}
