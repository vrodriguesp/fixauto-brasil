'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { Solicitacao } from '@fixauto/shared';
import { completarClientesEContato, comEnderecoPrivado } from '@/lib/resumo-clientes';
import { oficinaVePedido } from '@/lib/caixa-pedidos';

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
        cliente:profiles!solicitacoes_cliente_id_fkey(id, nome, avatar_url, tipo, codigo),
        convites:pedido_convites(oficina_id, origem),
        privado:solicitacoes_privado(endereco, latitude, longitude),
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
          cliente:profiles!solicitacoes_cliente_id_fkey(id, nome, avatar_url, tipo),
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
    // oficina: nome/codigo do cliente por resumo_clientes (074) e telefone/e-mail so nos
    // pedidos em que ela foi escolhida (contato_clientes, 086)
    if (user.tipo !== 'cliente') results = await completarClientesEContato(supabase, results as any[]);
    // 102: rua e coordenadas exatas so para quem pode (privado); senao a area e ~1 km que estao na linha
    results = comEnderecoPrivado(results as any[]) as any;

    // For workshops, filter by distance/especialidades BUT always show accepted ones
    if (user.tipo === 'oficina' && oficina && filter?.nearby) {
      // mesma regra do banco (migracao 056): especialidade compativel + raio; a regra mora em
      // lib/caixa-pedidos.ts para a bolinha dos pedidos novos contar igual a lista (17/11)
      results = results.filter((s) => oficinaVePedido(s, oficina));
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
    pais?: string;
  }) => {
    if (!user) return { data: null, error: { message: 'Not logged in' } };
    const { data, error } = await supabase
      .from('solicitacoes')
      .insert({ ...solicitacao, cliente_id: user.id })
      .select()
      .single();
    return { data, error };
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('solicitacoes').update({ status }).eq('id', id);
    if (!error) await fetch();
    return { error };
  };

  // fotos da criacao: rota /api/solicitacoes/[id]/fotos com origem=criacao (reencode no servidor, 19/11)
  return { solicitacoes, loading, create, updateStatus, refresh: fetch };
}
