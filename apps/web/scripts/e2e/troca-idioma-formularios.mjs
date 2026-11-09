// Trocar a lingua NAO pode apagar o que a pessoa digitou - em TODOS os formularios do site
// (dono 09/11: "perdas de registros ao mudar a lingua"). WebKit, iPhone 14. Em cada formulario:
// preenche os campos visiveis como uma pessoa (texto, numero, data, selecao), troca para russo pelo
// seletor de lingua, e confere campo a campo o que voltou. Foto antes/depois.
//   HOST_LAN=<ip-da-rede> node troca-idioma-formularios.mjs <.env.local>
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
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/troca-idioma`; fs.mkdirSync(OUT, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const semear = fs.readFileSync(`${RAIZ}/ferramentas/semear.mjs`, 'utf8');
const W1 = 'meister.teste@bipfix.test'; const W1S = (semear.match(/conta\('meister\.teste@bipfix\.test', '([^']+)'/) || [])[1];
const tag = crypto.randomBytes(3).toString('hex'); const senha = 'Ti-' + crypto.randomBytes(6).toString('hex');
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const email = `troca-${tag}@example.test`;
const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
await admin.from('profiles').upsert({ id: u.user.id, email, tipo: 'cliente', nome: 'Troca Lingua', idioma: 'et' });
const w1Id = (await admin.from('profiles').select('id').eq('email', W1).single()).data.id;
const b = await webkit.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe') });
const ctxNovo = async () => { const c = await b.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'et-EE' }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); return c; };
const entrar = async (ctx, e, s) => { const p = await ctx.newPage(); await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', e); await p.fill('input[type=password]', s); await p.click('button[type=submit]'); await p.waitForTimeout(4500); return p; };
// preenche como pessoa e devolve o que foi posto, por id/name
const preencher = async (p) => p.evaluate(() => {
  const set = (el, v) => { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); };
  const feito = {};
  let i = 0;
  for (const el of document.querySelectorAll('main input, main textarea, main select')) {
    const k = el.id ? `#${el.id}` : el.getAttribute('name') ? `@${el.getAttribute('name')}` : '';
    if (!k || !el.offsetParent || el.disabled || el.readOnly || el.tabIndex === -1) continue;
    const t = el.type;
    if (['password', 'file', 'hidden', 'submit', 'button', 'checkbox', 'radio', 'range', 'search'].includes(t)) continue;
    i++;
    let v;
    if (el instanceof HTMLSelectElement) { const op = [...el.options].find((o, j) => j > 0 && o.value); if (!op) continue; v = op.value; }
    else if (t === 'email') v = `teste${i}@example.test`;
    else if (t === 'tel') v = '5123456' + i;
    else if (t === 'number') v = String(10 + i);
    else if (t === 'date') v = new Date(Date.now() + (3 + i) * 86400e3).toISOString().slice(0, 10);
    else if (t === 'time') v = '10:30';
    else if (/placa|plate|numbri|cc5ef-1/i.test(el.id + (el.name || '') + (el.placeholder || ''))) v = '123ABC';
    else if (/ano|year|aasta/i.test(el.id + (el.name || '') + (el.placeholder || ''))) v = '2018';
    else v = `Tekst ${i} enne keele vahetust`;
    set(el, v); feito[k] = el.value || v; // o valor que o campo guardou (placa em maiusculas, ano so numeros)
  }
  return feito;
});
const conferir = async (p, feito) => p.evaluate((feito) => {
  const perdidos = [];
  for (const [k, v] of Object.entries(feito)) {
    const el = k.startsWith('#') ? document.getElementById(k.slice(1)) : document.querySelector(`[name="${k.slice(1)}"]`);
    if (!el) { perdidos.push(`${k} sumiu`); continue; }
    if (el.value !== v) perdidos.push(`${k}: "${el.value}" (era "${v}")`);
  }
  return perdidos;
}, feito);
const caso = async (p, nome, url, antes) => {
  await p.goto(`${SITE}${url}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  if (antes) { await antes(p); await p.waitForTimeout(1500); }
  const feito = await preencher(p);
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, `${nome}_antes.png`), fullPage: true });
  if (!Object.keys(feito).length) { ok(`${nome}: tem campos para testar`, false, url); return; }
  const urlAntes = p.url();
  await p.evaluate(() => document.querySelector('a[hreflang="ru-EE"]')?.click());
  await p.waitForTimeout(7000);
  await p.screenshot({ path: path.join(OUT, `${nome}_depois_ru.png`), fullPage: true });
  const mudou = /\/ee\/ru/.test(p.url());
  const perdidos = await conferir(p, feito);
  ok(`${nome}: trocou para russo e manteve ${Object.keys(feito).length} campo(s)`, mudou && !perdidos.length, mudou ? perdidos.join(' | ') : `nao mudou de lingua: ${urlAntes} -> ${p.url()}`);
};
try {
  // publico (sem login)
  { const ctx = await ctxNovo(); const p = await ctx.newPage();
    await caso(p, 'login', '/ee/et/login');
    await caso(p, 'cadastro_cliente', '/ee/et/registreeru?tipo=cliente');
    await caso(p, 'cadastro_oficina', '/ee/et/registreeru?tipo=oficina');
    await caso(p, 'pedido_sem_conta', '/ee/et/paring', async (pp) => { const bt = pp.locator('main button').filter({ hasText: /Mehaanika|Hooldus|mehaanika/ }).first(); if (await bt.count()) { await bt.click(); await pp.waitForTimeout(1200); } const ed = pp.locator('main button').filter({ hasText: /^Edasi|Jätka/ }).first(); if (await ed.count() && await ed.isEnabled()) { await ed.click(); await pp.waitForTimeout(1200); } });
    await caso(p, 'acidente_sem_conta', '/ee/et/avarii');
    await caso(p, 'parceiro', '/ee/et/hakka-partneriks');
    await ctx.close(); }
  // cliente
  { const ctx = await ctxNovo(); const p = await entrar(ctx, email, senha);
    await caso(p, 'cliente_novo_pedido', '/ee/et/cliente/nova-solicitacao', async (pp) => { const bt = pp.locator('main button').filter({ hasText: /Mehaanika|Hooldus|mehaanika/ }).first(); if (await bt.count()) { await bt.click(); await pp.waitForTimeout(1200); } const ed = pp.locator('main button').filter({ hasText: /^Edasi|Jätka/ }).first(); if (await ed.count() && await ed.isEnabled()) { await ed.click(); await pp.waitForTimeout(1200); } });
    await caso(p, 'cliente_perfil', '/ee/et/cliente/perfil');
    await caso(p, 'cliente_acidente', '/ee/et/avarii');
    await caso(p, 'cliente_veiculo_novo', '/ee/et/cliente/veiculos', async (pp) => { const bt = pp.locator('main button').filter({ hasText: /\+|Lisa|lisa/ }).first(); if (await bt.count()) await bt.click(); });
    await ctx.close(); }
  // oficina
  { const ctx = await ctxNovo(); const p = await entrar(ctx, W1, W1S);
    await caso(p, 'oficina_perfil', '/ee/et/oficina/perfil');
    await caso(p, 'oficina_checkin_walkin', '/ee/et/oficina/checkin');
    await caso(p, 'oficina_equipe', '/ee/et/oficina/equipe', async (pp) => { const bt = pp.locator('main button').filter({ hasText: /\+|Lisa|lisa/ }).first(); if (await bt.count()) await bt.click(); });
    await ctx.close(); }
} catch (e) {
  falhas++; console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
} finally {
  await b.close();
  await admin.from('profiles').update({ idioma: 'et' }).eq('id', w1Id);
  await admin.from('veiculos').delete().eq('profile_id', u.user.id); await admin.from('profiles').delete().eq('id', u.user.id); await admin.auth.admin.deleteUser(u.user.id);
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
