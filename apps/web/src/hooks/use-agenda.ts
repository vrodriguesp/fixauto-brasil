'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { Agenda } from '@fixauto/shared';

export function useAgenda() {
  const { oficina } = useAuth();
  const [eventos, setEventos] = useState<Agenda[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!oficina) return;
    setLoading(true);
    const { data } = await supabase
      .from('agenda')
      .select(`
        *,
        solicitacao:solicitacoes(*, veiculo:veiculos(*), cliente:profiles!solicitacoes_cliente_id_fkey(*)),
        funcionario:funcionarios(*, profile:profiles(nome, email)),
        etapas:manutencao_etapas(*, funcionario:funcionarios(*, profile:profiles(nome)))
      `)
      .eq('oficina_id', oficina.id)
      .order('data_inicio', { ascending: true });
    setEventos((data as Agenda[]) || []);
    setLoading(false);
  }, [oficina]);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (evento: {
    titulo: string;
    descricao?: string;
    data_inicio: string;
    data_fim: string;
    tipo: 'plataforma' | 'externo';
    cor: string;
    solicitacao_id?: string;
  }) => {
    if (!oficina) return { error: { message: 'No oficina' } };
    const { data, error } = await supabase
      .from('agenda')
      .insert({ ...evento, oficina_id: oficina.id, status: 'agendado' })
      .select()
      .single();
    if (!error && data) setEventos((prev) => [...prev, data as Agenda]);
    return { data, error };
  };

  const update = async (id: string, updates: Partial<Agenda>) => {
    const { error } = await supabase.from('agenda').update(updates).eq('id', id);
    if (!error) await fetch();
    return { error };
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('agenda').delete().eq('id', id);
    if (!error) setEventos((prev) => prev.filter((e) => e.id !== id));
    return { error };
  };

  return { eventos, loading, add, update, remove, refresh: fetch };
}
