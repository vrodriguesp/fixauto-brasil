import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Guia da Oficina',
  description: 'Aprenda a cadastrar sua oficina, receber solicitações, enviar orçamentos e gerenciar sua equipe e agenda no BipFix.',
  alternates: { canonical: 'https://bipfix.com/docs/oficina' },
};

export default function DocsOficinaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
