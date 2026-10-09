// Idioma dos paineis logados: entra pelo /<idioma>/login e abre o painel.
// node teste-idioma-painel.mjs <.env.local> [site]
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const SITE = process.argv[3] || 'https://bipfix.com';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const email = `idioma-${crypto.randomBytes(3).toString('hex')}@example.test`;
const senha = crypto.randomBytes(12).toString('base64url') + 'A1';
const IDIOMAS = { et: 'Töölaud|ülevaatamisel|Logi välja', ru: 'Выйти|проверке', it: 'Esci|verifica', 'pt-pt': 'Sair|análise', 'pt-br': 'Sair|análise', en: 'Log out|review' };
let uid;
try {
  const { data } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  uid = data.user.id;
  await admin.from('profiles').insert({ id: uid, tipo: 'oficina', nome: 'TESTE IDIOMA', email, idioma: 'et' });
  await admin.from('oficinas').insert({ profile_id: uid, nome_fantasia: 'TESTE IDIOMA', endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '1', pais: 'EE', latitude: 59.4, longitude: 24.7, ativa: false });
  const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' });
  const page = await ctx.newPage();
  await page.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', senha);
  await page.click('button[type=submit]');
  await page.waitForTimeout(4000);
  for (const [pre, re] of Object.entries(IDIOMAS)) {
    await page.goto(`${SITE}/${pre}/oficina/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const lang = await page.getAttribute('html', 'lang');
    const txt = await page.innerText('body');
    const bateu = new RegExp(re).test(txt);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(`${bateu ? 'ok  ' : 'FALHA'} /${pre}: html lang=${lang} url=${page.url().replace(SITE, '')} transbordo=${sw}`);
    await page.screenshot({ path: `painel-${pre}.png` });
  }
  await browser.close();
} finally {
  if (uid) { await admin.from('oficinas').delete().eq('profile_id', uid); await admin.from('profiles').delete().eq('id', uid); await admin.auth.admin.deleteUser(uid); }
  console.log('limpeza ok');
}
