'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAnaliseDano } from '@/hooks/use-analise-dano';
import { formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';

export default function DamageAnalysis({ solicitacaoId, pais }: { solicitacaoId: string; pais?: string | null }) {
  const locale = useLocale();
  const t = useTranslations('damageAnalysis');
  const moeda = currencyForCountry(pais);
  const { analise, loading, analyzing, error, analisar } = useAnaliseDano(solicitacaoId);
  const [showChecklist, setShowChecklist] = useState(false);

  const SEVERITY_CONFIG: Record<string, { label: string; color: string }> = {
    leve: { label: t('severidadeLeve'), color: 'bg-green-100 text-green-800' },
    moderado: { label: t('severidadeModerado'), color: 'bg-yellow-100 text-yellow-800' },
    grave: { label: t('severidadeGrave'), color: 'bg-orange-100 text-orange-800' },
    severo: { label: t('severidadeSevero'), color: 'bg-red-100 text-red-800' },
  };

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
        <h2 className="font-semibold text-gray-900 mb-2">{t('tituloInicial')}</h2>
        <p className="text-sm text-gray-500 mb-3">{t('descricaoInicial')}</p>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-3">
            <p className="text-xs text-red-800">{error}</p>
          </div>
        )}
        <button
          onClick={analisar}
          disabled={analyzing}
          className="btn-primary text-sm !py-2 w-full disabled:opacity-50"
        >
          {analyzing ? t('analisando') : error ? t('tentarNovamente') : t('analisarComIA')}
        </button>
      </div>
    );
  }

  const sev = SEVERITY_CONFIG[analise.severidade] || SEVERITY_CONFIG.moderado;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">{t('titulo')}</h2>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${sev.color}`}>
          {sev.label}
        </span>
      </div>

      <p className="text-sm text-gray-700 mb-3">{analise.resumo}</p>

      {analise.estimativa_custo && (
        <div className="bg-gray-50 rounded-lg p-3 mb-3">
          <p className="text-xs text-gray-500">{t('estimativaCusto')}</p>
          <p className="text-sm font-semibold text-gray-900">
            {formatCurrency(analise.estimativa_custo.min, moeda, locale)} - {formatCurrency(analise.estimativa_custo.max, moeda, locale)}
          </p>
        </div>
      )}

      {analise.pecas_afetadas && analise.pecas_afetadas.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{t('pecasAfetadas')}</p>
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
            {showChecklist ? t('ocultarChecklist') : t('checklistInspecao', { count: analise.checklist_inspecao.length })}
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
          {t('confianca', { percent: Math.round(analise.confianca * 100) })}
        </p>
      )}
    </div>
  );
}
