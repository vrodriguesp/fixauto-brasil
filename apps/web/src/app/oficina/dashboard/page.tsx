'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useAgenda } from '@/hooks/use-agenda';
import { useAvaliacoes } from '@/hooks/use-avaliacoes';
import StatusBadge from '@/components/ui/StatusBadge';
import StarRating from '@/components/ui/StarRating';
import { timeAgo, calcDistance, getUrgenciaColor, formatCurrency } from '@/lib/utils';

export default function OficinaDashboard() {
  const { user, oficina } = useAuth();
  const { solicitacoes } = useSolicitacoes({ nearby: true });
  const { eventos } = useAgenda();
  const { avaliacoes } = useAvaliacoes();

  const solicitacoesProximas = solicitacoes.filter(s => ['aberta', 'em_orcamento'].includes(s.status));
  const solicitacoesAceitas = solicitacoes.filter(s => ['aceita', 'em_andamento'].includes(s.status));
  const solicitacoesConcluidas = solicitacoes.filter(s => s.status === 'concluida');

  // Upcoming check-ins from agenda (next 7 days)
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const proximosCheckins = eventos
    .filter(e => {
      const start = new Date(e.data_inicio);
      return start >= now && start <= in7Days && e.tipo === 'plataforma' && e.status !== 'concluido';
    })
    .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());

  const formatDateShort = (dateStr: string) => {
    const d = new Date(dateStr);
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return `${weekdays[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <Link href="/oficina/solicitacoes" className="card flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{solicitacoesProximas.length}</p>
            <p className="text-sm text-gray-500">Novas</p>
          </div>
        </Link>
        <Link href="/oficina/veiculos-em-servico" className="card flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{solicitacoesAceitas.length}</p>
            <p className="text-sm text-gray-500">Aceitas</p>
          </div>
        </Link>
        <Link href="/oficina/veiculos-em-servico" className="card flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{solicitacoesConcluidas.length}</p>
            <p className="text-sm text-gray-500">Concluídas</p>
          </div>
        </Link>
        <Link href="/oficina/agenda" className="card flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{eventos.length}</p>
            <p className="text-sm text-gray-500">Na agenda</p>
          </div>
        </Link>
      </div>

      {/* Check-in / Check-out table */}
      {proximosCheckins.length > 0 && (
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Check-in / Check-out - Próximos 7 dias</h2>
            <Link href="/oficina/agenda" className="text-sm text-primary-600 hover:text-primary-700">Ver agenda completa</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b">
                  <th className="text-left pb-3 font-medium">Serviço</th>
                  <th className="text-left pb-3 font-medium">Check-in</th>
                  <th className="text-left pb-3 font-medium">Previsão entrega</th>
                  <th className="text-left pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {proximosCheckins.map((ev) => (
                  <tr key={ev.id} className="hover:bg-gray-50">
                    <td className="py-3">
                      <p className="font-medium text-gray-900">{ev.titulo}</p>
                      <p className="text-xs text-gray-500">{ev.descricao}</p>
                    </td>
                    <td className="py-3">
                      <p className="text-gray-900">{formatDateShort(ev.data_inicio)}</p>
                      <p className="text-xs text-gray-500">{formatTime(ev.data_inicio)}</p>
                    </td>
                    <td className="py-3">
                      <p className="text-gray-900">{formatDateShort(ev.data_fim)}</p>
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex px-2 py-1 text-xs rounded-full font-medium ${
                        ev.status === 'agendado' ? 'bg-blue-100 text-blue-800' :
                        ev.status === 'em_andamento' ? 'bg-yellow-100 text-yellow-800' :
                        ev.status === 'concluido' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {ev.status === 'agendado' ? 'Agendado' :
                         ev.status === 'em_andamento' ? 'Em andamento' :
                         ev.status === 'concluido' ? 'Concluído' : ev.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Accepted solicitations */}
      {solicitacoesAceitas.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Solicitações aceitas</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {solicitacoesAceitas.map((sol) => {
              const orc = sol.orcamentos?.find(o => o.status === 'aceito');
              return (
                <Link key={sol.id} href={`/oficina/solicitacoes/${sol.id}`} className="card block hover:shadow-md transition-shadow border-l-4 border-l-green-500">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {sol.veiculo?.fipe_marca} {sol.veiculo?.fipe_modelo}
                      </h3>
                      <p className="text-xs text-gray-500">{sol.cliente?.nome}</p>
                    </div>
                    <StatusBadge status={sol.status} />
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-1 mb-2">{sol.descricao}</p>
                  {orc && (
                    <div className="flex items-center justify-between text-sm bg-green-50 rounded-lg p-2">
                      <span className="text-green-700">Orçamento aceito</span>
                      <span className="font-bold text-green-800">{formatCurrency(orc.valor_total)}</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

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
            solicitacoesProximas.slice(0, 5).map((sol) => {
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
            {eventos.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum serviço agendado</p>
            ) : (
              <div className="space-y-3">
                {eventos.slice(0, 3).map((ag) => (
                  <div key={ag.id} className="card !p-4" style={{ borderLeft: `4px solid ${ag.cor}` }}>
                    <p className="font-medium text-gray-900 text-sm">{ag.titulo}</p>
                    <p className="text-xs text-gray-500 mt-1">{ag.descricao}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-500">{formatDateShort(ag.data_inicio)}</span>
                      <span className={`badge ${ag.tipo === 'plataforma' ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-800'}`}>
                        {ag.tipo === 'plataforma' ? 'Plataforma' : 'Externo'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
