import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehUuid } from '@/lib/validacao';
import { horaLocalEmUtc } from '@/lib/fuso';
import { avisarClienteAgendamento } from '@/lib/email-agendamento';
import { agendaDaOficina, motivoValido, MOTIVO_MIN, avisarNoChatENotificar } from '@/lib/agenda-oficina';

export const dynamic = 'force-dynamic';

// A oficina muda a data de entrega de um carro de pedido antes do check-in
// (dono 07/11), depois de combinar com o cliente no chat ou por telefone. Com
// justificativa: vai no e-mail ao cliente (com o evento de calendario
// atualizado), no chat do pedido e no historico da agenda.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const motivo = motivoValido(b?.motivo);
  if (!ehUuid(params.id) || !/^\d{4}-\d{2}-\d{2}$/.test(b?.data || '') || !/^\d{2}:\d{2}$/.test(b?.hora || '') || motivo.length < MOTIVO_MIN) {
    return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  }
  const r = await agendaDaOficina(params.id, userId);
  if ('erro' in r) return NextResponse.json({ error: 'Não permitido', codigo: r.erro === 409 ? 'NAO_AGENDADO' : undefined }, { status: r.erro });
  const { ag, of } = r;
  const inicio = horaLocalEmUtc(b.data, b.hora, of?.pais);
  if (new Date(inicio).getTime() < Date.now()) return NextResponse.json({ error: 'Data no passado', codigo: 'HORARIO_VENCIDO' }, { status: 409 });
  if (new Date(inicio).getTime() === new Date(ag.data_inicio).getTime()) return NextResponse.json({ error: 'Mesma data', codigo: 'REVISAO_SEM_MUDANCA' }, { status: 400 });
  // o carro fica o mesmo tempo na oficina: o fim anda junto com o inicio
  const delta = new Date(inicio).getTime() - new Date(ag.data_inicio).getTime();
  const mover = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + delta).toISOString() : null);
  const { data: feito } = await supabaseAdmin.from('agenda')
    .update({ data_inicio: inicio, data_fim: mover(ag.data_fim), ...(ag.data_fim_prevista ? { data_fim_prevista: mover(ag.data_fim_prevista) } : {}), no_show: false })
    .eq('id', ag.id).eq('status', 'agendado').select('id');
  if (!feito?.length) return NextResponse.json({ error: 'Carro já na oficina', codigo: 'NAO_AGENDADO' }, { status: 409 });
  await supabaseAdmin.from('agenda_historico').insert({ agenda_id: ag.id, acao: 'data_mudada', por_profile_id: userId, detalhe: { de: ag.data_inicio, para: inicio, motivo } });
  await avisarNoChatENotificar({
    solicitacaoId: ag.solicitacao_id, oficinaId: ag.oficina_id, remetenteId: userId, idiomaOficina: of?.profile?.idioma, pais: of?.pais,
    oficinaNome: of?.nome_fantasia || '', chave: 'chatData', quando: inicio, motivo,
    notif: { tipo: 'agendamento_data_mudada', tituloChave: 'dataMudadaTitulo', msgChave: 'dataMudadaMsg' },
  }).catch((e) => console.error('[agenda/mudar-data] aviso', e));
  const enviado = await avisarClienteAgendamento(ag.id, { motivo }).catch((e) => { console.error('[agenda/mudar-data] e-mail', e); return false; });
  return NextResponse.json({ ok: true, data_inicio: inicio, emailEnviado: enviado });
}
