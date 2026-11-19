// E2E LOCAL do botao antigo do e-mail de confirmacao (dono 19/11, migracao 100):
// depois de o pedido ser confirmado (codigo ou link) o pendente e apagado, mas o botao do
// e-mail tem de continuar a levar a pessoa ao pedido (login se preciso), nunca a "link
// invalido". API: { jaEnviado, solicitacaoId } sem dados do pedido; confirmar/cancelar de
// novo nao fazem nada; uuid aleatorio -> 410. Telas (390 e 1280, 6 idiomas): deslogado ->
// login com voltar -> codigo por e-mail (conta sem senha) / senha -> pedido; logado -> pedido
// direto; link de cancelar depois da confirmacao nao cancela; pendente vencido/cancelado ->
// tela com "ver meu pedido" + "novo pedido" (sem beco sem saida).
//   SITE=http://localhost:3105 node hotfix-link-pedido.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
const EMAILS = env.EMAIL_PASTA_TESTE;
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/hotfix-link';
fs.mkdirSync(OUT, { recursive: true });
const WEBMSG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../messages');
const msgWeb = (l) => {
  const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.json`, 'utf8'));
  for (const area of ['cliente', 'misc', 'auth']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.${area}.json`, 'utf8')));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const LOCS = ['et', 'ru', 'en', 'it', 'pt-PT', 'pt'];
const PREFIX = { et: '/ee/et', ru: '/ee/ru', en: '/ee/en', it: '/it/it', 'pt-PT': '/pt/pt', pt: '/br/pt' };
const SLUG = { et: '/paring', ru: '/zayavka', en: '/request', it: '/richiesta', 'pt-PT': '/pedido', pt: '/pedido' };
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Hotf-' + crypto.randomBytes(6).toString('hex');
let falhas = 0, total = 0;
const ok = (n, c, x = '') => { total++; if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 240) : ''}`); };
const contas = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => `10.98.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
const emailsDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort()
  .map((f) => fs.readFileSync(path.join(EMAILS, f), 'utf8'));
const esperarEmail = async (email, depois) => { for (let i = 0; i < 30; i++) { const m = emailsDe(email, depois); if (m.length) return m.at(-1); await sleep(300); } return ''; };
const codigoDe = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').match(/(?<![\d#])\d{6}(?!\d)/)?.[0];
const linksDo = (html) => [...html.matchAll(/href="([^"]+\?p=[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/^https?:\/\/[^/]+/, SITE));
const idT = (u) => ({ id: u.searchParams.get('p'), t: new URLSearchParams(u.hash.slice(1)).get('t'), o: u.searchParams.get('o') || undefined });
const post = async (rota, body) => { const r = await fetch(`${SITE}${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip() }, body: JSON.stringify(body) }); return { status: r.status, d: await r.json().catch(() => ({})) }; };
const retomar = (u, acao) => post('/api/pedido-sem-conta/retomar', { ...idT(u), acao });
// pedido sem conta pela API (como o site): devolve id do pendente, user, codigo e os 2 links do e-mail
const pedir = async (l, email, extra = {}) => {
  const form = new FormData();
  form.append('dados', JSON.stringify({ origem: 'site', idioma: l, nome: `Hotfix ${l}`, email, telefone: '+372 5123 4567', aceitouTermos: true,
    tipo: 'mecanica', descricao: `Rua Secreta 99 descricao ${l}`, urgencia: 'media', endereco: 'Rua Secreta 99, Tallinn', latitude: 59.437, longitude: 24.745, pais: 'EE',
    veiculo: { tipo: 'cars', marca: 'Toyota', modelo: 'Corolla', ano: '2018', codigo: null, placa: 'HTF' + l.slice(0, 2).toUpperCase() }, ...extra }));
  const t0 = Date.now();
  const r = await fetch(`${SITE}/api/pedido-sem-conta`, { method: 'POST', body: form, headers: { 'x-real-ip': ip() } });
  const d = await r.json();
  if (!d.pendenteId) throw new Error(`pedir ${l}: ${r.status} ${JSON.stringify(d)}`);
  const p = (await admin.from('pedidos_pendentes').select('id, user_id').eq('id', d.pendenteId).maybeSingle()).data;
  if (p) contas.add(p.user_id);
  const html = await esperarEmail(email, t0);
  const links = linksDo(html).map((x) => new URL(x));
  return { id: d.pendenteId, user: p?.user_id, codigo: codigoDe(html), links, email };
};
const confirmarCodigo = (p) => post('/api/pedido-sem-conta/confirmar', { id: p.id, codigo: p.codigo });
const solDe = async (user) => (await admin.from('solicitacoes').select('id, pendente_id, status').eq('cliente_id', user).maybeSingle()).data;
const nSols = async (user) => (await admin.from('solicitacoes').select('id', { count: 'exact', head: true }).eq('cliente_id', user)).count;
const nAvisos = async (solId) => (await admin.from('notificacoes').select('id', { count: 'exact', head: true }).eq('tipo', 'nova_solicitacao').eq('dados->>solicitacao_id', solId)).count;
const uuidAleatorio = () => crypto.randomUUID();

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const contexto = async (largura) => {
  const ctx = await browser.newContext({ viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500 });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  return ctx;
};
const checar = async (page, nome) => {
  const t = await page.innerText('body');
  ok(`${nome}: sem chave sem traducao`, !/\b(pedidoSemConta|constants|erros|auth|cliente)\.[a-zA-Z_]+/.test(t) && !t.includes('??'));
  ok(`${nome}: sem rolagem lateral`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const sobrep = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('[data-testid=retomar-pedido] button, [data-testid=retomar-pedido] a')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect());
    const fora = bs.some((r) => r.left < 0 || r.right > innerWidth + 1);
    const cruza = bs.some((a, i) => bs.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
    return { fora, cruza, n: bs.length };
  });
  ok(`${nome}: botoes inteiros e sem sobreposicao`, !sobrep.fora && !sobrep.cruza, JSON.stringify(sobrep));
  return t;
};
const esperarUrl = (page, fn, ms = 30000) => page.waitForURL(fn, { timeout: ms }).then(() => true, () => false);
// login por codigo de e-mail na tela de login (conta sem senha)
const entrarPorCodigo = async (page, email) => {
  await page.getByTestId('login-receber-codigo').click();
  await page.getByTestId('login-codigo-email').waitFor();
  await page.locator('#login-codigo-email').fill(email);
  const t2 = Date.now();
  await page.locator('[data-testid=login-codigo-email] button[type=submit]').click();
  await page.getByTestId('login-codigo-digitar').waitFor({ timeout: 20000 });
  const cod = codigoDe(await esperarEmail(email, t2));
  await page.locator('#login-codigo').fill(cod || '');
  await page.locator('[data-testid=login-codigo-digitar] button[type=submit]').click();
};

try {
  // ------------------------------------------------------------------ 1) API
  {
    const p = await pedir('et', `hotfix-api-${tag}@example.test`);
    ok('api: pendente criado com 2 links (confirmar + cancelar)', p.links.length === 2 && !!p.codigo);
    const c = await confirmarCodigo(p);
    ok('api: confirmado pelo codigo', c.status === 200 && !!c.d.solicitacaoId, JSON.stringify(c.d));
    const sol = await solDe(p.user);
    ok('api: solicitacao guarda pendente_id (rasto, mig 100)', sol?.pendente_id === p.id, JSON.stringify(sol));
    ok('api: pendente apagado', !(await admin.from('pedidos_pendentes').select('id').eq('id', p.id).maybeSingle()).data);
    const avisos0 = await nAvisos(sol.id);
    // ver / confirmar / cancelar com o token verdadeiro
    for (const acao of ['ver', 'confirmar', 'cancelar']) {
      const r = await retomar(p.links[0], acao);
      ok(`api: link usado, acao ${acao} -> 200 jaEnviado com o id do pedido`, r.status === 200 && r.d.jaEnviado === true && r.d.solicitacaoId === sol.id, `${r.status} ${JSON.stringify(r.d)}`);
      ok(`api: acao ${acao} nao vaza dados (so jaEnviado + solicitacaoId)`, Object.keys(r.d).sort().join() === 'jaEnviado,solicitacaoId', JSON.stringify(r.d));
    }
    ok('api: confirmar de novo nao cria 2o pedido', (await nSols(p.user)) === 1);
    ok('api: confirmar de novo nao avisa as oficinas de novo', (await nAvisos(sol.id)) === avisos0);
    const depois = await solDe(p.user);
    ok('api: cancelar pelo link antigo nao cancela nem apaga o pedido', depois?.id === sol.id && depois.status === sol.status, JSON.stringify(depois));
    ok('api: cancelar pelo link antigo nao apaga a conta', !!(await admin.from('profiles').select('id').eq('id', p.user).maybeSingle()).data);
    // link de cancelar (2o link do e-mail) pela API
    const rc = await retomar(p.links[1], 'cancelar');
    ok('api: 2o link (cancelar) depois da confirmacao -> jaEnviado, nada apagado', rc.status === 200 && rc.d.jaEnviado === true && (await nSols(p.user)) === 1);
    // uuid aleatorio e token mal formado
    const ua = new URL(p.links[0].href); ua.searchParams.set('p', uuidAleatorio());
    ok('api: uuid aleatorio -> 410', (await retomar(ua, 'ver')).status === 410);
    const ut = new URL(p.links[0].href); ut.hash = 't=abc';
    ok('api: id usado com token mal formado -> 410', (await retomar(ut, 'ver')).status === 410);
    const ur = new URL(p.links[0].href); ur.hash = 't=' + 'f'.repeat(64);
    const rr = await retomar(ur, 'ver');
    ok('api: id usado com token de 64 hex errado -> responde sem dados do pedido (so o id)', rr.status === 410 || Object.keys(rr.d).sort().join() === 'jaEnviado,solicitacaoId', `${rr.status} ${JSON.stringify(rr.d)}`);
    console.log(`info: id usado + token errado -> ${rr.status} (o token nao pode ser conferido depois de o pendente sumir; so devolve o id do pedido, que exige login do dono)`);
    ok('api: id invalido -> 410', (await post('/api/pedido-sem-conta/retomar', { id: 'x', t: 'f'.repeat(64), acao: 'ver' })).status === 410);
    // pedido apagado depois (conta some): link -> 410
    await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', sol.id);
    await admin.from('solicitacoes').delete().eq('id', sol.id);
    ok('api: pedido confirmado mas depois apagado -> 410 (tela com os 2 botoes)', (await retomar(p.links[0], 'ver')).status === 410);
  }

  // ------------------------------------------------------------------ 2) confirmado pelo CODIGO, link do e-mail aberto depois (6 idiomas, deslogado -> login)
  const porCodigo = {};
  for (const l of LOCS) {
    const largura = l === 'en' || l === 'pt' ? 1280 : 390;
    const nm = `codigo ${l} ${largura}`;
    const p = await pedir(l, `hotfix-cod-${l.toLowerCase()}-${tag}@example.test`);
    const c = await confirmarCodigo(p);
    const sol = await solDe(p.user);
    ok(`${nm}: confirmado pelo codigo, pendente_id gravado`, c.status === 200 && sol?.pendente_id === p.id);
    porCodigo[l] = { ...p, sol };
    const ctx = await contexto(largura);
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(e.message));
    await page.goto(p.links[0].href, { waitUntil: 'networkidle' });
    const chegouLogin = await esperarUrl(page, (u) => /\/login/.test(u.pathname));
    const u = new URL(page.url());
    const voltar = u.searchParams.get('voltar') || '';
    ok(`${nm}: deslogado -> tela de login no idioma, com voltar para o pedido`, chegouLogin && u.pathname.startsWith(PREFIX[l] + '/') && voltar.includes(`/cliente/orcamentos/${sol.id}`), page.url());
    ok(`${nm}: nunca mostrou "link invalido"`, (await page.getByTestId('retomar-invalido').count()) === 0);
    ok(`${nm}: token nao fica na barra de endereco`, !page.url().includes('t='), page.url());
    await page.screenshot({ path: `${OUT}/codigo-${l}-${largura}-login.png`, fullPage: true });
    ok(`${nm}: sem erro de JS`, !erros.length, erros.join(' | '));
    if (l === 'et' || l === 'ru' || l === 'pt') {
      // conta nascida do pedido: sem senha -> "receber um codigo por e-mail" -> "crie a sua senha" (agora nao) -> pedido
      await entrarPorCodigo(page, p.email);
      const criar = await page.getByTestId('criar-senha-agora-nao').waitFor({ timeout: 30000 }).then(() => true, () => false);
      ok(`${nm}: login por codigo -> tela "crie a sua senha" com o pedido como destino`, criar && (page.url().includes('voltar=')), page.url());
      if (criar) await page.getByTestId('criar-senha-agora-nao').click();
      const noPedido = await esperarUrl(page, (u) => u.pathname.includes(sol.id));
      await page.waitForTimeout(1500);
      const tp = await page.innerText('body');
      ok(`${nm}: "agora nao" -> abre o pedido`, noPedido && tp.includes(`descricao ${l}`) && tp.includes('Toyota'), page.url());
      await page.screenshot({ path: `${OUT}/codigo-${l}-${largura}-pedido.png`, fullPage: true });
      // logado: o mesmo link de novo vai direto ao pedido; o link de cancelar tambem (e nao cancela)
      await page.goto(p.links[0].href, { waitUntil: 'networkidle' });
      ok(`${nm}: logado, link de novo -> direto ao pedido`, await esperarUrl(page, (u) => u.pathname.includes(sol.id)), page.url());
      await page.goto(p.links[1].href, { waitUntil: 'networkidle' });
      ok(`${nm}: logado, link de CANCELAR -> vai ao pedido, sem pergunta`, (await esperarUrl(page, (u) => u.pathname.includes(sol.id))) && (await page.getByTestId('retomar-pergunta-cancelar').count()) === 0, page.url());
      const s2 = await solDe(p.user);
      ok(`${nm}: nada cancelado`, s2?.id === sol.id && s2.status === sol.status, JSON.stringify(s2));
      // voltar do navegador depois do redirecionamento: nao cai em beco sem saida
      await page.goBack({ waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(1500);
      const temInvalido = (await page.getByTestId('retomar-invalido').count()) > 0;
      const temMeus = (await page.getByTestId('retomar-meus-pedidos').count()) > 0;
      ok(`${nm}: voltar depois do redirecionamento -> pedido ou tela com "ver meu pedido" (sem beco)`, page.url().includes(sol.id) || (temInvalido && temMeus) || !page.url().includes('?p='), page.url());
    }
    await ctx.close();
  }

  // ------------------------------------------------------------------ 3) confirmado pelo LINK no navegador, link aberto de novo (logado e deslogado)
  for (const [l, largura] of [['ru', 390], ['en', 1280]]) {
    const nm = `link ${l} ${largura}`;
    const p = await pedir(l, `hotfix-link-${l}-${tag}@example.test`);
    const ctx = await contexto(largura);
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(e.message));
    await page.goto(p.links[0].href, { waitUntil: 'networkidle' });
    await page.getByTestId('retomar-resumo').waitFor({ timeout: 15000 });
    await page.getByTestId('retomar-confirmar').click();
    await page.waitForTimeout(3000);
    const sol = await solDe(p.user);
    ok(`${nm}: confirmado pelo link, pendente_id gravado`, !!sol && sol.pendente_id === p.id, JSON.stringify(sol));
    const temCriarSenha = await page.getByTestId('criar-senha-agora-nao').isVisible().catch(() => false);
    if (temCriarSenha) await page.getByTestId('criar-senha-agora-nao').click();
    ok(`${nm}: entra logado no pedido`, await esperarUrl(page, (u) => u.pathname.includes(sol.id)), page.url());
    // o mesmo link de novo (logado): direto ao pedido, nunca "link invalido"
    await page.goto(p.links[0].href, { waitUntil: 'networkidle' });
    ok(`${nm}: logado, link de novo -> pedido`, (await esperarUrl(page, (u) => u.pathname.includes(sol.id))) && (await page.getByTestId('retomar-invalido').count()) === 0, page.url());
    await page.screenshot({ path: `${OUT}/link-${l}-${largura}-de-novo.png`, fullPage: true });
    // deslogado (outro aparelho): login com voltar; conta sem senha -> codigo
    await ctx.clearCookies();
    await page.goto(p.links[0].href, { waitUntil: 'networkidle' });
    const chegouLogin = await esperarUrl(page, (u) => /\/login/.test(u.pathname));
    ok(`${nm}: deslogado -> login com voltar`, chegouLogin && (new URL(page.url()).searchParams.get('voltar') || '').includes(sol.id), page.url());
    await entrarPorCodigo(page, p.email);
    const criar = await page.getByTestId('criar-senha-agora-nao').waitFor({ timeout: 30000 }).then(() => true, () => false);
    if (criar) await page.getByTestId('criar-senha-agora-nao').click();
    ok(`${nm}: depois do login volta ao pedido`, await esperarUrl(page, (u) => u.pathname.includes(sol.id)), page.url());
    ok(`${nm}: sem erro de JS`, !erros.length, erros.join(' | '));
    await ctx.close();
  }

  // ------------------------------------------------------------------ 4) conta existente COM senha: link usado -> login com senha -> pedido
  {
    const nm = 'conta com senha et 390';
    const email = `hotfix-senha-${tag}@example.test`;
    const { data: ue } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    contas.add(ue.user.id);
    await admin.from('profiles').insert({ id: ue.user.id, tipo: 'cliente', nome: 'Senha', email, idioma: 'et', senha_definida: true });
    const p = await pedir('et', email, { modo: 'codigo' });
    const c = await confirmarCodigo(p);
    const sol = await solDe(ue.user.id);
    ok(`${nm}: pedido confirmado na conta existente, rasto gravado`, c.status === 200 && sol?.pendente_id === p.id, JSON.stringify(c.d));
    const ctx = await contexto(390);
    const page = await ctx.newPage();
    await page.goto(p.links[0].href, { waitUntil: 'networkidle' });
    ok(`${nm}: deslogado -> login`, await esperarUrl(page, (u) => /\/login/.test(u.pathname)), page.url());
    await page.locator('form input[type=email]').first().fill(email);
    await page.locator('#login-senha').fill(senha);
    await page.locator('form button[type=submit]').first().click();
    ok(`${nm}: senha -> volta ao pedido`, await esperarUrl(page, (u) => u.pathname.includes(sol.id)), page.url());
    await page.waitForTimeout(1500);
    ok(`${nm}: pedido na tela`, (await page.innerText('body')).includes('descricao et'));
    await page.screenshot({ path: `${OUT}/senha-et-390-pedido.png`, fullPage: true });
    // logado como OUTRA pessoa: o link leva ao pedido de outro -> nao mostra o pedido (RLS), sem travar
    const outro = porCodigo['et'];
    await page.goto(outro.links[0].href, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const txt = await page.innerText('body');
    ok(`${nm}: logado como outra pessoa, link de outro pedido -> nao mostra o pedido alheio`, !txt.includes('descricao et') || page.url().includes(sol.id), page.url());
    await ctx.close();
  }

  // ------------------------------------------------------------------ 5) pendente VENCIDO e pendente CANCELADO: tela util com "ver meu pedido" + "novo pedido" (6 idiomas)
  for (const l of LOCS) {
    const T = msgWeb(l);
    const largura = l === 'it' ? 1280 : 390;
    const nm = `vencido ${l} ${largura}`;
    const p = await pedir(l, `hotfix-venc-${l.toLowerCase()}-${tag}@example.test`);
    await admin.from('pedidos_pendentes').update({ created_at: new Date(Date.now() - 25 * 3600e3).toISOString() }).eq('id', p.id);
    const ctx = await contexto(largura);
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(e.message));
    await page.goto(p.links[0].href, { waitUntil: 'networkidle' });
    await page.getByTestId('retomar-invalido').waitFor({ timeout: 15000 });
    const t = await checar(page, nm);
    ok(`${nm}: titulo e texto novo no idioma`, t.includes(T('pedidoSemConta.retomarInvalido')) && t.includes(T('pedidoSemConta.retomarInvalidoTexto')));
    const meus = page.getByTestId('retomar-meus-pedidos');
    ok(`${nm}: botao principal "ver meu pedido" no idioma -> /cliente/orcamentos`, (await meus.innerText()).trim() === T('pedidoSemConta.retomarMeusPedidos') && (await meus.getAttribute('href')) === `${PREFIX[l]}/cliente/orcamentos`, await meus.getAttribute('href'));
    const novo = page.locator('[data-testid=retomar-invalido] a').nth(1);
    ok(`${nm}: 2o botao "novo pedido" -> pagina do pedido`, (await novo.innerText()).trim() === T('pedidoSemConta.retomarNovo') && (await novo.getAttribute('href')) === `${PREFIX[l]}${SLUG[l]}`, await novo.getAttribute('href'));
    await page.screenshot({ path: `${OUT}/vencido-${l}-${largura}.png`, fullPage: true });
    if (l === 'et') {
      await meus.click();
      const chegou = await esperarUrl(page, (u) => /\/login/.test(u.pathname));
      ok(`${nm}: "ver meu pedido" deslogado -> login com voltar para a lista de pedidos`, chegou && (new URL(page.url()).searchParams.get('voltar') || '').endsWith('/cliente/orcamentos'), page.url());
    }
    ok(`${nm}: sem erro de JS`, !erros.length, erros.join(' | '));
    await ctx.close();
  }
  {
    // cancelado pelo link e aberto de novo: a mesma tela util (pendente sumiu, sem pedido)
    const nm = 'cancelado et 390';
    const p = await pedir('et', `hotfix-canc-${tag}@example.test`);
    const ctx = await contexto(390);
    const page = await ctx.newPage();
    await page.goto(p.links[1].href, { waitUntil: 'networkidle' });
    await page.getByTestId('retomar-pergunta-cancelar').waitFor({ timeout: 15000 });
    await page.getByTestId('retomar-cancelar-sim').click();
    await page.getByTestId('retomar-cancelado').waitFor({ timeout: 15000 });
    ok(`${nm}: cancelado pelo link (fluxo normal intacto)`, !(await admin.from('pedidos_pendentes').select('id').eq('id', p.id).maybeSingle()).data);
    await page.goto(p.links[0].href, { waitUntil: 'networkidle' });
    await page.getByTestId('retomar-invalido').waitFor({ timeout: 15000 });
    ok(`${nm}: link de novo depois de cancelar -> tela com os 2 botoes`, (await page.getByTestId('retomar-meus-pedidos').count()) === 1);
    await ctx.close();
  }

  // ------------------------------------------------------------------ 6) fluxo normal nao mudou: link aberto antes de confirmar mostra o resumo (sem jaEnviado)
  {
    const p = await pedir('et', `hotfix-normal-${tag}@example.test`);
    const r = await retomar(p.links[0], 'ver');
    ok('normal: link antes de confirmar -> resumo (sem jaEnviado)', r.status === 200 && r.d.jaEnviado === undefined && r.d.tipo === 'mecanica', JSON.stringify(r.d));
    const rc = await retomar(p.links[0], 'confirmar');
    ok('normal: confirmar pelo link -> pedido + login', rc.status === 200 && !!rc.d.solicitacaoId && !!rc.d.tokenHash && rc.d.jaEnviado === undefined, JSON.stringify(Object.keys(rc.d)));
    const r2 = await retomar(p.links[0], 'confirmar');
    ok('normal: 2o clique em confirmar -> jaEnviado (1 pedido so)', r2.status === 200 && r2.d.jaEnviado === true && r2.d.solicitacaoId === rc.d.solicitacaoId && (await nSols(p.user)) === 1, JSON.stringify(r2.d));
  }
} catch (e) {
  falhas++;
  console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  for (const id of contas) {
    const { data: sols } = await admin.from('solicitacoes').select('id').eq('cliente_id', id);
    for (const s of sols || []) { await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', s.id); await admin.from('solicitacao_fotos').delete().eq('solicitacao_id', s.id); }
    await admin.from('solicitacoes').delete().eq('cliente_id', id);
    await admin.from('veiculos').delete().eq('profile_id', id);
    await admin.from('pedidos_pendentes').delete().eq('user_id', id);
    await admin.from('codigos_login').delete().eq('user_id', id).then(() => {}, () => {});
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  const { data: sobras } = await admin.from('pedidos_pendentes').select('id, user_id').ilike('email', `%${tag}@example.test`);
  for (const p of sobras || []) { await admin.from('pedidos_pendentes').delete().eq('id', p.id); await admin.auth.admin.deleteUser(p.user_id).catch(() => {}); }
  console.log(`${total - falhas} ok / ${falhas} falhas`);
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
