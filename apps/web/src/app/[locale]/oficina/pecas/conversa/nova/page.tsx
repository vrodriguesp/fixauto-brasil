'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import ChatCotacaoPeca from '@/components/pecas/ChatCotacaoPeca';

function OficinaConversaNovaContent() {
  const t = useTranslations('oficinaPecasConversaNova');
  const params = useSearchParams();
  const router = useRouter();
  const { oficina, loading } = useAuth();

  const cotacaoId = params.get('cotacaoId') || '';
  const compradoraNome = params.get('compradoraNome') || t('oficinaFallback');
  const pecaDescricao = params.get('pecaDescricao') || '';

  if (loading || !oficina) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">{t('carregando')}</div>;
  }

  if (!cotacaoId) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">{t('conversaInvalida')}</div>;
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
        fornecedorTipo="oficina"
        fornecedorId={oficina.id}
        titulo={compradoraNome}
        subtitulo={pecaDescricao ? t('subtituloComPeca', { peca: pecaDescricao }) : t('subtituloSemPeca')}
      />
    </div>
  );
}

export default function OficinaConversaNovaPage() {
  const t = useTranslations('oficinaPecasConversaNova');
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">{t('carregando')}</div>}>
      <OficinaConversaNovaContent />
    </Suspense>
  );
}
