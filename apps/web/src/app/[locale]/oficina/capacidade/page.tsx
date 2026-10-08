'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { calcularCargaAtual, calcularCargaPorFuncionario } from '@/lib/capacidade';
import { TIPOS_SERVICO } from '@fixauto/shared';
import type { Funcionario } from '@fixauto/shared';
import { Link } from '@/i18n/navigation';
import { nomeFuncionario } from '@/lib/funcionario';

export default function CapacidadePage() {
  const t = useTranslations('oficinaCapacidade');
  const tc = useTranslations('constants');
  const LABELS_STATUS_MANUTENCAO: Record<string, string> = {
    recebido: t('statusRecebido'),
    diagnostico: t('statusDiagnostico'),
    aguardando_pecas: t('statusAguardandoPecas'),
    em_execucao: t('statusEmExecucao'),
    pausa_cliente: t('statusPausaCliente'),
    pausa_pecas: t('statusPausaPecas'),
    pausa_geral: t('statusPausaGeral'),
    teste_final: t('statusTesteFinal'),
  };
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
  const tiposComCapacidade = TIPOS_SERVICO.filter((svc) => capacidadeConfigurada?.[svc.value]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('titulo')}</h1>
      <p className="text-gray-600 mb-8">{t('subtitulo')}</p>

      {/* Capacidade por tipo */}
      <div className="card mb-8">
        <h2 className="font-semibold text-gray-900 mb-4">{t('capacidadePorTipoTitulo')}</h2>
        {tiposComCapacidade.length === 0 ? (
          <p className="text-sm text-gray-500">
            {t('semCapacidadeConfigurada')}{' '}
            <Link href="/oficina/perfil" className="text-primary-600 hover:underline">{t('perfil')}</Link>{' '}
            {t('semCapacidadeConfiguradaFim')}
          </p>
        ) : (
          <div className="space-y-4">
            {tiposComCapacidade.map((svc) => {
              const limite = capacidadeConfigurada![svc.value];
              const atual = carga[svc.value] || 0;
              const pct = Math.min(100, (atual / limite) * 100);
              const sobrecarga = atual >= limite;
              return (
                <div key={svc.value}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700">{svc.icon} {tc(`tiposServico.${svc.value}`)}</span>
                    <span className={sobrecarga ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                      {atual} / {limite} {sobrecarga && t('noLimite')}
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
              {t('avisoTipoNoLimite')}
            </p>
          </div>
        )}
      </div>

      {/* Capacidade por funcionario */}
      <div className="card mb-8">
        <h2 className="font-semibold text-gray-900 mb-1">{t('capacidadePorFuncionarioTitulo')}</h2>
        <p className="text-sm text-gray-500 mb-4">{t('capacidadePorFuncionarioSubtitulo')}</p>
        {funcionarios.length === 0 ? (
          <p className="text-sm text-gray-500">
            {t('semMecanicoCadastrado')}{' '}
            <Link href="/oficina/equipe" className="text-primary-600 hover:underline">{t('equipe')}</Link>
            {' '}{t('semMecanicoCadastradoFim')}
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
                    <span className="text-gray-700">{nomeFuncionario(f as any) || t('mecanicoFallback')}</span>
                    <span className={sobrecarga ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                      {atual}{limite != null ? ` / ${limite}` : ''} {sobrecarga && t('noLimite')}
                      {limite == null && <span className="text-gray-400"> {t('semLimiteDefinido')}</span>}
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
              {t('defineLimiteDeCadaMecanico')}{' '}
              <Link href="/oficina/equipe" className="text-primary-600 hover:underline">{t('equipe')}</Link>
              {t('defineLimiteMeio')}{' '}
              <Link href="/oficina/distribuicao" className="text-primary-600 hover:underline">{t('distribuicaoDeTrabalho')}</Link>.
            </p>
          </div>
        )}
      </div>

      {/* Tempo medio por etapa */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-1">{t('tempoMedioTitulo')}</h2>
        <p className="text-sm text-gray-500 mb-4">{t('tempoMedioSubtitulo')}</p>
        {tempoPorEtapa.length === 0 ? (
          <p className="text-sm text-gray-500">{t('semDadosSuficientes')}</p>
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
