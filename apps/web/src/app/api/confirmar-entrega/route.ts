import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recalcularComissaoConfig } from '@/lib/comissao';
import { getSessionUserId } from '@/lib/api-auth';
import { sendServicoConcluidoEmail, sendServicoConcluidoWhatsApp } from '@/lib/notifications';

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

    const { eventoId, solicitacaoId } = await req.json();
    if (!eventoId) {
      return NextResponse.json({ error: 'eventoId obrigatório' }, { status: 400 });
    }

    // So a oficina dona do evento de agenda pode confirmar a entrega -
    // sem isso, qualquer eventoId adivinhado concluia a solicitacao de
    // outra oficina e lancava comissao contra ela indevidamente.
    const { data: evento } = await supabaseAdmin
      .from('agenda')
      .select('oficina:oficinas(profile_id, nome_fantasia)')
      .eq('id', eventoId)
      .single();
    if (!evento || (evento as any).oficina?.profile_id !== callerId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    const oficinaNome = (evento as any).oficina?.nome_fantasia || 'a oficina';

    // 1. Update agenda event to concluido + set data_fim to actual delivery date
    if (eventoId) {
      await supabaseAdmin.from('agenda').update({
        status: 'concluido',
        data_fim: new Date().toISOString(),
      }).eq('id', eventoId);
    }

    // 2. Update solicitacao to concluida
    if (solicitacaoId) {
      await supabaseAdmin.from('solicitacoes').update({ status: 'concluida' }).eq('id', solicitacaoId);

      // 3. Get client info from solicitacao
      const { data: sol } = await supabaseAdmin
        .from('solicitacoes')
        .select('cliente_id, veiculo:veiculos(fipe_marca, fipe_modelo), cliente:profiles!solicitacoes_cliente_id_fkey(nome, email, telefone)')
        .eq('id', solicitacaoId)
        .single();

      if (sol?.cliente_id) {
        const veiculoNome = sol.veiculo
          ? `${(sol.veiculo as any).fipe_marca} ${(sol.veiculo as any).fipe_modelo}`
          : 'seu veículo';
        const cliente = sol.cliente as any;

        // 4. Create notification
        await supabaseAdmin.from('notificacoes').insert({
          profile_id: sol.cliente_id,
          tipo: 'servico_concluido',
          titulo: 'Serviço concluído!',
          mensagem: `${veiculoNome} está pronto para retirada. Avalie o serviço recebido!`,
          dados: { solicitacao_id: solicitacaoId },
        });

        // 4b. Email + WhatsApp - cliente pode nao estar com o app aberto
        // pra ver a notificacao in-app na hora que o carro fica pronto.
        if (cliente?.email) {
          sendServicoConcluidoEmail({
            toEmail: cliente.email,
            toName: cliente.nome || 'Cliente',
            oficinaNome,
            veiculoNome,
            solicitacaoId,
          }).catch(() => {});
        }
        if (cliente?.telefone) {
          sendServicoConcluidoWhatsApp({
            toPhone: cliente.telefone,
            toName: cliente.nome || 'Cliente',
            oficinaNome,
            veiculoNome,
            solicitacaoId,
          }).catch(() => {});
        }
      }
    }

    // 5. Register commission
    if (solicitacaoId) {
      try {
        // Find the accepted orcamento
        const { data: orc } = await supabaseAdmin
          .from('orcamentos')
          .select('id, oficina_id, valor_total')
          .eq('solicitacao_id', solicitacaoId)
          .eq('status', 'aceito')
          .single();

        if (orc) {
          // Avoid double-charging commission if this endpoint runs twice for the same orcamento
          const { data: jaLancado } = await supabaseAdmin
            .from('comissao_lancamento')
            .select('id')
            .eq('orcamento_id', orc.id)
            .single();

          if (!jaLancado) {
            // Taxa por performance (resposta/revisoes/avaliacao) + volume
            // dos ultimos 90 dias, a nao ser que o admin tenha fixado uma
            // taxa manual pra essa oficina
            const { taxa } = await recalcularComissaoConfig(supabaseAdmin, orc.oficina_id);

            // Insert commission entry
            const { error: comissaoError } = await supabaseAdmin.from('comissao_lancamento').insert({
              oficina_id: orc.oficina_id,
              orcamento_id: orc.id,
              valor_servico: orc.valor_total,
              taxa_aplicada: taxa,
              valor_comissao: Math.round(orc.valor_total * taxa * 100) / 100,
              status: 'pendente',
            });

            if (comissaoError) {
              console.error('[confirmar-entrega] Falha ao registrar comissao:', comissaoError.message);
            } else {
              // Atualiza o cache de comissao_config pra refletir o novo total
              await recalcularComissaoConfig(supabaseAdmin, orc.oficina_id);
            }
          }
        }
      } catch (err) {
        console.error('[confirmar-entrega] Erro ao registrar comissao:', err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
