import type { Metadata } from 'next';
import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getTranslations } from 'next-intl/server';
import { Link, rota } from '@/i18n/navigation';
import { TIPOS_SERVICO } from '@fixauto/shared';
import StarRating from '@/components/ui/StarRating';
import StructuredData from '@/components/seo/StructuredData';
import { capitalizarCidade, hreflangAlternates, slugCidade, imagemCompartilhamento } from '@/lib/seo-utils';
import { OG_LOCALE, localePrefix as prefixoDoIdioma, type Locale } from '@/i18n/routing';
import { countryNameForCode } from '@/lib/currency';

// Sem isso o build pre-renderiza a pagina como estatica (o
// generateStaticParams do layout [locale] pesa mais que o uso de
// searchParams): os filtros ?cidade/?servico seriam ignorados e a lista
// ficaria congelada no estado do momento do build.
export const dynamic = 'force-dynamic';

const BASE_URL = 'https://bipfix.com';
const MAX_BADGES_SERVICO = 4;

interface OficinaResumo {
  id: string;
  nome_fantasia: string;
  cidade: string;
  estado: string;
  pais: string | null;
  especialidades: string[] | null;
  logo_url: string | null;
  avaliacao_media: number | null;
  total_avaliacoes: number | null;
  created_at: string;
}

type SearchParams = { cidade?: string | string[]; servico?: string | string[] };

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor) || '';
}

// Dedupe entre generateMetadata e a pagina (mesma requisicao). Filtro de
// cidade/servico e feito em memoria: a lista de oficinas ativas e pequena
// e a cidade e texto livre no cadastro ("Tallinn", "tallinn ", "Tállinn"),
// o que nao da pra comparar direito num .eq() do Postgres.
const buscarOficinasAtivas = cache(async (): Promise<OficinaResumo[]> => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from('oficinas')
    .select('id, nome_fantasia, cidade, estado, pais, especialidades, logo_url, avaliacao_media, total_avaliacoes, created_at')
    .eq('ativa', true);

  // Falha de banco nao pode virar "zero oficinas": a pagina sairia com
  // noindex e o estado vazio, e o erro passaria despercebido.
  if (error) throw new Error(`Falha ao buscar oficinas: ${error.message}`);

  return ((data || []) as OficinaResumo[]).sort(
    (a, b) =>
      Number(b.avaliacao_media || 0) - Number(a.avaliacao_media || 0) ||
      (b.total_avaliacoes || 0) - (a.total_avaliacoes || 0) ||
      a.created_at.localeCompare(b.created_at)
  );
});

function listarCidades(oficinas: OficinaResumo[]) {
  const porSlug = new Map<string, { slug: string; nome: string; total: number }>();
  for (const o of oficinas) {
    const slug = slugCidade(o.cidade);
    if (!slug) continue;
    const atual = porSlug.get(slug);
    if (atual) atual.total++;
    else porSlug.set(slug, { slug, nome: capitalizarCidade(o.cidade), total: 1 });
  }
  return Array.from(porSlug.values()).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

async function resolverFiltros(searchParams: Promise<SearchParams>) {
  const sp = await searchParams;
  const oficinas = await buscarOficinasAtivas();
  const cidades = listarCidades(oficinas);

  const cidadeSlug = slugCidade(primeiro(sp.cidade));
  const cidade = cidades.find((c) => c.slug === cidadeSlug) || null;
  const servicoParam = primeiro(sp.servico);
  const servico = TIPOS_SERVICO.some((s) => s.value === servicoParam) ? servicoParam : '';

  const filtradas = oficinas.filter(
    (o) =>
      (!cidade || slugCidade(o.cidade) === cidade.slug) &&
      (!servico || (o.especialidades || []).includes(servico))
  );

  return { oficinas, cidades, cidade, servico, filtradas };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'oficinasLista' });
  const { cidade, servico, filtradas } = await resolverFiltros(searchParams);

  const title = cidade ? t('metaTitleCidade', { cidade: cidade.nome }) : t('metaTitle');
  const description = cidade ? t('metaDescriptionCidade', { cidade: cidade.nome }) : t('metaDescription');

  // Pagina por cidade e a URL de cauda longa que vale indexar ("oficina em
  // Tallinn"); o filtro de servico e so conveniencia, entao aponta o
  // canonical pra versao sem ele.
  const alternates = hreflangAlternates(locale, cidade ? `/oficinas?cidade=${cidade.slug}` : '/oficinas');

  // Listagem vazia e "thin content" pro Google - enquanto nao houver
  // oficinas ativas (ou o filtro nao achar nenhuma), fica fora do indice.
  const indexavel = filtradas.length > 0 && !servico;

  return {
    title,
    description,
    alternates,
    robots: { index: indexavel, follow: true },
    openGraph: {
      images: imagemCompartilhamento(locale),
      type: 'website',
      locale: OG_LOCALE[locale as Locale] || 'pt_BR',
      siteName: 'BipFix',
      title,
      description,
      url: alternates.canonical,
    },
  };
}

export default async function OficinasPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'oficinasLista' });
  const tc = await getTranslations({ locale, namespace: 'constants' });
  const { oficinas, cidades, cidade, servico, filtradas } = await resolverFiltros(searchParams);

  const filtrando = Boolean(cidade || servico);
  const localePrefix = prefixoDoIdioma(locale);

  const itemListSchema =
    filtradas.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: cidade ? t('heroTitleCidade', { cidade: cidade.nome }) : t('heroTitle'),
          numberOfItems: filtradas.length,
          itemListElement: filtradas.map((o, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${BASE_URL}${localePrefix}/oficinas/${o.id}`,
            name: o.nome_fantasia,
          })),
        }
      : null;

  return (
    <div>
      <StructuredData data={itemListSchema} />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
            {cidade ? t('heroTitleCidade', { cidade: cidade.nome }) : t('heroTitle')}
          </h1>
          <p className="mt-4 text-lg text-white max-w-2xl leading-relaxed">{t('heroText')}</p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filtros - form GET puro, funciona sem JavaScript e gera URLs indexaveis */}
        {oficinas.length > 0 && (
          <form method="get" className="card mb-6 flex flex-col sm:flex-row sm:items-end gap-4">
            <label className="flex-1">
              <span className="block text-sm font-medium text-gray-700 mb-1">{t('filterCity')}</span>
              <select name="cidade" defaultValue={cidade?.slug || ''} className="input-field">
                <option value="">{t('filterAllCities')}</option>
                {cidades.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.nome} ({c.total})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1">
              <span className="block text-sm font-medium text-gray-700 mb-1">{t('filterService')}</span>
              <select name="servico" defaultValue={servico} className="input-field">
                <option value="">{t('filterAllServices')}</option>
                {TIPOS_SERVICO.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.icon} {tc(`tiposServico.${s.value}`)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary whitespace-nowrap">
                {t('filterSubmit')}
              </button>
              {filtrando && (
                <Link href="/oficinas" className="btn-secondary whitespace-nowrap">
                  {t('filterClear')}
                </Link>
              )}
            </div>
          </form>
        )}

        {oficinas.length === 0 ? (
          /* Pre-lancamento: nenhuma oficina ativa ainda */
          <div className="card text-center py-12 px-6">
            <div className="text-5xl mb-4" aria-hidden="true">🔧</div>
            <h2 className="text-2xl font-bold text-gray-900">{t('emptyTitle')}</h2>
            <p className="mt-3 text-gray-600 max-w-xl mx-auto leading-relaxed">{t('emptyText')}</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/seja-parceiro" className="btn-primary">
                {t('emptyCtaWorkshop')}
              </Link>
              <Link href="/cadastro" className="btn-secondary">
                {t('emptyCtaDriver')}
              </Link>
            </div>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="card text-center py-10 px-6">
            <h2 className="text-xl font-semibold text-gray-900">{t('noResultsTitle')}</h2>
            <p className="mt-2 text-gray-600">{t('noResultsText')}</p>
            <Link href="/oficinas" className="btn-secondary inline-block mt-6">
              {t('filterClear')}
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">{t('resultsCount', { count: filtradas.length })}</p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtradas.map((o) => {
                const media = Number(o.avaliacao_media || 0);
                const total = o.total_avaliacoes || 0;
                const especialidades = o.especialidades || [];
                const pais = countryNameForCode(o.pais);
                return (
                  <li key={o.id}>
                    <Link
                      href={rota('/oficinas/[id]', { id: o.id })}
                      className="card h-full flex flex-col hover:shadow-md hover:border-primary-200 transition-shadow"
                    >
                      <div className="flex items-start gap-3">
                        {o.logo_url ? (
                          <img
                            src={o.logo_url}
                            alt=""
                            className="w-12 h-12 rounded-full object-cover flex-shrink-0 border border-gray-100"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-primary-700 font-bold text-lg">{o.nome_fantasia.charAt(0)}</span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <h2 className="font-semibold text-gray-900 truncate">{o.nome_fantasia}</h2>
                          <p className="text-sm text-gray-500 truncate">
                            {capitalizarCidade(o.cidade)} - {o.estado}
                            {pais ? `, ${pais}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3">
                        {total > 0 ? (
                          <>
                            <StarRating rating={media} size="sm" />
                            <span className="text-sm font-medium text-gray-700">{media.toFixed(1)}</span>
                            <span className="text-sm text-gray-500">{t('reviewsCount', { count: total })}</span>
                          </>
                        ) : (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                            {t('newOnPlatform')}
                          </span>
                        )}
                      </div>

                      {especialidades.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {especialidades.slice(0, MAX_BADGES_SERVICO).map((esp) => (
                            <span key={esp} className="badge">
                              {TIPOS_SERVICO.find((s) => s.value === esp)?.icon} {tc(`tiposServico.${esp}`)}
                            </span>
                          ))}
                          {especialidades.length > MAX_BADGES_SERVICO && (
                            <span className="badge">
                              {t('moreServices', { count: especialidades.length - MAX_BADGES_SERVICO })}
                            </span>
                          )}
                        </div>
                      )}

                      <span className="mt-auto pt-4 text-sm font-medium text-primary-600">{t('viewProfile')} →</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* Chamada pra donos de oficina */}
        <section className="mt-12 rounded-xl bg-gray-50 border border-gray-200 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('ownerCtaTitle')}</h2>
            <p className="text-gray-600 mt-1">{t('ownerCtaText')}</p>
          </div>
          <Link href="/para-oficinas" className="btn-primary whitespace-nowrap text-center">
            {t('ownerCtaButton')}
          </Link>
        </section>
      </div>
    </div>
  );
}
