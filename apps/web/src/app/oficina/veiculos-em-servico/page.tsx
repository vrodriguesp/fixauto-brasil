'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useAgenda } from '@/hooks/use-agenda';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { STATUS_MANUTENCAO } from '@fixauto/shared';
import type { StatusManutencao, Funcionario } from '@fixauto/shared';

type FilterTab = 'todos' | 'aguardando' | 'em_servico' | 'prontos';

export default function VeiculosEmServico() {
  const { eventos, loading, update, refresh } = useAgenda();
  const { oficina, funcionario } = useAuth();
  const [activeTab, setActiveTab] = useState<FilterTab>('em_servico');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [etapaForm, setEtapaForm] = useState<{ eventoId: string; status: StatusManutencao; observacao: string } | null>(null);
  const [assignForm, setAssignForm] = useState<string | null>(null);
  const [funcionarios, setFuncionarios] = useState<(Funcionario & { profile?: { nome: string; email: string } })[]>([]);

  const isMecanico = funcionario?.cargo === 'mecanico';

  // Fetch funcionarios list for assignment (admin only)
  useEffect(() => {
    if (!oficina || isMecanico) return;
    supabase
      .from('funcionarios')
      .select('*, profile:profiles(nome, email)')
      .eq('oficina_id', oficina.id)
      .eq('ativo', true)
      .then(({ data }) => { if (data) setFuncionarios(data); });
  }, [oficina, isMecanico]);

  // Filter events by mechanic if logged in as mecanico
  const myEventos = useMemo(() => {
    if (!isMecanico || !funcionario) return eventos;
    return eventos.filter((e) => e.funcionario_id === funcionario.id);
  }, [eventos, isMecanico, funcionario]);

  // Categorize events
  const categorized = useMemo(() => {
    const aguardandoCheckin = myEventos.filter(
      (e) => e.status === 'agendado' && new Date(e.data_inicio) <= new Date()
    );
    const emServico = myEventos.filter((e) => e.status === 'em_andamento');
    const prontos = myEventos.filter((e) => {
      if (e.status !== 'concluido') return false;
      const concluded = new Date(e.data_fim);
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      return concluded >= threeDaysAgo;
    });
    const agendados = myEventos.filter(
      (e) => e.status === 'agendado' && new Date(e.data_inicio) > new Date()
    );
    return { aguardandoCheckin, emServico, prontos, agendados };
  }, [myEventos]);

  // Filter for the table
  const filteredEventos = useMemo(() => {
    const relevant = myEventos.filter((e) => e.status !== 'cancelado');
    switch (activeTab) {
      case 'aguardando': return categorized.aguardandoCheckin;
      case 'em_servico': return categorized.emServico;
      case 'prontos': return categorized.prontos;
      default: return relevant;
    }
  }, [myEventos, activeTab, categorized]);

  const handleCheckin = async (eventoId: string) => {
    setActionLoading(eventoId);
    await update(eventoId, { status: 'em_andamento' });
    // Create initial etapa
    await supabase.from('manutencao_etapas').insert({
      agenda_id: eventoId,
      funcionario_id: funcionario?.id || null,
      status: 'recebido',
      observacao: 'Veículo recebido na oficina',
    });
    await refresh();
    setActionLoading(null);
  };

  const handleCheckout = async (evento: any) => {
    setActionLoading(evento.id);
    await fetch('/api/confirmar-entrega', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventoId: evento.id, solicitacaoId: evento.solicitacao_id }),
    });
    // Create entregue etapa
    await supabase.from('manutencao_etapas').insert({
      agenda_id: evento.id,
      funcionario_id: funcionario?.id || null,
      status: 'entregue',
      observacao: 'Veículo entregue ao cliente',
    });
    await update(evento.id, { status: 'concluido' });
    setActionLoading(null);
  };

  const handleAddEtapa = async () => {
    if (!etapaForm) return;
    setActionLoading(etapaForm.eventoId);
    await supabase.from('manutencao_etapas').insert({
      agenda_id: etapaForm.eventoId,
      funcionario_id: funcionario?.id || null,
      status: etapaForm.status,
      observacao: etapaForm.observacao || null,
    });
    setEtapaForm(null);
    await refresh();
    setActionLoading(null);
  };

  const handleAssign = async (eventoId: string, funcId: string) => {
    await supabase.from('agenda').update({ funcionario_id: funcId || null }).eq('id', eventoId);
    setAssignForm(null);
    await refresh();
  };

  const calcDaysRemaining = (dataFim: string) => {
    const end = new Date(dataFim);
    const now = new Date();
    return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; classes: string }> = {
      agendado: { label: 'Agendado', classes: 'bg-blue-100 text-blue-800' },
      em_andamento: { label: 'Em serviço', classes: 'bg-yellow-100 text-yellow-800' },
      concluido: { label: 'Pronto', classes: 'bg-green-100 text-green-800' },
      cancelado: { label: 'Cancelado', classes: 'bg-red-100 text-red-800' },
    };
    const info = map[status] || { label: status, classes: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`inline-flex px-2 py-1 text-xs rounded-full font-medium ${info.classes}`}>
        {info.label}
      </span>
    );
  };

  const getManutencaoColor = (status: StatusManutencao) => {
    const colors: Record<string, string> = {
      recebido: 'bg-blue-500',
      diagnostico: 'bg-indigo-500',
      aguardando_pecas: 'bg-yellow-500',
      em_execucao: 'bg-green-500',
      pausa_cliente: 'bg-orange-500',
      pausa_pecas: 'bg-red-500',
      pausa_geral: 'bg-gray-500',
      teste_final: 'bg-teal-500',
      concluido: 'bg-emerald-500',
      entregue: 'bg-slate-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'aguardando', label: 'Aguardando' },
    { key: 'em_servico', label: 'Em Serviço' },
    { key: 'prontos', label: 'Prontos' },
  ];

  // Get latest etapa for an event
  const getLatestEtapa = (evento: any) => {
    const etapas = evento.etapas || [];
    if (etapas.length === 0) return null;
    return etapas.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isMecanico ? 'Meus Veículos' : 'Oficina'}
          </h1>
          <p className="text-gray-600 mt-1">
            {isMecanico
              ? `Veículos sob sua responsabilidade`
              : 'Gerencie os veículos em serviço na oficina'}
          </p>
        </div>
        {!isMecanico && (
          <Link href="/oficina/agenda" className="btn-secondary mt-4 sm:mt-0 inline-flex items-center gap-2 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Ver agenda
          </Link>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <button
          onClick={() => setActiveTab('aguardando')}
          className={`card flex items-center gap-4 text-left transition-shadow hover:shadow-md ${activeTab === 'aguardando' ? 'ring-2 ring-orange-400' : ''}`}
        >
          <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{categorized.aguardandoCheckin.length}</p>
            <p className="text-xs text-gray-500">Aguardando check-in</p>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('em_servico')}
          className={`card flex items-center gap-4 text-left transition-shadow hover:shadow-md ${activeTab === 'em_servico' ? 'ring-2 ring-yellow-400' : ''}`}
        >
          <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{categorized.emServico.length}</p>
            <p className="text-xs text-gray-500">Em serviço</p>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('prontos')}
          className={`card flex items-center gap-4 text-left transition-shadow hover:shadow-md ${activeTab === 'prontos' ? 'ring-2 ring-green-400' : ''}`}
        >
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{categorized.prontos.length}</p>
            <p className="text-xs text-gray-500">Prontos p/ retirada</p>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('todos')}
          className={`card flex items-center gap-4 text-left transition-shadow hover:shadow-md ${activeTab === 'todos' ? 'ring-2 ring-purple-400' : ''}`}
        >
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{categorized.agendados.length}</p>
            <p className="text-xs text-gray-500">Agendados (futuro)</p>
          </div>
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      {filteredEventos.length === 0 ? (
        <div className="card text-center py-12">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <p className="text-gray-500">Nenhum veículo encontrado nesta categoria</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEventos.map((evento) => {
            const veiculo = evento.solicitacao?.veiculo;
            const cliente = evento.solicitacao?.cliente;
            const sol = evento.solicitacao;
            const days = calcDaysRemaining(evento.data_fim);
            const isOverdue = days < 0 && evento.status !== 'concluido';
            const isExpanded = expandedId === evento.id;
            const latestEtapa = getLatestEtapa(evento);
            const etapas = (evento.etapas || []).sort(
              (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

            return (
              <div key={evento.id} className="card !p-0 overflow-hidden">
                {/* Main row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : evento.id)}
                  className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {veiculo ? (
                          <p className="font-semibold text-gray-900">
                            {veiculo.fipe_marca} {veiculo.fipe_modelo}
                            {veiculo.placa && (
                              <span className="ml-2 text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                                {veiculo.placa}
                              </span>
                            )}
                          </p>
                        ) : (
                          <p className="font-semibold text-gray-900">{evento.titulo}</p>
                        )}
                        {getStatusBadge(evento.status)}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        {cliente && <span>{cliente.nome}</span>}
                        <span>Check-in: {formatDate(evento.data_inicio)}</span>
                        <span>Entrega: {formatDate(evento.data_fim)}</span>
                        {evento.status === 'concluido' ? (
                          <span className="text-green-600 font-medium">Pronto</span>
                        ) : isOverdue ? (
                          <span className="text-red-600 font-bold">{Math.abs(days)}d atrasado</span>
                        ) : (
                          <span className={days <= 1 ? 'text-orange-600' : ''}>{days}d restantes</span>
                        )}
                      </div>

                      {/* Latest maintenance status */}
                      <div className="flex items-center gap-3 mt-2">
                        {latestEtapa && (
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2.5 h-2.5 rounded-full ${getManutencaoColor(latestEtapa.status)}`} />
                            <span className="text-xs font-medium text-gray-700">
                              {STATUS_MANUTENCAO[latestEtapa.status as StatusManutencao]?.label || latestEtapa.status}
                            </span>
                          </div>
                        )}
                        {/* Assigned mechanic */}
                        {evento.funcionario && (
                          <span className="text-xs text-gray-400">
                            Resp: {evento.funcionario.profile?.nome || 'N/A'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {evento.status === 'agendado' && new Date(evento.data_inicio) <= new Date() && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCheckin(evento.id); }}
                          disabled={actionLoading === evento.id}
                          className="btn-primary text-xs !py-1.5 !px-3 disabled:opacity-50"
                        >
                          {actionLoading === evento.id ? '...' : 'Check-in'}
                        </button>
                      )}
                      {evento.status === 'em_andamento' && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEtapaForm({ eventoId: evento.id, status: 'em_execucao', observacao: '' });
                            }}
                            className="text-xs !py-1.5 !px-3 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-lg font-medium transition-colors"
                          >
                            + Etapa
                          </button>
                          {!isMecanico && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCheckout(evento); }}
                              disabled={actionLoading === evento.id}
                              className="btn-primary text-xs !py-1.5 !px-3 bg-green-600 hover:bg-green-700 disabled:opacity-50"
                            >
                              {actionLoading === evento.id ? '...' : 'Entrega'}
                            </button>
                          )}
                        </>
                      )}
                      {evento.status === 'concluido' && (
                        <span className="text-xs text-green-600 font-medium">Entregue</span>
                      )}
                      {evento.status === 'agendado' && new Date(evento.data_inicio) > new Date() && (
                        <span className="text-xs text-gray-400">Aguardando data</span>
                      )}
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                      {/* Service description */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Serviço</h4>
                        <p className="text-sm text-gray-900">{sol?.descricao || evento.descricao || 'Sem descrição'}</p>
                      </div>

                      {/* Client contact */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cliente</h4>
                        {cliente ? (
                          <div className="space-y-1 text-sm">
                            <p className="text-gray-900 font-medium">{cliente.nome}</p>
                            {cliente.telefone && (
                              <a href={`tel:${cliente.telefone}`} className="text-primary-600 hover:underline block">{cliente.telefone}</a>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">-</p>
                        )}
                      </div>

                      {/* Assign mechanic (admin only) */}
                      {!isMecanico && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Mecânico Responsável</h4>
                          {assignForm === evento.id ? (
                            <select
                              className="input-field !py-1.5 text-sm"
                              defaultValue={evento.funcionario_id || ''}
                              onChange={(e) => handleAssign(evento.id, e.target.value)}
                              onBlur={() => setAssignForm(null)}
                              autoFocus
                            >
                              <option value="">Nenhum</option>
                              {funcionarios.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.profile?.nome || f.profile?.email} {f.especialidade ? `(${f.especialidade})` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <button
                              onClick={() => setAssignForm(evento.id)}
                              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                            >
                              {evento.funcionario
                                ? `${evento.funcionario.profile?.nome} (trocar)`
                                : '+ Atribuir mecânico'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Maintenance timeline */}
                    <div className="mt-6">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        Histórico da Manutenção
                      </h4>
                      {etapas.length === 0 ? (
                        <p className="text-sm text-gray-400">Nenhuma etapa registrada</p>
                      ) : (
                        <div className="relative pl-6 space-y-3">
                          {/* Timeline line */}
                          <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-gray-200" />
                          {etapas.map((etapa: any, i: number) => {
                            const statusInfo = STATUS_MANUTENCAO[etapa.status as StatusManutencao];
                            return (
                              <div key={etapa.id} className="relative">
                                <div className={`absolute -left-6 top-1 w-[18px] h-[18px] rounded-full border-2 border-white ${getManutencaoColor(etapa.status)}`} />
                                <div className={`p-3 rounded-lg ${i === 0 ? 'bg-gray-50 border border-gray-200' : 'bg-white'}`}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-900">
                                      {statusInfo?.icon} {statusInfo?.label || etapa.status}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                      {formatDateTime(etapa.created_at)}
                                    </span>
                                  </div>
                                  {etapa.observacao && (
                                    <p className="text-xs text-gray-600 mt-1">{etapa.observacao}</p>
                                  )}
                                  {etapa.funcionario?.profile?.nome && (
                                    <p className="text-xs text-gray-400 mt-0.5">por {etapa.funcionario.profile.nome}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Message button */}
                    {evento.solicitacao_id && (
                      <div className="mt-4 flex items-center gap-3">
                        <Link
                          href={`/oficina/mensagens/${evento.solicitacao_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          Mensagem
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                {/* Etapa form (inline) */}
                {etapaForm?.eventoId === evento.id && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3 bg-indigo-50/50">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Registrar Etapa</h4>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <select
                        className="input-field !py-2 text-sm flex-1"
                        value={etapaForm.status}
                        onChange={(e) => setEtapaForm({ ...etapaForm, status: e.target.value as StatusManutencao })}
                      >
                        {Object.entries(STATUS_MANUTENCAO).map(([key, val]) => (
                          <option key={key} value={key}>
                            {val.icon} {val.label} - {val.description}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        className="input-field !py-2 text-sm flex-1"
                        placeholder="Observação (opcional)"
                        value={etapaForm.observacao}
                        onChange={(e) => setEtapaForm({ ...etapaForm, observacao: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddEtapa}
                          disabled={actionLoading === evento.id}
                          className="btn-primary !py-2 !px-4 text-sm disabled:opacity-50"
                        >
                          {actionLoading === evento.id ? '...' : 'Salvar'}
                        </button>
                        <button
                          onClick={() => setEtapaForm(null)}
                          className="btn-secondary !py-2 !px-4 text-sm"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
