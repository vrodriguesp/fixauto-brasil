import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Guia do Motorista',
  description: 'Aprenda a usar o BipFix para solicitar reparos, comparar orçamentos de oficinas e acompanhar o conserto do seu veículo em tempo real.',
  alternates: { canonical: 'https://bipfix.com/docs/cliente' },
};

export default function DocsClienteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
