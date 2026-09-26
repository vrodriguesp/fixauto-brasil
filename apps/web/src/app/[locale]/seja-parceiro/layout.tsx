import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Seja um Parceiro Fundador',
  description:
    'O BipFix está em fase de seleção de oficinas e lojas de peças parceiras fundadoras. Vagas limitadas, sem comissão nesta fase. Cadastre seu interesse.',
  alternates: { canonical: 'https://bipfix.com/seja-parceiro' },
  robots: { index: true, follow: true },
};

export default function SejaParceiroLayout({ children }: { children: React.ReactNode }) {
  return children;
}
