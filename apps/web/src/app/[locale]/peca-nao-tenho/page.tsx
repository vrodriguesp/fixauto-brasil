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
      <NaoTenhoEmail token={typeof busca.k === 'string' ? busca.k : ''} />
    </NextIntlClientProvider>
  );
}
