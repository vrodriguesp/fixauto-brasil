import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service_role key to bypass RLS - the agenda insert needs
// to be done by the server because the client user doesn't have
// permission to insert into the oficina's agenda table.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { orcamentoId, slotId } = await req.json();

    if (!orcamentoId || !slotId) {
      return NextResponse.json({ error: 'Missing orcamentoId or slotId' }, { status: 400 });
    }

    // 1. Update orcamento status to aceito
    const { error: updateError } = await supabaseAdmin
      .from('orcamentos')
      .update({ status: 'aceito', disponibilidade_escolhida_id: slotId })
      .eq('id', orcamentoId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 2. Get quote details
    const { data: orc } = await supabaseAdmin
      .from('orcamentos')
      .select('*, oficina:oficinas(*, profile:profiles(*)), disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(*)')
      .eq('id', orcamentoId)
      .single();

    if (!orc) {
      return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 });
    }

    // 3. Update solicitacao status
    await supabaseAdmin
      .from('solicitacoes')
      .update({ status: 'aceita' })
      .eq('id', orc.solicitacao_id);

    // 4. Reject other quotes
    await supabaseAdmin
      .from('orcamentos')
      .update({ status: 'recusado' })
      .eq('solicitacao_id', orc.solicitacao_id)
      .neq('id', orcamentoId)
      .eq('status', 'enviado');

    // 5. Find the chosen slot and create agenda entry
    const slot = orc.disponibilidade?.find((s: { id: string }) => s.id === slotId);
    if (slot) {
      const { error: agendaError } = await supabaseAdmin.from('agenda').insert({
        oficina_id: orc.oficina_id,
        solicitacao_id: orc.solicitacao_id,
        titulo: `Reparo agendado`,
        descricao: `Orçamento #${orcamentoId.slice(0, 8)}`,
        data_inicio: `${slot.data_checkin}T${slot.turno === 'manha' ? '08:00:00' : '13:00:00'}Z`,
        data_fim: `${slot.data_previsao_entrega}T18:00:00Z`,
        tipo: 'plataforma',
        status: 'agendado',
        cor: '#3B82F6',
      });

      if (agendaError) {
        console.error('[aceitar-orcamento] Agenda insert error:', agendaError);
      }
    }

    // 6. Notify the workshop
    const oficinaProfileId = (orc.oficina as any)?.profile_id;
    if (oficinaProfileId) {
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: oficinaProfileId,
        tipo: 'orcamento_aceito',
        titulo: 'Orçamento aceito!',
        mensagem: 'Um cliente aceitou seu orçamento e agendou o serviço.',
        dados: { solicitacao_id: orc.solicitacao_id, orcamento_id: orcamentoId },
      });
    }

    return NextResponse.json({ success: true, slot });
  } catch (err) {
    console.error('[aceitar-orcamento]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
