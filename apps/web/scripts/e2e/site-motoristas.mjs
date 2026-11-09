// Pagina para motoristas (rascunho 06/11): et/ru/en, celular e computador -
// carrega sem erro de JS, sem rolagem lateral, imagens carregadas, botao leva ao
// cadastro de cliente, noindex em IT/PT/BR e indexavel na Estonia; capturas para o dono.
//   node site-motoristas.mjs <pasta de saida>
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const SITE = 'http://localhost:3100';
const OUT = process.argv[2] || '.';
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x !== '' && !c ? ' - ' + String(x).slice(0, 200) : ''}`); };
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const PAGS = [['ee/et', '/autojuhtidele', 'paring'], ['ee/ru', '/dlya-voditeley', 'zayavka'], ['ee/en', '/for-drivers', 'request']];
try {
  for (const [pre, slug, cad] of PAGS) {
    for (const larg of [390, 1280]) {
      const ctx = await browser.newContext(larg < 500 ? { viewport: { width: larg, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: larg, height: 900 } });
      await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
      const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
      const r = await p.goto(`${SITE}/${pre}${slug}`, { waitUntil: 'networkidle' });
      ok(`${pre} ${larg}px: abre (200)`, r.status() === 200, r.status());
      await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((s) => setTimeout(s, 120)); } window.scrollTo(0, 0); });
      await p.waitForTimeout(800);
      const imgs = await p.evaluate(() => [...document.images].filter((i) => i.src.includes('/motoristas/') || i.src.includes('motoristas')).map((i) => ({ src: i.currentSrc || i.src, ok: i.complete && i.naturalWidth > 0 })));
      ok(`${pre} ${larg}px: 4 imagens carregadas (foto + 3 telas)`, imgs.length === 4 && imgs.every((i) => i.ok), JSON.stringify(imgs));
      ok(`${pre} ${larg}px: telas no idioma certo`, imgs.filter((i) => /tela-/.test(i.src)).every((i) => i.src.includes(pre.endsWith('ru') ? '-ru' : '-et')), JSON.stringify(imgs.map((i) => i.src)));
      const ctas = await p.locator('[data-testid="cta-motorista"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      ok(`${pre} ${larg}px: 3 botoes, todos para o pedido sem cadastro`, ctas.length === 3 && ctas.every((h) => h.endsWith(`/${pre}/${cad}`)), JSON.stringify(ctas));
      const naTela = await p.locator('[data-testid="cta-motorista"]').first().evaluate((a) => a.getBoundingClientRect().bottom <= innerHeight);
      ok(`${pre} ${larg}px: botao visivel sem rolar`, naTela);
      ok(`${pre} ${larg}px: sem rolagem lateral`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      ok(`${pre} ${larg}px: sem chave de traducao crua`, !/paraMotoristas\./.test(await p.innerText('body')));
      const robots = await p.locator('meta[name=robots]').getAttribute('content').catch(() => null);
      ok(`${pre} ${larg}px: indexavel (sem noindex)`, !robots || !/noindex/.test(robots), robots);
      ok(`${pre} ${larg}px: sem erro de JS`, erros.length === 0, erros.join(' | '));
      await p.screenshot({ path: path.join(OUT, `motoristas-${pre.split('/')[1]}-${larg}.png`), fullPage: true });
      if (larg === 390 && pre === 'ee/et') {
        await p.locator('[data-testid="cta-motorista"]').first().click(); await p.waitForURL(/paring/, { timeout: 15000 }).catch(() => {});
        ok('et: clique no botao abre o pedido sem cadastro', /\/ee\/et\/paring$/.test(p.url()), p.url());
      }
      await ctx.close();
    }
  }
  for (const [pre, slug] of [['it/it', '/per-automobilisti'], ['pt/pt', '/para-condutores'], ['br/pt', '/para-motoristas']]) {
    const ctx = await browser.newContext(); const p = await ctx.newPage();
    const r = await p.goto(`${SITE}/${pre}${slug}`, { waitUntil: 'domcontentloaded' });
    const robots = await p.locator('meta[name=robots]').getAttribute('content').catch(() => null);
    const cab = r.headers()['x-robots-tag'] || '';
    ok(`${pre}: abre mas fica fora do Google (noindex - so recrutamento)`, r.status() === 200 && (/noindex/.test(robots || '') || /noindex/.test(cab)), `${r.status()} ${robots} ${cab}`);
    await ctx.close();
  }
  const sm = await (await fetch(`${SITE}/sitemap.xml`)).text();
  ok('sitemap: tem as versoes da Estonia', ['/ee/et/autojuhtidele', '/ee/ru/dlya-voditeley', '/ee/en/for-drivers'].every((u) => sm.includes(u)));
  ok('sitemap: sem Italia/Portugal/Brasil', !['/it/it/per-automobilisti', '/pt/pt/para-condutores', '/br/pt/para-motoristas'].some((u) => sm.includes(`<loc>http`) && sm.includes(u)));
} catch (e) { ok('parou', false, e.message); } finally {
  await browser.close();
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
