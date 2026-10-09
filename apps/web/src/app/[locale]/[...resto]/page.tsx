import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

// Qualquer endereco inexistente dentro de um idioma (ex: /it/abc) cai aqui e
// mostra o 404 traduzido de [locale]/not-found.tsx, em vez do 404 padrao do
// Next. Rotas reais tem prioridade sobre este "pega-tudo".
// Titulo proprio: antes herdava o padrao + modelo e saia "BipFix - ... | BipFix".
export const metadata: Metadata = { title: { absolute: '404 · BipFix' }, robots: { index: false, follow: true } };

export default function Resto() {
  notFound();
}
