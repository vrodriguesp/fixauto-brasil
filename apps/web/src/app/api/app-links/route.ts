import { NextRequest, NextResponse } from 'next/server';
import { PARAMS_SO_SITE } from '@/lib/link-curto-params';

// Links do site que abrem o app quando ele esta instalado (iOS Universal
// Links / Android App Links). Servido em /.well-known/... (rewrite no
// next.config.js). So liga quando os identificadores do app existem:
// APPLE_TEAM_ID (conta Apple Developer) e ANDROID_SHA256 (chave de
// assinatura do app na Play Store). Sem eles responde 404 e o link abre o site.
const APP_ID = 'com.bipfix.cliente';
// Caminhos que o app sabe tratar: confirmacao de e-mail em qualquer versao
// (/ee/et/confirmar-email) e no formato antigo de um nivel (/et/confirmar-email) e, desde 27/11 (app da
// oficina, versao 1.1.0), o link curto do SMS/e-mail /r/<numero> (app/r/[numero].tsx: oficina -> orcamento,
// motorista -> pedido). Quem nao tem o app continua caindo no site.
const CAMINHOS = ['/*/*/confirmar-email*', '/*/confirmar-email*', '/r/*'];

export async function GET(req: NextRequest) {
  // No rewrite de /.well-known/... o route handler recebe a URL ORIGINAL (sem o ?f= do destino do
  // next.config.js) - visto em producao 28/11: /.well-known/* dava 404. Entao decide tambem pelo caminho.
  const caminho = req.nextUrl.pathname;
  const qual = req.nextUrl.searchParams.get('f')
    ?? (caminho.endsWith('/apple-app-site-association') ? 'aasa' : caminho.endsWith('/assetlinks.json') ? 'assetlinks' : null);
  if (qual === 'aasa') {
    const team = process.env.APPLE_TEAM_ID;
    if (!team) return new NextResponse(null, { status: 404 });
    // /r/* com as variantes que o site resolve sem login (parar lembretes, acesso por token, chat, novas datas,
    // "nao tenho interesse") fica FORA do app (exclude) - o app so trata o link puro ou com ?o=; no Android o
    // filtro nao sabe ler a query e o app abre essas variantes no navegador (app/r/[numero].tsx)
    const excluidos = PARAMS_SO_SITE.map((p) => ({ '/': '/r/*', '?': { [p]: '?*' }, exclude: true }));
    return NextResponse.json({
      applinks: { details: [{ appIDs: [`${team}.${APP_ID}`], components: [...excluidos, ...CAMINHOS.map((p) => ({ '/': p }))] }] },
    });
  }
  if (qual === 'assetlinks') {
    const sha = process.env.ANDROID_SHA256;
    if (!sha) return new NextResponse(null, { status: 404 });
    return NextResponse.json([{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: APP_ID, sha256_cert_fingerprints: sha.split(',').map((s) => s.trim()) },
    }]);
  }
  return new NextResponse(null, { status: 404 });
}
