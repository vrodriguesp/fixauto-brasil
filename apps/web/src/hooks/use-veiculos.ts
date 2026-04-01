'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { Veiculo } from '@fixauto/shared';

export function useVeiculos() {
  const { user } = useAuth();
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('veiculos')
      .select('*')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false });
    setVeiculos((data as Veiculo[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (veiculo: Omit<Veiculo, 'id' | 'profile_id' | 'created_at'>) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('veiculos')
      .insert({ ...veiculo, profile_id: user.id })
      .select()
      .single();
    if (!error && data) setVeiculos((prev) => [data as Veiculo, ...prev]);
    return { data, error };
  };

  const update = async (id: string, updates: Partial<Veiculo>) => {
    const { error } = await supabase.from('veiculos').update(updates).eq('id', id);
    if (!error) await fetch();
    return { error };
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('veiculos').delete().eq('id', id);
    if (!error) setVeiculos((prev) => prev.filter((v) => v.id !== id));
    return { error };
  };

  return { veiculos, loading, add, update, remove, refresh: fetch };
}
