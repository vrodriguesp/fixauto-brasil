'use client';

import { useEffect, useState } from 'react';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import CorrigirStatus from './CorrigirStatus';

const STATUS_PEDIDO: Record<string, string> = {
  confirmado: 'Confirmado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

// Ultimos pedidos de peca com correcao manual de status. Marcar "entregue"
// por aqui NAO lanca comissao (so o fluxo normal de entrega lanca).
export default function PedidosPecasAdmin() {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = async () => {
    const res = await fetch('/api/admin/pedidos-pecas');
    setPedidos(res.ok ? await res.json() : []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mt-8">
      <h2 className="text-lg font-semibold text-white">Pedidos de peças recentes</h2>
      <p className="text-slate-400 text-xs mt-1 mb-4">
        Correção manual de status fica no histórico do admin. Marcar como entregue aqui não lança comissão.
      </p>
      {loading ? (
        <p className="text-slate-500 text-sm">Carregando...</p>
      ) : pedidos.length === 0 ? (
        <p className="text-slate-500 text-sm">Nenhum pedido ainda.</p>
      ) : (
        <div className="divide-y divide-slate-700">
          {pedidos.map((p) => (
            <div key={p.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-white">{p.cotacao?.peca_descricao || 'Peça'} × {p.quantidade}</p>
                  <p className="text-slate-400 text-xs">
                    {p.oficina?.nome_fantasia || '—'} ← {p.fornecedor_tipo === 'loja' ? p.loja?.nome_fantasia : p.oficina_fornecedora?.nome_fantasia}
                    {' · '}{formatDateTime(p.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-white font-medium">{formatCurrency(Number(p.preco_total), currencyForCountry(p.oficina?.pais))}</p>
                  <span className="text-xs text-slate-300">{STATUS_PEDIDO[p.status] || p.status}</span>
                </div>
              </div>
              <CorrigirStatus key={p.status} entidade="pedido_peca" id={p.id} atual={p.status} opcoes={STATUS_PEDIDO} onFeito={carregar} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
