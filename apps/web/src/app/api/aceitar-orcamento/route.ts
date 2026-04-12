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
    //    Delete any existing agenda for this solicitacao to avoid duplicates (e.g. re-quote)
    const slot = orc.disponibilidade?.find((s: { id: string }) => s.id === slotId);
    if (slot) {
      await supabaseAdmin
        .from('agenda')
        .delete()
        .eq('solicitacao_id', orc.solicitacao_id)
        .eq('oficina_id', orc.oficina_id)
        .in('status', ['agendado']);

      const { error: agendaError } = await supabaseAdmin.from('agenda').insert({
        oficina_id: orc.oficina_id,
        solicitacao_id: orc.solicitacao_id,
        titulo: `Reparo agendado`,
        descricao: `Orçamento #${orcamentoId.slice(0, 8)}`,
        data_inicio: `${slot.data_checkin}T${slot.turno === 'manha' ? '08:00:00' : '13:00:00'}Z`,
        data_fim: `${slot.data_previsao_entrega}T18:00:00Z`,
        data_fim_prevista: `${slot.data_previsao_entrega}T18:00:00Z`,
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

    // 7. Notify the other involved person if this solicitacao has a linked emergencia
    try {
      const { data: emergencia } = await supabaseAdmin
        .from('emergencias')
        .select('id, solicitacao_id')
        .eq('solicitacao_id', orc.solicitacao_id)
        .single();

      if (emergencia) {
        const { data: outroVeiculo } = await supabaseAdmin
          .from('emergencia_outro_veiculo')
          .select('nome, email, placa')
          .eq('emergencia_id', emergencia.id)
          .limit(1)
          .single();

        if (outroVeiculo) {
          const oficinaNome = (orc.oficina as any)?.nome_fantasia || 'Oficina';
          const valorFormatado = `R$ ${Number(orc.valor_total).toFixed(2).replace('.', ',')}`;

          // Get the solicitacao vehicle plate
          const { data: solicitacaoData } = await supabaseAdmin
            .from('solicitacoes')
            .select('veiculo:veiculos!solicitacoes_veiculo_id_fkey(placa)')
            .eq('id', orc.solicitacao_id)
            .single();
          const placaVeiculo = (solicitacaoData?.veiculo as any)?.placa || '';

          // Insert message in emergencia chat
          const resumoMsg = `O orcamento de ${valorFormatado} foi aceito na oficina ${oficinaNome}${placaVeiculo ? ` para o veiculo placa ${placaVeiculo}` : ''}. O reparo esta agendado com prazo de ${orc.prazo_dias} dias.`;

          await supabaseAdmin.from('emergencia_mensagens').insert({
            emergencia_id: emergencia.id,
            remetente_tipo: 'proprietario',
            remetente_id: null,
            texto: resumoMsg,
          });

          // Send email to the other person
          if (outroVeiculo.email) {
            const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://bipfix.com';
            const FROM_EMAIL = process.env.FROM_EMAIL || 'BipFix <noreply@bipfix.com>';
            const RESEND_KEY = process.env.RESEND_API_KEY;

            if (RESEND_KEY) {
              try {
                await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${RESEND_KEY}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    from: FROM_EMAIL,
                    to: outroVeiculo.email,
                    subject: `Orcamento aceito - ${oficinaNome}`,
                    html: `
                      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: #1e40af; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
                          <h1 style="margin: 0; font-size: 24px;">BipFix</h1>
                          <p style="margin: 8px 0 0; opacity: 0.8;">Orcamento Aceito</p>
                        </div>
                        <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                          <p>Ola <strong>${outroVeiculo.nome}</strong>,</p>
                          <p>O orcamento para o reparo do veiculo ${placaVeiculo ? `placa <strong>${placaVeiculo}</strong>` : ''} foi aceito:</p>
                          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin: 16px 0;">
                            <p style="margin: 0; font-size: 20px; font-weight: bold; color: #166534;">${valorFormatado}</p>
                            <p style="margin: 4px 0 0; color: #15803d;">Oficina: ${oficinaNome}</p>
                            <p style="margin: 4px 0 0; color: #15803d;">Prazo: ${orc.prazo_dias} dias</p>
                          </div>
                          <p>Acesse a plataforma para acompanhar o andamento do reparo e trocar mensagens.</p>
                          <p style="margin-top: 24px;">
                            <a href="${SITE_URL}/emergencia/acidente/${emergencia.id}"
                               style="display: inline-block; background: #1e40af; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                              Ver detalhes
                            </a>
                          </p>
                          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
                          <p style="font-size: 12px; color: #9ca3af;">Equipe BipFix</p>
                        </div>
                      </div>
                    `,
                  }),
                });
              } catch (emailErr) {
                console.error('[aceitar-orcamento] Email to outro motorista failed:', emailErr);
              }
            }
          }
        }
      }
    } catch (emergErr) {
      // Non-blocking: emergency notification failure shouldn't prevent quote acceptance
      console.error('[aceitar-orcamento] Emergency notification error:', emergErr);
    }

    return NextResponse.json({ success: true, slot });
  } catch (err) {
    console.error('[aceitar-orcamento]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
