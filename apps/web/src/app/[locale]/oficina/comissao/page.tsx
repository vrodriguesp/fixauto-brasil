'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency, INTL_LOCALE } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { COMISSAO_CONFIG } from '@fixauto/shared';

interface ComissaoInfo {
  taxa_calculada: number;
  media_tempo_resposta_horas: number;
  media_revisoes_orcamento: number;
  media_avaliacao_clientes: number;
  total_servicos_concluidos: number;
}

interface Lancamento {
  id: string;
  valor_servico: number;
  taxa_aplicada: number;
  valor_comissao: number;
  status: string;
  created_at: string;
  solicitacao?: { descricao: string; veiculo?: { fipe_marca: string; fipe_modelo: string } };
}

export default function ComissaoPage() {
  const t = useTranslations('oficinaComissao');
  const locale = useLocale();
  const { oficina } = useAuth();
  const moeda = currencyForCountry(oficina?.pais);
  const [config, setConfig] = useState<ComissaoInfo | null>(null);
  // Taxa que vale hoje pela hierarquia (individual do admin > regra global),
  // calculada no servidor - a oficina so ve o resultado e de onde ele vem.
  const [efetiva, setEfetiva] = useState<{
    tipo: 'percentual' | 'valor_fixo';
    taxa: number;
    valorFixo: number | null;
    origem: 'individual' | 'global';
    modoGlobal: 'isento' | 'fixa' | 'desempenho' | 'por_servico';
    faixaGlobal: { min: number; max: number } | null;
    ate: string | null;
    fundador: boolean;
  } | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!oficina) return;

    fetch(`/api/comissao-atual?oficinaId=${oficina.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setEfetiva(data);
        if (data.metricas) {
          const m = data.metricas;
          setConfig({
            taxa_calculada: Number(m.taxa_calculada),
            media_tempo_resposta_horas: Number(m.media_tempo_resposta_horas),
            media_revisoes_orcamento: Number(m.media_revisoes_orcamento),
            media_avaliacao_clientes: Number(m.media_avaliacao_clientes),
            total_servicos_concluidos: Number(m.total_servicos_concluidos),
          });
        }
      });

    // Fetch lancamentos
    supabase.from('comissao_lancamento')
      .select('*, orcamento:orcamentos(solicitacao:solicitacoes(descricao, veiculo:veiculos(fipe_marca, fipe_modelo)))')
      .eq('oficina_id', oficina.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        // comissao_lancamento liga ao orcamento (nao direto a solicitacao)
        if (data) setLancamentos(data.map((l: any) => ({ ...l, solicitacao: l.orcamento?.solicitacao })) as Lancamento[]);
        setLoading(false);
      });
  }, [oficina]);

  const taxa = efetiva ? efetiva.taxa : 0;
  // Faixa do modo "por desempenho" definida pelo admin (ex.: 1%..5%); a
  // escala de calculo (COMISSAO_CONFIG) e convertida proporcionalmente.
  const faixa = efetiva?.faixaGlobal || { min: COMISSAO_CONFIG.TAXA_MIN, max: COMISSAO_CONFIG.TAXA_MAX };
  const escala = (faixa.max - faixa.min) / (COMISSAO_CONFIG.TAXA_MAX - COMISSAO_CONFIG.TAXA_MIN);
  const valorFixoTexto = efetiva?.tipo === 'valor_fixo' ? formatCurrency(efetiva.valorFixo || 0, moeda, locale) : null;
  const corTaxa = efetiva?.tipo === 'valor_fixo' || faixa.max <= faixa.min ? '#111827'
    : taxa <= faixa.min + (faixa.max - faixa.min) / 3 ? '#16a34a' : taxa <= faixa.min + (2 * (faixa.max - faixa.min)) / 3 ? '#ca8a04' : '#dc2626';
  // O detalhamento por desempenho so faz sentido quando e ele que define a taxa
  const mostraDesempenho = efetiva?.origem === 'global' && efetiva.modoGlobal === 'desempenho';
  const pctTexto = (v: number) => `${(v * 100).toLocaleString(INTL_LOCALE[locale as keyof typeof INTL_LOCALE] || 'en-GB', { maximumFractionDigits: 2 })}%`;
  const dataTexto = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString(INTL_LOCALE[locale as keyof typeof INTL_LOCALE] || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const totalPendente = lancamentos.filter(l => l.status === 'pendente').reduce((s, l) => s + Number(l.valor_comissao || 0), 0);
  const totalPago = lancamentos.filter(l => l.status === 'pago').reduce((s, l) => s + Number(l.valor_comissao || 0), 0);

  // Calculate bonuses for breakdown
  const calcBonus = () => {
    if (!config) return [];
    const items = [];
    const C = COMISSAO_CONFIG;

    if (config.media_tempo_resposta_horas > 0 && config.media_tempo_resposta_horas < 2) {
      items.push({ label: t('bonusRespostaRapida'), bonus: C.BONUS_RESPOSTA_2H, value: `${config.media_tempo_resposta_horas.toFixed(1)}h`, color: 'green' });
    } else if (config.media_tempo_resposta_horas > 0 && config.media_tempo_resposta_horas < 4) {
      items.push({ label: t('bonusRespostaBoa'), bonus: C.BONUS_RESPOSTA_4H, value: `${config.media_tempo_resposta_horas.toFixed(1)}h`, color: 'green' });
    } else {
      items.push({ label: t('bonusTempoResposta'), bonus: 0, value: config.media_tempo_resposta_horas > 0 ? `${config.media_tempo_resposta_horas.toFixed(1)}h` : '—', color: 'gray' });
    }

    if (config.media_revisoes_orcamento < 1.0) {
      items.push({ label: t('bonusPouquissimasRevisoes'), bonus: C.BONUS_REVISAO_1_5 + C.BONUS_REVISAO_1_0, value: config.media_revisoes_orcamento.toFixed(1), color: 'green' });
    } else if (config.media_revisoes_orcamento < 1.5) {
      items.push({ label: t('bonusPoucasRevisoes'), bonus: C.BONUS_REVISAO_1_5, value: config.media_revisoes_orcamento.toFixed(1), color: 'green' });
    } else {
      items.push({ label: t('bonusRevisoesOrcamento'), bonus: 0, value: config.media_revisoes_orcamento.toFixed(1), color: 'gray' });
    }

    if (config.media_avaliacao_clientes >= 4.5) {
      items.push({ label: t('bonusAvaliacaoExcelente'), bonus: C.BONUS_AVALIACAO_4_5, value: config.media_avaliacao_clientes.toFixed(1), color: 'green' });
    } else if (config.media_avaliacao_clientes >= 4.0) {
      items.push({ label: t('bonusBoaAvaliacao'), bonus: C.BONUS_AVALIACAO_4_0, value: config.media_avaliacao_clientes.toFixed(1), color: 'green' });
    } else {
      items.push({ label: t('bonusAvaliacaoClientes'), bonus: 0, value: config.media_avaliacao_clientes > 0 ? config.media_avaliacao_clientes.toFixed(1) : '—', color: 'gray' });
    }

    if (config.total_servicos_concluidos >= 25) {
      items.push({ label: t('bonusFidelidade25'), bonus: 0.02, value: `${config.total_servicos_concluidos}`, color: 'green' });
    } else if (config.total_servicos_concluidos >= 10) {
      items.push({ label: t('bonusFidelidade10'), bonus: 0.01, value: `${config.total_servicos_concluidos}`, color: 'green' });
    } else {
      items.push({ label: t('bonusFidelidadeVolume'), bonus: 0, value: `${config.total_servicos_concluidos}`, color: 'gray' });
    }

    return items;
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-32 bg-gray-200 rounded-xl" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  const bonuses = calcBonus();
  const totalBonus = bonuses.reduce((s, b) => s + b.bonus, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold text-gray-900">{t('titulo')}</h1>
        {efetiva?.fundador && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
            ⭐ {t('seloFundador')}
          </span>
        )}
      </div>
      <p className="text-gray-600 mb-6">{t('subtitulo')}</p>

      {/* De onde vem a taxa */}
      {efetiva && (efetiva.origem === 'individual' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-8">
          <p className="font-semibold text-amber-900">{t('condicaoEspecialTitulo')}</p>
          <p className="text-sm text-amber-800 mt-1">
            {t('condicaoEspecialTexto', { taxa: valorFixoTexto ? t('porServico', { valor: valorFixoTexto }) : pctTexto(efetiva.taxa) })}{' '}
            {efetiva.ate ? t('validaAte', { data: dataTexto(efetiva.ate) }) : t('semPrazo')}
          </p>
        </div>
      ) : efetiva.modoGlobal === 'isento' ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 mb-8">
          <p className="font-semibold text-green-900">{t('faseFundadorTitulo')}</p>
          <p className="text-sm text-green-800 mt-1">{t('faseFundadorTexto')}</p>
        </div>
      ) : efetiva.modoGlobal === 'fixa' ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mb-8">
          <p className="text-sm text-blue-800">{t('taxaFixaTexto', { taxa: pctTexto(efetiva.taxa) })}</p>
        </div>
      ) : efetiva.modoGlobal === 'por_servico' ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mb-8">
          <p className="text-sm text-blue-800">{t('valorPorServicoTexto', { valor: valorFixoTexto || '' })}</p>
        </div>
      ) : null)}

      {/* Current rate */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <div className="card text-center">
          <p className={`${valorFixoTexto ? 'text-3xl' : 'text-4xl'} font-bold`} style={{ color: corTaxa }}>
            {valorFixoTexto ? t('porServico', { valor: valorFixoTexto }) : pctTexto(taxa)}
          </p>
          <p className="text-sm text-gray-500 mt-1">{t('suaTaxaAtual')}</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalPendente, moeda, locale)}</p>
          <p className="text-sm text-gray-500 mt-1">{t('pendente')}</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPago, moeda, locale)}</p>
          <p className="text-sm text-gray-500 mt-1">{t('pago')}</p>
        </div>
      </div>

      {/* Breakdown */}
      {mostraDesempenho && (
      <div className="card mb-8">
        <h2 className="font-semibold text-gray-900 mb-4">{t('comoTaxaCalculada')}</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">{t('taxaBase')}</span>
            <span className="font-bold text-gray-900">{pctTexto(faixa.max)}</span>
          </div>

          {bonuses.map((b, i) => (
            <div key={i}>
              <div className="flex items-center justify-between text-sm mb-1">
                <div className="flex items-center gap-2">
                  <span className={b.bonus > 0 ? 'text-green-700' : 'text-gray-500'}>{b.label}</span>
                  <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{b.value}</span>
                </div>
                <span className={`font-medium ${b.bonus > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  {b.bonus > 0 ? `-${pctTexto(b.bonus * escala)}` : '-'}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${b.bonus > 0 ? 'bg-green-400' : 'bg-gray-200'}`}
                  style={{ width: `${Math.min((b.bonus / (COMISSAO_CONFIG.TAXA_MAX - COMISSAO_CONFIG.TAXA_MIN)) * 100, 100)}%` }} />
              </div>
            </div>
          ))}

          <div className="border-t pt-3 flex items-center justify-between">
            <span className="font-semibold text-gray-900">{t('suaTaxaFinal')}</span>
            <span className="text-xl font-bold" style={{ color: corTaxa }}>
              {pctTexto(taxa)}
            </span>
          </div>
        </div>

        <div className="mt-4 bg-blue-50 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            <strong>{t('dicaLabel')}</strong> {t('dicaTexto')}
            {' '}{t('taxaVaria', { min: pctTexto(faixa.min).replace('%', ''), max: pctTexto(faixa.max).replace('%', '') })}
          </p>
        </div>
      </div>
      )}

      {/* Ledger */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">{t('extratoComissoes')}</h2>
        {lancamentos.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">{t('nenhumaComissaoRegistrada')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b">
                  <th className="text-left py-2 font-medium">{t('colData')}</th>
                  <th className="text-left py-2 font-medium">{t('colServico')}</th>
                  <th className="text-right py-2 font-medium">{t('colValor')}</th>
                  <th className="text-right py-2 font-medium">{t('colTaxa')}</th>
                  <th className="text-right py-2 font-medium">{t('colComissao')}</th>
                  <th className="text-right py-2 font-medium">{t('colStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lancamentos.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 text-gray-600">{new Date(l.created_at).toLocaleDateString(INTL_LOCALE[locale] || 'en-GB')}</td>
                    <td className="py-2 text-gray-900">
                      {(l.solicitacao as any)?.veiculo?.fipe_marca} {(l.solicitacao as any)?.veiculo?.fipe_modelo}
                    </td>
                    <td className="py-2 text-right text-gray-600">{formatCurrency(l.valor_servico, moeda, locale)}</td>
                    <td className="py-2 text-right text-gray-600">{(l.taxa_aplicada * 100).toFixed(1)}%</td>
                    <td className="py-2 text-right font-medium text-gray-900">{formatCurrency(l.valor_comissao, moeda, locale)}</td>
                    <td className="py-2 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        l.status === 'pendente' ? 'bg-yellow-100 text-yellow-700' :
                        l.status === 'pago' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{l.status === 'pendente' ? t('pendente') : l.status === 'pago' ? t('pago') : l.status}</span>
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
