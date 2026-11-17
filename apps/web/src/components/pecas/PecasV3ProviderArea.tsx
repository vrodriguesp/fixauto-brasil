'use client';

import type { ReactNode } from 'react';
import { PecasV3Provider } from '@/hooks/use-pecas-v3';

// Lote 3 (item 3 do Fable, lote 2): uma pergunta "a tela nova de pecas vale?" por sessao na area da
// oficina e da loja (o layout fica montado entre as paginas); lazy - so a 1a pagina que precisa pergunta.
export default function PecasV3ProviderArea({ children }: { children: ReactNode }) {
  return <PecasV3Provider>{children}</PecasV3Provider>;
}
