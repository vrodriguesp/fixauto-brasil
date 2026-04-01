'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { useNotificacoes } from '@/hooks/use-notificacoes';
import { useVeiculos } from '@/hooks/use-veiculos';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency, timeAgo } from '@/lib/utils';

export default function ClienteDashboard() {
  const { user } = useAuth();
  const { solicitacoes } = useSolicitacoes();
  const { notificacoes: allNotificacoes } = useNotificacoes();
  const { veiculos } = useVeiculos();

  const notificacoes = allNotificacoes.filter((n) => !n.lida);

  const stats = {
    ativas: solicitacoes.filter((s) => ['aberta', 'em_orcamento', 'aceita', 'em_andamento'].includes(s.status)).length,
    orcamentosPendentes: solicitacoes.reduce((acc, s) => acc + (s.orcamentos?.filter((o) => o.status === 'enviado').length || 0), 0),
    concluidas: solicitacoes.filter((s) => s.status === 'concluida').length,
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

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.ativas}</p>
            <p className="text-sm text-gray-500">Solicitações ativas</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.orcamentosPendentes}</p>
            <p className="text-sm text-gray-500">Orçamentos pendentes</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{stats.concluidas}</p>
            <p className="text-sm text-gray-500">Reparos concluídos</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Active requests */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Solicitações recentes</h2>
          {solicitacoes.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500 mb-4">Você ainda não tem solicitações</p>
              <Link href="/cliente/nova-solicitacao" className="btn-primary">
                Criar primeira solicitação
              </Link>
            </div>
          ) : (
            solicitacoes.map((sol) => (
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

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Notifications */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Notificações</h2>
            {notificacoes.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma notificação nova</p>
            ) : (
              <div className="space-y-3">
                {notificacoes.map((n) => {
                  const solId = (n.dados as Record<string, string> | null)?.solicitacao_id;
                  const href = solId ? `/cliente/orcamentos/${solId}` : '/cliente/orcamentos';
                  return (
                    <Link key={n.id} href={href} className="card !p-4 border-l-4 border-l-primary-500 block hover:shadow-md transition-shadow">
                      <p className="text-sm font-medium text-gray-900">{n.titulo}</p>
                      <p className="text-xs text-gray-500 mt-1">{n.mensagem}</p>
                      <p className="text-xs text-primary-600 mt-2">Clique para ver detalhes</p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Vehicles quick view */}
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
