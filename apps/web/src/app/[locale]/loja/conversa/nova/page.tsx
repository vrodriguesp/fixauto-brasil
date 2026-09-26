'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import ChatCotacaoPeca from '@/components/pecas/ChatCotacaoPeca';

function LojaConversaNovaContent() {
  const t = useTranslations('lojaConversaNova');
  const params = useSearchParams();
  const router = useRouter();
  const { loja, loading } = useAuth();

  const cotacaoId = params.get('cotacaoId') || '';
  const oficinaNome = params.get('oficinaNome') || t('oficinaFallback');
  const pecaDescricao = params.get('pecaDescricao') || '';

  if (loading || !loja) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">{t('loading')}</div>;
  }

  if (!cotacaoId) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">{t('invalidConversa')}</div>;
  }

  return (
    <div>
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('voltar')}
        </button>
      </div>
      <ChatCotacaoPeca
        cotacaoId={cotacaoId}
        fornecedorTipo="loja"
        fornecedorId={loja.id}
        titulo={oficinaNome}
        subtitulo={pecaDescricao ? t('subtituloComPeca', { peca: pecaDescricao }) : t('subtituloSemPeca')}
      />
    </div>
  );
}

export default function LojaConversaNovaPage() {
  const t = useTranslations('lojaConversaNova');
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">{t('loading')}</div>}>
      <LojaConversaNovaContent />
    </Suspense>
  );
}
