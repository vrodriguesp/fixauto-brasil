'use client';

import { useAuth } from '@/lib/auth-context';
import { mockAvaliacoes } from '@/lib/mock-data';
import StarRating from '@/components/ui/StarRating';
import { formatDate } from '@/lib/utils';

export default function AvaliacoesPage() {
  const { oficina } = useAuth();
  const avaliacoes = mockAvaliacoes;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Avaliacoes</h1>
      <p className="text-gray-600 mb-8">Veja o que seus clientes dizem sobre seus servicos</p>

      {/* Summary */}
      <div className="card mb-8">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-bold text-gray-900">{oficina?.avaliacao_media || 0}</p>
            <StarRating rating={oficina?.avaliacao_media || 0} size="md" />
            <p className="text-sm text-gray-500 mt-1">{oficina?.total_avaliacoes || 0} avaliacoes</p>
          </div>
          <div className="flex-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = avaliacoes.filter((a) => a.nota === star).length;
              const pct = avaliacoes.length > 0 ? (count / avaliacoes.length) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 w-2">{star}</span>
                  <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm text-gray-500 w-8">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reviews list */}
      {avaliacoes.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">Nenhuma avaliacao recebida ainda</p>
        </div>
      ) : (
        <div className="space-y-4">
          {avaliacoes.map((av) => (
            <div key={av.id} className="card">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-gray-600 font-semibold">
                      {av.cliente?.nome?.charAt(0) || 'C'}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{av.cliente?.nome}</p>
                    <StarRating rating={av.nota} size="sm" />
                  </div>
                </div>
                <span className="text-xs text-gray-500">{formatDate(av.created_at)}</span>
              </div>
              {av.comentario && (
                <p className="text-gray-600 text-sm mt-2">{av.comentario}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
