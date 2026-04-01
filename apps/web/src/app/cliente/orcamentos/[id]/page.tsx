'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useOrcamentos } from '@/hooks/use-orcamentos';
import StatusBadge from '@/components/ui/StatusBadge';
import StarRating from '@/components/ui/StarRating';
import { formatCurrency, formatDate, getUrgenciaColor } from '@/lib/utils';
import type { DisponibilidadeSlot } from '@fixauto/shared';

function formatExecTime(hours: number | null): string {
  if (!hours) return '-';
  if (hours < 8) return `${hours}h`;
  const days = Math.ceil(hours / 8);
  return `~${days} dia(s) util(eis)`;
}

function formatSlotDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  return `${weekdays[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

export default function OrcamentoDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const { solicitacoes } = useSolicitacoes();
  const { accept } = useOrcamentos();
  const solicitacao = solicitacoes.find((s) => s.id === params.id);
  const [schedulingOrcId, setSchedulingOrcId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<DisponibilidadeSlot | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [acceptedSlot, setAcceptedSlot] = useState<DisponibilidadeSlot | null>(null);
  const [acceptedOficinaNome, setAcceptedOficinaNome] = useState('');

  if (!solicitacao) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">Solicitacao nao encontrada</p>
      </div>
    );
  }

  const handleStartScheduling = (orcamentoId: string) => {
    setSchedulingOrcId(orcamentoId);
    setSelectedSlot(null);
  };

  const handleConfirmAppointment = async () => {
    if (!selectedSlot || !schedulingOrcId) return;
    const orc = solicitacao.orcamentos?.find((o) => o.id === schedulingOrcId);
    const { error } = await accept(schedulingOrcId, selectedSlot.id);
    if (!error) {
      setAcceptedOficinaNome(orc?.oficina?.nome_fantasia || '');
      setAcceptedSlot(selectedSlot);
      setAccepted(true);
    }
  };

  if (accepted && acceptedSlot) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Agendamento confirmado!</h1>
        <p className="text-gray-600 mb-6">
          Seu veiculo esta agendado na <strong>{acceptedOficinaNome}</strong>.
        </p>

        <div className="card text-left max-w-md mx-auto mb-8">
          <h3 className="font-semibold text-gray-900 mb-3">Detalhes do agendamento</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Check-in:</span>
              <span className="text-gray-900 font-medium">
                {formatSlotDate(acceptedSlot.data_checkin)} - {acceptedSlot.turno === 'manha' ? '08:00 - 12:00' : '13:00 - 17:00'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Previsao de entrega:</span>
              <span className="text-gray-900 font-medium">
                {formatSlotDate(acceptedSlot.data_previsao_entrega)}
              </span>
            </div>
          </div>
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
            <p className="text-xs text-yellow-800">
              Leve seu veiculo no horario marcado. A oficina entrara em contato caso haja alguma mudanca.
            </p>
          </div>
        </div>

        <button onClick={() => router.push('/cliente/dashboard')} className="btn-primary">
          Voltar ao Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Voltar
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {solicitacao.veiculo?.fipe_marca} {solicitacao.veiculo?.fipe_modelo}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={solicitacao.status} />
            <span className={`badge ${getUrgenciaColor(solicitacao.urgencia)}`}>
              {solicitacao.urgencia}
            </span>
          </div>
        </div>
      </div>

      {/* Request details */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-2">Descricao</h2>
        <p className="text-gray-600 text-sm">{solicitacao.descricao}</p>
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <span>{solicitacao.endereco}</span>
          <span>{formatDate(solicitacao.created_at)}</span>
        </div>

        {solicitacao.fotos && solicitacao.fotos.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Fotos ({solicitacao.fotos.length})</p>
            <div className="flex gap-2">
              {solicitacao.fotos.map((foto) => (
                <div key={foto.id} className="w-20 h-20 bg-gray-200 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quotes */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Orcamentos recebidos ({solicitacao.orcamentos?.length || 0})
      </h2>

      {!solicitacao.orcamentos || solicitacao.orcamentos.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-500">Aguardando orcamentos das oficinas...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {solicitacao.orcamentos.map((orc) => (
            <div
              key={orc.id}
              className={`card border-2 transition-all ${
                schedulingOrcId === orc.id ? 'border-green-500 ring-1 ring-green-200' : 'border-transparent'
              }`}
            >
              {/* Workshop header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-primary-700 font-bold">
                      {orc.oficina?.nome_fantasia?.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{orc.oficina?.nome_fantasia}</h3>
                    <div className="flex items-center gap-2">
                      <StarRating rating={orc.oficina?.avaliacao_media || 0} size="sm" />
                      <span className="text-xs text-gray-500">
                        ({orc.oficina?.total_avaliacoes} avaliacoes)
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(orc.valor_total)}</p>
                  <p className="text-sm text-gray-500">Prazo: {orc.prazo_dias} dias</p>
                </div>
              </div>

              {/* Execution time + availability summary */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-xs text-blue-600">Tempo execucao</p>
                  <p className="text-sm font-bold text-blue-900">{formatExecTime(orc.tempo_execucao_horas)}</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-xs text-green-600">Proximo check-in</p>
                  <p className="text-sm font-bold text-green-900">
                    {orc.disponibilidade.length > 0 ? formatSlotDate(orc.disponibilidade[0].data_checkin) : 'Sem vaga'}
                  </p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg text-center">
                  <p className="text-xs text-purple-600">Datas disponiveis</p>
                  <p className="text-sm font-bold text-purple-900">{orc.disponibilidade.length} opcoes</p>
                </div>
              </div>

              {/* Items breakdown */}
              {orc.itens && orc.itens.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Detalhamento</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs">
                        <th className="text-left pb-2">Item</th>
                        <th className="text-left pb-2">Tipo</th>
                        <th className="text-right pb-2">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {orc.itens.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 text-gray-900">{item.descricao}</td>
                          <td className="py-2 text-gray-500 capitalize">{item.tipo.replace('_', ' ')}</td>
                          <td className="py-2 text-right text-gray-900">{formatCurrency(item.valor_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold border-t-2">
                        <td className="pt-2">Total</td>
                        <td></td>
                        <td className="pt-2 text-right">{formatCurrency(orc.valor_total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {orc.observacoes && (
                <p className="text-sm text-gray-600 mb-4">
                  <strong>Observacoes:</strong> {orc.observacoes}
                </p>
              )}

              {/* Scheduling section - shown when user clicks "Agendar" */}
              {schedulingOrcId === orc.id ? (
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-semibold text-gray-900 mb-3">
                    Escolha a data de check-in
                  </h4>
                  <div className="space-y-2">
                    {orc.disponibilidade.map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                          selectedSlot?.id === slot.id
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">
                              {formatSlotDate(slot.data_checkin)}
                              <span className="ml-2 text-sm font-normal text-gray-500">
                                {slot.turno === 'manha' ? '08:00 - 12:00' : '13:00 - 17:00'}
                              </span>
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              Previsao de entrega: {formatSlotDate(slot.data_previsao_entrega)}
                            </p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            selectedSlot?.id === slot.id
                              ? 'border-green-500 bg-green-500'
                              : 'border-gray-300'
                          }`}>
                            {selectedSlot?.id === slot.id && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => { setSchedulingOrcId(null); setSelectedSlot(null); }}
                      className="btn-secondary flex-1"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleConfirmAppointment}
                      disabled={!selectedSlot}
                      className="btn-success flex-1"
                    >
                      Confirmar Agendamento
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-xs text-gray-500">
                    Valido ate {formatDate(orc.validade)}
                  </p>
                  <div className="flex gap-2">
                    <button className="btn-secondary !py-2 !px-4 text-sm">
                      Perguntar
                    </button>
                    <button
                      onClick={() => handleStartScheduling(orc.id)}
                      className="btn-success !py-2 !px-4 text-sm flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Aceitar e Agendar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
