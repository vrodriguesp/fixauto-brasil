'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import ComissaoPecasCard from '@/components/pecas/ComissaoPecasCard';

export default function LojaComissaoPage() {
  const t = useTranslations('lojaComissao');
  const { loja } = useAuth();

  if (!loja) {
    return <div className="max-w-4xl mx-auto px-4 py-20 text-center text-gray-400">{t('loading')}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('pageTitle')}</h1>
      <p className="text-gray-600 mb-8">{t('pageSubtitle')}</p>
      <ComissaoPecasCard fornecedorTipo="loja" fornecedorId={loja.id} />
    </div>
  );
}
