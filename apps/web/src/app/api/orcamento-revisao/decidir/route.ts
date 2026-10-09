import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehUuid } from '@/lib/validacao';
import { formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { notifRevisaoDecidida } from '@/lib/notif-revisao';

export const dynamic = 'force-dynamic';

type Decisao = 'aprovar' | 'recusar' | 'retirar';
const STATUS: Record<Decisao, 'aprovada' | 'recusada' | 'retirada'> = { aprovar: 'aprovada', recusar: 'recusada', retirar: 'retirada' };

// O CLIENTE decide a revisao proposta pela oficina (migracao 049):
//  aprovar -> o orcamento aceito passa a ter os novos itens/valor
//             (valor_original guarda o primeiro preco; revisao_numero +1)
//  recusar -> nada muda: a oficina segue com o orcamento original
//  retirar -> recusa e encerra o servico: agenda cancelada, pedido cancelado,
//             sem comissao; o cliente combina a retirada pela conversa
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { revisaoId, decisao } = (await req.json().catch(() => ({}))) as { revisaoId?: string; decisao?: Decisao };
  if (!ehUuid(revisaoId) || !decisao || !STATUS[decisao]) return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });

  const { data: rev } = await supabaseAdmin.from('orcamento_revisoes')
    .select('id, status, orcamento_id, solicitacao_id, oficina_id, valor_anterior, valor_novo, prazo_dias_novo, itens, solicitacao:solicitacoes(cliente_id, veiculo:veiculos(fipe_marca, fipe_modelo)), oficina:oficinas(profile_id, pais, profile:profiles!oficinas_profile_id_fkey(idioma))')
    .eq('id', revisaoId).maybeSingle();
  if (!rev) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if ((rev as any).solicitacao?.cliente_id !== userId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  // trava atomica: so decide uma vez
  const { data: trava } = await supabaseAdmin.from('orcamento_revisoes')
    .update({ status: STATUS[decisao], decidido_em: new Date().toISOString(), decidido_por: userId })
    .eq('id', rev.id).eq('status', 'pendente').select('id');
  if (!trava?.length) return NextResponse.json({ error: 'Revisão já decidida', codigo: 'REVISAO_DECIDIDA' }, { status: 409 });

  if (decisao === 'aprovar') {
    const { data: orc } = await supabaseAdmin.from('orcamentos').select('valor_total, valor_original, revisao_numero, prazo_dias').eq('id', rev.orcamento_id).single();
    await supabaseAdmin.from('orcamentos').update({
      valor_original: orc?.valor_original ?? orc?.valor_total,
      valor_total: rev.valor_novo,
      revisao_numero: (orc?.revisao_numero || 0) + 1,
      revisado_em: new Date().toISOString(),
      ...(rev.prazo_dias_novo ? { prazo_dias: rev.prazo_dias_novo } : {}),
    }).eq('id', rev.orcamento_id);
    await supabaseAdmin.from('orcamento_itens').delete().eq('orcamento_id', rev.orcamento_id);
    const itens = Array.isArray(rev.itens) ? rev.itens : [];
    if (itens.length) await supabaseAdmin.from('orcamento_itens').insert(itens.map((i: any) => ({ ...i, orcamento_id: rev.orcamento_id })));
  } else if (decisao === 'retirar') {
    const { data: ags } = await supabaseAdmin.from('agenda').select('id')
      .eq('solicitacao_id', rev.solicitacao_id).eq('oficina_id', rev.oficina_id).in('status', ['agendado', 'em_andamento']);
    for (const a of ags || []) {
      await supabaseAdmin.from('agenda').update({ status: 'cancelado' }).eq('id', a.id);
      await supabaseAdmin.from('agenda_historico').insert({ agenda_id: a.id, acao: 'retirado_revisao_recusada', por_profile_id: userId, detalhe: { revisao_id: rev.id } });
    }
    await supabaseAdmin.from('solicitacoes').update({ status: 'cancelada' }).eq('id', rev.solicitacao_id);
  }

  const of = (rev as any).oficina;
  const veic = (rev as any).solicitacao?.veiculo;
  const idioma = of?.profile?.idioma;
  const fmt = (v: number) => formatCurrency(v, currencyForCountry(of?.pais), idioma || 'en');
  const n = notifRevisaoDecidida(idioma, STATUS[decisao], {
    carro: [veic?.fipe_marca, veic?.fipe_modelo].filter(Boolean).join(' '), de: fmt(Number(rev.valor_anterior)), para: fmt(Number(rev.valor_novo)),
  });
  if (of?.profile_id) {
    await supabaseAdmin.from('notificacoes').insert({
      profile_id: of.profile_id, tipo: 'revisao_orcamento_decidida', titulo: n.titulo, mensagem: n.mensagem,
      dados: { solicitacao_id: rev.solicitacao_id, orcamento_id: rev.orcamento_id, revisao_id: rev.id, decisao: STATUS[decisao] },
    });
  }
  return NextResponse.json({ ok: true, status: STATUS[decisao] });
}
