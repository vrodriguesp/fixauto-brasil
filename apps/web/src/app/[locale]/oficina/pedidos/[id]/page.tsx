'use client';

import TextoTraduzido from '@/components/ui/TextoTraduzido';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { completarClientes } from '@/lib/resumo-clientes';
import StatusBadge from '@/components/ui/StatusBadge';
import NoShowWarning from '@/components/ui/NoShowWarning';
import DamageAnalysis from '@/components/ui/DamageAnalysis';
import { formatDate, formatCurrency, getUrgenciaColor, cleanDescricao } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { Link } from '@/i18n/navigation';
import MidiaPrivada from '@/components/midia/MidiaPrivada';
import DispensarPedido, { type Dispensa } from '@/components/oficina/DispensarPedido';
import ResumoAgendamento from '@/components/oficina/ResumoAgendamento';

export default function SolicitacaoDetalhePage() {
  const t = useTranslations('oficinaSolicitacaoDetalhe');
  const tc = useTranslations('constants');
  const locale = useLocale();
  const params = useParams();
  const { oficina } = useAuth();
  const { solicitacoes } = useSolicitacoes();
  const solicitacao = solicitacoes.find((s) => s.id === params.id);

  const [directSol, setDirectSol] = useState<any>(null);
  // so mostra "nao encontrado" depois que a busca direta respondeu (antes aparecia por um instante ao abrir)
  const [buscaFeita, setBuscaFeita] = useState(false);
  useEffect(() => {
    if (!solicitacao && params.id) {
      supabase
        .from('solicitacoes')
        .select(
          '*, veiculo:veiculos(*), fotos:solicitacao_fotos(*), cliente:profiles!solicitacoes_cliente_id_fkey(id, nome, avatar_url, tipo, codigo, telefone), orcamentos(*, itens:orcamento_itens(*), oficina:oficinas(*, profile:profiles(*)), disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(*))'
        )
        .eq('id', params.id)
        .single()
        .then(({ data }) => {
          // nome do cliente antes de a oficina ser escolhida (migracao 074)
          if (data) completarClientes(supabase, [data as any]).then(([d]) => setDirectSol(d));
          setBuscaFeita(true);
        });
    }
  }, [solicitacao, params.id]);

  const sol = solicitacao || directSol;

  // acidente com "podem me ligar": a oficina avisada recebe SO o telefone (074, telefone_acidente)
  const [telAcidente, setTelAcidente] = useState<string | null>(null);
  useEffect(() => {
    if (!sol?.id || !sol.emergencia_id || sol.cliente?.telefone) return;
    supabase.rpc('telefone_acidente', { p_sol: sol.id }).then(({ data }) => setTelAcidente((data as string) || null));
  }, [sol?.id, sol?.emergencia_id, sol?.cliente?.telefone]);
  const telCliente: string | null = sol?.cliente?.telefone || telAcidente;

  // a oficina abriu o pedido (caixa Pedidos: o cartao deixa de aparecer como novo)
  useEffect(() => {
    if (!oficina?.id || !params.id) return;
    supabase.from('pedido_vistos').upsert({ solicitacao_id: params.id as string, oficina_id: oficina.id }, { onConflict: 'solicitacao_id,oficina_id', ignoreDuplicates: true }).then(() => {});
  }, [oficina?.id, params.id]);

  // "nao tenho interesse" (migracao 070)
  const [dispensa, setDispensa] = useState<Dispensa | null>(null);
  const carregarDispensa = () => {
    if (!oficina?.id || !params.id) return;
    supabase.from('pedido_dispensas').select('solicitacao_id, motivo, comentario, created_at').eq('solicitacao_id', params.id as string).eq('oficina_id', oficina.id).maybeSingle()
      .then(({ data }) => setDispensa((data as Dispensa) || null));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(carregarDispensa, [oficina?.id, params.id]);

  if (!sol && !buscaFeita) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

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
    // aceito: proposta de revisao que o cliente aprova ou nao (migracao 049)
    if (isAccepted || isEmAndamento) {
      return { label: t('proporRevisao'), href: `/oficina/orcamento/${sol.id}` };
    }
    if (myQuote) {
      return { label: t('modificarOrcamento'), href: `/oficina/orcamento/${sol.id}` };
    }
    return { label: t('enviarOrcamento'), href: `/oficina/orcamento/${sol.id}` };
  };

  const action = getActionButton();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/oficina/pedidos" className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4">
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
          {sol.numero && <p className="mt-1 text-sm text-gray-500" data-testid="numero-pedido">{tc('numeroPedido', { n: sol.numero })}{sol.cliente?.codigo ? ` · ${tc('codigoCliente', { n: sol.cliente.codigo })}` : ''}</p>}
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
          {/* com orcamento ja enviado, mudar/revisar fica no proprio cartao do orcamento logo abaixo -
              antes havia 3 botoes para a mesma coisa (Muuda pakkumist 2x + Vaata pakkumist) - teste 09/11 */}
          {!myQuote && sol.status !== 'concluida' && sol.status !== 'cancelada' && (sol.status as string) !== 'expirada' && (
            <Link href={action.href} className={`${isAccepted || dispensa ? 'btn-secondary' : 'btn-primary'} text-center min-h-[44px] inline-flex items-center justify-center`}>
              {action.label}
            </Link>
          )}
        </div>
      </div>

      {!myQuote && oficina && ['aberta', 'em_orcamento'].includes(sol.status) && (
        <div className="mb-6 -mt-2">
          <DispensarPedido solicitacaoId={sol.id} oficinaId={oficina.id} dispensa={dispensa} aoMudar={carregarDispensa} />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {isAccepted && oficina && <ResumoAgendamento solicitacaoId={sol.id} oficinaId={oficina.id} pais={oficina.pais} />}
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
              {sol.status !== 'concluida' && sol.status !== 'cancelada' && (sol.status as string) !== 'expirada' && (
                <Link href={`/oficina/orcamento/${sol.id}`} className="btn-secondary mt-4 w-full sm:w-auto inline-flex justify-center">
                  {isAccepted || isEmAndamento ? t('proporRevisao') : t('modificarOrcamento')}
                </Link>
              )}
              {sol.status === 'concluida' && isAccepted && (
                <p className="text-sm text-gray-600 mt-4" role="status" data-testid="orcamento-fechado">{t('orcamentoFechadoEntregue')}</p>
              )}
            </div>
          )}

          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-2">{t('descricaoDoProblema')}</h2>
            <TextoTraduzido texto={cleanDescricao(sol.descricao)} className="text-gray-600" />
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
            {/* telefone so chega para a oficina escolhida ou, no acidente, se o cliente pediu ligacao (migracao 074) */}
            {telCliente && (
              <div className="mt-3 border-t border-gray-100 pt-3" data-testid="ligar-cliente">
                {sol.emergencia_id && !(sol.orcamentos || []).some((o: any) => o.oficina_id === oficina?.id && o.status === 'aceito') && (
                  <p className="mb-2 text-xs text-gray-600">{t('clientePediuLigar')}</p>
                )}
                <a href={`tel:${telCliente.replace(/\s/g, '')}`} className="btn-primary flex min-h-[48px] w-full flex-col items-center justify-center text-center sm:w-auto sm:px-6">
                  <span><span aria-hidden="true">📞 </span>{t('ligarCliente')}</span>
                  <span className="whitespace-nowrap text-sm font-normal">{telCliente}</span>
                </a>
              </div>
            )}
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
