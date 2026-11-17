// "E-mail errado? Corrigir" na tela "confira seu e-mail" do cadastro (17/11: oficina digitou
// @gmail.con e ficou presa). So o navegador que criou a conta corrige (token do POST /api/cadastro).
//  A) API: sem token, token adulterado, token de outra conta, prazo vencido, conta ja confirmada,
//     e-mail de outra conta (responde igual, sem trocar), igual/invalido, 4a correcao, token
//     fantasma do cadastro com e-mail existente, limite por IP, link antigo morto
//  B) tela: motorista em et/ru a 390 e 1280 (cadastro pela tela -> corrige -> link novo -> entra),
//     oficina pela sessao guardada (recarregar a tela), texto nos 6 idiomas
//   SITE=http://localhost:3100 node cadastro-email-errado.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
const EMAILS = env.EMAIL_PASTA_TESTE;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const MSG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../messages');
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8'))));
const tr = (l) => { const m = msgs(l); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
const PREFIXO = { pt: '/br/pt', 'pt-PT': '/pt/pt', en: '/ee/en', et: '/ee/et', it: '/it/it', ru: '/ee/ru' };
const CADASTRO = { pt: '/cadastro', 'pt-PT': '/registo', en: '/sign-up', et: '/registreeru', it: '/registrati', ru: '/registratsiya' };
const RESULT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados';
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 240) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const senha = `Ce${tag}Senha9`;
const contas = new Set();
// cada grupo de chamadas com um IP proprio (o limite por IP e testado a parte)
const ip = () => `10.77.${crypto.randomInt(0, 255)}.${crypto.randomInt(1, 255)}`;
const post = async (p, b, comIp = ip()) => {
  const r = await fetch(SITE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Real-IP': comIp }, body: JSON.stringify(b) });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};
const corrigir = (email, novoEmail, token, idioma = 'et', comIp) => post('/api/cadastro/corrigir-email', { email, novoEmail, token, idioma }, comIp);
const nomeArq = (e) => `_${e.replace(/[^a-z0-9@._-]/gi, '_')}.html`;
const emailsDe = (e, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(nomeArq(e)) && Number(f.split('_')[0]) >= depois).sort();
const linkDe = (arq) => {
  const html = fs.readFileSync(path.join(EMAILS, arq), 'utf8');
  return (html.match(/href="([^"]*confirmar-email\?token_hash=[^"]+)"/) || [])[1]?.replace(/&amp;/g, '&') || null;
};
const esperaEmail = async (e, depois) => { for (let i = 0; i < 30; i++) { const a = emailsDe(e, depois); if (a.length) return a; await new Promise((r) => setTimeout(r, 300)); } return []; };
const perfilDe = async (email) => (await sb.from('profiles').select('id, email').eq('email', email).maybeSingle()).data;
const usuario = async (id) => (await sb.auth.admin.getUserById(id)).data?.user;
const cadastrar = async (email, extra = {}) => {
  const r = await post('/api/cadastro', { email, senha, nome: 'TESTE AUTOMATICO', tipo: 'cliente', idioma: 'et', aceitouTermos: true, ...extra });
  const p = await perfilDe(email);
  if (p) contas.add(p.id);
  return { ...r, id: p?.id, token: r.corpo.correcao };
};
// token "valido" (HMAC certo) com prazo escolhido - mesma receita de lib/cadastro-correcao
const chave = crypto.createHash('sha256').update(`cadastro-corrigir-email:${env.PEDIDO_LINK_SEGREDO || env.SUPABASE_SERVICE_ROLE_KEY}`).digest();
const tokenCom = (id, expiraEm) => { const c = `${id}.${Math.floor(expiraEm / 1000)}.${crypto.randomBytes(32).toString('base64url')}`; return `${c}.${crypto.createHmac('sha256', chave).update(c).digest('base64url')}`; };

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
try {
  // ================= A) API
  const errado = `ce-a-${tag}@gmail.con`;
  const A = await cadastrar(errado);
  ok('A cadastro devolve token de correcao', A.status === 200 && /^[0-9a-f-]{36}\.\d+\.[\w-]{43}\.[\w-]{43}$/.test(A.token || ''), JSON.stringify(A.corpo));
  const ua = await usuario(A.id);
  ok('A conta guarda so o hash do token (app_metadata), sem o token', !!ua?.app_metadata?.correcao_email?.hash && !JSON.stringify(ua.app_metadata).includes(A.token.split('.')[2]), JSON.stringify(ua?.app_metadata));
  const [primeiro] = await esperaEmail(errado, 0);
  const linkAntigo = primeiro && linkDe(primeiro);
  ok('A link de confirmacao foi para o endereco errado', !!linkAntigo);

  let r = await corrigir(errado, `ce-a2-${tag}@example.test`, undefined);
  ok('sem token -> 403 CORRECAO_INVALIDA', r.status === 403 && r.corpo.codigo === 'CORRECAO_INVALIDA', JSON.stringify(r));
  r = await corrigir(errado, `ce-a2-${tag}@example.test`, A.token.slice(0, -2) + (A.token.endsWith('AA') ? 'BB' : 'AA'));
  ok('token adulterado -> 403 CORRECAO_INVALIDA', r.status === 403 && r.corpo.codigo === 'CORRECAO_INVALIDA', JSON.stringify(r));
  r = await corrigir(errado, `ce-a2-${tag}@example.test`, tokenCom(A.id, Date.now() + 3600e3));
  ok('token assinado mas nao e o atual da conta -> 403', r.status === 403 && r.corpo.codigo === 'CORRECAO_INVALIDA', JSON.stringify(r));
  r = await corrigir(errado, `ce-a2-${tag}@example.test`, tokenCom(A.id, Date.now() - 1000));
  ok('prazo vencido -> 410 CORRECAO_EXPIRADA', r.status === 410 && r.corpo.codigo === 'CORRECAO_EXPIRADA', JSON.stringify(r));
  r = await corrigir(errado, errado, A.token);
  ok('mesmo e-mail -> 400 EMAIL_IGUAL', r.status === 400 && r.corpo.codigo === 'EMAIL_IGUAL', JSON.stringify(r));
  r = await corrigir(errado, 'sem-arroba', A.token);
  ok('e-mail invalido -> 400 EMAIL_INVALIDO', r.status === 400 && r.corpo.codigo === 'EMAIL_INVALIDO', JSON.stringify(r));

  // token de outra conta: so mexe na conta dona do token, nunca na do e-mail digitado
  const outroErr = `ce-b-${tag}@gmail.con`;
  const B = await cadastrar(outroErr);
  r = await corrigir(errado, `ce-b2-${tag}@example.test`, B.token);
  ok('token da conta B com o e-mail da A -> A intacta', (await perfilDe(errado))?.id === A.id && (await usuario(A.id)).email === errado);
  ok('... quem muda e a conta B (dona do token)', r.status === 200 && (await usuario(B.id)).email === `ce-b2-${tag}@example.test`, JSON.stringify(r));

  // conta ja confirmada
  const C = await cadastrar(`ce-c-${tag}@gmail.con`);
  await sb.auth.admin.updateUserById(C.id, { email_confirm: true });
  r = await corrigir(`ce-c-${tag}@gmail.con`, `ce-c2-${tag}@example.test`, C.token);
  ok('conta ja confirmada -> 403 CORRECAO_INVALIDA', r.status === 403 && r.corpo.codigo === 'CORRECAO_INVALIDA', JSON.stringify(r));

  // e-mail que ja tem conta: responde igual a sucesso, nao troca, o dono recebe o aviso
  const emD = `ce-d-${tag}@example.test`;
  const { data: dU } = await sb.auth.admin.createUser({ email: emD, password: senha, email_confirm: true });
  contas.add(dU.user.id);
  await sb.from('profiles').insert({ id: dU.user.id, tipo: 'cliente', nome: 'TESTE D', email: emD, idioma: 'ru' });
  let t0 = Date.now();
  r = await corrigir(errado, emD, A.token);
  ok('e-mail de outra conta -> 200 igual a sucesso (nao revela)', r.status === 200 && r.corpo.email === emD && !!r.corpo.correcao, JSON.stringify(r));
  ok('... a conta A continua com o e-mail dela', (await usuario(A.id)).email === errado && (await perfilDe(errado))?.id === A.id);
  const avisoD = await esperaEmail(emD, t0);
  ok('... o dono do e-mail recebe "voce ja tem conta" (sem link de confirmacao)', avisoD.length === 1 && !linkDe(avisoD[0]), avisoD.join(','));
  let tokenA = r.corpo.correcao;
  r = await corrigir(errado, `ce-a2-${tag}@example.test`, A.token);
  ok('token anterior a uma correcao deixa de valer', r.status === 403 && r.corpo.codigo === 'CORRECAO_INVALIDA', JSON.stringify(r));

  // correcao de verdade (2a): auth + perfil trocados, sem confirmar, link so no novo
  const certo = `ce-a2-${tag}@example.test`;
  const antesErrado = emailsDe(errado).length;
  t0 = Date.now();
  r = await corrigir(emD, certo, tokenA);
  ok('correcao -> 200 com o e-mail novo e token novo', r.status === 200 && r.corpo.email === certo && r.corpo.correcao && r.corpo.correcao !== tokenA, JSON.stringify(r));
  tokenA = r.corpo.correcao;
  const ua2 = await usuario(A.id);
  ok('auth com o e-mail novo, AINDA nao confirmado', ua2.email === certo && !ua2.email_confirmed_at, JSON.stringify({ e: ua2.email, c: ua2.email_confirmed_at }));
  ok('perfil com o e-mail novo', (await perfilDe(certo))?.id === A.id);
  ok('contador de correcoes = 2', ua2.app_metadata?.correcao_email?.usadas === 2, JSON.stringify(ua2.app_metadata));
  const novos = await esperaEmail(certo, t0);
  ok('link de confirmacao no endereco novo', novos.length === 1 && !!linkDe(novos[0]), novos.join(','));
  ok('nada mais para o endereco errado', emailsDe(errado).length === antesErrado);
  const vAnt = await anon().auth.verifyOtp({ token_hash: new URL(linkAntigo).searchParams.get('token_hash'), type: 'email' });
  ok('link antigo (endereco errado) nao confirma mais', !!vAnt.error, vAnt.error?.code);
  ok('... e a conta continua sem confirmar', !(await usuario(A.id)).email_confirmed_at);
  const l0 = await anon().auth.signInWithPassword({ email: certo, password: senha });
  ok('login com o e-mail novo bloqueado antes de confirmar', l0.error?.code === 'email_not_confirmed', l0.error?.code);
  // GoTrue nao manda e-mail proprio de "troca de e-mail" (Inbucket do Supabase local)
  const inb = await fetch('http://localhost:54324/api/v1/search?query=' + encodeURIComponent(certo)).then((x) => x.json()).catch(() => null);
  ok('GoTrue nao mandou e-mail de troca', !inb || (inb.messages_count ?? inb.total ?? (inb.messages || []).length) === 0, JSON.stringify(inb).slice(0, 120));

  // 3a correcao ok, 4a recusada
  r = await corrigir(certo, `ce-a3-${tag}@example.test`, tokenA);
  ok('3a correcao ok', r.status === 200, JSON.stringify(r));
  tokenA = r.corpo.correcao;
  r = await corrigir(`ce-a3-${tag}@example.test`, `ce-a4-${tag}@example.test`, tokenA);
  ok('4a correcao -> 429 CORRECOES_ESGOTADAS', r.status === 429 && r.corpo.codigo === 'CORRECOES_ESGOTADAS', JSON.stringify(r));
  ok('... conta continua com o 3o e-mail', (await usuario(A.id)).email === `ce-a3-${tag}@example.test`);
  // limite gravado na conta (vale mesmo com o servidor reiniciado): contador 3
  ok('contador gravado = 3', (await usuario(A.id)).app_metadata?.correcao_email?.usadas === 3);

  // cadastro com e-mail existente: token fantasma no mesmo formato, correcao "funciona" sem mexer em nada
  const G = await post('/api/cadastro', { email: emD, senha, nome: 'x', tipo: 'cliente', idioma: 'et', aceitouTermos: true });
  ok('cadastro com e-mail existente tambem devolve token (mesmo formato)', G.status === 200 && /^[0-9a-f-]{36}\.\d+\.[\w-]{43}\.[\w-]{43}$/.test(G.corpo.correcao || ''), JSON.stringify(G.corpo));
  r = await corrigir(emD, `ce-g-${tag}@example.test`, G.corpo.correcao);
  ok('correcao com token fantasma -> 200 igual (nao revela)', r.status === 200 && r.corpo.email === `ce-g-${tag}@example.test` && !!r.corpo.correcao, JSON.stringify(r));
  ok('... conta D intacta', (await usuario(dU.user.id)).email === emD && !(await perfilDe(`ce-g-${tag}@example.test`)));
  let tg = r.corpo.correcao; const stG = [];
  for (let i = 2; i <= 4; i++) { const x = await corrigir(`ce-g${i - 1}-${tag}@example.test`, `ce-g${i}x-${tag}@example.test`, tg); stG.push(x.corpo.codigo || x.status); tg = x.corpo.correcao || tg; }
  ok('fantasma: 4a correcao -> CORRECOES_ESGOTADAS igual a conta real', stG.join(',') === '200,200,CORRECOES_ESGOTADAS', stG.join(','));
  r = await corrigir(emD, `ce-g2-${tag}@example.test`, tokenCom(crypto.randomUUID(), Date.now() - 1000));
  ok('fantasma vencido -> 410 igual a conta real', r.status === 410 && r.corpo.codigo === 'CORRECAO_EXPIRADA');

  // limite por IP: 10 por hora
  const ipFixo = ip();
  const st = [];
  for (let i = 0; i < 11; i++) st.push((await corrigir(`x${i}-${tag}@gmail.con`, `y${i}-${tag}@example.test`, 'lixo', 'et', ipFixo)).status);
  ok('limite por IP: 11a chamada -> 429', st.slice(0, 10).every((s) => s === 403) && st[10] === 429, st.join(','));

  // ================= B) tela
  const ctxNovo = async (vp, locale) => {
    const c = await browser.newContext(vp.width < 500 ? { viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale } : { viewport: vp, locale });
    // cada tela com um IP proprio nas rotas do cadastro (limite de 10 por hora por IP)
    const ipTela = ip();
    await c.route('**/api/cadastro**', (x) => x.continue({ headers: { ...x.request().headers(), 'x-real-ip': ipTela } }));
    await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
    await c.route('**/api/funil', (x) => x.fulfill({ status: 200, body: '{"ok":true}' }));
    return c;
  };
  const conferirTela = async (pg, rotulo) => {
    const sw = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`${rotulo}: sem transbordo horizontal`, sw <= 0, String(sw));
  };
  for (const loc of ['et', 'ru']) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      const T = tr(loc);
      const rot = `${loc} ${vp.width}`;
      const ctx = await ctxNovo(vp, loc === 'et' ? 'et-EE' : 'ru-RU');
      const pg = await ctx.newPage();
      const erros = []; pg.on('pageerror', (e) => erros.push(e.message));
      const errado2 = `ce-ui-${loc}${vp.width}-${tag}@gmail.con`;
      const certo2 = `ce-ui-${loc}${vp.width}-${tag}@example.test`;
      await pg.goto(`${SITE}${PREFIXO[loc]}${CADASTRO[loc]}?tipo=cliente`, { waitUntil: 'networkidle' });
      await pg.locator('#c6791-5').fill('TESTE AUTOMATICO');
      await pg.locator('#c6791-6').fill(errado2);
      await pg.locator('#c6791-8').fill(senha);
      await pg.locator('#cadastro-termos').check();
      await pg.getByRole('button', { name: T('cadastro.criarConta'), exact: true }).click();
      await pg.getByRole('heading', { name: T('cadastro.verifiqueTitulo') }).waitFor({ timeout: 20000 });
      const p = await perfilDe(errado2); if (p) contas.add(p.id);
      ok(`${rot}: tela "confira seu e-mail" com o e-mail digitado`, (await pg.getByTestId('cadastro-email-enviado').innerText()) === errado2);
      const linkCorr = pg.getByRole('button', { name: T('cadastro.emailErradoCorrigir') });
      ok(`${rot}: link "${T('cadastro.emailErradoCorrigir')}"`, await linkCorr.isVisible());
      // recarregar a tela nao perde a correcao (sessao)
      await pg.reload({ waitUntil: 'networkidle' });
      await pg.waitForTimeout(800);
      ok(`${rot}: recarregar mantem a tela e o link`, await linkCorr.isVisible().catch(() => false) && (await pg.getByTestId('cadastro-email-enviado').innerText()) === errado2);
      await linkCorr.click();
      const campo = pg.getByLabel(T('cadastro.corrigirEmailLabel'));
      ok(`${rot}: formulario com o rotulo e o e-mail atual`, await campo.isVisible() && (await campo.inputValue()) === errado2);
      ok(`${rot}: foco no campo`, await pg.evaluate(() => document.activeElement?.id) === 'cadastro-novo-email');
      await pg.screenshot({ path: `${RESULT}/cadastro-email-errado-${loc}-${vp.width}-form.png` });
      // cancelar fecha sem mudar nada
      await pg.getByRole('button', { name: T('cadastro.corrigirEmailCancelar') }).click();
      ok(`${rot}: cancelar fecha o formulario`, !(await campo.isVisible()) && await linkCorr.isVisible());
      // mesmo e-mail -> erro na hora
      await linkCorr.click();
      await pg.getByRole('button', { name: T('cadastro.corrigirEmailSalvar') }).click();
      await pg.locator('#cadastro-corrigir-erro').waitFor({ timeout: 8000 }).catch(() => {});
      ok(`${rot}: mesmo e-mail -> aviso`, (await pg.locator('#cadastro-corrigir-erro').innerText().catch(() => '')).includes(T('erros.EMAIL_IGUAL')));
      const t1 = Date.now();
      await campo.fill(certo2);
      await pg.getByRole('button', { name: T('cadastro.corrigirEmailSalvar') }).click();
      const status = pg.getByRole('status').filter({ hasText: certo2 });
      await status.waitFor({ timeout: 15000 }).catch(() => {});
      ok(`${rot}: aviso "${T('cadastro.emailCorrigidoEnviado', { email: certo2 })}"`, (await status.innerText().catch(() => '')) === T('cadastro.emailCorrigidoEnviado', { email: certo2 }));
      ok(`${rot}: e-mail mostrado atualizado`, (await pg.getByTestId('cadastro-email-enviado').innerText()) === certo2);
      await conferirTela(pg, rot);
      await pg.screenshot({ path: `${RESULT}/cadastro-email-errado-${loc}-${vp.width}-ok.png`, fullPage: true });
      const novosUi = await esperaEmail(certo2, t1);
      ok(`${rot}: link no endereco novo`, novosUi.length === 1, novosUi.join(','));
      ok(`${rot}: endereco errado recebeu so o 1o e-mail`, emailsDe(errado2).length === 1, String(emailsDe(errado2).length));
      // abre o link novo: confirma e entra
      const link = novosUi[0] && linkDe(novosUi[0]);
      const pg2 = await ctx.newPage();
      pg2.on('pageerror', (e) => erros.push(e.message));
      await pg2.goto(link.replace(/^https?:\/\/[^/]+/, SITE), { waitUntil: 'networkidle' });
      await pg2.waitForURL(/\/cliente\//, { timeout: 20000 }).catch(() => {});
      ok(`${rot}: link novo confirma e abre o painel do motorista`, /\/cliente\//.test(pg2.url()), pg2.url());
      const uConf = await usuario(p.id);
      ok(`${rot}: conta confirmada com o e-mail novo`, uConf.email === certo2 && !!uConf.email_confirmed_at);
      const l = await anon().auth.signInWithPassword({ email: certo2, password: senha });
      ok(`${rot}: login com senha e e-mail novo`, !l.error, l.error?.message);
      // depois de confirmada, a tela antiga nao corrige mais (avisa e oferece cadastro novo)
      await pg.getByRole('button', { name: T('cadastro.emailErradoCorrigir') }).click();
      await pg.getByLabel(T('cadastro.corrigirEmailLabel')).fill(`ce-ui2-${loc}${vp.width}-${tag}@example.test`);
      await pg.getByRole('button', { name: T('cadastro.corrigirEmailSalvar') }).click();
      await pg.locator('#cadastro-corrigir-erro').waitFor({ timeout: 8000 }).catch(() => {});
      const alerta = await pg.locator('#cadastro-corrigir-erro').innerText().catch(() => '');
      ok(`${rot}: conta ja confirmada -> aviso e "${T('cadastro.corrigirEmailNovoCadastro')}"`, alerta.includes(T('erros.CORRECAO_INVALIDA')) && alerta.includes(T('cadastro.corrigirEmailNovoCadastro')), alerta);
      await pg.getByRole('button', { name: T('cadastro.corrigirEmailNovoCadastro') }).click();
      await pg.locator('#c6791-5').waitFor({ timeout: 8000 }).catch(() => {});
      ok(`${rot}: "${T('cadastro.corrigirEmailNovoCadastro')}" volta ao formulario`, await pg.locator('#c6791-5').isVisible());
      ok(`${rot}: sem erro de pagina`, erros.length === 0, erros.join(' | '));
      await ctx.close();
    }
  }

  // oficina: cadastro pela API, tela restaurada da sessao (como depois de recarregar), et 1280
  {
    const T = tr('et');
    const errO = `ce-of-${tag}@gmail.con`, certoO = `ce-of-${tag}@example.test`;
    const O = await cadastrar(errO, {
      tipo: 'oficina', declaracaoResponsavel: true,
      empresa: { nome_fantasia: 'TESTE AUTOMATICO OU', cnpj: '12345678', endereco: 'Test 1', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: 59.43, longitude: 24.75, especialidades: ['colisao'] },
    });
    ok('oficina: cadastro com token', O.status === 200 && !!O.token && !!O.id, JSON.stringify(O.corpo));
    const ctx = await ctxNovo({ width: 1280, height: 900 }, 'et-EE');
    await ctx.addInitScript((d) => { try { sessionStorage.setItem('bipfix_cadastro_enviado', JSON.stringify(d)); } catch {} }, { email: errO, correcao: O.token, userType: 'oficina', em: Date.now() });
    const pg = await ctx.newPage();
    const erros = []; pg.on('pageerror', (e) => erros.push(e.message));
    await pg.goto(`${SITE}/ee/et/registreeru?tipo=oficina`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(800);
    ok('oficina: tela restaurada com o aviso de analise', (await pg.locator('body').innerText()).includes(T('cadastro.verifiqueAnalise')));
    await pg.getByRole('button', { name: T('cadastro.emailErradoCorrigir') }).click();
    await pg.getByLabel(T('cadastro.corrigirEmailLabel')).fill(certoO);
    const t2 = Date.now();
    await pg.getByRole('button', { name: T('cadastro.corrigirEmailSalvar') }).click();
    await pg.getByRole('status').filter({ hasText: certoO }).waitFor({ timeout: 15000 }).catch(() => {});
    ok('oficina: corrigido pela tela', (await usuario(O.id)).email === certoO && (await perfilDe(certoO))?.id === O.id);
    ok('oficina: link no endereco novo (em estoniano)', (await esperaEmail(certoO, t2)).some((f) => fs.readFileSync(path.join(EMAILS, f), 'utf8').includes('Kinnita')));
    ok('oficina: sem erro de pagina', erros.length === 0, erros.join(' | '));
    await ctx.close();
  }

  // texto nos 6 idiomas (tela restaurada com um token qualquer; nada e enviado)
  for (const loc of Object.keys(PREFIXO)) {
    const T = tr(loc);
    const ctx = await ctxNovo({ width: 390, height: 844 }, loc);
    await ctx.addInitScript((d) => { try { sessionStorage.setItem('bipfix_cadastro_enviado', JSON.stringify(d)); } catch {} }, { email: `ce-l-${tag}@gmail.con`, correcao: 'x.y', userType: 'cliente', em: Date.now() });
    const pg = await ctx.newPage();
    const erros = []; pg.on('pageerror', (e) => erros.push(e.message));
    await pg.goto(`${SITE}${PREFIXO[loc]}${CADASTRO[loc]}?tipo=cliente`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(600);
    const b = pg.getByRole('button', { name: T('cadastro.emailErradoCorrigir') });
    ok(`${loc}: link "${T('cadastro.emailErradoCorrigir')}"`, await b.isVisible().catch(() => false));
    await b.click().catch(() => {});
    const corpo = await pg.locator('body').innerText();
    ok(`${loc}: formulario traduzido`, [T('cadastro.corrigirEmailLabel'), T('cadastro.corrigirEmailSalvar'), T('cadastro.corrigirEmailCancelar')].every((x) => corpo.includes(x)) && !corpo.includes('cadastro.'));
    await conferirTela(pg, loc);
    ok(`${loc}: sem erro de pagina`, erros.length === 0, erros.join(' | '));
    await ctx.close();
  }
} catch (e) {
  falhas++; console.log('ERRO', e.stack || e.message);
} finally {
  await browser.close();
  for (const id of contas) {
    await sb.from('oficinas').delete().eq('profile_id', id);
    await sb.from('profiles').delete().eq('id', id);
    await sb.auth.admin.deleteUser(id);
  }
  console.log(`limpeza ok (${contas.size} contas)`);
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
