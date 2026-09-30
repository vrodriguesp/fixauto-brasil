import { defineRouting } from 'next-intl/routing';
import GUIAS_INDICE from '@/lib/guias-indice.json';

// Idiomas do site:
// - pt    = portugues do BRASIL (/pt-br). Regras brasileiras: LGPD, CDC,
//           tabela FIPE, CPF/CNPJ. Ate 30/09/2026 ficava sem prefixo; os
//           enderecos antigos recebem 301 para /pt-br (middleware.ts).
// - pt-PT = portugues de PORTUGAL (/pt-pt). Pais da UE: textos legais do GDPR
//           e regras europeias, igual a en/et/it.
// - en    = ingles (fallback universal e x-default para o Google)
// - et    = estoniano (piloto em Tallinn)
// - it    = italiano
// - ru    = russo, para a comunidade russofona da ESTONIA (~1/3 de Tallinn):
//           conteudo europeu/estoniano (GDPR, euro), nao da Russia.
// Estrutura recomendada pelo Google (docs "Managing multi-regional and
// multilingual sites" e "Tell Google about localized versions"):
// - TODO idioma tem o proprio endereco com prefixo (subdiretorio) e
//   hreflang com a regiao (pt-BR / pt-PT); paginas de idioma nunca
//   redirecionam para outro idioma.
// - A raiz "/" NAO e versao de idioma: e a home internacional (o caso de uso
//   do x-default, blog do Google 2013 e 2023, tambem suportado pelo Yandex).
//   Ela manda a pessoa para a home do idioma dela (escolha salva > idioma do
//   navegador > ingles). Robos chegam sem Accept-Language -> ingles.
// - x-default de cada pagina = versao em ingles (padrao universal).
// Em paginas de idioma, components/layout/SugestaoIdioma.tsx so SUGERE a
// versao no idioma do navegador (sem redirecionar).
// Nomes das paginas PUBLICAS no idioma do publico (Google, "URL structure
// best practices": "Use words in your audience's language in the URL (and,
// if applicable, transliterated words)"). Estoniano sem diacriticos, russo
// transliterado para o alfabeto latino (links legiveis ao compartilhar).
// A chave e o caminho interno (pasta em app/[locale]); paginas fora desta
// lista (areas logadas, login, redefinir senha) ficam iguais em todo idioma.
// Mudar um nome aqui muda uma URL indexada: criar 301 do nome antigo.
export const PATHNAMES = {
  '/': '/',
  '/para-oficinas': {
    pt: '/para-oficinas', 'pt-PT': '/para-oficinas', en: '/for-repair-shops',
    et: '/tookodadele', it: '/per-officine', ru: '/dlya-avtoservisov',
  },
  '/seja-parceiro': {
    pt: '/seja-parceiro', 'pt-PT': '/seja-parceiro', en: '/become-a-partner',
    et: '/hakka-partneriks', it: '/diventa-partner', ru: '/stat-partnerom',
  },
  '/emergencia': {
    pt: '/emergencia', 'pt-PT': '/emergencia', en: '/accident',
    et: '/avarii', it: '/incidente', ru: '/dtp',
  },
  '/emergencia/acidente/[id]': {
    pt: '/emergencia/acidente/[id]', 'pt-PT': '/emergencia/acidente/[id]', en: '/accident/report/[id]',
    et: '/avarii/teade/[id]', it: '/incidente/segnalazione/[id]', ru: '/dtp/soobshchenie/[id]',
  },
  '/oficinas': {
    pt: '/oficinas', 'pt-PT': '/oficinas', en: '/repair-shops',
    et: '/tookojad', it: '/officine', ru: '/avtoservisy',
  },
  '/oficinas/[id]': {
    pt: '/oficinas/[id]', 'pt-PT': '/oficinas/[id]', en: '/repair-shops/[id]',
    et: '/tookojad/[id]', it: '/officine/[id]', ru: '/avtoservisy/[id]',
  },
  '/guias': {
    pt: '/guias', 'pt-PT': '/guias', en: '/guides',
    et: '/juhendid', it: '/guide', ru: '/stati',
  },
  '/guias/[slug]': {
    pt: '/guias/[slug]', 'pt-PT': '/guias/[slug]', en: '/guides/[slug]',
    et: '/juhendid/[slug]', it: '/guide/[slug]', ru: '/stati/[slug]',
  },
  '/termos': {
    pt: '/termos', 'pt-PT': '/termos', en: '/terms',
    et: '/tingimused', it: '/termini', ru: '/usloviya',
  },
  '/privacidade': {
    pt: '/privacidade', 'pt-PT': '/privacidade', en: '/privacy',
    et: '/privaatsus', it: '/privacy', ru: '/konfidentsialnost',
  },
  '/docs': {
    pt: '/ajuda', 'pt-PT': '/ajuda', en: '/help',
    et: '/abi', it: '/aiuto', ru: '/pomoshch',
  },
  '/docs/cliente': {
    pt: '/ajuda/motoristas', 'pt-PT': '/ajuda/condutores', en: '/help/drivers',
    et: '/abi/autojuhid', it: '/aiuto/automobilisti', ru: '/pomoshch/voditelyam',
  },
  '/docs/oficina': {
    pt: '/ajuda/oficinas', 'pt-PT': '/ajuda/oficinas', en: '/help/repair-shops',
    et: '/abi/tookojad', it: '/aiuto/officine', ru: '/pomoshch/avtoservisam',
  },
  '/cadastro': {
    pt: '/cadastro', 'pt-PT': '/registo', en: '/sign-up',
    et: '/registreeru', it: '/registrati', ru: '/registratsiya',
  },
  '/escolher-tipo': {
    pt: '/escolher-tipo', 'pt-PT': '/escolher-tipo', en: '/choose-account',
    et: '/vali-konto', it: '/scegli-account', ru: '/vybor-akkaunta',
  },
} as const;

export const routing = defineRouting({
  locales: ['pt', 'pt-PT', 'en', 'et', 'it', 'ru'],
  defaultLocale: 'en',
  localePrefix: {
    mode: 'always',
    prefixes: { pt: '/pt-br', 'pt-PT': '/pt-pt' },
  },
  localeDetection: false,
  // O idioma vem so da URL (e da escolha salva em bipfix_idioma); o cookie
  // NEXT_LOCALE nao e usado - desligado (ia sem Secure).
  localeCookie: false,
  pathnames: PATHNAMES as any, // areas logadas ficam fora da tabela (mesmo nome em todo idioma)
});

export type Locale = (typeof routing.locales)[number];

// Prefixo publico da URL de cada idioma (todos tem prefixo).
export const LOCALE_PREFIX: Record<Locale, string> = {
  pt: '/pt-br',
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
// idioma `locale`: '/termos' -> '/pt-br/termos', '/pt-pt/termos', '/en/termos'.
// Usado nos links de troca de idioma: aponta direto para a URL final.
export function caminhoNoIdioma(locale: string, pathname: string, params?: Record<string, string | string[] | undefined>): string {
  // Guia: cada idioma tem o proprio slug (e nem todo guia existe em todo
  // idioma) -> linka a versao certa, ou a lista de guias do idioma.
  if (pathname === '/guias/[slug]' && typeof params?.slug === 'string') {
    const slugs = Object.values(GUIAS_INDICE as Record<string, Record<string, string>>).find((m) =>
      Object.values(m).includes(params.slug as string)
    );
    const alvo = slugs?.[locale];
    return hrefNoIdioma(locale, alvo ? `/guias/${alvo}` : '/guias');
  }
  const caminho = caminhoLocal(locale, pathname, params);
  return `${localePrefix(locale)}${caminho === '/' ? '' : caminho}` || '/';
}

// Caminho interno ('/oficinas/abc', '/oficinas/[id]' + params, '/termos?x=1')
// -> nome publico no idioma ('/tookojad/abc', '/tingimused?x=1'). Caminhos
// fora de PATHNAMES voltam iguais.
export function caminhoLocal(locale: string, interno: string, params?: Record<string, string | string[] | undefined>): string {
  const [base, query] = interno.split('?');
  const partes = base.split('/').filter(Boolean);
  for (const [modelo, nomes] of Object.entries(PATHNAMES)) {
    const seg = modelo.split('/').filter(Boolean);
    if (seg.length !== partes.length) continue;
    const valores: Record<string, string> = {};
    const bate = seg.every((s, i) => {
      const m = s.match(/^\[(.+)\]$/);
      if (m) {
        const p = params?.[m[1]];
        valores[m[1]] = partes[i] === s && p ? String(p) : partes[i];
        return true;
      }
      return s === partes[i];
    });
    if (!bate) continue;
    const alvo = typeof nomes === 'string' ? nomes : (nomes as Record<string, string>)[locale] ?? modelo;
    const final = alvo.replace(/\[(.+?)\]/g, (_, k) => encodeURIComponent(valores[k] ?? ''));
    return query ? `${final}?${query}` : final;
  }
  return interno;
}

// Endereco publico completo (sem dominio) de um caminho interno no idioma:
// hrefNoIdioma('et', '/oficinas/abc') -> '/et/tookojad/abc';
// hrefNoIdioma('en', '') ou '/' -> '/en' (home sem barra final).
export function hrefNoIdioma(locale: string, interno: string): string {
  if (!interno || interno === '/') return localePrefix(locale) || '/';
  return `${localePrefix(locale)}${caminhoLocal(locale, interno)}`;
}
