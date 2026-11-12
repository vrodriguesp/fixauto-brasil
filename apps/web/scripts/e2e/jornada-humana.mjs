// Jornada HUMANA completa no site LOCAL (dono 08/11): cliente e oficina como pessoas -
// rolando a pagina com a roda/dedo, tocando nos botoes (nada de clique "por baixo" de
// outra coisa) e digitando tecla por tecla. Em cada tela: chave sem traducao, rolagem
// lateral, elemento fora da tela, caixa vazando da borda, texto cortado, textos se
// encostando, menu/botao cobrindo o campo em que se digita, tela nova que nao abre no
// alto, erro de JS. Foto de cada tela em resultados/jornada-humana/<idioma>-<largura>/.
//   node jornada-humana.mjs <.env.local> <idioma> <largura> [altura]   (ex.: et 390, ru 360 640, ru 1280)
// 12/11 (Clarity: cliente real nao achou o campo do ano, escondido atras da barra Tagasi/Edasi): o
// aviso de cookies aparece e a pessoa toca para recusar; o carro e escolhido pela lista da setinha e
// escrevendo; depois de cada escolha o PROXIMO campo tem de estar na tela sem rolar; a area livre
// desconta tudo o que e fixo/preso no pe da tela; cada tela tambem vai em foto do que a pessoa ve.
// Atalho de preparo (banco): o carro "chega hoje" (data do agendamento movida para agora)
// para a oficina registrar a chegada na tela "Hoje" - o resto e tudo pela tela.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/site/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = req('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado');
const L = process.argv[3] || 'et';
const W = Number(process.argv[4] || 390);
const CEL = W < 500;
const H = Number(process.argv[5] || (CEL ? 844 : 900));
const SITE = process.env.SITE || 'http://localhost:3100';
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/jornada-humana/${L}-${W}x${H}`;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const EMAILS = env.EMAIL_PASTA_TESTE;
const PRE = { pt: '/br/pt', 'pt-PT': '/pt/pt', en: '/ee/en', et: '/ee/et', it: '/it/it', ru: '/ee/ru' }[L];
const SLUG_PEDIDO = { pt: '/pedido', 'pt-PT': '/pedido', en: '/request', et: '/paring', it: '/richiesta', ru: '/zayavka' }[L];
const LOCALE = { pt: 'pt-BR', 'pt-PT': 'pt-PT', en: 'en-GB', et: 'et-EE', it: 'it-IT', ru: 'ru-RU' }[L];
const WEBMSG = `${RAIZ}/site/apps/web/messages`;
const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${L}.json`, 'utf8'));
for (const a of ['cliente', 'oficina', 'misc', 'auth']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${L}.${a}.json`, 'utf8')));
const T = (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const semear = fs.readFileSync(`${RAIZ}/ferramentas/semear.mjs`, 'utf8');
const OFI_EMAIL = 'meister.teste@bipfix.test';
const OFI_SENHA = (semear.match(/conta\('meister\.teste@bipfix\.test', '([^']+)'/) || [])[1];
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Hum' + crypto.randomBytes(5).toString('hex') + '7';
const emailC = `hum-${L.toLowerCase()}-${W}-${tag}@example.test`;
const placa = `HU${tag.slice(0, 4).toUpperCase()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0, passos = 0;
const achados = [];
const ok = (n, c, x = '') => { passos++; if (!c) { falhas++; achados.push(`${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); } console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const emailsDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort().map((f) => fs.readFileSync(path.join(EMAILS, f), 'utf8'));
const codigoDe = async (email, depois) => { for (let i = 0; i < 60; i++) { const h = emailsDe(email, depois).at(-1); const m = h?.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').match(/(?<![\d#])\d{6}(?!\d)/); if (m) return m[0]; await sleep(300); } return null; };
const ip = () => `10.88.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
const FOTO = `${RAIZ}/site/apps/web/public/apple-touch-icon.png`;

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const contexto = async ({ comCookies = false } = {}) => {
  const c = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: CEL ? 2 : 1, isMobile: CEL, hasTouch: CEL, locale: LOCALE,
    ...(CEL ? { userAgent: UA_IPHONE } : {}), geolocation: { latitude: 59.437, longitude: 24.745 }, permissions: ['geolocation'], extraHTTPHeaders: { 'x-real-ip': ip() } });
  // o cliente ve o aviso de cookies como qualquer visitante novo; a oficina ja respondeu antes
  if (!comCookies) await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const errosJs = [];
const pagina = async (ctx, quem) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errosJs.push(`${quem}: ${e.message}`)); return p; };

// ---------- gestos de pessoa ----------
// rola com a roda/dedo ate o elemento estar inteiro na area livre (sem barra fixa por cima)
async function ver(p, loc) {
  await loc.first().waitFor({ state: 'visible', timeout: 15000 });
  for (let i = 0; i < 40; i++) {
    const b = await loc.first().boundingBox();
    if (!b) { await sleep(150); continue; }
    const { topoLivre, baseLivre } = await areaLivre(p, loc);
    if (b.y >= topoLivre && b.y + Math.min(b.height, 60) <= baseLivre) return b;
    const dy = b.y < topoLivre ? Math.max(-500, b.y - topoLivre - 40) : Math.min(500, b.y + Math.min(b.height, 60) - baseLivre + 60);
    await p.mouse.wheel(0, dy); await sleep(120);
  }
  return loc.first().boundingBox();
}
// area da tela que a pessoa ve livre: abaixo do menu de cima e acima de tudo o que fica fixo/preso
// no pe da tela (barra Tagasi/Edasi, aviso de cookies, menu de baixo) - menos o proprio elemento
async function areaLivre(p, loc) {
  return loc.first().evaluate((alvo) => {
    let topo = 0, base = innerHeight;
    for (const f of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(f);
      if (!/fixed|sticky/.test(cs.position) || cs.display === 'none' || cs.visibility === 'hidden' || f.contains(alvo) || alvo.contains(f)) continue;
      const q = f.getBoundingClientRect(); if (q.width < innerWidth / 2 || q.height < 10 || q.bottom <= 0 || q.top >= innerHeight) continue;
      if (q.top <= 5) topo = Math.max(topo, q.bottom); else if (q.bottom >= innerHeight - 5 || q.top > innerHeight / 2) base = Math.min(base, q.top);
    }
    return { topoLivre: topo + 4, baseLivre: base - 4 };
  });
}
// o campo esta na tela, sem a pessoa rolar? (ela nao sabe que existe algo mais abaixo)
async function naTela(p, loc, nome) {
  await loc.first().waitFor({ state: 'visible', timeout: 15000 }); await sleep(900); // rolagem suave do site
  const b = await loc.first().boundingBox(); const { topoLivre, baseLivre } = await areaLivre(p, loc);
  const vis = !!b && b.y >= topoLivre - 2 && b.y + Math.min(b.height, 44) <= baseLivre + 2;
  ok(`"${nome}" aparece na tela sem rolar (nada por cima)`, vis && !(await coberto(p, loc)), b ? `campo y=${Math.round(b.y)}-${Math.round(b.y + b.height)}, area livre ${Math.round(topoLivre)}-${Math.round(baseLivre)}` : 'sem caixa');
  await p.screenshot({ path: `${OUT}/${String(++nTela).padStart(2, '0')}-ve-${nome.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}.png` }).catch(() => {});
}
// o ponto do toque cai no proprio elemento? (nada cobrindo: menu, botao do chat, aviso)
async function coberto(p, loc) {
  return loc.first().evaluate((el) => {
    const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 20);
    const hit = document.elementFromPoint(x, y);
    if (!hit || el === hit || el.contains(hit) || hit.contains(el)) return null;
    const lab = el.closest('label'); if (lab && (lab === hit || lab.contains(hit))) return null;
    if (el.id && hit.closest(`label[for="${el.id}"]`)) return null;
    return `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 50)}`;
  });
}
async function tocar(p, loc, nome) {
  await ver(p, loc);
  const c = await coberto(p, loc);
  ok(`toque "${nome}": nada por cima do botao`, !c, c || '');
  if (CEL) await loc.first().tap(); else await loc.first().click();
  await sleep(350);
}
async function digitar(p, loc, texto, nome, { limpar = true } = {}) {
  await tocar(p, loc, nome);
  const foco = await loc.first().evaluate((el) => el === document.activeElement);
  ok(`campo "${nome}": recebe o foco no 1o toque`, foco);
  if (limpar) { await p.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A'); await p.keyboard.press('Backspace'); }
  await p.keyboard.type(texto, { delay: 18 });
  const v = await loc.first().inputValue().catch(() => null);
  ok(`campo "${nome}": guardou exatamente o que foi digitado`, v === null || v === texto || v.replace(/\s/g, '') === texto.replace(/\s/g, ''), `${v} vs ${texto}`);
  // digitando: nada fixo (menu de baixo, botao do chat) por cima do campo
  const tampa = await loc.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (const f of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(f); if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || f.contains(el) || el.contains(f)) continue;
      const q = f.getBoundingClientRect(); if (!q.width || !q.height) continue;
      if (q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top) return `${f.tagName.toLowerCase()}.${String(f.className).slice(0, 50)}`;
    }
    return null;
  });
  ok(`campo "${nome}": nada fixo por cima enquanto digita`, !tampa, tampa || '');
  if (CEL) { const barra = await p.evaluate(() => { const b = document.querySelector('.barra-inferior'); return b ? getComputedStyle(b).display : 'none'; }); ok(`campo "${nome}": menu de baixo escondido enquanto digita`, barra === 'none', barra); }
}
async function escolher(p, loc, valor, nome) { await ver(p, loc); await loc.first().selectOption(valor); ok(`lista "${nome}" escolhida`, true); await sleep(250); }

// ---------- conferencia visual de cada tela ----------
let nTela = 0;
async function tela(p, nome, { topo = false } = {}) {
  await p.waitForLoadState('networkidle').catch(() => {}); await sleep(900);
  nTela++;
  if (topo) { const y = await p.evaluate(() => scrollY); ok(`[${nome}] abre no alto`, y < 10, `rolagem ${y}`); }
  const r = await p.evaluate(() => {
    const out = { crua: null, sw: document.documentElement.scrollWidth - innerWidth, fora: [], vaza: [], cortado: [], encosta: [] };
    const txt = document.body.innerText;
    const m = txt.match(/\b(pedidoSemConta|cliente[A-Z]\w+|oficina[A-Z]\w+|constants|erros|common|agendaMudanca|resumoAgenda)\.[a-zA-Z_]+|\?\?[a-zA-Z]+\.[a-zA-Z.]+/); out.crua = m?.[0] || null;
    const vis = (e) => { const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return e.offsetParent !== null && cs.visibility !== 'hidden' && cs.opacity !== '0' && !e.closest('[aria-hidden=true], .sr-only') && b.width > 2 && b.height > 2; };
    const nome = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} "${(e.innerText || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 28)}"`;
    for (const e of document.querySelectorAll('main button, main a, main input, main select, main textarea')) {
      if (!vis(e)) continue; const b = e.getBoundingClientRect();
      // dentro de faixa que rola para o lado (de proposito) nao conta
      let rola = false; for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { if (/auto|scroll/.test(getComputedStyle(a).overflowX)) { rola = true; break; } }
      if (!rola && b.width && (b.left < -1 || b.right > innerWidth + 1)) out.fora.push(nome(e));
    }
    for (const el of document.querySelectorAll('main *')) {
      if (!vis(el)) continue;
      const pai = el.parentElement; if (!pai) continue;
      const e = el.getBoundingClientRect(), q = pai.getBoundingClientRect();
      if (e.width && q.width && (e.right > q.right + 2 || e.left < q.left - 2)) {
        const cs = getComputedStyle(pai);
        if (cs.overflowX === 'visible' && (cs.borderRightWidth !== '0px' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)') && getComputedStyle(el).position !== 'absolute') out.vaza.push(`${nome(el)} sai ${Math.round(Math.max(e.right - q.right, q.left - e.left))}px`);
      }
      const cs2 = getComputedStyle(el);
      if (el.children.length === 0 && (el.innerText || '').trim() && el.scrollWidth > el.clientWidth + 2 && /hidden|clip/.test(cs2.overflowX) && cs2.textOverflow !== 'ellipsis' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) out.cortado.push(nome(el));
    }
    // textos que se encostam/sobrepoem (ex.: rotulos da linha do tempo em russo)
    const folhas = [...document.querySelectorAll('main span, main p, main label, main h1, main h2, main h3, main dt, main dd, main td, main th, main a, main button')]
      .filter((e) => vis(e) && getComputedStyle(e).display !== 'inline' && (e.innerText || '').trim() && ![...e.children].some((c) => (c.innerText || '').trim())).slice(0, 400)
      .map((e) => ({ e, r: e.getBoundingClientRect() })).filter((x) => x.r.width > 0);
    for (let i = 0; i < folhas.length; i++) for (let j = i + 1; j < folhas.length; j++) {
      const a = folhas[i], b = folhas[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      // folha/janela por cima da pagina: so compara textos da mesma camada
      const camada = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { if (/fixed|sticky/.test(getComputedStyle(x).position)) return x; } return null; };
      if (camada(a.e) !== camada(b.e)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 3 && h > 3) out.encosta.push(`${nome(a.e)} x ${nome(b.e)}`);
    }
    out.fora = out.fora.slice(0, 5); out.vaza = out.vaza.slice(0, 5); out.cortado = out.cortado.slice(0, 5); out.encosta = out.encosta.slice(0, 5);
    return out;
  });
  ok(`[${nome}] sem chave sem traducao`, !r.crua, r.crua || '');
  ok(`[${nome}] sem rolagem lateral`, r.sw <= 1, `${r.sw}px`);
  ok(`[${nome}] nada fora da tela`, !r.fora.length, r.fora.join(' | '));
  ok(`[${nome}] nada vazando da borda da caixa`, !r.vaza.length, r.vaza.join(' | '));
  ok(`[${nome}] nenhum texto cortado`, !r.cortado.length, r.cortado.join(' | '));
  ok(`[${nome}] nenhum texto por cima de outro`, !r.encosta.length, r.encosta.join(' | '));
  await p.screenshot({ path: `${OUT}/${String(nTela).padStart(2, '0')}-${nome.replace(/[^a-z0-9]+/gi, '_').slice(0, 50)}.png`, fullPage: true }).catch(() => {});
  // o que a pessoa ve de fato (sem rolar)
  await p.screenshot({ path: `${OUT}/${String(nTela).padStart(2, '0')}-${nome.replace(/[^a-z0-9]+/gi, '_').slice(0, 50)}-tela.png` }).catch(() => {});
}
const botao = (p, re) => p.getByRole('button', { name: re }).locator('visible=true');
const rx = (s) => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(/\s*\{[^}]*\}\s*/)[0].trim(), 'i');

const contas = new Set(), sols = new Set();
let sol = null;
try {
  const { data: ofp } = await admin.from('profiles').select('id').eq('email', OFI_EMAIL).single();
  const { data: of } = await admin.from('oficinas').select('id, profile_id, nome_fantasia').eq('profile_id', ofp.id).single();

  // ================= 1) CLIENTE: pedido sem conta, como pessoa =================
  const ctxC = await contexto({ comCookies: true }); const pC = await pagina(ctxC, 'cliente');
  await pC.goto(`${SITE}${PRE}`, { waitUntil: 'networkidle' });
  await tela(pC, 'inicio com aviso de cookies');
  const aviso = pC.getByTestId('aviso-cookies');
  ok('aviso de cookies aparece para quem chega', await aviso.isVisible().catch(() => false));
  if (await aviso.isVisible().catch(() => false)) {
    const ab = await aviso.boundingBox(); console.log(`     aviso de cookies: ${Math.round(ab.height)}px = ${Math.round(ab.height / H * 100)}% da tela`);
    await tocar(pC, aviso.getByRole('button').first(), 'recusar cookies');
    ok('aviso de cookies some depois da escolha', !(await aviso.isVisible().catch(() => false)));
  }
  await tocar(pC, pC.locator(`main a[href$="${SLUG_PEDIDO}"]`), 'pedir orcamentos (inicio)');
  await pC.waitForURL(new RegExp(SLUG_PEDIDO), { timeout: 15000 });
  await tela(pC, 'pedido 1 tipos');
  await tocar(pC, botao(pC, rx(T('constants.tiposServico.mecanica'))), 'tipo mecanica');
  await pC.getByTestId('passo-detalhe').waitFor();
  await tela(pC, 'pedido 2 detalhe', { topo: true });
  await digitar(pC, pC.locator('#pedido-descricao'), `Pidurid kriuksuvad ${tag}`, 'descricao');
  { const [fc] = await Promise.all([pC.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null), tocar(pC, pC.locator('[data-testid=passo-detalhe] button, [data-testid=passo-detalhe] label').filter({ hasText: /📷|foto|photo|фото|kaamera|camera|fotocamera/i }).first(), 'foto')]);
    ok('foto: 1 toque abre a escolha de arquivo', !!fc); if (fc) { await fc.setFiles(FOTO); await sleep(1500); } }
  await tocar(pC, botao(pC, new RegExp(`^${T('clienteNovaSolicitacao.next')}$`, 'i')).last(), 'avancar (detalhe)');
  await tela(pC, 'pedido 3 carro', { topo: true });
  if (await pC.getByTestId('cbbe3-101-abrir').count()) {
    // dono 12/11: marca, modelo, ano e placa a vista desde o inicio; modelo parado ate a marca
    ok('carro: os 4 campos aparecem desde o inicio', (await Promise.all(['#cbbe3-101', '#cbbe3-102', '#cbbe3-103', '#pedido-placa'].map((s) => pC.locator(s).isVisible()))).every(Boolean));
    ok('carro: modelo parado ate escolher a marca', await pC.locator('#cbbe3-102').isDisabled());
    // catalogo europeu: campo de escrever + setinha da lista (dono 12/11: as duas formas)
    await tocar(pC, pC.getByTestId('cbbe3-101-abrir'), 'setinha da lista de marcas');
    const lista = pC.getByTestId('cbbe3-101-lista');
    ok('setinha: a lista de marcas abre', await lista.isVisible().catch(() => false));
    ok('setinha: o teclado nao abre (campo sem foco)', await pC.evaluate(() => document.activeElement?.id !== 'cbbe3-101'));
    await tela(pC, 'carro lista de marcas aberta');
    const toyota = lista.getByRole('option', { name: 'Toyota', exact: true });
    await toyota.scrollIntoViewIfNeeded(); await sleep(300); // dedo rolando a lista
    await tocar(pC, toyota, 'Toyota na lista');
    ok('marca escolhida pela lista', (await pC.locator('#cbbe3-101').inputValue()) === 'Toyota');
    // modelo: o campo ja vem com o foco e a lista aberta; a pessoa escreve e toca
    await naTela(pC, pC.locator('#cbbe3-102'), 'campo do modelo depois da marca');
    await pC.keyboard.type('coro', { delay: 60 }); await sleep(500);
    const corolla = pC.getByTestId('cbbe3-102-lista').getByRole('option', { name: 'Corolla', exact: true });
    ok('modelo: escrever "coro" mostra Corolla', await corolla.isVisible().catch(() => false));
    await tela(pC, 'carro modelo escrevendo');
    await tocar(pC, corolla, 'Corolla na lista filtrada');
    await naTela(pC, pC.locator('#cbbe3-103'), 'campo do ano depois do modelo');
    await digitar(pC, pC.locator('#cbbe3-103'), '2017', 'ano');
  } else {
    const marca = pC.locator('[data-testid=passo-carro] select').first();
    await pC.waitForFunction((el) => el.options.length > 2, await marca.elementHandle(), { timeout: 60000 });
    await escolher(pC, marca, { label: 'Toyota' }, 'marca');
    const mod = pC.locator('[data-testid=passo-carro] select').nth(1);
    await pC.waitForFunction((el) => el.options.length > 2, await mod.elementHandle(), { timeout: 60000 });
    const opc = await mod.locator('option').allTextContents();
    await escolher(pC, mod, { label: opc.find((o) => /Corolla/.test(o)) || opc[1] }, 'modelo');
    const ano = pC.getByLabel(T('veiculoForm.labelAno'), { exact: false }).locator('visible=true').first();
    if (await ano.count()) { if ((await ano.evaluate((e) => e.tagName)) === 'SELECT') await escolher(pC, ano, '2017', 'ano'); else await digitar(pC, ano, '2017', 'ano'); }
  }
  await digitar(pC, pC.locator('#pedido-placa'), placa, 'placa');
  await tocar(pC, botao(pC, new RegExp(`^${T('clienteNovaSolicitacao.next')}$`, 'i')).last(), 'avancar (carro)');
  await tela(pC, 'pedido 4 local', { topo: true });
  await digitar(pC, pC.locator('#pedido-endereco'), 'Kesklinn', 'endereco');
  await sleep(2500);
  const sug = pC.getByRole('option').first();
  ok('endereco: sugestoes aparecem', await sug.isVisible().catch(() => false));
  if (await sug.isVisible().catch(() => false)) await tocar(pC, sug, 'sugestao de endereco');
  await tocar(pC, botao(pC, new RegExp(`^${T('clienteNovaSolicitacao.next')}$`, 'i')).last(), 'avancar (local)');
  await pC.getByTestId('passo-contato').waitFor();
  await tela(pC, 'pedido 5 contato', { topo: true });
  // voltar sem perder nada (dono 12/11): botao voltar do celular 2x, o Tagasi da tela 1x, e para frente de novo
  await pC.goBack(); await sleep(900);
  ok('voltar do celular: volta ao passo do local (nao sai do pedido)', await pC.getByTestId('passo-local').isVisible().catch(() => false) && /zayavka|paring|request|pedido|richiesta/.test(pC.url()), pC.url());
  ok('voltar do celular: endereco continua preenchido', (await pC.locator('#pedido-endereco').inputValue().catch(() => '')).length > 2);
  await pC.goBack(); await sleep(900);
  ok('voltar do celular 2x: passo do carro com tudo escolhido', await pC.getByTestId('passo-carro').isVisible().catch(() => false)
    && /Toyota/.test(await pC.locator('#cbbe3-101').inputValue().catch(() => '')) && /Corolla/.test(await pC.locator('#cbbe3-102').inputValue().catch(() => ''))
    && (await pC.locator('#pedido-placa').inputValue()) === placa);
  await tela(pC, 'voltou ao carro');
  await tocar(pC, pC.locator('[data-testid=passo-carro] [data-testid=navegar] .btn-secondary'), 'Tagasi da tela (carro)');
  ok('Tagasi: descricao continua escrita', (await pC.locator('#pedido-descricao').inputValue()).includes(tag));
  for (let i = 0; i < 3; i++) { await tocar(pC, botao(pC, new RegExp(`^${T('clienteNovaSolicitacao.next')}$`, 'i')).last(), `avancar de novo ${i + 1}`); await sleep(400); }
  ok('para frente de novo: contato', await pC.getByTestId('passo-contato').isVisible().catch(() => false));
  await digitar(pC, pC.locator('#pedido-nome'), 'Humano Teste', 'nome');
  await digitar(pC, pC.locator('#pedido-email'), emailC, 'e-mail');
  await digitar(pC, pC.locator('#pedido-telefone'), '51234567', 'telefone');
  await tocar(pC, pC.getByTestId('aceito-termos'), 'aceito os termos');
  const t0 = Date.now();
  await tocar(pC, botao(pC, rx(T('pedidoSemConta.enviarPedido'))).last(), 'enviar pedido');
  await pC.getByTestId('passo-codigo').waitFor({ timeout: 30000 });
  await tela(pC, 'pedido 6 codigo', { topo: true });
  const cod = await codigoDe(emailC, t0);
  ok('codigo chegou por e-mail', !!cod);
  await digitar(pC, pC.locator('#pedido-codigo'), cod || '000000', 'codigo');
  await tocar(pC, pC.getByTestId('confirmar-codigo'), 'confirmar codigo');
  const telaSenha = await pC.getByTestId('criar-senha').waitFor({ timeout: 30000 }).then(() => true, () => false);
  ok('depois do codigo: tela "crie a sua senha"', telaSenha);
  if (telaSenha) {
    await sleep(1500); const ySenha = await pC.evaluate(() => scrollY);
    const bxSenha = await pC.getByTestId('criar-senha').boundingBox();
    ok('crie a sua senha: cartao na tela ao abrir', !!bxSenha && bxSenha.y < H / 2, `y do cartao ${Math.round(bxSenha?.y ?? -1)}, rolagem ${ySenha}`);
    await pC.screenshot({ path: `${OUT}/${String(++nTela).padStart(2, '0')}-senha-ao-abrir.png` });
    await tela(pC, 'crie a sua senha', { topo: true }); await tocar(pC, pC.getByTestId('criar-senha-agora-nao'), 'agora nao (senha)'); }
  await pC.waitForURL(/orcamentos\//, { timeout: 30000 }).catch(() => {});
  const cliente = (await admin.from('profiles').select('id').eq('email', emailC).maybeSingle()).data;
  if (cliente) contas.add(cliente.id);
  sol = (await admin.from('solicitacoes').select('id, numero').eq('cliente_id', cliente?.id).maybeSingle()).data;
  if (sol) sols.add(sol.id);
  ok('pedido criado e cliente logado no pedido', !!sol && pC.url().includes(sol.id), pC.url());
  await tela(pC, 'cliente pedido aberto', { topo: true });

  // ================= 2) OFICINA: entra, ve, orca, escreve =================
  const ctxO = await contexto(); const pO = await pagina(ctxO, 'oficina');
  await pO.goto(`${SITE}${PRE}/login`, { waitUntil: 'networkidle' });
  await tela(pO, 'login oficina');
  await digitar(pO, pO.locator('input[type=email]'), OFI_EMAIL, 'e-mail (login)');
  await digitar(pO, pO.locator('input[type=password]'), OFI_SENHA, 'senha (login)');
  await tocar(pO, pO.locator('main button[type=submit]'), 'entrar');
  await pO.waitForURL(/oficina/, { timeout: 20000 }).catch(() => {});
  await pO.goto(`${SITE}${PRE}/oficina/pedidos`, { waitUntil: 'networkidle' });
  await tela(pO, 'oficina pedidos');
  const cartao = pO.locator('main a').filter({ hasText: String(sol?.numero) }).first();
  ok('oficina ve o pedido novo na lista', (await cartao.count()) > 0);
  await tocar(pO, cartao, 'abrir pedido (oficina)');
  await tela(pO, 'oficina pedido detalhe', { topo: true });
  await pO.goto(`${SITE}${PRE}/oficina/enviar-orcamento/${sol.id}`, { waitUntil: 'networkidle' }); await sleep(2000);
  await tela(pO, 'oficina enviar orcamento');
  await digitar(pO, pO.locator(`input[placeholder="${T('oficinaEnviarOrcamento.placeholderDescricaoItem')}"]`).first(), 'Piduriklotsid ja töö', 'item do orcamento');
  await digitar(pO, pO.getByLabel(T('oficinaEnviarOrcamento.placeholderValor'), { exact: true }).locator('visible=true').first(), '139', 'valor');
  // horario de chegada: o campo de data do cartao de horarios (o 1o e a validade do orcamento)
  const dataOrc = pO.locator('input[type=date]').last();
  await ver(pO, dataOrc); await dataOrc.fill(new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10)); await sleep(500);
  await tocar(pO, pO.locator('button[type=submit]').locator('visible=true').last(), 'enviar orcamento');
  await sleep(3500);
  const orc = (await admin.from('orcamentos').select('id, status').eq('solicitacao_id', sol.id).eq('oficina_id', of.id).maybeSingle()).data;
  ok('orcamento enviado pela tela', !!orc);
  await tela(pO, 'oficina orcamento enviado');
  await pO.goto(`${SITE}${PRE}/oficina/mensagens/${sol.id}`, { waitUntil: 'networkidle' }); await sleep(2000);
  await tela(pO, 'oficina conversa');
  const campoO = pO.locator('main textarea, main input[type=text]').last();
  await digitar(pO, campoO, `Tere! Kas homme sobib? ${tag}`, 'mensagem (oficina)');
  await pO.keyboard.press('Enter'); await sleep(2500);
  ok('oficina: mensagem enviada com Enter', (await pO.innerText('main')).includes(`sobib? ${tag}`));

  // ================= 3) CLIENTE: aviso, orcamento, conversa, aceite =================
  await pC.goto(`${SITE}${PRE}/cliente/dashboard`, { waitUntil: 'networkidle' });
  await tela(pC, 'cliente inicio com orcamento');
  await pC.goto(`${SITE}${PRE}/cliente/mensagens/${sol.id}?oficina=${of.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  await tela(pC, 'cliente conversa');
  ok('cliente ve a mensagem da oficina', (await pC.innerText('main')).includes(`sobib? ${tag}`));
  const campoC = pC.locator('main textarea, main input[type=text]').last();
  await digitar(pC, campoC, `Sobib, tulen kell 9 ${tag}`, 'mensagem (cliente)');
  const enviarMsg = pC.locator('main button[type=submit], main button').filter({ hasText: rx(T('clienteMensagens.enviar') || 'Send') }).last();
  if (await enviarMsg.count()) await tocar(pC, enviarMsg, 'enviar mensagem (cliente)'); else await pC.keyboard.press('Enter');
  await sleep(2500);
  ok('cliente: mensagem enviada', (await pC.innerText('main')).includes(`kell 9 ${tag}`));
  if (CEL) { await campoC.blur().catch(() => {}); await sleep(400); const y = await pC.evaluate(() => scrollY); ok('conversa: depois de sair do campo a pagina volta ao lugar', y < 10, y); }
  await pC.goto(`${SITE}${PRE}/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  await tela(pC, 'cliente orcamento recebido');
  await tocar(pC, botao(pC, rx(T('clienteOrcamentoDetalhe.acceptAndSchedule'))).last(), 'aceitar e agendar');
  await tocar(pC, pC.locator('button').filter({ hasText: /\d{2}:\d{2} - \d{2}:\d{2}/ }).locator('visible=true').first(), 'escolher horario');
  await tela(pC, 'cliente escolha do horario');
  await tocar(pC, botao(pC, rx(T('clienteOrcamentoDetalhe.confirmAppointment'))).last(), 'confirmar agendamento');
  await sleep(3500);
  ok('orcamento aceito', (await admin.from('orcamentos').select('status').eq('id', orc?.id).single()).data?.status === 'aceito');
  await tela(pC, 'cliente aceito');

  // ================= 4) OFICINA: ve o aceite; propoe nova data =================
  await pO.goto(`${SITE}${PRE}/oficina/pedidos?aba=respondidos`, { waitUntil: 'networkidle' }); await sleep(2500);
  await tela(pO, 'oficina respondidos');
  await pO.goto(`${SITE}${PRE}/oficina/pedidos/${sol.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  ok('pedido da oficina: resumo do aceite', (await pO.getByTestId('resumo-agendamento').count()) === 1);
  await tela(pO, 'oficina pedido aceito (resumo)');
  await pO.goto(`${SITE}${PRE}/oficina/orcamento/${sol.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  await tela(pO, 'oficina orcamento aceito (mudar)');
  await tocar(pO, pO.getByTestId('opcao-mudar-data'), 'quero mudar a data');
  const nd = new Date(Date.now() + 4 * 86400e3).toISOString().slice(0, 10);
  await ver(pO, pO.locator('#nd-data')); await pO.locator('#nd-data').fill(nd);
  await escolher(pO, pO.locator('#nd-turno'), 'tarde', 'turno');
  await digitar(pO, pO.locator('#nd-motivo'), 'Varuosa saabub alles neljapäeval', 'motivo da nova data');
  // 079: a oficina diz se a data marcada ainda serve (obrigatorio) - aqui nao serve mais
  await tocar(pO, pO.getByTestId('propor-nova-data').getByRole('radio', { name: rx(T('agendaMudanca.naoServe')) }), 'data atual nao serve mais');
  await tocar(pO, pO.getByTestId('propor-nova-data').getByRole('button', { name: rx(T('agendaMudanca.enviarProposta')) }), 'enviar proposta de data');
  await sleep(2500);
  await tela(pO, 'oficina proposta enviada');
  await pC.goto(`${SITE}${PRE}/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  ok('cliente ve a proposta de nova data', (await pC.getByTestId('proposta-nova-data').count()) === 1);
  await tela(pC, 'cliente proposta de data');
  await tocar(pC, botao(pC, rx(T('agendaMudanca.aceitarData'))).last(), 'aceitar nova data');
  await sleep(3000);
  await pC.reload({ waitUntil: 'networkidle' }); await sleep(2500);
  ok('cliente: data atual e a nova (13:00)', /13[:.]00/.test(await pC.getByTestId('agendamento-atual').innerText().catch(() => '')));
  await tela(pC, 'cliente nova data aceita');
  await pO.goto(`${SITE}${PRE}/oficina/pedidos/${sol.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  ok('oficina: resumo com a nova data e o aceite do cliente', /13[:.]00/.test(await pO.getByTestId('resumo-chegada').innerText().catch(() => '')) && (await pO.getByTestId('resumo-mudanca').count()) === 1);

  // ================= 5) OFICINA: chegada, etapas, pronto, entrega (tela Hoje) =================
  const { data: ag } = await admin.from('agenda').select('id').eq('solicitacao_id', sol.id).eq('oficina_id', of.id).eq('status', 'agendado').single();
  await admin.from('agenda').update({ data_inicio: new Date(Date.now() - 20 * 60e3).toISOString(), data_fim: new Date(Date.now() + 4 * 3600e3).toISOString(), data_fim_prevista: new Date(Date.now() + 4 * 3600e3).toISOString() }).eq('id', ag.id); // preparo: o carro chega hoje
  await pO.goto(`${SITE}${PRE}/oficina/hoje`, { waitUntil: 'networkidle' }); await sleep(3000);
  await tela(pO, 'oficina hoje');
  const meu = () => pO.getByTestId('hoje-cartao').filter({ hasText: placa }).first();
  await tocar(pO, meu().getByTestId('btn-chegou'), 'carro chegou');
  await tela(pO, 'oficina folha chegou');
  await sleep(1200); if (await pO.getByTestId('confirmar-chegou').isVisible().catch(() => false)) await tocar(pO, pO.getByTestId('confirmar-chegou'), 'confirmar chegada'); await sleep(2500);
  await tocar(pO, meu().getByTestId('btn-etapa'), 'registrar etapa');
  await tela(pO, 'oficina folha etapa');
  const etapa = pO.locator('[data-testid^="etapa-"]').filter({ hasNot: pO.locator('[disabled]') }).locator('visible=true');
  await tocar(pO, pO.getByTestId('etapa-diagnostico').locator('visible=true').first().or(etapa.first()), 'etapa diagnostico'); await sleep(2500);
  await tocar(pO, meu().getByTestId('btn-etapa'), 'registrar etapa 2');
  const pronto = pO.getByTestId('etapa-concluido').locator('visible=true');
  await tocar(pO, (await pronto.count()) ? pronto.first() : pO.getByTestId('confirmar-pronto'), 'carro pronto'); await sleep(1500);
  if (await pO.getByTestId('confirmar-pronto').isVisible().catch(() => false)) { await tocar(pO, pO.getByTestId('confirmar-pronto'), 'confirmar pronto'); await sleep(2500); }
  await pO.reload({ waitUntil: 'networkidle' }); await sleep(2500);
  await tocar(pO, meu().getByTestId('btn-entregar'), 'entregar');
  await tela(pO, 'oficina folha entrega');
  await tocar(pO, pO.getByTestId('confirmar-entrega'), 'confirmar entrega'); await sleep(3000);
  const agFim = (await admin.from('agenda').select('status, checkin_em, entregue_em').eq('id', ag.id).single()).data;
  ok('chegada e entrega gravadas pela tela', !!agFim?.checkin_em && !!agFim?.entregue_em, JSON.stringify(agFim));
  await tela(pO, 'oficina hoje depois da entrega');

  // ================= 6) CLIENTE: acompanhamento, avaliacao, suporte =================
  await pC.goto(`${SITE}${PRE}/cliente/acompanhamento/${sol.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  await tela(pC, 'cliente acompanhamento');
  await pC.goto(`${SITE}${PRE}/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' }); await sleep(2500);
  const cartaoAval = pC.locator('main .card').filter({ hasText: rx(T('clienteOrcamentoDetalhe.howWasService')) }).first();
  if (await cartaoAval.count()) {
    await tocar(pC, cartaoAval.getByRole('radio').nth(4).or(cartaoAval.locator('button[aria-label="5/5"]')).first(), '5 estrelas');
    await digitar(pC, cartaoAval.locator('textarea'), `Väga hea töö ${tag}`, 'comentario da avaliacao');
    await tocar(pC, cartaoAval.getByRole('button', { name: rx(T('clienteOrcamentoDetalhe.sendReview')) }), 'enviar avaliacao'); await sleep(3000);
    ok('avaliacao gravada', !!(await admin.from('avaliacoes').select('id').eq('solicitacao_id', sol.id).maybeSingle()).data);
  } else ok('cartao de avaliacao aparece no pedido entregue', false);
  await tela(pC, 'cliente avaliado');
  await pC.goto(`${SITE}${PRE}`, { waitUntil: 'networkidle' }); await sleep(1500);
  const chatBt = pC.getByTestId('chat-suporte-botao');
  if (await chatBt.count()) {
    await tocar(pC, chatBt, 'abrir chat de suporte');
    const cx = pC.locator('#suporte-texto, #suporte-pergunta').first();
    await digitar(pC, cx, `Küsimus ${tag}`, 'chat de suporte');
    await ver(pC, pC.getByTestId('chat-suporte-enviar')); const t1 = Date.now(); await tocar(pC, pC.getByTestId('chat-suporte-enviar'), 'enviar no suporte');
    await pC.waitForFunction(() => (document.getElementById('suporte-texto')?.value || '') === '', null, { timeout: 15000 }).catch(() => {});
    ok('suporte: mensagem sai em menos de 3 s', Date.now() - t1 < 3000, `${Date.now() - t1} ms`);
    const x = pC.getByTestId('chat-suporte-janela').getByRole('button').first();
    const bx = await x.boundingBox(); ok('suporte: X de fechar visivel', !!bx && bx.y >= 0);
    await tela(pC, 'suporte aberto');
    await tocar(pC, x, 'fechar suporte');
    ok('suporte fecha', (await pC.getByTestId('chat-suporte-janela').count()) === 0);
  }
  await pC.goto(`${SITE}${PRE}/cliente/perfil`, { waitUntil: 'networkidle' }); await sleep(2000);
  await tela(pC, 'cliente perfil');
  ok('sem erro de JavaScript', !errosJs.length, errosJs.slice(0, 5).join(' | '));
} catch (e) {
  falhas++; achados.push(`EXCECAO ${(e.message || '').split('\n')[0]}`);
  console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 5).join(' | '));
} finally {
  await browser.close();
  for (const id of sols) {
    const { data: o } = await admin.from('orcamentos').select('id').eq('solicitacao_id', id);
    for (const x of o || []) { for (const t of ['orcamento_disponibilidade', 'orcamento_itens', 'orcamento_revisoes']) await admin.from(t).delete().eq('orcamento_id', x.id); }
    const { data: ags } = await admin.from('agenda').select('id').eq('solicitacao_id', id);
    for (const a of ags || []) await admin.from('agenda_historico').delete().eq('agenda_id', a.id);
    for (const t of ['agenda', 'avaliacoes', 'manutencao_etapas', 'orcamentos', 'mensagens', 'solicitacao_fotos', 'analise_dano']) await admin.from(t).delete().eq('solicitacao_id', id);
    await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', id);
    await admin.from('solicitacoes').delete().eq('id', id);
  }
  for (const id of contas) {
    for (const [t, c] of [['notificacoes', 'profile_id'], ['veiculos', 'profile_id'], ['pedidos_pendentes', 'user_id']]) await admin.from(t).delete().eq(c, id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  fs.writeFileSync(`${OUT}/resumo.txt`, `${L} ${W}: ${passos - falhas}/${passos} ok\n${achados.join('\n')}\n`);
  console.log(`\n${L} ${W}: ${passos - falhas}/${passos} ok${falhas ? ` - ${falhas} FALHA(S)` : ' - TUDO OK'}`);
}
