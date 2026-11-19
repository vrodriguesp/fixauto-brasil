import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ehAdmin } from '@/lib/acesso-servico';
import { pecasShopAtivo } from '@/lib/pecas-lote5';
import { CAMINHO_BANNER } from '@/lib/shop-pagina';

export const dynamic = 'force-dynamic';

// Pecas lote 5 (106): imagem da pagina do Shop (bucket privado). So para quem o Shop vale (interruptor ou conta de
// teste) ou para o admin (previa do editor). Resto: 404 igual, sem revelar se a imagem existe. 302 para URL assinada de 10 min.
export async function GET(req: NextRequest) {
  const caminho = req.nextUrl.searchParams.get('c') || '';
  const nada = () => new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (!CAMINHO_BANNER.test(caminho)) return nada();
  const userId = await getSessionUserId(req);
  if (!userId) return nada();
  if (!(await ehAdmin(userId)) && !(await pecasShopAtivo(userId))) return nada();
  const { data } = await supabaseAdmin.storage.from('shop-pagina').createSignedUrl(caminho, 600);
  if (!data?.signedUrl) return nada();
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store' } });
}
