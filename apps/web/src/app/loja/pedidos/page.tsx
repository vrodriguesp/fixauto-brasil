'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';

interface PedidoRow {
  id: string;
  preco_total: number;
  quantidade: number;
  status: string;
  created_at: string;
  cotacao: { peca_descricao: string } | null;
  oficina: { nome_fantasia: string; cidade: string; estado: string; profile?: { telefone: string | null } } | null;
}

const STATUS_LABEL: Record<string, string> = {
  confirmado: 'Confirmado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export default function LojaPedidosPage() {
  const { loja } = useAuth();
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPedidos = async () => {
    if (!loja) return;
    setLoading(true);
    const { data } = await supabase
      .from('pedidos_pecas')
      .select('*, cotacao:cotacoes_pecas(peca_descricao), oficina:oficinas(nome_fantasia, cidade, estado, profile:profiles(telefone))')
      .eq('loja_id', loja.id)
      .order('created_at', { ascending: false });
    setPedidos((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchPedidos(); }, [loja]);

  const handleMarcarEntregue = async (id: string) => {
    await supabase.from('pedidos_pecas').update({ status: 'entregue' }).eq('id', id);
    await fetchPedidos();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-32 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Pedidos</h1>
      <p className="text-gray-600 mb-8">Pedidos confirmados por oficinas</p>

      {pedidos.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">Nenhum pedido ainda</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidos.map((p) => (
            <div key={p.id} className="card flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-gray-900">{p.cotacao?.peca_descricao}</p>
                <p className="text-sm text-gray-500">
                  {p.oficina?.nome_fantasia} - {p.oficina?.cidade}, {p.oficina?.estado}
                  {p.oficina?.profile?.telefone && ` · ${p.oficina.profile.telefone}`}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {formatCurrency(p.preco_total)} · Qtd: {p.quantidade} · {formatDate(p.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  p.status === 'entregue' ? 'bg-green-100 text-green-700' :
                  p.status === 'cancelado' ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {STATUS_LABEL[p.status] || p.status}
                </span>
                {p.status === 'confirmado' && (
                  <button onClick={() => handleMarcarEntregue(p.id)} className="text-xs text-primary-600 hover:underline font-medium">
                    Marcar entregue
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
