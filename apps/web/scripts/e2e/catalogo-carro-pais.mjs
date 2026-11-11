// Passo do carro do pedido: marca/modelo vem do catalogo do PAIS do aparelho (FIPE so no
// Brasil). Bug 10/11: /br/pt num aparelho fora do Brasil pedia a FIPE e o catalogo; se a FIPE
// respondia por ultimo, as marcas ficavam com codigos FIPE (Toyota=56) e os modelos eram
// pedidos com /api/vehicle-catalog?marca=56 -> lista vazia. Aqui a FIPE e atrasada de proposito.
//   node catalogo-carro-pais.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const ENV = process.argv[2];
const env = Object.fromEntries(fs.readFileSync(ENV, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = 'http://localhost:3100';
const WEBMSG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../messages');
const PEDIDO = { 'pt-PT': '/pt/pt/pedido', pt: '/br/pt/pedido', et: '/ee/et/paring' };
const msgWeb = (l) => {
  const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.json`, 'utf8'));
  for (const area of ['cliente', 'misc', 'auth']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.${area}.json`, 'utf8')));
  return (k) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`);
};
let falhas = 0;
const ok = (nome, cond, extra = '') => { console.log(`${cond ? 'OK  ' : 'FALHA'} ${nome}${cond ? '' : '  ' + extra}`); if (!cond) falhas++; };

async function caso(browser, l, fuso, { trocar } = {}) {
  const T = msgWeb(l);
  const nm = `${l} fuso ${fuso}${trocar ? ' troca ' + trocar : ''}`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: l === 'pt' ? 'pt-BR' : l, timezoneId: fuso });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  const pedidos = [];
  // FIPE (servico externo) lenta: a resposta chega depois da do catalogo
  await ctx.route('**/api/fipe**', async (r) => { await new Promise((s) => setTimeout(s, 2500)); await r.continue(); });
  const page = await ctx.newPage();
  page.on('request', (r) => { if (/api\/(fipe|vehicle-catalog)/.test(r.url())) pedidos.push(r.url().replace(SITE, '')); });
  await page.goto(SITE + PEDIDO[l], { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(T('constants.tiposServico.mecanica')) }).first().click();
  await page.getByTestId('passo-detalhe').waitFor({ timeout: 5000 });
  await page.locator('#pedido-descricao').fill('Teste catalogo');
  await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();
  await page.getByTestId('passo-carro').waitFor();
  const sel = (i) => page.locator('[data-testid=passo-carro] select').nth(i);
  await page.waitForFunction((el) => el.options.length > 2, await sel(0).elementHandle(), { timeout: 20000 });
  await page.waitForTimeout(3500); // deixa a FIPE atrasada chegar (se foi pedida)
  await sel(0).selectOption({ label: 'Toyota' });
  await page.waitForFunction((el) => el.options.length > 2, await sel(1).elementHandle(), { timeout: 8000 }).catch(() => {});
  const modelos = await sel(1).locator('option').allTextContents().catch(() => []);
  ok(`${nm}: Toyota tem modelos (Corolla)`, modelos.some((o) => /Corolla/.test(o)), `${modelos.length} opcoes; pedidos ${JSON.stringify(pedidos)}`);
  const br = fuso === 'America/Sao_Paulo';
  ok(`${nm}: catalogo certo (${br ? 'FIPE' : 'europeu'}) e nenhum codigo FIPE no catalogo europeu`,
    pedidos.every((u) => !/vehicle-catalog.*marca=\d/.test(u)) && pedidos.some((u) => (br ? /api\/fipe/ : /vehicle-catalog/).test(u)), JSON.stringify(pedidos));
  if (trocar) {
    await sel(1).selectOption({ label: modelos.find((o) => /Corolla/.test(o)) || modelos[1] });
    await page.locator('#pedido-placa').fill('123ABC');
    await page.locator(`footer a[hreflang][href="${PEDIDO[trocar]}"]`).first().scrollIntoViewIfNeeded().catch(() => {});
    const link = page.locator(`a[hreflang][href="${PEDIDO[trocar]}"]`);
    await page.locator('button[aria-haspopup="true"][aria-expanded]').first().click();
    await link.locator('visible=true').first().click();
    await page.waitForURL((u) => u.pathname === PEDIDO[trocar], { timeout: 15000 });
    await page.getByTestId('passo-carro').waitFor({ timeout: 8000 });
    await page.waitForTimeout(4000);
    const marca = await sel(0).evaluate((el) => el.options[el.selectedIndex]?.text).catch(() => null);
    const modelo = await sel(1).evaluate((el) => el.options[el.selectedIndex]?.text).catch(() => null);
    ok(`${nm}: depois de trocar o idioma, Toyota/Corolla continuam`, marca === 'Toyota' && /Corolla/.test(modelo || ''), `${marca} / ${modelo}; pedidos ${JSON.stringify(pedidos.slice(-4))}`);
  }
  await ctx.close();
}

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
try {
  for (const fuso of ['Europe/Rome', 'Europe/Tallinn', 'Europe/Lisbon', 'America/Sao_Paulo']) {
    await caso(browser, 'pt', fuso);
    await caso(browser, 'pt-PT', fuso);
  }
  await caso(browser, 'pt-PT', 'Europe/Rome', { trocar: 'pt' });
  await caso(browser, 'pt', 'Europe/Rome', { trocar: 'pt-PT' });
  await caso(browser, 'et', 'Europe/Tallinn');
} finally { await browser.close(); }
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
