// /pedido no celular (dono 10/11, emulador Android + video do Moto E13):
// camera e galeria em botoes separados, fotos e texto voltam se a pagina recarregar,
// Tagasi/Edasi sempre na tela, passo restaurado nao conta de novo no funil e a
// localizacao so e pedida no passo do endereco (nunca ao abrir a pagina).
//   node scripts/e2e/pedido-fotos-celular.mjs ../../.env.local
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const env = Object.fromEntries(fs.readFileSync(process.argv[2] || '.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = 'http://localhost:3100';
const CHROME = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let falhas = 0;
const ok = (nome, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}${extra !== '' ? ' - ' + extra : ''}`); if (!cond) falhas++; };

const br = await chromium.launch({ executablePath: CHROME });
const ctx = await br.newContext({ viewport: { width: 393, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'et-EE' });
// conta os pedidos de localizacao feitos pela pagina (sem permissao concedida: so o pedido importa)
await ctx.addInitScript(() => {
  window.__geo = 0;
  const g = navigator.geolocation;
  if (g) { const orig = g.getCurrentPosition.bind(g); g.getCurrentPosition = (...a) => { window.__geo++; return orig(...a); }; }
  try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {}
});
const funil = [];
await ctx.route('**/api/funil', async (r) => { try { funil.push(JSON.parse(r.request().postData() || '{}').etapa); } catch {} await r.fulfill({ status: 200, body: '{"ok":true}' }); });
const p = await ctx.newPage();
const erros = []; p.on('pageerror', (e) => erros.push(e.message));

await p.goto(`${SITE}/ee/et/paring`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
ok('abrir a pagina nao pede localizacao', await p.evaluate(() => window.__geo) === 0, await p.evaluate(() => window.__geo));

await p.getByRole('button', { name: /Kere- ja/ }).first().tap();
await p.getByTestId('passo-detalhe').waitFor();
await p.locator('#pedido-descricao').fill('Kriimustus esiuksel');
const camera = p.getByTestId('foto-camera'), galeria = p.getByTestId('foto-galeria');
ok('botao camera e botao galeria', await camera.isVisible() && await galeria.isVisible());
ok('campo da camera abre a camera (capture) e aceita 1 foto', await p.locator('input[type=file][capture=environment]:not([multiple])').count() === 1);
ok('campo da galeria aceita varias fotos', await p.locator('input[type=file][multiple]:not([capture])').count() === 1);
ok('linha de ajuda da permissao', (await p.getByTestId('passo-detalhe').innerText()).includes('luba telefoni seadetes'));

const [fc1] = await Promise.all([p.waitForEvent('filechooser'), camera.tap()]);
ok('camera: seletor de 1 foto', !fc1.isMultiple());
await fc1.setFiles({ name: 'camera.png', mimeType: 'image/png', buffer: PNG });
const [fc2] = await Promise.all([p.waitForEvent('filechooser'), galeria.tap()]);
ok('galeria: seletor de varias fotos', fc2.isMultiple());
await fc2.setFiles({ name: 'galeria.png', mimeType: 'image/png', buffer: PNG });
await p.waitForTimeout(500);
const imgs = () => p.locator('[data-testid=passo-detalhe] img').count();
ok('foto da camera + foto da galeria juntas', await imgs() === 2, await imgs());

const nav = await p.getByTestId('passo-detalhe').getByTestId('navegar').boundingBox();
ok('Tagasi/Edasi dentro da tela (celular 393x780)', nav && nav.y + nav.height <= 780, nav && Math.round(nav.y + nav.height));
ok('Edasi liberado', await p.getByTestId('passo-detalhe').getByRole('button', { name: 'Edasi' }).isEnabled());

// recarregar (no Android o Chrome fecha a aba ao abrir a galeria/camera)
const detalhesAntes = funil.filter((e) => e === 'detalhe').length;
await p.waitForTimeout(800); // deixa as fotos gravarem no IndexedDB
await p.reload({ waitUntil: 'networkidle' });
await p.getByTestId('passo-detalhe').waitFor();
await p.waitForTimeout(1000);
ok('recarregou: volta no passo 2', await p.getByTestId('passo-detalhe').isVisible());
ok('recarregou: descricao volta', await p.locator('#pedido-descricao').inputValue() === 'Kriimustus esiuksel');
ok('recarregou: as 2 fotos voltam', await imgs() === 2, await imgs());
ok('recarregou: passo nao conta de novo no funil', funil.filter((e) => e === 'detalhe').length === detalhesAntes, JSON.stringify(funil));
ok('recarregou: ainda sem pedido de localizacao', await p.evaluate(() => window.__geo) === 0);

// passo do endereco: a localizacao e pedida uma vez (rascunho no passo 'local')
await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('bipfix_pedido_rascunho')); r.etapa = 'local'; localStorage.setItem('bipfix_pedido_rascunho', JSON.stringify(r)); });
await p.reload({ waitUntil: 'networkidle' });
await p.getByTestId('passo-local').waitFor();
await p.waitForTimeout(800);
ok('passo do endereco pede localizacao 1 vez', await p.evaluate(() => window.__geo) === 1, await p.evaluate(() => window.__geo));
await p.locator('#pedido-endereco').fill('Tartu mnt 67');
ok('campo de endereco continua editavel (sem travar)', await p.locator('#pedido-endereco').inputValue() === 'Tartu mnt 67');
ok('sem erro de pagina', erros.length === 0, erros.join(' | '));

await br.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
