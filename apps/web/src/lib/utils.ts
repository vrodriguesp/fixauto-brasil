import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// Formatacao de DATA segue o idioma de quem esta LENDO a tela
// (useLocale()) - isso e so uma convencao de escrita, correto pra
// qualquer pagina. Default 'pt' preserva o comportamento antigo pra quem
// nao passar nada (ex: paginas do admin, que ficam so em portugues).
export const INTL_LOCALE: Record<string, string> = { pt: 'pt-BR', en: 'en-US', et: 'et-EE', it: 'it-IT' };

// Formatacao de MOEDA e diferente: precisa da moeda de verdade (do pais
// da oficina/loja que emitiu o preco - ver lib/currency.ts) e,
// separadamente, da convencao numerica de quem esta lendo (locale) - ex:
// um cliente en lendo um preco de uma oficina estonia ve "€1,234.56"
// (moeda EUR real, formatacao americana), nao "R$" so porque o idioma da
// tela e pt. NUNCA decidir a moeda pelo locale/idioma - so pelo pais.
export function formatCurrency(value: number, currency: string = 'BRL', locale: string = 'pt'): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale] || 'pt-BR', {
    style: 'currency',
    currency,
  }).format(value);
}

export function formatDate(date: string, locale: string = 'pt'): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale] || 'pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string, locale: string = 'pt'): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale] || 'pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

const TIME_AGO_WORDS: Record<string, { agora: string; min: string; h: string; d: string }> = {
  pt: { agora: 'agora', min: 'min atrás', h: 'h atrás', d: 'd atrás' },
  en: { agora: 'just now', min: 'min ago', h: 'h ago', d: 'd ago' },
  et: { agora: 'just nüüd', min: 'min tagasi', h: 't tagasi', d: 'p tagasi' },
  it: { agora: 'adesso', min: 'min fa', h: 'h fa', d: 'g fa' },
};

export function timeAgo(date: string, locale: string = 'pt'): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const words = TIME_AGO_WORDS[locale] || TIME_AGO_WORDS.pt;

  if (diffMins < 1) return words.agora;
  if (diffMins < 60) return `${diffMins}${words.min}`;
  if (diffHours < 24) return `${diffHours}${words.h}`;
  if (diffDays < 7) return `${diffDays}${words.d}`;
  return formatDate(date, locale);
}

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

/** Distancia em km entre duas coordenadas (formula de haversine). */
export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
