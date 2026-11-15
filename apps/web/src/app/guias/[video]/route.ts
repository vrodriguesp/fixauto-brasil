import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/site-url';
import { VIDEO_GUIA_OFICINA, type IdiomaGuia } from '@/lib/guias-oficina';

// Link FIXO do video-guia da oficina (15/11): bipfix.com/guias/video-oficina-et e -ru -> 302 para o video
// mais recente do idioma (VIDEO_GUIA_OFICINA em lib/guias-oficina.ts). Vai no PDF impresso/enviado e no
// QR da 1a pagina: video novo no YouTube = trocar so o link na lib, o PDF continua certo.
// Fora do middleware de idioma (matcher: "guias/video-oficina-"), sem login. Os PDFs (public/guias/*.pdf)
// sao arquivos estaticos e nao passam por aqui. So redireciona: noindex como resposta, sem cache longo.
export const dynamic = 'force-dynamic';

const NOME = /^video-oficina-([a-z]{2}(?:-[a-z]{2})?)$/i;

export function GET(_req: Request, { params }: { params: { video: string } }) {
  const m = NOME.exec(String(params.video || ''));
  // outro nome (ex.: um PDF de /guias que nao existe, /guias/perfil-oficina-en.pdf) continua 404 como antes
  // desta rota; so video-oficina-<idioma sem video> vai para a home
  if (!m) return new NextResponse('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' } });
  const idioma = (m?.[1] || '').toLowerCase().replace('pt-pt', 'pt-PT') as IdiomaGuia;
  const destino = (m && VIDEO_GUIA_OFICINA[idioma]) || SITE_URL;
  const res = NextResponse.redirect(destino, 302);
  res.headers.set('X-Robots-Tag', 'noindex');
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
