// Captura da tela REAL do app (local, conta de teste local) "pedido novo" com a
// foto do painel anexada, para por na tela do celular das imagens do post (06/11).
//   node tela-post-painel.mjs <.env.local> <pasta das fotos>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: banco nao e o local');
const PASTA = process.argv[3];
const APP = 'http://localhost:8090';
const MOB = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/site/apps/mobile/i18n/locales';
const txt = (loc) => { const j = JSON.parse(fs.readFileSync(`${MOB}/${loc}.json`, 'utf8')); return (k) => String(k.split('.').reduce((o, p) => o?.[p], j)); };
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tag = crypto.randomBytes(3).toString('hex');
const contas = [];
const CENAS = [
  { quem: 'homem', lingua: 'et', loc: 'et-EE', carro: ['Volkswagen', 'Passat', '2014'], foto: '_painel_homem.jpg', texto: 'Armatuurlaual põleb hoiatustuli. Auto sõidab, aga tuli ei kustu.' },
  { quem: 'homem', lingua: 'ru', loc: 'ru-RU', carro: ['Volkswagen', 'Passat', '2014'], foto: '_painel_homem.jpg', texto: 'На панели горит предупреждающая лампочка. Машина едет, но лампочка не гаснет.' },
  { quem: 'mulher', lingua: 'et', loc: 'et-EE', carro: ['Skoda', 'Octavia', '2017'], foto: '_painel_mulher.jpg', texto: 'Armatuurlaual põleb oranž hoiatustuli. Mida see tähendab?' },
  { quem: 'mulher', lingua: 'ru', loc: 'ru-RU', carro: ['Skoda', 'Octavia', '2017'], foto: '_painel_mulher.jpg', texto: 'На панели горит оранжевая лампочка. Что это значит?' },
];
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
try {
  for (const c of CENAS) {
    const T = txt(c.lingua);
    const email = `tela-post-${c.quem}-${c.lingua}-${tag}@example.test`; const senha = `Tela${tag}Senha9`;
    const { data: u } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
    contas.push(u.user.id);
    await sb.from('profiles').insert({ id: u.user.id, tipo: 'cliente', nome: 'Kasutaja', email, idioma: c.lingua });
    await sb.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: c.carro[0], fipe_modelo: c.carro[1], fipe_ano: c.carro[2] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: c.loc, permissions: [] });
    const page = await ctx.newPage();
    await page.goto(APP, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
    await page.getByLabel(T('auth.email'), { exact: true }).locator('visible=true').first().fill(email);
    await page.getByLabel(T('auth.senha'), { exact: true }).locator('visible=true').first().fill(senha);
    await page.getByText(T('auth.entrar'), { exact: true }).locator('visible=true').last().click();
    await page.waitForTimeout(4000);
    await page.goto(`${APP}/nova-solicitacao`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
    await page.getByText(T('constants.tiposServico.mecanica'), { exact: false }).locator('visible=true').first().click();
    await page.locator('textarea').first().fill(c.texto);
    await page.getByText(`${c.carro[0]} ${c.carro[1]}`).locator('visible=true').first().click();
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByText(T('emergencia.galeria')).locator('visible=true').first().click()]);
    await fc.setFiles(path.join(PASTA, c.foto));
    await page.waitForTimeout(2500);
    // tela comecando no topo: servico, descricao, carro e a foto anexada
    await page.evaluate(() => window.scrollTo(0, 0));
    const destino = path.join(PASTA, `_tela_app_${c.quem}_${c.lingua}.png`);
    await page.screenshot({ path: destino });
    console.log('ok', destino);
    await ctx.close();
  }
} catch (e) { console.log('FALHA', e.message); } finally {
  await browser.close();
  for (const id of contas) {
    const { data: s } = await sb.from('solicitacoes').select('id').eq('cliente_id', id);
    for (const x of s || []) await sb.from('solicitacoes').delete().eq('id', x.id);
    await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id);
  }
}
