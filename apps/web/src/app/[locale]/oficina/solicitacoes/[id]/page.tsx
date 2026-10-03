'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import StatusBadge from '@/components/ui/StatusBadge';
import NoShowWarning from '@/components/ui/NoShowWarning';
import DamageAnalysis from '@/components/ui/DamageAnalysis';
import { formatDate, formatCurrency, getUrgenciaColor, cleanDescricao } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { Link } from '@/i18n/navigation';
import MidiaPrivada from '@/components/midia/MidiaPrivada';

export default function SolicitacaoDetalhePage() {
  const t = useTranslations('oficinaSolicitacaoDetalhe');
  const tc = useTranslations('constants');
  const locale = useLocale();
  const params = useParams();
  const { oficina } = useAuth();
  const { solicitacoes } = useSolicitacoes();
  const solicitacao = solicitacoes.find((s) => s.id === params.id);

  const [directSol, setDirectSol] = useState<any>(null);
  useEffect(() => {
    if (!solicitacao && params.id) {
      supabase
        .from('solicitacoes')
        .select(
          '*, veiculo:veiculos(*), fotos:solicitacao_fotos(*), cliente:profiles!solicitacoes_cliente_id_fkey(id, nome, avatar_url, tipo), orcamentos(*, itens:orcamento_itens(*), oficina:oficinas(*, profile:profiles(*)), disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(*))'
        )
        .eq('id', params.id)
        .single()
        .then(({ data }) => {
          if (data) setDirectSol(data);
        });
    }
  }, [solicitacao, params.id]);

  const sol = solicitacao || directSol;

  if (!sol) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">{t('solicitacaoNaoEncontrada')}</p>
      </div>
    );
  }

  const v = sol.veiculo;
  const myQuote = sol.orcamentos?.find((o: any) => o.oficina_id === oficina?.id);
  const isAccepted = myQuote?.status === 'aceito';
  const isEmAndamento = sol.status === 'em_andamento';

  // Determine button label and availability
  const getActionButton = () => {
    if (isAccepted || isEmAndamento) {
      return { label: t('refazerOrcamento'), href: `/oficina/enviar-orcamento/${sol.id}` };
    }
    if (myQuote) {
      return { label: t('modificarOrcamento'), href: `/oficina/enviar-orcamento/${sol.id}` };
    }
    return { label: t('enviarOrcamento'), href: `/oficina/enviar-orcamento/${sol.id}` };
  };

  const action = getActionButton();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/oficina/solicitacoes" className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('voltar')}
      </Link>

      {/* celular: titulo, selos e botoes empilhados (antes ficavam lado a lado e desalinhados) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 break-words">
            {v?.fipe_marca ? `${v.fipe_marca} ${v.fipe_modelo}` : t('veiculoFallback')}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <StatusBadge status={sol.status} />
            <span className={`badge ${getUrgenciaColor(sol.urgencia)}`}>
              {t('urgencia')}: {tc.has(`urgencias.${sol.urgencia}`) ? tc(`urgencias.${sol.urgencia}`) : sol.urgencia}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:flex-shrink-0">
          <Link
            href={`/oficina/mensagens/${sol.id}`}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {t('mensagem')}
          </Link>
          {sol.status !== 'concluida' && sol.status !== 'cancelada' && (
            <Link href={action.href} className={`${isAccepted || myQuote ? 'btn-secondary' : 'btn-primary'} text-center min-h-[44px] inline-flex items-center justify-center`}>
              {action.label}
            </Link>
          )}
          {myQuote && (
            <a href="#meu-orcamento" className="btn-primary text-center min-h-[44px] inline-flex items-center justify-center col-span-2 sm:col-span-1">
              {t('verOrcamento')}
            </a>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {myQuote && (
            <div id="meu-orcamento" className="card border-2 border-primary-100 scroll-mt-24">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="font-semibold text-gray-900">{t('seuOrcamento')}</h2>
                <span className="badge bg-gray-100 text-gray-700">{t(`statusOrcamento.${myQuote.status}`)}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(Number(myQuote.valor_total), currencyForCountry(oficina?.pais), locale)}</p>
              <p className="text-sm text-gray-600 mt-1">{t('prazoDias', { dias: myQuote.prazo_dias })}</p>
              {(myQuote.itens || []).length > 0 && (
                <ul className="mt-3 divide-y divide-gray-100 text-sm">
                  {myQuote.itens.map((it: any) => (
                    <li key={it.id} className="flex justify-between gap-3 py-2">
                      <span className="text-gray-700 break-words min-w-0">{it.quantidade > 1 ? `${it.quantidade}× ` : ''}{it.descricao}</span>
                      <span className="text-gray-900 whitespace-nowrap">{formatCurrency(Number(it.valor_total), currencyForCountry(oficina?.pais), locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {myQuote.observacoes && <p className="text-sm text-gray-600 mt-3 whitespace-pre-line">{cleanDescricao(myQuote.observacoes)}</p>}
              {sol.status !== 'concluida' && sol.status !== 'cancelada' && (
                <Link href={`/oficina/enviar-orcamento/${sol.id}`} className="btn-secondary mt-4 w-full sm:w-auto inline-flex justify-center">
                  {t('modificarOrcamento')}
                </Link>
              )}
            </div>
          )}

          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-2">{t('descricaoDoProblema')}</h2>
            <p className="text-gray-600">{cleanDescricao(sol.descricao)}</p>
          </div>

          {sol.fotos && sol.fotos.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-3">{t('fotosCount', { count: sol.fotos.length })}</h2>
              <div className="grid grid-cols-3 gap-3">
                {sol.fotos.map((foto: any) => (
                  <MidiaPrivada key={foto.id} url={foto.foto_url}>{(u) => (
<a href={u} target="_blank" rel="noopener noreferrer" className="aspect-square bg-gray-200 rounded-lg overflow-hidden block">
                    {foto.foto_url ? (
                      <img src={u} alt={foto.descricao || t('fotoDoDanoAlt')} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">{t('informacoesDoVeiculo')}</h2>
            {v?.fipe_marca ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">{t('marca')}</dt>
                  <dd className="text-gray-900">{v.fipe_marca || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">{t('modelo')}</dt>
                  <dd className="text-gray-900">{v.fipe_modelo || '-'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">{t('ano')}</dt>
                  <dd className="text-gray-900">{v.fipe_ano || '-'}</dd>
                </div>
                {v.placa && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">{t('placa')}</dt>
                    <dd className="text-gray-900 font-mono">{v.placa}</dd>
                  </div>
                )}
                {v.cor && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">{t('cor')}</dt>
                    <dd className="text-gray-900">{v.cor}</dd>
                  </div>
                )}
                {v.fipe_valor && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">{t('valorFipe')}</dt>
                    <dd className="text-green-600 font-medium">{v.fipe_valor}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-gray-400">{t('dadosVeiculoIndisponiveis')}</p>
            )}
          </div>

          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">{t('cliente')}</h2>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-gray-600 font-semibold">
                  {sol.cliente?.nome?.charAt(0) || '?'}
                </span>
              </div>
              <div>
                <p className="font-medium text-gray-900 text-sm">{sol.cliente?.nome || t('clienteFallback')}</p>
                <p className="text-xs text-gray-500">{sol.endereco}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              {t('solicitadoEm', { data: formatDate(sol.created_at, locale) })}
            </p>
          </div>

          {(sol.cliente?.id || sol.cliente_id) && (
            <NoShowWarning clienteId={sol.cliente?.id || sol.cliente_id} />
          )}

          <DamageAnalysis solicitacaoId={sol.id} pais={sol.pais} />
        </div>
      </div>
    </div>
  );
}
