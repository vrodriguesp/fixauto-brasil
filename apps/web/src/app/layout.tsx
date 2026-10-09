import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import ErrorReporter from '@/components/ErrorReporter';
import VisitTracker from '@/components/VisitTracker';

// Layout raiz de verdade - unico lugar onde <html>/<body> podem ser
// declarados, entao precisa envolver TANTO as rotas localizadas
// ([locale]/*) QUANTO /admin (que fica de fora do i18n, so em portugues).
// O <html lang> e dinamico via header setado pelo middleware, ja que
// /admin nao tem o parametro de rota [locale] disponivel.
const inter = Inter({ subsets: ['latin'] });

// Cor da barra do navegador no celular (site so em tema claro, por decisao)
export const viewport: Viewport = { themeColor: '#2563eb', colorScheme: 'light' };

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
    // titulo neutro (o antigo, do Brasil, era o que o Google mostrava para "bipfix")
    default: 'BipFix — car repair quotes',
    template: '%s | BipFix',
  },
  description: 'BipFix: compare car repair quotes from garages near you.',
  // Codigo de verificacao do Google Search Console (metodo "tag HTML" -
  // Search Console > Adicionar propriedade > URL prefix > HTML tag,
  // copiar so o valor do atributo content). Sem a env var, a tag nem
  // aparece - nao precisa de rebuild condicional.
  // Bing Webmaster Tools (metodo "meta tag"): o codigo e publico por definicao
  // (fica no HTML), por isso vai direto aqui. Gera <meta name="msvalidate.01">.
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    other: { 'msvalidate.01': 'C7B81E734E62DB400C7C08C162E15260' },
  },
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
        <AuthProvider>
          <ErrorReporter />
          <VisitTracker />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
