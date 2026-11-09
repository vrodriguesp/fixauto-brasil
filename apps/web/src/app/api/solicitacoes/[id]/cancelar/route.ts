import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehUuid } from '@/lib/validacao';
import { notifPedidoCanceladoOficina, chatPedidoCancelado } from '@/lib/notif-i18n';
import { avisarCancelamentoPeloCliente } from '@/lib/email-cancelamento-cliente';
import { emTodasAsLinguas } from '@/lib/notif-textos';
import { dentroDoLimite } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// O cliente cancela o proprio pedido (dono 09/11, item 52; migracao 078). Vale ate o carro
// chegar na oficina: depois do check-in, so pela conversa com a oficina. Cancela o
// agendamento ainda nao comecado e as propostas pendentes; as oficinas que mandaram
// orcamento sao avisadas (e, se ja conversavam, uma linha no chat). O pedido some das listas
// das oficinas (cancelada nao aparece para elas). Os orcamentos ficam como estao para o
// cliente poder reabrir; o da oficina escolhida (se havia) vira recusado.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!ehUuid(params.id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const motivo = typeof b?.motivo === 'string' && b.motivo.trim() ? b.motivo.trim().slice(0, 200) : null;

  const { data: sol } = await supabaseAdmin.from('solicitacoes')
    .select('id, numero, status, cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(idioma)')
    .eq('id', params.id).maybeSingle();
  if (!sol) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (sol.cliente_id !== userId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  // cancelar/reabrir sem parar mandaria um aviso as oficinas a cada vez (auditoria 09/11)
  if (!dentroDoLimite(`pedido-cancelar:${userId}`, 5, 3600e3)) return NextResponse.json({ error: 'Muitas tentativas', codigo: 'RATE_LIMIT' }, { status: 429 });
  // check-in ja feito (pedido em andamento): o carro esta na oficina
  if (sol.status === 'em_andamento') return NextResponse.json({ error: 'Carro já na oficina', codigo: 'CARRO_NA_OFICINA' }, { status: 409 });
  if (!['aberta', 'em_orcamento', 'aceita'].includes(sol.status as string)) {
    return NextResponse.json({ error: 'Pedido não pode ser cancelado', codigo: 'PEDIDO_NAO_CANCELAVEL' }, { status: 409 });
  }
  // carro ja na oficina: cancelar so conversando com ela
  const { data: ags } = await supabaseAdmin.from('agenda').select('id, status, checkin_em').eq('solicitacao_id', sol.id).neq('status', 'cancelado');
  if ((ags || []).some((a) => a.checkin_em || a.status === 'em_andamento' || a.status === 'concluido')) {
    return NextResponse.json({ error: 'Carro já na oficina', codigo: 'CARRO_NA_OFICINA' }, { status: 409 });
  }

  // quem precisa saber: oficinas com orcamento ainda valendo
  const { data: orcs } = await supabaseAdmin.from('orcamentos')
    .select('id, status, oficina_id, oficina:oficinas(profile_id, profile:profiles(idioma))')
    .eq('solicitacao_id', sol.id).in('status', ['enviado', 'visualizado', 'aceito']);

  // troca de status so se ainda estiver como lido (corrida com aceite/check-in)
  const { data: mudou } = await supabaseAdmin.from('solicitacoes')
    .update({ status: 'cancelada', cancelada_em: new Date().toISOString(), motivo_cancelamento: motivo })
    .eq('id', sol.id).in('status', ['aberta', 'em_orcamento', 'aceita']).select('id');
  if (!mudou?.length) return NextResponse.json({ error: 'Pedido não pode ser cancelado', codigo: 'PEDIDO_NAO_CANCELAVEL' }, { status: 409 });

  for (const a of ags || []) {
    if (a.status !== 'agendado') continue;
    await supabaseAdmin.from('agenda').update({ status: 'cancelado' }).eq('id', a.id).eq('status', 'agendado');
    await supabaseAdmin.from('agenda_historico').insert({ agenda_id: a.id, acao: 'cancelado_cliente', por_profile_id: userId, detalhe: { motivo, pedido_cancelado: true } });
    // horario marcado: e-mail ao cliente (tira do calendario) e a oficina (horario livre)
    await avisarCancelamentoPeloCliente(a.id, motivo || null).catch(() => {});
  }
  await supabaseAdmin.from('orcamento_revisoes').update({ status: 'cancelada' }).eq('solicitacao_id', sol.id).eq('status', 'pendente');
  await supabaseAdmin.from('orcamentos').update({ status: 'recusado' }).eq('solicitacao_id', sol.id).eq('status', 'aceito');

  const numero = String(sol.numero ?? '');
  const idiomaCli = (sol as any).cliente?.idioma;
  const vistos = new Set<string>();
  const avisos: any[] = [];
  for (const o of (orcs || []) as any[]) {
    const pid = o.oficina?.profile_id; if (!pid || vistos.has(pid)) continue; vistos.add(pid);
    const n = notifPedidoCanceladoOficina(o.oficina?.profile?.idioma, numero, motivo);
    avisos.push({ profile_id: pid, tipo: 'pedido_cancelado', titulo: n.titulo, mensagem: n.mensagem,
      dados: { solicitacao_id: sol.id, textos: emTodasAsLinguas((l) => notifPedidoCanceladoOficina(l, numero, motivo)) } });
    // ja conversavam: a oficina tambem ve no chat
    const { count } = await supabaseAdmin.from('mensagens').select('id', { count: 'exact', head: true }).eq('solicitacao_id', sol.id).eq('oficina_id', o.oficina_id);
    if (count) await supabaseAdmin.from('mensagens').insert({ solicitacao_id: sol.id, oficina_id: o.oficina_id, remetente_id: userId, texto: chatPedidoCancelado(idiomaCli, motivo) });
  }
  if (avisos.length) {
    const { error } = await supabaseAdmin.from('notificacoes').insert(avisos);
    if (error) console.error('[cancelar-pedido] aviso:', error.message);
  }
  return NextResponse.json({ ok: true, oficinasAvisadas: avisos.length });
}
