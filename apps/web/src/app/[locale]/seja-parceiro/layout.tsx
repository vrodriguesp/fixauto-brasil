import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';

const OG_LOCALE: Record<string, string> = { pt: 'pt_BR', en: 'en_US', et: 'et_EE', it: 'it_IT' };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'sejaParceiro' });
  const path = locale === routing.defaultLocale ? '/seja-parceiro' : `/${locale}/seja-parceiro`;
  const url = `https://bipfix.com${path}`;

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: OG_LOCALE[locale] || 'pt_BR',
      siteName: 'BipFix',
      title: t('ogTitle'),
      description: t('ogDescription'),
      url,
    },
  };
}

export default function SejaParceiroLayout({ children }: { children: React.ReactNode }) {
  return children;
}
