'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { calcularCargaAtual, calcularCargaPorFuncionario } from '@/lib/capacidade';
import { TIPOS_SERVICO } from '@fixauto/shared';
import type { Funcionario } from '@fixauto/shared';

const LABELS_STATUS_MANUTENCAO: Record<string, string> = {
  recebido: 'Recebido',
  diagnostico: 'Diagnóstico',
  aguardando_pecas: 'Aguardando peças',
  em_execucao: 'Em execução',
  pausa_cliente: 'Pausa (cliente)',
  pausa_pecas: 'Pausa (peças)',
  pausa_geral: 'Pausa (geral)',
  teste_final: 'Teste final',
};

export default function CapacidadePage() {
  const { oficina } = useAuth();
  const [carga, setCarga] = useState<Record<string, number>>({});
  const [tempoPorEtapa, setTempoPorEtapa] = useState<{ status: string; horasMedia: number; ocorrencias: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [funcionarios, setFuncionarios] = useState<(Funcionario & { profile?: { nome: string } })[]>([]);
  const [cargaPorFuncionario, setCargaPorFuncionario] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!oficina) return;

    async function fetchData() {
      setLoading(true);
      const [cargaAtual, cargaFunc, { data: agendaIds }, { data: funcs }] = await Promise.all([
        calcularCargaAtual(supabase, oficina!.id),
        calcularCargaPorFuncionario(supabase, oficina!.id),
        supabase.from('agenda').select('id').eq('oficina_id', oficina!.id),
        supabase.from('funcionarios').select('*, profile:profiles(nome)').eq('oficina_id', oficina!.id).eq('ativo', true).eq('cargo', 'mecanico'),
      ]);
      setCarga(cargaAtual);
      setCargaPorFuncionario(cargaFunc);
      setFuncionarios((funcs as any[]) || []);

      const ids = (agendaIds || []).map((a) => a.id);
      if (ids.length > 0) {
        const { data: etapas } = await supabase
          .from('manutencao_etapas')
          .select('agenda_id, status, created_at')
          .in('agenda_id', ids)
          .order('agenda_id', { ascending: true })
          .order('created_at', { ascending: true });

        // Duracao de cada etapa = tempo ate a proxima etapa do mesmo agendamento
        const duracoesPorStatus: Record<string, number[]> = {};
        const porAgenda = new Map<string, typeof etapas>();
        (etapas || []).forEach((e) => {
          if (!porAgenda.has(e.agenda_id)) porAgenda.set(e.agenda_id, []);
          porAgenda.get(e.agenda_id)!.push(e);
        });
        porAgenda.forEach((lista) => {
          for (let i = 0; i < lista!.length - 1; i++) {
            const atual = lista![i];
            const proxima = lista![i + 1];
            const horas = (new Date(proxima.created_at).getTime() - new Date(atual.created_at).getTime()) / 3600000;
            if (horas >= 0) {
              if (!duracoesPorStatus[atual.status]) duracoesPorStatus[atual.status] = [];
              duracoesPorStatus[atual.status].push(horas);
            }
          }
        });

        const resultado = Object.entries(duracoesPorStatus).map(([status, horas]) => ({
          status,
          horasMedia: horas.reduce((s, h) => s + h, 0) / horas.length,
          ocorrencias: horas.length,
        })).sort((a, b) => b.horasMedia - a.horasMedia);

        setTempoPorEtapa(resultado);
      }

      setLoading(false);
    }

    fetchData();
  }, [oficina]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  const capacidadeConfigurada = oficina?.capacidade_servicos || undefined;
  const tiposComCapacidade = TIPOS_SERVICO.filter((t) => capacidadeConfigurada?.[t.value]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Capacidade e Produtividade</h1>
      <p className="text-gray-600 mb-8">Sua carga de trabalho atual e tempo médio por etapa do reparo</p>

      {/* Capacidade por tipo */}
      <div className="card mb-8">
        <h2 className="font-semibold text-gray-900 mb-4">Capacidade por tipo de serviço</h2>
        {tiposComCapacidade.length === 0 ? (
          <p className="text-sm text-gray-500">
            Você ainda não configurou sua capacidade por tipo de serviço. Configure em{' '}
            <a href="/oficina/perfil" className="text-primary-600 hover:underline">Perfil</a>{' '}
            para receber solicitações de forma mais equilibrada e evitar sobrecarga.
          </p>
        ) : (
          <div className="space-y-4">
            {tiposComCapacidade.map((t) => {
              const limite = capacidadeConfigurada![t.value];
              const atual = carga[t.value] || 0;
              const pct = Math.min(100, (atual / limite) * 100);
              const sobrecarga = atual >= limite;
              return (
                <div key={t.value}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700">{t.icon} {t.label}</span>
                    <span className={sobrecarga ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                      {atual} / {limite} {sobrecarga && '(no limite)'}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${sobrecarga ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-green-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-gray-400 mt-2">
              Quando um tipo está no limite, novas emergências desse tipo priorizam outras oficinas com capacidade livre.
            </p>
          </div>
        )}
      </div>

      {/* Capacidade por funcionario */}
      <div className="card mb-8">
        <h2 className="font-semibold text-gray-900 mb-1">Capacidade por funcionário</h2>
        <p className="text-sm text-gray-500 mb-4">Quantos veículos em serviço cada mecânico está atendendo agora</p>
        {funcionarios.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhum mecânico cadastrado ainda. Adicione sua equipe em{' '}
            <Link href="/oficina/equipe" className="text-primary-600 hover:underline">Equipe</Link>
            {' '}pra distribuir a carga entre eles (isso é opcional - você pode operar sozinho também).
          </p>
        ) : (
          <div className="space-y-4">
            {funcionarios.map((f) => {
              const atual = cargaPorFuncionario[f.id] || 0;
              const limite = f.capacidade_maxima;
              const pct = limite ? Math.min(100, (atual / limite) * 100) : Math.min(100, atual * 20);
              const sobrecarga = limite != null && atual >= limite;
              return (
                <div key={f.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700">{f.profile?.nome || 'Mecânico'}</span>
                    <span className={sobrecarga ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                      {atual}{limite != null ? ` / ${limite}` : ''} {sobrecarga && '(no limite)'}
                      {limite == null && <span className="text-gray-400"> (sem limite definido)</span>}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${sobrecarga ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-green-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-gray-400 mt-2">
              Defina o limite de cada mecânico em{' '}
              <Link href="/oficina/equipe" className="text-primary-600 hover:underline">Equipe</Link>
              . Pra distribuir os veículos entre eles antes mesmo de chegarem, use a{' '}
              <Link href="/oficina/distribuicao" className="text-primary-600 hover:underline">Distribuição de Trabalho</Link>.
            </p>
          </div>
        )}
      </div>

      {/* Tempo medio por etapa */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-1">Tempo médio por etapa do reparo</h2>
        <p className="text-sm text-gray-500 mb-4">Onde seus veículos ficam parados por mais tempo</p>
        {tempoPorEtapa.length === 0 ? (
          <p className="text-sm text-gray-500">Ainda não há dados suficientes (precisa de check-ins com etapas registradas).</p>
        ) : (
          <div className="space-y-3">
            {tempoPorEtapa.map((e) => (
              <div key={e.status} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{LABELS_STATUS_MANUTENCAO[e.status] || e.status}</span>
                <span className="text-gray-900 font-medium">
                  {e.horasMedia < 1 ? `${Math.round(e.horasMedia * 60)}min` : `${e.horasMedia.toFixed(1)}h`}
                  <span className="text-gray-400 font-normal ml-1">({e.ocorrencias}x)</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
