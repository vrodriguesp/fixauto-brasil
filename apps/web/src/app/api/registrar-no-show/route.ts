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

    // 1. Get agenda info
    const { data: agenda } = await supabaseAdmin
      .from('agenda')
      .select('oficina_id, data_inicio')
      .eq('id', agendaId)
      .single();

    // 2. Mark agenda as no_show
    await supabaseAdmin.from('agenda').update({
      no_show: true,
      no_show_registrado_em: new Date().toISOString(),
      status: 'cancelado',
    }).eq('id', agendaId);

    // 3. Get client info
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

      // 4. Set solicitacao to no_show status
      await supabaseAdmin.from('solicitacoes')
        .update({ status: 'no_show' })
        .eq('id', solicitacaoId);

      // 5. Reset the orcamento to 'enviado' so client can accept again with new dates
      await supabaseAdmin.from('orcamentos')
        .update({ status: 'enviado', disponibilidade_escolhida_id: null })
        .eq('solicitacao_id', solicitacaoId)
        .eq('status', 'aceito');
    }

    // 6. Create no_show_historico
    await supabaseAdmin.from('no_show_historico').insert({
      agenda_id: agendaId,
      solicitacao_id: solicitacaoId || null,
      cliente_id: clienteId,
      oficina_id: agenda?.oficina_id || null,
      data_agendada: agenda?.data_inicio ? new Date(agenda.data_inicio).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      registrado_em: new Date().toISOString(),
      reagendado: false,
    });

    // 7. Notify client
    if (clienteId) {
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: clienteId,
        tipo: 'no_show',
        titulo: 'Falta registrada',
        mensagem: `Você não compareceu ao agendamento para ${veiculoNome}. O orçamento continua disponível para reagendamento.`,
        dados: { agenda_id: agendaId, solicitacao_id: solicitacaoId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
