// E2E LOCAL da categoria "Klaasid" (vidros) + "Muu / ei tea" (outro, so o rotulo do motorista) - dono 18/11.
// Como gente de verdade, no navegador (Chromium 390 px e 1280 px), num site "como producao" que este script sobe
// em :3102 a partir do build DESTA copia do app (Resend e Expo falsos: nada sai para servicos reais; :3100 intocado).
//   G  grade do motorista: 8 tipos na ordem (... Elektritood, Rehvid, Klaasid, Muu / ei tea), rotulos et/ru/en,
//      icones 🪟 e ❓; pedido logado (nova-solicitacao) com a mesma grade; it/pt/pt-PT pelos arquivos de traducao
//   P  motorista SEM conta, os 8 tipos em et, ru e en (24 pedidos pela tela): servico -> descricao + foto -> carro ->
//      local (GPS) -> contato -> codigo do e-mail (Resend falso) -> confirmado; tipo gravado, foto, quem foi avisado;
//      em cada tela: sem erro JS, sem 4xx/5xx do site, sem rolagem lateral, sem chave crua.
//      Klaasid e Muu: recarregar, voltar xN depois de enviar (nao prende), reabrir logado (vai ao pedido normal)
//   R  matriz de quem recebe (pedido por API, conta real): vidros -> so oficinas com Klaasid no raio; outro -> todas
//      no raio; carroceria -> grupo; mecanica/pneu/eletrica/revisao -> exato; fora do raio -> ninguem; JS == banco
//   N  avisos: sino + e-mail no idioma de cada oficina com o rotulo certo; push (Expo falsa) com o rotulo; conta de
//      TESTE: so oficina de teste, sino sim, e-mail/push nao
//   O  oficinas pela tela: caixa de pedidos so com os tipos dela; orcamento; "Pole huvi" com motivo; agenda/hoje/
//      mensagens abrem; motorista aceita o orcamento e conversa
//   C  cadastro de oficina marcando Klaasid (et 390, ru 1280) - lista com "Muu" curto; perfil: marca/desmarca
//      Klaasid, Kere, Muu, logo, almoco, salvar -> banco e roteamento mudam
//   A  admin: lista/filtro e detalhe do pedido de vidros
//   V  app antigo (build web de 15/11, sem 'vidros' na grade): le o pedido de vidros sem quebrar; rotulo pelo
//      arquivo de traducao antigo
// Uso: node categoria-vidro.mjs [<.env.local>]   (rodar a partir da copia que tem o `next build`)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execSync } from 'node:child_process';

const PORTA_SITE = Number(process.env.PORTA_SITE || 3102);
process.env.SITE = `http://localhost:${PORTA_SITE}`;
const L = await import('./pecas-v3-lib.mjs');
const { lerEnv, contador, tradutor, abrirNavegadores, SITE, ENV_PADRAO, WEB, RAIZ, siteNoAr, vigiar, sleep, psql, perto, PREFIXO, createClient, botao } = L;

const env = lerEnv(process.argv[2] || ENV_PADRAO);
if (await siteNoAr()) { console.log(`FALHA ja ha um site em ${SITE} - pare-o antes (este teste sobe o seu)`); process.exit(2); }
const SO = (process.env.GRUPOS || 'G,P,R,N,O,C,A,V').split(',');
const { ok, fim, tentar } = contador();
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/categoria-vidro';
fs.mkdirSync(OUT, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const tag = crypto.randomBytes(3).toString('hex');
const SENHA = `Vidro-${crypto.randomBytes(5).toString('hex')}A1`;
let ipN = 1;
const ip = () => `10.81.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
const criado = { contas: new Set(), oficinas: new Set(), emails: new Set(), tokens: [] };
const T = { et: tradutor('et'), ru: tradutor('ru'), en: tradutor('en'), it: tradutor('it'), pt: tradutor('pt'), 'pt-PT': tradutor('pt-PT') };

// ---------------- contrato desta mudanca ----------------
const ORDEM = ['colisao', 'funilaria', 'revisao', 'mecanica', 'eletrica', 'pneu', 'vidros', 'outro'];
const VIDROS = { et: 'Klaasid', ru: 'Стёкла', en: 'Glass', it: 'Vetri', pt: 'Vidros', 'pt-PT': 'Vidros' };
const OUTRO_MOTORISTA = { et: 'Muu / ei tea', ru: 'Другое / не знаю', en: "Other / I don't know", it: 'Altro / non so', pt: 'Outro / não sei', 'pt-PT': 'Outro / não sei' };
const OUTRO_OFICINA = { et: 'Muu', ru: 'Другое', en: 'Other', it: 'Altro', pt: 'Outro', 'pt-PT': 'Outro' };
const rotuloMotorista = (l, tipo) => (tipo === 'outro' ? OUTRO_MOTORISTA[l] : T[l](`constants.tiposServico.${tipo}`));
const rotuloOficina = (l, tipo) => T[l](`constants.tiposServico.${tipo}`);
const ICONE = { vidros: '🪟', outro: '❓' };
const CAMINHO_PEDIDO = { et: '/paring', ru: '/zayavka', en: '/request' };
const CRUA = /\?\?[a-zA-Z]|\b(constants|tiposServico|tiposServicoMotorista|pedidoSemConta|clienteNovaSolicitacao|oficinaPedidos|oficinaPerfil)\.[a-zA-Z_]+|\bundefined\b|\bNaN\b/;

// ---------------- servidor falso (Resend + Expo) e o site :3102 ----------------
const emails = []; const pushes = [];
const falso = http.createServer((req, res) => {
  let corpo = ''; req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    let j = null; try { j = JSON.parse(corpo); } catch { /* */ }
    if (req.url.startsWith('/emails')) {
      for (const m of Array.isArray(j) ? j : [j]) emails.push({ to: [].concat(m?.to || []).map((x) => String(x).toLowerCase()), subject: m?.subject || '', html: m?.html || '', em: Date.now() });
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: crypto.randomUUID() })); return;
    }
    if (req.url.startsWith('/push')) { const lote = Array.isArray(j) ? j : []; pushes.push(...lote); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: lote.map(() => ({ status: 'ok', id: crypto.randomUUID() })) })); return; }
    res.writeHead(404); res.end();
  });
});
await new Promise((r) => falso.listen(0, '127.0.0.1', r));
const PF = falso.address().port;
const PUSH_CHAVE = `push-${tag}`;
let log = '';
const site = spawn(process.execPath, [path.join(WEB, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORTA_SITE)], {
  cwd: WEB,
  env: { ...process.env, RESEND_API_KEY: 're_teste_local_falso', RESEND_BASE_URL: `http://127.0.0.1:${PF}`, EXPO_PUSH_URL: `http://127.0.0.1:${PF}/push`, PUSH_CHAVE },
  stdio: ['ignore', 'pipe', 'pipe'],
});
site.stdout.on('data', (d) => { log += d; }); site.stderr.on('data', (d) => { log += d; });
let appWeb = null;
const pararTudo = () => { try { site.kill(); } catch { /* */ } try { appWeb?.kill(); } catch { /* */ } falso.close(); };

const emailsPara = (e, depois = 0) => emails.filter((m) => m.to.includes(String(e).toLowerCase()) && m.em >= depois);
const esperar = async (fn, cond, n = 40, ms = 300) => { let v; for (let i = 0; i < n; i++) { v = await fn(); if (cond(v)) return v; await sleep(ms); } return v; };
const codigoDe = async (email, depois) => {
  const m = await esperar(async () => emailsPara(email, depois).at(-1), (x) => !!x, 60);
  const txt = String(m?.html || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
  return (txt.match(/(?<![\d#])\d{6}(?!\d)/) || [])[0] || null;
};
const api = async (metodo, rota, corpo, headers = {}) => {
  try {
    const r = await fetch(`${SITE}${rota}`, { method: metodo, headers: { 'Content-Type': 'application/json', 'x-real-ip': ip(), ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { status: r.status, d: await r.json().catch(() => ({})) };
  } catch (e) { return { status: 0, d: { erro: String(e?.message || e) } }; }
};

// ---------------- contas e oficinas ----------------
const HORARIO = Object.fromEntries(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map((d) => [d, { aberto: true, inicio: '08:00', fim: '18:00' }]));
async function conta(tipo, apelido, { idioma = 'et', contaTeste = false } = {}) {
  const email = `vidro-${apelido}-${tag}@example.test`.toLowerCase();
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
  if (error) throw new Error(`createUser ${apelido}: ${error.message}`);
  criado.contas.add(data.user.id); criado.emails.add(email);
  const { error: e2 } = await admin.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE-VIDRO ${apelido}`, email, idioma, telefone: '+372 5000 0001', conta_teste: contaTeste, senha_definida: true, ativo: true, termos_aceitos_em: new Date().toISOString() });
  if (e2) throw new Error(`profile ${apelido}: ${e2.message}`);
  return { id: data.user.id, email, senha: SENHA, idioma, contaTeste, apelido };
}
async function oficina(dono, apelido, especialidades, { km = 1, raio = 30 } = {}) {
  const p = perto(km);
  const nome = `TESTE-VIDRO ${apelido} ${tag}`;
  const { data, error } = await admin.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: nome, endereco: `${apelido} tee`, numero: '1', cidade: 'Narva', estado: 'Ida-Virumaa', cep: '20308', pais: 'EE', latitude: p.lat, longitude: p.lon, raio_atendimento_km: raio, especialidades, ativa: true, seguradoras_convencionadas: [], horario_funcionamento: HORARIO }).select('id').single();
  if (error) throw new Error(`oficina ${apelido}: ${error.message}`);
  criado.oficinas.add(data.id);
  return { id: data.id, dono, nome, especialidades, apelido };
}
const sessao = async (u) => { const c = anon(); const { data, error } = await c.auth.signInWithPassword({ email: u.email, password: u.senha }); if (error) throw new Error(`login ${u.email}: ${error.message}`); return { c, token: data.session.access_token }; };

// pedido pela API (o mesmo que a tela manda), com a sessao da conta = direto, sem codigo
const FOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
async function pedidoApi(cli, tipo, { km = 0, idioma = cli.idioma } = {}) {
  const p = perto(km);
  const form = new FormData();
  form.append('dados', JSON.stringify({ origem: 'site', idioma, nome: 'TESTE-VIDRO', email: cli.email, telefone: '', aceitouTermos: true, tipo, descricao: `TESTE-VIDRO ${tipo} ${tag}`, urgencia: 'media', endereco: `Narva ${km}`, latitude: p.lat, longitude: p.lon, pais: 'EE', veiculo: { tipo: 'cars', marca: 'Skoda', modelo: 'Octavia', ano: '2016', codigo: null, placa: '123ABC' } }));
  const r = await fetch(`${SITE}/api/pedido-sem-conta`, { method: 'POST', body: form, headers: { 'x-real-ip': ip(), Authorization: `Bearer ${cli.token}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.solicitacaoId) throw new Error(`pedidoApi ${tipo}: ${r.status} ${JSON.stringify(d)}`);
  return d.solicitacaoId;
}
const avisados = async (solId) => (await admin.from('notificacoes').select('id, profile_id, mensagem, titulo, dados').eq('tipo', 'nova_solicitacao').eq('dados->>solicitacao_id', solId)).data || [];
const esperarAvisos = async (solId, n) => esperar(() => avisados(solId), (a) => a.length >= n, 30);

// ---------------- navegador: vigias por pagina ----------------
let nav = null;
function vigias(p, quem) {
  const erros = []; const http4 = [];
  vigiar(p, erros, quem);
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR_ABORTED|Download the React DevTools/.test(m.text())) erros.push(`${quem} console: ${m.text().slice(0, 160)}`); });
  p.on('response', (r) => { const u = r.url(); if (u.startsWith(SITE) && r.status() >= 400 && !/\/api\/funil|\/_next\/static\/.*\.map/.test(u)) http4.push(`${r.status()} ${u.replace(SITE, '')}`); });
  return { erros, http4 };
}
const semLateral = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1).catch(() => false);
const textoTela = (p) => p.evaluate(() => document.body.innerText).catch(() => '');
async function conferirTela(p, nome, v) {
  ok(`${nome}: sem rolagem lateral`, await semLateral(p));
  const t = await textoTela(p);
  const c = t.match(CRUA);
  ok(`${nome}: sem chave crua de traducao`, !c, c?.[0]);
  if (v) {
    ok(`${nome}: sem erro de JS/console`, !v.erros.length, v.erros.slice(0, 3).join(' | '));
    ok(`${nome}: sem 4xx/5xx do site`, !v.http4.length, v.http4.slice(0, 4).join(' | '));
    v.erros.length = 0; v.http4.length = 0;
  }
  return t;
}
async function escolherCarroCampo(page, id, nome, re) {
  const el = page.locator('#' + id);
  await el.waitFor({ state: 'visible', timeout: 20000 });
  if ((await el.evaluate((e) => e.tagName)) === 'SELECT') {
    await page.waitForFunction((e) => e.options.length > 2, await el.elementHandle(), { timeout: 20000 });
    const opc = await el.locator('option').allTextContents();
    await el.selectOption({ label: opc.find((o) => (re || new RegExp('^' + nome + '$')).test(o)) || opc[1] });
    return;
  }
  await page.waitForFunction((e) => !e.getAttribute('aria-busy') || e.getAttribute('aria-busy') === 'false', await el.elementHandle(), { timeout: 20000 }).catch(() => {});
  await el.click(); await el.fill(nome.slice(0, 4));
  const op = page.getByTestId(id + '-lista').getByRole('option', { name: nome, exact: true });
  await op.waitFor({ timeout: 20000 }); await op.click();
}
const contexto = (largura, extra = {}) => nav.contexto('chromium', largura, ip, extra);
async function entrar(p, l, u) {
  await p.goto(`${SITE}${PREFIXO[l]}/login`, { waitUntil: 'networkidle' });
  await p.locator('#c0862-2').fill(u.email);
  await p.locator('#login-senha').fill(u.senha);
  await p.locator('form:has(#login-senha) button[type=submit]').click();
  await p.waitForURL((x) => /\/(oficina|loja|cliente|admin)(\/|$)/.test(x.pathname), { timeout: 30000 }).catch(() => {});
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(500);
}
async function gradeDe(p) {
  const botoes = p.getByTestId('passo-servico').locator('button');
  const n = await botoes.count();
  const r = [];
  for (let i = 0; i < n; i++) r.push({ icone: (await botoes.nth(i).locator('span').first().innerText()).trim(), rotulo: (await botoes.nth(i).locator('p').first().innerText()).trim() });
  return r;
}

// ---------------- o teste ----------------
const ESTADO = { pedidosUI: [], oficinas: {}, clientes: {} };
try {
  let no = false;
  for (let i = 0; i < 90 && !no; i++) { await sleep(1000); no = await siteNoAr(); }
  ok(`site "como producao" no ar em ${SITE} (Resend e Expo falsos)`, no, log.slice(-300));
  if (!no) throw new Error('site nao subiu');
  nav = await abrirNavegadores(false);

  // ---- oficinas de Narva (raio 30 km) e contas ----
  const W = ESTADO.oficinas;
  const mk = async (apelido, esp, idioma, opts = {}) => { const d = await conta('oficina', apelido, { idioma, contaTeste: !!opts.teste }); W[apelido] = await oficina(d, apelido, esp, opts); return W[apelido]; };
  await mk('vidro', ['vidros'], 'et', { km: 1 });
  await mk('vidromec', ['vidros', 'mecanica'], 'ru', { km: 2 });
  await mk('kere', ['funilaria', 'colisao'], 'en', { km: 1 });
  await mk('mec', ['mecanica'], 'it', { km: 1 });
  await mk('pneu', ['pneu'], 'pt', { km: 1 });
  await mk('eletr', ['eletrica', 'revisao'], 'et', { km: 3 });
  await mk('todas', [], 'en', { km: 2 });
  await mk('longe', ['vidros'], 'et', { km: 45 });
  await mk('teste', ['vidros'], 'et', { km: 1, teste: true });
  const MINHAS = Object.values(W);
  const nomeDe = new Map(MINHAS.map((o) => [o.dono.id, o.apelido]));
  // quem deve receber cada tipo (tabela escrita a mao - NAO usa tipoCompativel, para nao ser tautologia)
  const ESPERADO = {
    colisao: ['kere', 'todas'], funilaria: ['kere', 'todas'], revisao: ['eletr', 'todas'], mecanica: ['vidromec', 'mec', 'todas'],
    eletrica: ['eletr', 'todas'], pneu: ['pneu', 'todas'], vidros: ['vidro', 'vidromec', 'todas'],
    outro: ['vidro', 'vidromec', 'kere', 'mec', 'pneu', 'eletr', 'todas'],
  };
  const quem = async (solId, n) => { const a = await esperarAvisos(solId, n); return { avisos: a, nomes: a.map((x) => nomeDe.get(x.profile_id) || `ESTRANHA:${x.profile_id.slice(0, 8)}`).sort() }; };

  // ======================= G: grade =======================
  if (SO.includes('G')) await tentar('G', async () => {
    for (const l of ['it', 'pt', 'pt-PT', 'et', 'ru', 'en']) {
      ok(`G.0 ${l}: traducao "${VIDROS[l]}" e "${OUTRO_MOTORISTA[l]}" (motorista), "${OUTRO_OFICINA[l]}" (oficina)`, T[l]('constants.tiposServico.vidros') === VIDROS[l] && T[l]('constants.tiposServicoMotorista.outro') === OUTRO_MOTORISTA[l] && T[l]('constants.tiposServico.outro') === OUTRO_OFICINA[l]);
    }
    for (const [l, largura] of [['et', 390], ['ru', 390], ['en', 390], ['et', 1280]]) {
      const ctx = await contexto(largura); const p = await ctx.newPage(); const v = vigias(p, `G ${l} ${largura}`);
      await p.goto(`${SITE}${PREFIXO[l]}${CAMINHO_PEDIDO[l]}`, { waitUntil: 'networkidle' });
      await p.getByTestId('passo-servico').waitFor({ timeout: 20000 });
      const g = await gradeDe(p);
      const esperado = ORDEM.map((t) => rotuloMotorista(l, t));
      ok(`G.1 ${l} ${largura}: 8 tipos na ordem certa`, JSON.stringify(g.map((x) => x.rotulo)) === JSON.stringify(esperado), JSON.stringify(g.map((x) => x.rotulo)));
      ok(`G.2 ${l} ${largura}: Klaasid 🪟 e "${OUTRO_MOTORISTA[l]}" ❓ nos 2 ultimos`, g[6]?.icone === ICONE.vidros && g[7]?.icone === ICONE.outro, JSON.stringify(g.slice(6)));
      // 2 por linha: os 8 cartoes em 4 linhas, os 2 da ultima linha lado a lado
      const caixas = await p.getByTestId('passo-servico').locator('button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.left), Math.round(r.right)]; }));
      const linhas = new Set(caixas.map((c) => c[0]));
      ok(`G.3 ${l} ${largura}: 2 por linha (4 linhas) e nenhum cartao sai da tela`, linhas.size === 4 && caixas.every((c) => c[2] <= (largura) + 1) && caixas[6][0] === caixas[7][0], JSON.stringify(caixas));
      await p.screenshot({ path: `${OUT}/grade-${l}-${largura}.png`, fullPage: true });
      await conferirTela(p, `G ${l} ${largura} grade`, v);
      await ctx.close();
    }
  });

  // ======================= R + N: matriz pela API =======================
  const cli = await conta('cliente', 'cliente-real', { idioma: 'et' });
  Object.assign(cli, await sessao(cli));
  const cliTeste = await conta('cliente', 'cliente-teste', { idioma: 'et', contaTeste: true });
  Object.assign(cliTeste, await sessao(cliTeste));
  ESTADO.clientes = { cli, cliTeste };
  const solPorTipo = {};
  if (SO.includes('R') || SO.includes('N') || SO.includes('O') || SO.includes('A') || SO.includes('V')) await tentar('R', async () => {
    // JS (packages/shared) == banco (tipo_compativel) em toda combinacao
    const ESP = [[], ['vidros'], ['funilaria'], ['colisao', 'funilaria'], ['mecanica'], ['pneu'], ['outro'], ['vidros', 'mecanica'], ['pintura']];
    let tipoCompativel = null;
    try {
      const { createRequire } = await import('node:module');
      const criarJiti = createRequire(path.join(RAIZ, 'package.json'))('jiti');
      tipoCompativel = criarJiti(path.join(WEB, 'scripts/e2e/x.js'), { interopDefault: true })(path.join(RAIZ, 'packages/shared/constants/index.ts')).tipoCompativel;
    } catch (e) { console.log('jiti:', e.message); }
    if (tipoCompativel) {
      const dif = [];
      for (const e of ESP) for (const t of ORDEM) {
        const db = psql(`select tipo_compativel('{${e.join(',')}}'::tipo_servico[], '${t}')`) === 't';
        if (db !== tipoCompativel(e, t)) dif.push(`${e.join('+') || '-'}/${t}: banco ${db} js ${!db}`);
      }
      ok('R.0 regra JS (tipoCompativel) == banco (tipo_compativel) em 72 combinacoes', !dif.length, dif.join(' | '));
    } else ok('R.0 jiti para ler packages/shared', false, 'jiti nao encontrado');
    ok('R.0b vidros nao e do grupo carroceria nem "vai para todas"', psql("select tipo_compativel('{funilaria,colisao}','vidros')") === 'f' && psql("select tipo_compativel('{vidros}','colisao')") === 'f' && psql("select tipo_compativel('{vidros}','outro')") === 't');
    for (const t of ORDEM) {
      const id = await pedidoApi(cli, t);
      solPorTipo[t] = id;
      const r = await quem(id, ESPERADO[t].length);
      await sleep(400);
      const r2 = await quem(id, ESPERADO[t].length);
      ok(`R.1 ${t}: avisados = ${ESPERADO[t].join(', ')}`, JSON.stringify(r2.nomes) === JSON.stringify([...ESPERADO[t]].sort()), JSON.stringify(r2.nomes));
      ok(`R.2 ${t}: ninguem fora do raio (longe) nem a oficina de teste`, !r2.nomes.includes('longe') && !r2.nomes.includes('teste'));
    }
    const idFora = await pedidoApi(cli, 'vidros', { km: -60 });
    await sleep(2500);
    const fora = await avisados(idFora);
    ok('R.3 pedido de vidros fora do raio de todas -> ninguem avisado', fora.length === 0, JSON.stringify(fora.map((x) => nomeDe.get(x.profile_id) || x.profile_id)));
    solPorTipo.fora = idFora;
    const idFora2 = await pedidoApi(cli, 'outro', { km: -60 });
    await sleep(2500);
    ok('R.3b "Muu / ei tea" fora do raio -> ninguem avisado', (await avisados(idFora2)).length === 0);
  });

  if (SO.includes('N')) await tentar('N', async () => {
    // sino no idioma de cada oficina, com o rotulo do tipo
    for (const t of ['vidros', 'outro']) {
      const a = await avisados(solPorTipo[t]);
      for (const x of a) {
        const of = MINHAS.find((o) => o.dono.id === x.profile_id); if (!of) continue;
        const l = of.dono.idioma;
        ok(`N.1 ${t} -> ${of.apelido} (${l}): sino comeca com "${rotuloOficina(l, t)} - "`, String(x.mensagem).startsWith(`${rotuloOficina(l, t)} - `), x.mensagem);
        const txts = x.dados?.textos || {};
        ok(`N.1b ${t} -> ${of.apelido}: textos do sino nas 6 linguas com o rotulo`, ['pt', 'pt-PT', 'en', 'et', 'it', 'ru'].every((k) => String(txts[k]?.mensagem || '').startsWith(rotuloOficina(k, t))), JSON.stringify(Object.fromEntries(Object.entries(txts).map(([k, v]) => [k, v?.mensagem?.slice(0, 20)]))));
      }
    }
    // e-mail (Resend falso) no idioma, com o tipo no assunto e no corpo; so quem recebeu o aviso
    await sleep(6000);
    const ASSUNTO = { et: 'Uus päring: ', ru: 'Новая заявка: ', en: 'New request: ', it: 'Nuova richiesta: ', pt: 'Novo pedido: ' };
    for (const nome of ESPERADO.vidros) {
      const of = W[nome]; const l = of.dono.idioma;
      const m = await esperar(async () => emailsPara(of.dono.email).filter((e) => e.subject.includes(VIDROS[l])), (x) => x.length > 0, 40);
      ok(`N.2 e-mail de vidros para ${nome} (${l}): "${ASSUNTO[l]}${VIDROS[l]} – Skoda Octavia"`, m.length >= 1 && m[0].subject === `${ASSUNTO[l]}${VIDROS[l]} – Skoda Octavia` && m[0].html.includes(VIDROS[l]), m.map((e) => e.subject).join(' | '));
    }
    for (const nome of ['kere', 'mec', 'pneu', 'eletr', 'longe', 'teste']) {
      const l = W[nome].dono.idioma;
      ok(`N.3 ${nome}: nenhum e-mail de vidros`, !emailsPara(W[nome].dono.email).some((e) => e.subject.includes(VIDROS[l])));
    }
    const mOutro = await esperar(async () => emailsPara(W.mec.dono.email).filter((e) => e.subject.includes('Altro')), (x) => x.length > 0, 40);
    ok('N.4 e-mail do "Muu / ei tea" para a oficina it: "Nuova richiesta: Altro – Skoda Octavia" (rotulo curto da oficina)', mOutro[0]?.subject === 'Nuova richiesta: Altro – Skoda Octavia', mOutro.map((e) => e.subject).join(' | '));
    // push do app (Expo falsa), com o rotulo no corpo
    for (const nome of ['vidro', 'vidromec']) {
      const of = W[nome]; const token = `ExponentPushToken[vidro-${nome}-${tag}]`;
      const { data: tk, error } = await admin.from('push_tokens').insert({ profile_id: of.dono.id, token, plataforma: 'android' }).select('id').single();
      if (error) throw new Error(`push_tokens: ${error.message}`);
      criado.tokens.push(tk.id);
      const aviso = (await avisados(solPorTipo.vidros)).find((x) => x.profile_id === of.dono.id);
      const r = await api('POST', '/api/push/notificacao', { id: aviso?.id }, { 'x-push-chave': PUSH_CHAVE });
      const msg = pushes.find((m) => m.to === token);
      ok(`N.5 push para ${nome}: corpo comeca com "${VIDROS[of.dono.idioma]}"`, r.d?.enviados === 1 && String(msg?.body || '').startsWith(VIDROS[of.dono.idioma]), `${JSON.stringify(r)} ${JSON.stringify(msg)}`);
    }
    // conta de TESTE: pedido de vidros do cliente de teste -> so a oficina de teste (sino), sem e-mail nem push
    const idT = await pedidoApi(cliTeste, 'vidros');
    solPorTipo.teste = idT;
    const rt = await quem(idT, 1);
    ok('N.6 cliente de TESTE + vidros: so a oficina de TESTE com Klaasid recebe o sino', JSON.stringify(rt.nomes) === '["teste"]', JSON.stringify(rt.nomes));
    const tokenT = `ExponentPushToken[vidro-teste-${tag}]`;
    const { data: tkT } = await admin.from('push_tokens').insert({ profile_id: W.teste.dono.id, token: tokenT, plataforma: 'android' }).select('id').single();
    if (tkT) criado.tokens.push(tkT.id);
    const rpT = await api('POST', '/api/push/notificacao', { id: rt.avisos[0]?.id }, { 'x-push-chave': PUSH_CHAVE });
    await sleep(4000);
    ok('N.7 oficina de TESTE: nenhum e-mail pelo Resend e nenhum push', emailsPara(W.teste.dono.email).length === 0 && rpT.d?.enviados === 0 && !pushes.some((m) => m.to === tokenT), `${emailsPara(W.teste.dono.email).length} ${JSON.stringify(rpT)}`);
  });

  // ======================= P: 24 pedidos pela tela =======================
  if (SO.includes('P')) await tentar('P', async () => {
    const IDIOMAS_P = (process.env.IDIOMAS_P || 'et,ru,en').split(',');
    for (const l of IDIOMAS_P) {
      for (const [i, tipo] of ORDEM.entries()) {
        const largura = i % 2 === 0 ? 390 : 1280;
        const nome = `P ${l} ${largura} ${tipo}`;
        const especial = tipo === 'vidros' || tipo === 'outro';
        await tentar(nome, async () => {
          const pos = perto(0.2);
          const ctx = await contexto(largura, { geolocation: { latitude: pos.lat, longitude: pos.lon }, permissions: ['geolocation'] });
          const p = await ctx.newPage(); const v = vigias(p, nome);
          await p.goto(`${SITE}${PREFIXO[l]}${CAMINHO_PEDIDO[l]}`, { waitUntil: 'networkidle' });
          await p.getByTestId('passo-servico').waitFor({ timeout: 20000 });
          await conferirTela(p, `${nome} 1 servico`, v);
          const rot = rotuloMotorista(l, tipo);
          await p.getByTestId('passo-servico').locator('button').filter({ has: p.locator('p', { hasText: new RegExp(`^${rot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).click();
          await p.getByTestId('passo-detalhe').waitFor({ timeout: 10000 });
          const det = (await p.getByTestId('detalhe-tipo').innerText()).trim();
          ok(`${nome}: passo 2 mostra "${especial ? ICONE[tipo] + ' ' : ''}${rot}"`, det.endsWith(rot) && (!especial || det.startsWith(ICONE[tipo])), det);
          if (tipo === 'vidros') ok(`${nome}: exemplo do passo 2 e o de vidros`, (await p.locator('#pedido-descricao').getAttribute('placeholder')) === T[l]('pedidoSemConta.exemploVidro'));
          await p.locator('#pedido-descricao').fill(`TESTE-VIDRO tela ${l} ${tipo} ${tag}`);
          await conferirTela(p, `${nome} 2 detalhe`, v);
          await p.getByTestId('passo-detalhe').getByRole('button', { name: T[l]('clienteNovaSolicitacao.next'), exact: true }).click();
          // pedido em etapas (19/11): a foto tem tela propria (passo 3)
          await p.getByTestId('passo-fotos').waitFor({ timeout: 10000 });
          await p.getByTestId('passo-fotos').locator('input[type=file][multiple]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: FOTO });
          await p.waitForTimeout(800);
          await conferirTela(p, `${nome} 2b fotos`, v);
          await p.getByTestId('passo-fotos').getByRole('button', { name: T[l]('clienteNovaSolicitacao.next'), exact: true }).click();
          await p.getByTestId('passo-carro').waitFor({ state: 'visible' });
          await escolherCarroCampo(p, 'cbbe3-101', 'Toyota');
          await escolherCarroCampo(p, 'cbbe3-102', 'Corolla', /Corolla/);
          const ano = p.locator('#cbbe3-103');
          if (await ano.count()) { if ((await ano.evaluate((e) => e.tagName)) === 'SELECT') await ano.selectOption({ index: 1 }); else await ano.fill('2019'); }
          await p.locator('#pedido-placa').fill('555TST');
          await conferirTela(p, `${nome} 3 carro`, v);
          await p.getByTestId('passo-carro').getByRole('button', { name: T[l]('clienteNovaSolicitacao.next'), exact: true }).click();
          await p.getByTestId('passo-local').waitFor();
          await p.getByTestId('usar-localizacao').click();
          await esperar(() => p.locator('#pedido-endereco').inputValue().catch(() => ''), (x) => !!x, 40);
          await conferirTela(p, `${nome} 4 local`, v);
          await p.getByTestId('passo-local').getByRole('button', { name: T[l]('clienteNovaSolicitacao.next'), exact: true }).click();
          await p.getByTestId('passo-contato').waitFor();
          const email = `vidro-tela-${l}-${tipo}-${tag}@example.test`; criado.emails.add(email);
          await p.locator('#pedido-nome').fill('TESTE-VIDRO');
          await p.locator('#pedido-email').fill(email);
          await p.getByTestId('aceito-termos').check();
          await conferirTela(p, `${nome} 5 contato`, v);
          const t0 = Date.now();
          await p.getByTestId('passo-contato').getByRole('button', { name: T[l]('pedidoSemConta.enviarPedido'), exact: true }).click();
          await p.getByTestId('passo-codigo').waitFor({ timeout: 30000 });
          await conferirTela(p, `${nome} 6 codigo`, v);
          const codigo = await codigoDe(email, t0);
          ok(`${nome}: codigo chegou pelo e-mail (Resend falso)`, !!codigo);
          await p.locator('#pedido-codigo').fill(codigo || '');
          await p.getByTestId('confirmar-codigo').click();
          await p.getByTestId('criar-senha').waitFor({ timeout: 30000 });
          await p.getByTestId('criar-senha-agora-nao').click();
          await p.waitForURL(/orcamentos\//, { timeout: 30000 }).catch(() => {});
          const solId = (p.url().match(/orcamentos\/([0-9a-f-]{36})/) || [])[1];
          ok(`${nome}: confirmado -> abre o pedido logado`, !!solId, p.url());
          await p.waitForTimeout(1500);
          await conferirTela(p, `${nome} 7 pedido aberto`, v);
          const { data: sol } = await admin.from('solicitacoes').select('id, tipo, cliente_id, numero').eq('id', solId || '00000000-0000-0000-0000-000000000000').maybeSingle();
          if (sol) criado.contas.add(sol.cliente_id);
          ok(`${nome}: banco - tipo '${tipo}'`, sol?.tipo === tipo, sol?.tipo);
          const fotos = sol ? (await admin.from('solicitacao_fotos').select('id').eq('solicitacao_id', sol.id)).data?.length : 0;
          ok(`${nome}: 1 foto no pedido`, fotos === 1, String(fotos));
          if (sol) {
            const r = await quem(sol.id, ESPERADO[tipo].length);
            ok(`${nome}: avisados = ${ESPERADO[tipo].join(', ')}`, JSON.stringify(r.nomes) === JSON.stringify([...ESPERADO[tipo]].sort()), JSON.stringify(r.nomes));
            ESTADO.pedidosUI.push({ l, tipo, solId: sol.id, numero: sol.numero, email, clienteId: sol.cliente_id });
          }
          if (especial && sol) {
            // recarregar: continua no pedido, logado
            await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
            ok(`${nome}: recarregar continua no pedido (logado)`, p.url().includes(`/orcamentos/${sol.id}`) && !/\/login/.test(p.url()), p.url());
            // voltar xN: 1a volta no inicio do painel, a seguinte sai do pedido (nao prende nos passos)
            const visitas = [];
            for (let k = 0; k < 6; k++) {
              await p.goBack({ timeout: 8000 }).catch(() => {}); await p.waitForTimeout(1500);
              visitas.push(p.url().startsWith(SITE) ? new URL(p.url()).pathname : p.url());
              if (!p.url().startsWith(SITE)) break;
            }
            ok(`${nome}: voltar xN depois de enviar nao prende (painel uma vez e sai)`, visitas.length <= 2 && /\/cliente\/dashboard$/.test(visitas[0] || '') && !p.url().startsWith(SITE), visitas.join(' > '));
            // reabrir logado: o formulario sem conta leva ao pedido normal; a grade logada tambem tem 8 tipos
            const p2 = await ctx.newPage(); const v2 = vigias(p2, `${nome} reabrir`);
            await p2.goto(`${SITE}${PREFIXO[l]}${CAMINHO_PEDIDO[l]}`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(1500);
            ok(`${nome}: reabrir logado vai ao pedido normal`, !new RegExp(`${CAMINHO_PEDIDO[l]}$`).test(new URL(p2.url()).pathname), p2.url());
            await p2.goto(`${SITE}${PREFIXO[l]}/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(1200);
            ok(`${nome}: pagina de orcamentos do pedido abre logada`, p2.url().includes(sol.id) && await p2.getByTestId('numero-pedido').isVisible().catch(() => false), p2.url());
            await conferirTela(p2, `${nome} orcamentos`, v2);
            await p2.close();
          }
          await p.screenshot({ path: `${OUT}/pedido-${l}-${largura}-${tipo}.png`, fullPage: true }).catch(() => {});
          await ctx.close();
        });
      }
    }
    // pedido logado (nova-solicitacao): mesma grade de 8 tipos
    await tentar('P logado', async () => {
      const ctx = await contexto(390); const p = await ctx.newPage(); const v = vigias(p, 'P logado');
      await entrar(p, 'et', cli);
      await p.goto(`${SITE}${PREFIXO.et}/cliente/nova-solicitacao`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
      // passo 1 (carro): o cliente da API ja tem um carro; escolhe e segue
      const carro = p.locator('button, label').filter({ hasText: /Skoda|Octavia/ }).first();
      if (await carro.count()) await carro.click();
      await botao(p, T.et('clienteNovaSolicitacao.next')).click().catch(() => {});
      await p.waitForTimeout(800);
      const cartoes = p.locator('div.grid.grid-cols-2 > button');
      const rot = await cartoes.evaluateAll((els) => els.map((e) => e.querySelector('p')?.textContent?.trim()));
      ok('P.L1 pedido logado (et): 8 tipos na ordem, "Muu / ei tea" por ultimo', JSON.stringify(rot) === JSON.stringify(ORDEM.map((t) => rotuloMotorista('et', t))), JSON.stringify(rot));
      const ic = await cartoes.evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent?.trim()));
      ok('P.L2 pedido logado: icones 🪟 e ❓', ic[6] === ICONE.vidros && ic[7] === ICONE.outro, JSON.stringify(ic));
      await p.screenshot({ path: `${OUT}/logado-grade-et-390.png`, fullPage: true });
      await conferirTela(p, 'P logado grade', v);
      // escolhe Klaasid e confere o resumo no ultimo passo
      await cartoes.nth(6).click();
      // passos 3 (fotos/detalhe), 4 (descricao) e 5 (local + resumo)
      for (let k = 0; k < 3 && !(await p.getByText(T.et('clienteNovaSolicitacao.summaryTitle'), { exact: true }).count()); k++) {
        const desc = p.locator('textarea').locator('visible=true').first();
        if (await desc.count()) await desc.fill(`TESTE-VIDRO logado ${tag}`);
        await botao(p, T.et('clienteNovaSolicitacao.next')).click().catch(() => {});
        await p.waitForTimeout(800);
      }
      const resumo = await p.locator('h3', { hasText: T.et('clienteNovaSolicitacao.summaryTitle') }).locator('xpath=..').innerText().catch(() => '');
      ok('P.L3 resumo do pedido logado mostra "Klaasid"', resumo.includes(VIDROS.et), resumo.slice(0, 200));
      await p.screenshot({ path: `${OUT}/logado-resumo-et-390.png`, fullPage: true });
      await ctx.close();
    });
    // painel do cliente: dashboard e historico com o rotulo do motorista
    await tentar('P painel', async () => {
      const ctx = await contexto(1280); const p = await ctx.newPage(); const v = vigias(p, 'P painel');
      await entrar(p, 'et', cli);
      for (const pag of ['/cliente/dashboard', '/cliente/historico']) {
        await p.goto(`${SITE}${PREFIXO.et}${pag}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
        await conferirTela(p, `P painel ${pag}`, v);
      }
      await ctx.close();
    });
  });

  // ======================= O: oficinas pela tela =======================
  if (SO.includes('O')) await tentar('O', async () => {
    // caixa de pedidos: so os tipos de cada oficina (pedidos desta rodada, no raio)
    const meus = new Map(); // numero -> tipo
    for (const [t, id] of Object.entries(solPorTipo)) { if (!ORDEM.includes(t)) continue; const { data } = await admin.from('solicitacoes').select('numero').eq('id', id).single(); meus.set(String(data.numero), t); }
    for (const x of ESTADO.pedidosUI) meus.set(String(x.numero), x.tipo);
    for (const [nome, l, largura] of [['vidro', 'et', 390], ['kere', 'en', 1280], ['mec', 'it', 390]]) {
      const of = W[nome];
      const ctx = await contexto(largura); const p = await ctx.newPage(); const v = vigias(p, `O ${nome}`);
      await entrar(p, l, of.dono);
      await p.goto(`${SITE}${PREFIXO[l]}/oficina/pedidos`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
      const textos = await p.getByTestId('pedido-cartao').allInnerTexts();
      // numero do pedido no cartao: constants.numeroPedido ("Päring nr {n}")
      const vistos = textos.flatMap((tx) => [...meus.keys()].filter((n) => new RegExp(`${T[l]('constants.numeroPedido', { n })}(?!\\d)`).test(tx)));
      const tiposVistos = [...new Set(vistos.map((n) => meus.get(n)))].sort();
      const esperado = ORDEM.filter((t) => ESPERADO[t].includes(nome)).sort();
      ok(`O.1 ${nome} (${l} ${largura}): caixa so com ${esperado.join(', ')}`, JSON.stringify(tiposVistos) === JSON.stringify(esperado), `${JSON.stringify(tiposVistos)} (${vistos.length} cartoes desta rodada)`);
      if (esperado.includes('vidros')) ok(`O.2 ${nome}: cartao de vidros com 🪟 ${rotuloOficina(l, 'vidros')}`, textos.some((tx) => tx.includes(`🪟 ${rotuloOficina(l, 'vidros')}`)), textos.find((tx) => tx.includes('🪟'))?.slice(0, 80));
      if (esperado.includes('outro')) ok(`O.3 ${nome}: pedido "Muu / ei tea" aparece para a oficina como "${OUTRO_OFICINA[l]}"`, textos.some((tx) => tx.includes(`📋 ${OUTRO_OFICINA[l]}`)));
      await p.screenshot({ path: `${OUT}/oficina-pedidos-${nome}-${l}-${largura}.png`, fullPage: true });
      await conferirTela(p, `O ${nome} pedidos`, v);
      for (const pag of ['/oficina/agenda', '/oficina/hoje', '/oficina/mensagens', '/oficina/perfil', '/oficina/dashboard']) {
        await p.goto(`${SITE}${PREFIXO[l]}${pag}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
        await conferirTela(p, `O ${nome} ${pag}`, v);
      }
      await ctx.close();
    }

    // "Pole huvi" com motivo (mec, pedido Muu / ei tea)
    const solOutro = solPorTipo.outro;
    {
      const ctx = await contexto(390); const p = await ctx.newPage(); const v = vigias(p, 'O pole huvi');
      await entrar(p, 'et', { ...W.mec.dono });
      await p.goto(`${SITE}${PREFIXO.et}/oficina/pedidos`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
      const { data: sO } = await admin.from('solicitacoes').select('numero').eq('id', solOutro).single();
      const cartao = p.getByTestId('pedido-cartao').filter({ hasText: new RegExp(`${T.et('constants.numeroPedido', { n: sO.numero })}(?!\\d)`) });
      await cartao.getByTestId('nao-tenho-interesse').click();
      await cartao.getByTestId('motivo-nao_faz').click();
      await cartao.getByTestId('dispensa-comentario').fill('TESTE-VIDRO ei tee');
      await cartao.getByTestId('confirmar-dispensa').click();
      await p.waitForTimeout(2000);
      const { data: d } = await admin.from('pedido_dispensas').select('motivo, comentario').eq('solicitacao_id', solOutro).eq('oficina_id', W.mec.id);
      ok('O.4 "Pole huvi" com motivo gravado (mec, pedido Muu / ei tea)', d?.length === 1 && d[0].motivo === 'nao_faz', JSON.stringify(d));
      await conferirTela(p, 'O pole huvi', v);
      await ctx.close();
    }

    // orcamento de vidros pela tela (oficina vidro, et 390) -> motorista aceita e conversa
    const alvo = ESTADO.pedidosUI.find((x) => x.l === 'et' && x.tipo === 'vidros') || { solId: solPorTipo.vidros, email: cli.email, clienteId: cli.id };
    {
      const ctx = await contexto(390); const p = await ctx.newPage(); const v = vigias(p, 'O orcamento');
      await entrar(p, 'et', W.vidro.dono);
      await p.goto(`${SITE}${PREFIXO.et}/oficina/orcamento/${alvo.solId}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
      ok('O.5 formulario do orcamento mostra o tipo "Klaasid"', (await textoTela(p)).includes(VIDROS.et));
      await p.locator(`input[placeholder="${T.et('oficinaEnviarOrcamento.placeholderDescricaoItem')}"]`).first().fill('Esiklaasi vahetus');
      await p.getByLabel(T.et('oficinaEnviarOrcamento.placeholderValor'), { exact: true }).locator('visible=true').first().fill('320');
      const { preencherCheckinEValidade } = await import('./ajuda-checkin.mjs');
      await preencherCheckinEValidade(p);
      await conferirTela(p, 'O orcamento formulario', v);
      await p.getByTestId('enviar-orcamento').click();
      const orc = await esperar(async () => (await admin.from('orcamentos').select('id, status, valor_total').eq('solicitacao_id', alvo.solId).eq('oficina_id', W.vidro.id)).data || [], (x) => x.length > 0, 40);
      ok('O.6 orcamento de vidros enviado pela tela', orc.length === 1 && Number(orc[0].valor_total) === 320, JSON.stringify(orc));
      await ctx.close();
    }
    {
      // motorista (conta criada pelo pedido sem senha): define a senha pela tela "crie a sua senha" seria outro teste;
      // aqui a senha vem pela service role e a pessoa entra pela tela de login
      const { data: pf } = await admin.from('profiles').select('id, email').eq('id', alvo.clienteId).single();
      await admin.auth.admin.updateUserById(pf.id, { password: SENHA });
      const motorista = { email: pf.email, senha: SENHA };
      const ctx = await contexto(390); const p = await ctx.newPage(); const v = vigias(p, 'O aceite');
      await entrar(p, 'et', motorista);
      await p.goto(`${SITE}${PREFIXO.et}/cliente/orcamentos/${alvo.solId}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
      ok('O.7 motorista ve o orcamento de 320', /320/.test(await textoTela(p)));
      await botao(p, T.et('clienteOrcamentoDetalhe.acceptAndSchedule')).click();
      await p.waitForTimeout(1200);
      await p.locator('button').filter({ hasText: /\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/ }).locator('visible=true').first().click();
      await botao(p, T.et('clienteOrcamentoDetalhe.confirmAppointment')).click();
      const aceito = await esperar(async () => (await admin.from('orcamentos').select('status').eq('solicitacao_id', alvo.solId).eq('oficina_id', W.vidro.id).single()).data?.status, (s) => s === 'aceito', 40);
      ok('O.8 motorista aceitou o orcamento de vidros pela tela', aceito === 'aceito', aceito);
      await conferirTela(p, 'O aceite', v);
      // conversa
      await p.goto(`${SITE}${PREFIXO.et}/cliente/mensagens/${alvo.solId}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
      const escolher = p.getByRole('button', { name: W.vidro.nome });
      if (await escolher.count()) { await escolher.first().click(); await p.waitForTimeout(1500); }
      const box = p.locator('[data-campo-conversa], input[type=text], textarea').locator('visible=true').last();
      await box.fill('TESTE-VIDRO millal tulen?'); await box.press('Enter');
      const msg = await esperar(async () => (await admin.from('mensagens').select('oficina_id, texto').eq('solicitacao_id', alvo.solId).eq('remetente_id', alvo.clienteId)).data || [], (x) => x.length > 0, 30);
      ok('O.9 mensagem do motorista vai para a oficina de vidros', msg.length === 1 && msg[0].oficina_id === W.vidro.id, JSON.stringify(msg));
      await conferirTela(p, 'O conversa motorista', v);
      await ctx.close();
      const ctx2 = await contexto(1280); const p2 = await ctx2.newPage(); const v2 = vigias(p2, 'O conversa oficina');
      await entrar(p2, 'et', W.vidro.dono);
      await p2.goto(`${SITE}${PREFIXO.et}/oficina/mensagens/${alvo.solId}`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(2500);
      ok('O.10 oficina ve a mensagem', (await textoTela(p2)).includes('millal tulen'));
      await p2.goto(`${SITE}${PREFIXO.et}/oficina/agenda`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(2000);
      await conferirTela(p2, 'O agenda com o servico de vidros', v2);
      await ctx2.close();
    }
  });

  // ======================= C: cadastro e perfil da oficina =======================
  if (SO.includes('C')) await tentar('C', async () => {
    for (const [l, largura] of [['et', 390], ['ru', 1280]]) {
      await tentar(`C cadastro ${l}`, async () => {
        const pos = perto(1.5);
        const ctx = await contexto(largura, { geolocation: { latitude: pos.lat, longitude: pos.lon }, permissions: ['geolocation'] });
        const p = await ctx.newPage(); const v = vigias(p, `C ${l}`);
        const cad = { et: '/registreeru', ru: '/registratsiya' };
        await p.goto(`${SITE}${PREFIXO[l]}${cad[l]}?tipo=oficina`, { waitUntil: 'networkidle' });
        const email = `vidro-cad-${l}-${tag}@example.test`; criado.emails.add(email);
        await p.locator('#c6791-5').fill('TESTE-VIDRO'); await p.locator('#c6791-6').fill(email); await p.locator('#c6791-8').fill(SENHA);
        await p.locator('#cadastro-termos').check();
        await p.locator('main form button[type=submit]').first().click();
        await p.locator('#c6791-9').waitFor({ timeout: 15000 });
        await p.locator('#c6791-9').fill(`TESTE-VIDRO cadastro ${l} ${tag}`); await p.locator('#c6791-10').fill('12345678');
        const rua = p.locator('[id^="cadastro-end"]').filter({ has: p.locator('xpath=self::input') }).first();
        await rua.fill('Tallinna mnt 5'); await sleep(2500);
        const op = p.getByRole('option').first(); if (await op.isVisible().catch(() => false)) await op.click();
        await sleep(1200);
        for (const i of await p.locator('[id^="cadastro-end"]:visible').all()) {
          if ((await i.evaluate((e) => e.tagName)) === 'INPUT' && !(await i.inputValue())) await i.fill((await i.getAttribute('id')).includes('cep') ? '20308' : 'Narva');
        }
        const rot = await p.locator('label:has(input[id^="cadastro-servico-"])').allInnerTexts();
        const lim = rot.map((x) => x.replace(/^[^\p{L}]+/u, '').trim());
        ok(`C.1 cadastro ${l} ${largura}: 8 servicos, "${VIDROS[l]}" antes de "${OUTRO_OFICINA[l]}" (curto, sem "ei tea")`, lim.length === 8 && lim[6] === VIDROS[l] && lim[7] === OUTRO_OFICINA[l], JSON.stringify(lim));
        await p.locator('label', { hasText: VIDROS[l] }).locator('input[type=checkbox]').check();
        await p.locator('label', { hasText: rotuloOficina(l, 'mecanica') }).locator('input[type=checkbox]').check();
        await p.locator('#cadastro-declaracao').check();
        await conferirTela(p, `C cadastro ${l} ${largura}`, v);
        await p.screenshot({ path: `${OUT}/cadastro-${l}-${largura}.png`, fullPage: true });
        await p.getByRole('button', { name: T[l]('cadastro.criarContaOficina'), exact: true }).click();
        await p.getByRole('heading', { name: T[l]('cadastro.verifiqueTitulo') }).waitFor({ timeout: 30000 }).catch(() => {});
        const pf = await esperar(async () => (await admin.from('profiles').select('id').eq('email', email).maybeSingle()).data, (x) => !!x, 30);
        if (pf) criado.contas.add(pf.id);
        const of = pf ? (await admin.from('oficinas').select('id, especialidades').eq('profile_id', pf.id).maybeSingle()).data : null;
        if (of) criado.oficinas.add(of.id);
        ok(`C.2 cadastro ${l}: oficina gravada com vidros + mecanica`, JSON.stringify([...(of?.especialidades || [])].sort()) === '["mecanica","vidros"]', JSON.stringify(of));
        await conferirTela(p, `C cadastro ${l} enviado`, v);
        await ctx.close();
      });
    }
    // perfil: kere marca Klaasid e Muu, desmarca Kere- ja varvitood, logo, almoco, salvar
    await tentar('C perfil', async () => {
      for (const [l, largura] of [['en', 1280], ['et', 390]]) {
        const of = W.kere;
        const ctx = await contexto(largura); const p = await ctx.newPage(); const v = vigias(p, `C perfil ${l}`);
        await entrar(p, l, of.dono);
        await p.goto(`${SITE}${PREFIXO[l]}/oficina/perfil`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
        const caixa = (rotulo) => p.locator('label', { has: p.locator('input[type=checkbox]') }).filter({ hasText: new RegExp(`^\\W*${rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).locator('input[type=checkbox]');
        const rot = await p.locator('label:has(input[type=checkbox])').allInnerTexts();
        ok(`C.3 perfil ${l}: lista de servicos com "${VIDROS[l]}" e "${OUTRO_OFICINA[l]}" (sem "/")`, rot.some((x) => x.trim().endsWith(VIDROS[l])) && rot.some((x) => x.trim().endsWith(OUTRO_OFICINA[l])) && !rot.some((x) => x.includes(OUTRO_MOTORISTA[l])));
        if (l === 'en') {
          await caixa(VIDROS.en).check(); await caixa(OUTRO_OFICINA.en).check(); await caixa(rotuloOficina('en', 'funilaria')).uncheck();
          await p.locator('input[type=file][accept="image/*"]:not([multiple])').first().setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: FOTO });
          await p.waitForTimeout(2500);
          if (await p.getByTestId('almoco-ativo').count()) {
            await p.getByTestId('almoco-ativo').check().catch(() => {});
            await p.getByTestId('almoco-inicio').fill('12:00').catch(() => {}); await p.getByTestId('almoco-fim').fill('12:30').catch(() => {});
          }
        } else {
          await caixa(OUTRO_OFICINA.et).uncheck(); // tira o Muu de volta: fica colisao + vidros
        }
        await conferirTela(p, `C perfil ${l} ${largura}`, v);
        await p.getByRole('button', { name: T[l]('oficinaPerfil.salvarAlteracoes'), exact: true }).click();
        await p.waitForTimeout(2500);
        const { data: o } = await admin.from('oficinas').select('especialidades, logo_url, almoco_inicio').eq('id', of.id).single();
        const esp = JSON.stringify([...(o?.especialidades || [])].sort());
        if (l === 'en') ok('C.4 perfil en: salvo = colisao + outro + vidros, logo enviado', esp === '["colisao","outro","vidros"]' && !!o?.logo_url, `${esp} logo=${!!o?.logo_url} almoco=${o?.almoco_inicio}`);
        else ok('C.5 perfil et: desmarcar Muu salvo = colisao + vidros', esp === '["colisao","vidros"]', esp);
        await p.screenshot({ path: `${OUT}/perfil-${l}-${largura}.png`, fullPage: true });
        await conferirTela(p, `C perfil ${l} salvo`, v);
        await ctx.close();
      }
      // o roteamento acompanha o perfil: agora o kere recebe vidros
      const id = await pedidoApi(cli, 'vidros');
      const r = await quem(id, 4);
      ok('C.6 depois do perfil: pedido de vidros chega tambem ao kere', JSON.stringify(r.nomes) === JSON.stringify(['kere', 'todas', 'vidro', 'vidromec']), JSON.stringify(r.nomes));
    });
  });

  // ======================= A: admin =======================
  if (SO.includes('A')) await tentar('A', async () => {
    const adm = await conta('admin', 'admin', { idioma: 'pt' });
    const ctx = await contexto(1280); const p = await ctx.newPage(); const v = vigias(p, 'A admin');
    await entrar(p, 'pt', adm);
    await p.goto(`${SITE}/admin/solicitacoes`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    const opcoes = await p.locator('select').nth(1).locator('option').allInnerTexts();
    ok('A.1 filtro de tipo do admin tem "Vidros" antes de "Outro"', opcoes.includes('Vidros') && opcoes.indexOf('Vidros') === opcoes.indexOf('Outro') - 1, JSON.stringify(opcoes));
    await p.locator('select').nth(1).selectOption('vidros'); await p.waitForTimeout(2000);
    await conferirTela(p, 'A lista filtrada por vidros', v);
    await p.goto(`${SITE}/admin/solicitacoes/${solPorTipo.vidros}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    ok('A.2 detalhe do pedido de vidros no admin mostra "Vidros"', (await textoTela(p)).includes('Vidros'));
    await conferirTela(p, 'A detalhe', v);
    await p.goto(`${SITE}/admin/oficinas`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
    await conferirTela(p, 'A oficinas', v);
    // "ver quem seria avisado" pela mesma funcao do aviso automatico
    const s = await sessao(adm);
    const r = await api('GET', `/api/admin/solicitacoes/${solPorTipo.vidros}/oficinas`, undefined, { Authorization: `Bearer ${s.token}` });
    const comp = (r.d?.oficinas || []).filter((o) => [...criado.oficinas].includes(o.id || o.oficina_id));
    ok('A.3 API do admin: compativel=true so nas oficinas com Klaasid (ou sem especialidade)', r.status === 200 && comp.length > 0 && comp.every((o) => o.compativel === ((o.especialidades || []).length === 0 || (o.especialidades || []).includes('vidros'))), `${r.status} ${JSON.stringify(comp.map((o) => [o.nome || o.nome_fantasia, o.compativel]))}`);
    await ctx.close();
  });

  // ======================= V: app antigo =======================
  if (SO.includes('V')) await tentar('V', async () => {
    const antigo = (l) => JSON.parse(execSync(`git -C "${RAIZ}" show 69606ec:apps/mobile/i18n/locales/${l}.json`).toString());
    for (const l of ['et', 'ru', 'en', 'it', 'pt', 'pt-PT']) ok(`V.1 app antigo (${l}): rotulo de 'vidros' ja existe no arquivo antigo`, !!antigo(l).constants?.tiposServico?.vidros, antigo(l).constants?.tiposServico?.vidros);
    const consts = execSync(`git -C "${RAIZ}" show 69606ec:packages/shared/constants/index.ts`).toString();
    ok('V.2 app antigo: TIPOS_SERVICO antigo nao tem vidros (grade antiga continua com 7, sem quebrar)', !/value: 'vidros'/.test(consts));
    // build web do app de 15/11 (scripts/e2e/app-web) contra este site: o motorista do pedido de vidros abre a lista e o pedido
    const dir = path.join(WEB, 'scripts/e2e/app-web');
    if (!fs.existsSync(path.join(dir, 'index.html'))) { ok('V.3 build antigo do app em scripts/e2e/app-web', false, 'nao encontrado'); return; }
    // copia do apps/web sem assets/node_modules (robocopy /XD node_modules): as fontes do app viram index.html e o
    // expo-font rejeita com "NetworkError: A network error occurred." em toda pagina (falso V.3, 19/11)
    if (!fs.existsSync(path.join(dir, 'assets/node_modules'))) { ok('V.3 export antigo completo (fontes em app-web/assets/node_modules) - copie a pasta inteira', false, 'assets/node_modules ausente'); return; }
    appWeb = spawn(process.execPath, [path.join(WEB, 'scripts/e2e/servir-app-web.mjs')], { env: { ...process.env, SITE, APP_WEB: dir }, stdio: 'ignore' });
    await sleep(1500);
    const { data: pf } = await admin.from('profiles').select('id, email').eq('id', cli.id).single();
    const ctx = await nav.contexto('chromium', 390, ip, { locale: 'et-EE' });
    const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message));
    const Ta = (k) => k.split('.').reduce((o, x) => o?.[x], antigo('et'));
    await p.goto('http://localhost:8090', { waitUntil: 'networkidle' });
    await p.getByText(Ta('auth.irLogin'), { exact: true }).locator('visible=true').last().click().catch(() => {});
    await p.getByLabel(Ta('auth.email'), { exact: true }).locator('visible=true').first().fill(pf.email);
    await p.getByLabel(Ta('auth.senha'), { exact: true }).locator('visible=true').first().fill(SENHA);
    await p.getByText(Ta('auth.entrar'), { exact: true }).locator('visible=true').last().click();
    await p.waitForTimeout(4000);
    for (const rota of ['/solicitacoes', `/solicitacao/${solPorTipo.vidros}`, `/solicitacao/${solPorTipo.outro}`, '/']) {
      await p.goto(`http://localhost:8090${rota}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
      const t = await textoTela(p);
      const idR = (rota.match(/solicitacao\/(.+)$/) || [])[1];
      const numR = idR ? (await admin.from('solicitacoes').select('numero').eq('id', idR).single()).data?.numero : null;
      ok(`V.3 app antigo ${rota}: logado, abre sem erro e sem chave crua${numR ? ` (mostra "Päring nr ${numR}")` : ''}`, !erros.length && !/constants\.|tiposServico\./.test(t) && t.length > 40 && !t.includes(Ta('auth.entrar')) && (!numR || t.includes(`nr ${numR}`)), `${erros.slice(0, 2).join(' | ')} ${t.slice(0, 80).replace(/\s+/g, ' ')}`);
      erros.length = 0;
    }
    await p.screenshot({ path: `${OUT}/app-antigo-pedido-vidros.png`, fullPage: true });
    await ctx.close();
    try { appWeb.kill(); } catch { /* */ }
    await sleep(1000);
    // app NOVO (expo export web do codigo desta branch, APP_WEB_NOVO=<pasta>): a grade do pedido sem conta com 8 tipos
    const novo = process.env.APP_WEB_NOVO;
    if (!novo || !fs.existsSync(path.join(novo, 'index.html'))) { console.log('(V.4 pulado: APP_WEB_NOVO nao definido)'); return; }
    appWeb = spawn(process.execPath, [path.join(WEB, 'scripts/e2e/servir-app-web.mjs')], { env: { ...process.env, SITE, APP_WEB: novo }, stdio: 'ignore' });
    await sleep(1500);
    const LOC = { et: 'et-EE', ru: 'ru-RU', en: 'en-GB' };
    for (const l of ['et', 'ru', 'en']) {
      const c2 = await nav.contexto('chromium', 390, ip, { locale: LOC[l] });
      const p2 = await c2.newPage(); const e2 = []; p2.on('pageerror', (e) => e2.push(e.message));
      await p2.goto('http://localhost:8090/pedido', { waitUntil: 'networkidle' }); await p2.waitForTimeout(2500);
      const t = await textoTela(p2);
      const pos = ORDEM.map((x) => t.indexOf(rotuloMotorista(l, x)));
      ok(`V.4 app novo (${l}): grade do pedido com os 8 tipos na ordem, "${OUTRO_MOTORISTA[l]}" por ultimo`, pos.every((x, i) => x >= 0 && (i === 0 || x > pos[i - 1])) && !e2.length, `${JSON.stringify(pos)} ${e2.slice(0, 2).join(' | ')}`);
      ok(`V.5 app novo (${l}): icones 🪟 e ❓`, t.includes('🪟') && t.includes('❓') && !t.includes('📋'));
      await p2.screenshot({ path: `${OUT}/app-novo-grade-${l}.png`, fullPage: true });
      await c2.close();
    }
  });
} catch (e) {
  ok('excecao geral', false, e?.stack || e?.message || e);
} finally {
  try { await nav?.fechar(); } catch { /* */ }
  pararTudo();
  // limpeza: tudo desta rodada (pedidos dos clientes, oficinas, contas, tokens)
  const erros = [];
  const del = async (t, col, val, op = 'eq') => { const q = admin.from(t).delete(); const { error } = await (op === 'in' ? q.in(col, val) : q.eq(col, val)); if (error && !/does not exist|Could not find/.test(error.message)) erros.push(`${t}: ${error.message}`); };
  for (const e of criado.emails) { const { data } = await admin.from('profiles').select('id').ilike('email', e).maybeSingle(); if (data) criado.contas.add(data.id); const { data: pend } = await admin.from('pedidos_pendentes').select('user_id').ilike('email', e); for (const x of pend || []) criado.contas.add(x.user_id); }
  for (const id of criado.contas) { const { data: ofs } = await admin.from('oficinas').select('id').eq('profile_id', id); for (const o of ofs || []) criado.oficinas.add(o.id); }
  const contas = [...criado.contas]; const ofs = [...criado.oficinas];
  if (criado.tokens.length) await del('push_tokens', 'id', criado.tokens, 'in');
  const { data: sols } = contas.length ? await admin.from('solicitacoes').select('id').in('cliente_id', contas) : { data: [] };
  const solIds = (sols || []).map((s) => s.id);
  if (solIds.length) {
    const { data: orcs } = await admin.from('orcamentos').select('id').in('solicitacao_id', solIds);
    const orcIds = (orcs || []).map((o) => o.id);
    if (orcIds.length) await admin.from('orcamentos').update({ disponibilidade_escolhida_id: null }).in('id', orcIds);
    if (orcIds.length) { for (const t of ['orcamento_disponibilidade', 'orcamento_itens']) await del(t, 'orcamento_id', orcIds, 'in'); }
    for (const t of ['agenda', 'mensagens', 'pedido_dispensas', 'pedido_convites', 'solicitacao_fotos', 'analise_dano', 'sms_envios', 'admin_auditoria_pedido']) await del(t, 'solicitacao_id', solIds, 'in');
    if (orcIds.length) await del('orcamentos', 'id', orcIds, 'in');
    for (const s of solIds) await del('notificacoes', 'dados->>solicitacao_id', s);
    await del('solicitacoes', 'id', solIds, 'in');
  }
  for (const id of contas) { await del('notificacoes', 'profile_id', id); await del('veiculos', 'profile_id', id); await del('pedidos_pendentes', 'user_id', id); await del('codigos_login', 'user_id', id); await del('links_acesso', 'user_id', id); await del('admin_auditoria', 'admin_id', id); }
  if (ofs.length) { await del('funcionarios', 'oficina_id', ofs, 'in'); await del('pedido_dispensas', 'oficina_id', ofs, 'in'); await del('oficinas', 'id', ofs, 'in'); }
  for (const id of contas) { await del('profiles', 'id', id); const { error } = await admin.auth.admin.deleteUser(id); if (error && !/not found/i.test(error.message)) erros.push(`auth ${id}: ${error.message}`); }
  const sobra = contas.length ? (await admin.from('profiles').select('id', { count: 'exact', head: true }).in('id', contas)).count : 0;
  ok('limpeza: nada desta rodada ficou no banco', !erros.length && !sobra, `${erros.join(' | ')} sobra=${sobra}`);
  const falhas = fim();
  fs.writeFileSync(`${OUT}/site-${tag}.log`, log);
  process.exit(falhas ? 1 : 0);
}
