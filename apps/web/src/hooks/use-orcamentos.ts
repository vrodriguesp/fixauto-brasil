'use client';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { OrcamentoItem } from '@fixauto/shared';

interface CreateOrcamentoInput {
  solicitacao_id: string;
  valor_total: number;
  prazo_dias: number;
  tempo_execucao_horas: number;
  observacoes: string;
  validade: string;
  itens: Omit<OrcamentoItem, 'id' | 'orcamento_id'>[];
  slots: { data_checkin: string; turno: string; data_previsao_entrega: string }[];
}

export function useOrcamentos() {
  const { oficina } = useAuth();

  const create = async (input: CreateOrcamentoInput) => {
    if (!oficina) return { error: { message: 'No oficina' } };

    // Create the quote
    const { data: orc, error } = await supabase
      .from('orcamentos')
      .insert({
        solicitacao_id: input.solicitacao_id,
        oficina_id: oficina.id,
        valor_total: input.valor_total,
        prazo_dias: input.prazo_dias,
        tempo_execucao_horas: input.tempo_execucao_horas,
        observacoes: input.observacoes || null,
        validade: input.validade,
      })
      .select()
      .single();

    if (error || !orc) return { error: error || { message: 'Failed' } };

    // Insert line items
    if (input.itens.length > 0) {
      await supabase.from('orcamento_itens').insert(
        input.itens.map((item) => ({ ...item, orcamento_id: orc.id }))
      );
    }

    // Insert availability slots
    if (input.slots.length > 0) {
      await supabase.from('orcamento_disponibilidade').insert(
        input.slots.map((s) => ({ ...s, orcamento_id: orc.id }))
      );
    }

    // Update solicitacao status
    await supabase
      .from('solicitacoes')
      .update({ status: 'em_orcamento' })
      .eq('id', input.solicitacao_id)
      .eq('status', 'aberta');

    // Create notification for the client
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('cliente_id')
      .eq('id', input.solicitacao_id)
      .single();

    if (sol) {
      await supabase.from('notificacoes').insert({
        profile_id: sol.cliente_id,
        tipo: 'novo_orcamento',
        titulo: 'Novo orcamento recebido',
        mensagem: `${oficina.nome_fantasia} enviou um orcamento de R$ ${input.valor_total.toFixed(2).replace('.', ',')}`,
        dados: { solicitacao_id: input.solicitacao_id, orcamento_id: orc.id },
      });
    }

    return { data: orc, error: null };
  };

  const accept = async (orcamentoId: string, slotId: string) => {
    // Call server-side API route which uses service_role key
    // This is needed because the client user cannot insert into
    // the oficina's agenda table due to RLS policies
    try {
      const res = await fetch('/api/aceitar-orcamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orcamentoId, slotId }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { error: { message: data.error || 'Erro ao aceitar orçamento' } };
      }

      return { error: null };
    } catch (err) {
      return { error: { message: (err as Error).message } };
    }
  };

  const update = async (
    orcamentoId: string,
    input: {
      solicitacao_id: string;
      valor_total: number;
      prazo_dias: number;
      tempo_execucao_horas: number;
      observacoes: string;
      validade: string;
      valor_original: number;
      revisao_numero: number;
      itens: Omit<OrcamentoItem, 'id' | 'orcamento_id'>[];
      slots: { data_checkin: string; turno: string; data_previsao_entrega: string }[];
    }
  ) => {
    if (!oficina) return { error: { message: 'No oficina' } };

    const { error } = await supabase
      .from('orcamentos')
      .update({
        valor_total: input.valor_total,
        prazo_dias: input.prazo_dias,
        tempo_execucao_horas: input.tempo_execucao_horas,
        observacoes: input.observacoes || null,
        validade: input.validade,
        valor_original: input.valor_original,
        revisao_numero: input.revisao_numero,
        revisado_em: new Date().toISOString(),
        status: 'enviado',
      })
      .eq('id', orcamentoId);

    if (error) return { error };

    // Replace line items
    await supabase.from('orcamento_itens').delete().eq('orcamento_id', orcamentoId);
    if (input.itens.length > 0) {
      await supabase.from('orcamento_itens').insert(
        input.itens.map((item) => ({ ...item, orcamento_id: orcamentoId }))
      );
    }

    // Replace availability slots
    await supabase.from('orcamento_disponibilidade').delete().eq('orcamento_id', orcamentoId);
    if (input.slots.length > 0) {
      await supabase.from('orcamento_disponibilidade').insert(
        input.slots.map((s) => ({ ...s, orcamento_id: orcamentoId }))
      );
    }

    // Reset solicitacao status so client can review again
    await supabase
      .from('solicitacoes')
      .update({ status: 'em_orcamento' })
      .eq('id', input.solicitacao_id);

    // Notify client
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('cliente_id')
      .eq('id', input.solicitacao_id)
      .single();

    if (sol) {
      await supabase.from('notificacoes').insert({
        profile_id: sol.cliente_id,
        tipo: 'novo_orcamento',
        titulo: 'Orcamento revisado',
        mensagem: `${oficina.nome_fantasia} revisou o orcamento para R$ ${input.valor_total.toFixed(2).replace('.', ',')}`,
        dados: { solicitacao_id: input.solicitacao_id, orcamento_id: orcamentoId },
      });
    }

    // Send quote summary as a system message in the chat
    try {
      await supabase.from('mensagens').insert({
        solicitacao_id: input.solicitacao_id,
        remetente_id: oficina.profile_id,
        texto: `📋 Orçamento revisado (Revisão #${input.revisao_numero})\n💰 Valor: R$ ${input.valor_total.toFixed(2).replace('.', ',')}\n📅 Prazo: ${input.prazo_dias} dias\n${input.observacoes ? '📝 ' + input.observacoes : ''}`,
      });
    } catch { /* non-blocking */ }

    return { data: { id: orcamentoId }, error: null };
  };

  const refuse = async (orcamentoId: string) => {
    const { error } = await supabase
      .from('orcamentos')
      .update({ status: 'recusado' })
      .eq('id', orcamentoId);
    return { error };
  };

  return { create, update, accept, refuse };
}
