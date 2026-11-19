import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { buscarShop, oficinaDaDona, pecasShopAtivo } from '@/lib/pecas-lote5';

export const dynamic = 'force-dynamic';
const SEM_CACHE = { 'Cache-Control': 'no-store' };

// Pecas lote 5 (20/11): busca do Shop (so a dona de oficina ativa; Shop E v3 globais ligados, ou conta de teste).
// ?estado=1 so responde se o Shop vale para a sessao (link "Shop" na aba Pecas). Desligado: 404 (nada revela).
// Itens e promocoes do MESMO pais e tipo de conta; sem telefone/e-mail/registro da loja.
export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401, headers: SEM_CACHE });
    const ativo = await pecasShopAtivo(userId);
    const of = ativo ? await oficinaDaDona(userId) : null;
    if (req.nextUrl.searchParams.get('estado') === '1') return NextResponse.json({ ativo: !!of }, { headers: SEM_CACHE });
    if (!of) return NextResponse.json({ error: 'Não encontrado' }, { status: 404, headers: SEM_CACHE });
    if (!dentroDoLimite(`shop-u:${userId}`, 300, 60 * 60 * 1000)) return NextResponse.json({ error: 'Muitas requisições' }, { status: 429, headers: SEM_CACHE });
    const q = (req.nextUrl.searchParams.get('q') || '').slice(0, 80);
    const soPromocoes = req.nextUrl.searchParams.get('promocoes') === '1';
    const resultados = await buscarShop({ pais: of.pais, teste: of.teste, q, soPromocoes });
    return NextResponse.json({ resultados }, { headers: SEM_CACHE });
  } catch (err) {
    console.error('[pecas/shop]', (err as Error).message);
    return NextResponse.json({ error: 'Erro' }, { status: 500, headers: SEM_CACHE });
  }
}
