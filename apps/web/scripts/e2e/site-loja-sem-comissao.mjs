// Dono 03/11: comissao escondida tambem da loja de pecas (menu, Aprender, pagina)
//   node site-loja-sem-comissao.mjs <.env.local> [SITE]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.argv[3] || 'http://localhost:3100';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
let uid, lojaId;
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
try {
  const email = `loja-${tag}@example.test`; const senha = `Lj${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  uid = data.user.id;
  await sb.from('profiles').insert({ id: uid, tipo: 'loja_pecas', nome: 'Loja Teste', email, idioma: 'ru', telefone: '+372 5000 0000' });
  const { data: lj, error } = await sb.from('lojas_pecas').insert({ profile_id: uid, nome_fantasia: `LOJA ${tag}`, endereco: 'Kesktee 1', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: 59.437, longitude: 24.75, ativa: true }).select('id').single();
  if (error) throw new Error(error.message);
  lojaId = lj.id;
  for (const largo of [true, false]) {
    const ctx = await browser.newContext(largo ? { viewport: { width: 1366, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
    const p = await ctx.newPage();
    const tela = largo ? 'computador' : 'celular';
    await p.goto(`${SITE}/ee/ru/login`, { waitUntil: 'networkidle' });
    await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha); await p.click('button[type=submit]');
    await p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(3000);
    if (!largo) { await p.locator('header button[aria-label]').last().click().catch(() => {}); await p.waitForTimeout(800); }
    const links = await p.locator('a[href*="/loja/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    ok(`${tela}: menu da loja aparece`, links.some((h) => h.includes('/loja/cotacoes')), links.join(' '));
    ok(`${tela}: menu sem Comissao`, !links.some((h) => h.includes('/loja/comissao')), links.join(' '));
    await p.goto(`${SITE}/ee/ru/loja/comissao`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    ok(`${tela}: /loja/comissao leva ao painel`, p.url().includes('/loja/dashboard'), p.url());
    await p.goto(`${SITE}/ee/ru/loja/aprender`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    const txt = await p.locator('main').innerText().catch(() => '');
    ok(`${tela}: Aprender abre e sem modulo de comissao`, txt.length > 100 && !/Комиссия|💰/.test(txt), txt.slice(0, 200));
    await ctx.close();
  }
} catch (e) { falhas++; console.log('ERRO', e.message); }
finally {
  await browser.close();
  if (lojaId) await sb.from('lojas_pecas').delete().eq('id', lojaId);
  if (uid) { await sb.from('profiles').delete().eq('id', uid); await sb.auth.admin.deleteUser(uid); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
