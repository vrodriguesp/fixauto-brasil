import { NextRequest } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { carregarPedido, ladoDe, erro, ok, contaContraFornecedor, pedidoMesmoRegistro, mesmoTipoConta, sino, emailL3, peca, UUID } from '@/lib/pecas-confianca';
import { notifReaberta } from '@/lib/pecas-confianca-textos';

export const dynamic = 'force-dynamic';

// Lote 3 de pecas (D-5): depois de um cancelamento (ou "nao entregou") a DONA da compradora escolhe, UMA
// vez: reabrir a cotacao para as outras ofertas (so se nao venceu) ou pedir de novo (nova cotacao
// pre-preenchida). Quando o cancelamento conta contra o fornecedor, so depois de avaliar (D-7).
//  - reabrir: cotacao fechada -> respondida (aberta se nao sobrou oferta); a oferta de quem falhou nao
//    pode ser escolhida de novo (confirmar -> OFERTA_CANCELADA); aviso "confirme sua oferta" aos outros.
//  - nova_cotacao: sem novaCotacaoId so devolve a cotacao de origem (a tela pre-preenche); com
//    novaCotacaoId (a cotacao que o navegador acabou de criar) grava a escolha.
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return erro(401, 'NAO_AUTENTICADO');
    if (!dentroDoLimite(`depois-peca-u:${userId}`, 20, 60 * 60 * 1000)) return erro(429, 'MUITAS_TENTATIVAS');
    const corpo = await req.json().catch(() => ({}));
    const p = await carregarPedido(corpo?.pedidoId);
    if (!p) return erro(404, 'NAO_ENCONTRADO');
    if (ladoDe(p, userId) !== 'compradora') return erro(403, 'ACESSO_NEGADO');
    if (p.v3 !== true) return erro(409, 'NAO_V3');
    const escolha = corpo?.escolha;
    if (escolha !== 'reabrir' && escolha !== 'nova_cotacao') return erro(400, 'ESCOLHA_INVALIDA');
    if (p.status !== 'cancelado') return erro(409, 'NAO_CANCELADO');
    if (p.pos_cancelamento) return erro(409, 'JA_ESCOLHIDO');
    if (contaContraFornecedor(p) && !pedidoMesmoRegistro(p)) {
      const { data: av } = await supabaseAdmin.from('fornecedores_avaliacoes').select('id').eq('pedido_id', p.id).limit(1);
      if (!av?.length) return erro(409, 'AVALIACAO_PENDENTE');
    }

    if (escolha === 'nova_cotacao') {
      const nova = corpo?.novaCotacaoId;
      if (nova === undefined || nova === null) return ok({ cotacaoId: p.cotacao_id });
      if (typeof nova !== 'string' || !UUID.test(nova) || nova === p.cotacao_id) return erro(400, 'COTACAO_INVALIDA');
      const { data: cot } = await supabaseAdmin.from('cotacoes_pecas').select('id, oficina_id').eq('id', nova).maybeSingle();
      if (!cot || cot.oficina_id !== p.oficina_id) return erro(400, 'COTACAO_INVALIDA');
      const { data: mudou } = await supabaseAdmin.from('pedidos_pecas').update({ pos_cancelamento: 'nova_cotacao', nova_cotacao_id: nova })
        .eq('id', p.id).is('pos_cancelamento', null).select('id');
      if (!mudou?.length) return erro(409, 'JA_ESCOLHIDO');
      return ok({ cotacaoId: nova });
    }

    // ---- reabrir ----
    const cot = p.cotacao;
    if (!cot) return erro(404, 'NAO_ENCONTRADO');
    if (['expirada', 'cancelada'].includes(String(cot.status)) || (cot.expira_em && Date.parse(cot.expira_em) <= Date.now())) return erro(409, 'VENCIDA');
    const { data: pedidosCot } = await supabaseAdmin.from('pedidos_pecas').select('id, status, resposta_id').eq('cotacao_id', cot.id);
    if (((pedidosCot as any[]) || []).some((x) => x.status !== 'cancelado')) return erro(409, 'COTACAO_COM_PEDIDO');
    // ofertas que ainda podem ser escolhidas: sem pedido cancelado nesta cotacao
    const falharam = new Set(((pedidosCot as any[]) || []).map((x) => x.resposta_id));
    const { data: respostas } = await supabaseAdmin.from('cotacoes_pecas_respostas')
      .select('id, fornecedor_tipo, loja:lojas_pecas(profile_id, nome_fantasia, profile:profiles(email, nome, idioma, conta_teste)), oficina_fornecedora:oficinas!cotacoes_pecas_respostas_oficina_fornecedora_id_fkey(profile_id, nome_fantasia, profile:profiles!oficinas_profile_id_fkey(email, nome, idioma, conta_teste))')
      .eq('cotacao_id', cot.id);
    const outras = ((respostas as any[]) || []).filter((r) => !falharam.has(r.id));
    if (['fechada'].includes(String(cot.status))) {
      const { data: aberta } = await supabaseAdmin.from('cotacoes_pecas').update({ status: outras.length ? 'respondida' : 'aberta' })
        .eq('id', cot.id).eq('status', 'fechada').select('id');
      if (!aberta?.length) return erro(409, 'COTACAO_COM_PEDIDO');
    }
    const { data: mudou } = await supabaseAdmin.from('pedidos_pecas').update({ pos_cancelamento: 'reaberta' })
      .eq('id', p.id).is('pos_cancelamento', null).select('id');
    if (!mudou?.length) return erro(409, 'JA_ESCOLHIDO');

    // "voltou a abrir - confirme sua oferta" a quem tem oferta (nunca a quem falhou), com paridade
    const avisados = new Set<string>();
    for (const r of outras) {
      const f = r.fornecedor_tipo === 'loja' ? r.loja : r.oficina_fornecedora;
      if (!f?.profile_id || avisados.has(f.profile_id) || !mesmoTipoConta(f.profile, p.compradora?.profile || null)) continue;
      avisados.add(f.profile_id);
      const link = r.fornecedor_tipo === 'loja' ? '/loja/cotacoes' : '/oficina/pecas?aba=vender';
      await sino(f.profile_id, f.profile?.idioma, 'cotacao_peca_reaberta_cancelamento', (l) => notifReaberta(l, peca(p)), { cotacao_id: cot.id, pedido_id: p.id, link });
      await emailL3({ tipo: 'reaberta', para: f.profile?.email, nome: f.profile?.nome || f.nome_fantasia, idioma: f.profile?.idioma, vars: { peca: peca(p) }, linkInterno: link });
    }
    return ok({ cotacaoId: cot.id, avisados: avisados.size });
  } catch (e) {
    console.error('[pedido-peca/depois-do-cancelamento]', (e as Error).message);
    return erro(500, 'ERRO');
  }
}
