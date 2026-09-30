import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { notifAgendamentoCancelado } from '@/lib/notif-i18n';
import { supabaseAdmin } from '@/lib/supabase-admin';


// Cancelamento de agendamento pelo admin (visao central de todas as
// interacoes do site). Diferente do "no-show" (que a oficina registra
// quando o cliente nao aparece), aqui e uma decisao administrativa - so
// muda o status pra "cancelado" e avisa cliente/oficina, sem mexer no
// status da solicitacao vinculada (o admin corrige isso separadamente,
// via PATCH /api/admin/solicitacoes/:id, se necessario).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const { action, motivo } = await req.json();
    if (action !== 'cancelar') {
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }

    const { data: agenda, error: fetchError } = await supabaseAdmin
      .from('agenda')
      .select('titulo, status, solicitacao_id, oficina:oficinas(profile_id, profile:profiles!oficinas_profile_id_fkey(idioma)), solicitacao:solicitacoes(cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(idioma))')
      .eq('id', params.id)
      .single();

    if (fetchError || !agenda) {
      return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });
    }

    if (agenda.status === 'cancelado') {
      return NextResponse.json({ error: 'Este agendamento já está cancelado' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('agenda')
      .update({ status: 'cancelado' })
      .eq('id', params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await registrarAuditoria(supabaseAdmin, {
      adminId: auth.userId, entidade: 'agenda', entidadeId: params.id, acao: 'cancelar_agendamento',
      antes: { status: agenda.status }, depois: { status: 'cancelado' }, motivo, solicitacaoId: agenda.solicitacao_id,
    });

    const clienteId = (agenda as any).solicitacao?.cliente_id;
    const clienteIdioma = (agenda as any).solicitacao?.cliente?.idioma;
    const oficinaProfileId = (agenda as any).oficina?.profile_id;
    const oficinaIdioma = (agenda as any).oficina?.profile?.idioma;

    const destinatarios = [
      { profileId: clienteId, idioma: clienteIdioma },
      { profileId: oficinaProfileId, idioma: oficinaIdioma },
    ].filter((d) => d.profileId);
    for (const { profileId, idioma } of destinatarios) {
      const n = notifAgendamentoCancelado(idioma, agenda.titulo);
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: profileId,
        tipo: 'agendamento_cancelado_admin',
        titulo: n.titulo,
        mensagem: n.mensagem,
        dados: { agenda_id: params.id, solicitacao_id: agenda.solicitacao_id },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[admin/agenda/:id PATCH]', error);
    return NextResponse.json({ error: 'Erro ao cancelar agendamento' }, { status: 500 });
  }
}
