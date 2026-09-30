'use client';

import { useAuth } from '@/lib/auth-context';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import StatusBadge from '@/components/ui/StatusBadge';
import { timeAgo, calcDistance, getUrgenciaColor, cleanDescricao } from '@/lib/utils';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { TIPOS_SERVICO } from '@fixauto/shared';
import { Link } from '@/i18n/navigation';

export default function SolicitacoesOficinaPage() {
  const t = useTranslations('oficinaSolicitacoes');
  const tc = useTranslations('constants');
  const ts = useTranslations('seguroReparo');
  const locale = useLocale();
  const { oficina } = useAuth();
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const { solicitacoes: allSolicitacoes } = useSolicitacoes({ nearby: true });

  const solicitacoes = allSolicitacoes
    .filter((s) => filtroTipo === 'todos' || s.tipo === filtroTipo)
    .filter((s) => filtroStatus === 'todos' || s.status === filtroStatus);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('titulo')}</h1>
      <p className="text-gray-600 mb-6">
        {t('subtitulo', { raio: oficina?.raio_atendimento_km ?? 0 })}
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          className="input-field !w-auto"
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
        >
          <option value="todos">{t('todosOsTipos')}</option>
          {TIPOS_SERVICO.map((tipo) => (
            <option key={tipo.value} value={tipo.value}>{tc(`tiposServico.${tipo.value}`)}</option>
          ))}
        </select>
        <select
          className="input-field !w-auto"
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
        >
          <option value="todos">{t('todosOsStatus')}</option>
          <option value="aberta">{t('aberta')}</option>
          <option value="em_orcamento">{t('emOrcamento')}</option>
        </select>
      </div>

      {/* List */}
      {solicitacoes.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">{t('nenhumaSolicitacaoEncontrada')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {solicitacoes.map((sol) => {
            const dist = oficina
              ? calcDistance(oficina.latitude, oficina.longitude, sol.latitude, sol.longitude)
              : 0;
            return (
              <Link
                key={sol.id}
                href={`/oficina/solicitacoes/${sol.id}`}
                className="card block hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900">
                        {sol.veiculo?.fipe_marca} {sol.veiculo?.fipe_modelo} {sol.veiculo?.fipe_ano}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <StatusBadge status={sol.status} />
                      <span className={`badge ${getUrgenciaColor(sol.urgencia)}`}>
                        {tc.has(`urgencias.${sol.urgencia}`) ? tc(`urgencias.${sol.urgencia}`) : sol.urgencia}
                      </span>
                      <span className="badge bg-gray-100 text-gray-700">{tc.has(`tiposServico.${sol.tipo}`) ? tc(`tiposServico.${sol.tipo}`) : sol.tipo}</span>
                      {((sol as any).pagamento_reparo === 'seguro_terceiro' || (sol as any).pagamento_reparo === 'seguro_proprio') && (
                        <span className="badge bg-emerald-100 text-emerald-800">🛡️ {ts('chipSeguro')}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">{cleanDescricao(sol.descricao)}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {dist.toFixed(1)}km - {sol.endereco}
                      </span>
                      <span>{timeAgo(sol.created_at, locale)}</span>
                      {sol.fotos && sol.fotos.length > 0 && (
                        <span>{t('fotosCount', { count: sol.fotos.length })}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="btn-primary !py-2 !px-4 text-sm">
                      {t('enviarOrcamento')}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
