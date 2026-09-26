'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import TutorialBanner from '@/components/tutorial/TutorialBanner';

export default function LojaDashboardPage() {
  const { loja } = useAuth();
  const [cotacoesAbertas, setCotacoesAbertas] = useState(0);
  const [pedidosRecentes, setPedidosRecentes] = useState(0);
  const [totalPecas, setTotalPecas] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loja) return;
    async function fetchData() {
      const [{ count: cotacoes }, { count: pedidos }, { count: pecas }] = await Promise.all([
        supabase.from('cotacoes_pecas').select('*', { count: 'exact', head: true }).eq('status', 'aberta'),
        supabase.from('pedidos_pecas').select('*', { count: 'exact', head: true }).eq('loja_id', loja!.id).eq('status', 'confirmado'),
        supabase.from('pecas_catalogo').select('*', { count: 'exact', head: true }).eq('loja_id', loja!.id).eq('ativo', true),
      ]);
      setCotacoesAbertas(cotacoes || 0);
      setPedidosRecentes(pedidos || 0);
      setTotalPecas(pecas || 0);
      setLoading(false);
    }
    fetchData();
  }, [loja]);

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
      <TutorialBanner href="/loja/aprender" storageKey="bipfix_tutorial_banner_loja" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Olá, {loja?.nome_fantasia}!</h1>
      <p className="text-gray-600 mb-8">Acompanhe cotações e pedidos de oficinas</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link href="/loja/cotacoes" className="card hover:shadow-md transition-shadow">
          <p className="text-3xl font-bold text-orange-600">{cotacoesAbertas}</p>
          <p className="text-sm text-gray-500 mt-1">Cotações abertas pra responder</p>
        </Link>
        <Link href="/loja/pedidos" className="card hover:shadow-md transition-shadow">
          <p className="text-3xl font-bold text-green-600">{pedidosRecentes}</p>
          <p className="text-sm text-gray-500 mt-1">Pedidos confirmados</p>
        </Link>
        <Link href="/loja/catalogo" className="card hover:shadow-md transition-shadow">
          <p className="text-3xl font-bold text-blue-600">{totalPecas}</p>
          <p className="text-sm text-gray-500 mt-1">Peças ativas no catálogo</p>
        </Link>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-2">Como funciona</h2>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>Oficinas publicam cotações pedindo peças que precisam</li>
          <li>Você responde com preço e prazo de entrega</li>
          <li>A oficina escolhe a melhor resposta e confirma o pedido</li>
          <li>Combine a entrega e o pagamento diretamente com a oficina</li>
        </ul>
      </div>
    </div>
  );
}
