// Mostra o passo 3 do pedido LOGADO do site com "Rehvid" (pergunta do dono 06/11:
// a lista de servicos existia antes?). Conta temporaria local, apagada no fim.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('so local');
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const email = `ver-lista-${crypto.randomBytes(3).toString('hex')}@example.test`;
const senha = 'Ver-' + crypto.randomBytes(6).toString('hex');
const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
await admin.from('profiles').insert({ id: u.user.id, tipo: 'cliente', nome: 'Ver lista', email, idioma: 'et' });
await admin.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2017' });
const b = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3100/ee/et/login', { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha);
  await p.click('button[type=submit]'); await p.waitForTimeout(4000);
  await p.goto('http://localhost:3100/ee/et/cliente/nova-solicitacao', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.getByText('Toyota Corolla').first().click();
  await p.getByRole('button', { name: 'Edasi', exact: true }).click();
  await p.getByRole('button', { name: /Rehvid/ }).first().click();
  await p.getByRole('button', { name: 'Edasi', exact: true }).click();
  await p.waitForTimeout(1000);
  await p.screenshot({ path: process.argv[3], fullPage: false });
  console.log((await p.innerText('main').catch(() => p.innerText('body'))).slice(0, 600));
} finally {
  await b.close();
  await admin.from('veiculos').delete().eq('profile_id', u.user.id);
  await admin.from('profiles').delete().eq('id', u.user.id);
  await admin.auth.admin.deleteUser(u.user.id);
}
