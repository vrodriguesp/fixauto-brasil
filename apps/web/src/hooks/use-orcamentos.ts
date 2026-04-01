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
    // Update the quote status and chosen slot
    const { error } = await supabase
      .from('orcamentos')
      .update({ status: 'aceito', disponibilidade_escolhida_id: slotId })
      .eq('id', orcamentoId);

    if (error) return { error };

    // Get quote details to update solicitacao and create agenda
    const { data: orc } = await supabase
      .from('orcamentos')
      .select('*, oficina:oficinas(*), disponibilidade:orcamento_disponibilidade(*)')
      .eq('id', orcamentoId)
      .single();

    if (orc) {
      // Update solicitacao status
      await supabase
        .from('solicitacoes')
        .update({ status: 'aceita' })
        .eq('id', orc.solicitacao_id);

      // Reject other quotes for this solicitacao
      await supabase
        .from('orcamentos')
        .update({ status: 'recusado' })
        .eq('solicitacao_id', orc.solicitacao_id)
        .neq('id', orcamentoId)
        .eq('status', 'enviado');

      // Find the chosen slot
      const slot = orc.disponibilidade?.find((s: { id: string }) => s.id === slotId);
      if (slot) {
        // Create agenda entry for the workshop
        await supabase.from('agenda').insert({
          oficina_id: orc.oficina_id,
          solicitacao_id: orc.solicitacao_id,
          titulo: `Reparo agendado`,
          descricao: `Orcamento #${orcamentoId.slice(0, 8)}`,
          data_inicio: `${slot.data_checkin}T${slot.turno === 'manha' ? '08:00:00' : '13:00:00'}Z`,
          data_fim: `${slot.data_previsao_entrega}T18:00:00Z`,
          tipo: 'plataforma',
          status: 'agendado',
          cor: '#3B82F6',
        });
      }

      // Notify the workshop
      await supabase.from('notificacoes').insert({
        profile_id: orc.oficina?.profile_id,
        tipo: 'orcamento_aceito',
        titulo: 'Orcamento aceito!',
        mensagem: `Um cliente aceitou seu orcamento e agendou o servico.`,
        dados: { solicitacao_id: orc.solicitacao_id, orcamento_id: orcamentoId },
      });
    }

    return { error: null };
  };

  return { create, accept };
}
