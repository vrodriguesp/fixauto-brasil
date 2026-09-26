import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Acabei de Bater - Registre o Acidente Agora',
  description: 'Bateu o carro? Registre o acidente, tire fotos do dano e receba orçamentos de oficinas mecânicas próximas em minutos, gratuitamente.',
  keywords: [
    'acabei de bater o carro',
    'o que fazer depois de um acidente de carro',
    'registrar acidente de trânsito',
    'orçamento funilaria urgente',
  ],
  alternates: { canonical: 'https://bipfix.com/emergencia' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'BipFix',
    title: 'Acabei de Bater - Registre o Acidente Agora | BipFix',
    description: 'Tire fotos do dano e receba orçamentos de oficinas próximas em minutos.',
    url: 'https://bipfix.com/emergencia',
  },
};

export default function EmergenciaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
