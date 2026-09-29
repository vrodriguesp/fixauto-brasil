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
// - ru    = russo, para a comunidade russofona da ESTONIA (~1/3 de Tallinn):
//           conteudo europeu/estoniano (GDPR, euro), nao da Russia.
// Pratica recomendada pelo Google para sites multilingues: uma URL por
// idioma/variante + hreflang com a regiao (pt-BR / pt-PT) e NENHUM
// redirecionamento automatico por idioma do navegador, cookie ou IP - o
// idioma vem so da URL. Redirecionar escondia a versao brasileira (/) de
// todo robo que manda Accept-Language (Bing, IAs). Para o visitante humano,
// components/layout/SugestaoIdioma.tsx sugere (sem redirecionar) a versao
// no idioma do navegador.
export const routing = defineRouting({
  locales: ['pt', 'pt-PT', 'en', 'et', 'it', 'ru'],
  defaultLocale: 'pt',
  localePrefix: {
    mode: 'as-needed',
    prefixes: { 'pt-PT': '/pt-pt' },
  },
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

// Prefixo publico da URL de cada idioma ('' para o padrao).
export const LOCALE_PREFIX: Record<Locale, string> = {
  pt: '',
  'pt-PT': '/pt-pt',
  en: '/en',
  et: '/et',
  it: '/it',
  ru: '/ru',
};

// Codigo BCP 47 com regiao: <html lang>, hreflang, formatacao de datas.
export const HREFLANG: Record<Locale, string> = {
  pt: 'pt-BR',
  'pt-PT': 'pt-PT',
  en: 'en',
  et: 'et',
  it: 'it',
  ru: 'ru',
};

// og:locale (formato com underscore)
export const OG_LOCALE: Record<Locale, string> = {
  pt: 'pt_BR',
  'pt-PT': 'pt_PT',
  en: 'en_GB',
  et: 'et_EE',
  it: 'it_IT',
  ru: 'ru_RU',
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

// Endereco publico de `pathname` (sem prefixo de idioma, ex: '/termos') no
// idioma `locale`: '/termos' -> '/termos' (pt), '/pt-pt/termos', '/en/termos'.
// Usado nos links de troca de idioma: aponta direto para a URL final, sem
// passar por '/pt' (que redirecionava).
export function caminhoNoIdioma(locale: string, pathname: string): string {
  const caminho = pathname === '/' ? '' : pathname;
  return `${localePrefix(locale)}${caminho}` || '/';
}
