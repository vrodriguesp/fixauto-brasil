'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useOrcamentos } from '@/hooks/use-orcamentos';
import { useAuth } from '@/lib/auth-context';
import type { TipoItemOrcamento } from '@fixauto/shared';
import { formatCurrency } from '@/lib/utils';

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
  const [validade, setValidade] = useState('2026-04-30');
  const [submitted, setSubmitted] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Availability slots
  const [slots, setSlots] = useState<{ data: string; turno: 'manha' | 'tarde' }[]>([
    { data: '2026-04-07', turno: 'manha' },
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
      setObservacoes(existingQuote.observacoes || '');
      setValidade(existingQuote.validade || '2026-04-30');
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

    let result: { data?: any; error?: any };

    if (isRevision && existingQuote) {
      // Update existing quote (revision)
      result = await updateOrcamento(existingQuote.id, {
        solicitacao_id: params.id as string,
        valor_total: total,
        prazo_dias: prazoDias,
        tempo_execucao_horas: tempoExecucaoHoras,
        observacoes,
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
        valor_total: total,
        prazo_dias: prazoDias,
        tempo_execucao_horas: tempoExecucaoHoras,
        observacoes,
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
        <p className="text-sm text-gray-600">{solicitacao.descricao}</p>
        <p className="text-xs text-gray-500 mt-2">
          Cliente: {solicitacao.cliente?.nome} | {solicitacao.endereco}
        </p>
      </div>

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
        {solicitacao.status === 'em_andamento' || solicitacao.status === 'aceita' ? (
          <div className="card mb-6">
            <div className="bg-blue-50 rounded-lg p-4 flex items-center gap-3">
              <span className="text-2xl">🔧</span>
              <div>
                <p className="font-semibold text-blue-800">Veiculo ja na oficina</p>
                <p className="text-sm text-blue-600">O check-in ja foi realizado. O novo orcamento sera aplicado ao servico em andamento.</p>
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
              + Adicionar data disponivel
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
            {isRevision ? 'Atualizar Orçamento' : 'Enviar Orçamento'} - {formatCurrency(total)}
          </button>
        </div>
      </form>
    </div>
  );
}
