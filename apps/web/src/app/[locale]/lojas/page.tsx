import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { OG_LOCALE, type Locale } from '@/i18n/routing';
import { imagemCompartilhamento } from '@/lib/seo-utils';
import { INTL_LOCALE } from '@/lib/utils';
import { listarLojasPublicas, paginaPublicaGlobal } from '@/lib/loja-publica';
import { CATEGORIAS_LOJA, ehLocaleLoja } from '@/lib/loja-publica-regras';
import { alternatesLoja } from './loja-seo';

// Lista das lojas de pecas com pagina publica (lote 4, 18/11). So nos idiomas da Estonia; noindex enquanto
// nenhuma loja for indexavel (lista vazia ou so lojas de teste/incompletas).
// C-2 (Fable 18/11): com o interruptor global desligado E nenhuma loja (de teste) para mostrar, a lista nao existe
// (404) - em producao, desligado, nenhuma pagina nova fica visivel. Ligado e vazia: 200 "ainda nao ha lojas" (noindex).
// sem cache: ligar/desligar a pagina (loja ou interruptor) vale na hora; pouco trafego
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  if (!ehLocaleLoja(locale)) return { robots: { index: false, follow: false } };
  const t = await getTranslations({ locale, namespace: 'lojaPublica' });
  const lojas = await listarLojasPublicas();
  if (!lojas.length && !(await paginaPublicaGlobal())) return { robots: { index: false, follow: false } };
  const title = t('listaMetaTitle');
  const description = t('listaMetaDescription');
  const alternates = alternatesLoja(locale, '/lojas');
  return {
    title: { absolute: title },
    description,
    alternates,
    ...(lojas.some((l) => l.indexavel) ? {} : { robots: { index: false, follow: true } }),
    openGraph: { images: imagemCompartilhamento(locale), type: 'website', locale: OG_LOCALE[locale as Locale], siteName: 'BipFix', title, description, url: alternates.canonical },
  };
}

export default async function LojasPage({ params }: Params) {
  const { locale } = await params;
  if (!ehLocaleLoja(locale)) notFound();
  const t = await getTranslations({ locale, namespace: 'lojaPublica' });
  const lojas = await listarLojasPublicas();
  if (!lojas.length && !(await paginaPublicaGlobal())) notFound();
  const intl = INTL_LOCALE[locale] || 'en-GB';
  const decimal = (n: number) => new Intl.NumberFormat(intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8" data-testid="lojas-lista">
      <h1 className="text-2xl font-bold text-gray-900">{t('listaTitulo')}</h1>
      <p className="text-gray-600 mt-1 mb-6">{t('listaIntro')}</p>
      {lojas.length === 0 ? (
        <p className="text-gray-500" data-testid="lojas-lista-vazia">{t('listaVazia')}</p>
      ) : (
        <ul className="space-y-3">
          {lojas.map((l) => (
            <li key={l.id}>
              <Link href={{ pathname: '/lojas/[slug]', params: { slug: l.segmento } } as any} className="card block hover:shadow-md transition-shadow" data-testid="lojas-lista-item" data-numero={l.numero}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-gray-900 break-words min-w-0">{l.nome_fantasia}</span>
                  {l.resumo && <span className="text-sm font-semibold text-yellow-800">★ {t('avaliacoesResumo', { media: decimal(l.resumo.media), total: l.resumo.total })}</span>}
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {l.cidade}{l.entrega ? ` · 🚚 ${t('entrega')}` : ''}
                </p>
                {l.categorias.length > 0 && (
                  <p className="text-sm text-gray-700 mt-1 break-words">
                    {CATEGORIAS_LOJA.filter((c) => l.categorias.includes(c)).map((c) => t(`categoria.${c}`)).join(' · ')}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
