'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import ChatCotacaoPeca from '@/components/pecas/ChatCotacaoPeca';

interface RespostaInfo {
  id: string;
  cotacao_id: string;
  cotacao: { peca_descricao: string; oficina: { nome_fantasia: string } | null } | null;
}

export default function LojaConversaPecaPage() {
  const t = useTranslations('lojaConversaDetalhe');
  const { respostaId } = useParams<{ respostaId: string }>();
  const router = useRouter();
  const { loja } = useAuth();
  const [resposta, setResposta] = useState<RespostaInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('cotacoes_pecas_respostas')
      .select('id, cotacao_id, cotacao:cotacoes_pecas(peca_descricao, oficina:oficinas(nome_fantasia))')
      .eq('id', respostaId)
      .single()
      .then(({ data }) => {
        setResposta(data as any);
        setLoading(false);
      });
  }, [respostaId]);

  if (loading || !loja) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">{t('loadingConversa')}</div>;
  }

  if (!resposta) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">{t('notFound')}</div>;
  }

  return (
    <div>
      <ChatCotacaoPeca
        onVoltar={() => { if (window.history.length > 1) router.back(); else router.push('/loja/pedidos'); }}
        voltarLabel={t('voltar')}
        cotacaoId={resposta.cotacao_id}
        fornecedorTipo="loja"
        fornecedorId={loja.id}
        titulo={resposta.cotacao?.oficina?.nome_fantasia || t('oficinaFallback')}
        subtitulo={resposta.cotacao?.peca_descricao}
      />
    </div>
  );
}
