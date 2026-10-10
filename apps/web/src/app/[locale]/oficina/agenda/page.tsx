'use client';

import { useState, useEffect, useMemo } from 'react';
import { localParaIso, dataLocalDe, horaLocalDe } from '@/lib/turnos';
import { exemploPlaca } from '@/lib/exemplos';
import { useTranslations, useLocale } from 'next-intl';
import { useAgenda } from '@/hooks/use-agenda';
import { useAuth } from '@/lib/auth-context';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { supabase } from '@/lib/supabase';
import { CORES_AGENDA, TIPOS_SERVICO } from '@fixauto/shared';
import { cleanDescricao, INTL_LOCALE, rotuloTipoPedido } from '@/lib/utils';
import FipeAutocomplete from '@/components/forms/FipeAutocomplete';
import { Link, useRouter } from '@/i18n/navigation';
import { diaNaOficina } from '@/lib/fuso';
import { nomeFuncionario } from '@/lib/funcionario';
import QuadroOficina, { type Box } from '@/components/oficina/QuadroOficina';
import CapacidadeResumo from '@/components/oficina/CapacidadeResumo';

// Visoes da agenda: Mes, Dia, Lista e Quadro (mecanicos/elevadores x dias).
// Todas usam os mesmos agendamentos (useAgenda, com tempo real): mudar numa
// muda nas outras. A visao escolhida fica salva neste aparelho.
type Vista = 'quadro' | 'month' | 'day' | 'list';
const CHAVE_VISTA = 'bipfix_agenda_vista';

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay(); }

export default function AgendaPage() {
  const t = useTranslations('oficinaAgenda');
  const tc = useTranslations('constants');
  const locale = useLocale();
  const MESES = [t('mes0'), t('mes1'), t('mes2'), t('mes3'), t('mes4'), t('mes5'), t('mes6'), t('mes7'), t('mes8'), t('mes9'), t('mes10'), t('mes11')];
  const DIAS_SEMANA = [t('dia0'), t('dia1'), t('dia2'), t('dia3'), t('dia4'), t('dia5'), t('dia6')];

  const getEventLabel = (ev: any): string => {
    const v = ev.solicitacao?.veiculo;
    const c = ev.solicitacao?.cliente;
    if (v?.placa) return v.placa;
    if (c?.nome) return c.nome.split(' ').pop();
    return ev.titulo || t('evento');
  };

  // aviso de prazo da entrega; a cor vem do tipo (antes vinha de procurar
  // "antes"/"depois" no texto em portugues - auditoria B-07)
  const deliveryNote = (ev: any): { texto: string; tipo: 'antes' | 'depois' | 'noPrazo' } | null => {
    if (ev.status !== 'concluido') return null;
    const prevista = ev.data_fim_prevista || null;
    if (!prevista) return null;
    const real = new Date(ev.data_fim);
    const plan = new Date(prevista);
    const diff = Math.round((real.getTime() - plan.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return { texto: t('noPrazo'), tipo: 'noPrazo' };
    if (diff < 0) return { texto: t('diasAntesDoPrevisto', { dias: Math.abs(diff) }), tipo: 'antes' };
    return { texto: t('diasDepoisDoPrevisto', { dias: diff }), tipo: 'depois' };
  };

  const { eventos, add: addEvento, update: updateEvento, remove: removeEvento, refresh } = useAgenda();
  const { refresh: refreshSolicitacoes } = useSolicitacoes();
  const { oficina, funcionario, user } = useAuth();
  const isMecanico = funcionario?.cargo === 'mecanico';
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();
  const [viewMode, setViewModeState] = useState<Vista>('month');
  const setViewMode = (v: Vista) => { setViewModeState(v); try { localStorage.setItem(CHAVE_VISTA, v); } catch {} };
  // visao salva (ou ?vista=quadro, usado pelos enderecos antigos de Distribuicao/Capacidade)
  useEffect(() => {
    const daUrl = new URLSearchParams(window.location.search).get('vista');
    let salva: string | null = null; try { salva = localStorage.getItem(CHAVE_VISTA); } catch {}
    const v = (daUrl || salva) as Vista | null;
    if (v === 'day') { if (daUrl === 'day') router.replace('/oficina/hoje'); else setViewModeState('month'); return; }
    if (v && ['quadro', 'month', 'list'].includes(v)) setViewModeState(v);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [indicadores, setIndicadores] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  // check-in: mecanico e posto ("Colocar em") escolhidos antes de confirmar
  const [checkinEscolha, setCheckinEscolha] = useState<{ funcId: string; boxId: string }>({ funcId: '', boxId: '' });
  const [erroCheckin, setErroCheckin] = useState<string | null>(null);
  // check-in de carro agendado para outro dia: confirma antes
  const [antecipar, setAntecipar] = useState<{ ev: any; funcId?: string; boxId?: string; data: string } | null>(null);
  // entregar o carro encerra o servico: pede confirmacao
  const [confirmarEntrega, setConfirmarEntrega] = useState<any | null>(null);
  // entrega recusada pelo servidor (ex.: carro sem check-in): mostra o aviso
  const [erroEntrega, setErroEntrega] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [funcionarios, setFuncionarios] = useState<any[]>([]);
  const [noShowingId, setNoShowingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    cliente_nome: '',
    placa: '',
    fipe_tipo: 'cars',
    fipe_marca: '',
    fipe_modelo: '',
    fipe_ano: '',
    tipo_servico: 'mecanica',
    descricao: '',
    data_inicio: '',
    hora_inicio: '08:00',
    data_fim: '',
    hora_fim: '18:00',
    funcionario_id: '',
    cor: '#3B82F6',
  });

  useEffect(() => {
    if (!oficina) return;
    supabase.from('funcionarios').select('*, profile:profiles(nome)')
      .eq('oficina_id', oficina.id).eq('ativo', true)
      .then(({ data }) => { if (data) setFuncionarios(data); });
  }, [oficina]);

  // elevadores/boxes (migracao 053), em tempo real
  const carregarBoxes = async () => {
    if (!oficina) return;
    const { data } = await supabase.from('oficina_boxes').select('id, nome, tipo, ativo, ordem, capacidade').eq('oficina_id', oficina.id);
    setBoxes((data as Box[]) || []);
  };
  useEffect(() => {
    if (!oficina) return;
    carregarBoxes();
    const canal = supabase.channel(`boxes-${oficina.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oficina_boxes', filter: `oficina_id=eq.${oficina.id}` }, () => carregarBoxes())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oficina]);
  const nomeBox = (id?: string | null) => boxes.find((b) => b.id === id)?.nome || '';
  const ehDono = !!oficina && oficina.profile_id === user?.id;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // De-duplicate + remove stale. Keep agendado, em_andamento, concluido.
  const allEventos = useMemo(() => {
    const relevant = eventos.filter((ev) => {
      if (ev.status === 'cancelado') return false;
      if (ev.status === 'agendado' && ev.tipo === 'plataforma' && ev.solicitacao) {
        const s = (ev.solicitacao as any).status;
        if (s === 'concluida' || s === 'cancelada') return false;
      }
      return true;
    });
    const seen = new Map<string, typeof relevant[0]>();
    const others: typeof relevant = [];
    const prio: Record<string, number> = { concluido: 3, em_andamento: 2, agendado: 1 };
    for (const ev of relevant) {
      if (ev.tipo === 'plataforma' && ev.solicitacao_id) {
        const ex = seen.get(ev.solicitacao_id);
        if (!ex || (prio[ev.status] || 0) > (prio[ex.status] || 0) ||
            ((prio[ev.status] || 0) === (prio[ex.status] || 0) && new Date(ev.created_at) > new Date(ex.created_at))) {
          seen.set(ev.solicitacao_id, ev);
        }
      } else { others.push(ev); }
    }
    const combined = [...others, ...Array.from(seen.values())];
    // Mecanico ve so os veiculos atribuidos a ele - mesma restricao de
    // /oficina/veiculos-em-servico ("Meus Veiculos").
    if (isMecanico && funcionario) {
      return combined.filter((e) => e.funcionario_id === funcionario.id);
    }
    return combined;
  }, [eventos, isMecanico, funcionario]);

  // For a given date, get 3 groups:
  // - Check-in pendente: data_inicio = date AND status = agendado
  // - Check-in feito: data_inicio = date AND status IN (em_andamento, concluido)
  // - Entregue: data_fim = date AND status = concluido
  const getGroups = (dateStr: string) => {
    const checkinPendente = allEventos.filter(e => dataLocalDe(e.data_inicio, (oficina as any)?.pais ?? null) === dateStr && e.status === 'agendado' && !(e as any).no_show);
    const naoCompareceu = allEventos.filter(e => dataLocalDe(e.data_inicio, (oficina as any)?.pais ?? null) === dateStr && (e as any).no_show);
    const checkinFeito = allEventos.filter(e => dataLocalDe(e.data_inicio, (oficina as any)?.pais ?? null) === dateStr && (e.status === 'em_andamento' || e.status === 'concluido'));
    const entregue = allEventos.filter(e => dataLocalDe(e.data_fim, (oficina as any)?.pais ?? null) === dateStr && e.status === 'concluido');
    return { checkinPendente, naoCompareceu, checkinFeito, entregue };
  };

  const handleAddEvent = async () => {
    if (!formData.data_inicio || !formData.data_fim) return;
    const tipoLabel = tc(`tiposServico.${formData.tipo_servico}`);
    const titulo = `${tipoLabel}${formData.placa ? ' - ' + formData.placa : ''}${formData.cliente_nome ? ' - ' + formData.cliente_nome : ''}`;
    const descricao = [
      formData.fipe_marca && formData.fipe_modelo ? `${formData.fipe_marca} ${formData.fipe_modelo}${formData.fipe_ano ? ' ' + formData.fipe_ano : ''}` : '',
      formData.descricao,
    ].filter(Boolean).join(' | ');

    const result = await addEvento({
      titulo,
      descricao: descricao || undefined,
      data_inicio: localParaIso(formData.data_inicio, formData.hora_inicio, (oficina as any)?.pais ?? null),
      data_fim: localParaIso(formData.data_fim, formData.hora_fim, (oficina as any)?.pais ?? null),
      tipo: 'externo',
      cor: formData.cor,
    });

    // Assign mechanic if selected
    if (formData.funcionario_id && result?.data?.id) {
      await supabase.from('agenda').update({ funcionario_id: formData.funcionario_id }).eq('id', result.data.id);
    }

    setShowForm(false);
    setFormData({ cliente_nome: '', placa: '', fipe_tipo: 'cars', fipe_marca: '', fipe_modelo: '', fipe_ano: '', tipo_servico: 'mecanica', descricao: '', data_inicio: '', hora_inicio: '08:00', data_fim: '', hora_fim: '18:00', funcionario_id: '', cor: '#3B82F6' });
    await refresh();
  };

  // pelo servidor (/api/servico): pedido do cliente vai para "em andamento",
  // o cliente e avisado e fica no historico; sem mecanico tambem funciona
  const handleCheckIn = async (ev: any, funcId?: string, confirmado = false, boxId?: string) => {
    setUpdatingId(ev.id); setErroCheckin(null);
    const res = await fetch('/api/servico', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'checkin', eventoId: ev.id, antecipar: confirmado, ...(funcId ? { funcionarioId: funcId } : {}), ...(boxId ? { boxId } : {}) }),
    });
    const dados = await res.json().catch(() => ({}));
    if (res.status === 409 && dados.codigo === 'CHECKIN_FUTURO') setAntecipar({ ev, funcId, boxId, data: dados.dataAgendada });
    else setAntecipar(null);
    if (res.status === 409 && dados.codigo === 'CONFLITO_POSTO') setErroCheckin(ev.id);
    await refresh();
    setUpdatingId(null);
    setAssigningId(null);
  };

  const handleCheckOut = async (ev: any) => {
    setUpdatingId(ev.id);
    const res = await fetch('/api/confirmar-entrega', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventoId: ev.id }),
    }).catch(() => null);
    if (!res?.ok) setErroEntrega(ev.id);
    // a etapa "entregue" e gravada pelo servidor (lib/entrega.ts)
    await refresh();
    refreshSolicitacoes();
    setUpdatingId(null);
  };

  const handleNoShow = async (ev: any) => {
    if (!confirm(t('confirmRegistrarFalta'))) return;
    setNoShowingId(ev.id);
    await fetch('/api/registrar-no-show', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agendaId: ev.id, solicitacaoId: ev.solicitacao_id }),
    });
    await refresh();
    setNoShowingId(null);
  };

  // Monthly stats
  const monthlyStats = useMemo(() => {
    const stats: Record<string, number> = {};
    allEventos.forEach((e) => {
      if (e.data_inicio.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}` && e.status !== 'concluido') {
        const tipo = e.solicitacao?.tipo || 'outro';
        stats[tipo] = (stats[tipo] || 0) + 1;
      }
    });
    return stats;
  }, [allEventos, year, month]);

  const startEdit = (ev: any) => {
    setEditingId(ev.id);
    setEditData({
      titulo: ev.titulo || '',
      descricao: ev.descricao || '',
      data_inicio: dataLocalDe(ev.data_inicio, (oficina as any)?.pais ?? null),
      hora_inicio: horaLocalDe(ev.data_inicio, (oficina as any)?.pais ?? null) || '08:00',
      data_fim: dataLocalDe(ev.data_fim, (oficina as any)?.pais ?? null),
      hora_fim: horaLocalDe(ev.data_fim, (oficina as any)?.pais ?? null) || '18:00',
      funcionario_id: ev.funcionario_id || '',
      cor: ev.cor || '#3B82F6',
    });
  };

  const handleSaveEdit = async (evId: string) => {
    if (!editData) return;
    setUpdatingId(evId);
    await updateEvento(evId, {
      titulo: editData.titulo,
      descricao: editData.descricao || null,
      data_inicio: localParaIso(editData.data_inicio, editData.hora_inicio, (oficina as any)?.pais ?? null),
      data_fim: localParaIso(editData.data_fim, editData.hora_fim, (oficina as any)?.pais ?? null),
      funcionario_id: editData.funcionario_id || null,
      cor: editData.cor,
    });
    setEditingId(null);
    setEditData(null);
    setUpdatingId(null);
  };

  const handleDeleteEvent = async (evId: string) => {
    if (!confirm(t('confirmExcluirEvento'))) return;
    await removeEvento(evId);
  };

  const STATUS_LABEL: Record<string, string> = { agendado: t('statusAgendado'), em_andamento: t('statusEmAndamento'), concluido: t('statusEntregue') };

  const renderCard = (ev: any, type: 'pendente' | 'feito' | 'entregue') => {
    const sol = ev.solicitacao;
    const v = sol?.veiculo;
    const c = sol?.cliente;
    const placa = v?.placa || '';
    const evId = ev.id.slice(0, 6);
    const isUpdating = updatingId === ev.id;
    const note = type === 'entregue' ? deliveryNote(ev) : null;
    const isExpanded = expandedId === `${ev.id}-${type}`;

    const eventName = placa || c?.nome?.split(' ').pop() || ev.titulo || '';
    const title = type === 'pendente'
      ? t('cardCheckin', { nome: eventName })
      : type === 'feito'
      ? t('cardCheckinFeito', { nome: eventName })
      : t('cardEntregue', { nome: eventName });

    return (
      <div key={`${ev.id}-${type}`} className={`rounded-lg border overflow-hidden ${
        type === 'pendente' ? 'bg-green-50 border-green-200' :
        type === 'feito' ? 'bg-blue-50 border-blue-200' :
        'bg-gray-100 border-gray-300'
      }`}>
        <div className="p-3 cursor-pointer hover:opacity-80" onClick={() => setExpandedId(isExpanded ? null : `${ev.id}-${type}`)}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900 text-sm">{title}</p>
                <span className="text-[10px] font-mono text-gray-400">#{evId}</span>
                {sol?.tipo && <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded">{rotuloTipoPedido(tc, sol.tipo, sol.descricao)}</span>}
                {ev.no_show && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">{t('falta')}</span>}
                {type === 'feito' && (
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    ev.status === 'concluido' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>{STATUS_LABEL[ev.status] || ev.status}</span>
                )}
              </div>
              {v && <p className="text-xs text-gray-600 mt-0.5">{v.fipe_marca} {v.fipe_modelo}{placa ? ` - ${placa}` : ''}</p>}
              {c && <p className="text-xs text-gray-500">{c.nome}</p>}
              {(ev as any).box_id && nomeBox((ev as any).box_id) && <p className="text-xs text-gray-600">🛗 {nomeBox((ev as any).box_id)}</p>}
              {note && <p className={`text-xs mt-1 font-medium ${note.tipo === 'antes' ? 'text-green-600' : note.tipo === 'depois' ? 'text-red-600' : 'text-gray-500'}`}>{note.texto}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {type === 'pendente' && (
                isMecanico ? (
                  <button onClick={(e) => { e.stopPropagation(); handleCheckIn(ev, funcionario?.id); }} disabled={isUpdating}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-medium rounded-lg">
                    {isUpdating ? '...' : t('btnCheckin')}
                  </button>
                ) : assigningId === ev.id ? (
                  <div className="flex flex-wrap items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {funcionarios.length > 0 && (
                      <select className="input-field !py-1 !px-2 text-xs !w-auto" aria-label={t('quadroMecanico')} value={checkinEscolha.funcId}
                        onChange={(e) => setCheckinEscolha({ ...checkinEscolha, funcId: e.target.value })}>
                        <option value="">{t('semMecanico')}</option>
                        {funcionarios.map((f) => <option key={f.id} value={f.id}>{nomeFuncionario(f)}</option>)}
                      </select>
                    )}
                    {boxes.some((b) => b.ativo) && (
                      <select className="input-field !py-1 !px-2 text-xs !w-auto" aria-label={t('checkinColocarEm')} value={checkinEscolha.boxId}
                        onChange={(e) => setCheckinEscolha({ ...checkinEscolha, boxId: e.target.value })}>
                        <option value="">{t('checkinColocarEm')}: —</option>
                        {boxes.filter((b) => b.ativo).map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                      </select>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); handleCheckIn(ev, checkinEscolha.funcId || undefined, false, checkinEscolha.boxId || undefined); }} disabled={isUpdating}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-medium rounded-lg">
                      {isUpdating ? '...' : t('btnCheckin')}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setAssigningId(null); }} aria-label={t('cancelar')} className="text-xs text-gray-400 px-1">x</button>
                    {erroCheckin === ev.id && <p role="alert" className="basis-full text-right text-xs text-red-700">{t('checkinPostoOcupado')}</p>}
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {new Date(ev.data_inicio) < new Date() && !ev.no_show && (
                      <button onClick={(e) => { e.stopPropagation(); handleNoShow(ev); }} disabled={noShowingId === ev.id}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-xs font-medium rounded-lg">
                        {noShowingId === ev.id ? '...' : t('btnMarcarFalta')}
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); if (funcionarios.length || boxes.some((b) => b.ativo)) { setCheckinEscolha({ funcId: '', boxId: (ev as any).box_id || '' }); setErroCheckin(null); setAssigningId(ev.id); } else handleCheckIn(ev); }} disabled={isUpdating}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-medium rounded-lg">
                      {isUpdating ? '...' : t('btnCheckin')}
                    </button>
                  </div>
                )
              )}
              {type === 'feito' && ev.status === 'em_andamento' && (
                // etapas do conserto (diagnostico, pecas, execucao...) na tela de veiculos em servico
                <Link href={`/oficina/hoje?ev=${ev.id}`} onClick={(e) => e.stopPropagation()}
                  className="px-3 py-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-xs font-medium rounded-lg">
                  {t('btnEtapa')}
                </Link>
              )}
              {type === 'feito' && ev.status === 'em_andamento' && !isMecanico && (
                <button onClick={(e) => { e.stopPropagation(); setConfirmarEntrega(ev); }} disabled={isUpdating}
                  className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white text-xs font-medium rounded-lg">
                  {isUpdating ? '...' : t('btnEntrega')}
                </button>
              )}
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
        {/* Expanded details */}
        {isExpanded && (
          <div className="px-3 pb-3 border-t border-gray-200 pt-3">
            {editingId === ev.id && editData ? (
              /* Edit mode - external events only */
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label htmlFor="c06c6-1" className="block text-xs font-medium text-gray-500 mb-1">{t('formTitulo')}</label>
                    <input id="c06c6-1" type="text" className="input-field !py-1.5 text-sm" value={editData.titulo} onChange={(e) => setEditData({ ...editData, titulo: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="c06c6-2" className="block text-xs font-medium text-gray-500 mb-1">{t('formDataCheckin')}</label>
                    <input id="c06c6-2" type="date" className="input-field !py-1.5 text-sm" value={editData.data_inicio} onChange={(e) => setEditData({ ...editData, data_inicio: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="c06c6-3" className="block text-xs font-medium text-gray-500 mb-1">{t('formHorario')}</label>
                    <input id="c06c6-3" type="time" className="input-field !py-1.5 text-sm" value={editData.hora_inicio} onChange={(e) => setEditData({ ...editData, hora_inicio: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="c06c6-4" className="block text-xs font-medium text-gray-500 mb-1">{t('formDataPrevEntrega')}</label>
                    <input id="c06c6-4" type="date" className="input-field !py-1.5 text-sm" value={editData.data_fim} onChange={(e) => setEditData({ ...editData, data_fim: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="c06c6-5" className="block text-xs font-medium text-gray-500 mb-1">{t('formHorario')}</label>
                    <input id="c06c6-5" type="time" className="input-field !py-1.5 text-sm" value={editData.hora_fim} onChange={(e) => setEditData({ ...editData, hora_fim: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="c06c6-6" className="block text-xs font-medium text-gray-500 mb-1">{t('formMecanico')}</label>
                    <select id="c06c6-6" className="input-field !py-1.5 text-sm" value={editData.funcionario_id} onChange={(e) => setEditData({ ...editData, funcionario_id: e.target.value })}>
                      <option value="">{t('nenhum')}</option>
                      {funcionarios.map((f) => <option key={f.id} value={f.id}>{nomeFuncionario(f)}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="c06c6-7" className="block text-xs font-medium text-gray-500 mb-1">{t('formDescricao')}</label>
                    <input id="c06c6-7" type="text" className="input-field !py-1.5 text-sm" value={editData.descricao} onChange={(e) => setEditData({ ...editData, descricao: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t('formCor')}</label>
                    <div className="flex gap-2">{CORES_AGENDA.map((co) => (
                      <button key={co} type="button" onClick={() => setEditData({ ...editData, cor: co })}
                        className={`w-6 h-6 rounded-full transition-transform ${editData.cor === co ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : ''}`} style={{ backgroundColor: co }} />
                    ))}</div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => { setEditingId(null); setEditData(null); }} className="btn-secondary !py-1.5 !px-3 text-xs">{t('cancelar')}</button>
                  <button onClick={() => handleSaveEdit(ev.id)} disabled={isUpdating} className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-50">
                    {isUpdating ? '...' : t('salvar')}
                  </button>
                </div>
              </div>
            ) : (
              /* View mode */
              <div className="space-y-2">
                {c && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">{t('cliente')}</p>
                    <p className="text-sm text-gray-900">{c.nome}</p>
                    {c.telefone && <a href={`tel:${c.telefone}`} className="text-xs text-primary-600 hover:underline">{c.telefone}</a>}
                  </div>
                )}
                {v && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">{t('veiculo')}</p>
                    <p className="text-sm text-gray-900">{v.fipe_marca} {v.fipe_modelo} {v.fipe_ano || ''}</p>
                    {v.placa && <p className="text-xs text-gray-600">{t('placa')}: <span className="font-mono">{v.placa}</span></p>}
                  </div>
                )}
                {!c && !v && ev.descricao && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">{t('descricao')}</p>
                    <p className="text-xs text-gray-700">{cleanDescricao(ev.descricao)}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">{t('datas')}</p>
                  <p className="text-xs text-gray-700">{t('checkinLabel')}: {new Date(ev.data_inicio).toLocaleDateString(INTL_LOCALE[locale] || 'en-GB')} {new Date(ev.data_inicio).toLocaleTimeString(INTL_LOCALE[locale] || 'en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="text-xs text-gray-700">{t('prevEntregaLabel')}: {new Date(ev.data_fim_prevista || ev.data_fim).toLocaleDateString(INTL_LOCALE[locale] || 'en-GB')} {new Date(ev.data_fim_prevista || ev.data_fim).toLocaleTimeString(INTL_LOCALE[locale] || 'en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                  {ev.status === 'concluido' && <p className="text-xs text-gray-700">{t('entregueLabel')}: {new Date(ev.data_fim).toLocaleDateString(INTL_LOCALE[locale] || 'en-GB')}</p>}
                </div>
                {ev.funcionario && nomeFuncionario(ev.funcionario) && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">{t('mecanico')}</p>
                    <p className="text-sm text-gray-900">{nomeFuncionario(ev.funcionario)}</p>
                  </div>
                )}
                {sol?.descricao && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">{t('descricao')}</p>
                    <p className="text-xs text-gray-700">{cleanDescricao(sol.descricao)}</p>
                  </div>
                )}
                <div className="pt-2 flex gap-2">
                  {ev.solicitacao_id && (
                    <>
                      <Link href={`/oficina/mensagens/${ev.solicitacao_id}`} className="text-xs text-primary-600 hover:text-primary-700 font-medium">{t('mensagem')}</Link>
                      <Link href={`/oficina/pedidos/${ev.solicitacao_id}`} className="text-xs text-gray-600 hover:text-gray-700 font-medium">{t('verSolicitacao')}</Link>
                    </>
                  )}
                  {ev.tipo === 'externo' && !isMecanico && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); startEdit(ev); }} className="text-xs text-blue-600 hover:text-blue-700 font-medium">{t('editar')}</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteEvent(ev.id); }} className="text-xs text-red-600 hover:text-red-700 font-medium">{t('excluir')}</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isMecanico ? t('minhaAgenda') : t('agenda')}</h1>
          <p className="text-gray-600 mt-1">{isMecanico ? t('subtituloMecanico') : t('subtituloGeral')}</p>
        </div>
        {/* celular: 4 visoes em grade de largura total (antes a ultima saia da tela - teste 09/10, ponto 10) */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-4 sm:mt-0 w-full sm:w-auto">
          <div className="grid grid-cols-3 sm:flex rounded-lg border border-gray-200 overflow-hidden w-full sm:w-auto">
            {(['quadro', 'month', 'list'] as const).map((m) => (
              <button key={m} onClick={() => setViewMode(m)} aria-pressed={viewMode === m}
                className={`px-2 sm:px-3 py-2 text-sm text-center whitespace-nowrap ${viewMode === m ? 'bg-primary-600 text-white' : 'bg-white text-gray-600'}`}>
                {m === 'quadro' ? t('viewQuadro') : m === 'month' ? t('viewMes') : t('viewLista')}
              </button>
            ))}
          </div>
          {!isMecanico && (
            <Link href="/oficina/checkin" className="btn-primary !py-2 w-full sm:w-auto text-center">{t('carroSemPedido')}</Link>
          )}
        </div>
      </div>

      {showForm && !isMecanico && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('novoEventoExterno')}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Cliente */}
            <div>
              <label htmlFor="c06c6-8" className="block text-sm font-medium text-gray-700 mb-1">{t('nomeCliente')}</label>
              <input id="c06c6-8" type="text" className="input-field" placeholder={t('placeholderNomeCliente')} value={formData.cliente_nome} onChange={(e) => setFormData({ ...formData, cliente_nome: e.target.value })} />
            </div>
            <div>
              <label htmlFor="c06c6-9" className="block text-sm font-medium text-gray-700 mb-1">{t('placa')}</label>
              <input id="c06c6-9" type="text" className="input-field" placeholder={exemploPlaca(locale)} value={formData.placa} onChange={(e) => setFormData({ ...formData, placa: e.target.value.toUpperCase() })} />
            </div>
            {/* Veículo - FIPE */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('veiculoFipe')}</label>
              <FipeAutocomplete
                value={{ tipo: formData.fipe_tipo, marca: formData.fipe_marca, modelo: formData.fipe_modelo, ano: formData.fipe_ano }}
                onChange={(fipe) => setFormData({ ...formData, fipe_tipo: fipe.tipo, fipe_marca: fipe.marca, fipe_modelo: fipe.modelo, fipe_ano: fipe.ano })}
              />
            </div>
            {/* Tipo de serviço */}
            <div>
              <label htmlFor="c06c6-10" className="block text-sm font-medium text-gray-700 mb-1">{t('tipoServico')}</label>
              <select id="c06c6-10" className="input-field" value={formData.tipo_servico} onChange={(e) => setFormData({ ...formData, tipo_servico: e.target.value })}>
                {TIPOS_SERVICO.map((tipo) => (
                  <option key={tipo.value} value={tipo.value}>{tipo.icon} {tc(`tiposServico.${tipo.value}`)}</option>
                ))}
              </select>
            </div>
            {/* Mecânico */}
            <div>
              <label htmlFor="c06c6-11" className="block text-sm font-medium text-gray-700 mb-1">{t('mecanicoResponsavel')}</label>
              <select id="c06c6-11" className="input-field" value={formData.funcionario_id} onChange={(e) => setFormData({ ...formData, funcionario_id: e.target.value })}>
                <option value="">{t('nenhum')}</option>
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>{nomeFuncionario(f)}{f.especialidade ? ` (${f.especialidade})` : ''}</option>
                ))}
              </select>
            </div>
            {/* Datas e horários */}
            <div>
              <label htmlFor="c06c6-12" className="block text-sm font-medium text-gray-700 mb-1">{t('formDataCheckin')}</label>
              <input id="c06c6-12" type="date" className="input-field" value={formData.data_inicio} onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} />
            </div>
            <div>
              <label htmlFor="c06c6-13" className="block text-sm font-medium text-gray-700 mb-1">{t('horarioCheckin')}</label>
              <input id="c06c6-13" type="time" className="input-field" value={formData.hora_inicio} onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })} />
            </div>
            <div>
              <label htmlFor="c06c6-14" className="block text-sm font-medium text-gray-700 mb-1">{t('formDataPrevEntrega')}</label>
              <input id="c06c6-14" type="date" className="input-field" value={formData.data_fim} onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })} />
            </div>
            <div>
              <label htmlFor="c06c6-15" className="block text-sm font-medium text-gray-700 mb-1">{t('horarioPrevEntrega')}</label>
              <input id="c06c6-15" type="time" className="input-field" value={formData.hora_fim} onChange={(e) => setFormData({ ...formData, hora_fim: e.target.value })} />
            </div>
            {/* Descrição */}
            <div className="sm:col-span-2">
              <label htmlFor="c06c6-16" className="block text-sm font-medium text-gray-700 mb-1">{t('descricaoOpcional')}</label>
              <input id="c06c6-16" type="text" className="input-field" placeholder={t('placeholderDetalhesServico')} value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} />
            </div>
            {/* Cor */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('formCor')}</label>
              <div className="flex gap-2">{CORES_AGENDA.map((c) => (
                <button key={c} type="button" onClick={() => setFormData({ ...formData, cor: c })}
                  className={`w-8 h-8 rounded-full transition-transform ${formData.cor === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : ''}`} style={{ backgroundColor: c }} />
              ))}</div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowForm(false)} className="btn-secondary">{t('cancelar')}</button>
            <button onClick={handleAddEvent} disabled={!formData.data_inicio || !formData.data_fim} className="btn-primary disabled:opacity-50">{t('adicionar')}</button>
          </div>
        </div>
      )}

      {viewMode === 'month' && Object.keys(monthlyStats).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs text-gray-500 py-1">{t('checkinsEsteMes')}:</span>
          {Object.entries(monthlyStats).map(([tipo, n]) => (
            <span key={tipo} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium">{tc.has(`tiposServico.${tipo}`) ? tc(`tiposServico.${tipo}`) : tipo}: {n}</span>
          ))}
        </div>
      )}

      {viewMode === 'quadro' && oficina ? (
        <div className="space-y-4">
          <QuadroOficina
            eventos={allEventos}
            todosEventos={eventos}
            funcionarios={funcionarios}
            boxes={boxes}
            oficina={oficina as any}
            ehDono={ehDono}
            meuFuncionarioId={funcionario?.id ?? null}
            onAlterado={() => { refresh(); carregarBoxes(); setIndicadores((n) => n + 1); }}
            onAbrirDia={(ymd, ev) => router.push(`/oficina/hoje?dia=${ymd}&ev=${ev.id}`)}
          />
          {!isMecanico && (
            <details className="group">
              <summary className="cursor-pointer select-none text-sm font-medium text-primary-700 py-2">{t('quadroIndicadores')}</summary>
              <div className="mt-2"><CapacidadeResumo atualizar={indicadores} /></div>
            </details>
          )}
        </div>
      ) : viewMode === 'month' ? (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h2 className="text-xl font-semibold text-gray-900">{MESES[month]} {year}</h2>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIAS_SEMANA.map((d) => <div key={d} className="text-center text-sm font-medium text-gray-500 py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`} className="min-h-[80px] sm:min-h-[100px] bg-gray-50 rounded-lg" />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const g = getGroups(ds);
              const isToday = ds === diaNaOficina(new Date(), (oficina as any)?.pais ?? null);
              return (
                <button key={day} onClick={() => router.push(`/oficina/hoje?dia=${ds}`)}
                  className={`min-h-[80px] sm:min-h-[100px] p-1 sm:p-2 rounded-lg text-left transition-colors ${isToday ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'} border border-gray-100`}>
                  <span className={`text-sm font-medium ${isToday ? 'text-primary-600' : 'text-gray-900'}`}>{day}</span>
                  <div className="mt-1 space-y-0.5">
                    {g.checkinPendente.length > 0 && <div className="text-[10px] sm:text-xs truncate rounded px-1 py-0.5 bg-green-100 text-green-800 font-medium">{g.checkinPendente.length} {t('pendente')}</div>}
                    {g.checkinFeito.length > 0 && <div className="text-[10px] sm:text-xs truncate rounded px-1 py-0.5 bg-blue-100 text-blue-800 font-medium">{g.checkinFeito.length} {t('feito')}</div>}
                    {g.entregue.length > 0 && <div className="text-[10px] sm:text-xs truncate rounded px-1 py-0.5 bg-gray-200 text-gray-700 font-medium">{g.entregue.length} {t('statusEntregue')}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const upcoming = allEventos.filter(e => e.status !== 'concluido')
              .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());
            if (upcoming.length === 0) return <div className="card text-center py-12"><p className="text-gray-500">{t('nenhumEventoAgendado')}</p></div>;
            const groups: Record<string, typeof upcoming> = {};
            upcoming.forEach((ev) => { const d = dataLocalDe(ev.data_inicio, (oficina as any)?.pais ?? null); if (!groups[d]) groups[d] = []; groups[d].push(ev); });
            return Object.entries(groups).map(([date, evts]) => {
              const d = new Date(date + 'T12:00:00');
              return (
                <div key={date}>
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">
                    {d.getDate().toString().padStart(2,'0')}/{(d.getMonth()+1).toString().padStart(2,'0')}/{d.getFullYear()} - {DIAS_SEMANA[d.getDay()]}
                  </h3>
                  <div className="space-y-2">
                    {evts.map((ev) => renderCard(ev, ev.status === 'agendado' ? 'pendente' : 'feito'))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
      {erroEntrega && (
        <div role="alert" className="fixed inset-x-3 bottom-4 z-50 sm:left-auto sm:right-6 sm:max-w-md bg-red-50 border border-red-300 shadow-lg rounded-xl p-4 text-sm text-red-800 flex items-start gap-3">
          <span className="flex-1">{t('erroEntrega')}</span>
          <button type="button" onClick={() => setErroEntrega(null)} aria-label="OK" className="text-red-700 font-bold">×</button>
        </div>
      )}
      {confirmarEntrega && (
        <div className="fixed inset-x-3 bottom-4 z-50 sm:left-auto sm:right-6 sm:max-w-md bg-white border border-orange-300 shadow-lg rounded-xl p-4" role="alertdialog">
          <p className="text-sm text-gray-900 mb-3">{t('confirmarEntregaTexto')}</p>
          <div className="flex gap-2">
            <button onClick={() => { const ev = confirmarEntrega; setConfirmarEntrega(null); handleCheckOut(ev); }} className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg">{t('confirmarEntregaSim')}</button>
            <button onClick={() => setConfirmarEntrega(null)} className="btn-secondary !py-2 text-sm">{t('cancelarAntecipado')}</button>
          </div>
        </div>
      )}
      {antecipar && (
        <div className="fixed inset-x-3 bottom-4 z-50 sm:left-auto sm:right-6 sm:max-w-md bg-white border border-amber-300 shadow-lg rounded-xl p-4" role="alertdialog">
          <p className="text-sm text-amber-900 mb-3">{t('checkinAntecipadoTexto', { data: new Date(antecipar.data).toLocaleString(INTL_LOCALE[locale] || 'en-GB', { dateStyle: 'short', timeStyle: 'short' }) })}</p>
          <div className="flex gap-2">
            <button onClick={() => handleCheckIn(antecipar.ev, antecipar.funcId, true, antecipar.boxId)} className="btn-primary !py-2 text-sm flex-1">{t('checkinAntecipadoConfirmar')}</button>
            <button onClick={() => setAntecipar(null)} className="btn-secondary !py-2 text-sm">{t('cancelarAntecipado')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
