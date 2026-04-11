'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { Solicitacao } from '@fixauto/shared';

export function useSolicitacoes(filter?: { status?: string; nearby?: boolean }) {
  const { user, oficina } = useAuth();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase
      .from('solicitacoes')
      .select(`
        *,
        veiculo:veiculos(*),
        fotos:solicitacao_fotos(*),
        cliente:profiles!solicitacoes_cliente_id_fkey(*),
        orcamentos(
          *,
          itens:orcamento_itens(*),
          oficina:oficinas(*, profile:profiles(*)),
          disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(*)
        )
      `)
      .order('created_at', { ascending: false });

    if (user.tipo === 'cliente') {
      query = query.eq('cliente_id', user.id);
    } else {
      // Workshops should not see cancelled solicitations
      query = query.neq('status', 'cancelada');
    }

    if (filter?.status && filter.status !== 'todos') {
      query = query.eq('status', filter.status);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      console.error('[useSolicitacoes] Fetch error:', fetchError.message, fetchError.details, fetchError.hint);
      // Retry with simpler query but still include orcamentos for agendamentos
      const { data: fallbackData } = await supabase
        .from('solicitacoes')
        .select(`
          *,
          veiculo:veiculos(*),
          fotos:solicitacao_fotos(*),
          cliente:profiles!solicitacoes_cliente_id_fkey(*),
          orcamentos(
            *,
            oficina:oficinas(*, profile:profiles(*)),
            disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(*)
          )
        `)
        .order('created_at', { ascending: false })
        .eq('cliente_id', user.id);
      setSolicitacoes((fallbackData as Solicitacao[]) || []);
      setLoading(false);
      return;
    }

    let results = (data as Solicitacao[]) || [];

    // For workshops, filter by distance/especialidades BUT always show accepted ones
    if (user.tipo === 'oficina' && oficina && filter?.nearby) {
      const radiusLat = oficina.raio_atendimento_km / 111;
      const radiusLon = oficina.raio_atendimento_km / (111 * Math.cos(oficina.latitude * Math.PI / 180));
      results = results.filter((s) => {
        // Always show solicitations where this oficina has an accepted quote
        const hasAcceptedQuote = s.orcamentos?.some(
          (o) => o.oficina_id === oficina.id && ['aceito'].includes(o.status)
        );
        if (hasAcceptedQuote) return true;

        // For new solicitations, filter by distance and especialidades
        const withinRadius =
          Math.abs(s.latitude - oficina.latitude) <= radiusLat &&
          Math.abs(s.longitude - oficina.longitude) <= radiusLon;
        const matchesEspecialidade =
          !oficina.especialidades || oficina.especialidades.length === 0 ||
          oficina.especialidades.includes(s.tipo);
        return withinRadius && matchesEspecialidade;
      });
    }

    setSolicitacoes(results);
    setLoading(false);
  }, [user, oficina, filter?.status, filter?.nearby]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = async (solicitacao: {
    veiculo_id: string;
    tipo: string;
    descricao: string;
    urgencia: string;
    latitude: number;
    longitude: number;
    endereco: string;
  }) => {
    if (!user) return { data: null, error: { message: 'Not logged in' } };
    const { data, error } = await supabase
      .from('solicitacoes')
      .insert({ ...solicitacao, cliente_id: user.id })
      .select()
      .single();
    return { data, error };
  };

  const addPhotos = async (solicitacaoId: string, urls: string[]) => {
    const rows = urls.map((url) => ({ solicitacao_id: solicitacaoId, foto_url: url }));
    return supabase.from('solicitacao_fotos').insert(rows);
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('solicitacoes').update({ status }).eq('id', id);
    if (!error) await fetch();
    return { error };
  };

  return { solicitacoes, loading, create, addPhotos, updateStatus, refresh: fetch };
}
