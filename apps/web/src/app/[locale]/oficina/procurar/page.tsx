'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import ProcurarPedido from '@/components/oficina/ProcurarPedido';

// Pagina de procura (pedido do dono 10/10): placa, nome, numero do pedido ou
// codigo de cliente. A caixa de Hoje/Pedidos traz para ca com ?q=.
export default function ProcurarPage() {
  const t = useTranslations('oficinaProcurar');
  const [q, setQ] = useState('');
  useEffect(() => { setQ(new URLSearchParams(window.location.search).get('q') || ''); }, []);
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('titulo')}</h1>
      <ProcurarPedido inicial={q} />
    </div>
  );
}
