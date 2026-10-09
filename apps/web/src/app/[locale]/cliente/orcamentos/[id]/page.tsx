'use client';

import { useState } from 'react';
import RevisaoPendente from '@/components/cliente/RevisaoPendente';
import { textoErroApi } from '@/lib/erro-api';
import { useParams } from 'next/navigation';
import { useRouter, Link, rota } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useOrcamentos } from '@/hooks/use-orcamentos';
import { useAvaliacoes } from '@/hooks/use-avaliacoes';
import StatusBadge from '@/components/ui/StatusBadge';
import StarRating from '@/components/ui/StarRating';
import { formatCurrency, formatDate, getUrgenciaColor, cleanDescricao } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import type { DisponibilidadeSlot } from '@fixauto/shared';
import { notifOrcamentoRecusado } from '@/lib/notif-i18n';
import MidiaPrivada from '@/components/midia/MidiaPrivada';
import { turnoDisponivel, type Turno } from '@/lib/turnos';
import EditarPedido from '@/components/cliente/EditarPedido';
import { ehConvencionada } from '@/lib/seguradoras';

function formatExecTime(hours: number | null, t: (key: string, values?: Record<string, string | number | Date>) => string): string {
  if (!hours) return '-';
  if (hours < 8) return `${hours}h`;
  const days = Math.ceil(hours / 8);
  return t('execDaysApprox', { days });
}

function formatSlotDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' });
}

// escolhido primeiro, recusados/vencidos por ultimo
const ORDEM_ORC: Record<string, number> = { aceito: 0, expirado: 2, recusado: 3 };
const ordemOrc = (status: string) => ORDEM_ORC[status] ?? 1;

// horario que o cliente escolheu no aceite (antes mostrava sempre o primeiro oferecido)
const slotEscolhido = (orc: any) => orc.disponibilidade.find((d: any) => d.id === orc.disponibilidade_escolhida_id) ?? orc.disponibilidade[0];

export default function OrcamentoDetalhePage() {
  const t = useTranslations('clienteOrcamentoDetalhe');
  const te = useTranslations('editarPedido');
  const tg = useTranslations('garantia');
  const tc = useTranslations('constants');
  const tErr = useTranslations('erros');
  const locale = useLocale();
  const params = useParams();
  const router = useRouter();
  const { solicitacoes, loading: carregandoPedidos, updateStatus, refresh } = useSolicitacoes();
  // aceite: trava de duplo clique e erro visivel (auditoria M14)
  const [confirmando, setConfirmando] = useState(false);
  const [erroAceite, setErroAceite] = useState('');
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


  const handleRefuse = async (orcamentoId: string) => {
    const isEmAndamento = solicitacao?.status === 'em_andamento';
    const confirmMsg = isEmAndamento
      ? t('confirmRefuseInProgress')
      : t('confirmRefuse');
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
            const n = notifOrcamentoRecusado((orc.oficina.profile as any)?.idioma);
            await sb.from('notificacoes').insert({
              profile_id: orc.oficina.profile.id,
              tipo: 'orcamento_recusado',
              titulo: n.titulo,
              mensagem: n.mensagem,
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
        if (confirm(t('confirmCancelAllRefused'))) {
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

  if (!solicitacao) {
    // enquanto carrega, spinner (antes "pedido nao encontrado" piscava - M4)
    if (carregandoPedidos) {
      return <div className="max-w-4xl mx-auto px-4 py-20 flex justify-center"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>;
    }
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">{t('requestNotFound')}</p>
      </div>
    );
  }

  const handleStartScheduling = (orcamentoId: string) => {
    setSchedulingOrcId(orcamentoId);
    setSelectedSlot(null);
  };

  const handleConfirmAppointment = async () => {
    if (!selectedSlot || !schedulingOrcId || confirmando) return;
    const orc = solicitacao.orcamentos?.find((o) => o.id === schedulingOrcId);
    setConfirmando(true);
    setErroAceite('');
    const { error } = await accept(schedulingOrcId, selectedSlot.id);
    setConfirmando(false);
    if (error) {
      setErroAceite(textoErroApi(tErr, (error as any).status || 500, { codigo: (error as any).codigo }));
      return;
    }
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('appointmentConfirmedTitle')}</h1>
        <p className="text-gray-600 mb-6">
          {t('vehicleScheduledAt')} <strong>{acceptedOficinaNome}</strong>.
        </p>

        <div className="card text-left max-w-md mx-auto mb-8">
          <h3 className="font-semibold text-gray-900 mb-3">{t('appointmentDetailsTitle')}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('checkin')}</span>
              <span className="text-gray-900 font-medium">
                {formatSlotDate(acceptedSlot.data_checkin, locale)} - {acceptedSlot.turno === 'manha' ? '08:00 - 12:00' : '13:00 - 17:00'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('deliveryForecast')}</span>
              <span className="text-gray-900 font-medium">
                {formatSlotDate(acceptedSlot.data_previsao_entrega, locale)}
              </span>
            </div>
          </div>
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
            <p className="text-xs text-yellow-800">
              {t('bringVehicleNote')}
            </p>
          </div>
        </div>

        <button onClick={() => router.push('/cliente/dashboard')} className="btn-primary">
          {t('backToDashboard')}
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
        {t('back')}
      </button>

      {/* celular: titulo e botoes empilhados */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 break-words">
            {solicitacao.veiculo?.fipe_marca
              ? `${solicitacao.veiculo.fipe_marca} ${solicitacao.veiculo.fipe_modelo}`
              : /\[TIPO:\w+\]/.test(solicitacao.descricao || '') ? te('acidente') : ''}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <StatusBadge status={solicitacao.status} />
            <span className={`badge ${getUrgenciaColor(solicitacao.urgencia)}`}>
              {tc.has(`urgencias.${solicitacao.urgencia}`) ? tc(`urgencias.${solicitacao.urgencia}`) : solicitacao.urgencia}
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
            {t('messageToWorkshop')}
          </Link>
          {['aberta', 'em_orcamento'].includes(solicitacao.status) && (
            <button
              onClick={async () => {
                if (!confirm(t('confirmCancelRequest'))) return;
                setCancelling(true);
                await updateStatus(solicitacao.id, 'cancelada');
                setCancelling(false);
                router.push('/cliente/dashboard');
              }}
              disabled={cancelling}
              className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-4 py-2 rounded-lg transition-colors"
            >
              {cancelling ? t('cancelling') : t('cancelRequest')}
            </button>
          )}
        </div>
      </div>

      {['aberta', 'em_orcamento'].includes(solicitacao.status) && (
        <EditarPedido key={`${solicitacao.id}-${solicitacao.veiculo?.fipe_marca || ''}`} solicitacaoId={solicitacao.id}
          descricao={solicitacao.descricao} veiculo={(solicitacao.veiculo as any) || null} aoSalvar={refresh} />
      )}

      {/* Vehicle at workshop banner */}
      {solicitacao.status === 'em_andamento' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-blue-800">{t('vehicleAtWorkshop')}</p>
            <p className="text-sm text-blue-600">{t('vehicleBeingServiced')}</p>
          </div>
        </div>
      )}

      {/* Request details */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-2">{t('descriptionTitle')}</h2>
        <p className="text-gray-600 text-sm">{cleanDescricao(solicitacao.descricao)}</p>
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <span>{solicitacao.endereco}</span>
          <span>{formatDate(solicitacao.created_at, locale)}</span>
        </div>

        {solicitacao.fotos && solicitacao.fotos.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">{t('photosCount', { count: solicitacao.fotos.length })}</p>
            <div className="flex gap-2">
              {solicitacao.fotos.map((foto) => (
                <MidiaPrivada key={foto.id} url={foto.foto_url}>{(u) => (
<a href={u} target="_blank" rel="noopener noreferrer" className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden block">
                  {foto.foto_url ? (
                    <img src={u} alt={foto.descricao || t('photoFallback')} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </a>
)}</MidiaPrivada>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* revisao proposta pela oficina depois do aceite: o cliente decide */}
      <RevisaoPendente solicitacaoId={solicitacao.id} aoDecidir={() => refresh()} />

      {/* Completed service banner + review */}
      {solicitacao.status === 'concluida' && (() => {
        const acceptedOrc = solicitacao.orcamentos?.find((o) => o.status === 'aceito');
        const existingReview = avaliacoes.find((a) => a.solicitacao_id === solicitacao.id);

        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
        const canEdit = existingReview ? new Date(existingReview.created_at) > twoMonthsAgo : false;

        const handleReviewSubmit = async () => {
          if (!acceptedOrc || reviewNota === 0) {
            setReviewError(t('selectRatingError'));
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
            console.error(result.error); setReviewError(tErr((result.error as { code?: string }).code === 'weak_password' ? 'SENHA_CURTA' : 'GENERICO'));
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
          <div className="mb-6 scroll-mt-24" id="avaliar">
            {/* Completed banner */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-green-800">{t('serviceCompleted')}</p>
                <p className="text-sm text-green-700">
                  {acceptedOrc?.oficina?.nome_fantasia
                    ? t('performedBy', { name: acceptedOrc.oficina.nome_fantasia })
                    : t('repairFinishedSuccess')}
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
                    <span className="font-semibold text-gray-800">{t('yourReview')}</span>
                  </div>
                  {canEdit && (
                    <button
                      onClick={startEditing}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      {t('editLink')}
                    </button>
                  )}
                </div>
                {existingReview.comentario && (
                  <p className="text-sm text-gray-600">{existingReview.comentario}</p>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  {formatDate(existingReview.created_at, locale)}
                  {existingReview.updated_at && (
                    <span className="ml-2">{t('editedOn', { date: formatDate(existingReview.updated_at, locale) })}</span>
                  )}
                </p>
              </div>
            ) : (existingReview && editingReview) || (!existingReview && acceptedOrc) ? (
              <div className="card border-2 border-yellow-200 bg-yellow-50">
                <p className="font-semibold text-gray-800 mb-3">
                  {editingReview ? t('editReviewTitle') : t('howWasService')}
                </p>
                {!editingReview && (
                  <p className="text-sm text-gray-600 mb-3">{t('rateWorkPerformedBy', { name: acceptedOrc?.oficina?.nome_fantasia || t('theWorkshop') })}</p>
                )}
                <div className="mb-3">
                  <StarRating rating={reviewNota} size="lg" interactive onChange={setReviewNota} />
                </div>
                <textarea
                  value={reviewComentario}
                  onChange={(e) => setReviewComentario(e.target.value)}
                  placeholder={t('commentPlaceholder')}
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
                      {t('cancel')}
                    </button>
                  )}
                  <button
                    onClick={handleReviewSubmit}
                    disabled={reviewSubmitting || reviewNota === 0}
                    className="btn-primary !py-2 !px-6 text-sm disabled:opacity-50"
                  >
                    {reviewSubmitting ? t('sending') : editingReview ? t('saveChanges') : t('sendReview')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })()}

      {/* Quotes */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {t('quotesReceivedTitle', { count: solicitacao.orcamentos?.length || 0 })}
      </h2>

      {!solicitacao.orcamentos || solicitacao.orcamentos.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-500">{t('awaitingQuotes')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* escolhido primeiro, recusados por ultimo */}
          {[...solicitacao.orcamentos].sort((a, b) => ordemOrc(a.status) - ordemOrc(b.status)).map((orc) => (
            <div
              key={orc.id}
              className={`card border-2 transition-all ${
                orc.status === 'aceito' ? 'border-emerald-500 bg-emerald-50/40' :
                orc.status === 'recusado' || orc.status === 'expirado' ? 'border-transparent opacity-60' :
                schedulingOrcId === orc.id ? 'border-green-500 ring-1 ring-green-200' : 'border-transparent'
              }`}
            >
              {orc.status === 'aceito' && (
                <span className="inline-flex items-center gap-1 px-3 py-1 mb-3 rounded-full text-xs font-semibold bg-emerald-600 text-white">✓ {t('escolhido')}</span>
              )}
              {/* Workshop header (cabe em 390 px com nome longo - auditoria B6) */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-primary-700 font-bold">
                      {orc.oficina?.nome_fantasia?.charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 break-words">
                      <Link href={rota('/oficinas/[id]', { id: orc.oficina?.id })} className="hover:text-primary-600 hover:underline">
                        {orc.oficina?.nome_fantasia}
                      </Link>
                    </h3>
                    {ehConvencionada((orc.oficina as any)?.seguradoras_convencionadas, (solicitacao as any).seguradora) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 mt-1">
                        🛡️ {t('convencionadaComSeguradora', { seguradora: (solicitacao as any).seguradora })}
                      </span>
                    )}
                    {(orc as any).garantia_dias != null && (
                      <p className="text-xs text-gray-600 mt-1">🛡️ {(orc as any).garantia_dias > 0 ? tg('noOrcamento', { dias: (orc as any).garantia_dias }) : tg('sem')}</p>
                    )}
                    {orc.oficina?.id && (
                      <Link href={rota('/oficinas/[id]', { id: orc.oficina.id })} className="block text-xs font-medium text-primary-700 hover:underline py-1">
                        {t('verOficina')} ›
                      </Link>
                    )}
                    {orc.oficina?.id && (
                      <Link href={`/cliente/mensagens/${solicitacao.id}?oficina=${orc.oficina.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline py-1">
                        {t('messageToWorkshop')}
                      </Link>
                    )}
                    <div className="flex items-center gap-2">
                      <StarRating rating={orc.oficina?.avaliacao_media || 0} size="sm" />
                      <span className="text-xs text-gray-500">
                        {(orc.oficina?.avaliacao_media || 0).toFixed(1)} ({t('reviewsCount', { count: orc.oficina?.total_avaliacoes || 0 })})
                      </span>
                    </div>
                    {/* Seals */}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {(orc.oficina?.avaliacao_media || 0) >= 4 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-400 text-yellow-900">
                          🏆 {t('qualitySeal')}
                        </span>
                      )}
                      {!!orc.valor_original && (orc.revisao_numero ?? 0) > 0 && (
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          orc.valor_total < orc.valor_original
                            ? 'bg-green-100 text-green-800'
                            : orc.valor_total > orc.valor_original
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {orc.valor_total < orc.valor_original
                            ? `📉 ${t('percentLower', { percent: Math.round(((orc.valor_original - orc.valor_total) / orc.valor_original) * 100) })}`
                            : orc.valor_total > orc.valor_original
                            ? `📈 ${t('percentHigher', { percent: Math.round(((orc.valor_total - orc.valor_original) / orc.valor_original) * 100) })}`
                            : t('noAdjustment')}
                        </span>
                      )}
                      {(orc.revisao_numero ?? 0) > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                          {t('revisionNumber', { n: orc.revisao_numero })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 whitespace-nowrap">{formatCurrency(orc.valor_total, currencyForCountry(orc.oficina?.pais), locale)}</p>
                  <p className="text-sm text-gray-500">{t('deadlineDays', { days: orc.prazo_dias })}</p>
                  {orc.valor_original && orc.valor_original !== orc.valor_total && (
                    <p className="text-xs text-gray-400 line-through">{formatCurrency(orc.valor_original, currencyForCountry(orc.oficina?.pais), locale)}</p>
                  )}
                </div>
              </div>

              {/* Execution time + availability summary */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-xs text-blue-600">{t('execTimeLabel')}</p>
                  <p className="text-sm font-bold text-blue-900">{formatExecTime(orc.tempo_execucao_horas, t)}</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-xs text-green-600">{t('nextCheckinLabel')}</p>
                  <p className="text-sm font-bold text-green-900">
                    {orc.disponibilidade.length > 0 ? formatSlotDate(orc.disponibilidade[0].data_checkin, locale) : t('noSlotAvailable')}
                  </p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg text-center">
                  <p className="text-xs text-purple-600">{t('availableDatesLabel')}</p>
                  <p className="text-sm font-bold text-purple-900">{t('optionsCount', { count: orc.disponibilidade.length })}</p>
                </div>
              </div>

              {/* Revision comparison */}
              {!!orc.valor_original && (orc.revisao_numero ?? 0) > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 flex items-center gap-2 text-sm">
                  <span className="text-gray-600">{t('originalQuoteLabel')}</span>
                  <span className="line-through text-gray-400">{formatCurrency(orc.valor_original, currencyForCountry(orc.oficina?.pais), locale)}</span>
                  <span className="text-gray-600">{t('revisedToLabel')}</span>
                  <span className={`font-bold ${
                    orc.valor_total < orc.valor_original
                      ? 'text-green-600'
                      : orc.valor_total > orc.valor_original
                      ? 'text-red-600'
                      : 'text-gray-900'
                  }`}>
                    {formatCurrency(orc.valor_total, currencyForCountry(orc.oficina?.pais), locale)}
                  </span>
                  <span className="text-gray-500">{t('revisionNumberParen', { n: orc.revisao_numero })}</span>
                </div>
              )}

              {/* Items breakdown */}
              {orc.itens && orc.itens.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">{t('breakdownTitle')}</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs">
                        <th className="text-left pb-2">{t('itemColumn')}</th>
                        <th className="text-left pb-2">{t('typeColumn')}</th>
                        <th className="text-right pb-2">{t('valueColumn')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {orc.itens.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 text-gray-900">{item.descricao}</td>
                          <td className="py-2 text-gray-500">{tc.has(`tiposItem.${item.tipo}`) ? tc(`tiposItem.${item.tipo}`) : item.tipo}</td>
                          <td className="py-2 text-right text-gray-900">{formatCurrency(item.valor_total, currencyForCountry(orc.oficina?.pais), locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold border-t-2">
                        <td className="pt-2">{t('totalLabel')}</td>
                        <td></td>
                        <td className="pt-2 text-right">{formatCurrency(orc.valor_total, currencyForCountry(orc.oficina?.pais), locale)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {cleanDescricao(orc.observacoes) && (
                <p className="text-sm text-gray-600 mb-4">
                  <strong>{t('observationsLabel')}</strong> {cleanDescricao(orc.observacoes)}
                </p>
              )}

              {/* Scheduling section - shown when user clicks "Agendar" */}
              {schedulingOrcId === orc.id ? (
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-semibold text-gray-900 mb-1">
                    {t('chooseCheckinDate')}
                  </h4>
                  <p className="text-sm text-gray-600 mb-3">{t('escolhaHorarioDica')}</p>
                  <div className="space-y-2">
                    {/* horario que ja passou nao se escolhe (a oficina pode ter oferecido hoje de manha) */}
                    {orc.disponibilidade.every((slot) => !turnoDisponivel(slot.data_checkin, slot.turno as Turno)) && (
                      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">{t('horariosVencidos')}</p>
                    )}
                    {orc.disponibilidade.filter((slot) => turnoDisponivel(slot.data_checkin, slot.turno as Turno)).map((slot) => (
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
                              {formatSlotDate(slot.data_checkin, locale)}
                              <span className="ml-2 text-sm font-normal text-gray-500">
                                {slot.turno === 'manha' ? '08:00 - 12:00' : '13:00 - 17:00'}
                              </span>
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {t('deliveryForecastInline', { date: formatSlotDate(slot.data_previsao_entrega, locale) })}
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

                  {erroAceite && <p role="alert" className="mt-4 text-sm text-red-700 bg-red-50 rounded-lg p-3">{erroAceite}</p>}
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => { setSchedulingOrcId(null); setSelectedSlot(null); }}
                      className="btn-secondary flex-1"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      onClick={handleConfirmAppointment}
                      disabled={!selectedSlot || confirmando}
                      aria-busy={confirmando}
                      className="btn-success flex-1 disabled:opacity-60"
                    >
                      {selectedSlot ? t('confirmAppointment') : t('escolhaHorarioAntes')}
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
                      <p className="font-semibold text-blue-800">{t('vehicleAlreadyAtWorkshop')}</p>
                    </div>
                    <p className="text-sm text-blue-700">{t('vehicleBeingServicedChat')}</p>
                  </div>
                </div>
              ) : orc.status === 'aceito' ? (
                <div className="pt-4 border-t">
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="font-semibold text-green-800">{t('quoteAccepted')}</p>
                    </div>
                    {orc.oficina && (
                      <div className="space-y-1 text-sm">
                        <p className="font-medium text-green-900">{orc.oficina.nome_fantasia}</p>
                        <p className="text-green-700">{orc.oficina.endereco}</p>
                        <p className="text-green-700">{orc.oficina.cidade} - {orc.oficina.estado}</p>
                        {orc.oficina.profile?.telefone && (
                          <p className="text-green-700">{t('phone', { phone: orc.oficina.profile.telefone })}</p>
                        )}
                      </div>
                    )}
                    {orc.disponibilidade && orc.disponibilidade.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-green-200 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-green-700">{t('checkin')}</span>
                          <span className="font-medium text-green-900">
                            {formatSlotDate(slotEscolhido(orc).data_checkin, locale)} - {slotEscolhido(orc).turno === 'manha' ? '08:00-12:00' : '13:00-17:00'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-green-700">{t('deliveryForecast')}</span>
                          <span className="font-medium text-green-900">{formatSlotDate(slotEscolhido(orc).data_previsao_entrega, locale)}</span>
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
                      <p className="font-semibold text-red-700">{t('quoteRefused')}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-red-600 line-through opacity-60">
                      <span>{t('valueLabel', { value: formatCurrency(orc.valor_total, currencyForCountry(orc.oficina?.pais), locale) })}</span>
                      <span>{t('deadlineDays', { days: orc.prazo_dias })}</span>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-xs text-gray-500">
                    {t('validUntil', { date: formatDate(orc.validade, locale) })}
                    {orc.revisao_numero > 0 && (
                      <span className="ml-2 text-amber-600 font-medium">
                        {t('revisionNumberParen', { n: orc.revisao_numero })}
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRefuse(orc.id)}
                      disabled={refusing === orc.id}
                      className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-4 py-2 rounded-lg transition-colors"
                    >
                      {refusing === orc.id ? t('refusing') : t('refuse')}
                    </button>
                    <button
                      onClick={() => handleStartScheduling(orc.id)}
                      className="btn-success !py-2 !px-4 text-sm flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {t('acceptAndSchedule')}
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
