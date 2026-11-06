import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import PedidoSemConta from '@/components/pedido/PedidoSemConta';

// Pedido de orcamento sem cadastro (formulario; fora dos buscadores - quem
// chega pelo Google entra pela pagina para motoristas e pelos guias).
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pedidoSemConta' });
  return { title: t('titulo'), description: t('subtitulo'), robots: { index: false, follow: true } };
}

// textos do formulario (o layout publico so entrega os NAMESPACES_PUBLICOS;
// os do pedido vao apenas nesta pagina)
const NAMESPACES = ['pedidoSemConta', 'clienteNovaSolicitacao', 'constants', 'erros', 'veiculoForm'];

export default async function PedidoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const todas = (await getMessages({ locale })) as Record<string, unknown>;
  const messages = Object.fromEntries(NAMESPACES.filter((n) => n in todas).map((n) => [n, todas[n]]));
  return (
    <NextIntlClientProvider locale={locale} messages={messages as any}>
      <PedidoSemConta />
    </NextIntlClientProvider>
  );
}
