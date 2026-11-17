import { NextRequest } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { erro, ok, contatoNoTexto, avaliacaoDoFornecedor } from '@/lib/pecas-confianca';

export const dynamic = 'force-dynamic';

// Lote 3 de pecas (L3.3): resposta publica do fornecedor avaliado, uma vez, sem telefone/e-mail no texto.
// Depois da resposta a autora ja nao edita a avaliacao (FORA_DO_PRAZO).
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return erro(401, 'NAO_AUTENTICADO');
    if (!dentroDoLimite(`resposta-avaliacao-u:${userId}`, 20, 60 * 60 * 1000)) return erro(429, 'MUITAS_TENTATIVAS');
    const corpo = await req.json().catch(() => ({}));
    const r = await avaliacaoDoFornecedor(corpo?.avaliacaoId, userId);
    if ('codigo' in r) return erro(r.status, r.codigo);
    const texto = typeof corpo?.texto === 'string' ? corpo.texto.trim() : '';
    if (!texto || texto.length > 300) return erro(400, 'TEXTO_INVALIDO');
    if (contatoNoTexto(texto)) return erro(400, 'CONTATO_NO_TEXTO');
    if (r.av.resposta) return erro(409, 'JA_RESPONDIDA');
    const agora = new Date().toISOString();
    const { data: mudou, error } = await supabaseAdmin.from('fornecedores_avaliacoes')
      .update({ resposta: texto, resposta_em: agora, atualizado_em: agora })
      .eq('id', r.av.id).is('resposta', null).select('id');
    if (error) return erro(500, 'ERRO');
    if (!mudou?.length) return erro(409, 'JA_RESPONDIDA');
    return ok();
  } catch (e) {
    console.error('[avaliacao-fornecedor/resposta]', (e as Error).message);
    return erro(500, 'ERRO');
  }
}
