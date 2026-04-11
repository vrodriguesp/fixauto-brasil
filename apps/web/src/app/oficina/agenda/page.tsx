'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAgenda } from '@/hooks/use-agenda';
import { useAuth } from '@/lib/auth-context';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { supabase } from '@/lib/supabase';
import { CORES_AGENDA } from '@fixauto/shared';

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Helper: get label for event (plate or client surname)
function getEventLabel(ev: any): string {
  const sol = ev.solicitacao;
  const veiculo = sol?.veiculo;
  const cliente = sol?.cliente;
  if (veiculo?.placa) return veiculo.placa;
  if (cliente?.nome) {
    const parts = cliente.nome.split(' ');
    return parts[parts.length - 1]; // surname
  }
  return ev.titulo || 'Evento';
}

function getServiceType(ev: any): string {
  return ev.solicitacao?.tipo || 'outro';
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
  const [funcionarios, setFuncionarios] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    data_inicio: '',
    hora_inicio: '08:00',
    data_fim: '',
    hora_fim: '17:00',
    tipo: 'externo' as 'plataforma' | 'externo',
    cor: '#3B82F6',
  });

  // Load funcionarios for mechanic assignment
  useEffect(() => {
    if (!oficina) return;
    supabase
      .from('funcionarios')
      .select('*, profile:profiles(nome)')
      .eq('oficina_id', oficina.id)
      .eq('ativo', true)
      .then(({ data }) => { if (data) setFuncionarios(data); });
  }, [oficina]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // Filter out concluded + de-duplicate platform events by solicitacao_id (keep most recent)
  const activeEventos = useMemo(() => {
    const filtered = eventos.filter((e) => e.status !== 'concluido');
    // De-duplicate: for platform events with same solicitacao_id, keep only the latest
    const seen = new Map<string, typeof filtered[0]>();
    const result: typeof filtered = [];
    for (const ev of filtered) {
      if (ev.tipo === 'plataforma' && ev.solicitacao_id) {
        const existing = seen.get(ev.solicitacao_id);
        if (!existing || new Date(ev.created_at) > new Date(existing.created_at)) {
          seen.set(ev.solicitacao_id, ev);
        }
      } else {
        result.push(ev);
      }
    }
    return [...result, ...seen.values()];
  }, [eventos]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getCheckInsForDate = (dateStr: string) =>
    activeEventos.filter((e) => e.data_inicio.slice(0, 10) === dateStr);

  const getCheckOutsForDate = (dateStr: string) =>
    activeEventos.filter((e) => e.data_fim.slice(0, 10) === dateStr);

  const handleAddEvent = async () => {
    if (!formData.titulo || !formData.data_inicio || !formData.data_fim) return;
    await addEvento({
      titulo: formData.titulo,
      descricao: formData.descricao || undefined,
      data_inicio: `${formData.data_inicio}T${formData.hora_inicio}:00Z`,
      data_fim: `${formData.data_fim}T${formData.hora_fim}:00Z`,
      tipo: formData.tipo,
      cor: formData.cor,
    });
    setShowForm(false);
    setFormData({ titulo: '', descricao: '', data_inicio: '', hora_inicio: '08:00', data_fim: '', hora_fim: '17:00', tipo: 'externo', cor: '#3B82F6' });
  };

  const handleConfirmCheckIn = async (evento: any, funcId?: string) => {
    setUpdatingId(evento.id);
    const updates: any = { status: 'em_andamento' };
    if (funcId) updates.funcionario_id = funcId;
    await updateEvento(evento.id, updates);
    // Create initial etapa
    await supabase.from('manutencao_etapas').insert({
      agenda_id: evento.id,
      funcionario_id: funcId || null,
      status: 'recebido',
      observacao: 'Veículo recebido na oficina',
    });
    await refresh();
    setUpdatingId(null);
    setAssigningId(null);
  };

  const handleConfirmCheckOut = async (evento: any) => {
    setUpdatingId(evento.id);
    await fetch('/api/confirmar-entrega', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventoId: evento.id, solicitacaoId: evento.solicitacao_id }),
    });
    await supabase.from('manutencao_etapas').insert({
      agenda_id: evento.id,
      status: 'entregue',
      observacao: 'Veículo entregue ao cliente',
    });
    await updateEvento(evento.id, { status: 'concluido' });
    refreshSolicitacoes();
    setUpdatingId(null);
  };

  // Monthly aggregation: check-ins by service type
  const monthlyStats = useMemo(() => {
    const stats: Record<string, number> = {};
    activeEventos.forEach((e) => {
      const start = e.data_inicio.slice(0, 7); // YYYY-MM
      const currentMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
      if (start === currentMonth) {
        const tipo = getServiceType(e);
        stats[tipo] = (stats[tipo] || 0) + 1;
      }
    });
    return stats;
  }, [activeEventos, year, month]);

  // Render check-in/out event detail
  const renderEventCard = (ev: any, context: 'checkin' | 'checkout') => {
    const label = getEventLabel(ev);
    const sol = ev.solicitacao;
    const veiculo = sol?.veiculo;
    const cliente = sol?.cliente;
    const isUpdating = updatingId === ev.id;
    const isAssigning = assigningId === ev.id;

    return (
      <div key={ev.id} className="p-3 rounded-lg bg-gray-50 border border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900 text-sm">
                {context === 'checkin' ? 'Check-in' : 'Check-out'} {label}
              </p>
              {ev.tipo === 'plataforma' && (
                <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded">
                  {sol?.tipo || 'Serviço'}
                </span>
              )}
            </div>
            {veiculo && (
              <p className="text-xs text-gray-600 mt-0.5">
                {veiculo.fipe_marca} {veiculo.fipe_modelo}
                {veiculo.placa ? ` - ${veiculo.placa}` : ''}
              </p>
            )}
            {cliente && (
              <p className="text-xs text-gray-500">{cliente.nome}</p>
            )}
            {ev.funcionario?.profile?.nome && (
              <p className="text-xs text-gray-400 mt-0.5">Mec: {ev.funcionario.profile.nome}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {context === 'checkin' && ev.status === 'agendado' && (
              isAssigning ? (
                <div className="flex items-center gap-1">
                  <select
                    className="input-field !py-1 !px-2 text-xs !w-auto"
                    defaultValue=""
                    onChange={(e) => handleConfirmCheckIn(ev, e.target.value || undefined)}
                  >
                    <option value="">Sem mecânico</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>{f.profile?.nome}</option>
                    ))}
                  </select>
                  <button onClick={() => setAssigningId(null)} className="text-xs text-gray-400">x</button>
                </div>
              ) : (
                <button
                  onClick={() => setAssigningId(ev.id)}
                  disabled={isUpdating}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {isUpdating ? '...' : 'Check-in'}
                </button>
              )
            )}
            {context === 'checkout' && ev.status === 'em_andamento' && (
              <button
                onClick={() => handleConfirmCheckOut(ev)}
                disabled={isUpdating}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {isUpdating ? '...' : 'Entrega'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-gray-600 mt-1">Check-ins e check-outs agendados</p>
        </div>
        <div className="flex items-center gap-2 mt-4 sm:mt-0">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['month', 'day', 'list'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-2 text-sm ${viewMode === mode ? 'bg-primary-600 text-white' : 'bg-white text-gray-600'}`}
              >
                {mode === 'month' ? 'Mês' : mode === 'day' ? 'Dia' : 'Lista'}
              </button>
            ))}
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary !py-2">
            + Evento
          </button>
        </div>
      </div>

      {/* New event form */}
      {showForm && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Novo Evento</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
              <input type="text" className="input-field" placeholder="Ex: Revisão - Honda Civic" value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data início</label>
              <input type="date" className="input-field" value={formData.data_inicio} onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data fim</label>
              <input type="date" className="input-field" value={formData.data_fim} onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
              <div className="flex gap-2">
                {CORES_AGENDA.map((cor) => (
                  <button key={cor} type="button" onClick={() => setFormData({ ...formData, cor })} className={`w-8 h-8 rounded-full transition-transform ${formData.cor === cor ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : ''}`} style={{ backgroundColor: cor }} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
            <button onClick={handleAddEvent} className="btn-primary">Adicionar</button>
          </div>
        </div>
      )}

      {/* Monthly stats */}
      {viewMode === 'month' && Object.keys(monthlyStats).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs text-gray-500 py-1">Check-ins este mês:</span>
          {Object.entries(monthlyStats).map(([tipo, count]) => (
            <span key={tipo} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium">
              {tipo}: {count}
            </span>
          ))}
        </div>
      )}

      {viewMode === 'month' ? (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h2 className="text-xl font-semibold text-gray-900">{MESES[month]} {year}</h2>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIAS_SEMANA.map((dia) => (
              <div key={dia} className="text-center text-sm font-medium text-gray-500 py-2">{dia}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`empty-${i}`} className="min-h-[80px] sm:min-h-[100px] bg-gray-50 rounded-lg" />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const checkIns = getCheckInsForDate(dateStr);
              const checkOuts = getCheckOutsForDate(dateStr);
              const today = new Date();
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

              return (
                <button
                  key={day}
                  onClick={() => { setCurrentDate(new Date(year, month, day)); setViewMode('day'); }}
                  className={`min-h-[80px] sm:min-h-[100px] p-1 sm:p-2 rounded-lg text-left transition-colors ${
                    isToday ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
                  } border border-gray-100`}
                >
                  <span className={`text-sm font-medium ${isToday ? 'text-primary-600' : 'text-gray-900'}`}>{day}</span>
                  <div className="mt-1 space-y-0.5">
                    {checkIns.length > 0 && (
                      <div className="text-[10px] sm:text-xs truncate rounded px-1 py-0.5 bg-green-100 text-green-800 font-medium">
                        {checkIns.length} Check-in
                      </div>
                    )}
                    {checkOuts.length > 0 && (
                      <div className="text-[10px] sm:text-xs truncate rounded px-1 py-0.5 bg-orange-100 text-orange-800 font-medium">
                        {checkOuts.length} Entrega
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : viewMode === 'day' ? (
        /* Day view - only check-in and check-out */
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setCurrentDate(new Date(year, month, currentDate.getDate() - 1))} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h2 className="text-xl font-semibold text-gray-900">
              {currentDate.getDate()} de {MESES[month]} {year} - {DIAS_SEMANA[currentDate.getDay()]}
            </h2>
            <button onClick={() => setCurrentDate(new Date(year, month, currentDate.getDate() + 1))} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          {(() => {
            const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
            const chegadas = getCheckInsForDate(dayStr);
            const saidas = getCheckOutsForDate(dayStr);

            return (
              <>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-4 bg-green-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-700">{chegadas.length}</p>
                    <p className="text-xs text-green-600">Check-in</p>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-orange-700">{saidas.length}</p>
                    <p className="text-xs text-orange-600">Check-out</p>
                  </div>
                </div>

                {chegadas.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="inline-flex items-center justify-center w-6 h-6 bg-green-100 rounded-full">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14" />
                        </svg>
                      </span>
                      <h4 className="font-semibold text-green-800 text-sm uppercase tracking-wide">
                        Check-in ({chegadas.length})
                      </h4>
                    </div>
                    <div className="space-y-2">
                      {chegadas.map((ev) => renderEventCard(ev, 'checkin'))}
                    </div>
                  </div>
                )}

                {saidas.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="inline-flex items-center justify-center w-6 h-6 bg-orange-100 rounded-full">
                        <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </span>
                      <h4 className="font-semibold text-orange-800 text-sm uppercase tracking-wide">
                        Check-out / Entrega ({saidas.length})
                      </h4>
                    </div>
                    <div className="space-y-2">
                      {saidas.map((ev) => renderEventCard(ev, 'checkout'))}
                    </div>
                  </div>
                )}

                {chegadas.length === 0 && saidas.length === 0 && (
                  <p className="text-center text-gray-500 py-8">Nenhum check-in ou check-out neste dia</p>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        /* List view - clean, grouped by date */
        <div className="space-y-4">
          {(() => {
            // Group events by check-in date, sorted
            const upcoming = [...activeEventos]
              .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());

            if (upcoming.length === 0) {
              return (
                <div className="card text-center py-12">
                  <p className="text-gray-500">Nenhum evento agendado</p>
                </div>
              );
            }

            // Group by date
            const groups: Record<string, typeof upcoming> = {};
            upcoming.forEach((ev) => {
              const date = ev.data_inicio.slice(0, 10);
              if (!groups[date]) groups[date] = [];
              groups[date].push(ev);
            });

            return Object.entries(groups).map(([date, evts]) => {
              const d = new Date(date + 'T12:00:00');
              const dateLabel = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} - ${DIAS_SEMANA[d.getDay()]}`;

              return (
                <div key={date}>
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">{dateLabel}</h3>
                  <div className="space-y-2">
                    {evts.map((ev) => {
                      const label = getEventLabel(ev);
                      const sol = ev.solicitacao;
                      const veiculo = sol?.veiculo;
                      const cliente = sol?.cliente;
                      const isUpdating = updatingId === ev.id;

                      return (
                        <div key={ev.id} className="card !p-3 flex items-center justify-between" style={{ borderLeft: `4px solid ${ev.cor}` }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-gray-900 text-sm">
                                {ev.tipo === 'plataforma' ? `Check-in ${label}` : ev.titulo}
                              </span>
                              {sol?.tipo && (
                                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{sol.tipo}</span>
                              )}
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                ev.status === 'agendado' ? 'bg-yellow-100 text-yellow-800' :
                                ev.status === 'em_andamento' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {ev.status === 'agendado' ? 'Agendado' : ev.status === 'em_andamento' ? 'Em serviço' : ev.status}
                              </span>
                            </div>
                            {veiculo && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {veiculo.fipe_marca} {veiculo.fipe_modelo} {cliente ? `- ${cliente.nome}` : ''}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-0.5">
                              Entrega prevista: {new Date(ev.data_fim).toLocaleDateString('pt-BR')}
                              {ev.funcionario?.profile?.nome && ` | Mec: ${ev.funcionario.profile.nome}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            {ev.status === 'agendado' && (
                              <button
                                onClick={() => handleConfirmCheckIn(ev)}
                                disabled={isUpdating}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-medium rounded-lg"
                              >
                                Check-in
                              </button>
                            )}
                            {ev.status === 'em_andamento' && (
                              <button
                                onClick={() => handleConfirmCheckOut(ev)}
                                disabled={isUpdating}
                                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white text-xs font-medium rounded-lg"
                              >
                                Entrega
                              </button>
                            )}
                            <button
                              onClick={() => removeEvento(ev.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
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
