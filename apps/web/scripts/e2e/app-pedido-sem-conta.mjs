// E2E LOCAL do pedido sem cadastro e SEM SENHA no APP (versao web do mesmo codigo,
// tela de iPhone, servida por servir-app-web.mjs em :8090): botao na entrada nos 6
// idiomas; ET conta nova (contato sem senha, codigo do e-mail, tela cheia "crie a sua
// senha", "agora nao" abre o pedido); RU e-mail que ja tem conta (mesmo codigo, pedido
// entra na conta, cria a senha na hora); EN "receber um codigo por e-mail" na entrada.
// node app-pedido-sem-conta.mjs <.env.local>
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
const APP = process.env.APP || 'http://localhost:8090';
const EMAILS = env.EMAIL_PASTA_TESTE;
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados';
const MOB = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/site/apps/mobile/i18n/locales';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const LOC_BROWSER = { pt: 'pt-BR', 'pt-PT': 'pt-PT', en: 'en-GB', et: 'et-EE', it: 'it-IT', ru: 'ru-RU' };
const txt = (loc) => {
  const j = JSON.parse(fs.readFileSync(`${MOB}/${loc}.json`, 'utf8'));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], j) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + x : ''}`); };
const CHAVE_CRUA = /\b(auth|pedidoSemConta|novaSolicitacao|common|erros|constants|veiculos)\.[a-zA-Z_]+/;
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Teste-' + crypto.randomBytes(6).toString('hex');
const contas = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const codigoDe = async (email, depois) => {
  for (let i = 0; i < 30; i++) {
    const arq = fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort();
    if (arq.length) {
      const txt = fs.readFileSync(path.join(EMAILS, arq.at(-1)), 'utf8').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
      const m = txt.match(/(?<![\d#])\d{6}(?!\d)/);
      if (m) return m[0];
    }
    await sleep(300);
  }
  return null;
};
const perfilDe = async (email) => (await admin.from('profiles').select('id, senha_definida').ilike('email', email).maybeSingle()).data;
const clicaTexto = async (page, texto) => { await page.getByText(texto, { exact: true }).locator('visible=true').last().click(); };
const campo = (page, rotulo) => page.getByLabel(rotulo, { exact: true }).locator('visible=true').first();
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const novoContexto = (loc) => browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: LOC_BROWSER[loc],
  geolocation: { latitude: 59.437, longitude: 24.745 }, permissions: ['geolocation'],
});
const checaTela = async (page, nome) => {
  const t = await page.innerText('body');
  const crua = t.match(CHAVE_CRUA);
  ok(`${nome}: sem chave crua`, !crua, crua?.[0]);
  ok(`${nome}: sem rolagem lateral`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  return t;
};

// preenche servico, carro e local; devolve na tela de contato
const ateContato = async (page, T, nome) => {
  await clicaTexto(page, T('auth.pedirSemConta'));
  await page.getByText(T('pedidoSemConta.titulo')).first().waitFor({ timeout: 15000 });
  await page.getByText(new RegExp(T('constants.tiposServico.mecanica'))).locator('visible=true').first().click();
  await clicaTexto(page, T('constants.servicosMecanica.motor_perda_potencia'));
  await campo(page, T('novaSolicitacao.passoSintomas')).fill('Test app');
  await checaTela(page, `${nome} servico`);
  await page.screenshot({ path: `${OUT}/app-pedido-servico-${nome}.png`, fullPage: true });
  await clicaTexto(page, T('pedidoSemConta.next'));
  await campo(page, T('veiculos.marca')).click();
  await page.getByLabel(T('veiculos.marca'), { exact: true }).locator('visible=true').last().fill('Toyota');
  await page.waitForTimeout(1500);
  await page.getByText('Toyota', { exact: true }).last().click({ timeout: 10000 });
  await page.waitForTimeout(800);
  await campo(page, T('veiculos.modelo')).click();
  await page.getByLabel(T('veiculos.modelo'), { exact: true }).locator('visible=true').last().fill('Corolla');
  await page.waitForTimeout(2500);
  await page.getByText('Corolla', { exact: true }).last().click({ timeout: 10000 });
  await page.waitForTimeout(800);
  await campo(page, T('veiculos.ano')).fill('2019');
  await campo(page, T('pedidoSemConta.plateLabel')).fill('777APP');
  await checaTela(page, `${nome} carro`);
  await page.screenshot({ path: `${OUT}/app-pedido-carro-${nome}.png`, fullPage: true });
  await clicaTexto(page, T('pedidoSemConta.next'));
  await page.waitForTimeout(2500); // posicao do aparelho preenche a cidade
  const end = campo(page, T('novaSolicitacao.passoLocal'));
  if (!(await end.inputValue().catch(() => ''))) await end.fill('Tallinn');
  await checaTela(page, `${nome} local`);
  await clicaTexto(page, T('pedidoSemConta.next'));
  await page.getByText(T('pedidoSemConta.contatoTitulo'), { exact: true }).waitFor({ timeout: 10000 });
};

try {
  // 1) botao na entrada nos 6 idiomas (texto sem "sem cadastro" - regra do dono)
  for (const loc of ['pt', 'pt-PT', 'en', 'et', 'it', 'ru']) {
    const T = txt(loc);
    const ctx = await novoContexto(loc); const page = await ctx.newPage();
    await page.goto(APP, { waitUntil: 'networkidle' });
    await page.getByText(T('auth.slogan')).waitFor({ timeout: 15000 }).catch(() => {});
    const t = await checaTela(page, `[${loc}] entrada`);
    ok(`[${loc}] botao "${T('auth.pedirSemConta')}"`, t.includes(T('auth.pedirSemConta')) && t.includes(T('auth.pedirSemContaTexto')));
    ok(`[${loc}] texto do botao sem "sem cadastro"`, !/registr|cadastr|sign-up|регистр/i.test(T('auth.pedirSemContaTexto')), T('auth.pedirSemContaTexto'));
    ok(`[${loc}] entrada tem "receber um codigo por e-mail"`, t.includes(T('auth.receberCodigo')));
    if (loc === 'et' || loc === 'ru') await page.screenshot({ path: `${OUT}/app-entrada-${loc}.png`, fullPage: true });
    await ctx.close();
  }

  // 2) ET: conta nova sem senha
  const T = txt('et');
  const emailEt = `app-pedido-et-${tag}@example.test`;
  {
    const ctx = await novoContexto('et'); const page = await ctx.newPage(); const erros = [];
    page.on('pageerror', (x) => erros.push(x.message));
    await page.goto(APP, { waitUntil: 'networkidle' });
    await ateContato(page, T, 'et');
    ok('et: contato sem campo de senha, com a frase do acesso', (await page.getByLabel(T('auth.senha'), { exact: true }).locator('visible=true').count()) === 0 && (await page.innerText('body')).includes(T('pedidoSemConta.acessoTexto')), `senha visivel: ${await page.getByLabel(T('auth.senha'), { exact: true }).locator('visible=true').count()} / no DOM: ${await page.getByLabel(T('auth.senha'), { exact: true }).count()}`);
    await campo(page, T('pedidoSemConta.nome')).fill('TESTE AUTOMATICO');
    await campo(page, T('pedidoSemConta.email')).fill(emailEt.replace('example.test', 'gmial.com'));
    ok('et: sugere gmail.com', (await page.innerText('body')).includes(T('pedidoSemConta.voceQuisDizer', { email: emailEt.replace('example.test', 'gmail.com') })));
    await campo(page, T('pedidoSemConta.email')).fill(emailEt);
    await page.getByRole('checkbox', { name: /(Nõustun|Согласен|Согласна|Принимаю|Я принимаю)/ }).locator('visible=true').first().click({ position: { x: 10, y: 10 } });
    await checaTela(page, 'et contato');
    await page.screenshot({ path: `${OUT}/app-pedido-contato-et.png`, fullPage: true });
    const t0 = Date.now();
    await clicaTexto(page, T('pedidoSemConta.enviarPedido'));
    await page.getByText(T('pedidoSemConta.codigoTitulo'), { exact: true }).waitFor({ timeout: 30000 });
    const pend = (await admin.from('pedidos_pendentes').select('user_id, origem, fotos').ilike('email', emailEt).maybeSingle()).data;
    if (pend) contas.add(pend.user_id);
    ok('et: pendente com origem app', pend?.origem === 'app', JSON.stringify(pend));
    await checaTela(page, 'et codigo');
    await page.screenshot({ path: `${OUT}/app-pedido-codigo-et.png`, fullPage: true });
    // codigo errado primeiro
    await campo(page, T('pedidoSemConta.codigoCampo')).fill('000000');
    await clicaTexto(page, T('pedidoSemConta.confirmarEnviar'));
    await page.waitForTimeout(1500);
    const tErr = await page.innerText('body');
    const codigo = await codigoDe(emailEt, t0);
    if (codigo !== '000000') ok('et: codigo errado mostra o aviso traduzido', tErr.includes(T('erros.CODIGO_INVALIDO')));
    await campo(page, T('pedidoSemConta.codigoCampo')).fill(codigo || '');
    await clicaTexto(page, T('pedidoSemConta.confirmarEnviar'));
    // conta nova sem senha: tela cheia "crie a sua senha" antes do pedido
    const criar = await page.getByText(T('auth.criarSenhaTitulo'), { exact: true }).waitFor({ timeout: 30000 }).then(() => true, () => false);
    ok('et: codigo -> tela "crie a sua senha"', criar, page.url());
    const tCriar = await checaTela(page, 'et criar senha');
    ok('et: tela da senha com Salvar e Agora nao', tCriar.includes(T('common.salvar')) && tCriar.includes(T('auth.agoraNao')));
    await page.screenshot({ path: `${OUT}/app-criar-senha-et.png`, fullPage: true });
    await clicaTexto(page, T('auth.agoraNao'));
    await page.waitForURL(/\/solicitacao\//, { timeout: 30000 }).catch(() => {});
    ok('et: "agora nao" entra e abre o pedido', /\/solicitacao\//.test(page.url()), page.url());
    await page.waitForTimeout(2000);
    await checaTela(page, 'et pedido aberto');
    await page.screenshot({ path: `${OUT}/app-pedido-aberto-et.png`, fullPage: true });
    const sol = (await admin.from('solicitacoes').select('id, descricao, veiculo:veiculos(placa)').eq('cliente_id', pend?.user_id).maybeSingle()).data;
    ok('et: pedido criado com carro e servico marcado', !!sol && sol.veiculo?.placa === '777APP' && /,|:/.test(sol.descricao || ''), JSON.stringify(sol));
    ok('et: perfil sem senha (senha_definida=false)', (await perfilDe(emailEt))?.senha_definida === false);
    ok('et: nenhuma senha entra', !!(await anon().auth.signInWithPassword({ email: emailEt, password: senha })).error);
    ok('et: sem erro de JS', !erros.length, erros.join(' | ').slice(0, 200));
    await ctx.close();
  }

  // 3) RU: e-mail que ja tem conta -> mesmo codigo, pedido entra na conta; cria a senha na hora
  {
    const R = txt('ru');
    const ctx = await novoContexto('ru'); const page = await ctx.newPage();
    await page.goto(APP, { waitUntil: 'networkidle' });
    await ateContato(page, R, 'ru');
    await campo(page, R('pedidoSemConta.nome')).fill('TESTE AUTOMATICO');
    await campo(page, R('pedidoSemConta.email')).fill(emailEt);
    await page.getByRole('checkbox', { name: /(Nõustun|Согласен|Согласна|Принимаю|Я принимаю)/ }).locator('visible=true').first().click({ position: { x: 10, y: 10 } });
    const t0 = Date.now();
    await clicaTexto(page, R('pedidoSemConta.enviarPedido'));
    await page.getByText(R('pedidoSemConta.codigoTitulo'), { exact: true }).waitFor({ timeout: 30000 });
    ok('ru: conta existente vai direto ao codigo (sem caixa de senha)', (await page.getByLabel(R('auth.senha'), { exact: true }).locator('visible=true').count()) === 0, `no DOM: ${await page.getByLabel(R('auth.senha'), { exact: true }).count()}`);
    await checaTela(page, 'ru codigo conta existente');
    await page.screenshot({ path: `${OUT}/app-pedido-codigo-conta-existente-ru.png`, fullPage: true });
    const codigo = await codigoDe(emailEt, t0);
    await campo(page, R('pedidoSemConta.codigoCampo')).fill(codigo || '');
    await clicaTexto(page, R('pedidoSemConta.confirmarEnviar'));
    await page.getByText(R('auth.criarSenhaTitulo'), { exact: true }).waitFor({ timeout: 30000 });
    ok('ru: conta ainda sem senha -> tela "crie a sua senha" de novo', true);
    await campo(page, R('auth.senha')).fill(senha);
    await campo(page, R('auth.repitaSenha')).fill(senha + 'x');
    await clicaTexto(page, R('common.salvar'));
    await page.waitForTimeout(800);
    ok('ru: senhas diferentes avisam', (await page.innerText('body')).includes(R('auth.senhasNaoConferem')));
    await campo(page, R('auth.repitaSenha')).fill(senha);
    await clicaTexto(page, R('common.salvar'));
    await page.getByText(R('auth.senhaCriada'), { exact: true }).waitFor({ timeout: 20000 });
    await page.screenshot({ path: `${OUT}/app-senha-criada-ru.png`, fullPage: true });
    await page.waitForURL(/\/solicitacao\//, { timeout: 30000 }).catch(() => {});
    ok('ru: senha criada -> abre o pedido', /\/solicitacao\//.test(page.url()), page.url());
    const id = [...contas][0];
    const n = (await admin.from('solicitacoes').select('id').eq('cliente_id', id)).data?.length;
    const v = (await admin.from('veiculos').select('id').eq('profile_id', id)).data?.length;
    ok('ru: 2o pedido na mesma conta, mesmo carro (placa)', n === 2 && v === 1, `pedidos ${n}, carros ${v}`);
    ok('ru: senha_definida=true e login por senha funciona', (await perfilDe(emailEt))?.senha_definida === true && !(await anon().auth.signInWithPassword({ email: emailEt, password: senha })).error);
    await ctx.close();
  }

  // 4) EN: "receber um codigo por e-mail" na entrada (conta ja com senha: entra direto nas abas)
  {
    const E = txt('en');
    const ctx = await novoContexto('en'); const page = await ctx.newPage(); const erros = [];
    page.on('pageerror', (x) => erros.push(x.message));
    await page.goto(APP, { waitUntil: 'networkidle' });
    await clicaTexto(page, E('auth.receberCodigo'));
    await page.getByText(E('auth.codigoTitulo'), { exact: true }).waitFor({ timeout: 15000 });
    await checaTela(page, 'en codigo de login');
    await campo(page, E('auth.email')).fill(emailEt);
    const t0 = Date.now();
    await clicaTexto(page, E('auth.enviarCodigo'));
    await page.getByText(E('auth.codigoEnviadoTexto', { email: emailEt }), { exact: true }).waitFor({ timeout: 20000 });
    await page.screenshot({ path: `${OUT}/app-login-codigo-en.png`, fullPage: true });
    const codigo = await codigoDe(emailEt, t0);
    ok('en: e-mail do codigo de login chegou', !!codigo);
    await campo(page, E('auth.codigo')).fill(codigo === '000000' ? '111111' : '000000');
    await clicaTexto(page, E('auth.entrar'));
    await page.waitForTimeout(1500);
    ok('en: codigo errado avisa', (await page.innerText('body')).includes(E('erros.CODIGO_INVALIDO')));
    await campo(page, E('auth.codigo')).fill(codigo || '');
    await clicaTexto(page, E('auth.entrar'));
    await page.getByText(E('tabs.inicio'), { exact: true }).first().waitFor({ timeout: 30000 }).catch(() => {});
    const t = await page.innerText('body');
    ok('en: entra nas abas sem a tela da senha (ja tem senha)', t.includes(E('tabs.inicio')) && !t.includes(E('auth.criarSenhaTitulo')), page.url());
    ok('en: sem erro de JS', !erros.length, erros.join(' | ').slice(0, 200));
    await ctx.close();
  }
  const f = (await admin.from('funil_contagem').select('etapa, total').eq('funil', 'pedido_app').eq('dia', new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Tallinn' }))).data || [];
  ok('funil do app conta os passos', ['abriu', 'carro', 'local', 'contato', 'codigo_enviado', 'confirmado', 'conta_existente'].every((e) => f.some((x) => x.etapa === e)), JSON.stringify(f));
} catch (e) {
  falhas++;
  console.log('FALHA excecao', e.stack || e.message);
} finally {
  await browser.close();
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
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
}
