import { NextRequest, NextResponse } from 'next/server';
import {
  sendQuoteNotificationEmail,
  sendQuoteWhatsApp,
} from '@/lib/notifications';
import { getSessionUserId } from '@/lib/api-auth';
import { currencyForCountry } from '@/lib/currency';
import { formatCurrency } from '@/lib/utils';
import { notifNovoOrcamento, chatNovoOrcamentoRecebido } from '@/lib/notif-i18n';
import { supabaseAdmin } from '@/lib/supabase-admin';


export async function POST(req: NextRequest) {
  try {
    const callerId = await getSessionUserId(req);
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
        oficina:oficinas(nome_fantasia, profile_id, pais, profile:profiles(idioma)),
        solicitacao:solicitacoes(
          id,
          cliente_id,
          cliente:profiles!solicitacoes_cliente_id_fkey(nome, email, telefone, idioma)
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
    const oficinaIdioma = (orcamento.oficina as any)?.profile?.idioma;
    const moeda = currencyForCountry((orcamento.oficina as any)?.pais);
    // A moeda e sempre a mesma (pais real da oficina), mas a FORMATACAO do
    // numero (separador de milhar/decimal) segue o idioma de quem esta
    // lendo - por isso um valorTotal por destinatario, nao um unico valor
    // calculado com o idioma do cliente e reaproveitado pra todo mundo.
    const valorTotal = formatCurrency(orcamento.valor_total, moeda, cliente?.idioma);

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
        locale: cliente.idioma,
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
        locale: cliente.idioma,
      });
    }

    // Also check if this solicitacao came from an emergency - notify via email too
    const { data: emergencia } = await supabaseAdmin
      .from('emergencias')
      .select('email, nome, telefone')
      .eq('solicitacao_id', (orcamento.solicitacao as any).id)
      .single();

    if (emergencia && emergencia.email && emergencia.email !== cliente?.email) {
      // Idioma proprio dessa pessoa se ela ja tiver conta, nao o do cliente.
      const { data: emergenciaProfile } = await supabaseAdmin
        .from('profiles').select('idioma').eq('email', emergencia.email).single();
      await sendQuoteNotificationEmail({
        toEmail: emergencia.email,
        toName: emergencia.nome,
        oficinaNome,
        valorTotal: formatCurrency(orcamento.valor_total, moeda, emergenciaProfile?.idioma),
        prazoDias: orcamento.prazo_dias,
        solicitacaoId: (orcamento.solicitacao as any).id,
        locale: emergenciaProfile?.idioma,
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
        // Message in emergency chat - idioma da oficina (chat compartilhado
        // assume o idioma do pais/mercado da transacao, sem tradutor).
        const valorTotalChat = formatCurrency(orcamento.valor_total, moeda, oficinaIdioma);
        await supabaseAdmin.from('emergencia_mensagens').insert({
          emergencia_id: emergFull.id,
          remetente_tipo: 'proprietario',
          remetente_id: null,
          texto: chatNovoOrcamentoRecebido(oficinaIdioma, valorTotalChat, oficinaNome, orcamento.prazo_dias),
        });

        // Email to other person
        if (outro.email) {
          // In-app notification for the other person - busca antes do envio
          // do e-mail pra poder usar o idioma do perfil (se ja tiver conta)
          // tanto no e-mail quanto na notificacao in-app.
          const { data: outroProfile } = await supabaseAdmin
            .from('profiles').select('id, idioma').eq('email', outro.email).single();

          const valorTotalOutro = formatCurrency(orcamento.valor_total, moeda, outroProfile?.idioma);
          await sendQuoteNotificationEmail({
            toEmail: outro.email,
            toName: outro.nome,
            oficinaNome,
            valorTotal: valorTotalOutro,
            prazoDias: orcamento.prazo_dias,
            solicitacaoId: (orcamento.solicitacao as any).id,
            locale: outroProfile?.idioma,
          });

          if (outroProfile) {
            const n = notifNovoOrcamento(outroProfile.idioma, oficinaNome, valorTotalOutro);
            await supabaseAdmin.from('notificacoes').insert({
              profile_id: outroProfile.id,
              tipo: 'novo_orcamento',
              titulo: n.titulo,
              mensagem: n.mensagem,
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
