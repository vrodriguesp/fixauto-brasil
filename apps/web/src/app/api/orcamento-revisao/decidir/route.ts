import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehUuid } from '@/lib/validacao';
import { formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { notifRevisaoDecidida } from '@/lib/notif-revisao';
import { horaLocalEmUtc, fusoDoPais } from '@/lib/fuso';
import { avisarClienteAgendamento } from '@/lib/email-agendamento';
import { textosAgenda, preencher, dataHora } from '@/lib/notif-agenda';

export const dynamic = 'force-dynamic';

type Decisao = 'aprovar' | 'recusar';
// 'retirar' = nome antigo de 'recusar' (telas anteriores a 09/10)
const STATUS: Record<Decisao | 'retirar', 'aprovada' | 'retirada'> = { aprovar: 'aprovada', recusar: 'retirada', retirar: 'retirada' };

// O CLIENTE decide a revisao proposta pela oficina (migracao 049). So duas
// opcoes (decisao do dono, 09/10): se a oficina diz que o servico custa mais,
// "manter o preco original" nao e uma opcao real.
//  aprovar -> o orcamento aceito passa a ter os novos itens/valor
//             (valor_original guarda o primeiro preco; revisao_numero +1)
//  recusar -> encerra o servico: agenda cancelada, pedido cancelado, sem
//             comissao; o cliente combina a retirada pela conversa
//             (status 'retirada', contado no monitoramento do admin)
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { revisaoId, decisao } = (await req.json().catch(() => ({}))) as { revisaoId?: string; decisao?: Decisao | 'retirar' };
  if (!ehUuid(revisaoId) || !decisao || !STATUS[decisao]) return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });

  const { data: rev } = await supabaseAdmin.from('orcamento_revisoes')
    .select('id, tipo, nova_data_checkin, novo_turno, nova_previsao_entrega, status, orcamento_id, solicitacao_id, oficina_id, valor_anterior, valor_novo, prazo_dias_novo, itens, solicitacao:solicitacoes(cliente_id, veiculo:veiculos(fipe_marca, fipe_modelo)), oficina:oficinas(profile_id, pais, profile:profiles!oficinas_profile_id_fkey(idioma))')
    .eq('id', revisaoId).maybeSingle();
  if (!rev) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if ((rev as any).solicitacao?.cliente_id !== userId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  // proposta de NOVA DATA (076): aceitar muda a agenda; recusar mantem a data atual e o servico
  if ((rev as any).tipo === 'data') return decidirData(rev as any, decisao === 'aprovar', userId);

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
  } else {
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

async function decidirData(rev: any, aceitar: boolean, userId: string) {
  const { data: trava } = await supabaseAdmin.from('orcamento_revisoes')
    .update({ status: aceitar ? 'aprovada' : 'recusada', decidido_em: new Date().toISOString(), decidido_por: userId })
    .eq('id', rev.id).eq('status', 'pendente').select('id');
  if (!trava?.length) return NextResponse.json({ error: 'Revisão já decidida', codigo: 'REVISAO_DECIDIDA' }, { status: 409 });
  const of = rev.oficina;
  const inicio = horaLocalEmUtc(rev.nova_data_checkin, rev.novo_turno === 'manha' ? '08:00' : '13:00', of?.pais);
  let emailEnviado = false;
  if (aceitar) {
    const { data: ag } = await supabaseAdmin.from('agenda').select('id, data_inicio')
      .eq('solicitacao_id', rev.solicitacao_id).eq('oficina_id', rev.oficina_id).eq('status', 'agendado').maybeSingle();
    if (!ag) {
      // o carro chegou entre a proposta e a resposta: nada a mudar
      await supabaseAdmin.from('orcamento_revisoes').update({ status: 'cancelada' }).eq('id', rev.id);
      return NextResponse.json({ error: 'Carro já na oficina', codigo: 'NAO_AGENDADO' }, { status: 409 });
    }
    const fim = horaLocalEmUtc(rev.nova_previsao_entrega || rev.nova_data_checkin, rev.novo_turno === 'manha' ? '12:00' : '18:00', of?.pais);
    await supabaseAdmin.from('agenda').update({ data_inicio: inicio, data_fim: fim, data_fim_prevista: fim, no_show: false }).eq('id', ag.id).eq('status', 'agendado');
    await supabaseAdmin.from('agenda_historico').insert({ agenda_id: ag.id, acao: 'data_proposta_aceita', por_profile_id: userId, detalhe: { de: ag.data_inicio, para: inicio, revisao_id: rev.id } });
    emailEnviado = await avisarClienteAgendamento(ag.id).catch(() => false);
  }
  const veic = rev.solicitacao?.veiculo;
  const idioma = of?.profile?.idioma;
  const tOf = textosAgenda(idioma);
  if (of?.profile_id) {
    await supabaseAdmin.from('notificacoes').insert({
      profile_id: of.profile_id, tipo: 'revisao_orcamento_decidida', titulo: aceitar ? tOf.aceitaTitulo : tOf.recusadaTitulo,
      mensagem: preencher(tOf.decididaMsg, { carro: [veic?.fipe_marca, veic?.fipe_modelo].filter(Boolean).join(' '), quando: dataHora(inicio, idioma, fusoDoPais(of?.pais)) }),
      dados: { solicitacao_id: rev.solicitacao_id, orcamento_id: rev.orcamento_id, revisao_id: rev.id, decisao: aceitar ? 'aprovada' : 'recusada' },
    });
  }
  return NextResponse.json({ ok: true, status: aceitar ? 'aprovada' : 'recusada', emailEnviado });
}
