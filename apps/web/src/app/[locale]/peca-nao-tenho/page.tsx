import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import NaoTenhoEmail from '@/components/pecas/NaoTenhoEmail';

// Pagina do link "Nao tenho" dos e-mails de pecas (bipfix.com/n/<token>; lote 2, 17/11).
// Sem login. Abrir nao faz nada: so o toque em "Confirmar" grava (leitores de e-mail e
// antivirus abrem links antes da pessoa). Fora dos buscadores.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pecas' });
  return { title: t('naoTenhoTitulo'), robots: { index: false, follow: false } };
}

const TIRAR_TOKEN_DA_BARRA = "(function(){try{var h=location.hash.match(/[#&]k=([A-Za-z0-9_-]+)/);var q=new URLSearchParams(location.search).get('k');var k=(h&&h[1])||q||'';if(k||h){window.__naoTenhoK=k;history.replaceState(null,'',location.pathname);}}catch(e){}})();";

// so os textos que a pagina usa (o layout publico nao entrega os paineis)
const CHAVES = ['naoTenhoTitulo', 'naoTenho', 'naoTenhoMotivo', 'naoTenhoMotivos', 'naoTenhoConfirmar', 'naoTenhoFeito', 'naoTenhoVencido', 'naoTenhoJaRespondeu', 'naoTenhoJaDispensou', 'naoTenhoInvalido', 'respostaErro'];

export default async function PecaNaoTenhoPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const busca = await searchParams;
  setRequestLocale(locale);
  const todas = (await getMessages({ locale })) as Record<string, Record<string, unknown>>;
  const pecas = Object.fromEntries(CHAVES.filter((k) => k in (todas.pecas || {})).map((k) => [k, todas.pecas[k]]));
  return (
    <NextIntlClientProvider locale={locale} messages={{ pecas } as any}>
      {/* lote 3 (item 5 do Fable): o token (#k= ou o antigo ?k=) sai da barra ANTES de qualquer analytics
          (GA/Clarity carregam depois da hidratacao e leriam location.href); guardado so na memoria da pagina */}
      <script dangerouslySetInnerHTML={{ __html: TIRAR_TOKEN_DA_BARRA }} />
      <NaoTenhoEmail token={typeof busca.k === 'string' ? busca.k : ''} />
    </NextIntlClientProvider>
  );
}
