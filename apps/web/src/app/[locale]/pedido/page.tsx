import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import PedidoSemConta from '@/components/pedido/PedidoSemConta';

// Pedido de orcamento sem cadastro (formulario; fora dos buscadores - quem
// chega pelo Google entra pela pagina para motoristas e pelos guias).
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pedidoSemConta' });
  return { title: t('titulo'), description: t('subtitulo'), robots: { index: false, follow: true } };
}

export default function PedidoPage() {
  return <PedidoSemConta />;
}
