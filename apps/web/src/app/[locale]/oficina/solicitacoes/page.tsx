import { redirect } from 'next/navigation';
import { localePrefix } from '@/i18n/routing';

// Endereco antigo (10/10/2026): a lista virou a caixa "Pedidos", pagina inicial da oficina.
export default async function Movida({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`${localePrefix(locale)}/oficina/pedidos`);
}
