'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import ChatCotacaoPeca from '@/components/pecas/ChatCotacaoPeca';

function LojaConversaNovaContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { loja, loading } = useAuth();

  const cotacaoId = params.get('cotacaoId') || '';
  const oficinaNome = params.get('oficinaNome') || 'Oficina';
  const pecaDescricao = params.get('pecaDescricao') || '';

  if (loading || !loja) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">Carregando...</div>;
  }

  if (!cotacaoId) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">Conversa inválida.</div>;
  }

  return (
    <div>
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </button>
      </div>
      <ChatCotacaoPeca
        cotacaoId={cotacaoId}
        fornecedorTipo="loja"
        fornecedorId={loja.id}
        titulo={oficinaNome}
        subtitulo={pecaDescricao ? `${pecaDescricao} · tire dúvidas antes de responder` : 'Tire dúvidas antes de responder'}
      />
    </div>
  );
}

export default function LojaConversaNovaPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">Carregando...</div>}>
      <LojaConversaNovaContent />
    </Suspense>
  );
}
