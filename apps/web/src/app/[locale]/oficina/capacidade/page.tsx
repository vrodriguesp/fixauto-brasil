import { redirect } from 'next/navigation';
import { localePrefix } from '@/i18n/routing';

// Tela removida em 09/10/2026: a troca de mecanico, a carga de cada mecanico
// e dos elevadores e os indicadores de capacidade ficam no Quadro da Agenda.
// O endereco antigo (favoritos, links do tutorial) leva direto ao Quadro.
export default async function Removida({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`${localePrefix(locale)}/oficina/agenda?vista=quadro`);
}
