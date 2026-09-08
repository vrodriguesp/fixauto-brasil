import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendQuoteNotificationEmail,
  sendQuoteWhatsApp,
} from '@/lib/notifications';
import { getSessionUserId } from '@/lib/api-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const callerId = await getSessionUserId();
    if (!callerId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { orcamentoId } = await req.json();

    if (!orcamentoId) {
      return NextResponse.json({ error: 'Missing orcamentoId' }, { status: 400 });
    }

    // Get orcamento with solicitacao and client info
    const { data: orcamento } = await supabaseAdmin
      .from('orcamentos')
      .select(`
        *,
        oficina:oficinas(nome_fantasia, profile_id),
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

    // So a oficina dona do orcamento pode disparar essa notificacao - sem
    // isso, qualquer orcamentoId existente podia ser usado pra reenviar
    // email/WhatsApp pro cliente quantas vezes quisessem (spam).
    if ((orcamento.oficina as any)?.profile_id !== callerId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
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

    // Notify the other involved person (outro envolvido) if linked to emergency
    const { data: emergFull } = await supabaseAdmin
      .from('emergencias')
      .select('id')
      .eq('solicitacao_id', (orcamento.solicitacao as any).id)
      .single();

    if (emergFull) {
      const { data: outro } = await supabaseAdmin
        .from('emergencia_outro_veiculo')
        .select('nome, email')
        .eq('emergencia_id', emergFull.id)
        .limit(1)
        .single();

      if (outro) {
        // Message in emergency chat
        await supabaseAdmin.from('emergencia_mensagens').insert({
          emergencia_id: emergFull.id,
          remetente_tipo: 'proprietario',
          remetente_id: null,
          texto: `Novo orçamento recebido: ${valorTotal} da oficina ${oficinaNome}. Prazo: ${orcamento.prazo_dias} dias.`,
        });

        // Email to other person
        if (outro.email) {
          await sendQuoteNotificationEmail({
            toEmail: outro.email,
            toName: outro.nome,
            oficinaNome,
            valorTotal,
            prazoDias: orcamento.prazo_dias,
            solicitacaoId: (orcamento.solicitacao as any).id,
          });

          // In-app notification for the other person
          const { data: outroProfile } = await supabaseAdmin
            .from('profiles').select('id').eq('email', outro.email).single();
          if (outroProfile) {
            await supabaseAdmin.from('notificacoes').insert({
              profile_id: outroProfile.id,
              tipo: 'novo_orcamento',
              titulo: 'Novo orçamento recebido',
              mensagem: `Orçamento de ${valorTotal} da oficina ${oficinaNome} para o acidente registrado.`,
              dados: { emergencia_id: emergFull.id },
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('[API notificar-orcamento]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
