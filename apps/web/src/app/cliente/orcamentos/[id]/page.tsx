'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useOrcamentos } from '@/hooks/use-orcamentos';
import { useAvaliacoes } from '@/hooks/use-avaliacoes';
import StatusBadge from '@/components/ui/StatusBadge';
import StarRating from '@/components/ui/StarRating';
import { formatCurrency, formatDate, getUrgenciaColor } from '@/lib/utils';
import type { DisponibilidadeSlot } from '@fixauto/shared';

function formatExecTime(hours: number | null): string {
  if (!hours) return '-';
  if (hours < 8) return `${hours}h`;
  const days = Math.ceil(hours / 8);
  return `~${days} dia(s) útil(eis)`;
}

function formatSlotDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  return `${weekdays[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

export default function OrcamentoDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const { solicitacoes, updateStatus } = useSolicitacoes();
  const { accept, refuse } = useOrcamentos();
  const { avaliacoes, create: createAvaliacao, update: updateAvaliacao } = useAvaliacoes();
  const [cancelling, setCancelling] = useState(false);
  const solicitacao = solicitacoes.find((s) => s.id === params.id);
  const [schedulingOrcId, setSchedulingOrcId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<DisponibilidadeSlot | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [acceptedSlot, setAcceptedSlot] = useState<DisponibilidadeSlot | null>(null);
  const [acceptedOficinaNome, setAcceptedOficinaNome] = useState('');
  const [reviewNota, setReviewNota] = useState(0);
  const [reviewComentario, setReviewComentario] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [editingReview, setEditingReview] = useState(false);
  const [refusing, setRefusing] = useState<string | null>(null);

  const [refusedReviewOrcId, setRefusedReviewOrcId] = useState<string | null>(null);
  const [refusedReviewNota, setRefusedReviewNota] = useState(0);
  const [refusedReviewComentario, setRefusedReviewComentario] = useState('');
  const [refusedReviewSubmitting, setRefusedReviewSubmitting] = useState(false);
  const [refusedReviewError, setRefusedReviewError] = useState('');

  const handleRefuse = async (orcamentoId: string) => {
    const isEmAndamento = solicitacao?.status === 'em_andamento';
    const confirmMsg = isEmAndamento
      ? 'Tem certeza que deseja recusar este orçamento? O veículo precisa ser retirado da oficina antes de encerrar. A oficina será notificada para realizar o check-out.'
      : 'Tem certeza que deseja recusar este orçamento?';
    if (!confirm(confirmMsg)) return;
    setRefusing(orcamentoId);
    const { error } = await refuse(orcamentoId);
    if (!error) {
      // Notify oficina when vehicle is in workshop
      if (isEmAndamento) {
        const orc = solicitacao?.orcamentos?.find((o) => o.id === orcamentoId);
        if (orc?.oficina?.profile?.id) {
          try {
            const { supabase: sb } = await import('@/lib/supabase').then(m => ({ supabase: m.supabase }));
            await sb.from('notificacoes').insert({
              profile_id: orc.oficina.profile.id,
              tipo: 'orcamento_recusado',
              titulo: 'Orçamento recusado',
              mensagem: 'O cliente recusou o orçamento revisado. Por favor realize o check-out do veículo.',
              dados: { solicitacao_id: solicitacao!.id },
            });
          } catch { /* Non-blocking */ }
        }
        // Do NOT cancel the solicitation — keep em_andamento so oficina can check-out
        window.location.reload();
        return;
      }

      // Check if all quotes are now refused — offer to cancel the solicitation
      const otherPending = solicitacao?.orcamentos?.filter(
        (o) => o.id !== orcamentoId && o.status === 'enviado'
      );
      if (!otherPending || otherPending.length === 0) {
        if (confirm('Todos os orçamentos foram recusados. Deseja cancelar esta solicitação?')) {
          await updateStatus(solicitacao!.id, 'cancelada');
          router.push('/cliente/dashboard');
          return;
        }
      }
      // Refresh to show updated status
      window.location.reload();
    }
    setRefusing(null);
  };

  const handleRefusedReviewSubmit = async (orcamentoId: string) => {
    const orc = solicitacao?.orcamentos?.find((o) => o.id === orcamentoId);
    if (!orc || refusedReviewNota === 0) {
      setRefusedReviewError('Selecione uma nota de 1 a 5 estrelas');
      return;
    }
    setRefusedReviewSubmitting(true);
    setRefusedReviewError('');
    const result = await createAvaliacao({
      solicitacao_id: solicitacao!.id,
      oficina_id: orc.oficina_id,
      nota: refusedReviewNota,
      comentario: refusedReviewComentario.trim() || undefined,
    });
    if (result.error) {
      setRefusedReviewError(result.error.message);
    } else {
      setRefusedReviewOrcId(null);
      setRefusedReviewNota(0);
      setRefusedReviewComentario('');
    }
    setRefusedReviewSubmitting(false);
  };

  if (!solicitacao) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">Solicitação não encontrada</p>
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
          Seu veículo está agendado na <strong>{acceptedOficinaNome}</strong>.
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
              <span className="text-gray-500">Previsão de entrega:</span>
              <span className="text-gray-900 font-medium">
                {formatSlotDate(acceptedSlot.data_previsao_entrega)}
              </span>
            </div>
          </div>
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
            <p className="text-xs text-yellow-800">
              Leve seu veículo no horário marcado. A oficina entrará em contato caso haja alguma mudança.
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
        <div className="flex items-center gap-2">
          <Link
            href={`/cliente/mensagens/${solicitacao.id}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Mensagem para oficina
          </Link>
          {['aberta', 'em_orcamento'].includes(solicitacao.status) && (
            <button
              onClick={async () => {
                if (!confirm('Tem certeza que deseja cancelar esta solicitação? As oficinas não poderão mais enviar orçamentos.')) return;
                setCancelling(true);
                await updateStatus(solicitacao.id, 'cancelada');
                setCancelling(false);
                router.push('/cliente/dashboard');
              }}
              disabled={cancelling}
              className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-4 py-2 rounded-lg transition-colors"
            >
              {cancelling ? 'Cancelando...' : 'Cancelar solicitação'}
            </button>
          )}
        </div>
      </div>

      {/* Vehicle at workshop banner */}
      {solicitacao.status === 'em_andamento' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-blue-800">Veiculo na oficina</p>
            <p className="text-sm text-blue-600">Seu veiculo esta sendo atendido. Use o chat para acompanhar.</p>
          </div>
        </div>
      )}

      {/* Request details */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-2">Descrição</h2>
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
                <a key={foto.id} href={foto.foto_url} target="_blank" rel="noopener noreferrer" className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden block">
                  {foto.foto_url ? (
                    <img src={foto.foto_url} alt={foto.descricao || 'Foto'} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Completed service banner + review */}
      {solicitacao.status === 'concluida' && (() => {
        const acceptedOrc = solicitacao.orcamentos?.find((o) => o.status === 'aceito');
        const existingReview = avaliacoes.find((a) => a.solicitacao_id === solicitacao.id);

        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
        const canEdit = existingReview ? new Date(existingReview.created_at) > twoMonthsAgo : false;

        const handleReviewSubmit = async () => {
          if (!acceptedOrc || reviewNota === 0) {
            setReviewError('Selecione uma nota de 1 a 5 estrelas');
            return;
          }
          setReviewSubmitting(true);
          setReviewError('');

          let result: { data?: unknown; error?: { message: string } | null };

          if (editingReview && existingReview) {
            result = await updateAvaliacao(existingReview.id, {
              nota: reviewNota,
              comentario: reviewComentario.trim() || undefined,
              nota_anterior: existingReview.nota,
            });
          } else {
            result = await createAvaliacao({
              solicitacao_id: solicitacao.id,
              oficina_id: acceptedOrc.oficina_id,
              nota: reviewNota,
              comentario: reviewComentario.trim() || undefined,
            });
          }

          if (result.error) {
            setReviewError(result.error.message);
          } else {
            setEditingReview(false);
          }
          setReviewSubmitting(false);
        };

        const startEditing = () => {
          if (existingReview) {
            setReviewNota(existingReview.nota);
            setReviewComentario(existingReview.comentario || '');
            setEditingReview(true);
          }
        };

        return (
          <div className="mb-6">
            {/* Completed banner */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-green-800">Serviço concluído</p>
                <p className="text-sm text-green-700">
                  {acceptedOrc?.oficina?.nome_fantasia
                    ? `Realizado por ${acceptedOrc.oficina.nome_fantasia}`
                    : 'O reparo foi finalizado com sucesso'}
                </p>
              </div>
            </div>

            {/* Review section */}
            {existingReview && !editingReview ? (
              <div className="card bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <StarRating rating={existingReview.nota} size="md" />
                    {existingReview.nota_anterior !== null && existingReview.nota_anterior !== undefined && existingReview.nota_anterior !== existingReview.nota && (
                      <span className={`text-xs font-medium ${existingReview.nota > existingReview.nota_anterior ? 'text-green-600' : 'text-red-500'}`}>
                        {existingReview.nota > existingReview.nota_anterior ? '\u2191' : '\u2193'}
                      </span>
                    )}
                    <span className="font-semibold text-gray-800">Sua avaliação</span>
                  </div>
                  {canEdit && (
                    <button
                      onClick={startEditing}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Editar
                    </button>
                  )}
                </div>
                {existingReview.comentario && (
                  <p className="text-sm text-gray-600">{existingReview.comentario}</p>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  {formatDate(existingReview.created_at)}
                  {existingReview.updated_at && (
                    <span className="ml-2">(editada em {formatDate(existingReview.updated_at)})</span>
                  )}
                </p>
              </div>
            ) : (existingReview && editingReview) || (!existingReview && acceptedOrc) ? (
              <div className="card border-2 border-yellow-200 bg-yellow-50">
                <p className="font-semibold text-gray-800 mb-3">
                  {editingReview ? 'Editar avaliação' : 'Como foi o serviço?'}
                </p>
                {!editingReview && (
                  <p className="text-sm text-gray-600 mb-3">Avalie o trabalho realizado por {acceptedOrc?.oficina?.nome_fantasia || 'a oficina'}</p>
                )}
                <div className="mb-3">
                  <StarRating rating={reviewNota} size="lg" interactive onChange={setReviewNota} />
                </div>
                <textarea
                  value={reviewComentario}
                  onChange={(e) => setReviewComentario(e.target.value)}
                  placeholder="Deixe um comentário sobre o serviço (opcional)"
                  className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none bg-white"
                  rows={3}
                />
                {reviewError && <p className="text-sm text-red-600 mt-1">{reviewError}</p>}
                <div className="flex gap-2 mt-3">
                  {editingReview && (
                    <button
                      onClick={() => setEditingReview(false)}
                      className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2 border border-gray-300 rounded-lg"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    onClick={handleReviewSubmit}
                    disabled={reviewSubmitting || reviewNota === 0}
                    className="btn-primary !py-2 !px-6 text-sm disabled:opacity-50"
                  >
                    {reviewSubmitting ? 'Enviando...' : editingReview ? 'Salvar alterações' : 'Enviar avaliação'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })()}

      {/* Quotes */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Orçamentos recebidos ({solicitacao.orcamentos?.length || 0})
      </h2>

      {!solicitacao.orcamentos || solicitacao.orcamentos.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-500">Aguardando orçamentos das oficinas...</p>
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
                    <h3 className="font-semibold text-gray-900">
                      <Link href={`/oficinas/${orc.oficina?.id}`} className="hover:text-primary-600 hover:underline">
                        {orc.oficina?.nome_fantasia}
                      </Link>
                    </h3>
                    <div className="flex items-center gap-2">
                      <StarRating rating={orc.oficina?.avaliacao_media || 0} size="sm" />
                      <span className="text-xs text-gray-500">
                        {(orc.oficina?.avaliacao_media || 0).toFixed(1)} ({orc.oficina?.total_avaliacoes || 0} avaliações)
                      </span>
                    </div>
                    {/* Seals */}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {(orc.oficina?.avaliacao_media || 0) >= 4 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-400 text-yellow-900">
                          🏆 Qualidade
                        </span>
                      )}
                      {orc.valor_original && orc.revisao_numero && orc.revisao_numero > 0 && (
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          orc.valor_total < orc.valor_original
                            ? 'bg-green-100 text-green-800'
                            : orc.valor_total > orc.valor_original
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {orc.valor_total < orc.valor_original
                            ? `📉 ${Math.round(((orc.valor_original - orc.valor_total) / orc.valor_original) * 100)}% menor`
                            : orc.valor_total > orc.valor_original
                            ? `📈 ${Math.round(((orc.valor_total - orc.valor_original) / orc.valor_original) * 100)}% maior`
                            : 'Sem ajuste'}
                        </span>
                      )}
                      {orc.revisao_numero && orc.revisao_numero > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                          Revisão #{orc.revisao_numero}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(orc.valor_total)}</p>
                  <p className="text-sm text-gray-500">Prazo: {orc.prazo_dias} dias</p>
                  {orc.valor_original && orc.valor_original !== orc.valor_total && (
                    <p className="text-xs text-gray-400 line-through">{formatCurrency(orc.valor_original)}</p>
                  )}
                </div>
              </div>

              {/* Execution time + availability summary */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-xs text-blue-600">Tempo execução</p>
                  <p className="text-sm font-bold text-blue-900">{formatExecTime(orc.tempo_execucao_horas)}</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-xs text-green-600">Próximo check-in</p>
                  <p className="text-sm font-bold text-green-900">
                    {orc.disponibilidade.length > 0 ? formatSlotDate(orc.disponibilidade[0].data_checkin) : 'Sem vaga'}
                  </p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg text-center">
                  <p className="text-xs text-purple-600">Datas disponíveis</p>
                  <p className="text-sm font-bold text-purple-900">{orc.disponibilidade.length} opções</p>
                </div>
              </div>

              {/* Revision comparison */}
              {orc.valor_original && orc.revisao_numero && orc.revisao_numero > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 flex items-center gap-2 text-sm">
                  <span className="text-gray-600">Orcamento original:</span>
                  <span className="line-through text-gray-400">{formatCurrency(orc.valor_original)}</span>
                  <span className="text-gray-600">→ Revisado para:</span>
                  <span className={`font-bold ${
                    orc.valor_total < orc.valor_original
                      ? 'text-green-600'
                      : orc.valor_total > orc.valor_original
                      ? 'text-red-600'
                      : 'text-gray-900'
                  }`}>
                    {formatCurrency(orc.valor_total)}
                  </span>
                  <span className="text-gray-500">(revisao #{orc.revisao_numero})</span>
                </div>
              )}

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
                  <strong>Observações:</strong> {orc.observacoes}
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
                              Previsão de entrega: {formatSlotDate(slot.data_previsao_entrega)}
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
              ) : solicitacao.status === 'em_andamento' && orc.status === 'aceito' ? (
                <div className="border-t pt-4 mt-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="font-semibold text-blue-800">Veículo já na oficina</p>
                    </div>
                    <p className="text-sm text-blue-700">Seu veículo está sendo atendido. Acompanhe pelo chat.</p>
                  </div>
                </div>
              ) : orc.status === 'aceito' ? (
                <div className="pt-4 border-t">
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="font-semibold text-green-800">Orçamento aceito</p>
                    </div>
                    {orc.oficina && (
                      <div className="space-y-1 text-sm">
                        <p className="font-medium text-green-900">{orc.oficina.nome_fantasia}</p>
                        <p className="text-green-700">{orc.oficina.endereco}</p>
                        <p className="text-green-700">{orc.oficina.cidade} - {orc.oficina.estado}</p>
                        {orc.oficina.profile?.telefone && (
                          <p className="text-green-700">Tel: {orc.oficina.profile.telefone}</p>
                        )}
                      </div>
                    )}
                    {orc.disponibilidade && orc.disponibilidade.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-green-200 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-green-700">Check-in:</span>
                          <span className="font-medium text-green-900">
                            {formatSlotDate(orc.disponibilidade[0].data_checkin)} - {orc.disponibilidade[0].turno === 'manha' ? '08:00-12:00' : '13:00-17:00'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-green-700">Previsão entrega:</span>
                          <span className="font-medium text-green-900">{formatSlotDate(orc.disponibilidade[0].data_previsao_entrega)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : orc.status === 'recusado' ? (
                <div className="pt-4 border-t">
                  <div className="bg-red-50 rounded-lg p-4 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="font-semibold text-red-700">Orçamento recusado</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-red-600 line-through opacity-60">
                      <span>Valor: {formatCurrency(orc.valor_total)}</span>
                      <span>Prazo: {orc.prazo_dias} dias</span>
                    </div>
                  </div>

                  {/* Review form for refused quote */}
                  {(() => {
                    const existingReviewForOrc = avaliacoes.find(
                      (a) => a.solicitacao_id === solicitacao.id && a.oficina_id === orc.oficina_id
                    );
                    if (existingReviewForOrc) {
                      return (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <StarRating rating={existingReviewForOrc.nota} size="sm" />
                            <span className="text-sm font-medium text-gray-700">Sua avaliação</span>
                          </div>
                          {existingReviewForOrc.comentario && (
                            <p className="text-sm text-gray-600">{existingReviewForOrc.comentario}</p>
                          )}
                        </div>
                      );
                    }
                    if (refusedReviewOrcId === orc.id) {
                      return (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <p className="font-semibold text-gray-800 mb-2">Avaliar esta oficina</p>
                          <p className="text-sm text-gray-600 mb-3">Como foi sua experiência com {orc.oficina?.nome_fantasia || 'a oficina'}?</p>
                          <div className="mb-3">
                            <StarRating rating={refusedReviewNota} size="lg" interactive onChange={setRefusedReviewNota} />
                          </div>
                          <textarea
                            value={refusedReviewComentario}
                            onChange={(e) => setRefusedReviewComentario(e.target.value)}
                            placeholder="Deixe um comentário (opcional)"
                            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none bg-white"
                            rows={3}
                          />
                          {refusedReviewError && <p className="text-sm text-red-600 mt-1">{refusedReviewError}</p>}
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => { setRefusedReviewOrcId(null); setRefusedReviewNota(0); setRefusedReviewComentario(''); setRefusedReviewError(''); }}
                              className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2 border border-gray-300 rounded-lg"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handleRefusedReviewSubmit(orc.id)}
                              disabled={refusedReviewSubmitting || refusedReviewNota === 0}
                              className="btn-primary !py-2 !px-6 text-sm disabled:opacity-50"
                            >
                              {refusedReviewSubmitting ? 'Enviando...' : 'Enviar avaliação'}
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <button
                        onClick={() => { setRefusedReviewOrcId(orc.id); setRefusedReviewNota(0); setRefusedReviewComentario(''); setRefusedReviewError(''); }}
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                        Avaliar esta oficina
                      </button>
                    );
                  })()}
                </div>
              ) : (
                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-xs text-gray-500">
                    Válido até {formatDate(orc.validade)}
                    {orc.revisao_numero > 0 && (
                      <span className="ml-2 text-amber-600 font-medium">
                        (Revisão #{orc.revisao_numero})
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRefuse(orc.id)}
                      disabled={refusing === orc.id}
                      className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-4 py-2 rounded-lg transition-colors"
                    >
                      {refusing === orc.id ? 'Recusando...' : 'Recusar'}
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
