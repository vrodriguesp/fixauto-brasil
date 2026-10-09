import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import SiteFooter from '@/components/layout/SiteFooter';
import { contarOficinasPublicas } from '@/lib/oficinas-publicas';
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
  'sejaParceiro', 'login', 'cadastro', 'confirmarEmail', 'definirSenha', 'escolherTipo', 'resetPassword', 'erros', 'seguroReparo', 'enderecoEstruturado', 'excluirConta', 'avisoJurisdicao',
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
  const temOficinas = (await contarOficinasPublicas().catch(() => 0)) > 0;
  const t = await getTranslations({ locale, namespace: 'meta' });

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': 'https://bipfix.com/#organization',
    name: 'BipFix',
    url: 'https://bipfix.com',
    logo: { '@type': 'ImageObject', url: 'https://bipfix.com/icon-512.png', width: 512, height: 512 },
    email: 'support@bipfix.com',
    description: t('description'),
    areaServed: [{ '@type': 'Country', name: 'Estonia' }, { '@type': 'Country', name: 'Brazil' }],
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'support@bipfix.com',
      contactType: 'customer support',
      areaServed: ['EE', 'BR'],
      availableLanguage: ['Estonian', 'English', 'Russian', 'Portuguese', 'Italian'],
    },
    // sameAs (perfis oficiais em redes) e address (sede da OU) entram
    // quando existirem - pendencia do usuario.
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
      {/* WCAG 2.4.1: pular direto para o conteudo (teclado/leitor de tela) */}
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-white focus:text-primary-700 focus:px-4 focus:py-2 focus:rounded-lg focus:shadow">
        {t('pularConteudo')}
      </a>
      <Navbar />
      <main id="conteudo" className="min-h-[calc(100vh-4rem)]">{children}</main>
      <SiteFooter temOficinas={temOficinas} />
    </NextIntlClientProvider>
  );
}
