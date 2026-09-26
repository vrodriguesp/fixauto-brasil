'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, timeAgo, distanciaKm } from '@/lib/utils';
import ComissaoPecasCard from '@/components/pecas/ComissaoPecasCard';
import type { CotacaoPeca, CotacaoPecaResposta } from '@fixauto/shared';

interface CotacaoComRespostas extends CotacaoPeca {
  respostas: (CotacaoPecaResposta & {
    loja: { nome_fantasia: string } | null;
    oficina_fornecedora: { nome_fantasia: string } | null;
  })[];
}

interface CotacaoDeOutraOficina extends Omit<CotacaoPeca, 'oficina'> {
  oficina: { nome_fantasia: string; cidade: string; estado: string; latitude: number; longitude: number } | null;
  minhaResposta?: { id: string; preco: number; prazo_dias: number } | null;
}

export default function OficinaPecasPage() {
  const { oficina, refreshProfile } = useAuth();
  const [tab, setTab] = useState<'comprar' | 'vender'>('comprar');

  // === Comprar ===
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
      .select('*, respostas:cotacoes_pecas_respostas(*, loja:lojas_pecas(nome_fantasia), oficina_fornecedora:oficinas!cotacoes_pecas_respostas_oficina_fornecedora_id_fkey(nome_fantasia))')
      .eq('oficina_id', oficina.id)
      .order('created_at', { ascending: false });
    setCotacoes((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchCotacoes(); }, [oficina]);

  const handleCriar = async () => {
    if (!oficina || !form.peca_descricao) return;
    setSaving(true);
    const { data: nova } = await supabase.from('cotacoes_pecas').insert({
      oficina_id: oficina.id,
      peca_descricao: form.peca_descricao,
      fipe_marca: form.fipe_marca || null,
      fipe_modelo: form.fipe_modelo || null,
      fipe_ano: form.fipe_ano || null,
      quantidade: parseInt(form.quantidade) || 1,
    }).select().single();

    // Avisa oficinas vizinhas que se inscreveram como fornecedoras de pecas
    // (lojas de pecas continuam no modelo pull, navegando /loja/cotacoes)
    if (nova && oficina.latitude && oficina.longitude) {
      fetch('/api/notificar-fornecedores-cotacao-peca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cotacaoId: nova.id,
          oficinaCompradoraId: oficina.id,
          latitude: oficina.latitude,
          longitude: oficina.longitude,
        }),
      }).catch(() => {});
    }

    setForm({ peca_descricao: '', fipe_marca: '', fipe_modelo: '', fipe_ano: '', quantidade: '1' });
    setShowForm(false);
    setSaving(false);
    await fetchCotacoes();
  };

  const handleConfirmarPedido = async (
    cotacao: CotacaoComRespostas,
    resposta: CotacaoComRespostas['respostas'][number]
  ) => {
    if (!oficina) return;
    const nomeFornecedor = resposta.loja?.nome_fantasia || resposta.oficina_fornecedora?.nome_fantasia || 'fornecedor';
    if (!confirm(`Confirmar pedido de "${cotacao.peca_descricao}" por ${formatCurrency(resposta.preco)} com ${nomeFornecedor}? O pagamento e entrega são combinados diretamente com quem vende.`)) return;
    setConfirmandoId(resposta.id);

    await supabase.from('pedidos_pecas').insert({
      cotacao_id: cotacao.id,
      resposta_id: resposta.id,
      oficina_id: oficina.id,
      fornecedor_tipo: resposta.fornecedor_tipo,
      loja_id: resposta.loja_id,
      oficina_fornecedora_id: resposta.oficina_fornecedora_id,
      preco_total: resposta.preco * cotacao.quantidade,
      quantidade: cotacao.quantidade,
    });

    await supabase.from('cotacoes_pecas').update({ status: 'fechada' }).eq('id', cotacao.id);

    const tabelaFornecedor = resposta.fornecedor_tipo === 'loja' ? 'lojas_pecas' : 'oficinas';
    const idFornecedor = resposta.loja_id || resposta.oficina_fornecedora_id;
    if (idFornecedor) {
      const { data: fornecedor } = await supabase
        .from(tabelaFornecedor)
        .select('profile_id, profile:profiles(email, nome)')
        .eq('id', idFornecedor)
        .single();
      if (fornecedor) {
        await supabase.from('notificacoes').insert({
          profile_id: fornecedor.profile_id,
          tipo: 'pedido_peca_confirmado',
          titulo: 'Pedido de peça confirmado!',
          mensagem: `${oficina.nome_fantasia} confirmou o pedido de "${cotacao.peca_descricao}"`,
          dados: { cotacao_id: cotacao.id },
        });
        const fornecedorProfile = (fornecedor as any).profile;
        if (fornecedorProfile?.email) {
          fetch('/api/notificar-email-pedido-peca-confirmado', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toEmail: fornecedorProfile.email,
              toName: fornecedorProfile.nome,
              oficinaCompradoraNome: oficina.nome_fantasia,
              pecaDescricao: cotacao.peca_descricao,
              valorTotal: resposta.preco * cotacao.quantidade,
            }),
          }).catch(() => {});
        }
      }
    }

    setConfirmandoId(null);
    await fetchCotacoes();
  };

  // === Vender (oficina como fornecedora de excedente) ===
  const [vendePecas, setVendePecas] = useState(false);
  const [savingVende, setSavingVende] = useState(false);
  const [cotacoesVizinhas, setCotacoesVizinhas] = useState<CotacaoDeOutraOficina[]>([]);
  const [loadingVender, setLoadingVender] = useState(false);
  const [respondendoId, setRespondendoId] = useState<string | null>(null);
  const [respostaForm, setRespostaForm] = useState({ preco: '', prazo_dias: '2', observacao: '' });
  const [savingResposta, setSavingResposta] = useState(false);
  const [pedidosFornecedora, setPedidosFornecedora] = useState<any[]>([]);
  const [marcandoEntregueId, setMarcandoEntregueId] = useState<string | null>(null);

  const fetchPedidosFornecedora = async () => {
    if (!oficina) return;
    const { data } = await supabase
      .from('pedidos_pecas')
      .select('id, resposta_id, preco_total, quantidade, status, created_at, cotacao:cotacoes_pecas(peca_descricao), oficina:oficinas!pedidos_pecas_oficina_id_fkey(nome_fantasia, cidade, estado)')
      .eq('fornecedor_tipo', 'oficina')
      .eq('oficina_fornecedora_id', oficina.id)
      .order('created_at', { ascending: false });
    setPedidosFornecedora((data as any[]) || []);
  };

  const handleMarcarEntregueFornecedor = async (pedidoId: string) => {
    setMarcandoEntregueId(pedidoId);
    await fetch('/api/marcar-pedido-peca-entregue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoId }),
    });
    setMarcandoEntregueId(null);
    await fetchPedidosFornecedora();
  };

  useEffect(() => {
    if (oficina) setVendePecas(!!oficina.vende_pecas);
  }, [oficina]);

  const fetchCotacoesVizinhas = async () => {
    if (!oficina || !oficina.latitude || !oficina.longitude) return;
    setLoadingVender(true);
    const [{ data: abertas }, { data: minhasRespostas }] = await Promise.all([
      supabase
        .from('cotacoes_pecas')
        .select('*, oficina:oficinas!cotacoes_pecas_oficina_id_fkey(nome_fantasia, cidade, estado, latitude, longitude)')
        .eq('status', 'aberta')
        .neq('oficina_id', oficina.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('cotacoes_pecas_respostas')
        .select('id, cotacao_id, preco, prazo_dias')
        .eq('fornecedor_tipo', 'oficina')
        .eq('oficina_fornecedora_id', oficina.id),
    ]);

    const respostaPorCotacao = new Map((minhasRespostas || []).map((r) => [r.cotacao_id, r]));
    const raio = oficina.raio_atendimento_km || 30;
    const proximas = ((abertas as any[]) || [])
      .filter((c) => {
        const o = c.oficina;
        if (!o?.latitude || !o?.longitude) return false;
        return distanciaKm(oficina.latitude, oficina.longitude, o.latitude, o.longitude) <= raio;
      })
      .map((c) => ({ ...c, minhaResposta: respostaPorCotacao.get(c.id) || null }));
    setCotacoesVizinhas(proximas);
    setLoadingVender(false);
  };

  useEffect(() => {
    if (tab === 'vender' && vendePecas) {
      fetchCotacoesVizinhas();
      fetchPedidosFornecedora();
    }
  }, [tab, vendePecas, oficina]);

  const handleToggleVendePecas = async () => {
    if (!oficina) return;
    setSavingVende(true);
    const novoValor = !vendePecas;
    await supabase.from('oficinas').update({ vende_pecas: novoValor }).eq('id', oficina.id);
    setVendePecas(novoValor);
    await refreshProfile();
    setSavingVende(false);
  };

  const handleResponderComoOficina = async (cotacaoId: string) => {
    if (!oficina || !respostaForm.preco) return;
    setSavingResposta(true);
    const { error } = await supabase.from('cotacoes_pecas_respostas').insert({
      cotacao_id: cotacaoId,
      fornecedor_tipo: 'oficina',
      oficina_fornecedora_id: oficina.id,
      preco: parseFloat(respostaForm.preco),
      prazo_dias: parseInt(respostaForm.prazo_dias) || 1,
      observacao: respostaForm.observacao || null,
    });

    if (!error) {
      // Marca a cotacao como respondida e notifica a oficina compradora
      // (in-app + email), centralizado na rota server-side.
      await fetch('/api/marcar-cotacao-respondida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cotacaoId }),
      }).catch(() => {});
    }

    setRespondendoId(null);
    setRespostaForm({ preco: '', prazo_dias: '2', observacao: '' });
    setSavingResposta(false);
    await fetchCotacoesVizinhas();
  };

  if (loading || !oficina) {
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Peças</h1>
        <p className="text-gray-600 mt-1">Cotações de peças com lojas parceiras e oficinas vizinhas</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        <button onClick={() => setTab('comprar')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'comprar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
          Comprar
        </button>
        <button onClick={() => setTab('vender')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'vender' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
          Vender excedente
        </button>
      </div>

      {tab === 'comprar' ? (
        <>
          <div className="flex justify-end mb-4">
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
                        <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 gap-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {r.loja?.nome_fantasia || r.oficina_fornecedora?.nome_fantasia}
                              {r.fornecedor_tipo === 'oficina' && (
                                <span className="ml-1.5 text-[10px] font-semibold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-full align-middle">OFICINA</span>
                              )}
                            </p>
                            <p className="text-sm text-gray-600">
                              {formatCurrency(r.preco)} {c.quantidade > 1 && `x ${c.quantidade} = ${formatCurrency(r.preco * c.quantidade)}`} · Prazo: {r.prazo_dias} dia(s)
                            </p>
                            {r.observacao && <p className="text-xs text-gray-500 mt-0.5">{r.observacao}</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Link href={`/oficina/pecas/conversa/${r.id}`} className="text-xs font-medium text-primary-600 hover:underline">
                              Conversar
                            </Link>
                            {c.status !== 'fechada' && (
                              <button
                                onClick={() => handleConfirmarPedido(c, r)}
                                disabled={confirmandoId === r.id}
                                className="btn-primary !py-1.5 !px-3 text-sm disabled:opacity-50"
                              >
                                {confirmandoId === r.id ? 'Confirmando...' : 'Confirmar pedido'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-gray-900">Vender peças excedentes</h2>
              <p className="text-sm text-gray-500 mt-1">
                Ative pra receber avisos quando uma oficina num raio de {oficina.raio_atendimento_km || 30}km precisar de uma peça, e responder com o que você tem sobrando no estoque.
              </p>
            </div>
            <button
              onClick={handleToggleVendePecas}
              disabled={savingVende}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${vendePecas ? 'bg-primary-600' : 'bg-gray-300'} disabled:opacity-50`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${vendePecas ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {!vendePecas ? (
            <div className="card text-center py-12">
              <p className="text-gray-500">Ative a opção acima pra começar a ver cotações de oficinas vizinhas</p>
            </div>
          ) : (
            <>
          {pedidosFornecedora.length > 0 && (
            <div className="card mb-6">
              <h2 className="font-semibold text-gray-900 mb-3">Meus pedidos como fornecedora</h2>
              <div className="space-y-2">
                {pedidosFornecedora.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.cotacao?.peca_descricao}</p>
                      <p className="text-xs text-gray-500">
                        {p.oficina?.nome_fantasia} · {formatCurrency(p.preco_total)} · {formatDate(p.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Link href={`/oficina/pecas/conversa/${p.resposta_id}`} className="text-xs text-primary-600 hover:underline font-medium">
                        Conversar
                      </Link>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.status === 'entregue' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {p.status === 'entregue' ? 'Entregue' : 'Confirmado'}
                      </span>
                      {p.status === 'confirmado' && (
                        <button onClick={() => handleMarcarEntregueFornecedor(p.id)} disabled={marcandoEntregueId === p.id} className="text-xs text-primary-600 hover:underline font-medium disabled:opacity-50">
                          {marcandoEntregueId === p.id ? 'Marcando...' : 'Marcar entregue'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <details className="mb-6">
            <summary className="cursor-pointer text-sm font-medium text-primary-600 hover:underline">Ver minha comissão como fornecedora</summary>
            <div className="mt-4">
              <ComissaoPecasCard fornecedorTipo="oficina" fornecedorId={oficina.id} />
            </div>
          </details>
            </>
          )}

          {vendePecas && (loadingVender ? (
            <div className="animate-pulse h-32 bg-gray-200 rounded-xl" />
          ) : cotacoesVizinhas.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500">Nenhuma cotação aberta de oficinas próximas no momento</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cotacoesVizinhas.map((c) => {
                const km = c.oficina ? Math.round(distanciaKm(oficina.latitude, oficina.longitude, c.oficina.latitude, c.oficina.longitude)) : null;
                return (
                  <div key={c.id} className="card">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <p className="font-medium text-gray-900">{c.peca_descricao}</p>
                        <p className="text-sm text-gray-500">
                          {c.oficina?.nome_fantasia} - {c.oficina?.cidade}, {c.oficina?.estado} {km != null && `· ${km}km`}
                        </p>
                        {(c.fipe_marca || c.fipe_modelo) && (
                          <p className="text-sm text-gray-500">Veículo: {c.fipe_marca} {c.fipe_modelo} {c.fipe_ano}</p>
                        )}
                        <p className="text-sm text-gray-500">Quantidade: {c.quantidade}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-xs text-gray-400">{timeAgo(c.created_at)}</span>
                        {!c.minhaResposta && (
                          <Link
                            href={`/oficina/pecas/conversa/nova?cotacaoId=${c.id}&compradoraNome=${encodeURIComponent(c.oficina?.nome_fantasia || 'Oficina')}&pecaDescricao=${encodeURIComponent(c.peca_descricao || '')}`}
                            className="text-xs font-medium text-primary-600 hover:underline whitespace-nowrap"
                          >
                            Tirar dúvida
                          </Link>
                        )}
                      </div>
                    </div>

                    {c.minhaResposta ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
                        <p className="text-sm text-green-800">
                          Você respondeu: R$ {c.minhaResposta.preco.toFixed(2)} - prazo {c.minhaResposta.prazo_dias} dia(s)
                        </p>
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
                          <button onClick={() => handleResponderComoOficina(c.id)} disabled={savingResposta || !respostaForm.preco} className="btn-primary !py-1.5 !px-3 text-sm disabled:opacity-50">
                            {savingResposta ? 'Enviando...' : 'Enviar resposta'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setRespondendoId(c.id)} className="btn-primary !py-1.5 !px-3 text-sm mt-2">
                        Responder cotação
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
