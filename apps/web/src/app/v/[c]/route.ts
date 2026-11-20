import { NextRequest, NextResponse } from 'next/server';
import { SITE_URL, urlNoIdioma } from '@/lib/site-url';

// Link neutro dos e-mails do portal de pecas (auditoria Fable 16/11, H1): o
// e-mail nao leva nome de pagina em portugues (/loja/..., /oficina/pecas). O
// caminho interno vai codificado (base64url) e so pode ser uma pagina logada
// das pecas; ?o=<idioma> de quem recebe. Fica fora do middleware (matcher).
// So redireciona: a pagina de destino exige o login de quem e parte do pedido.
// 20/11: + caixa de pedidos da oficina (e-mail "oficina aprovada")
const PERMITIDOS = [/^\/loja\/(cotacoes|pedidos|conversa\/[\w-]+)(\?[\w=&%.\-~+!*'()]*)?$/, /^\/oficina\/pecas(\/conversa\/[\w-]+)?(\?[\w=&%.\-~+!*'()]*)?$/, /^\/oficina\/pedidos$/];

export function GET(req: NextRequest, { params }: { params: { c: string } }) {
  let interno = '';
  try { interno = Buffer.from(String(params.c || ''), 'base64url').toString('utf8'); } catch { /* invalido */ }
  if (!PERMITIDOS.some((r) => r.test(interno))) return NextResponse.redirect(SITE_URL, 302);
  return NextResponse.redirect(urlNoIdioma(req.nextUrl.searchParams.get('o'), interno), 302);
}
