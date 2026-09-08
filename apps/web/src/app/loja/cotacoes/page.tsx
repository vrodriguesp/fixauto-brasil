'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/utils';
import type { CotacaoPeca } from '@fixauto/shared';

interface CotacaoComOficina extends Omit<CotacaoPeca, 'oficina'> {
  oficina: { nome_fantasia: string; cidade: string; estado: string } | null;
  minhaResposta?: { id: string; preco: number; prazo_dias: number } | null;
}

export default function LojaCotacoesPage() {
  const { loja } = useAuth();
  const [cotacoes, setCotacoes] = useState<CotacaoComOficina[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondendoId, setRespondendoId] = useState<string | null>(null);
  const [respostaForm, setRespostaForm] = useState({ preco: '', prazo_dias: '2', observacao: '' });
  const [saving, setSaving] = useState(false);

  const fetchCotacoes = async () => {
    if (!loja) return;
    setLoading(true);
    const [{ data: abertas }, { data: minhasRespostas }] = await Promise.all([
      supabase
        .from('cotacoes_pecas')
        .select('*, oficina:oficinas(nome_fantasia, cidade, estado)')
        .eq('status', 'aberta')
        .order('created_at', { ascending: false }),
      supabase
        .from('cotacoes_pecas_respostas')
        .select('id, cotacao_id, preco, prazo_dias')
        .eq('loja_id', loja.id),
    ]);

    const respostaPorCotacao = new Map((minhasRespostas || []).map((r) => [r.cotacao_id, r]));
    const combinado = ((abertas as any[]) || []).map((c) => ({
      ...c,
      minhaResposta: respostaPorCotacao.get(c.id) || null,
    }));
    setCotacoes(combinado);
    setLoading(false);
  };

  useEffect(() => { fetchCotacoes(); }, [loja]);

  const handleResponder = async (cotacaoId: string) => {
    if (!loja || !respostaForm.preco) return;
    setSaving(true);
    const { error } = await supabase.from('cotacoes_pecas_respostas').insert({
      cotacao_id: cotacaoId,
      fornecedor_tipo: 'loja',
      loja_id: loja.id,
      preco: parseFloat(respostaForm.preco),
      prazo_dias: parseInt(respostaForm.prazo_dias) || 1,
      observacao: respostaForm.observacao || null,
    });

    if (!error) {
      // Marca a cotacao como respondida (nao impede outras lojas de tambem
      // responder). A loja nao e dona da cotacao, entao RLS bloqueia um
      // update direto do client - precisa passar pela rota server-side.
      await fetch('/api/marcar-cotacao-respondida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cotacaoId }),
      }).catch(() => {});

      // Notifica a oficina
      const cotacao = cotacoes.find((c) => c.id === cotacaoId);
      if (cotacao) {
        const { data: ofi } = await supabase.from('oficinas').select('profile_id').eq('id', cotacao.oficina_id).single();
        if (ofi) {
          await supabase.from('notificacoes').insert({
            profile_id: ofi.profile_id,
            tipo: 'cotacao_peca_respondida',
            titulo: 'Nova resposta de cotação de peça',
            mensagem: `${loja.nome_fantasia} respondeu sua cotação de "${cotacao.peca_descricao}"`,
            dados: { cotacao_id: cotacaoId },
          });
        }
      }
    }

    setRespondendoId(null);
    setRespostaForm({ preco: '', prazo_dias: '2', observacao: '' });
    setSaving(false);
    await fetchCotacoes();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-32 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Cotações de Oficinas</h1>
      <p className="text-gray-600 mb-8">Responda com preço e prazo para conseguir o pedido</p>

      {cotacoes.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">Nenhuma cotação aberta no momento</p>
        </div>
      ) : (
        <div className="space-y-4">
          {cotacoes.map((c) => (
            <div key={c.id} className="card">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <p className="font-medium text-gray-900">{c.peca_descricao}</p>
                  <p className="text-sm text-gray-500">
                    {c.oficina?.nome_fantasia} - {c.oficina?.cidade}, {c.oficina?.estado}
                  </p>
                  {(c.fipe_marca || c.fipe_modelo) && (
                    <p className="text-sm text-gray-500">Veículo: {c.fipe_marca} {c.fipe_modelo} {c.fipe_ano}</p>
                  )}
                  <p className="text-sm text-gray-500">Quantidade: {c.quantidade}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(c.created_at)}</span>
              </div>

              {c.minhaResposta ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-green-800">
                    Você respondeu: R$ {c.minhaResposta.preco.toFixed(2)} - prazo {c.minhaResposta.prazo_dias} dia(s)
                  </p>
                  <Link href={`/loja/conversa/${c.minhaResposta.id}`} className="text-xs font-medium text-primary-600 hover:underline whitespace-nowrap">
                    Conversar
                  </Link>
                </div>
              ) : respondendoId === c.id ? (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Preço (R$)</label>
                      <input type="number" step="0.01" className="input-field !py-1.5" value={respostaForm.preco} onChange={(e) => setRespostaForm({ ...respostaForm, preco: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Prazo (dias)</label>
                      <input type="number" className="input-field !py-1.5" value={respostaForm.prazo_dias} onChange={(e) => setRespostaForm({ ...respostaForm, prazo_dias: e.target.value })} />
                    </div>
                  </div>
                  <input type="text" className="input-field !py-1.5" placeholder="Observação (opcional)" value={respostaForm.observacao} onChange={(e) => setRespostaForm({ ...respostaForm, observacao: e.target.value })} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setRespondendoId(null)} className="btn-secondary !py-1.5 !px-3 text-sm">Cancelar</button>
                    <button onClick={() => handleResponder(c.id)} disabled={saving || !respostaForm.preco} className="btn-primary !py-1.5 !px-3 text-sm disabled:opacity-50">
                      {saving ? 'Enviando...' : 'Enviar resposta'}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setRespondendoId(c.id)} className="btn-primary !py-1.5 !px-3 text-sm mt-2">
                  Responder cotação
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
