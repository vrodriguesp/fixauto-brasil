// E2E LOCAL do link de acesso dos e-mails do pedido (12/11; lib/link-acesso.ts,
// migracao 080): o e-mail de orcamento novo leva bipfix.com/r/<numero>?k=<token>;
// abrir o link (leitor automatico de e-mail, Outlook) NAO gasta o token; o toque em
// "Ver orcamento" entra na conta e abre o pedido (antes, "crie a sua senha" se ainda
// nao tem); link usado ou vencido oferece o codigo por e-mail; ja logado vai direto.
// SITE=http://localhost:3100 node site-link-acesso.mjs <.env.local>
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
const EMAILS = env.EMAIL_PASTA_TESTE;
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados';
const MSG = new URL('../../messages/', import.meta.url);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 300) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Link-' + crypto.randomBytes(6).toString('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ipN = 1;
const ip = () => `10.66.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
const contas = new Set(); const oficinas = new Set();
const m = { ...JSON.parse(fs.readFileSync(new URL('et.json', MSG), 'utf8')), ...JSON.parse(fs.readFileSync(new URL('et.auth.json', MSG), 'utf8')) };
const T = (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const post = async (rota, corpo, token) => { const r = await fetch(`${SITE}${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(corpo) }); return { status: r.status, d: await r.json().catch(() => ({})) }; };
const emailsDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort().map((f) => fs.readFileSync(path.join(EMAILS, f), 'utf8'));
const esperarEmail = async (email, depois, filtro = () => true) => { for (let i = 0; i < 40; i++) { const e = emailsDe(email, depois).filter(filtro).at(-1); if (e) return e; await sleep(300); } return null; };
const codigoDe = (html) => (html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').match(/(?<![\d#])\d{6}(?!\d)/) || [])[0];
const linkDe = (html) => (html.match(/href="([^"]*\/r\/\d+\?k=[^"&]+)/) || [])[1]?.replace(/&amp;/g, '&');
const tokenDe = (url) => new URL(url).searchParams.get('k');
const linha = async (token) => (await admin.from('links_acesso').select('user_id, solicitacao_id, token_hash, usado_em, expira_em').eq('token_hash', crypto.createHash('sha256').update(`acesso:${token}`).digest('hex')).maybeSingle()).data;
const dia = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const contexto = async (largura = 390) => {
  const c = await browser.newContext({ viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500, locale: 'et-EE', extraHTTPHeaders: { 'x-real-ip': ip() } });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  return c;
};

try {
  // oficina (com senha) e cliente SEM senha (como quem pediu orcamento so com o e-mail)
  const ofEmail = `link-of-${tag}@example.test`;
  const { data: uOf } = await admin.auth.admin.createUser({ email: ofEmail, password: senha, email_confirm: true });
  contas.add(uOf.user.id);
  await admin.from('profiles').insert({ id: uOf.user.id, tipo: 'oficina', nome: 'Oficina Link', email: ofEmail, idioma: 'et' });
  const { data: of } = await admin.from('oficinas').insert({ profile_id: uOf.user.id, nome_fantasia: `Link Töökoda ${tag}`, endereco: 'Pärnu mnt 20', cidade: 'Tallinn', estado: 'Harjumaa', cep: '10141', pais: 'EE', latitude: 59.43, longitude: 24.745, raio_atendimento_km: 30, especialidades: ['mecanica'], ativa: true }).select('id').single();
  oficinas.add(of.id);
  const cliEmail = `link-cli-${tag}@example.test`;
  const { data: uCli } = await admin.auth.admin.createUser({ email: cliEmail, email_confirm: true, user_metadata: { sem_senha: true } });
  contas.add(uCli.user.id);
  await admin.from('profiles').insert({ id: uCli.user.id, tipo: 'cliente', nome: 'Link Teste', email: cliEmail, idioma: 'et', senha_definida: false, termos_aceitos_em: new Date().toISOString() });
  const { data: v } = await admin.from('veiculos').insert({ profile_id: uCli.user.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018', placa: `LK${tag.slice(0, 3).toUpperCase()}` }).select('id').single();
  const { data: sol } = await admin.from('solicitacoes').insert({ cliente_id: uCli.user.id, veiculo_id: v.id, tipo: 'mecanica', descricao: `Link test ${tag}`, urgencia: 'media', endereco: 'Pärnu mnt 10, Tallinn', latitude: 59.433, longitude: 24.746, status: 'aberta' }).select('id, numero').single();
  const { data: orc } = await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of.id, valor_total: 150, prazo_dias: 1, status: 'enviado', validade: dia(10) }).select('id').single();
  await admin.from('orcamento_itens').insert({ orcamento_id: orc.id, descricao: 'Remont', tipo: 'mao_de_obra', valor_unitario: 150, quantidade: 1, valor_total: 150 });
  const lOf = await anon().auth.signInWithPassword({ email: ofEmail, password: senha });
  if (lOf.error) throw new Error('login oficina: ' + lOf.error.message);

  // 1) e-mail de orcamento novo com o link de acesso
  let t0 = Date.now();
  const n1 = await post('/api/notificar-orcamento', { orcamentoId: orc.id }, lOf.data.session.access_token);
  ok('notificar orcamento -> 200', n1.status === 200, JSON.stringify(n1.d));
  const mail1 = await esperarEmail(cliEmail, t0);
  const link1 = mail1 && linkDe(mail1);
  ok('e-mail de orcamento com /r/<numero>?k=<token> (curto, sem portugues)', !!link1 && link1.includes(`/r/${sol.numero}?k=`) && !/cliente|orcamento/.test(link1), link1);
  const tok1 = link1 && tokenDe(link1);
  ok('token de 256 bits (43 chars base64url)', /^[A-Za-z0-9_-]{43}$/.test(tok1 || ''), tok1);
  const l1 = tok1 && await linha(tok1);
  ok('links_acesso guarda so o hash, preso ao usuario e ao pedido, 7 dias, nao usado', !!l1 && l1.user_id === uCli.user.id && l1.solicitacao_id === sol.id && !l1.usado_em && Math.round((new Date(l1.expira_em) - Date.now()) / 86400e3) === 7, JSON.stringify(l1));
  ok('token em claro nao esta no banco', !(await admin.from('links_acesso').select('id').eq('token_hash', tok1).maybeSingle()).data);

  // 2) leitor automatico: GET no link e na pagina NAO gasta o token
  const caminho = link1.replace(/^https?:\/\/[^/]+/, '');
  const r302 = await fetch(`${SITE}${caminho}`, { redirect: 'manual', headers: { 'x-real-ip': ip() } });
  const destino = r302.headers.get('location') || '';
  ok('/r/<numero>?k= -> 302 para a pagina "ver pedido" no idioma do cliente', r302.status === 302 && destino.includes('/ee/et/vaata-paringut?k=' + tok1), destino);
  const pg = await fetch(destino, { headers: { 'x-real-ip': ip() } });
  ok('pagina "ver pedido" abre (200)', pg.status === 200);
  const html = await pg.text();
  ok('pagina fora dos buscadores', /noindex/.test(html));
  ok('abrir o link nao gasta o token', !(await linha(tok1)).usado_em);
  const ver = await post('/api/link-acesso', { k: tok1, acao: 'ver' });
  ok('"ver" devolve nome e numero sem gastar', ver.status === 200 && ver.d.nome === 'Link Teste' && String(ver.d.numero) === String(sol.numero) && !(await linha(tok1)).usado_em, JSON.stringify(ver.d));
  ok('token com formato errado -> 410', (await post('/api/link-acesso', { k: 'x'.repeat(43), acao: 'entrar' })).status === 410 && (await post('/api/link-acesso', { k: 'abc', acao: 'ver' })).status === 410);
  ok('token inexistente -> 410', (await post('/api/link-acesso', { k: crypto.randomBytes(32).toString('base64url'), acao: 'ver' })).status === 410);

  // 3) a pessoa toca em "Ver orcamento": entra, passa por "crie a sua senha", chega ao pedido
  const ctx = await contexto(390);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(`${SITE}${caminho}`, { waitUntil: 'networkidle' });
  await page.getByTestId('ver-pedido-ola').waitFor({ timeout: 20000 });
  const t = await page.innerText('body');
  ok('saudacao "Tere, Link Teste!" e o numero do pedido', t.includes(T('verPedido.titulo', { nome: 'Link Teste' })) && t.includes(T('verPedido.texto', { numero: sol.numero })), t.slice(0, 200));
  ok('token sai da barra de endereco', !page.url().includes('k='), page.url());
  ok('ainda nao gastou (so abriu)', !(await linha(tok1)).usado_em);
  await page.screenshot({ path: `${OUT}/link-acesso-ola-et-390.png`, fullPage: true });
  await page.getByTestId('ver-pedido-entrar').click();
  const criar = await page.getByTestId('criar-senha').waitFor({ timeout: 30000 }).then(() => true, () => false);
  ok('toque -> entra e mostra "crie a sua senha" (conta sem senha)', criar && page.url().includes('/ee/et/loo-parool'), page.url());
  ok('toque gastou o token', !!(await linha(tok1)).usado_em);
  await page.screenshot({ path: `${OUT}/link-acesso-criar-senha-et-390.png`, fullPage: true });
  await page.getByTestId('criar-senha-agora-nao').click();
  await page.waitForURL(/orcamentos\//, { timeout: 30000 }).catch(() => {});
  ok('"agora nao" -> pagina do pedido', page.url().includes(`/cliente/orcamentos/${sol.id}`), page.url());
  await page.waitForTimeout(1500);
  ok('pedido aberto mostra a oficina do orcamento', (await page.innerText('body')).includes(`Link Töökoda ${tag}`));
  await page.screenshot({ path: `${OUT}/link-acesso-pedido-et-390.png`, fullPage: true });
  ok('"entrar" de novo com o token gasto -> 410', (await post('/api/link-acesso', { k: tok1, acao: 'entrar' })).status === 410);

  // 4) ja logado como o dono: o mesmo link (gasto ou nao) vai direto ao pedido
  await page.goto(`${SITE}${caminho}`, { waitUntil: 'networkidle' });
  await page.waitForURL(/orcamentos\//, { timeout: 20000 }).catch(() => {});
  ok('logado: link vai direto ao pedido, sem a saudacao', page.url().includes(`/cliente/orcamentos/${sol.id}`) && (await page.getByTestId('ver-pedido-ola').count()) === 0, page.url());
  ok('sem erro de pagina', !erros.length, erros.join(' | '));
  await ctx.close();

  // 5) outro aparelho abre o link ja usado: pagina amigavel com "receber um codigo por e-mail"
  const ctx2 = await contexto(1280);
  const page2 = await ctx2.newPage();
  await page2.goto(`${SITE}${caminho}`, { waitUntil: 'networkidle' });
  await page2.getByTestId('ver-pedido-invalido').waitFor({ timeout: 20000 });
  ok('link usado: titulo e texto no idioma', (await page2.innerText('body')).includes(T('verPedido.invalidoTitulo')));
  await page2.screenshot({ path: `${OUT}/link-acesso-usado-et-1280.png`, fullPage: true });
  await page2.getByTestId('ver-pedido-codigo').click();
  await page2.getByTestId('login-codigo-email').waitFor({ timeout: 20000 });
  ok('botao leva ao login ja em "receber um codigo", com volta ao pedido', page2.url().includes('/ee/et/login') && page2.url().includes('codigo=1') && decodeURIComponent(page2.url()).includes(`/cliente/orcamentos/${sol.id}`), page2.url());
  // entra por codigo e, sem senha ainda, cria a senha desta vez
  await page2.locator('#login-codigo-email').fill(cliEmail);
  t0 = Date.now();
  await page2.locator('[data-testid=login-codigo-email] button[type=submit]').click();
  await page2.getByTestId('login-codigo-digitar').waitFor({ timeout: 20000 });
  const mailCod = await esperarEmail(cliEmail, t0, (h) => /sisselogimiskood/i.test(h));
  const cod = mailCod && codigoDe(mailCod);
  ok('codigo de login chegou (estoniano)', !!cod);
  await page2.locator('#login-codigo').fill(cod || '');
  await page2.locator('[data-testid=login-codigo-digitar] button[type=submit]').click();
  await page2.getByTestId('criar-senha').waitFor({ timeout: 30000 });
  ok('login por codigo -> "crie a sua senha" (ainda sem senha)', page2.url().includes('/ee/et/loo-parool'), page2.url());
  await page2.locator('#criar-senha-senha').fill(senha);
  await page2.locator('#criar-senha-confirmar').fill(senha);
  await page2.getByTestId('criar-senha-salvar').click();
  await page2.getByTestId('criar-senha-ok').waitFor({ timeout: 20000 });
  await page2.waitForURL(/orcamentos\//, { timeout: 30000 }).catch(() => {});
  ok('senha criada -> volta ao pedido pedido pelo link', page2.url().includes(`/cliente/orcamentos/${sol.id}`), page2.url());
  ok('senha_definida=true (trigger) e a senha entra', (await admin.from('profiles').select('senha_definida').eq('id', uCli.user.id).single()).data?.senha_definida === true && !(await anon().auth.signInWithPassword({ email: cliEmail, password: senha })).error);
  await ctx2.close();

  // 6) link vencido: segundo e-mail (token novo), validade no passado
  t0 = Date.now();
  await post('/api/notificar-orcamento', { orcamentoId: orc.id }, lOf.data.session.access_token);
  const mail2 = await esperarEmail(cliEmail, t0, (h) => /\/r\/\d+\?k=/.test(h));
  const tok2 = mail2 && tokenDe(linkDe(mail2));
  ok('cada e-mail tem um token proprio', !!tok2 && tok2 !== tok1);
  await admin.from('links_acesso').update({ expira_em: new Date(Date.now() - 60000).toISOString() }).eq('token_hash', crypto.createHash('sha256').update(`acesso:${tok2}`).digest('hex'));
  ok('vencido: "ver" -> 410', (await post('/api/link-acesso', { k: tok2, acao: 'ver' })).status === 410);
  ok('vencido: "entrar" -> 410 e nao marca usado', (await post('/api/link-acesso', { k: tok2, acao: 'entrar' })).status === 410 && !(await linha(tok2)).usado_em);
  const ctx3 = await contexto(390);
  const page3 = await ctx3.newPage();
  await page3.goto(`${SITE}/r/${sol.numero}?k=${tok2}`, { waitUntil: 'networkidle' });
  ok('vencido: pagina amigavel com o codigo por e-mail', await page3.getByTestId('ver-pedido-invalido').isVisible() && await page3.getByTestId('ver-pedido-codigo').isVisible());
  await ctx3.close();
  // conta com senha agora: um link novo entra direto no pedido, sem "crie a sua senha"
  t0 = Date.now();
  await post('/api/notificar-orcamento', { orcamentoId: orc.id }, lOf.data.session.access_token);
  const mail3 = await esperarEmail(cliEmail, t0, (h) => /\/r\/\d+\?k=/.test(h));
  const link3 = mail3 && linkDe(mail3);
  const ctx4 = await contexto(390);
  const page4 = await ctx4.newPage();
  await page4.goto(link3.replace(/^https?:\/\/[^/]+/, SITE), { waitUntil: 'networkidle' });
  await page4.getByTestId('ver-pedido-entrar').click();
  await page4.waitForURL(/orcamentos\//, { timeout: 30000 }).catch(() => {});
  ok('conta com senha: toque vai direto ao pedido', page4.url().includes(`/cliente/orcamentos/${sol.id}`) && (await page4.getByTestId('criar-senha').count()) === 0, page4.url());
  await ctx4.close();
  // limpeza da tarefa de hora em hora: link vencido ha mais de 1 dia some
  await admin.from('links_acesso').update({ expira_em: new Date(Date.now() - 2 * 86400e3).toISOString() }).eq('token_hash', crypto.createHash('sha256').update(`acesso:${tok2}`).digest('hex'));
  const cron = await fetch(`${SITE}/api/tarefas/limpar-pendentes`, { method: 'POST', headers: { 'x-tarefa-chave': env.TAREFAS_CHAVE } });
  ok('tarefa de hora em hora apaga o link vencido', cron.ok && !(await linha(tok2)), String(cron.status));
} catch (e) {
  falhas++;
  console.log('FALHA excecao', e.stack || e.message);
} finally {
  await browser.close();
  for (const id of contas) {
    const { data: sols } = await admin.from('solicitacoes').select('id').eq('cliente_id', id);
    for (const s of sols || []) {
      await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', s.id);
      await admin.from('orcamentos').delete().eq('solicitacao_id', s.id);
    }
    await admin.from('links_acesso').delete().eq('user_id', id);
    await admin.from('codigos_login').delete().eq('user_id', id);
    await admin.from('solicitacoes').delete().eq('cliente_id', id);
    await admin.from('veiculos').delete().eq('profile_id', id);
  }
  for (const id of oficinas) await admin.from('oficinas').delete().eq('id', id);
  for (const id of contas) {
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
}
