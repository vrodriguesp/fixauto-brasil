// E2E LOCAL da bolinha vermelha dos pedidos NOVOS (dono 17/11: "colocar uma bolinha vermelha onde tem
// novos pedidos para guiar as oficinas"; a CARVEX abria direto em /ee/ru/oficina/pedidos?aba=respondidos
// e nao via os pedidos novos). Novo = pedido da aba "Para responder" que a oficina ainda nao abriu
// (pedido_vistos). Confere:
//  1 entrando direto em ?aba=respondidos: bolinha "1" na aba "Para responder" e no "Pedidos" do menu
//    (computador 1280) e da barra de baixo (celular 390); o contador antigo do menu continua "Pedidos N"
//  2 abrir o pedido -> ao voltar a bolinha some (aba e menu); com 0 novos nao ha elemento da bolinha
//  3 pedido novo chegando com a lista aberta (tempo real): a bolinha volta sem recarregar, na aba e no menu
//  4 ate "9+" (o leitor de tela ouve o numero exato); mecanico nao ve bolinha (vai para Hoje)
//  5 6 idiomas: rotulo acessivel traduzido, sem chave crua, sem rolagem lateral, sem erro de pagina
//  Chromium (1280 e 390) + uma passada no WebKit (iPhone 13). Contas @example.test, apaga tudo no fim.
//   node bolinha-pedidos.mjs <.env.local>      (SITE=http://localhost:3100 por padrao)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const { createClient } = req('@supabase/supabase-js');
const { chromium, webkit, devices } = req('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SITE)) throw new Error('TESTE LOCAL: SITE precisa ser o site local - parado para nao tocar a producao');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/bolinha-pedidos';
fs.mkdirSync(OUT, { recursive: true });
// textos do proprio site deste checkout (messages/ ao lado)
const MSG = new URL('../../messages/', import.meta.url);
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(new URL(`${l}${a}.json`, MSG), 'utf8'))));
const PLURAL = { 'pt-PT': 'pt-PT', pt: 'pt-BR' };
// formata o ICU simples do next-intl ({n, plural, one {...} other {...}} e {x})
const tr = (l) => { const m = msgs(l); return (k, v = {}) => {
  let s = String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`);
  s = s.replace(/\{(\w+), plural,((?:[^{}]|\{[^{}]*\})*)\}/g, (_, x, corpo) => {
    const ramos = Object.fromEntries([...corpo.matchAll(/(\w+)\s*\{([^{}]*)\}/g)].map((r) => [r[1], r[2]]));
    const cat = new Intl.PluralRules(PLURAL[l] || l).select(Number(v[x]));
    return (ramos[cat] ?? ramos.other).replace(/#/g, String(v[x]));
  });
  return s.replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
}; };
const PREFIXO = { pt: '/br/pt', 'pt-PT': '/pt/pt', en: '/ee/en', et: '/ee/et', it: '/it/it', ru: '/ee/ru' };
const RU = tr('ru');
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 260) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; let ofId = null; const sols = [];
// oficina longe de Tallinn (Kuressaare, raio 5 km): pedidos de outros testes nao entram na conta
const LAT = 58.2528, LNG = 22.4869;
const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
const WEBKIT = path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe');
const HOST_SITE = new URL(SITE).host;
// WebKit relata prefetch da propria origem abortado pela nossa navegacao como "due to access control checks" (falso erro)
const artefatoWebkit = (msg) => /due to access control checks/.test(msg) && msg.includes(`${HOST_SITE}/`);

const conta = async (tipo, nome, idioma = 'ru') => {
  const email = `bolinha-${tipo}${contas.length}-${tag}@example.test`; const senha = `Bo${tag}Senha9`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone: '+372 5000 0000' });
  return { id: data.user.id, email, senha };
};
let cli, carroId;
const pedido = async (minAtras, extra = {}) => {
  const { data, error } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: carroId, tipo: 'mecanica', descricao: `teste bolinha ${tag}`, urgencia: 'media', status: 'aberta', latitude: LAT + 0.002, longitude: LNG + 0.003, endereco: 'Kuressaare', pais: 'EE', created_at: new Date(Date.now() - minAtras * 60e3).toISOString(), ...extra }).select('id').single();
  if (error) throw new Error('pedido ' + error.message);
  sols.push(data.id); return data.id;
};

const contexto = async (B, tipo) => {
  const base = tipo === 'iphone' ? { ...devices['iPhone 13'] } : tipo === 'cel' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } };
  const c = await B.newContext(base);
  c.setDefaultTimeout(15000);
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} });
  return c;
};
const entrar = async (c, u, erros, quem, pre = '/ee/ru') => {
  const p = await c.newPage();
  p.on('pageerror', (e) => { const m = String(e.message); if (!artefatoWebkit(m)) erros.push(`${quem}: ${m.slice(0, 200)}`); });
  await p.goto(`${SITE}${pre}/login`, { waitUntil: 'networkidle' });
  await p.locator('input[type=email]').last().fill(u.email);
  await p.locator('input[type=password]').first().fill(u.senha);
  await p.locator('button[type=submit]').first().click();
  await p.waitForURL((x) => /\/oficina(\/|$)/.test(x.pathname), { timeout: 30000 }).catch(() => {});
  await p.waitForLoadState('networkidle').catch(() => {});
  await sleep(1500);
  return p;
};
const ir = async (p, url, ms = 2500) => { await p.goto(`${SITE}${url}`, { waitUntil: 'networkidle' }).catch(() => {}); await sleep(ms); };
const BOL = '[data-testid="bolinha-pedidos-novos"]';
// bolinha da aba "Para responder" (1a aba), do menu de cima (computador) e da barra de baixo (celular)
const dotAba = (p) => p.locator(`[role="tablist"] [role="tab"]`).first().locator(BOL);
const dotMenu = (p) => p.locator(`nav:not(.barra-inferior) a[href$="/oficina/pedidos"] ${BOL}`);
const dotBarra = (p) => p.locator(`nav.barra-inferior a[href$="/oficina/pedidos"] ${BOL}`);
const texto = async (loc) => ((await loc.count()) ? (await loc.first().innerText()).trim() : null);
const visivel = async (loc) => (await loc.count()) > 0 && (await loc.first().isVisible());
const espera = async (fn, ms = 12000) => { const fim = Date.now() + ms; while (Date.now() < fim) { if (await fn()) return true; await sleep(400); } return false; };
const semRolagem = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
// bolinha da aba: centro dentro da propria aba (nao no vao com a vizinha), no alto, sem cobrir o texto da aba
const bolinhaDaAbaBemPosta = (p) => p.evaluate(() => {
  const aba = document.querySelector('[role="tablist"] [role="tab"]');
  const b = aba?.querySelector('[data-testid="bolinha-pedidos-novos"]');
  if (!aba || !b) return { ok: false, motivo: 'sem aba/bolinha' };
  const ra = aba.getBoundingClientRect(), rb = b.getBoundingClientRect();
  const cx = rb.left + rb.width / 2;
  const textos = [];
  for (const n of aba.childNodes) {
    const el = n.nodeType === 3 ? n : (n !== b ? n : null);
    if (!el || (n.nodeType === 3 && !n.textContent.trim())) continue;
    const rg = document.createRange(); rg.selectNodeContents(el); textos.push(...[...rg.getClientRects()]);
  }
  const cobre = textos.some((r) => r.width && r.left < rb.right - 3 && r.right > rb.left + 3 && r.top < rb.bottom - 3 && r.bottom > rb.top + 3);
  const okPos = cx > ra.left + ra.width / 2 && rb.right <= ra.right + 0.5 && rb.top < ra.top;
  return { ok: okPos && !cobre, okPos, cobre, ra: [ra.left, ra.right, ra.top], rb: [rb.left, rb.right, rb.top, rb.bottom] };
});
const semChaveCrua = async (p) => {
  const t = await p.innerText('body');
  const rotulos = await p.locator(BOL).evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-label')} ${e.getAttribute('title')}`).join(' '));
  return !/\?\?[a-zA-Z]|\bnav\.[a-zA-Z]|\boficinaPedidos\.[a-zA-Z]|pedidosNovos|\{n\}|\{n,|\bundefined\b|\bNaN\b/.test(`${t} ${rotulos}`);
};
// abre o (unico) cartao da aba "Para responder" pela tela e volta para a lista
const abrirEVoltar = async (p, solId, toque) => {
  await p.locator('[role="tablist"] [role="tab"]').first()[toque ? 'tap' : 'click']();
  await sleep(800);
  const link = p.locator(`[data-testid="pedido-cartao"] a[href$="/oficina/pedidos/${solId}"]`).first();
  if (await link.count()) await link[toque ? 'tap' : 'click']().catch(() => link.click()); else await ir(p, `/ee/ru/oficina/pedidos/${solId}`, 0);
  await p.waitForURL((x) => x.pathname.endsWith(`/oficina/pedidos/${solId}`), { timeout: 15000 }).catch(() => {});
  await p.waitForLoadState('networkidle').catch(() => {});
  const gravou = await espera(async () => ((await sb.from('pedido_vistos').select('solicitacao_id').eq('oficina_id', ofId).eq('solicitacao_id', solId)).data || []).length === 1);
  await sleep(1200);
  await p.goBack({ waitUntil: 'networkidle' }).catch(() => {});
  await sleep(2500);
  return gravou;
};

const erros = [];
let chrome = null, wk = null;
try {
  // ---------- dados
  const dono = await conta('oficina', 'Dono Bolinha');
  const { data: of, error: eOf } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `BOLINHA ${tag}`, endereco: 'Tallinna 1', cidade: 'Kuressaare', estado: 'Saare', cep: '93811', pais: 'EE', latitude: LAT, longitude: LNG, ativa: true, raio_atendimento_km: 5, especialidades: ['mecanica'], seguradoras_convencionadas: [] }).select('id').single();
  if (eOf) throw new Error(eOf.message);
  ofId = of.id;
  const mecU = await conta('oficina', 'Mehaanik Bolinha');
  await sb.from('funcionarios').insert({ oficina_id: ofId, profile_id: mecU.id, nome: 'Mehaanik Bolinha', cargo: 'mecanico', ativo: true, acesso_portal: true, primeiro_login: false });
  cli = await conta('cliente', 'Klient Bolinha');
  carroId = (await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: `Corolla ${tag}`, fipe_ano: '2018', placa: `B${tag}`.toUpperCase().slice(0, 7) }).select('id').single()).data.id;
  // um ja respondido (aba "Respondidas" com conteudo, como a CARVEX) e um novo, nao aberto
  const sRespondido = await pedido(180);
  await sb.from('orcamentos').insert({ solicitacao_id: sRespondido, oficina_id: ofId, status: 'enviado', valor_total: 120, prazo_dias: 1, validade: '2030-01-01' });
  const sNovo = await pedido(20);

  chrome = await chromium.launch({ executablePath: CHROME });

  // ---------- 1/2/3 computador 1280 (RU, como a CARVEX)
  {
    const c = await contexto(chrome, 'pc'); const p = await entrar(c, dono, erros, 'pc');
    ok('pc: login do dono abre em Pedidos', p.url().includes('/oficina/pedidos'), p.url());
    await ir(p, '/ee/ru/oficina/pedidos?aba=respondidos');
    await espera(async () => (await texto(dotAba(p))) === '1' && (await texto(dotMenu(p))) === '1');
    ok('pc: entrou em "Respondidas" (aba do endereco)', (await p.locator('[role="tab"][aria-selected="true"]').innerText()).includes(RU('oficinaPedidos.aba_respondidos')));
    ok('pc: bolinha "1" na aba "Para responder" mesmo em "Respondidas"', (await texto(dotAba(p))) === '1' && await visivel(dotAba(p)), await texto(dotAba(p)));
    ok('pc: bolinha "1" no "Pedidos" do menu de cima', (await texto(dotMenu(p))) === '1' && await visivel(dotMenu(p)), await texto(dotMenu(p)));
    ok('pc: bolinha vermelha', /bg-red-600/.test(await dotAba(p).getAttribute('class')) && /bg-red-600/.test(await dotMenu(p).getAttribute('class')));
    ok('pc: rotulo acessivel com o numero (RU)', (await dotAba(p).getAttribute('aria-label')) === RU('nav.pedidosNovos', { n: 1 }) && (await dotMenu(p).getAttribute('aria-label')) === RU('nav.pedidosNovos', { n: 1 }), await dotAba(p).getAttribute('aria-label'));
    // o contador de antes continua lido como "Pedidos N" (site-painel-oficina le assim)
    const contMenu = (await p.locator('nav').first().innerText()).match(new RegExp(RU('nav.pedidosOficina') + '\\s*(\\d+)'))?.[1];
    ok('pc: contador antigo do menu intacto ("Заявки 1")', contMenu === '1', contMenu);
    ok('pc: sem rolagem lateral / sem chave crua', await semRolagem(p) && await semChaveCrua(p));
    await p.screenshot({ path: `${OUT}/computador-1280-ru.png` });
    // a bolinha fica no alto da propria aba (sem cobrir o texto) e no canto do link do menu
    const caixa = async (loc) => loc.first().boundingBox();
    const posAba = await bolinhaDaAbaBemPosta(p);
    ok('pc: bolinha no alto da aba "Para responder", sem cobrir o texto', posAba.ok, JSON.stringify(posAba));
    const [bM, lM] = [await caixa(dotMenu(p)), await caixa(p.locator('nav a[href$="/oficina/pedidos"]').first())];
    ok('pc: bolinha no canto de cima a direita do link do menu', bM && lM && bM.x + bM.width > lM.x + lM.width - 4 && bM.y < lM.y + 2, JSON.stringify({ bM, lM }));
    // na aba "Para responder" o cartao tem "● Новая" e a bolinha conta os mesmos cartoes
    await p.locator('[role="tab"]').first().click(); await sleep(700);
    const novosCartoes = (await p.getByTestId('pedido-cartao').allInnerTexts()).filter((t) => t.includes(`● ${RU('oficinaPedidos.novo')}`)).length;
    ok('pc: bolinha = cartoes "● Новая" da aba', novosCartoes === 1, novosCartoes);
    // 2 abrir o pedido -> ao voltar nao ha bolinha
    const gravou = await abrirEVoltar(p, sNovo, false);
    ok('pc: abrir o pedido grava o "visto"', gravou);
    ok('pc: voltou para a lista', /\/oficina\/pedidos$/.test(new URL(p.url()).pathname), p.url());
    await espera(async () => (await p.locator(BOL).count()) === 0);
    ok('pc: depois de abrir, 0 novos -> nenhuma bolinha na pagina (aba e menu)', (await p.locator(BOL).count()) === 0, await p.locator(BOL).count());
    ok('pc: o pedido continua na aba "Para responder" (so deixou de ser novo)', (await p.getByTestId('pedido-cartao').count()) === 1);
    await ir(p, '/ee/ru/oficina/pedidos?aba=respondidos');
    ok('pc: recarregando em "Respondidas": sem bolinha', (await p.locator(BOL).count()) === 0);
    // 3 tempo real: pedido novo chega com a lista aberta
    const sTempoReal = await pedido(1);
    const voltou = await espera(async () => (await texto(dotAba(p))) === '1' && (await texto(dotMenu(p))) === '1', 20000);
    ok('pc: pedido novo chegando (tempo real): bolinha volta na aba e no menu sem recarregar', voltou, `${await texto(dotAba(p))} / ${await texto(dotMenu(p))}`);
    // outra pagina do painel: o menu conta sozinho (sem a lista)
    await ir(p, '/ee/ru/oficina/agenda');
    ok('pc: em outra pagina (Agenda) o menu mostra "1"', (await texto(dotMenu(p))) === '1', await texto(dotMenu(p)));
    // abrir pela rota do pedido (fora da lista): o menu atualiza na propria pagina do pedido
    await ir(p, `/ee/ru/oficina/pedidos/${sTempoReal}`, 0);
    const sumiu = await espera(async () => (await dotMenu(p).count()) === 0, 10000);
    ok('pc: na pagina do pedido aberto o menu ja fica sem bolinha', sumiu);
    ok('pc: sem rolagem lateral / sem chave crua (pagina do pedido)', await semRolagem(p) && await semChaveCrua(p));
    await c.close();
  }

  // ---------- 1/2 celular 390 (Chromium)
  const sCel = await pedido(5);
  {
    const c = await contexto(chrome, 'cel'); const p = await entrar(c, dono, erros, 'cel');
    await ir(p, '/ee/ru/oficina/pedidos?aba=respondidos');
    await espera(async () => (await texto(dotAba(p))) === '1' && (await texto(dotBarra(p))) === '1');
    ok('cel: bolinha "1" na aba "Para responder" em "Respondidas"', (await texto(dotAba(p))) === '1' && await visivel(dotAba(p)), await texto(dotAba(p)));
    ok('cel: bolinha "1" no "Pedidos" da barra de baixo', (await texto(dotBarra(p))) === '1' && await visivel(dotBarra(p)), await texto(dotBarra(p)));
    ok('cel: na barra de baixo um numero so no canto do icone (a bolinha)', (await p.locator('nav.barra-inferior a[href$="/oficina/pedidos"]').innerText()).replace(/\s+/g, ' ').trim() === `1 ${RU('nav.pedidosOficina')}`, await p.locator('nav.barra-inferior a[href$="/oficina/pedidos"]').innerText());
    // rotulos da barra continuam dentro da coluna, em uma linha
    const cabe = await p.evaluate(() => [...document.querySelectorAll('nav.barra-inferior a')].every((a) => { const r = a.querySelector('[data-rotulo]').getBoundingClientRect(); const ra = a.getBoundingClientRect(); return r.left >= ra.left - 0.5 && r.right <= ra.right + 0.5; }));
    ok('cel: rotulos da barra de baixo cabem nas colunas', cabe);
    const bB = await dotBarra(p).first().boundingBox();
    ok('cel: bolinha da barra dentro da tela', bB && bB.x >= 0 && bB.x + bB.width <= 390 && bB.y >= 0, JSON.stringify(bB));
    const posAba = await bolinhaDaAbaBemPosta(p);
    ok('cel: bolinha no alto da aba "Para responder", sem cobrir o texto', posAba.ok, JSON.stringify(posAba));
    ok('cel: sem rolagem lateral / sem chave crua', await semRolagem(p) && await semChaveCrua(p));
    await p.screenshot({ path: `${OUT}/celular-390-ru.png` });
    const gravou = await abrirEVoltar(p, sCel, true);
    ok('cel: abrir o pedido grava o "visto"', gravou);
    await espera(async () => (await p.locator(BOL).count()) === 0);
    ok('cel: ao voltar, nenhuma bolinha (aba e barra de baixo)', (await p.locator(BOL).count()) === 0, await p.locator(BOL).count());
    ok('cel: sem a bolinha, a barra volta ao contador de antes (total esperando)', /\d/.test(await p.locator('nav.barra-inferior a[href$="/oficina/pedidos"]').innerText()));
    await c.close();
  }

  // ---------- 4 "9+" e o leitor de tela com o numero exato; mecanico sem bolinha
  const dez = []; for (let i = 0; i < 10; i++) dez.push(await pedido(3 + i));
  {
    const c = await contexto(chrome, 'pc'); const p = await entrar(c, dono, erros, 'pc 9+');
    await ir(p, '/ee/ru/oficina/pedidos?aba=respondidos');
    await espera(async () => (await texto(dotAba(p))) === '9+' && (await texto(dotMenu(p))) === '9+');
    ok('9+: 10 novos -> "9+" na aba e no menu', (await texto(dotAba(p))) === '9+' && (await texto(dotMenu(p))) === '9+', `${await texto(dotAba(p))} / ${await texto(dotMenu(p))}`);
    ok('9+: rotulo acessivel com o numero exato (10)', (await dotAba(p).getAttribute('aria-label')) === RU('nav.pedidosNovos', { n: 10 }), await dotAba(p).getAttribute('aria-label'));
    // 5 seis idiomas (computador e celular): rotulo traduzido, sem chave crua, sem rolagem lateral
    for (const [l, pre] of Object.entries(PREFIXO)) {
      await sb.from('profiles').update({ idioma: l }).eq('id', dono.id);
      await ir(p, `${pre}/oficina/pedidos?aba=respondidos`);
      await espera(async () => (await texto(dotAba(p))) === '9+');
      const esperado = tr(l)('nav.pedidosNovos', { n: 10 });
      const [rA, rM] = [await dotAba(p).getAttribute('aria-label').catch(() => null), await dotMenu(p).getAttribute('aria-label').catch(() => null)];
      ok(`i18n ${l} pc: rotulo "${esperado}" na aba e no menu`, rA === esperado && rM === esperado, `${rA} | ${rM}`);
      ok(`i18n ${l} pc: sem chave crua, sem rolagem lateral`, await semChaveCrua(p) && await semRolagem(p));
      const pos = await bolinhaDaAbaBemPosta(p);
      ok(`i18n ${l} pc: "9+" no alto da aba sem cobrir o texto`, pos.ok, JSON.stringify(pos));
    }
    await sb.from('profiles').update({ idioma: 'ru' }).eq('id', dono.id);
    await c.close();
    const cc = await contexto(chrome, 'cel'); const pc = await entrar(cc, dono, erros, 'cel i18n');
    for (const [l, pre] of Object.entries(PREFIXO)) {
      await sb.from('profiles').update({ idioma: l }).eq('id', dono.id);
      await ir(pc, `${pre}/oficina/pedidos?aba=respondidos`);
      await espera(async () => (await texto(dotBarra(pc))) === '9+');
      const esperado = tr(l)('nav.pedidosNovos', { n: 10 });
      ok(`i18n ${l} cel: "9+" e rotulo traduzido na barra de baixo e na aba`, (await texto(dotBarra(pc))) === '9+' && (await dotBarra(pc).getAttribute('aria-label').catch(() => null)) === esperado && (await dotAba(pc).getAttribute('aria-label').catch(() => null)) === esperado);
      ok(`i18n ${l} cel: sem chave crua, sem rolagem lateral`, await semChaveCrua(pc) && await semRolagem(pc));
      const pos = await bolinhaDaAbaBemPosta(pc);
      ok(`i18n ${l} cel: "9+" no alto da aba sem cobrir o texto`, pos.ok, JSON.stringify(pos));
      if (l === 'pt') await pc.screenshot({ path: `${OUT}/celular-390-pt-9mais.png` });
    }
    await sb.from('profiles').update({ idioma: 'ru' }).eq('id', dono.id);
    await cc.close();
    // mecanico: vai para Hoje; nenhuma bolinha (nem no menu nem na barra)
    for (const tipo of ['pc', 'cel']) {
      const cm = await contexto(chrome, tipo); const pm = await entrar(cm, mecU, erros, `mecanico ${tipo}`);
      await ir(pm, '/ee/ru/oficina/pedidos?aba=respondidos', 3500);
      ok(`mecanico ${tipo}: Pedidos manda para Hoje`, pm.url().includes('/oficina/hoje'), pm.url());
      ok(`mecanico ${tipo}: nenhuma bolinha de pedidos novos`, (await pm.locator(BOL).count()) === 0);
      await cm.close();
    }
  }
  // as 10 deixam de ser novas (vistas pelo banco) para a passada do WebKit comecar com 1
  await sb.from('pedido_vistos').insert(dez.map((s) => ({ solicitacao_id: s, oficina_id: ofId })));
  await chrome.close(); chrome = null;

  // ---------- WebKit (iPhone 13): uma passada
  const sWk = await pedido(2);
  wk = await webkit.launch({ executablePath: WEBKIT });
  {
    const c = await contexto(wk, 'iphone'); const p = await entrar(c, dono, erros, 'webkit');
    await ir(p, '/ee/ru/oficina/pedidos?aba=respondidos', 3000);
    await espera(async () => (await texto(dotAba(p))) === '1' && (await texto(dotBarra(p))) === '1');
    ok('webkit: bolinha "1" na aba "Para responder" em "Respondidas"', (await texto(dotAba(p))) === '1' && await visivel(dotAba(p)), await texto(dotAba(p)));
    ok('webkit: bolinha "1" na barra de baixo', (await texto(dotBarra(p))) === '1' && await visivel(dotBarra(p)), await texto(dotBarra(p)));
    ok('webkit: sem rolagem lateral / sem chave crua', await semRolagem(p) && await semChaveCrua(p));
    const posAba = await bolinhaDaAbaBemPosta(p);
    ok('webkit: bolinha no alto da aba "Para responder", sem cobrir o texto', posAba.ok, JSON.stringify(posAba));
    await p.screenshot({ path: `${OUT}/webkit-iphone-ru.png` });
    const gravou = await abrirEVoltar(p, sWk, true);
    ok('webkit: abrir o pedido grava o "visto"', gravou);
    await espera(async () => (await p.locator(BOL).count()) === 0);
    ok('webkit: ao voltar, nenhuma bolinha', (await p.locator(BOL).count()) === 0, await p.locator(BOL).count());
    await c.close();
  }
  ok('nenhum erro de pagina (Chromium e WebKit)', erros.length === 0, erros.join(' | '));
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 900)); }
finally {
  if (chrome) await chrome.close().catch(() => {});
  if (wk) await wk.close().catch(() => {});
  for (const s of sols) {
    for (const t of ['pedido_vistos', 'pedido_dispensas', 'notificacoes_pedido', 'mensagens']) await sb.from(t).delete().eq('solicitacao_id', s);
    await sb.from('orcamentos').delete().eq('solicitacao_id', s);
    await sb.from('solicitacoes').delete().eq('id', s);
  }
  if (ofId) { await sb.from('funcionarios').delete().eq('oficina_id', ofId); await sb.from('comissao_config').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  const { count } = await sb.from('solicitacoes').select('id', { count: 'exact', head: true }).in('id', sols.length ? sols : ['00000000-0000-0000-0000-000000000000']);
  console.log(count ? `FALHA limpeza: ${count} pedido(s) ficaram` : 'limpeza ok');
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
