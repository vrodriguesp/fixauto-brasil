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
      <ChatCotacaoPeca
        onVoltar={() => { if (window.history.length > 1) router.back(); else router.push('/loja/cotacoes'); }}
        voltarLabel={t('voltar')}
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
