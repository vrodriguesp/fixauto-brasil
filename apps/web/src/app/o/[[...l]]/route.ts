import { NextRequest, NextResponse } from 'next/server';
import { urlNoIdioma } from '@/lib/site-url';

// Link curto do SMS para a OFICINA (dono 19/11: "make it go straight to pedidos", poupar caracteres):
// bipfix.com/o/ru -> lista de pedidos da oficina no idioma pedido (et, ru, en). Sem idioma (/o) -> idioma
// do navegador (et, ru; resto en). Sem nome de pagina em portugues no link (regra do dono).
// Fora do middleware de idioma (matcher). So redireciona: a lista exige o login da propria oficina
// (sem login, o site leva ao login e volta para a lista).
function idioma(req: NextRequest, segmento?: string): 'et' | 'ru' | 'en' {
  const pedido = (segmento || '').toLowerCase();
  if (pedido === 'et' || pedido === 'ru' || pedido === 'en') return pedido;
  const al = (req.headers.get('accept-language') || '').toLowerCase();
  for (const parte of al.split(',')) {
    const l = parte.trim().slice(0, 2);
    if (l === 'et' || l === 'ru' || l === 'en') return l;
  }
  return 'en';
}

export function GET(req: NextRequest, { params }: { params: { l?: string[] } }) {
  return NextResponse.redirect(urlNoIdioma(idioma(req, params.l?.[0]), '/oficina/pedidos'), 302);
}
