import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import PedidoSemConta from '@/components/pedido/PedidoSemConta';
import RetomarPedido from '@/components/pedido/RetomarPedido';

// Pedido de orcamento sem cadastro (formulario; fora dos buscadores - quem
// chega pelo Google entra pela pagina para motoristas e pelos guias).
// Com ?retomar=<id>&t=<token> (link do e-mail de lembrete): tela para confirmar
// ou cancelar o pedido guardado.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pedidoSemConta' });
  return { title: t('titulo'), description: t('metaDescription'), robots: { index: false, follow: true } };
}

// textos do formulario (o layout publico so entrega os NAMESPACES_PUBLICOS;
// os do pedido vao apenas nesta pagina)
const NAMESPACES = ['pedidoSemConta', 'clienteNovaSolicitacao', 'constants', 'erros', 'veiculoForm'];

export default async function PedidoPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const busca = await searchParams;
  setRequestLocale(locale);
  const todas = (await getMessages({ locale })) as Record<string, unknown>;
  const messages = Object.fromEntries(NAMESPACES.filter((n) => n in todas).map((n) => [n, todas[n]]));
  const retomar = typeof busca.retomar === 'string' ? busca.retomar : null;
  const token = typeof busca.t === 'string' ? busca.t : '';
  return (
    <NextIntlClientProvider locale={locale} messages={messages as any}>
      {retomar ? <RetomarPedido id={retomar} token={token} cancelar={busca.acao === 'cancelar'} /> : <PedidoSemConta />}
    </NextIntlClientProvider>
  );
}
