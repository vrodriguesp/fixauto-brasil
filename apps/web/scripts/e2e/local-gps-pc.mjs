// Local no computador (21/11): no PC "Kasuta minu asukohta" falha muito (localizacao do Windows
// desligada / sem Wi-Fi -> o Chrome da POSITION_UNAVAILABLE mesmo com a permissao dada).
//  - computador (sem toque, 1366): o campo do endereco vem primeiro e focado; "usar minha
//    localizacao" e um link de texto secundario com a dica "funciona melhor no telefone";
//  - celular (390, isMobile/hasTouch): a tela de sempre (botao grande, sem dica, sem foco automatico);
//  - falha pelo tipo (GeolocationPositionError.code 1/2/3): aviso proprio, funil local_gps_negado /
//    local_gps_indisponivel / local_gps_timeout, o botao some e o foco vai ao campo;
//  - caminho feliz (permissao + posicao do Playwright -> /api/geocode reverso) continua preenchendo o campo;
//  - /api/funil aceita os eventos novos (contagem do dia no banco local).
// ET e RU. Comeca no passo do carro (rascunho semeado no aparelho) e toca "Edasi" ate o local.
//   SITE=http://localhost:3109 node local-gps-pc.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(AQUI, '../..');
const req = createRequire(path.join(WEB, 'package.json'));
const { createClient } = req('@supabase/supabase-js');
const { chromium } = req('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3109';
const OUT = process.env.OUT || path.resolve(WEB, '../../../resultados/local-gps-pc');
fs.mkdirSync(OUT, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0, total = 0;
const ok = (n, c, x = '') => { total++; if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 240) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ipN = 1;
const ip = () => `10.77.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
const M = (l) => JSON.parse(fs.readFileSync(path.join(WEB, 'messages', `${l}.json`), 'utf8'));
const URL_PEDIDO = { et: '/ee/et/paring', ru: '/ee/ru/zayavka' };
// classe do botao de sempre no celular (nao pode mudar)
const CLASSE_CELULAR = 'mt-3 inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:border-primary-400 disabled:opacity-60';
const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');

const APARELHOS = {
  pc: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  celular: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

// modo: 'negado' (permissao recusada de verdade), 'permitido' (posicao do Playwright),
// 'mock2'/'mock3'/'mock1' (navigator.geolocation falso devolvendo o codigo)
async function caso(B, { aparelho, idioma, modo, prints = false }) {
  const m = M(idioma), ps = m.pedidoSemConta;
  const nome = `${aparelho} ${idioma} ${modo}`;
  const extra = modo === 'permitido' ? { permissions: ['geolocation'], geolocation: { latitude: 59.437, longitude: 24.7536 } } : {};
  const ctx = await B.newContext({ ...APARELHOS[aparelho], locale: idioma === 'ru' ? 'ru-RU' : 'et-EE', extraHTTPHeaders: { 'x-real-ip': ip() }, ...extra });
  ctx.setDefaultTimeout(15000);
  const codigo = modo.startsWith('mock') ? Number(modo.slice(4)) : 0;
  await ctx.addInitScript(({ codigo }) => {
    try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {}
    // rascunho no passo do carro (marca + modelo, sem ano/placa: valido), so na 1a carga
    try {
      if (!sessionStorage.getItem('__semeado')) {
        sessionStorage.setItem('__semeado', '1');
        localStorage.setItem('bipfix_pedido_rascunho', JSON.stringify({ em: Date.now(), etapa: 'carro', tipo: 'mecanica', servicos: [], descricao: 'TESTE AUTOMATICO gps', fotosPuladas: true,
          carro: { tipo: 'cars', marca: 'Toyota', modelo: 'Corolla', ano: '', codigo: '' }, placa: '', endereco: '', coords: null, pais: null, nome: '', email: '', querSms: false, telefone: '', termos: false, pendente: null, qtdFotos: 0 }));
      }
    } catch {}
    window.__geo = 0;
    const g = navigator.geolocation;
    if (!g) return;
    if (codigo) {
      const C = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
      g.getCurrentPosition = (_ok, falha) => { window.__geo++; setTimeout(() => falha && falha({ code: codigo, message: 'mock ' + codigo, ...C }), 150); };
    } else {
      const orig = g.getCurrentPosition.bind(g);
      g.getCurrentPosition = (...a) => { window.__geo++; return orig(...a); };
    }
  }, { codigo });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  const funil = [];
  await page.route('**/api/funil', async (r) => { try { funil.push(JSON.parse(r.request().postData() || '{}').etapa); } catch {} await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  const geocodes = [];
  page.on('request', (r) => { if (r.url().includes('/api/geocode?lat=')) geocodes.push(r.url()); });
  const ativo = () => page.evaluate(() => document.activeElement?.id || '');
  try {
    await page.goto(SITE + URL_PEDIDO[idioma], { waitUntil: 'networkidle' });
    const carro = page.getByTestId('passo-carro');
    await carro.waitFor();
    const edasi = carro.getByTestId('edasi');
    if (aparelho === 'celular') await edasi.tap(); else await edasi.click();
    const local = page.getByTestId('passo-local');
    await local.waitFor();
    await sleep(400);
    const campo = page.locator('#pedido-endereco');
    const botao = page.getByTestId('usar-localizacao');
    // ---- layout ----
    const ordem = await page.evaluate(() => {
      const c = document.getElementById('pedido-endereco'), b = document.querySelector('[data-testid="usar-localizacao"]');
      return !!(c && b && (c.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    const [bc, bb] = [await campo.boundingBox(), await botao.boundingBox()];
    ok(`${nome}: campo do endereco antes de "${ps.localUsarMinha}" (DOM e na tela)`, ordem && bc && bb && bb.y > bc.y, `${bc?.y} < ${bb?.y}`);
    ok(`${nome}: nenhum pedido de localizacao so por entrar no passo`, (await page.evaluate(() => window.__geo)) === 0);
    if (aparelho === 'pc') {
      ok(`${nome}: campo focado ao entrar`, (await ativo()) === 'pedido-endereco', await ativo());
      ok(`${nome}: link secundario com a dica "${ps.localDicaCelular}"`, (await page.getByTestId('local-gps-secundario').isVisible()) && (await page.getByTestId('local-gps-secundario').innerText()).includes(ps.localDicaCelular));
      ok(`${nome}: link com o texto "${ps.localUsarMinha}", pequeno (sem caixa de botao)`, (await botao.innerText()).trim() === ps.localUsarMinha && bb.height < 40 && !(await botao.getAttribute('class')).includes('border'), `${bb.height}px`);
      ok(`${nome}: dica ligada ao link (aria-describedby)`, (await botao.getAttribute('aria-describedby')) === 'pedido-gps-dica');
    } else {
      ok(`${nome}: botao de sempre (mesma classe, >=44 px, sem dica)`, (await botao.getAttribute('class')) === CLASSE_CELULAR && bb.height >= 44 && (await page.getByTestId('local-gps-secundario').count()) === 0 && !(await local.innerText()).includes(ps.localDicaCelular), `${bb.height}px`);
      ok(`${nome}: sem foco automatico no campo (teclado nao abre sozinho)`, (await ativo()) !== 'pedido-endereco', await ativo());
    }
    ok(`${nome}: sem transbordo horizontal`, (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
    if (prints) await page.screenshot({ path: path.join(OUT, `local-${aparelho}-${idioma}.png`) });
    // tira o foco do campo antes de tocar (o foco depois da falha tem de vir do codigo)
    await page.evaluate(() => document.activeElement?.blur());
    if (aparelho === 'celular') await botao.tap(); else await botao.click();
    if (modo === 'permitido') {
      await page.waitForFunction(() => (document.getElementById('pedido-endereco')?.value || '').length > 0, null, { timeout: 25000 }).catch(() => {});
      const v = await campo.inputValue();
      ok(`${nome}: posicao -> /api/geocode reverso -> campo preenchido`, v.length > 0 && geocodes.length === 1, `"${v}" geocode=${geocodes.length}`);
      await sleep(300);
      ok(`${nome}: sem aviso de falha`, (await page.getByTestId('localizacao-negada').count()) === 0);
      ok(`${nome}: funil so local_gps`, funil.includes('local_gps') && !funil.some((e) => /^local_gps_/.test(e)), funil.join());
    } else {
      const tipo = modo === 'negado' || codigo === 1 ? 'negado' : codigo === 3 ? 'tempo' : 'indisponivel';
      const chave = { negado: 'localErroNegado', indisponivel: 'localErroIndisponivel', tempo: 'localErroTempo' }[tipo];
      const evento = { negado: 'local_gps_negado', indisponivel: 'local_gps_indisponivel', tempo: 'local_gps_timeout' }[tipo];
      const aviso = page.getByTestId('localizacao-negada');
      await aviso.waitFor({ timeout: 15000 }).catch(() => {});
      ok(`${nome}: aviso "${ps[chave].slice(0, 40)}..."`, (await aviso.innerText().catch(() => '')) === ps[chave] && (await aviso.getAttribute('data-falha').catch(() => '')) === tipo, await aviso.innerText().catch(() => '(sem aviso)'));
      ok(`${nome}: o botao some (nao pergunta de novo)`, (await botao.count()) === 0);
      await sleep(200);
      ok(`${nome}: foco no campo do endereco depois da falha`, (await ativo()) === 'pedido-endereco', await ativo());
      await sleep(300);
      ok(`${nome}: funil local_gps + ${evento} (e nenhum outro de falha)`, funil.includes('local_gps') && funil.includes(evento) && funil.filter((e) => /^local_gps_/.test(e)).length === 1, funil.join());
      // continua: escrever o endereco e seguir
      await campo.fill(idioma === 'ru' ? 'Таллинн' : 'Tallinn');
      await campo.press('Escape').catch(() => {});
      if (prints) await page.screenshot({ path: path.join(OUT, `local-${aparelho}-${idioma}-${tipo}.png`) });
    }
    ok(`${nome}: sem erro de JavaScript`, erros.length === 0, erros.join(' | '));
  } catch (e) {
    ok(`${nome}: fluxo`, false, e.message);
    await page.screenshot({ path: path.join(OUT, `erro-${aparelho}-${idioma}-${modo}.png`) }).catch(() => {});
  } finally {
    await ctx.close();
  }
}

const B = await chromium.launch({ executablePath: CHROME });
try {
  for (const aparelho of ['pc', 'celular']) {
    for (const idioma of ['et', 'ru']) {
      for (const modo of ['mock2', 'mock3', 'mock1', 'negado', 'permitido']) await caso(B, { aparelho, idioma, modo, prints: modo !== 'negado' && modo !== 'mock1' });
    }
  }
  // sugestoes na tela (mercado EE, 21/11): "Таллинн" em RU so traz lugares da Estonia
  {
    const ctx = await B.newContext({ ...APARELHOS.pc, extraHTTPHeaders: { 'x-real-ip': ip() } });
    await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_pedido_rascunho', JSON.stringify({ em: Date.now(), etapa: 'local', tipo: 'mecanica', servicos: [], descricao: 'TESTE', fotosPuladas: true, carro: { tipo: 'cars', marca: 'Toyota', modelo: 'Corolla', ano: '', codigo: '' }, placa: '', endereco: '', coords: null, pais: null, nome: '', email: '', querSms: false, telefone: '', termos: false, pendente: null, qtdFotos: 0 })); } catch {} });
    const page = await ctx.newPage();
    const respostas = [];
    const urls = [];
    page.on('response', async (r) => { if (r.url().includes('/api/endereco/sugestoes')) { urls.push(r.url()); respostas.push(await r.json().catch(() => [])); } });
    await page.goto(SITE + URL_PEDIDO.ru, { waitUntil: 'networkidle' });
    await page.getByTestId('passo-local').waitFor();
    await page.locator('#pedido-endereco').pressSequentially('Таллинн', { delay: 60 });
    await page.locator('[role="listbox"] [role="option"]').first().waitFor({ timeout: 20000 }).catch(() => {});
    const opcoes = await page.locator('[role="listbox"] [role="option"]').allInnerTexts();
    const ultima = respostas.at(-1) || [];
    ok('tela RU: o pedido pede as sugestoes com opt-in (&pais=EE&so=1)', urls.length > 0 && urls.every((u) => /[?&]pais=EE(&|$)/.test(u) && /[?&]so=1(&|$)/.test(u)), JSON.stringify(urls.slice(-2)));
    ok('tela RU "Таллинн": sugestoes so da Estonia (Tallinn primeiro)', opcoes.length > 0 && /tallinn/i.test(opcoes[0]) && ultima.length > 0 && ultima.every((s) => s.paisCodigo === 'EE'), JSON.stringify(opcoes));
    await page.screenshot({ path: path.join(OUT, 'sugestoes-ru-tallinn.png') }).catch(() => {});
    await ctx.close();
  }
} finally {
  await B.close();
}
// opt-in so onde a pessoa/oficina esta na Estonia; o acidente (pode ser no estrangeiro) fica sem
{
  const fonte = (f) => fs.readFileSync(path.join(WEB, 'src', f), 'utf8');
  ok('acidente (emergencia) nao pede so=1', !/soDoPais/.test(fonte('app/[locale]/emergencia/page.tsx')));
  ok('pedido sem conta, nova solicitacao, cadastro e perfil da oficina pedem so=1',
    /id="pedido-endereco" soDoPais/.test(fonte('components/pedido/PedidoSemConta.tsx')) && /id="caee7-102" soDoPais/.test(fonte('app/[locale]/cliente/nova-solicitacao/page.tsx'))
    && /soDoPais=\{userType === 'oficina'\}/.test(fonte('app/[locale]/(auth)/cadastro/page.tsx')) && /idBase="oficina-end" soDoPais/.test(fonte('app/[locale]/oficina/perfil/page.tsx')));
}

// ---- /api/funil aceita os eventos novos (banco local) ----
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date());
const contagem = async (etapa) => (await admin.from('funil_contagem').select('total').eq('funil', 'pedido_site').eq('etapa', etapa).eq('dia', hoje).maybeSingle()).data?.total || 0;
for (const etapa of ['local_gps_indisponivel', 'local_gps_timeout', 'local_gps_negado']) {
  const antes = await contagem(etapa);
  await fetch(`${SITE}/api/funil`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip() }, body: JSON.stringify({ funil: 'pedido_site', etapa }) });
  await sleep(300);
  ok(`/api/funil conta "${etapa}"`, (await contagem(etapa)) === antes + 1, `${antes} -> ${await contagem(etapa)}`);
}
{
  const antes = await contagem('local_gps_qualquer');
  await fetch(`${SITE}/api/funil`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip() }, body: JSON.stringify({ funil: 'pedido_site', etapa: 'local_gps_qualquer' }) });
  ok('/api/funil ignora evento fora da lista', (await contagem('local_gps_qualquer')) === antes);
}

console.log(falhas ? `FALHAS: ${falhas} (${total - falhas}/${falhas})` : `TUDO CERTO (${total}/0)`);
process.exit(falhas ? 1 : 0);
