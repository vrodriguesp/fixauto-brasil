// Teste no motor do Safari (Playwright WebKit), tela do iPhone 14 (390x664 = area visivel no
// Safari). Pega o que o Chrome nao mostra e o dono achou no iPhone em 08/11:
//  - campo que perde o foco depois de tocar ("trava, nao deixa digitar");
//  - campo com letra menor que 16 px (o Safari da zoom e a tela desconfigura);
//  - conversa do app: caixa de escrever dentro da tela, sem a pagina pular;
//  - login do app: botao Entrar visivel sem rolar;
//  - acidente sem login e sem localizacao: digitar endereco e enviar ate a tela de sucesso.
//   node safari-iphone.mjs <.env.local>      (site :3100 e app web :8090 no ar; banco LOCAL)
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
const HOST = process.env.HOST_LAN || 'localhost';
const SITE = `http://${HOST}:3100`; const APP = `http://${HOST}:8090`;
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/safari-iphone`; fs.mkdirSync(OUT, { recursive: true });
const ET = JSON.parse(fs.readFileSync(`${RAIZ}/site/apps/mobile/i18n/locales/et.json`, 'utf8'));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const b = await webkit.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe') });
const novoCtx = async () => { const c = await b.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'et-EE' }); await c.addInitScript(() => { try { localStorage.setItem('idioma', 'et'); localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  // a rota do acidente limita envios por IP: cada rodada de teste finge um IP proprio (como acidente-fluxo)
  await c.route('**/api/emergencia/**', (r) => r.continue({ headers: { ...r.request().headers(), 'x-real-ip': `10.72.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 249)}` } }));
  return c; };
// em cada campo visivel: letra >= 16 px e o foco continua 1 s depois de tocar + digitar
const camposDaTela = async (p, nome) => {
  const n = await p.locator('input:visible, textarea:visible').count();
  const problemas = [];
  for (let i = 0; i < n; i++) {
    const c = p.locator('input:visible, textarea:visible').nth(i);
    const info = await c.evaluate((e) => ({ tipo: e.type, fs: parseFloat(getComputedStyle(e).fontSize), ph: e.getAttribute('placeholder') || e.getAttribute('aria-label') || e.name || e.id, so: e.readOnly || e.disabled || e.tabIndex === -1 }));
    if (info.so || ['checkbox', 'radio', 'file', 'hidden', 'range', 'date', 'time'].includes(info.tipo)) continue;
    if (info.fs < 16) problemas.push(`letra ${info.fs}px [${info.ph.slice(0, 25)}]`);
    await c.click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(900);
    const foco = await p.evaluate(() => document.activeElement?.tagName);
    if (!/INPUT|TEXTAREA/.test(foco || '')) problemas.push(`perde o foco [${info.ph.slice(0, 25)}]`);
    await p.keyboard.press('Escape').catch(() => {});
  }
  ok(`${nome}: campos com 16 px e sem perder o foco`, !problemas.length, problemas.join(' | '));
};
const contas = [];
try {
  // ---------- app: telas com formulario ----------
  for (const rota of ['login', 'emergencia', 'pedido']) {
    const ctx = await novoCtx(); const p = await ctx.newPage();
    await p.goto(`${APP}/${rota}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3500);
    await camposDaTela(p, `App /${rota}`);
    const larg = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(`App /${rota}: sem rolagem lateral`, larg <= 1, String(larg));
    if (rota === 'login') {
      const fundo = await p.getByText(ET.auth.entrar, { exact: true }).last().evaluate((e) => e.getBoundingClientRect().bottom);
      ok('App login: botao Entrar visivel sem rolar (iPhone 14)', fundo <= 664, `fundo do botao ${Math.round(fundo)} px`);
    }
    await p.screenshot({ path: path.join(OUT, `app_${rota}.png`) });
    await ctx.close();
  }
  // ---------- app: acidente sem login e sem localizacao, ate o fim ----------
  {
    const email = `safari-acid-${crypto.randomBytes(3).toString('hex')}@example.test`; contas.push(email);
    const ctx = await novoCtx(); const p = await ctx.newPage();
    const dialogos = []; p.on('dialog', (d) => { dialogos.push(d.message()); d.dismiss().catch(() => {}); });
    await p.goto(`${APP}/emergencia`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3500);
    const tentar = p.getByText(ET.emergencia.tentarDeNovo, { exact: true });
    if (await tentar.count()) { await tentar.first().click(); await p.waitForTimeout(2000); }
    const end = p.locator(`input[placeholder="${ET.emergencia.localTexto}"]`);
    await end.click(); await p.keyboard.type('Pärnu mnt 10', { delay: 70 }); await p.waitForTimeout(3500);
    ok('Acidente: endereco digitado inteiro depois de "tentar de novo"', (await end.inputValue()) === 'Pärnu mnt 10', await end.inputValue());
    const sug = p.getByRole('button', { name: /Pärnu/ }).first();
    if (await sug.count()) { await sug.click(); await p.waitForTimeout(800); }
    await p.getByLabel(ET.auth.nome, { exact: true }).fill('Teste Safari');
    await p.getByLabel(ET.auth.email, { exact: true }).fill(email);
    await p.getByText(ET.emergencia.enviarRegistro, { exact: true }).click(); await p.waitForTimeout(8000);
    const corpo = await p.innerText('body');
    ok('Acidente: enviado ate a tela de sucesso', corpo.includes(ET.emergencia.sucessoTitulo), dialogos.join(' / ') || corpo.slice(0, 150));
    await ctx.close();
  }
  // ---------- app: conversa (caixa de escrever dentro da tela, sem pular) ----------
  {
    const email = `safari-conv-${crypto.randomBytes(3).toString('hex')}@example.test`; const senha = 'Sf-' + crypto.randomBytes(6).toString('hex'); contas.push(email);
    const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    await admin.from('profiles').upsert({ id: u.user.id, email, tipo: 'cliente', nome: 'Cliente Safari', idioma: 'et' });
    const { data: of } = await admin.from('oficinas').select('id, profile_id').eq('ativa', true).limit(1).single();
    const { data: v } = await admin.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018' }).select('id').single();
    const { data: sol } = await admin.from('solicitacoes').insert({ cliente_id: u.user.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'Safari', urgencia: 'media', endereco: 'Tallinn', latitude: 59.43, longitude: 24.74, status: 'aberta' }).select('id').single();
    await admin.from('mensagens').insert(Array.from({ length: 8 }, (_, i) => ({ solicitacao_id: sol.id, oficina_id: of.id, remetente_id: i % 2 ? u.user.id : of.profile_id, texto: `Sõnum ${i + 1}` })));
    const ctx = await novoCtx(); const p = await ctx.newPage();
    await p.goto(`${APP}/login`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    await p.locator('input:visible').nth(0).fill(email); await p.locator('input:visible').nth(1).fill(senha); await p.keyboard.press('Enter'); await p.waitForTimeout(5000);
    await p.goto(`${APP}/conversa/${sol.id}?oficina=${of.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(4000);
    const medir = () => p.evaluate(() => { const c = [...document.querySelectorAll('textarea, input')].find((e) => e.offsetParent); const r = c.getBoundingClientRect(); return { fundo: Math.round(r.bottom), altura: Math.round(r.height), letra: parseFloat(getComputedStyle(c).fontSize), pulo: scrollY }; });
    const a = await medir();
    ok('Conversa (app): caixa de escrever dentro da tela, 16 px', a.fundo <= 664 && a.letra >= 16, JSON.stringify(a));
    await p.locator('textarea:visible, input:visible').first().click(); await p.keyboard.type('Tere, kas auto on valmis?', { delay: 30 }); await p.waitForTimeout(600);
    await p.evaluate(() => document.activeElement?.blur()); await p.waitForTimeout(600);
    const d = await medir();
    ok('Conversa (app): depois de escrever a tela nao pula e a caixa nao cresce demais', d.pulo === 0 && d.altura <= 130 && d.fundo <= 664, JSON.stringify(d));
    await p.screenshot({ path: path.join(OUT, 'app_conversa.png') });
    await ctx.close();
    await admin.from('mensagens').delete().eq('solicitacao_id', sol.id); await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', sol.id); await admin.from('solicitacoes').delete().eq('id', sol.id);
  }
  // ---------- site: paginas com formulario ----------
  for (const rota of ['/ee/et/login', '/ee/et/registreeru', '/ee/et/kusi-pakkumisi']) {
    const ctx = await novoCtx(); const p = await ctx.newPage();
    const r = await p.goto(`${SITE}${rota}`, { waitUntil: 'networkidle' }).catch(() => null); await p.waitForTimeout(2500);
    if (!r || r.status() >= 400) { console.log(`(pulado ${rota}: ${r?.status()})`); await ctx.close(); continue; }
    await camposDaTela(p, `Site ${rota}`);
    await ctx.close();
  }
} catch (e) {
  falhas++; console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await b.close();
  for (const email of contas) {
    const { data: prof } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    if (!prof) continue;
    const { data: sols } = await admin.from('solicitacoes').select('id').eq('cliente_id', prof.id);
    for (const s of sols || []) { for (const t of ['solicitacao_fotos', 'mensagens', 'orcamentos']) await admin.from(t).delete().eq('solicitacao_id', s.id); await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', s.id); await admin.from('solicitacoes').delete().eq('id', s.id); }
    await admin.from('acidentes').delete().eq('cliente_id', prof.id);
    await admin.from('veiculos').delete().eq('profile_id', prof.id); await admin.from('notificacoes').delete().eq('profile_id', prof.id);
    await admin.from('profiles').delete().eq('id', prof.id); await admin.auth.admin.deleteUser(prof.id).catch(() => {});
  }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
