'use client';

import { useState } from 'react';
import { useAgenda } from '@/hooks/use-agenda';
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

const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  agendado: 'bg-yellow-100 text-yellow-800',
  em_andamento: 'bg-blue-100 text-blue-800',
  concluido: 'bg-green-100 text-green-800',
  cancelado: 'bg-red-100 text-red-800',
};

export default function AgendaPage() {
  const { eventos, add: addEvento, update: updateEvento, remove: removeEvento } = useAgenda();
  const { refresh: refreshSolicitacoes } = useSolicitacoes();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<'month' | 'day' | 'list'>('month');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // Filter out concluded events from calendar/day views
  const activeEventos = eventos.filter((e) => e.status !== 'concluido');

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return activeEventos.filter((e) => {
      const start = e.data_inicio.slice(0, 10);
      const end = e.data_fim.slice(0, 10);
      return dateStr >= start && dateStr <= end;
    });
  };

  const getEventsForDateStr = (dateStr: string) => {
    return activeEventos.filter((e) => {
      const start = e.data_inicio.slice(0, 10);
      const end = e.data_fim.slice(0, 10);
      return dateStr >= start && dateStr <= end;
    });
  };

  const getCheckInsForDate = (dateStr: string) => {
    return activeEventos.filter((e) => e.data_inicio.slice(0, 10) === dateStr);
  };

  const getCheckOutsForDate = (dateStr: string) => {
    return activeEventos.filter((e) => e.data_fim.slice(0, 10) === dateStr);
  };

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

  const handleDeleteEvent = (id: string) => {
    removeEvento(id);
  };

  const handleConfirmCheckIn = async (evento: any) => {
    setUpdatingId(evento.id);
    await updateEvento(evento.id, { status: 'em_andamento' });
    setUpdatingId(null);
  };

  const handleConfirmCheckOut = async (evento: any) => {
    setUpdatingId(evento.id);
    // Use server-side API to bypass RLS for notification insert
    await fetch('/api/confirmar-entrega', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventoId: evento.id, solicitacaoId: evento.solicitacao_id }),
    });
    await updateEvento(evento.id, { status: 'concluido' });
    refreshSolicitacoes();
    setUpdatingId(null);
  };

  const upcomingEvents = [...eventos]
    .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());

  // Helper to render event detail card with client/vehicle info and action buttons
  const renderEventDetail = (ev: any, context: 'checkin' | 'checkout' | 'general') => {
    const sol = ev.solicitacao;
    const cliente = sol?.cliente;
    const veiculo = sol?.veiculo;
    const isUpdating = updatingId === ev.id;

    return (
      <div key={ev.id} className="p-4 rounded-lg bg-gray-50 border border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: ev.cor }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900">
                  {ev.tipo === 'plataforma' && veiculo
                    ? `${sol?.tipo || ''} - ${veiculo.placa || 'S/P'} - ${cliente?.nome || ''} - ${veiculo.fipe_marca} ${veiculo.fipe_modelo}`
                    : ev.titulo}
                </p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ev.tipo === 'plataforma' ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-800'}`}>
                  {ev.tipo === 'plataforma' ? 'Plataforma' : 'Externo'}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[ev.status] || 'bg-gray-100 text-gray-800'}`}>
                  {STATUS_LABELS[ev.status] || ev.status}
                </span>
              </div>

              {ev.descricao && (
                <p className="text-sm text-gray-600 mt-1">{ev.descricao}</p>
              )}

              {/* Client and vehicle info for platform events */}
              {ev.tipo === 'plataforma' && cliente && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="font-medium">{cliente.nome}</span>
                  </div>
                  {cliente.telefone && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <a href={`tel:${cliente.telefone}`} className="text-primary-600 hover:underline">{cliente.telefone}</a>
                    </div>
                  )}
                  {veiculo && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10" />
                      </svg>
                      <span>{veiculo.fipe_marca} {veiculo.fipe_modelo} {veiculo.placa ? `- ${veiculo.placa}` : ''}</span>
                    </div>
                  )}
                  {sol.descricao && (
                    <div className="flex items-start gap-2 text-sm text-gray-700 mt-1">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="italic">{sol.descricao}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Timestamps */}
              <p className="text-xs text-gray-500 mt-2">
                Entrada: {new Date(ev.data_inicio).toLocaleDateString('pt-BR')} {new Date(ev.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                {' | '}
                Saída: {new Date(ev.data_fim).toLocaleDateString('pt-BR')} {new Date(ev.data_fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            {/* Action buttons based on status */}
            {ev.status === 'agendado' && (
              <button
                onClick={() => handleConfirmCheckIn(ev)}
                disabled={isUpdating}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {isUpdating ? (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                Confirmar Check-in
              </button>
            )}
            {ev.status === 'em_andamento' && (
              <button
                onClick={() => handleConfirmCheckOut(ev)}
                disabled={isUpdating}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {isUpdating ? (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                Confirmar Entrega
              </button>
            )}
            <button
              onClick={() => handleDeleteEvent(ev.id)}
              className="text-gray-400 hover:text-red-500 p-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
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
          <p className="text-gray-600 mt-1">Gerencie seus serviços agendados</p>
        </div>
        <div className="flex items-center gap-2 mt-4 sm:mt-0">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-2 text-sm ${viewMode === 'month' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600'}`}
            >
              Mês
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-2 text-sm ${viewMode === 'day' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600'}`}
            >
              Dia
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 text-sm ${viewMode === 'list' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600'}`}
            >
              Lista
            </button>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary !py-2">
            + Novo Evento
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
              <input
                type="text"
                className="input-field"
                placeholder="Ex: Revisão - Honda Civic"
                value={formData.titulo}
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição (opcional)</label>
              <input
                type="text"
                className="input-field"
                placeholder="Detalhes do serviço"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data início</label>
              <input type="date" className="input-field" value={formData.data_inicio} onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hora início</label>
              <input type="time" className="input-field" value={formData.hora_inicio} onChange={(e) => setFormData({ ...formData, hora_inicio: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data fim</label>
              <input type="date" className="input-field" value={formData.data_fim} onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hora fim</label>
              <input type="time" className="input-field" value={formData.hora_fim} onChange={(e) => setFormData({ ...formData, hora_fim: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select className="input-field" value={formData.tipo} onChange={(e) => setFormData({ ...formData, tipo: e.target.value as 'plataforma' | 'externo' })}>
                <option value="externo">Externo</option>
                <option value="plataforma">Plataforma</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
              <div className="flex gap-2">
                {CORES_AGENDA.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    onClick={() => setFormData({ ...formData, cor })}
                    className={`w-8 h-8 rounded-full transition-transform ${formData.cor === cor ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : ''}`}
                    style={{ backgroundColor: cor }}
                  />
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

      {viewMode === 'month' ? (
        /* Calendar view */
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-xl font-semibold text-gray-900">
              {MESES[month]} {year}
            </h2>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIAS_SEMANA.map((dia) => (
              <div key={dia} className="text-center text-sm font-medium text-gray-500 py-2">
                {dia}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells before first day */}
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`empty-${i}`} className="min-h-[80px] sm:min-h-[100px] bg-gray-50 rounded-lg" />
            ))}

            {/* Days */}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const checkIns = getCheckInsForDate(dateStr);
              const checkOuts = getCheckOutsForDate(dateStr);
              const dayEvents = getEventsForDay(day);
              // Count ongoing events (in workshop but not starting/ending today)
              const checkInIds = new Set(checkIns.map((e) => e.id));
              const checkOutIds = new Set(checkOuts.map((e) => e.id));
              const ongoing = dayEvents.filter((e) => !checkInIds.has(e.id) && !checkOutIds.has(e.id));
              const isSelected = selectedDate === dateStr;
              const today = new Date();
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

              return (
                <button
                  key={day}
                  onClick={() => { setCurrentDate(new Date(year, month, day)); setViewMode('day'); }}
                  className={`min-h-[80px] sm:min-h-[100px] p-1 sm:p-2 rounded-lg text-left transition-colors ${
                    isSelected ? 'bg-primary-50 ring-2 ring-primary-500' :
                    isToday ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
                  } border border-gray-100`}
                >
                  <span className={`text-sm font-medium ${isToday ? 'text-primary-600' : 'text-gray-900'}`}>
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {checkIns.length > 0 && (
                      <div className="text-xs truncate rounded px-1 py-0.5 bg-green-100 text-green-800 font-medium">
                        {checkIns.length} Check-in
                      </div>
                    )}
                    {checkOuts.length > 0 && (
                      <div className="text-xs truncate rounded px-1 py-0.5 bg-orange-100 text-orange-800 font-medium">
                        {checkOuts.length} Entrega
                      </div>
                    )}
                    {ongoing.length > 0 && (
                      <div className="text-xs truncate rounded px-1 py-0.5 bg-blue-100 text-blue-800 font-medium">
                        {ongoing.length} em serv.
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected date detail panel */}
          {selectedDate && (() => {
            const allDayEvents = getEventsForDateStr(selectedDate);
            const checkIns = getCheckInsForDate(selectedDate);
            const checkOuts = getCheckOutsForDate(selectedDate);

            return (
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-semibold text-gray-900 mb-4 text-lg">
                  Eventos em {selectedDate.split('-').reverse().join('/')}
                </h3>

                {allDayEvents.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum evento neste dia</p>
                ) : (
                  <div className="space-y-6">
                    {/* Check-ins section */}
                    {checkIns.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-green-100 rounded-full">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14" />
                            </svg>
                          </span>
                          <h4 className="font-semibold text-green-800 text-sm uppercase tracking-wide">
                            Check-in ({checkIns.length})
                          </h4>
                        </div>
                        <div className="space-y-2">
                          {checkIns.map((ev) => renderEventDetail(ev, 'checkin'))}
                        </div>
                      </div>
                    )}

                    {/* Check-outs section */}
                    {checkOuts.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-orange-100 rounded-full">
                            <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                          </span>
                          <h4 className="font-semibold text-orange-800 text-sm uppercase tracking-wide">
                            Check-out / Entrega ({checkOuts.length})
                          </h4>
                        </div>
                        <div className="space-y-2">
                          {checkOuts.map((ev) => renderEventDetail(ev, 'checkout'))}
                        </div>
                      </div>
                    )}

                    {/* Events that span across this day but don't start/end here */}
                    {(() => {
                      const checkInIds = new Set(checkIns.map((e) => e.id));
                      const checkOutIds = new Set(checkOuts.map((e) => e.id));
                      const ongoing = allDayEvents.filter((e) => !checkInIds.has(e.id) && !checkOutIds.has(e.id));
                      if (ongoing.length === 0) return null;
                      return (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 rounded-full">
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </span>
                            <h4 className="font-semibold text-blue-800 text-sm uppercase tracking-wide">
                              Em serviço ({ongoing.length})
                            </h4>
                          </div>
                          <div className="space-y-2">
                            {ongoing.map((ev) => renderEventDetail(ev, 'general'))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ) : viewMode === 'day' ? (
        /* Day view */
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setCurrentDate(new Date(year, month, currentDate.getDate() - 1))}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-xl font-semibold text-gray-900">
              {currentDate.getDate()} de {MESES[month]} {year} - {DIAS_SEMANA[currentDate.getDay()]}
            </h2>
            <button
              onClick={() => setCurrentDate(new Date(year, month, currentDate.getDate() + 1))}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Summary cards and timeline */}
          {(() => {
            const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
            const dayEvents = activeEventos.filter((e) => {
              const start = e.data_inicio.slice(0, 10);
              const end = e.data_fim.slice(0, 10);
              return dayStr >= start && dayStr <= end;
            });
            const chegadas = getCheckInsForDate(dayStr);
            const saidas = getCheckOutsForDate(dayStr);

            return (
              <>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-blue-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-blue-700">{dayEvents.length}</p>
                    <p className="text-xs text-blue-600">Total</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-700">{chegadas.length}</p>
                    <p className="text-xs text-green-600">Check-in</p>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-orange-700">{saidas.length}</p>
                    <p className="text-xs text-orange-600">Check-out</p>
                  </div>
                </div>

                {/* Check-in / Check-out sections */}
                {(chegadas.length > 0 || saidas.length > 0) && (
                  <div className="space-y-6 mb-8">
                    {chegadas.length > 0 && (
                      <div>
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
                          {chegadas.map((ev) => renderEventDetail(ev, 'checkin'))}
                        </div>
                      </div>
                    )}
                    {saidas.length > 0 && (
                      <div>
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
                          {saidas.map((ev) => renderEventDetail(ev, 'checkout'))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Timeline */}
                <h4 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">Linha do tempo</h4>
                <div className="space-y-1">
                  {Array.from({ length: 12 }, (_, i) => i + 7).map((hour) => {
                    // Filter events for this hour slot
                    // - 'concluido': never show in day timeline
                    // - 'agendado' (platform): only at the check-in hour
                    // - 'em_andamento' (platform): subtle tag only at first hour (7)
                    // - external / other: normal span behavior
                    const hourEvents = dayEvents.filter((e) => {
                      if (e.status === 'concluido') return false;
                      const startHour = new Date(e.data_inicio).getUTCHours();
                      if (e.tipo === 'plataforma' && e.status === 'agendado') {
                        return hour === startHour;
                      }
                      if (e.tipo === 'plataforma' && e.status === 'em_andamento') {
                        return hour === 7; // show once at top of timeline
                      }
                      const endHour = new Date(e.data_fim).getUTCHours() || 24;
                      return hour >= startHour && hour < endHour;
                    });
                    return (
                      <div key={hour} className="flex gap-3">
                        <span className="text-xs text-gray-400 w-12 text-right pt-2 flex-shrink-0">
                          {String(hour).padStart(2, '0')}:00
                        </span>
                        <div className="flex-1 min-h-[48px] border-t border-gray-100 pt-1">
                          {hourEvents.map((ev) => {
                            const evSol = (ev as any).solicitacao;
                            const evVeiculo = evSol?.veiculo;
                            const evCliente = evSol?.cliente;
                            const evTitle = ev.tipo === 'plataforma' && evVeiculo
                              ? `${evSol?.tipo || ''} - ${evVeiculo.placa || 'S/P'} - ${evCliente?.nome || ''} - ${evVeiculo.fipe_marca} ${evVeiculo.fipe_modelo}`
                              : ev.titulo;
                            if (ev.tipo === 'plataforma' && ev.status === 'agendado') {
                              const startTime = new Date(ev.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
                              return (
                                <div
                                  key={ev.id}
                                  className="flex items-center gap-2 p-2 rounded-lg mb-1 border-l-4 bg-yellow-50 border-yellow-400 text-sm"
                                >
                                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ev.cor }} />
                                  <span className="font-medium text-gray-900">{evTitle}</span>
                                  <span className="text-xs text-gray-500">Check-in {startTime}</span>
                                  <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                    Agendado
                                  </span>
                                </div>
                              );
                            }
                            if (ev.tipo === 'plataforma' && ev.status === 'em_andamento') {
                              return (
                                <div
                                  key={ev.id}
                                  className="flex items-center gap-2 px-2 py-1 rounded mb-1 bg-blue-50 border border-blue-200 text-xs"
                                >
                                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-500" />
                                  <span className="font-medium text-blue-800">{evTitle}</span>
                                  <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700">
                                    Em andamento
                                  </span>
                                </div>
                              );
                            }
                            return (
                              <div
                                key={ev.id}
                                className="flex items-center gap-2 p-2 rounded-lg mb-1 text-white text-sm"
                                style={{ backgroundColor: ev.cor }}
                              >
                                <span className="font-medium">{ev.titulo}</span>
                                {ev.descricao && <span className="text-white/80 text-xs">- {ev.descricao}</span>}
                                <span className={`ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-white/20`}>
                                  {STATUS_LABELS[ev.status] || ev.status}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {dayEvents.length === 0 && (
                  <p className="text-center text-gray-500 py-8">Nenhum evento neste dia</p>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        /* List view */
        <div className="space-y-4">
          {upcomingEvents.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500">Nenhum evento agendado</p>
            </div>
          ) : (
            upcomingEvents.map((ev) => {
              const sol = (ev as any).solicitacao;
              const cliente = sol?.cliente;
              const veiculo = sol?.veiculo;
              const isUpdating = updatingId === ev.id;

              return (
                <div key={ev.id} className="card" style={{ borderLeft: `4px solid ${ev.cor}` }}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{ev.titulo}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ev.tipo === 'plataforma' ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-800'}`}>
                          {ev.tipo === 'plataforma' ? 'Plataforma' : 'Externo'}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[ev.status] || 'bg-gray-100 text-gray-800'}`}>
                          {STATUS_LABELS[ev.status] || ev.status}
                        </span>
                      </div>
                      {ev.descricao && <p className="text-sm text-gray-600">{ev.descricao}</p>}

                      {/* Client/vehicle info */}
                      {ev.tipo === 'plataforma' && cliente && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                          <span>{cliente.nome}</span>
                          {cliente.telefone && (
                            <a href={`tel:${cliente.telefone}`} className="text-primary-600 hover:underline">{cliente.telefone}</a>
                          )}
                          {veiculo && (
                            <span>{veiculo.fipe_marca} {veiculo.fipe_modelo} {veiculo.placa ? `(${veiculo.placa})` : ''}</span>
                          )}
                        </div>
                      )}
                      {sol?.descricao && (
                        <p className="text-sm text-gray-500 italic mt-1">{sol.descricao}</p>
                      )}

                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(ev.data_inicio).toLocaleDateString('pt-BR')} {new Date(ev.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        {' - '}
                        {new Date(ev.data_fim).toLocaleDateString('pt-BR')} {new Date(ev.data_fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      {ev.status === 'agendado' && (
                        <button
                          onClick={() => handleConfirmCheckIn(ev)}
                          disabled={isUpdating}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          Confirmar Check-in
                        </button>
                      )}
                      {ev.status === 'em_andamento' && (
                        <button
                          onClick={() => handleConfirmCheckOut(ev)}
                          disabled={isUpdating}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          Confirmar Entrega
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteEvent(ev.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
