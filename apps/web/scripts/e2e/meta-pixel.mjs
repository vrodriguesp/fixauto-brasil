// Pixel da Meta (11/11): so carrega depois do "Nõustun", so nas versoes da Estonia, fora das
// areas logadas, sem coleta automatica; "Lead" uma vez no pedido sem conta enviado.
// O script da Meta e trocado por um vazio (nada sai para a Meta): conferimos a fila do fbq.
//   node meta-pixel.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const ENV = process.argv[2];
const env = Object.fromEntries(fs.readFileSync(ENV, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
const ID = env.NEXT_PUBLIC_META_PIXEL_ID;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${!c && x ? ' - ' + String(x).slice(0, 300) : ''}`); };

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
async function abrir({ consentimento } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'et-EE', timezoneId: 'Europe/Tallinn' });
  const meta = [];
  ctx.on('request', (r) => { if (/facebook\.(net|com)/.test(r.url())) meta.push(r.url()); });
  await ctx.route(/connect\.facebook\.net/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await ctx.route(/facebook\.com\/tr/, (r) => r.fulfill({ status: 204, body: '' }));
  if (consentimento) await ctx.addInitScript((v) => { try { localStorage.setItem('bipfix_cookie_consent', v); } catch {} }, consentimento);
  const page = await ctx.newPage();
  return { ctx, page, meta };
}
const fila = (page) => page.evaluate(() => (window.fbq?.queue || []).map((a) => Array.from(a).map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ')));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// marca/modelo: <select> ou campo com lista (desde bf92546 "marca, modelo e ano a vista") - igual ao pedido-exaustivo
async function escolherCarroCampo(page, id, nome, re) {
  const el = page.locator('#' + id);
  await el.waitFor({ state: 'visible', timeout: 20000 });
  if ((await el.evaluate((e) => e.tagName)) === 'SELECT') {
    await page.waitForFunction((e) => e.options.length > 2, await el.elementHandle(), { timeout: 20000 });
    const opc = await el.locator('option').allTextContents();
    await el.selectOption({ label: opc.find((o) => (re || new RegExp('^' + nome + '$')).test(o)) || opc[1] });
    return;
  }
  await page.waitForFunction((e) => !e.getAttribute('aria-busy') || e.getAttribute('aria-busy') === 'false', await el.elementHandle(), { timeout: 20000 }).catch(() => {});
  await el.click(); await el.fill(nome.slice(0, 4));
  const op = page.getByTestId(id + '-lista').getByRole('option', { name: nome, exact: true });
  await op.waitFor({ timeout: 20000 }); await op.click();
}

try {
  ok('ID do Pixel no .env', /^\d{15,16}$/.test(ID || ''), ID);

  // 1) sem resposta ao aviso: nada da Meta
  {
    const { ctx, page, meta } = await abrir();
    await page.goto(SITE + '/ee/et/paring', { waitUntil: 'networkidle' });
    await esperar(1500);
    ok('sem consentimento: nao baixa nada da Meta', meta.length === 0, meta.join(' '));
    ok('sem consentimento: sem fbq', await page.evaluate(() => typeof window.fbq === 'undefined'));
    // recusa
    await page.getByTestId('aviso-cookies').getByRole('button', { name: /Keeldu/ }).click();
    await esperar(1500);
    ok('"Keeldu": continua sem nada da Meta', meta.length === 0 && await page.evaluate(() => typeof window.fbq === 'undefined'));
    await ctx.close();
  }

  // 2) "Nõustun": carrega, sem coleta automatica, init + PageView; troca de pagina = PageView
  {
    const { ctx, page, meta } = await abrir();
    await page.goto(SITE + '/ee/et', { waitUntil: 'networkidle' });
    await page.getByTestId('aviso-cookies').getByRole('button', { name: /Nõustun/ }).click();
    await esperar(2000);
    const f = await fila(page);
    ok('"Nõustun": baixa o script da Meta', meta.some((u) => /fbevents\.js/.test(u)), meta.join(' '));
    ok('coleta automatica desligada antes do init', f[0] === `set autoConfig false ${ID}`, JSON.stringify(f));
    ok('init com o ID e PageView', f.includes(`init ${ID}`) && f.filter((x) => x === 'track PageView').length === 1, JSON.stringify(f));
    // navegacao interna (sem recarregar) para outra pagina publica
    // 13/11: o cabecalho tem "Küsi hinda" em duas versoes (uma escondida por largura): o link visivel
    await page.locator(`a[href="/ee/et/paring"]`).locator("visible=true").first().click();
    await page.waitForURL(/\/ee\/et\/paring/);
    await esperar(1500);
    const f2 = await fila(page);
    ok('outra pagina publica: mais 1 PageView', f2.filter((x) => x === 'track PageView').length === 2, JSON.stringify(f2));
    ok('nenhum e-mail/telefone mandado', !f2.some((x) => /@|\+372|em\b|ph\b/.test(x)), JSON.stringify(f2));
    await ctx.close();
  }

  // 3) aceito, mas fora da Estonia ou em area logada: nada
  for (const url of ['/it/it/richiesta', '/pt/pt/pedido', '/br/pt/pedido', '/ee/et/oficina/hoje', '/ee/et/cliente/dashboard']) {
    const { ctx, page, meta } = await abrir({ consentimento: 'accepted' });
    await page.goto(SITE + url, { waitUntil: 'networkidle' }).catch(() => {});
    await esperar(1500);
    const final = new URL(page.url()).pathname;
    // area logada sem login volta ao login (pagina publica) - conta so se ficou na area logada
    const logada = /\/(cliente|oficina)\//.test(final);
    if (logada || !/\/ee\//.test(url)) ok(`aceito em ${url}: sem Pixel`, meta.length === 0, final + ' ' + meta.join(' '));
    else ok(`aceito em ${url} (foi para ${final}, publica): Pixel normal`, meta.length > 0);
    await ctx.close();
  }

  // 3b) area logada de verdade (cliente logado), com consentimento
  {
    const tag = crypto.randomBytes(3).toString('hex');
    const email = `pixel-${tag}@example.test`; const senha = 'Px-' + crypto.randomBytes(6).toString('hex');
    const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    await admin.from('profiles').upsert({ id: u.user.id, email, tipo: 'cliente', nome: 'Pixel Teste', idioma: 'et' });
    const { ctx, page, meta } = await abrir({ consentimento: 'accepted' });
    await page.goto(SITE + '/ee/et/login', { waitUntil: 'networkidle' });
    const antes = meta.length;
    await page.fill('input[type=email]', email); await page.fill('input[type=password]', senha); await page.click('button[type=submit]');
    await page.waitForURL((x) => x.pathname.includes('/cliente/dashboard'), { timeout: 30000 });
    await esperar(1500);
    const f = await fila(page);
    // login -> "/" (inicio, publica, conta 1) -> painel do cliente (nao conta)
    ok('login (publica) teve Pixel; no painel do cliente nenhum PageView novo', antes > 0 && f.filter((x) => x === 'track PageView').length === 2, `antes=${antes} ${JSON.stringify(f)}`);
    await page.reload({ waitUntil: 'networkidle' });
    await esperar(1500);
    ok('painel do cliente aberto direto: sem Pixel', await page.evaluate(() => typeof window.fbq === 'undefined'));
    await ctx.close();
    await admin.auth.admin.deleteUser(u.user.id).catch(() => {});
  }
  // 4) pedido sem conta enviado (codigo confirmado): 1 "Lead", sem dados da pessoa
  {
    const tag = crypto.randomBytes(3).toString('hex');
    const email = `pixel-lead-${tag}@example.test`; const senha = 'Px-' + crypto.randomBytes(6).toString('hex');
    const { ctx, page } = await abrir({ consentimento: 'accepted' });
    const next = () => page.getByRole('button', { name: 'Edasi', exact: true }).first();
    await page.goto(SITE + '/ee/et/paring', { waitUntil: 'networkidle' });
    await page.locator('main button').filter({ hasText: /Mehaanika|Remont/ }).first().click();
    await page.getByTestId('passo-detalhe').waitFor();
    await page.locator('#pedido-descricao').fill('Pixel test');
    await next().click();
    await page.getByTestId('passo-carro').waitFor();
    await escolherCarroCampo(page, 'cbbe3-101', 'Toyota');
    await escolherCarroCampo(page, 'cbbe3-102', 'Corolla', /Corolla/);
    await page.locator('[data-testid=passo-carro] input[type=number]').fill('2017').catch(() => {});
    await page.locator('#pedido-placa').fill('123ABC');
    await next().click();
    await page.getByTestId('passo-local').waitFor();
    await page.locator('#pedido-endereco').fill('Kristiine');
    await esperar(2500);
    const sug = page.getByRole('option').first();
    if (await sug.isVisible().catch(() => false)) await sug.click();
    await next().click();
    await page.getByTestId('passo-contato').waitFor();
    await page.locator('#pedido-nome').fill('Pixel Teste');
    await page.locator('#pedido-email').fill(email);
    await page.locator('#pedido-senha').fill(senha);
    await page.getByTestId('aceito-termos').check();
    await page.getByTestId('quer-sms').check(); // 13/11: celular so com SMS marcado
    await page.locator('#pedido-telefone').fill('5123 4567');
    const t0 = Date.now();
    ok('antes de enviar: nenhum Lead', !(await fila(page)).includes('track Lead'));
    await page.getByTestId('passo-contato').getByRole('button').filter({ hasText: /Saada|päring/i }).last().click();
    await page.getByTestId('passo-codigo').waitFor({ timeout: 30000 });
    ok('pedido enviado mas codigo nao confirmado: nenhum Lead', !(await fila(page)).includes('track Lead'));
    let codigo = null;
    for (let i = 0; i < 30 && !codigo; i++) {
      const arq = fs.readdirSync(env.EMAIL_PASTA_TESTE).filter((f) => f.endsWith(`_${email.replace(/[^a-z0-9@._-]/gi, '_')}.html`) && Number(f.split('_')[0]) >= t0).sort();
      if (arq.length) codigo = (fs.readFileSync(path.join(env.EMAIL_PASTA_TESTE, arq.at(-1)), 'utf8').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').match(/(?<![\d#])\d{6}(?!\d)/) || [])[0];
      if (!codigo) await esperar(300);
    }
    ok('codigo chegou no e-mail local', !!codigo);
    await page.locator('#pedido-codigo').fill(codigo || '');
    await page.getByTestId('confirmar-codigo').click();
    await page.waitForURL((u) => !u.pathname.endsWith('/paring'), { timeout: 30000 }).catch(() => {});
    await esperar(2500);
    const f = await fila(page);
    ok('codigo confirmado: exatamente 1 Lead', f.filter((x) => x === 'track Lead').length === 1, JSON.stringify(f));
    ok('Lead sem e-mail, nome ou telefone', !f.some((x) => x.includes(email) || /Pixel Teste|5123/.test(x)), JSON.stringify(f));
    await ctx.close();
    const p = (await admin.from('profiles').select('id').ilike('email', email).maybeSingle()).data;
    if (p) {
      await admin.from('solicitacoes').delete().eq('cliente_id', p.id);
      await admin.auth.admin.deleteUser(p.id).catch(() => {});
    }
  }
} finally {
  await browser.close();
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
