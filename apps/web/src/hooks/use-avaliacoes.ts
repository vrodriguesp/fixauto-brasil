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
    if (!user) return;

    setLoading(true);

    // If we have a target oficina, fetch by oficina_id (workshop view)
    if (targetId) {
      const { data } = await supabase
        .from('avaliacoes')
        .select('*, cliente:profiles!avaliacoes_cliente_id_fkey(*)')
        .eq('oficina_id', targetId)
        .order('created_at', { ascending: false });
      setAvaliacoes((data as Avaliacao[]) || []);
    } else if (user.tipo === 'cliente') {
      // Client view: fetch avaliacoes by cliente_id
      const { data } = await supabase
        .from('avaliacoes')
        .select('*')
        .eq('cliente_id', user.id)
        .order('created_at', { ascending: false });
      setAvaliacoes((data as Avaliacao[]) || []);
    }

    setLoading(false);
  }, [user, targetId]);

  useEffect(() => { fetch(); }, [fetch]);

  // Recalculate and update oficina rating after any review change
  const updateOficinaRating = async (oficinaId: string) => {
    const { data: allReviews } = await supabase
      .from('avaliacoes')
      .select('nota')
      .eq('oficina_id', oficinaId);
    if (allReviews && allReviews.length > 0) {
      const media = allReviews.reduce((sum, r) => sum + r.nota, 0) / allReviews.length;
      await supabase.from('oficinas').update({
        avaliacao_media: Math.round(media * 10) / 10,
        total_avaliacoes: allReviews.length,
      }).eq('id', oficinaId);
    }
  };

  const create = async (input: { solicitacao_id: string; oficina_id: string; nota: number; comentario?: string }) => {
    if (!user) return { error: { message: 'Not logged in' } };
    const { data, error } = await supabase
      .from('avaliacoes')
      .insert({ ...input, cliente_id: user.id })
      .select()
      .single();
    if (!error && data) {
      setAvaliacoes((prev) => [data as Avaliacao, ...prev]);
      // Notify the workshop about the new review
      const { data: ofi } = await supabase
        .from('oficinas')
        .select('profile_id, nome_fantasia')
        .eq('id', input.oficina_id)
        .single();
      if (ofi) {
        const stars = '★'.repeat(input.nota) + '☆'.repeat(5 - input.nota);
        try {
          await supabase.from('notificacoes').insert({
            profile_id: ofi.profile_id,
            tipo: 'nova_avaliacao',
            titulo: `Nova avaliação: ${stars}`,
            mensagem: `${user.nome} avaliou seu serviço${input.comentario ? ': "' + input.comentario.slice(0, 80) + '"' : ''}.`,
            dados: { solicitacao_id: input.solicitacao_id, avaliacao_id: (data as any).id },
          });
        } catch { /* Non-blocking */ }
      }
      // Update oficina aggregate rating
      await updateOficinaRating(input.oficina_id);
    }
    return { data, error };
  };

  const update = async (avaliacaoId: string, input: { nota: number; comentario?: string; nota_anterior: number }) => {
    if (!user) return { error: { message: 'Not logged in' } };
    const { data, error } = await supabase
      .from('avaliacoes')
      .update({
        nota: input.nota,
        comentario: input.comentario || null,
        nota_anterior: input.nota_anterior,
        updated_at: new Date().toISOString(),
      })
      .eq('id', avaliacaoId)
      .eq('cliente_id', user.id)
      .select();
    if (!error && data && data.length > 0) {
      setAvaliacoes((prev) => prev.map((a) => a.id === avaliacaoId ? (data[0] as Avaliacao) : a));
      // Get oficina_id from the avaliacao to update rating
      const avaliacao = data[0] as Avaliacao;
      if (avaliacao.oficina_id) {
        await updateOficinaRating(avaliacao.oficina_id);
      }
    }
    return { data: data?.[0] || null, error };
  };

  return { avaliacoes, loading, create, update, refresh: fetch };
}
