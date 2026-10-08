'use client';

import { useState, useEffect } from 'react';
import SeguroDoPedido from '@/components/oficina/SeguroDoPedido';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useOrcamentos } from '@/hooks/use-orcamentos';
import { useAuth } from '@/lib/auth-context';
import type { TipoItemOrcamento, AnaliseDano } from '@fixauto/shared';
import { formatCurrency, cleanDescricao } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { supabase } from '@/lib/supabase';
import { hojeLocal, turnoDisponivel, primeiroTurnoLivre, type Turno } from '@/lib/turnos';

interface ItemForm {
  descricao: string;
  tipo: TipoItemOrcamento;
  valor_unitario: number;
  quantidade: number;
}

export default function EnviarOrcamentoPage() {
  const t = useTranslations('oficinaEnviarOrcamento');
  const tc = useTranslations('constants');
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const { solicitacoes } = useSolicitacoes();
  const { create: createOrcamento, update: updateOrcamento } = useOrcamentos();
  const { oficina } = useAuth();
  const moeda = currencyForCountry(oficina?.pais);
  const solicitacao = solicitacoes.find((s) => s.id === params.id);

  // Check if workshop already has a quote for this solicitation
  const existingQuote = solicitacao?.orcamentos?.find(
    (o) => o.oficina_id === oficina?.id
  );
  const isRevision = !!existingQuote;

  const [itens, setItens] = useState<ItemForm[]>([
    { descricao: '', tipo: 'mao_de_obra', valor_unitario: 0, quantidade: 1 },
  ]);
  const [prazoDias, setPrazoDias] = useState(5);
  const [tempoExecucaoHoras, setTempoExecucaoHoras] = useState(40);
  const [observacoes, setObservacoes] = useState('');
  const [validade, setValidade] = useState((() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })());
  const [submitted, setSubmitted] = useState(false);
  // garantia do servico (dias, a partir da entrega); '' = nao informada
  const [garantiaDias, setGarantiaDias] = useState<string>('');
  // orcamento feito em outro sistema: foto/PDF lido pela IA e (opcional) anexado
  const [docArquivo, setDocArquivo] = useState<File | null>(null);
  const [lendoDoc, setLendoDoc] = useState<'' | 'lendo' | 'ok' | 'erro' | 'ocupada'>('');
  const [prefilled, setPrefilled] = useState(false);
  const [analise, setAnalise] = useState<AnaliseDano | null>(null);

  // Fetch AI analysis if exists
  useEffect(() => {
    if (params.id) {
      supabase.from('analise_dano').select('*').eq('solicitacao_id', params.id).single()
        .then(({ data }) => { if (data) setAnalise(data as AnaliseDano); });
    }
  }, [params.id]);

  // Commission handling - taxa efetiva considera o tier de fidelidade/volume
  // a comissao e sempre da oficina (o cliente nao paga nada a mais): sem opcao de repassar
  const comissaoModo = 'absorver' as const;
  const [comissaoInfo, setComissaoInfo] = useState<{ tipo?: 'percentual' | 'valor_fixo'; taxa: number; valorFixo?: number | null; origem: string } | null>(null);

  useEffect(() => {
    if (!oficina?.id) return;
    fetch(`/api/comissao-atual?oficinaId=${oficina.id}`)
      .then((res) => res.json())
      .then((data) => { if (data.taxa != null) setComissaoInfo(data); })
      .catch(() => {});
  }, [oficina?.id]);

  // Availability slots
  // comeca no primeiro periodo ainda valido (antes: hoje de manha, mesmo a tarde)
  const [slots, setSlots] = useState<{ data: string; turno: 'manha' | 'tarde' }[]>(() => [primeiroTurnoLivre()]);
  const [erroHorario, setErroHorario] = useState(false);

  // Pre-fill form with existing quote data for revisions
  useEffect(() => {
    if (existingQuote && !prefilled) {
      setPrefilled(true);
      if (existingQuote.itens && existingQuote.itens.length > 0) {
        setItens(
          existingQuote.itens.map((item: any) => ({
            descricao: item.descricao,
            tipo: item.tipo as TipoItemOrcamento,
            valor_unitario: item.valor_unitario,
            quantidade: item.quantidade,
          }))
        );
      }
      setPrazoDias(existingQuote.prazo_dias || 5);
      setTempoExecucaoHoras(existingQuote.tempo_execucao_horas || 40);

      // Parse commission prefix from observacoes
      const obsRaw = existingQuote.observacoes || '';
      const comissaoMatch = obsRaw.match(/^\[COMISSAO:(absorver|repassar):([\d.]+)\]/);
      if (comissaoMatch) {
        setObservacoes(obsRaw.replace(/^\[COMISSAO:[^\]]+\]\n?/, ''));
      } else {
        setObservacoes(obsRaw);
      }
      setValidade(existingQuote.validade || (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })());
      setGarantiaDias((existingQuote as any).garantia_dias != null ? String((existingQuote as any).garantia_dias) : '');
      if (existingQuote.disponibilidade && existingQuote.disponibilidade.length > 0) {
        setSlots(
          existingQuote.disponibilidade.map((s: any) => ({
            data: s.data_checkin,
            turno: s.turno as 'manha' | 'tarde',
          }))
        );
      }
    }
  }, [existingQuote, prefilled]);

  const addSlot = () => {
    setSlots([...slots, { data: '', turno: 'manha' as const }]);
  };

  const removeSlot = (index: number) => {
    if (slots.length > 1) setSlots(slots.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: 'data' | 'turno', value: string) => {
    setErroHorario(false);
    setSlots(slots.map((s, i) => {
      if (i !== index) return s;
      const novo = { ...s, [field]: value } as { data: string; turno: Turno };
      // trocou para hoje e a manha ja passou: vai para a tarde
      if (field === 'data' && !turnoDisponivel(novo.data, novo.turno) && turnoDisponivel(novo.data, 'tarde')) novo.turno = 'tarde';
      return novo;
    }));
  };

  const addItem = () => {
    setItens([...itens, { descricao: '', tipo: 'mao_de_obra', valor_unitario: 0, quantidade: 1 }]);
  };

  const removeItem = (index: number) => {
    if (itens.length > 1) {
      setItens(itens.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof ItemForm, value: string | number) => {
    const newItens = itens.map((item, i) => {
      if (i !== index) return item;
      return { ...item, [field]: value };
    });
    setItens(newItens);
  };

  const total = itens.reduce((acc, item) => acc + item.valor_unitario * item.quantidade, 0);

  // Commission computed values (after total) - taxa real da oficina (com
  // desconto por fidelidade/volume, se aplicavel), com 10% como fallback
  // enquanto a chamada a /api/comissao-atual nao volta
  // Valor fixo por servico (condicao do admin) ou percentual sobre o total
  const valorFixoComissao = comissaoInfo?.tipo === 'valor_fixo' ? Math.min(comissaoInfo.valorFixo || 0, total) : null;
  const comissaoValor = valorFixoComissao != null ? valorFixoComissao : total * (comissaoInfo ? comissaoInfo.taxa : 0.1);
  const COMISSAO_PERCENTUAL = total > 0 ? Math.round((comissaoValor / total) * 10000) / 100 : 0;
  const semComissao = !!comissaoInfo && comissaoValor === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (slots.some((s) => s.data && !turnoDisponivel(s.data, s.turno))) {
      setErroHorario(true);
      return;
    }

    const itensPayload = itens.map(item => ({
      descricao: item.descricao,
      tipo: item.tipo,
      valor_unitario: item.valor_unitario,
      quantidade: item.quantidade,
      valor_total: item.valor_unitario * item.quantidade,
    }));

    const slotsPayload = slots.filter(s => s.data).map(s => ({
      data_checkin: s.data,
      turno: s.turno,
      data_previsao_entrega: (() => {
        const d = new Date(s.data + 'T12:00:00');
        d.setDate(d.getDate() + prazoDias);
        return d.toISOString().split('T')[0];
      })(),
    }));

    // Build observacoes with commission prefix
    const comissaoPrefix = `[COMISSAO:${comissaoModo}:${COMISSAO_PERCENTUAL}]`;
    const obsComComissao = comissaoPrefix + (observacoes ? '\n' + observacoes : '');

    // Use commission-adjusted total when repassing to client
    const valorFinal = total;

    let result: { data?: any; error?: any };

    const garantia = garantiaDias === '' ? null : Number(garantiaDias);

    if (isRevision && existingQuote) {
      // Update existing quote (revision)
      result = await updateOrcamento(existingQuote.id, {
        solicitacao_id: params.id as string,
        valor_total: valorFinal,
        prazo_dias: prazoDias,
        tempo_execucao_horas: tempoExecucaoHoras,
        observacoes: obsComComissao,
        validade,
        valor_original: existingQuote.valor_original || existingQuote.valor_total,
        revisao_numero: (existingQuote.revisao_numero || 0) + 1,
        garantia_dias: garantia,
        itens: itensPayload,
        slots: slotsPayload,
      });
    } else {
      // Create new quote
      result = await createOrcamento({
        solicitacao_id: params.id as string,
        valor_total: valorFinal,
        prazo_dias: prazoDias,
        tempo_execucao_horas: tempoExecucaoHoras,
        observacoes: obsComComissao,
        validade,
        garantia_dias: garantia,
        itens: itensPayload,
        slots: slotsPayload,
      });
    }

    if (!result.error) {
      // Notify client via email + WhatsApp (non-blocking)
      const orcId = result.data?.id;
      if (orcId) {
        fetch('/api/notificar-orcamento', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orcamentoId: orcId }),
        }).catch(() => {});
      }

      setSubmitted(true);
      setTimeout(() => router.push('/oficina/solicitacoes'), 2000);
    }
  };

  if (!solicitacao) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">{t('solicitacaoNaoEncontrada')}</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {isRevision ? t('orcamentoRevisado') : t('orcamentoEnviado')}
        </h1>
        <p className="text-gray-600">
          {isRevision
            ? t('clienteNotificadoRevisao')
            : t('clienteNotificadoAceite')}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('voltar')}
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {isRevision ? t('revisarOrcamento') : t('enviarOrcamento')}
      </h1>
      {isRevision && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
          <p className="text-sm text-amber-800">
            {t('jaEnviouOrcamento', { numero: ((existingQuote?.revisao_numero) || 0) + 1 })}
          </p>
        </div>
      )}
      <p className="text-gray-600 mb-6">
        {solicitacao.veiculo?.fipe_marca} {solicitacao.veiculo?.fipe_modelo} - {tc.has(`tiposServico.${solicitacao.tipo}`) ? tc(`tiposServico.${solicitacao.tipo}`) : solicitacao.tipo}
      </p>

      {/* Request summary */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <p className="text-sm text-gray-600">{cleanDescricao(solicitacao.descricao)}</p>
        <p className="text-xs text-gray-500 mt-2">
          {t('clienteLabel')}: {solicitacao.cliente?.nome} | {solicitacao.endereco}
        </p>
      </div>

      {/* Quem paga o reparo (seguro?) */}
      <SeguroDoPedido sol={solicitacao as any} />

      {/* AI Insights */}
      {analise && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🤖</span>
            <h3 className="font-semibold text-indigo-900 text-sm">{t('analiseIA')}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              analise.severidade === 'leve' ? 'bg-green-100 text-green-700' :
              analise.severidade === 'moderado' ? 'bg-yellow-100 text-yellow-700' :
              analise.severidade === 'grave' ? 'bg-orange-100 text-orange-700' :
              'bg-red-100 text-red-700'
            }`}>{analise.severidade}</span>
          </div>
          <p className="text-sm text-indigo-800 mb-2">{analise.resumo}</p>
          {analise.pecas_afetadas && analise.pecas_afetadas.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {analise.pecas_afetadas.map((p, i) => (
                <span key={i} className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">{p}</span>
              ))}
            </div>
          )}
          {analise.estimativa_custo && (
            <p className="text-xs text-indigo-600">
              {t('estimativaIA')}: {formatCurrency(analise.estimativa_custo.min, moeda, locale)} - {formatCurrency(analise.estimativa_custo.max, moeda, locale)}
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Orcamento feito em outro sistema: a IA preenche, a oficina confere */}
        <div className="card mb-6 border-2 border-dashed border-primary-200">
          <h2 className="text-base font-semibold text-gray-900 mb-1">{t('importarTitulo')}</h2>
          <p className="text-sm text-gray-600 mb-3">{t('importarTexto')}</p>
          <label className="btn-secondary !py-2 text-sm inline-flex items-center gap-2 cursor-pointer">
            <input type="file" accept="image/*,application/pdf" className="sr-only" aria-label={t('importarBotao')}
              onChange={async (e) => {
                const arq = e.target.files?.[0];
                if (!arq) return;
                setDocArquivo(arq);
                setLendoDoc('lendo');
                const fd = new FormData();
                fd.append('arquivo', arq);
                fd.append('idioma', locale);
                const r = await fetch('/api/ler-orcamento', { method: 'POST', body: fd }).catch(() => null);
                const d = r ? await r.json().catch(() => ({})) : {};
                if (!r || !r.ok) { setLendoDoc(d.codigo === 'IA_OCUPADA' ? 'ocupada' : 'erro'); return; }
                setItens(d.itens.map((i: any) => ({ descricao: i.descricao, tipo: i.tipo, quantidade: i.quantidade, valor_unitario: i.valor_unitario })));
                if (d.prazo_dias) setPrazoDias(d.prazo_dias);
                if (d.garantia_dias) setGarantiaDias(String(d.garantia_dias));
                if (d.observacoes) setObservacoes((o) => (o ? `${o}\n${d.observacoes}` : d.observacoes));
                setLendoDoc('ok');
              }} />
            📄 {lendoDoc === 'lendo' ? t('importarLendo') : t('importarBotao')}
          </label>
          {docArquivo && <p className="text-xs text-gray-500 mt-2 break-all">{docArquivo.name}</p>}
          {lendoDoc === 'ok' && <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2" role="status">{t('importarConfira')}</p>}
          {lendoDoc === 'erro' && <p className="text-sm text-red-700 mt-2" role="alert">{t('importarErro')}</p>}
          {lendoDoc === 'ocupada' && <p className="text-sm text-red-700 mt-2" role="alert">{t('importarOcupada')}</p>}
        </div>

        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('itensOrcamento')}</h2>

          <div className="space-y-4">
            {itens.map((item, index) => (
              <div key={index} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">{t('itemNumero', { numero: index + 1 })}</span>
                  {itens.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      {t('remover')}
                    </button>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      className="input-field"
                      placeholder={t('placeholderDescricaoItem')}
                      value={item.descricao}
                      onChange={(e) => updateItem(index, 'descricao', e.target.value)}
                    />
                  </div>
                  <div>
                    <select
                      className="input-field"
                      value={item.tipo}
                      onChange={(e) => updateItem(index, 'tipo', e.target.value)}
                    >
                      <option value="mao_de_obra">{t('maoDeObra')}</option>
                      <option value="peca">{t('peca')}</option>
                      <option value="material">{t('material')}</option>
                      <option value="outro">{t('outro')}</option>
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <input
                        type="number"
                        className="input-field"
                        placeholder={t('placeholderValor')}
                        value={item.valor_unitario || ''}
                        onChange={(e) => updateItem(index, 'valor_unitario', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="w-20">
                      <input
                        type="number"
                        className="input-field"
                        placeholder={t('placeholderQtd')}
                        min={1}
                        value={item.quantidade}
                        onChange={(e) => updateItem(index, 'quantidade', parseInt(e.target.value) || 1)}
                      />
                    </div>
                  </div>
                </div>
                {item.valor_unitario > 0 && (
                  <p className="text-sm text-gray-500 mt-2 text-right">
                    {t('subtotal')}: {formatCurrency(item.valor_unitario * item.quantidade, moeda, locale)}
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors"
          >
            {t('adicionarItem')}
          </button>

          {/* Total */}
          <div className="flex justify-between items-center mt-6 pt-4 border-t">
            <span className="text-lg font-semibold text-gray-900">{t('total')}</span>
            <span className="text-2xl font-bold text-gray-900">{formatCurrency(total, moeda, locale)}</span>
          </div>

          {/* Sem comissao (fase de fundadores ou oferta individual): nada a absorver/repassar */}
          {total > 0 && semComissao && (
            <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                {t('semComissaoOrcamento')}
              </div>
            </div>
          )}

          {/* Commission section */}
          {total > 0 && comissaoInfo && !semComissao && (
            <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium text-blue-800">{t('comissaoBipfix')}</span>
                </div>
                <p className="text-sm text-blue-700">
                  {t('comissaoDaPlataforma')}{' '}
                  {valorFixoComissao == null && <><strong>{COMISSAO_PERCENTUAL}%</strong> = </>}
                  <strong>{formatCurrency(comissaoValor, moeda, locale)}</strong>
                </p>
              </div>

              <p className="text-sm text-gray-600">{t('comissaoPagaNoFim', { valor: formatCurrency(comissaoValor, moeda, locale), total: formatCurrency(total, moeda, locale) })}</p>
            </div>
          )}
        </div>

        {/* Prazo & Execucao */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('prazoExecucao')}</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="cacb1-101" className="block text-sm font-medium text-gray-700 mb-1">
                {t('prazoTotalDias')}
              </label>
              <input id="cacb1-101"
                type="number"
                className="input-field"
                min={1}
                value={prazoDias}
                onChange={(e) => setPrazoDias(parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <label htmlFor="cacb1-102" className="block text-sm font-medium text-gray-700 mb-1">
                {t('tempoExecucaoHoras')}
              </label>
              <input id="cacb1-102"
                type="number"
                className="input-field"
                min={1}
                value={tempoExecucaoHoras}
                onChange={(e) => setTempoExecucaoHoras(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('diasUteis', { count: Math.ceil(tempoExecucaoHoras / 8) })}
              </p>
            </div>
            <div>
              <label htmlFor="cacb1-103" className="block text-sm font-medium text-gray-700 mb-1">
                {t('validadeOrcamento')}
              </label>
              <input id="cacb1-103"
                type="date"
                className="input-field"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="orc-garantia" className="block text-sm font-medium text-gray-700 mb-1">{t('garantia')}</label>
              <select id="orc-garantia" className="input-field" value={garantiaDias} onChange={(e) => setGarantiaDias(e.target.value)}>
                <option value="">{t('garantiaNaoInformada')}</option>
                <option value="0">{t('garantiaSem')}</option>
                {[30, 90, 180, 365, 730].map((d) => <option key={d} value={d}>{t(`garantia_${d}`)}</option>)}
                {garantiaDias && ![0, 30, 90, 180, 365, 730].includes(Number(garantiaDias)) && <option value={garantiaDias}>{t('garantiaDias', { dias: garantiaDias })}</option>}
              </select>
              <p className="text-xs text-gray-500 mt-1">{t('garantiaAjuda')}</p>
            </div>
          </div>
        </div>

        {/* Disponibilidade */}
        {solicitacao.status === 'em_andamento' ? (
          <div className="card mb-6">
            <div className="bg-blue-50 rounded-lg p-4 flex items-center gap-3">
              <span className="text-2xl">🔧</span>
              <div>
                <p className="font-semibold text-blue-800">{t('veiculoJaNaOficina')}</p>
                <p className="text-sm text-blue-600">{t('checkinJaRealizado')}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="card mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('disponibilidadeCheckin')}</h2>
            <p className="text-sm text-gray-500 mb-4">
              {t('ofereceDatas')}
            </p>

            {erroHorario && <p className="text-sm text-red-700 mb-3" role="alert">{t('horarioPassado')}</p>}
            <div className="space-y-3">
              {slots.map((slot, index) => (
                // celular: data e turno um embaixo do outro (o turno ficava espremido ao lado da data)
                <div key={index} className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-lg border border-gray-200 p-3 sm:border-0 sm:p-0">
                  <div className="w-full sm:w-auto sm:flex-1">
                    <input
                      aria-label={t('disponibilidadeCheckin')}
                      type="date"
                      className="input-field"
                      min={hojeLocal()}
                      value={slot.data}
                      onChange={(e) => updateSlot(index, 'data', e.target.value)}
                    />
                  </div>
                  <div className="flex-1 sm:flex-none sm:w-44">
                    <select
                      aria-label={t('manhaHorario') + ' / ' + t('tardeHorario')}
                      className={`input-field ${!turnoDisponivel(slot.data, slot.turno) ? '!border-red-400' : ''}`}
                      value={slot.turno}
                      onChange={(e) => updateSlot(index, 'turno', e.target.value)}
                    >
                      <option value="manha" disabled={!turnoDisponivel(slot.data, 'manha')}>{t('manhaHorario')}</option>
                      <option value="tarde" disabled={!turnoDisponivel(slot.data, 'tarde')}>{t('tardeHorario')}</option>
                    </select>
                  </div>
                  {slot.data && (
                    <div className="text-xs text-gray-500 sm:w-28">
                      {t('entregaAprox', { data: (() => {
                        const d = new Date(slot.data + 'T12:00:00');
                        d.setDate(d.getDate() + prazoDias);
                        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                      })() })}
                    </div>
                  )}
                  {slots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSlot(index)}
                      aria-label="✕"
                      className="text-red-400 hover:text-red-600 p-2 -m-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addSlot}
              className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              {t('adicionarDataDisponivel')}
            </button>
          </div>
        )}

        {/* Observacoes */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('observacoes')}</h2>
          <div className="mt-4">
            <label htmlFor="cacb1-104" className="block text-sm font-medium text-gray-700 mb-1">
              {t('observacoesOpcional')}
            </label>
            <textarea id="cacb1-104"
              className="input-field min-h-[80px]"
              placeholder={t('placeholderObservacoes')}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()} className="btn-secondary">
            {t('cancelar')}
          </button>
          <button type="submit" className="btn-success" disabled={total === 0}>
            {isRevision ? t('atualizarOrcamento') : t('enviarOrcamento')} - {formatCurrency(total, moeda, locale)}
          </button>
        </div>
      </form>
    </div>
  );
}
