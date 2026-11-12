// Teste EXAUSTIVO LOCAL do pedido sem cadastro (pedido do dono 06/11: "testes
// exaustivos com todas as linguas"). Cada pedaco roda num processo proprio
// (o navegador de teste caia por memoria em baterias longas): o modo "tudo"
// chama este mesmo arquivo para cada pedaco e repete ate 2x se cair.
//   node pedido-exaustivo.mjs <.env.local>                 -> tudo
//   node pedido-exaustivo.mjs <.env.local> site et 390      -> um pedaco
//   node pedido-exaustivo.mjs <.env.local> app ru
//   node pedido-exaustivo.mjs <.env.local> extra <caso>
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const ENV = process.argv[2];
const env = Object.fromEntries(fs.readFileSync(ENV, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = 'http://localhost:3100';
const APP = 'http://localhost:8090';
const EMAILS = env.EMAIL_PASTA_TESTE;
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/exaustivo';
fs.mkdirSync(OUT, { recursive: true });
const WEBMSG = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/site/apps/web/messages';
const MOB = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/site/apps/mobile/i18n/locales';
const LOCS = ['et', 'ru', 'en', 'it', 'pt-PT', 'pt'];
const PEDIDO = { et: '/ee/et/paring', ru: '/ee/ru/zayavka', en: '/ee/en/request', it: '/it/it/richiesta', 'pt-PT': '/pt/pt/pedido', pt: '/br/pt/pedido' };
const PREF = { et: '/ee/et', ru: '/ee/ru', en: '/ee/en', it: '/it/it', 'pt-PT': '/pt/pt', pt: '/br/pt' };
// telefone: prefixo que ja vem marcado em cada mercado e um numero local de exemplo
const DDI = { et: '372', ru: '372', en: '372', it: '39', 'pt-PT': '351', pt: '55' };
const NUM = { et: '5123 4567', ru: '5123 4567', en: '5123 4567', it: '333 123 4567', 'pt-PT': '912 345 678', pt: '(11) 91234-5678' };
const CIDADE = { et: 'Kristiine', ru: 'Mustamäe', en: 'Kesklinn', it: 'Roma', 'pt-PT': 'Lisboa', pt: 'São Paulo' };
const LOC_BROWSER = { pt: 'pt-BR', 'pt-PT': 'pt-PT', en: 'en-GB', et: 'et-EE', it: 'it-IT', ru: 'ru-RU' };
const GEO = { et: [59.42, 24.70], ru: [59.40, 24.68], en: [59.437, 24.745], it: [41.9, 12.5], 'pt-PT': [38.72, -9.14], pt: [-23.55, -46.63] };
// palavras que so aparecem no idioma certo (texto de outro idioma vazando na tela)
const CRUA = /\b(pedidoSemConta|clienteNovaSolicitacao|constants|erros|veiculoForm|auth|novaSolicitacao|common|veiculos|cliente[A-Z]\w+|orcamentos|acompanhamento)\.[a-zA-Z_]+/;

const msgWeb = (l) => {
  const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.json`, 'utf8'));
  for (const area of ['cliente', 'misc', 'auth']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.${area}.json`, 'utf8')));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};
const msgApp = (l) => {
  const j = JSON.parse(fs.readFileSync(`${MOB}/${l}.json`, 'utf8'));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], j) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Exaust-' + crypto.randomBytes(6).toString('hex');
const ipFalso = () => `10.88.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
const FOTO = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/public/apple-touch-icon.png';
let falhas = 0;
const linhas = [];
const ok = (n, c, x = '') => { if (!c) falhas++; const s = `${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 300) : ''}`; linhas.push(s); console.log(s); };
const contas = new Set();

const codigoDe = async (email, depois) => {
  for (let i = 0; i < 40; i++) {
    const arq = fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort();
    if (arq.length) {
      const html = fs.readFileSync(path.join(EMAILS, arq.at(-1)), 'utf8');
      const txt = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
      const m = txt.match(/(?<![\d#])\d{6}(?!\d)/);
      if (m) return { codigo: m[0], assunto: (html.match(/assunto: (.*?) -->/) || [])[1] || '', texto: txt };
    }
    await sleep(300);
  }
  return { codigo: null, assunto: '', texto: '' };
};
const lancar = () => chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const contexto = (browser, l, largura) => browser.newContext({
  viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500,
  locale: LOC_BROWSER[l], geolocation: { latitude: GEO[l][0], longitude: GEO[l][1] }, permissions: ['geolocation'],
  extraHTTPHeaders: { 'x-real-ip': ipFalso() },
});
const vigiar = (page) => {
  const e = [];
  page.on('pageerror', (x) => e.push('JS: ' + x.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|Download the React DevTools/.test(m.text())) e.push('console: ' + m.text()); });
  return e;
};
const checar = async (page, nome) => {
  const t = await page.innerText('body');
  const crua = t.match(CRUA) || t.match(/\?\?[a-zA-Z]+\./);
  ok(`${nome}: sem chave sem traducao`, !crua, crua?.[0]);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(`${nome}: sem rolagem lateral`, sw <= 1, String(sw));
  return t;
};
const foto = async (page, nome) => page.screenshot({ path: `${OUT}/${nome}.png`, fullPage: true }).catch(() => {});
const noAlto = async (page, testid, nome) => {
  const r = await page.getByTestId(testid).evaluate((el) => { const b = el.getBoundingClientRect(); return { top: b.top, h: innerHeight }; });
  ok(`${nome}: passo aparece no alto da tela`, r.top >= 0 && r.top < r.h * 0.6, JSON.stringify(r));
};

// troca de idioma como a pessoa faz: seletor do cabecalho (celular) ou links do rodape (computador)
const OUTRO = { et: 'ru', ru: 'et', en: 'et', it: 'en', 'pt-PT': 'pt', pt: 'pt-PT' };
async function trocarIdioma(page, de, para, largura) {
  const link = `a[hreflang][href="${PEDIDO[para]}"]`;
  if (largura < 500) {
    await page.locator('button[aria-haspopup="true"][aria-expanded]').first().click();
    await page.locator(link).locator('visible=true').first().click();
  } else {
    await page.locator('footer ' + link).first().scrollIntoViewIfNeeded();
    await page.locator('footer ' + link).first().click();
  }
  await page.waitForURL((u) => u.pathname === PEDIDO[para], { timeout: 15000 });
  await page.waitForTimeout(1500);
}

// ---------------------------------------------------------------- SITE
async function site(l, largura) {
  const T = msgWeb(l);
  const nm = `site ${l} ${largura}`;
  const browser = await lancar();
  try {
    const ctx = await contexto(browser, l, largura);
    await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
    const page = await ctx.newPage();
    const erros = vigiar(page);
    const r = await page.goto(SITE + PEDIDO[l], { waitUntil: 'networkidle' });
    ok(`${nm}: abre (200)`, r.status() === 200, r.status());
    ok(`${nm}: titulo no idioma`, (await page.title()).includes(T('pedidoSemConta.titulo')), await page.title());
    ok(`${nm}: fora do Google`, /noindex/.test(await page.locator('meta[name=robots]').getAttribute('content') || ''));
    let t = await checar(page, `${nm} tipos`);
    ok(`${nm}: subtitulo no idioma`, t.includes(T('pedidoSemConta.subtitulo')));
    ok(`${nm}: "ja tem conta? entrar"`, t.includes(T('pedidoSemConta.jaTemConta')));
    const linkLogin = await page.getByRole('link', { name: T('pedidoSemConta.entrar'), exact: true }).last().getAttribute('href');
    ok(`${nm}: link entrar no mercado certo`, (linkLogin || '').startsWith(PREF[l] + '/'), linkLogin);

    // servico (varia por idioma): tipo, 1 servico da lista, observacao, foto, urgencia
    const tipos = { et: 'rehvid', ru: 'mecanica', en: 'revisao', it: 'eletrica', 'pt-PT': 'pneu', pt: 'mecanica' };
    const tipo = tipos[l] === 'rehvid' ? 'pneu' : tipos[l];
    ok(`${nm}: 1a pagina so com os tipos (sem botao avancar)`, (await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).count()) === 0);
    await foto(page, `site-${l}-${largura}-0tipos`);
    await page.getByRole('button', { name: new RegExp(T(`constants.tiposServico.${tipo}`)) }).first().click();
    // um toque no tipo ja abre a pagina "o que precisa"
    await page.getByTestId('passo-detalhe').waitFor({ timeout: 5000 });
    await noAlto(page, 'passo-detalhe', nm + ' detalhe');
    t = await checar(page, `${nm} detalhe`);
    ok(`${nm}: titulo com o tipo escolhido`, t.includes(T(`constants.tiposServico.${tipo}`)));
    ok(`${nm}: explica escrever ou procurar`, t.includes(T('pedidoSemConta.detalheTexto')));
    const avancar = page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true });
    // desde 12/11 o Edasi fica clicavel: sem texto, servico nem foto mostra o que falta e nao avanca
    await avancar.click();
    ok(`${nm}: avancar sem texto nem servico avisa e fica no passo`, await page.getByTestId('passo-detalhe').getByTestId('falta-aviso').isVisible());
    // busca na lista: parte do nome do 1o servico (sem acento/maiusculas) acha; palavra sem sentido mostra o aviso
    const rotulos = () => page.getByTestId('lista-servicos').locator('label').allInnerTexts();
    let nomes = await rotulos();
    ok(`${nm}: lista do tipo aparece`, nomes.length > 1, String(nomes.length));
    const verMais = page.getByTestId('ver-mais');
    const temVerMais = (await verMais.count()) > 0;
    if (temVerMais) {
      ok(`${nm}: lista curta mostra 6`, nomes.length === 6, String(nomes.length));
      await verMais.click();
      nomes = await rotulos();
      ok(`${nm}: "ver todos" mostra a lista inteira`, nomes.length > 6 && (await verMais.innerText()).includes(T('pedidoSemConta.verMenos')), String(nomes.length));
      // marcado la embaixo continua aparecendo depois de "ver menos"
      await page.getByTestId('lista-servicos').locator('input[type=checkbox]').last().check();
      await verMais.click();
      const curtos = await rotulos();
      ok(`${nm}: "ver menos" mantem o marcado visivel`, curtos.length === 7 && curtos.some((x) => x.trim() === nomes.at(-1).trim()), String(curtos.length));
      await foto(page, `site-${l}-${largura}-1cvermais`);
    }
    const pedaco = nomes[1].trim().slice(0, 5).toUpperCase();
    await page.locator('#pedido-busca').fill(pedaco);
    const achados = await rotulos();
    ok(`${nm}: busca "${pedaco}" filtra a lista`, achados.length >= 1 && achados.length < nomes.length && achados.some((x) => x.trim() === nomes[1].trim()), JSON.stringify(achados));
    await page.locator('#pedido-busca').fill('zzqqxx');
    ok(`${nm}: busca sem resultado explica o que fazer`, (await page.getByTestId('lista-servicos').innerText()).includes(T('pedidoSemConta.semResultadoBusca')));
    await foto(page, `site-${l}-${largura}-1bbusca-vazia`);
    await page.locator('#pedido-busca').fill(pedaco);
    await page.getByTestId('lista-servicos').locator('input[type=checkbox]').first().check();
    ok(`${nm}: marcar um servico ja tira o aviso`, (await page.getByTestId('passo-detalhe').getByTestId('falta-aviso').count()) === 0);
    await page.locator('#pedido-busca').fill('');
    await page.locator('#pedido-descricao').fill(`Teste ${l} ${largura}`);
    await page.locator('input[type=file][multiple]').setInputFiles(FOTO); // galeria (camera e um campo a parte desde 10/11)
    await page.waitForTimeout(400);
    ok(`${nm}: foto aparece`, (await page.locator('img[alt]').filter({ has: page.locator('xpath=.') }).count()) > 0 || (await page.locator('.aspect-square img').count()) > 0);
    await page.getByRole('button', { name: new RegExp(T('constants.urgencias.alta')) }).first().click();
    {
      const marcadosAntes = await page.getByTestId('lista-servicos').locator('input:checked').count();
      const outro = OUTRO[l]; const TO = msgWeb(outro);
      await trocarIdioma(page, l, outro, largura);
      ok(`${nm}: trocar idioma no "o que precisa" fica no mesmo passo`, await page.getByTestId('passo-detalhe').isVisible());
      ok(`${nm}: ... com o texto, os servicos e a foto`, (await page.locator('#pedido-descricao').inputValue()) === `Teste ${l} ${largura}`
        && (await page.getByTestId('lista-servicos').locator('input:checked').count()) === marcadosAntes
        && (await page.locator('.aspect-square img').count()) === 1, `marcados ${marcadosAntes}`);
      ok(`${nm}: ... e os textos no idioma novo (${outro})`, (await page.innerText('body')).includes(TO('pedidoSemConta.detalheTexto')));
      await trocarIdioma(page, outro, l, largura);
      ok(`${nm}: voltar ao idioma mantem tudo`, await page.getByTestId('passo-detalhe').isVisible() && (await page.locator('#pedido-descricao').inputValue()) === `Teste ${l} ${largura}`);
    }
    await foto(page, `site-${l}-${largura}-1detalhe`);
    await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();

    // carro
    await page.getByTestId('passo-carro').waitFor();
    await noAlto(page, 'passo-carro', nm + ' carro');
    await checar(page, `${nm} carro`);
    await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();
    ok(`${nm}: Edasi sem carro avisa e fica no passo`, await page.getByTestId('passo-carro').getByTestId('falta-aviso').isVisible());
    const marca = page.getByLabel(T('veiculoForm.labelMarca'), { exact: false }).locator('visible=true').first();
    await page.waitForFunction((el) => el.options.length > 2, await marca.elementHandle(), { timeout: 20000 });
    await marca.selectOption({ label: 'Toyota' });
    const modelo = page.getByLabel(T('veiculoForm.labelModelo'), { exact: false }).locator('visible=true').first();
    await page.waitForFunction((el) => el.options.length > 2, await modelo.elementHandle(), { timeout: 20000 });
    const opc = await modelo.locator('option').allTextContents();
    await modelo.selectOption({ label: opc.find((o) => /Corolla/.test(o)) || opc[1] });
    const ano = page.getByLabel(T('veiculoForm.labelAno'), { exact: false }).locator('visible=true').first();
    await ano.fill('2017').catch(async () => { await ano.selectOption({ index: 1 }); });
    await page.locator('#pedido-placa').fill(`${l.slice(0, 2)}${largura}`.toUpperCase());
    // voltar e avancar mantem os dados
    await page.getByRole('button', { name: T('clienteNovaSolicitacao.back'), exact: true }).click();
    await page.getByTestId('passo-detalhe').waitFor();
    ok(`${nm}: voltar do carro abre "o que precisa" com o servico marcado`, (await page.getByTestId('lista-servicos').locator('input:checked').count()) >= 1);
    ok(`${nm}: voltar mantem a descricao`, (await page.locator('#pedido-descricao').inputValue()) === `Teste ${l} ${largura}`);
    await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();
    await page.getByTestId('passo-carro').waitFor();
    ok(`${nm}: avancar de novo mantem a placa`, (await page.locator('#pedido-placa').inputValue()).length > 0);
    const marcaVolta = await marca.evaluate((el) => el.options[el.selectedIndex]?.text);
    const modeloVolta = await modelo.evaluate((el) => el.options[el.selectedIndex]?.text).catch(() => null);
    ok(`${nm}: ir e voltar mantem marca e modelo`, marcaVolta === 'Toyota' && /Corolla/.test(modeloVolta || ''), `${marcaVolta} / ${modeloVolta}`);
    await foto(page, `site-${l}-${largura}-2carro`);
    {
      const outro = OUTRO[l];
      await trocarIdioma(page, l, outro, largura);
      await page.getByTestId('passo-carro').waitFor({ timeout: 5000 });
      const m2 = page.locator('[data-testid=passo-carro] select').first();
      await page.waitForFunction((el) => el.options.length > 2 && el.selectedIndex > 0, await m2.elementHandle(), { timeout: 20000 }).catch(() => {});
      const marcaIdioma = await m2.evaluate((el) => el.options[el.selectedIndex]?.text);
      const modeloIdioma = await page.locator('[data-testid=passo-carro] select').nth(1).evaluate((el) => el.options[el.selectedIndex]?.text).catch(() => null);
      ok(`${nm}: trocar idioma no carro mantem marca, modelo e placa`, marcaIdioma === 'Toyota' && /Corolla/.test(modeloIdioma || '') && (await page.locator('#pedido-placa').inputValue()).length > 0, `${marcaIdioma} / ${modeloIdioma}`);
      await trocarIdioma(page, outro, l, largura);
      await page.getByTestId('passo-carro').waitFor({ timeout: 5000 });
    }
    await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();

    // local
    await page.getByTestId('passo-local').waitFor();
    await noAlto(page, 'passo-local', nm + ' local');
    await checar(page, `${nm} local`);
    await page.locator('#pedido-endereco').fill(CIDADE[l]);
    await page.waitForTimeout(2500);
    const sug = page.getByRole('option').first();
    const temSug = await sug.isVisible().catch(() => false);
    ok(`${nm}: sugestoes de endereco aparecem`, temSug);
    if (temSug) await sug.click();
    await foto(page, `site-${l}-${largura}-3local`);
    await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();

    // contato
    await page.getByTestId('passo-contato').waitFor();
    await noAlto(page, 'passo-contato', nm + ' contato');
    t = await checar(page, `${nm} contato`);
    ok(`${nm}: textos do contato no idioma (sem campo de senha)`, t.includes(T('pedidoSemConta.contatoTitulo')) && t.includes(T('pedidoSemConta.acessoTexto')) && (await page.locator('#pedido-senha').count()) === 0);
    const hrefs = await page.locator('[data-testid=passo-contato] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    ok(`${nm}: termos e privacidade no mercado certo`, hrefs.length >= 2 && hrefs.every((h) => (h || '').startsWith(PREF[l] + '/')), JSON.stringify(hrefs));
    const email = `exaust-${l.toLowerCase()}-${largura}-${tag}@example.test`;
    await page.locator('#pedido-nome').fill(`Teste ${l}`);
    await page.locator('#pedido-email').fill(`exaust@hotmial.com`);
    ok(`${nm}: sugere hotmail.com`, (await page.getByTestId('sugestao-email').innerText()).includes('hotmail.com'));
    await page.getByTestId('sugestao-email').click();
    ok(`${nm}: sugestao aplicada`, (await page.locator('#pedido-email').inputValue()) === 'exaust@hotmail.com');
    await page.locator('#pedido-email').fill(email);
    const enviar = page.getByRole('button', { name: T('pedidoSemConta.enviarPedido') });
    await enviar.click();
    ok(`${nm}: sem aceitar os termos nao envia (avisa)`, await page.getByTestId('passo-contato').getByTestId('falta-aviso').isVisible());
    await page.getByTestId('aceito-termos').check();
    ok(`${nm}: prefixo do telefone ja no pais do mercado (+${DDI[l]})`, (await page.getByTestId('passo-contato').getByTestId('prefixo-telefone').inputValue()) === DDI[l]);
    await page.locator('#pedido-telefone').fill(NUM[l]);
    {
      const outro = OUTRO[l];
      await trocarIdioma(page, l, outro, largura);
      ok(`${nm}: trocar idioma no contato mantem nome, e-mail, telefone e termos`, await page.getByTestId('passo-contato').isVisible()
        && (await page.locator('#pedido-email').inputValue()) === email
        && (await page.locator('#pedido-telefone').inputValue()).length > 5 && await page.getByTestId('aceito-termos').isChecked());
      await trocarIdioma(page, outro, l, largura);
    }
    await foto(page, `site-${l}-${largura}-4contato`);
    const t0 = Date.now();
    await enviar.click();

    // codigo
    await page.getByTestId('passo-codigo').waitFor({ timeout: 30000 });
    await noAlto(page, 'passo-codigo', nm + ' codigo');
    t = await checar(page, `${nm} codigo`);
    ok(`${nm}: tela do codigo mostra o e-mail`, t.includes(email));
    const c = await codigoDe(email, t0);
    ok(`${nm}: e-mail do codigo chegou`, !!c.codigo);
    ok(`${nm}: e-mail do codigo sem chave crua`, !CRUA.test(c.texto) && !/undefined|\{\w+\}/.test(c.texto), c.assunto);
    const p = (await admin.from('pedidos_pendentes').select('user_id, idioma, telefone').ilike('email', email).maybeSingle()).data;
    if (p) contas.add(p.user_id);
    ok(`${nm}: pendente com o idioma da pagina`, p?.idioma === l, p?.idioma);
    await page.locator('#pedido-codigo').fill('12ab');
    ok(`${nm}: campo do codigo so aceita numeros`, (await page.locator('#pedido-codigo').inputValue()) === '12');
    const errado = c.codigo === '000000' ? '111111' : '000000';
    await page.locator('#pedido-codigo').fill(errado);
    await page.getByTestId('confirmar-codigo').click();
    await page.locator('[role=alert]:not(#__next-route-announcer__)').first().waitFor({ timeout: 10000 });
    ok(`${nm}: codigo errado avisa no idioma`, (await page.locator('[role=alert]:not(#__next-route-announcer__)').first().innerText()).includes(T('erros.CODIGO_INVALIDO')), await page.locator('[role=alert]:not(#__next-route-announcer__)').first().innerText());
    ok(`${nm}: reenviar espera 30 s`, (await page.getByText(new RegExp(T('pedidoSemConta.reenviarEm', { s: '\\d+' }).replace(/[()]/g, '\\$&'))).count()) > 0);
    await foto(page, `site-${l}-${largura}-5codigo`);
    await page.locator('#pedido-codigo').fill(c.codigo || '');
    await page.getByTestId('confirmar-codigo').click();
    const criarSenha = await page.getByTestId('criar-senha').waitFor({ timeout: 30000 }).then(() => true, () => false);
    ok(`${nm}: tela cheia "crie a sua senha" depois do codigo (${new URL(page.url()).pathname})`, criarSenha && (await page.getByTestId('passo-codigo').count()) === 0, page.url());
    t = await checar(page, `${nm} criar senha`);
    ok(`${nm}: "crie a sua senha" no idioma`, t.includes(T('criarSenha.titulo')) && t.includes(T('criarSenha.agoraNao')));
    await foto(page, `site-${l}-${largura}-5b-criar-senha`);
    await page.getByTestId('criar-senha-agora-nao').click();
    await page.waitForURL(/orcamentos\//, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const sol = (await admin.from('solicitacoes').select('id, tipo, urgencia, descricao, veiculo:veiculos(placa, fipe_marca)').eq('cliente_id', p?.user_id).maybeSingle()).data;
    ok(`${nm}: pedido criado (tipo, urgencia, carro)`, sol?.tipo === tipo && sol?.urgencia === 'alta' && sol?.veiculo?.fipe_marca === 'Toyota', JSON.stringify(sol));
    ok(`${nm}: abre o pedido logado (${new URL(page.url()).pathname})`, page.url().includes(sol?.id || 'x') && page.url().includes(PREF[l]), page.url());
    t = await checar(page, `${nm} pedido aberto`);
    ok(`${nm}: pedido mostra a descricao`, t.includes(`Teste ${l} ${largura}`));
    ok(`${nm}: descricao leva o servico marcado`, (sol?.descricao || '').startsWith(T('clienteNovaSolicitacao.servicesPrefix')), sol?.descricao);
    const nFotos = (await admin.from('solicitacao_fotos').select('id').eq('solicitacao_id', sol?.id)).data?.length;
    ok(`${nm}: foto no pedido`, nFotos === 1, String(nFotos));
    const imgs = await page.evaluate(() => [...document.images].filter((i) => /solicitacoes|storage|midia/.test(i.src)).map((i) => i.complete && i.naturalWidth > 0));
    ok(`${nm}: foto abre na tela do pedido`, imgs.length > 0 && imgs.every(Boolean), JSON.stringify(imgs));
    const perfil = (await admin.from('profiles').select('idioma, telefone').eq('id', p?.user_id).maybeSingle()).data;
    ok(`${nm}: perfil com idioma e telefone completo (+${DDI[l]} ${NUM[l]})`, perfil?.idioma === l && perfil?.telefone === `+${DDI[l]} ${NUM[l]}`, JSON.stringify(perfil));
    await foto(page, `site-${l}-${largura}-6pedido`);
    // logado: o pedido sem cadastro manda para o pedido normal
    await page.goto(SITE + PEDIDO[l], { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    ok(`${nm}: logado vai ao pedido normal`, !page.url().endsWith(PEDIDO[l]), page.url());
    ok(`${nm}: sem erro de JS/console`, erros.length === 0, erros.join(' | '));
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- APP
async function app(l) {
  const T = msgApp(l);
  const nm = `app ${l}`;
  const browser = await lancar();
  try {
    const ctx = await contexto(browser, l, 390);
    const page = await ctx.newPage();
    const erros = vigiar(page);
    const clica = async (texto) => page.getByText(texto, { exact: true }).locator('visible=true').last().click();
    const campo = (rot) => page.getByLabel(rot, { exact: true }).locator('visible=true').first();
    await page.goto(APP, { waitUntil: 'networkidle' });
    await page.getByText(T('auth.slogan')).waitFor({ timeout: 20000 });
    let t = await checar(page, `${nm} entrada`);
    ok(`${nm}: botao do pedido sem cadastro`, t.includes(T('auth.pedirSemConta')) && t.includes(T('auth.pedirSemContaTexto')));
    await foto(page, `app-${l}-0entrada`);
    await clica(T('auth.pedirSemConta'));
    await page.getByText(T('pedidoSemConta.titulo'), { exact: true }).first().waitFor({ timeout: 15000 });
    t = await checar(page, `${nm} servico`);
    const tipos = { et: 'pneu', ru: 'mecanica', en: 'revisao', it: 'eletrica', 'pt-PT': 'pneu', pt: 'mecanica' };
    const tipo = tipos[l];
    const NS = { revisao: 'servicosRevisao', mecanica: 'servicosMecanica', eletrica: 'servicosEletrica', pneu: 'servicosPneu' }[tipo];
    ok(`${nm}: 1a pagina so com os tipos`, (await page.getByText(T('pedidoSemConta.next'), { exact: true }).count()) === 0);
    await foto(page, `app-${l}-0tipos`);
    await page.getByText(new RegExp(T(`constants.tiposServico.${tipo}`))).locator('visible=true').first().click();
    await page.getByText(T('pedidoSemConta.detalheTexto'), { exact: true }).waitFor({ timeout: 5000 });
    await checar(page, `${nm} detalhe`);
    const j = JSON.parse(fs.readFileSync(`${MOB}/${l}.json`, 'utf8'));
    const todos = Object.values(j.constants[NS]);
    const primeiro = todos[0];
    if (todos.length > 6) {
      const visiveisCurto = (await Promise.all(todos.map(async (n) => (await page.getByText(n, { exact: true }).count()) > 0))).filter(Boolean).length;
      ok(`${nm}: lista curta mostra 6 e "ver todos"`, visiveisCurto === 6 && (await page.getByText(T('pedidoSemConta.verTodos', { n: todos.length }), { exact: true }).count()) === 1, String(visiveisCurto));
      await clica(T('pedidoSemConta.verTodos', { n: todos.length }));
      const visiveisTodos = (await Promise.all(todos.map(async (n) => (await page.getByText(n, { exact: true }).count()) > 0))).filter(Boolean).length;
      ok(`${nm}: "ver todos" mostra a lista inteira`, visiveisTodos === todos.length, `${visiveisTodos}/${todos.length}`);
      await clica(T('pedidoSemConta.verMenos'));
    }
    const pedaco = String(primeiro).slice(0, 5).toUpperCase();
    await campo(T('pedidoSemConta.buscarServico')).fill(pedaco);
    await page.waitForTimeout(300);
    const visiveis = (await Promise.all(todos.map(async (n) => (await page.getByText(n, { exact: true }).count()) > 0))).filter(Boolean).length;
    ok(`${nm}: busca "${pedaco}" filtra a lista`, visiveis >= 1 && visiveis < todos.length, `${visiveis}/${todos.length}`);
    await campo(T('pedidoSemConta.buscarServico')).fill('zzqqxx');
    ok(`${nm}: busca sem resultado explica`, (await page.innerText('body')).includes(T('pedidoSemConta.semResultadoBusca')));
    await campo(T('pedidoSemConta.buscarServico')).fill(pedaco);
    await clica(primeiro);
    await campo(T('pedidoSemConta.buscarServico')).fill('');
    await campo(T('novaSolicitacao.passoSintomas')).fill(`App ${l}`);
    await clica(T(`constants.urgencias.alta`));
    await foto(page, `app-${l}-1detalhe`);
    await clica(T('pedidoSemConta.next'));
    // carro
    await campo(T('veiculos.marca')).click();
    await page.getByLabel(T('veiculos.marca'), { exact: true }).locator('visible=true').last().fill('Skoda');
    await page.waitForTimeout(1500);
    ok(`${nm}: busca sem acento acha Škoda`, (await page.getByText(/^Škoda$|^Skoda$/).count()) > 0);
    await page.getByText(/^Škoda$|^Skoda$/).last().click();
    await page.waitForTimeout(800);
    await campo(T('veiculos.modelo')).click();
    await page.getByLabel(T('veiculos.modelo'), { exact: true }).locator('visible=true').last().fill('Octavia');
    await page.waitForTimeout(2500);
    await page.getByText('Octavia', { exact: true }).last().click();
    await page.waitForTimeout(800);
    await campo(T('veiculos.ano')).fill('a2b');
    ok(`${nm}: ano so aceita numeros`, (await campo(T('veiculos.ano')).inputValue()) === '2', await campo(T('veiculos.ano')).inputValue());
    await campo(T('veiculos.ano')).fill('2015');
    await campo(T('pedidoSemConta.plateLabel')).fill('app' + l.slice(0, 2));
    t = await checar(page, `${nm} carro`);
    await foto(page, `app-${l}-2carro`);
    await clica(T('pedidoSemConta.back'));
    await page.getByText(T('pedidoSemConta.detalheTexto'), { exact: true }).waitFor({ timeout: 5000 });
    ok(`${nm}: voltar do carro abre o que precisa com o texto`, (await campo(T('novaSolicitacao.passoSintomas')).inputValue()) === `App ${l}`);
    await clica(T('pedidoSemConta.next'));
    await page.waitForTimeout(500);
    ok(`${nm}: carro continua escolhido`, (await page.innerText('body')).includes('Octavia'));
    await clica(T('pedidoSemConta.next'));
    // local (posicao do aparelho preenche)
    await page.waitForTimeout(3500);
    const end = campo(T('novaSolicitacao.passoLocal'));
    const valor = await end.inputValue().catch(() => '');
    ok(`${nm}: posicao preencheu o endereco`, valor.length > 2, valor);
    if (l !== 'en') ok(`${nm}: endereco no idioma do app (nao em ingles)`, !/County|Estonia|Italy|Brazil|Lazio Region/.test(valor), valor);
    ok(`${nm}: dica de quem recebe o aviso`, (await page.innerText('body')).includes(T('pedidoSemConta.addressHelp')) && (await page.innerText('body')).includes(T('pedidoSemConta.step5Title')));
    if (!valor) await end.fill(CIDADE[l]);
    await checar(page, `${nm} local`);
    await foto(page, `app-${l}-3local`);
    await clica(T('pedidoSemConta.next'));
    // contato
    await page.getByText(T('pedidoSemConta.contatoTitulo'), { exact: true }).waitFor({ timeout: 10000 });
    t = await checar(page, `${nm} contato`);
    const email = `exaust-app-${l.toLowerCase()}-${tag}@example.test`;
    await campo(T('pedidoSemConta.nome')).fill(`App ${l}`);
    await campo(T('pedidoSemConta.email')).fill('exaust@gmial.com');
    ok(`${nm}: sugere gmail.com`, (await page.innerText('body')).includes(T('pedidoSemConta.voceQuisDizer', { email: 'exaust@gmail.com' })));
    await campo(T('pedidoSemConta.email')).fill(email);
    // o login fica montado atras na versao web do app: conta so o campo visivel
    ok(`${nm}: sem campo de senha no contato`, (await page.getByLabel(T('auth.senha'), { exact: true }).locator('visible=true').count()) === 0);
    ok(`${nm}: prefixo do telefone ja no pais do idioma (+${DDI[l]})`, (await page.getByRole('button', { name: new RegExp(`\\+${DDI[l]}$`) }).count()) === 1);
    await campo(T('pedidoSemConta.telefone')).fill(NUM[l]);
    await page.getByRole('checkbox').locator('visible=true').last().click({ position: { x: 10, y: 10 } });
    await foto(page, `app-${l}-4contato`);
    const t0 = Date.now();
    await clica(T('pedidoSemConta.enviarPedido'));
    await page.getByText(T('pedidoSemConta.codigoTitulo'), { exact: true }).waitFor({ timeout: 30000 });
    t = await checar(page, `${nm} codigo`);
    ok(`${nm}: codigo mostra o e-mail`, t.includes(email));
    const c = await codigoDe(email, t0);
    const p = (await admin.from('pedidos_pendentes').select('user_id, idioma, origem, telefone').ilike('email', email).maybeSingle()).data;
    if (p) contas.add(p.user_id);
    ok(`${nm}: pendente do app no idioma`, p?.origem === 'app' && p?.idioma === l, JSON.stringify(p));
    ok(`${nm}: telefone salvo completo (+${DDI[l]} ${NUM[l]})`, p?.telefone === `+${DDI[l]} ${NUM[l]}`, p?.telefone);
    await campo(T('pedidoSemConta.codigoCampo')).fill(c.codigo === '000000' ? '111111' : '000000');
    await clica(T('pedidoSemConta.confirmarEnviar'));
    await page.waitForTimeout(1500);
    ok(`${nm}: codigo errado avisa no idioma`, (await page.innerText('body')).includes(T('erros.CODIGO_INVALIDO')));
    await foto(page, `app-${l}-5codigo`);
    await campo(T('pedidoSemConta.codigoCampo')).fill(c.codigo || '');
    await clica(T('pedidoSemConta.confirmarEnviar'));
    const criarSenha = await page.getByText(T('auth.criarSenhaTitulo'), { exact: true }).waitFor({ timeout: 30000 }).then(() => true, () => false);
    ok(`${nm}: tela "crie a sua senha" depois do codigo`, criarSenha, page.url());
    await checar(page, `${nm} criar senha`);
    await foto(page, `app-${l}-5b-criar-senha`);
    await clica(T('auth.agoraNao'));
    await page.waitForURL(/\/solicitacao\//, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    ok(`${nm}: "agora nao" abre o pedido logado`, /\/solicitacao\//.test(page.url()), page.url());
    t = await checar(page, `${nm} pedido aberto`);
    ok(`${nm}: tela do pedido mostra o pedido (nao "nao existe")`, t.includes(`App ${l}`) && !t.includes(T('acompanhamento.naoEncontrado')), t.slice(0, 160));
    const sol = (await admin.from('solicitacoes').select('id, tipo, urgencia, descricao, veiculo:veiculos(fipe_marca, placa)').eq('cliente_id', p?.user_id).maybeSingle()).data;
    ok(`${nm}: pedido certo (tipo, urgencia, servico marcado, Skoda)`, sol?.tipo === tipo && sol?.urgencia === 'alta' && (sol?.descricao || '').includes(primeiro) && /koda/.test(sol?.veiculo?.fipe_marca || ''), JSON.stringify(sol));
    await foto(page, `app-${l}-6pedido`);
    ok(`${nm}: sem erro de JS`, erros.filter((e) => e.startsWith('JS')).length === 0, erros.join(' | '));
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- casos extras
async function extra(caso) {
  const browser = await lancar();
  try {
    if (caso === 'conta-existente') {
      // site en 1280: conta criada antes; e-mail repetido -> caixa "ja tem conta"
      const l = 'en'; const T = msgWeb(l); const nm = `extra conta existente ${l}`;
      const email = `exaust-exist-${tag}@example.test`;
      const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
      contas.add(u.user.id);
      await admin.from('profiles').insert({ id: u.user.id, tipo: 'cliente', nome: 'Exist', email, idioma: 'en' });
      await admin.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2017', placa: 'EX123' });
      const ctx = await contexto(browser, l, 1280);
      await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
      const page = await ctx.newPage();
      const erros = vigiar(page);
      await page.goto(SITE + PEDIDO[l], { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: new RegExp(T('constants.tiposServico.colisao')) }).first().click();
      await page.locator('#pedido-descricao').fill('Scratch');
      await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();
      const marca = page.getByLabel(T('veiculoForm.labelMarca'), { exact: false }).locator('visible=true').first();
      await page.waitForFunction((el) => el.options.length > 2, await marca.elementHandle(), { timeout: 20000 });
      await marca.selectOption({ label: 'Toyota' });
      const modelo = page.getByLabel(T('veiculoForm.labelModelo'), { exact: false }).locator('visible=true').first();
      await page.waitForFunction((el) => el.options.length > 2, await modelo.elementHandle(), { timeout: 20000 });
      const opc = await modelo.locator('option').allTextContents();
      await modelo.selectOption({ label: opc.find((o) => /Corolla/.test(o)) || opc[1] });
      await page.getByLabel(T('veiculoForm.labelAno'), { exact: false }).locator('visible=true').first().fill('2017').catch(() => {});
      await page.locator('#pedido-placa').fill('ex 123');
      await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();
      await page.locator('#pedido-endereco').fill('Tallinn');
      await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();
      await page.locator('#pedido-nome').fill('Exist');
      await page.locator('#pedido-email').fill(email.toUpperCase());
      await page.getByTestId('aceito-termos').check();
      const t0 = Date.now();
      await page.getByRole('button', { name: T('pedidoSemConta.enviarPedido') }).click();
      // 12/11: quem ja tem conta recebe o mesmo codigo, sem caixa de senha (nao revela que o e-mail tem conta)
      await page.getByTestId('passo-codigo').waitFor({ timeout: 20000 });
      ok(`${nm}: e-mail em maiusculas -> tela do codigo, sem caixa "ja tem conta"`, (await page.getByTestId('conta-existente').count()) === 0);
      ok(`${nm}: "corrigir e-mail" igual ao de conta nova (nao revela a conta)`, (await page.getByTestId('corrigir-email').count()) === 1);
      await checar(page, nm);
      await foto(page, 'extra-conta-existente');
      const c = await codigoDe(email, t0);
      await page.locator('#pedido-codigo').fill(c.codigo || '');
      await page.getByTestId('confirmar-codigo').click();
      // conta com senha: entra direto no pedido, sem a tela "crie a sua senha"
      await page.waitForURL(/orcamentos\//, { timeout: 30000 }).catch(() => {});
      ok(`${nm}: codigo entra na conta existente e abre o pedido`, /orcamentos\//.test(page.url()) && (await page.getByTestId('criar-senha').count()) === 0, page.url());
      await foto(page, 'extra-conta-existente-pedido');
      const v = (await admin.from('veiculos').select('id').eq('profile_id', u.user.id)).data?.length;
      ok(`${nm}: placa "ex 123" = carro EX123 da conta (nao duplica)`, v === 1, String(v));
      const sols = (await admin.from('solicitacoes').select('id').eq('cliente_id', u.user.id)).data?.length;
      ok(`${nm}: pedido entrou na conta existente`, sols === 1, String(sols));
      const l2 = await anon().auth.signInWithPassword({ email, password: senha });
      ok(`${nm}: senha da conta intocada`, !l2.error, l2.error?.message);
      ok(`${nm}: sem erro de JS`, erros.filter((e) => e.startsWith('JS')).length === 0, erros.join(' | '));
    }
    if (caso === 'corrigir-email' || caso === 'tentativas') {
      const l = caso === 'corrigir-email' ? 'ru' : 'it'; const T = msgWeb(l); const nm = `extra ${caso} ${l}`;
      const ctx = await contexto(browser, l, 390);
      await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
      const page = await ctx.newPage();
      const erros = vigiar(page);
      await page.goto(SITE + PEDIDO[l], { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: new RegExp(T('constants.tiposServico.outro')) }).first().click();
      await page.locator('#pedido-descricao').fill('Test');
      await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();
      const marca = page.getByLabel(T('veiculoForm.labelMarca'), { exact: false }).locator('visible=true').first();
      await page.waitForFunction((el) => el.options.length > 2, await marca.elementHandle(), { timeout: 20000 });
      await marca.selectOption({ label: 'Toyota' });
      const modelo = page.getByLabel(T('veiculoForm.labelModelo'), { exact: false }).locator('visible=true').first();
      await page.waitForFunction((el) => el.options.length > 2, await modelo.elementHandle(), { timeout: 20000 });
      await modelo.selectOption({ index: 1 });
      await page.getByLabel(T('veiculoForm.labelAno'), { exact: false }).locator('visible=true').first().fill('2017').catch(() => {});
      await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();
      await page.locator('#pedido-endereco').fill(l === 'it' ? 'Milano' : 'Tallinn');
      await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();
      const errado = `exaust-${caso}-${tag}@example.test`;
      await page.locator('#pedido-nome').fill('Test');
      await page.locator('#pedido-email').fill(errado);
      await page.getByTestId('aceito-termos').check();
      const t0 = Date.now();
      await page.getByRole('button', { name: T('pedidoSemConta.enviarPedido') }).click();
      await page.getByTestId('passo-codigo').waitFor({ timeout: 20000 });
      const p = (await admin.from('pedidos_pendentes').select('id, user_id').ilike('email', errado).maybeSingle()).data;
      if (p) contas.add(p.user_id);
      if (caso === 'corrigir-email') {
        await page.getByTestId('corrigir-email').click();
        const certo = `exaust-certo-${tag}@example.test`;
        await page.locator('#pedido-email-novo').fill(certo);
        ok(`${nm}: corrigir espera os 30 s do reenvio`, await page.getByRole('button', { name: T('pedidoSemConta.enviarParaEsteEmail') }).isDisabled());
        await admin.from('pedidos_pendentes').update({ ultimo_envio_em: new Date(Date.now() - 60000).toISOString() }).eq('id', p.id);
        await page.waitForTimeout(31000);
        const t1 = Date.now();
        await page.getByRole('button', { name: T('pedidoSemConta.enviarParaEsteEmail') }).click();
        await page.locator('[role=status]:not(#__next-route-announcer__)').first().waitFor({ timeout: 15000 });
        ok(`${nm}: aviso do novo envio no idioma`, (await page.locator('[role=status]:not(#__next-route-announcer__)').first().innerText()).includes(T('pedidoSemConta.codigoReenviado', { email: certo })));
        const c = await codigoDe(certo, t1);
        await page.locator('#pedido-codigo').fill(c.codigo || '');
        await page.getByTestId('confirmar-codigo').click();
        await page.waitForURL((u) => !u.pathname.endsWith('zayavka'), { timeout: 30000 }).catch(() => {});
        ok(`${nm}: confirmado com o e-mail corrigido`, !page.url().endsWith('zayavka'), page.url());
        // desde 12/11 o pedido passa para a conta do e-mail certo (a conta do errado e apagada)
        const pf = (await admin.from('profiles').select('email').eq('email', certo).maybeSingle()).data;
        ok(`${nm}: conta com o e-mail certo`, pf?.email === certo, JSON.stringify(pf));
        await foto(page, 'extra-corrigir-email');
      } else {
        const c = await codigoDe(errado, t0);
        for (let i = 0; i < 5; i++) {
          await page.locator('#pedido-codigo').fill(String(300000 + i) === c.codigo ? '399999' : String(300000 + i));
          await page.getByTestId('confirmar-codigo').click();
          await page.waitForTimeout(1200);
          if (await page.getByTestId('passo-contato').isVisible().catch(() => false)) break;
        }
        await page.getByTestId('passo-contato').waitFor({ timeout: 10000 });
        const alerta = await page.locator('[role=alert]:not(#__next-route-announcer__)').first().innerText().catch(() => '');
        ok(`${nm}: esgotou -> volta ao contato com aviso`, alerta.includes(T('erros.CODIGO_TENTATIVAS')), alerta);
        ok(`${nm}: dados mantidos`, (await page.locator('#pedido-email').inputValue()) === errado);
        await foto(page, 'extra-tentativas');
        const t1 = Date.now();
        await page.getByRole('button', { name: T('pedidoSemConta.enviarPedido') }).click();
        await page.getByTestId('passo-codigo').waitFor({ timeout: 20000 });
        const c2 = await codigoDe(errado, t1);
        await page.locator('#pedido-codigo').fill(c2.codigo || '');
        await page.getByTestId('confirmar-codigo').click();
        await page.waitForURL((u) => !u.pathname.endsWith('richiesta'), { timeout: 30000 }).catch(() => {});
        ok(`${nm}: enviar de novo e codigo novo funcionam`, !page.url().endsWith('richiesta'), page.url());
      }
      ok(`${nm}: sem erro de JS`, erros.filter((e) => e.startsWith('JS')).length === 0, erros.join(' | '));
    }
    if (caso === 'cookie-site-app') {
      const l = 'en'; const T = msgApp(l); const nm = 'extra cookie do site + app';
      const emailSite = `exaust-site-logado-${tag}@example.test`;
      const { data: u } = await admin.auth.admin.createUser({ email: emailSite, password: senha, email_confirm: true });
      contas.add(u.user.id);
      await admin.from('profiles').insert({ id: u.user.id, tipo: 'cliente', nome: 'Site', email: emailSite, idioma: 'en' });
      const ctx = await contexto(browser, l, 390);
      const page = await ctx.newPage();
      // 1) entra no SITE (cookie em localhost, que o app na outra porta tambem recebe)
      await page.goto(`${SITE}/ee/en/login`, { waitUntil: 'networkidle' });
      await page.fill('input[type=email]', emailSite); await page.fill('input[type=password]', senha);
      await page.click('button[type=submit]'); await page.waitForTimeout(4000);
      // 2) no APP, sem login, pede com OUTRO e-mail
      const clica = async (texto) => page.getByText(texto, { exact: true }).locator('visible=true').last().click();
      const campo = (rot) => page.getByLabel(rot, { exact: true }).locator('visible=true').first();
      await page.goto(APP, { waitUntil: 'networkidle' });
      await clica(T('auth.pedirSemConta'));
      await page.getByText(new RegExp(T('constants.tiposServico.outro'))).locator('visible=true').first().click();
      await campo(T('novaSolicitacao.passoSintomas')).fill('Cookie test');
      await clica(T('pedidoSemConta.next'));
      await campo(T('veiculos.marca')).click();
      await page.getByLabel(T('veiculos.marca'), { exact: true }).locator('visible=true').last().fill('Toyota');
      await page.waitForTimeout(1500); await page.getByText('Toyota', { exact: true }).last().click(); await page.waitForTimeout(800);
      await campo(T('veiculos.modelo')).click();
      await page.getByLabel(T('veiculos.modelo'), { exact: true }).locator('visible=true').last().fill('Corolla');
      await page.waitForTimeout(2500); await page.getByText('Corolla', { exact: true }).last().click(); await page.waitForTimeout(800);
      await campo(T('veiculos.ano')).fill('2015');
      await clica(T('pedidoSemConta.next'));
      await page.waitForTimeout(3500);
      await clica(T('pedidoSemConta.next'));
      const emailApp = `exaust-app-novo-${tag}@example.test`;
      await campo(T('pedidoSemConta.nome')).fill('App');
      await campo(T('pedidoSemConta.email')).fill(emailApp);
      await page.getByRole('checkbox').locator('visible=true').last().click({ position: { x: 10, y: 10 } });
      const t0 = Date.now();
      await clica(T('pedidoSemConta.enviarPedido'));
      const pediuCodigo = await page.getByText(T('pedidoSemConta.codigoTitulo'), { exact: true }).waitFor({ timeout: 20000 }).then(() => true, () => false);
      ok(`${nm}: app pede o codigo do e-mail digitado (nao usa o login do site)`, pediuCodigo);
      const naContaDoSite = (await admin.from('solicitacoes').select('id').eq('cliente_id', u.user.id)).data?.length;
      ok(`${nm}: nada criado na conta logada no site`, naContaDoSite === 0, String(naContaDoSite));
      const p = (await admin.from('pedidos_pendentes').select('user_id').ilike('email', emailApp).maybeSingle()).data;
      if (p) contas.add(p.user_id);
      const c = await codigoDe(emailApp, t0);
      await campo(T('pedidoSemConta.codigoCampo')).fill(c.codigo || '');
      await clica(T('pedidoSemConta.confirmarEnviar'));
      // conta nova sem senha: "crie a sua senha" -> agora nao -> pedido
      await page.getByText(T('auth.criarSenhaTitulo'), { exact: true }).waitFor({ timeout: 30000 }).catch(() => {});
      await clica(T('auth.agoraNao'));
      await page.waitForURL(/\/solicitacao\//, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      const tela = await page.innerText('body');
      ok(`${nm}: tela do pedido mostra o pedido (nao "nao existe")`, tela.includes('Cookie test') && !tela.includes(T('acompanhamento.naoEncontrado')), tela.slice(0, 200));
      await foto(page, 'extra-cookie-site-app');
    }
    if (caso === 'emails') {
      // o e-mail do codigo em cada idioma: assunto e texto no idioma certo
      const PALAVRA = { et: /kood/i, ru: /код/i, en: /code/i, it: /codice/i, 'pt-PT': /código/i, pt: /código/i };
      for (const l of LOCS) {
        const email = `exaust-mail-${l.toLowerCase()}-${tag}@example.test`;
        const form = new FormData();
        form.append('dados', JSON.stringify({ origem: 'site', idioma: l, nome: `Nome <b>${l}</b>`, email, aceitouTermos: true, tipo: 'outro', descricao: 'x', urgencia: 'media', endereco: 'Tallinn', latitude: 59.43, longitude: 24.75, pais: 'EE', veiculo: { tipo: 'cars', marca: 'Toyota', modelo: 'Corolla', ano: '2017', placa: null } }));
        const t0 = Date.now();
        const r = await fetch(`${SITE}/api/pedido-sem-conta`, { method: 'POST', body: form, headers: { 'x-real-ip': ipFalso() } });
        const d = await r.json();
        const p = (await admin.from('pedidos_pendentes').select('user_id').eq('id', d.pendenteId).maybeSingle()).data;
        if (p) contas.add(p.user_id);
        const c = await codigoDe(email, t0);
        ok(`e-mail ${l}: assunto no idioma`, PALAVRA[l].test(c.assunto), c.assunto);
        ok(`e-mail ${l}: nome escapado (sem HTML injetado)`, !/<b>/.test(fs.readFileSync(path.join(EMAILS, fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`)).sort().at(-1)), 'utf8').split('-->')[1] || ''));
        ok(`e-mail ${l}: diz que expira em 24 h`, /24/.test(c.texto));
      }
    }
  } finally {
    await browser.close();
  }
}

async function limpar() {
  for (const id of contas) {
    const { data: sols } = await admin.from('solicitacoes').select('id').eq('cliente_id', id);
    for (const s of sols || []) {
      await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', s.id);
      await admin.from('solicitacao_fotos').delete().eq('solicitacao_id', s.id);
    }
    await admin.from('solicitacoes').delete().eq('cliente_id', id);
    await admin.from('veiculos').delete().eq('profile_id', id);
    await admin.from('pedidos_pendentes').delete().eq('user_id', id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

const [, , , modo, a, b] = process.argv;
if (!modo) {
  // tudo: cada pedaco num processo; repete ate 2x se o navegador cair
  const pedacos = [
    ...LOCS.flatMap((l) => [['site', l, '390'], ['site', l, '1280']]),
    ...LOCS.map((l) => ['app', l]),
    ['extra', 'conta-existente'], ['extra', 'cookie-site-app'], ['extra', 'corrigir-email'], ['extra', 'tentativas'], ['extra', 'emails'],
  ];
  const resumo = [];
  for (const pc of pedacos) {
    let saida = '', tentativa = 0, st = 1;
    while (tentativa < 3) {
      tentativa++;
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ENV, ...pc], { encoding: 'utf8', timeout: 9 * 60 * 1000 });
      saida = (r.stdout || '') + (r.stderr || '');
      st = r.status;
      const caiu = /Target page, context or browser has been closed|Page crashed|browser has disconnected|ETIMEDOUT|ECONNRESET/.test(saida) || r.status === null;
      if (!caiu) break;
      console.log(`  (${pc.join(' ')} caiu por memoria/rede - repetindo ${tentativa}/2)`);
    }
    const nOk = (saida.match(/^ok /gm) || []).length; const nF = (saida.match(/^FALHA/gm) || []).length;
    resumo.push(`${pc.join(' ').padEnd(24)} ${nOk} ok, ${nF} falha${nF === 1 ? '' : 's'}`);
    console.log(`== ${pc.join(' ')}: ${nOk} ok, ${nF} falha(s)`);
    for (const lnh of saida.split('\n').filter((x) => x.startsWith('FALHA'))) console.log('   ' + lnh);
    fs.appendFileSync(`${OUT}/log.txt`, `\n===== ${pc.join(' ')}\n${saida}`);
  }
  console.log('\nRESUMO\n' + resumo.join('\n'));
} else {
  try {
    if (modo === 'site') await site(a, Number(b));
    else if (modo === 'app') await app(a);
    else await extra(a);
  } catch (e) {
    falhas++;
    console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
  } finally {
    await limpar();
    console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
  }
}
