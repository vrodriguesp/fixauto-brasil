'use client';

import { useEffect, useState } from 'react';
import { exemploVeiculo } from '@/lib/exemplos';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, timeAgo, distanciaKm } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import type { CotacaoPeca, CotacaoPecaResposta } from '@fixauto/shared';
import { Link } from '@/i18n/navigation';
import DetalhesPedidoPeca from '@/components/pecas/DetalhesPedidoPeca';
import { compressImage } from '@/lib/image-compress';

interface CotacaoComRespostas extends CotacaoPeca {
  respostas: (CotacaoPecaResposta & {
    loja: { nome_fantasia: string } | null;
    oficina_fornecedora: { nome_fantasia: string } | null;
  })[];
  pedidos?: { id: string; status: string; resposta_id: string }[];
}

// A1 (16/11): conversa de um fornecedor sobre um pedido (com ou sem oferta)
interface ConversaResumo { cotacaoId: string; tipo: 'loja' | 'oficina'; fornecedorId: string; nome: string; naoLidas: number }
// A3 (16/11): contato da outra parte, so depois da confirmacao (/api/contato-pedido-peca)
interface ContatoPedido { nome: string | null; telefone: string | null; endereco: string | null }
const chaveConversa = (cotacaoId: string, tipo: string, fornecedorId: string | null | undefined) => `${cotacaoId}:${tipo}:${fornecedorId || ''}`;

interface CotacaoDeOutraOficina extends Omit<CotacaoPeca, 'oficina'> {
  oficina: { nome_fantasia: string; cidade: string; estado: string; latitude: number; longitude: number } | null;
  minhaResposta?: { id: string; preco: number; prazo_dias: number } | null;
}

export default function OficinaPecasPage() {
  const t = useTranslations('oficinaPecas');
  const locale = useLocale();
  const { oficina, user, refreshProfile } = useAuth();
  // aba no endereco (?aba=vender): ao voltar da conversa com uma oficina a
  // pagina reabre na mesma aba (antes voltava sempre para "Comprar")
  const [tab, setTabState] = useState<'comprar' | 'vender'>('comprar');
  useEffect(() => { if (new URLSearchParams(window.location.search).get('aba') === 'vender') setTabState('vender'); }, []);
  const setTab = (aba: 'comprar' | 'vender') => {
    setTabState(aba);
    try { const u = new URL(window.location.href); if (aba === 'vender') u.searchParams.set('aba', 'vender'); else u.searchParams.delete('aba'); window.history.replaceState(window.history.state, '', u.toString()); } catch { /* sem URL: so a aba */ }
  };
  // editar / cancelar um pedido de peca ainda aberto
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ peca_descricao: '', quantidade: '1', observacao: '' });
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  // === Comprar ===
  const [cotacoes, setCotacoes] = useState<CotacaoComRespostas[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [form, setForm] = useState({ peca_descricao: '', fipe_marca: '', fipe_modelo: '', fipe_ano: '', quantidade: '1', observacao: '' });
  // fotos da peca (ate 4), enviadas depois de criar o pedido
  const [fotosPeca, setFotosPeca] = useState<File[]>([]);
  const [conversas, setConversas] = useState<Record<string, ConversaResumo>>({});
  const [contatos, setContatos] = useState<Record<string, ContatoPedido>>({});
  const [erroConfirmar, setErroConfirmar] = useState<{ cotacaoId: string; msg: string } | null>(null);

  const buscarContatos = async (pedidoIds: string[]) => {
    if (!pedidoIds.length) return;
    const r = await fetch('/api/contato-pedido-peca', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidoIds }) }).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    if (j?.contatos) setContatos((antes) => ({ ...antes, ...j.contatos }));
  };

  const fetchCotacoes = async () => {
    if (!oficina) return;
    // sem setLoading(true): o esqueleto so na 1a carga; nas recargas do tempo real a
    // tela trocava pelo esqueleto e o formulario aberto perdia o foco
    const { data } = await supabase
      .from('cotacoes_pecas')
      .select('*, respostas:cotacoes_pecas_respostas(*, loja:lojas_pecas(nome_fantasia, pais), oficina_fornecedora:oficinas!cotacoes_pecas_respostas_oficina_fornecedora_id_fkey(nome_fantasia, pais)), pedidos:pedidos_pecas(id, status, resposta_id)')
      .eq('oficina_id', oficina.id)
      .order('created_at', { ascending: false });
    const lista = ((data as any[]) || []) as CotacaoComRespostas[];
    setCotacoes(lista);
    setLoading(false);

    // A1: conversas dos fornecedores (inclusive pergunta antes de oferta), com nao lidas
    const ids = lista.map((c) => c.id);
    if (ids.length) {
      const { data: msgs } = await supabase
        .from('cotacoes_pecas_mensagens')
        .select('cotacao_id, fornecedor_tipo, fornecedor_id, remetente_id, lida')
        .in('cotacao_id', ids);
      const mapa: Record<string, ConversaResumo> = {};
      for (const m of (msgs as any[]) || []) {
        const k = chaveConversa(m.cotacao_id, m.fornecedor_tipo, m.fornecedor_id);
        mapa[k] = mapa[k] || { cotacaoId: m.cotacao_id, tipo: m.fornecedor_tipo, fornecedorId: m.fornecedor_id, nome: '', naoLidas: 0 };
        if (!m.lida && m.remetente_id !== user?.id) mapa[k].naoLidas++;
      }
      const lojaIds = Array.from(new Set(Object.values(mapa).filter((c) => c.tipo === 'loja').map((c) => c.fornecedorId)));
      const ofIds = Array.from(new Set(Object.values(mapa).filter((c) => c.tipo === 'oficina').map((c) => c.fornecedorId)));
      const [{ data: ljs }, { data: ofs }] = await Promise.all([
        lojaIds.length ? supabase.from('lojas_pecas').select('id, nome_fantasia').in('id', lojaIds) : Promise.resolve({ data: [] as any[] }),
        ofIds.length ? supabase.from('oficinas').select('id, nome_fantasia').in('id', ofIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const nomes = new Map<string, string>([...((ljs as any[]) || []), ...((ofs as any[]) || [])].map((x) => [x.id, x.nome_fantasia]));
      for (const c of Object.values(mapa)) c.nome = nomes.get(c.fornecedorId) || '';
      setConversas(mapa);
    } else setConversas({});

    // A3: contato do fornecedor escolhido
    buscarContatos(lista.flatMap((c) => (c.pedidos || []).map((p) => p.id)));
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
      observacao: form.observacao.trim() || null,
    }).select().single();

    // fotos: pasta publica da propria oficina (a regra de envio ja permite)
    if (nova && fotosPeca.length) {
      const urls: string[] = [];
      for (const original of fotosPeca.slice(0, 4)) {
        const foto = await compressImage(original);
        const caminho = `oficinas/${oficina.id}/pecas/${nova.id}/${crypto.randomUUID()}.jpg`;
        const { error: eUp } = await supabase.storage.from('publico').upload(caminho, foto, { contentType: foto.type || 'image/jpeg' });
        if (!eUp) urls.push(supabase.storage.from('publico').getPublicUrl(caminho).data.publicUrl);
      }
      if (urls.length) await supabase.from('cotacoes_pecas').update({ fotos: urls }).eq('id', nova.id);
    }

    // Avisa (sino + e-mail) as lojas de pecas do pais e as oficinas vizinhas que
    // vendem sobra (B3, 16/11: antes so as oficinas, e so com coordenadas)
    if (nova) {
      fetch('/api/notificar-fornecedores-cotacao-peca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cotacaoId: nova.id }),
      }).catch(() => {});
    }

    setForm({ peca_descricao: '', fipe_marca: '', fipe_modelo: '', fipe_ano: '', quantidade: '1', observacao: '' });
    setFotosPeca([]);
    setShowForm(false);
    setSaving(false);
    await fetchCotacoes();
  };

  const handleConfirmarPedido = async (
    cotacao: CotacaoComRespostas,
    resposta: CotacaoComRespostas['respostas'][number]
  ) => {
    if (!oficina) return;
    const nomeFornecedor = resposta.loja?.nome_fantasia || resposta.oficina_fornecedora?.nome_fantasia || t('fornecedorFallback');
    if (!confirm(t('confirmarPedido', { peca: cotacao.peca_descricao, preco: formatCurrency(resposta.preco, currencyForCountry(resposta.loja?.pais || resposta.oficina_fornecedora?.pais), locale), fornecedor: nomeFornecedor }))) return;
    setConfirmandoId(resposta.id);
    setErroConfirmar(null);

    // B2 (16/11): a rota de servidor grava o pedido (valor total), fecha a cotacao e
    // avisa quem ganhou (loja OU oficina - para a oficina o aviso dava 403) e quem perdeu
    const r = await fetch('/api/confirmar-pedido-peca', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respostaId: resposta.id }),
    }).catch(() => null);
    if (!r?.ok) {
      const j = r ? await r.json().catch(() => null) : null;
      setErroConfirmar({ cotacaoId: cotacao.id, msg: j?.codigo === 'JA_FECHADA' ? t('pedidoJaFechado') : t('erroConfirmarPedido') });
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
    // contato da oficina compradora (telefone e endereco), so dos pedidos ja confirmados
    buscarContatos(((data as any[]) || []).map((p) => p.id));
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
        // recebe ofertas ate a oficina escolher uma (fechada): antes so 'aberta', e a
        // 1a resposta (que muda para 'respondida') escondia o pedido das outras lojas
        .in('status', ['aberta', 'respondida'])
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
    // M15 (16/11): os pedidos ja ganhos como fornecedora aparecem mesmo com o
    // interruptor desligado (desligar so para de receber pedidos novos)
    if (tab === 'vender') fetchPedidosFornecedora();
    if (tab === 'vender' && vendePecas) fetchCotacoesVizinhas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, vendePecas, oficina]);

  // tempo real (migracao 059): pedido de oficina vizinha, oferta de loja e
  // pedido confirmado aparecem sem recarregar a pagina
  useEffect(() => {
    if (!oficina) return;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const recarregar = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => {
        fetchCotacoes();
        if (tab === 'vender') fetchPedidosFornecedora();
        if (tab === 'vender' && vendePecas) fetchCotacoesVizinhas();
      }, 500);
    };
    const canal = supabase.channel(`pecas-${oficina.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotacoes_pecas' }, recarregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotacoes_pecas_respostas' }, recarregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_pecas' }, recarregar)
      // A1: pergunta nova de um fornecedor aparece no cartao do pedido
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cotacoes_pecas_mensagens' }, recarregar)
      .subscribe();
    return () => { if (espera) clearTimeout(espera); supabase.removeChannel(canal); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oficina, tab, vendePecas]);

  const salvarEdicao = async (id: string) => {
    if (!editForm.peca_descricao.trim()) return;
    setSalvandoEdicao(true);
    await supabase.from('cotacoes_pecas').update({
      peca_descricao: editForm.peca_descricao.trim(),
      quantidade: Math.max(1, parseInt(editForm.quantidade) || 1),
      observacao: editForm.observacao.trim() || null,
    }).eq('id', id).in('status', ['aberta', 'respondida']);
    setSalvandoEdicao(false);
    setEditandoId(null);
    await fetchCotacoes();
  };
  const cancelarPedido = async (id: string) => {
    setSalvandoEdicao(true);
    await supabase.from('cotacoes_pecas').update({ status: 'cancelada' }).eq('id', id).in('status', ['aberta', 'respondida']);
    setSalvandoEdicao(false);
    setCancelandoId(null);
    await fetchCotacoes();
  };

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
        <h1 className="text-2xl font-bold text-gray-900">{t('titulo')}</h1>
        <p className="text-gray-600 mt-1">{t('subtitulo')}</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        <button onClick={() => setTab('comprar')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'comprar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
          {t('tabComprar')}
        </button>
        <button onClick={() => setTab('vender')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'vender' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
          {t('tabVenderExcedente')}
        </button>
      </div>

      {tab === 'comprar' ? (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowForm(true)} className="btn-primary">{t('novaCotacao')}</button>
          </div>

          {showForm && (
            <div className="card mb-6">
              <h2 className="font-semibold text-gray-900 mb-4">{t('solicitarCotacaoPeca')}</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="c8551-1" className="block text-sm font-medium text-gray-700 mb-1">{t('oQueVocePrecisa')}</label>
                  <input id="c8551-1" type="text" className="input-field" placeholder={t('placeholderFarol')} value={form.peca_descricao} onChange={(e) => setForm({ ...form, peca_descricao: e.target.value })} />
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="c8551-2" className="block text-sm font-medium text-gray-700 mb-1">{t('marca')}</label>
                    <input id="c8551-2" type="text" className="input-field" placeholder={exemploVeiculo(locale).marca} value={form.fipe_marca} onChange={(e) => setForm({ ...form, fipe_marca: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="c8551-3" className="block text-sm font-medium text-gray-700 mb-1">{t('modelo')}</label>
                    <input id="c8551-3" type="text" className="input-field" placeholder={exemploVeiculo(locale).modelo} value={form.fipe_modelo} onChange={(e) => setForm({ ...form, fipe_modelo: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="c8551-4" className="block text-sm font-medium text-gray-700 mb-1">{t('ano')}</label>
                    <input id="c8551-4" type="text" className="input-field" placeholder="2020" value={form.fipe_ano} onChange={(e) => setForm({ ...form, fipe_ano: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label htmlFor="c8551-5" className="block text-sm font-medium text-gray-700 mb-1">{t('quantidade')}</label>
                  <input id="c8551-5" type="number" className="input-field !w-24" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="peca-detalhes" className="block text-sm font-medium text-gray-700 mb-1">{t('detalhesLabel')}</label>
                  <textarea id="peca-detalhes" className="input-field min-h-[90px]" maxLength={1000} placeholder={t('detalhesPlaceholder')} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="peca-fotos" className="block text-sm font-medium text-gray-700 mb-1">{t('fotosLabel')}</label>
                  <input id="peca-fotos" type="file" accept="image/*" multiple className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700"
                    onChange={(e) => setFotosPeca(Array.from(e.target.files || []).slice(0, 4))} />
                  <p className="text-xs text-gray-500 mt-1">{t('fotosAjuda')}{fotosPeca.length ? ` (${fotosPeca.length})` : ''}</p>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="btn-secondary">{t('cancelar')}</button>
                <button onClick={handleCriar} disabled={saving || !form.peca_descricao} className="btn-primary disabled:opacity-50">
                  {saving ? t('enviando') : t('enviarCotacao')}
                </button>
              </div>
            </div>
          )}

          {cotacoes.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500">{t('nenhumaCotacaoAinda')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cotacoes.map((c) => {
                // A3 (16/11): pedido confirmado desta cotacao (oferta escolhida, entregue ou nao)
                const pedido = (c.pedidos || [])[0] || null;
                const entregue = pedido?.status === 'entregue';
                const contato = pedido ? contatos[pedido.id] : undefined;
                // A1: conversas de fornecedores que ainda nao mandaram oferta
                const comOferta = new Set((c.respostas || []).map((r) => chaveConversa(c.id, r.fornecedor_tipo, r.loja_id || r.oficina_fornecedora_id)));
                const semOferta = Object.entries(conversas).filter(([k, v]) => v.cotacaoId === c.id && !comOferta.has(k)).map(([, v]) => v);
                return (
                <div key={c.id} className="card" data-testid="cotacao-peca">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{c.peca_descricao}</p>
                      {(c.fipe_marca || c.fipe_modelo) && (
                        <p className="text-sm text-gray-500">{c.fipe_marca} {c.fipe_modelo} {c.fipe_ano} · {t('qtd')}: {c.quantidade}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span data-testid="cotacao-status" className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.status === 'fechada' ? 'bg-green-100 text-green-700' :
                        c.status === 'respondida' ? 'bg-blue-100 text-blue-700' :
                        c.status === 'cancelada' ? 'bg-gray-100 text-gray-600' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {c.status === 'aberta' ? t('aguardandoRespostas') : c.status === 'respondida' ? t('respondida') : c.status === 'fechada' ? (entregue ? t('entregue') : t('pedidoConfirmado')) : t('cancelada')}
                      </span>
                      <p className="text-xs text-gray-400 mt-1">{timeAgo(c.created_at, locale)}</p>
                    </div>
                  </div>

                  {/* M9 (16/11): detalhes e fotos tambem no cartao da propria compradora */}
                  {editandoId !== c.id && (c.observacao || (c.fotos && c.fotos.length > 0)) && (
                    <div className="mb-3 -mt-2"><DetalhesPedidoPeca observacao={c.observacao} fotos={c.fotos} /></div>
                  )}
                  {erroConfirmar?.cotacaoId === c.id && (
                    <p role="alert" className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{erroConfirmar.msg}</p>
                  )}
                  {['aberta', 'respondida'].includes(c.status) && editandoId !== c.id && (
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <button type="button" onClick={() => { setCancelandoId(null); setEditandoId(c.id); setEditForm({ peca_descricao: c.peca_descricao || '', quantidade: String(c.quantidade || 1), observacao: (c as any).observacao || '' }); }}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">✏️ {t('editarPedido')}</button>
                      {cancelandoId === c.id ? (
                        <span className="inline-flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-red-700">{t('confirmarCancelarPedido')}</span>
                          <button type="button" disabled={salvandoEdicao} onClick={() => cancelarPedido(c.id)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">{t('simCancelar')}</button>
                          <button type="button" onClick={() => setCancelandoId(null)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700">{t('naoManter')}</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setCancelandoId(c.id)} className="px-3 py-1.5 text-sm rounded-lg border border-red-200 text-red-700 hover:bg-red-50">✕ {t('cancelarPedido')}</button>
                      )}
                    </div>
                  )}
                  {editandoId === c.id && (
                    <div className="mb-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <label className="block">
                        <span className="block text-sm font-medium text-gray-700 mb-1">{t('oQueVocePrecisa')}</span>
                        <input className="input-field" value={editForm.peca_descricao} onChange={(e) => setEditForm({ ...editForm, peca_descricao: e.target.value })} />
                      </label>
                      <label className="block">
                        <span className="block text-sm font-medium text-gray-700 mb-1">{t('quantidade')}</span>
                        <input className="input-field !w-28" inputMode="numeric" value={editForm.quantidade} onChange={(e) => setEditForm({ ...editForm, quantidade: e.target.value.replace(/\D/g, '') })} />
                      </label>
                      <label className="block">
                        <span className="block text-sm font-medium text-gray-700 mb-1">{t('detalhesLabel')}</span>
                        <textarea className="input-field" rows={2} value={editForm.observacao} onChange={(e) => setEditForm({ ...editForm, observacao: e.target.value })} />
                      </label>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditandoId(null)} className="btn-secondary">{t('cancelar')}</button>
                        <button type="button" disabled={salvandoEdicao || !editForm.peca_descricao.trim()} onClick={() => salvarEdicao(c.id)} className="btn-primary disabled:opacity-50">{t('salvarPedido')}</button>
                      </div>
                    </div>
                  )}

                  {c.respostas && c.respostas.length > 0 && (
                    <div className="border-t pt-3 space-y-2">
                      {c.respostas.map((r) => {
                        const escolhida = !!pedido && pedido.resposta_id === r.id;
                        const naoLidas = conversas[chaveConversa(c.id, r.fornecedor_tipo, r.loja_id || r.oficina_fornecedora_id)]?.naoLidas || 0;
                        return (
                        <div key={r.id} data-testid={escolhida ? 'oferta-escolhida' : 'oferta'} className={`rounded-lg p-3 ${escolhida ? 'bg-green-50 border border-green-300' : 'bg-gray-50'} ${pedido && !escolhida ? 'opacity-60' : ''}`}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">
                              {r.loja?.nome_fantasia || r.oficina_fornecedora?.nome_fantasia}
                              {r.fornecedor_tipo === 'oficina' && (
                                <span className="ml-1.5 text-[10px] font-semibold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-full align-middle">{t('oficinaTag')}</span>
                              )}
                              {escolhida && (
                                <span className="ml-1.5 inline-block whitespace-nowrap text-[10px] font-semibold text-green-800 bg-green-200 px-1.5 py-0.5 rounded-full align-middle">✓ {t('ofertaEscolhida')}</span>
                              )}
                            </p>
                            <p className="text-sm text-gray-600">
                              {formatCurrency(r.preco, currencyForCountry(r.loja?.pais || r.oficina_fornecedora?.pais), locale)} {c.quantidade > 1 && `x ${c.quantidade} = ${formatCurrency(r.preco * c.quantidade, currencyForCountry(r.loja?.pais || r.oficina_fornecedora?.pais), locale)}`} · {t('prazoDias', { dias: r.prazo_dias })}
                            </p>
                            {r.observacao && <p className="text-xs text-gray-500 mt-0.5">{r.observacao}</p>}
                          </div>
                          <div className="flex items-center justify-end gap-3 flex-shrink-0">
                            <Link href={`/oficina/pecas/conversa/${r.id}`} className="text-xs font-medium text-primary-600 hover:underline inline-flex items-center gap-1">
                              {t('conversar')}
                              {naoLidas > 0 && <span className="min-w-[1.25rem] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white" aria-label={t('mensagensNaoLidas', { n: naoLidas })}>{naoLidas}</span>}
                            </Link>
                            {c.status !== 'fechada' && (
                              <button
                                onClick={() => handleConfirmarPedido(c, r)}
                                disabled={confirmandoId === r.id}
                                className="btn-primary !py-1.5 !px-3 text-sm disabled:opacity-50"
                              >
                                {confirmandoId === r.id ? t('confirmando') : t('confirmarPedidoBtn')}
                              </button>
                            )}
                          </div>
                        </div>
                        {/* A3: telefone e endereco do fornecedor so depois da confirmacao */}
                        {escolhida && contato && (contato.telefone || contato.endereco) && (
                          <div className="mt-2 border-t border-green-200 pt-2 text-sm text-gray-700 space-y-0.5" data-testid="contato-fornecedor">
                            <p className="text-xs font-semibold text-green-800">{t('contatoFornecedor')}</p>
                            {contato.telefone && <p>{t('telefoneLabel')}: <a href={`tel:${contato.telefone.replace(/[^\d+]/g, '')}`} className="text-primary-700 underline">{contato.telefone}</a></p>}
                            {contato.endereco && <p>{t('enderecoLabel')}: {contato.endereco}</p>}
                          </div>
                        )}
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {/* A1 (16/11): pergunta de fornecedor antes de mandar oferta */}
                  {semOferta.length > 0 && (
                    <div className="border-t pt-3 mt-3" data-testid="perguntas-fornecedores">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('perguntasFornecedores')}</p>
                      <div className="space-y-2">
                        {semOferta.map((cv) => (
                          <Link
                            key={`${cv.tipo}:${cv.fornecedorId}`}
                            href={`/oficina/pecas/conversa/nova?cotacaoId=${c.id}&fornecedorTipo=${cv.tipo}&fornecedorId=${cv.fornecedorId}&pecaDescricao=${encodeURIComponent(c.peca_descricao || '')}`}
                            className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3 hover:bg-gray-100"
                          >
                            <span className="text-sm font-medium text-gray-900 min-w-0 truncate">
                              {cv.nome || t('fornecedorFallback')}
                              {cv.tipo === 'oficina' && <span className="ml-1.5 text-[10px] font-semibold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-full align-middle">{t('oficinaTag')}</span>}
                            </span>
                            <span className="flex items-center gap-2 flex-shrink-0 text-xs font-medium text-primary-600">
                              {cv.naoLidas > 0 && <span className="min-w-[1.25rem] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white" aria-label={t('mensagensNaoLidas', { n: cv.naoLidas })}>{cv.naoLidas}</span>}
                              {t('abrirConversa')}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-gray-900">{t('venderPecasExcedentes')}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {t('ativeParaReceberAvisos', { raio: oficina.raio_atendimento_km || 30 })}
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

          {!vendePecas && (
            <div className="card text-center py-12 mb-6">
              <p className="text-gray-500">{t('ativeOpcaoAcima')}</p>
            </div>
          )}
          {/* M15 (16/11): fora do interruptor - desligar nao esconde os pedidos ja ganhos */}
          {pedidosFornecedora.length > 0 && (
            <div className="card mb-6" data-testid="pedidos-como-fornecedora">
              <h2 className="font-semibold text-gray-900 mb-3">{t('meusPedidosComoFornecedora')}</h2>
              <div className="space-y-2">
                {pedidosFornecedora.map((p) => (
                  <div key={p.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 bg-gray-50 rounded-lg p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{p.cotacao?.peca_descricao}</p>
                      <p className="text-xs text-gray-500">
                        {p.oficina?.nome_fantasia} · {formatCurrency(p.preco_total, currencyForCountry(oficina?.pais), locale)} · {formatDate(p.created_at, locale)}
                      </p>
                      {(contatos[p.id]?.telefone || contatos[p.id]?.endereco) && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          {contatos[p.id]?.telefone && <a href={`tel:${contatos[p.id].telefone!.replace(/[^\d+]/g, '')}`} className="text-primary-700 underline">{contatos[p.id].telefone}</a>}
                          {contatos[p.id]?.telefone && contatos[p.id]?.endereco && ' · '}
                          {contatos[p.id]?.endereco}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-3 flex-shrink-0">
                      <Link href={`/oficina/pecas/conversa/${p.resposta_id}`} className="text-xs text-primary-600 hover:underline font-medium">
                        {t('conversar')}
                      </Link>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.status === 'entregue' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {p.status === 'entregue' ? t('entregue') : t('confirmado')}
                      </span>
                      {p.status === 'confirmado' && (
                        <button onClick={() => handleMarcarEntregueFornecedor(p.id)} disabled={marcandoEntregueId === p.id} className="text-xs text-primary-600 hover:underline font-medium disabled:opacity-50">
                          {marcandoEntregueId === p.id ? t('marcando') : t('marcarEntregue')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* "Minha comissao como fornecedora" escondido da oficina (dono 03/11):
              sem cobranca hoje, so assustava quem esta entrando */}

          {vendePecas && (loadingVender ? (
            <div className="animate-pulse h-32 bg-gray-200 rounded-xl" />
          ) : cotacoesVizinhas.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500">{t('nenhumaCotacaoAbertaVizinhas')}</p>
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
                          <p className="text-sm text-gray-500">{t('veiculoLabel')}: {c.fipe_marca} {c.fipe_modelo} {c.fipe_ano}</p>
                        )}
                        <p className="text-sm text-gray-500">{t('quantidadeLabel')}: {c.quantidade}</p>
                        <DetalhesPedidoPeca observacao={c.observacao} fotos={c.fotos} />
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-xs text-gray-400">{timeAgo(c.created_at, locale)}</span>
                        {!c.minhaResposta && (
                          <Link
                            href={`/oficina/pecas/conversa/nova?cotacaoId=${c.id}&compradoraNome=${encodeURIComponent(c.oficina?.nome_fantasia || t('oficinaFallback'))}&pecaDescricao=${encodeURIComponent(c.peca_descricao || '')}`}
                            className="text-xs font-medium text-primary-600 hover:underline whitespace-nowrap"
                          >
                            {t('tirarDuvida')}
                          </Link>
                        )}
                      </div>
                    </div>

                    {c.minhaResposta ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
                        <p className="text-sm text-green-800">
                          {t('vocesRespondeu', { preco: formatCurrency(c.minhaResposta.preco, currencyForCountry(oficina?.pais), locale), dias: c.minhaResposta.prazo_dias })}
                        </p>
                      </div>
                    ) : respondendoId === c.id ? (
                      <div className="mt-3 space-y-3 border-t pt-3">
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="c8551-6" className="block text-xs font-medium text-gray-700 mb-1">{t('precoReais')}</label>
                            <input id="c8551-6" type="number" step="0.01" className="input-field !py-1.5" value={respostaForm.preco} onChange={(e) => setRespostaForm({ ...respostaForm, preco: e.target.value })} />
                          </div>
                          <div>
                            <label htmlFor="c8551-7" className="block text-xs font-medium text-gray-700 mb-1">{t('prazoDiasLabel')}</label>
                            <input id="c8551-7" type="number" className="input-field !py-1.5" value={respostaForm.prazo_dias} onChange={(e) => setRespostaForm({ ...respostaForm, prazo_dias: e.target.value })} />
                          </div>
                        </div>
                        <input type="text" className="input-field !py-1.5" placeholder={t('placeholderObservacaoOpcional')} value={respostaForm.observacao} onChange={(e) => setRespostaForm({ ...respostaForm, observacao: e.target.value })} />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setRespondendoId(null)} className="btn-secondary !py-1.5 !px-3 text-sm">{t('cancelar')}</button>
                          <button onClick={() => handleResponderComoOficina(c.id)} disabled={savingResposta || !respostaForm.preco} className="btn-primary !py-1.5 !px-3 text-sm disabled:opacity-50">
                            {savingResposta ? t('enviando') : t('enviarResposta')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setRespondendoId(c.id)} className="btn-primary !py-1.5 !px-3 text-sm mt-2">
                        {t('responderCotacao')}
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
