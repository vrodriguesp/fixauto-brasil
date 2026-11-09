'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Pedidos da oficina com mudanca de data esperando o cliente (077): a Agenda e o
// Hoje mostram "Data nao confirmada" no cartao, para ninguem contar com a data nova.
export function useDatasNaoConfirmadas(oficinaId: string | null | undefined, recarregar?: unknown) {
  const [pedidos, setPedidos] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!oficinaId) return;
    let vivo = true;
    supabase.from('orcamento_revisoes').select('solicitacao_id')
      .eq('oficina_id', oficinaId).eq('tipo', 'data').eq('status', 'pendente')
      .then(({ data }) => { if (vivo) setPedidos(new Set(((data as any) || []).map((r: any) => r.solicitacao_id))); });
    return () => { vivo = false; };
  }, [oficinaId, recarregar]);
  return pedidos;
}
