import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
    const { action } = await req.json();
    if (action !== 'cancelar') {
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }

    const { data: agenda, error: fetchError } = await supabaseAdmin
      .from('agenda')
      .select('titulo, status, solicitacao_id, oficina:oficinas(profile_id), solicitacao:solicitacoes(cliente_id)')
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

    const clienteId = (agenda as any).solicitacao?.cliente_id;
    const oficinaProfileId = (agenda as any).oficina?.profile_id;

    const destinatarios = [clienteId, oficinaProfileId].filter(Boolean) as string[];
    for (const profileId of destinatarios) {
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: profileId,
        tipo: 'agendamento_cancelado_admin',
        titulo: 'Agendamento cancelado',
        mensagem: `Nossa equipe cancelou o agendamento "${agenda.titulo}". Entre em contato caso precise reagendar.`,
        dados: { agenda_id: params.id, solicitacao_id: agenda.solicitacao_id },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[admin/agenda/:id PATCH]', error);
    return NextResponse.json({ error: 'Erro ao cancelar agendamento' }, { status: 500 });
  }
}
