import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OG_LOCALE, type Locale } from '@/i18n/routing';
import { hreflangAlternates } from '@/lib/seo-utils';


export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'sejaParceiro' });
  const alternates = hreflangAlternates(locale, '/seja-parceiro');

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates,
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: OG_LOCALE[locale as Locale] || 'pt_BR',
      siteName: 'BipFix',
      title: t('ogTitle'),
      description: t('ogDescription'),
      url: alternates.canonical,
    },
  };
}

export default function SejaParceiroLayout({ children }: { children: React.ReactNode }) {
  return children;
}
