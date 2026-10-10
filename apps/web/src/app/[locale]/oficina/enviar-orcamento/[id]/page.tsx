import { redirect } from 'next/navigation';
import { localePrefix } from '@/i18n/routing';

// Endereco antigo (10/10/2026): o formulario de orcamento agora fica em /oficina/orcamento/[id].
export default async function Movida({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  redirect(`${localePrefix(locale)}/oficina/orcamento/${id}`);
}
