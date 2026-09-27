import { routing } from '@/i18n/routing';

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
}

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

/**
 * Gera Schema.org JSON-LD para AutoRepair / LocalBusiness
 */
export function generateAutoRepairSchema(oficina: OficinaSchema) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ['AutoRepair', 'LocalBusiness'],
    '@id': `${BASE_URL}/oficinas/${oficina.id}`,
    name: oficina.nome_fantasia,
    url: `${BASE_URL}/oficinas/${oficina.id}`,
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
    priceRange: '$$',
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '08:00',
        closes: '18:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Saturday',
        opens: '08:00',
        closes: '12:00',
      },
    ],
  };

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
  const localizedUrl = (l: string) => (l === routing.defaultLocale ? `${BASE_URL}${path}` : `${BASE_URL}/${l}${path}`);

  const languages: Record<string, string> = { 'x-default': localizedUrl(routing.defaultLocale) };
  for (const l of routing.locales) {
    languages[l] = localizedUrl(l);
  }

  return {
    canonical: localizedUrl(locale),
    languages,
  };
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
