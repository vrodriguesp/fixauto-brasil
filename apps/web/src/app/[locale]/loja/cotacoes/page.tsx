'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { timeAgo, formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import type { CotacaoPeca } from '@fixauto/shared';
import DetalhesPedidoPeca from '@/components/pecas/DetalhesPedidoPeca';

interface CotacaoComOficina extends Omit<CotacaoPeca, 'oficina'> {
  oficina: { nome_fantasia: string; cidade: string; estado: string } | null;
  minhaResposta?: { id: string; preco: number; prazo_dias: number } | null;
}

export default function LojaCotacoesPage() {
  const t = useTranslations('lojaCotacoes');
  const locale = useLocale();
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
        // !inner pra poder filtrar pelo pais da oficina que pediu a peca -
        // sem isso uma loja na Estonia veria pedidos de oficinas no Brasil
        // (e vice-versa), o que nao faz sentido logisticamente.
        .select('*, oficina:oficinas!inner(nome_fantasia, cidade, estado, pais)')
        .eq('status', 'aberta')
        .eq('oficina.pais', loja.pais || 'BR')
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
      // Marca a cotacao como respondida e notifica a oficina compradora
      // (in-app + email). A loja nao e dona da cotacao, entao RLS bloqueia
      // um update direto do client - precisa passar pela rota server-side,
      // que tambem centraliza a notificacao.
      await fetch('/api/marcar-cotacao-respondida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cotacaoId }),
      }).catch(() => {});
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
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('pageTitle')}</h1>
      <p className="text-gray-600 mb-8">{t('pageSubtitle')}</p>

      {cotacoes.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">{t('emptyState')}</p>
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
                    <p className="text-sm text-gray-500">{t('veiculoInfo', { marca: c.fipe_marca || '', modelo: c.fipe_modelo || '', ano: c.fipe_ano || '' })}</p>
                  )}
                  <p className="text-sm text-gray-500">{t('quantidadeInfo', { quantidade: c.quantidade })}</p>
                  <DetalhesPedidoPeca observacao={c.observacao} fotos={c.fotos} />
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-xs text-gray-400">{timeAgo(c.created_at, locale)}</span>
                  {!c.minhaResposta && loja && (
                    <Link
                      href={`/loja/conversa/nova?cotacaoId=${c.id}${c.oficina?.nome_fantasia ? `&oficinaNome=${encodeURIComponent(c.oficina.nome_fantasia)}` : ''}&pecaDescricao=${encodeURIComponent(c.peca_descricao || '')}`}
                      className="text-xs font-medium text-primary-600 hover:underline whitespace-nowrap"
                    >
                      {t('tirarDuvida')}
                    </Link>
                  )}
                </div>
              </div>

              {c.minhaResposta ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-green-800">
                    {t('respostaEnviada', { preco: formatCurrency(c.minhaResposta.preco, currencyForCountry(loja?.pais), locale), prazo: c.minhaResposta.prazo_dias })}
                  </p>
                  <Link href={`/loja/conversa/${c.minhaResposta.id}`} className="text-xs font-medium text-primary-600 hover:underline whitespace-nowrap">
                    {t('conversarLink')}
                  </Link>
                </div>
              ) : respondendoId === c.id ? (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="c40f3-1" className="block text-xs font-medium text-gray-700 mb-1">{t('labelPreco')}</label>
                      <input id="c40f3-1" type="number" step="0.01" className="input-field !py-1.5" value={respostaForm.preco} onChange={(e) => setRespostaForm({ ...respostaForm, preco: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor="c40f3-2" className="block text-xs font-medium text-gray-700 mb-1">{t('labelPrazo')}</label>
                      <input id="c40f3-2" type="number" className="input-field !py-1.5" value={respostaForm.prazo_dias} onChange={(e) => setRespostaForm({ ...respostaForm, prazo_dias: e.target.value })} />
                    </div>
                  </div>
                  <input type="text" className="input-field !py-1.5" placeholder={t('observacaoPlaceholder')} value={respostaForm.observacao} onChange={(e) => setRespostaForm({ ...respostaForm, observacao: e.target.value })} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setRespondendoId(null)} className="btn-secondary !py-1.5 !px-3 text-sm">{t('cancelarButton')}</button>
                    <button onClick={() => handleResponder(c.id)} disabled={saving || !respostaForm.preco} className="btn-primary !py-1.5 !px-3 text-sm disabled:opacity-50">
                      {saving ? t('enviandoButton') : t('enviarRespostaButton')}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setRespondendoId(c.id)} className="btn-primary !py-1.5 !px-3 text-sm mt-2">
                  {t('responderCotacaoButton')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
