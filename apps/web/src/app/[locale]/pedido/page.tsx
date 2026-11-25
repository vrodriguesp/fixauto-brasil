import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import PedidoSemConta from '@/components/pedido/PedidoSemConta';
import RetomarPedido from '@/components/pedido/RetomarPedido';
import { TIPOS_SERVICO } from '@fixauto/shared';

// Pedido de orcamento sem cadastro (formulario; fora dos buscadores - quem
// chega pelo Google entra pela pagina para motoristas e pelos guias).
// Com ?p=<id>#t=<token> (botao dos e-mails de confirmacao; dono 13/11) ou o link
// antigo do lembrete ?retomar=<id>&t=<token>: tela para confirmar ou cancelar o
// pedido guardado. O token novo vem no fragmento (#t=), lido so no navegador.
// Link do anuncio (dono 25/11): ?servico=<tipo de TIPOS_SERVICO> abre ja no passo 2 com o tipo
// escolhido e ?tema=ulevaatus|hooldus mostra a dica do tema no alto desse passo; valor invalido = como
// sem parametro. Os utm_* ficam na URL (nada aqui a reescreve).
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
  const retomar = typeof busca.p === 'string' ? busca.p : typeof busca.retomar === 'string' ? busca.retomar : null;
  const token = typeof busca.t === 'string' ? busca.t : '';
  const servico = typeof busca.servico === 'string' && TIPOS_SERVICO.some((s) => s.value === busca.servico) ? busca.servico : '';
  const tema = typeof busca.tema === 'string' ? busca.tema : '';
  return (
    <NextIntlClientProvider locale={locale} messages={messages as any}>
      {retomar ? <RetomarPedido id={retomar} token={token} cancelar={busca.acao === 'cancelar'} doLembrete={busca.o === 'l'} /> : <PedidoSemConta servicoInicial={servico} tema={tema} />}
    </NextIntlClientProvider>
  );
}
