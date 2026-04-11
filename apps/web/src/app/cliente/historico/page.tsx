'use client';

import { useState } from 'react';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useAvaliacoes } from '@/hooks/use-avaliacoes';
import StatusBadge from '@/components/ui/StatusBadge';
import StarRating from '@/components/ui/StarRating';
import { formatCurrency, formatDate } from '@/lib/utils';

function ReviewForm({
  solicitacaoId,
  oficinaId,
  initialNota,
  initialComentario,
  avaliacaoId,
  onCreate,
  onUpdate,
  onCancel,
}: {
  solicitacaoId: string;
  oficinaId: string;
  initialNota?: number;
  initialComentario?: string;
  avaliacaoId?: string;
  onCreate: (input: { solicitacao_id: string; oficina_id: string; nota: number; comentario?: string }) => Promise<{ data?: unknown; error?: { message: string } | null }>;
  onUpdate: (avaliacaoId: string, input: { nota: number; comentario?: string; nota_anterior: number }) => Promise<{ data?: unknown; error?: { message: string } | null }>;
  onCancel?: () => void;
}) {
  const [nota, setNota] = useState(initialNota || 0);
  const [comentario, setComentario] = useState(initialComentario || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = !!avaliacaoId;

  const handleSubmit = async () => {
    if (nota === 0) {
      setError('Selecione uma nota de 1 a 5 estrelas');
      return;
    }
    setSubmitting(true);
    setError('');

    let result: { data?: unknown; error?: { message: string } | null };

    if (isEditing && avaliacaoId) {
      result = await onUpdate(avaliacaoId, {
        nota,
        comentario: comentario.trim() || undefined,
        nota_anterior: initialNota || 0,
      });
    } else {
      result = await onCreate({
        solicitacao_id: solicitacaoId,
        oficina_id: oficinaId,
        nota,
        comentario: comentario.trim() || undefined,
      });
    }

    if (result.error) {
      setError(result.error.message);
    } else if (onCancel) {
      onCancel();
    }
    setSubmitting(false);
  };

  return (
    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <p className="text-sm font-semibold text-gray-800 mb-2">
        {isEditing ? 'Editar avaliação' : 'Como foi o serviço?'}
      </p>
      <div className="mb-3">
        <StarRating rating={nota} size="lg" interactive onChange={setNota} />
      </div>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder="Deixe um comentário sobre o serviço (opcional)"
        className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
        rows={3}
      />
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      <div className="flex gap-2 mt-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2 border border-gray-300 rounded-lg"
          >
            Cancelar
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting || nota === 0}
          className="btn-primary !py-2 !px-4 text-sm disabled:opacity-50"
        >
          {submitting ? 'Enviando...' : isEditing ? 'Salvar alterações' : 'Enviar avaliação'}
        </button>
      </div>
    </div>
  );
}

function NotaChangeIndicator({ nota, notaAnterior }: { nota: number; notaAnterior: number | null }) {
  if (notaAnterior === null || notaAnterior === nota) return null;
  const increased = nota > notaAnterior;
  return (
    <span className={`inline-flex items-center text-xs font-medium ml-1 ${increased ? 'text-green-600' : 'text-red-500'}`}>
      {increased ? '\u2191' : '\u2193'}
    </span>
  );
}

function ReviewDisplay({
  avaliacao,
  canEdit,
  onEdit,
}: {
  avaliacao: { id: string; nota: number; nota_anterior: number | null; comentario?: string | null; created_at: string; updated_at?: string | null };
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <StarRating rating={avaliacao.nota} size="sm" />
          <NotaChangeIndicator nota={avaliacao.nota} notaAnterior={avaliacao.nota_anterior} />
          <span className="text-sm font-semibold text-gray-800">Sua avaliação</span>
        </div>
        {canEdit && (
          <button
            onClick={onEdit}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Editar
          </button>
        )}
      </div>
      {avaliacao.comentario && (
        <p className="text-sm text-gray-600 mt-1">{avaliacao.comentario}</p>
      )}
      <p className="text-xs text-gray-400 mt-2">
        {formatDate(avaliacao.created_at)}
        {avaliacao.updated_at && (
          <span className="ml-2">(editada em {formatDate(avaliacao.updated_at)})</span>
        )}
      </p>
    </div>
  );
}

export default function HistóricoPage() {
  const { solicitacoes } = useSolicitacoes();
  const { avaliacoes, create, update } = useAvaliacoes();
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [canceladasOpen, setCanceladasOpen] = useState(false);

  const concluidas = solicitacoes.filter((s) => s.status === 'concluida');
  const canceladas = solicitacoes.filter((s) => s.status === 'cancelada');

  // Solicitations with at least one refused quote (excluding already concluida/cancelada)
  const comRecusados = solicitacoes.filter(
    (s) =>
      !['concluida', 'cancelada'].includes(s.status) &&
      s.orcamentos?.some((o) => o.status === 'recusado')
  );

  const [recusadosOpen, setRecusadosOpen] = useState(false);
  const [refusedReviewSolId, setRefusedReviewSolId] = useState<string | null>(null);
  const [refusedReviewOficinaId, setRefusedReviewOficinaId] = useState<string | null>(null);

  const getAcceptedOrcamento = (sol: (typeof solicitacoes)[0]) =>
    sol.orcamentos?.find((o) => o.status === 'aceito');

  const getAvaliacao = (solId: string) =>
    avaliacoes.find((a) => a.solicitacao_id === solId);

  const getAvaliacaoForOficina = (solId: string, oficinaId: string) =>
    avaliacoes.find((a) => a.solicitacao_id === solId && a.oficina_id === oficinaId);

  const canEditAvaliacao = (avaliacao: { created_at: string }) => {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    return new Date(avaliacao.created_at) > twoMonthsAgo;
  };

  const hasAny = concluidas.length > 0 || canceladas.length > 0 || comRecusados.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Histórico</h1>
      <p className="text-gray-600 mb-8">Seus reparos anteriores</p>

      {!hasAny ? (
        <div className="card text-center py-12">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-500">Nenhum reparo concluído ainda</p>
          <p className="text-sm text-gray-400 mt-1">Quando seus reparos forem concluídos, eles aparecerão aqui</p>
        </div>
      ) : (
        <>
          {/* Serviços concluídos */}
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              Serviços concluídos
              {concluidas.length > 0 && (
                <span className="text-sm font-normal text-gray-500">({concluidas.length})</span>
              )}
            </h2>

            {concluidas.length === 0 ? (
              <p className="text-sm text-gray-500 ml-5">Nenhum serviço concluído ainda</p>
            ) : (
              <div className="space-y-4">
                {concluidas.map((sol) => {
                  const acceptedOrc = getAcceptedOrcamento(sol);
                  const avaliacao = getAvaliacao(sol.id);
                  const oficinaNome = acceptedOrc?.oficina?.nome_fantasia;

                  return (
                    <div key={sol.id} className="card border-l-4 border-l-green-500">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">
                              {sol.veiculo?.fipe_marca} {sol.veiculo?.fipe_modelo}
                            </h3>
                            <StatusBadge status={sol.status} />
                          </div>
                          {oficinaNome && (
                            <p className="text-sm text-gray-700">
                              <span className="text-gray-500">Oficina:</span> {oficinaNome}
                            </p>
                          )}
                          <p className="text-sm text-gray-600 mt-1">{sol.descricao}</p>
                          <p className="text-xs text-gray-500 mt-2">{formatDate(sol.created_at)}</p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          {acceptedOrc && (
                            <p className="text-lg font-bold text-gray-900">
                              {formatCurrency(acceptedOrc.valor_total)}
                            </p>
                          )}
                          {!acceptedOrc && sol.orcamentos && sol.orcamentos.length > 0 && (
                            <p className="text-lg font-bold text-gray-900">
                              {formatCurrency(sol.orcamentos[0].valor_total)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Review section */}
                      {acceptedOrc && (
                        <>
                          {avaliacao && editingReviewId === sol.id ? (
                            <ReviewForm
                              solicitacaoId={sol.id}
                              oficinaId={acceptedOrc.oficina_id}
                              initialNota={avaliacao.nota}
                              initialComentario={avaliacao.comentario || ''}
                              avaliacaoId={avaliacao.id}
                              onCreate={create}
                              onUpdate={update}
                              onCancel={() => setEditingReviewId(null)}
                            />
                          ) : avaliacao ? (
                            <ReviewDisplay
                              avaliacao={avaliacao}
                              canEdit={canEditAvaliacao(avaliacao)}
                              onEdit={() => setEditingReviewId(sol.id)}
                            />
                          ) : openReviewId === sol.id ? (
                            <ReviewForm
                              solicitacaoId={sol.id}
                              oficinaId={acceptedOrc.oficina_id}
                              onCreate={create}
                              onUpdate={update}
                              onCancel={() => setOpenReviewId(null)}
                            />
                          ) : (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                              <button
                                onClick={() => setOpenReviewId(sol.id)}
                                className="flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                                Avaliar serviço
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Orçamentos recusados */}
          {comRecusados.length > 0 && (
            <section className="mb-10">
              <button
                onClick={() => setRecusadosOpen((prev) => !prev)}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors mb-3 w-full"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${recusadosOpen ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <div className="w-3 h-3 bg-red-400 rounded-full" />
                <span className="text-sm font-semibold">Orçamentos recusados</span>
                <span className="text-xs text-gray-400">({comRecusados.reduce((acc, s) => acc + (s.orcamentos?.filter((o) => o.status === 'recusado').length || 0), 0)})</span>
              </button>

              {recusadosOpen && (
                <div className="space-y-4 ml-6">
                  {comRecusados.map((sol) => {
                    const recusados = sol.orcamentos?.filter((o) => o.status === 'recusado') || [];
                    return recusados.map((orc) => {
                      const avaliacao = getAvaliacaoForOficina(sol.id, orc.oficina_id);
                      const reviewKey = `${sol.id}-${orc.oficina_id}`;
                      const isReviewing = refusedReviewSolId === sol.id && refusedReviewOficinaId === orc.oficina_id;

                      return (
                        <div key={orc.id} className="card border-l-4 border-l-red-300">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-gray-900">
                                  {sol.veiculo?.fipe_marca} {sol.veiculo?.fipe_modelo}
                                </h3>
                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">
                                  Recusado
                                </span>
                              </div>
                              <p className="text-sm text-gray-600">{sol.tipo}</p>
                              <p className="text-xs text-gray-500 mt-1">{formatDate(sol.created_at)}</p>
                            </div>
                          </div>

                          {/* Refused quote details */}
                          <div className="mt-3 bg-red-50 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-gray-800">
                                {orc.oficina?.nome_fantasia || 'Oficina'}
                              </p>
                              <p className="text-sm text-red-500 line-through">
                                {formatCurrency(orc.valor_total)}
                              </p>
                            </div>
                            {orc.prazo_dias && (
                              <p className="text-xs text-gray-500 mt-1">Prazo: {orc.prazo_dias} dias</p>
                            )}
                          </div>

                          {/* Review section */}
                          {avaliacao ? (
                            <ReviewDisplay
                              avaliacao={avaliacao}
                              canEdit={canEditAvaliacao(avaliacao)}
                              onEdit={() => {
                                setRefusedReviewSolId(sol.id);
                                setRefusedReviewOficinaId(orc.oficina_id);
                              }}
                            />
                          ) : isReviewing ? (
                            <ReviewForm
                              solicitacaoId={sol.id}
                              oficinaId={orc.oficina_id}
                              onCreate={create}
                              onUpdate={update}
                              onCancel={() => {
                                setRefusedReviewSolId(null);
                                setRefusedReviewOficinaId(null);
                              }}
                            />
                          ) : (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <button
                                onClick={() => {
                                  setRefusedReviewSolId(sol.id);
                                  setRefusedReviewOficinaId(orc.oficina_id);
                                }}
                                className="flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                                Avaliar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })}
                </div>
              )}
            </section>
          )}

          {/* Canceladas - collapsible */}
          {canceladas.length > 0 && (
            <section>
              <button
                onClick={() => setCanceladasOpen((prev) => !prev)}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors mb-3 w-full"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${canceladasOpen ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-sm font-semibold">Canceladas</span>
                <span className="text-xs text-gray-400">({canceladas.length})</span>
              </button>

              {canceladasOpen && (
                <div className="space-y-3 ml-6">
                  {canceladas.map((sol) => (
                    <div key={sol.id} className="card !py-3 !px-4 border-l-4 border-l-gray-300 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="font-medium text-gray-600 text-sm">
                              {sol.veiculo?.fipe_marca} {sol.veiculo?.fipe_modelo}
                            </h3>
                            <StatusBadge status={sol.status} />
                          </div>
                          <p className="text-xs text-gray-500 line-clamp-1">{sol.descricao}</p>
                          <p className="text-xs text-gray-400 mt-1">{formatDate(sol.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
