'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { formatCurrency, INTL_LOCALE } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { COMISSAO_PECAS_CONFIG } from '@fixauto/shared';
import type { TipoFornecedorPeca } from '@fixauto/shared';

interface Props {
  fornecedorTipo: TipoFornecedorPeca;
  fornecedorId: string;
  pais?: string | null;
}

interface ConfigInfo {
  taxa_calculada: number | null;
  taxa_fixa_override: number | null;
  usa_override: boolean;
  media_tempo_resposta_horas: number | null;
  total_pedidos_90dias: number;
}

interface Lancamento {
  id: string;
  valor_pedido: number;
  taxa_aplicada: number;
  valor_comissao: number;
  status: string;
  created_at: string;
}

export default function ComissaoPecasCard({ fornecedorTipo, fornecedorId, pais }: Props) {
  const locale = useLocale();
  const t = useTranslations('comissaoPecasCard');
  const moeda = currencyForCountry(pais);
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fornecedorId) return;
    setLoading(true);
    Promise.all([
      supabase.from('comissao_pecas_config').select('*').eq('fornecedor_tipo', fornecedorTipo).eq('fornecedor_id', fornecedorId).maybeSingle(),
      supabase.from('comissao_pecas_lancamento').select('*').eq('fornecedor_tipo', fornecedorTipo).eq('fornecedor_id', fornecedorId).order('created_at', { ascending: false }),
    ]).then(([{ data: cfg }, { data: lancs }]) => {
      setConfig(cfg as ConfigInfo | null);
      setLancamentos((lancs as Lancamento[]) || []);
      setLoading(false);
    });
  }, [fornecedorTipo, fornecedorId]);

  if (loading) {
    return <div className="animate-pulse h-40 bg-gray-200 rounded-xl" />;
  }

  const taxa = config
    ? (config.usa_override && config.taxa_fixa_override != null ? config.taxa_fixa_override : config.taxa_calculada) ?? COMISSAO_PECAS_CONFIG.TAXA_BASE
    : COMISSAO_PECAS_CONFIG.TAXA_BASE;
  const totalPendente = lancamentos.filter((l) => l.status === 'pendente').reduce((s, l) => s + l.valor_comissao, 0);
  const totalPago = lancamentos.filter((l) => l.status === 'pago').reduce((s, l) => s + l.valor_comissao, 0);

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-primary-600">{(taxa * 100).toFixed(1)}%</p>
          <p className="text-sm text-gray-500 mt-1">{t('suaTaxaAtual')}</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold text-orange-600">{formatCurrency(totalPendente, moeda, locale)}</p>
          <p className="text-sm text-gray-500 mt-1">{t('comissaoPendente')}</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold text-green-600">{formatCurrency(totalPago, moeda, locale)}</p>
          <p className="text-sm text-gray-500 mt-1">{t('comissaoPaga')}</p>
        </div>
      </div>

      <div className="bg-blue-50 rounded-lg p-3">
        <p className="text-xs text-blue-800">
          {t('infoTaxa', {
            base: (COMISSAO_PECAS_CONFIG.TAXA_BASE * 100).toFixed(0),
            min: (COMISSAO_PECAS_CONFIG.TAXA_MIN * 100).toFixed(0),
            media: config?.media_tempo_resposta_horas ? t('mediaTempoResposta', { horas: config.media_tempo_resposta_horas.toFixed(1) }) : '',
          })}
        </p>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">{t('extratoTitulo')}</h2>
        {lancamentos.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">{t('nenhumaComissao')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b">
                  <th className="text-left py-2 font-medium">{t('colData')}</th>
                  <th className="text-right py-2 font-medium">{t('colValorPedido')}</th>
                  <th className="text-right py-2 font-medium">{t('colTaxa')}</th>
                  <th className="text-right py-2 font-medium">{t('colComissao')}</th>
                  <th className="text-right py-2 font-medium">{t('colStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lancamentos.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 text-gray-600">{new Date(l.created_at).toLocaleDateString(INTL_LOCALE[locale] || 'en-GB')}</td>
                    <td className="py-2 text-right text-gray-600">{formatCurrency(l.valor_pedido, moeda, locale)}</td>
                    <td className="py-2 text-right text-gray-600">{(l.taxa_aplicada * 100).toFixed(1)}%</td>
                    <td className="py-2 text-right font-medium text-gray-900">{formatCurrency(l.valor_comissao, moeda, locale)}</td>
                    <td className="py-2 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.status === 'pendente' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        {l.status === 'pendente' ? t('statusPendente') : t('statusPago')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
