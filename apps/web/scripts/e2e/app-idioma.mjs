// Idioma do app (regra da Apple, decisao do dono 10/10), na versao web do app:
//  1 aparelho em italiano + conta em estoniano -> app em italiano, conta passa a "it"
//  2 escolha no app (fora do iPhone o seletor continua) -> app e conta em estoniano,
//    e a escolha fica depois de recarregar
//  3 aparelho em portugues de Portugal -> app em pt-PT (nao pt-BR)
//   node app-idioma.mjs <.env.local>   (app web servido em http://localhost:8090)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const APP = 'http://localhost:8090';
const MOB = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/mobile/i18n/locales';
const tx = (l) => { const j = JSON.parse(fs.readFileSync(`${MOB}/${l}.json`, 'utf8')); return (k) => String(k.split('.').reduce((o, p) => o?.[p], j)); };
const IT = tx('it'), ET = tx('et'), PTPT = tx('pt-PT'), PT = tx('pt');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 200) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const email = `app-idioma-${tag}@example.test`; const senha = `Id${tag}Senha9`;
const { data: u } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
await sb.from('profiles').insert({ id: u.user.id, tipo: 'cliente', nome: 'Teste Idioma', email, idioma: 'et' });
const idiomaConta = async () => (await sb.from('profiles').select('idioma').eq('id', u.user.id).single()).data.idioma;
const b = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const corpo = async (p) => (await p.innerText('body')).replace(/\s+/g, ' ');
try {
  // ---------- 1
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'it-IT' });
  const p = await c.newPage();
  await p.goto(APP, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  ok('1 tela de entrada no idioma do aparelho (italiano)', (await corpo(p)).includes(IT('auth.entrar')));
  await p.getByLabel(IT('auth.email'), { exact: true }).locator('visible=true').first().fill(email);
  await p.getByLabel(IT('auth.senha'), { exact: true }).locator('visible=true').first().fill(senha);
  await p.getByText(IT('auth.entrar'), { exact: true }).locator('visible=true').last().click(); await p.waitForTimeout(5000);
  let t = await corpo(p);
  ok('1 conta em estoniano, aparelho em italiano: app em italiano', t.includes(IT('tabs.inicio')) && !t.includes(ET('tabs.inicio')), t.slice(0, 200));
  await p.waitForTimeout(1500);
  ok('1 a conta passa a seguir o app ("it", e-mails em italiano)', (await idiomaConta()) === 'it', await idiomaConta());

  // ---------- 2
  await p.getByText(IT('tabs.perfil'), { exact: true }).locator('visible=true').last().click(); await p.waitForTimeout(1500);
  ok('2 fora do iPhone o seletor do app continua (sem botao dos Ajustes)', (await p.getByText('Eesti', { exact: true }).count()) > 0 && !(await corpo(p)).includes(IT('perfil.idiomaAjustes')));
  await p.getByText('Eesti', { exact: true }).locator('visible=true').first().click(); await p.waitForTimeout(2500);
  t = await corpo(p);
  ok('2 escolha no app: tela em estoniano', t.includes(ET('tabs.inicio')), t.slice(0, 200));
  ok('2 conta segue a escolha ("et")', (await idiomaConta()) === 'et', await idiomaConta());
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(4000);
  t = await corpo(p);
  ok('2 escolha continua depois de recarregar', t.includes(ET('tabs.inicio')) && !t.includes(IT('tabs.inicio')), t.slice(0, 200));
  await c.close();

  // ---------- 3
  const c3 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-PT' });
  const p3 = await c3.newPage();
  await p3.goto(APP, { waitUntil: 'networkidle' }); await p3.waitForTimeout(2000);
  const t3 = await corpo(p3);
  const difere = Object.entries(JSON.parse(fs.readFileSync(`${MOB}/pt-PT.json`, 'utf8')).auth).find(([k, v]) => typeof v === 'string' && v !== PT(`auth.${k}`) && t3.includes(v));
  ok('3 aparelho em portugues de Portugal: app em pt-PT', !!difere, t3.slice(0, 200));
  await c3.close();
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 600)); }
finally {
  await b.close();
  await sb.from('notificacoes').delete().eq('profile_id', u.user.id);
  await sb.from('profiles').delete().eq('id', u.user.id); await sb.auth.admin.deleteUser(u.user.id);
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
