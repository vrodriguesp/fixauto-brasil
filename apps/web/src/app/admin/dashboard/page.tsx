'use client';

import { useEffect, useState } from 'react';
import type { PlataformaMetricas } from '@fixauto/shared';

function formatMoedaMap(porMoeda: Record<string, number> | undefined): string {
  const entries = Object.entries(porMoeda || {});
  if (entries.length === 0) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(0);
  }
  return entries
    .map(([moeda, valor]) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(valor))
    .join(' + ');
}

export default function AdminDashboardPage() {
  const [metricas, setMetricas] = useState<PlataformaMetricas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMetricas() {
      try {
        const res = await fetch('/api/admin/metricas');
        if (!res.ok) throw new Error('Erro ao buscar métricas');
        const data = await res.json();
        setMetricas(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    }
    fetchMetricas();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-700 rounded w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-32 bg-slate-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800 text-red-300 p-4 rounded-lg">
        {error}
      </div>
    );
  }

  const cards = [
    {
      label: 'Total Clientes',
      value: new Intl.NumberFormat('pt-BR').format(metricas?.total_clientes ?? 0),
      color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    },
    {
      label: 'Total Oficinas',
      value: new Intl.NumberFormat('pt-BR').format(metricas?.total_oficinas ?? 0),
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    },
    {
      label: 'Solicitações (mês)',
      value: new Intl.NumberFormat('pt-BR').format(metricas?.solicitacoes_mes ?? 0),
      color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    },
    {
      label: 'Serviços Concluídos (mês)',
      value: new Intl.NumberFormat('pt-BR').format(metricas?.servicos_concluidos_mes ?? 0),
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    },
    {
      label: 'Valor dos serviços entregues (mês)',
      // Oficinas de paises diferentes usam moedas diferentes - um numero
      // unico misturaria BRL com EUR, entao mostra cada moeda separada.
      value: formatMoedaMap(metricas?.gmv_mes_por_moeda),
      color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    },
    {
      label: 'Comissão de serviços (mês)',
      value: formatMoedaMap(metricas?.comissao_total_mes_por_moeda),
      nota: metricas?.modo_comissao_servicos === 'isento' ? 'Regra atual: isento - nenhuma comissão é gerada' : undefined,
      color: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    },
    {
      label: 'Comissão de peças (mês)',
      value: formatMoedaMap(metricas?.comissao_pecas_mes_por_moeda),
      nota: metricas?.modo_comissao_pecas === 'isento' ? 'Regra atual: isento - nenhuma comissão é gerada' : undefined,
      color: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    },
    {
      label: 'Comissão a receber (pendente, todos os meses)',
      value: formatMoedaMap(metricas?.comissao_pendente_por_moeda),
      color: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-8">Dashboard da Plataforma</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl border p-6 ${card.color}`}
          >
            <p className="text-sm font-medium opacity-80 mb-2">{card.label}</p>
            <p className="text-2xl font-bold">{card.value}</p>
            {'nota' in card && card.nota && <p className="text-xs opacity-70 mt-2">{card.nota}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
