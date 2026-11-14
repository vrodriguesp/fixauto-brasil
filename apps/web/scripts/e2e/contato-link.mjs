// E2E LOCAL do passo contato leve + confirmacao por codigo OU link (dono 13/11; plano e
// auditoria Fable em Documentos/Analises/*Contato_Pedido_2026-11-13.md) e do telefone para
// a oficina (aviso depois do aceite + "enviar meu numero" na conversa).
//  A) API: telefone so com querSms; 1o e-mail com codigo + botao (token no fragmento);
//     abrir o link nao confirma; resumo sem endereco e telefone mascarado; link e codigo:
//     o primeiro vence, o outro 410; reenvio mata o link anterior e mantem o prazo; o
//     lembrete repete o link atual; conta existente: telefone so pelo codigo; corrida;
//     funil (contato_digitou, contato_sms_opt, link_aberto, confirmado_link/codigo).
//  B) telas ET 390 / RU 1280: telefone escondido ate marcar SMS, cadeado, "quase pronto",
//     codigo depois do link -> "ja nao espera"; landing: token some da barra, Lead da Meta.
//  C) telefone para a oficina: enviar na conversa (so aquela oficina), aviso depois do
//     aceite grava no perfil, e so a oficina aceita le o numero (RLS 074).
// SITE=http://localhost:3100 node contato-link.mjs <.env.local>
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
const EMAILS = env.EMAIL_PASTA_TESTE;
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados`;
const WEBMSG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../messages');
const msgWeb = (l) => {
  const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.json`, 'utf8'));
  for (const area of ['cliente', 'oficina', 'misc', 'auth']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.${area}.json`, 'utf8')));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const semear = fs.readFileSync(`${RAIZ}/ferramentas/semear.mjs`, 'utf8');
const W1_EMAIL = 'meister.teste@bipfix.test';
const W1_SENHA = (semear.match(/conta\('meister\.teste@bipfix\.test', '([^']+)'/) || [])[1];
if (!W1_SENHA) throw new Error('oficina de teste nao achada no semear.mjs');
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}${extra && !cond ? ' - ' + String(extra).replace(/\s+/g, ' ').slice(0, 300) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Cl-' + crypto.randomBytes(6).toString('hex');
const emailDe = (x) => `contato-${x}-${tag}@example.test`;
const ip = () => `10.81.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
const contas = new Set(); const sols = new Set(); const oficinasCriadas = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DADOS = (extra) => ({
  origem: 'site', idioma: 'et', nome: 'Kontakt Test', aceitouTermos: true,
  tipo: 'mecanica', descricao: 'Pidurid kriuksuvad ' + 'x'.repeat(200), urgencia: 'media',
  endereco: 'Salajane tänav 99, Tallinn', latitude: 59.437, longitude: 24.745, pais: 'EE',
  veiculo: { tipo: 'cars', marca: 'Toyota', modelo: 'Corolla', ano: '2019', codigo: null, placa: null },
  ...extra,
});
const enviarPedido = async (dados) => {
  const form = new FormData();
  form.append('dados', JSON.stringify(dados));
  const r = await fetch(`${SITE}/api/pedido-sem-conta`, { method: 'POST', body: form, headers: { 'x-real-ip': ip() } });
  const d = await r.json().catch(() => ({}));
  const p = d.pendenteId ? (await admin.from('pedidos_pendentes').select('*').eq('id', d.pendenteId).maybeSingle()).data : null;
  if (p) contas.add(p.user_id);
  return { status: r.status, d, p };
};
const post = async (rota, b) => {
  const r = await fetch(SITE + rota, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip() }, body: JSON.stringify(b) });
  return { status: r.status, d: await r.json().catch(() => ({})) };
};
const arquivosDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email.replace(/[^a-z0-9@._-]/gi, '_')}.html`) && Number(f.split('_')[0]) >= depois).sort();
const ultimoEmail = async (email, depois = 0) => {
  for (let i = 0; i < 30; i++) {
    const a = arquivosDe(email, depois);
    if (a.length) {
      const html = fs.readFileSync(path.join(EMAILS, a.at(-1)), 'utf8');
      const txt = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
      const links = [...html.matchAll(/href="([^"]+\?p=[^"]+)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, '&').replace(/^https?:\/\/[^/]+/, SITE)));
      return { html, txt, assunto: (html.match(/assunto: (.*?) -->/) || [])[1] || '', codigo: txt.match(/(?<![\d#])\d{6}(?!\d)/)?.[0], links };
    }
    await sleep(300);
  }
  return null;
};
const idT = (u) => ({ id: u.searchParams.get('p'), t: new URLSearchParams(u.hash.slice(1)).get('t'), o: u.searchParams.get('o') || undefined });
const tarefa = async () => (await fetch(`${SITE}/api/tarefas/limpar-pendentes`, { method: 'POST', headers: { 'x-tarefa-chave': env.TAREFAS_CHAVE } })).json().catch(() => ({}));
const envelhecer = (id, horas) => admin.from('pedidos_pendentes').update({ created_at: new Date(Date.now() - horas * 3600e3).toISOString() }).eq('id', id);
const funil = async (f) => Object.fromEntries(((await admin.from('funil_contagem').select('etapa, total').eq('funil', f)).data || []).reduce((m, x) => m.set(x.etapa, (m.get(x.etapa) || 0) + x.total), new Map()));

async function conta(email, s, perfil) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: s, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.add(data.user.id);
  const { error: e2 } = await admin.from('profiles').upsert({ id: data.user.id, email, ...perfil });
  if (e2) throw new Error(e2.message);
  return data.user.id;
}
async function sessao(email, s) {
  const c = anon();
  const { error } = await c.auth.signInWithPassword({ email, password: s });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
}

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const errosJs = [];
const contexto = async (largura, locale = 'et-EE') => {
  const c = await browser.newContext({ viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500,
    locale, extraHTTPHeaders: { 'x-real-ip': ip() } });
  await c.addInitScript(() => {
    try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {}
    // fila do Pixel (sem consentimento o script da Meta nao carrega: o stub fica)
    window.__fbq = []; window.fbq = (...a) => window.__fbq.push(a.join(' '));
  });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const design = async (page, nome) => {
  const t = await page.innerText('body');
  const crua = t.match(/\b(pedidoSemConta|telefoneOficina|clienteOrcamentoDetalhe|erros|constants)\.[a-zA-Z_]+|\?\?[a-zA-Z]/);
  ok(`${nome}: sem chave sem traducao`, !crua, crua?.[0]);
  const r = await page.evaluate(() => {
    const sw = document.documentElement.scrollWidth - innerWidth;
    const fora = [...document.querySelectorAll('main button, main a, main input, main select, main label')].filter((e) => e.offsetParent && !e.closest('[aria-hidden=true]'))
      .map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && (b.left < -1 || b.right > innerWidth + 1)).length;
    return { sw, fora };
  });
  ok(`${nome}: sem rolagem lateral nem elemento cortado`, r.sw <= 1 && r.fora === 0, JSON.stringify(r));
  return t;
};
const foto = (page, nome) => page.screenshot({ path: `${OUT}/contato_${nome}.png`, fullPage: true });

// ate o passo contato pelo formulario (servico -> detalhe -> carro -> local)
async function ateContato(page, rotaPedido) {
  await page.goto(`${SITE}${rotaPedido}`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid=passo-servico] button').nth(1).click();
  await page.locator('#pedido-descricao').fill('Pidurid kriuksuvad');
  await page.getByTestId('navegar').getByRole('button').last().click();
  await page.getByTestId('passo-carro').waitFor({ state: 'visible' });
  // marca/modelo/ano pelo rascunho e mais estavel que o autocomplete: preenche e recarrega
  await page.evaluate(() => {
    const r = JSON.parse(localStorage.getItem('bipfix_pedido_rascunho') || '{}');
    Object.assign(r, { em: Date.now(), etapa: 'local', carro: { tipo: 'cars', marca: 'Toyota', modelo: 'Corolla', ano: '2019', codigo: '' }, endereco: 'Pärnu mnt 10, Tallinn', coords: { lat: 59.433, lon: 24.746 }, pais: 'EE' });
    localStorage.setItem('bipfix_pedido_rascunho', JSON.stringify(r));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('passo-local').waitFor();
  await page.getByTestId('navegar').getByRole('button').last().click();
  await page.getByTestId('passo-contato').waitFor();
}

const INICIO = Date.now();
try {
  // ====================== A) API ======================
  // A1 telefone so com "quero SMS"
  {
    const sem = await enviarPedido(DADOS({ email: emailDe('a1'), querSms: false, telefone: '+372 5123 4567' }));
    ok('A1: querSms=false -> telefone nao guardado', sem.status === 200 && sem.p && sem.p.telefone === null, JSON.stringify(sem.d));
    const com = await enviarPedido(DADOS({ email: emailDe('a1b'), querSms: true, telefone: '+44 7700 900123' }));
    ok('A1: querSms=true -> telefone guardado (numero de fora da Estonia aceito)', com.p?.telefone === '+44 7700 900123', com.p?.telefone);
    const antigo = await enviarPedido(DADOS({ email: emailDe('a1c'), telefone: '+372 5123 4567' }));
    ok('A1: app antigo (sem querSms) -> como antes', antigo.p?.telefone === '+372 5123 4567');
  }

  // A2 1o e-mail: codigo + botao confirmar + cancelar; token so no fragmento; sem endereco/descricao
  const e2 = emailDe('a2');
  let t0 = Date.now();
  const a2 = await enviarPedido(DADOS({ email: e2, querSms: true, telefone: '+372 5123 4567' }));
  const m2 = await ultimoEmail(e2, t0);
  ok('A2: 1o e-mail com codigo no corpo e no assunto', !!m2?.codigo && m2.assunto.includes(m2.codigo) && /Kinnita/.test(m2.assunto), m2?.assunto);
  ok('A2: 1o e-mail com botao confirmar e link cancelar', m2?.links.length === 2 && m2.links.some((u) => u.searchParams.get('acao') === 'cancelar'), JSON.stringify(m2?.links.map(String)));
  ok('A2: token so no fragmento (#t=), id na consulta', m2?.links.every((u) => !u.searchParams.get('t') && /^[a-f0-9]{64}$/.test(idT(u).t || '') && idT(u).id === a2.d.pendenteId));
  ok('A2: link no idioma do pedido (/ee/et/paring)', m2?.links.every((u) => u.pathname === '/ee/et/paring'), m2?.links.map((u) => u.pathname).join());
  ok('A2: e-mail sem endereco, descricao e telefone', !/Salajane|Pidurid|5123/.test(m2?.txt || ''));
  ok('A2: e-mail mostra tipo e carro', /Toyota Corolla 2019/.test(m2?.txt || ''));
  const link2 = idT(m2.links.find((u) => !u.searchParams.get('acao')));

  // A3 abrir a pagina do link (GET) nao confirma; "ver" sem endereco e telefone mascarado
  {
    const pg = await fetch(`${SITE}/ee/et/paring?p=${link2.id}`, { headers: { 'x-real-ip': ip() } });
    ok('A3: abrir a pagina do link -> 200 e o pedido continua pendente', pg.status === 200 && !!(await admin.from('pedidos_pendentes').select('id').eq('id', link2.id).maybeSingle()).data);
    const v = await post('/api/pedido-sem-conta/retomar', { ...link2, acao: 'ver' });
    ok('A3: resumo sem endereco', v.status === 200 && v.d.endereco === undefined && !JSON.stringify(v.d).includes('Salajane'), JSON.stringify(v.d));
    ok('A3: telefone mascarado (+372 5••••67)', v.d.telefone === '+3725••••67', v.d.telefone);
    ok('A3: descricao cortada em 120', (v.d.descricao || '').length <= 120);
    ok('A3: ainda pendente depois do "ver"', !!(await admin.from('pedidos_pendentes').select('id').eq('id', link2.id).maybeSingle()).data);
    const falso = await post('/api/pedido-sem-conta/retomar', { id: link2.id, t: 'a'.repeat(64), acao: 'ver' });
    ok('A3: token errado -> 410', falso.status === 410);
  }

  // A4 link primeiro -> codigo depois = 410 (e o inverso)
  {
    const r = await post('/api/pedido-sem-conta/retomar', { ...link2, acao: 'confirmar' });
    ok('A4: link confirma, cria o pedido e entra (tokenHash)', r.status === 200 && !!r.d.solicitacaoId && !!r.d.tokenHash, JSON.stringify(r.d));
    if (r.d.solicitacaoId) sols.add(r.d.solicitacaoId);
    const c = await post('/api/pedido-sem-conta/confirmar', { id: a2.d.pendenteId, codigo: m2.codigo });
    ok('A4: codigo depois do link -> 410 CODIGO_EXPIRADO', c.status === 410 && c.d.codigo === 'CODIGO_EXPIRADO', JSON.stringify(c));
    const de2 = await post('/api/pedido-sem-conta/retomar', { ...link2, acao: 'confirmar' });
    ok('A4: o mesmo link outra vez -> 410 (um pedido so)', de2.status === 410);
    const perfil = (await admin.from('profiles').select('telefone').ilike('email', e2).maybeSingle()).data;
    ok('A4: conta nova pelo link guarda o telefone do SMS', perfil?.telefone === '+372 5123 4567', JSON.stringify(perfil));

    const e = emailDe('a4b'); t0 = Date.now();
    const p = await enviarPedido(DADOS({ email: e, querSms: false }));
    const m = await ultimoEmail(e, t0);
    const c2 = await post('/api/pedido-sem-conta/confirmar', { id: p.d.pendenteId, codigo: m.codigo });
    ok('A4: codigo confirma', c2.status === 200, JSON.stringify(c2.d));
    if (c2.d.solicitacaoId) sols.add(c2.d.solicitacaoId);
    const l2 = await post('/api/pedido-sem-conta/retomar', { ...idT(m.links[0]), acao: 'ver' });
    ok('A4: link depois do codigo -> 410', l2.status === 410);
  }

  // A5 reenvio ao mesmo e-mail: link anterior morre, o novo vale; prazo igual nos dois e-mails
  {
    const e = emailDe('a5'); t0 = Date.now();
    const p = await enviarPedido(DADOS({ email: e, querSms: false }));
    const m1 = await ultimoEmail(e, t0);
    await admin.from('pedidos_pendentes').update({ ultimo_envio_em: new Date(Date.now() - 60e3).toISOString() }).eq('id', p.d.pendenteId);
    const t1 = Date.now(); await sleep(20);
    const rr = await post('/api/pedido-sem-conta/reenviar', { id: p.d.pendenteId });
    const mN = await ultimoEmail(e, t1);
    ok('A5: reenvio ok, e-mail novo com outro codigo e outro link', rr.status === 200 && mN && mN.codigo !== m1.codigo && idT(mN.links[0]).t !== idT(m1.links[0]).t);
    const prazo = (txt) => (txt.match(/kehtivad kuni ([^.]+)\./) || [])[1];
    ok('A5: o prazo nao recomeca no reenvio', !!prazo(m1.txt) && prazo(m1.txt) === prazo(mN.txt), `${prazo(m1.txt)} / ${prazo(mN.txt)}`);
    const velho = await post('/api/pedido-sem-conta/retomar', { ...idT(m1.links[0]), acao: 'ver' });
    ok('A5: link do e-mail anterior -> 410', velho.status === 410);
    const velhoCod = await post('/api/pedido-sem-conta/confirmar', { id: p.d.pendenteId, codigo: m1.codigo });
    ok('A5: codigo anterior -> errado (400)', velhoCod.status === 400);

    // A6 lembrete das 2 h repete o link atual (mesmo token) com o=l
    await envelhecer(p.d.pendenteId, 2.5);
    const t2 = Date.now(); await tarefa();
    const ml = await ultimoEmail(e, t2);
    const ll = ml?.links.map(idT) || [];
    ok('A6: lembrete com confirmar e cancelar, o=l', ll.length === 2 && ll.every((x) => x.o === 'l'), JSON.stringify(ml?.links.map(String)));
    ok('A6: lembrete repete o link do ultimo e-mail (mesmo token)', ll[0]?.t === idT(mN.links[0]).t);
    ok('A6: lembrete fala em "pole veel kinnitanud"', /pole seda veel kinnitanud/.test(ml?.txt || ''));
    const antes = (await funil('pedido_lembrete')).confirmado || 0;
    const rc = await post('/api/pedido-sem-conta/retomar', { ...ll.find((x) => true), acao: 'confirmar' });
    ok('A6: link do lembrete confirma', rc.status === 200, JSON.stringify(rc.d));
    if (rc.d.solicitacaoId) sols.add(rc.d.solicitacaoId);
    ok('A6: funil do lembrete conta o confirmado', ((await funil('pedido_lembrete')).confirmado || 0) === antes + 1);
  }

  // A7 conta existente sem telefone: link NAO grava o telefone digitado; codigo grava
  for (const via of ['link', 'codigo']) {
    const e = emailDe(`a7${via}`);
    const uid = await conta(e, senha, { tipo: 'cliente', nome: 'Olemas', idioma: 'et' });
    t0 = Date.now();
    const p = await enviarPedido(DADOS({ email: e, querSms: true, telefone: '+372 5888 7777' }));
    const m = await ultimoEmail(e, t0);
    const r = via === 'link'
      ? await post('/api/pedido-sem-conta/retomar', { ...idT(m.links.find((u) => !u.searchParams.get('acao'))), acao: 'confirmar' })
      : await post('/api/pedido-sem-conta/confirmar', { id: p.d.pendenteId, codigo: m.codigo });
    if (r.d.solicitacaoId) sols.add(r.d.solicitacaoId);
    const tel = (await admin.from('profiles').select('telefone').eq('id', uid).single()).data?.telefone;
    ok(`A7: conta existente pelo ${via}: pedido na conta e telefone ${via === 'link' ? 'NAO gravado' : 'gravado'}`, r.status === 200 && (via === 'link' ? tel === null : tel === '+372 5888 7777'), `${r.status} ${tel}`);
  }

  // A8 corrida: link e codigo ao mesmo tempo -> um pedido so
  {
    const e = emailDe('a8'); t0 = Date.now();
    const p = await enviarPedido(DADOS({ email: e, querSms: false }));
    const m = await ultimoEmail(e, t0);
    const [x, y] = await Promise.all([
      post('/api/pedido-sem-conta/retomar', { ...idT(m.links[0]), acao: 'confirmar' }),
      post('/api/pedido-sem-conta/confirmar', { id: p.d.pendenteId, codigo: m.codigo }),
    ]);
    for (const r of [x, y]) if (r.d.solicitacaoId) sols.add(r.d.solicitacaoId);
    const n = (await admin.from('solicitacoes').select('id', { count: 'exact', head: true }).eq('cliente_id', p.p.user_id)).count;
    ok('A8: link e codigo juntos -> um 200, outro 410, um pedido', [x.status, y.status].sort().join() === '200,410' && n === 1, `${x.status} ${y.status} n=${n}`);
  }

  // A9 cancelar pelo link do 1o e-mail
  {
    const e = emailDe('a9'); t0 = Date.now();
    const p = await enviarPedido(DADOS({ email: e, querSms: false }));
    const m = await ultimoEmail(e, t0);
    const c = await post('/api/pedido-sem-conta/retomar', { ...idT(m.links.find((u) => u.searchParams.get('acao') === 'cancelar')), acao: 'cancelar' });
    ok('A9: cancelar pelo 1o e-mail apaga o pendente', c.status === 200 && !(await admin.from('pedidos_pendentes').select('id').eq('id', p.d.pendenteId).maybeSingle()).data);
  }

  // A9b link antigo do lembrete (?retomar=&t=, retomar_hash): pendentes de antes do deploy
  {
    const e = emailDe('a9b'); t0 = Date.now();
    const p = await enviarPedido(DADOS({ email: e, querSms: false }));
    const tok = crypto.randomBytes(32).toString('hex');
    await admin.from('pedidos_pendentes').update({ retomar_hash: crypto.createHash('sha256').update(`retomar:${tok}:${e.toLowerCase()}`).digest('hex') }).eq('id', p.d.pendenteId);
    const pg = await fetch(`${SITE}/ee/et/paring?retomar=${p.d.pendenteId}&t=${tok}`, { headers: { 'x-real-ip': ip() } });
    const v = await post('/api/pedido-sem-conta/retomar', { id: p.d.pendenteId, t: tok, acao: 'ver' });
    const c = await post('/api/pedido-sem-conta/retomar', { id: p.d.pendenteId, t: tok, acao: 'confirmar' });
    if (c.d.solicitacaoId) sols.add(c.d.solicitacaoId);
    ok('A9b: link antigo do lembrete abre (200) e confirma', pg.status === 200 && v.status === 200 && c.status === 200 && !!c.d.solicitacaoId, `${pg.status} ${v.status} ${c.status}`);
  }

  // A10 funil
  {
    const r1 = await post('/api/funil', { funil: 'pedido_site', etapa: 'contato_digitou' });
    const r2 = await post('/api/funil', { funil: 'pedido_site', etapa: 'inventada_xyz' });
    const f = await funil('pedido_site');
    ok('A10: funil aceita contato_digitou e recusa etapa inventada', r1.status === 200 && r2.status === 200 && (f.contato_digitou || 0) > 0 && !f.inventada_xyz);
    ok('A10: funil conta link_aberto, confirmado_link e confirmado_codigo', (f.link_aberto || 0) > 0 && (f.confirmado_link || 0) > 0 && (f.confirmado_codigo || 0) > 0, JSON.stringify(f));
  }

  // ====================== B) telas ======================
  for (const [loc, largura, rot] of [['et', 390, '/ee/et/paring'], ['ru', 1280, '/ee/ru/zayavka']]) {
    const T = msgWeb(loc);
    const nm = `B ${loc} ${largura}`;
    const ctx = await contexto(largura, loc === 'ru' ? 'ru-RU' : 'et-EE');
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errosJs.push(`${nm}: ${e.message}`));
    const eventos = [];
    page.on('request', (r) => { if (r.url().includes('/api/funil')) eventos.push(JSON.parse(r.postData() || '{}').etapa); });
    await ateContato(page, rot);
    let t = await design(page, `${nm} contato`);
    ok(`${nm}: titulo novo e sem falar de codigo`, t.includes(T('pedidoSemConta.contatoTitulo')) && t.includes(T('pedidoSemConta.contatoTexto')));
    ok(`${nm}: telefone escondido ate marcar SMS`, (await page.locator('#pedido-telefone').count()) === 0 && t.includes(T('pedidoSemConta.querSms')));
    await foto(page, `${loc}_${largura}_contato`);
    await page.locator('#pedido-nome').fill('Kontakt Ekraan');
    await page.locator('#pedido-email').fill(emailDe(`b${loc}`));
    await page.getByTestId('quer-sms').check();
    await page.locator('#pedido-telefone').waitFor();
    t = await design(page, `${nm} contato com SMS`);
    ok(`${nm}: SMS marcado mostra telefone, dica e cadeado`, await page.getByTestId('sms-privacidade').isVisible() && t.includes(T('pedidoSemConta.smsPrivacidade')) && t.includes(T('pedidoSemConta.telefoneDica')));
    await foto(page, `${loc}_${largura}_contato_sms`);
    await page.getByTestId('aceito-termos').check();
    await page.getByTestId('navegar').getByRole('button').last().click();
    const avisoTel = await page.locator('[data-testid=passo-contato] [data-testid=falta-aviso]').innerText().catch(() => '(sem aviso)');
    ok(`${nm}: SMS marcado sem numero -> aviso "falta telefone"`, avisoTel === T('pedidoSemConta.faltaTelefone'), avisoTel);
    await page.getByTestId('quer-sms').uncheck();
    ok(`${nm}: desmarcar esconde o telefone`, (await page.locator('#pedido-telefone').count()) === 0);
    await page.getByTestId('quer-sms').check();
    await page.locator('#pedido-telefone').fill(loc === 'et' ? '5123 4567' : '5765 4321');
    await sleep(300);
    ok(`${nm}: funil contou contato_digitou e contato_sms_opt uma vez`, eventos.filter((x) => x === 'contato_digitou').length === 1 && eventos.filter((x) => x === 'contato_sms_opt').length === 1, eventos.join());
    const tEnv = Date.now();
    await page.getByTestId('navegar').getByRole('button').last().click();
    await page.getByTestId('passo-codigo').waitFor({ timeout: 30000 });
    t = await design(page, `${nm} quase pronto`);
    ok(`${nm}: "quase pronto" com o e-mail, o botao do e-mail e a frase do acesso`, t.includes(T('pedidoSemConta.codigoTitulo')) && t.includes(T('pedidoSemConta.codigoBotaoEmail')) && t.includes(T('pedidoSemConta.acessoTexto')) && t.includes(emailDe(`b${loc}`)));
    await foto(page, `${loc}_${largura}_quase_pronto`);
    const m = await ultimoEmail(emailDe(`b${loc}`), tEnv);
    const pend = (await admin.from('pedidos_pendentes').select('telefone, idioma').eq('id', idT(m.links[0]).id).maybeSingle()).data;
    ok(`${nm}: pendente com o telefone do SMS e o idioma`, pend?.telefone?.replace(/\D/g, '').startsWith('372') && pend?.idioma === loc, JSON.stringify(pend));
    // e-mail HTML como a pessoa ve (print)
    const pe = await ctx.newPage(); await pe.setContent(m.html); await pe.screenshot({ path: `${OUT}/contato_${loc}_email.png`, fullPage: true }); await pe.close();

    if (loc === 'et') {
      // confirma pelo link em OUTRA aba (landing): token sai da barra, resumo sem endereco, Lead da Meta
      const pl = await ctx.newPage();
      pl.on('pageerror', (e) => errosJs.push(`${nm} landing: ${e.message}`));
      const link = m.links.find((u) => !u.searchParams.get('acao'));
      await pl.goto(link.toString(), { waitUntil: 'domcontentloaded' });
      await pl.getByTestId('retomar-resumo').waitFor({ timeout: 15000 });
      ok(`${nm} landing: o token sai da barra de endereco (fica so ?p=)`, !pl.url().includes('t=') && !pl.url().includes('#') && pl.url().includes(`?p=${idT(link).id}`), pl.url());
      await pl.reload({ waitUntil: 'domcontentloaded' });
      ok(`${nm} landing: recarregar (F5) continua no pedido`, await pl.getByTestId('retomar-resumo').waitFor({ timeout: 15000 }).then(() => true, () => false));
      t = await design(pl, `${nm} landing`);
      ok(`${nm} landing: resumo sem endereco, com telefone mascarado`, !t.includes('Pärnu mnt') && /\+3725••••67/.test(t), t.slice(0, 300));
      await foto(pl, `${loc}_${largura}_landing`);
      await pl.getByTestId('retomar-confirmar').click();
      await pl.waitForURL(/loo-parool|criar-senha|paring|orcamentos|hinnapakkumised/, { timeout: 20000 }).catch(() => {});
      await sleep(1500);
      const fila = await pl.evaluate(() => window.__fbq || []).catch(() => []);
      ok(`${nm} landing: Lead da Meta no caminho do link`, fila.some((x) => x.includes('track Lead')), JSON.stringify(fila));
      // a aba original ainda espera o codigo: digitar -> "ja nao espera" + Entrar
      await page.locator('#pedido-codigo').fill(m.codigo);
      await page.getByTestId('confirmar-codigo').click();
      await page.getByTestId('pedido-ja-confirmado').waitFor({ timeout: 15000 }).catch(() => {});
      t = await design(page, `${nm} ja confirmado`);
      ok(`${nm}: codigo depois do link -> "ja nao espera" (nao erro seco)`, t.includes(T('pedidoSemConta.jaConfirmouTitulo')) && t.includes(T('pedidoSemConta.jaConfirmouTexto')));
      ok(`${nm}: rascunho apagado`, await page.evaluate(() => !localStorage.getItem('bipfix_pedido_rascunho')));
      await foto(page, `${loc}_${largura}_ja_confirmado`);
    } else {
      // RU: pelo codigo; Lead tambem
      await page.locator('#pedido-codigo').fill(m.codigo);
      await page.getByTestId('confirmar-codigo').click();
      await page.waitForURL((u) => !u.pathname.endsWith('/zayavka'), { timeout: 20000 }).catch(() => {});
      await sleep(1000);
      const fila = await page.evaluate(() => window.__fbq || []).catch(() => []);
      ok(`${nm}: codigo confirma e sai da pagina do pedido, Lead da Meta`, !page.url().endsWith('/zayavka') && fila.some((x) => x.includes('track Lead')), page.url());
    }
    const sid = (await admin.from('profiles').select('id').ilike('email', emailDe(`b${loc}`)).maybeSingle()).data?.id;
    if (sid) { contas.add(sid); for (const s of (await admin.from('solicitacoes').select('id').eq('cliente_id', sid)).data || []) sols.add(s.id); }
    await ctx.close();
  }

  // ====================== C) telefone para a oficina ======================
  {
    const T = msgWeb('et');
    const w1Id = (await admin.from('profiles').select('id').eq('email', W1_EMAIL).single()).data.id;
    const { data: of1 } = await admin.from('oficinas').select('id, nome_fantasia').eq('profile_id', w1Id).single();
    const w2Email = `contato-of2-${tag}@example.test`;
    const w2Id = await conta(w2Email, senha, { tipo: 'oficina', nome: 'Teine', idioma: 'et', telefone: '+372 5000 4444' });
    const { data: of2 } = await admin.from('oficinas').insert({ profile_id: w2Id, nome_fantasia: `Teine Töökoda ${tag}`, endereco: 'Pärnu mnt 20', cidade: 'Tallinn', estado: 'Harjumaa', cep: '10141', pais: 'EE', latitude: 59.43, longitude: 24.745, raio_atendimento_km: 30, especialidades: ['mecanica'], ativa: true }).select('id').single();
    oficinasCriadas.add(of2.id);
    const cEmail = emailDe('c-cli');
    const cId = await conta(cEmail, senha, { tipo: 'cliente', nome: 'Telefonita', idioma: 'et' });
    const { data: v } = await admin.from('veiculos').insert({ profile_id: cId, fipe_tipo: 'cars', fipe_marca: 'Škoda', fipe_modelo: 'Octavia', fipe_ano: '2017', placa: `TEL${tag.slice(0, 3).toUpperCase()}` }).select('id').single();
    const { data: sol } = await admin.from('solicitacoes').insert({ cliente_id: cId, veiculo_id: v.id, tipo: 'mecanica', descricao: `Telefon ${tag}`, urgencia: 'media', endereco: 'Pärnu mnt 10, Tallinn', latitude: 59.433, longitude: 24.746, status: 'em_orcamento' }).select('id').single();
    sols.add(sol.id);
    const dia = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const o1 = (await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of1.id, valor_total: 150, prazo_dias: 2, status: 'enviado', validade: dia(10) }).select('id').single()).data;
    await admin.from('orcamento_disponibilidade').insert({ orcamento_id: o1.id, data_checkin: dia(4), turno: 'manha', data_previsao_entrega: dia(5) });
    const o2 = (await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of2.id, valor_total: 180, prazo_dias: 2, status: 'enviado', validade: dia(10) }).select('id').single()).data;
    await admin.from('orcamento_disponibilidade').insert({ orcamento_id: o2.id, data_checkin: dia(4), turno: 'manha', data_previsao_entrega: dia(5) });

    for (const largura of [390, 1280]) {
      const ctx = await contexto(largura);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errosJs.push(`C ${largura}: ${e.message}`));
      await page.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' });
      await page.fill('input[type=email]', cEmail); await page.fill('input[type=password]', senha);
      await page.click('button[type=submit]'); await page.waitForTimeout(3500);
      await page.goto(`${SITE}/ee/et/klient/hinnapakkumised/${sol.id}`, { waitUntil: 'networkidle' }).catch(() => {});
      if (!(await page.getByTestId('compartilhar-telefone').first().isVisible().catch(() => false))) {
        // rota em portugues como reserva (o middleware traduz)
        await page.goto(`${SITE}/ee/et/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' });
      }
      await page.getByTestId('compartilhar-telefone').first().waitFor({ timeout: 15000 });
      ok(`C ${largura}: botao "enviar meu numero" em cada orcamento aberto`, (await page.getByTestId('compartilhar-telefone').count()) === 2);
      await design(page, `C ${largura} pedido`);
      if (largura === 390) {
        // abre no orcamento da oficina 1 (a lista pode vir em outra ordem: acha pelo cartao)
        const cartao = page.locator(`#orc-${o1.id}`);
        const alvo = (await cartao.count()) ? cartao.getByTestId('compartilhar-telefone') : page.getByTestId('compartilhar-telefone').first();
        await alvo.click();
        await page.getByTestId('compartilhar-telefone-painel').waitFor();
        const t = await design(page, `C ${largura} painel`);
        ok(`C ${largura}: painel diz que so esta oficina ve`, t.includes(T('telefoneOficina.compartilharTexto', { oficina: (await cartao.count()) ? of1.nome_fantasia : '' }).split('{')[0].slice(0, 20)));
        await foto(page, `telefone_${largura}_painel`);
        const larg = await page.locator('[data-testid=compartilhar-telefone-painel] input[type=tel]').evaluate((e) => e.getBoundingClientRect().width);
        ok(`C ${largura}: campo do numero com largura usavel (>= 120 px)`, larg >= 120, `${larg}px`);
        await page.getByTestId('compartilhar-telefone-enviar').click();
        ok(`C ${largura}: numero invalido (vazio) -> aviso`, (await page.locator('[data-testid=compartilhar-telefone-painel] [role=alert]').innerText().catch(() => '')) === T('telefoneOficina.numeroInvalido'));
        await page.locator('[data-testid=compartilhar-telefone-painel] input[type=tel]').fill('5321 0987');
        await page.getByTestId('compartilhar-telefone-enviar').click();
        await page.getByTestId('telefone-compartilhado').waitFor({ timeout: 10000 });
        await foto(page, `telefone_${largura}_enviado`);
        const msgs = (await admin.from('mensagens').select('oficina_id, texto, remetente_id').eq('solicitacao_id', sol.id)).data || [];
        const oficinaAlvo = (await cartao.count()) ? of1.id : msgs[0]?.oficina_id;
        ok('C: mensagem com o numero so na conversa daquela oficina', msgs.length === 1 && msgs[0].oficina_id === oficinaAlvo && msgs[0].remetente_id === cId && msgs[0].texto.includes('+372 5321 0987'), JSON.stringify(msgs));
        const tokC = (await (await sessao(cEmail, senha)).auth.getSession()).data.session.access_token;
        const rDup = await fetch(`${SITE}/api/solicitacoes/${sol.id}/compartilhar-telefone`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokC}`, 'x-real-ip': ip() }, body: JSON.stringify({ oficinaId: oficinaAlvo, telefone: '+372 5321 0987' }) });
        const msgs2 = (await admin.from('mensagens').select('id').eq('solicitacao_id', sol.id)).data || [];
        ok('C: o mesmo numero de novo -> 200 sem mensagem repetida', rDup.status === 200 && msgs2.length === 1, `${rDup.status} n=${msgs2.length}`);
        ok('C: perfil continua sem telefone (so foi para a conversa)', (await admin.from('profiles').select('telefone').eq('id', cId).single()).data.telefone === null);
        const reg = (await admin.from('telefone_compartilhado').select('oficina_id, telefone, cliente_id').eq('solicitacao_id', sol.id)).data || [];
        ok('C: numero registrado para aquela oficina (081)', reg.length === 1 && reg[0].oficina_id === oficinaAlvo && reg[0].telefone === '+372 5321 0987' && reg[0].cliente_id === cId, JSON.stringify(reg));
        const avisoOf = (await admin.from('notificacoes').select('id').eq('tipo', 'nova_mensagem').eq('dados->>solicitacao_id', sol.id)).data || [];
        ok('C: a oficina recebe o aviso de nova mensagem', avisoOf.length === 1);
        const w2 = await sessao(w2Email, senha);
        const visto = (await w2.from('mensagens').select('id').eq('solicitacao_id', sol.id)).data || [];
        const regW2 = (await w2.from('telefone_compartilhado').select('telefone').eq('solicitacao_id', sol.id)).data || [];
        ok('C: a outra oficina nao ve a mensagem nem o registro (RLS)', oficinaAlvo === of1.id ? visto.length === 0 && regW2.length === 0 : true, JSON.stringify({ visto, regW2 }));
        const w1 = await sessao(W1_EMAIL, W1_SENHA);
        const regW1 = (await w1.from('telefone_compartilhado').select('telefone').eq('solicitacao_id', sol.id)).data || [];
        ok('C: a oficina escolhida le o registro', oficinaAlvo === of1.id ? regW1[0]?.telefone === '+372 5321 0987' : true, JSON.stringify(regW1));
        // de fora: outro cliente nao consegue registrar numero neste pedido
        const intrusoEmail = emailDe('c-intruso');
        await conta(intrusoEmail, senha, { tipo: 'cliente', nome: 'Intruso', idioma: 'et' });
        const tokI = (await (await sessao(intrusoEmail, senha)).auth.getSession()).data.session.access_token;
        const ri = await fetch(`${SITE}/api/solicitacoes/${sol.id}/compartilhar-telefone`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokI}`, 'x-real-ip': ip() }, body: JSON.stringify({ oficinaId: of1.id, telefone: '+372 5000 0000' }) });
        ok('C: outro cliente -> 403', ri.status === 403, String(ri.status));
        // pagina da oficina: botao "ligar" com o numero enviado
        const ctxO = await contexto(390);
        const po = await ctxO.newPage();
        po.on('pageerror', (e) => errosJs.push(`C oficina: ${e.message}`));
        await po.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' });
        await po.fill('input[type=email]', W1_EMAIL); await po.fill('input[type=password]', W1_SENHA);
        await po.click('button[type=submit]'); await po.waitForTimeout(3500);
        await po.goto(`${SITE}/ee/et/oficina/pedidos/${sol.id}`, { waitUntil: 'networkidle' });
        const ligar = await po.getByTestId('ligar-cliente').waitFor({ timeout: 15000 }).then(() => true, () => false);
        const tO = await design(po, 'C oficina 390');
        ok('C oficina: botao ligar com o numero e a frase "o cliente enviou"', ligar && tO.includes('+372 5321 0987') && tO.includes(T('oficinaSolicitacaoDetalhe.clienteEnviouNumero')), tO.slice(0, 200));
        await foto(po, 'telefone_oficina_ligar');
        await ctxO.close();
      }
      await ctx.close();
    }

    // aceite da oficina 1: aviso para adicionar o telefone, grava no perfil
    await admin.from('orcamentos').update({ status: 'aceito' }).eq('id', o1.id);
    await admin.from('orcamentos').update({ status: 'recusado' }).eq('id', o2.id);
    for (const largura of [390, 1280]) {
      const ctx = await contexto(largura);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errosJs.push(`C aceite ${largura}: ${e.message}`));
      await page.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' });
      await page.fill('input[type=email]', cEmail); await page.fill('input[type=password]', senha);
      await page.click('button[type=submit]'); await page.waitForTimeout(3500);
      await page.goto(`${SITE}/ee/et/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' });
      if (largura === 390) {
        await page.getByTestId('telefone-depois-aceite').waitFor({ timeout: 15000 });
        const t = await design(page, `C aceite ${largura}`);
        ok('C aceite: pede o telefone citando a oficina, com o cadeado', t.includes(T('telefoneOficina.avisoTitulo')) && t.includes(T('telefoneOficina.avisoTexto', { oficina: of1.nome_fantasia })) && t.includes(T('telefoneOficina.privacidade')));
        ok('C aceite: sem botao "enviar meu numero" (orcamento ja aceito/recusado)', (await page.getByTestId('compartilhar-telefone').count()) === 0);
        await foto(page, `telefone_${largura}_aceite`);
        await page.locator('[data-testid=telefone-depois-aceite] input[type=tel]').fill('5444 3322');
        await page.getByTestId('telefone-aceite-salvar').click();
        await page.getByTestId('telefone-salvo').waitFor({ timeout: 10000 });
        const tel = (await admin.from('profiles').select('telefone').eq('id', cId).single()).data.telefone;
        ok('C aceite: telefone gravado no perfil', tel === '+372 5444 3322', tel);
        const w1 = await sessao(W1_EMAIL, W1_SENHA);
        const w2 = await sessao(w2Email, senha);
        const v1 = (await w1.from('profiles').select('telefone').eq('id', cId).maybeSingle()).data?.telefone;
        const v2 = (await w2.from('profiles').select('telefone').eq('id', cId).maybeSingle()).data?.telefone;
        ok('C aceite: a oficina aceita le o numero; a recusada nao (RLS 074)', v1 === '+372 5444 3322' && !v2, `${v1} / ${v2}`);
      } else {
        await page.getByTestId('telefone-oficina-ve').waitFor({ timeout: 15000 });
        const t = await design(page, `C aceite ${largura}`);
        ok('C aceite 1280: com telefone, mostra o numero que a oficina ve + Muuda', t.includes(T('telefoneOficina.seuNumero', { tel: '+372 5444 3322' })));
        await foto(page, `telefone_${largura}_aceite_com_numero`);
      }
      await ctx.close();
    }
  }
  ok('sem erro de JavaScript nas paginas', errosJs.length === 0, errosJs.join(' | '));
} catch (e) {
  falhas++;
  console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  for (const s of sols) {
    await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', s);
    await admin.from('mensagens').delete().eq('solicitacao_id', s);
    await admin.from('solicitacao_fotos').delete().eq('solicitacao_id', s);
    const { data: os } = await admin.from('orcamentos').select('id').eq('solicitacao_id', s);
    for (const o of os || []) { await admin.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await admin.from('orcamento_itens').delete().eq('orcamento_id', o.id); }
    await admin.from('orcamentos').delete().eq('solicitacao_id', s);
    await admin.from('solicitacoes').delete().eq('id', s);
  }
  for (const o of oficinasCriadas) await admin.from('oficinas').delete().eq('id', o);
  const { data: pend } = await admin.from('pedidos_pendentes').select('id, user_id').ilike('email', `contato-%-${tag}@example.test`);
  for (const p of pend || []) { contas.add(p.user_id); await admin.from('pedidos_pendentes').delete().eq('id', p.id); }
  for (const id of contas) {
    for (const s of (await admin.from('solicitacoes').select('id').eq('cliente_id', id)).data || []) { await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', s.id); await admin.from('solicitacoes').delete().eq('id', s.id); }
    await admin.from('veiculos').delete().eq('profile_id', id);
    await admin.from('notificacoes').delete().eq('profile_id', id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`\n${falhas ? 'FALHAS: ' + falhas : 'TUDO OK'} (${Math.round((Date.now() - INICIO) / 1000)} s)`);
  process.exit(falhas ? 1 : 0);
}
