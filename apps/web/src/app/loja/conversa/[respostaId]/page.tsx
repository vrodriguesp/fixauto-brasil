'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import ChatCotacaoPeca from '@/components/pecas/ChatCotacaoPeca';

interface RespostaInfo {
  id: string;
  cotacao_id: string;
  cotacao: { peca_descricao: string; oficina: { nome_fantasia: string } | null } | null;
}

export default function LojaConversaPecaPage() {
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
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">Carregando conversa...</div>;
  }

  if (!resposta) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">Conversa nao encontrada.</div>;
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
        cotacaoId={resposta.cotacao_id}
        fornecedorTipo="loja"
        fornecedorId={loja.id}
        titulo={resposta.cotacao?.oficina?.nome_fantasia || 'Oficina'}
        subtitulo={resposta.cotacao?.peca_descricao}
      />
    </div>
  );
}
