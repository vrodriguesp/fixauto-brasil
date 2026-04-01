'use client';

import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function HistoricoPage() {
  const { solicitacoes } = useSolicitacoes();
  const historico = solicitacoes.filter((s) =>
    ['concluida', 'cancelada'].includes(s.status)
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Historico</h1>
      <p className="text-gray-600 mb-8">Seus reparos anteriores</p>

      {historico.length === 0 ? (
        <div className="card text-center py-12">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-500">Nenhum reparo concluido ainda</p>
          <p className="text-sm text-gray-400 mt-1">Quando seus reparos forem concluidos, eles aparecerrao aqui</p>
        </div>
      ) : (
        <div className="space-y-4">
          {historico.map((sol) => (
            <div key={sol.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">
                      {sol.veiculo?.fipe_marca} {sol.veiculo?.fipe_modelo}
                    </h3>
                    <StatusBadge status={sol.status} />
                  </div>
                  <p className="text-sm text-gray-600">{sol.descricao}</p>
                  <p className="text-xs text-gray-500 mt-2">{formatDate(sol.created_at)}</p>
                </div>
                {sol.orcamentos && sol.orcamentos.length > 0 && (
                  <p className="text-lg font-bold text-gray-900">
                    {formatCurrency(sol.orcamentos[0].valor_total)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
