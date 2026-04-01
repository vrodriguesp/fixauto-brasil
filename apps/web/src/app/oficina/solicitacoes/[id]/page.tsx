'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatDate, getUrgenciaColor } from '@/lib/utils';

export default function SolicitacaoDetalhePage() {
  const params = useParams();
  const { solicitacoes } = useSolicitacoes();
  const solicitacao = solicitacoes.find((s) => s.id === params.id);

  if (!solicitacao) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">Solicitacao nao encontrada</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/oficina/solicitacoes" className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Voltar
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {solicitacao.veiculo?.fipe_marca} {solicitacao.veiculo?.fipe_modelo}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge status={solicitacao.status} />
            <span className={`badge ${getUrgenciaColor(solicitacao.urgencia)}`}>
              Urgencia: {solicitacao.urgencia}
            </span>
          </div>
        </div>
        <Link href={`/oficina/enviar-orcamento/${solicitacao.id}`} className="btn-primary">
          Enviar Orcamento
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-2">Descricao do problema</h2>
            <p className="text-gray-600">{solicitacao.descricao}</p>
          </div>

          {/* Photos */}
          {solicitacao.fotos && solicitacao.fotos.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-3">
                Fotos ({solicitacao.fotos.length})
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {solicitacao.fotos.map((foto) => (
                  <div key={foto.id} className="aspect-square bg-gray-200 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <svg className="w-8 h-8 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-xs text-gray-500 mt-1">{foto.descricao}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">Informacoes do veiculo</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Marca</dt>
                <dd className="text-gray-900">{solicitacao.veiculo?.fipe_marca}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Modelo</dt>
                <dd className="text-gray-900">{solicitacao.veiculo?.fipe_modelo}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Ano</dt>
                <dd className="text-gray-900">{solicitacao.veiculo?.fipe_ano}</dd>
              </div>
              {solicitacao.veiculo?.placa && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Placa</dt>
                  <dd className="text-gray-900">{solicitacao.veiculo.placa}</dd>
                </div>
              )}
              {solicitacao.veiculo?.cor && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Cor</dt>
                  <dd className="text-gray-900">{solicitacao.veiculo.cor}</dd>
                </div>
              )}
              {solicitacao.veiculo?.fipe_valor && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Valor FIPE</dt>
                  <dd className="text-green-600 font-medium">{solicitacao.veiculo.fipe_valor}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">Cliente</h2>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-gray-600 font-semibold">
                  {solicitacao.cliente?.nome?.charAt(0)}
                </span>
              </div>
              <div>
                <p className="font-medium text-gray-900 text-sm">{solicitacao.cliente?.nome}</p>
                <p className="text-xs text-gray-500">{solicitacao.endereco}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Solicitado em {formatDate(solicitacao.created_at)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
