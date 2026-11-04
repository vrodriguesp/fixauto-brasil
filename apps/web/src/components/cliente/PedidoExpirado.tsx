'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';

// Pedido expirado (migracao 072, dono 04/11): aviso e "Reabrir pedido". Ao reabrir
// o pedido volta com os mesmos orcamentos e o prazo de 30 dias recomeca.
export default function PedidoExpirado({ solicitacaoId, dias, aoReabrir }: { solicitacaoId: string; dias: number; aoReabrir: () => void }) {
  const t = useTranslations('pedidoExpirado');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(false);

  const reabrir = async () => {
    setSalvando(true); setErro(false);
    const { error } = await supabase.rpc('reabrir_pedido', { p_solicitacao: solicitacaoId });
    setSalvando(false);
    if (error) { setErro(true); return; }
    aoReabrir();
  };

  return (
    <div className="mb-6 rounded-lg border border-gray-300 bg-gray-50 p-4" data-testid="pedido-expirado">
      <p className="font-semibold text-gray-900">{t('titulo')}</p>
      <p className="mt-1 text-sm text-gray-700">{t('texto', { dias })}</p>
      <button type="button" onClick={reabrir} disabled={salvando} data-testid="reabrir-pedido"
        className="btn-primary mt-3 inline-flex min-h-[44px] items-center disabled:opacity-50">
        {salvando ? t('reabrindo') : t('reabrir')}
      </button>
      {erro && <p role="alert" className="mt-2 text-sm text-red-700">{t('erro')}</p>}
    </div>
  );
}
