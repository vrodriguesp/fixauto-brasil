// Reteste dos feedbacks do dono no teste local de 07/11 (Documentos/_teste_local/feedback_dono_2026-11-07.md),
// em tela de celular (390) onde ele viu os problemas. node feedback-0711.mjs <.env.local>
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
const SITE = `http://${process.env.HOST_LAN || 'localhost'}:3100`; // mesmo endereco do build (o /r/ leva ao NEXT_PUBLIC_SITE_URL)
const APP = 'http://localhost:8090';
const EMAILS = env.EMAIL_PASTA_TESTE;
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/feedback-0711`;
fs.mkdirSync(OUT, { recursive: true });
const WEBMSG = `${RAIZ}/site/apps/web/messages`;
const MOB = `${RAIZ}/site/apps/mobile/i18n/locales`;
const msgWeb = (l) => {
  const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.json`, 'utf8'));
  for (const area of ['cliente', 'oficina', 'misc', 'auth']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.${area}.json`, 'utf8')));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};
const msgApp = (l) => { const j = JSON.parse(fs.readFileSync(`${MOB}/${l}.json`, 'utf8')); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], j) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anonCli = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const semear = fs.readFileSync(`${RAIZ}/ferramentas/semear.mjs`, 'utf8');
const W1_EMAIL = 'meister.teste@bipfix.test';
const W1_SENHA = (semear.match(/conta\('meister\.teste@bipfix\.test', '([^']+)'/) || [])[1];
if (!W1_SENHA) throw new Error('oficina de teste nao achada no semear.mjs');
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Agen-' + crypto.randomBytes(6).toString('hex');
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const contas = new Set(); const sols = new Set(); const oficinasCriadas = new Set(); const funcs = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => `10.55.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
const emailsDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort().map((f) => ({ f, html: fs.readFileSync(path.join(EMAILS, f), 'utf8') }));
const icsDe = (htmlArq) => { const a = path.join(EMAILS, htmlArq.replace(/\.html$/, '') + '__bipfix-agendamento.ics'); return fs.existsSync(a) ? fs.readFileSync(a, 'utf8') : null; };
const esperarEmail = async (email, depois, filtro = () => true) => { for (let i = 0; i < 40; i++) { const e = emailsDe(email, depois).filter(filtro).at(-1); if (e) return e; await sleep(300); } return null; };
const icsData = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dia = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
// hora local de Tallinn (EET/EEST) -> UTC
const tallinn = (ymd, hm) => { for (const off of ['+02:00', '+03:00']) { const d = new Date(`${ymd}T${hm}:00${off}`); const h = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit' }); if (h === hm) return d.toISOString(); } return null; };

async function conta(email, s, perfil) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: s, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.add(data.user.id);
  const { error: e2 } = await admin.from('profiles').upsert({ id: data.user.id, email, ...perfil });
  if (e2) throw new Error(e2.message);
  return data.user.id;
}
async function sessao(email, s) {
  const c = anonCli();
  const { data, error } = await c.auth.signInWithPassword({ email, password: s });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return { c, token: data.session.access_token };
}
const post = async (rota, token, corpo) => { const r = await fetch(`${SITE}${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'x-real-ip': ip() }, body: JSON.stringify(corpo) }); return { status: r.status, d: await r.json().catch(() => ({})) }; };
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const contexto = async (largura, extra = {}) => {
  const c = await browser.newContext({ viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500,
    locale: 'et-EE', extraHTTPHeaders: { 'x-real-ip': ip() }, ...extra });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const design = async (page, nome) => {
  const t = await page.innerText('body');
  const crua = t.match(/\b(agendaMudanca|revisaoOrcamento|clienteOrcamentoDetalhe|oficinaAgenda|oficinaEnviarOrcamento|erros|constants)\.[a-zA-Z_]+/);
  ok(`${nome}: sem chave sem traducao`, !crua, crua?.[0]);
  const r = await page.evaluate(() => {
    const sw = document.documentElement.scrollWidth - innerWidth;
    const fora = [...document.querySelectorAll('main button, main a, main input, main select, main textarea')].filter((e) => e.offsetParent)
      .map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && (b.left < -1 || b.right > innerWidth + 1)).length;
    return { sw, fora };
  });
  ok(`${nome}: sem rolagem lateral nem elemento cortado`, r.sw <= 1 && r.fora === 0, JSON.stringify(r));
  return t;
};
const entrarSite = async (ctx, email, s, rot = '/ee/et') => {
  const p = await ctx.newPage();
  await p.goto(`${SITE}${rot}/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', s);
  await p.click('button[type=submit]'); await p.waitForTimeout(4000);
  return p;
};

const entrarApp = async (ctx, email, s, TA) => {
  const p = await ctx.newPage();
  await p.goto(`${APP}/login`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  await p.getByLabel(TA('auth.email'), { exact: true }).locator('visible=true').first().fill(email);
  await p.getByLabel(TA('auth.senha'), { exact: true }).locator('visible=true').first().fill(s);
  await p.getByText(TA('auth.entrar'), { exact: true }).locator('visible=true').last().click(); await p.waitForTimeout(5000);
  return p;
};
const ctxApp = async (loc = 'en') => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: loc });
  await c.addInitScript((l) => { try { localStorage.setItem('idioma', l); } catch {} }, loc);
  return c;
};
const naBarra = (p, trecho) => p.evaluate((tr) => {
  const a = [...document.querySelectorAll(`nav a[href*="${tr}"]`)].find((x) => x.offsetParent && x.getBoundingClientRect().bottom >= innerHeight - 80);
  return a ? a.innerText.replace(/\s+/g, ' ') : null;
}, trecho);

try {
  const T = msgWeb('et'); const TA = msgApp('en');
  const w1Id = (await admin.from('profiles').select('id').eq('email', W1_EMAIL).single()).data.id;
  await admin.from('profiles').update({ idioma: 'et' }).eq('id', w1Id); // conta compartilhada: um teste manual pode ter trocado o idioma
  const { data: of1 } = await admin.from('oficinas').select('id, nome_fantasia').eq('profile_id', w1Id).single();
  const novoPedido = async (n) => {
    const cEmail = `fb-cli${n}-${tag}@example.test`;
    const cId = await conta(cEmail, senha, { tipo: 'cliente', nome: `Cliente ${n}`, telefone: '+372 5999 100' + n, idioma: 'en' });
    const { data: v } = await admin.from('veiculos').insert({ profile_id: cId, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018', placa: `FB${n}${tag.slice(0, 3).toUpperCase()}` }).select('id').single();
    const { data: sol } = await admin.from('solicitacoes').insert({ cliente_id: cId, veiculo_id: v.id, tipo: 'mecanica', descricao: `Feedback test ${n}`, urgencia: 'media', endereco: 'Pärnu mnt 10, Tallinn', latitude: 59.433, longitude: 24.746, status: 'aberta' }).select('id, numero').single();
    sols.add(sol.id);
    const o1 = (await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of1.id, valor_total: 230, prazo_dias: 1, status: 'enviado', validade: dia(10) }).select('id').single()).data;
    await admin.from('orcamento_itens').insert([
      { orcamento_id: o1.id, descricao: 'Piduriklotsid', tipo: 'peca', valor_unitario: 80, quantidade: 1, valor_total: 80 },
      { orcamento_id: o1.id, descricao: 'Töö', tipo: 'mao_de_obra', valor_unitario: 100, quantidade: 1, valor_total: 100 },
      { orcamento_id: o1.id, descricao: 'Pesuvedelik', tipo: 'material', valor_unitario: 50, quantidade: 1, valor_total: 50 },
    ]);
    const s1 = (await admin.from('orcamento_disponibilidade').insert({ orcamento_id: o1.id, data_checkin: dia(3), turno: 'manha', data_previsao_entrega: dia(4) }).select('id').single()).data;
    const cli = await sessao(cEmail, senha);
    const ra = await post('/api/aceitar-orcamento', cli.token, { orcamentoId: o1.id, slotId: s1.id });
    if (ra.status !== 200) throw new Error('aceite ' + ra.status);
    return { cEmail, cId, cli, sol, o1 };
  };

  // ---------- 1) idioma + voltar ----------
  {
    const ctx = await contexto(390); const p = await ctx.newPage();
    await p.goto(`${SITE}/ee/et`, { waitUntil: 'networkidle' });
    await p.goto(`${SITE}/ee/et/tingimused`, { waitUntil: 'networkidle' });
    await p.locator('nav button[aria-haspopup="true"]').first().click(); await p.waitForTimeout(300);
    await p.locator('nav a[hreflang^="ru"]').first().click(); await p.waitForURL('**/ee/ru/**', { timeout: 10000 });
    await p.goBack({ waitUntil: 'networkidle' }).catch(() => {}); await p.waitForTimeout(1500);
    ok('1: trocar o idioma e voltar leva a pagina ANTERIOR (nao a mesma no idioma antigo)', new URL(p.url()).pathname === '/ee/et', p.url());
    await ctx.close();
  }

  // ---------- 2/8) cadastro: passo seguinte no alto; erro aparece na tela ----------
  {
    const ctx = await contexto(390); const p = await ctx.newPage();
    await p.goto(`${SITE}/ee/et/registreeru?tipo=oficina`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    await p.fill('#c6791-5', 'Test Omanik'); await p.fill('#c6791-6', `fb-of-${tag}@example.test`);
    await p.fill('#c6791-8', senha);
    const termo = p.locator('form input[type=checkbox]').first(); if (await termo.count()) await termo.check();
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(300);
    await p.locator('form button[type=submit]').first().click(); await p.waitForTimeout(1500);
    const y = await p.evaluate(() => scrollY);
    ok('2: cadastro da oficina - depois de e-mail e senha o passo seguinte abre no alto', (await p.locator('#c6791-9').count()) === 1 && y < 5, `scrollY ${y}`);
    await p.screenshot({ path: path.join(OUT, '2_cadastro_passo3_390.png') });
    // passo 3 com endereco que nao existe: o aviso (no alto) aparece na tela mesmo com a pessoa la embaixo
    for (const inp of await p.locator('input[id^="cadastro-end"]').all()) { if (await inp.isVisible() && await inp.isEditable()) await inp.fill('Qzxw'); }
    await p.fill('#c6791-9', 'Test Töökoda'); await p.fill('#c6791-10', '12345678');
    const caixasP3 = p.locator('form input[type=checkbox]');
    await caixasP3.first().check(); await caixasP3.last().check();
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(300);
    await p.locator('form button[type=submit]').first().click(); // a busca do endereco (servico externo) pode demorar: espera o aviso ate 15 s
    await p.waitForFunction(() => [...document.querySelectorAll('[role=alert]')].some((x) => x.innerText.trim()), null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(1200);
    const vis = await p.evaluate(() => { const a = [...document.querySelectorAll('[role=alert]')].find((x) => x.innerText.trim()); if (!a) return 'sem aviso'; const b = a.getBoundingClientRect(); return (b.top >= 0 && b.bottom <= innerHeight ? 'visivel' : `fora ${Math.round(b.top)}`) + ': ' + a.innerText.slice(0, 60); });
    ok('8: erro no cadastro (endereco nao achado) aparece na tela', vis.startsWith('visivel'), vis);
    await p.screenshot({ path: path.join(OUT, '8_cadastro_erro_390.png') });
    await ctx.close();
  }

  const P = await novoPedido(1);

  // ---------- 5/6) barra de baixo da oficina + bolinha de mensagens ----------
  {
    // a bolinha conta so conversas abertas (auditoria 08/11): mede antes e depois da mensagem nova
    const ctx = await contexto(390);
    const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA);
    await p.goto(`${SITE}/ee/et/oficina/pedidos`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    const antes = Number(((await naBarra(p, '/oficina/mensagens')) || '').match(/\d+/)?.[0] || 0);
    await admin.from('mensagens').insert({ solicitacao_id: P.sol.id, oficina_id: of1.id, remetente_id: P.cId, texto: 'Tere, kas saab varem?', tipo: 'texto', lida: false });
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    const barra = await p.evaluate(() => {
      const n = [...document.querySelectorAll('nav')].find((x) => getComputedStyle(x).position === 'fixed' && x.getBoundingClientRect().bottom >= innerHeight - 2);
      if (!n) return null;
      const b = n.getBoundingClientRect();
      const itens = [...n.querySelectorAll('a,button')].map((a) => { const r = a.getBoundingClientRect(); return { cortado: r.bottom > innerHeight + 0.5 || r.top < b.top - 0.5 || a.scrollHeight > a.clientHeight + 1 || a.scrollWidth > a.clientWidth + 1, txt: a.innerText.replace(/\s+/g, ' ') }; });
      return { bottom: Math.round(b.bottom), h: innerHeight, itens };
    });
    ok('5: barra de baixo da oficina inteira na tela (nenhum item cortado)', !!barra && barra.itens.every((i) => !i.cortado), JSON.stringify(barra));
    const fim = await p.evaluate(async () => { window.scrollTo(0, document.body.scrollHeight); await new Promise((r) => setTimeout(r, 300)); const n = [...document.querySelectorAll('nav')].find((x) => getComputedStyle(x).position === 'fixed' && x.getBoundingClientRect().bottom >= innerHeight - 2); const ult = [...document.querySelectorAll('footer a, main a, main button')].filter((e) => e.offsetParent).at(-1); return n && ult ? Math.round(ult.getBoundingClientRect().bottom - n.getBoundingClientRect().top) : null; });
    ok('5: o fim da pagina nao fica escondido atras da barra', fim !== null && fim <= 0, String(fim));
    await p.screenshot({ path: path.join(OUT, '5_barra_oficina_390.png') });
    const bolinha = await naBarra(p, '/oficina/mensagens');
    ok('6: bolinha com o numero de mensagens nao lidas em "Sõnumid" (barra de baixo)', !!bolinha && bolinha.includes(String(antes + 1)), `${bolinha} (esperado ${antes + 1})`);
    await p.goto(`${SITE}/ee/et/oficina/mensagens/${P.sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(4000);
    // dentro da conversa a barra de baixo some (09/11): confere ao voltar para a lista
    await p.goBack({ waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    const depois = (await naBarra(p, '/oficina/mensagens')) || '0';
    ok('6: abrindo a conversa a bolinha diminui na hora', !!depois && !depois.includes(String(antes + 1)), depois);
    await ctx.close();
    await admin.from('mensagens').insert({ solicitacao_id: P.sol.id, oficina_id: of1.id, remetente_id: P.cId, texto: 'Veel üks küsimus', tipo: 'texto', lida: false });
    const ctxD = await contexto(1366); const pd = await entrarSite(ctxD, W1_EMAIL, W1_SENHA);
    await pd.goto(`${SITE}/ee/et/oficina/pedidos`, { waitUntil: 'networkidle' }); await pd.waitForTimeout(3000);
    const topo = await pd.evaluate(() => [...document.querySelectorAll('nav a[href*="/oficina/mensagens"]')].filter((a) => a.offsetParent).map((a) => a.innerText.replace(/\s+/g, ' ')).join(' | '));
    ok('6: bolinha tambem no menu do computador', /\d/.test(topo), topo);
    await ctxD.close();
    await admin.from('mensagens').insert({ solicitacao_id: P.sol.id, oficina_id: of1.id, remetente_id: w1Id, texto: 'Jah, saab', tipo: 'texto', lida: false });
    const ctxC = await contexto(1366, { locale: 'en-GB' }); const pc = await entrarSite(ctxC, P.cEmail, senha, '/ee/en');
    await pc.goto(`${SITE}/ee/en/cliente/dashboard`, { waitUntil: 'networkidle' }); await pc.waitForTimeout(3000);
    const tc = await pc.evaluate(() => [...document.querySelectorAll('nav a')].filter((a) => a.offsetParent && /mensagens|messages/.test(a.getAttribute('href') || '')).map((a) => a.innerText.replace(/\s+/g, ' ')).join(' | '));
    ok('6: cliente tambem ve a bolinha em Messages', /1/.test(tc), tc);
    // auditoria 08/11: conversa de outra oficina (o cliente escolheu a of1) some da
    // lista e nao pode deixar a bolinha acesa para sempre
    const of2 = (await admin.from('oficinas').select('id, profile_id').neq('id', of1.id).limit(1).single()).data;
    const aceita = (await admin.from('orcamentos').select('id').eq('solicitacao_id', P.sol.id).eq('oficina_id', of1.id).eq('status', 'aceito')).data || [];
    if (of2 && aceita.length) {
      await admin.from('mensagens').insert({ solicitacao_id: P.sol.id, oficina_id: of2.id, remetente_id: of2.profile_id, texto: 'Kas on veel küsimusi?', tipo: 'texto', lida: false });
      await pc.reload({ waitUntil: 'networkidle' }); await pc.waitForTimeout(3000);
      const tc2 = await pc.evaluate(() => [...document.querySelectorAll('nav a')].filter((a) => a.offsetParent && /mensagens|messages/.test(a.getAttribute('href') || '')).map((a) => a.innerText.replace(/\s+/g, ' ')).join(' | '));
      ok('6: mensagem de oficina nao escolhida nao conta na bolinha (conversa fechada)', /1/.test(tc2) && !/2/.test(tc2), tc2);
    } else ok('6: (preparo) pedido com orcamento aceito da of1 e outra oficina', false, JSON.stringify({ of2: !!of2, aceita: aceita.length }));
    await ctxC.close();
  }

  // ---------- 7/8) revisao do orcamento aceito (oficina, celular) ----------
  {
    const ctx = await contexto(390);
    const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA);
    await p.goto(`${SITE}/r/${P.sol.numero}?o=et`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    ok('7: pagina abre no alto com a escolha "o que mudar" (data / itens e valor)', (await p.getByTestId('escolha-mudanca').count()) === 1 && (await p.locator('#motivo-revisao').count()) === 0 && (await p.evaluate(() => scrollY)) < 5);
    await design(p, '7: escolha (oficina, celular)');
    await p.screenshot({ path: path.join(OUT, '7_escolha_390.png'), fullPage: true });
    await p.getByTestId('opcao-mudar-valor').click(); await p.waitForTimeout(1500);
    const valores = await p.locator('form input[type=text]').evaluateAll((els) => els.map((e) => e.value));
    ok('7: itens/valor: motivo + o mesmo orcamento ja preenchido (3 itens)', (await p.locator('#motivo-revisao').count()) === 1 && ['Piduriklotsid', 'Töö', 'Pesuvedelik'].every((v) => valores.includes(v)), JSON.stringify(valores));
    ok('7: sem a caixa da data junto', (await p.getByTestId('propor-nova-data').count()) === 0);
    const caixas = () => p.locator('form div.p-4.bg-gray-50.rounded-lg');
    await caixas().nth(0).locator('input[aria-label]').first().fill('95');
    await caixas().nth(2).getByRole('button').first().click(); await p.waitForTimeout(300);
    await p.getByRole('button', { name: T('oficinaEnviarOrcamento.adicionarItem') }).click(); await p.waitForTimeout(300);
    const novo = caixas().last();
    await novo.locator('input[type=text]').first().fill('Piduriketas');
    await novo.locator('input[aria-label]').first().fill('120');
    await p.waitForTimeout(500);
    ok('7: oficina ve "Muudetud" no item mudado e "Uus" no item novo', (await p.getByTestId('item-alterado').count()) === 1 && (await p.getByTestId('item-novo').count()) === 1);
    ok('7: oficina ve o item removido', (await p.getByTestId('itens-removidos').innerText().catch(() => '')).includes('Pesuvedelik'));
    await design(p, '7: revisao de itens (oficina, celular)');
    await p.screenshot({ path: path.join(OUT, '7_oficina_itens_390.png'), fullPage: true });
    const enviar = p.locator('form button[type=submit]').last();
    await enviar.scrollIntoViewIfNeeded(); await enviar.click(); await p.waitForTimeout(1500);
    const foco = await p.evaluate(() => { const a = document.activeElement; const b = a?.getBoundingClientRect(); return a?.id === 'motivo-revisao' && b.top >= 0 && b.bottom <= innerHeight ? 'ok' : `${a?.id} ${b && Math.round(b.top)}`; });
    ok('8: enviar sem motivo leva a tela ate o motivo, com o cursor nele', foco === 'ok', foco);
    await p.locator('#motivo-revisao').fill('Pidurikettad on kulunud, vaja vahetada');
    await enviar.click(); await p.waitForTimeout(3000);
    const { data: rv } = await admin.from('orcamento_revisoes').select('tipo, valor_novo, itens').eq('solicitacao_id', P.sol.id).eq('status', 'pendente').maybeSingle();
    ok('7: revisao de valor gravada (95 + 100 + 120 = 315)', rv && rv.tipo !== 'data' && Number(rv.valor_novo) === 315, JSON.stringify(rv));
    await ctx.close();
    const ctxC = await contexto(390, { locale: 'en-GB' }); const pc = await entrarSite(ctxC, P.cEmail, senha, '/ee/en');
    await pc.goto(`${SITE}/ee/en/cliente/orcamentos/${P.sol.id}`, { waitUntil: 'networkidle' }); await pc.waitForTimeout(3500);
    const est = await pc.evaluate(() => [...document.querySelectorAll('[data-testid=revisao-itens] li')].map((l) => `${l.getAttribute('data-estado') || '-'}:${l.innerText.replace(/\s+/g, ' ')}`));
    ok('7: motorista (site) ve Novo / Alterado (valor antigo riscado) / Removido', est.some((x) => x.startsWith('novo:') && x.includes('Piduriketas')) && est.some((x) => x.startsWith('alterado:') && x.includes('Piduriklotsid') && /80/.test(x)) && est.some((x) => x.startsWith('removido:') && x.includes('Pesuvedelik')) && est.some((x) => x.startsWith('-:') && x.includes('Töö')), JSON.stringify(est));
    await design(pc, '7: revisao no pedido do cliente (celular, en)');
    await pc.locator('[data-testid=revisao-itens]').screenshot({ path: path.join(OUT, '7_cliente_itens_390.png') }).catch(() => {});
    await ctxC.close();
    const ca = await ctxApp('en'); const pa = await entrarApp(ca, P.cEmail, senha, TA);
    await pa.goto(`${APP}/solicitacao/${P.sol.id}`, { waitUntil: 'networkidle' }); await pa.waitForTimeout(4000);
    ok('7: motorista (app) ve Novo / Alterado / Removido', (await pa.getByTestId('item-novo').count()) === 1 && (await pa.getByTestId('item-alterado').count()) === 1 && (await pa.getByTestId('item-removido').count()) === 1);
    await pa.screenshot({ path: path.join(OUT, '7_app_revisao_390.png'), fullPage: true });
    await ca.close();
  }

  // ---------- 7) data: enviada, a pagina nao fica aberta para o valor ----------
  {
    const P2 = await novoPedido(2);
    const ctx = await contexto(390); const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA);
    await p.goto(`${SITE}/ee/et/oficina/orcamento/${P2.sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    await p.getByTestId('opcao-mudar-data').click(); await p.waitForTimeout(1200);
    await p.locator('#nd-data').fill(dia(6)); await p.locator('#nd-motivo').fill('Varuosa saabub hiljem');
    // desde 08/11 (migracao 077) a oficina diz se o horario atual ainda serve (pergunta obrigatoria)
    await p.locator('[id$="-serve-sim"]').first().check();
    await p.getByTestId('propor-nova-data').getByRole('button').last().click(); await p.waitForTimeout(3000);
    const t = await p.innerText('body');
    if (process.env.DEPURAR) console.log('TELA7', t.replace(/\n+/g, ' | ').slice(0, 1500), '| ESPERADO', T('agendaMudanca.propostaPendente', { quando: '' }));
    ok('7: depois de enviar a data a pagina mostra "esperando o cliente", sem formulario de valor', t.includes(T('agendaMudanca.propostaPendente', { quando: '' }).split('(')[0].trim()) && (await p.locator('#motivo-revisao').count()) === 0 && (await p.locator('form').count()) === 0, JSON.stringify({ forms: await p.locator('form').count(), motivo: await p.locator('#motivo-revisao').count(), url: p.url(), tela: t.slice(0, 600) }));
    await p.screenshot({ path: path.join(OUT, '7_data_enviada_390.png') });
    await ctx.close();
  }

  // ---------- 9/10/4) app: pagina da oficina pela conversa, sair, placa ----------
  {
    const ca = await ctxApp('en'); const pa = await entrarApp(ca, P.cEmail, senha, TA);
    await pa.goto(`${APP}/conversa/${P.sol.id}?oficina=${of1.id}`, { waitUntil: 'networkidle' }); await pa.waitForTimeout(3500);
    const [pop] = await Promise.all([ca.waitForEvent('page', { timeout: 10000 }).catch(() => null), pa.getByLabel(TA('orcamentos.verOficina')).first().click()]);
    if (pop) await pop.waitForLoadState('networkidle').catch(() => {});
    const url = pop ? pop.url() : pa.url();
    const corpo = pop ? await pop.innerText('body').catch(() => '') : await pa.innerText('body');
    // desde 09/11 a pagina da oficina abre dentro do app (tela propria; antes ia ao site e o "voltar" perdia o app)
    ok('9: app - pagina da oficina abre no app (sem "Unmatched Route")', url.includes(`/oficina/${of1.id}`) &&!/Unmatched Route/.test(corpo) && corpo.includes(of1.nome_fantasia), url);
    if (pop) await pop.close();
    await pa.goto(`${APP}/perfil`, { waitUntil: 'networkidle' }); await pa.waitForTimeout(2500);
    const rotulos = await pa.evaluate(() => [...document.querySelectorAll('a')].filter((e) => e.getBoundingClientRect().top > innerHeight - 100).map((e) => { const r = [...e.querySelectorAll('div')].filter((d) => !d.children.length && d.innerText.trim()).at(-1); return r ? `${r.innerText}:${Math.round(r.getBoundingClientRect().height)}` : '-'; }));
    ok('5: app - nome das abas inteiro (nao cortado embaixo)', rotulos.length === 5 && rotulos.every((r) => Number(r.split(':')[1]) >= 13), JSON.stringify(rotulos));
    pa.once('dialog', (d) => d.accept());
    await pa.getByText(TA('perfil.sair'), { exact: true }).locator('visible=true').last().click(); await pa.waitForTimeout(3500);
    ok('10: app - "Sair" funciona (volta ao login)', /\/login/.test(pa.url()), pa.url());
    await ca.close();
    const cp = await ctxApp('en'); const pp = await cp.newPage();
    await pp.goto(APP, { waitUntil: 'networkidle' }); await pp.waitForTimeout(1500);
    await pp.getByText(TA('auth.pedirSemConta'), { exact: true }).locator('visible=true').last().click();
    await pp.getByText(TA('pedidoSemConta.titulo')).first().waitFor({ timeout: 15000 });
    await pp.getByText(new RegExp(TA('constants.tiposServico.mecanica'))).locator('visible=true').first().click();
    await pp.getByLabel(TA('novaSolicitacao.passoSintomas'), { exact: true }).locator('visible=true').first().fill('Test');
    await pp.getByText(TA('pedidoSemConta.next'), { exact: true }).locator('visible=true').last().click();
    await pp.getByLabel(TA('veiculos.marca'), { exact: true }).locator('visible=true').first().click();
    await pp.getByLabel(TA('veiculos.marca'), { exact: true }).locator('visible=true').last().fill('Toyota'); await pp.waitForTimeout(1500);
    await pp.getByText('Toyota', { exact: true }).last().click(); await pp.waitForTimeout(800);
    await pp.getByLabel(TA('veiculos.modelo'), { exact: true }).locator('visible=true').first().click();
    await pp.getByLabel(TA('veiculos.modelo'), { exact: true }).locator('visible=true').last().fill('Corolla'); await pp.waitForTimeout(2500);
    await pp.getByText('Corolla', { exact: true }).last().click(); await pp.waitForTimeout(150);
    const ano = pp.getByLabel(TA('veiculos.ano'), { exact: true }).locator('visible=true').first();
    await ano.tap(); await pp.keyboard.type('2019', { delay: 60 });
    const placa = pp.getByLabel(TA('pedidoSemConta.plateLabel'), { exact: true }).locator('visible=true').first();
    await placa.tap(); await pp.keyboard.type('ABC123', { delay: 60 });
    const vAno = await ano.inputValue(); const vPlaca = await placa.inputValue();
    ok('4: app - ano e placa digitados de primeira (o campo nao perde o toque)', vAno === '2019' && vPlaca === 'ABC123', `ano ${vAno} placa ${vPlaca}`);
    await pp.screenshot({ path: path.join(OUT, '4_app_carro_390.png'), fullPage: true });
    await cp.close();
  }
} catch (e) {
  falhas++;
  console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  for (const id of sols) {
    const { data: orcs } = await admin.from('orcamentos').select('id').eq('solicitacao_id', id);
    for (const o of orcs || []) { await admin.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await admin.from('orcamento_itens').delete().eq('orcamento_id', o.id); }
    const { data: ags } = await admin.from('agenda').select('id').eq('solicitacao_id', id);
    for (const a of ags || []) { await admin.from('agenda_historico').delete().eq('agenda_id', a.id); await admin.from('manutencao_etapas').delete().eq('agenda_id', a.id); }
    for (const t of ['orcamento_revisoes', 'agenda', 'mensagens', 'solicitacao_fotos', 'orcamentos']) await admin.from(t).delete().eq('solicitacao_id', id);
    await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', id);
    await admin.from('solicitacoes').delete().eq('id', id);
  }
  const { data: ofTeste } = await admin.from('profiles').select('id').eq('email', `fb-of-${tag}@example.test`).maybeSingle();
  if (ofTeste) { await admin.from('oficinas').delete().eq('profile_id', ofTeste.id); contas.add(ofTeste.id); }
  for (const id of contas) { await admin.from('veiculos').delete().eq('profile_id', id); await admin.from('notificacoes').delete().eq('profile_id', id); await admin.from('profiles').delete().eq('id', id); await admin.auth.admin.deleteUser(id).catch(() => {}); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
