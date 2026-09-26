'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { COMISSAO_CONFIG } from '@fixauto/shared';

interface ComissaoInfo {
  taxa_calculada: number;
  taxa_fixa_override: number | null;
  usa_override: boolean;
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
  const { oficina } = useAuth();
  const [config, setConfig] = useState<ComissaoInfo | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!oficina) return;

    // Fetch commission config
    supabase.from('comissao_config').select('*').eq('oficina_id', oficina.id).single()
      .then(({ data }) => {
        if (data) setConfig(data as ComissaoInfo);
      });

    // Fetch lancamentos
    supabase.from('comissao_lancamento')
      .select('*, solicitacao:solicitacoes(descricao, veiculo:veiculos(fipe_marca, fipe_modelo))')
      .eq('oficina_id', oficina.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setLancamentos(data as Lancamento[]);
        setLoading(false);
      });
  }, [oficina]);

  const taxa = config
    ? (config.usa_override && config.taxa_fixa_override != null ? config.taxa_fixa_override : config.taxa_calculada)
    : COMISSAO_CONFIG.TAXA_BASE;

  const totalPendente = lancamentos.filter(l => l.status === 'pendente').reduce((s, l) => s + l.valor_comissao, 0);
  const totalPago = lancamentos.filter(l => l.status === 'pago').reduce((s, l) => s + l.valor_comissao, 0);

  // Calculate bonuses for breakdown
  const calcBonus = () => {
    if (!config) return [];
    const items = [];
    const C = COMISSAO_CONFIG;

    if (config.media_tempo_resposta_horas > 0 && config.media_tempo_resposta_horas < 2) {
      items.push({ label: 'Resposta rápida (< 2h)', bonus: C.BONUS_RESPOSTA_2H, value: `${config.media_tempo_resposta_horas.toFixed(1)}h`, color: 'green' });
    } else if (config.media_tempo_resposta_horas > 0 && config.media_tempo_resposta_horas < 4) {
      items.push({ label: 'Resposta boa (< 4h)', bonus: C.BONUS_RESPOSTA_4H, value: `${config.media_tempo_resposta_horas.toFixed(1)}h`, color: 'green' });
    } else {
      items.push({ label: 'Tempo de resposta', bonus: 0, value: config.media_tempo_resposta_horas > 0 ? `${config.media_tempo_resposta_horas.toFixed(1)}h` : 'N/A', color: 'gray' });
    }

    if (config.media_revisoes_orcamento < 1.0) {
      items.push({ label: 'Pouquíssimas revisões (< 1)', bonus: C.BONUS_REVISAO_1_5 + C.BONUS_REVISAO_1_0, value: config.media_revisoes_orcamento.toFixed(1), color: 'green' });
    } else if (config.media_revisoes_orcamento < 1.5) {
      items.push({ label: 'Poucas revisões (< 1.5)', bonus: C.BONUS_REVISAO_1_5, value: config.media_revisoes_orcamento.toFixed(1), color: 'green' });
    } else {
      items.push({ label: 'Revisões de orçamento', bonus: 0, value: config.media_revisoes_orcamento.toFixed(1), color: 'gray' });
    }

    if (config.media_avaliacao_clientes >= 4.5) {
      items.push({ label: 'Avaliação excelente (≥ 4.5)', bonus: C.BONUS_AVALIACAO_4_5, value: config.media_avaliacao_clientes.toFixed(1), color: 'green' });
    } else if (config.media_avaliacao_clientes >= 4.0) {
      items.push({ label: 'Boa avaliação (≥ 4.0)', bonus: C.BONUS_AVALIACAO_4_0, value: config.media_avaliacao_clientes.toFixed(1), color: 'green' });
    } else {
      items.push({ label: 'Avaliação dos clientes', bonus: 0, value: config.media_avaliacao_clientes > 0 ? config.media_avaliacao_clientes.toFixed(1) : 'N/A', color: 'gray' });
    }

    if (config.total_servicos_concluidos >= 25) {
      items.push({ label: 'Fidelidade (≥ 25 serviços/90d)', bonus: 0.02, value: `${config.total_servicos_concluidos}`, color: 'green' });
    } else if (config.total_servicos_concluidos >= 10) {
      items.push({ label: 'Fidelidade (≥ 10 serviços/90d)', bonus: 0.01, value: `${config.total_servicos_concluidos}`, color: 'green' });
    } else {
      items.push({ label: 'Fidelidade (volume/90d)', bonus: 0, value: `${config.total_servicos_concluidos}`, color: 'gray' });
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
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Comissão BipFix</h1>
      <p className="text-gray-600 mb-8">Sua taxa de comissão e como reduzi-la</p>

      {/* Current rate */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <div className="card text-center">
          <p className="text-4xl font-bold" style={{ color: taxa <= 0.08 ? '#16a34a' : taxa <= 0.12 ? '#ca8a04' : '#dc2626' }}>
            {(taxa * 100).toFixed(1)}%
          </p>
          <p className="text-sm text-gray-500 mt-1">Sua taxa atual</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalPendente)}</p>
          <p className="text-sm text-gray-500 mt-1">Pendente</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPago)}</p>
          <p className="text-sm text-gray-500 mt-1">Pago</p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="card mb-8">
        <h2 className="font-semibold text-gray-900 mb-4">Como sua taxa é calculada</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Taxa base</span>
            <span className="font-bold text-gray-900">{(COMISSAO_CONFIG.TAXA_BASE * 100).toFixed(0)}%</span>
          </div>

          {bonuses.map((b, i) => (
            <div key={i}>
              <div className="flex items-center justify-between text-sm mb-1">
                <div className="flex items-center gap-2">
                  <span className={b.bonus > 0 ? 'text-green-700' : 'text-gray-500'}>{b.label}</span>
                  <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{b.value}</span>
                </div>
                <span className={`font-medium ${b.bonus > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  {b.bonus > 0 ? `-${(b.bonus * 100).toFixed(0)}%` : '-'}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${b.bonus > 0 ? 'bg-green-400' : 'bg-gray-200'}`}
                  style={{ width: `${Math.min((b.bonus / COMISSAO_CONFIG.TAXA_BASE) * 100, 100)}%` }} />
              </div>
            </div>
          ))}

          <div className="border-t pt-3 flex items-center justify-between">
            <span className="font-semibold text-gray-900">Sua taxa final</span>
            <span className="text-xl font-bold" style={{ color: taxa <= 0.08 ? '#16a34a' : taxa <= 0.12 ? '#ca8a04' : '#dc2626' }}>
              {(taxa * 100).toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="mt-4 bg-blue-50 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            <strong>Dica:</strong> Para reduzir sua comissão, responda solicitações rapidamente, evite revisões de orçamento e peça avaliações aos clientes.
            A taxa varia de {(COMISSAO_CONFIG.TAXA_MIN * 100).toFixed(0)}% a {(COMISSAO_CONFIG.TAXA_MAX * 100).toFixed(0)}%.
          </p>
        </div>
      </div>

      {/* Ledger */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Extrato de Comissões</h2>
        {lancamentos.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">Nenhuma comissão registrada ainda</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b">
                  <th className="text-left py-2 font-medium">Data</th>
                  <th className="text-left py-2 font-medium">Serviço</th>
                  <th className="text-right py-2 font-medium">Valor</th>
                  <th className="text-right py-2 font-medium">Taxa</th>
                  <th className="text-right py-2 font-medium">Comissão</th>
                  <th className="text-right py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lancamentos.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 text-gray-600">{new Date(l.created_at).toLocaleDateString('pt-BR')}</td>
                    <td className="py-2 text-gray-900">
                      {(l.solicitacao as any)?.veiculo?.fipe_marca} {(l.solicitacao as any)?.veiculo?.fipe_modelo}
                    </td>
                    <td className="py-2 text-right text-gray-600">{formatCurrency(l.valor_servico)}</td>
                    <td className="py-2 text-right text-gray-600">{(l.taxa_aplicada * 100).toFixed(1)}%</td>
                    <td className="py-2 text-right font-medium text-gray-900">{formatCurrency(l.valor_comissao)}</td>
                    <td className="py-2 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        l.status === 'pendente' ? 'bg-yellow-100 text-yellow-700' :
                        l.status === 'pago' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{l.status === 'pendente' ? 'Pendente' : l.status === 'pago' ? 'Pago' : l.status}</span>
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
