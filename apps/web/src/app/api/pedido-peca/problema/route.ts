import { NextRequest } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { carregarPedido, ladoDe, erro, ok, fornecedorDe, mesmoTipoConta, sino, sinoAdmins, emailL3, linkFornecedor, peca, PROBLEMAS } from '@/lib/pecas-confianca';
import { notifProblema, problemaNoIdioma } from '@/lib/pecas-confianca-textos';

export const dynamic = 'force-dynamic';

// Lote 3 de pecas (L3.1/L3.4): a DONA da compradora informa um problema num pedido v3 ainda sem
// "recebi". "Nao entregou" (D-4) cancela o pedido POR ELA com o motivo nao_entregou, que conta contra o
// fornecedor; os outros problemas nao mudam o status. Aviso ao fornecedor (sino + e-mail) e aos admins.
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return erro(401, 'NAO_AUTENTICADO');
    if (!dentroDoLimite(`problema-peca-u:${userId}`, 20, 60 * 60 * 1000)) return erro(429, 'MUITAS_TENTATIVAS');
    const corpo = await req.json().catch(() => ({}));
    const p = await carregarPedido(corpo?.pedidoId);
    if (!p) return erro(404, 'NAO_ENCONTRADO');
    if (ladoDe(p, userId) !== 'compradora') return erro(403, 'ACESSO_NEGADO');
    if (p.v3 !== true) return erro(409, 'NAO_V3');
    const problema = corpo?.problema;
    if (!(PROBLEMAS as readonly string[]).includes(problema)) return erro(400, 'PROBLEMA_INVALIDO');
    const texto = typeof corpo?.texto === 'string' ? corpo.texto.trim() : '';
    if (texto.length > 300) return erro(400, 'TEXTO_LONGO');
    if (p.status === 'cancelado') return erro(409, 'CANCELADO');
    if (p.recebido_em) return erro(409, 'JA_RECEBIDO');
    if (p.problema) return erro(409, 'JA_INFORMADO');

    const agora = new Date().toISOString();
    const campos = problema === 'nao_entregou'
      ? { status: 'cancelado', cancelado_por: 'compradora', cancelado_motivo: 'nao_entregou', cancelado_em: agora, problema, problema_em: agora, problema_texto: texto || null, contato_visivel_ate: agora }
      : { problema, problema_em: agora, problema_texto: texto || null };
    const { data: mudou, error } = await supabaseAdmin.from('pedidos_pecas').update(campos)
      .eq('id', p.id).is('problema', null).is('recebido_em', null).neq('status', 'cancelado').select('id');
    if (error) return erro(500, 'ERRO');
    if (!mudou?.length) return erro(409, 'JA_INFORMADO');

    const nome = p.compradora?.nome_fantasia || '-';
    const forn = fornecedorDe(p);
    if (forn?.profile_id && mesmoTipoConta(forn.profile || null, p.compradora?.profile || null)) {
      const link = linkFornecedor(p.fornecedor_tipo);
      await sino(forn.profile_id, forn.profile?.idioma, 'pedido_peca_problema', (l) => notifProblema(l, nome, peca(p), problema),
        { pedido_id: p.id, cotacao_id: p.cotacao_id, link }, { link });
      await emailL3({ tipo: 'problema', para: forn.profile?.email, nome: forn.profile?.nome || forn.nome_fantasia, idioma: forn.profile?.idioma,
        vars: { oficina: nome, peca: peca(p), problema: problemaNoIdioma(forn.profile?.idioma, problema), texto }, linkInterno: link, extra: !!texto });
    }
    // D-4: o admin tambem fica sabendo (decide a partir de 3 casos em 90 dias; sem suspensao automatica)
    const a = notifProblema('pt', nome, peca(p), problema);
    await sinoAdmins('pedido_peca_problema', a.titulo, `${a.mensagem} (${forn?.nome_fantasia || '-'})`, { pedido_id: p.id, cotacao_id: p.cotacao_id });
    return ok({ status: problema === 'nao_entregou' ? 'cancelado' : p.status });
  } catch (e) {
    console.error('[pedido-peca/problema]', (e as Error).message);
    return erro(500, 'ERRO');
  }
}
