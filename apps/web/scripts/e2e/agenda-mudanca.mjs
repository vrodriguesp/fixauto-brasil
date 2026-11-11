// E2E LOCAL de mudar data / cancelar agendamento antes do check-in (dono 07/11, migracao 076):
//  1) pelo ORCAMENTO: a oficina propoe nova data com justificativa (tela) -> o cliente
//     mantem a data (tela; nada muda, servico continua) ou aceita (tela; agenda muda,
//     e-mail "horario alterado" com o mesmo evento .ics, SEQUENCE maior);
//  2) pela AGENDA da oficina: "Mudar data" (tela; e-mail com o motivo, chat, aviso) e
//     "Cancelar agendamento" (tela; e-mail com motivo + .ics METHOD:CANCEL, pedido aberto
//     de novo e o orcamento da outra oficina volta);
//  3) regras: so antes do check-in, so a oficina do pedido, mecanico nao, justificativa
//     obrigatoria, data no passado nao;
//  4) observacao "remarcar/cancelar pelo chat" no e-mail e no pedido (site e app); data do
//     pedido lida da agenda; identidade visual nos e-mails (logo, rodape).
//   node agenda-mudanca.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100'; // site em outra porta: SITE=http://localhost:3101
// o app web chama a API pelo IP da rede com que foi compilado: abrir pelo mesmo endereco (senao o navegador bloqueia)
const APP = `http://${process.env.HOST_LAN || 'localhost'}:8090`;
const EMAILS = env.EMAIL_PASTA_TESTE;
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/agenda-mudanca`;
fs.mkdirSync(OUT, { recursive: true });
const WEBMSG = `${RAIZ}/site/apps/web/messages`;
const MOB = `${RAIZ}/site/apps/mobile/i18n/locales`;
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
const senha = 'Agen-' + crypto.randomBytes(6).toString('hex');
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const contas = new Set(); const sols = new Set(); const oficinasCriadas = new Set(); const funcs = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => `10.55.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
const emailsDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort().map((f) => ({ f, html: fs.readFileSync(path.join(EMAILS, f), 'utf8') }));
const icsDe = (htmlArq) => { const a = path.join(EMAILS, htmlArq.replace(/\.html$/, '') + '__bipfix-agendamento.ics'); return fs.existsSync(a) ? fs.readFileSync(a, 'utf8') : null; };
const esperarEmail = async (email, depois, filtro = () => true) => { for (let i = 0; i < 40; i++) { const e = emailsDe(email, depois).filter(filtro).at(-1); if (e) return e; await sleep(300); } return null; };
const icsData = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dia = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
// hora local de Tallinn (EET/EEST) -> UTC
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
const post = async (rota, token, corpo) => { const r = await fetch(`${SITE}${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'x-real-ip': ip() }, body: JSON.stringify(corpo) }); return { status: r.status, d: await r.json().catch(() => ({})) }; };
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const contexto = async (largura, extra = {}) => {
  const c = await browser.newContext({ viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500,
    locale: 'et-EE', extraHTTPHeaders: { 'x-real-ip': ip() }, ...extra });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const design = async (page, nome) => {
  const t = await page.innerText('body');
  const crua = t.match(/\b(agendaMudanca|revisaoOrcamento|clienteOrcamentoDetalhe|oficinaAgenda|oficinaEnviarOrcamento|erros|constants)\.[a-zA-Z_]+/);
  ok(`${nome}: sem chave sem traducao`, !crua, crua?.[0]);
  const r = await page.evaluate(() => {
    const sw = document.documentElement.scrollWidth - innerWidth;
    const fora = [...document.querySelectorAll('main button, main a, main input, main select, main textarea')].filter((e) => e.offsetParent)
      .map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && (b.left < -1 || b.right > innerWidth + 1)).length;
    return { sw, fora };
  });
  ok(`${nome}: sem rolagem lateral nem elemento cortado`, r.sw <= 1 && r.fora === 0, JSON.stringify(r));
  return t;
};
const entrarSite = async (ctx, email, s, rot = '/ee/et') => {
  const p = await ctx.newPage();
  await p.goto(`${SITE}${rot}/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', s);
  await p.click('button[type=submit]'); await p.waitForTimeout(4000);
  return p;
};

const INICIO = Date.now();
try {
  const T = msgWeb('et'); const TE = msgWeb('en');
  const w1 = await sessao(W1_EMAIL, W1_SENHA);
  const w1Id = (await admin.from('profiles').select('id').eq('email', W1_EMAIL).single()).data.id;
  await admin.from('profiles').update({ idioma: 'et' }).eq('id', w1Id); // conta compartilhada: um teste manual pode ter trocado o idioma
  const { data: of1 } = await admin.from('oficinas').select('id, nome_fantasia').eq('profile_id', w1Id).single();
  const w2Email = `agen-of2-${tag}@example.test`;
  const w2Id = await conta(w2Email, senha, { tipo: 'oficina', nome: 'Oficina Dois', idioma: 'et', telefone: '+372 5000 3333' });
  const { data: of2 } = await admin.from('oficinas').insert({ profile_id: w2Id, nome_fantasia: `Teine Töökoda ${tag}`, endereco: 'Pärnu mnt 20', cidade: 'Tallinn', estado: 'Harjumaa', cep: '10141', pais: 'EE', latitude: 59.43, longitude: 24.745, raio_atendimento_km: 30, especialidades: ['mecanica', 'eletrica', 'pneu', 'manutencao'], ativa: true }).select('id').single();
  oficinasCriadas.add(of2.id);
  const w2 = await sessao(w2Email, senha);
  // mecanico da oficina 1 (nao pode mudar/cancelar)
  const mecEmail = `agen-mec-${tag}@example.test`;
  const mecId = await conta(mecEmail, senha, { tipo: 'oficina', nome: 'Mecanico', idioma: 'et' });
  const { data: fMec } = await admin.from('funcionarios').insert({ oficina_id: of1.id, profile_id: mecId, nome: 'Mecanico', cargo: 'mecanico', ativo: true }).select('id').single();
  if (fMec) funcs.add(fMec.id);
  const mec = await sessao(mecEmail, senha);

  // pedido com dois orcamentos; cliente (en) aceita o da oficina 1
  const novoPedido = async (n, opc = {}) => {
    const cEmail = `agen-cli${n}-${tag}@example.test`;
    const cId = await conta(cEmail, senha, { tipo: 'cliente', nome: `Cliente ${n}`, telefone: '+372 5999 000' + n, idioma: 'en' });
    const { data: v } = await admin.from('veiculos').insert({ profile_id: cId, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018', placa: `AG${n}${tag.slice(0, 3).toUpperCase()}` }).select('id').single();
    const { data: sol } = await admin.from('solicitacoes').insert({ cliente_id: cId, veiculo_id: v.id, tipo: 'mecanica', descricao: `Agenda test ${n}`, urgencia: 'media', endereco: 'Pärnu mnt 10, Tallinn', latitude: 59.433, longitude: 24.746, status: 'aberta' }).select('id, numero').single();
    sols.add(sol.id);
    const o1 = (await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of1.id, valor_total: 150, prazo_dias: 1, status: 'enviado', validade: dia(10) }).select('id').single()).data;
    await admin.from('orcamento_itens').insert({ orcamento_id: o1.id, descricao: 'Remont', tipo: 'mao_de_obra', valor_unitario: 150, quantidade: 1, valor_total: 150 });
    const s1 = (await admin.from('orcamento_disponibilidade').insert({ orcamento_id: o1.id, data_checkin: dia(3), turno: 'manha', data_previsao_entrega: dia(4) }).select('id').single()).data;
    const o2 = (await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of2.id, valor_total: 180, prazo_dias: 2, status: 'enviado', validade: dia(10) }).select('id').single()).data;
    await admin.from('orcamento_disponibilidade').insert({ orcamento_id: o2.id, data_checkin: dia(4), turno: 'manha', data_previsao_entrega: dia(5) });
    const cli = await sessao(cEmail, senha);
    if (opc.clienteRecusaO2) await admin.from('orcamentos').update({ status: 'recusado' }).eq('id', o2.id); // o cliente recusou antes de aceitar o outro
    const ra = await post('/api/aceitar-orcamento', cli.token, { orcamentoId: o1.id, slotId: s1.id });
    if (ra.status !== 200) throw new Error('aceite ' + ra.status);
    const { data: ag } = await admin.from('agenda').select('id, data_inicio').eq('solicitacao_id', sol.id).eq('oficina_id', of1.id).single();
    return { cEmail, cId, cli, sol, o1, o2, ag };
  };
  const P = await novoPedido(1);

  // ---------- e-mail do aceite: observacao + identidade ----------
  {
    const e0 = await esperarEmail(P.cEmail, 0, (e) => /Booking confirmed/.test(e.html));
    const h = e0?.html || '';
    ok('4: e-mail do aceite com "To reschedule or cancel..." e botao do chat (/r/<numero>?c=1)', h.includes('To reschedule or cancel, write to the repair shop') && h.includes(`/r/${P.sol.numero}?c=1`) && h.includes('Message the repair shop'));
    ok('4: e-mail com a identidade (logo branco no topo azul, rodape da empresa)', h.includes('/email/logo-branco.png') && h.includes('#1d4ed8') && h.includes('RPyrus OÜ') && h.includes('Registrikood 17628754') && !/<h1[^>]*>BipFix<\/h1>/.test(h));
    const rc = await fetch(`${SITE}/r/${P.sol.numero}?c=1`, { redirect: 'manual' });
    ok('4: /r/<numero>?c=1 leva ao chat com a oficina escolhida', rc.status === 302 && (rc.headers.get('location') || '').includes(`/cliente/mensagens/${P.sol.id}?oficina=${of1.id}`), rc.headers.get('location'));
    const logo = await fetch(`${SITE}/email/logo-branco.png`);
    ok('4: logo do e-mail publicado', logo.status === 200 && (logo.headers.get('content-type') || '').includes('png'));
    // outros e-mails ja existentes tambem com a identidade (codigo do pedido sem conta, por exemplo)
    const outro = fs.readdirSync(EMAILS).filter((f) => f.endsWith('.html') && Number(f.split('_')[0]) >= INICIO).map((f) => fs.readFileSync(path.join(EMAILS, f), 'utf8'));
    ok('4: todos os e-mails desta rodada com logo e rodape (nenhum com o topo antigo)', outro.length > 0 && outro.every((x) => x.includes('data-bipfix-marca') && !/<h1 style="margin: ?0; ?font-size: ?24px;">BipFix<\/h1>/.test(x)), `${outro.length} e-mails`);
    fs.writeFileSync(path.join(OUT, 'email_aceite.html'), h.replace(/^<!--[^>]*-->\n/, ''));
  }

  // ---------- 1) proposta de nova data pela tela do orcamento (oficina, celular) ----------
  {
    const ctx = await contexto(390);
    const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA);
    await p.goto(`${SITE}/ee/et/oficina/orcamento/${P.sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    // 07/11: primeiro a escolha "o que mudar" (data ou itens/valor), uma coisa por vez
    ok('1: revisao do aceito comeca pela escolha (data / itens e valor)', (await p.getByTestId('escolha-mudanca').count()) === 1 && (await p.getByTestId('propor-nova-data').count()) === 0 && (await p.locator('#motivo-revisao').count()) === 0);
    await p.getByTestId('opcao-mudar-data').click(); await p.waitForTimeout(1500);
    ok('1: escolhida a data, o formulario de valor nao aparece', (await p.locator('#motivo-revisao').count()) === 0);
    const caixa = p.getByTestId('propor-nova-data');
    ok('1: orcamento aceito mostra "Muuda auto toomise aega" com a data atual', (await caixa.count()) === 1 && (await caixa.innerText()).includes(T('agendaMudanca.propostaTitulo')));
    await design(p, '1: tela do orcamento com a proposta (oficina, celular)');
    await p.locator('#nd-data').fill(dia(6));
    await p.locator('#nd-turno').selectOption('tarde');
    await p.locator('#nd-previsao').fill(dia(7));
    await p.locator('#nd-motivo').fill('abc');
    // 077: primeiro a oficina diz se a data marcada ainda serve
    await p.getByTestId('propor-nova-data').getByRole('button', { name: T('agendaMudanca.enviarProposta') }).click(); await p.waitForTimeout(800);
    ok('1/077: sem dizer se a data atual serve, a tela pede a escolha', (await p.innerText('body')).includes(T('agendaMudanca.escolhaServe')));
    ok('1/077: pergunta "ainda serve?" e "ja combinei" na proposta', (await p.getByTestId('serve-sim').count()) === 1 && (await p.getByTestId('ja-combinei').count()) === 1);
    await p.getByTestId('serve-sim').check();
    await p.getByTestId('propor-nova-data').getByRole('button', { name: T('agendaMudanca.enviarProposta') }).click(); await p.waitForTimeout(800);
    ok('1: justificativa curta e recusada na tela', (await p.innerText('body')).includes(T('agendaMudanca.motivoCurto')));
    await p.locator('#nd-motivo').fill('Varuosa saabub alles neljapäeval');
    await p.getByTestId('propor-nova-data').getByRole('button', { name: T('agendaMudanca.enviarProposta') }).click(); await p.waitForTimeout(2500);
    ok('1: proposta enviada -> "pedido enviado ao cliente" (sem formulario de valor aberto)', (await p.innerText('body')).includes(T('agendaMudanca.propostaPendente', { quando: '' }).split('(')[0].trim()) && (await p.locator('#motivo-revisao').count()) === 0);
    await caixa.screenshot({ path: path.join(OUT, 'oficina_proposta_390.png') }).catch(() => {});
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    ok('1: pagina mostra "proposta enviada, aguardando o cliente"', (await p.innerText('body')).includes(T('agendaMudanca.propostaPendente', { quando: '' }).split('(')[0].trim()));
    await ctx.close();
  }
  const { data: rev1 } = await admin.from('orcamento_revisoes').select('id, tipo, status, nova_data_checkin, novo_turno, nova_previsao_entrega, valor_novo, valor_anterior').eq('solicitacao_id', P.sol.id).eq('status', 'pendente').single();
  ok('1: proposta gravada (tipo data, valor igual, data/turno/previsao)', rev1?.tipo === 'data' && rev1.nova_data_checkin === dia(6) && rev1.novo_turno === 'tarde' && rev1.nova_previsao_entrega === dia(7) && Number(rev1.valor_novo) === Number(rev1.valor_anterior), JSON.stringify(rev1));
  const { data: nProp } = await admin.from('notificacoes').select('titulo, mensagem').eq('profile_id', P.cId).eq('tipo', 'revisao_orcamento');
  ok('1: cliente avisado em ingles ("New date proposed")', (nProp || []).some((n) => n.titulo === 'New date proposed' && /Varuosa saabub/.test(n.mensagem)), JSON.stringify(nProp));
  const { data: chat1 } = await admin.from('mensagens').select('texto').eq('solicitacao_id', P.sol.id).eq('oficina_id', of1.id);
  ok('1: linha no chat com a proposta', (chat1 || []).some((m) => /Uue aja ettepanek/.test(m.texto)), JSON.stringify(chat1));

  // ---------- 1) cliente MANTEM a data (tela, celular, en) ----------
  {
    const ctx = await contexto(390, { locale: 'en-GB' });
    const p = await entrarSite(ctx, P.cEmail, senha, '/ee/en');
    await p.goto(`${SITE}/ee/en/cliente/orcamentos/${P.sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    const prop = p.getByTestId('proposta-nova-data');
    const tp = (await prop.count()) ? await prop.innerText() : '';
    ok('1: cliente ve a proposta com a nova data, o motivo e os botoes (aceitar, manter, outra data, cancelar)', tp.includes('proposes a new date') && tp.includes('Varuosa saabub') && tp.includes(TE('agendaMudanca.aceitarData')) && tp.includes(TE('agendaMudanca.manterData'))
      && tp.includes(TE('agendaMudanca.pedirOutraData')) && tp.includes(TE('agendaMudanca.cancelarComOficina')) && /Afternoon/.test(tp), tp);
    const hrefOutra = await prop.getByTestId('pedir-outra-data').getAttribute('href').catch(() => '');
    ok('077: "pedir outra data" abre a conversa com esta oficina', (hrefOutra || '').includes(`/cliente/mensagens/${P.sol.id}?oficina=${of1.id}`), hrefOutra);
    const tPag = await design(p, '1: pedido do cliente com a proposta (celular, en)');
    ok('2/4: pedido do cliente mostra a data da agenda e "To reschedule or cancel..." com o botao do chat', (await p.getByTestId('agendamento-atual').count()) === 1 && tPag.includes(TE('agendaMudanca.notaRemarcar')) && (await p.getByTestId('nota-remarcar').locator('a').count()) === 1);
    await p.screenshot({ path: path.join(OUT, 'cliente_proposta_390.png'), fullPage: true });
    await p.getByRole('button', { name: TE('agendaMudanca.manterData') }).click(); await p.waitForTimeout(2500);
    ok('1: "manter" mostra a confirmacao', (await p.innerText('body')).includes(TE('agendaMudanca.feitoMantida')));
    await ctx.close();
  }
  {
    const { data: r } = await admin.from('orcamento_revisoes').select('status').eq('id', rev1.id).single();
    const { data: ag } = await admin.from('agenda').select('status, data_inicio').eq('id', P.ag.id).single();
    const { data: s } = await admin.from('solicitacoes').select('status').eq('id', P.sol.id).single();
    ok('1: manter = proposta recusada, data e servico iguais', r.status === 'recusada' && ag.status === 'agendado' && ag.data_inicio === P.ag.data_inicio && s.status === 'aceita', JSON.stringify({ r, ag, s }));
    const { data: nOf } = await admin.from('notificacoes').select('titulo').eq('profile_id', w1Id).eq('dados->>revisao_id', rev1.id);
    ok('1/077: oficina avisada ("Klient jätab praeguse aja")', (nOf || []).some((n) => n.titulo === 'Klient jätab praeguse aja'), JSON.stringify(nOf));
    // a oficina ve no pedido que o cliente manteve, com o proximo passo
    const ctx = await contexto(390);
    const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA);
    await p.goto(`${SITE}/ee/et/oficina/pedidos/${P.sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    const tm = await p.getByTestId('resumo-manteve').innerText().catch(() => '');
    ok('077: pedido da oficina mostra "o cliente manteve" e o proximo passo (conversa, mudar, cancelar)', tm.includes(T('agendaMudanca.clienteManteve')) && (await p.getByTestId('resumo-proximo-passo').count()) === 1 && (await p.getByTestId('resumo-proximo-passo').getByTestId('mudar-data').count()) === 1, tm);
    await design(p, '077: pedido da oficina com "cliente manteve" (celular)');
    await ctx.close();
  }

  // ---------- 1) nova proposta (API) e o cliente ACEITA (tela, computador) ----------
  {
    const rp = await post('/api/orcamento-revisao/data', w1.token, { orcamentoId: P.o1.id, data: dia(5), turno: 'tarde', previsao: dia(6), motivo: 'Tõstuk vabaneb alles reedel' });
    ok('1: segunda proposta aceita pela API', rp.status === 200, JSON.stringify(rp));
    const ctx = await contexto(1280, { locale: 'en-GB' });
    const p = await entrarSite(ctx, P.cEmail, senha, '/ee/en');
    await p.goto(`${SITE}/ee/en/cliente/orcamentos/${P.sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    await design(p, '1: pedido do cliente com a proposta (computador)');
    const t1 = Date.now();
    await p.getByRole('button', { name: TE('agendaMudanca.aceitarData') }).click(); await p.waitForTimeout(3000);
    ok('1: "aceitar" mostra a confirmacao', (await p.innerText('body')).includes(TE('agendaMudanca.feitoAceita')));
    const { data: ag } = await admin.from('agenda').select('data_inicio, data_fim, aviso_cliente_seq').eq('id', P.ag.id).single();
    const esperado = tallinn(dia(5), '13:00');
    ok('1: aceitar muda a agenda para a nova data (13:00 Tallinn)', new Date(ag.data_inicio).toISOString() === esperado, `${ag.data_inicio} vs ${esperado}`);
    const e = await esperarEmail(P.cEmail, t1, (x) => /Booking time changed/.test(x.html));
    const ics = e ? icsDe(e.f) : null;
    ok('1: e-mail "Booking time changed" com o mesmo evento, SEQUENCE 1 e o novo inicio', !!ics && ics.includes(`UID:agenda-${P.ag.id}@bipfix.com`) && /SEQUENCE:1\r\n/.test(ics) && ics.includes(`DTSTART:${icsData(esperado)}`));
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    const tAg = await p.getByTestId('agendamento-atual').innerText().catch(() => '');
    ok('2: pedido do cliente mostra a NOVA data (lida da agenda)', /13:00/.test(tAg) && tAg.includes(new Date(esperado).toLocaleDateString('en-GB', { timeZone: 'Europe/Tallinn', day: 'numeric' })), tAg);
    await ctx.close();
  }

  // ---------- 2) depois da nova data aceita: oficina e inicio do cliente mostram a data ATUAL (dono 08/11) ----------
  {
    const esperado = tallinn(dia(5), '13:00');
    const diaEt = new Date(esperado).toLocaleDateString('et-EE', { timeZone: 'Europe/Tallinn', day: '2-digit', month: '2-digit' });
    const ctx = await contexto(390);
    const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA);
    await p.goto(`${SITE}/ee/et/oficina/pedidos?aba=respondidos`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    const card = p.locator('a, li, div').filter({ hasText: String(P.sol.numero) }).filter({ hasText: T('oficinaPedidos.clienteAceitou') }).last();
    const tCard = await card.innerText().catch(() => '');
    ok('2: lista da oficina "saabub" com a NOVA data e hora (agenda)', tCard.includes(diaEt) && tCard.includes('13:00'), tCard.replace(/s+/g, ' ').slice(0, 200));
    await p.goto(`${SITE}/ee/et/oficina/pedidos/${P.sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    const res = await p.getByTestId('resumo-agendamento').innerText().catch(() => '');
    ok('2: pedido da oficina com o resumo: cliente aceitou + chegada atual', res.includes(T('oficinaSolicitacaoDetalhe.resumoAgenda.titulo')) && (await p.getByTestId('resumo-chegada').innerText()).includes('13:00'), res.replace(/s+/g, ' '));
    ok('2: resumo diz que a data mudou com o aceite do cliente', (await p.getByTestId('resumo-mudanca').count()) === 1, res.replace(/s+/g, ' '));
    await design(p, '2: pedido da oficina com o resumo (celular)');
    await p.screenshot({ path: path.join(OUT, 'oficina_resumo_agendamento_390.png'), fullPage: true });
    await ctx.close();
    const c2 = await contexto(390, { locale: 'en-GB' });
    const pc = await entrarSite(c2, P.cEmail, senha, '/ee/en');
    await pc.goto(`${SITE}/ee/en/cliente/dashboard`, { waitUntil: 'networkidle' }); await pc.waitForTimeout(3000);
    const tDash = await pc.locator('main').innerText();
    ok('2: inicio do cliente (agendados) com a NOVA data e hora', tDash.includes('13:00'), tDash.replace(/s+/g, ' ').slice(0, 300));
    await c2.close();
  }

  // ---------- 3) regras da API ----------
  {
    const rMec = await post(`/api/agenda/${P.ag.id}/mudar-data`, mec.token, { data: dia(9), hora: '10:00', motivo: 'Mecanico tentando' });
    ok('3: mecanico nao muda a data (403)', rMec.status === 403, JSON.stringify(rMec));
    const rOutra = await post(`/api/agenda/${P.ag.id}/cancelar`, w2.token, { motivo: 'Outra oficina tentando' });
    ok('3: outra oficina nao cancela (403)', rOutra.status === 403, JSON.stringify(rOutra));
    const rCli = await post(`/api/agenda/${P.ag.id}/cancelar`, P.cli.token, { motivo: 'Cliente tentando pela API' });
    ok('3: cliente nao usa a rota da oficina (403)', rCli.status === 403, JSON.stringify(rCli));
    const rSem = await post(`/api/agenda/${P.ag.id}/mudar-data`, w1.token, { data: dia(9), hora: '10:00', motivo: 'ab' });
    ok('3: sem justificativa (400)', rSem.status === 400, JSON.stringify(rSem));
    const rPass = await post(`/api/agenda/${P.ag.id}/mudar-data`, w1.token, { data: dia(-2), hora: '10:00', motivo: 'Data no passado' });
    ok('3: data no passado (409)', rPass.status === 409, JSON.stringify(rPass));
    const rAnon = await post(`/api/agenda/${P.ag.id}/cancelar`, null, { motivo: 'Sem login nenhum' });
    ok('3: sem login (401)', rAnon.status === 401, JSON.stringify(rAnon));
    const rInv = await post(`/api/agenda/${P.ag.id}/mudar-data`, w1.token, { data: '2026-13-45', hora: '25:99', motivo: 'Data que nao existe' });
    ok('3: data/hora que nao existem (400, nao 500)', rInv.status === 400, JSON.stringify(rInv));
  }

  // ---------- 2) "Mudar data" pela agenda da oficina (tela, computador) ----------
  {
    const ctx = await contexto(1280);
    const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA);
    await p.goto(`${SITE}/ee/et/oficina/agenda?vista=list`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    const card = p.getByText(`AG1${tag.slice(0, 3).toUpperCase()}`, { exact: false }).first();
    await card.click(); await p.waitForTimeout(800);
    ok('2: agenda mostra "Muuda aega" e "Tühista broneering" no carro de pedido', (await p.getByTestId('mudar-data').count()) >= 1 && (await p.getByTestId('cancelar-agendamento').count()) >= 1);
    await p.getByTestId('mudar-data').first().click(); await p.waitForTimeout(500);
    const form = p.getByTestId('form-mudar-data');
    ok('2: formulario explica que o cliente recebe e-mail', (await form.innerText()).includes(T('agendaMudanca.mudarDataTexto')));
    await form.locator('input[type=date]').fill(dia(8));
    await form.locator('input[type=time]').fill('10:30');
    await form.locator('textarea').fill('Klient palus telefoni teel hilisemat aega');
    // 077: combinado com o cliente por telefone -> vale na hora
    await form.getByTestId('serve-nao').check();
    await form.getByTestId('ja-combinei').check();
    await design(p, '2: agenda com o formulario de mudar data (computador)');
    await form.screenshot({ path: path.join(OUT, 'agenda_mudar_data_1280.png') });
    const t2 = Date.now();
    await form.getByRole('button', { name: T('agendaMudanca.enviarCombinado') }).click(); await p.waitForTimeout(3000);
    ok('2/077: confirmacao de mudanca combinada', (await p.innerText('body')).includes(T('agendaMudanca.feitoCombinado')));
    const { data: ag } = await admin.from('agenda').select('data_inicio, aviso_cliente_seq').eq('id', P.ag.id).single();
    const esperado = tallinn(dia(8), '10:30');
    ok('2: agenda com a nova data (10:30 Tallinn)', new Date(ag.data_inicio).toISOString() === esperado, `${ag.data_inicio} vs ${esperado}`);
    const e = await esperarEmail(P.cEmail, t2, (x) => /Booking time changed/.test(x.html));
    const ics = e ? icsDe(e.f) : null;
    ok('2: e-mail com o motivo da oficina e o calendario atualizado (SEQUENCE 2)', !!e && e.html.includes('Reason given by the repair shop') && e.html.includes('Klient palus telefoni teel') && !!ics && /SEQUENCE:2\r\n/.test(ics) && ics.includes(`DTSTART:${icsData(esperado)}`));
    const { data: hist } = await admin.from('agenda_historico').select('acao, detalhe').eq('agenda_id', P.ag.id).eq('acao', 'data_combinada');
    ok('2: historico da agenda com quem, de/para e motivo', (hist || []).length === 1 && hist[0].detalhe?.motivo === 'Klient palus telefoni teel hilisemat aega');
    const { data: nCli } = await admin.from('notificacoes').select('titulo, mensagem').eq('profile_id', P.cId).eq('tipo', 'revisao_orcamento');
    ok('2/077: cliente avisado ("Date changed (agreed with you)") com o "I didn’t agree"', (nCli || []).some((n) => n.titulo === 'Date changed (agreed with you)' && /didn’t agree/.test(n.mensagem)), JSON.stringify(nCli));
    const { data: chat } = await admin.from('mensagens').select('texto').eq('solicitacao_id', P.sol.id).eq('oficina_id', of1.id);
    ok('2: linha no chat com a nova data e o motivo', (chat || []).some((m) => /Kokkulepitud uus aeg/.test(m.texto) && /Klient palus/.test(m.texto)), JSON.stringify(chat));
    await ctx.close();
  }

  // ---------- 077) cliente diz "nao combinei isso" (celular) -> a data volta; a oficina ve e age ----------
  {
    const antes = tallinn(dia(5), '13:00');
    const ctx = await contexto(390, { locale: 'en-GB' });
    const p = await entrarSite(ctx, P.cEmail, senha, '/ee/en');
    await p.goto(`${SITE}/ee/en/cliente/orcamentos/${P.sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    const caixa = p.getByTestId('mudanca-combinada');
    const tc = (await caixa.count()) ? await caixa.innerText() : '';
    ok('077: cliente ve "mudou a data, como combinado" com a data nova e o motivo', tc.includes(TE('agendaMudanca.combinadoTitulo', { oficina: of1.nome_fantasia })) && tc.includes('10:30') && tc.includes('Klient palus'), tc);
    await design(p, '077: pedido do cliente com a mudanca combinada (celular)');
    await p.screenshot({ path: path.join(OUT, 'cliente_combinada_390.png'), fullPage: true });
    await caixa.getByTestId('nao-combinei').click(); await p.waitForTimeout(3000);
    ok('077: "nao combinei" mostra a confirmacao', (await p.innerText('body')).includes(TE('agendaMudanca.naoCombineiFeito')));
    await ctx.close();
    const { data: ag } = await admin.from('agenda').select('data_inicio, status').eq('id', P.ag.id).single();
    ok('077: a agenda voltou para a data anterior (13:00)', new Date(ag.data_inicio).toISOString() === antes && ag.status === 'agendado', `${ag.data_inicio} vs ${antes}`);
    const { data: rv } = await admin.from('orcamento_revisoes').select('status, contestada_em, combinado').eq('solicitacao_id', P.sol.id).eq('tipo', 'data').not('contestada_em', 'is', null).single();
    ok('077: a mudanca vira pedido pendente (contestada)', rv?.status === 'pendente' && !rv.combinado, JSON.stringify(rv));
    const { data: nOf } = await admin.from('notificacoes').select('titulo').eq('profile_id', w1Id).eq('titulo', 'Klient ütleb, et uut aega ei lepitud kokku');
    ok('077: oficina avisada em estoniano', (nOf || []).length >= 1, JSON.stringify(nOf));
    const again = await post('/api/orcamento-revisao/decidir', P.cli.token, { revisaoId: (await admin.from('orcamento_revisoes').select('id').eq('solicitacao_id', P.sol.id).eq('status', 'pendente').single()).data.id, decisao: 'contestar' });
    ok('077: contestar de novo nao faz nada (409)', again.status === 409, JSON.stringify(again));
    // oficina: pedido com "cliente disse que nao combinou" + proximo passo; agenda e Hoje com "nao confirmada"
    const c2 = await contexto(390);
    const pw = await entrarSite(c2, W1_EMAIL, W1_SENHA);
    await pw.goto(`${SITE}/ee/et/oficina/pedidos/${P.sol.id}`, { waitUntil: 'networkidle' }); await pw.waitForTimeout(3000);
    const tp = await pw.getByTestId('resumo-pendente').innerText().catch(() => '');
    ok('077: pedido da oficina: "nao confirmada" + o cliente nao combinou + proximo passo', tp.includes(T('agendaMudanca.naoConfirmado')) && tp.includes(T('agendaMudanca.clienteContestou')) && (await pw.getByTestId('resumo-proximo-passo').count()) === 1, tp);
    await design(pw, '077: pedido da oficina com a data contestada (celular)');
    await pw.screenshot({ path: path.join(OUT, 'oficina_contestada_390.png'), fullPage: true });
    await pw.goto(`${SITE}/ee/et/oficina/hoje`, { waitUntil: 'networkidle' }); await pw.waitForTimeout(3000);
    ok('077: Hoje mostra "Aeg pole kinnitatud" no carro', (await pw.getByTestId('data-nao-confirmada').count()) >= 1);
    await pw.goto(`${SITE}/ee/et/oficina/agenda?vista=list`, { waitUntil: 'networkidle' }); await pw.waitForTimeout(3000);
    await pw.getByText(`AG1${tag.slice(0, 3).toUpperCase()}`, { exact: false }).first().click(); await pw.waitForTimeout(800);
    ok('077: Agenda mostra "nao confirmada" no carro', (await pw.getByTestId('data-nao-confirmada').count()) >= 1);
    await c2.close();
    // a oficina retira a proposta contestada mudando de novo, agora com o mesmo dia so combinado
    const mesmo = await post(`/api/agenda/${P.ag.id}/mudar-data`, w1.token, { data: dia(5), hora: '15:00', motivo: 'Mesmo dia sem combinar', dataAtualServe: true });
    ok('077: mudar no MESMO dia sem "ja combinei" -> 409 MESMO_DIA_SO_COMBINADO', mesmo.status === 409 && mesmo.d.codigo === 'MESMO_DIA_SO_COMBINADO', JSON.stringify(mesmo));
    const nova = await post(`/api/agenda/${P.ag.id}/mudar-data`, w1.token, { data: dia(7), hora: '09:00', motivo: 'Uus ettepanek kliendile', dataAtualServe: true });
    const { data: rvs } = await admin.from('orcamento_revisoes').select('status').eq('solicitacao_id', P.sol.id).eq('tipo', 'data').eq('status', 'pendente');
    ok('077: nova proposta substitui a pendente (so uma pendente)', nova.status === 200 && !nova.d.aplicada && (rvs || []).length === 1, JSON.stringify([nova, rvs]));
    // a oficina ainda nao sabe dar a resposta: o cliente responde depois. Retira a pendente para a etapa de cancelar abaixo.
    await post('/api/orcamento-revisao/decidir', P.cli.token, { revisaoId: nova.d.revisaoId, decisao: 'recusar' });
  }

  // ---------- 2) "Cancelar agendamento" pela agenda (tela, celular) ----------
  {
    const ctx = await contexto(390);
    const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA);
    await p.goto(`${SITE}/ee/et/oficina/agenda?vista=list`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    await p.getByText(`AG1${tag.slice(0, 3).toUpperCase()}`, { exact: false }).first().click(); await p.waitForTimeout(800);
    await p.getByTestId('cancelar-agendamento').first().click(); await p.waitForTimeout(500);
    const form = p.getByTestId('form-cancelar');
    ok('2: cancelar explica que o pedido volta a ficar aberto', (await form.innerText()).includes(T('agendaMudanca.cancelarTexto')));
    await form.locator('textarea').fill('Tõstuk läks katki, ei saa seda tööd teha');
    await design(p, '2: agenda com o formulario de cancelar (celular)');
    await form.screenshot({ path: path.join(OUT, 'agenda_cancelar_390.png') });
    const t3 = Date.now();
    await form.getByRole('button', { name: T('agendaMudanca.cancelarAgendamento') }).click(); await p.waitForTimeout(3000);
    ok('2: confirmacao "Broneering tühistatud. Klienti teavitati."', (await p.innerText('body')).includes(T('agendaMudanca.feitoCancelado')));
    const { data: ag } = await admin.from('agenda').select('status').eq('id', P.ag.id).single();
    const { data: s } = await admin.from('solicitacoes').select('status, reaberta_em').eq('id', P.sol.id).single();
    const { data: os } = await admin.from('orcamentos').select('oficina_id, status').eq('solicitacao_id', P.sol.id);
    ok('2: agenda cancelada, pedido aberto de novo (em_orcamento) com o orcamento da outra oficina de volta', ag.status === 'cancelado' && s.status === 'em_orcamento' && !!s.reaberta_em
      && os.find((o) => o.oficina_id === of2.id)?.status === 'enviado' && os.find((o) => o.oficina_id === of1.id)?.status === 'recusado', JSON.stringify({ ag, s, os }));
    const e = await esperarEmail(P.cEmail, t3, (x) => /Booking cancelled/.test(x.html));
    const ics = e ? icsDe(e.f) : null;
    ok('2: e-mail "Booking cancelled" com o motivo e "request is open again"', !!e && e.html.includes('Tõstuk läks katki') && e.html.includes('Your request is open again'));
    ok('2: .ics de cancelamento (METHOD:CANCEL, mesmo UID, SEQUENCE 3)', !!ics && /METHOD:CANCEL/.test(ics) && /STATUS:CANCELLED/.test(ics) && ics.includes(`UID:agenda-${P.ag.id}@bipfix.com`) && /SEQUENCE:([3-9]|\d\d)\r\n/.test(ics));
    const rDe = await post(`/api/agenda/${P.ag.id}/mudar-data`, w1.token, { data: dia(9), hora: '10:00', motivo: 'Depois de cancelado' });
    ok('3: depois de cancelado nao muda mais (409)', rDe.status === 409, JSON.stringify(rDe));
    await ctx.close();
  }

  // ---------- 077) a data atual NAO serve: sem "manter"; o cliente cancela com esta oficina (celular) ----------
  {
    const U = await novoPedido(5);
    const pr = await post('/api/orcamento-revisao/data', w1.token, { orcamentoId: U.o1.id, data: dia(6), turno: 'manha', motivo: 'Meister on sel päeval haige', dataAtualServe: false });
    ok('077: proposta "a data atual nao serve" gravada', pr.status === 200 && (await admin.from('orcamento_revisoes').select('data_atual_serve').eq('id', pr.d.revisaoId).single()).data?.data_atual_serve === false, JSON.stringify(pr));
    const { data: nP } = await admin.from('notificacoes').select('mensagem').eq('profile_id', U.cId).eq('dados->>revisao_id', pr.d.revisaoId);
    ok('077: aviso ao cliente diz que a oficina nao pode mais na data marcada', (nP || []).some((n) => /can no longer do the booked date/.test(n.mensagem)), JSON.stringify(nP));
    const man = await post('/api/orcamento-revisao/decidir', U.cli.token, { revisaoId: pr.d.revisaoId, decisao: 'recusar' });
    ok('077: "manter" pela API recusado quando a data nao serve (409 DATA_ATUAL_NAO_SERVE)', man.status === 409 && man.d.codigo === 'DATA_ATUAL_NAO_SERVE', JSON.stringify(man));
    // lembrete 24 h e vespera (cron de hora em hora)
    await admin.from('orcamento_revisoes').update({ created_at: new Date(Date.now() - 25 * 3600e3).toISOString() }).eq('id', pr.d.revisaoId);
    await admin.from('agenda').update({ data_inicio: tallinn(new Date(Date.now() + 86400e3).toLocaleDateString('en-CA', { timeZone: 'Europe/Tallinn' }), '12:00') }).eq('id', U.ag.id);
    const cron = await fetch(`${SITE}/api/tarefas/limpar-pendentes`, { method: 'POST', headers: { 'x-tarefa-chave': env.TAREFAS_CHAVE } });
    const cj = await cron.json().catch(() => ({}));
    const { data: nL } = await admin.from('notificacoes').select('titulo, profile_id').eq('dados->>revisao_id', pr.d.revisaoId);
    ok('077: cron manda o lembrete de 24 h ao cliente', cron.status === 200 && (nL || []).some((n) => n.profile_id === U.cId && n.titulo === 'The repair shop is waiting for your answer'), JSON.stringify([cj, nL]));
    ok('077: vespera: cliente e oficina avisados de que a data nao foi confirmada', (nL || []).some((n) => n.profile_id === U.cId && n.titulo === 'Date not confirmed yet') && (nL || []).some((n) => n.profile_id === w1Id && n.titulo === 'Aeg pole veel kinnitatud'), JSON.stringify(nL));
    const cron2 = await (await fetch(`${SITE}/api/tarefas/limpar-pendentes`, { method: 'POST', headers: { 'x-tarefa-chave': env.TAREFAS_CHAVE } })).json().catch(() => ({}));
    ok('077: lembretes so uma vez', (cron2.mudancas?.lembretes ?? -1) === 0 && cron2.mudancas?.vesperas === 0, JSON.stringify(cron2));
    const ctx = await contexto(390, { locale: 'en-GB' });
    const p = await entrarSite(ctx, U.cEmail, senha, '/ee/en');
    await p.goto(`${SITE}/ee/en/cliente/orcamentos/${U.sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    const prop = p.getByTestId('proposta-nova-data');
    const tp = (await prop.count()) ? await prop.innerText() : '';
    ok('077: sem "manter a data atual"; aviso "a oficina nao pode mais"', !tp.includes(TE('agendaMudanca.manterData')) && tp.includes(TE('agendaMudanca.naoServeAviso')) && tp.includes(TE('agendaMudanca.cancelarComOficina')), tp);
    await prop.getByTestId('cancelar-com-oficina').click(); await p.waitForTimeout(500);
    const tConf = await prop.innerText();
    ok('077: cancelar pede confirmacao explicando que os outros orcamentos voltam', tConf.includes(TE('agendaMudanca.cancelarComOficinaTexto')), tConf);
    await design(p, '077: confirmacao de cancelar com a oficina (celular)');
    await p.screenshot({ path: path.join(OUT, 'cliente_cancelar_oficina_390.png'), fullPage: true });
    await prop.getByTestId('confirmar-cancelar-oficina').click(); await p.waitForTimeout(3500);
    ok('077: confirmacao "pedido aberto de novo"', (await p.innerText('body')).includes(TE('agendaMudanca.feitoCanceladoCliente')));
    await ctx.close();
    const { data: ag } = await admin.from('agenda').select('status').eq('id', U.ag.id).single();
    const { data: s } = await admin.from('solicitacoes').select('status').eq('id', U.sol.id).single();
    const { data: os } = await admin.from('orcamentos').select('oficina_id, status').eq('solicitacao_id', U.sol.id);
    ok('077: agenda cancelada, pedido reaberto e o orcamento da outra oficina vale de novo', ag.status === 'cancelado' && s.status === 'em_orcamento' && os.find((o) => o.oficina_id === of2.id)?.status === 'enviado', JSON.stringify({ ag, s, os }));
    const { data: nOf } = await admin.from('notificacoes').select('titulo').eq('profile_id', w1Id).eq('titulo', 'Klient tühistas broneeringu');
    const { data: hist } = await admin.from('agenda_historico').select('acao').eq('agenda_id', U.ag.id).eq('acao', 'cancelado_cliente');
    ok('077: oficina avisada e historico "cancelado_cliente"', (nOf || []).length >= 1 && (hist || []).length === 1, JSON.stringify([nOf, hist]));
  }

  // ---------- 3/M2: o que o proprio cliente recusou nao volta quando a escolhida cancela ----------
  {
    const S = await novoPedido(4, { clienteRecusaO2: true });
    const rc = await post(`/api/agenda/${S.ag.id}/cancelar`, w1.token, { motivo: 'Teste da recusa do cliente' });
    const { data: os } = await admin.from('orcamentos').select('oficina_id, status').eq('solicitacao_id', S.sol.id);
    const { data: s } = await admin.from('solicitacoes').select('status').eq('id', S.sol.id).single();
    ok('3/M2: orcamento recusado pelo cliente continua recusado; pedido aberto sem ele', rc.status === 200 && os.find((o) => o.oficina_id === of2.id)?.status === 'recusado' && s.status === 'aberta', JSON.stringify({ os, s }));
  }

  // ---------- 3) depois do check-in: nada de mudar/cancelar/propor ----------
  {
    const Q = await novoPedido(2);
    // M4: proposta cujo horario ja passou nao pode ser aceita
    const pv = await post('/api/orcamento-revisao/data', w1.token, { orcamentoId: Q.o1.id, data: dia(5), turno: 'manha', motivo: 'Vai virar passado' });
    await admin.from('orcamento_revisoes').update({ nova_data_checkin: dia(-1) }).eq('id', pv.d.revisaoId);
    const dv = await post('/api/orcamento-revisao/decidir', Q.cli.token, { revisaoId: pv.d.revisaoId, decisao: 'aprovar' });
    const { data: rvPass } = await admin.from('orcamento_revisoes').select('status').eq('id', pv.d.revisaoId).single();
    ok('3/M4: aceitar proposta com horario ja passado: 409 e proposta cancelada', dv.status === 409 && rvPass.status === 'cancelada', JSON.stringify([dv, rvPass]));
    // M3: proposta pendente cai no check-in
    const pc = await post('/api/orcamento-revisao/data', w1.token, { orcamentoId: Q.o1.id, data: dia(6), turno: 'manha', motivo: 'Pendente no check-in' });
    await fetch(`${SITE}/api/servico`, { method: 'POST', headers: { Authorization: `Bearer ${w1.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'checkin', eventoId: Q.ag.id, antecipar: true }) });
    const { data: ag } = await admin.from('agenda').select('status').eq('id', Q.ag.id).single();
    ok('3: check-in feito (preparacao)', ag.status === 'em_andamento', ag.status);
    const r1 = await post(`/api/agenda/${Q.ag.id}/mudar-data`, w1.token, { data: dia(9), hora: '10:00', motivo: 'Depois do check-in' });
    const r2 = await post(`/api/agenda/${Q.ag.id}/cancelar`, w1.token, { motivo: 'Depois do check-in' });
    const r3 = await post('/api/orcamento-revisao/data', w1.token, { orcamentoId: Q.o1.id, data: dia(9), turno: 'manha', motivo: 'Depois do check-in' });
    const { data: rvCk } = await admin.from('orcamento_revisoes').select('status').eq('id', pc.d.revisaoId).single();
    ok('3/M3: proposta de data pendente cancelada no check-in', rvCk.status === 'cancelada', JSON.stringify(rvCk));
    ok('3: depois do check-in mudar/cancelar/propor data recusados (409)', r1.status === 409 && r2.status === 409 && r3.status === 409, JSON.stringify([r1.status, r2.status, r3.status]));
  }

  // ---------- 4) app (versao web): proposta e observacao ----------
  {
    const R = await novoPedido(3);
    await post('/api/orcamento-revisao/data', w1.token, { orcamentoId: R.o1.id, data: dia(6), turno: 'manha', motivo: 'Varuosa hilineb kaks päeva' });
    const TA = msgApp('en');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en' });
    await ctx.addInitScript(() => { try { localStorage.setItem('idioma', 'en'); } catch {} });
    const p = await ctx.newPage();
    const erros = []; p.on('pageerror', (e) => erros.push(e.message));
    await p.goto(`${APP}/login`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    await p.getByLabel(TA('auth.email'), { exact: true }).locator('visible=true').first().fill(R.cEmail);
    await p.getByLabel(TA('auth.senha'), { exact: true }).locator('visible=true').first().fill(senha);
    await p.getByText(TA('auth.entrar'), { exact: true }).locator('visible=true').last().click(); await p.waitForTimeout(5000);
    await p.goto(`${APP}/solicitacao/${R.sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3500);
    const prop = p.getByTestId('proposta-nova-data');
    const tp = (await prop.count()) ? await prop.innerText() : '';
    ok('App: proposta de nova data com motivo e botoes', tp.includes('proposes a new date') && tp.includes('Varuosa hilineb') && tp.includes(TA('agendaMudanca.aceitarData')) && tp.includes(TA('agendaMudanca.manterData'))
      && tp.includes(TA('agendaMudanca.pedirOutraData')) && tp.includes(TA('agendaMudanca.cancelarComOficina')), tp);
    const tAg = await p.getByTestId('agendamento-atual').innerText().catch(() => '');
    ok('App: pedido mostra "Drop-off" e a observacao com o botao do chat', tAg.includes(TA('agendaMudanca.levarCarro')) && tAg.includes(TA('agendaMudanca.notaRemarcar')) && (await p.getByTestId('conversar-oficina').count()) === 1, tAg);
    const larg = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok('App: sem rolagem lateral', larg <= 1, String(larg));
    await p.screenshot({ path: path.join(OUT, 'app_proposta_390.png'), fullPage: true });
    const dialogos = []; p.on('dialog', (d) => { dialogos.push(d.message()); d.accept().catch(() => {}); });
    const respostas = []; p.on('response', async (r) => { if (r.url().includes('/decidir')) respostas.push(`${r.status()} ${await r.text().catch(() => '')}`); });
    await p.getByText(TA('agendaMudanca.aceitarData'), { exact: true }).click(); await p.waitForTimeout(3000);
    console.log('   app decidir:', JSON.stringify({ respostas, dialogos }));
    const { data: ag } = await admin.from('agenda').select('data_inicio').eq('id', R.ag.id).single();
    ok('App: aceitar pelo app muda a agenda (08:00 Tallinn)', new Date(ag.data_inicio).toISOString() === tallinn(dia(6), '08:00'), ag.data_inicio);
    ok('App: sem erro de JS', !erros.length, erros[0]);
    await ctx.close();
  }
} catch (e) {
  falhas++;
  console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  for (const id of sols) {
    const { data: orcs } = await admin.from('orcamentos').select('id').eq('solicitacao_id', id);
    for (const o of orcs || []) { await admin.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await admin.from('orcamento_itens').delete().eq('orcamento_id', o.id); }
    const { data: ags } = await admin.from('agenda').select('id').eq('solicitacao_id', id);
    for (const a of ags || []) { await admin.from('agenda_historico').delete().eq('agenda_id', a.id); await admin.from('manutencao_etapas').delete().eq('agenda_id', a.id); }
    for (const t of ['orcamento_revisoes', 'agenda', 'mensagens', 'solicitacao_fotos', 'orcamentos']) await admin.from(t).delete().eq('solicitacao_id', id);
    await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', id);
    await admin.from('solicitacoes').delete().eq('id', id);
  }
  for (const id of funcs) await admin.from('funcionarios').delete().eq('id', id);
  for (const id of oficinasCriadas) await admin.from('oficinas').delete().eq('id', id);
  for (const id of contas) { await admin.from('veiculos').delete().eq('profile_id', id); await admin.from('notificacoes').delete().eq('profile_id', id); await admin.from('profiles').delete().eq('id', id); await admin.auth.admin.deleteUser(id).catch(() => {}); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
