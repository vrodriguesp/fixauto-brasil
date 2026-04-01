'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { Notificacao } from '@fixauto/shared';

export function useNotificacoes() {
  const { user } = useAuth();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('notificacoes')
      .select('*')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    const items = (data as Notificacao[]) || [];
    setNotificacoes(items);
    setUnreadCount(items.filter((n) => !n.lida).length);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notificacoes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notificacoes',
        filter: `profile_id=eq.${user.id}`,
      }, (payload) => {
        setNotificacoes((prev) => [payload.new as Notificacao, ...prev]);
        setUnreadCount((prev) => prev + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAsRead = async (id: string) => {
    await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
    setNotificacoes((prev) => prev.map((n) => n.id === id ? { ...n, lida: true } : n));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notificacoes').update({ lida: true }).eq('profile_id', user.id).eq('lida', false);
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
    setUnreadCount(0);
  };

  return { notificacoes, unreadCount, loading, markAsRead, markAllRead, refresh: fetch };
}
