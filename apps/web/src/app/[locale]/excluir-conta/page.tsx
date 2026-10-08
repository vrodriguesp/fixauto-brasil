import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import ExcluirContaClient from './ExcluirContaClient';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'excluirConta' });
  // pagina de servico (o Google Play pede o endereco), nao de busca
  return { title: t('titulo'), robots: { index: false, follow: true } };
}

export default async function ExcluirContaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'excluirConta' });
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 break-words">{t('titulo')}</h1>
      <p className="text-gray-700 mb-4">{t('intro')}</p>
      <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-8">
        <li>{t('item1')}</li>
        <li>{t('item2')}</li>
        <li>{t('item3')}</li>
        <li>{t('item4')}</li>
      </ul>
      <ExcluirContaClient />
    </div>
  );
}
