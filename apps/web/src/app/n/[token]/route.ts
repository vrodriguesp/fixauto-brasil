import { NextRequest, NextResponse } from 'next/server';
import { urlNoIdioma } from '@/lib/site-url';

// Link "Nao tenho" dos e-mails de pecas (lote 2, 17/11): bipfix.com/n/<token>?o=<idioma> -> pagina
// sem login no idioma de quem recebe (slug traduzido, sem portugues na URL), com o token em ?k=.
// Fica fora do middleware (matcher). So redireciona, NUNCA valida o token (nao revela se existe):
// quem decide e a API (api/cotacao-peca/nao-tenho-email), e abrir a pagina nao age.
export function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const token = encodeURIComponent(String(params.token || '').slice(0, 64));
  // sem ?o= -> ingles (idiomaDoSite trataria a ausencia como portugues do Brasil)
  const idioma = req.nextUrl.searchParams.get('o') || 'en';
  return NextResponse.redirect(`${urlNoIdioma(idioma, '/peca-nao-tenho')}?k=${token}`, 302);
}
