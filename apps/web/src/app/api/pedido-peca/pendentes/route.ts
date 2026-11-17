import { NextRequest } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { erro, oficinaDaPessoa, pendentesDaOficina, SEM_CACHE } from '@/lib/pecas-confianca';

export const dynamic = 'force-dynamic';

// Lote 3 de pecas (P-7, D-7): pedidos v3 da oficina que ainda pedem retorno ("recebi"/"problema") e
// avaliacao - os que ja bloqueiam e os que ainda estao nos 3 dias (aviso amarelo). Dona e equipe leem.
// Conta real com o global desligado: { bloqueado: false, pedidos: [] } (mesmo com pedido v3 antigo).
export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return erro(401, 'NAO_AUTENTICADO');
    if (!dentroDoLimite(`pendentes-peca-u:${userId}`, 120, 60 * 60 * 1000)) return erro(429, 'MUITAS_TENTATIVAS');
    const of = await oficinaDaPessoa(userId);
    const r = of ? await pendentesDaOficina(of.id) : { bloqueado: false, desde: null, pedidos: [] };
    return Response.json(r, { headers: SEM_CACHE });
  } catch (e) {
    console.error('[pedido-peca/pendentes]', (e as Error).message);
    return erro(500, 'ERRO');
  }
}
