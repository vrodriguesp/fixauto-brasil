import { NextRequest, NextResponse } from 'next/server';

// Links do site que abrem o app quando ele esta instalado (iOS Universal
// Links / Android App Links). Servido em /.well-known/... (rewrite no
// next.config.js). So liga quando os identificadores do app existem:
// APPLE_TEAM_ID (conta Apple Developer) e ANDROID_SHA256 (chave de
// assinatura do app na Play Store). Sem eles responde 404 e o link abre o site.
const APP_ID = 'com.bipfix.cliente';
// Caminhos que o app sabe tratar: confirmacao de e-mail em qualquer idioma
const CAMINHOS = ['/*/confirmar-email*'];

export async function GET(req: NextRequest) {
  const qual = req.nextUrl.searchParams.get('f');
  if (qual === 'aasa') {
    const team = process.env.APPLE_TEAM_ID;
    if (!team) return new NextResponse(null, { status: 404 });
    return NextResponse.json({
      applinks: { details: [{ appIDs: [`${team}.${APP_ID}`], components: CAMINHOS.map((p) => ({ '/': p })) }] },
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
