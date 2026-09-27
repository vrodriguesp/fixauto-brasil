import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { hreflangAlternates } from '@/lib/seo-utils';
import HomeClient from './HomeClient';

const OG_LOCALE: Record<string, string> = { pt: 'pt_BR', en: 'en_US', et: 'et_EE', it: 'it_IT' };

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
      locale: OG_LOCALE[locale] || 'pt_BR',
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

export default function HomePage() {
  return <HomeClient />;
}
