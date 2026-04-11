'use client';

import { useState } from 'react';
import { useAnaliseDano } from '@/hooks/use-analise-dano';
import { formatCurrency } from '@/lib/utils';

const SEVERITY_CONFIG: Record<string, { label: string; color: string }> = {
  leve: { label: 'Leve', color: 'bg-green-100 text-green-800' },
  moderado: { label: 'Moderado', color: 'bg-yellow-100 text-yellow-800' },
  grave: { label: 'Grave', color: 'bg-orange-100 text-orange-800' },
  severo: { label: 'Severo', color: 'bg-red-100 text-red-800' },
};

export default function DamageAnalysis({ solicitacaoId }: { solicitacaoId: string }) {
  const { analise, loading, analyzing, analisar } = useAnaliseDano(solicitacaoId);
  const [showChecklist, setShowChecklist] = useState(false);

  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-32 mb-3" />
        <div className="h-16 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!analise) {
    return (
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-2">Análise IA do Dano</h2>
        <p className="text-sm text-gray-500 mb-3">Use inteligência artificial para analisar as fotos do dano.</p>
        <button
          onClick={analisar}
          disabled={analyzing}
          className="btn-primary text-sm !py-2 w-full disabled:opacity-50"
        >
          {analyzing ? 'Analisando...' : 'Analisar com IA'}
        </button>
      </div>
    );
  }

  const sev = SEVERITY_CONFIG[analise.severidade] || SEVERITY_CONFIG.moderado;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Análise IA</h2>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${sev.color}`}>
          {sev.label}
        </span>
      </div>

      <p className="text-sm text-gray-700 mb-3">{analise.resumo}</p>

      {analise.estimativa_custo && (
        <div className="bg-gray-50 rounded-lg p-3 mb-3">
          <p className="text-xs text-gray-500">Estimativa de custo</p>
          <p className="text-sm font-semibold text-gray-900">
            {formatCurrency(analise.estimativa_custo.min)} - {formatCurrency(analise.estimativa_custo.max)}
          </p>
        </div>
      )}

      {analise.pecas_afetadas && analise.pecas_afetadas.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Peças afetadas</p>
          <div className="flex flex-wrap gap-1">
            {analise.pecas_afetadas.map((p, i) => (
              <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{p}</span>
            ))}
          </div>
        </div>
      )}

      {analise.checklist_inspecao && analise.checklist_inspecao.length > 0 && (
        <div>
          <button
            onClick={() => setShowChecklist(!showChecklist)}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium"
          >
            {showChecklist ? 'Ocultar checklist' : `Checklist de inspeção (${analise.checklist_inspecao.length} itens)`}
          </button>
          {showChecklist && (
            <div className="mt-2 space-y-1">
              {analise.checklist_inspecao.map((item, i) => (
                <label key={i} className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" className="w-3.5 h-3.5 text-primary-600 rounded" />
                  {item}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {analise.confianca != null && (
        <p className="text-[10px] text-gray-400 mt-2">
          Confiança: {Math.round(analise.confianca * 100)}%
        </p>
      )}
    </div>
  );
}
