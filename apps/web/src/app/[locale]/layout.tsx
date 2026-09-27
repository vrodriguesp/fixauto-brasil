import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Analytics from '@/components/Analytics';
import StructuredData from '@/components/seo/StructuredData';
import { routing, type Locale } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const OG_LOCALE: Record<string, string> = { pt: 'pt_BR', en: 'en_US', et: 'et_EE', it: 'it_IT' };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = l === routing.defaultLocale ? '/' : `/${l}`;
  }

  return {
    title: {
      default: t('title'),
      template: `%s | ${t('brand')}`,
    },
    description: t('description'),
    openGraph: {
      type: 'website',
      locale: OG_LOCALE[locale] || 'pt_BR',
      siteName: t('brand'),
      title: t('title'),
      description: t('description'),
      url: locale === routing.defaultLocale ? '/' : `/${locale}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
    },
    alternates: {
      canonical: locale === routing.defaultLocale ? '/' : `/${locale}`,
      languages,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as Locale)) notFound();

  // Habilita renderizacao estatica com next-intl (evita reler o locale a
  // cada render dentro das paginas filhas)
  setRequestLocale(locale);

  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: 'meta' });

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'BipFix',
    url: 'https://bipfix.com',
    logo: 'https://bipfix.com/apple-touch-icon.png',
    description: t('description'),
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'support@bipfix.com',
      contactType: 'customer support',
      areaServed: ['BR', 'EE'],
      availableLanguage: ['Portuguese', 'English', 'Estonian', 'Italian'],
    },
  };

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'BipFix',
    url: 'https://bipfix.com',
    inLanguage: locale,
  };

  return (
    <NextIntlClientProvider messages={messages}>
      <StructuredData data={organizationSchema} />
      <StructuredData data={websiteSchema} />
      <Analytics />
      <Navbar />
      <main className="min-h-[calc(100vh-4rem)]">{children}</main>
    </NextIntlClientProvider>
  );
}
