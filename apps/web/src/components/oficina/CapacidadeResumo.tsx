'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { calcularCargaAtual } from '@/lib/capacidade';
import { TIPOS_SERVICO } from '@fixauto/shared';
import { Link } from '@/i18n/navigation';

// Indicadores que ficavam na antiga tela "Capacidade" (removida em 09/10/2026:
// o Quadro da agenda mostra a carga de cada mecanico e dos elevadores):
// carros por tipo de servico contra o limite do Perfil, e tempo medio de
// cada etapa do reparo. Aparece abaixo do Quadro.
export default function CapacidadeResumo({ atualizar }: { atualizar?: number }) {
  const t = useTranslations('oficinaCapacidade');
  const ta = useTranslations('oficinaAgenda');
  const tc = useTranslations('constants');
  const ROTULO: Record<string, string> = {
    recebido: t('statusRecebido'), diagnostico: t('statusDiagnostico'), aguardando_pecas: t('statusAguardandoPecas'),
    em_execucao: t('statusEmExecucao'), pausa_cliente: t('statusPausaCliente'), pausa_pecas: t('statusPausaPecas'),
    pausa_geral: t('statusPausaGeral'), teste_final: t('statusTesteFinal'),
  };
  const { oficina } = useAuth();
  const [carga, setCarga] = useState<Record<string, number>>({});
  const [tempos, setTempos] = useState<{ status: string; horasMedia: number; ocorrencias: number }[]>([]);

  useEffect(() => {
    if (!oficina) return;
    (async () => {
      const [cargaAtual, { data: agendaIds }] = await Promise.all([
        calcularCargaAtual(supabase, oficina.id),
        supabase.from('agenda').select('id').eq('oficina_id', oficina.id),
      ]);
      setCarga(cargaAtual);
      const ids = (agendaIds || []).map((a) => a.id);
      if (!ids.length) { setTempos([]); return; }
      const { data: etapas } = await supabase.from('manutencao_etapas').select('agenda_id, status, created_at')
        .in('agenda_id', ids).order('agenda_id', { ascending: true }).order('created_at', { ascending: true });
      // duracao de cada etapa = tempo ate a proxima etapa do mesmo agendamento
      const dur: Record<string, number[]> = {};
      const porAgenda = new Map<string, any[]>();
      (etapas || []).forEach((e) => { if (!porAgenda.has(e.agenda_id)) porAgenda.set(e.agenda_id, []); porAgenda.get(e.agenda_id)!.push(e); });
      porAgenda.forEach((lista) => {
        for (let i = 0; i < lista.length - 1; i++) {
          const h = (new Date(lista[i + 1].created_at).getTime() - new Date(lista[i].created_at).getTime()) / 3600000;
          if (h >= 0) (dur[lista[i].status] ||= []).push(h);
        }
      });
      setTempos(Object.entries(dur).map(([status, hs]) => ({ status, horasMedia: hs.reduce((s, h) => s + h, 0) / hs.length, ocorrencias: hs.length }))
        .sort((a, b) => b.horasMedia - a.horasMedia));
    })();
  }, [oficina, atualizar]);

  const cap = oficina?.capacidade_servicos || undefined;
  const tipos = TIPOS_SERVICO.filter((svc) => cap?.[svc.value]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-3">{t('capacidadePorTipoTitulo')}</h3>
        {tipos.length === 0 ? (
          <p className="text-sm text-gray-500">
            {t('semCapacidadeConfigurada')}{' '}
            <Link href="/oficina/perfil" className="text-primary-600 hover:underline">{t('perfil')}</Link>{' '}
            {t('semCapacidadeConfiguradaFim')}
          </p>
        ) : (
          <div className="space-y-3">
            {tipos.map((svc) => {
              const limite = cap![svc.value]; const atual = carga[svc.value] || 0;
              const pct = Math.min(100, (atual / limite) * 100); const cheio = atual >= limite;
              return (
                <div key={svc.value}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700">{svc.icon} {tc(`tiposServico.${svc.value}`)}</span>
                    <span className={cheio ? 'text-red-600 font-semibold' : 'text-gray-600'}>{atual} / {limite} {cheio && t('noLimite')}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${cheio ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-gray-400">{t('avisoTipoNoLimite')}</p>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-3">
          {ta('quadroLimiteMecanicoDica')}{' '}
          <Link href="/oficina/equipe" className="text-primary-600 hover:underline">{t('equipe')}</Link>
        </p>
      </div>
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-1">{t('tempoMedioTitulo')}</h3>
        <p className="text-sm text-gray-500 mb-3">{t('tempoMedioSubtitulo')}</p>
        {tempos.length === 0 ? (
          <p className="text-sm text-gray-500">{t('semDadosSuficientes')}</p>
        ) : (
          <div className="space-y-2">
            {tempos.map((e) => (
              <div key={e.status} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{ROTULO[e.status] || e.status}</span>
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
