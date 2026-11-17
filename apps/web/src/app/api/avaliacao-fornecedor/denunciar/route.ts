import { NextRequest } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { erro, ok, avaliacaoDoFornecedor, sinoAdmins } from '@/lib/pecas-confianca';
import { notifDenuncia } from '@/lib/pecas-confianca-textos';

export const dynamic = 'force-dynamic';

// Lote 3 de pecas (L3.3): o fornecedor avaliado pede revisao de uma avaliacao. So marca denunciada_em e
// avisa o admin, que decide ocultar (com motivo) em /admin/pecas; a avaliacao NAO some sozinha.
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return erro(401, 'NAO_AUTENTICADO');
    if (!dentroDoLimite(`denunciar-avaliacao-u:${userId}`, 10, 60 * 60 * 1000)) return erro(429, 'MUITAS_TENTATIVAS');
    const corpo = await req.json().catch(() => ({}));
    const r = await avaliacaoDoFornecedor(corpo?.avaliacaoId, userId);
    if ('codigo' in r) return erro(r.status, r.codigo);
    const motivo = typeof corpo?.motivo === 'string' ? corpo.motivo.trim() : '';
    if (motivo.length > 300) return erro(400, 'TEXTO_LONGO');
    const agora = new Date().toISOString();
    const { error } = await supabaseAdmin.from('fornecedores_avaliacoes').update({ denunciada_em: agora, denuncia_motivo: motivo || null, atualizado_em: agora }).eq('id', r.av.id);
    if (error) return erro(500, 'ERRO');
    const { data: ped } = await supabaseAdmin.from('pedidos_pecas').select('cotacao:cotacoes_pecas!pedidos_pecas_cotacao_id_fkey(peca_descricao)').eq('id', r.av.pedido_id).maybeSingle();
    const n = notifDenuncia(String((ped as any)?.cotacao?.peca_descricao || '-'));
    await sinoAdmins('avaliacao_fornecedor_denunciada', n.titulo, motivo ? `${n.mensagem}: ${motivo}` : n.mensagem, { pedido_id: r.av.pedido_id, avaliacao_id: r.av.id, link: '/admin/pecas' });
    return ok();
  } catch (e) {
    console.error('[avaliacao-fornecedor/denunciar]', (e as Error).message);
    return erro(500, 'ERRO');
  }
}
