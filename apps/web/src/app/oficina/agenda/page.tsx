'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAgenda } from '@/hooks/use-agenda';
import { useAuth } from '@/lib/auth-context';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { supabase } from '@/lib/supabase';
import { CORES_AGENDA, TIPOS_SERVICO } from '@fixauto/shared';

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay(); }

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function getEventLabel(ev: any): string {
  const v = ev.solicitacao?.veiculo;
  const c = ev.solicitacao?.cliente;
  if (v?.placa) return v.placa;
  if (c?.nome) return c.nome.split(' ').pop();
  return ev.titulo || 'Evento';
}

function deliveryNote(ev: any): string | null {
  if (ev.status !== 'concluido') return null;
  const prevista = ev.data_fim_prevista || null;
  if (!prevista) return null;
  const real = new Date(ev.data_fim);
  const plan = new Date(prevista);
  const diff = Math.round((real.getTime() - plan.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'No prazo';
  if (diff < 0) return `${Math.abs(diff)}d antes do previsto`;
  return `${diff}d depois do previsto`;
}

export default function AgendaPage() {
  const { eventos, add: addEvento, update: updateEvento, remove: removeEvento, refresh } = useAgenda();
  const { refresh: refreshSolicitacoes } = useSolicitacoes();
  const { oficina } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<'month' | 'day' | 'list'>('month');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [funcionarios, setFuncionarios] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    cliente_nome: '',
    placa: '',
    marca: '',
    modelo: '',
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
    return [...others, ...Array.from(seen.values())];
  }, [eventos]);

  // For a given date, get 3 groups:
  // - Check-in pendente: data_inicio = date AND status = agendado
  // - Check-in feito: data_inicio = date AND status IN (em_andamento, concluido)
  // - Entregue: data_fim = date AND status = concluido
  const getGroups = (dateStr: string) => {
    const checkinPendente = allEventos.filter(e => e.data_inicio.slice(0, 10) === dateStr && e.status === 'agendado');
    // Check-in feito: todos que fizeram check-in nesse dia (em_andamento ou concluido) - sempre visivel
    const checkinFeito = allEventos.filter(e => e.data_inicio.slice(0, 10) === dateStr && (e.status === 'em_andamento' || e.status === 'concluido'));
    // Entregue: todos entregues nesse dia
    const entregue = allEventos.filter(e => e.data_fim.slice(0, 10) === dateStr && e.status === 'concluido');
    return { checkinPendente, checkinFeito, entregue };
  };

  const handleAddEvent = async () => {
    if (!formData.data_inicio || !formData.data_fim) return;
    const tipoLabel = TIPOS_SERVICO.find(t => t.value === formData.tipo_servico)?.label || formData.tipo_servico;
    const titulo = `${tipoLabel}${formData.placa ? ' - ' + formData.placa : ''}${formData.cliente_nome ? ' - ' + formData.cliente_nome : ''}`;
    const descricao = [
      formData.marca && formData.modelo ? `${formData.marca} ${formData.modelo}` : '',
      formData.descricao,
    ].filter(Boolean).join(' | ');

    const result = await addEvento({
      titulo,
      descricao: descricao || undefined,
      data_inicio: `${formData.data_inicio}T${formData.hora_inicio}:00Z`,
      data_fim: `${formData.data_fim}T${formData.hora_fim}:00Z`,
      tipo: 'externo',
      cor: formData.cor,
    });

    // Assign mechanic if selected
    if (formData.funcionario_id && result?.data?.id) {
      await supabase.from('agenda').update({ funcionario_id: formData.funcionario_id }).eq('id', result.data.id);
    }

    setShowForm(false);
    setFormData({ cliente_nome: '', placa: '', marca: '', modelo: '', tipo_servico: 'mecanica', descricao: '', data_inicio: '', hora_inicio: '08:00', data_fim: '', hora_fim: '18:00', funcionario_id: '', cor: '#3B82F6' });
    await refresh();
  };

  const handleCheckIn = async (ev: any, funcId?: string) => {
    setUpdatingId(ev.id);
    const updates: any = { status: 'em_andamento' };
    if (funcId) updates.funcionario_id = funcId;
    await updateEvento(ev.id, updates);
    await supabase.from('manutencao_etapas').insert({
      agenda_id: ev.id, funcionario_id: funcId || null,
      status: 'recebido', observacao: 'Veículo recebido na oficina',
    });
    await refresh();
    setUpdatingId(null);
    setAssigningId(null);
  };

  const handleCheckOut = async (ev: any) => {
    setUpdatingId(ev.id);
    await fetch('/api/confirmar-entrega', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventoId: ev.id, solicitacaoId: ev.solicitacao_id }),
    });
    await supabase.from('manutencao_etapas').insert({
      agenda_id: ev.id, status: 'entregue', observacao: 'Veículo entregue ao cliente',
    });
    await refresh();
    refreshSolicitacoes();
    setUpdatingId(null);
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
      data_inicio: ev.data_inicio.slice(0, 10),
      hora_inicio: ev.data_inicio.slice(11, 16) || '08:00',
      data_fim: ev.data_fim.slice(0, 10),
      hora_fim: ev.data_fim.slice(11, 16) || '18:00',
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
      data_inicio: `${editData.data_inicio}T${editData.hora_inicio}:00Z`,
      data_fim: `${editData.data_fim}T${editData.hora_fim}:00Z`,
      funcionario_id: editData.funcionario_id || null,
      cor: editData.cor,
    });
    setEditingId(null);
    setEditData(null);
    setUpdatingId(null);
  };

  const handleDeleteEvent = async (evId: string) => {
    if (!confirm('Excluir este evento?')) return;
    await removeEvento(evId);
  };

  const STATUS_LABEL: Record<string, string> = { agendado: 'Agendado', em_andamento: 'Em andamento', concluido: 'Entregue' };

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
      ? `Check-in ${eventName}`
      : type === 'feito'
      ? `Check-in feito ${eventName}`
      : `Entregue ${eventName}`;

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
                {sol?.tipo && <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded">{sol.tipo}</span>}
                {type === 'feito' && (
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    ev.status === 'concluido' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>{STATUS_LABEL[ev.status] || ev.status}</span>
                )}
              </div>
              {v && <p className="text-xs text-gray-600 mt-0.5">{v.fipe_marca} {v.fipe_modelo}{placa ? ` - ${placa}` : ''}</p>}
              {c && <p className="text-xs text-gray-500">{c.nome}</p>}
              {note && <p className={`text-xs mt-1 font-medium ${note.includes('antes') ? 'text-green-600' : note.includes('depois') ? 'text-red-600' : 'text-gray-500'}`}>{note}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {type === 'pendente' && (
                assigningId === ev.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <select className="input-field !py-1 !px-2 text-xs !w-auto" defaultValue=""
                      onChange={(e) => handleCheckIn(ev, e.target.value || undefined)}>
                      <option value="">Sem mecânico</option>
                      {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.profile?.nome}</option>)}
                    </select>
                    <button onClick={(e) => { e.stopPropagation(); setAssigningId(null); }} className="text-xs text-gray-400">x</button>
                  </div>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); setAssigningId(ev.id); }} disabled={isUpdating}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-medium rounded-lg">
                    {isUpdating ? '...' : 'Check-in'}
                  </button>
                )
              )}
              {type === 'feito' && ev.status === 'em_andamento' && (
                <button onClick={(e) => { e.stopPropagation(); handleCheckOut(ev); }} disabled={isUpdating}
                  className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white text-xs font-medium rounded-lg">
                  {isUpdating ? '...' : 'Entrega'}
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
                    <label className="block text-xs font-medium text-gray-500 mb-1">Título</label>
                    <input type="text" className="input-field !py-1.5 text-sm" value={editData.titulo} onChange={(e) => setEditData({ ...editData, titulo: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Data check-in</label>
                    <input type="date" className="input-field !py-1.5 text-sm" value={editData.data_inicio} onChange={(e) => setEditData({ ...editData, data_inicio: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Horário</label>
                    <input type="time" className="input-field !py-1.5 text-sm" value={editData.hora_inicio} onChange={(e) => setEditData({ ...editData, hora_inicio: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Data prev. entrega</label>
                    <input type="date" className="input-field !py-1.5 text-sm" value={editData.data_fim} onChange={(e) => setEditData({ ...editData, data_fim: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Horário</label>
                    <input type="time" className="input-field !py-1.5 text-sm" value={editData.hora_fim} onChange={(e) => setEditData({ ...editData, hora_fim: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Mecânico</label>
                    <select className="input-field !py-1.5 text-sm" value={editData.funcionario_id} onChange={(e) => setEditData({ ...editData, funcionario_id: e.target.value })}>
                      <option value="">Nenhum</option>
                      {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.profile?.nome}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Descrição</label>
                    <input type="text" className="input-field !py-1.5 text-sm" value={editData.descricao} onChange={(e) => setEditData({ ...editData, descricao: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Cor</label>
                    <div className="flex gap-2">{CORES_AGENDA.map((co) => (
                      <button key={co} type="button" onClick={() => setEditData({ ...editData, cor: co })}
                        className={`w-6 h-6 rounded-full transition-transform ${editData.cor === co ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : ''}`} style={{ backgroundColor: co }} />
                    ))}</div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => { setEditingId(null); setEditData(null); }} className="btn-secondary !py-1.5 !px-3 text-xs">Cancelar</button>
                  <button onClick={() => handleSaveEdit(ev.id)} disabled={isUpdating} className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-50">
                    {isUpdating ? '...' : 'Salvar'}
                  </button>
                </div>
              </div>
            ) : (
              /* View mode */
              <div className="space-y-2">
                {c && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Cliente</p>
                    <p className="text-sm text-gray-900">{c.nome}</p>
                    {c.telefone && <a href={`tel:${c.telefone}`} className="text-xs text-primary-600 hover:underline">{c.telefone}</a>}
                  </div>
                )}
                {v && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Veículo</p>
                    <p className="text-sm text-gray-900">{v.fipe_marca} {v.fipe_modelo} {v.fipe_ano || ''}</p>
                    {v.placa && <p className="text-xs text-gray-600">Placa: <span className="font-mono">{v.placa}</span></p>}
                  </div>
                )}
                {!c && !v && ev.descricao && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Descrição</p>
                    <p className="text-xs text-gray-700">{ev.descricao}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase">Datas</p>
                  <p className="text-xs text-gray-700">Check-in: {new Date(ev.data_inicio).toLocaleDateString('pt-BR')} {new Date(ev.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="text-xs text-gray-700">Prev. entrega: {new Date(ev.data_fim_prevista || ev.data_fim).toLocaleDateString('pt-BR')} {new Date(ev.data_fim_prevista || ev.data_fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                  {ev.status === 'concluido' && <p className="text-xs text-gray-700">Entregue: {new Date(ev.data_fim).toLocaleDateString('pt-BR')}</p>}
                </div>
                {ev.funcionario?.profile?.nome && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Mecânico</p>
                    <p className="text-sm text-gray-900">{ev.funcionario.profile.nome}</p>
                  </div>
                )}
                {sol?.descricao && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Descrição</p>
                    <p className="text-xs text-gray-700">{sol.descricao}</p>
                  </div>
                )}
                <div className="pt-2 flex gap-2">
                  {ev.solicitacao_id && (
                    <>
                      <a href={`/oficina/mensagens/${ev.solicitacao_id}`} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Mensagem</a>
                      <a href={`/oficina/solicitacoes/${ev.solicitacao_id}`} className="text-xs text-gray-600 hover:text-gray-700 font-medium">Ver solicitação</a>
                    </>
                  )}
                  {ev.tipo === 'externo' && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); startEdit(ev); }} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Editar</button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteEvent(ev.id); }} className="text-xs text-red-600 hover:text-red-700 font-medium">Excluir</button>
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
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-gray-600 mt-1">Check-ins e entregas</p>
        </div>
        <div className="flex items-center gap-2 mt-4 sm:mt-0">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['month', 'day', 'list'] as const).map((m) => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-3 py-2 text-sm ${viewMode === m ? 'bg-primary-600 text-white' : 'bg-white text-gray-600'}`}>
                {m === 'month' ? 'Mês' : m === 'day' ? 'Dia' : 'Lista'}
              </button>
            ))}
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary !py-2">+ Evento</button>
        </div>
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Novo Evento Externo</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Cliente */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do cliente</label>
              <input type="text" className="input-field" placeholder="Ex: João Silva" value={formData.cliente_nome} onChange={(e) => setFormData({ ...formData, cliente_nome: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Placa</label>
              <input type="text" className="input-field" placeholder="ABC1D23" value={formData.placa} onChange={(e) => setFormData({ ...formData, placa: e.target.value.toUpperCase() })} />
            </div>
            {/* Veículo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
              <input type="text" className="input-field" placeholder="Ex: Fiat" value={formData.marca} onChange={(e) => setFormData({ ...formData, marca: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
              <input type="text" className="input-field" placeholder="Ex: Uno" value={formData.modelo} onChange={(e) => setFormData({ ...formData, modelo: e.target.value })} />
            </div>
            {/* Tipo de serviço */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de serviço</label>
              <select className="input-field" value={formData.tipo_servico} onChange={(e) => setFormData({ ...formData, tipo_servico: e.target.value })}>
                {TIPOS_SERVICO.map((t) => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>
            {/* Mecânico */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mecânico responsável</label>
              <select className="input-field" value={formData.funcionario_id} onChange={(e) => setFormData({ ...formData, funcionario_id: e.target.value })}>
                <option value="">Nenhum</option>
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>{f.profile?.nome}{f.especialidade ? ` (${f.especialidade})` : ''}</option>
                ))}
              </select>
            </div>
            {/* Datas e horários */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data check-in</label>
              <input type="date" className="input-field" value={formData.data_inicio} onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Horário check-in</label>
              <input type="time" className="input-field" value={formData.hora_inicio} onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data prev. entrega</label>
              <input type="date" className="input-field" value={formData.data_fim} onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Horário prev. entrega</label>
              <input type="time" className="input-field" value={formData.hora_fim} onChange={(e) => setFormData({ ...formData, hora_fim: e.target.value })} />
            </div>
            {/* Descrição */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição (opcional)</label>
              <input type="text" className="input-field" placeholder="Detalhes do serviço" value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} />
            </div>
            {/* Cor */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
              <div className="flex gap-2">{CORES_AGENDA.map((c) => (
                <button key={c} type="button" onClick={() => setFormData({ ...formData, cor: c })}
                  className={`w-8 h-8 rounded-full transition-transform ${formData.cor === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : ''}`} style={{ backgroundColor: c }} />
              ))}</div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
            <button onClick={handleAddEvent} disabled={!formData.data_inicio || !formData.data_fim} className="btn-primary disabled:opacity-50">Adicionar</button>
          </div>
        </div>
      )}

      {viewMode === 'month' && Object.keys(monthlyStats).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs text-gray-500 py-1">Check-ins este mês:</span>
          {Object.entries(monthlyStats).map(([t, n]) => (
            <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium">{t}: {n}</span>
          ))}
        </div>
      )}

      {viewMode === 'month' ? (
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
              const today = new Date();
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              return (
                <button key={day} onClick={() => { setCurrentDate(new Date(year, month, day)); setViewMode('day'); }}
                  className={`min-h-[80px] sm:min-h-[100px] p-1 sm:p-2 rounded-lg text-left transition-colors ${isToday ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'} border border-gray-100`}>
                  <span className={`text-sm font-medium ${isToday ? 'text-primary-600' : 'text-gray-900'}`}>{day}</span>
                  <div className="mt-1 space-y-0.5">
                    {g.checkinPendente.length > 0 && <div className="text-[10px] sm:text-xs truncate rounded px-1 py-0.5 bg-green-100 text-green-800 font-medium">{g.checkinPendente.length} Pendente</div>}
                    {g.checkinFeito.length > 0 && <div className="text-[10px] sm:text-xs truncate rounded px-1 py-0.5 bg-blue-100 text-blue-800 font-medium">{g.checkinFeito.length} Feito</div>}
                    {g.entregue.length > 0 && <div className="text-[10px] sm:text-xs truncate rounded px-1 py-0.5 bg-gray-200 text-gray-700 font-medium">{g.entregue.length} Entregue</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : viewMode === 'day' ? (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setCurrentDate(new Date(year, month, currentDate.getDate() - 1))} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h2 className="text-xl font-semibold text-gray-900">{currentDate.getDate()} de {MESES[month]} {year} - {DIAS_SEMANA[currentDate.getDay()]}</h2>
            <button onClick={() => setCurrentDate(new Date(year, month, currentDate.getDate() + 1))} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          {(() => {
            const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
            const g = getGroups(ds);
            const hasAnything = g.checkinPendente.length + g.checkinFeito.length + g.entregue.length > 0;
            return (
              <>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-green-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-700">{g.checkinPendente.length}</p>
                    <p className="text-xs text-green-600">Pendente</p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-blue-700">{g.checkinFeito.length}</p>
                    <p className="text-xs text-blue-600">Check-in feito</p>
                  </div>
                  <div className="p-4 bg-gray-100 rounded-lg text-center">
                    <p className="text-2xl font-bold text-gray-700">{g.entregue.length}</p>
                    <p className="text-xs text-gray-600">Entregue</p>
                  </div>
                </div>
                {g.checkinPendente.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-semibold text-green-800 text-sm uppercase tracking-wide mb-3">Check-in pendente ({g.checkinPendente.length})</h4>
                    <div className="space-y-2">{g.checkinPendente.map((ev) => renderCard(ev, 'pendente'))}</div>
                  </div>
                )}
                {g.checkinFeito.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-semibold text-blue-800 text-sm uppercase tracking-wide mb-3">Check-in feito ({g.checkinFeito.length})</h4>
                    <div className="space-y-2">{g.checkinFeito.map((ev) => renderCard(ev, 'feito'))}</div>
                  </div>
                )}
                {g.entregue.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">Entregue ({g.entregue.length})</h4>
                    <div className="space-y-2">{g.entregue.map((ev) => renderCard(ev, 'entregue'))}</div>
                  </div>
                )}
                {!hasAnything && <p className="text-center text-gray-500 py-8">Nenhum evento neste dia</p>}
              </>
            );
          })()}
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const upcoming = allEventos.filter(e => e.status !== 'concluido')
              .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());
            if (upcoming.length === 0) return <div className="card text-center py-12"><p className="text-gray-500">Nenhum evento agendado</p></div>;
            const groups: Record<string, typeof upcoming> = {};
            upcoming.forEach((ev) => { const d = ev.data_inicio.slice(0, 10); if (!groups[d]) groups[d] = []; groups[d].push(ev); });
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
    </div>
  );
}
