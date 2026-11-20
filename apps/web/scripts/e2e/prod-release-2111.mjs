// Producao, release 21/11 (so leitura, NADA e enviado): percorre o pedido real no celular (ET e RU) ate o
// passo do local e confere o texto da placa, o texto novo do local e as sugestoes sem pais/maakond.
// Nao clica em "Saada": nenhum pedido, e-mail ou SMS. /api/funil e respondido aqui (contador nao sobe).
//   node prod-release-2111.mjs
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const pw = createRequire(import.meta.url)('playwright-core');
const SITE = 'https://bipfix.com';
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/prod-2111';
fs.mkdirSync(OUT, { recursive: true });
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const MSG = new URL('../../messages/', import.meta.url);
const ler = (l) => Object.assign({}, ...['', '.cliente'].map((a) => JSON.parse(fs.readFileSync(new URL(`${l}${a}.json`, MSG), 'utf8'))));
const M = { et: ler('et'), ru: ler('ru') };
const CAMINHO = { et: '/ee/et/paring', ru: '/ee/ru/zayavka' };
const browser = await pw.chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const edasi = (p, passo) => p.getByTestId(`passo-${passo}`).getByTestId('edasi');
const sugestoes = async (p, texto) => {
  const campo = p.locator('#pedido-endereco');
  await campo.fill(''); await campo.fill(texto);
  await p.waitForTimeout(2500);
  return (await p.getByRole('option').allInnerTexts().catch(() => [])).map((s) => s.trim());
};
const soPaisOuMaakond = (s) => /^(estonia|eesti|эстония|harju (county|maakond)|harju maakond, (estonia|eesti)|harjumaa)(, (estonia|eesti))?$/i.test(s);

for (const l of ['et', 'ru']) {
  const ps = M[l].pedidoSemConta;
  const nome = `prod ${l} 390x844`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: l === 'et' ? 'et-EE' : 'ru-RU' });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await ctx.route('**/api/funil', (r) => r.fulfill({ status: 200, body: '{"ok":true}' }));
  await ctx.route(/googletagmanager|google-analytics|facebook\.net|doubleclick|clarity\.ms/, (r) => r.abort());
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  const r5xx = []; p.on('response', (r) => { if (r.url().startsWith(SITE) && r.status() >= 500) r5xx.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await p.goto(SITE + CAMINHO[l] + '?utm_source=teste_claude', { waitUntil: 'networkidle' });
  await p.getByTestId('passo-servico').locator('button').nth(3).click();
  await p.getByTestId('passo-detalhe').waitFor();
  await p.locator('#pedido-descricao').fill(l === 'et' ? 'TEST - ära vasta' : 'ТЕСТ - не отвечать');
  await edasi(p, 'detalhe').click(); await p.getByTestId('passo-fotos').waitFor();
  await edasi(p, 'fotos').click(); await p.getByTestId('passo-carro').waitFor({ state: 'visible' });
  const placa = (await p.locator('#pedido-placa-ajuda').innerText().catch(() => '')).trim();
  ok(`${nome}: texto da placa no passo do carro`, placa === ps.placaAjuda, placa);
  await p.screenshot({ path: path.join(OUT, `${l}_4_carro.png`) });
  for (const [id, v] of [['cbbe3-101', 'Toyota'], ['cbbe3-102', 'Corolla']]) {
    const el = p.locator('#' + id); await el.click(); await el.fill(v.slice(0, 4));
    const op = p.getByTestId(id + '-lista').getByRole('option', { name: new RegExp(v) }); await op.first().waitFor({ timeout: 20000 }); await op.first().click();
  }
  await edasi(p, 'carro').click(); await p.getByTestId('passo-local').waitFor();
  const ajuda = (await p.getByTestId('local-claro').innerText()).trim();
  ok(`${nome}: texto novo do local ("um so lugar")`, ajuda === ps.localAjuda, ajuda);
  const sEesti = await sugestoes(p, l === 'et' ? 'eesti' : 'Эстония');
  ok(`${nome}: sugestoes de "${l === 'et' ? 'eesti' : 'Эстония'}" sem o pais sozinho`, !sEesti.some(soPaisOuMaakond), JSON.stringify(sEesti));
  const sHarju = await sugestoes(p, 'harjumaa');
  ok(`${nome}: sugestoes de "harjumaa" sem o maakond sozinho`, !sHarju.some(soPaisOuMaakond), JSON.stringify(sHarju));
  const sRae = await sugestoes(p, 'Rae vald');
  ok(`${nome}: "Rae vald" continua sugerido (vald vale)`, sRae.some((s) => /Rae vald/i.test(s)), JSON.stringify(sRae));
  const sRak = await sugestoes(p, 'Rakvere');
  ok(`${nome}: "Rakvere" continua sugerido (cidade vale)`, sRak.some((s) => /^Rakvere/i.test(s)), JSON.stringify(sRak));
  await p.screenshot({ path: path.join(OUT, `${l}_5_local.png`) });
  ok(`${nome}: sem erro de JavaScript`, !erros.length, erros.join(' | '));
  ok(`${nome}: sem resposta 5xx`, !r5xx.length, r5xx.join(' '));
  await ctx.close();
}
await browser.close();
console.log(`\n${falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S)`}`);
process.exit(falhas ? 1 : 0);
