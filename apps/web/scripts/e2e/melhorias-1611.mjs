// NOTA 19/11: a parte do pedido sem conta refere-se ao passo 2 antigo (titulo/ajuda do endereco mudaram no fluxo em etapas) - o fluxo novo esta em pedido-v2-telas.mjs.
// E2E LOCAL das melhorias de 16/11 (parecer do Fable sobre carro e endereco, aprovado pelo dono):
// pedido sem conta - ano opcional, atalhos de marca, marca em cirilico, marca fora do catalogo,
// aviso que some ao corrigir, motivo do bloqueio no funil, nenhum pedido de localizacao ao entrar
// no passo do endereco (so pelo botao), "Tallinn" / "Lasnamäe" viram coordenada, oficinas avisadas;
// cadastro de oficina - "Loo töökoja konto" clicavel sem a declaracao (aviso + foco + funil).
// Chromium (390 e 1280) e WebKit (iPhone). Cria contas @example.test e apaga tudo no fim.
// SITE=http://localhost:3100 node melhorias-1611.mjs <.env.local>
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium, webkit, devices } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
const EMAILS = env.EMAIL_PASTA_TESTE;
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/melhorias-1611';
fs.mkdirSync(OUT, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}${extra ? ' - ' + extra : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Teste-' + crypto.randomBytes(6).toString('hex') + 'A1';
let ipN = 1;
const ip = () => `10.88.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
const contas = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MSG = new URL('../../messages/', import.meta.url);
const M = (l) => {
  const ler = (f) => JSON.parse(fs.readFileSync(new URL(f, MSG), 'utf8'));
  return { ...ler(`${l}.json`), ...ler(`${l}.cliente.json`), ...ler(`${l}.auth.json`) };
};
const arqDe = (email) => `_${email.replace(/[^a-z0-9@._-]/gi, '_')}.html`;
const emailsDepois = (email, depois) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(arqDe(email)) && Number(f.split('_')[0]) >= depois).sort();
const codigoDe = async (email, depois) => {
  for (let i = 0; i < 30; i++) {
    const arq = emailsDepois(email, depois);
    if (arq.length) {
      const html = fs.readFileSync(path.join(EMAILS, arq.at(-1)), 'utf8');
      const txt = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
      const m = txt.match(/(?<![\d#])\d{6}(?!\d)/);
      if (m) return { codigo: m[0], html };
    }
    await sleep(300);
  }
  return { codigo: null, html: '' };
};
// dia de Tallinn (o contador do funil grava o dia de Tallinn; de madrugada o dia UTC ainda e o anterior)
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date());
const total = async (funil, etapa) => (await admin.from('funil_contagem').select('total').eq('funil', funil).eq('etapa', etapa).eq('dia', hoje).maybeSingle()).data?.total || 0;
const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
const WEBKIT = path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe');
const OFICINA_LOCAL = 'meister.teste@bipfix.test'; // Kesklinna Autoteenindus (TEST), Tallinn, mecanica, raio 30 km

const novoContexto = async (B, motor, largura, extra = {}) => {
  const base = motor === 'webkit' ? { ...devices['iPhone 13'] }
    : { viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500 };
  const ctx = await B.newContext({ ...base, extraHTTPHeaders: { 'x-real-ip': ip() }, ...extra });
  ctx.setDefaultTimeout(15000);
  await ctx.addInitScript(() => {
    // conta os pedidos de localizacao (como o e2e-cadastro) e responde o aviso de cookies
    window.__geo = 0;
    const g = navigator.geolocation;
    if (g) { const orig = g.getCurrentPosition.bind(g); g.getCurrentPosition = (...a) => { window.__geo++; return orig(...a); }; }
    try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {}
  });
  return ctx;
};
const tocar = async (pg, loc) => { if (pg.context()._options?.hasTouch || pg.viewportSize()?.width < 500) await loc.tap().catch(() => loc.click()); else await loc.click(); };

// ======================= pedido sem conta =======================
async function pedido(B, { motor, idioma, largura, marca, endereco, anoInvalido = false, gps = 'nenhum', prints = false }) {
  const m = M(idioma);
  const ps = m.pedidoSemConta, vf = m.veiculoForm;
  const nome = `${motor} ${idioma} ${largura} ${marca}`;
  const extra = gps === 'permitido' ? { permissions: ['geolocation'], geolocation: { latitude: 59.437, longitude: 24.7536 } } : {};
  const ctx = await novoContexto(B, motor, largura, extra);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  const funil = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/funil')) { try { funil.push(JSON.parse(r.postData() || '{}').etapa); } catch {} } });
  const geo = () => page.evaluate(() => window.__geo);
  const sw = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const ativo = () => page.evaluate(() => document.activeElement?.id || '');
  await page.goto(SITE + (idioma === 'ru' ? '/ee/ru/zayavka' : '/ee/et/paring'), { waitUntil: 'networkidle' });
  await page.getByTestId('passo-servico').waitFor();
  await tocar(page, page.getByRole('button', { name: new RegExp(m.constants.tiposServico.mecanica) }));
  await page.locator('#pedido-descricao').fill('TESTE AUTOMATICO pidurid');
  await tocar(page, page.getByTestId('passo-detalhe').getByRole('button', { name: m.clienteNovaSolicitacao.next, exact: true }));
  const carro = page.getByTestId('passo-carro');
  await carro.waitFor();
  const edasiCarro = carro.getByRole('button', { name: m.clienteNovaSolicitacao.next, exact: true });
  const aviso = carro.getByTestId('falta-aviso');
  const marcaEl = page.locator('#cbbe3-101'), modeloEl = page.locator('#cbbe3-102'), anoEl = page.locator('#cbbe3-103');
  await page.getByTestId('atalhos-marca').waitFor({ timeout: 20000 });
  ok(`${nome}: textos de ajuda da marca e do modelo`, (await page.locator('#cbbe3-101-ajuda').innerText()) === vf.ajudaMarca && (await page.locator('#cbbe3-102-ajuda').innerText()) === vf.ajudaModelo);
  ok(`${nome}: ano marcado como opcional no rotulo`, (await page.locator('label[for="cbbe3-103"]').innerText()).trim() === vf.labelAnoOpcional, await page.locator('label[for="cbbe3-103"]').innerText());
  ok(`${nome}: placa opcional com o texto de ajuda`, (await page.locator('label[for="pedido-placa"]').innerText()) === ps.placaRotulo && (await page.locator('#pedido-placa-ajuda').innerText()) === ps.placaAjuda);
  ok(`${nome}: 8 atalhos de marca`, (await page.getByTestId('atalhos-marca').getByRole('button').count()) === 8);
  if (prints) await page.screenshot({ path: `${OUT}/carro-${idioma}-${largura}-${motor}.png`, fullPage: true });
  // Edasi sem nada: aviso da marca, foco no campo, funil com o motivo
  await tocar(page, edasiCarro);
  await sleep(500);
  ok(`${nome}: sem marca -> aviso "${ps.faltaMarca}"`, (await aviso.innerText().catch(() => '')) === ps.faltaMarca);
  ok(`${nome}: foco na marca`, (await ativo()) === 'cbbe3-101', await ativo());
  ok(`${nome}: funil edasi_bloqueado_carro + _marca`, funil.includes('edasi_bloqueado_carro') && funil.includes('edasi_bloqueado_carro_marca'), JSON.stringify(funil));
  if (marca === 'atalho') {
    await tocar(page, page.getByTestId('atalho-marca-toyota'));
    await sleep(800);
    ok(`${nome}: atalho Toyota preenche a marca`, (await marcaEl.inputValue()) === 'Toyota', await marcaEl.inputValue());
    ok(`${nome}: atalho leva o foco ao modelo`, (await ativo()) === 'cbbe3-102', await ativo());
    ok(`${nome}: atalho fica marcado`, (await page.getByTestId('atalho-marca-toyota').getAttribute('aria-pressed')) === 'true');
  } else if (marca === 'cirilico') {
    // lista pela setinha: bloco das marcas comuns e depois todas de A a Z
    // o aviso ja levou o foco a marca e o foco abre a lista; senao, a setinha abre
    const lista = page.getByTestId('cbbe3-101-lista');
    if (!(await lista.isVisible())) await tocar(page, page.getByTestId('cbbe3-101-abrir'));
    await lista.waitFor();
    const grupos = await lista.getByTestId('cbbe3-101-grupo').allInnerTexts();
    ok(`${nome}: setinha mostra "${vf.marcasPopulares}" e "${vf.marcasTodas}"`, grupos.length === 2 && grupos[0].toLowerCase() === vf.marcasPopulares.toLowerCase() && grupos[1].toLowerCase() === vf.marcasTodas.toLowerCase(), JSON.stringify(grupos));
    const primeiras = (await lista.getByRole('option').allInnerTexts()).slice(0, 3);
    ok(`${nome}: lista comeca por Toyota, Volkswagen, BMW`, primeiras.join(',') === 'Toyota,Volkswagen,BMW', primeiras.join(','));
    if (prints) await page.screenshot({ path: `${OUT}/carro-lista-marcas-${idioma}-${largura}-${motor}.png` });
    await marcaEl.click();
    await marcaEl.fill('Тойота');
    const op = page.getByTestId('cbbe3-101-lista').getByRole('option', { name: 'Toyota', exact: true });
    ok(`${nome}: "Тойота" acha Toyota na lista`, await op.isVisible().catch(() => false));
    await marcaEl.evaluate((e) => e.blur());
    await sleep(600);
    ok(`${nome}: "Тойота" vira a marca do catalogo "Toyota"`, (await marcaEl.inputValue()) === 'Toyota', await marcaEl.inputValue());
  } else {
    await marcaEl.click();
    await marcaEl.fill('Kaipan');
    ok(`${nome}: marca fora do catalogo oferece "usar o que escrevi"`, await page.getByTestId('cbbe3-101-lista').getByRole('option').last().innerText().then((t) => t.includes('Kaipan')).catch(() => false));
    await marcaEl.evaluate((e) => e.blur());
    await sleep(600);
    ok(`${nome}: marca livre "Kaipan" fica`, (await marcaEl.inputValue()) === 'Kaipan');
  }
  ok(`${nome}: marca escolhida -> aviso some (bug 16/11)`, (await aviso.count()) === 0);
  // Edasi sem modelo: aviso do modelo
  await tocar(page, edasiCarro);
  await sleep(500);
  ok(`${nome}: sem modelo -> aviso "${ps.faltaModelo}"`, (await aviso.innerText().catch(() => '')) === ps.faltaModelo);
  ok(`${nome}: funil _modelo`, funil.includes('edasi_bloqueado_carro_modelo'));
  ok(`${nome}: foco no modelo`, (await ativo()) === 'cbbe3-102', await ativo());
  if (marca === 'livre') {
    await modeloEl.fill('57');
    await modeloEl.evaluate((e) => e.blur());
  } else {
    await modeloEl.click();
    await modeloEl.fill('Coro');
    await page.getByTestId('cbbe3-102-lista').getByRole('option', { name: 'Corolla', exact: true }).click();
  }
  await sleep(600);
  ok(`${nome}: modelo escolhido -> aviso some`, (await aviso.count()) === 0);
  if (anoInvalido) {
    await anoEl.fill('');
    await anoEl.pressSequentially('20a1e');
    ok(`${nome}: ano aceita so digitos ("20a1e" -> "201")`, (await anoEl.inputValue()) === '201', await anoEl.inputValue());
    ok(`${nome}: ano incompleto ainda sem aviso`, (await page.getByTestId('ano-invalido').count()) === 0);
    await tocar(page, edasiCarro);
    await sleep(500);
    ok(`${nome}: ano invalido -> aviso ANO_INVALIDO e foco no ano`, (await aviso.innerText().catch(() => '')) === m.erros.ANO_INVALIDO && (await page.getByTestId('ano-invalido').isVisible()) && (await ativo()) === 'cbbe3-103');
    ok(`${nome}: funil _ano`, funil.includes('edasi_bloqueado_carro_ano'));
    await anoEl.fill('1800');
    ok(`${nome}: 1800 -> aviso sob o ano`, await page.getByTestId('ano-invalido').isVisible());
    await anoEl.fill('2019');
    await sleep(300);
    ok(`${nome}: ano corrigido -> avisos somem`, (await aviso.count()) === 0 && (await page.getByTestId('ano-invalido').count()) === 0);
    await anoEl.fill(''); // e fica SEM ano (opcional)
  }
  ok(`${nome}: ano vazio`, (await anoEl.inputValue()) === '');
  if (prints) await page.screenshot({ path: `${OUT}/carro-preenchido-${idioma}-${largura}-${motor}.png`, fullPage: true });
  ok(`${nome}: passo do carro sem transbordo`, (await sw()) <= 0, String(await sw()));
  await tocar(page, edasiCarro);
  const local = page.getByTestId('passo-local');
  await local.waitFor({ timeout: 10000 });
  ok(`${nome}: SEM ano -> segue para o endereco`, await local.isVisible());
  await sleep(1500);
  ok(`${nome}: entrar no passo do endereco NAO pede localizacao`, (await geo()) === 0, String(await geo()));
  ok(`${nome}: titulo "${ps.localTitulo}", ajuda e placeholder`, (await local.locator('h2').innerText()) === ps.localTitulo && (await page.locator('#pedido-endereco-ajuda').innerText()) === ps.localAjuda && (await page.locator('#pedido-endereco').getAttribute('placeholder')) === ps.localPlaceholder);
  ok(`${nome}: botao "${ps.localUsarMinha}"`, (await page.getByTestId('usar-localizacao').innerText()).trim() === ps.localUsarMinha);
  if (prints) await page.screenshot({ path: `${OUT}/endereco-${idioma}-${largura}-${motor}.png`, fullPage: true });
  ok(`${nome}: passo do endereco sem transbordo`, (await sw()) <= 0, String(await sw()));
  const edasiLocal = local.getByRole('button', { name: m.clienteNovaSolicitacao.next, exact: true });
  await tocar(page, edasiLocal);
  await sleep(400);
  ok(`${nome}: endereco vazio -> "${ps.faltaEndereco}"`, (await local.getByTestId('falta-aviso').innerText().catch(() => '')) === ps.faltaEndereco);
  if (gps === 'negado') {
    await tocar(page, page.getByTestId('usar-localizacao'));
    await page.getByTestId('localizacao-negada').waitFor({ timeout: 15000 }).catch(() => {});
    ok(`${nome}: localizacao recusada -> aviso "${ps.localNegado.slice(0, 25)}..." e o botao some`, (await page.getByTestId('localizacao-negada').isVisible().catch(() => false)) && (await page.getByTestId('usar-localizacao').count()) === 0);
    ok(`${nome}: 1 pedido de localizacao (so o toque)`, (await geo()) === 1, String(await geo()));
    ok(`${nome}: funil local_gps + local_gps_negado`, funil.includes('local_gps') && funil.includes('local_gps_negado'));
    if (prints) await page.screenshot({ path: `${OUT}/endereco-gps-negado-${idioma}-${largura}-${motor}.png`, fullPage: true });
  }
  if (gps === 'permitido') {
    await tocar(page, page.getByTestId('usar-localizacao'));
    await page.waitForFunction(() => (document.getElementById('pedido-endereco')?.value || '').length > 0, null, { timeout: 20000 }).catch(() => {});
    const v = await page.locator('#pedido-endereco').inputValue();
    ok(`${nome}: "usar minha localizacao" preenche o campo`, /Tallinn|Таллинн/.test(v), v);
    ok(`${nome}: 1 pedido de localizacao (so o toque)`, (await geo()) === 1, String(await geo()));
    if (prints) await page.screenshot({ path: `${OUT}/endereco-gps-${idioma}-${largura}-${motor}.png`, fullPage: true });
  } else {
    await page.locator('#pedido-endereco').fill(endereco);
    await sleep(200);
    await page.keyboard.press('Escape');
  }
  ok(`${nome}: aviso do endereco some ao escrever`, (await local.getByTestId('falta-aviso').count()) === 0);
  await tocar(page, edasiLocal);
  await page.getByTestId('passo-contato').waitFor({ timeout: 10000 });
  const email = `melh-${motor}-${idioma}-${largura}-${marca}-${tag}@example.test`.toLowerCase();
  await page.locator('#pedido-nome').fill('TESTE AUTOMATICO');
  await page.locator('#pedido-email').fill(email);
  await page.getByTestId('aceito-termos').check();
  const t1 = Date.now();
  await tocar(page, page.getByRole('button', { name: ps.enviarPedido }));
  await page.getByTestId('passo-codigo').waitFor({ timeout: 40000 });
  ok(`${nome}: pedido enviado (tela do codigo) - "${endereco || 'GPS'}" virou coordenada`, await page.getByTestId('passo-codigo').isVisible());
  const c = await codigoDe(email, t1);
  ok(`${nome}: e-mail do codigo sem "undefined"/"null"`, !!c.codigo && !/undefined|null(?![a-z])/i.test(c.html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')));
  const pend = (await admin.from('pedidos_pendentes').select('user_id').ilike('email', email).maybeSingle()).data;
  if (pend) contas.add(pend.user_id);
  await page.locator('#pedido-codigo').fill(c.codigo || '');
  const t2 = Date.now();
  await tocar(page, page.getByTestId('confirmar-codigo'));
  await page.getByTestId('criar-senha').waitFor({ timeout: 30000 }).catch(() => {});
  await tocar(page, page.getByTestId('criar-senha-agora-nao')).catch(() => {});
  await page.waitForURL(/orcamentos\//, { timeout: 30000 }).catch(() => {});
  ok(`${nome}: confirmado -> pedido aberto`, /orcamentos\//.test(page.url()), page.url());
  const perfil = (await admin.from('profiles').select('id').ilike('email', email).maybeSingle()).data;
  if (perfil) contas.add(perfil.id);
  const sol = (await admin.from('solicitacoes').select('id, numero, latitude, longitude, endereco, pais, veiculo:veiculos(fipe_marca, fipe_modelo, fipe_ano, placa)').eq('cliente_id', perfil?.id).maybeSingle()).data;
  const esperado = { atalho: ['Toyota', 'Corolla'], cirilico: ['Toyota', 'Corolla'], livre: ['Kaipan', '57'] }[marca];
  ok(`${nome}: pedido no banco com o carro ${esperado.join(' ')} e ano vazio`, sol?.veiculo?.fipe_marca === esperado[0] && sol?.veiculo?.fipe_modelo === esperado[1] && sol?.veiculo?.fipe_ano === '', JSON.stringify(sol?.veiculo));
  const dentro = sol && sol.latitude > 59.35 && sol.latitude < 59.5 && sol.longitude > 24.55 && sol.longitude < 25.0;
  ok(`${nome}: coordenada de Tallinn (${sol?.latitude}, ${sol?.longitude}), endereco "${sol?.endereco}", pais ${sol?.pais}`, !!dentro && sol.endereco.length > 2);
  if (endereco && /Lasnam|Ласнам/.test(endereco)) ok(`${nome}: Lasnamäe fica a leste do centro (lon > 24.79)`, sol?.longitude > 24.79, String(sol?.longitude));
  if (gps === 'permitido') ok(`${nome}: coordenada = a do aparelho`, Math.abs(sol?.latitude - 59.437) < 0.001 && Math.abs(sol?.longitude - 24.7536) < 0.001, `${sol?.latitude}, ${sol?.longitude}`);
  // oficinas avisadas como antes (e-mail da oficina local de Tallinn)
  let aviso1 = [];
  for (let i = 0; i < 30 && !aviso1.length; i++) { aviso1 = emailsDepois(OFICINA_LOCAL, t2); if (!aviso1.length) await sleep(500); }
  const htmlOf = aviso1.length ? fs.readFileSync(path.join(EMAILS, aviso1.at(-1)), 'utf8') : '';
  ok(`${nome}: oficina local (${OFICINA_LOCAL}) recebeu o e-mail do pedido`, aviso1.length > 0 && htmlOf.includes(esperado[0]), aviso1.at(-1) || 'nenhum');
  ok(`${nome}: e-mail da oficina sem "undefined"`, !!htmlOf && !/undefined/.test(htmlOf));
  const notif = (await admin.from('notificacoes').select('id', { count: 'exact', head: true }).eq('dados->>solicitacao_id', sol?.id)).count;
  ok(`${nome}: notificacoes das oficinas criadas (${notif})`, notif > 0);
  ok(`${nome}: sem erro de pagina`, !erros.length, erros.join(' | '));
  await ctx.close();
}

// ======================= cadastro de oficina =======================
async function cadastroOficina(B, { motor, idioma, largura, prints = false }) {
  const m = M(idioma);
  const cd = m.cadastro;
  const nome = `cadastro ${motor} ${idioma} ${largura}`;
  const ctx = await novoContexto(B, motor, largura);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  const funil = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/funil')) { try { funil.push(JSON.parse(r.postData() || '{}').etapa); } catch {} } });
  const ativo = () => page.evaluate(() => document.activeElement?.id || '');
  const antes = { passo2: await total('cadastro_site', 'passo2'), decl: await total('cadastro_site', 'declaracao_bloqueada') };
  await page.goto(`${SITE}/ee/${idioma}/${idioma === 'ru' ? 'registratsiya' : 'registreeru'}?tipo=oficina`, { waitUntil: 'networkidle' });
  const email = `melh-of-${idioma}-${tag}@example.test`;
  await page.locator('#c6791-5').fill('TESTE AUTOMATICO');
  await page.locator('#c6791-6').fill(email);
  await page.locator('#c6791-8').fill(senha);
  await page.locator('#cadastro-termos').check();
  await tocar(page, page.locator('main form button[type=submit]').first());
  await page.locator('#c6791-9').waitFor({ timeout: 10000 });
  await sleep(800);
  ok(`${nome}: funil passo2`, funil.includes('passo2'), JSON.stringify(funil));
  await page.locator('#c6791-9').fill(`TESTE AUTOMATICO ${tag}`);
  await page.locator('#c6791-10').fill('12345678');
  const rua = page.locator('[id^="cadastro-end"]').filter({ has: page.locator('xpath=self::input') }).first();
  await rua.fill('Tartu mnt 50'); await sleep(2500);
  const op = page.getByRole('option').first(); if (await op.isVisible().catch(() => false)) await op.click();
  await sleep(1500);
  for (const i of await page.locator('[id^="cadastro-end"]:visible').all()) {
    if ((await i.evaluate((e) => e.tagName)) === 'INPUT' && !(await i.inputValue())) await i.fill((await i.getAttribute('id')).includes('cep') ? '10111' : 'Tallinn');
  }
  const criar = page.getByRole('button', { name: cd.criarContaOficina, exact: true });
  ok(`${nome}: "${cd.criarContaOficina}" clicavel sem servico e sem declaracao`, await criar.isEnabled());
  // sem servico
  await tocar(page, criar);
  await sleep(600);
  ok(`${nome}: sem servico -> aviso "${cd.faltaServicos}" e foco no 1o servico`, (await page.getByTestId('falta-servicos').innerText().catch(() => '')) === cd.faltaServicos && (await ativo()) === 'cadastro-servico-0', await ativo());
  ok(`${nome}: funil servicos_bloqueado`, funil.includes('servicos_bloqueado'));
  await page.locator('#cadastro-servico-1').check();
  ok(`${nome}: marcou um servico -> aviso some`, (await page.getByTestId('falta-servicos').count()) === 0);
  // sem declaracao
  await tocar(page, criar);
  await sleep(600);
  const falta = page.getByTestId('falta-declaracao');
  ok(`${nome}: sem declaracao -> aviso ao lado da caixinha`, (await falta.innerText().catch(() => '')) === m.erros.DECLARACAO_OBRIGATORIA, await falta.innerText().catch(() => ''));
  ok(`${nome}: foco na caixinha da declaracao`, (await ativo()) === 'cadastro-declaracao', await ativo());
  ok(`${nome}: funil declaracao_bloqueada`, funil.includes('declaracao_bloqueada'), JSON.stringify(funil));
  ok(`${nome}: continua no passo da oficina`, await page.locator('#c6791-9').isVisible());
  if (prints) {
    await falta.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/cadastro-sem-declaracao-${idioma}-${largura}-${motor}.png` });
  }
  await page.locator('#cadastro-declaracao').check();
  ok(`${nome}: marcou a declaracao -> aviso some`, (await falta.count()) === 0);
  await tocar(page, criar);
  const enviado = await page.getByRole('heading', { name: cd.verifiqueTitulo }).waitFor({ timeout: 30000 }).then(() => true, () => false);
  ok(`${nome}: com a declaracao -> conta criada ("${cd.verifiqueTitulo}")`, enviado);
  const pf = (await admin.from('profiles').select('id, tipo, responsavel_declarado_em').eq('email', email).maybeSingle()).data;
  if (pf) contas.add(pf.id);
  const of = pf ? (await admin.from('oficinas').select('id, especialidades, latitude, longitude').eq('profile_id', pf.id).maybeSingle()).data : null;
  ok(`${nome}: banco - perfil oficina com declaracao e oficina com servico`, pf?.tipo === 'oficina' && !!pf?.responsavel_declarado_em && of?.especialidades?.length === 1, JSON.stringify({ pf, of }));
  ok(`${nome}: funil gravado no banco (passo2 e declaracao_bloqueada +1)`, (await total('cadastro_site', 'passo2')) > antes.passo2 && (await total('cadastro_site', 'declaracao_bloqueada')) > antes.decl);
  ok(`${nome}: sem erro de pagina`, !erros.length, erros.join(' | '));
  await ctx.close();
}

// CASOS=1,5 roda so esses (numeros abaixo); sem CASOS roda todos
const CASOS = [
  ['chromium', pedido, { motor: 'chromium', idioma: 'et', largura: 390, marca: 'atalho', endereco: 'Tallinn', anoInvalido: true, gps: 'negado', prints: true }],
  ['chromium', pedido, { motor: 'chromium', idioma: 'ru', largura: 390, marca: 'cirilico', endereco: 'Ласнамяэ', prints: true }],
  ['chromium', pedido, { motor: 'chromium', idioma: 'et', largura: 1280, marca: 'livre', endereco: 'Lasnamäe', prints: true }],
  ['chromium', pedido, { motor: 'chromium', idioma: 'ru', largura: 1280, marca: 'atalho', endereco: '', gps: 'permitido', prints: true }],
  ['chromium', cadastroOficina, { motor: 'chromium', idioma: 'et', largura: 390, prints: true }],
  ['chromium', cadastroOficina, { motor: 'chromium', idioma: 'ru', largura: 1280, prints: true }],
  ['webkit', pedido, { motor: 'webkit', idioma: 'et', largura: 390, marca: 'cirilico', endereco: 'Lasnamäe', anoInvalido: true, prints: true }],
  ['webkit', pedido, { motor: 'webkit', idioma: 'ru', largura: 390, marca: 'atalho', endereco: 'Таллинн', prints: true }],
];
try {
  const quais = process.env.CASOS ? process.env.CASOS.split(',').map(Number) : CASOS.map((_, i) => i + 1);
  const motores = {};
  for (const n of quais) {
    const [motor, fn, opts] = CASOS[n - 1];
    motores[motor] ||= await (motor === 'webkit' ? webkit.launch({ executablePath: WEBKIT }) : chromium.launch({ executablePath: CHROME }));
    console.log(`--- caso ${n}: ${fn.name} ${JSON.stringify(opts)}`);
    // um caso que cai nao derruba os outros
    try { await fn(motores[motor], opts); } catch (e) { falhas++; console.log(`FALHA caso ${n} excecao`, (e.message || '').split(/\r?\n/).slice(0, 3).join(' | ')); }
  }
  for (const b of Object.values(motores)) await b.close();
} catch (e) {
  falhas++;
  console.log('FALHA excecao', e.stack || e.message);
} finally {
  for (const id of contas) {
    const { data: sols } = await admin.from('solicitacoes').select('id').eq('cliente_id', id);
    for (const s of sols || []) {
      await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', s.id);
      await admin.from('solicitacao_fotos').delete().eq('solicitacao_id', s.id);
    }
    await admin.from('solicitacoes').delete().eq('cliente_id', id);
    await admin.from('veiculos').delete().eq('profile_id', id);
    await admin.from('pedidos_pendentes').delete().eq('user_id', id);
    await admin.from('codigos_login').delete().eq('user_id', id);
    await admin.from('oficinas').delete().eq('profile_id', id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`limpeza: ${contas.size} conta(s) apagada(s)`);
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
}
