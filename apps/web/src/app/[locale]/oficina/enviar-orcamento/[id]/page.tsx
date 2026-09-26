'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useOrcamentos } from '@/hooks/use-orcamentos';
import { useAuth } from '@/lib/auth-context';
import type { TipoItemOrcamento, AnaliseDano } from '@fixauto/shared';
import { formatCurrency, cleanDescricao } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface ItemForm {
  descricao: string;
  tipo: TipoItemOrcamento;
  valor_unitario: number;
  quantidade: number;
}

export default function EnviarOrcamentoPage() {
  const params = useParams();
  const router = useRouter();
  const { solicitacoes } = useSolicitacoes();
  const { create: createOrcamento, update: updateOrcamento } = useOrcamentos();
  const { oficina } = useAuth();
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
  const [comissaoModo, setComissaoModo] = useState<'absorver' | 'repassar'>('absorver');
  const [comissaoInfo, setComissaoInfo] = useState<{ taxa: number; servicos90dias: number; origem: string } | null>(null);

  useEffect(() => {
    if (!oficina?.id) return;
    fetch(`/api/comissao-atual?oficinaId=${oficina.id}`)
      .then((res) => res.json())
      .then((data) => { if (data.taxa != null) setComissaoInfo(data); })
      .catch(() => {});
  }, [oficina?.id]);

  // Availability slots
  const [slots, setSlots] = useState<{ data: string; turno: 'manha' | 'tarde' }[]>([
    { data: new Date().toISOString().split('T')[0], turno: 'manha' },
  ]);

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
      const comissaoMatch = obsRaw.match(/^\[COMISSAO:(absorver|repassar):(\d+)\]/);
      if (comissaoMatch) {
        setComissaoModo(comissaoMatch[1] as 'absorver' | 'repassar');
        setObservacoes(obsRaw.replace(/^\[COMISSAO:[^\]]+\]\n?/, ''));
      } else {
        setObservacoes(obsRaw);
      }
      setValidade(existingQuote.validade || (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })());
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
    setSlots(slots.map((s, i) => i === index ? { ...s, [field]: value } : s));
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
  const COMISSAO_PERCENTUAL = comissaoInfo ? comissaoInfo.taxa * 100 : 10;
  const comissaoValor = total * (COMISSAO_PERCENTUAL / 100);
  const totalCliente = comissaoModo === 'repassar' ? total + comissaoValor : total;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
    const valorFinal = comissaoModo === 'repassar' ? totalCliente : total;

    let result: { data?: any; error?: any };

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
        <p className="text-gray-500">Solicitação não encontrada</p>
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
          {isRevision ? 'Orçamento revisado!' : 'Orçamento enviado!'}
        </h1>
        <p className="text-gray-600">
          {isRevision
            ? 'O cliente foi notificado sobre a revisão do orçamento.'
            : 'O cliente foi notificado e pode aceitar seu orçamento.'}
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
        Voltar
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {isRevision ? 'Revisar Orçamento' : 'Enviar Orçamento'}
      </h1>
      {isRevision && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2">
          <p className="text-sm text-amber-800">
            Você já enviou um orçamento para esta solicitação. Ao submeter, o orçamento anterior será atualizado (revisão #{((existingQuote?.revisao_numero) || 0) + 1}).
          </p>
        </div>
      )}
      <p className="text-gray-600 mb-6">
        {solicitacao.veiculo?.fipe_marca} {solicitacao.veiculo?.fipe_modelo} - {solicitacao.tipo}
      </p>

      {/* Request summary */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <p className="text-sm text-gray-600">{cleanDescricao(solicitacao.descricao)}</p>
        <p className="text-xs text-gray-500 mt-2">
          Cliente: {solicitacao.cliente?.nome} | {solicitacao.endereco}
        </p>
      </div>

      {/* AI Insights */}
      {analise && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🤖</span>
            <h3 className="font-semibold text-indigo-900 text-sm">Análise IA</h3>
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
              Estimativa IA: {formatCurrency(analise.estimativa_custo.min)} - {formatCurrency(analise.estimativa_custo.max)}
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Itens do orçamento</h2>

          <div className="space-y-4">
            {itens.map((item, index) => (
              <div key={index} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">Item {index + 1}</span>
                  {itens.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Remover
                    </button>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Descrição do item"
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
                      <option value="mao_de_obra">Mão de obra</option>
                      <option value="peca">Peça</option>
                      <option value="material">Material</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <input
                        type="number"
                        className="input-field"
                        placeholder="Valor (R$)"
                        value={item.valor_unitario || ''}
                        onChange={(e) => updateItem(index, 'valor_unitario', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="w-20">
                      <input
                        type="number"
                        className="input-field"
                        placeholder="Qtd"
                        min={1}
                        value={item.quantidade}
                        onChange={(e) => updateItem(index, 'quantidade', parseInt(e.target.value) || 1)}
                      />
                    </div>
                  </div>
                </div>
                {item.valor_unitario > 0 && (
                  <p className="text-sm text-gray-500 mt-2 text-right">
                    Subtotal: {formatCurrency(item.valor_unitario * item.quantidade)}
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
            + Adicionar item
          </button>

          {/* Total */}
          <div className="flex justify-between items-center mt-6 pt-4 border-t">
            <span className="text-lg font-semibold text-gray-900">Total</span>
            <span className="text-2xl font-bold text-gray-900">{formatCurrency(total)}</span>
          </div>

          {/* Commission section */}
          {total > 0 && (
            <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium text-blue-800">Comissão BipFix</span>
                </div>
                <p className="text-sm text-blue-700">
                  Comissão da plataforma: <strong>{COMISSAO_PERCENTUAL}%</strong> = <strong>{formatCurrency(comissaoValor)}</strong>
                </p>
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-gray-50"
                  style={{ borderColor: comissaoModo === 'absorver' ? '#3b82f6' : '#e5e7eb', backgroundColor: comissaoModo === 'absorver' ? '#eff6ff' : 'white' }}>
                  <input
                    type="radio"
                    name="comissao"
                    value="absorver"
                    checked={comissaoModo === 'absorver'}
                    onChange={() => setComissaoModo('absorver')}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Absorver comissão</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Você paga a comissão. O cliente vê {formatCurrency(total)}.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-gray-50"
                  style={{ borderColor: comissaoModo === 'repassar' ? '#3b82f6' : '#e5e7eb', backgroundColor: comissaoModo === 'repassar' ? '#eff6ff' : 'white' }}>
                  <input
                    type="radio"
                    name="comissao"
                    value="repassar"
                    checked={comissaoModo === 'repassar'}
                    onChange={() => setComissaoModo('repassar')}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Repassar ao cliente</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      A comissão de {formatCurrency(comissaoValor)} é adicionada. O cliente vê {formatCurrency(total + comissaoValor)}.
                    </p>
                  </div>
                </label>
              </div>

              {comissaoModo === 'repassar' && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm text-amber-800">
                    Preço final para o cliente: <strong>{formatCurrency(totalCliente)}</strong>
                    <span className="text-xs text-amber-600 ml-1">
                      ({formatCurrency(total)} + {formatCurrency(comissaoValor)} comissão)
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Prazo & Execucao */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Prazo e Execução</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prazo total (dias)
              </label>
              <input
                type="number"
                className="input-field"
                min={1}
                value={prazoDias}
                onChange={(e) => setPrazoDias(parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tempo de execução (horas)
              </label>
              <input
                type="number"
                className="input-field"
                min={1}
                value={tempoExecucaoHoras}
                onChange={(e) => setTempoExecucaoHoras(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-gray-500 mt-1">
                ~{Math.ceil(tempoExecucaoHoras / 8)} dia(s) útil(eis)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Validade do orçamento
              </label>
              <input
                type="date"
                className="input-field"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Disponibilidade */}
        {solicitacao.status === 'em_andamento' ? (
          <div className="card mb-6">
            <div className="bg-blue-50 rounded-lg p-4 flex items-center gap-3">
              <span className="text-2xl">🔧</span>
              <div>
                <p className="font-semibold text-blue-800">Veículo já na oficina</p>
                <p className="text-sm text-blue-600">O check-in já foi realizado. O novo orçamento será aplicado ao serviço em andamento.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="card mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Disponibilidade para check-in</h2>
            <p className="text-sm text-gray-500 mb-4">
              Ofereça datas para o cliente deixar o veículo. O cliente escolherá uma delas.
            </p>

            <div className="space-y-3">
              {slots.map((slot, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="flex-1">
                    <input
                      type="date"
                      className="input-field"
                      value={slot.data}
                      onChange={(e) => updateSlot(index, 'data', e.target.value)}
                    />
                  </div>
                  <div className="w-36">
                    <select
                      className="input-field"
                      value={slot.turno}
                      onChange={(e) => updateSlot(index, 'turno', e.target.value)}
                    >
                      <option value="manha">Manhã (8-12h)</option>
                      <option value="tarde">Tarde (13-17h)</option>
                    </select>
                  </div>
                  {slot.data && (
                    <div className="text-xs text-gray-500 w-28">
                      Entrega: ~{(() => {
                        const d = new Date(slot.data + 'T12:00:00');
                        d.setDate(d.getDate() + prazoDias);
                        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                      })()}
                    </div>
                  )}
                  {slots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSlot(index)}
                      className="text-red-400 hover:text-red-600"
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
              + Adicionar data disponível
            </button>
          </div>
        )}

        {/* Observacoes */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Observações</h2>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observações (opcional)
            </label>
            <textarea
              className="input-field min-h-[80px]"
              placeholder="Garantia, condições, informações adicionais..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()} className="btn-secondary">
            Cancelar
          </button>
          <button type="submit" className="btn-success" disabled={total === 0}>
            {isRevision ? 'Atualizar Orçamento' : 'Enviar Orçamento'} - {formatCurrency(comissaoModo === 'repassar' ? totalCliente : total)}
          </button>
        </div>
      </form>
    </div>
  );
}
