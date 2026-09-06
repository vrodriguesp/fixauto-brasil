import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { eventoId, solicitacaoId } = await req.json();

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
        .select('cliente_id, veiculo:veiculos(fipe_marca, fipe_modelo)')
        .eq('id', solicitacaoId)
        .single();

      if (sol?.cliente_id) {
        const veiculoNome = sol.veiculo
          ? `${(sol.veiculo as any).fipe_marca} ${(sol.veiculo as any).fipe_modelo}`
          : 'seu veículo';

        // 4. Create notification
        await supabaseAdmin.from('notificacoes').insert({
          profile_id: sol.cliente_id,
          tipo: 'servico_concluido',
          titulo: 'Serviço concluído!',
          mensagem: `${veiculoNome} está pronto para retirada. Avalie o serviço recebido!`,
          dados: { solicitacao_id: solicitacaoId },
        });
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
            // Get or calculate commission rate
            let taxa = 0.10; // default 10%
            const { data: config } = await supabaseAdmin
              .from('comissao_config')
              .select('taxa_padrao, taxa_fixa_override, usa_override')
              .eq('oficina_id', orc.oficina_id)
              .single();

            if (config) {
              taxa = config.usa_override && config.taxa_fixa_override != null
                ? config.taxa_fixa_override
                : config.taxa_padrao;
            }

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
