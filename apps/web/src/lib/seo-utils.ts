import { routing, hreflangsDe, X_DEFAULT_LOCALE, localePrefix, hrefNoIdioma } from '@/i18n/routing';

interface OficinaSchema {
  id: string;
  nome_fantasia: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep?: string;
  pais?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  especialidades?: string[];
  profile?: {
    telefone?: string | null;
    nome?: string;
  } | null;
  horario_funcionamento?: Partial<Record<keyof typeof DIA_SCHEMA, { aberto: boolean; inicio: string; fim: string }>> | null;
}

// Chaves de oficinas.horario_funcionamento -> dia da semana do schema.org
const DIA_SCHEMA = {
  seg: 'Monday',
  ter: 'Tuesday',
  qua: 'Wednesday',
  qui: 'Thursday',
  sex: 'Friday',
  sab: 'Saturday',
  dom: 'Sunday',
} as const;

interface AvaliacaoSchema {
  nota: number;
  comentario?: string | null;
  cliente?: {
    nome?: string;
  } | null;
}

interface FAQItem {
  pergunta: string;
  resposta: string;
}

const BASE_URL = 'https://bipfix.com';

// Oficinas digitam a cidade livremente no cadastro (ex: "sao paulo", tudo
// minusculo, sem acento) - isso vaza pro title/description exibido no
// Google, entao pelo menos capitaliza cada palavra aqui na exibicao, sem
// mexer no valor salvo no banco.
export function capitalizarCidade(cidade: string): string {
  return cidade
    .trim()
    .split(/\s+/)
    .map((palavra) => (palavra.length > 2 ? palavra.charAt(0).toUpperCase() + palavra.slice(1) : palavra))
    .join(' ');
}

// Chave estavel de cidade pra filtro/URL (?cidade=sao-paulo): "São Paulo",
// "sao paulo" e "SAO PAULO " viram a mesma cidade.
export function slugCidade(cidade: string): string {
  return cidade
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Gera Schema.org JSON-LD para AutoRepair / LocalBusiness
 */
export function generateAutoRepairSchema(oficina: OficinaSchema, locale: string = routing.defaultLocale) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ['AutoRepair', 'LocalBusiness'],
    // @id identifica a oficina (mesma em todos os idiomas); url e a pagina
    // deste idioma, igual ao canonical dela.
    '@id': `${BASE_URL}/oficinas/${oficina.id}`,
    name: oficina.nome_fantasia,
    url: localizedUrl(locale, `/oficinas/${oficina.id}`),
    address: {
      '@type': 'PostalAddress',
      streetAddress: oficina.endereco,
      addressLocality: oficina.cidade,
      addressRegion: oficina.estado,
      postalCode: oficina.cep || undefined,
      // Sem fallback fixo pra 'BR': a oficina pode ser de qualquer pais
      // (piloto e europeu) - melhor omitir o campo que declarar um pais
      // errado quando o cadastro ainda nao tem `pais` preenchido.
      addressCountry: oficina.pais || undefined,
    },
    areaServed: {
      '@type': 'City',
      name: oficina.cidade,
    },
  };

  // Horario REAL cadastrado pela oficina; sem horario o campo fica de fora.
  // Antes era Seg-Sex 08-18 / Sab 08-12 fixo para toda oficina, mais um
  // priceRange '$$' inventado - dado estruturado falso e pior que ausente.
  const horario = oficina.horario_funcionamento;
  if (horario) {
    const abertos = (Object.keys(DIA_SCHEMA) as (keyof typeof DIA_SCHEMA)[])
      .map((chave) => ({ dayOfWeek: DIA_SCHEMA[chave], h: horario[chave] }))
      .filter(({ h }) => h?.aberto && h.inicio && h.fim);
    if (abertos.length) {
      schema.openingHoursSpecification = abertos.map(({ dayOfWeek, h }) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek,
        opens: h!.inicio,
        closes: h!.fim,
      }));
    }
  }

  if (oficina.profile?.telefone) {
    schema.telephone = oficina.profile.telefone;
  }

  if (oficina.latitude && oficina.longitude) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: oficina.latitude,
      longitude: oficina.longitude,
    };
  }

  return schema;
}

/**
 * Gera Schema.org JSON-LD para AggregateRating
 */
export function generateReviewSchema(
  oficina: OficinaSchema,
  avaliacoes: AvaliacaoSchema[]
) {
  if (avaliacoes.length === 0) return null;

  const totalNotas = avaliacoes.reduce((sum, a) => sum + a.nota, 0);
  const media = totalNotas / avaliacoes.length;

  return {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    '@id': `${BASE_URL}/oficinas/${oficina.id}`,
    name: oficina.nome_fantasia,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: media.toFixed(1),
      bestRating: '5',
      worstRating: '1',
      ratingCount: avaliacoes.length,
    },
    review: avaliacoes
      .filter((a) => a.comentario)
      .slice(0, 10)
      .map((a) => ({
        '@type': 'Review',
        reviewRating: {
          '@type': 'Rating',
          ratingValue: a.nota,
          bestRating: '5',
        },
        author: {
          '@type': 'Person',
          name: a.cliente?.nome || 'Cliente',
        },
        reviewBody: a.comentario,
      })),
  };
}

/**
 * Gera { canonical, languages } pro campo `alternates` do generateMetadata.
 *
 * IMPORTANTE: quando uma pagina/layout define seu proprio `alternates` no
 * generateMetadata, isso SUBSTITUI por completo o `alternates` herdado do
 * layout pai (Next.js nao faz merge profundo de campos de objeto aninhados,
 * so merge raso por chave de topo) - o `languages` (hreflang) do
 * `[locale]/layout.tsx`, que so cobre a home, se perde silenciosamente em
 * qualquer pagina com metadata propria. Toda pagina que define `alternates`
 * deve usar este helper para nao perder o hreflang.
 *
 * `path` e relativo ao locale, sem prefixo (ex: '/seja-parceiro', '/oficinas/123').
 */
export function hreflangAlternates(locale: string, path: string) {
  // Chaves idioma-PAIS (et-EE, ru-EE, pt-BR, pt-PT...) + catch-all et/it
  // (routing.ts). x-default: raiz na home, /ee/en nas demais.
  // home: x-default = raiz "https://bipfix.com/" (pagina de escolha de idioma);
  // demais paginas: a versao em ingles
  const languages: Record<string, string> = { 'x-default': path === '' || path === '/' ? 'https://bipfix.com/' : localizedUrl(X_DEFAULT_LOCALE, path) };
  for (const l of routing.locales) {
    for (const codigo of hreflangsDe(l)) languages[codigo] = localizedUrl(l, path);
  }

  return {
    canonical: localizedUrl(locale, path),
    languages,
  };
}

/** URL absoluta de `path` no idioma `locale` (ex: localizedUrl('pt-PT', '/termos') -> https://bipfix.com/pt/pt/termos). */
export function localizedUrl(locale: string, path: string): string {
  return `${BASE_URL}${hrefNoIdioma(locale, path)}`;
}

/**
 * Gera Schema.org JSON-LD para FAQPage
 */
export function generateFAQSchema(faqs: FAQItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.pergunta,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.resposta,
      },
    })),
  };
}

// Imagem de compartilhamento (og:image) pelo endereco publico do idioma.
// Paginas que definem `openGraph` proprio substituem o do layout inteiro e
// perdiam a imagem; por isso cada uma repassa esta.
export function imagemCompartilhamento(locale: string) {
  return [{ url: `${BASE_URL}${localePrefix(locale)}/opengraph-image`, width: 1200, height: 630, alt: 'BipFix' }];
}
