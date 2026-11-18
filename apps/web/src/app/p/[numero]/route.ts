import { NextRequest, NextResponse } from 'next/server';
import { SITE_URL, urlNoIdioma } from '@/lib/site-url';
import { carregarLojaPublica } from '@/lib/loja-publica';
import { segmentoLoja } from '@/lib/loja-publica-regras';

// Link curto neutro da pagina publica da loja (lote 4, 18/11): bipfix.com/p/1004 -> pagina da loja no
// idioma do navegador (et, ru; resto en). Sem nome de pagina em portugues no link (regra do dono).
// Fora do middleware de idioma (matcher). Loja sem pagina (ou numero inexistente) -> inicio do site (302),
// para nao revelar se o numero existe.
export const dynamic = 'force-dynamic';

function idiomaDoNavegador(req: NextRequest): 'et' | 'ru' | 'en' {
  const pedido = req.nextUrl.searchParams.get('l');
  if (pedido === 'et' || pedido === 'ru' || pedido === 'en') return pedido;
  const al = (req.headers.get('accept-language') || '').toLowerCase();
  for (const parte of al.split(',')) {
    const l = parte.trim().slice(0, 2);
    if (l === 'et' || l === 'ru' || l === 'en') return l;
  }
  return 'en';
}

export async function GET(req: NextRequest, { params }: { params: { numero: string } }) {
  const numero = Number(String(params.numero || '').replace(/\D/g, '').slice(0, 12));
  const loja = numero ? await carregarLojaPublica(numero) : null;
  if (!loja) return NextResponse.redirect(SITE_URL, 302);
  return NextResponse.redirect(urlNoIdioma(idiomaDoNavegador(req), `/lojas/${segmentoLoja(loja.nome_fantasia, loja.numero)}`), 307);
}
