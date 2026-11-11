// E2E LOCAL do pedido de novas datas (migracao 079, dono 11/11, docs/DESENHO_079_novas_datas.md):
//  A) regras da API do cliente: datas ainda validas, sugestao no passado / longe / repetida / 4 sugestoes,
//     outro cliente, pedido duplicado, pedido expirado; aceite com horario vencido continua recusado;
//  B) cliente pede COM sugestoes pela tela (390 px, en) -> pendente na tela; oficina ve o selo na lista e o
//     cartao no pedido; confirma a sugestao pela tela -> horario origem 'cliente', orcamento aceito, agenda
//     criada, outro orcamento recusado, pedido 'atendido', cliente avisado;
//  C) cliente pede SEM sugestoes pela API -> oficina manda novas datas pela tela -> mesmo valor, sem nova
//     revisao; cliente avisado (aviso + e-mail + chat) e aceita normalmente;
//  D) cron: lembrete de 24 h a oficina (uma vez so); pendente cai com orcamento recusado; expirar o pedido
//     e cancelar o pedido cancelam o pendente; oficina nao confirma sugestao que ja passou;
//  E) orcamento vencido (validade antes de hoje): sem botao de pedir, mensagem com link ao outro ativo e a
//     pedido novo; API recusa aceite / pedir-datas / novas-datas com ORCAMENTO_VENCIDO;
//  F) textos ET e RU no site (cliente e oficina) e no app web (:8090): sem chave crua, sem rolagem lateral;
//  G) revisao Fable: oficina revisa o orcamento -> pendente cai (gatilho) e confirmar -> ORCAMENTO_MUDOU;
//     orcamento ganhou datas futuras -> cron cancela; corrida confirmar x aceitar -> um aceito so;
//     cliente pede a duas oficinas, uma confirma -> a outra e avisada e recebe ORCAMENTO_INDISPONIVEL;
//     confirmar com o turno comecando em menos de 2 h -> SUGESTAO_VENCIDA; validade estendida as datas novas;
//     link curto do e-mail da oficina (/r/<numero>?o=et&p=1); dica na pagina "Modificar orcamento";
//  H) auditoria Fable: duas oficinas confirmando ao mesmo tempo, funcionario gerente responde e mecanico nao ve
//     o cartao, pedido em no_show (fluxo completo), app com o aparelho em outro fuso, limite 429.
//   SITE=http://localhost:3101 node novas-datas.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(SITE)) throw new Error('SITE nao e local');
const APP = process.env.APP || 'http://localhost:8090';
const EMAILS = env.EMAIL_PASTA_TESTE;
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/novas-datas`;
fs.mkdirSync(OUT, { recursive: true });
const WEBMSG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../messages');
const MOB = path.resolve(WEBMSG, '../../mobile/i18n/locales');
const msgWeb = (l) => {
  const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.json`, 'utf8'));
  for (const area of ['cliente', 'oficina', 'misc', 'auth']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.${area}.json`, 'utf8')));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};
const msgApp = (l) => { const j = JSON.parse(fs.readFileSync(`${MOB}/${l}.json`, 'utf8')); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], j) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anonCli = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const semear = fs.readFileSync(`${RAIZ}/ferramentas/semear.mjs`, 'utf8');
const W1_EMAIL = 'meister.teste@bipfix.test';
const W1_SENHA = (semear.match(/conta\('meister\.teste@bipfix\.test', '([^']+)'/) || [])[1];
if (!W1_SENHA) throw new Error('oficina de teste nao achada no semear.mjs');
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Nd-' + crypto.randomBytes(6).toString('hex');
let falhas = 0, oks = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; else oks++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 260) : ''}`); };
const contas = new Set(); const sols = new Set(); const oficinasCriadas = new Set(); const funcs = new Set();
const ip = () => `10.79.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emailsDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort().map((f) => ({ f, html: fs.readFileSync(path.join(EMAILS, f), 'utf8') }));
const esperarEmail = async (email, depois, filtro = () => true) => { for (let i = 0; i < 40; i++) { const e = emailsDe(email, depois).filter(filtro).at(-1); if (e) return e; await sleep(300); } return null; };
// dia de calendario em Tallinn (as regras usam o fuso da oficina)
const hojeTallinn = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Tallinn' });
const dia = (n) => { const d = new Date(`${hojeTallinn()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const tallinn = (ymd, hm) => { for (const off of ['+02:00', '+03:00']) { const d = new Date(`${ymd}T${hm}:00${off}`); const h = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit' }); if (h === hm) return d.toISOString(); } return null; };

async function conta(email, s, perfil) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: s, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.add(data.user.id);
  const { error: e2 } = await admin.from('profiles').upsert({ id: data.user.id, email, ...perfil });
  if (e2) throw new Error(e2.message);
  return data.user.id;
}
async function sessao(email, s) {
  const c = anonCli();
  const { data, error } = await c.auth.signInWithPassword({ email, password: s });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return { c, token: data.session.access_token };
}
const post = async (rota, token, corpo, extra = {}) => { const r = await fetch(`${SITE}${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'x-real-ip': ip(), ...extra }, body: JSON.stringify(corpo) }); return { status: r.status, d: await r.json().catch(() => ({})) }; };
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const errosJs = [];
const contexto = async (largura, extra = {}) => {
  const c = await browser.newContext({ viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500,
    locale: 'et-EE', extraHTTPHeaders: { 'x-real-ip': ip() }, ...extra });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const CRUA = /\b(novasDatas|oficinaNovasDatas|clienteOrcamentoDetalhe|oficinaSolicitacaoDetalhe|oficinaPedidos|erros|constants)\.[a-zA-Z_]+|\?\?[a-zA-Z]/;
const design = async (page, nome, sel = 'main button, main a, main input, main select, main textarea') => {
  const t = await page.innerText('body');
  const crua = t.match(CRUA);
  ok(`${nome}: sem chave sem traducao`, !crua, crua?.[0]);
  const r = await page.evaluate((s) => {
    const sw = document.documentElement.scrollWidth - innerWidth;
    const fora = [...document.querySelectorAll(s)].filter((e) => e.offsetParent)
      .map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && (b.left < -1 || b.right > innerWidth + 1)).length;
    return { sw, fora };
  }, sel);
  ok(`${nome}: sem rolagem lateral nem elemento cortado`, r.sw <= 1 && r.fora === 0, JSON.stringify(r));
  return t;
};
const entrarSite = async (ctx, email, s, rot = '/ee/et') => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errosJs.push(`${rot}: ${e.message}`));
  await p.goto(`${SITE}${rot}/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', s);
  await p.click('button[type=submit]'); await p.waitForTimeout(4000);
  return p;
};
const esperarTeste = async (p, id, ms = 15000) => { try { await p.getByTestId(id).first().waitFor({ timeout: ms }); return true; } catch { return false; } };

const INICIO = Date.now();
try {
  const w1 = await sessao(W1_EMAIL, W1_SENHA);
  const w1Id = (await admin.from('profiles').select('id').eq('email', W1_EMAIL).single()).data.id;
  await admin.from('profiles').update({ idioma: 'et' }).eq('id', w1Id);
  const { data: of1 } = await admin.from('oficinas').select('id, nome_fantasia, prazo:id').eq('profile_id', w1Id).single();
  const w2Email = `nd-of2-${tag}@example.test`;
  const w2Id = await conta(w2Email, senha, { tipo: 'oficina', nome: 'Oficina Dois', idioma: 'ru', telefone: '+372 5000 4444' });
  const { data: of2 } = await admin.from('oficinas').insert({ profile_id: w2Id, nome_fantasia: `Teine Töökoda ${tag}`, endereco: 'Pärnu mnt 20', cidade: 'Tallinn', estado: 'Harjumaa', cep: '10141', pais: 'EE', latitude: 59.43, longitude: 24.745, raio_atendimento_km: 30, especialidades: ['mecanica', 'eletrica', 'pneu', 'manutencao'], ativa: true }).select('id').single();
  oficinasCriadas.add(of2.id);
  const w2 = await sessao(w2Email, senha);
  const mecEmail = `nd-mec-${tag}@example.test`;
  const mecId = await conta(mecEmail, senha, { tipo: 'oficina', nome: 'Mecanico', idioma: 'et' });
  const { data: fMec } = await admin.from('funcionarios').insert({ oficina_id: of1.id, profile_id: mecId, nome: 'Mecanico', cargo: 'mecanico', ativo: true }).select('id').single();
  if (fMec) funcs.add(fMec.id);
  const mec = await sessao(mecEmail, senha);

  // pedido com o orcamento da oficina 1 (datas vencidas) e o da oficina 2 (data futura)
  const novoPedido = async (n, opc = {}) => {
    const cEmail = `nd-cli${n}-${tag}@example.test`;
    const cId = await conta(cEmail, senha, { tipo: 'cliente', nome: `Cliente ${n}`, telefone: '+372 5999 100' + n, idioma: opc.idioma || 'en' });
    const { data: v } = await admin.from('veiculos').insert({ profile_id: cId, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018', placa: `ND${n}${tag.slice(0, 3).toUpperCase()}` }).select('id').single();
    const { data: sol } = await admin.from('solicitacoes').insert({ cliente_id: cId, veiculo_id: v.id, tipo: 'mecanica', descricao: `Novas datas ${n} ${tag}`, urgencia: 'media', endereco: 'Pärnu mnt 10, Tallinn', latitude: 59.433, longitude: 24.746, status: 'em_orcamento' }).select('id, numero').single();
    sols.add(sol.id);
    const o1 = (await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of1.id, valor_total: 150, prazo_dias: 2, status: 'enviado', validade: opc.validade1 || dia(10) }).select('id').single()).data;
    await admin.from('orcamento_itens').insert({ orcamento_id: o1.id, descricao: 'Remont', tipo: 'mao_de_obra', valor_unitario: 150, quantidade: 1, valor_total: 150 });
    await admin.from('orcamento_disponibilidade').insert([
      { orcamento_id: o1.id, data_checkin: dia(-3), turno: 'manha', data_previsao_entrega: dia(-1) },
      { orcamento_id: o1.id, data_checkin: dia(-2), turno: 'tarde', data_previsao_entrega: dia(0) },
    ]);
    const o2 = (await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of2.id, valor_total: 180, prazo_dias: 2, status: 'enviado', validade: dia(10) }).select('id').single()).data;
    const s2 = (await admin.from('orcamento_disponibilidade').insert({ orcamento_id: o2.id, data_checkin: opc.o2Passado ? dia(-2) : dia(4), turno: 'manha', data_previsao_entrega: dia(5) }).select('id').single()).data;
    const cli = await sessao(cEmail, senha);
    return { cEmail, cId, cli, sol, o1, o2, s2 };
  };
  const pedidoDatas = async (orcId) => (await admin.from('orcamento_pedido_datas').select('*').eq('orcamento_id', orcId).order('created_at', { ascending: false }).limit(1).maybeSingle()).data;

  // ================= A) regras da API (cliente) =================
  const A = await novoPedido(1);
  {
    let r = await post(`/api/orcamento/${A.o2.id}/pedir-datas`, A.cli.token, {});
    ok('A: orcamento com data futura -> DATAS_AINDA_VALIDAS', r.status === 409 && r.d.codigo === 'DATAS_AINDA_VALIDAS', JSON.stringify(r));
    r = await post(`/api/orcamento/${A.o1.id}/pedir-datas`, A.cli.token, { sugestoes: [{ data: dia(-1), turno: 'manha' }] });
    ok('A: sugestao no passado -> SUGESTAO_INVALIDA', r.status === 400 && r.d.codigo === 'SUGESTAO_INVALIDA', JSON.stringify(r));
    r = await post(`/api/orcamento/${A.o1.id}/pedir-datas`, A.cli.token, { sugestoes: [{ data: dia(40), turno: 'manha' }] });
    ok('A: sugestao a mais de 30 dias -> SUGESTAO_INVALIDA', r.status === 400 && r.d.codigo === 'SUGESTAO_INVALIDA', JSON.stringify(r));
    r = await post(`/api/orcamento/${A.o1.id}/pedir-datas`, A.cli.token, { sugestoes: [{ data: dia(3), turno: 'manha' }, { data: dia(3), turno: 'manha' }] });
    ok('A: sugestao repetida -> SUGESTAO_INVALIDA', r.status === 400 && r.d.codigo === 'SUGESTAO_INVALIDA', JSON.stringify(r));
    r = await post(`/api/orcamento/${A.o1.id}/pedir-datas`, A.cli.token, { sugestoes: [1, 2, 3, 4].map((i) => ({ data: dia(i + 1), turno: 'tarde' })) });
    ok('A: 4 sugestoes -> SUGESTAO_INVALIDA', r.status === 400 && r.d.codigo === 'SUGESTAO_INVALIDA', JSON.stringify(r));
    r = await post(`/api/orcamento/${A.o1.id}/pedir-datas`, A.cli.token, { mensagem: 'x'.repeat(301) });
    ok('A: mensagem com mais de 300 -> DADOS_INVALIDOS', r.status === 400 && r.d.codigo === 'DADOS_INVALIDOS', JSON.stringify(r));
    r = await post(`/api/orcamento/${A.o1.id}/pedir-datas`, w2.token, {});
    ok('A: outra pessoa (nao o cliente do pedido) -> 403', r.status === 403, JSON.stringify(r));
    r = await post(`/api/orcamento/${A.o1.id}/pedir-datas`, null, {});
    ok('A: sem login -> 401', r.status === 401, JSON.stringify(r));
    const { data: s1 } = await admin.from('orcamento_disponibilidade').select('id').eq('orcamento_id', A.o1.id).limit(1).single();
    r = await post(`/api/orcamento/${A.o1.id}/pedir-datas`, A.cli.token, { sugestoes: [{ data: dia(0), turno: 'tarde' }] });
    ok('A: sugestao para hoje -> SUGESTAO_INVALIDA (a partir de amanha)', r.status === 400 && r.d.codigo === 'SUGESTAO_INVALIDA', JSON.stringify(r));
    r = await post('/api/aceitar-orcamento', A.cli.token, { orcamentoId: A.o1.id, slotId: s1.id });
    ok('A: aceitar com horario vencido continua HORARIO_VENCIDO', r.status === 409 && r.d.codigo === 'HORARIO_VENCIDO', JSON.stringify(r));
    // RLS: o cliente nao escreve direto na tabela
    const { error: eIns } = await A.cli.c.from('orcamento_pedido_datas').insert({ orcamento_id: A.o1.id, solicitacao_id: A.sol.id, oficina_id: of1.id, cliente_id: A.cId });
    ok('A: RLS - cliente nao insere direto em orcamento_pedido_datas', !!eIns, eIns?.message);
  }

  // ================= B) cliente pede COM sugestoes pela tela; oficina confirma pela tela =================
  const t0 = Date.now();
  {
    const ctx = await contexto(390, { locale: 'en-GB' });
    const p = await entrarSite(ctx, A.cEmail, senha, '/ee/en');
    await p.goto(`${SITE}/ee/en/cliente/orcamentos/${A.sol.id}`, { waitUntil: 'networkidle' });
    const temCartao = await esperarTeste(p, 'pedir-novas-datas');
    const TE = msgWeb('en');
    const card = p.getByTestId('pedir-novas-datas');
    ok('B: cartao "datas desta oficina ja passaram" no orcamento vencido', temCartao && (await card.innerText()).includes(TE('novasDatas.titulo')), temCartao ? await card.innerText() : '');
    const orc1 = p.locator(`#orc-${A.o1.id}`);
    ok('B: orcamento com datas vencidas sem "Accept and schedule" (so o pedido de datas)', !(await orc1.innerText()).includes(TE('clienteOrcamentoDetalhe.acceptAndSchedule')));
    ok('B: o outro orcamento (data futura) continua com "Accept and schedule"', (await p.locator(`#orc-${A.o2.id}`).innerText()).includes(TE('clienteOrcamentoDetalhe.acceptAndSchedule')));
    await p.getByTestId('abrir-pedir-datas').click(); await p.waitForTimeout(500);
    const chips = p.locator('[data-testid^="chip-"]');
    const nChips = await chips.count();
    const ids = await chips.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    ok('B: grade com os proximos 14 dias a partir de amanha (sem domingo)', nChips >= 10 && ids.every((id) => { const d = id.slice(5, 15); return new Date(`${d}T12:00:00Z`).getUTCDay() !== 0 && d > hojeTallinn() && d <= dia(14); }), JSON.stringify(ids.slice(0, 4)));
    await design(p, 'B: cliente pedindo novas datas (en, 390)');
    // tres escolhidas: a quarta fica desativada
    for (let i = 0; i < 3; i++) await chips.nth(i + 2).click();
    ok('B: no maximo 3 sugestoes (as outras ficam desativadas)', await chips.nth(6).isDisabled());
    await chips.nth(4).click(); // desmarca a terceira: ficam 2
    await p.getByTestId('mensagem-datas').fill(`Prefer mornings ${tag}`);
    await p.screenshot({ path: path.join(OUT, 'cliente_pedir_en_390.png'), fullPage: true });
    await p.getByTestId('enviar-pedir-datas').click();
    const pend = await esperarTeste(p, 'novas-datas-pendente');
    const tPend = pend ? await p.getByTestId('novas-datas-pendente').innerText() : '';
    ok('B: depois de enviar -> "Request sent on ..., waiting for the repair shop" com as datas', pend && tPend.includes(TE('novasDatas.pendente', { data: '' }).split('.')[0].replace(/ on\s*$/, '')) && tPend.includes(TE('novasDatas.suasDatas', { datas: '' }).trim()), tPend);
    await ctx.close();
  }
  const pdB = await pedidoDatas(A.o1.id);
  ok('B: pedido gravado (pendente, 2 sugestoes, mensagem)', pdB?.status === 'pendente' && pdB.sugestoes.length === 2 && pdB.mensagem === `Prefer mornings ${tag}`, JSON.stringify(pdB));
  {
    const r = await post(`/api/orcamento/${A.o1.id}/pedir-datas`, A.cli.token, {});
    ok('B: segundo pedido para o mesmo orcamento -> PEDIDO_DATAS_PENDENTE', r.status === 409 && r.d.codigo === 'PEDIDO_DATAS_PENDENTE', JSON.stringify(r));
    const { data: nOf } = await admin.from('notificacoes').select('tipo, titulo, mensagem, dados').eq('profile_id', w1Id).eq('dados->>orcamento_id', A.o1.id);
    const n = (nOf || []).find((x) => x.tipo === 'pedido_novas_datas');
    ok('B: oficina avisada em et ("Klient küsib uusi aegu") com textos nas 6 linguas', n?.titulo === 'Klient küsib uusi aegu' && Object.keys(n.dados?.textos || {}).length === 6 && n.dados.textos.ru.titulo === 'Клиент просит новые даты', JSON.stringify(nOf));
    const { data: chat } = await admin.from('mensagens').select('texto, remetente_id').eq('solicitacao_id', A.sol.id).eq('oficina_id', of1.id);
    ok('B: linha no chat do pedido (cliente, com as datas e a mensagem)', (chat || []).some((m) => m.remetente_id === A.cId && m.texto.includes('new dates') && m.texto.includes(`Prefer mornings ${tag}`)), JSON.stringify(chat));
    const em = await esperarEmail(W1_EMAIL, t0, (e) => e.html.includes('Klient küsib uusi aegu'));
    const linkCurto = `/r/${A.sol.numero}?o=et&p=1`;
    ok('B: e-mail a oficina (et) com as datas, a mensagem e o link curto (sem pagina em portugues)', !!em && em.html.includes(`Prefer mornings ${tag}`) && em.html.includes(linkCurto) && !em.html.includes('/oficina/pedidos') && em.html.includes('Kliendi soovitud ajad'), em?.f);
    const rl = await fetch(`${SITE}/r/${A.sol.numero}?o=et&p=1`, { redirect: 'manual' });
    ok('B: /r/<numero>?o=et&p=1 leva ao pedido da oficina em et', rl.status === 302 && /\/ee\/et\//.test(rl.headers.get('location') || '') && (rl.headers.get('location') || '').endsWith(A.sol.id), rl.headers.get('location'));
    // permissoes da oficina
    let rr = await post(`/api/orcamento/${A.o1.id}/novas-datas`, w2.token, { confirmar: 0 });
    ok('B: outra oficina nao responde -> 403', rr.status === 403, JSON.stringify(rr));
    rr = await post(`/api/orcamento/${A.o1.id}/novas-datas`, mec.token, { confirmar: 0 });
    ok('B: mecanico da oficina nao responde -> 403', rr.status === 403, JSON.stringify(rr));
  }
  // oficina: selo na lista e cartao no pedido (et e ru, 390), confirma a 1a sugestao
  const sug0 = pdB.sugestoes[0];
  {
    for (const lg of ['ru', 'et']) {
      const TW = msgWeb(lg);
      const ctx = await contexto(390, { locale: lg === 'ru' ? 'ru-RU' : 'et-EE' });
      const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA, `/ee/${lg}`);
      await p.goto(`${SITE}/ee/${lg}/oficina/pedidos?aba=respondidos`, { waitUntil: 'networkidle' });
      await esperarTeste(p, 'pedido-cartao');
      await sleep(1500);
      const cartao = p.locator('[data-testid="pedido-cartao"]', { hasText: `Novas datas 1 ${tag}` });
      ok(`B(${lg}): selo "${TW('oficinaNovasDatas.selo')}" no cartao do pedido`, (await cartao.count()) === 1 && (await cartao.getByTestId('selo-novas-datas').count()) === 1, (await cartao.count()) ? await cartao.innerText() : 'sem cartao');
      await design(p, `B(${lg}): lista de pedidos da oficina com o selo`, 'main a, main button');
      await p.goto(`${SITE}/ee/${lg}/oficina/pedidos/${A.sol.id}`, { waitUntil: 'networkidle' });
      const tem = await esperarTeste(p, 'novas-datas-pedidas');
      const tc = tem ? await p.getByTestId('novas-datas-pedidas').innerText() : '';
      ok(`B(${lg}): cartao "${TW('oficinaNovasDatas.titulo')}" com as sugestoes, a mensagem e o editor`, tem && tc.includes(TW('oficinaNovasDatas.titulo')) && tc.includes(`Prefer mornings ${tag}`) && (await p.getByTestId('confirmar-sugestao-1').count()) === 1 && (await p.getByTestId('editor-novas-datas').count()) === 1, tc);
      await design(p, `B(${lg}): pedido da oficina com o cartao de novas datas (390)`);
      await p.getByTestId('novas-datas-pedidas').screenshot({ path: path.join(OUT, `oficina_cartao_${lg}_390.png`) }).catch(() => {});
      if (lg === 'et') {
        await p.getByTestId('confirmar-sugestao-0').click();
        // o cartao some quando a pagina recarrega (orcamento aceito): confere pelo banco e pela pagina sem o cartao
        let aceito = false;
        for (let i = 0; i < 40 && !aceito; i++) { aceito = (await admin.from('orcamentos').select('status').eq('id', A.o1.id).single()).data?.status === 'aceito'; if (!aceito) await sleep(400); }
        await sleep(2500);
        ok('B: confirmar pela tela -> orcamento aceito e o cartao de responder some', aceito && (await p.getByTestId('confirmar-sugestao-0').count()) === 0);
      }
      await ctx.close();
    }
  }
  {
    const { data: o1 } = await admin.from('orcamentos').select('status, revisao_numero, valor_total, disponibilidade_escolhida_id').eq('id', A.o1.id).single();
    const { data: slot } = await admin.from('orcamento_disponibilidade').select('id, data_checkin, turno, origem, data_previsao_entrega').eq('id', o1.disponibilidade_escolhida_id || '00000000-0000-0000-0000-000000000000').maybeSingle();
    ok('B: orcamento aceito no horario sugerido (origem cliente, previsao = data + prazo)', o1.status === 'aceito' && slot?.origem === 'cliente' && slot.data_checkin === sug0.data && slot.turno === sug0.turno && slot.data_previsao_entrega === (() => { const d = new Date(`${sug0.data}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10); })(), JSON.stringify({ o1, slot }));
    ok('B: valor e revisao iguais', Number(o1.valor_total) === 150 && (o1.revisao_numero || 0) === 0);
    const { data: ag } = await admin.from('agenda').select('data_inicio, status, oficina_id').eq('solicitacao_id', A.sol.id).eq('status', 'agendado');
    ok('B: agenda criada na oficina (08:00/13:00 Tallinn)', ag?.length === 1 && ag[0].oficina_id === of1.id && new Date(ag[0].data_inicio).toISOString() === tallinn(sug0.data, sug0.turno === 'manha' ? '08:00' : '13:00'), JSON.stringify(ag));
    const { data: o2 } = await admin.from('orcamentos').select('status, recusado_no_aceite').eq('id', A.o2.id).single();
    ok('B: o outro orcamento recusado (marcado recusado_no_aceite)', o2.status === 'recusado' && o2.recusado_no_aceite === true, JSON.stringify(o2));
    const { data: sol } = await admin.from('solicitacoes').select('status').eq('id', A.sol.id).single();
    ok('B: pedido aceito', sol.status === 'aceita', sol.status);
    const pd = await pedidoDatas(A.o1.id);
    ok('B: pedido de datas atendido (confirmou)', pd.status === 'atendido' && pd.resposta === 'confirmou' && !!pd.atendido_em, JSON.stringify(pd));
    const { data: nCli } = await admin.from('notificacoes').select('tipo, titulo, mensagem').eq('profile_id', A.cId);
    ok('B: cliente avisado (en, "Booking confirmed")', (nCli || []).some((n) => n.tipo === 'novas_datas_confirmada' && n.titulo === 'Booking confirmed'), JSON.stringify(nCli));
    const emCli = await esperarEmail(A.cEmail, t0, (e) => /Booking confirmed/.test(e.html));
    ok('B: cliente recebe o e-mail do agendamento (mesmo do aceite)', !!emCli, emCli?.f);
    const { data: chat } = await admin.from('mensagens').select('texto, remetente_id').eq('solicitacao_id', A.sol.id).eq('oficina_id', of1.id);
    ok('B: linha no chat da oficina ("Aeg kinnitatud")', (chat || []).some((m) => m.remetente_id === w1Id && m.texto.includes('Aeg kinnitatud')), JSON.stringify(chat));
    const r = await post(`/api/orcamento/${A.o1.id}/novas-datas`, w1.token, { confirmar: 1 });
    ok('B: confirmar de novo -> ORCAMENTO_INDISPONIVEL (ja aceito)', r.status === 409 && r.d.codigo === 'ORCAMENTO_INDISPONIVEL', JSON.stringify(r));
  }

  // ================= C) sem sugestoes pela API; oficina manda datas pela tela; cliente aceita =================
  const C = await novoPedido(2, { idioma: 'ru' });
  const t1 = Date.now();
  {
    // validade curta: as datas novas da oficina vao alem dela -> a validade e estendida (revisao Fable S1)
    await admin.from('orcamentos').update({ validade: dia(3) }).eq('id', C.o1.id);
    let r = await post(`/api/orcamento/${C.o1.id}/pedir-datas`, C.cli.token, {});
    ok('C: pedido sem sugestoes pela API -> 200', r.status === 200 && r.d.ok, JSON.stringify(r));
    r = await post(`/api/orcamento/${C.o1.id}/novas-datas`, w1.token, { confirmar: 0 });
    ok('C: confirmar sem sugestao -> DADOS_INVALIDOS', r.status === 400 && r.d.codigo === 'DADOS_INVALIDOS', JSON.stringify(r));
    r = await post(`/api/orcamento/${C.o1.id}/novas-datas`, w1.token, { horarios: [{ data: dia(-1), turno: 'manha' }] });
    ok('C: horario novo no passado -> HORARIO_VENCIDO', r.status === 409 && r.d.codigo === 'HORARIO_VENCIDO', JSON.stringify(r));
    r = await post(`/api/orcamento/${C.o1.id}/novas-datas`, w1.token, { horarios: [{ data: dia(6), turno: 'manha', previsao: dia(5) }] });
    ok('C: previsao antes da data -> PREVISAO_ANTES_DA_DATA', r.status === 400 && r.d.codigo === 'PREVISAO_ANTES_DA_DATA', JSON.stringify(r));
    r = await post(`/api/orcamento/${C.o1.id}/novas-datas`, w1.token, { horarios: [1, 2, 3, 4].map((i) => ({ data: dia(i + 4), turno: 'tarde' })) });
    ok('C: 4 horarios -> DADOS_INVALIDOS', r.status === 400 && r.d.codigo === 'DADOS_INVALIDOS', JSON.stringify(r));
    // cliente (ru) ve "pedido enviado" na tela; oficina manda 2 datas pela tela
    const ctxC = await contexto(390, { locale: 'ru-RU' });
    const pc = await entrarSite(ctxC, C.cEmail, senha, '/ee/ru');
    await pc.goto(`${SITE}/ee/ru/cliente/orcamentos/${C.sol.id}`, { waitUntil: 'networkidle' });
    ok('C(ru): cliente ve "Запрос отправлен ..."', (await esperarTeste(pc, 'novas-datas-pendente')) && (await pc.getByTestId('novas-datas-pendente').innerText()).includes('Запрос отправлен'));
    await design(pc, 'C(ru): pedido do cliente com o pedido pendente (390)');
    const ctx = await contexto(390);
    const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA, '/ee/et');
    await p.goto(`${SITE}/ee/et/oficina/pedidos/${C.sol.id}`, { waitUntil: 'networkidle' });
    await esperarTeste(p, 'novas-datas-pedidas');
    ok('C: sem sugestoes -> "Klient ei pakkunud aegu."', (await p.getByTestId('novas-datas-pedidas').innerText()).includes(msgWeb('et')('oficinaNovasDatas.semSugestoes')));
    await p.getByTestId('nd-data-0').fill(dia(6));
    await p.getByTestId('nd-turno-0').selectOption('tarde');
    ok('C: previsao de entrega sugerida = data + prazo (2 dias)', (await p.getByTestId('nd-previsao-0').inputValue()) === dia(8), await p.getByTestId('nd-previsao-0').inputValue());
    await p.getByTestId('nd-adicionar').click();
    await p.getByTestId('nd-data-1').fill(dia(7));
    await p.getByTestId('nd-turno-1').selectOption('manha');
    await design(p, 'C: editor de novas datas da oficina (et, 390)');
    await p.getByTestId('nd-enviar').click();
    const feito = await esperarTeste(p, 'novas-datas-feito');
    ok('C: mandar datas pela tela -> "Ajad saadeti kliendile."', feito);
    await ctx.close();
    const { data: slots } = await admin.from('orcamento_disponibilidade').select('id, data_checkin, turno, origem, data_previsao_entrega').eq('orcamento_id', C.o1.id).order('data_checkin');
    const novos = (slots || []).filter((s) => s.data_checkin >= dia(0));
    ok('C: 2 horarios novos (origem oficina, previsao +2 dias)', novos.length === 2 && novos.every((s) => s.origem === 'oficina') && novos[0].data_checkin === dia(6) && novos[0].turno === 'tarde' && novos[0].data_previsao_entrega === dia(8) && novos[1].data_checkin === dia(7), JSON.stringify(novos));
    const { data: o1 } = await admin.from('orcamentos').select('status, revisao_numero, valor_total, valor_original, validade').eq('id', C.o1.id).single();
    ok('C: validade estendida ate a maior data nova (sem revisao)', o1.validade === dia(7), o1.validade);
    ok('C: orcamento igual (mesmo valor, sem revisao, ainda enviado)', o1.status === 'enviado' && (o1.revisao_numero || 0) === 0 && Number(o1.valor_total) === 150 && !o1.valor_original, JSON.stringify(o1));
    const pd = await pedidoDatas(C.o1.id);
    ok('C: pedido atendido (novas_datas)', pd.status === 'atendido' && pd.resposta === 'novas_datas', JSON.stringify(pd));
    const { data: nCli } = await admin.from('notificacoes').select('tipo, titulo, mensagem, dados').eq('profile_id', C.cId).eq('tipo', 'novas_datas_enviadas');
    ok('C: cliente avisado em ru com as datas', nCli?.length === 1 && nCli[0].titulo === 'Автосервис прислал новые даты' && nCli[0].mensagem.includes('13:00–17:00') && !!nCli[0].dados?.textos?.et, JSON.stringify(nCli));
    const em = await esperarEmail(C.cEmail, t1, (e) => e.html.includes('прислал новые даты'));
    ok('C: e-mail ao cliente (ru) com link neutro /r/<numero>', !!em && em.html.includes(`/r/${C.sol.numero}`) && !em.html.includes('/cliente/orcamentos'), em?.f);
    const { data: chat } = await admin.from('mensagens').select('texto, remetente_id').eq('solicitacao_id', C.sol.id).eq('oficina_id', of1.id);
    ok('C: chat com o pedido do cliente e as datas da oficina', (chat || []).some((m) => m.remetente_id === C.cId && m.texto.includes('новые даты')) && (chat || []).some((m) => m.remetente_id === w1Id && m.texto.includes('Uued ajad')), JSON.stringify(chat));
    // cliente aceita normalmente pela tela (ru)
    await pc.reload({ waitUntil: 'networkidle' }); await sleep(2500);
    const TR = msgWeb('ru');
    const orcC = pc.locator(`#orc-${C.o1.id}`);
    ok('C(ru): sem o cartao de pedir datas e com "Принять и записаться"', (await pc.getByTestId('pedir-novas-datas').count()) === 0 && (await orcC.innerText()).includes(TR('clienteOrcamentoDetalhe.acceptAndSchedule')));
    await orcC.getByText(TR('clienteOrcamentoDetalhe.acceptAndSchedule')).click(); await sleep(800);
    await orcC.locator('button.w-full.p-4').first().click();
    await orcC.getByText(TR('clienteOrcamentoDetalhe.confirmAppointment')).click(); await sleep(3500);
    const { data: oAc } = await admin.from('orcamentos').select('status, disponibilidade_escolhida_id').eq('id', C.o1.id).single();
    const { data: agC } = await admin.from('agenda').select('data_inicio').eq('solicitacao_id', C.sol.id).eq('status', 'agendado');
    ok('C: cliente aceita a nova data -> aceito e agendado (13:00 Tallinn)', oAc.status === 'aceito' && agC?.length === 1 && new Date(agC[0].data_inicio).toISOString() === tallinn(dia(6), '13:00'), JSON.stringify({ oAc, agC }));
    await ctxC.close();
  }

  // ================= D) cron, cancelamentos, sugestao vencida =================
  const tarefa = (rota) => post(`/api/tarefas/${rota}`, null, {}, { 'x-tarefa-chave': env.TAREFAS_CHAVE });
  const D = await novoPedido(3, { idioma: 'et' });
  {
    let r = await post(`/api/orcamento/${D.o1.id}/pedir-datas`, D.cli.token, { sugestoes: [{ data: dia(2), turno: 'tarde' }] });
    ok('D: pedido criado', r.status === 200, JSON.stringify(r));
    {
      const ctx = await contexto(390);
      const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA, '/ee/et');
      await p.goto(`${SITE}/ee/et/oficina/orcamento/${D.sol.id}`, { waitUntil: 'networkidle' });
      const tem = await esperarTeste(p, 'dica-novas-datas');
      ok('D: "Modificar orcamento" com pedido pendente mostra a dica (cartao no pedido, nao conta como revisao)', tem && (await p.getByTestId('dica-novas-datas').innerText()).includes(msgWeb('et')('oficinaNovasDatas.dicaModificarLink')));
      await design(p, 'D: pagina modificar orcamento com a dica (et, 390)');
      await ctx.close();
    }
    let c = await tarefa('limpar-pendentes');
    const pd0 = await pedidoDatas(D.o1.id);
    ok('D: cron antes de 24 h nao lembra', c.status === 200 && !pd0.lembrete_em, JSON.stringify(c));
    await admin.from('orcamento_pedido_datas').update({ created_at: new Date(Date.now() - 25 * 3600e3).toISOString() }).eq('id', pd0.id);
    c = await tarefa('limpar-pendentes');
    const pd1 = await pedidoDatas(D.o1.id);
    ok('D: cron depois de 24 h -> lembrete (novasDatas.lembretes >= 1, lembrete_em gravado)', c.d?.novasDatas?.lembretes >= 1 && !!pd1.lembrete_em, JSON.stringify(c.d));
    c = await tarefa('limpar-pendentes');
    const { data: lembr } = await admin.from('notificacoes').select('titulo, dados').eq('profile_id', w1Id).eq('dados->>pedido_datas_id', pd0.id).eq('dados->>lembrete', 'true');
    ok('D: lembrete so uma vez, em et ("Klient ootab endiselt uusi aegu")', lembr?.length === 1 && lembr[0].titulo === 'Klient ootab endiselt uusi aegu', JSON.stringify(lembr));
    // oficina nao confirma sugestao que ja passou (sugestao gravada direto, ja vencida)
    await admin.from('orcamento_pedido_datas').update({ sugestoes: [{ data: dia(-1), turno: 'tarde' }] }).eq('id', pd0.id);
    r = await post(`/api/orcamento/${D.o1.id}/novas-datas`, w1.token, { confirmar: 0 });
    ok('D: confirmar sugestao vencida -> SUGESTAO_VENCIDA', r.status === 409 && r.d.codigo === 'SUGESTAO_VENCIDA', JSON.stringify(r));
    // o cliente recusa o orcamento direto (tela antiga): o cron derruba o pendente
    await admin.from('orcamentos').update({ status: 'recusado' }).eq('id', D.o1.id);
    c = await tarefa('limpar-pendentes');
    ok('D: orcamento recusado -> cron cancela o pendente', (await pedidoDatas(D.o1.id)).status === 'cancelado' && c.d?.novasDatas?.cancelados >= 1, JSON.stringify(c.d));
    // cancelar o pedido cancela o pendente
    await admin.from('orcamentos').update({ status: 'enviado' }).eq('id', D.o1.id);
    r = await post(`/api/orcamento/${D.o1.id}/pedir-datas`, D.cli.token, {});
    ok('D: novo pedido depois do cancelado', r.status === 200, JSON.stringify(r));
    r = await post(`/api/solicitacoes/${D.sol.id}/cancelar`, D.cli.token, {});
    ok('D: cliente cancela o pedido -> pendente cancelado', r.status === 200 && (await pedidoDatas(D.o1.id)).status === 'cancelado', JSON.stringify(r));
    // pedido expirado: expirar cancela o pendente e o cliente nao pede mais
    const X = await novoPedido(4, { idioma: 'et' });
    r = await post(`/api/orcamento/${X.o1.id}/pedir-datas`, X.cli.token, {});
    ok('D: pedido de datas no pedido 4', r.status === 200, JSON.stringify(r));
    await admin.from('solicitacoes').update({ created_at: new Date(Date.now() - 40 * 86400e3).toISOString() }).eq('id', X.sol.id);
    c = await tarefa('expirar-pedidos');
    const { data: sx } = await admin.from('solicitacoes').select('status').eq('id', X.sol.id).single();
    ok('D: pedido expirado pelo cron -> pendente cancelado', sx.status === 'expirada' && (await pedidoDatas(X.o1.id)).status === 'cancelado', JSON.stringify({ c: c.d, sx }));
    r = await post(`/api/orcamento/${X.o1.id}/pedir-datas`, X.cli.token, {});
    ok('D: pedido expirado -> PEDIDO_EXPIRADO', r.status === 409 && r.d.codigo === 'PEDIDO_EXPIRADO', JSON.stringify(r));
  }

  // ================= E) orcamento vencido =================
  const E = await novoPedido(5, { idioma: 'en', validade1: dia(-1) });
  {
    let r = await post(`/api/orcamento/${E.o1.id}/pedir-datas`, E.cli.token, {});
    ok('E: orcamento vencido -> pedir-datas ORCAMENTO_VENCIDO', r.status === 409 && r.d.codigo === 'ORCAMENTO_VENCIDO', JSON.stringify(r));
    const { data: sf } = await admin.from('orcamento_disponibilidade').insert({ orcamento_id: E.o1.id, data_checkin: dia(3), turno: 'manha', data_previsao_entrega: dia(4) }).select('id').single();
    r = await post('/api/aceitar-orcamento', E.cli.token, { orcamentoId: E.o1.id, slotId: sf.id });
    ok('E: orcamento vencido -> aceitar ORCAMENTO_VENCIDO', r.status === 409 && r.d.codigo === 'ORCAMENTO_VENCIDO', JSON.stringify(r));
    await admin.from('orcamento_disponibilidade').delete().eq('id', sf.id);
    const { data: pe } = await admin.from('orcamento_pedido_datas').insert({ orcamento_id: E.o1.id, solicitacao_id: E.sol.id, oficina_id: of1.id, cliente_id: E.cId, sugestoes: [{ data: dia(3), turno: 'manha' }] }).select('id').single();
    r = await post(`/api/orcamento/${E.o1.id}/novas-datas`, w1.token, { horarios: [{ data: dia(5), turno: 'manha' }] });
    ok('E: oficina manda datas em orcamento vencido -> ORCAMENTO_VENCIDO', r.status === 409 && r.d.codigo === 'ORCAMENTO_VENCIDO', JSON.stringify(r));
    // validade de hoje ainda vale (o dia inteiro)
    await admin.from('orcamentos').update({ validade: dia(0) }).eq('id', E.o2.id);
    r = await post('/api/aceitar-orcamento', E.cli.token, { orcamentoId: E.o2.id, slotId: E.s2.id });
    ok('E: validade = hoje ainda aceita (o outro orcamento)', r.status === 200, JSON.stringify(r));
    // volta o estado para a tela (outro orcamento ativo para o link)
    await admin.from('agenda').delete().eq('solicitacao_id', E.sol.id);
    await admin.from('orcamentos').update({ status: 'enviado', disponibilidade_escolhida_id: null, recusado_no_aceite: false }).eq('solicitacao_id', E.sol.id);
    await admin.from('orcamentos').update({ status: 'enviado' }).eq('id', E.o1.id);
    await admin.from('solicitacoes').update({ status: 'em_orcamento' }).eq('id', E.sol.id);
    await admin.from('orcamento_pedido_datas').update({ status: 'cancelado' }).eq('id', pe.id);
    for (const lg of ['en', 'et', 'ru']) {
      const TW = msgWeb(lg);
      const ctx = await contexto(390, { locale: lg === 'en' ? 'en-GB' : lg === 'ru' ? 'ru-RU' : 'et-EE' });
      const p = await entrarSite(ctx, E.cEmail, senha, `/ee/${lg}`);
      await p.goto(`${SITE}/ee/${lg}/cliente/orcamentos/${E.sol.id}`, { waitUntil: 'networkidle' });
      const tem = await esperarTeste(p, 'orcamento-vencido');
      const tv = tem ? await p.getByTestId('orcamento-vencido').innerText() : '';
      ok(`E(${lg}): orcamento vencido -> mensagem "${TW('novasDatas.vencidoTitulo', { data: '' }).trim()}" com links`, tem && tv.includes(TW('novasDatas.vencidoTexto')) && (await p.getByTestId('vencido-outro').count()) === 1 && (await p.getByTestId('vencido-novo-pedido').count()) === 1, tv);
      const orcE = p.locator(`#orc-${E.o1.id}`);
      ok(`E(${lg}): sem pedir datas nem aceitar no vencido`, (await orcE.getByTestId('pedir-novas-datas').count()) === 0 && !(await orcE.innerText()).includes(TW('clienteOrcamentoDetalhe.acceptAndSchedule')));
      if (lg !== 'en') await design(p, `E(${lg}): orcamento vencido no site (390)`);
      if (lg === 'en') {
        await p.getByTestId('vencido-outro').click(); await sleep(800);
        ok('E: link "ver outro orcamento ativo" leva ao cartao dele', (await p.evaluate(() => location.hash)) === `#orc-${E.o2.id}`);
        await p.screenshot({ path: path.join(OUT, 'cliente_vencido_en_390.png'), fullPage: true });
      }
      await ctx.close();
    }
    // oficina: cartao nao aparece em orcamento vencido (mesmo com pedido gravado)
    await admin.from('orcamento_pedido_datas').insert({ orcamento_id: E.o1.id, solicitacao_id: E.sol.id, oficina_id: of1.id, cliente_id: E.cId, sugestoes: [] });
    const ctx = await contexto(1280);
    const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA, '/ee/et');
    await p.goto(`${SITE}/ee/et/oficina/pedidos/${E.sol.id}`, { waitUntil: 'networkidle' }); await sleep(3000);
    ok('E: oficina nao ve o cartao de novas datas em orcamento vencido', (await p.getByTestId('novas-datas-pedidas').count()) === 0);
    await ctx.close();
    const c = await tarefa('limpar-pendentes');
    ok('E: cron cancela o pendente de orcamento vencido', (await pedidoDatas(E.o1.id)).status === 'cancelado', JSON.stringify(c.d));
  }

  // ================= G) revisao Fable =================
  {
    // M1: a oficina revisa o orcamento (gatilho no banco) -> pendente cancelado
    const G = await novoPedido(8, { idioma: 'et' });
    let r = await post(`/api/orcamento/${G.o1.id}/pedir-datas`, G.cli.token, { sugestoes: [{ data: dia(3), turno: 'manha' }] });
    const g0 = await pedidoDatas(G.o1.id);
    ok('G: pedido grava o retrato do orcamento (valor e revisao)', r.status === 200 && Number(g0.valor_total_pedido) === 150 && g0.revisao_numero_pedido === 0, JSON.stringify(g0));
    await w1.c.from('orcamentos').update({ revisao_numero: 1, valor_total: 170, revisado_em: new Date().toISOString() }).eq('id', G.o1.id);
    ok('G: oficina revisa o orcamento (pela chave dela) -> pedido de datas cancelado pelo gatilho', (await pedidoDatas(G.o1.id)).status === 'cancelado', JSON.stringify(await pedidoDatas(G.o1.id)));
    r = await post(`/api/orcamento/${G.o1.id}/novas-datas`, w1.token, { confirmar: 0 });
    ok('G: responder pedido cancelado -> ORCAMENTO_INDISPONIVEL (nao "ja respondido")', r.status === 409 && r.d.codigo === 'ORCAMENTO_INDISPONIVEL', JSON.stringify(r));
    // retrato diferente (orcamento mudou sem o gatilho, ex.: dado antigo) -> ORCAMENTO_MUDOU
    r = await post(`/api/orcamento/${G.o1.id}/pedir-datas`, G.cli.token, { sugestoes: [{ data: dia(3), turno: 'manha' }] });
    await admin.from('orcamento_pedido_datas').update({ valor_total_pedido: 150 }).eq('orcamento_id', G.o1.id).eq('status', 'pendente');
    r = await post(`/api/orcamento/${G.o1.id}/novas-datas`, w1.token, { confirmar: 0 });
    ok('G: confirmar com o orcamento diferente do que o cliente viu -> ORCAMENTO_MUDOU', r.status === 409 && r.d.codigo === 'ORCAMENTO_MUDOU', JSON.stringify(r));
    ok('G: depois de ORCAMENTO_MUDOU o pedido continua pendente (a oficina pode mandar outras datas)', (await pedidoDatas(G.o1.id)).status === 'pendente');
    // o orcamento ganhou datas futuras por outro caminho -> cron cancela
    await admin.from('orcamento_disponibilidade').insert({ orcamento_id: G.o1.id, data_checkin: dia(5), turno: 'manha', data_previsao_entrega: dia(6) });
    await post('/api/tarefas/limpar-pendentes', null, {}, { 'x-tarefa-chave': env.TAREFAS_CHAVE });
    ok('G: orcamento com data futura de novo -> cron cancela o pendente', (await pedidoDatas(G.o1.id)).status === 'cancelado');

    // S2: turno comecando em menos de 2 h (ou ja comecado) -> SUGESTAO_VENCIDA
    const hT = Number(new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', hourCycle: 'h23' }));
    if (hT >= 6) {
      const G2 = await novoPedido(9, { idioma: 'et' });
      const turnoHoje = hT < 11 ? 'manha' : 'tarde';
      await admin.from('orcamento_pedido_datas').insert({ orcamento_id: G2.o1.id, solicitacao_id: G2.sol.id, oficina_id: of1.id, cliente_id: G2.cId, sugestoes: [{ data: dia(0), turno: turnoHoje }], valor_total_pedido: 150, revisao_numero_pedido: 0 });
      r = await post(`/api/orcamento/${G2.o1.id}/novas-datas`, w1.token, { confirmar: 0 });
      ok(`G: confirmar hoje (${turnoHoje}) com menos de 2 h -> SUGESTAO_VENCIDA`, r.status === 409 && r.d.codigo === 'SUGESTAO_VENCIDA', JSON.stringify(r));
    } else console.log('   (G: teste das 2 h pulado antes das 06:00 de Tallinn)');

    // M2: corrida - a oficina confirma a sugestao enquanto o cliente aceita o outro orcamento
    for (let i = 0; i < 2; i++) {
      const H = await novoPedido(10 + i, { idioma: 'et' });
      r = await post(`/api/orcamento/${H.o1.id}/pedir-datas`, H.cli.token, { sugestoes: [{ data: dia(3), turno: 'tarde' }] });
      const [ra, rb] = await Promise.all([
        post(`/api/orcamento/${H.o1.id}/novas-datas`, w1.token, { confirmar: 0 }),
        post('/api/aceitar-orcamento', H.cli.token, { orcamentoId: H.o2.id, slotId: H.s2.id }),
      ]);
      const { data: aceitos } = await admin.from('orcamentos').select('id').eq('solicitacao_id', H.sol.id).eq('status', 'aceito');
      const { data: ags } = await admin.from('agenda').select('id').eq('solicitacao_id', H.sol.id).eq('status', 'agendado');
      ok(`G: corrida ${i + 1} confirmar x aceitar -> um aceito e uma agenda`, aceitos?.length === 1 && ags?.length === 1 && [ra.status, rb.status].filter((x) => x === 200).length === 1, JSON.stringify({ ra, rb, aceitos, ags }));
      const pd = await pedidoDatas(H.o1.id);
      const ganhouOficina = ra.status === 200;
      ok(`G: corrida ${i + 1} -> pedido de datas coerente (${ganhouOficina ? 'atendido' : 'cancelado'})`, pd.status === (ganhouOficina ? 'atendido' : 'cancelado'), JSON.stringify(pd));
      const { data: sobras } = await admin.from('orcamento_disponibilidade').select('id').eq('orcamento_id', H.o1.id).eq('origem', 'cliente');
      ok(`G: corrida ${i + 1} -> sem horario do cliente sobrando quando a oficina perdeu`, ganhouOficina ? sobras?.length === 1 : !sobras?.length, JSON.stringify(sobras));
    }

    // S3/S4: cliente pede a duas oficinas; a oficina 1 confirma -> a 2 e avisada e nao responde mais
    const I = await novoPedido(12, { idioma: 'et', o2Passado: true });
    r = await post(`/api/orcamento/${I.o1.id}/pedir-datas`, I.cli.token, { sugestoes: [{ data: dia(3), turno: 'manha' }] });
    const r2 = await post(`/api/orcamento/${I.o2.id}/pedir-datas`, I.cli.token, { sugestoes: [{ data: dia(4), turno: 'manha' }] });
    ok('G: um pedido por orcamento, a duas oficinas', r.status === 200 && r2.status === 200, JSON.stringify({ r, r2 }));
    r = await post(`/api/orcamento/${I.o1.id}/novas-datas`, w1.token, { confirmar: 0 });
    ok('G: oficina 1 confirma', r.status === 200, JSON.stringify(r));
    const { data: av } = await admin.from('notificacoes').select('titulo, mensagem').eq('profile_id', w2Id).eq('tipo', 'pedido_novas_datas_cancelado');
    ok('G: oficina 2 avisada em ru ("Запрос новых дат закрыт")', av?.length === 1 && av[0].titulo === 'Запрос новых дат закрыт', JSON.stringify(av));
    ok('G: oficina 1 (a que confirmou) nao recebe esse aviso', !((await admin.from('notificacoes').select('id').eq('profile_id', w1Id).eq('tipo', 'pedido_novas_datas_cancelado').eq('dados->>solicitacao_id', I.sol.id)).data || []).length);
    r = await post(`/api/orcamento/${I.o2.id}/novas-datas`, w2.token, { horarios: [{ data: dia(5), turno: 'manha' }] });
    ok('G: oficina 2 tenta responder -> ORCAMENTO_INDISPONIVEL', r.status === 409 && r.d.codigo === 'ORCAMENTO_INDISPONIVEL', JSON.stringify(r));
    // RU sem genero: "Автосервис «...» подтвердил"
    const { data: nI } = await admin.from('notificacoes').select('dados').eq('profile_id', I.cId).eq('tipo', 'novas_datas_confirmada').single();
    ok('G: texto ru com "Автосервис «oficina»" (concordancia)', (nI?.dados?.textos?.ru?.mensagem || '').startsWith(`Автосервис «${of1.nome_fantasia}» подтвердил`), nI?.dados?.textos?.ru?.mensagem);
  }

  // ================= H) auditoria Fable =================
  {
    // duas oficinas confirmam ao mesmo tempo -> um aceito so, uma agenda, o perdedor cancelado e sem horario sobrando
    for (let i = 0; i < 2; i++) {
      const J = await novoPedido(20 + i, { idioma: 'et', o2Passado: true });
      await post(`/api/orcamento/${J.o1.id}/pedir-datas`, J.cli.token, { sugestoes: [{ data: dia(3), turno: 'manha' }] });
      await post(`/api/orcamento/${J.o2.id}/pedir-datas`, J.cli.token, { sugestoes: [{ data: dia(4), turno: 'tarde' }] });
      const [ra, rb] = await Promise.all([
        post(`/api/orcamento/${J.o1.id}/novas-datas`, w1.token, { confirmar: 0 }),
        post(`/api/orcamento/${J.o2.id}/novas-datas`, w2.token, { confirmar: 0 }),
      ]);
      const { data: aceitos } = await admin.from('orcamentos').select('id').eq('solicitacao_id', J.sol.id).eq('status', 'aceito');
      const { data: ags } = await admin.from('agenda').select('id').eq('solicitacao_id', J.sol.id).eq('status', 'agendado');
      ok(`H: A x B confirmam juntas (${i + 1}) -> um 200, um aceito, uma agenda`, [ra.status, rb.status].filter((x) => x === 200).length === 1 && aceitos?.length === 1 && ags?.length === 1, JSON.stringify({ ra, rb, aceitos, ags }));
      const perdeu = ra.status === 200 ? J.o2.id : J.o1.id;
      const rPerdeu = ra.status === 200 ? rb : ra;
      const { data: sobra } = await admin.from('orcamento_disponibilidade').select('id').eq('orcamento_id', perdeu).eq('origem', 'cliente');
      ok(`H: A x B (${i + 1}) -> perdedor com ORCAMENTO_INDISPONIVEL, pedido cancelado, sem horario do cliente`, rPerdeu.status === 409 && rPerdeu.d.codigo === 'ORCAMENTO_INDISPONIVEL' && (await pedidoDatas(perdeu)).status === 'cancelado' && !sobra?.length, JSON.stringify({ rPerdeu, sobra }));
    }

    // funcionario gerente responde; mecanico nao ve o cartao
    const gerEmail = `nd-ger-${tag}@example.test`;
    const gerId = await conta(gerEmail, senha, { tipo: 'oficina', nome: 'Gerente', idioma: 'et' });
    const { data: fGer } = await admin.from('funcionarios').insert({ oficina_id: of1.id, profile_id: gerId, nome: 'Gerente', cargo: 'gerente', ativo: true }).select('id').single();
    if (fGer) funcs.add(fGer.id);
    const ger = await sessao(gerEmail, senha);
    const K = await novoPedido(22, { idioma: 'et' });
    await post(`/api/orcamento/${K.o1.id}/pedir-datas`, K.cli.token, {});
    {
      const ctx = await contexto(390);
      const p = await entrarSite(ctx, mecEmail, senha, '/ee/et');
      await p.goto(`${SITE}/ee/et/oficina/pedidos/${K.sol.id}`, { waitUntil: 'networkidle' }); await sleep(3000);
      ok('H: mecanico nao ve o cartao de novas datas', (await p.getByTestId('novas-datas-pedidas').count()) === 0);
      await ctx.close();
    }
    let r = await post(`/api/orcamento/${K.o1.id}/novas-datas`, ger.token, { horarios: [{ data: dia(5), turno: 'manha' }] });
    ok('H: funcionario gerente manda datas -> 200', r.status === 200 && r.d.modo === 'novas_datas', JSON.stringify(r));

    // pedido em no_show (o orcamento volta a enviado com as datas velhas): fluxo completo
    const N = await novoPedido(23, { idioma: 'et' });
    await admin.from('solicitacoes').update({ status: 'no_show' }).eq('id', N.sol.id);
    await admin.from('orcamentos').update({ status: 'recusado' }).eq('id', N.o2.id);
    r = await post(`/api/orcamento/${N.o1.id}/pedir-datas`, N.cli.token, { sugestoes: [{ data: dia(2), turno: 'tarde' }] });
    ok('H: no_show -> cliente pede novas datas', r.status === 200, JSON.stringify(r));
    r = await post(`/api/orcamento/${N.o1.id}/novas-datas`, w1.token, { horarios: [{ data: dia(5), turno: 'tarde' }] });
    const { data: slN } = await admin.from('orcamento_disponibilidade').select('id').eq('orcamento_id', N.o1.id).eq('data_checkin', dia(5)).single();
    const ra = await post('/api/aceitar-orcamento', N.cli.token, { orcamentoId: N.o1.id, slotId: slN?.id });
    ok('H: no_show -> oficina manda datas e o cliente aceita (agenda criada)', r.status === 200 && ra.status === 200 && ((await admin.from('agenda').select('id').eq('solicitacao_id', N.sol.id).eq('status', 'agendado')).data || []).length === 1, JSON.stringify({ r, ra }));

    // limite: 10/h por cliente no pedir-datas, 30/h por pessoa da oficina no novas-datas
    const L = await novoPedido(24, { idioma: 'et' });
    const sts = [];
    for (let i = 0; i < 11; i++) sts.push((await post(`/api/orcamento/${L.o2.id}/pedir-datas`, L.cli.token, {})).status);
    ok('H: 11 pedidos do cliente na hora -> o 11o e 429', sts.slice(0, 10).every((x) => x !== 429) && sts[10] === 429, JSON.stringify(sts));
    const sto = [];
    for (let i = 0; i < 31; i++) sto.push((await post(`/api/orcamento/${L.o2.id}/novas-datas`, ger.token, { confirmar: 0 })).status);
    ok('H: 31 respostas da mesma pessoa da oficina na hora -> a 31a e 429', sto.filter((x) => x === 429).length >= 1 && sto[30] === 429, JSON.stringify(sto.slice(-3)));
  }

  // ================= F) ET/RU no site (cliente pedindo) e no app web =================
  for (const lg of ['et', 'ru']) {
    const F = await novoPedido(lg === 'et' ? 6 : 7, { idioma: lg });
    const ctx = await contexto(390, { locale: lg === 'ru' ? 'ru-RU' : 'et-EE' });
    const p = await entrarSite(ctx, F.cEmail, senha, `/ee/${lg}`);
    await p.goto(`${SITE}/ee/${lg}/cliente/orcamentos/${F.sol.id}`, { waitUntil: 'networkidle' });
    await esperarTeste(p, 'pedir-novas-datas');
    await p.getByTestId('abrir-pedir-datas').click(); await sleep(400);
    await design(p, `F(${lg}): cliente pedindo novas datas no site (390)`);
    await p.screenshot({ path: path.join(OUT, `cliente_pedir_${lg}_390.png`), fullPage: true });
    await ctx.close();
    // app web
    const TA = msgApp(lg);
    let appOk = false;
    try { appOk = (await fetch(APP, { signal: AbortSignal.timeout(4000) })).ok; } catch { /* sem app */ }
    if (!appOk) { ok(`F(${lg}) app: app web em ${APP} no ar`, false, 'compile o app e rode servir-app-web.mjs'); continue; }
    // ru: aparelho em outro fuso (Sao Paulo) - a grade continua no fuso da oficina (Tallinn)
    const cA = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: lg === 'ru' ? 'ru-RU' : 'et-EE', ...(lg === 'ru' ? { timezoneId: 'America/Sao_Paulo' } : {}) });
    const pa = await cA.newPage();
    const errApp = []; pa.on('pageerror', (e) => errApp.push(e.message));
    await pa.goto(APP, { waitUntil: 'networkidle' }); await sleep(1500);
    await pa.getByLabel(TA('auth.email'), { exact: true }).locator('visible=true').first().fill(F.cEmail);
    await pa.getByLabel(TA('auth.senha'), { exact: true }).locator('visible=true').first().fill(senha);
    await pa.getByText(TA('auth.entrar'), { exact: true }).locator('visible=true').last().click(); await sleep(4500);
    await pa.goto(`${APP}/solicitacao/${F.sol.id}`, { waitUntil: 'networkidle' });
    const tem = await esperarTeste(pa, 'pedir-novas-datas', 20000);
    ok(`F(${lg}) app: cartao "${TA('novasDatas.titulo')}"`, tem && (await pa.getByTestId('pedir-novas-datas').innerText()).includes(TA('novasDatas.titulo')));
    await pa.getByTestId('abrir-pedir-datas').click(); await sleep(500);
    {
      const idsApp = await pa.locator('[data-testid^="chip-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
      let primeiro = 1; while (new Date(`${dia(primeiro)}T12:00:00Z`).getUTCDay() === 0) primeiro++;
      ok(`F(${lg}) app: grade no fuso da oficina (comeca amanha em Tallinn${lg === 'ru' ? ', aparelho em Sao Paulo' : ''})`, idsApp.length > 0 && idsApp[0].slice(5, 15) === dia(primeiro) && idsApp.every((id) => id.slice(5, 15) > hojeTallinn()), JSON.stringify(idsApp.slice(0, 3)));
    }
    await pa.locator('[data-testid^="chip-"]').nth(1).click();
    await pa.getByTestId('mensagem-datas').fill(`app ${lg} ${tag}`);
    const tApp = await pa.innerText('body');
    const crua = tApp.match(/\bnovasDatas\.[a-zA-Z]+|erros\.[A-Z_]+/);
    ok(`F(${lg}) app: sem chave crua`, !crua, crua?.[0]);
    const larg = await pa.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(`F(${lg}) app: sem rolagem lateral`, larg <= 1, String(larg));
    await pa.screenshot({ path: path.join(OUT, `app_pedir_${lg}_390.png`), fullPage: true });
    await pa.getByTestId('enviar-pedir-datas').click();
    const pend = await esperarTeste(pa, 'novas-datas-pendente', 15000);
    const pd = await pedidoDatas(F.o1.id);
    ok(`F(${lg}) app: enviar pelo app -> pendente na tela e no banco (1 sugestao, mensagem)`, pend && pd?.status === 'pendente' && pd.sugestoes.length === 1 && pd.mensagem === `app ${lg} ${tag}`, JSON.stringify(pd));
    // orcamento vencido no app
    await admin.from('orcamentos').update({ validade: dia(-1) }).eq('id', F.o1.id);
    await pa.reload({ waitUntil: 'networkidle' });
    const venc = await esperarTeste(pa, 'orcamento-vencido', 20000);
    ok(`F(${lg}) app: orcamento vencido -> mensagem e sem pedir datas`, venc && (await pa.getByTestId('orcamento-vencido').innerText()).includes(TA('novasDatas.vencidoTexto')) && (await pa.getByTestId('pedir-novas-datas').count()) === 0 && (await pa.getByTestId('vencido-outro').count()) === 1);
    ok(`F(${lg}) app: sem erro de JS`, !errApp.length, errApp[0]);
    await cA.close();
  }
  ok('site: sem erro de JS nas paginas', !errosJs.length, errosJs[0]);
} catch (e) {
  falhas++;
  console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  for (const id of sols) {
    const { data: ags } = await admin.from('agenda').select('id').eq('solicitacao_id', id);
    for (const a of ags || []) { await admin.from('agenda_historico').delete().eq('agenda_id', a.id); await admin.from('manutencao_etapas').delete().eq('agenda_id', a.id); }
    await admin.from('orcamentos').update({ disponibilidade_escolhida_id: null }).eq('solicitacao_id', id);
    for (const t of ['orcamento_pedido_datas', 'orcamento_revisoes', 'agenda', 'mensagens', 'orcamentos']) await admin.from(t).delete().eq('solicitacao_id', id);
    await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', id);
    await admin.from('solicitacoes').delete().eq('id', id);
  }
  for (const id of funcs) await admin.from('funcionarios').delete().eq('id', id);
  for (const id of oficinasCriadas) await admin.from('oficinas').delete().eq('id', id);
  for (const id of contas) { await admin.from('veiculos').delete().eq('profile_id', id); await admin.from('notificacoes').delete().eq('profile_id', id); await admin.from('profiles').delete().eq('id', id); await admin.auth.admin.deleteUser(id).catch(() => {}); }
  console.log(`${oks} ok, ${falhas} falha(s)`);
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
