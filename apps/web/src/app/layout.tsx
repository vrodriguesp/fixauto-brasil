import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/layout/Navbar';
import { AuthProvider } from '@/lib/auth-context';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://fixauto-brasil.vercel.app'),
  title: {
    default: 'FixAuto Brasil - Conectando você à melhor oficina mecânica',
    template: '%s | FixAuto Brasil',
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
    'FixAuto',
    'Brasil',
  ],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'FixAuto Brasil',
    title: 'FixAuto Brasil - Conectando você à melhor oficina mecânica',
    description: 'Envie fotos do dano, receba orçamentos de oficinas próximas e escolha a melhor opção. Simples, rápido e transparente.',
    url: 'https://fixauto-brasil.vercel.app',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FixAuto Brasil - Conectando você à melhor oficina mecânica',
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
    canonical: 'https://fixauto-brasil.vercel.app',
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
        <AuthProvider>
          <Navbar />
          <main className="min-h-[calc(100vh-4rem)]">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
