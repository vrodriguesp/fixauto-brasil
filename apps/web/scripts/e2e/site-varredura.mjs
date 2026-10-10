// Varredura do SITE em producao, tela de celular (390 px): todas as paginas
// das areas logadas (cliente, oficina, loja, admin) nos 6 idiomas + menu.
// Por pagina: status, nao caiu no login/404, sem chave de traducao crua, sem
// transbordo, sem erro no console; todo link interno responde.
// Contas temporarias (apagadas no fim).   node site-varredura.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const SITE = process.argv[3] || 'https://bipfix.com';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const MSG = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/messages';
const NAMESPACES = Object.keys(JSON.parse(fs.readFileSync(`${MSG}/pt.json`, 'utf8')))
  .concat(...['cliente', 'oficina', 'loja', 'auth', 'misc'].map((a) => Object.keys(JSON.parse(fs.readFileSync(`${MSG}/pt.${a}.json`, 'utf8')))));
const CRUA = new RegExp(`\\b(${NAMESPACES.join('|')})\\.[a-zA-Z_][\\w.]*`, 'g');
// enderecos por pais/idioma desde 09/10/2026
const PREFIXOS = { pt: 'br/pt', 'pt-PT': 'pt/pt', en: 'ee/en', et: 'ee/et', it: 'it/it', ru: 'ee/ru' };
const AREAS = {
  cliente: ['/cliente/dashboard', '/cliente/nova-solicitacao', '/cliente/orcamentos', '/cliente/historico', '/cliente/mensagens', '/cliente/perfil', '/cliente/veiculos'],
  oficina: ['/oficina/dashboard', '/oficina/solicitacoes', '/oficina/agenda', '/oficina/checkin', '/oficina/veiculos-em-servico', '/oficina/pecas', '/oficina/equipe', '/oficina/capacidade', '/oficina/distribuicao', '/oficina/avaliacoes', '/oficina/comissao', '/oficina/perfil', '/oficina/aprender'],
  loja_pecas: ['/loja/dashboard', '/loja/cotacoes', '/loja/pedidos', '/loja/catalogo', '/loja/comissao', '/loja/perfil', '/loja/aprender'],
};
const ADMIN = ['/admin/dashboard', '/admin/usuarios', '/admin/oficinas', '/admin/comissoes', '/admin/comissoes-pecas', '/admin/pecas', '/admin/solicitacoes', '/admin/emergencias', '/admin/veiculos', '/admin/leads-parceiros', '/admin/monitoramento', '/admin/auditoria'];

const criados = [];
const problemas = [];
async function conta(tipo) {
  const email = `varre-${tipo}-${crypto.randomBytes(3).toString('hex')}@example.test`;
  const senha = crypto.randomBytes(12).toString('base64url') + 'A1';
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  const id = data.user.id; criados.push(id);
  await sb.from('profiles').insert({ id, tipo, nome: `VARREDURA ${tipo}`, email, telefone: '+37200000000', idioma: 'et', termos_aceitos_em: new Date().toISOString(), termos_versao: '2026-09-30' });
  const base = { profile_id: id, nome_fantasia: 'VARREDURA', endereco: 'Test 1', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', ativa: true };
  if (tipo === 'oficina') await sb.from('oficinas').insert({ ...base, latitude: 59.43, longitude: 24.75, especialidades: ['mecanica'] });
  if (tipo === 'loja_pecas') await sb.from('lojas_pecas').insert(base);
  return { email, senha };
}
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
async function entrar(ctx, c, prefixo) {
  const page = await ctx.newPage();
  await page.goto(`${SITE}/${prefixo}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', c.email);
  await page.fill('input[type=password]', c.senha);
  await page.click('button[type=submit]');
  await page.waitForTimeout(4000);
  return page;
}
async function examinar(page, rotulo, url, links, esperado) {
  const erros = [];
  const on = (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource.*40[134]|clarity|google/i.test(m.text())) erros.push(m.text()); };
  page.on('console', on);
  const r = await page.goto(url, { waitUntil: 'networkidle' }).catch((e) => ({ status: () => 0, e }));
  await page.waitForTimeout(1500);
  page.off('console', on);
  const final = new URL(page.url()).pathname;
  const info = await page.evaluate(() => ({ t: document.body.innerText,
    // elemento saindo da tela (fora de area com rolagem propria), nao so a largura da pagina
    sw: Math.max(document.documentElement.scrollWidth - window.innerWidth, [...document.querySelectorAll('body *')].filter((e) => {
      const r = e.getBoundingClientRect();
      if (!r.width || r.right <= window.innerWidth + 1) return false;
      for (let p = e.parentElement; p; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return false; }
      return true;
    }).length ? 999 : 0), hrefs: [...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href')) }));
  if (r.status() !== 200) problemas.push(`${rotulo}: HTTP ${r.status()}`);
  if (!final.startsWith(esperado)) problemas.push(`${rotulo}: foi parar em ${final}`);
  if (/\b404\b/.test(info.t) && /(not found|nao encontrad|non trovat|ei leitud|не найден)/i.test(info.t)) problemas.push(`${rotulo}: pagina 404`);
  const cruas = [...new Set(info.t.match(CRUA) || [])].filter((c) => !/\.(com|ee|br|it|pt|ru)$/.test(c));
  if (cruas.length) problemas.push(`${rotulo}: texto sem traducao ${cruas.slice(0, 3).join(', ')}`);
  // codigo interno aparecendo na tela (snake_case: mao_de_obra, em_andamento...)
  const codigos = [...new Set(info.t.match(/[a-z]{2,}_[a-z_]{2,}/g) || [])].filter((c) => !/@|www|http/.test(c));
  if (codigos.length) problemas.push(`${rotulo}: codigo interno na tela ${codigos.slice(0, 3).join(', ')}`);
  if (info.sw > 1) problemas.push(`${rotulo}: transborda ${info.sw}px`);
  for (const e of erros.slice(0, 2)) problemas.push(`${rotulo}: console ${e.slice(0, 140)}`);
  info.hrefs.forEach((h) => links.add(h.split('#')[0]));
}

try {
  const links = new Set();
  for (const [tipo, paginas] of Object.entries(AREAS)) {
    const c = await conta(tipo);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await entrar(ctx, c, 'et');
    for (const [loc, pre] of Object.entries(PREFIXOS)) {
      for (const p of paginas) await examinar(page, `${tipo} /${pre}${p}`, `${SITE}/${pre}${p}`, links, `/${pre}${p.split('/').slice(0, 2).join('/')}`);
    }
    console.log(`${tipo}: ${paginas.length * 6} paginas`);
    await ctx.close();
  }
  // admin: entra pela tela de login em outro idioma (o caso do 404) e navega pelo menu
  const a = await conta('admin');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await entrar(ctx, a, 'it');
  for (const p of ADMIN) await examinar(page, `admin ${p}`, `${SITE}${p}`, links, '/admin');
  for (const pre of ['br/pt', 'it/it', 'pt-br']) {
    const r = await page.goto(`${SITE}/${pre}/admin/oficinas`, { waitUntil: 'networkidle' });
    if (new URL(page.url()).pathname !== '/admin/oficinas') problemas.push(`admin /${pre}/admin/oficinas foi para ${page.url()} (${r.status()})`);
  }
  // menu do admin no celular: cada link abre sem 404
  await page.goto(`${SITE}/admin/dashboard`, { waitUntil: 'networkidle' });
  const menu = await page.evaluate(() => [...document.querySelectorAll('nav a[href*="/admin"]')].map((x) => x.getAttribute('href')));
  for (const h of [...new Set(menu)]) {
    const r = await page.goto(`${SITE}${h}`, { waitUntil: 'domcontentloaded' });
    if (r.status() !== 200 || !new URL(page.url()).pathname.startsWith('/admin')) problemas.push(`admin menu ${h}: ${r.status()} ${page.url()}`);
  }
  console.log(`admin: ${ADMIN.length} paginas + ${menu.length} links do menu`);
  await ctx.close();
  // todos os links internos vistos
  const ctx2 = await browser.newContext();
  // /api/* (ex.: exportar do admin) exige login: fora da checagem anonima
  for (const l of [...links].filter((x) => !x.startsWith('/api/'))) {
    const r = await ctx2.request.get(`${SITE}${l}`, { maxRedirects: 5 }).catch(() => null);
    if (!r || r.status() >= 400) problemas.push(`link ${l}: ${r ? r.status() : 'falhou'}`);
  }
  console.log(`links internos: ${links.size}`);
} finally {
  await browser.close();
  for (const id of criados) {
    await sb.from('oficinas').delete().eq('profile_id', id);
    await sb.from('lojas_pecas').delete().eq('profile_id', id);
    await sb.from('notificacoes').delete().eq('profile_id', id);
    await sb.from('profiles').delete().eq('id', id);
    await sb.auth.admin.deleteUser(id);
  }
  const unicos = [...new Set(problemas)];
  console.log(unicos.length ? unicos.join('\n') + `\n${unicos.length} problema(s)` : 'nenhum problema');
}
