// Jornada HUMANA, parte 2 (dono 08/11): cadastros e todas as funcoes, como pessoa.
//  A) cadastro pela tela: cliente, oficina e loja de pecas (e-mail confirmado pelo link,
//     login digitado); admin de teste aprova a loja pela tela do admin
//  B) pecas: a oficina (de teste) pede uma peca; a loja nova ve e responde com preco;
//     a oficina ve a resposta
//  C) walk-in pela tela "Registrar chegada" da oficina
//  D) cliente: carro novo, perfil salvo, acidente sem conta
//  E) varredura de TODAS as telas de oficina, cliente e loja: foto + conferencia visual +
//     toque e digitacao em cada campo de texto (sem salvar)
//   node jornada-humana-funcoes.mjs <.env.local> <idioma> <largura>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { criarHumano } from './humano-lib.mjs';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/site/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = req('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: banco nao e o local');
const L = process.argv[3] || 'et';
const W = Number(process.argv[4] || 390);
const SITE = process.env.SITE || 'http://localhost:3100';
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/jornada-humana-funcoes/${L}-${W}`;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const EMAILS = env.EMAIL_PASTA_TESTE;
const PRE = { pt: '/br/pt', 'pt-PT': '/pt/pt', en: '/ee/en', et: '/ee/et', it: '/it/it', ru: '/ee/ru' }[L];
const LOCALE = { pt: 'pt-BR', 'pt-PT': 'pt-PT', en: 'en-GB', et: 'et-EE', it: 'it-IT', ru: 'ru-RU' }[L];
const WEBMSG = `${RAIZ}/site/apps/web/messages`;
const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${L}.json`, 'utf8'));
for (const a of ['cliente', 'oficina', 'misc', 'auth', 'loja']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${L}.${a}.json`, 'utf8')));
const T = (k) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const semear = fs.readFileSync(`${RAIZ}/ferramentas/semear.mjs`, 'utf8');
const senhaSeed = (e) => (semear.match(new RegExp(`conta\\('${e.replace(/\./g, '\\.')}', '([^']+)'`)) || [])[1];
const OFI = 'meister.teste@bipfix.test', CLI = 'kadri.teste@bipfix.test', ADM = 'admin.teste@bipfix.test';
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Fun' + crypto.randomBytes(5).toString('hex') + '7';
let falhas = 0, passos = 0; const achados = [];
const ok = (n, c, x = '') => { passos++; if (!c) { falhas++; achados.push(`${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); } if (!c) console.log(`FALHA ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const H = criarHumano({ W, OUT, ok });
const { CEL, sleep, ver, tocar, digitar, escolher, tela, varrerCampos } = H;
const rx = (s) => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split(/\s*\{[^}]*\}\s*/)[0].trim(), 'i');
const ip = () => `10.99.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
const emailsDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort().map((f) => fs.readFileSync(path.join(EMAILS, f), 'utf8'));
const linkDe = async (email, depois, re) => { for (let i = 0; i < 50; i++) { const h = emailsDe(email, depois).at(-1); const m = h?.match(re); if (m) return m[1].replace(/&amp;/g, '&'); await sleep(300); } return null; };

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const errosJs = [];
const nova = async (quem) => {
  const c = await browser.newContext({ viewport: { width: W, height: CEL ? 844 : 900 }, deviceScaleFactor: CEL ? 2 : 1, isMobile: CEL, hasTouch: CEL, locale: LOCALE, ...(CEL ? { userAgent: UA } : {}),
    geolocation: { latitude: 59.437, longitude: 24.745 }, permissions: ['geolocation'], extraHTTPHeaders: { 'x-real-ip': ip() } });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  const p = await c.newPage(); p.on('pageerror', (e) => errosJs.push(`${quem}: ${e.message}`)); p.on('dialog', (d) => d.accept());
  return { c, p };
};
const entrar = async (p, email, s, nome) => {
  await p.goto(`${SITE}${PRE}/login`, { waitUntil: 'networkidle' });
  await digitar(p, p.locator('main input[type=email]'), email, `e-mail (${nome})`);
  await digitar(p, p.locator('main input[type=password]'), s, `senha (${nome})`);
  await tocar(p, p.locator('main button[type=submit]'), `entrar (${nome})`);
  await sleep(3500);
};
const ir = async (p, cam, nome, opts) => { await p.goto(`${SITE}${PRE}${cam}`, { waitUntil: 'networkidle' }).catch(() => {}); await sleep(1500); await tela(p, nome, opts); };
const contas = new Set();

// cadastro pela tela; tipo: 'cliente' | 'oficina' | 'loja_pecas'
async function cadastrar(tipo) {
  const email = `fun-${tipo.slice(0, 3)}-${L.toLowerCase()}-${W}-${tag}@example.test`;
  const { c, p } = await nova(`cadastro ${tipo}`);
  await p.goto(`${SITE}${PRE}/login`, { waitUntil: 'networkidle' });
  await tocar(p, p.locator('main a[href*="/"]').filter({ hasText: rx(T('auth.criarConta') !== `??auth.criarConta` ? T('auth.criarConta') : T('login.criarConta')) }).first().or(p.locator('main a[href$="sign-up"], main a[href$="cadastro"], main a[href$="registreeru"], main a[href$="registratsiya"], main a[href$="registrati"], main a[href$="registo"]').first()), `criar conta (${tipo})`);
  await sleep(1500);
  await tela(p, `cadastro escolha ${tipo}`, { topo: true });
  const rot = { cliente: /motor|driver|juht|водител|automobil|condutor|cliente/i, oficina: /oficina|repair shop|töökoda|автосервис|officina/i, loja_pecas: /pe[cç]as|parts|varuosa|запчаст|ricambi/i }[tipo];
  await tocar(p, p.locator('main button').filter({ hasText: rot }).first(), `tipo ${tipo}`);
  await tela(p, `cadastro dados ${tipo}`, { topo: true });
  await digitar(p, p.locator('#c6791-5'), 'Teste Funcoes', `nome (${tipo})`);
  await digitar(p, p.locator('#c6791-6'), email, `e-mail (${tipo})`);
  await digitar(p, p.locator('#c6791-7'), '51234567', `telefone (${tipo})`);
  await digitar(p, p.locator('#c6791-8'), senha, `senha (${tipo})`);
  await tocar(p, p.locator('main form input[type=checkbox]').first(), `aceito termos (${tipo})`);
  const t0 = Date.now();
  await tocar(p, p.locator('main form button[type=submit]').first(), `continuar (${tipo})`);
  await sleep(1500);
  if (tipo !== 'cliente') {
    await tela(p, `cadastro empresa ${tipo}`, { topo: true });
    await digitar(p, p.locator(tipo === 'oficina' ? '#c6791-9' : '#c6791-11'), `Teste ${tipo} ${tag}`, `nome da empresa (${tipo})`);
    await digitar(p, p.locator(tipo === 'oficina' ? '#c6791-10' : '#c6791-12'), '12345678', `registro (${tipo})`);
    const rua = p.locator('[id^="cadastro-end"]').filter({ has: p.locator('xpath=self::input') }).first();
    await digitar(p, rua, 'Tartu mnt 50', `rua (${tipo})`); await sleep(2500);
    const op = p.getByRole('option').first(); if (await op.isVisible().catch(() => false)) await tocar(p, op, `sugestao de endereco (${tipo})`);
    for (const i of await p.locator('[id^="cadastro-end"]:visible').all()) { if ((await i.evaluate((e) => e.tagName)) === 'INPUT' && !(await i.inputValue())) await digitar(p, i, (await i.getAttribute('id')).includes('cep') ? '10111' : 'Tallinn', `endereco ${(await i.getAttribute('id')).replace('cadastro-end-', '')} (${tipo})`); }
    if (tipo === 'oficina') await tocar(p, p.locator('main form label').filter({ has: p.locator('input[type=checkbox]') }).first(), 'especialidade');
    await tocar(p, p.locator('main form input[type=checkbox]').last(), `declaracao (${tipo})`);
    await tocar(p, p.locator('main form button[type=submit]').last(), `criar conta (${tipo})`);
    await sleep(3000);
  }
  await tela(p, `cadastro enviado ${tipo}`, { topo: true });
  const link = await linkDe(email, t0, /href="([^"]*confirmar-email[^"]*)"/);
  ok(`cadastro ${tipo}: e-mail de confirmacao chegou`, !!link);
  if (link) { await p.goto(link.replace(/^https?:\/\/[^/]+/, SITE), { waitUntil: 'networkidle' }); await sleep(3000); await tela(p, `e-mail confirmado ${tipo}`, { topo: true }); }
  const { data: pf } = await admin.from('profiles').select('id').eq('email', email).maybeSingle(); if (pf) contas.add(pf.id);
  ok(`cadastro ${tipo}: conta criada`, !!pf);
  // o link de confirmacao ja entra na conta (cliente vai ao painel); so faz login se nao entrou
  await p.goto(`${SITE}${PRE}/login`, { waitUntil: 'networkidle' }); await sleep(1500);
  ok(`cadastro ${tipo}: link do e-mail ja deixa logado`, !(await p.locator('main input[type=password]').isVisible().catch(() => false)));
  if (await p.locator('main input[type=password]').isVisible().catch(() => false)) await entrar(p, email, senha, tipo);
  await tela(p, `primeira tela depois do login ${tipo}`, { topo: true });
  return { email, c, p, id: pf?.id };
}

try {
  // ================= A) cadastros =================
  const cli = await cadastrar('cliente');
  const ofi = await cadastrar('oficina');
  const loja = await cadastrar('loja_pecas');
  // admin aprova a loja pela tela do admin
  { const { c, p } = await nova('admin');
    await entrar(p, ADM, senhaSeed(ADM), 'admin');
    await p.goto(`${SITE}/admin/pecas`, { waitUntil: 'networkidle' }); await sleep(2500);
    const bt = p.locator('tr, li, div').filter({ hasText: `Teste loja_pecas ${tag}` }).filter({ has: p.getByRole('button', { name: /^Ativar$/ }) }).last().getByRole('button', { name: /^Ativar$/ }).locator('visible=true').first();
    if (await bt.count()) { await tocar(p, bt, 'admin ativa a loja'); await sleep(2500); }
    const { data: lj } = await admin.from('lojas_pecas').select('ativa').eq('profile_id', loja.id).maybeSingle();
    ok('admin: loja ativada pela tela', !!lj?.ativa, JSON.stringify(lj));
    if (!lj?.ativa) await admin.from('lojas_pecas').update({ ativa: true }).eq('profile_id', loja.id); // segue o teste
    await c.close(); }
  await loja.p.reload({ waitUntil: 'networkidle' }); await sleep(2000);

  // ================= B) pecas: oficina pede, loja responde =================
  const O = await nova('oficina de teste'); await entrar(O.p, OFI, senhaSeed(OFI), 'oficina');
  await ir(O.p, '/oficina/pecas', 'oficina pecas');
  await tocar(O.p, O.p.getByRole('button', { name: rx(T('oficinaPecas.novaCotacao')) }).first(), 'nova cotacao de peca');
  await digitar(O.p, O.p.locator('#c8551-1'), `Esituli ${tag}`, 'peca');
  await digitar(O.p, O.p.locator('#c8551-2'), 'Toyota', 'marca da peca');
  await digitar(O.p, O.p.locator('#c8551-3'), 'Corolla', 'modelo da peca');
  await digitar(O.p, O.p.locator('#c8551-4'), '2017', 'ano da peca');
  await digitar(O.p, O.p.locator('#peca-detalhes'), 'Vasak pool, originaal või kvaliteetne analoog', 'detalhes da peca');
  await tocar(O.p, O.p.getByRole('button', { name: rx(T('oficinaPecas.enviarCotacao')) }).first(), 'enviar cotacao'); await sleep(3000);
  const { data: cot } = await admin.from('cotacoes_pecas').select('id').ilike('peca_descricao', `%${tag}%`).maybeSingle();
  ok('pecas: cotacao criada pela tela', !!cot);
  await tela(O.p, 'oficina pecas depois de pedir');
  await ir(loja.p, '/loja/cotacoes', 'loja cotacoes');
  const cart = loja.p.locator('main div').filter({ hasText: `Esituli ${tag}` }).filter({ has: loja.p.getByRole('button') }).last();
  ok('loja ve o pedido de peca da oficina', (await cart.count()) > 0);
  if (await cart.count()) {
    await tocar(loja.p, cart.getByRole('button', { name: rx(base.lojaCotacoes?.responderCotacaoButton || 'Respond') }).first(), 'responder cotacao');
    await digitar(loja.p, loja.p.locator('#c40f3-1'), '89.90', 'preco');
    await digitar(loja.p, loja.p.locator('#c40f3-2'), '2', 'prazo');
    await tocar(loja.p, loja.p.getByRole('button', { name: rx(base.lojaCotacoes?.enviarRespostaButton || 'Send') }).first(), 'enviar resposta'); await sleep(3000);
    ok('pecas: resposta da loja gravada', !!(await admin.from('cotacoes_pecas_respostas').select('id').eq('cotacao_id', cot?.id).maybeSingle()).data);
  }
  await tela(loja.p, 'loja depois de responder');
  await ir(O.p, '/oficina/pecas', 'oficina pecas com resposta');
  ok('oficina ve a resposta (preco 89,90)', /89[,.]90/.test(await O.p.innerText('main')));

  // ================= C) walk-in =================
  await ir(O.p, '/oficina/checkin', 'walk-in', { topo: true });
  await digitar(O.p, O.p.locator('main input[type=text]').first(), 'Walk In Klient', 'nome do cliente (walk-in)');
  await digitar(O.p, O.p.locator('#c7917-2'), '51234567', 'telefone (walk-in)');
  for (const i of await O.p.locator('main input[type=text]:visible').all()) { if (!(await i.inputValue())) await digitar(O.p, i, `W${tag}`, `walk-in ${(await i.getAttribute('placeholder') || '').slice(0, 15)}`); }
  await tocar(O.p, O.p.locator('main button[type=button]').filter({ hasText: rx(T('constants.tiposServico.mecanica')) }).first(), 'tipo de servico (walk-in)');
  await tela(O.p, 'walk-in preenchido');
  await tocar(O.p, O.p.locator('main button[type=submit]').last(), 'registrar chegada (walk-in)'); await sleep(3000);
  await tela(O.p, 'walk-in registrado', { topo: true });
  ok('walk-in registrado (saiu do formulario)', !/checkin/.test(O.p.url()) || !(await O.p.locator('#c7917-1').isVisible().catch(() => false)), O.p.url());

  // ================= D) cliente: carro, perfil, acidente sem conta =================
  await ir(cli.p, '/cliente/veiculos', 'cliente veiculos');
  await ir(cli.p, '/cliente/perfil', 'cliente perfil');
  const salvar = cli.p.locator('main button[type=submit]').first();
  if (await salvar.count()) { await tocar(cli.p, salvar, 'salvar perfil'); await sleep(2000); await tela(cli.p, 'cliente perfil salvo'); }
  { const A = await nova('acidente'); await ir(A.p, '/emergencia', 'acidente sem conta'); await varrerCampos(A.p, 'acidente'); await A.c.close(); }

  // ================= E) varredura de todas as telas =================
  const K = await nova('cliente de teste'); await entrar(K.p, CLI, senhaSeed(CLI), 'cliente');
  const { data: solK } = await admin.from('solicitacoes').select('id').eq('cliente_id', (await admin.from('profiles').select('id').eq('email', CLI).single()).data.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  for (const cam of ['/cliente/dashboard', '/cliente/orcamentos', '/cliente/historico', '/cliente/mensagens', '/cliente/notificacoes', '/cliente/nova-solicitacao', '/cliente/veiculos', '/cliente/perfil', ...(solK ? [`/cliente/orcamentos/${solK.id}`, `/cliente/acompanhamento/${solK.id}`] : [])]) {
    await ir(K.p, cam, `cliente ${cam}`); await varrerCampos(K.p, `cliente ${cam}`);
  }
  const ofiId = (await admin.from('oficinas').select('id').eq('profile_id', (await admin.from('profiles').select('id').eq('email', OFI).single()).data.id).single()).data.id;
  const { data: solO } = await admin.from('orcamentos').select('id:solicitacao_id').eq('oficina_id', ofiId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  for (const cam of ['/oficina/dashboard', '/oficina/pedidos', '/oficina/hoje', '/oficina/agenda', '/oficina/veiculos-em-servico', '/oficina/mensagens', '/oficina/pecas', '/oficina/equipe', '/oficina/capacidade', '/oficina/perfil', '/oficina/desempenho', '/oficina/avaliacoes', '/oficina/garantias', '/oficina/comissao', '/oficina/distribuicao', '/oficina/procurar', '/oficina/aprender', '/oficina/checkin', ...(solO ? [`/oficina/pedidos/${solO.id}`, `/oficina/orcamento/${solO.id}`] : [])]) {
    await ir(O.p, cam, `oficina ${cam}`); await varrerCampos(O.p, `oficina ${cam}`);
  }
  for (const cam of ['/loja/dashboard', '/loja/cotacoes', '/loja/pedidos', '/loja/catalogo', '/loja/comissao', '/loja/perfil', '/loja/aprender']) {
    await ir(loja.p, cam, `loja ${cam}`); await varrerCampos(loja.p, `loja ${cam}`);
  }
  await ir(ofi.p, '/oficina/pedidos', 'oficina NOVA (ainda nao aprovada) pedidos');
  ok('sem erro de JavaScript', !errosJs.length, errosJs.slice(0, 6).join(' | '));
} catch (e) {
  falhas++; achados.push(`EXCECAO ${(e.message || '').split('\n')[0]}`);
  console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 5).join(' | '));
} finally {
  await browser.close();
  const { data: cots } = await admin.from('cotacoes_pecas').select('id').ilike('peca_descricao', `%${tag}%`);
  for (const x of cots || []) { await admin.from('cotacoes_pecas_respostas').delete().eq('cotacao_id', x.id); await admin.from('cotacoes_pecas').delete().eq('id', x.id); }
  for (const id of contas) {
    for (const [t, c] of [['notificacoes', 'profile_id'], ['veiculos', 'profile_id'], ['oficinas', 'profile_id'], ['lojas_pecas', 'profile_id']]) await admin.from(t).delete().eq(c, id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  fs.writeFileSync(`${OUT}/resumo.txt`, `${L} ${W}: ${passos - falhas}/${passos} ok\n${achados.join('\n')}\n`);
  console.log(`\n${L} ${W}: ${passos - falhas}/${passos} ok${falhas ? ` - ${falhas} FALHA(S)` : ' - TUDO OK'}`);
}
