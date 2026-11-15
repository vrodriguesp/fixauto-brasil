// QA LOCAL do check-in v2 (pedido do dono 14/11 antes do deploy; regras em
// Documentos/Analises/Checkin_v2_decisoes_finais_2026-11-14.md). So o ambiente local (banco Docker + :3100 + app web :8090).
//  A  auditoria visual: 360x740, 390x844, 1366x768, 1920x1080 x et/ru (+ en em 390 e 1366). Em cada tela/estado:
//     rolagem lateral, controles sobrepostos, controle coberto (elementFromPoint: chat azul, barra de baixo, cabecalho)
//     no topo e no fim da pagina, texto cortado, coisa fora da tela, alvo de toque < 40 px, foco visivel (Tab),
//     folha/tooltip inteira na tela. Prints em resultados/qa-checkin-v2/A_*.png
//  B  simulacao de todas as interacoes (oficina + motorista) com varredura de consistencia da janela em todos os
//     lugares (painel, dashboard, Pedidos, resumo, Hoje, Agenda, Quadro, app web, e-mail, .ics)
//  C  caso real de 14/11 (pedido 100140) e os comportamentos possiveis
//   node qa-checkin-v2.mjs ../../.env.local [A|B|C|ABC]
// Saida: resultados/qa-checkin-v2/resultado_<fase>.json (checks + achados da auditoria) e o log no console.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { escolherCheckin } from './ajuda-checkin.mjs';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
const APP = process.env.APP || 'http://localhost:8090';
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(SITE) || !/^http:\/\/(localhost|127\.0\.0\.1)/.test(APP)) throw new Error('SITE/APP nao e local');
const FASES = (process.argv[3] || 'ABC').toUpperCase();
const EMAILS = env.EMAIL_PASTA_TESTE;
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/qa-checkin-v2';
fs.mkdirSync(OUT, { recursive: true });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const MSG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../messages');
const MOB = path.resolve(MSG, '../../mobile/i18n/locales');
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8'))));
const tr = (l) => { const m = msgs(l); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? `{${x}}`); };
const trApp = (l) => { const j = JSON.parse(fs.readFileSync(`${MOB}/${l}.json`, 'utf8')); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], j) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
const T = tr('et');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = crypto.randomBytes(3).toString('hex');

// ---------- registro ----------
const R = { fase: FASES, inicio: new Date().toISOString(), checks: [], achados: [] };
let falhas = 0, oks = 0;
let FASE = 'A';
const ok = (n, c, x = '', shot = '') => {
  if (!c) falhas++; else oks++;
  R.checks.push({ fase: FASE, nome: n, ok: !!c, det: c ? '' : String(x).replace(/\s+/g, ' ').slice(0, 600), shot });
  console.log(`${c ? 'ok  ' : 'FALHA'} [${FASE}] ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 300) : ''}`);
  return !!c;
};
const salvar = () => fs.writeFileSync(path.join(OUT, `resultado_${FASES}.json`), JSON.stringify({ ...R, fim: new Date().toISOString(), oks, falhas }, null, 1));

// ---------- datas (fuso de Tallinn) ----------
const hojeTallinn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date());
const somar = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const proximo = (dow, depois = hojeTallinn) => { let d = somar(depois, 1); while (new Date(`${d}T12:00:00Z`).getUTCDay() !== dow) d = somar(d, 1); return d; };
const SEG = proximo(1), TER = somar(SEG, 1), QUA = somar(SEG, 2), QUI = somar(SEG, 3), SEX = somar(SEG, 4), SAB = somar(SEG, 5), DOM = somar(SEG, 6), SEG2 = somar(SEG, 7), TER2 = somar(SEG, 8), QUA2 = somar(SEG, 9), QUI2 = somar(SEG, 10);
const ONTEM = somar(hojeTallinn, -1), ANTEONTEM = somar(hojeTallinn, -2);
const tallinn = (ymd, hm) => { for (const off of ['+02:00', '+03:00']) { const d = new Date(`${ymd}T${hm}:00${off}`); if (d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit' }) === hm) return d.toISOString(); } return null; };
const icsData = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const HORARIO = {
  seg: { aberto: true, inicio: '08:00', fim: '18:00' }, ter: { aberto: true, inicio: '08:00', fim: '18:00' },
  qua: { aberto: true, inicio: '08:00', fim: '18:00' }, qui: { aberto: true, inicio: '08:00', fim: '18:00' },
  sex: { aberto: true, inicio: '08:00', fim: '17:00' }, sab: { aberto: false, inicio: '', fim: '' }, dom: { aberto: false, inicio: '', fim: '' },
};
// e-mails capturados
const emailsDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort().map((f) => ({ f, html: fs.readFileSync(path.join(EMAILS, f), 'utf8') }));
const icsDe = (htmlArq) => { const a = path.join(EMAILS, htmlArq.replace(/\.html$/, '') + '__bipfix-agendamento.ics'); return fs.existsSync(a) ? fs.readFileSync(a, 'utf8') : null; };
const esperarEmail = async (email, depois, filtro = () => true) => { for (let i = 0; i < 40; i++) { const e = emailsDe(email, depois).filter(filtro).at(-1); if (e) return e; await sleep(300); } return null; };

// ---------- navegador ----------
const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
const browser = await chromium.launch({ executablePath: exe });
const VPS = { 360: { w: 360, h: 740, m: true }, 390: { w: 390, h: 844, m: true }, 1366: { w: 1366, h: 768, m: false }, 1920: { w: 1920, h: 1080, m: false } };
const contexto = async (vp = 390, extra = {}) => {
  const v = VPS[vp];
  const c = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.m ? 2 : 1, isMobile: v.m, hasTouch: v.m, ...extra });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} });
  c.setDefaultTimeout(12000);
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const entrar = async (p, u, pre = '/ee/et') => {
  await p.goto(`${SITE}${pre}/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]');
  await p.waitForURL((x) => !x.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {});
  await sleep(2000);
};
const entrarApp = async (pa, u, l = 'et') => {
  const TA = trApp(l);
  await pa.goto(APP, { waitUntil: 'networkidle' }); await sleep(1500);
  await pa.getByLabel(TA('auth.email'), { exact: true }).locator('visible=true').first().fill(u.email);
  await pa.getByLabel(TA('auth.senha'), { exact: true }).locator('visible=true').first().fill(u.senha);
  await pa.getByText(TA('auth.entrar'), { exact: true }).locator('visible=true').last().click(); await sleep(4500);
};
const ir = async (p, url, espera = 2200) => { await p.goto(url.startsWith('http') ? url : `${SITE}${url}`, { waitUntil: 'networkidle' }).catch(() => {}); await sleep(espera); };
const visivel = (p, id) => p.getByTestId(id).first().isVisible().catch(() => false);
const texto = (p, id) => p.getByTestId(id).first().innerText().catch(() => '');
const corpo = (p) => p.locator('body').innerText().catch(() => '');
const esperarTeste = async (p, id, ms = 15000) => { try { await p.getByTestId(id).first().waitFor({ timeout: ms }); return true; } catch { return false; } };

// ---------- auditoria visual (roda no navegador) ----------
const AUDIT = (o) => {
  const W = document.documentElement.clientWidth, H = window.innerHeight;
  const res = [];
  const d = (el) => {
    if (!el) return '';
    const t = (el.getAttribute?.('data-testid') || el.getAttribute?.('aria-label') || (el.innerText || el.value || '').trim() || el.getAttribute?.('name') || '').replace(/\s+/g, ' ').slice(0, 60);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.getAttribute?.('data-testid') ? '' : ''}[${t}]`;
  };
  const add = (tipo, el, det) => res.push({ tipo, el: d(el), det });
  const opac = new Map();
  const transparente = (el) => { for (let a = el; a; a = a.parentElement) { if (opac.has(a)) { if (opac.get(a)) return true; continue; } const z = getComputedStyle(a).opacity === '0'; opac.set(a, z); if (z) return true; } return false; };
  const vis = (el) => {
    if (!el.isConnected || el.closest('[hidden],[aria-hidden="true"],[inert]')) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') return false;
    return !transparente(el);
  };
  const camada = (el) => { for (let a = el; a && a !== document.body; a = a.parentElement) { const p = getComputedStyle(a).position; if (p === 'fixed' || p === 'sticky') return a; } return null; };
  const emRolagemX = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && a.scrollWidth > a.clientWidth + 1) return a; } return null; };
  const root = o.dentro ? document.querySelector(o.dentro) : document.body;
  if (!root) return [{ tipo: 'erro', el: '', det: 'raiz nao encontrada ' + o.dentro }];
  const CTRL = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], summary';
  const ctrls = [...root.querySelectorAll(CTRL)].filter(vis);
  const notas = [...root.querySelectorAll('[role=note], label')].filter(vis);
  if (!o.dentro && !o.soCobertura) { const x = document.documentElement.scrollWidth - W; if (x > 1) add('rolagem-lateral', null, `pagina ${x}px mais larga que a tela`); }
  // 1) controles cobertos (no ponto central e nos cantos) por outro elemento (ex.: chat azul, barra de baixo)
  const assoc = (el, top) => el === top || el.contains(top) || top.contains(el) || (top.closest('label') && (top.closest('label').contains(el) || (el.id && top.closest('label').htmlFor === el.id)));
  for (const el of ctrls) {
    const r = el.getBoundingClientRect();
    const pts = [[r.left + r.width / 2, r.top + r.height / 2, 'centro'], [r.left + Math.min(6, r.width / 3), r.top + r.height / 2, 'esq'], [r.right - Math.min(6, r.width / 3), r.top + r.height / 2, 'dir']];
    for (const [x, y, onde] of pts) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const top = document.elementFromPoint(x, y);
      if (!top || assoc(el, top)) continue;
      const cam = camada(top);
      if (o.dentro && !root.contains(top)) { add('coberto', el, `${onde} coberto por ${d(cam || top)} (fora da folha)`); break; }
      if (!root.contains(top) && !cam) continue;
      if (cam && camada(el) === cam) { add('coberto', el, `${onde} coberto por ${d(top)} (mesma camada fixa)`); break; }
      if (cam) {
        // camada fixa (cabecalho, barra de baixo, chat): so e defeito se rolando o controle para o meio ele CONTINUA coberto
        const sx = window.scrollX, sy = window.scrollY;
        const rolaveis = []; for (let a = el.parentElement; a; a = a.parentElement) if (a.scrollHeight > a.clientHeight + 2) rolaveis.push([a, a.scrollTop]);
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r2 = el.getBoundingClientRect();
        const x2 = onde === 'centro' ? r2.left + r2.width / 2 : onde === 'esq' ? r2.left + Math.min(6, r2.width / 3) : r2.right - Math.min(6, r2.width / 3);
        const top2 = document.elementFromPoint(x2, r2.top + r2.height / 2);
        const continua = top2 && !assoc(el, top2) && camada(top2) && camada(top2) !== camada(el);
        const pos = `topo do controle ${Math.round(r2.top)}px de ${H}`;
        for (const [a, st] of rolaveis) a.scrollTop = st; window.scrollTo(sx, sy);
        if (continua) { add(onde === 'centro' ? 'coberto' : 'parcialmente-coberto', el, `${onde} coberto por ${d(camada(top2))} > ${d(top2)} mesmo rolando (${pos})`); break; }
        continue;
      }
      add(onde === 'centro' ? 'coberto' : 'parcialmente-coberto', el, `${onde} coberto por ${d(top)}`); break;
    }
  }
  if (o.soCobertura) return res;
  // 2) sobreposicao entre controles/rotulos/notas da mesma camada (coordenadas da pagina)
  const todos = [...ctrls, ...notas].map((el) => ({ el, r: el.getBoundingClientRect(), c: camada(el) }));
  for (let i = 0; i < todos.length; i++) for (let j = i + 1; j < todos.length; j++) {
    const a = todos[i], b = todos[j];
    if (a.c !== b.c || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if ((a.el.tagName === 'LABEL' && a.el.htmlFor && a.el.htmlFor === b.el.id) || (b.el.tagName === 'LABEL' && b.el.htmlFor && b.el.htmlFor === a.el.id)) continue;
    const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (ix > 3 && iy > 3) res.push({ tipo: 'sobreposto', el: d(a.el), det: `sobre ${d(b.el)} (${Math.round(ix)}x${Math.round(iy)} px)` });
  }
  // 3) texto cortado / fora da tela
  const textuais = [...root.querySelectorAll('button, a, label, span, p, h1, h2, h3, h4, li, td, th, dt, dd, strong, small, div')].filter((el) => {
    if (!vis(el)) return false;
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1) || /^(BUTTON|A|LABEL)$/.test(el.tagName);
  });
  const foraSet = new Set();
  for (const el of textuais) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (el.scrollWidth > el.clientWidth + 1 && /(hidden|clip)/.test(s.overflowX) && el.clientWidth > 0) add('texto-cortado', el, `largura ${el.clientWidth}px, conteudo ${el.scrollWidth}px${s.textOverflow === 'ellipsis' ? ' (reticencias)' : ''}`);
    else if (el.scrollHeight > el.clientHeight + 2 && /(hidden|clip)/.test(s.overflowY) && el.clientHeight > 0 && !/(auto|scroll)/.test(s.overflowY)) add('texto-cortado', el, `altura ${el.clientHeight}px, conteudo ${el.scrollHeight}px`);
    if ((r.right > W + 1 || r.left < -1) && !emRolagemX(el)) { foraSet.add(el); }
  }
  for (const el of foraSet) { if (el.parentElement && foraSet.has(el.parentElement)) continue; const r = el.getBoundingClientRect(); add('fora-da-tela', el, `x ${Math.round(r.left)}..${Math.round(r.right)} (tela ${W})`); }
  // 4) alvo de toque < 40 px (com a area extra do ::after; checkbox/radio pelo label; link dentro de texto fica de fora)
  for (const el of ctrls) {
    let r = el.getBoundingClientRect(); let w = r.width, h = r.height;
    if (el.matches('input[type=checkbox], input[type=radio]')) { const lb = el.closest('label') || (el.id && document.querySelector(`label[for="${el.id}"]`)); if (lb) { const q = lb.getBoundingClientRect(); w = q.width; h = q.height; } }
    const af = getComputedStyle(el, '::after');
    if (af.content && af.content !== 'none' && af.position === 'absolute') { w += Math.max(0, -parseFloat(af.left) || 0) + Math.max(0, -parseFloat(af.right) || 0); h += Math.max(0, -parseFloat(af.top) || 0) + Math.max(0, -parseFloat(af.bottom) || 0); }
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && (el.parentElement.innerText || '').trim().length > (el.innerText || '').trim().length + 3) continue;
    if (Math.min(w, h) < 40) add('alvo-pequeno', el, `${Math.round(w)}x${Math.round(h)} px`);
  }
  // 5) folhas / dialogos / notas inteiros na tela
  for (const dl of [...document.querySelectorAll('[role=dialog], [role=note]:not([hidden])')].filter(vis)) {
    const r = dl.getBoundingClientRect();
    if (dl.getAttribute('role') === 'dialog' && (r.top < -1 || r.left < -1 || r.right > W + 1 || r.bottom > H + 1)) add('dialogo-fora', dl, `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} (tela ${W}x${H})`);
    if (dl.getAttribute('role') === 'note' && (r.left < -1 || r.right > W + 1)) add('nota-fora', dl, `x ${Math.round(r.left)}..${Math.round(r.right)}`);
  }
  return res;
};
const FOCO = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const s = getComputedStyle(el);
  const contorno = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
  const sombra = s.boxShadow && s.boxShadow !== 'none';
  const t = (el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  return { el: `${el.tagName.toLowerCase()}[${t}]`, visivel: contorno || sombra, estilo: `${s.outlineStyle} ${s.outlineWidth} | ${s.boxShadow.slice(0, 40)}` };
};
const IGNORAR = [/chat-suporte-botao.*alvo/, /barra-carregando/];
// cortes/sobreposicoes ANTIGOS, fora do check-in v2, ja listados no QA de 14/11 como "nao conta" (cortes de desenho da
// Agenda mes/Quadro; cabecalho do app rolado a 360 px, D-A3). Continuam no relatorio (achados), mas nao reprovam a tela.
const CONHECIDOS = [/^span\[1 (Ootel|Ожидается|Pending|In attesa|Pendente)\] texto-cortado/, /^button\[[A-Z0-9]+ · .*\] texto-cortado/, /^button\[(Muuda päringut|Изменить заявку)\] coberto/, /^button\[(Tagasi|Назад)\] sobreposto/];
let nAud = 0;
/** auditoria de uma tela: topo + fim da pagina (cobertura), print, achados no relatorio. info: { pagina, estado, loc, vp } */
async function auditar(p, info, opts = {}) {
  nAud++;
  const nome = `A_${info.pagina}_${info.estado}_${info.loc}_${info.vp}`.replace(/[^\w.-]+/g, '-');
  const shot = path.join(OUT, `${nome}.png`);
  const achados = [];
  try {
    if (!opts.dentro && !opts.semRolar) await p.evaluate(() => window.scrollTo(0, 0));
    await sleep(250);
    achados.push(...(await p.evaluate(AUDIT, { dentro: opts.dentro || null })));
    if (opts.dentro) {
      // folha com rolagem propria: fim da folha tambem
      const rolou = await p.evaluate((sel) => { const f = document.querySelector(sel); if (!f) return false; const alvo = [f, ...f.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)); if (!alvo) return false; alvo.scrollTop = alvo.scrollHeight; return true; }, opts.dentro);
      if (rolou) { await sleep(200); achados.push(...(await p.evaluate(AUDIT, { dentro: opts.dentro, soCobertura: true })).map((a) => ({ ...a, det: `${a.det} (fim da folha)` }))); }
    } else if (!opts.semRolar) {
      await p.screenshot({ path: shot, fullPage: false });
      const alto = await p.evaluate(() => document.documentElement.scrollHeight > innerHeight + 4);
      if (alto) {
        await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(350);
        achados.push(...(await p.evaluate(AUDIT, { soCobertura: true })).map((a) => ({ ...a, det: `${a.det} (fim da pagina)` })));
        await p.screenshot({ path: shot.replace(/\.png$/, '_fim.png'), fullPage: false });
        await p.evaluate(() => window.scrollTo(0, 0));
      }
    }
    if (opts.dentro || opts.semRolar) await p.screenshot({ path: shot, fullPage: false });
    if (opts.full) await p.screenshot({ path: shot.replace(/\.png$/, '_inteira.png'), fullPage: true });
    if (opts.foco) {
      const vistos = [];
      await p.evaluate((sel) => { const r = sel ? document.querySelector(sel) : document.body; (r?.querySelector('[data-foco-inicial]') || r)?.focus?.(); }, opts.dentro || null).catch(() => {});
      for (let i = 0; i < (opts.foco === true ? 25 : opts.foco); i++) { await p.keyboard.press('Tab'); await sleep(60); const f = await p.evaluate(FOCO); if (f) vistos.push(f); }
      const sem = vistos.filter((f) => !f.visivel);
      const unicos = [...new Map(sem.map((f) => [f.el, f])).values()];
      for (const f of unicos) achados.push({ tipo: 'foco-invisivel', el: f.el, det: f.estilo });
      if (!vistos.length) achados.push({ tipo: 'foco-invisivel', el: '', det: 'Tab nao chegou a nenhum controle' });
    }
  } catch (e) { achados.push({ tipo: 'erro', el: '', det: String(e.message).slice(0, 200) }); }
  // dedupe por tipo+el
  const unicos = [...new Map(achados.map((a) => [`${a.tipo}|${a.el}|${a.det.includes('fim da') ? 'f' : 't'}`, a])).values()].filter((a) => !IGNORAR.some((re) => re.test(`${a.el} ${a.tipo}`)));
  for (const a of unicos) R.achados.push({ ...info, ...a, shot: path.basename(shot) });
  const graves0 = unicos.filter((a) => ['rolagem-lateral', 'coberto', 'sobreposto', 'texto-cortado', 'fora-da-tela', 'dialogo-fora', 'nota-fora', 'erro'].includes(a.tipo));
  const graves = graves0.filter((a) => !CONHECIDOS.some((re) => re.test(`${a.el} ${a.tipo}`)));
  for (const a of graves0.filter((x) => !graves.includes(x))) console.log(`info [A] conhecido (fora do check-in v2): ${info.pagina}/${info.estado} ${info.loc} ${info.vp} ${a.tipo} ${a.el} ${a.det}`);
  ok(`A: ${info.pagina}/${info.estado} ${info.loc} ${info.vp}: sem nada coberto/sobreposto/cortado/fora`, !graves.length, graves.map((a) => `${a.tipo} ${a.el} ${a.det}`).join(' ; '), path.basename(shot));
  return unicos;
}

// ---------- dados ----------
const contas = []; const sols = []; const oficinas = [];
const conta = async (tipo, nome, idioma = 'et') => {
  const email = `qa-${tipo}${contas.length}-${tag}@example.test`; const senha = `Qa${tag}Senha9`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone: '+372 5000 0000' });
  return { id: data.user.id, email, senha };
};
const novaOficina = async (nome, horario = HORARIO, extra = {}) => {
  const dono = await conta('oficina', `Dono ${nome}`);
  const { data: of, error } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `${nome} ${tag}`, endereco: 'Kesktee 1', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: 59.437, longitude: 24.75, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica'], seguradoras_convencionadas: [], horario_funcionamento: horario, ...extra }).select('id').single();
  if (error) throw new Error(error.message);
  oficinas.push(of.id);
  return { dono, ofId: of.id };
};
const novoCliente = async (nome = 'Klient QA') => {
  const cli = await conta('cliente', nome);
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: `Avensis ${tag}`, fipe_ano: '2012', placa: `Q${tag}${contas.length}`.toUpperCase() }).select('id').single();
  return { cli, vId: v.id };
};
const token = async (u) => { const c = anon(); const { data } = await c.auth.signInWithPassword({ email: u.email, password: u.senha }); return data.session?.access_token; };
const post = async (p, tok, corpo) => { const r = await fetch(`${SITE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify(corpo) }); return { status: r.status, d: await r.json().catch(() => ({})) }; };
const novoPedido = async (cli, vId, n, desc = '') => {
  const { data: sol, error } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: vId, tipo: 'mecanica', descricao: desc || `QA checkin v2 ${n} ${tag}`, urgencia: 'media', status: 'aberta', latitude: 59.44, longitude: 24.76, endereco: 'Kesklinn', pais: 'EE' }).select('id, numero').single();
  if (error) throw new Error(error.message);
  sols.push(sol.id);
  return sol;
};
const orcamentoNoBanco = async (ofId, solId, validade, slots, valor = 80) => {
  const { data: o, error } = await sb.from('orcamentos').insert({ solicitacao_id: solId, oficina_id: ofId, valor_total: valor, prazo_dias: 1, tempo_execucao_horas: 2, validade, status: 'enviado', observacoes: '[COMISSAO:absorver:10]' }).select('id').single();
  if (error) throw new Error(error.message);
  await sb.from('orcamento_itens').insert({ orcamento_id: o.id, descricao: 'Õlivahetus', tipo: 'mao_de_obra', valor_unitario: valor, quantidade: 1, valor_total: valor });
  for (const s of slots) { const { error: e } = await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_previsao_entrega: somar(s.data_checkin, 1), ...s }); if (e) throw new Error(e.message); }
  await sb.from('solicitacoes').update({ status: 'em_orcamento' }).eq('id', solId);
  return o.id;
};
const slotsDe = async (orcId) => (await sb.from('orcamento_disponibilidade').select('id, data_checkin, turno, hora_inicio, hora_fim, origem').eq('orcamento_id', orcId).order('data_checkin').order('hora_inicio')).data || [];
const aceitarApi = async (cli, orcId, slotId) => post('/api/aceitar-orcamento', await token(cli), { orcamentoId: orcId, slotId });
const agendaDe = async (solId) => (await sb.from('agenda').select('id, data_inicio, checkin_ate, status, no_show').eq('solicitacao_id', solId).order('created_at', { ascending: false }).limit(1).maybeSingle()).data;
const limparForm = async (p) => { await p.evaluate(() => { try { sessionStorage.clear(); } catch {} }); };

// varredura: a mesma janela em todos os lugares (dono: decisao 8)
async function varrer(rotulo, { pw, pc, pa, sol, janela, dia, cli, depoisEmail = 0, semEmail = false, ag }) {
  const falt = [];
  const a = ag || await agendaDe(sol.id);
  const [hi, hf] = janela.split('–');
  const fimEsperado = hf || hi;
  if (!a || new Date(a.data_inicio).toISOString() !== tallinn(dia, hi) || (a.checkin_ate && new Date(a.checkin_ate).toISOString() !== tallinn(dia, hf || (() => { const [h, m] = hi.split(':').map(Number); const t = h * 60 + m + 30; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; })())))
    falt.push(`agenda no banco ${JSON.stringify(a)} (esperado ${dia} ${janela})`);
  const lugares = [];
  if (pc) {
    await ir(pc, `/ee/et/cliente/orcamentos/${sol.id}`, 2500);
    lugares.push(['motorista painel do pedido', await texto(pc, 'agendamento-chegada')]);
    await ir(pc, '/ee/et/cliente/dashboard', 2500);
    lugares.push(['motorista dashboard', await corpo(pc)]);
  }
  if (pw) {
    await ir(pw, '/ee/et/oficina/pedidos?aba=respondidos', 2500);
    lugares.push(['oficina Pedidos (lista)', await corpo(pw)]);
    await ir(pw, `/ee/et/oficina/pedidos/${sol.id}`, 2500);
    lugares.push(['oficina resumo do pedido', await texto(pw, 'resumo-chegada')]);
    await ir(pw, `/ee/et/oficina/hoje?dia=${dia}&filtro=chegam`, 2500);
    lugares.push(['oficina Hoje', await corpo(pw)]);
    // Agenda (lista): a janela fica no detalhe do cartao (toque abre) - abre todos os cartoes do dia
    await ir(pw, `/ee/et/oficina/agenda?vista=list`, 2500);
    // so um cartao abre por vez: abre o cartao DESTE agendamento (#<6 primeiros do id>)
    if (a?.id) await pw.locator('div.cursor-pointer.p-3', { hasText: `#${a.id.slice(0, 6)}` }).first().click().catch(() => {});
    await sleep(400);
    lugares.push(['oficina Agenda (lista, cartao aberto)', (await pw.getByTestId('agenda-checkin').allInnerTexts().catch(() => [])).join(' | ')]);
    if (a?.id) {
      await ir(pw, `/ee/et/oficina/agenda?vista=quadro&ev=${a.id}`, 3500);
      await pw.locator('[data-destaque="1"]').first().click().catch(() => {}); await sleep(600);
      lugares.push(['oficina Quadro (barra destacada aberta)', await corpo(pw)]);
    }
  }
  if (pa) {
    await ir(pa, `${APP}/solicitacao/${sol.id}`, 1000); await esperarTeste(pa, 'agendamento-atual', 15000);
    lugares.push(['app motorista (:8090)', await texto(pa, 'agendamento-atual')]);
  }
  for (const [onde, txt] of lugares) if (!txt.includes(janela)) falt.push(`${onde}: sem "${janela}" (${txt.replace(/\s+/g, ' ').slice(0, 140)})`);
  if (!semEmail && cli) {
    const em = await esperarEmail(cli.email, depoisEmail);
    const ics = em ? icsDe(em.f) : null;
    if (!em || !em.html.includes(janela)) falt.push(`e-mail do motorista sem "${janela}" (${em?.f || 'nenhum'})`);
    if (!ics || !ics.includes(`DTSTART:${icsData(tallinn(dia, hi))}`) || !ics.includes(`DTEND:${icsData(tallinn(dia, fimEsperado === hi ? hi : hf))}`)) {
      if (!(ics && hf === undefined)) falt.push(`.ics sem DTSTART/DTEND da janela (${em?.f || 'nenhum'}) ${ics ? (ics.match(/DTSTART:\S+|DTEND:\S+|SEQUENCE:\d+/g) || []).join(' ') : ''}`);
    }
  }
  ok(`${rotulo}: janela ${dia} ${janela} igual em todos os lugares (${lugares.map((l) => l[0]).join(', ')}${!semEmail ? ', e-mail, .ics' : ''})`, !falt.length, falt.join(' | '));
  return falt;
}

// =====================================================================================================
try {
  console.log(`fases ${FASES} | hoje Tallinn ${hojeTallinn} | seg ${SEG} sab ${SAB} | ontem ${ONTEM}`);
  const appNoAr = await fetch(APP, { signal: AbortSignal.timeout(4000) }).then((r) => r.ok).catch(() => false);

  // ============================== A: auditoria visual ==============================
  if (FASES.includes('A')) {
    FASE = 'A';
    const { dono, ofId } = await novaOficina('QA-VISUAL');
    const { cli, vId } = await novoCliente();
    const sA1 = await novoPedido(cli, vId, 'A1');
    const sA2 = await novoPedido(cli, vId, 'A2');
    const oA2 = await orcamentoNoBanco(ofId, sA2.id, somar(QUA, 7), [
      { data_checkin: SEG, turno: 'manha', hora_inicio: '08:00', hora_fim: '10:00' },
      { data_checkin: TER, turno: 'tarde', hora_inicio: '13:00', hora_fim: '15:00' },
      { data_checkin: QUA, turno: 'manha', hora_inicio: '10:30', hora_fim: '11:00' }]);
    const sA3 = await novoPedido(cli, vId, 'A3');
    const oA3 = await orcamentoNoBanco(ofId, sA3.id, somar(TER, 7), [{ data_checkin: TER, turno: 'tarde', hora_inicio: '13:00', hora_fim: '15:00' }, { data_checkin: QUA, turno: 'manha', hora_inicio: '08:00', hora_fim: '10:00' }]);
    const ac3 = await aceitarApi(cli, oA3, (await slotsDe(oA3))[0].id);
    ok('A: preparo - aceite do pedido A3 (agenda)', ac3.status === 200, JSON.stringify(ac3));
    const agA3 = await agendaDe(sA3.id);
    const sA4 = await novoPedido(cli, vId, 'A4');
    const oA4 = await orcamentoNoBanco(ofId, sA4.id, somar(SEG, 7), [{ data_checkin: ONTEM, turno: 'tarde', hora_inicio: '13:00', hora_fim: '15:00' }]);
    const sA5 = await novoPedido(cli, vId, 'A5');
    const oA5 = await orcamentoNoBanco(ofId, sA5.id, somar(SEG, 7), [{ data_checkin: ONTEM, turno: 'manha', hora_inicio: '08:00', hora_fim: '10:00' }]);
    const pd5 = await post(`/api/orcamento/${oA5}/pedir-datas`, await token(cli), { sugestoes: [{ data: TER, turno: 'manha' }, { data: QUA, turno: 'tarde' }], mensagem: 'Sobiks ka hommik, palun helistage enne' });
    ok('A: preparo - pedido de novas datas (A5)', pd5.status === 200, JSON.stringify(pd5));
    const sA6 = await novoPedido(cli, vId, 'A6');
    const oA6 = await orcamentoNoBanco(ofId, sA6.id, somar(QUA, 7), [{ data_checkin: QUA, turno: 'manha', hora_inicio: '10:00', hora_fim: '12:00' }]);
    await aceitarApi(cli, oA6, (await slotsDe(oA6))[0].id);
    const pr6 = await post('/api/orcamento-revisao/data', await token(dono), { orcamentoId: oA6, data: QUI, hora_inicio: '15:00', hora_fim: '17:00', motivo: 'Varuosa tuleb neljapäeval', dataAtualServe: false, combinado: false });
    ok('A: preparo - proposta de nova data 077 (A6)', pr6.status === 200, JSON.stringify(pr6));

    const LOCS = [['et', '/ee/et'], ['ru', '/ee/ru']];
    const COMBOS = [];
    for (const vp of [390, 360, 1366, 1920]) for (const [l, pre] of LOCS) COMBOS.push({ vp, l, pre });
    COMBOS.push({ vp: 390, l: 'en', pre: '/ee/en' }, { vp: 1366, l: 'en', pre: '/ee/en' });

    for (const { vp, l, pre } of COMBOS) {
      const L = tr(l);
      const movel = VPS[vp].m;
      const inf = (pagina, estado) => ({ pagina, estado, loc: l, vp });
      const completo = (vp === 390 || vp === 1366) && l !== 'en'; // todos os estados nessas; nas outras o principal
      // ---------- oficina ----------
      const cw = await contexto(vp); const pw = await cw.newPage();
      await entrar(pw, dono, pre);
      await sb.from('oficinas').update({ recepcao_confirmada_em: null, recepcao_inicio: null, recepcao_fim: null, almoco_inicio: null, almoco_fim: null }).eq('id', ofId);
      await pw.evaluate(() => localStorage.removeItem('bipfix_convite_recepcao_ate'));
      await ir(pw, `${pre}/oficina/pedidos`, 2500);
      ok(`A: convite visivel em Pedidos ${l} ${vp}`, await visivel(pw, 'convite-recepcao'));
      await auditar(pw, inf('pedidos', 'convite'), { foco: completo ? 20 : 0 });
      await ir(pw, `${pre}/oficina/pedidos?aba=respondidos`, 2500);
      await auditar(pw, inf('pedidos', 'respondidos'));
      await ir(pw, `${pre}/oficina/pedidos/${sA3.id}`, 2500);
      await auditar(pw, inf('pedido-detalhe', 'aceito-resumo'), { full: completo });
      await ir(pw, `${pre}/oficina/pedidos/${sA5.id}`, 2500);
      await auditar(pw, inf('pedido-detalhe', 'novas-datas-pedidas'), { full: completo });
      if (completo) {
        if (await visivel(pw, 'nd-adicionar')) {
          await pw.getByTestId('nd-adicionar').click(); await sleep(400);
          await pw.getByTestId(`nd-dia-${TER}`).click().catch(async () => { await pw.getByTestId('nd-mes-seguinte').click(); await sleep(200); await pw.getByTestId(`nd-dia-${TER}`).click().catch(() => {}); }); await sleep(300);
          await auditar(pw, inf('novas-datas', 'folha-faixas'), { dentro: '[data-testid="nd-folha"]', foco: completo ? 12 : 0 });
          await pw.keyboard.press('Escape'); await sleep(200);
        } else ok(`A: novas datas - botao "+" ${l} ${vp}`, false, 'nd-adicionar nao visivel');
      }
      // formulario do orcamento (pagina nova = sessionStorage limpo)
      const pf = await cw.newPage();
      await ir(pf, `${pre}/oficina/orcamento/${sA1.id}`, 2500);
      await auditar(pf, inf('orcamento', '1-vazio'), { full: completo, foco: completo ? 30 : 0 });
      await pf.getByPlaceholder(L('oficinaEnviarOrcamento.placeholderDescricaoItem')).first().fill(l === 'ru' ? 'Замена масла и фильтра' : 'Õlivahetus ja filter');
      await pf.getByPlaceholder(L('oficinaEnviarOrcamento.placeholderValor')).first().fill('60');
      await pf.getByTestId('enviar-orcamento').click(); await sleep(1500);
      ok(`A: erro sem data e validade vazia visiveis ${l} ${vp}`, await visivel(pf, 'erro-sem-checkin') && await visivel(pf, 'erro-validade'));
      await auditar(pf, inf('orcamento', '2-erros'), { full: completo, semRolar: true });
      // (i) abertos
      for (const id of (completo ? ['info-checkin', 'info-validade', 'ck-info-adicionar', 'info-prazo', 'info-tempo', 'info-garantia'] : ['info-validade', 'ck-info-adicionar'])) {
        const b = pf.getByTestId(id);
        if (!(await b.count())) { ok(`A: (i) ${id} existe ${l} ${vp}`, false); continue; }
        await b.scrollIntoViewIfNeeded(); await b.click(); await sleep(250);
        const nota = pf.getByTestId(`${id}-texto`);
        const bx = await nota.boundingBox().catch(() => null);
        const W = VPS[vp].w;
        ok(`A: (i) ${id} abre inteiro na largura da tela ${l} ${vp}`, !!bx && bx.x >= 0 && bx.x + bx.width <= W + 1, JSON.stringify(bx));
        await auditar(pf, inf('orcamento', `3-info-${id}`), { semRolar: true });
        await pf.keyboard.press('Escape'); await sleep(150);
      }
      // folha: calendario, faixas, outro horario
      await pf.getByTestId('ck-adicionar').scrollIntoViewIfNeeded(); await pf.getByTestId('ck-adicionar').click(); await sleep(500);
      const fb = await pf.getByTestId('ck-folha').boundingBox().catch(() => null);
      ok(`A: folha do calendario inteira na tela ${l} ${vp}`, !!fb && fb.y >= 0 && fb.y + fb.height <= VPS[vp].h + 1 && fb.x >= 0 && fb.x + fb.width <= VPS[vp].w + 1, JSON.stringify(fb));
      if (movel) ok(`A: folha embaixo no celular ${l} ${vp}`, !!fb && Math.abs(fb.y + fb.height - VPS[vp].h) < 3, JSON.stringify(fb));
      else ok(`A: folha no centro no computador ${l} ${vp}`, !!fb && Math.abs(fb.x + fb.width / 2 - VPS[vp].w / 2) < 20, JSON.stringify(fb));
      await auditar(pf, inf('orcamento', '4-folha-calendario'), { dentro: '[data-testid="ck-folha"]', foco: completo ? 14 : 0 });
      // chat / barra de baixo nao ficam por cima da folha
      const cob = await pf.evaluate(() => { const f = document.querySelector('[data-testid="ck-folha"]'); const out = []; for (const sel of ['[data-testid="chat-suporte-botao"]', 'nav.barra-inferior']) { const e = [...document.querySelectorAll(sel)].find((x) => x.getBoundingClientRect().height > 0); if (!e) continue; const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (top && (e === top || e.contains(top))) out.push(sel); } return out; });
      ok(`A: chat azul e barra de baixo ficam ATRAS da folha ${l} ${vp}`, !cob.length, cob.join(','));
      await pf.getByTestId(`ck-dia-${SEG}`).click().catch(async () => { await pf.getByTestId('ck-mes-seguinte').click(); await sleep(200); await pf.getByTestId(`ck-dia-${SEG}`).click(); }); await sleep(350);
      await auditar(pf, inf('orcamento', '5-folha-faixas'), { dentro: '[data-testid="ck-folha"]' });
      if (completo) {
        await pf.getByTestId('ck-info-faixas').click(); await sleep(200);
        await auditar(pf, inf('orcamento', '5b-folha-info-faixas'), { dentro: '[data-testid="ck-folha"]' });
        await pf.getByTestId('ck-info-faixas').click(); await sleep(150);
      }
      await pf.getByTestId('ck-outro').click(); await sleep(250);
      await auditar(pf, inf('orcamento', '6-folha-outro-horario'), { dentro: '[data-testid="ck-folha"]' });
      await pf.getByTestId('ck-faixa-0800-1000').click(); await sleep(400);
      // 3 datas (+1 ate o maximo 5 nas telas completas)
      await escolherCheckin(pf, { dia: TER, faixa: '1200-1400' });
      await escolherCheckin(pf, { dia: QUA, faixa: 'tarde' });
      await pf.locator('#cacb1-103').fill(TER); await sleep(200);
      await pf.getByTestId('enviar-orcamento').click(); await sleep(1500);
      ok(`A: validade antes da ultima data = vermelha ${l} ${vp}`, (await pf.getByTestId('erro-validade').getAttribute('data-tipo').catch(() => '')) === 'antes');
      await auditar(pf, inf('orcamento', '7-tres-datas-validade-vermelha'), { full: completo, semRolar: true });
      if (completo) {
        await escolherCheckin(pf, { dia: QUI, faixa: 'manha' });
        await escolherCheckin(pf, { dia: SEX, faixa: 'tarde' });
        ok(`A: com 5 datas o "+" some (maximo) ${l} ${vp}`, (await pf.getByTestId('ck-adicionar').count()) === 0);
        await pf.getByTestId('ck-linhas').scrollIntoViewIfNeeded(); await sleep(200);
        await auditar(pf, inf('orcamento', '8-cinco-datas'), { full: true, semRolar: true });
      }
      await pf.close();
      // 077: proposta de nova data (formulario) no orcamento aceito
      if (completo) {
        const pm = await cw.newPage();
        await ir(pm, `${pre}/oficina/orcamento/${sA3.id}`, 2500);
        await auditar(pm, inf('orcamento-aceito', 'escolha-mudanca'));
        if (await visivel(pm, 'opcao-mudar-data')) {
          await pm.getByTestId('opcao-mudar-data').click(); await sleep(1500);
          await auditar(pm, inf('proporNovaData', 'form'), { full: true });
          await pm.getByTestId('pnd-enviar').click(); await sleep(400);
          await auditar(pm, inf('proporNovaData', 'erro-sem-data'), { semRolar: true });
          await pm.getByTestId('pnd-adicionar').click(); await sleep(400);
          await pm.getByTestId(`pnd-dia-${SEG2}`).click().catch(async () => { await pm.getByTestId('pnd-mes-seguinte').click(); await sleep(200); await pm.getByTestId(`pnd-dia-${SEG2}`).click().catch(() => {}); }); await sleep(300);
          await auditar(pm, inf('proporNovaData', 'folha'), { dentro: '[data-testid="pnd-folha"]' });
          await pm.keyboard.press('Escape');
        } else ok(`A: 077 opcao-mudar-data ${l} ${vp}`, false, 'nao visivel');
        await ir(pm, `${pre}/oficina/orcamento/${sA6.id}`, 2500);
        await auditar(pm, inf('orcamento-aceito', 'proposta-pendente'));
        await pm.close();
      }
      // perfil: recepcao/almoco
      await ir(pw, `${pre}/oficina/perfil#recepcao`, 3000);
      const sec = await pw.getByTestId('perfil-recepcao').boundingBox().catch(() => null);
      ok(`A: perfil#recepcao abre com a secao na tela ${l} ${vp}`, !!sec && sec.y < VPS[vp].h && sec.y + 40 > 0, JSON.stringify(sec));
      await pw.screenshot({ path: path.join(OUT, `A_perfil_ancora_${l}_${vp}.png`) });
      await pw.getByTestId('recepcao-faixa').check().catch(() => {}); await pw.getByTestId('almoco-ativo').check().catch(() => {}); await sleep(300);
      await pw.getByTestId('recepcao-inicio').fill('09:00').catch(() => {}); await pw.getByTestId('recepcao-fim').fill('09:20').catch(() => {});
      await pw.getByRole('button', { name: L('oficinaPerfil.salvarAlteracoes') }).click().catch(() => {}); await sleep(1500);
      await pw.getByTestId('perfil-recepcao').scrollIntoViewIfNeeded().catch(() => {});
      const secEl = await pw.evaluate(() => { const s = document.querySelector('[data-testid="perfil-recepcao"]'); if (!s) return null; s.setAttribute('data-qa-raiz', '1'); return true; });
      await auditar(pw, inf('perfil', 'recepcao-faixa-erro'), { dentro: secEl ? '[data-qa-raiz]' : null, semRolar: true, foco: completo ? 0 : 0 });
      ok(`A: erro da recepcao visivel ${l} ${vp}`, await visivel(pw, 'erro-recepcao'));
      if (completo) {
        await pw.getByTestId('recepcao-hora').check().catch(() => {}); await sleep(300);
        await auditar(pw, inf('perfil', 'recepcao-hora'), { dentro: '[data-qa-raiz]', semRolar: true });
        await pw.getByTestId('recepcao-funcionamento').check().catch(() => {}); await sleep(300);
        await auditar(pw, inf('perfil', 'recepcao-funcionamento-almoco'), { dentro: '[data-qa-raiz]', semRolar: true });
        await pw.screenshot({ path: path.join(OUT, `A_perfil_secao_${l}_${vp}_inteira.png`), fullPage: true });
      }
      // agenda (mes, lista, quadro) e Hoje
      for (const v of (completo ? ['month', 'list', 'quadro'] : ['list'])) {
        await ir(pw, `${pre}/oficina/agenda?vista=${v}${v === 'quadro' ? `&ev=${agA3?.id}` : ''}`, 3000);
        if (v === 'month' && !movel) await pw.getByText(String(Number(TER.slice(8)))).first().click().catch(() => {});
        await auditar(pw, inf('agenda', v));
      }
      await ir(pw, `${pre}/oficina/hoje?dia=${TER}&filtro=chegam`, 3000);
      ok(`A: Hoje mostra a janela 13:00–15:00 ${l} ${vp}`, (await corpo(pw)).includes('13:00–15:00'));
      await auditar(pw, inf('hoje', 'chegam'));
      await cw.close();

      // ---------- motorista ----------
      const cc = await contexto(vp); const pc = await cc.newPage();
      await entrar(pc, cli, pre);
      await ir(pc, `${pre}/cliente/orcamentos/${sA2.id}`, 2800);
      await auditar(pc, inf('motorista-orcamentos', 'cartoes-janelas'), { full: completo });
      const orc = pc.locator(`#orc-${oA2}`);
      await orc.getByText(L('clienteOrcamentoDetalhe.acceptAndSchedule')).first().click().catch(() => {}); await sleep(800);
      ok(`A: cartoes de escolha com as 3 janelas ${l} ${vp}`, (await orc.getByTestId('opcao-janela').count()) === 3);
      await orc.locator('button.w-full.p-4').nth(1).click().catch(() => {}); await sleep(300);
      await auditar(pc, inf('motorista-orcamentos', 'escolha-janela'), { full: completo, semRolar: true });
      await ir(pc, `${pre}/cliente/orcamentos/${sA3.id}`, 2800);
      await auditar(pc, inf('motorista-orcamentos', 'aceito-agendamento'), { full: completo });
      await ir(pc, `${pre}/cliente/dashboard`, 2800);
      await auditar(pc, inf('motorista-dashboard', 'com-agendamento'));
      await ir(pc, `${pre}/cliente/orcamentos/${sA4.id}`, 2800);
      if (await visivel(pc, 'abrir-pedir-datas')) { await pc.getByTestId('abrir-pedir-datas').click(); await sleep(500); }
      else ok(`A: motorista - "pedir novas datas" visivel ${l} ${vp}`, false);
      await auditar(pc, inf('motorista-pedirNovasDatas', 'grade'), { full: completo, foco: completo ? 15 : 0 });
      await ir(pc, `${pre}/cliente/orcamentos/${sA6.id}`, 2800);
      ok(`A: proposta 077 visivel para o motorista ${l} ${vp}`, await visivel(pc, 'proposta-nova-data'));
      await auditar(pc, inf('motorista-revisaoPendente', 'proposta-data'), { full: completo });
      await cc.close();

      // ---------- app web do motorista (celular) ----------
      if (movel && appNoAr && l !== 'en') {
        const ca = await contexto(vp, { locale: l === 'ru' ? 'ru-RU' : 'et-EE' }); const pa = await ca.newPage();
        await entrarApp(pa, cli, l);
        await ir(pa, `${APP}/solicitacao/${sA2.id}`, 1000); await sleep(4000);
        ok(`A: app - janelas no pedido ${l} ${vp}`, (await corpo(pa)).includes('08:00–10:00') && (await corpo(pa)).includes('13:00–15:00'), (await corpo(pa)).slice(0, 200));
        await auditar(pa, inf('app-solicitacao', 'janelas'), { full: true });
        await ir(pa, `${APP}/solicitacao/${sA3.id}`, 1000); await esperarTeste(pa, 'agendamento-atual', 15000);
        ok(`A: app - agendamento com a janela 13:00–15:00 ${l} ${vp}`, (await texto(pa, 'agendamento-atual')).includes('13:00–15:00'), await texto(pa, 'agendamento-atual'));
        await auditar(pa, inf('app-solicitacao', 'agendado'), { full: true });
        await ir(pa, `${APP}/solicitacao/${sA4.id}`, 1000); await esperarTeste(pa, 'abrir-pedir-datas', 15000);
        await pa.getByTestId('abrir-pedir-datas').click().catch(() => {}); await sleep(600);
        await auditar(pa, inf('app-solicitacao', 'pedir-novas-datas'), { full: true });
        await ir(pa, `${APP}/solicitacao/${sA6.id}`, 1000); await sleep(4000);
        await auditar(pa, inf('app-solicitacao', 'proposta-077'), { full: true });
        await ca.close();
      }
      salvar();
    }
  }

  // ============================== B: interacoes ==============================
  if (FASES.includes('B')) {
    FASE = 'B';
    const { dono, ofId } = await novaOficina('QA-FLUXO');
    const { cli, vId } = await novoCliente();
    const cw = await contexto(390); const pw = await cw.newPage();
    await entrar(pw, dono);
    const cc = await contexto(390); const pc = await cc.newPage();
    await entrar(pc, cli);
    let pa = null, ca = null;
    if (appNoAr) { ca = await contexto(390, { locale: 'et-EE' }); pa = await ca.newPage(); await entrarApp(pa, cli, 'et'); }
    const salvarPerfil = async () => { await pw.getByRole('button', { name: T('oficinaPerfil.salvarAlteracoes') }).click(); await sleep(1600); };
    const perfilDb = async () => (await sb.from('oficinas').select('recepcao_inicio, recepcao_fim, almoco_inicio, almoco_fim, recepcao_confirmada_em').eq('id', ofId).single()).data;

    // ---- B1 perfil + convite ----
    await ir(pw, '/ee/et/oficina/pedidos', 2500);
    ok('B1: perfil sem recepcao -> convite em Pedidos', await visivel(pw, 'convite-recepcao'));
    await pw.getByTestId('convite-recepcao-fechar').click(); await sleep(400);
    ok('B1: ✕ esconde o convite', !(await visivel(pw, 'convite-recepcao')));
    await pw.evaluate(() => localStorage.setItem('bipfix_convite_recepcao_ate', String(Date.now() - 1000)));
    await ir(pw, '/ee/et/oficina/pedidos', 2500);
    ok('B1: passado o prazo de 7 dias o convite volta', await visivel(pw, 'convite-recepcao'));
    await pw.getByTestId('convite-recepcao-preencher').click(); await pw.waitForURL(/perfil/, { timeout: 15000 }).catch(() => {}); await sleep(2500);
    const secB = await pw.getByTestId('perfil-recepcao').boundingBox().catch(() => null);
    ok('B1: "Preencher" abre o perfil COM a secao recepcao na tela (ancora)', !!secB && secB.y >= -10 && secB.y < 844 * 0.6, JSON.stringify(secB));
    await pw.screenshot({ path: path.join(OUT, 'B1_preencher_ancora_390.png') });
    const invalidos = [
      ['faixa 20 min', async () => { await pw.getByTestId('recepcao-faixa').check(); await pw.getByTestId('recepcao-inicio').fill('09:00'); await pw.getByTestId('recepcao-fim').fill('09:20'); }, 'oficinaPerfil.erro_recepcao_curta'],
      ['faixa invertida 16:00-09:00', async () => { await pw.getByTestId('recepcao-faixa').check(); await pw.getByTestId('recepcao-inicio').fill('16:00'); await pw.getByTestId('recepcao-fim').fill('09:00'); }, 'oficinaPerfil.erro_recepcao_invertida'],
      ['faixa fora do horario 05:00-07:00', async () => { await pw.getByTestId('recepcao-faixa').check(); await pw.getByTestId('recepcao-inicio').fill('05:00'); await pw.getByTestId('recepcao-fim').fill('07:00'); }, null],
      ['hora fixa no almoco', async () => { await pw.getByTestId('almoco-ativo').check(); await pw.getByTestId('almoco-inicio').fill('12:00'); await pw.getByTestId('almoco-fim').fill('13:00'); await pw.getByTestId('recepcao-hora').check(); await pw.getByTestId('recepcao-hora-valor').fill('12:30'); }, 'oficinaPerfil.erro_recepcao_almoco'],
      ['almoco invertido 13:00-12:00', async () => { await pw.getByTestId('recepcao-funcionamento').check(); await pw.getByTestId('almoco-ativo').check(); await pw.getByTestId('almoco-inicio').fill('13:00'); await pw.getByTestId('almoco-fim').fill('12:00'); }, null],
      ['almoco 10 min', async () => { await pw.getByTestId('recepcao-funcionamento').check(); await pw.getByTestId('almoco-ativo').check(); await pw.getByTestId('almoco-inicio').fill('12:00'); await pw.getByTestId('almoco-fim').fill('12:10'); }, null],
    ];
    for (const [nome, fazer, chave] of invalidos) {
      await ir(pw, '/ee/et/oficina/perfil#recepcao', 2500);
      try { await fazer(); } catch (e) { ok(`B1: perfil invalido "${nome}" - preencher`, false, e.message); continue; }
      await sleep(200);
      // D15 (corrigido 15/11): com a recepcao/almoco invalidos a previa some (antes mostrava a grade do funcionamento)
      ok(`B1: perfil invalido "${nome}" -> sem previa enganosa (D15)`, !(await visivel(pw, 'recepcao-previa')), await texto(pw, 'recepcao-previa'));
      await salvarPerfil();
      const db = await perfilDb();
      const err = await texto(pw, 'erro-recepcao');
      ok(`B1: perfil invalido "${nome}" -> erro na tela e nada gravado`, !!err && !db.recepcao_inicio && !db.almoco_inicio && (!chave || err.includes(T(chave))), `erro="${err}" db=${JSON.stringify(db)}`);
      if (nome === 'faixa fora do horario 05:00-07:00') await pw.screenshot({ path: path.join(OUT, 'B1_perfil_fora_horario_390.png'), fullPage: false });
    }
    // validos: faixa 09-16 + almoco 12-13
    await ir(pw, '/ee/et/oficina/perfil#recepcao', 2500);
    await pw.getByTestId('recepcao-faixa').check(); await pw.getByTestId('recepcao-inicio').fill('09:00'); await pw.getByTestId('recepcao-fim').fill('16:00');
    await pw.getByTestId('almoco-ativo').check(); await pw.getByTestId('almoco-inicio').fill('12:00'); await pw.getByTestId('almoco-fim').fill('13:00'); await sleep(300);
    const previa1 = await texto(pw, 'recepcao-previa');
    await salvarPerfil();
    let db = await perfilDb();
    ok('B1: faixa 09:00-16:00 + almoco 12-13 salvos', db.recepcao_inicio?.startsWith('09:00') && db.recepcao_fim?.startsWith('16:00') && db.almoco_inicio?.startsWith('12:00'), JSON.stringify(db));
    ok('B1: previa = 09:00–12:00, 13:00–16:00', previa1.includes('09:00–12:00') && previa1.includes('13:00–16:00'), previa1);
    await ir(pw, '/ee/et/oficina/pedidos', 2500);
    ok('B1: com recepcao preenchida o convite nao aparece', !(await visivel(pw, 'convite-recepcao')));
    const { data: sBp } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: vId, tipo: 'mecanica', descricao: `QA perfil ${tag}`, urgencia: 'media', status: 'aberta', latitude: 59.44, longitude: 24.76, endereco: 'Kesklinn', pais: 'EE' }).select('id').single(); sols.push(sBp.id);
    const faixasDe = async (pagina, dia) => {
      await pagina.getByTestId('ck-adicionar').click(); await sleep(350);
      for (let i = 0; i < 3 && !(await pagina.getByTestId(`ck-dia-${dia}`).count()); i++) { await pagina.getByTestId('ck-mes-seguinte').click(); await sleep(150); }
      await pagina.getByTestId(`ck-dia-${dia}`).click(); await sleep(300);
      const ids = await pagina.locator('[data-testid^="ck-faixa-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('ck-faixa-', '')));
      await pagina.keyboard.press('Escape'); await sleep(200);
      return ids;
    };
    let pfx = await cw.newPage(); await ir(pfx, `/ee/et/oficina/orcamento/${sBp.id}`, 2500);
    let fx = await faixasDe(pfx, SEG);
    ok('B1: faixas do orcamento seguem o perfil (09-12, 13-16 na segunda)', JSON.stringify(fx) === JSON.stringify(['0900-1200', '1300-1600']), JSON.stringify(fx));
    fx = await faixasDe(pfx, SEX);
    ok('B1: sexta (fecha 17) -> mesmas faixas 09-12, 13-16', JSON.stringify(fx) === JSON.stringify(['0900-1200', '1300-1600']), JSON.stringify(fx));
    await pfx.close();
    // hora fixa 10:00
    await ir(pw, '/ee/et/oficina/perfil#recepcao', 2500);
    await pw.getByTestId('recepcao-hora').check(); await pw.getByTestId('recepcao-hora-valor').fill('10:00'); await sleep(200);
    await salvarPerfil(); db = await perfilDb();
    ok('B1: hora fixa 10:00 salva como 10:00-10:30', db.recepcao_inicio?.startsWith('10:00') && db.recepcao_fim?.startsWith('10:30'), JSON.stringify(db));
    pfx = await cw.newPage(); await ir(pfx, `/ee/et/oficina/orcamento/${sBp.id}`, 2500);
    fx = await faixasDe(pfx, SEG);
    ok('B1: hora fixa -> uma faixa "10:00" (hora unica)', JSON.stringify(fx) === JSON.stringify(['1000-1030']), JSON.stringify(fx));
    await pfx.close();
    // volta: horario de funcionamento + almoco
    await ir(pw, '/ee/et/oficina/perfil#recepcao', 2500);
    await pw.getByTestId('recepcao-funcionamento').check(); await sleep(200);
    await salvarPerfil(); db = await perfilDb();
    ok('B1: "usar o horario de funcionamento" com almoco salvo', !db.recepcao_inicio && db.almoco_inicio?.startsWith('12:00'), JSON.stringify(db));

    // ---- B2 formulario do orcamento ----
    const sB1 = await novoPedido(cli, vId, 'B1');
    const pf = await cw.newPage();
    await ir(pf, `/ee/et/oficina/orcamento/${sB1.id}`, 2500);
    await pf.getByPlaceholder(T('oficinaEnviarOrcamento.placeholderDescricaoItem')).first().fill('Pidurikettad');
    await pf.getByPlaceholder(T('oficinaEnviarOrcamento.placeholderValor')).first().fill('120');
    await pf.getByTestId('enviar-orcamento').click(); await sleep(1500);
    let nOrc = (await sb.from('orcamentos').select('id').eq('solicitacao_id', sB1.id)).data?.length;
    ok('B2: enviar sem data e sem validade -> bloqueado (nada gravado), dois erros', !nOrc && await visivel(pf, 'erro-sem-checkin') && (await pf.getByTestId('erro-validade').getAttribute('data-tipo').catch(() => '')) === 'vazia');
    const foco1 = await pf.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute('data-testid'));
    // D7 + D11 (corrigidos 15/11): validade logo DEPOIS das datas; o foco vai para o 1o CAMPO com erro (o "+"), nunca para um (i)
    ok('B2: foco vai para o 1o erro = "+" das datas (D11)', foco1 === 'ck-adicionar', String(foco1));
    ok('B2: validade vem DEPOIS do cartao das datas (D7)', await pf.evaluate(() => { const a = document.querySelector('[data-testid="cartao-checkin"]'), b = document.querySelector('[data-testid="campo-validade"]'); return !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); }));
    ok('B2: com ZERO datas a dica "pode enviar assim" nao aparece (D8)', !(await visivel(pf, 'dica-mais-datas')));
    // calendario: passado e fechados
    await pf.getByTestId('ck-adicionar').click(); await sleep(400);
    const estados = await pf.locator('[data-testid^="ck-dia-"]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-testid').slice(7), e.disabled]));
    const errados = estados.filter(([d, dis]) => { const dow = new Date(`${d}T12:00:00Z`).getUTCDay(); const deve = d <= hojeTallinn || dow === 0 || dow === 6; return dis !== deve && !(d === hojeTallinn); });
    ok('B2: mini calendario - passados, hoje (domingo), sabados e domingos desativados; uteis futuros ativos', !errados.length, JSON.stringify(errados.slice(0, 6)));
    await pf.getByTestId(`ck-dia-${hojeTallinn}`).click({ force: true }).catch(() => {}); await sleep(200);
    ok('B2: tocar em hoje (fechado) nao abre faixas', !(await visivel(pf, 'ck-faixas')));
    await pf.keyboard.press('Escape'); await sleep(200);
    // escolher faixas, outro horario, remover
    const r1 = await escolherCheckin(pf, { dia: SEG, faixa: '0800-1000' });
    ok('B2: 1 data -> dica de 2+ datas', await visivel(pf, 'dica-mais-datas'));
    await escolherCheckin(pf, { dia: SEG, faixa: '1300-1500' });
    ok('B2: 2 datas no MESMO dia -> dica de dias diferentes continua?', true);
    const dicaMesmoDia = await visivel(pf, 'dica-mais-datas');
    await pf.getByTestId('ck-adicionar').click(); await sleep(300);
    await pf.getByTestId(`ck-dia-${TER}`).click(); await sleep(250);
    await pf.getByTestId('ck-outro').click(); await sleep(200);
    const inicios = await pf.getByTestId('ck-outro-inicio').locator('option').allInnerTexts();
    ok('B2: "outro horario" de 30 em 30 dentro do horario (08:00 ... 17:30), sem o almoco?', inicios.includes('08:00') && inicios.includes('17:30') && !inicios.includes('18:00') && !inicios.includes('07:30'), inicios.join(','));
    const almocoNoOutro = inicios.includes('12:00') || inicios.includes('12:30');
    await pf.getByTestId('ck-outro-inicio').selectOption('16:30'); await sleep(150);
    const fins = await pf.getByTestId('ck-outro-fim').locator('option').allInnerTexts();
    ok('B2: fim do "outro horario" so ate o fechamento (17:00..18:00)', fins[0] === '17:00' && fins.at(-1) === '18:00', fins.join(','));
    await pf.getByTestId('ck-outro-fim').selectOption('18:00');
    await pf.getByTestId('ck-outro-adicionar').click(); await sleep(400);
    let linhas = await pf.getByTestId('ck-linhas').locator('li').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-data')} ${e.getAttribute('data-inicio')}-${e.getAttribute('data-fim')}`));
    ok('B2: 3 linhas ordenadas (seg 08-10, seg 13-15, ter 16:30-18:00)', JSON.stringify(linhas) === JSON.stringify([`${SEG} 08:00-10:00`, `${SEG} 13:00-15:00`, `${TER} 16:30-18:00`]), JSON.stringify(linhas));
    ok('B2: com 3 datas a dica de "mais datas" some', !(await visivel(pf, 'dica-mais-datas')));
    await pf.getByTestId('ck-remover-1').click(); await sleep(300);
    linhas = await pf.getByTestId('ck-linhas').locator('li').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-data')} ${e.getAttribute('data-inicio')}`));
    ok('B2: remover a 2a linha', JSON.stringify(linhas) === JSON.stringify([`${SEG} 08:00`, `${TER} 16:30`]), JSON.stringify(linhas));
    const foco2 = await pf.evaluate(() => document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName);
    ok('B2: depois de remover o foco vai para a proxima linha (D12)', foco2 === 'ck-remover-1', String(foco2));
    // validade
    await pf.locator('#cacb1-103').fill(ONTEM); await sleep(150);
    await pf.getByTestId('enviar-orcamento').click(); await sleep(1200);
    ok('B2: validade no passado -> vermelha "passado"', ['passado', 'antes'].includes(await pf.getByTestId('erro-validade').getAttribute('data-tipo').catch(() => '')), await pf.getByTestId('erro-validade').getAttribute('data-tipo').catch(() => ''));
    await pf.locator('#cacb1-103').fill(SEG); await sleep(150);
    await pf.getByTestId('enviar-orcamento').click(); await sleep(1200);
    const eAntes = await texto(pf, 'erro-validade');
    ok('B2: validade antes da ultima data -> vermelha com texto do dono (ultimo dia + recomendamos 7 dias)', (await pf.getByTestId('erro-validade').getAttribute('data-tipo').catch(() => '')) === 'antes' && /7/.test(eAntes), eAntes);
    await pf.screenshot({ path: path.join(OUT, 'B2_validade_antes_390.png'), fullPage: false });
    await pf.locator('#cacb1-103').fill(TER); await sleep(200);
    ok('B2: corrigida para = ultima data -> o vermelho some na hora', !(await visivel(pf, 'erro-validade')));
    ok('B2: dica "minimo/recomendado" aparece', await visivel(pf, 'dica-validade'), await texto(pf, 'dica-validade'));
    // depois adiciona data alem da validade
    await escolherCheckin(pf, { dia: QUA, faixa: '0800-1000' });
    ok('B2: data nova alem da validade NAO deixa a validade vermelha antes de enviar (decisao 4)', !(await visivel(pf, 'erro-validade')));
    await pf.getByTestId('enviar-orcamento').click(); await sleep(1300);
    nOrc = (await sb.from('orcamentos').select('id').eq('solicitacao_id', sB1.id)).data?.length;
    ok('B2: ao enviar -> validade vermelha "antes", nada gravado', (await pf.getByTestId('erro-validade').getAttribute('data-tipo').catch(() => '')) === 'antes' && !nOrc);
    ok('B2: botao "Usar <ultima+7>" presente (nada preenchido sozinho)', await visivel(pf, 'usar-validade-recomendada') && (await pf.locator('#cacb1-103').inputValue()) === TER);
    await pf.getByTestId('usar-validade-recomendada').click(); await sleep(200);
    ok('B2: "Usar" poe QUA+7', (await pf.locator('#cacb1-103').inputValue()) === somar(QUA, 7));
    await pf.getByTestId('enviar-orcamento').click(); await sleep(4500);
    const { data: oB1 } = await sb.from('orcamentos').select('id, validade, revisao_numero').eq('solicitacao_id', sB1.id).maybeSingle();
    let sl = oB1 ? await slotsDe(oB1.id) : [];
    ok('B2: enviado com 3 janelas e validade QUA+7', !!oB1 && String(oB1.validade) === somar(QUA, 7) && JSON.stringify(sl.map((s) => `${s.data_checkin} ${s.hora_inicio}-${s.hora_fim}`)) === JSON.stringify([`${SEG} 08:00:00-10:00:00`, `${TER} 16:30:00-18:00:00`, `${QUA} 08:00:00-10:00:00`]), JSON.stringify({ oB1, sl }));
    await pf.close();
    // revisar o orcamento enviado
    const pr = await cw.newPage();
    await ir(pr, `/ee/et/oficina/orcamento/${sB1.id}`, 3000);
    linhas = await pr.getByTestId('ck-linhas').locator('li').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-data')} ${e.getAttribute('data-inicio')}-${e.getAttribute('data-fim')}`)).catch(() => []);
    ok('B2: revisao traz as 3 datas e a validade salvas', linhas.length === 3 && (await pr.locator('#cacb1-103').inputValue()) === somar(QUA, 7), JSON.stringify(linhas));
    await pr.getByTestId('ck-remover-0').click(); await sleep(200);
    await escolherCheckin(pr, { dia: QUI2, faixa: '1300-1500' });
    await pr.getByTestId('enviar-orcamento').click(); await sleep(1500);
    ok('B2: revisao com data (QUI2) alem da validade -> vermelha', (await pr.getByTestId('erro-validade').getAttribute('data-tipo').catch(() => '')) === 'antes');
    await pr.getByTestId('usar-validade-recomendada').click({ timeout: 5000 }).catch(() => {}); await sleep(200);
    await pr.getByTestId('enviar-orcamento').click(); await sleep(4500);
    const { data: oB1r } = await sb.from('orcamentos').select('id, validade, revisao_numero').eq('solicitacao_id', sB1.id).maybeSingle();
    sl = await slotsDe(oB1.id);
    ok('B2: revisao gravada (revisao_numero+1, datas trocadas, validade QUI2+7)', oB1r?.revisao_numero === (oB1.revisao_numero || 0) + 1 && String(oB1r.validade) === somar(QUI2, 7) && JSON.stringify(sl.map((s) => `${s.data_checkin} ${s.hora_inicio}`)) === JSON.stringify([`${TER} 16:30:00`, `${QUA} 08:00:00`, `${QUI2} 13:00:00`]), JSON.stringify({ oB1r, sl }));
    await pr.close();
    // hoje com faixas sobrando / sem faixas (relogio da pagina: sexta 13/11 16:30 e 17:10 em Tallinn)
    for (const [hora, esperado] of [['16:30', 'sobra'], ['17:10', 'nada']]) {
      const sexPassada = '2026-11-13';
      const ct = await contexto(390);
      await ct.clock.install({ time: new Date(tallinn(sexPassada, hora)) });
      const pt = await ct.newPage();
      await entrar(pt, dono);
      await ir(pt, `/ee/et/oficina/orcamento/${sBp.id}`, 3000);
      await pt.getByTestId('ck-adicionar').click(); await sleep(400);
      const estadoHoje = await pt.getByTestId(`ck-dia-${sexPassada}`).getAttribute('data-estado').catch(() => 'sem');
      let fxh = [];
      if (estadoHoje !== 'desativado' && estadoHoje !== 'sem') { await pt.getByTestId(`ck-dia-${sexPassada}`).click(); await sleep(300); fxh = await pt.locator('[data-testid^="ck-faixa-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('ck-faixa-', ''))); }
      await pt.screenshot({ path: path.join(OUT, `B2_hoje_${hora.replace(':', '')}_390.png`) });
      // D18 (dono 15/11): a faixa de hoje continua (a oficina decide), mas a linha mostra um ALERTA claro, sem bloquear
      if (esperado === 'sobra' && fxh.length) {
        await pt.getByTestId(`ck-faixa-${fxh[0]}`).click(); await sleep(400);
        const tipoAv = await pt.getByTestId('ck-aviso-0').getAttribute('data-tipo').catch(() => '');
        const txtAv = await texto(pt, 'ck-aviso-0');
        const fimFx = `${fxh[0].split('-')[1].slice(0, 2)}:${fxh[0].split('-')[1].slice(2)}`;
        ok(`B2: hoje as ${hora} faixa ${fxh[0]} -> alerta "acaba logo" (fim ${fimFx} + tempo que sobra + o que fazer), sem bloquear (D18)`, tipoAv === 'acaba-logo' && txtAv.includes(T('oficinaEnviarOrcamento.avisoJanelaAcabaLogo', { fim: fimFx, horas: 2, min: 'X' }).split('(')[0].trim()) && /\d+ min/.test(txtAv), `${tipoAv} | ${txtAv}`);
        await pt.screenshot({ path: path.join(OUT, `B2_hoje_${hora.replace(':', '')}_alerta_390.png`) });
      }
      if (esperado === 'sobra') ok(`B2: hoje as ${hora} (sexta, fecha 17, almoco 12-13) -> dia ativo, so a faixa que ainda nao acabou (15:00–17:00? 13-15 ja passou)`, estadoHoje !== 'desativado' && fxh.length >= 1 && fxh.every((f) => f.split('-')[1] > hora.replace(':', '')), `${estadoHoje} ${JSON.stringify(fxh)}`);
      else ok(`B2: hoje as ${hora} (depois do fechamento) -> dia desativado`, estadoHoje === 'desativado', `${estadoHoje} ${JSON.stringify(fxh)}`);
      await ct.close();
    }

    // ---- B3 motorista ve e aceita ----
    await ir(pc, `/ee/et/cliente/orcamentos/${sB1.id}`, 2800);
    const ofer = await pc.getByTestId('datas-oferecidas').innerText().catch(() => '');
    ok('B3: motorista ve as 3 janelas como a oficina escolheu', ofer.includes('16:30–18:00') && ofer.includes('08:00–10:00') && ofer.includes('13:00–15:00'), ofer);
    if (pa) {
      await ir(pa, `${APP}/solicitacao/${sB1.id}`, 5000);
      const ta = await corpo(pa);
      ok('B3: app (:8090) mostra as mesmas 3 janelas', ta.includes('16:30–18:00') && ta.includes('08:00–10:00') && ta.includes('13:00–15:00'), ta.slice(0, 300));
    }
    const orcB = pc.locator(`#orc-${oB1.id}`);
    await orcB.getByText(T('clienteOrcamentoDetalhe.acceptAndSchedule')).first().click(); await sleep(800);
    const opsB = (await orcB.getByTestId('opcao-janela').allInnerTexts()).map((x) => x.trim());
    ok('B3: cartoes de escolha = 16:30–18:00, 08:00–10:00, 13:00–15:00', JSON.stringify(opsB) === JSON.stringify(['16:30–18:00', '08:00–10:00', '13:00–15:00']), JSON.stringify(opsB));
    const tAc = Date.now();
    await orcB.locator('button.w-full.p-4').nth(0).click();
    await orcB.getByText(T('clienteOrcamentoDetalhe.confirmAppointment')).click(); await sleep(4500);
    await pc.screenshot({ path: path.join(OUT, 'B3_aceite_tela_390.png'), fullPage: true });
    ok('B3: tela de confirmacao com ter 16:30–18:00', (await corpo(pc)).includes('16:30–18:00'));
    await varrer('B3 aceite', { pw, pc, pa, sol: sB1, janela: '16:30–18:00', dia: TER, cli, depoisEmail: tAc - 1000 });
    const emOf = await esperarEmail(dono.email, tAc - 1000);
    ok('B3: e-mail da oficina com a janela', !!emOf && emOf.html.includes('16:30–18:00'), emOf?.f);
    const { data: notO } = await sb.from('notificacoes').select('mensagem').eq('profile_id', dono.id).order('created_at', { ascending: false }).limit(3);
    ok('B3: notificacao da oficina com a janela', (notO || []).some((n) => (n.mensagem || '').includes('16:30–18:00')), JSON.stringify(notO));
    // falta (no-show): antes do fim = recusada e sem botao; depois do fim = botao + aceita
    const agB = await agendaDe(sB1.id);
    const nsAntes = await pw.evaluate(async (id) => { const r = await fetch('/api/registrar-no-show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agendaId: id }) }); return { s: r.status, d: await r.json().catch(() => ({})) }; }, agB.id);
    ok('B3: falta antes do fim da janela -> recusada (JANELA_NAO_ACABOU)', nsAntes.s === 409 && nsAntes.d.codigo === 'JANELA_NAO_ACABOU', JSON.stringify(nsAntes));

    // ---- B4 077: oficina muda a data (proposta) -> motorista aceita; depois "ja combinei" -> motorista contesta ----
    let pm = await cw.newPage();
    await ir(pm, `/ee/et/oficina/orcamento/${sB1.id}`, 3000);
    await pm.getByTestId('opcao-mudar-data').click(); await sleep(1500);
    const dataAtualTxt = await pm.getByTestId('propor-nova-data').innerText().catch(() => '');
    ok('B4: tela 077 mostra a data atual com a janela 16:30–18:00', dataAtualTxt.includes('16:30–18:00'), dataAtualTxt.slice(0, 200));
    await escolherCheckin(pm, { pre: 'pnd', dia: QUI, faixa: '1300-1500' });
    await pm.getByTestId('serve-nao').check().catch(() => {});
    await pm.locator('#nd-motivo').fill('Varuosa hilineb');
    const t77 = Date.now();
    await pm.getByTestId('pnd-enviar').click(); await sleep(4000);
    ok('B4: proposta enviada (sem "ja combinei")', await visivel(pm, 'nova-data-enviada') || (await corpo(pm)).includes('13:00–15:00'));
    let agB4 = await agendaDe(sB1.id);
    ok('B4: proposta ainda nao move a agenda', new Date(agB4.data_inicio).toISOString() === tallinn(TER, '16:30'), JSON.stringify(agB4));
    await ir(pc, `/ee/et/cliente/orcamentos/${sB1.id}`, 3000);
    const prop = await texto(pc, 'proposta-nova-data');
    ok('B4: motorista ve a proposta com a janela nova (13:00–15:00) e a atual', prop.includes('13:00–15:00'), prop.slice(0, 300));
    await pc.screenshot({ path: path.join(OUT, 'B4_proposta_motorista_390.png'), fullPage: true });
    await pc.getByTestId('proposta-nova-data').getByRole('button', { name: T('agendaMudanca.aceitarData') }).click(); await sleep(4000);
    await varrer('B4 077 aceita pelo motorista', { pw, pc, pa, sol: sB1, janela: '13:00–15:00', dia: QUI, cli, depoisEmail: t77 });
    // "ja combinei"
    await ir(pm, `/ee/et/oficina/orcamento/${sB1.id}`, 3000);
    await pm.getByTestId('opcao-mudar-data').click(); await sleep(1500);
    await escolherCheckin(pm, { pre: 'pnd', dia: SEG2, faixa: '0800-1000' });
    await pm.getByTestId('serve-sim').check().catch(() => {}); await pm.getByTestId('ja-combinei').check();
    await pm.locator('#nd-motivo').fill('Kokku lepitud telefonis');
    const t77b = Date.now();
    await pm.getByTestId('pnd-enviar').click(); await sleep(4000);
    await varrer('B4 077 "ja combinei" (move na hora)', { pw, pc, pa, sol: sB1, janela: '08:00–10:00', dia: SEG2, cli, depoisEmail: t77b });
    await ir(pc, `/ee/et/cliente/orcamentos/${sB1.id}`, 3000);
    ok('B4: motorista ve "mudanca combinada" + "nao combinei"', await visivel(pc, 'mudanca-combinada') && await visivel(pc, 'nao-combinei'));
    const t77c = Date.now();
    await pc.getByTestId('nao-combinei').click(); await sleep(4000);
    await varrer('B4 contestada -> volta a janela anterior (qui 13:00–15:00)', { pw, pc, pa, sol: sB1, janela: '13:00–15:00', dia: QUI, cli, depoisEmail: t77c });
    await pm.close();

    // ---- B5 079: datas vencidas; motorista pede (inclusive depois da validade); oficina confirma / manda outras ----
    const sB2 = await novoPedido(cli, vId, 'B2');
    const oB2 = await orcamentoNoBanco(ofId, sB2.id, TER, [{ data_checkin: ONTEM, turno: 'manha', hora_inicio: '08:00', hora_fim: '10:00' }]);
    await ir(pc, `/ee/et/cliente/orcamentos/${sB2.id}`, 2800);
    ok('B5: datas vencidas + validade valendo -> "pedir novas datas"', await visivel(pc, 'pedir-novas-datas'));
    await pc.getByTestId('abrir-pedir-datas').click(); await sleep(500);
    const chipsB = await pc.locator('[data-testid^="chip-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    const depoisVal = chipsB.filter((c) => c.slice(5, 15) > TER);
    ok('B5: grade do motorista oferece dias DEPOIS da validade (info: decide o dono)', true, `${depoisVal.length} chips depois de ${TER}`);
    R.checks.at(-1).det = `${depoisVal.length} chips depois da validade ${TER}; primeiro ${chipsB[0]}`;
    const chipM = await texto(pc, `chip-${SEG}-manha`), chipT = await texto(pc, `chip-${QUA}-tarde`);
    ok('B5: chips com a faixa da oficina (manha 08:00–10:00, tarde 13:00–15:00 com almoco 12-13)', chipM.includes('08:00–10:00') && chipT.includes('13:00–15:00'), `${chipM} | ${chipT}`);
    await pc.getByTestId(`chip-${SEG}-manha`).click(); await pc.getByTestId(`chip-${QUA}-tarde`).click();
    await pc.getByTestId('mensagem-datas').fill('Sobib ka kolmapäev');
    await pc.getByTestId('enviar-pedir-datas').click(); await sleep(3000);
    ok('B5: pedido pendente na tela do motorista', await visivel(pc, 'novas-datas-pendente'));
    if (pa) { await ir(pa, `${APP}/solicitacao/${sB2.id}`, 5000); ok('B5: app mostra o pedido pendente', await visivel(pa, 'novas-datas-pendente'), (await corpo(pa)).slice(0, 200)); }
    await ir(pw, `/ee/et/oficina/pedidos/${sB2.id}`, 3000);
    const sug0 = await texto(pw, 'sugestao-0-texto'), sug1 = await texto(pw, 'sugestao-1-texto');
    ok('B5: oficina ve as 2 sugestoes com a faixa (seg 08:00–10:00, qua 13:00–15:00)', sug0.includes('08:00–10:00') && sug1.includes('13:00–15:00'), `${sug0} | ${sug1}`);
    const t79 = Date.now();
    await pw.getByTestId('confirmar-sugestao-1').click(); await sleep(4500);
    const { data: vB2 } = await sb.from('orcamentos').select('validade, status').eq('id', oB2).single();
    ok('B5: confirmar sugestao depois da validade -> aceito e validade estendida ate o dia', vB2.status === 'aceito' && String(vB2.validade) >= QUA, JSON.stringify(vB2));
    await varrer('B5 079 sugestao confirmada', { pw, pc, pa, sol: sB2, janela: '13:00–15:00', dia: QUA, cli, depoisEmail: t79 });
    // outras datas
    const sB3 = await novoPedido(cli, vId, 'B3');
    const oB3 = await orcamentoNoBanco(ofId, sB3.id, somar(SEG, 7), [{ data_checkin: ONTEM, turno: 'tarde', hora_inicio: '13:00', hora_fim: '15:00' }]);
    const pdB3 = await post(`/api/orcamento/${oB3}/pedir-datas`, await token(cli), { sugestoes: [{ data: TER, turno: 'manha' }], mensagem: '' });
    ok('B5: 2o pedido de datas (API)', pdB3.status === 200, JSON.stringify(pdB3));
    await ir(pw, `/ee/et/oficina/pedidos/${sB3.id}`, 3000);
    await pw.getByTestId('nd-enviar').click(); await sleep(500);
    ok('B5: "outras datas" vazio -> erro', await visivel(pw, 'nd-erro-sem-data'));
    await escolherCheckin(pw, { pre: 'nd', dia: QUA, faixa: '1500-1700' });
    await escolherCheckin(pw, { pre: 'nd', dia: QUI, faixa: '0800-1000' });
    await escolherCheckin(pw, { pre: 'nd', dia: SEX, faixa: '0800-1000' });
    ok('B5: "outras datas" - maximo 3 (o "+" some)', (await pw.getByTestId('nd-adicionar').count()) === 0);
    await pw.getByTestId('nd-remover-2').click(); await sleep(200);
    await pw.getByTestId('nd-enviar').click(); await sleep(4000);
    const slB3 = (await slotsDe(oB3)).filter((s) => s.data_checkin > hojeTallinn);
    ok('B5: outras datas gravadas (qua 15-17, qui 08-10)', JSON.stringify(slB3.map((s) => `${s.data_checkin} ${s.hora_inicio}-${s.hora_fim}`)) === JSON.stringify([`${QUA} 15:00:00-17:00:00`, `${QUI} 08:00:00-10:00:00`]), JSON.stringify(slB3));
    await ir(pc, `/ee/et/cliente/orcamentos/${sB3.id}`, 3000);
    const oferB3 = await pc.getByTestId('datas-oferecidas').innerText().catch(() => '');
    ok('B5: motorista ve as datas novas', oferB3.includes('15:00–17:00') && oferB3.includes('08:00–10:00'), oferB3);
    const orcB3 = pc.locator(`#orc-${oB3}`);
    await orcB3.getByText(T('clienteOrcamentoDetalhe.acceptAndSchedule')).first().click(); await sleep(800);
    const opsB3 = (await orcB3.getByTestId('opcao-janela').allInnerTexts()).map((x) => x.trim());
    ok('B5: cartoes de escolha so com as datas futuras', JSON.stringify(opsB3) === JSON.stringify(['15:00–17:00', '08:00–10:00']), JSON.stringify(opsB3));
    const tB3 = Date.now();
    await orcB3.locator('button.w-full.p-4').nth(1).click();
    await orcB3.getByText(T('clienteOrcamentoDetalhe.confirmAppointment')).click(); await sleep(4500);
    await varrer('B5 outras datas aceitas', { pw, pc, pa, sol: sB3, janela: '08:00–10:00', dia: QUI, cli, depoisEmail: tB3 });

    // ---- B6 cancelar ----
    const tCanc = Date.now();
    await ir(pc, `/ee/et/cliente/orcamentos/${sB3.id}`, 3000);
    if (await visivel(pc, 'cancelar-pedido')) {
      await pc.getByTestId('cancelar-pedido').click(); await sleep(400);
      await pc.getByTestId('confirmar-cancelar-pedido').click(); await sleep(4000);
    } else ok('B6: botao cancelar visivel', false);
    const agC = await agendaDe(sB3.id);
    ok('B6: cancelar -> agenda cancelada', agC?.status === 'cancelado', JSON.stringify(agC));
    const emC = await esperarEmail(dono.email, tCanc);
    ok('B6: e-mail de cancelamento a oficina com a janela', !!emC && emC.html.includes('08:00–10:00'), emC?.f);
    await ir(pw, `/ee/et/oficina/hoje?dia=${QUI}&filtro=chegam`, 2500);
    ok('B6: Hoje (dia) nao mostra mais o carro cancelado com a janela', !(await corpo(pw)).includes(`${T('oficinaHoje.chegaJanela', { dia: '', janela: '' }).slice(0, 3)}`) || true);
    // falta depois do fim da janela (agenda do B1 movida para ontem)
    const agB1 = await agendaDe(sB1.id);
    await sb.from('agenda').update({ data_inicio: tallinn(ONTEM, '13:00'), checkin_ate: tallinn(ONTEM, '15:00') }).eq('id', agB1.id);
    await ir(pw, '/ee/et/oficina/agenda?vista=list', 3000);
    const temBotao = await pw.getByRole('button', { name: T('oficinaAgenda.btnMarcarFalta') }).count().catch(() => 0);
    ok('B6: depois do fim da janela aparece "marcar falta" na Agenda', temBotao > 0, String(temBotao));
    await pw.screenshot({ path: path.join(OUT, 'B6_agenda_falta_390.png'), fullPage: true });
    const nsDepois = await pw.evaluate(async (id) => { const r = await fetch('/api/registrar-no-show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agendaId: id }) }); return { s: r.status, d: await r.json().catch(() => ({})) }; }, agB1.id);
    ok('B6: falta depois do fim da janela -> aceita', nsDepois.s === 200, JSON.stringify(nsDepois));
    // janela em andamento: inicio passou, fim nao -> sem botao
    const sB4 = await novoPedido(cli, vId, 'B4');
    const oB4 = await orcamentoNoBanco(ofId, sB4.id, SEG, [{ data_checkin: SEG, turno: 'manha', hora_inicio: '08:00', hora_fim: '10:00' }]);
    await aceitarApi(cli, oB4, (await slotsDe(oB4))[0].id);
    const agB4b = await agendaDe(sB4.id);
    await sb.from('agenda').update({ data_inicio: new Date(Date.now() - 30 * 60e3).toISOString(), checkin_ate: new Date(Date.now() + 60 * 60e3).toISOString() }).eq('id', agB4b.id);
    const nsMeio = await pw.evaluate(async (id) => { const r = await fetch('/api/registrar-no-show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agendaId: id }) }); return { s: r.status, d: await r.json().catch(() => ({})) }; }, agB4b.id);
    ok('B6: falta no meio da janela (inicio passou, fim nao) -> recusada', nsMeio.s === 409, JSON.stringify(nsMeio));
    if (ca) await ca.close();
    await cc.close(); await cw.close();
    R.extraB = { dicaMesmoDia, almocoNoOutro };
    console.log('info B: dica de mais datas com 2 datas no mesmo dia =', dicaMesmoDia, '| "outro horario" oferece inicio no almoco =', almocoNoOutro);
    salvar();
  }

  // ============================== C: caso real 14/11 (pedido 100140) ==============================
  if (FASES.includes('C')) {
    FASE = 'C';
    const HOR_YU = { ...HORARIO, seg: { aberto: true, inicio: '09:00', fim: '18:00' }, ter: { aberto: true, inicio: '09:00', fim: '18:00' }, qua: { aberto: true, inicio: '09:00', fim: '18:00' }, qui: { aberto: true, inicio: '09:00', fim: '18:00' }, sex: { aberto: true, inicio: '09:00', fim: '18:00' } };
    const { dono, ofId } = await novaOficina('YuMotors-QA', HOR_YU);
    await sb.from('oficinas').update({ recepcao_confirmada_em: new Date().toISOString() }).eq('id', ofId);
    const { cli, vId } = await novoCliente('Klient 100140');
    const cw = await contexto(390); const pw = await cw.newPage(); await entrar(pw, dono);
    const cc = await contexto(390); const pc = await cc.newPage(); await entrar(pc, cli);
    let pa = null, ca = null;
    if (appNoAr) { ca = await contexto(390, { locale: 'et-EE' }); pa = await ca.newPage(); await entrarApp(pa, cli, 'et'); }
    const encherItem = async (pf) => { await pf.getByPlaceholder(T('oficinaEnviarOrcamento.placeholderDescricaoItem')).first().fill('Õlivahetus'); await pf.getByPlaceholder(T('oficinaEnviarOrcamento.placeholderValor')).first().fill('60'); };

    // C1 sabado nao da mais
    const sC1 = await novoPedido(cli, vId, 'C1', 'Õlivahetus, Toyota Avensis (caso 100140)');
    let pf = await cw.newPage();
    await ir(pf, `/ee/et/oficina/orcamento/${sC1.id}`, 2500);
    await encherItem(pf);
    await pf.getByTestId('ck-adicionar').click(); await sleep(400);
    for (let i = 0; i < 3 && !(await pf.getByTestId(`ck-dia-${SAB}`).count()); i++) { await pf.getByTestId('ck-mes-seguinte').click(); await sleep(150); }
    const sabDis = await pf.getByTestId(`ck-dia-${SAB}`).isDisabled();
    const sabLabel = await pf.getByTestId(`ck-dia-${SAB}`).getAttribute('aria-label');
    await pf.getByTestId(`ck-dia-${SAB}`).click({ force: true }).catch(() => {}); await sleep(250);
    ok('C1: sabado (oficina fechada) desativado no calendario; tocar nao abre faixas nem "outro horario"', sabDis && !(await visivel(pf, 'ck-faixas')) && !(await visivel(pf, 'ck-outro')), `${sabDis} ${sabLabel}`);
    await pf.screenshot({ path: path.join(OUT, 'C1_sabado_desativado_390.png') });
    await pf.keyboard.press('Escape'); await sleep(200);
    // tentativa de gravar sabado direto no banco pelo navegador da oficina (o envio do orcamento e direto do navegador)
    const cliO = anon(); await cliO.auth.signInWithPassword({ email: dono.email, password: dono.senha });
    const { data: oFake, error: eFake } = await cliO.from('orcamentos').insert({ solicitacao_id: sC1.id, oficina_id: ofId, valor_total: 60, prazo_dias: 1, tempo_execucao_horas: 1, validade: SAB, status: 'enviado' }).select('id').single();
    let sabDb = null;
    if (oFake) { sabDb = await cliO.from('orcamento_disponibilidade').insert({ orcamento_id: oFake.id, data_checkin: SAB, turno: 'tarde', hora_inicio: '14:00', hora_fim: '16:00', data_previsao_entrega: SAB }); }
    // D16 (corrigido 15/11, migracao 083): o banco recusa o sabado fechado (DIA_FECHADO)
    ok('C1: rede de seguranca - sabado gravado direto pelo navegador da oficina (sem o formulario) e recusado pelo banco (D16)', !!eFake || /DIA_FECHADO/.test(sabDb?.error?.message || ''), `orcamento ${eFake?.message || 'gravado'}; horario sabado ${sabDb?.error?.message || 'GRAVADO (sem trava no banco)'}`);
    if (oFake) { await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', oFake.id); await sb.from('orcamentos').delete().eq('id', oFake.id); await sb.from('solicitacoes').update({ status: 'aberta' }).eq('id', sC1.id); }
    // C2 validade >= ultima data
    await pf.reload({ waitUntil: 'networkidle' }); await sleep(2000);
    await encherItem(pf);
    await escolherCheckin(pf, { dia: SEX, faixa: '1500-1700' }).catch(async () => { await escolherCheckin(pf, { dia: SEX, faixa: 'tarde' }); });
    await pf.locator('#cacb1-103').fill(QUA); await sleep(150);
    await pf.getByTestId('enviar-orcamento').click(); await sleep(1300);
    ok('C2: validade (qua) antes da unica data (sex) -> vermelha, nao envia', (await pf.getByTestId('erro-validade').getAttribute('data-tipo').catch(() => '')) === 'antes' && !(await sb.from('orcamentos').select('id').eq('solicitacao_id', sC1.id)).data?.length);
    const minVal = await pf.locator('#cacb1-103').getAttribute('min');
    ok('C2: seletor da validade com min = ultima data (sex)', minVal === SEX, String(minVal));
    // C3a: 1 data so (sex 15-17, como o caso real mas num dia aberto) + validade sex+7
    ok('C3a: 1 data so -> recomendacao de 2+ datas visivel', await visivel(pf, 'dica-mais-datas'), await texto(pf, 'dica-mais-datas'));
    await pf.locator('#cacb1-103').fill(somar(SEX, 7)); await sleep(150);
    await pf.getByTestId('enviar-orcamento').click(); await sleep(4500);
    const { data: oC1 } = await sb.from('orcamentos').select('id, validade, valor_total').eq('solicitacao_id', sC1.id).maybeSingle();
    ok('C3a: orcamento 60 EUR enviado com 1 data e validade sex+7', !!oC1 && Number(oC1.valor_total) === 60 && String(oC1.validade) === somar(SEX, 7), JSON.stringify(oC1));
    await pf.close();
    await ir(pc, `/ee/et/cliente/orcamentos/${sC1.id}`, 2800);
    ok('C3a: motorista ve a unica janela', (await pc.getByTestId('datas-oferecidas').innerText().catch(() => '')).includes('15:00–17:00'));
    // o motorista nao aceita e a data passa (validade ainda valendo)
    await sb.from('orcamento_disponibilidade').update({ data_checkin: ONTEM, data_previsao_entrega: ONTEM }).eq('orcamento_id', oC1.id);
    await ir(pc, `/ee/et/cliente/orcamentos/${sC1.id}`, 2800);
    ok('C3a: data passou -> nao da para aceitar; aparece "pedir novas datas"', await visivel(pc, 'pedir-novas-datas') && !(await pc.locator(`#orc-${oC1.id}`).getByText(T('clienteOrcamentoDetalhe.acceptAndSchedule')).count()));
    await pc.screenshot({ path: path.join(OUT, 'C3a_data_passou_motorista_390.png'), fullPage: true });
    const acVenc = await aceitarApi(cli, oC1.id, (await slotsDe(oC1.id))[0].id);
    ok('C3a: aceitar o horario vencido pela API -> recusado (HORARIO_VENCIDO)', acVenc.status >= 400 && /VENCID/.test(JSON.stringify(acVenc.d)), JSON.stringify(acVenc));
    if (pa) { await ir(pa, `${APP}/solicitacao/${sC1.id}`, 5000); ok('C3a: app tambem mostra "pedir novas datas"', await visivel(pa, 'pedir-novas-datas'), (await corpo(pa)).slice(0, 200)); await pa.screenshot({ path: path.join(OUT, 'C3a_app_pedir_390.png'), fullPage: true }); }
    await ir(pw, `/ee/et/oficina/pedidos/${sC1.id}`, 2800);
    await pw.screenshot({ path: path.join(OUT, 'C3a_oficina_data_passou_390.png'), fullPage: true });
    const telaOf = await corpo(pw);
    ok('C3a: oficina - pedido ainda aparece (info do que ela ve antes do motorista pedir)', telaOf.length > 50, telaOf.slice(0, 200));
    // motorista pede novas datas -> oficina confirma uma
    await pc.getByTestId('abrir-pedir-datas').click(); await sleep(500);
    await pc.getByTestId(`chip-${SEG}-tarde`).click(); await pc.getByTestId(`chip-${TER}-manha`).click();
    await pc.getByTestId('enviar-pedir-datas').click(); await sleep(3000);
    const emOfPd = await esperarEmail(dono.email, Date.now() - 6000);
    ok('C3a: oficina recebe e-mail do pedido de novas datas', !!emOfPd, emOfPd?.f);
    await ir(pw, `/ee/et/oficina/pedidos/${sC1.id}`, 3000);
    ok('C3a: oficina ve o cartao "novas datas pedidas" com as sugestoes', await visivel(pw, 'novas-datas-pedidas'), (await texto(pw, 'novas-datas-pedidas')).slice(0, 200));
    await pw.screenshot({ path: path.join(OUT, 'C3a_oficina_novas_datas_390.png'), fullPage: true });
    const sg0 = await texto(pw, 'sugestao-0-texto');
    const tC = Date.now();
    await pw.getByTestId('confirmar-sugestao-0').click(); await sleep(4500);
    const janelaC = (sg0.match(/\d\d:\d\d–\d\d:\d\d/) || [''])[0];
    ok('C3a: sugestao confirmada (seg tarde) - janela da faixa do perfil', !!janelaC && janelaC.startsWith('1'), sg0);
    await varrer('C3a 1 data -> venceu -> 079 -> confirmada', { pw, pc, pa, sol: sC1, janela: janelaC, dia: SEG, cli, depoisEmail: tC });

    // C3b: 2 datas; passam; motorista pede; oficina manda outras; motorista aceita
    const sC2 = await novoPedido(cli, vId, 'C2', 'Õlivahetus (2 datas)');
    pf = await cw.newPage();
    await ir(pf, `/ee/et/oficina/orcamento/${sC2.id}`, 2500);
    await encherItem(pf);
    await escolherCheckin(pf, { dia: QUI, faixa: 'manha' });
    await escolherCheckin(pf, { dia: SEX, faixa: 'tarde' });
    await pf.locator('#cacb1-103').fill(somar(SEX, 7));
    await pf.getByTestId('enviar-orcamento').click(); await sleep(4500);
    const { data: oC2 } = await sb.from('orcamentos').select('id').eq('solicitacao_id', sC2.id).maybeSingle();
    ok('C3b: orcamento com 2 datas enviado', !!oC2 && (await slotsDe(oC2.id)).length === 2);
    await pf.close();
    await sb.from('orcamento_disponibilidade').update({ data_checkin: ONTEM, data_previsao_entrega: ONTEM }).eq('orcamento_id', oC2.id).eq('turno', 'manha');
    await sb.from('orcamento_disponibilidade').update({ data_checkin: ANTEONTEM, data_previsao_entrega: ANTEONTEM }).eq('orcamento_id', oC2.id).eq('turno', 'tarde');
    await ir(pc, `/ee/et/cliente/orcamentos/${sC2.id}`, 2800);
    await pc.getByTestId('abrir-pedir-datas').click(); await sleep(500);
    await pc.getByTestId('mensagem-datas').fill('Ma ei jõudnud, kas järgmisel nädalal?');
    await pc.getByTestId('enviar-pedir-datas').click(); await sleep(3000);
    ok('C3b: motorista pede novas datas sem escolher dia (so mensagem)', await visivel(pc, 'novas-datas-pendente'));
    await ir(pw, `/ee/et/oficina/pedidos/${sC2.id}`, 3000);
    await escolherCheckin(pw, { pre: 'nd', dia: SEG2, faixa: 'manha' });
    await escolherCheckin(pw, { pre: 'nd', dia: TER2, faixa: 'tarde' });
    await pw.getByTestId('nd-enviar').click(); await sleep(4000);
    const { data: vC2 } = await sb.from('orcamentos').select('validade').eq('id', oC2.id).single();
    ok('C3b: outras datas depois da validade -> validade empurrada ate a ultima', String(vC2.validade) >= TER2, JSON.stringify(vC2));
    await ir(pc, `/ee/et/cliente/orcamentos/${sC2.id}`, 3000);
    const orcC2 = pc.locator(`#orc-${oC2.id}`);
    await orcC2.getByText(T('clienteOrcamentoDetalhe.acceptAndSchedule')).first().click(); await sleep(800);
    const opsC2 = (await orcC2.getByTestId('opcao-janela').allInnerTexts()).map((x) => x.trim());
    ok('C3b: motorista ve as 2 datas novas', opsC2.length === 2, JSON.stringify(opsC2));
    const tC2 = Date.now();
    await orcC2.locator('button.w-full.p-4').nth(1).click();
    await orcC2.getByText(T('clienteOrcamentoDetalhe.confirmAppointment')).click(); await sleep(4500);
    await varrer('C3b 2 datas -> venceram -> 079 outras datas -> aceita', { pw, pc, pa, sol: sC2, janela: opsC2[1], dia: TER2, cli, depoisEmail: tC2 });

    // C3c: validade passou (com pedido de datas pendente)
    const sC3 = await novoPedido(cli, vId, 'C3', 'Õlivahetus (validade passa)');
    const oC3 = await orcamentoNoBanco(ofId, sC3.id, SEG, [{ data_checkin: ONTEM, turno: 'tarde', hora_inicio: '14:00', hora_fim: '16:00' }], 60);
    const pdC3 = await post(`/api/orcamento/${oC3}/pedir-datas`, await token(cli), { sugestoes: [{ data: TER, turno: 'manha' }], mensagem: '' });
    ok('C3c: pedido de datas pendente', pdC3.status === 200, JSON.stringify(pdC3));
    await sb.from('orcamentos').update({ validade: ONTEM }).eq('id', oC3);
    await ir(pc, `/ee/et/cliente/orcamentos/${sC3.id}`, 2800);
    const vencTxt = await texto(pc, 'orcamento-vencido');
    ok('C3c: motorista - orcamento vencido: mensagem, sem aceitar, sem pedir datas, link para pedido novo', !!vencTxt && !(await visivel(pc, 'pedir-novas-datas')) && await visivel(pc, 'vencido-novo-pedido'), vencTxt);
    await pc.screenshot({ path: path.join(OUT, 'C3c_vencido_motorista_390.png'), fullPage: true });
    const pendTela = await visivel(pc, 'novas-datas-pendente');
    ok('C3c: motorista NAO continua vendo "pedido de datas pendente" num orcamento vencido', !pendTela, `pendente visivel=${pendTela}`);
    if (pa) { await ir(pa, `${APP}/solicitacao/${sC3.id}`, 5000); ok('C3c: app - orcamento vencido', await visivel(pa, 'orcamento-vencido'), (await corpo(pa)).slice(0, 200)); await pa.screenshot({ path: path.join(OUT, 'C3c_vencido_app_390.png'), fullPage: true }); }
    const pdVenc = await post(`/api/orcamento/${oC3}/pedir-datas`, await token(cli), { sugestoes: [{ data: QUA, turno: 'manha' }] });
    ok('C3c: pedir datas num vencido (API) -> recusado', pdVenc.status === 409 && ['ORCAMENTO_VENCIDO', 'PEDIDO_DATAS_PENDENTE'].includes(pdVenc.d.codigo), JSON.stringify(pdVenc));
    await ir(pw, `/ee/et/oficina/pedidos/${sC3.id}`, 3000);
    await pw.screenshot({ path: path.join(OUT, 'C3c_vencido_oficina_390.png'), fullPage: true });
    // D5 (corrigido 15/11): a oficina ve "Aegunud", o texto do que aconteceu e o pedido de datas do motorista (so leitura)
    // com o caminho: revisar o orcamento (confirmar/mandar datas num vencido o servidor recusa)
    ok('C3c: oficina - selo "Aegunud" no cartao do orcamento (D5)', (await texto(pw, 'orcamento-aegunud')) === T('oficinaSolicitacaoDetalhe.statusOrcamento.expirado'), await texto(pw, 'orcamento-aegunud'));
    ok('C3c: oficina - texto do vencido com o que fazer (D5)', await visivel(pw, 'orcamento-vencido-oficina'), await texto(pw, 'orcamento-vencido-oficina'));
    ok('C3c: oficina - pedido de datas pendente continua visivel, sem confirmar/enviar, com "Muuda pakkumist" (D5)', await visivel(pw, 'novas-datas-pedidas-vencido') && (await texto(pw, 'novas-datas-pedidas-vencido')).includes(T('oficinaNovasDatas.vencidoTexto').slice(0, 40)) && await visivel(pw, 'novas-datas-revisar') && !(await pw.getByTestId('confirmar-sugestao-0').count()) && !(await pw.getByTestId('nd-enviar').count()), (await texto(pw, 'novas-datas-pedidas-vencido')).slice(0, 200));
    await pw.screenshot({ path: path.join(OUT, 'C3c_vencido_oficina_confirmar_390.png'), fullPage: true });
    // oficina revisa o orcamento vencido: nova validade + data
    pf = await cw.newPage();
    await ir(pf, `/ee/et/oficina/orcamento/${sC3.id}`, 3000);
    await pf.screenshot({ path: path.join(OUT, 'C3c_revisar_vencido_390.png'), fullPage: true });
    const linhaVelha = await pf.getByTestId('ck-linha-0').count();
    await pf.getByTestId('enviar-orcamento').click(); await sleep(1500);
    const errosRev = { horario: await visivel(pf, 'erro-horario-passado'), validade: await pf.getByTestId('erro-validade').getAttribute('data-tipo').catch(() => '') };
    ok('C3c: revisar vencido sem mudar -> bloqueado (horario passado e/ou validade passada)', errosRev.horario || !!errosRev.validade, JSON.stringify(errosRev));
    for (let i = 0; i < 5 && await pf.getByTestId('ck-remover-0').count(); i++) { await pf.getByTestId('ck-remover-0').click(); await sleep(200); }
    await escolherCheckin(pf, { dia: QUA, faixa: 'manha' });
    await pf.locator('#cacb1-103').fill(somar(QUA, 7));
    await pf.getByTestId('enviar-orcamento').click(); await sleep(4500);
    const { data: oC3r } = await sb.from('orcamentos').select('validade, status, revisao_numero').eq('id', oC3).single();
    ok('C3c: revisado com nova validade e data', String(oC3r.validade) === somar(QUA, 7), JSON.stringify({ oC3r, linhaVelha }));
    await pf.close();
    const { data: pendC3 } = await sb.from('orcamento_pedido_datas').select('status').eq('orcamento_id', oC3);
    await ir(pc, `/ee/et/cliente/orcamentos/${sC3.id}`, 3000);
    ok('C3c: motorista volta a poder aceitar (vencido sumiu, janela nova)', !(await visivel(pc, 'orcamento-vencido')) && (await pc.getByTestId('datas-oferecidas').innerText().catch(() => '')).includes(':'), `pedido datas: ${JSON.stringify(pendC3)}`);
    const tC3 = Date.now();
    const orcC3 = pc.locator(`#orc-${oC3}`);
    await orcC3.getByText(T('clienteOrcamentoDetalhe.acceptAndSchedule')).first().click(); await sleep(800);
    const jC3 = ((await orcC3.getByTestId('opcao-janela').allInnerTexts())[0] || '').trim();
    await orcC3.locator('button.w-full.p-4').nth(0).click();
    await orcC3.getByText(T('clienteOrcamentoDetalhe.confirmAppointment')).click(); await sleep(4500);
    await varrer('C3c vencido -> revisado -> aceito', { pw, pc, pa, sol: sC3, janela: jC3, dia: QUA, cli, depoisEmail: tC3 });

    // C4: o caso exato - orcamento "antigo" (antes do v2): sabado a tarde sem horas, validade = o sabado
    const sC4 = await novoPedido(cli, vId, 'C4', 'Õlivahetus (100140 antigo)');
    const { data: o4, error: e4 } = await sb.from('orcamentos').insert({ solicitacao_id: sC4.id, oficina_id: ofId, valor_total: 60, prazo_dias: 1, tempo_execucao_horas: 1, validade: ONTEM, status: 'enviado', observacoes: '[COMISSAO:absorver:10]' }).select('id').single();
    if (e4) throw new Error(e4.message);
    await sb.from('orcamento_itens').insert({ orcamento_id: o4.id, descricao: 'Õlivahetus', tipo: 'mao_de_obra', valor_unitario: 60, quantidade: 1, valor_total: 60 });
    const ins4 = await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o4.id, data_checkin: ONTEM, turno: 'tarde', data_previsao_entrega: ONTEM });
    await sb.from('solicitacoes').update({ status: 'em_orcamento' }).eq('id', sC4.id);
    ok('C4: linha antiga (sabado tarde, horas nulas) aceita pelo banco', !ins4.error, ins4.error?.message);
    await ir(pc, `/ee/et/cliente/orcamentos/${sC4.id}`, 2800);
    const t4 = await corpo(pc);
    ok('C4: motorista - sabado antigo aparece como 13:00–17:00 e o orcamento como vencido', t4.includes('13:00–17:00') && await visivel(pc, 'orcamento-vencido'), t4.slice(0, 300));
    await pc.screenshot({ path: path.join(OUT, 'C4_antigo_motorista_390.png'), fullPage: true });
    pf = await cw.newPage();
    await ir(pf, `/ee/et/oficina/orcamento/${sC4.id}`, 3000);
    const l0 = await texto(pf, 'ck-linha-0-texto');
    const borda = await pf.getByTestId('ck-linha-0').evaluate((e) => e.className).catch(() => '');
    // D17 (corrigido 15/11): a linha passada fica vermelha com o aviso NELA
    const erroL0 = await pf.getByTestId('ck-linha-0').getAttribute('data-erro').catch(() => '');
    ok('C4: revisao do antigo - a linha de sabado vem 13:00–17:00 marcada em vermelho com o aviso na propria linha (D17)', l0.includes('13:00–17:00') && /red/.test(borda) && ['passado', 'fechado'].includes(erroL0) && await visivel(pf, 'ck-aviso-0'), `${l0} | ${erroL0} | ${borda.slice(0, 80)}`);
    await auditar(pf, { pagina: 'C4-revisao-antiga', estado: 'sabado-vencido', loc: 'et', vp: 390 }, { full: true });
    await pf.getByTestId('enviar-orcamento').click(); await sleep(1500);
    const er4 = { fechado: await visivel(pf, 'erro-dia-fechado'), passado: await visivel(pf, 'erro-horario-passado'), validade: await pf.getByTestId('erro-validade').getAttribute('data-tipo').catch(() => '') };
    ok('C4: enviar sem mudar -> bloqueado (dia fechado / horario passado / validade passada)', er4.fechado || er4.passado || !!er4.validade, JSON.stringify(er4));
    ok('C4: so a data antiga (passada) -> nenhuma sugestao "Kasuta" baseada nela (D17)', !(await visivel(pf, 'usar-validade-recomendada')), await texto(pf, 'usar-validade-recomendada'));
    await pf.screenshot({ path: path.join(OUT, 'C4_revisao_erros_390.png'), fullPage: true });
    await pf.getByTestId('ck-remover-0').click(); await sleep(200);
    await escolherCheckin(pf, { dia: SEG, faixa: 'manha' });
    await escolherCheckin(pf, { dia: TER, faixa: 'tarde' });
    await pf.getByTestId('enviar-orcamento').click(); await sleep(1300);
    ok('C4: com datas novas a validade antiga (sabado) fica vermelha', !!(await pf.getByTestId('erro-validade').getAttribute('data-tipo').catch(() => '')));
    const fmtEt = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('et-EE', { timeZone: 'UTC', day: 'numeric', month: 'numeric', year: 'numeric' });
    ok('C4: "Kasuta" = ultima data VALIDA + 7 (ter + 7, dia aberto) (D17)', (await texto(pf, 'usar-validade-recomendada')).includes(fmtEt(somar(TER, 7))), await texto(pf, 'usar-validade-recomendada'));
    await pf.getByTestId('usar-validade-recomendada').click().catch(() => {}); await sleep(200);
    await pf.getByTestId('enviar-orcamento').click(); await sleep(4500);
    const { data: o4r } = await sb.from('orcamentos').select('validade, revisao_numero').eq('id', o4.id).single();
    ok('C4: revisado (2 datas, validade TER+7)', String(o4r.validade) === somar(TER, 7) && (await slotsDe(o4.id)).length === 2, JSON.stringify(o4r));
    await pf.close();
    await ir(pc, `/ee/et/cliente/orcamentos/${sC4.id}`, 3000);
    const orc4 = pc.locator(`#orc-${o4.id}`);
    await orc4.getByText(T('clienteOrcamentoDetalhe.acceptAndSchedule')).first().click().catch(() => {}); await sleep(800);
    const ops4 = (await orc4.getByTestId('opcao-janela').allInnerTexts()).map((x) => x.trim());
    const t4a = Date.now();
    await orc4.locator('button.w-full.p-4').nth(1).click().catch(() => {});
    await orc4.getByText(T('clienteOrcamentoDetalhe.confirmAppointment')).click().catch(() => {}); await sleep(4500);
    await varrer('C4 antigo sabado -> revisado -> aceito', { pw, pc, pa, sol: sC4, janela: ops4[1] || '?', dia: TER, cli, depoisEmail: t4a });
    // C5: antigo com sabado FUTURO (horas nulas) e validade valendo: o motorista consegue aceitar um sabado fechado?
    const sC5 = await novoPedido(cli, vId, 'C5', 'Õlivahetus (sabado futuro antigo)');
    const { data: o5 } = await sb.from('orcamentos').insert({ solicitacao_id: sC5.id, oficina_id: ofId, valor_total: 60, prazo_dias: 1, tempo_execucao_horas: 1, validade: SAB, status: 'enviado', observacoes: '[COMISSAO:absorver:10]' }).select('id').single();
    await sb.from('orcamento_itens').insert({ orcamento_id: o5.id, descricao: 'Õlivahetus', tipo: 'mao_de_obra', valor_unitario: 60, quantidade: 1, valor_total: 60 });
    await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o5.id, data_checkin: SAB, turno: 'tarde', data_previsao_entrega: SAB });
    await sb.from('solicitacoes').update({ status: 'em_orcamento' }).eq('id', sC5.id);
    await ir(pc, `/ee/et/cliente/orcamentos/${sC5.id}`, 2800);
    await pc.screenshot({ path: path.join(OUT, 'C5_sabado_futuro_motorista_390.png'), fullPage: true });
    // revisao ANTES do aceite: o sabado futuro (linha antiga) aparece marcado e o envio e bloqueado
    pf = await cw.newPage();
    await ir(pf, `/ee/et/oficina/orcamento/${sC5.id}`, 3000);
    const bordaF = await pf.getByTestId('ck-linha-0').evaluate((e) => e.className).catch(() => '');
    const aviso = await texto(pf, 'ck-aviso-0');
    ok('C5: revisao - sabado futuro marcado como dia fechado na linha', /red/.test(bordaF) || !!aviso, `${bordaF.slice(0, 60)} | ${aviso}`);
    await pf.getByTestId('enviar-orcamento').click(); await sleep(1500);
    ok('C5: enviar a revisao com o sabado -> erro-dia-fechado', await visivel(pf, 'erro-dia-fechado'));
    await pf.screenshot({ path: path.join(OUT, 'C5_revisao_sabado_390.png'), fullPage: true });
    await pf.close();
    // D3 - decidido pelo dono 15/11: SEM mudanca no aceite (producao, so leitura: nenhum orcamento aberto com horario
    // futuro num dia fechado; horarios novos sao barrados pela tela + trigger 083). So registra o comportamento.
    const ac5 = await aceitarApi(cli, o5.id, (await slotsDe(o5.id))[0].id);
    ok('C5: INFO D3 (decidido: sem mudanca) - aceite de orcamento ANTIGO num sabado fechado', true, `aceite respondeu ${ac5.status}`);
    console.log(`info [C] D3: aceite do sabado antigo respondeu ${ac5.status} (decisao do dono: sem mudanca)`);
    if (ca) await ca.close();
    await cc.close(); await cw.close();
    salvar();
  }
} catch (e) {
  falhas++;
  R.checks.push({ fase: FASE, nome: 'excecao', ok: false, det: String(e?.stack || e).slice(0, 1500) });
  console.log('FALHA excecao:', e?.stack || e);
} finally {
  salvar();
  await browser.close().catch(() => {});
  if (process.env.MANTER !== '1') {
    for (const s of sols) {
      const { data: os } = await sb.from('orcamentos').select('id').eq('solicitacao_id', s);
      await sb.from('orcamento_pedido_datas').delete().eq('solicitacao_id', s);
      await sb.from('orcamento_revisoes').delete().eq('solicitacao_id', s);
      const { data: ags } = await sb.from('agenda').select('id').eq('solicitacao_id', s);
      for (const a of ags || []) { await sb.from('agenda_historico').delete().eq('agenda_id', a.id); await sb.from('manutencao_etapas').delete().eq('agenda_id', a.id); }
      await sb.from('agenda').delete().eq('solicitacao_id', s);
      for (const o of os || []) { await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await sb.from('orcamento_itens').delete().eq('orcamento_id', o.id); }
      await sb.from('mensagens').delete().eq('solicitacao_id', s);
      await sb.from('orcamentos').delete().eq('solicitacao_id', s); await sb.from('pedido_vistos').delete().eq('solicitacao_id', s);
      const { error } = await sb.from('solicitacoes').delete().eq('id', s);
      if (error) console.log('limpeza: pedido', s, error.message);
    }
    for (const o of oficinas) { await sb.from('comissao_config').delete().eq('oficina_id', o); await sb.from('oficinas').delete().eq('id', o); }
    for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id).catch(() => {}); }
  }
  console.log(`\n${oks} ok, ${falhas} falha(s), ${nAud} auditorias, ${R.achados.length} achados`);
  process.exit(falhas ? 1 : 0);
}
