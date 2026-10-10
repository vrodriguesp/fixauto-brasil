import { redirect } from 'next/navigation';
import { localePrefix } from '@/i18n/routing';

// Tela antiga (10/10/2026): carros em servico, check-in, etapas e entrega
// ficam em "Hoje". Links com ?ev= (aviso de nota interna, Quadro) abrem o carro la.
export default async function Movida({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  const sp = await searchParams;
  const ev = typeof sp.ev === 'string' ? `?ev=${encodeURIComponent(sp.ev)}` : '';
  redirect(`${localePrefix(locale)}/oficina/hoje${ev}`);
}
