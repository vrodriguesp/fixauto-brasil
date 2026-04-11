import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { eventoId, solicitacaoId } = await req.json();

    // 1. Update agenda event to concluido
    if (eventoId) {
      await supabaseAdmin.from('agenda').update({ status: 'concluido' }).eq('id', eventoId);
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

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
