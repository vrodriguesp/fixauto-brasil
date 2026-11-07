import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehUuid } from '@/lib/validacao';
import { avisarClienteCancelamento } from '@/lib/email-agendamento';
import { agendaDaOficina, motivoValido, MOTIVO_MIN, avisarNoChatENotificar } from '@/lib/agenda-oficina';

export const dynamic = 'force-dynamic';

// A oficina cancela o agendamento de um carro de pedido antes do check-in
// (dono 07/11), com justificativa. O pedido volta a ficar aberto para o
// cliente escolher outra oficina: os orcamentos das outras, recusados no
// aceite e ainda validos, voltam a aparecer. O cliente recebe e-mail com o
// motivo (e o .ics que tira o evento do calendario), aviso e linha no chat.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const motivo = motivoValido(b?.motivo);
  if (!ehUuid(params.id) || motivo.length < MOTIVO_MIN) return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  const r = await agendaDaOficina(params.id, userId);
  if ('erro' in r) return NextResponse.json({ error: 'Não permitido', codigo: r.erro === 409 ? 'NAO_AGENDADO' : undefined }, { status: r.erro });
  const { ag, of } = r;

  // trava: so cancela uma vez e so antes do check-in
  const { data: feito } = await supabaseAdmin.from('agenda').update({ status: 'cancelado' }).eq('id', ag.id).eq('status', 'agendado').select('id');
  if (!feito?.length) return NextResponse.json({ error: 'Carro já na oficina', codigo: 'NAO_AGENDADO' }, { status: 409 });
  await supabaseAdmin.from('agenda_historico').insert({ agenda_id: ag.id, acao: 'cancelado_oficina', por_profile_id: userId, detalhe: { motivo } });

  // o orcamento desta oficina sai; proposta de revisao pendente cai junto
  await supabaseAdmin.from('orcamentos').update({ status: 'recusado' }).eq('solicitacao_id', ag.solicitacao_id).eq('oficina_id', ag.oficina_id).eq('status', 'aceito');
  await supabaseAdmin.from('orcamento_revisoes').update({ status: 'cancelada' }).eq('solicitacao_id', ag.solicitacao_id).eq('status', 'pendente');
  // os das outras oficinas recusados AUTOMATICAMENTE no aceite e ainda validos voltam
  // (o que o proprio cliente recusou continua recusado)
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: voltam } = await supabaseAdmin.from('orcamentos').update({ status: 'enviado', recusado_no_aceite: false })
    .eq('solicitacao_id', ag.solicitacao_id).neq('oficina_id', ag.oficina_id).eq('status', 'recusado').eq('recusado_no_aceite', true).gte('validade', hoje).select('id');
  // pedido aberto de novo (o prazo de 30 dias recomeca, migracao 072)
  await supabaseAdmin.from('solicitacoes').update({ status: voltam?.length ? 'em_orcamento' : 'aberta', reaberta_em: new Date().toISOString() }).eq('id', ag.solicitacao_id);

  await avisarNoChatENotificar({
    solicitacaoId: ag.solicitacao_id, oficinaId: ag.oficina_id, remetenteId: userId, idiomaOficina: of?.profile?.idioma, pais: of?.pais,
    oficinaNome: of?.nome_fantasia || '', chave: 'chatCancelado', motivo,
    notif: { tipo: 'agendamento_cancelado_oficina', tituloChave: 'canceladoTitulo', msgChave: 'canceladoMsg' },
  }).catch((e) => console.error('[agenda/cancelar] aviso', e));
  const enviado = await avisarClienteCancelamento(ag.id, motivo, true).catch((e) => { console.error('[agenda/cancelar] e-mail', e); return false; });
  return NextResponse.json({ ok: true, orcamentosDeVolta: voltam?.length || 0, emailEnviado: enviado });
}
