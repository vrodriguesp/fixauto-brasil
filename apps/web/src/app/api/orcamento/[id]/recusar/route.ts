import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehUuid } from '@/lib/validacao';
import { dentroDoLimite } from '@/lib/rate-limit';
import { notifOrcamentoRecusado } from '@/lib/notif-i18n';
import { emTodasAsLinguas } from '@/lib/notif-textos';
import { cancelarPedidosDatasPendentes } from '@/lib/pedido-datas';

export const dynamic = 'force-dynamic';

import { MOTIVOS_RECUSA } from '@/lib/recusa';

// 114 (dono 21/11): o motorista recusa o orcamento com um motivo OPCIONAL de 1 toque
// (preco | data | distancia | resolvido | outro), gravado em orcamentos.recusado_motivo e mostrado a
// oficina em palavras simples. Mesmo efeito do "Recusar" antigo (status 'recusado'); o pedido de outra
// data pendente desse orcamento cai ('recusou'). Com o carro na oficina (em_andamento) a oficina recebe o
// aviso para fazer o check-out, como antes. O app publicado continua recusando direto pelo banco (sem motivo).
// Resposta: { ok, outrosAtivos } - outrosAtivos = quantos orcamentos ainda podem ser aceitos (a tela pergunta
// se quer cancelar o pedido quando chega a zero, como antes).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    if (!ehUuid(params.id)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    if (!dentroDoLimite(`recusar:${userId}`, 30, 3600e3)) return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
    const corpo = await req.json().catch(() => ({}));
    const motivo = corpo?.motivo == null || corpo.motivo === '' ? null : String(corpo.motivo);
    if (motivo && !(MOTIVOS_RECUSA as readonly string[]).includes(motivo)) return NextResponse.json({ error: 'Motivo inválido', codigo: 'DADOS_INVALIDOS' }, { status: 400 });

    const { data: orc } = await supabaseAdmin.from('orcamentos')
      .select('id, status, solicitacao_id, oficina_id, solicitacao:solicitacoes(id, status, cliente_id), oficina:oficinas(profile_id, profile:profiles!oficinas_profile_id_fkey(idioma))')
      .eq('id', params.id).maybeSingle();
    if (!orc) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    const sol = (orc as any).solicitacao, of = (orc as any).oficina;
    if (sol?.cliente_id !== userId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    if (!['enviado', 'visualizado'].includes(orc.status)) return NextResponse.json({ error: 'Orçamento não está disponível', codigo: 'ORCAMENTO_INDISPONIVEL' }, { status: 409 });
    if (['expirada', 'cancelada', 'concluida'].includes(sol?.status)) return NextResponse.json({ error: 'Pedido fechado', codigo: 'PEDIDO_FECHADO' }, { status: 409 });

    // trava: so quem ainda esta enviado/visualizado vira recusado (dois toques = uma recusa)
    const { data: mudou } = await supabaseAdmin.from('orcamentos')
      .update({ status: 'recusado', recusado_motivo: motivo, recusado_em: new Date().toISOString() })
      .eq('id', orc.id).in('status', ['enviado', 'visualizado']).select('id');
    if (!mudou?.length) return NextResponse.json({ error: 'Orçamento não está disponível', codigo: 'ORCAMENTO_INDISPONIVEL' }, { status: 409 });
    await cancelarPedidosDatasPendentes({ orcamentoId: orc.id, motivo: 'recusou' }).catch(() => 0);

    // carro na oficina: a oficina precisa fazer o check-out (comportamento de antes, agora no servidor)
    if (sol?.status === 'em_andamento' && of?.profile_id) {
      const n = notifOrcamentoRecusado(of?.profile?.idioma);
      await supabaseAdmin.from('notificacoes').insert({
        profile_id: of.profile_id, tipo: 'orcamento_recusado', titulo: n.titulo, mensagem: n.mensagem,
        dados: { solicitacao_id: sol.id, orcamento_id: orc.id, motivo, textos: emTodasAsLinguas((l) => notifOrcamentoRecusado(l)) },
      });
    }
    const { count } = await supabaseAdmin.from('orcamentos').select('id', { count: 'exact', head: true })
      .eq('solicitacao_id', orc.solicitacao_id).in('status', ['enviado', 'visualizado']);
    return NextResponse.json({ ok: true, outrosAtivos: count ?? 0 });
  } catch (err) {
    console.error('[recusar]', (err as Error).message);
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}
