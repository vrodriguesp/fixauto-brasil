import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'docsOficinaLayout' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: 'https://bipfix.com/docs/oficina' },
  };
}

export default function DocsOficinaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
