import { redirect } from 'next/navigation';
import { localePrefix } from '@/i18n/routing';

// Painel antigo (10/10/2026, auditoria do painel): a oficina abre em "Pedidos"
// (o mecanico e levado a "Hoje" pela propria pagina de Pedidos). Os numeros
// viraram "Desempenho" e a tabela de check-ins virou "Hoje".
export default async function Movida({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`${localePrefix(locale)}/oficina/pedidos`);
}
