import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import ErrorReporter from '@/components/ErrorReporter';
import Analytics from '@/components/Analytics';

// Layout raiz de verdade - unico lugar onde <html>/<body> podem ser
// declarados, entao precisa envolver TANTO as rotas localizadas
// ([locale]/*) QUANTO /admin (que fica de fora do i18n, so em portugues).
// O <html lang> e dinamico via header setado pelo middleware, ja que
// /admin nao tem o parametro de rota [locale] disponivel.
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
  // Codigo de verificacao do Google Search Console (metodo "tag HTML" -
  // Search Console > Adicionar propriedade > URL prefix > HTML tag,
  // copiar so o valor do atributo content). Sem a env var, a tag nem
  // aparece - nao precisa de rebuild condicional.
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const lang = headerList.get('x-locale-html') || 'pt-BR';

  return (
    <html lang={lang}>
      <body className={inter.className}>
        <Analytics />
        <AuthProvider>
          <ErrorReporter />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
