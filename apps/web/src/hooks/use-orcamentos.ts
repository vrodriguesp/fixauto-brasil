'use client';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { cleanDescricao, formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { notifNovoOrcamento, notifOrcamentoRevisado, chatOrcamentoRevisado } from '@/lib/notif-i18n';
import type { OrcamentoItem } from '@fixauto/shared';

interface CreateOrcamentoInput {
  solicitacao_id: string;
  valor_total: number;
  prazo_dias: number;
  tempo_execucao_horas: number;
  observacoes: string;
  validade: string;
  garantia_dias?: number | null;
  anexo_url?: string | null;
  itens: Omit<OrcamentoItem, 'id' | 'orcamento_id'>[];
  slots: { data_checkin: string; turno: string; data_previsao_entrega: string }[];
}

export function useOrcamentos() {
  const { oficina, user } = useAuth();

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
        garantia_dias: input.garantia_dias ?? null,
        anexo_url: input.anexo_url ?? null,
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
      .select('cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(idioma)')
      .eq('id', input.solicitacao_id)
      .single();

    if (sol) {
      const clienteIdioma = (sol.cliente as any)?.idioma;
      const valorFormatado = formatCurrency(input.valor_total, currencyForCountry(oficina.pais), clienteIdioma);
      const n = notifNovoOrcamento(clienteIdioma, oficina.nome_fantasia, valorFormatado);
      await supabase.from('notificacoes').insert({
        profile_id: sol.cliente_id,
        tipo: 'novo_orcamento',
        titulo: n.titulo,
        mensagem: n.mensagem,
        dados: { solicitacao_id: input.solicitacao_id, orcamento_id: orc.id },
      });
    }

    // Tempo de resposta conta pra taxa de comissao - recalcula em background
    fetch('/api/recalcular-comissao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oficinaId: oficina.id }),
    }).catch(() => {});

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
        return { error: { message: data.error || '', codigo: data.codigo as string | undefined, status: res.status } };
      }

      return { error: null };
    } catch (err) {
      return { error: { message: (err as Error).message, codigo: undefined as string | undefined, status: 0 } };
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
      garantia_dias?: number | null;
      anexo_url?: string | null;
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
        garantia_dias: input.garantia_dias ?? null,
        ...(input.anexo_url !== undefined ? { anexo_url: input.anexo_url } : {}),
        revisado_em: new Date().toISOString(),
        status: 'enviado',
        disponibilidade_escolhida_id: null,
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
      .select('cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(idioma)')
      .eq('id', input.solicitacao_id)
      .single();

    if (sol) {
      const clienteIdioma = (sol.cliente as any)?.idioma;
      const valorFormatado = formatCurrency(input.valor_total, currencyForCountry(oficina.pais), clienteIdioma);
      const n = notifOrcamentoRevisado(clienteIdioma, oficina.nome_fantasia, valorFormatado);
      await supabase.from('notificacoes').insert({
        profile_id: sol.cliente_id,
        tipo: 'novo_orcamento',
        titulo: n.titulo,
        mensagem: n.mensagem,
        dados: { solicitacao_id: input.solicitacao_id, orcamento_id: orcamentoId },
      });
    }

    // Send quote summary as a system message in the chat
    try {
      const valorFormatadoChat = formatCurrency(input.valor_total, currencyForCountry(oficina.pais), user?.idioma);
      await supabase.from('mensagens').insert({
        solicitacao_id: input.solicitacao_id,
        oficina_id: oficina.id,
        remetente_id: oficina.profile_id,
        // Idioma da oficina (decisao do usuario: chat compartilhado assume
        // o idioma do pais/mercado da transacao, sem tradutor).
        texto: chatOrcamentoRevisado(user?.idioma, input.revisao_numero, valorFormatadoChat, input.prazo_dias, cleanDescricao(input.observacoes)),
      });
    } catch { /* non-blocking */ }

    // Revisoes de orcamento contam pra taxa de comissao - recalcula em background
    fetch('/api/recalcular-comissao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oficinaId: oficina.id }),
    }).catch(() => {});

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
