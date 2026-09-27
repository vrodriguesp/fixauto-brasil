// Helpers de formatacao (moeda/data/pais) compartilhados entre o site
// (Next.js) e o app mobile (Expo/React Native) - so usam a API Intl
// nativa, sem nenhuma dependencia de framework, entao vivem aqui em vez
// de duplicados nos dois apps.

// Formatacao de DATA segue o idioma de quem esta LENDO a tela - isso e so
// uma convencao de escrita, correto pra qualquer pagina/tela. Default 'pt'
// preserva o comportamento antigo pra quem nao passar nada.
export const INTL_LOCALE: Record<string, string> = { pt: 'pt-BR', en: 'en-US', et: 'et-EE', it: 'it-IT' };

// Moeda decidida pelo PAIS DA OFICINA/LOJA que emitiu o preco - nunca
// pelo idioma de quem esta olhando a tela. Um usuario em pt pode ser
// brasileiro (BRL) ou portugues (EUR); um usuario em en pode estar em
// qualquer lugar. So o pais real da oficina/loja diz a moeda certa.
// Codigos ISO 3166-1 alpha-2 (o mesmo formato salvo em oficinas.pais /
// lojas_pecas.pais, resolvido via geocodificacao no cadastro).
const EURO_COUNTRIES = new Set([
  'AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV',
  'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES', 'AD', 'MC', 'SM', 'VA',
]);

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  BR: 'BRL',
  GB: 'GBP',
  CH: 'CHF',
  NO: 'NOK',
  SE: 'SEK',
  DK: 'DKK',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  BG: 'BGN',
};

/**
 * Moeda pro pais informado. Pais nao reconhecido (ou ausente, ex: cadastro
 * antigo antes desta coluna existir) cai em EUR - mais seguro que BRL dado
 * que o piloto e europeu; BRL so quando o pais e explicitamente Brasil.
 */
export function currencyForCountry(pais: string | null | undefined): string {
  if (!pais) return 'EUR';
  const code = pais.toUpperCase();
  if (CURRENCY_BY_COUNTRY[code]) return CURRENCY_BY_COUNTRY[code];
  if (EURO_COUNTRIES.has(code)) return 'EUR';
  return 'EUR';
}

/**
 * Nome do pais por extenso a partir do codigo ISO alpha-2 (ex: 'EE' ->
 * 'Estonia'), pra usar em textos/queries que precisam do nome e nao so
 * do codigo (ex: query do embed do Google Maps). Usa Intl.DisplayNames
 * em vez de manter uma lista propria - funciona pra qualquer pais,
 * inclusive os que ainda nao existem em CURRENCY_BY_COUNTRY.
 */
export function countryNameForCode(pais: string | null | undefined, locale: string = 'en'): string | null {
  if (!pais) return null;
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(pais.toUpperCase()) || null;
  } catch {
    return null;
  }
}

// Formatacao de MOEDA e diferente: precisa da moeda de verdade (do pais
// da oficina/loja que emitiu o preco) e, separadamente, da convencao
// numerica de quem esta lendo (locale) - ex: um cliente en lendo um
// preco de uma oficina estonia ve "€1,234.56" (moeda EUR real, formatacao
// americana), nao "R$" so porque o idioma da tela e pt. NUNCA decidir a
// moeda pelo locale/idioma - so pelo pais (currencyForCountry acima).
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
