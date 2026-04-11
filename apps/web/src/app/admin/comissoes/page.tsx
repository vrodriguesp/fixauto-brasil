'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ComissaoRow {
  id: string;
  oficina_id: string;
  taxa_padrao: number;
  taxa_fixa_override: number | null;
  usa_override: boolean;
  total_pendente: number;
  total_pago: number;
  oficina: {
    id: string;
    nome_fantasia: string;
    cidade: string;
    estado: string;
    ativa: boolean;
  } | null;
}

export default function AdminComissoesPage() {
  const [configs, setConfigs] = useState<ComissaoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/comissao');
      if (!res.ok) throw new Error('Erro ao buscar comissoes');
      const data = await res.json();
      setConfigs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getTaxaAtual = (config: ComissaoRow) => {
    if (config.usa_override && config.taxa_fixa_override != null) {
      return config.taxa_fixa_override;
    }
    return config.taxa_padrao;
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-700 rounded w-48" />
        <div className="h-64 bg-slate-800 rounded-xl" />
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Comissoes</h1>

      {configs.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <p className="text-slate-400">
            Nenhuma configuracao de comissao encontrada.
          </p>
          <p className="text-slate-500 text-sm mt-2">
            As configuracoes sao criadas automaticamente ao ajustar a taxa de uma oficina.
          </p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Oficina
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Taxa Atual
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Override
                </th>
                <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Total Pendente
                </th>
                <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Total Pago
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-3">
                  Acoes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {configs.map((config) => (
                <tr
                  key={config.id}
                  className="hover:bg-slate-700/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <p className="text-white font-medium text-sm">
                      {config.oficina?.nome_fantasia || 'Oficina removida'}
                    </p>
                    {config.oficina && (
                      <p className="text-slate-400 text-xs mt-0.5">
                        {config.oficina.cidade}, {config.oficina.estado}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-white font-medium text-sm">
                      {(getTaxaAtual(config) * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        config.usa_override
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-slate-600 text-slate-400'
                      }`}
                    >
                      {config.usa_override ? 'Personalizada' : 'Padrao'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span
                      className={`text-sm font-medium ${
                        config.total_pendente > 0 ? 'text-amber-400' : 'text-slate-400'
                      }`}
                    >
                      {formatCurrency(config.total_pendente)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-medium text-emerald-400">
                      {formatCurrency(config.total_pago)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/admin/oficinas/${config.oficina_id}`}
                      className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
                    >
                      Gerenciar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
