'use client';

import Link from 'next/link';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency, timeAgo } from '@/lib/utils';

export default function OrcamentosPage() {
  const { solicitacoes: allSolicitacoes } = useSolicitacoes();
  const solicitacoes = allSolicitacoes.filter(
    (s) => s.orcamentos && s.orcamentos.length > 0
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Orcamentos</h1>
      <p className="text-gray-600 mb-8">Compare orcamentos recebidos para seus reparos</p>

      {solicitacoes.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">Nenhum orcamento recebido ainda</p>
          <Link href="/cliente/nova-solicitacao" className="btn-primary">
            Criar solicitacao
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {solicitacoes.map((sol) => (
            <div key={sol.id} className="card">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {sol.veiculo?.fipe_marca} {sol.veiculo?.fipe_modelo}
                    </h2>
                    <StatusBadge status={sol.status} />
                  </div>
                  <p className="text-sm text-gray-500">{sol.descricao}</p>
                </div>
                <span className="text-sm text-gray-400">{timeAgo(sol.created_at)}</span>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium text-gray-700 mb-3">
                  {sol.orcamentos!.length} orcamento(s) recebido(s)
                </p>
                <div className="space-y-3">
                  {sol.orcamentos!.map((orc) => (
                    <Link
                      key={orc.id}
                      href={`/cliente/orcamentos/${sol.id}`}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-primary-700 font-semibold text-sm">
                            {orc.oficina?.nome_fantasia?.charAt(0) || 'O'}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">
                            {orc.oficina?.nome_fantasia}
                          </p>
                          <p className="text-xs text-gray-500">
                            Prazo: {orc.prazo_dias} dias | {orc.itens?.length || 0} itens
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(orc.valor_total)}
                        </p>
                        <StatusBadge status={orc.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
