'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSolicitacoes } from '@/hooks/use-solicitacoes';
import { supabase } from '@/lib/supabase';
import StatusBadge from '@/components/ui/StatusBadge';
import { formatDate, getUrgenciaColor } from '@/lib/utils';

export default function SolicitacaoDetalhePage() {
  const params = useParams();
  const { solicitacoes } = useSolicitacoes();
  const solicitacao = solicitacoes.find((s) => s.id === params.id);

  // Direct fetch as fallback when the hook doesn't return this solicitation
  const [directSol, setDirectSol] = useState<any>(null);
  useEffect(() => {
    if (!solicitacao && params.id) {
      supabase
        .from('solicitacoes')
        .select(
          '*, veiculo:veiculos(*), fotos:solicitacao_fotos(*), cliente:profiles!solicitacoes_cliente_id_fkey(*), orcamentos(*, itens:orcamento_itens(*), oficina:oficinas(*, profile:profiles(*)), disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(*))'
        )
        .eq('id', params.id)
        .single()
        .then(({ data }) => {
          if (data) setDirectSol(data);
        });
    }
  }, [solicitacao, params.id]);

  const sol = solicitacao || directSol;

  if (!sol) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">Solicitação não encontrada</p>
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
            {sol.veiculo?.fipe_marca} {sol.veiculo?.fipe_modelo}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge status={sol.status} />
            <span className={`badge ${getUrgenciaColor(sol.urgencia)}`}>
              Urgência: {sol.urgencia}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/oficina/mensagens/${sol.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Enviar Mensagem
          </Link>
          <Link href={`/oficina/enviar-orcamento/${sol.id}`} className="btn-primary">
            Enviar Orçamento
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-2">Descrição do problema</h2>
            <p className="text-gray-600">{sol.descricao}</p>
          </div>

          {/* Photos */}
          {sol.fotos && sol.fotos.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-3">
                Fotos ({sol.fotos.length})
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {sol.fotos.map((foto: any) => (
                  <a key={foto.id} href={foto.foto_url} target="_blank" rel="noopener noreferrer" className="aspect-square bg-gray-200 rounded-lg overflow-hidden block">
                    {foto.foto_url ? (
                      <img src={foto.foto_url} alt={foto.descricao || 'Foto do dano'} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">Informações do veículo</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Marca</dt>
                <dd className="text-gray-900">{sol.veiculo?.fipe_marca}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Modelo</dt>
                <dd className="text-gray-900">{sol.veiculo?.fipe_modelo}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Ano</dt>
                <dd className="text-gray-900">{sol.veiculo?.fipe_ano}</dd>
              </div>
              {sol.veiculo?.placa && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Placa</dt>
                  <dd className="text-gray-900">{sol.veiculo.placa}</dd>
                </div>
              )}
              {sol.veiculo?.cor && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Cor</dt>
                  <dd className="text-gray-900">{sol.veiculo.cor}</dd>
                </div>
              )}
              {sol.veiculo?.fipe_valor && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Valor FIPE</dt>
                  <dd className="text-green-600 font-medium">{sol.veiculo.fipe_valor}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">Cliente</h2>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <span className="text-gray-600 font-semibold">
                  {sol.cliente?.nome?.charAt(0)}
                </span>
              </div>
              <div>
                <p className="font-medium text-gray-900 text-sm">{sol.cliente?.nome}</p>
                <p className="text-xs text-gray-500">{sol.endereco}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Solicitado em {formatDate(sol.created_at)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
