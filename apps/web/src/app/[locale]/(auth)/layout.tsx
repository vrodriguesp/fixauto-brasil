import type { Metadata } from 'next';

// Login, cadastro, redefinicao de senha etc.: paginas de conta, sem conteudo
// para busca. Ficam fora do indice (noindex) mas os links continuam sendo
// seguidos (follow). Antes herdavam o title e o canonical da home, o que o
// Google lia como copias da pagina inicial.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
