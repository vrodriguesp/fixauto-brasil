import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { notifFaltaRegistrada } from '@/lib/notif-i18n';
import { resolveEmailLocale } from '@/lib/email-i18n';
import { supabaseAdmin } from '@/lib/supabase-admin';


export async function POST(req: NextRequest) {
  try {
    const callerId = await getSessionUserId(req);
    if (!callerId) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { agendaId } = await req.json();

    if (!agendaId) {
      return NextResponse.json({ error: 'agendaId é obrigatório' }, { status: 400 });
    }

    // 1. Get agenda info
    const { data: agenda } = await supabaseAdmin
      .from('agenda')
      .select('oficina_id, solicitacao_id, status, data_inicio, oficina:oficinas(profile_id)')
      .eq('id', agendaId)
      .single();

    // So a oficina dona do agendamento pode registrar a falta - sem isso,
    // qualquer agendaId adivinhado cancelava a solicitacao e marcava
    // "nao compareceu" contra um cliente de outra oficina.
    if (!agenda || (agenda as any).oficina?.profile_id !== callerId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }
    // O pedido vem do PROPRIO agendamento, nunca do corpo (antes uma oficina
    // reabria o orcamento de outra - auditoria Fable 08/10, A-02); e so vale
    // para agendamento que ainda esperava o carro (trava atomica).
    const solicitacaoId: string | null = (agenda as any).solicitacao_id || null;
    const { data: trava } = await supabaseAdmin.from('agenda').update({
      no_show: true,
      no_show_registrado_em: new Date().toISOString(),
      status: 'cancelado',
    }).eq('id', agendaId).eq('status', 'agendado').select('id');
    if (!trava?.length) return NextResponse.json({ error: 'Agendamento não está aguardando o carro', codigo: 'NAO_AGENDADO' }, { status: 409 });

    // 3. Get client info
    let clienteId: string | null = null;
    let clienteIdioma: string | null = null;
    let veiculoNome: string | null = null;

    if (solicitacaoId) {
      const { data: sol } = await supabaseAdmin
        .from('solicitacoes')
        .select('cliente_id, veiculo:veiculos(fipe_marca, fipe_modelo), cliente:profiles!solicitacoes_cliente_id_fkey(idioma)')
        .eq('id', solicitacaoId)
        .single();

      if (sol) {
        clienteId = sol.cliente_id;
        clienteIdioma = (sol.cliente as any)?.idioma;
        if (sol.veiculo) {
          veiculoNome = `${(sol.veiculo as any).fipe_marca} ${(sol.veiculo as any).fipe_modelo}`;
        }
      }

      // 4. Set solicitacao to no_show status
      const { error: eSt } = await supabaseAdmin.from('solicitacoes')
        .update({ status: 'no_show' })
        .eq('id', solicitacaoId);
      if (eSt) console.error('[registrar-no-show] status', eSt.message);

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
      const veiculoFallback: Record<string, string> = { pt: 'seu veículo', en: 'your vehicle', et: 'sinu sõiduk', it: 'il tuo veicolo' };
      const n = notifFaltaRegistrada(clienteIdioma, veiculoNome || veiculoFallback[resolveEmailLocale(clienteIdioma)]);
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: clienteId,
        tipo: 'no_show',
        titulo: n.titulo,
        mensagem: n.mensagem,
        dados: { agenda_id: agendaId, solicitacao_id: solicitacaoId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
