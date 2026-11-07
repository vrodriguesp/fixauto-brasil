import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { limitarPorIp } from '@/lib/rate-limit';
import { ehUuid } from '@/lib/validacao';
import { avisarClienteAgendamento } from '@/lib/email-agendamento';

export const dynamic = 'force-dynamic';

// Chamada depois de remarcar (oficina na agenda, cliente em "reagendar"): se o
// horario mudou desde o ultimo aviso, o cliente recebe o e-mail com o evento de
// calendario atualizado (lib/email-agendamento.ts). Quem chama precisa ser da
// oficina do agendamento ou o cliente do pedido; o servidor confere o horario
// no banco (a chamada so pede "confira", nao diz o que mudou).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!limitarPorIp(req, 'agenda-avisar-cliente', 60, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas' }, { status: 429 });
  }
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!ehUuid(params.id)) return NextResponse.json({ error: 'Inválido' }, { status: 400 });
  const { data: ag } = await supabaseAdmin.from('agenda')
    .select('id, oficina_id, solicitacao:solicitacoes(cliente_id), oficina:oficinas(profile_id)')
    .eq('id', params.id).maybeSingle();
  if (!ag) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const ehCliente = (ag as any).solicitacao?.cliente_id === userId;
  let ehOficina = (ag as any).oficina?.profile_id === userId;
  if (!ehOficina && !ehCliente) {
    const { data: f } = await supabaseAdmin.from('funcionarios').select('id').eq('oficina_id', ag.oficina_id).eq('profile_id', userId).limit(1);
    ehOficina = !!f?.length;
  }
  if (!ehCliente && !ehOficina) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  const enviado = await avisarClienteAgendamento(ag.id).catch((e) => { console.error('[agenda/avisar-cliente]', e); return false; });
  return NextResponse.json({ enviado });
}
