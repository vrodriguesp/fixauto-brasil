import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { hreflangAlternates } from '@/lib/seo-utils';

const OG_LOCALE: Record<string, string> = { pt: 'pt_BR', en: 'en_US', et: 'et_EE', it: 'it_IT' };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'emergencia' });
  const alternates = hreflangAlternates(locale, '/emergencia');

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    keywords: t.raw('metaKeywords') as string[],
    alternates,
    openGraph: {
      type: 'website',
      locale: OG_LOCALE[locale] || 'pt_BR',
      siteName: 'BipFix',
      title: `${t('ogTitle')} | BipFix`,
      description: t('ogDescription'),
      url: alternates.canonical,
    },
  };
}

export default function EmergenciaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
