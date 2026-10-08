import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { hreflangAlternates } from '@/lib/seo-utils';
import { OG_LOCALE, type Locale } from '@/i18n/routing';
import HomeClient from './HomeClient';
import { guiasDoIdioma, caminhoDoGuia } from '@/lib/guias';
import { hrefNoIdioma } from '@/i18n/routing';


export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  const alternates = hreflangAlternates(locale, '');

  return {
    // `absolute` pra nao herdar o template "%s | BipFix" do layout pai -
    // o titulo da home ja inclui a marca, "BipFix - X | BipFix" duplicaria.
    title: { absolute: t('metaTitle') },
    description: t('metaDescription'),
    keywords: t.raw('metaKeywords') as string[],
    alternates,
    openGraph: {
      type: 'website',
      locale: OG_LOCALE[locale as Locale] || 'pt_BR',
      siteName: 'BipFix',
      title: t('ogTitle'),
      description: t('ogDescription'),
      url: alternates.canonical,
    },
    twitter: {
      card: 'summary_large_image',
      title: t('ogTitle'),
      description: t('ogDescription'),
    },
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const guias = guiasDoIdioma(locale).slice(0, 6).map(({ guia, versao }) => ({
    titulo: versao.titulo, resumo: versao.descricao, href: hrefNoIdioma(locale, caminhoDoGuia(guia, locale)),
  }));
  return <HomeClient guias={guias} />;
}
