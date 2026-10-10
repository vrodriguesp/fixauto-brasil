import { redirect } from 'next/navigation';
import { localePrefix } from '@/i18n/routing';

// Endereco antigo (10/10/2026: "Solicitacoes" virou "Pedidos" no painel da
// oficina). Links de e-mail, avisos e favoritos continuam funcionando.
export default async function Movida({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  redirect(`${localePrefix(locale)}/oficina/pedidos/${id}`);
}
