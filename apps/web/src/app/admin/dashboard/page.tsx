'use client';

import { useEffect, useState } from 'react';
import type { PlataformaMetricas } from '@fixauto/shared';

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
          {[...Array(6)].map((_, i) => (
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
      value: metricas?.total_clientes ?? 0,
      format: 'number',
      color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      iconBg: 'bg-blue-500/20',
    },
    {
      label: 'Total Oficinas',
      value: metricas?.total_oficinas ?? 0,
      format: 'number',
      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      iconBg: 'bg-emerald-500/20',
    },
    {
      label: 'Solicitações (mês)',
      value: metricas?.solicitacoes_mes ?? 0,
      format: 'number',
      color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      iconBg: 'bg-purple-500/20',
    },
    {
      label: 'Serviços Concluídos (mês)',
      value: metricas?.servicos_concluidos_mes ?? 0,
      format: 'number',
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      iconBg: 'bg-amber-500/20',
    },
    {
      label: 'GMV (mês)',
      value: metricas?.gmv_mes ?? 0,
      format: 'currency',
      color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      iconBg: 'bg-cyan-500/20',
    },
    {
      label: 'Comissão Total (mês)',
      value: metricas?.comissao_total_mes ?? 0,
      format: 'currency',
      color: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      iconBg: 'bg-rose-500/20',
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
            <p className="text-3xl font-bold">
              {card.format === 'currency'
                ? new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  }).format(card.value)
                : new Intl.NumberFormat('pt-BR').format(card.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
