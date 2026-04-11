import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { agendaId, solicitacaoId } = await req.json();

    if (!agendaId) {
      return NextResponse.json({ error: 'agendaId é obrigatório' }, { status: 400 });
    }

    // 1. Update agenda: mark no_show
    await supabaseAdmin.from('agenda').update({
      no_show: true,
      no_show_registrado_em: new Date().toISOString(),
    }).eq('id', agendaId);

    // 2. Get client info from solicitacao
    let clienteId: string | null = null;
    let veiculoNome = 'seu veículo';

    if (solicitacaoId) {
      const { data: sol } = await supabaseAdmin
        .from('solicitacoes')
        .select('cliente_id, veiculo:veiculos(fipe_marca, fipe_modelo)')
        .eq('id', solicitacaoId)
        .single();

      if (sol) {
        clienteId = sol.cliente_id;
        if (sol.veiculo) {
          veiculoNome = `${(sol.veiculo as any).fipe_marca} ${(sol.veiculo as any).fipe_modelo}`;
        }
      }
    }

    // 3. Create no_show_historico entry
    await supabaseAdmin.from('no_show_historico').insert({
      agenda_id: agendaId,
      solicitacao_id: solicitacaoId || null,
      cliente_id: clienteId,
      registrado_em: new Date().toISOString(),
      reagendado: false,
    });

    // 4. Send notification to client
    if (clienteId) {
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: clienteId,
        tipo: 'no_show',
        titulo: 'Falta registrada',
        mensagem: `Você não compareceu ao agendamento para ${veiculoNome}. Entre em contato para reagendar.`,
        dados: { agenda_id: agendaId, solicitacao_id: solicitacaoId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
