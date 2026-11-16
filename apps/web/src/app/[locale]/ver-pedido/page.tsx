import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import VerPedido from '@/components/pedido/VerPedido';

// Pagina do link de acesso dos e-mails do pedido (bipfix.com/r/<numero>?k=...;
// lib/link-acesso.ts). Abrir nao faz nada: so o toque em "Ver orcamento" gasta o
// token e entra na conta (leitores automaticos de e-mail abrem links antes da
// pessoa). Fora dos buscadores.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'verPedido' });
  return { title: t('ver'), robots: { index: false, follow: false } };
}

// oficinaPedidos: motivos do "nao tenho interesse" no modo oficina (089)
const NAMESPACES = ['verPedido', 'erros', 'oficinaPedidos'];

export default async function VerPedidoPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const busca = await searchParams;
  setRequestLocale(locale);
  const todas = (await getMessages({ locale })) as Record<string, unknown>;
  const messages = Object.fromEntries(NAMESPACES.filter((n) => n in todas).map((n) => [n, todas[n]]));
  return (
    <NextIntlClientProvider locale={locale} messages={messages as any}>
      {/* o=1 / d=1 (link da oficina) so escolhem o esqueleto inicial; o modo vem da API */}
      <VerPedido token={typeof busca.k === 'string' ? busca.k : ''} chat={busca.c === '1'} oficina={busca.o === '1'} dispensar={busca.d === '1'} />
    </NextIntlClientProvider>
  );
}
