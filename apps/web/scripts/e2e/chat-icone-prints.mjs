// Prints do botao do chat de suporte, antes/depois da troca do icone (dono 19/11):
// visitante (pagina inicial, rolada) e oficina logada (painel), ET e RU, 360/390/1366.
// Cria uma oficina temporaria no banco LOCAL e apaga no fim.
//   node chat-icone-prints.mjs <.env.local> <SITE> <antes|depois> [pasta]
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
const SITE = process.argv[3]; const FASE = process.argv[4] || 'depois';
const PASTA = process.argv[5] || 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/chat-icone';
fs.mkdirSync(PASTA, { recursive: true });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tag = crypto.randomBytes(3).toString('hex');
const email = `icone-oficina-${tag}@example.test`; const senha = `Ic${tag}Senha9`;
const { data: u } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
await sb.from('profiles').insert({ id: u.user.id, tipo: 'oficina', nome: 'Icone Teste', email, idioma: 'et', telefone: '+372 5000 0000', termos_aceitos_em: new Date().toISOString(), termos_versao: '2026-09-30' });
const { data: of } = await sb.from('oficinas').insert({ profile_id: u.user.id, nome_fantasia: `Icone Autoteenindus ${tag}`, endereco: 'Tartu mnt 50', cidade: 'Tallinn', estado: 'Harjumaa', cep: '10115', pais: 'EE', latitude: 59.4325, longitude: 24.7703, raio_atendimento_km: 30, especialidades: ['mecanica'], ativa: true }).select('id').single();
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const PRE = { et: '/ee/et', ru: '/ee/ru' };
const TELAS = { 360: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true }, 390: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, 1366: { viewport: { width: 1366, height: 900 } } };
try {
  for (const [w, tela] of Object.entries(TELAS)) for (const [l, pre] of Object.entries(PRE)) {
    // visitante: pagina inicial rolada (o botao so aparece depois de 300 px no celular)
    let ctx = await browser.newContext(tela); await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
    let p = await ctx.newPage(); await p.goto(`${SITE}${pre}`, { waitUntil: 'networkidle' }); await p.evaluate(() => window.scrollTo(0, 700)); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${PASTA}/${FASE}_visitante_${l}_${w}.png` });
    if (w !== '1366') { await p.waitForTimeout(5000); await p.screenshot({ path: `${PASTA}/${FASE}_visitante_${l}_${w}_recolhido.png` }); }
    await ctx.close();
    // oficina logada: painel (barra de baixo no celular)
    ctx = await browser.newContext(tela); await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} });
    p = await ctx.newPage(); await p.goto(`${SITE}${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha); await p.click('button[type=submit]');
    await p.waitForURL((x) => !x.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {}); await p.goto(`${SITE}${pre}/oficina/dashboard`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${PASTA}/${FASE}_oficina_${l}_${w}.png` });
    await ctx.close();
    console.log(`prints ${FASE} ${l} ${w}`);
  }
  // pagina publica da oficina em 360 (tabela do horario ao lado do botao) e login com o aviso de cookies em 360
  const ctx = await browser.newContext(TELAS[360]); const p = await ctx.newPage();
  await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  await p.screenshot({ path: `${PASTA}/${FASE}_login_cookies_et_360.png` });
  const r = await p.evaluate(() => { const b = document.querySelector('button[type=submit]'); const a = document.querySelector('[data-testid=aviso-cookies]'); if (!b) return 'sem botao'; b.scrollIntoView({ block: 'start' }); const x = b.getBoundingClientRect(); const topo = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2); return JSON.stringify({ botaoBottom: Math.round(x.bottom), avisoTop: a ? Math.round(a.getBoundingClientRect().top) : null, coberto: !!topo && !b.contains(topo) && topo !== b }); });
  console.log('login 360 com aviso de cookies, botao rolado para o topo:', r);
  await p.screenshot({ path: `${PASTA}/${FASE}_login_cookies_et_360_rolado.png` });
  await ctx.close();
} finally {
  await browser.close();
  await sb.from('oficinas').delete().eq('id', of.id); await sb.from('profiles').delete().eq('id', u.user.id); await sb.auth.admin.deleteUser(u.user.id);
}
