'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { STATUS_MANUTENCAO } from '@fixauto/shared';
import type { StatusManutencao, ManutencaoEtapa } from '@fixauto/shared';

interface AgendaData {
  id: string;
  data_inicio: string;
  data_fim: string;
  status: string;
  funcionario: { profile: { nome: string } } | null;
  solicitacao: {
    id: string;
    tipo: string;
    descricao: string;
    veiculo: { fipe_marca: string; fipe_modelo: string; placa: string | null };
  } | null;
}

const STATUS_ORDER: StatusManutencao[] = [
  'recebido',
  'diagnostico',
  'aguardando_pecas',
  'em_execucao',
  'pausa_cliente',
  'pausa_pecas',
  'pausa_geral',
  'teste_final',
  'concluido',
  'entregue',
];

// Progress steps (simplified view for client)
const PROGRESS_STEPS: { status: StatusManutencao; label: string }[] = [
  { status: 'recebido', label: 'Recebido' },
  { status: 'diagnostico', label: 'Diagnóstico' },
  { status: 'em_execucao', label: 'Em Execução' },
  { status: 'teste_final', label: 'Teste Final' },
  { status: 'concluido', label: 'Concluído' },
  { status: 'entregue', label: 'Entregue' },
];

function getManutencaoColor(status: StatusManutencao) {
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
}

function getManutencaoColorLight(status: StatusManutencao) {
  const colors: Record<string, string> = {
    recebido: 'bg-blue-100 text-blue-700 border-blue-300',
    diagnostico: 'bg-indigo-100 text-indigo-700 border-indigo-300',
    aguardando_pecas: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    em_execucao: 'bg-green-100 text-green-700 border-green-300',
    pausa_cliente: 'bg-orange-100 text-orange-700 border-orange-300',
    pausa_pecas: 'bg-red-100 text-red-700 border-red-300',
    pausa_geral: 'bg-gray-100 text-gray-700 border-gray-300',
    teste_final: 'bg-teal-100 text-teal-700 border-teal-300',
    concluido: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    entregue: 'bg-slate-100 text-slate-700 border-slate-300',
  };
  return colors[status] || 'bg-gray-100 text-gray-700 border-gray-300';
}

export default function AcompanhamentoPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [agenda, setAgenda] = useState<AgendaData | null>(null);
  const [etapas, setEtapas] = useState<ManutencaoEtapa[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch agenda + etapas
  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      // Find agenda by solicitacao_id
      const { data: agendaData } = await supabase
        .from('agenda')
        .select(`
          id, data_inicio, data_fim, status,
          funcionario:funcionarios(profile:profiles(nome)),
          solicitacao:solicitacoes(id, tipo, descricao, veiculo:veiculos(fipe_marca, fipe_modelo, placa))
        `)
        .eq('solicitacao_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (agendaData) {
        setAgenda(agendaData as unknown as AgendaData);

        const { data: etapasData } = await supabase
          .from('manutencao_etapas')
          .select('*, funcionario:funcionarios(profile:profiles(nome))')
          .eq('agenda_id', agendaData.id)
          .order('created_at', { ascending: true });

        setEtapas((etapasData as ManutencaoEtapa[]) || []);
      }
      setLoading(false);
    };

    fetchData();
  }, [id]);

  // Real-time subscription for new etapas
  useEffect(() => {
    if (!agenda?.id) return;

    const channel = supabase
      .channel(`manutencao-${agenda.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'manutencao_etapas',
          filter: `agenda_id=eq.${agenda.id}`,
        },
        async (payload) => {
          // Fetch the full etapa with joined data
          const { data } = await supabase
            .from('manutencao_etapas')
            .select('*, funcionario:funcionarios(profile:profiles(nome))')
            .eq('id', payload.new.id)
            .single();
          if (data) {
            setEtapas((prev) => [...prev, data as ManutencaoEtapa]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [agenda?.id]);

  const latestStatus = etapas.length > 0
    ? (etapas[etapas.length - 1].status as StatusManutencao)
    : null;

  // Calculate progress for the bar
  const getProgressIndex = () => {
    if (!latestStatus) return -1;
    // Map pausa states and other states to their nearest progress step
    const statusMap: Record<string, number> = {
      recebido: 0,
      diagnostico: 1,
      aguardando_pecas: 2, // maps between diagnostico and em_execucao
      em_execucao: 2,
      pausa_cliente: 2,
      pausa_pecas: 2,
      pausa_geral: 2,
      teste_final: 3,
      concluido: 4,
      entregue: 5,
    };
    return statusMap[latestStatus] ?? -1;
  };

  const progressIndex = getProgressIndex();

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return `${weekdays[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="h-32 bg-gray-200 rounded-xl" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!agenda) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500 mb-4">Nenhum agendamento encontrado para esta solicitação.</p>
        <Link href="/cliente/dashboard" className="btn-primary">Voltar ao Dashboard</Link>
      </div>
    );
  }

  const veiculo = agenda.solicitacao?.veiculo;
  const latestInfo = latestStatus ? STATUS_MANUTENCAO[latestStatus] : null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href="/cliente/dashboard" className="text-sm text-primary-600 hover:text-primary-700 font-medium mb-2 inline-block">
          ← Voltar ao Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Acompanhamento da Manutenção</h1>
        {veiculo && (
          <p className="text-gray-600 mt-1">
            {veiculo.fipe_marca} {veiculo.fipe_modelo}
            {veiculo.placa && <span className="ml-2 font-mono bg-gray-100 px-1.5 py-0.5 rounded text-sm">{veiculo.placa}</span>}
          </p>
        )}
      </div>

      {/* Current status card */}
      {latestInfo && (
        <div className={`rounded-xl p-5 mb-6 border-2 ${getManutencaoColorLight(latestStatus!)}`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{latestInfo.icon}</span>
            <div>
              <p className="text-lg font-bold">{latestInfo.label}</p>
              <p className="text-sm opacity-80">{latestInfo.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="card mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Progresso</h2>
        <div className="flex items-center justify-between relative">
          {/* Background line */}
          <div className="absolute top-4 left-4 right-4 h-1 bg-gray-200 rounded" />
          {/* Active line */}
          {progressIndex >= 0 && (
            <div
              className="absolute top-4 left-4 h-1 bg-primary-500 rounded transition-all duration-500"
              style={{ width: `${Math.min((progressIndex / (PROGRESS_STEPS.length - 1)) * 100, 100)}%` }}
            />
          )}

          {PROGRESS_STEPS.map((step, i) => {
            const isActive = progressIndex >= i;
            const isCurrent = progressIndex === i;
            return (
              <div key={step.status} className="relative flex flex-col items-center z-10" style={{ flex: 1 }}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                  isCurrent
                    ? 'bg-primary-500 border-primary-500 text-white scale-110 shadow-lg'
                    : isActive
                    ? 'bg-primary-500 border-primary-500 text-white'
                    : 'bg-white border-gray-300 text-gray-400'
                }`}>
                  {isActive ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-xs font-bold">{i + 1}</span>
                  )}
                </div>
                <span className={`text-[10px] sm:text-xs mt-2 text-center leading-tight ${
                  isCurrent ? 'font-bold text-primary-700' : isActive ? 'font-medium text-gray-700' : 'text-gray-400'
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info card */}
      <div className="card mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Check-in</p>
            <p className="text-sm font-medium text-gray-900">{formatDate(agenda.data_inicio)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Previsão de entrega</p>
            <p className="text-sm font-medium text-gray-900">{formatDate(agenda.data_fim)}</p>
          </div>
          {agenda.funcionario?.profile?.nome && (
            <div>
              <p className="text-xs text-gray-500">Mecânico responsável</p>
              <p className="text-sm font-medium text-gray-900">{agenda.funcionario.profile.nome}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500">Serviço</p>
            <p className="text-sm font-medium text-gray-900">{agenda.solicitacao?.tipo || '-'}</p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Histórico Detalhado
        </h2>
        {etapas.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">Aguardando início do serviço...</p>
            <div className="mt-2 flex justify-center">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500" />
                </span>
                Atualização em tempo real ativa
              </div>
            </div>
          </div>
        ) : (
          <div className="relative pl-6 space-y-4">
            <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-gray-200" />
            {etapas.map((etapa, i) => {
              const statusInfo = STATUS_MANUTENCAO[etapa.status as StatusManutencao];
              const isLatest = i === etapas.length - 1;
              return (
                <div key={etapa.id} className="relative">
                  <div className={`absolute -left-6 top-1.5 w-[18px] h-[18px] rounded-full border-2 border-white ${getManutencaoColor(etapa.status as StatusManutencao)} ${isLatest ? 'ring-2 ring-offset-1 ring-primary-300' : ''}`} />
                  <div className={`p-3 rounded-lg ${isLatest ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${isLatest ? 'text-primary-900' : 'text-gray-900'}`}>
                        {statusInfo?.icon} {statusInfo?.label || etapa.status}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDateTime(etapa.created_at)}
                      </span>
                    </div>
                    {etapa.observacao && (
                      <p className="text-xs text-gray-600 mt-1">{etapa.observacao}</p>
                    )}
                    {(etapa as any).funcionario?.profile?.nome && (
                      <p className="text-xs text-gray-400 mt-0.5">por {(etapa as any).funcionario.profile.nome}</p>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Real-time indicator */}
            <div className="relative">
              <div className="absolute -left-6 top-1.5">
                <span className="relative flex h-[18px] w-[18px]">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-[18px] w-[18px] bg-white border-2 border-dashed border-gray-300" />
                </span>
              </div>
              <p className="text-xs text-gray-400 italic pl-1 pt-1">Aguardando próxima atualização...</p>
            </div>
          </div>
        )}
      </div>

      {/* Contact / message button */}
      {agenda.solicitacao?.id && (
        <div className="mt-6 flex gap-3">
          <Link
            href={`/cliente/mensagens/${agenda.solicitacao.id}`}
            className="btn-primary flex-1 text-center inline-flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Enviar Mensagem
          </Link>
          <Link
            href={`/cliente/orcamentos/${agenda.solicitacao.id}`}
            className="btn-secondary flex-1 text-center"
          >
            Ver Detalhes
          </Link>
        </div>
      )}
    </div>
  );
}
