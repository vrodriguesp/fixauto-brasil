// Producao, so leitura e sem login: paginas publicas (6 linguas, celular e PC),
// erros de JS, rolagem lateral, APIs protegidas e catalogo (microcarros em Carro).
import { createRequire } from 'node:module'; import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const SITE = 'https://bipfix.com';
let falhas = 0; const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).slice(0, 200) : ''}`); };
const PAGS = ['/ee/et', '/ee/ru', '/ee/en', '/ee/et/tookodadele', '/ee/ru/dlya-avtoservisov', '/ee/et/login', '/ee/ru/registratsiya', '/ee/et/privaatsus', '/it/it', '/pt/pt', '/br/pt'];
const b = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
for (const [nome, opc] of [['celular', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }], ['PC', { viewport: { width: 1366, height: 900 } }]]) {
  const ctx = await b.newContext({ ...opc, userAgent: undefined }); await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await ctx.route(/googletagmanager|google-analytics|facebook\.net|doubleclick/, (r) => r.abort());
  for (const u of PAGS) {
    const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
    const r = await p.goto(SITE + u + '?utm_source=teste_claude', { waitUntil: 'networkidle' }).catch((e) => null);
    await p.waitForTimeout(800);
    const st = r?.status(); const corpo = await p.innerText('body').catch(() => '');
    const larg = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1).catch(() => false);
    ok(`${nome} ${u}: ${st}, sem erro JS, sem rolagem lateral, sem chave crua`, st === 200 && !erros.length && larg && !/\b[a-z]+[A-Z]\w+\.[a-z]+[A-Z]\w+\b/.test(corpo.slice(0, 3000)), `${st} ${erros.join('|')} larg=${larg}`);
    await p.close();
  }
  await ctx.close();
}
await b.close();
const st = async (u, o) => (await fetch(SITE + u, o)).status;
ok('api/traduzir sem login -> 401', (await st('/api/traduzir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"lingua":"et","textos":["x"]}' })) === 401);
ok('api/analisar-dano sem login -> 401', (await st('/api/analisar-dano', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ solicitacao_id: '00000000-0000-0000-0000-000000000000' }) })) === 401);
ok('api/tarefas/expirar-pedidos sem chave -> 403', (await st('/api/tarefas/expirar-pedidos', { method: 'POST' })) === 403);
ok('api/tarefas/expirar-pedidos chave falsa -> 403', (await st('/api/tarefas/expirar-pedidos', { method: 'POST', headers: { 'x-tarefa-chave': 'errada' } })) === 403);
const g = async (u) => (await fetch(SITE + '/api/vehicle-catalog' + u)).json();
const carros = await g('?tipo=cars'); const mc = await g('?tipo=cars&marca=microcar');
ok('catalogo: Microcar em Carro', carros.some((x) => x.code === 'microcar'));
ok('catalogo: MC2 nos modelos', mc.some((x) => x.name === 'MC2'));
ok('catalogo: Microcar continua em Moto', (await g('?tipo=motorcycles')).some((x) => x.code === 'microcar'));
ok('catalogo: ciclomotor comum fora de Carro', !carros.some((x) => x.code === 'miele'));
ok('link curto do pedido 100133 continua', (await fetch(SITE + '/r/100133', { redirect: 'manual' })).status === 302);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
