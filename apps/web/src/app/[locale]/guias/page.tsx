import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import NextLink from 'next/link';
import { OG_LOCALE, hrefNoIdioma, type Locale } from '@/i18n/routing';
import { hreflangAlternates } from '@/lib/seo-utils';
import { caminhoDoGuia, guiasDoIdioma } from '@/lib/guias';
import { formatDate } from '@/lib/utils';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'guias' });
  const alternates = hreflangAlternates(locale, '/guias');
  return {
    title: t('indexTitulo'),
    description: t('indexDescricao'),
    alternates,
    // Sem nenhum guia no idioma, a pagina e so um cabecalho: fica fora do indice.
    robots: { index: guiasDoIdioma(locale).length > 0, follow: true },
    openGraph: {
      type: 'website',
      locale: OG_LOCALE[locale as Locale],
      siteName: 'BipFix',
      title: t('indexTitulo'),
      description: t('indexDescricao'),
      url: alternates.canonical,
    },
  };
}

export default async function GuiasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'guias' });
  const guias = guiasDoIdioma(locale);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">{t('indexTitulo')}</h1>
      <p className="text-lg text-gray-600 mt-3 max-w-2xl">{t('indexIntro')}</p>

      {guias.length === 0 ? (
        <p className="mt-10 text-gray-500">{t('nenhumGuia')}</p>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {guias.map(({ guia, versao }) => (
            <li key={guia.slug}>
              <NextLink href={hrefNoIdioma(locale, caminhoDoGuia(guia, locale))} className="card h-full block hover:shadow-md transition-shadow">
                <h2 className="text-lg font-semibold text-gray-900">{versao.titulo}</h2>
                <p className="text-sm text-gray-600 mt-2">{versao.descricao}</p>
                <p className="text-xs text-gray-400 mt-3">{t('atualizadoEm', { data: formatDate(guia.atualizado, locale) })}</p>
              </NextLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
