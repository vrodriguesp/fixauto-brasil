import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/layout/Navbar';
import { AuthProvider } from '@/lib/auth-context';
import ErrorReporter from '@/components/ErrorReporter';
import StructuredData from '@/components/seo/StructuredData';

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'BipFix',
  url: 'https://bipfix.com',
  logo: 'https://bipfix.com/apple-touch-icon.png',
  description: 'Plataforma que conecta motoristas a oficinas mecânicas e lojas de peças no Brasil.',
};

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'BipFix',
  url: 'https://bipfix.com',
  inLanguage: 'pt-BR',
};

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://bipfix.com'),
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  title: {
    default: 'BipFix - Conectando você à melhor oficina mecânica',
    template: '%s | BipFix',
  },
  description: 'Plataforma que conecta motoristas a oficinas mecânicas no Brasil. Envie fotos do dano, receba orçamentos e escolha a melhor opção. Simples, rápido e transparente.',
  keywords: [
    'oficina mecânica',
    'reparo automotivo',
    'funilaria',
    'pintura automotiva',
    'orçamento oficina',
    'mecânico',
    'conserto carro',
    'colisão',
    'BipFix',
    'Brasil',
  ],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'BipFix',
    title: 'BipFix - Conectando você à melhor oficina mecânica',
    description: 'Envie fotos do dano, receba orçamentos de oficinas próximas e escolha a melhor opção. Simples, rápido e transparente.',
    url: 'https://bipfix.com',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BipFix - Conectando você à melhor oficina mecânica',
    description: 'Envie fotos do dano, receba orçamentos de oficinas próximas e escolha a melhor opção.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://bipfix.com',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <StructuredData data={organizationSchema} />
        <StructuredData data={websiteSchema} />
        <AuthProvider>
          <ErrorReporter />
          <Navbar />
          <main className="min-h-[calc(100vh-4rem)]">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
