import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split(String.fromCharCode(10)).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tag = crypto.randomBytes(3).toString('hex'); const email = `segpais-${tag}@example.test`; const senha = `Seg${tag}Senha9`;
const { data: u } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
await sb.from('profiles').insert({ id: u.user.id, tipo: 'cliente', nome: 'Marco Test', email, idioma: 'it' });
const b = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
// italiano em Tallinn, sem permitir a localizacao
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'it-IT', timezoneId: 'Europe/Tallinn', permissions: [] });
const p = await c.newPage();
await p.goto('https://bipfix.com/it/login', { waitUntil: 'networkidle' });
await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha); await p.click('button[type=submit]'); await p.waitForTimeout(4000);
await p.goto('https://bipfix.com/it/incidente', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
const lista = async () => p.$$eval('#lista-seguradoras option', (o) => o.map((x) => x.value));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await p.locator('input[type=file]').first().setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png }).catch((e) => console.log('upload', e.message));
await p.waitForTimeout(1500);
// avanca ate o passo do seguro: procura o rotulo da opcao "seguro proprio" na pagina toda
for (let i = 0; i < 6 && !(await p.locator('input[name=pagamento_reparo]').count()); i++) {
  const btn = p.getByRole('button', { name: /Avanti|Continua|Prossimo/i }).first();
  if (!(await btn.count())) break; await btn.click().catch(() => {}); await p.waitForTimeout(800);
}
const n = await p.locator('input[name=pagamento_reparo]').count();
console.log('opcoes de pagamento visiveis:', n); console.log('botoes:', (await p.locator('button').allInnerTexts()).join(' | ')); await p.screenshot({ path: 'seguro-pais.png', fullPage: true }); console.log((await p.innerText('body')).replace(/s+/g,' ').slice(0,400));
if (n) {
  await p.locator('input[name=pagamento_reparo][value=seguro_proprio]').check();
  console.log('seguradoras sugeridas (Estonia esperado):', (await lista()).slice(0, 5).join(', '));
  await p.getByRole('button', { name: /altro paese/i }).click();
  await p.selectOption('#pais-seguro', 'IT');
  console.log('depois de escolher Italia:', (await lista()).slice(0, 4).join(', '));
  console.log('aviso carta verde:', (await p.getByText(/Carta Verde/).count()) > 0 ? 'SIM' : 'NAO');
}
await b.close();
await sb.from('profiles').delete().eq('id', u.user.id); await sb.auth.admin.deleteUser(u.user.id);
