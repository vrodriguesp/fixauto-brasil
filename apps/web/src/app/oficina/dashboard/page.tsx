'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useAgenda } from '@/hooks/use-agenda';
import { useAvaliacoes } from '@/hooks/use-avaliacoes';
import StatusBadge from '@/components/ui/StatusBadge';
import StarRating from '@/components/ui/StarRating';
import { timeAgo, calcDistance, getUrgenciaColor } from '@/lib/utils';

export default function OficinaDashboard() {
  const { user, oficina } = useAuth();
  const { solicitacoes } = useSolicitacoes({ nearby: true });
  const { eventos: agendaHoje } = useAgenda();
  const { avaliacoes } = useAvaliacoes();

  const solicitacoesProximas = solicitacoes.filter(s => ['aberta', 'em_orcamento'].includes(s.status));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {oficina?.nome_fantasia || 'Dashboard'}
          </h1>
          <p className="text-gray-600 mt-1">
            {oficina?.endereco}, {oficina?.cidade} - {oficina?.estado}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-4 sm:mt-0">
          <StarRating rating={oficina?.avaliacao_media || 0} size="md" />
          <span className="text-sm text-gray-500">
            {oficina?.avaliacao_media} ({oficina?.total_avaliacoes} avaliações)
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{solicitacoesProximas.length}</p>
            <p className="text-sm text-gray-500">Novas solicitações</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">0</p>
            <p className="text-sm text-gray-500">Reparos este mês</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">R$ 0</p>
            <p className="text-sm text-gray-500">Faturamento mensal</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{agendaHoje.length}</p>
            <p className="text-sm text-gray-500">Na agenda</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Nearby requests */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Solicitações próximas</h2>
            <Link href="/oficina/solicitacoes" className="text-sm text-primary-600 hover:text-primary-700">
              Ver todas
            </Link>
          </div>
          {solicitacoesProximas.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-500">Nenhuma solicitação nova na sua região</p>
            </div>
          ) : (
            solicitacoesProximas.map((sol) => {
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
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 capitalize">{sol.tipo}</h3>
                        <StatusBadge status={sol.status} />
                        <span className={`badge ${getUrgenciaColor(sol.urgencia)}`}>
                          {sol.urgencia}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{sol.descricao}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>{sol.veiculo?.fipe_marca} {sol.veiculo?.fipe_modelo} {sol.veiculo?.fipe_ano}</span>
                        <span>{dist.toFixed(1)}km</span>
                        <span>{timeAgo(sol.created_at)}</span>
                        {sol.fotos && sol.fotos.length > 0 && (
                          <span>{sol.fotos.length} foto(s)</span>
                        )}
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-gray-400 ml-4 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Upcoming agenda */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Próximos serviços</h2>
              <Link href="/oficina/agenda" className="text-sm text-primary-600 hover:text-primary-700">
                Ver agenda
              </Link>
            </div>
            <div className="space-y-3">
              {agendaHoje.slice(0, 3).map((ag) => (
                <div key={ag.id} className="card !p-4" style={{ borderLeft: `4px solid ${ag.cor}` }}>
                  <p className="font-medium text-gray-900 text-sm">{ag.titulo}</p>
                  <p className="text-xs text-gray-500 mt-1">{ag.descricao}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`badge ${ag.tipo === 'plataforma' ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-800'}`}>
                      {ag.tipo === 'plataforma' ? 'Plataforma' : 'Externo'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent reviews */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Avaliações recentes</h2>
              <Link href="/oficina/avaliacoes" className="text-sm text-primary-600 hover:text-primary-700">
                Ver todas
              </Link>
            </div>
            {avaliacoes.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma avaliação ainda</p>
            ) : (
              <div className="space-y-3">
                {avaliacoes.map((av) => (
                  <div key={av.id} className="card !p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-900">{av.cliente?.nome}</p>
                      <StarRating rating={av.nota} size="sm" />
                    </div>
                    <p className="text-xs text-gray-600">{av.comentario}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
