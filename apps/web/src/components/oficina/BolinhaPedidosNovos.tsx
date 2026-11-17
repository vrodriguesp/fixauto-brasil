'use client';

import { useTranslations } from 'next-intl';

// Bolinha vermelha dos pedidos NOVOS (dono 17/11: "para guiar as oficinas"; a CARVEX abria direto em
// "Respondidos" e nao via os pedidos novos): quantos da aba "Para responder" a oficina ainda nao abriu.
// Mostra ate "9+"; o leitor de tela ouve o numero exato. Nada quando nao ha pedido novo.
export default function BolinhaPedidosNovos({ n, className = '' }: { n: number; className?: string }) {
  const t = useTranslations('nav');
  if (n <= 0) return null;
  return (
    <span role="img" aria-label={t('pedidosNovos', { n })} title={t('pedidosNovos', { n })} data-testid="bolinha-pedidos-novos"
      className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white ${className}`}>
      {n > 9 ? '9+' : n}
    </span>
  );
}
