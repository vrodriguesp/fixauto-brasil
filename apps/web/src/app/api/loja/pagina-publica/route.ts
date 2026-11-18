import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { estadoPaginaDaLoja } from '@/lib/loja-publica';
import { hrefNoIdioma } from '@/i18n/routing';
import { ehLocaleLoja } from '@/lib/loja-publica-regras';

export const dynamic = 'force-dynamic';

// Pecas lote 4 (18/11): estado da pagina publica da loja logada, para o perfil (/loja/perfil):
// liberada (interruptor proprio OU conta de teste, e loja da Estonia), existe, indexavel, o que falta
// para ir ao Google e o endereco no idioma pedido (?l=). So a dona da loja (profile_id da sessao).
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'NAO_AUTENTICADO' }, { status: 401 });
  const e = await estadoPaginaDaLoja(userId);
  if (!e) return NextResponse.json({ error: 'SEM_LOJA' }, { status: 404 });
  const l = req.nextUrl.searchParams.get('l') || 'et';
  const url = e.segmento ? hrefNoIdioma(ehLocaleLoja(l) ? l : 'et', `/lojas/${e.segmento}`) : null;
  return NextResponse.json({ ...e, url }, { headers: { 'Cache-Control': 'no-store' } });
}
