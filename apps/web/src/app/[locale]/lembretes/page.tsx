import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import PausarLembretes from '@/components/cliente/PausarLembretes';

// Pagina do link "parar lembretes" dos e-mails de lembrete ao motorista (bipfix.com/r/<n>?s=<token>; 115).
// Sem login. Abrir nao faz nada: so o toque em "Parar lembretes" grava. Fora dos buscadores.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'lembretesCliente' });
  return { title: t('tituloSemNumero'), robots: { index: false, follow: false } };
}

// o token (#k=) sai da barra ANTES de qualquer analytics (GA/Clarity leriam location.href); fica so na memoria
const TIRAR_TOKEN_DA_BARRA = "(function(){try{var h=location.hash;var k=(h.match(/[#&]k=([A-Za-z0-9_-]+)/)||[])[1]||'';var n=(h.match(/[#&]n=(\\d+)/)||[])[1]||'';if(k||n){window.__lembreteK=k;window.__lembreteN=n;history.replaceState(null,'',location.pathname);}}catch(e){}})();";

export default async function LembretesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const todas = (await getMessages({ locale })) as Record<string, unknown>;
  return (
    <NextIntlClientProvider locale={locale} messages={{ lembretesCliente: todas.lembretesCliente } as any}>
      <script dangerouslySetInnerHTML={{ __html: TIRAR_TOKEN_DA_BARRA }} />
      <PausarLembretes />
    </NextIntlClientProvider>
  );
}
