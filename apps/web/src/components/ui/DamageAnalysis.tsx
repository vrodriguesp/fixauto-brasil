'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAnaliseDano } from '@/hooks/use-analise-dano';
import { formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { useTraducoes, AvisoTraducao } from '@/components/ui/TextoTraduzido';
import type { AnaliseDano } from '@fixauto/shared';

type Estimativa = NonNullable<AnaliseDano['estimativa_custo']>;

// Faixa APROXIMADA da IA: total, pecas, mao de obra (+ horas) e o aviso de que
// nao e preço. Tambem usada no formulario de orcamento.
export function EstimativaIA({ e, moeda, compacto = false }: { e: Estimativa; moeda: string; compacto?: boolean }) {
  const locale = useLocale();
  const t = useTranslations('damageAnalysis');
  const din = (a?: number | null, b?: number | null) =>
    a == null || b == null ? null : a === b ? formatCurrency(a, moeda, locale) : `${formatCurrency(a, moeda, locale)} – ${formatCurrency(b, moeda, locale)}`;
  const num = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
  const horas = e.horas_min != null && e.horas_max != null
    ? t('estimativaHoras', { horas: e.horas_min === e.horas_max ? num(e.horas_min) : `${num(e.horas_min)}–${num(e.horas_max)}` })
    : null;
  const pecas = din(e.pecas_min, e.pecas_max);
  const mao = din(e.mao_obra_min, e.mao_obra_max);
  return (
    <div className={compacto ? '' : 'bg-gray-50 rounded-lg p-3'} data-testid="ia-estimativa">
      <p className={`text-xs ${compacto ? 'text-indigo-600' : 'text-gray-500'}`}>{t('estimativaCusto')}</p>
      <p className={`font-semibold ${compacto ? 'text-sm text-indigo-900' : 'text-base text-gray-900'}`}>{din(e.min, e.max)}</p>
      {(pecas || mao) && (
        <dl className={`mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs ${compacto ? 'text-indigo-800' : 'text-gray-700'}`}>
          {pecas && <><dt className="text-gray-500">{t('estimativaPecas')}</dt><dd className="break-words">{pecas}</dd></>}
          {mao && <><dt className="text-gray-500">{t('estimativaMaoObra')}</dt><dd className="break-words">{mao}{horas ? ` · ${horas}` : ''}</dd></>}
        </dl>
      )}
      <p className="mt-1.5 text-[11px] leading-snug text-gray-500">{t('estimativaAviso')}</p>
    </div>
  );
}

export default function DamageAnalysis({ solicitacaoId, pais }: { solicitacaoId: string; pais?: string | null }) {
  const locale = useLocale();
  const t = useTranslations('damageAnalysis');
  const moeda = currencyForCountry(pais);
  const { analise, loading, analyzing, atualizando, error, analisar } = useAnaliseDano(solicitacaoId, locale);
  const [showChecklist, setShowChecklist] = useState(false);
  // analise guardada uma vez por pedido, na lingua de quem pediu primeiro:
  // cada leitor ve na sua (dono 04/11: oficina russa abriu, estoniana leu em russo)
  // (um aviso de traducao so para o bloco todo; 'ver original' volta tudo junto)
  const [original, setOriginal] = useState(false);
  const raw = (analise?.raw_response || {}) as { observacoes?: unknown; perguntas_sugeridas?: unknown };
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) as string[] : []);
  const obsOrig = lista(raw.observacoes);
  const pergOrig = lista(raw.perguntas_sugeridas);
  const pecasOrig = lista(analise?.pecas_afetadas);
  const checkOrig = lista(analise?.checklist_inspecao);
  const tr = useTraducoes(analise ? [analise.resumo || '', ...pecasOrig, ...checkOrig, ...obsOrig, ...pergOrig] : null, original);
  let i = 0;
  const pega = (n: number) => { const r = tr.textos.slice(i, i + n); i += n; return r; };
  const [resumo] = pega(1);
  const pecas = pega(pecasOrig.length);
  const checklist = pega(checkOrig.length);
  const observacoes = pega(obsOrig.length);
  const perguntas = pega(pergOrig.length);

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
            <p className="text-xs text-red-800">{error === 'IA_OCUPADA' ? t('erroIaOcupada') : error === 'SEM_FOTOS' ? t('erroSemFotos') : error === 'FOTO_INVALIDA' ? t('erroFotoInvalida') : t('erroGenerico')}</p>
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
  // IA sem estimativa (0 - 0 €, teste de 05/11): nao mostra a faixa
  const est = analise.estimativa_custo && Number(analise.estimativa_custo.max) > 0 ? analise.estimativa_custo : null;
  const formatoNovo = Number((analise.raw_response as { versao?: number } | undefined)?.versao || 0) >= 2;

  return (
    <div className="card" data-testid="analise-ia">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold text-gray-900">{t('titulo')}</h2>
        <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${sev.color}`}>
          {sev.label}
        </span>
      </div>

      {atualizando && <p className="text-xs text-gray-500 mb-2" role="status">{t('atualizando')}</p>}

      {resumo && <p className="text-sm text-gray-700 mb-3 break-words">{resumo}</p>}

      {est ? (
        <div className="mb-3"><EstimativaIA e={est} moeda={moeda} /></div>
      ) : formatoNovo && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 mb-3">{t('semEstimativa')}</p>
      )}

      {observacoes.length > 0 && (
        <div className="mb-3" data-testid="ia-observacoes">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{t('observacoes')}</p>
          <ul className="list-disc pl-4 space-y-1 text-sm text-gray-700">
            {observacoes.map((o, k) => <li key={k} className="break-words">{o}</li>)}
          </ul>
        </div>
      )}

      {perguntas.length > 0 && (
        <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3" data-testid="ia-perguntas">
          <p className="text-xs font-semibold text-indigo-800 uppercase mb-1">{t('perguntasCliente')}</p>
          <ol className="list-decimal pl-4 space-y-1 text-sm text-indigo-900">
            {perguntas.map((p, k) => <li key={k} className="break-words">{p}</li>)}
          </ol>
          <p className="mt-1.5 text-[11px] text-indigo-700">{t('perguntasDica')}</p>
        </div>
      )}

      {pecas.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{t('pecasAfetadas')}</p>
          <div className="flex flex-wrap gap-1">
            {pecas.map((p, k) => (
              <span key={k} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded max-w-full break-words">{p}</span>
            ))}
          </div>
        </div>
      )}

      {checklist.length > 0 && (
        <div>
          <button
            onClick={() => setShowChecklist(!showChecklist)}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium"
          >
            {showChecklist ? t('ocultarChecklist') : t('checklistInspecao', { count: checklist.length })}
          </button>
          {showChecklist && (
            <div className="mt-2 space-y-1">
              {checklist.map((item, k) => (
                <label key={k} className="flex items-start gap-2 text-xs text-gray-700">
                  <input type="checkbox" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary-600 rounded" />
                  {item}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <AvisoTraducao origem={tr.origem} original={original} alternar={() => setOriginal((o) => !o)} className="mt-3" />

      {analise.confianca != null && (
        <p className="text-[10px] text-gray-400 mt-2">
          {t('confianca', { percent: Math.round(analise.confianca * 100) })}
        </p>
      )}
    </div>
  );
}
