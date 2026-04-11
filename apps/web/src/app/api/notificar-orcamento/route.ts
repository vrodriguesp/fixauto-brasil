import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendQuoteNotificationEmail,
  sendQuoteWhatsApp,
} from '@/lib/notifications';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { orcamentoId } = await req.json();

    if (!orcamentoId) {
      return NextResponse.json({ error: 'Missing orcamentoId' }, { status: 400 });
    }

    // Get orcamento with solicitacao and client info
    const { data: orcamento } = await supabaseAdmin
      .from('orcamentos')
      .select(`
        *,
        oficina:oficinas(nome_fantasia),
        solicitacao:solicitacoes(
          id,
          cliente_id,
          cliente:profiles!solicitacoes_cliente_id_fkey(nome, email, telefone)
        )
      `)
      .eq('id', orcamentoId)
      .single();

    if (!orcamento || !orcamento.solicitacao) {
      return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 });
    }

    const cliente = (orcamento.solicitacao as any).cliente;
    const oficinaNome = (orcamento.oficina as any)?.nome_fantasia || 'Oficina';
    const valorTotal = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(orcamento.valor_total);

    const results: { email?: { success: boolean }; whatsapp?: { success: boolean } } = {};

    // Send email
    if (cliente?.email) {
      results.email = await sendQuoteNotificationEmail({
        toEmail: cliente.email,
        toName: cliente.nome,
        oficinaNome,
        valorTotal,
        prazoDias: orcamento.prazo_dias,
        solicitacaoId: (orcamento.solicitacao as any).id,
      });
    }

    // Send WhatsApp
    if (cliente?.telefone) {
      results.whatsapp = await sendQuoteWhatsApp({
        toPhone: cliente.telefone,
        toName: cliente.nome,
        oficinaNome,
        valorTotal,
        solicitacaoId: (orcamento.solicitacao as any).id,
      });
    }

    // Also check if this solicitacao came from an emergency - notify via email too
    const { data: emergencia } = await supabaseAdmin
      .from('emergencias')
      .select('email, nome, telefone')
      .eq('solicitacao_id', (orcamento.solicitacao as any).id)
      .single();

    if (emergencia && emergencia.email && emergencia.email !== cliente?.email) {
      await sendQuoteNotificationEmail({
        toEmail: emergencia.email,
        toName: emergencia.nome,
        oficinaNome,
        valorTotal,
        prazoDias: orcamento.prazo_dias,
        solicitacaoId: (orcamento.solicitacao as any).id,
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('[API notificar-orcamento]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
