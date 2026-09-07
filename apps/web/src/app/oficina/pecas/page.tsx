'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency, timeAgo } from '@/lib/utils';
import type { CotacaoPeca, CotacaoPecaResposta } from '@fixauto/shared';

interface CotacaoComRespostas extends CotacaoPeca {
  respostas: (CotacaoPecaResposta & { loja: { nome_fantasia: string } | null })[];
}

export default function OficinaPecasPage() {
  const { oficina } = useAuth();
  const [cotacoes, setCotacoes] = useState<CotacaoComRespostas[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [form, setForm] = useState({ peca_descricao: '', fipe_marca: '', fipe_modelo: '', fipe_ano: '', quantidade: '1' });

  const fetchCotacoes = async () => {
    if (!oficina) return;
    setLoading(true);
    const { data } = await supabase
      .from('cotacoes_pecas')
      .select('*, respostas:cotacoes_pecas_respostas(*, loja:lojas_pecas(nome_fantasia))')
      .eq('oficina_id', oficina.id)
      .order('created_at', { ascending: false });
    setCotacoes((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchCotacoes(); }, [oficina]);

  const handleCriar = async () => {
    if (!oficina || !form.peca_descricao) return;
    setSaving(true);
    await supabase.from('cotacoes_pecas').insert({
      oficina_id: oficina.id,
      peca_descricao: form.peca_descricao,
      fipe_marca: form.fipe_marca || null,
      fipe_modelo: form.fipe_modelo || null,
      fipe_ano: form.fipe_ano || null,
      quantidade: parseInt(form.quantidade) || 1,
    });
    setForm({ peca_descricao: '', fipe_marca: '', fipe_modelo: '', fipe_ano: '', quantidade: '1' });
    setShowForm(false);
    setSaving(false);
    await fetchCotacoes();
  };

  const handleConfirmarPedido = async (cotacao: CotacaoComRespostas, resposta: CotacaoPecaResposta) => {
    if (!oficina) return;
    if (!confirm(`Confirmar pedido de "${cotacao.peca_descricao}" por ${formatCurrency(resposta.preco)}? O pagamento e entrega são combinados diretamente com a loja.`)) return;
    setConfirmandoId(resposta.id);

    await supabase.from('pedidos_pecas').insert({
      cotacao_id: cotacao.id,
      resposta_id: resposta.id,
      oficina_id: oficina.id,
      loja_id: resposta.loja_id,
      preco_total: resposta.preco * cotacao.quantidade,
      quantidade: cotacao.quantidade,
    });

    await supabase.from('cotacoes_pecas').update({ status: 'fechada' }).eq('id', cotacao.id);

    const { data: lj } = await supabase.from('lojas_pecas').select('profile_id').eq('id', resposta.loja_id).single();
    if (lj) {
      await supabase.from('notificacoes').insert({
        profile_id: lj.profile_id,
        tipo: 'pedido_peca_confirmado',
        titulo: 'Pedido de peça confirmado!',
        mensagem: `${oficina.nome_fantasia} confirmou o pedido de "${cotacao.peca_descricao}"`,
        dados: { cotacao_id: cotacao.id },
      });
    }

    setConfirmandoId(null);
    await fetchCotacoes();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Peças</h1>
          <p className="text-gray-600 mt-1">Peça cotação de peças pra lojas parceiras e confirme o melhor preço</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ Nova Cotação</button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Solicitar Cotação de Peça</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">O que você precisa? *</label>
              <input type="text" className="input-field" placeholder="Ex: Farol dianteiro direito" value={form.peca_descricao} onChange={(e) => setForm({ ...form, peca_descricao: e.target.value })} />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                <input type="text" className="input-field" placeholder="Fiat" value={form.fipe_marca} onChange={(e) => setForm({ ...form, fipe_marca: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
                <input type="text" className="input-field" placeholder="Argo" value={form.fipe_modelo} onChange={(e) => setForm({ ...form, fipe_modelo: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ano</label>
                <input type="text" className="input-field" placeholder="2020" value={form.fipe_ano} onChange={(e) => setForm({ ...form, fipe_ano: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
              <input type="number" className="input-field !w-24" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
            <button onClick={handleCriar} disabled={saving || !form.peca_descricao} className="btn-primary disabled:opacity-50">
              {saving ? 'Enviando...' : 'Enviar cotação'}
            </button>
          </div>
        </div>
      )}

      {cotacoes.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">Nenhuma cotação de peça ainda</p>
        </div>
      ) : (
        <div className="space-y-4">
          {cotacoes.map((c) => (
            <div key={c.id} className="card">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="font-medium text-gray-900">{c.peca_descricao}</p>
                  {(c.fipe_marca || c.fipe_modelo) && (
                    <p className="text-sm text-gray-500">{c.fipe_marca} {c.fipe_modelo} {c.fipe_ano} · Qtd: {c.quantidade}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    c.status === 'fechada' ? 'bg-green-100 text-green-700' :
                    c.status === 'respondida' ? 'bg-blue-100 text-blue-700' :
                    c.status === 'cancelada' ? 'bg-gray-100 text-gray-600' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {c.status === 'aberta' ? 'Aguardando respostas' : c.status === 'respondida' ? 'Respondida' : c.status === 'fechada' ? 'Pedido confirmado' : 'Cancelada'}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">{timeAgo(c.created_at)}</p>
                </div>
              </div>

              {c.respostas && c.respostas.length > 0 && (
                <div className="border-t pt-3 space-y-2">
                  {c.respostas.map((r) => (
                    <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.loja?.nome_fantasia}</p>
                        <p className="text-sm text-gray-600">
                          {formatCurrency(r.preco)} {c.quantidade > 1 && `x ${c.quantidade} = ${formatCurrency(r.preco * c.quantidade)}`} · Prazo: {r.prazo_dias} dia(s)
                        </p>
                        {r.observacao && <p className="text-xs text-gray-500 mt-0.5">{r.observacao}</p>}
                      </div>
                      {c.status !== 'fechada' && (
                        <button
                          onClick={() => handleConfirmarPedido(c, r)}
                          disabled={confirmandoId === r.id}
                          className="btn-primary !py-1.5 !px-3 text-sm disabled:opacity-50 flex-shrink-0"
                        >
                          {confirmandoId === r.id ? 'Confirmando...' : 'Confirmar pedido'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
