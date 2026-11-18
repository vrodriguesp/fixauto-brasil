import { hreflangsDe, type Locale } from '@/i18n/routing';
import { localizedUrl } from '@/lib/seo-utils';
import { LOCALES_LOJA, DIAS_LOJA } from '@/lib/loja-publica-regras';
import type { LojaPublica } from '@/lib/loja-publica';

// SEO da pagina publica da loja (lote 4): hreflang SO das versoes da Estonia (et-EE, ru-EE, en-EE) e
// x-default em ingles; schema.org AutoPartsStore com aggregateRating so com >= 3 avaliacoes visiveis.

export function alternatesLoja(locale: string, interno: string) {
  const languages: Record<string, string> = { 'x-default': localizedUrl('en', interno) };
  for (const l of LOCALES_LOJA) for (const c of hreflangsDe(l as Locale)) languages[c] = localizedUrl(l, interno);
  return { canonical: localizedUrl(locale, interno), languages };
}

const DIA_SCHEMA: Record<(typeof DIAS_LOJA)[number], string> = {
  seg: 'https://schema.org/Monday', ter: 'https://schema.org/Tuesday', qua: 'https://schema.org/Wednesday', qui: 'https://schema.org/Thursday',
  sex: 'https://schema.org/Friday', sab: 'https://schema.org/Saturday', dom: 'https://schema.org/Sunday',
};

export function schemaLoja(loja: LojaPublica, locale: string, nomeLista: string, nomeInicio: string) {
  const url = localizedUrl(locale, `/lojas/${loja.segmento}`);
  const s: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'AutoPartsStore',
    '@id': `https://bipfix.com/p/${loja.numero}`,
    name: loja.nome_fantasia,
    url,
    address: { '@type': 'PostalAddress', streetAddress: loja.endereco, addressLocality: loja.cidade, addressRegion: loja.estado || undefined, postalCode: loja.cep || undefined, addressCountry: loja.pais || 'EE' },
  };
  if (loja.descricao) s.description = loja.descricao;
  if (loja.latitude != null && loja.longitude != null) s.geo = { '@type': 'GeoCoordinates', latitude: loja.latitude, longitude: loja.longitude };
  const h = loja.horario_funcionamento || {};
  const abertos = DIAS_LOJA.filter((d) => h[d]?.aberto && h[d]?.inicio && h[d]?.fim);
  if (abertos.length) s.openingHoursSpecification = abertos.map((d) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: DIA_SCHEMA[d], opens: h[d]!.inicio, closes: h[d]!.fim }));
  if (loja.resumo) s.aggregateRating = { '@type': 'AggregateRating', ratingValue: loja.resumo.media.toFixed(1), bestRating: '5', worstRating: '1', ratingCount: loja.resumo.total };
  const migalhas = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: nomeInicio, item: localizedUrl(locale, '/') },
      { '@type': 'ListItem', position: 2, name: nomeLista, item: localizedUrl(locale, '/lojas') },
      { '@type': 'ListItem', position: 3, name: loja.nome_fantasia, item: url },
    ],
  };
  return [s, migalhas];
}
