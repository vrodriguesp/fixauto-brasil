import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehUuid } from '@/lib/validacao';
import { horaLocalEmUtc } from '@/lib/fuso';
import { avisarClienteAgendamento } from '@/lib/email-agendamento';

export const dynamic = 'force-dynamic';

// Cliente troca o horario por outro dos horarios livres do orcamento aceito
// (pagina /cliente/reagendar). Antes a pagina gravava direto no banco, mas o
// cliente nao tem permissao de alterar a agenda: nada era salvo e a tela dizia
// "sucesso" (achado no teste de 07/11). Agora no servidor, com as conferencias.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { slotId } = await req.json().catch(() => ({}));
  if (!ehUuid(params.id) || !ehUuid(slotId)) return NextResponse.json({ error: 'Inválido', codigo: 'DADOS_INVALIDOS' }, { status: 400 });

  const { data: ag } = await supabaseAdmin.from('agenda')
    .select('id, status, solicitacao_id, oficina:oficinas(pais), solicitacao:solicitacoes(cliente_id)')
    .eq('id', params.id).maybeSingle();
  if (!ag || (ag as any).solicitacao?.cliente_id !== userId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  if (ag.status !== 'agendado') return NextResponse.json({ error: 'Carro já na oficina', codigo: 'NAO_AGENDADO' }, { status: 409 });

  // o horario tem de ser do orcamento ACEITO deste pedido e ainda no futuro
  const { data: orc } = await supabaseAdmin.from('orcamentos')
    .select('id, disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(id, data_checkin, turno, data_previsao_entrega)')
    .eq('solicitacao_id', ag.solicitacao_id).eq('status', 'aceito').maybeSingle();
  const slot = ((orc as any)?.disponibilidade || []).find((s: any) => s.id === slotId);
  if (!slot) return NextResponse.json({ error: 'Horário inválido', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  const pais = (ag as any).oficina?.pais;
  const inicio = horaLocalEmUtc(slot.data_checkin, slot.turno === 'manha' ? '08:00' : '13:00', pais);
  if (new Date(inicio).getTime() < Date.now()) return NextResponse.json({ error: 'Horário vencido', codigo: 'HORARIO_VENCIDO' }, { status: 409 });
  const fim = horaLocalEmUtc(slot.data_previsao_entrega || slot.data_checkin, slot.turno === 'manha' ? '12:00' : '18:00', pais);

  const { error } = await supabaseAdmin.from('agenda')
    .update({ data_inicio: inicio, data_fim: fim, data_fim_prevista: fim, no_show: false, no_show_registrado_em: null })
    .eq('id', ag.id).eq('status', 'agendado');
  if (error) return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  await supabaseAdmin.from('orcamentos').update({ disponibilidade_escolhida_id: slotId }).eq('id', (orc as any).id);
  await supabaseAdmin.from('no_show_historico').update({ reagendado: true, reagendado_em: new Date().toISOString() }).eq('agenda_id', ag.id).eq('reagendado', false);
  // e-mail ao cliente com o novo horario e o evento de calendario atualizado
  await avisarClienteAgendamento(ag.id).catch((e) => console.error('[agenda/reagendar] e-mail', e));
  return NextResponse.json({ ok: true, data_inicio: inicio });
}
