'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { Avaliacao } from '@fixauto/shared';

export function useAvaliacoes(oficinaId?: string) {
  const { user, oficina } = useAuth();
  const targetId = oficinaId || oficina?.id;
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    const { data } = await supabase
      .from('avaliacoes')
      .select('*, cliente:profiles!avaliacoes_cliente_id_fkey(*)')
      .eq('oficina_id', targetId)
      .order('created_at', { ascending: false });
    setAvaliacoes((data as Avaliacao[]) || []);
    setLoading(false);
  }, [targetId]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (input: { solicitacao_id: string; oficina_id: string; nota: number; comentario?: string }) => {
    if (!user) return { error: { message: 'Not logged in' } };
    const { data, error } = await supabase
      .from('avaliacoes')
      .insert({ ...input, cliente_id: user.id })
      .select()
      .single();
    if (!error && data) setAvaliacoes((prev) => [data as Avaliacao, ...prev]);
    return { data, error };
  };

  return { avaliacoes, loading, create, refresh: fetch };
}
