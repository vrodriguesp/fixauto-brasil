import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import SiteFooter from '@/components/layout/SiteFooter';
import SugestaoIdioma from '@/components/layout/SugestaoIdioma';
import Analytics from '@/components/Analytics';
import StructuredData from '@/components/seo/StructuredData';
import { routing, type Locale, OG_LOCALE, HREFLANG } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });

  return {
    title: {
      default: t('title'),
      template: `%s | ${t('brand')}`,
    },
    description: t('description'),
    openGraph: {
      type: 'website',
      locale: OG_LOCALE[locale as Locale] || 'pt_BR',
      siteName: t('brand'),
      title: t('title'),
      description: t('description'),
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
    },
    // Sem canonical/hreflang aqui de proposito: o layout vale para TODAS as
    // paginas, e um canonical herdado apontava login, cadastro etc. para a
    // home (sinal de conteudo duplicado). Cada pagina publica declara os
    // seus via hreflangAlternates().
  };
}

// Textos que os componentes de NAVEGADOR das paginas publicas usam (os de
// servidor leem as mensagens direto, sem passar pelo HTML). Os paineis
// logados recebem todos via components/i18n/MensagensDaArea. Ao criar um
// componente 'use client' numa pagina publica com um namespace novo,
// acrescente-o aqui (senao o texto aparece como a chave).
const NAMESPACES_PUBLICOS = [
  'home', 'nav', 'cookieBanner', 'notificationBell', 'tutorialBanner', 'constants',
  'oficinaPerfilPublico', 'emergencia', 'emergenciaAcidenteDetalhe', 'damageAnalysis',
  'audioRecorder', 'audioMessage', 'veiculoForm', 'docsLayout', 'docsCliente', 'docsOficina',
  'sejaParceiro', 'login', 'cadastro', 'definirSenha', 'escolherTipo', 'resetPassword',
];

function mensagensPublicas(messages: Record<string, unknown>) {
  return Object.fromEntries(NAMESPACES_PUBLICOS.filter((n) => n in messages).map((n) => [n, messages[n]]));
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
    inLanguage: HREFLANG[locale as Locale],
  };

  return (
    <NextIntlClientProvider messages={mensagensPublicas(messages)}>
      <StructuredData data={organizationSchema} />
      <StructuredData data={websiteSchema} />
      <Analytics />
      <SugestaoIdioma />
      <Navbar />
      <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      <SiteFooter />
    </NextIntlClientProvider>
  );
}
