// Pedido novo do cliente logado: trocar a lingua no meio NAO volta ao passo 1 (teste em producao 09/11:
// no passo 4 trocou ET -> RU e voltou ao 1 sem o carro, o tipo e os servicos). WebKit, iPhone 14.
// Passos 1-4 como pessoa, troca para russo, confere passo, texto, e (voltando) servicos e carro; vai ao
// resumo e confere tudo nele. Nao envia o pedido.
//   HOST_LAN=<ip-da-rede> node pedido-novo-idioma.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { webkit } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local');
const SITE = `http://${process.env.HOST_LAN || 'localhost'}:3100`;
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/troca-idioma'; fs.mkdirSync(OUT, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tag = crypto.randomBytes(3).toString('hex'); const senha = 'Pi-' + crypto.randomBytes(6).toString('hex');
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const email = `pedido-idioma-${tag}@example.test`;
const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
await admin.from('profiles').upsert({ id: u.user.id, email, tipo: 'cliente', nome: 'Pedido Lingua', idioma: 'et' });
await admin.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: 'Octavia', fipe_ano: '2017', placa: '456TST' });
const b = await webkit.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe') });
const NOTA = `Märkus ${tag} enne keele vahetust`;
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'et-EE' });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  const p = await ctx.newPage();
  await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha); await p.click('button[type=submit]'); await p.waitForTimeout(4500);
  await p.goto(`${SITE}/ee/et/cliente/nova-solicitacao`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  const edasi = () => p.locator('main button').filter({ hasText: /^(Edasi|Далее)$/ }).first();
  await p.locator('main').getByText('Octavia').first().click(); await edasi().click(); await p.waitForTimeout(800);
  await p.locator('main button').filter({ hasText: 'Hooldus' }).first().click(); await edasi().click(); await p.waitForTimeout(800);
  const cb = p.locator('main input[type=checkbox]');
  await cb.nth(0).check(); await cb.nth(4).check(); await edasi().click(); await p.waitForTimeout(800);
  await p.locator('main textarea').first().fill(NOTA);
  await p.locator('main').getByText('Kõrge').first().click();
  ok('passo 4 antes da troca', (await p.locator('main').innerText()).includes('4/5'));
  await p.screenshot({ path: `${OUT}/pedido-novo-antes.png` });
  // troca para russo pelo seletor de lingua
  await p.evaluate(() => document.querySelector('a[hreflang="ru-EE"]')?.click());
  await p.waitForURL(/\/ee\/ru\//, { timeout: 15000 }); await p.waitForTimeout(3500);
  const txt = await p.locator('main').innerText();
  await p.screenshot({ path: `${OUT}/pedido-novo-depois.png` });
  ok('continua no passo 4 em russo', txt.includes('4/5') && /Новая заявка/.test(txt), txt.slice(0, 160));
  ok('texto da nota voltou', (await p.locator('main textarea').first().inputValue()) === NOTA);
  // volta ao passo 3: servicos marcados
  await p.locator('main button').filter({ hasText: /^Назад$/ }).first().click(); await p.waitForTimeout(800);
  ok('servicos marcados mantidos', (await cb.nth(0).isChecked()) && (await cb.nth(4).isChecked()));
  await edasi().click(); await p.waitForTimeout(600); await edasi().click(); await p.waitForTimeout(1000);
  const resumo = await p.locator('main').innerText();
  ok('resumo: carro', /Octavia/.test(resumo), resumo.slice(0, 200));
  ok('resumo: tipo em russo', /Техобслуживание/.test(resumo));
  ok('resumo: urgencia alta', /Высокая/.test(resumo));
  ok('resumo: nota', resumo.includes(NOTA));
  // entrar de novo na pagina (sem troca de lingua) comeca do zero
  await p.goto(`${SITE}/ee/ru/cliente/nova-solicitacao`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  ok('pagina nova comeca no passo 1', (await p.locator('main').innerText()).includes('1/5'));
  await ctx.close();
} catch (e) {
  falhas++; console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
} finally {
  await b.close();
  await admin.from('veiculos').delete().eq('profile_id', u.user.id); await admin.from('profiles').delete().eq('id', u.user.id); await admin.auth.admin.deleteUser(u.user.id);
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
