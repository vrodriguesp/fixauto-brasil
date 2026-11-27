// /.well-known do site (api/app-links): o AASA exclui as variantes de /r/<numero> que o site resolve sem login
// (revisao Fable S2) e o assetlinks continua igual.    cd apps/web && npx tsx scripts/teste-app-links.ts
process.env.APPLE_TEAM_ID = 'TEAM1234';
process.env.ANDROID_SHA256 = 'AA:BB';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/app-links/route';
import { PARAMS_SO_SITE } from '../src/lib/link-curto-params';

let falhas = 0;
const ok = (nome: string, cond: boolean, extra?: unknown) => { if (!cond) { falhas++; console.log('FALHA', nome, extra ?? ''); } else console.log('ok   ', nome); };
async function main() {
  const aasa = await (await GET(new NextRequest('https://bipfix.com/api/app-links?f=aasa'))).json();
  const comp: any[] = aasa.applinks.details[0].components;
  ok('appID com o team', aasa.applinks.details[0].appIDs[0] === 'TEAM1234.com.bipfix.cliente');
  for (const p of ['s', 'k', 'c', 'g', 'p', 'd', 'of', 'l']) ok('AASA exclui /r/* com ?' + p + '=', comp.some((c) => c['/'] === '/r/*' && c.exclude === true && c['?']?.[p] === '?*'));
  ok('exclusoes vem ANTES do /r/* geral (o 1o que casa decide)', comp.findIndex((c) => c.exclude) < comp.findIndex((c) => c['/'] === '/r/*' && !c.exclude));
  ok('/r/* puro e confirmar-email continuam', comp.some((c) => c['/'] === '/r/*' && !c.exclude) && comp.some((c) => c['/'] === '/*/*/confirmar-email*'));
  ok('mesma lista do app', PARAMS_SO_SITE.join(',') === 's,k,c,g,p,d,of,l');
  const al = await (await GET(new NextRequest('https://bipfix.com/api/app-links?f=assetlinks'))).json();
  ok('assetlinks: pacote e impressao', al[0].target.package_name === 'com.bipfix.cliente' && al[0].target.sha256_cert_fingerprints.join(',') === 'AA:BB');
  console.log(falhas ? '\n' + falhas + ' falha(s)' : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
