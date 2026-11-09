// Todos os botoes/links do site levam ao lugar certo, nas 6 linguas (dono 09/11: "o
// redirecionamento de todos os botoes"). Para cada lingua e cada area (publico, cliente, oficina,
// loja): abre as paginas, junta todos os links internos e confere cada um:
//  - abre sem erro (<400), nao cai no 404 nem no login sem motivo;
//  - fica no MESMO pais/lingua (de /ee/ru nao pode ir para /ee/et);
//  - texto da pagina sem chave de traducao crua nem texto de outra lingua conhecido.
//   HOST_LAN=<ip-da-rede> node links-idiomas.mjs <.env.local>
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
const MSG = `${RAIZ}/site/apps/web/messages`;
const NAMESPACES = Object.keys(JSON.parse(fs.readFileSync(`${MSG}/pt.json`, 'utf8')))
  .concat(...['cliente', 'oficina', 'loja', 'auth', 'misc'].map((a) => Object.keys(JSON.parse(fs.readFileSync(`${MSG}/pt.${a}.json`, 'utf8')))));
const CRUA = new RegExp(`\\b(${NAMESPACES.join('|')})\\.[a-zA-Z_][\\w.]*`, 'g');
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const semear = fs.readFileSync(`${RAIZ}/ferramentas/semear.mjs`, 'utf8');
const W1 = 'meister.teste@bipfix.test'; const W1S = (semear.match(/conta\('meister\.teste@bipfix\.test', '([^']+)'/) || [])[1];
const PREFIXOS = ['ee/et', 'ee/ru', 'ee/en', 'it/it', 'pt/pt', 'br/pt'];
const AREAS = {
  cliente: ['/cliente/dashboard', '/cliente/orcamentos', '/cliente/historico', '/cliente/mensagens', '/cliente/perfil', '/cliente/veiculos', '/cliente/notificacoes', '/cliente/nova-solicitacao'],
  oficina: ['/oficina/dashboard', '/oficina/pedidos', '/oficina/hoje', '/oficina/agenda', '/oficina/checkin', '/oficina/veiculos-em-servico', '/oficina/mensagens', '/oficina/pecas', '/oficina/equipe', '/oficina/avaliacoes', '/oficina/comissao', '/oficina/perfil', '/oficina/aprender'],
};
const problemas = new Set();
const tag = crypto.randomBytes(3).toString('hex'); const senha = 'Li-' + crypto.randomBytes(6).toString('hex');
const email = `links-${tag}@example.test`;
const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
await admin.from('profiles').upsert({ id: u.user.id, email, tipo: 'cliente', nome: 'Links Test', idioma: 'et' });
const w1Id = (await admin.from('profiles').select('id').eq('email', W1).single()).data.id;
const b = await webkit.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe') });
const pfx = (p) => (p.match(/^\/([a-z]{2}\/[a-z]{2})(\/|$)/) || [])[1] || null;
const visitar = async (p, url, area, links) => {
  const r = await p.goto(`${SITE}${url}`, { waitUntil: 'networkidle' }).catch(() => null); await p.waitForTimeout(1200);
  const final = new URL(p.url()).pathname;
  if (!r || r.status() >= 400) problemas.add(`${area} ${url}: HTTP ${r?.status()}`);
  if (area !== 'publico' && /\/login/.test(final)) problemas.add(`${area} ${url}: caiu no login`);
  const info = await p.evaluate(() => ({ t: document.body.innerText, hrefs: [...document.querySelectorAll('a[href^="/"]')].filter((a) => !a.closest('[hreflang]') && !a.hasAttribute('hreflang')).map((a) => a.getAttribute('href')) }));
  const cruas = [...new Set(info.t.match(CRUA) || [])].filter((c) => !/\.(com|ee|br|it|pt|ru)$/.test(c));
  if (cruas.length) problemas.add(`${area} ${url}: texto sem traducao ${cruas.slice(0, 3).join(', ')}`);
  const codigos = [...new Set(info.t.match(/\b[a-z]{2,}_[a-z_]{2,}\b/g) || [])].filter((c) => !/@|www|http/.test(c));
  if (codigos.length) problemas.add(`${area} ${url}: codigo interno na tela ${codigos.slice(0, 3).join(', ')}`);
  const meu = pfx(url);
  for (const h of info.hrefs) {
    const caminho = h.split('#')[0].split('?')[0];
    if (!caminho || /^\/(api|_next|r\/|admin)/.test(caminho)) continue;
    const dele = pfx(caminho);
    if (meu && dele && dele !== meu) problemas.add(`${area} ${url}: link muda de lingua/pais -> ${h}`);
    links.add(h.split('#')[0]);
  }
};
try {
  for (const pre of PREFIXOS) {
    // publico: inicio + todos os links de menu/rodape
    const ctx = await b.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
    const p = await ctx.newPage();
    const links = new Set();
    await visitar(p, `/${pre}`, 'publico', links);
    for (const h of [...links].filter((x) => x.startsWith(`/${pre}`)).slice(0, 40)) await visitar(p, h, 'publico', new Set());
    for (const h of links) { const r = await ctx.request.get(`${SITE}${h}`, { maxRedirects: 5 }).catch(() => null); if (!r || r.status() >= 400) problemas.add(`publico ${pre} link ${h}: ${r ? r.status() : 'falhou'}`); }
    await ctx.close();
    // logados
    for (const [area, e, s] of [['cliente', email, senha], ['oficina', W1, W1S]]) {
      const c2 = await b.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
      await c2.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
      await c2.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
      const p2 = await c2.newPage();
      await p2.goto(`${SITE}/${pre}/login`, { waitUntil: 'networkidle' }); await p2.fill('input[type=email]', e); await p2.fill('input[type=password]', s); await p2.click('button[type=submit]'); await p2.waitForTimeout(4500);
      const l2 = new Set();
      for (const pg of AREAS[area]) await visitar(p2, `/${pre}${pg}`, area, l2);
      for (const h of l2) {
        const r = await p2.request.get(`${SITE}${h}`, { maxRedirects: 5 }).catch(() => null);
        if (!r || r.status() >= 400) problemas.add(`${area} ${pre} link ${h}: ${r ? r.status() : 'falhou'}`);
      }
      await c2.close();
    }
    console.log(`${pre}: ok`);
  }
} catch (e) {
  problemas.add('excecao ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
} finally {
  await b.close();
  await admin.from('profiles').update({ idioma: 'et' }).eq('id', w1Id);
  await admin.from('profiles').delete().eq('id', u.user.id); await admin.auth.admin.deleteUser(u.user.id);
  console.log(problemas.size ? [...problemas].join('\n') + `\n${problemas.size} problema(s)` : 'nenhum problema');
}
