import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehUuid } from '@/lib/validacao';
import { notifPedidoReabertoOficina } from '@/lib/notif-i18n';
import { emTodasAsLinguas } from '@/lib/notif-textos';
import { dentroDoLimite } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// O cliente reabre o pedido que ele mesmo cancelou (item 52; o expirado usa reabrir_pedido).
// Como no expirado: os orcamentos ainda validos voltam e o prazo de 30 dias recomeca
// (reaberta_em); os que tinham sido recusados so por causa do aceite tambem voltam.
// Nao avisa oficinas novas (o pedido ja tinha sido divulgado); as que tem orcamento de
// volta recebem um aviso.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!ehUuid(params.id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const { data: sol } = await supabaseAdmin.from('solicitacoes').select('id, numero, status, cliente_id, cancelada_em').eq('id', params.id).maybeSingle();
  if (!sol) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (sol.cliente_id !== userId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  // pedido cancelado pelo admin (sem cancelada_em) nao volta pelo cliente (auditoria 09/11)
  if (sol.status !== 'cancelada' || !sol.cancelada_em) return NextResponse.json({ error: 'Pedido não pode ser reaberto', codigo: 'PEDIDO_NAO_REABRIVEL' }, { status: 409 });

  // cancelar/reabrir sem parar mandaria um aviso as oficinas a cada vez
  if (!dentroDoLimite(`pedido-reabrir:${userId}`, 5, 3600e3)) return NextResponse.json({ error: 'Muitas tentativas', codigo: 'RATE_LIMIT' }, { status: 429 });
  const hoje = new Date().toISOString().slice(0, 10);
  await supabaseAdmin.from('orcamentos').update({ status: 'enviado', recusado_no_aceite: false })
    .eq('solicitacao_id', sol.id).eq('status', 'recusado').eq('recusado_no_aceite', true).gte('validade', hoje);
  const { data: valendo } = await supabaseAdmin.from('orcamentos')
    .select('oficina:oficinas(profile_id, profile:profiles(idioma))')
    .eq('solicitacao_id', sol.id).in('status', ['enviado', 'visualizado']).or(`validade.is.null,validade.gte.${hoje}`);
  const { data: mudou } = await supabaseAdmin.from('solicitacoes')
    .update({ status: valendo?.length ? 'em_orcamento' : 'aberta', reaberta_em: new Date().toISOString(), cancelada_em: null, motivo_cancelamento: null })
    .eq('id', sol.id).eq('status', 'cancelada').select('status');
  if (!mudou?.length) return NextResponse.json({ error: 'Pedido não pode ser reaberto', codigo: 'PEDIDO_NAO_REABRIVEL' }, { status: 409 });

  const numero = String(sol.numero ?? '');
  const vistos = new Set<string>();
  const avisos: any[] = [];
  for (const o of (valendo || []) as any[]) {
    const pid = o.oficina?.profile_id; if (!pid || vistos.has(pid)) continue; vistos.add(pid);
    const n = notifPedidoReabertoOficina(o.oficina?.profile?.idioma, numero);
    avisos.push({ profile_id: pid, tipo: 'pedido_reaberto', titulo: n.titulo, mensagem: n.mensagem,
      dados: { solicitacao_id: sol.id, textos: emTodasAsLinguas((l) => notifPedidoReabertoOficina(l, numero)) } });
  }
  if (avisos.length) await supabaseAdmin.from('notificacoes').insert(avisos);
  return NextResponse.json({ ok: true, status: mudou[0].status });
}
