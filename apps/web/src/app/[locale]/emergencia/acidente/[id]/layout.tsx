import type { Metadata } from 'next';

// Pagina privada de um acidente: fora do indice (o conteudo so aparece para
// quem tem acesso; para os demais ela pede login).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
