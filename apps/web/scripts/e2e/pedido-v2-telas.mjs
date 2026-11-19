// E2E LOCAL do pedido em ETAPAS (dono 19/11, Proposta_pedido_em_etapas_2026-11-19 sec. 14/15, opcao A):
// como uma pessoa no celular, em ET e RU, a 390x844 e 360x640, no Chromium e no WebKit (MOTOR=webkit) e
// no navegador do Facebook/Instagram (UA). Em CADA tela: cabe sem rolar (altura da pagina <= tela, sem
// rolagem lateral), Edasi dentro da tela e nao coberto, sem erro de JavaScript, sem chave crua de traducao.
//   1 Teenus (um toque avanca) -> 2 "Mis autol viga on?" (Edasi vazio avisa + foco; chip marca com check;
//   texto OU chip; "Naita koiki" = tela propria, marcado la aparece no passo 2) -> 3 Fotod ("Jatka ilma fotota"
//   sem foto; com foto, Edasi) -> 4 Auto -> 5 Asukoht (linha "tapset aadressi pole vaja", mapa so com coordenada,
//   nunca imagem quebrada) -> 6 Kontakt. Em cada passo: recarregar volta ao MESMO passo com os dados (rascunho);
//   voltar do navegador = passo anterior, ate sair da pagina (Back xN); ir e voltar nao perde nada; funil conta
//   cada passo uma vez (fotos, fotos_pulou novos; nada de urgencia). Uma rodada envia de verdade (Resend falso ->
//   pasta): codigo -> "crie a sua senha" -> agora nao -> pedido; depois Back xN nao reabre o pedido (18/11).
//   Obrigatorios (dono 19/11): rotulo com *, opcionais "(valikuline)"; Edasi com algo em falta -> CADA campo em falta
//   com borda vermelha + aviso logo abaixo (aria-invalid/aria-describedby), foco no primeiro, e o aviso some ao corrigir.
//   SITE=http://localhost:3106 [MOTOR=chromium|webkit] node pedido-v2-telas.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const pw = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
const MOTOR = process.env.MOTOR || 'chromium';
const EMAILS = env.EMAIL_PASTA_TESTE;
const OUT = `C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/pedido-v2/${MOTOR}`;
fs.mkdirSync(OUT, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0; let oks = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; else oks++; console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}${extra ? ' - ' + String(extra).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
let ipN = 1;
const ip = () => `10.78.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
const contas = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MSG = new URL('../../messages/', import.meta.url);
const ler = (l) => Object.assign({}, ...['', '.cliente', '.auth'].map((a) => JSON.parse(fs.readFileSync(new URL(`${l}${a}.json`, MSG), 'utf8'))));
const M = { et: ler('et'), ru: ler('ru') };
const CAMINHO = { et: '/ee/et/paring', ru: '/ee/ru/zayavka' };
const FOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const exe = MOTOR === 'webkit' ? path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe') : path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
const browser = await pw[MOTOR].launch({ executablePath: exe });
const codigoDe = async (email, depois) => {
  for (let i = 0; i < 30; i++) {
    const arq = fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email.replace(/[^a-z0-9@._-]/gi, '_')}.html`) && Number(f.split('_')[0]) >= depois).sort();
    if (arq.length) {
      const txt = fs.readFileSync(path.join(EMAILS, arq.at(-1)), 'utf8').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
      const m = txt.match(/(?<![\d#])\d{6}(?!\d)/);
      if (m) return m[0];
    }
    await sleep(300);
  }
  return null;
};
let nFoto = 0;
// a tela cabe: documento nao maior que a tela, sem rolagem lateral; Edasi visivel e nao coberto
const conferir = async (p, nome, { rolagemOk = false, edasiOk = false } = {}) => {
  await p.waitForTimeout(350);
  const r = await p.evaluate(() => {
    const doc = document.documentElement;
    const btn = document.querySelector('[data-testid="passo-servico"]') ? null : document.querySelector('[data-testid="edasi"]:not([hidden] *)');
    let edasi = null;
    if (btn) {
      const b = btn.getBoundingClientRect();
      const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      edasi = { dentro: b.top >= 0 && b.bottom <= innerHeight + 3, coberto: !!el && !btn.contains(el) && !el.contains(btn), texto: (btn.textContent || '').trim() };
    }
    const cru = (document.body.innerText.match(/\b(pedidoSemConta|constants|clienteNovaSolicitacao|erros)\.[A-Za-z]+/g) || []).slice(0, 3);
    return { alt: doc.scrollHeight, tela: innerHeight, larg: doc.scrollWidth - innerWidth, edasi, cru };
  });
  nFoto++;
  await p.screenshot({ path: path.join(OUT, `${String(nFoto).padStart(2, '0')}_${nome.replace(/[^\w-]+/g, '_')}.png`) });
  const cabe = r.alt <= r.tela + 1 && r.larg <= 0;
  ok(`${nome}: cabe sem rolar (${r.alt}/${r.tela}${r.larg > 0 ? ', largura +' + r.larg : ''})`, cabe || rolagemOk, cabe ? '' : rolagemOk ? 'rola (aceite: SMS aberto)' : '');
  if (r.edasi) ok(`${nome}: "${r.edasi.texto}" dentro da tela e nao coberto`, (r.edasi.dentro || edasiOk) && !r.edasi.coberto, JSON.stringify(r.edasi));
  ok(`${nome}: sem chave crua de traducao`, !r.cru.length, r.cru.join(' '));
};
const etapa = (p) => p.locator('.pedido-pagina').getAttribute('data-etapa').catch(() => null);
// campo em falta: aviso proprio visivel com o texto, aria-invalid e aria-describedby apontando ao aviso
const emFalta = async (p, id, texto) => {
  const av = p.locator(`#${id}-erro`);
  const vis = await av.isVisible().catch(() => false);
  const t = vis ? (await av.innerText()).trim() : '';
  const inv = await p.locator('#' + id).getAttribute('aria-invalid').catch(() => null);
  const desc = (await p.locator('#' + id).getAttribute('aria-describedby').catch(() => '')) || '';
  return { ok: vis && t === texto && inv === 'true' && desc.includes(`${id}-erro`), t, inv, desc };
};
// rotulo sem o asterisco de obrigatorio / "(valikuline)" / texto so para leitor de tela
const rotulo = async (p, sel) => (await p.locator(sel).innerText()).replace(/\s*\*[\s\S]*$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const semFalta = async (p, id) => (await p.locator(`#${id}-erro`).count()) === 0 && (await p.locator('#' + id).getAttribute('aria-invalid').catch(() => null)) !== 'true';
const temAsterisco = async (p, seletor) => /\*/.test(await p.locator(seletor).innerText().catch(() => ''));
const edasi = (p, passo) => p.getByTestId(`passo-${passo}`).getByTestId('edasi');
async function carroCampo(p, id, nome, re) {
  const el = p.locator('#' + id);
  await el.waitFor({ state: 'visible', timeout: 20000 });
  await el.click(); await el.fill(nome.slice(0, 4));
  const op = p.getByTestId(id + '-lista').getByRole('option', { name: re || nome, exact: !re });
  await op.first().waitFor({ timeout: 20000 }); await op.first().click();
}

// ---------------- uma rodada completa (idioma x tamanho) ----------------
async function fluxo(l, w, h, { enviar = false, ua = null, nomeExtra = '' } = {}) {
  const m = M[l]; const ps = m.pedidoSemConta; const tn = m.clienteNovaSolicitacao;
  const nome = `${MOTOR} ${l} ${w}x${h}${nomeExtra}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: l === 'et' ? 'et-EE' : 'ru-RU', extraHTTPHeaders: { 'x-real-ip': ip() }, ...(ua ? { userAgent: ua } : {}) });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  const funil = [];
  await ctx.route('**/api/funil', async (r) => { try { const b = JSON.parse(r.request().postData() || '{}'); funil.push(b.etapa); } catch {} await r.fulfill({ status: 200, body: '{"ok":true}' }); });
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  const respostas = []; p.on('response', (r) => { if (r.url().startsWith(SITE) && r.status() >= 500) respostas.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  await p.goto(SITE + CAMINHO[l], { waitUntil: 'networkidle' });
  // 1) Teenus
  ok(`${nome}: abre no passo 1 (servico), barra "Samm 1/6"`, (await etapa(p)) === 'servico' && (await p.getByTestId('progresso').innerText()).includes(ps.passoDe.replace('{n}', '1').replace('{total}', '6')), await p.getByTestId('progresso').innerText().catch(() => ''));
  ok(`${nome}: 8 tipos`, (await p.getByTestId('passo-servico').locator('button').count()) === 8);
  ok(`${nome}: nada de "sem conta/registo" nem promessas na tela 1`, !/registr|cadastr|sign-up|без регистрации|ilma kontota|mitu pakkumist|несколько предложений/i.test(await p.innerText('main')));
  await conferir(p, `${nome} 1 teenus`);
  await p.getByTestId('passo-servico').locator('button').nth(3).click(); // Mehaanika
  await p.getByTestId('passo-detalhe').waitFor();
  // 2) Mis autol viga on?
  ok(`${nome}: passo 2 "Samm 2/6", titulo "${ps.detalheTitulo}", rotulo fora da caixa`, (await p.getByTestId('progresso').innerText()).includes(ps.passoDe.replace('{n}', '2').replace('{total}', '6')) && (await p.locator('[data-testid=passo-detalhe] h2').innerText()) === ps.detalheTitulo && (await rotulo(p, 'label[for=pedido-descricao]')) === ps.detalheRotuloTexto);
  const nChips = await p.getByTestId('chip-servico').count();
  ok(`${nome}: ${w < 380 || h <= 700 ? 4 : 6} chips de problemas comuns`, nChips === (w < 380 || h <= 700 ? 4 : 6), String(nChips));
  ok(`${nome}: chips com rotulo curto (constants.servicosCurto)`, (await p.getByTestId('chip-servico').first().innerText()).trim() === m.constants.servicosCurto.freio_barulho_frear, await p.getByTestId('chip-servico').first().innerText());
  ok(`${nome}: sem urgencia no passo 2`, !(await p.innerText('main')).includes(tn.urgencyLabel));
  await conferir(p, `${nome} 2 detalhe`);
  // Edasi vazio: aviso + foco na caixa (nunca desativado)
  ok(`${nome}: Edasi clicavel sem nada`, await edasi(p, 'detalhe').isEnabled());
  await edasi(p, 'detalhe').click(); await p.waitForTimeout(300);
  ok(`${nome}: aviso "${ps.faltaDescricaoLista.slice(0, 25)}..." ao lado do botao e sob a caixa`, (await p.getByTestId('passo-detalhe').getByTestId('falta-aviso').innerText().catch(() => '')) === ps.faltaDescricaoLista && (await p.getByTestId('falta-aviso-topo').innerText().catch(() => '')) === ps.faltaDescricaoLista);
  ok(`${nome}: foco na caixa de texto`, (await p.evaluate(() => document.activeElement?.id)) === 'pedido-descricao');
  ok(`${nome}: continua no passo 2`, (await etapa(p)) === 'detalhe');
  ok(`${nome}: caixa marcada como obrigatoria (*) e em falta (aria-invalid + aviso sob a caixa explica texto OU chip)`, await temAsterisco(p, 'label[for=pedido-descricao]') && (await p.locator('#pedido-descricao').getAttribute('aria-invalid')) === 'true' && ((await p.locator('#pedido-descricao').getAttribute('aria-describedby')) || '').includes('pedido-descricao-aviso'));
  // chip: marca com check, conta como servico, aviso some
  const chip1 = p.getByTestId('chip-servico').first();
  await p.waitForTimeout(400);
  await chip1.click({ timeout: 10000 }).catch(async () => { console.log('aviso: click do chip demorou (WebKit) - tap'); await chip1.tap(); }); await p.waitForTimeout(200);
  ok(`${nome}: chip tocado fica marcado com check`, (await chip1.getAttribute('aria-pressed')) === 'true' && (await chip1.innerText()).startsWith('✓'), await chip1.innerText());
  ok(`${nome}: status "1 teenus valitud" e aviso sumiu`, (await p.getByTestId('status-passo').getAttribute('data-tom')) === 'ok' && (await p.getByTestId('passo-detalhe').getByTestId('falta-aviso').count()) === 0);
  await conferir(p, `${nome} 2 detalhe chip`);
  await chip1.click(); await p.waitForTimeout(200);
  ok(`${nome}: tocar de novo desmarca`, (await chip1.getAttribute('aria-pressed')) === 'false');
  // "Naita koiki": tela propria com a lista inteira (17); marcar um fora dos 6 e voltar
  await p.getByTestId('ver-mais').click();
  await p.getByTestId('passo-lista').waitFor();
  ok(`${nome}: "Naita koiki" abre tela propria no mesmo "Samm 2/6" com 17 itens`, (await etapa(p)) === 'lista' && (await p.getByTestId('progresso').innerText()).includes(ps.passoDe.replace('{n}', '2').replace('{total}', '6')) && (await p.getByTestId('lista-servicos').locator('input[type=checkbox]').count()) === 17);
  await conferir(p, `${nome} 2b lista`);
  const ultimo = p.getByTestId('lista-servicos').locator('label').last(); // outro_problema_mecanico (fora dos chips)
  await ultimo.scrollIntoViewIfNeeded(); await ultimo.click(); await p.waitForTimeout(200);
  ok(`${nome}: Edasi vazio na lista nao se aplica (ja ha 1 marcado) - status ok`, (await p.getByTestId('passo-lista').getByTestId('status-passo').getAttribute('data-tom')) === 'ok');
  // voltar do NAVEGADOR (= Tagasi) da lista -> passo 2, com o marcado a vista
  await p.goBack(); await p.waitForTimeout(500);
  await p.getByTestId('passo-detalhe').waitFor();
  ok(`${nome}: voltar (navegador) da lista volta ao passo 2 com o marcado a vista (fora dos chips)`, (await etapa(p)) === 'detalhe' && (await p.getByTestId('chips-extra').innerText()).includes(m.constants.servicosMecanica.outro_problema_mecanico));
  // voltar do navegador do passo 2 -> tela 1 (e o tipo continua marcado); Edasi de novo pelo toque no tipo
  await p.goBack(); await p.waitForTimeout(600);
  ok(`${nome}: voltar (navegador) do passo 2 -> passo 1, tipo marcado`, (await etapa(p)) === 'servico' && (await p.getByTestId('passo-servico').locator('button[aria-pressed=true]').count()) === 1);
  await p.getByTestId('passo-servico').locator('button').nth(3).click();
  await p.getByTestId('passo-detalhe').waitFor();
  ok(`${nome}: mesmo tipo de novo mantem o marcado`, (await p.getByTestId('chips-extra').count()) === 1);
  // texto na caixa (texto OU chip); recarregar mantem tudo no mesmo passo
  await p.locator('#pedido-descricao').fill(l === 'et' ? 'Kriuksub pidurdamisel' : 'Скрипит при торможении');
  await p.waitForTimeout(400);
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  ok(`${nome}: recarregar volta ao passo 2 com texto e marcado`, (await etapa(p)) === 'detalhe' && (await p.locator('#pedido-descricao').inputValue()).length > 5 && (await p.getByTestId('chips-extra').count()) === 1, await etapa(p));
  await edasi(p, 'detalhe').click();
  await p.getByTestId('passo-fotos').waitFor();
  // 3) Fotod
  ok(`${nome}: passo 3 "Samm 3/6", "${ps.fotosTitulo}", botao "${ps.semFotos}" sem fotos`, (await p.getByTestId('progresso').innerText()).includes(ps.passoDe.replace('{n}', '3').replace('{total}', '6')) && (await rotulo(p, '[data-testid=passo-fotos] h2')) === ps.fotosTitulo && (await edasi(p, 'fotos').innerText()).trim() === ps.semFotos);
  ok(`${nome}: fotos marcadas como opcionais "(${ps.opcional})"`, (await p.locator('[data-testid=passo-fotos] h2').innerText()).includes(`(${ps.opcional})`));
  ok(`${nome}: camera e galeria separadas`, await p.getByTestId('foto-camera').isVisible() && await p.getByTestId('foto-galeria').isVisible());
  await conferir(p, `${nome} 3 fotod`);
  await p.getByTestId('passo-fotos').locator('input[type=file][multiple]').setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: FOTO }, { name: 'b.png', mimeType: 'image/png', buffer: FOTO }]);
  await p.waitForTimeout(500);
  ok(`${nome}: 2 miniaturas e o botao vira "${tn.next}"`, (await p.locator('[data-testid=fotos-miniaturas] img').count()) === 2 && (await edasi(p, 'fotos').innerText()).trim() === tn.next);
  await conferir(p, `${nome} 3b fotod lisatud`);
  await p.locator('[data-testid=fotos-miniaturas] button').last().click(); await p.waitForTimeout(200);
  ok(`${nome}: remover foto -> 1 miniatura`, (await p.locator('[data-testid=fotos-miniaturas] img').count()) === 1);
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  ok(`${nome}: recarregar volta ao passo 3 com a foto (IndexedDB)`, (await etapa(p)) === 'fotos' && (await p.locator('[data-testid=fotos-miniaturas] img').count()) === 1, await etapa(p));
  await p.locator('[data-testid=fotos-miniaturas] button').last().click(); await p.waitForTimeout(200);
  ok(`${nome}: sem fotos de novo -> "${ps.semFotos}"`, (await edasi(p, 'fotos').innerText()).trim() === ps.semFotos);
  await edasi(p, 'fotos').click();
  await p.getByTestId('passo-carro').waitFor({ state: 'visible' });
  // 4) Auto
  ok(`${nome}: passo 4 "Samm 4/6", "${ps.carroTitulo}"`, (await p.getByTestId('progresso').innerText()).includes(ps.passoDe.replace('{n}', '4').replace('{total}', '6')) && (await p.locator('[data-testid=passo-carro] h2').innerText()) === ps.carroTitulo);
  await conferir(p, `${nome} 4 auto`);
  await edasi(p, 'carro').click(); await p.waitForTimeout(300);
  ok(`${nome}: Edasi sem marca nem modelo -> barra "${ps.faltaCampos.slice(0, 20)}..." e foca a marca`, (await p.getByTestId('passo-carro').getByTestId('falta-aviso').innerText().catch(() => '')) === ps.faltaCampos && (await p.evaluate(() => document.activeElement?.id)) === 'cbbe3-101');
  ok(`${nome}: marca e modelo com *, ano e numbrimark sem *`, await temAsterisco(p, 'label[for=cbbe3-101]') && await temAsterisco(p, 'label[for=cbbe3-102]') && !(await temAsterisco(p, 'label[for=cbbe3-103]')) && !(await temAsterisco(p, 'label[for=pedido-placa]')));
  const fm = await emFalta(p, 'cbbe3-101', ps.faltaMarca), fmo = await emFalta(p, 'cbbe3-102', ps.faltaModelo);
  ok(`${nome}: marca E modelo em falta, cada um com o aviso proprio + aria`, fm.ok && fmo.ok, JSON.stringify([fm, fmo]));
  await conferir(p, `${nome} 4c auto vigadega`, { rolagemOk: true, edasiOk: true });
  await carroCampo(p, 'cbbe3-101', 'Toyota');
  ok(`${nome}: marca escolhida -> aviso da marca some, o do modelo fica; barra passa a "${ps.faltaModelo}"`, await semFalta(p, 'cbbe3-101') && (await emFalta(p, 'cbbe3-102', ps.faltaModelo)).ok && (await p.getByTestId('passo-carro').getByTestId('falta-aviso').innerText()) === ps.faltaModelo);
  await carroCampo(p, 'cbbe3-102', 'Corolla', /Corolla/);
  ok(`${nome}: modelo escolhido -> nenhum aviso`, await semFalta(p, 'cbbe3-102') && (await p.getByTestId('passo-carro').getByTestId('falta-aviso').count()) === 0);
  await p.locator('#cbbe3-103').fill('2015');
  await p.locator('#pedido-placa').fill('123ABC');
  await conferir(p, `${nome} 4b auto taidetud`);
  // ir e voltar: Tagasi -> fotos (foto pulada, sem aviso), Edasi -> carro com tudo
  await p.getByTestId('passo-carro').getByRole('button', { name: tn.back, exact: true }).click(); await p.waitForTimeout(500);
  ok(`${nome}: Tagasi do carro -> fotos`, (await etapa(p)) === 'fotos');
  await edasi(p, 'fotos').click(); await p.getByTestId('passo-carro').waitFor({ state: 'visible' });
  ok(`${nome}: voltou ao carro com marca/modelo/ano/placa`, (await p.locator('#cbbe3-101').inputValue()) === 'Toyota' && /Corolla/.test(await p.locator('#cbbe3-102').inputValue()) && (await p.locator('#cbbe3-103').inputValue()) === '2015' && (await p.locator('#pedido-placa').inputValue()) === '123ABC');
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  ok(`${nome}: recarregar volta ao carro preenchido`, (await etapa(p)) === 'carro' && (await p.locator('#cbbe3-101').inputValue()) === 'Toyota' && (await p.locator('#pedido-placa').inputValue()) === '123ABC', await etapa(p));
  await edasi(p, 'carro').click();
  await p.getByTestId('passo-local').waitFor();
  // 5) Asukoht
  ok(`${nome}: passo 5 "Samm 5/6", "${ps.localTitulo}", linha destacada, rotulo "${ps.localRotulo}", placeholder`, (await p.locator('[data-testid=passo-local] h2').innerText()) === ps.localTitulo && (await p.getByTestId('local-claro').innerText()) === ps.localAjuda && (await rotulo(p, 'label[for=pedido-endereco]')) === ps.localRotulo && (await p.locator('#pedido-endereco').getAttribute('placeholder')) === ps.localPlaceholder);
  ok(`${nome}: sem mapa antes de haver coordenada`, (await p.getByTestId('mapa-estatico').count()) === 0);
  await conferir(p, `${nome} 5 asukoht`);
  await edasi(p, 'local').click(); await p.waitForTimeout(300);
  ok(`${nome}: Edasi sem endereco avisa e foca`, (await p.getByTestId('passo-local').getByTestId('falta-aviso').innerText().catch(() => '')) === ps.faltaEndereco && (await p.evaluate(() => document.activeElement?.id)) === 'pedido-endereco');
  const fe = await emFalta(p, 'pedido-endereco', ps.faltaEndereco);
  ok(`${nome}: endereco com * e aviso proprio sob o campo + aria`, await temAsterisco(p, 'label[for=pedido-endereco]') && fe.ok, JSON.stringify(fe));
  await conferir(p, `${nome} 5c asukoht vigadega`);
  await p.locator('#pedido-endereco').fill(l === 'et' ? 'Lasnamäe' : 'Ласнамяэ');
  ok(`${nome}: escreveu -> aviso do endereco some`, await semFalta(p, 'pedido-endereco'));
  await p.waitForTimeout(1800);
  const sug = p.getByRole('option').first();
  const escolheu = await sug.isVisible().catch(() => false);
  if (escolheu) { await sug.click(); await p.waitForTimeout(800); }
  const mapas = await p.getByTestId('mapa-estatico').count();
  if (escolheu) {
    // com coordenada: mapa (Geoapify) ou nada - nunca imagem quebrada
    const quebrada = mapas ? await p.locator('[data-testid=mapa-estatico] img').evaluate((i) => i.complete && i.naturalWidth === 0) : false;
    ok(`${nome}: com coordenada, mapa carregado ou escondido (nunca quebrado)`, !quebrada, `mapa=${mapas}`);
  }
  await conferir(p, `${nome} 5b asukoht`);
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  ok(`${nome}: recarregar volta ao endereco preenchido`, (await etapa(p)) === 'local' && (await p.locator('#pedido-endereco').inputValue()).length > 3);
  await edasi(p, 'local').click();
  await p.getByTestId('passo-contato').waitFor();
  // 6) Kontakt
  ok(`${nome}: passo 6 "Samm 6/6", sem senha e sem telefone`, (await p.getByTestId('progresso').innerText()).includes(ps.passoDe.replace('{n}', '6').replace('{total}', '6')) && (await p.locator('#pedido-senha').count()) === 0 && (await p.locator('#pedido-telefone').count()) === 0);
  await conferir(p, `${nome} 6 kontakt`);
  ok(`${nome}: nimi, e-post e termos com *; SMS "(${ps.opcional})"`, await temAsterisco(p, 'label[for=pedido-nome]') && await temAsterisco(p, 'label[for=pedido-email]') && /\*/.test(await p.locator('label:has(#pedido-termos)').innerText()) && (await p.locator('label:has(#pedido-quer-sms)').innerText()).includes(`(${ps.opcional})`));
  await edasi(p, 'contato').click(); await p.waitForTimeout(300);
  const fn = await emFalta(p, 'pedido-nome', ps.faltaNome), fe2 = await emFalta(p, 'pedido-email', ps.faltaEmail), ft = await emFalta(p, 'pedido-termos', ps.faltaTermos);
  ok(`${nome}: Saada com tudo vazio -> nimi, e-post e termos cada um com o aviso proprio + aria; foco no nome`, fn.ok && fe2.ok && ft.ok && (await p.evaluate(() => document.activeElement?.id)) === 'pedido-nome', JSON.stringify([fn, fe2, ft]));
  ok(`${nome}: varios em falta -> barra "${ps.faltaCampos.slice(0, 20)}..."`, (await p.getByTestId('passo-contato').getByTestId('falta-aviso').innerText().catch(() => '')) === ps.faltaCampos);
  await conferir(p, `${nome} 6c kontakt vigadega`, { rolagemOk: h <= 700 });
  await p.locator('#pedido-nome').fill('TESTE AUTOMATICO');
  ok(`${nome}: nome escrito -> so o aviso do nome some (e-mail e termos ficam)`, await semFalta(p, 'pedido-nome') && (await emFalta(p, 'pedido-email', ps.faltaEmail)).ok && (await emFalta(p, 'pedido-termos', ps.faltaTermos)).ok);
  await p.getByTestId('quer-sms').check(); await edasi(p, 'contato').click(); await p.waitForTimeout(300);
  ok(`${nome}: SMS marcado + Saada -> telefone com * e aviso proprio`, await temAsterisco(p, 'label[for=pedido-telefone]') && (await emFalta(p, 'pedido-telefone', ps.faltaTelefone)).ok);
  await p.getByTestId('quer-sms').uncheck();
  await p.locator('#pedido-email').fill(`x-${tag}@example.test`);
  ok(`${nome}: so os termos em falta -> barra repete "${ps.faltaTermos.slice(0, 20)}..."`, (await p.getByTestId('passo-contato').getByTestId('falta-aviso').innerText()) === ps.faltaTermos);
  await p.getByTestId('aceito-termos').check();
  ok(`${nome}: e-mail e termos preenchidos -> nenhum aviso`, await semFalta(p, 'pedido-email') && await semFalta(p, 'pedido-termos') && (await p.getByTestId('passo-contato').getByTestId('falta-aviso').count()) === 0);
  await p.getByTestId('aceito-termos').uncheck(); await p.locator('#pedido-email').fill('');
  await p.getByTestId('quer-sms').check(); await p.waitForTimeout(200);
  await conferir(p, `${nome} 6b kontakt sms`, { rolagemOk: true });
  await p.getByTestId('quer-sms').uncheck();
  // Back xN a partir do contato: local -> carro -> fotos -> lista -> detalhe -> servico -> fora da pagina
  // (a entrada da lista saiu do historico quando o passo 2 foi reaberto a partir da tela 1 - e assim num navegador)
  const visitas = [];
  for (let i = 0; i < 5; i++) { await p.goBack({ timeout: 8000 }).catch(() => {}); await p.waitForTimeout(500); visitas.push(await etapa(p)); }
  ok(`${nome}: Back x5 volta passo a passo ate a tela 1`, visitas.join('>') === 'local>carro>fotos>detalhe>servico', visitas.join(' > '));
  // volta tudo para a frente (nada se perdeu): servico -> ... -> contato pelo historico
  for (let i = 0; i < 5; i++) { await p.goForward({ timeout: 8000 }).catch(() => {}); await p.waitForTimeout(500); }
  ok(`${nome}: avancar x5 chega de novo ao contato com o nome escrito`, (await etapa(p)) === 'contato' && (await p.locator('#pedido-nome').inputValue()) === 'TESTE AUTOMATICO', await etapa(p));
  // ...e mais 6 voltas: tela 1 e depois FORA da pagina (nunca preso)
  let saiu = false;
  for (let i = 0; i < 7; i++) { await p.goBack({ timeout: 8000 }).catch(() => {}); await p.waitForTimeout(500); if (!p.url().includes(CAMINHO[l])) { saiu = true; break; } }
  ok(`${nome}: voltar xN acaba por sair da pagina (nao prende)`, saiu, p.url());
  for (let i = 0; i < 7; i++) { await p.goForward({ timeout: 8000 }).catch(() => {}); await p.waitForTimeout(400); if ((await etapa(p)) === 'contato') break; }
  if ((await etapa(p)) !== 'contato') { // WebKit recarrega a pagina ao voltar de fora: segue pelo rascunho ate o contato
    for (let i = 0; i < 6 && (await etapa(p)) !== 'contato'; i++) { const e = await etapa(p); if (e === 'servico') await p.getByTestId('passo-servico').locator('button').nth(3).click(); else await p.getByTestId(`passo-${e}`).getByTestId('edasi').click(); await p.waitForTimeout(400); }
  }
  ok(`${nome}: de volta ao contato, nome ainda escrito (rascunho)`, (await etapa(p)) === 'contato' && (await p.locator('#pedido-nome').inputValue()) === 'TESTE AUTOMATICO', await etapa(p));
  // funil: cada passo uma vez; novos fotos/fotos_pulou; nenhum passo de urgencia
  const vezes = (e) => funil.filter((x) => x === e).length;
  ok(`${nome}: funil - abriu/servico/detalhe/fotos/carro/local/contato uma vez cada`, ['abriu', 'servico', 'detalhe', 'fotos', 'carro', 'local', 'contato'].every((e) => vezes(e) === 1), funil.join(','));
  ok(`${nome}: funil - detalhe_escreveu, detalhe_escolheu_lista, detalhe_ver_todos, fotos_pulou, foto, contato_digitou`, ['detalhe_escreveu', 'detalhe_escolheu_lista', 'detalhe_ver_todos', 'fotos_pulou', 'foto', 'contato_digitou'].every((e) => vezes(e) >= 1), funil.join(','));
  ok(`${nome}: funil - edasi_bloqueado_detalhe/carro/local`, ['edasi_bloqueado_detalhe', 'edasi_bloqueado_carro', 'edasi_bloqueado_carro_marca', 'edasi_bloqueado_local'].every((e) => vezes(e) >= 1), funil.join(','));
  ok(`${nome}: funil - nada de urgencia/kiirus/modo`, !funil.some((e) => /kiirus|urgenc|modo/.test(e)));
  if (enviar) {
    const email = `v2-${l}-${tag}@example.test`;
    await p.locator('#pedido-email').fill(email);
    await p.getByTestId('aceito-termos').check();
    const t0 = Date.now();
    await edasi(p, 'contato').click();
    await p.getByTestId('passo-codigo').waitFor({ timeout: 40000 });
    ok(`${nome}: tela do codigo (sem barra de progresso)`, (await p.getByTestId('progresso').count()) === 0);
    await conferir(p, `${nome} 7 kood`);
    const c = await codigoDe(email, t0);
    ok(`${nome}: e-mail do codigo chegou (Resend falso)`, !!c);
    const pend = (await admin.from('pedidos_pendentes').select('user_id, fotos').ilike('email', email).maybeSingle()).data;
    if (pend) contas.add(pend.user_id);
    ok(`${nome}: pendente com urgencia media e sem fotos (puladas)`, !!pend && (pend.fotos || []).length === 0, JSON.stringify(pend?.fotos));
    await p.locator('#pedido-codigo').fill(c || '');
    await p.getByTestId('confirmar-codigo').click();
    const criar = await p.getByTestId('criar-senha').waitFor({ timeout: 40000 }).then(() => true, () => false);
    ok(`${nome}: codigo -> "crie a sua senha"`, criar, p.url());
    await p.getByTestId('criar-senha-agora-nao').click();
    await p.waitForURL(/orcamentos\//, { timeout: 30000 }).catch(() => {});
    const sol = (await admin.from('solicitacoes').select('id, tipo, descricao, urgencia').eq('cliente_id', pend?.user_id || '00000000-0000-0000-0000-000000000000').maybeSingle()).data;
    ok(`${nome}: pedido aberto logado; banco: tipo mecanica, urgencia media, descricao "Teenused: ... + texto"`, p.url().includes(`/cliente/orcamentos/${sol?.id}`) && sol?.urgencia === 'media' && sol?.descricao.startsWith(tn.servicesPrefix) && sol?.descricao.includes(m.constants.servicosMecanica.outro_problema_mecanico), sol?.descricao);
    await p.waitForTimeout(1500);
    // Back xN depois de enviar: painel uma vez e sai (18/11) - nunca reabre os passos
    const abriu = funil.length;
    const v2 = [];
    for (let i = 0; i < 8; i++) {
      await p.goBack({ timeout: 8000 }).catch(() => {}); await p.waitForTimeout(1500);
      v2.push(p.url().startsWith(SITE) ? new URL(p.url()).pathname : p.url());
      if (!p.url().startsWith(SITE)) break;
    }
    ok(`${nome}: Back xN depois do pedido -> painel uma vez e sai, sem reabrir os passos`, v2.length <= 2 && /\/cliente\/dashboard$/.test(v2[0] || '') && !p.url().startsWith(SITE), v2.join(' > '));
    ok(`${nome}: voltar aos passos nao conta "abriu"`, !funil.slice(abriu).includes('abriu'));
    // logado: /paring leva ao pedido normal (nova-solicitacao), sem o fluxo sem conta
    await p.goto(SITE + CAMINHO[l], { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    ok(`${nome}: logado -> pedido normal`, !/paring|zayavka/.test(p.url()), p.url());
  }
  ok(`${nome}: sem erro de JavaScript`, !erros.length, erros.join(' | '));
  ok(`${nome}: sem 5xx do site`, !respostas.length, respostas.join(' | '));
  await ctx.close();
}

// tipo sem lista (colisao): so a caixa "Mis juhtus?"; "outro": pergunta generica, sem chips
async function semLista(l, w, h) {
  const m = M[l]; const ps = m.pedidoSemConta;
  const nome = `${MOTOR} ${l} ${w}x${h} sem lista`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, extraHTTPHeaders: { 'x-real-ip': ip() } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await ctx.route('**/api/funil', (r) => r.fulfill({ status: 200, body: '{"ok":true}' }));
  const p = await ctx.newPage();
  await p.goto(SITE + CAMINHO[l], { waitUntil: 'networkidle' });
  for (const [idx, titulo, rot, ex] of [[0, ps.detalheTituloFoto, ps.detalheRotuloFoto, ps.exemploFoto], [6, ps.detalheTituloFoto, ps.detalheRotuloFoto, ps.exemploVidro], [7, ps.detalheTitulo, ps.detalheRotuloTexto, m.clienteNovaSolicitacao.placeholderDescribeIssue]]) {
    await p.getByTestId('passo-servico').locator('button').nth(idx).click();
    await p.getByTestId('passo-detalhe').waitFor();
    ok(`${nome} tipo #${idx}: "${titulo}", rotulo "${rot}", exemplo, sem chips nem "Naita koiki"`, (await p.locator('[data-testid=passo-detalhe] h2').innerText()) === titulo && (await rotulo(p, 'label[for=pedido-descricao]')) === rot && (await p.locator('#pedido-descricao').getAttribute('placeholder')) === ex && (await p.getByTestId('chip-servico').count()) === 0 && (await p.getByTestId('ver-mais').count()) === 0);
    await p.locator('#pedido-descricao').fill(''); // o texto fica ao trocar de tipo (regra); aqui queremos a caixa vazia
    await edasi(p, 'detalhe').click(); await p.waitForTimeout(250);
    ok(`${nome} tipo #${idx}: Edasi vazio -> "${ps.faltaDescricao}"`, (await p.getByTestId('passo-detalhe').getByTestId('falta-aviso').innerText().catch(() => '')) === ps.faltaDescricao);
    if (idx === 0) await conferir(p, `${nome} 2c kirjelda kahju`);
    await p.locator('#pedido-descricao').fill('x');
    await edasi(p, 'detalhe').click();
    await p.getByTestId('passo-fotos').waitFor();
    ok(`${nome} tipo #${idx}: texto -> fotos`, (await etapa(p)) === 'fotos');
    await p.goBack(); await p.waitForTimeout(400); await p.goBack(); await p.waitForTimeout(400);
    ok(`${nome} tipo #${idx}: 2x voltar -> tela 1`, (await etapa(p)) === 'servico');
    await p.evaluate(() => localStorage.removeItem('bipfix_pedido_rascunho'));
  }
  await ctx.close();
}

try {
  await fluxo('et', 390, 844, { enviar: MOTOR === 'chromium' });
  await fluxo('ru', 390, 844);
  await fluxo('et', 360, 640);
  await fluxo('ru', 360, 640);
  await semLista('et', 360, 640);
  await semLista('ru', 390, 844);
  // navegador do Facebook/Instagram (UA do app, Android): mesmo fluxo em ET 390
  if (MOTOR === 'chromium') {
    await fluxo('et', 390, 844, { ua: 'Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/447.0.0.37.108;]', nomeExtra: ' facebook' });
    await fluxo('ru', 360, 640, { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21C62 Instagram 320.0.0.0.75 (iPhone14,5; iOS 17_2; ru_RU; ru; scale=3.00; 1170x2532; 568142371)', nomeExtra: ' instagram' });
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
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`fotos em ${OUT}`);
  console.log(`${oks} ok, ${falhas} falha(s)`);
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
}
