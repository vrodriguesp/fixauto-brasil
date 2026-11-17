import { NextRequest } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { carregarPedido, ladoDe, erro, ok, fornecedorDe, mesmoTipoConta, sino, emailL3, linkFornecedor, linkPedidoCompradora, peca, MOTIVOS_COMPRADORA, MOTIVOS_FORNECEDOR } from '@/lib/pecas-confianca';
import { notifCancelado, motivoNoIdioma, QUEM_SEM_NOME } from '@/lib/pecas-confianca-textos';
import { resolveEmailLocale } from '@/lib/email-i18n';

export const dynamic = 'force-dynamic';

// Lote 3 de pecas (L3.2): cancelamento com motivo de um pedido v3 ainda CONFIRMADO, pelo dono de uma
// das partes (equipe nao - D-6). Motivos por lado; o do fornecedor conta contra ele (exceto "a compradora
// pediu"); o da compradora nao afeta a nota de ninguem (D-10). Fecha o contato na hora (P-13) e avisa
// a outra parte (sino + e-mail), com paridade teste x real.
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return erro(401, 'NAO_AUTENTICADO');
    if (!dentroDoLimite(`cancelar-peca-u:${userId}`, 20, 60 * 60 * 1000)) return erro(429, 'MUITAS_TENTATIVAS');
    const corpo = await req.json().catch(() => ({}));
    const p = await carregarPedido(corpo?.pedidoId);
    if (!p) return erro(404, 'NAO_ENCONTRADO');
    const lado = ladoDe(p, userId);
    if (!lado) return erro(403, 'ACESSO_NEGADO');
    if (p.v3 !== true) return erro(409, 'NAO_V3');
    const motivo = corpo?.motivo;
    const permitidos: readonly string[] = lado === 'compradora' ? MOTIVOS_COMPRADORA : MOTIVOS_FORNECEDOR;
    if (!permitidos.includes(motivo)) return erro(400, 'MOTIVO_INVALIDO');
    const texto = typeof corpo?.texto === 'string' ? corpo.texto.trim() : '';
    if (texto.length > 200) return erro(400, 'TEXTO_LONGO');
    if (p.status === 'entregue') return erro(409, 'JA_ENTREGUE');
    if (p.status === 'cancelado') return erro(409, 'CANCELADO');

    const agora = new Date().toISOString();
    const { data: mudou, error } = await supabaseAdmin.from('pedidos_pecas')
      .update({ status: 'cancelado', cancelado_por: lado, cancelado_motivo: motivo, cancelado_texto: texto || null, cancelado_em: agora, contato_visivel_ate: agora })
      .eq('id', p.id).eq('status', 'confirmado').select('id');
    if (error) return erro(500, 'ERRO');
    if (!mudou?.length) {
      const atual = await carregarPedido(p.id);
      return erro(409, atual?.status === 'entregue' ? 'JA_ENTREGUE' : 'CANCELADO');
    }

    const forn = fornecedorDe(p);
    if (mesmoTipoConta(forn?.profile || null, p.compradora?.profile || null)) {
      if (lado === 'compradora' && forn?.profile_id) {
        const link = linkFornecedor(p.fornecedor_tipo);
        const quem = p.compradora?.nome_fantasia || QUEM_SEM_NOME[resolveEmailLocale(forn.profile?.idioma)].compradora;
        await sino(forn.profile_id, forn.profile?.idioma, 'pedido_peca_cancelado', (l) => notifCancelado(l, quem, peca(p), motivo), { pedido_id: p.id, cotacao_id: p.cotacao_id, link });
        await emailL3({ tipo: 'cancelado', para: forn.profile?.email, nome: forn.profile?.nome || forn.nome_fantasia, idioma: forn.profile?.idioma, vars: { quem, peca: peca(p), motivo: motivoNoIdioma(forn.profile?.idioma, motivo) }, linkInterno: link });
      } else if (lado === 'fornecedor' && p.compradora?.profile_id) {
        const c = p.compradora;
        const link = linkPedidoCompradora(p.id);
        const quem = forn?.nome_fantasia || QUEM_SEM_NOME[resolveEmailLocale(c.profile?.idioma)].fornecedor;
        // D-8: cancelamento e um dos avisos no navegador da oficina
        await sino(c.profile_id, c.profile?.idioma, 'pedido_peca_cancelado', (l) => notifCancelado(l, quem, peca(p), motivo), { pedido_id: p.id, cotacao_id: p.cotacao_id, link }, { link });
        await emailL3({ tipo: 'cancelado', para: c.profile?.email, nome: c.profile?.nome || c.nome_fantasia, idioma: c.profile?.idioma, vars: { quem, peca: peca(p), motivo: motivoNoIdioma(c.profile?.idioma, motivo) }, linkInterno: link });
      }
    }
    return ok({ status: 'cancelado' });
  } catch (e) {
    console.error('[pedido-peca/cancelar]', (e as Error).message);
    return erro(500, 'ERRO');
  }
}
