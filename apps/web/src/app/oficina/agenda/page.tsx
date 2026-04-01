'use client';

import { useState } from 'react';
import { useAgenda } from '@/hooks/use-agenda';
import { CORES_AGENDA } from '@fixauto/shared';

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

export default function AgendaPage() {
  const { eventos, add: addEvento, remove: removeEvento } = useAgenda();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<'month' | 'day' | 'list'>('month');

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

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return eventos.filter((e) => {
      const start = e.data_inicio.slice(0, 10);
      const end = e.data_fim.slice(0, 10);
      return dateStr >= start && dateStr <= end;
    });
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

  const upcomingEvents = [...eventos]
    .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-gray-600 mt-1">Gerencie seus servicos agendados</p>
        </div>
        <div className="flex items-center gap-2 mt-4 sm:mt-0">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-2 text-sm ${viewMode === 'month' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600'}`}
            >
              Mes
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Titulo</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: Revisao - Honda Civic"
                value={formData.titulo}
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descricao (opcional)</label>
              <input
                type="text"
                className="input-field"
                placeholder="Detalhes do servico"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data inicio</label>
              <input type="date" className="input-field" value={formData.data_inicio} onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hora inicio</label>
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
              const dayEvents = getEventsForDay(day);
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = selectedDate === dateStr;
              const isToday = day === 31 && month === 2; // March 31 for demo

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`min-h-[80px] sm:min-h-[100px] p-1 sm:p-2 rounded-lg text-left transition-colors ${
                    isSelected ? 'bg-primary-50 ring-2 ring-primary-500' :
                    isToday ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
                  } border border-gray-100`}
                >
                  <span className={`text-sm font-medium ${isToday ? 'text-primary-600' : 'text-gray-900'}`}>
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className="text-xs truncate rounded px-1 py-0.5 text-white"
                        style={{ backgroundColor: ev.cor }}
                      >
                        {ev.titulo}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <p className="text-xs text-gray-500">+{dayEvents.length - 2} mais</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected date events */}
          {selectedDate && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-semibold text-gray-900 mb-3">
                Eventos em {selectedDate.split('-').reverse().join('/')}
              </h3>
              {getEventsForDay(parseInt(selectedDate.split('-')[2])).length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum evento neste dia</p>
              ) : (
                <div className="space-y-2">
                  {getEventsForDay(parseInt(selectedDate.split('-')[2])).map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ev.cor }} />
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{ev.titulo}</p>
                          <p className="text-xs text-gray-500">{ev.descricao}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`badge ${ev.tipo === 'plataforma' ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-800'}`}>
                          {ev.tipo === 'plataforma' ? 'Plataforma' : 'Externo'}
                        </span>
                        <button
                          onClick={() => handleDeleteEvent(ev.id)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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

          {/* Summary cards */}
          {(() => {
            const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
            const dayEvents = eventos.filter((e) => {
              const start = e.data_inicio.slice(0, 10);
              const end = e.data_fim.slice(0, 10);
              return dayStr >= start && dayStr <= end;
            });
            const chegadas = eventos.filter((e) => e.data_inicio.slice(0, 10) === dayStr);
            const saidas = eventos.filter((e) => e.data_fim.slice(0, 10) === dayStr);

            return (
              <>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-blue-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-blue-700">{dayEvents.length}</p>
                    <p className="text-xs text-blue-600">Em andamento</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-700">{chegadas.length}</p>
                    <p className="text-xs text-green-600">Chegadas</p>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-orange-700">{saidas.length}</p>
                    <p className="text-xs text-orange-600">Saidas previstas</p>
                  </div>
                </div>

                {/* Timeline */}
                <div className="space-y-1">
                  {Array.from({ length: 12 }, (_, i) => i + 7).map((hour) => {
                    const hourEvents = dayEvents.filter((e) => {
                      const startHour = new Date(e.data_inicio).getUTCHours();
                      const endHour = new Date(e.data_fim).getUTCHours() || 24;
                      return hour >= startHour && hour < endHour;
                    });
                    return (
                      <div key={hour} className="flex gap-3">
                        <span className="text-xs text-gray-400 w-12 text-right pt-2 flex-shrink-0">
                          {String(hour).padStart(2, '0')}:00
                        </span>
                        <div className="flex-1 min-h-[48px] border-t border-gray-100 pt-1">
                          {hourEvents.map((ev) => (
                            <div
                              key={ev.id}
                              className="flex items-center gap-2 p-2 rounded-lg mb-1 text-white text-sm"
                              style={{ backgroundColor: ev.cor }}
                            >
                              <span className="font-medium">{ev.titulo}</span>
                              {ev.descricao && <span className="text-white/80 text-xs">- {ev.descricao}</span>}
                            </div>
                          ))}
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
            upcomingEvents.map((ev) => (
              <div key={ev.id} className="card flex items-center justify-between" style={{ borderLeft: `4px solid ${ev.cor}` }}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{ev.titulo}</h3>
                    <span className={`badge ${ev.tipo === 'plataforma' ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-800'}`}>
                      {ev.tipo === 'plataforma' ? 'Plataforma' : 'Externo'}
                    </span>
                  </div>
                  {ev.descricao && <p className="text-sm text-gray-600">{ev.descricao}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(ev.data_inicio).toLocaleDateString('pt-BR')} {new Date(ev.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    {' - '}
                    {new Date(ev.data_fim).toLocaleDateString('pt-BR')} {new Date(ev.data_fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteEvent(ev.id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
