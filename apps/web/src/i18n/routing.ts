import { defineRouting } from 'next-intl/routing';

// Idiomas do site:
// - pt    = portugues do BRASIL (padrao, sem prefixo na URL - mantem os links
//           ja indexados em bipfix.com/...). Regras brasileiras: LGPD, CDC,
//           tabela FIPE, CPF/CNPJ.
// - pt-PT = portugues de PORTUGAL (/pt-pt). Pais da UE: textos legais do GDPR
//           e regras europeias, igual a en/et/it.
// - en    = ingles (fallback universal e x-default para o Google)
// - et    = estoniano (piloto em Tallinn)
// - it    = italiano
// Pratica recomendada pelo Google para variantes regionais: uma URL por
// variante + hreflang com a regiao (pt-BR / pt-PT), sem redirecionar por IP.
// Na primeira visita a "/", o next-intl escolhe pelo Accept-Language do
// navegador (pt-PT -> /pt-pt, it -> /it...).
export const routing = defineRouting({
  locales: ['pt', 'pt-PT', 'en', 'et', 'it'],
  defaultLocale: 'pt',
  localePrefix: {
    mode: 'as-needed',
    prefixes: { 'pt-PT': '/pt-pt' },
  },
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];

// Prefixo publico da URL de cada idioma ('' para o padrao).
export const LOCALE_PREFIX: Record<Locale, string> = {
  pt: '',
  'pt-PT': '/pt-pt',
  en: '/en',
  et: '/et',
  it: '/it',
};

// Codigo BCP 47 com regiao: <html lang>, hreflang, formatacao de datas.
export const HREFLANG: Record<Locale, string> = {
  pt: 'pt-BR',
  'pt-PT': 'pt-PT',
  en: 'en',
  et: 'et',
  it: 'it',
};

// og:locale (formato com underscore)
export const OG_LOCALE: Record<Locale, string> = {
  pt: 'pt_BR',
  'pt-PT': 'pt_PT',
  en: 'en_US',
  et: 'et_EE',
  it: 'it_IT',
};

// Versao mostrada pelo Google a quem nao bate com nenhum idioma (hreflang
// x-default). O mercado atual e a Europa, entao ingles - nao o Brasil.
export const X_DEFAULT_LOCALE: Locale = 'en';

export function localePrefix(locale: string): string {
  return LOCALE_PREFIX[locale as Locale] ?? `/${locale}`;
}

// Brasil = unico idioma com regras juridicas/de cadastro brasileiras.
export function isBrasil(locale: string): boolean {
  return locale === 'pt';
}
