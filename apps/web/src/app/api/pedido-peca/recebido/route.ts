import { NextRequest } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { carregarPedido, ladoDe, erro, ok, fornecedorDe, mesmoTipoConta, sino, linkFornecedor, lancarComissaoSeFalta, peca, JANELA_CONTATO_MS, P7_DIAS, DIA_MS } from '@/lib/pecas-confianca';
import { notifRecebido } from '@/lib/pecas-confianca-textos';

export const dynamic = 'force-dynamic';

// Lote 3 de pecas (L3.1): a DONA da oficina compradora confirma que recebeu a peca de um pedido v3.
// Idempotente. Grava recebido_em, entregue_em (se o fornecedor ainda nao marcou), status entregue e a
// janela do contato (recebido + 30 dias, P-13); lanca a comissao como o "marcar entregue" (1 vez).
// Depois disso falta a avaliacao (D-7: obrigatoria).
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return erro(401, 'NAO_AUTENTICADO');
    if (!dentroDoLimite(`recebido-peca-u:${userId}`, 30, 60 * 60 * 1000)) return erro(429, 'MUITAS_TENTATIVAS');
    const corpo = await req.json().catch(() => ({}));
    const p = await carregarPedido(corpo?.pedidoId);
    if (!p) return erro(404, 'NAO_ENCONTRADO');
    if (ladoDe(p, userId) !== 'compradora') return erro(403, 'ACESSO_NEGADO');
    if (p.v3 !== true) return erro(409, 'NAO_V3');
    if (p.status === 'cancelado') return erro(409, 'CANCELADO');
    const prazo = (desde: string) => new Date(Date.parse(desde) + P7_DIAS * DIA_MS).toISOString();
    if (p.recebido_em) return ok({ avaliarAte: prazo(p.recebido_em) });

    const agora = new Date();
    const agoraIso = agora.toISOString();
    const { data: mudou, error } = await supabaseAdmin.from('pedidos_pecas')
      .update({ recebido_em: agoraIso, entregue_em: p.entregue_em || agoraIso, status: 'entregue', contato_visivel_ate: new Date(agora.getTime() + JANELA_CONTATO_MS).toISOString() })
      .eq('id', p.id).is('recebido_em', null).neq('status', 'cancelado')
      .select('id');
    if (error) return erro(500, 'ERRO');
    if (!mudou?.length) {
      const atual = await carregarPedido(p.id);
      if (atual?.recebido_em) return ok({ avaliarAte: prazo(atual.recebido_em) });
      return erro(409, 'CANCELADO');
    }
    await lancarComissaoSeFalta(p).catch((e) => console.error('[pedido-peca/recebido] comissao:', (e as Error).message));

    const forn = fornecedorDe(p);
    if (forn?.profile_id && mesmoTipoConta(forn.profile || null, p.compradora?.profile || null)) {
      const nome = p.compradora?.nome_fantasia || '-';
      await sino(forn.profile_id, forn.profile?.idioma, 'pedido_peca_recebido', (l) => notifRecebido(l, nome, peca(p)),
        { pedido_id: p.id, cotacao_id: p.cotacao_id, link: linkFornecedor(p.fornecedor_tipo) });
    }
    return ok({ avaliarAte: prazo(agoraIso) });
  } catch (e) {
    console.error('[pedido-peca/recebido]', (e as Error).message);
    return erro(500, 'ERRO');
  }
}
