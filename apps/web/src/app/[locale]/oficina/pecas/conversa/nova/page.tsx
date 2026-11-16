'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import ChatCotacaoPeca from '@/components/pecas/ChatCotacaoPeca';

// Conversa sobre um pedido de peca ainda sem oferta deste fornecedor.
//  - sem fornecedorId: a oficina e a FORNECEDORA (aba "Vender") e pergunta a compradora;
//  - com fornecedorTipo + fornecedorId (A1, 16/11): a oficina e a COMPRADORA e abre a
//    conversa que uma loja/oficina comecou antes de mandar oferta.
function OficinaConversaNovaContent() {
  const t = useTranslations('oficinaPecasConversaNova');
  const params = useSearchParams();
  const router = useRouter();
  const { oficina, loading } = useAuth();

  const cotacaoId = params.get('cotacaoId') || '';
  const compradoraNome = params.get('compradoraNome') || t('oficinaFallback');
  const pecaDescricao = params.get('pecaDescricao') || '';
  const tipoParam = params.get('fornecedorTipo');
  const fornecedorTipo: 'loja' | 'oficina' | null = tipoParam === 'loja' || tipoParam === 'oficina' ? tipoParam : null;
  const fornecedorId = params.get('fornecedorId') || '';
  const modoCompradora = !!(fornecedorTipo && fornecedorId);
  const [fornecedorNome, setFornecedorNome] = useState('');

  useEffect(() => {
    if (!modoCompradora) return;
    supabase.from(fornecedorTipo === 'loja' ? 'lojas_pecas' : 'oficinas').select('nome_fantasia').eq('id', fornecedorId).maybeSingle()
      .then(({ data }) => setFornecedorNome((data as { nome_fantasia?: string } | null)?.nome_fantasia || ''));
  }, [modoCompradora, fornecedorTipo, fornecedorId]);

  if (loading || !oficina) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">{t('carregando')}</div>;
  }

  if (!cotacaoId) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">{t('conversaInvalida')}</div>;
  }

  const destino = modoCompradora ? '/oficina/pecas' : '/oficina/pecas?aba=vender';
  return (
    <div>
      <ChatCotacaoPeca
        onVoltar={() => { if (window.history.length > 1) router.back(); else router.push(destino); }}
        voltarLabel={t('voltar')}
        cotacaoId={cotacaoId}
        fornecedorTipo={modoCompradora ? fornecedorTipo! : 'oficina'}
        fornecedorId={modoCompradora ? fornecedorId : oficina.id}
        titulo={modoCompradora ? (fornecedorNome || t('fornecedorFallback')) : compradoraNome}
        subtitulo={modoCompradora ? pecaDescricao : (pecaDescricao ? t('subtituloComPeca', { peca: pecaDescricao }) : t('subtituloSemPeca'))}
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
