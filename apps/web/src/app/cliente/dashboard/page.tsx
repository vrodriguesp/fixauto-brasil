'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useNotificacoes } from '@/hooks/use-notificacoes';
import { useVeiculos } from '@/hooks/use-veiculos';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency, timeAgo } from '@/lib/utils';

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return `${weekdays[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

export default function ClienteDashboard() {
  const { user } = useAuth();
  const { solicitacoes } = useSolicitacoes();
  const { notificacoes: allNotificacoes, markAsRead } = useNotificacoes();
  const { veiculos } = useVeiculos();

  const notificacoes = allNotificacoes.filter((n) => !n.lida);
  const topNotificacoes = notificacoes.slice(0, 3);

  // Separate solicitations by state
  const abertas = solicitacoes.filter((s) => ['aberta', 'em_orcamento'].includes(s.status));
  const agendadas = solicitacoes.filter((s) => ['aceita', 'em_andamento'].includes(s.status));
  const concluidas = solicitacoes.filter((s) => s.status === 'concluida');

  const stats = {
    ativas: abertas.length,
    agendadas: agendadas.length,
    orcamentosPendentes: solicitacoes.reduce((acc, s) => acc + (s.orcamentos?.filter((o) => o.status === 'enviado').length || 0), 0),
    concluidas: concluidas.length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Olá, {user?.nome?.split(' ')[0]}!</h1>
          <p className="text-gray-600 mt-1">Acompanhe seus reparos e orçamentos</p>
        </div>
        <Link href="/cliente/nova-solicitacao" className="btn-primary mt-4 sm:mt-0 text-center">
          + Nova Solicitação
        </Link>
      </div>

      {/* Notification banner - above main content when there are unread notifications */}
      {topNotificacoes.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500" />
              </span>
              {notificacoes.length} notificação(ões) não lida(s)
            </h2>
            {notificacoes.length > 3 && (
              <Link href="/cliente/notificacoes" className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                Ver todas ({notificacoes.length})
              </Link>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {topNotificacoes.map((n) => {
              const solId = (n.dados as Record<string, string> | null)?.solicitacao_id;
              const getNotificationHref = () => {
                if (!solId) return '/cliente/orcamentos';
                if (n.tipo === 'nova_mensagem') return `/cliente/mensagens/${solId}`;
                if (n.tipo === 'servico_concluido') return `/cliente/orcamentos/${solId}`;
                return `/cliente/orcamentos/${solId}`;
              };
              const href = getNotificationHref();
              const isServicoConcluido = n.tipo === 'servico_concluido';

              return (
                <Link
                  key={n.id}
                  href={href}
                  onClick={() => markAsRead(n.id)}
                  className={`flex-shrink-0 w-72 sm:w-80 rounded-xl p-4 border-2 block hover:shadow-md transition-all ${
                    isServicoConcluido
                      ? 'bg-gradient-to-r from-yellow-50 to-green-50 border-yellow-300'
                      : 'bg-white border-primary-200 hover:border-primary-300'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900 line-clamp-1">{n.titulo}</p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{n.mensagem}</p>
                  {isServicoConcluido ? (
                    <span className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-yellow-700 bg-yellow-100 rounded-full px-2.5 py-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                      Avaliar
                    </span>
                  ) : (
                    <p className="text-xs text-primary-600 mt-2 font-medium">Ver detalhes</p>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <Link href="/cliente/orcamentos" className="card flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.ativas}</p>
            <p className="text-sm text-gray-500">Abertas</p>
          </div>
        </Link>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.agendadas}</p>
            <p className="text-sm text-gray-500">Agendadas</p>
          </div>
        </div>
        <Link href="/cliente/orcamentos" className="card flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.orcamentosPendentes}</p>
            <p className="text-sm text-gray-500">Orçamentos</p>
          </div>
        </Link>
        <Link href="/cliente/historico" className="card flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.concluidas}</p>
            <p className="text-sm text-gray-500">Concluídas</p>
          </div>
        </Link>
      </div>

      {/* Scheduled / Accepted - show appointment details */}
      {agendadas.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Agendamentos</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {agendadas.map((sol) => {
              const orcAceito = sol.orcamentos?.find((o) => o.status === 'aceito');
              const slotEscolhido = orcAceito?.disponibilidade?.find(
                (d: any) => d.id === orcAceito?.disponibilidade_escolhida_id
              ) || orcAceito?.disponibilidade?.[0];
              const oficina = orcAceito?.oficina;

              return (
                <div key={sol.id} className="card border-l-4 border-l-green-500">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {sol.veiculo?.fipe_marca} {sol.veiculo?.fipe_modelo}
                      </h3>
                      <StatusBadge status={sol.status} />
                    </div>
                    {orcAceito && (
                      <p className="text-lg font-bold text-gray-900">{formatCurrency(orcAceito.valor_total)}</p>
                    )}
                  </div>

                  {/* Workshop info */}
                  {oficina && (
                    <div className="bg-primary-50 rounded-lg p-3 mb-3">
                      <p className="font-medium text-primary-900 text-sm">{oficina.nome_fantasia}</p>
                      <p className="text-xs text-primary-700 mt-1">{oficina.endereco}</p>
                      <p className="text-xs text-primary-700">{oficina.cidade} - {oficina.estado}</p>
                      {oficina.profile?.telefone && (
                        <p className="text-xs text-primary-700 mt-1">Tel: {oficina.profile.telefone}</p>
                      )}
                    </div>
                  )}

                  {/* Appointment details */}
                  {slotEscolhido && (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Check-in:</span>
                        <span className="font-medium text-gray-900">
                          {formatDateShort(slotEscolhido.data_checkin)}
                          {' - '}
                          {slotEscolhido.turno === 'manha' ? '08:00-12:00' : '13:00-17:00'}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Previsão entrega:</span>
                        <span className="font-medium text-gray-900">
                          {formatDateShort(slotEscolhido.data_previsao_entrega)}
                        </span>
                      </div>
                      {orcAceito?.prazo_dias && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Prazo:</span>
                          <span className="text-gray-900">{orcAceito.prazo_dias} dias</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-3 mt-3">
                    <Link
                      href={`/cliente/acompanhamento/${sol.id}`}
                      className="flex-1 text-center text-sm text-white bg-primary-600 hover:bg-primary-700 font-medium py-2 rounded-lg transition-colors"
                    >
                      Acompanhar
                    </Link>
                    <Link
                      href={`/cliente/orcamentos/${sol.id}`}
                      className="flex-1 text-center text-sm text-primary-600 hover:text-primary-700 font-medium py-2 border border-primary-200 rounded-lg transition-colors"
                    >
                      Ver detalhes
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Open requests - only abertas/em_orcamento */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Solicitações abertas</h2>
          {abertas.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500 mb-4">
                {agendadas.length > 0
                  ? 'Nenhuma solicitação aberta no momento'
                  : 'Você ainda não tem solicitações'}
              </p>
              <Link href="/cliente/nova-solicitacao" className="btn-primary">
                {agendadas.length > 0 ? 'Criar nova solicitação' : 'Criar primeira solicitação'}
              </Link>
            </div>
          ) : (
            abertas.map((sol) => (
              <Link key={sol.id} href={`/cliente/orcamentos/${sol.id}`} className="card block hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">
                        {sol.veiculo?.fipe_marca} {sol.veiculo?.fipe_modelo}
                      </h3>
                      <StatusBadge status={sol.status} />
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">{sol.descricao}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                      <span>{sol.endereco}</span>
                      <span>{timeAgo(sol.created_at)}</span>
                      {sol.orcamentos && sol.orcamentos.length > 0 && (
                        <span className="font-medium text-primary-600">
                          {sol.orcamentos.length} orçamento(s)
                        </span>
                      )}
                    </div>
                  </div>
                  {sol.orcamentos && sol.orcamentos.length > 0 && (
                    <div className="text-right ml-4">
                      <p className="text-sm text-gray-500">A partir de</p>
                      <p className="text-lg font-bold text-gray-900">
                        {formatCurrency(Math.min(...sol.orcamentos.map((o) => o.valor_total)))}
                      </p>
                    </div>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Sidebar - vehicles only */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Meus Veículos</h2>
              <Link href="/cliente/veiculos" className="text-sm text-primary-600 hover:text-primary-700">
                Ver todos
              </Link>
            </div>
            <div className="space-y-3">
              {veiculos.map((v) => (
                <div key={v.id} className="card !p-4">
                  <p className="font-medium text-gray-900 text-sm">
                    {v.apelido || `${v.fipe_marca} ${v.fipe_modelo}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    {v.fipe_marca} {v.fipe_modelo} {v.fipe_ano} {v.placa && `- ${v.placa}`}
                  </p>
                </div>
              ))}
              <Link
                href="/cliente/veiculos?add=true"
                className="block p-4 border-2 border-dashed border-gray-300 rounded-xl text-center hover:border-primary-400 hover:bg-primary-50 transition-colors"
              >
                <span className="text-sm text-gray-500 hover:text-primary-600">+ Adicionar veículo</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
