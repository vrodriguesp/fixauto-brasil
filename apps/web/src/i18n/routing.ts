import { defineRouting } from 'next-intl/routing';
import GUIAS_INDICE from '@/lib/guias-indice.json';

// Versoes do site = MERCADO (pais) + idioma, como IKEA (ikea.com/ee/et/) e
// Norwegian (decisao do dono 09/10/2026, docs/ANALISE_ESTRUTURA_MERCADOS_2026-10-09.md).
// Codigo do pais ISO 3166 (EE = Estonia, tambem o dominio .ee); codigo do
// idioma ISO 639 (et = estoniano). O nome interno do idioma (pasta
// app/[locale], mensagens, profiles.idioma) nao muda; so o endereco publico:
// - et    -> /ee/et  estoniano, Estonia (piloto em Tallinn)
// - ru    -> /ee/ru  russo para a comunidade russofona da ESTONIA (~1/3 de
//                    Tallinn): GDPR, euro - nao a Russia (hreflang ru-EE)
// - en    -> /ee/en  ingles, Estonia
// - it    -> /it/it  Italia (mercado de teste)
// - pt-PT -> /pt/pt  Portugal
// - pt    -> /br/pt  Brasil (LGPD, CDC, FIPE, CPF/CNPJ)
// Enderecos antigos (/et, /ru, /en, /it, /pt-br, /pt-pt e os do Brasil sem
// prefixo) recebem 301 para os novos (middleware.ts).
// Estrutura recomendada pelo Google (docs "Managing multi-regional and
// multilingual sites" e "Tell Google about localized versions"):
// - subpastas no .com com hreflang idioma-PAIS (et-EE, ru-EE...); paginas
//   nunca redirecionam para outra versao.
// - A raiz "/" NAO e versao: e a escolha de pais/idioma (x-default), 200,
//   sem redirecionar (padrao IKEA "Welcome to IKEA Global" e Norwegian).
// - x-default das paginas internas = /ee/en.
// Em cada pagina, components/layout/SugestaoIdioma.tsx so SUGERE outro
// idioma do MESMO pais (sem redirecionar).
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
  '/excluir-conta': {
    pt: '/excluir-conta', 'pt-PT': '/eliminar-conta', en: '/delete-account',
    et: '/kustuta-konto', it: '/elimina-account', ru: '/udalit-akkaunt',
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
  '/sobre': {
    pt: '/sobre', 'pt-PT': '/sobre', en: '/about',
    et: '/meist', it: '/chi-siamo', ru: '/o-nas',
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
    prefixes: { pt: '/br/pt', 'pt-PT': '/pt/pt', en: '/ee/en', et: '/ee/et', it: '/it/it', ru: '/ee/ru' },
  },
  localeDetection: false,
  // O idioma vem so da URL (e da escolha salva em bipfix_idioma); o cookie
  // NEXT_LOCALE nao e usado - desligado (ia sem Secure).
  localeCookie: false,
  pathnames: PATHNAMES as any, // areas logadas ficam fora da tabela (mesmo nome em todo idioma)
});

export type Locale = (typeof routing.locales)[number];

// Prefixo publico da URL de cada versao: /{pais}/{idioma}.
export const LOCALE_PREFIX: Record<Locale, string> = {
  pt: '/br/pt',
  'pt-PT': '/pt/pt',
  en: '/ee/en',
  et: '/ee/et',
  it: '/it/it',
  ru: '/ee/ru',
};

// Codigo BCP 47 idioma-PAIS: <html lang>, hreflang, Content-Language.
export const HREFLANG: Record<Locale, string> = {
  pt: 'pt-BR',
  'pt-PT': 'pt-PT',
  en: 'en-EE',
  et: 'et-EE',
  it: 'it-IT',
  ru: 'ru-EE',
};

// hreflang so de idioma ("catch-all", Google: "provide a catchall URL for
// users of that language") apenas onde o idioma tem UM mercado: estoniano e
// italiano (como Wolt: et + et-EE). Russo e ingles NAO: "ru"/"en" diriam que
// a pagina de Tallinn serve para a Russia ou para o mundo todo.
export const HREFLANG_EXTRA: Partial<Record<Locale, string>> = { et: 'et', it: 'it' };

// Todos os codigos hreflang de uma versao
export function hreflangsDe(locale: Locale): string[] {
  return HREFLANG_EXTRA[locale] ? [HREFLANG[locale], HREFLANG_EXTRA[locale]!] : [HREFLANG[locale]];
}

// Mercados (paises), na ordem da pagina inicial e do seletor
export const MERCADOS: { pais: 'EE' | 'IT' | 'PT' | 'BR'; nome: string; locales: Locale[] }[] = [
  { pais: 'EE', nome: 'Eesti', locales: ['et', 'ru', 'en'] },
  { pais: 'IT', nome: 'Italia', locales: ['it'] },
  { pais: 'PT', nome: 'Portugal', locales: ['pt-PT'] },
  { pais: 'BR', nome: 'Brasil', locales: ['pt'] },
];

// Nome do idioma escrito nele mesmo
export const NOME_IDIOMA_NATIVO: Record<Locale, string> = {
  et: 'Eesti keel', ru: 'Русский', en: 'English', it: 'Italiano', 'pt-PT': 'Português', pt: 'Português',
};

export function mercadoDe(locale: string) {
  return MERCADOS.find((m) => (m.locales as string[]).includes(locale)) ?? MERCADOS[0];
}

// "Eesti · Русский", "Italia · Italiano"
export function rotuloVersao(locale: Locale): string {
  return `${mercadoDe(locale).nome} · ${NOME_IDIOMA_NATIVO[locale]}`;
}

// og:locale (formato com underscore)
export const OG_LOCALE: Record<Locale, string> = {
  pt: 'pt_BR',
  'pt-PT': 'pt_PT',
  en: 'en_GB',
  et: 'et_EE',
  it: 'it_IT',
  ru: 'ru_EE',
};

// x-default das paginas internas (a home usa a raiz "/", escolha de pais/idioma):
// ingles da Estonia, o mercado principal.
export const X_DEFAULT_LOCALE: Locale = 'en';

export function localePrefix(locale: string): string {
  return LOCALE_PREFIX[locale as Locale] ?? `/${locale}`;
}

// Brasil = unico idioma com regras juridicas/de cadastro brasileiras.
export function isBrasil(locale: string): boolean {
  return locale === 'pt';
}

// Endereco publico de `pathname` (sem prefixo de idioma, ex: '/termos') no
// idioma `locale`: '/termos' -> '/br/pt/termos', '/pt/pt/termos', '/ee/en/terms'.
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
// hrefNoIdioma('et', '/oficinas/abc') -> '/ee/et/tookojad/abc';
// hrefNoIdioma('en', '') ou '/' -> '/ee/en' (home sem barra final).
export function hrefNoIdioma(locale: string, interno: string): string {
  if (!interno || interno === '/') return localePrefix(locale) || '/';
  return `${localePrefix(locale)}${caminhoLocal(locale, interno)}`;
}
