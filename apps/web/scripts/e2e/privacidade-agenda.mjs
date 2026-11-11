// E2E LOCAL das mudancas de 07/11 (dono):
//  A) contato do cliente (telefone/e-mail) so para a oficina ESCOLHIDA (migracao 074):
//     antes do aceite a oficina so ve nome/codigo (resumo_clientes); quem orcou,
//     conversou ou perdeu nao le o perfil pela API com o proprio login;
//  B) acidente: "quero que as oficinas me liguem" (desmarcado por padrao) - so com a
//     escolha as oficinas avisadas veem o telefone; botao "Ligar" no painel;
//  C) e-mail de agendamento depois do aceite: detalhes, Google Calendar e .ics com
//     2 lembretes; remarcacao (oficina na agenda, cliente em "reagendar") manda outro
//     e-mail com o MESMO evento (UID igual, SEQUENCE maior); nada muda = nada enviado;
//  D) link curto /r/<numero>?o=<idioma> do e-mail da oficina;
//  E) telas: opcao do acidente no site (6 idiomas, celular) e no app; painel da oficina.
//   node privacidade-agenda.mjs <.env.local>
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
const APP = 'http://localhost:8090';
const EMAILS = env.EMAIL_PASTA_TESTE;
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/privacidade`;
fs.mkdirSync(OUT, { recursive: true });
const WEBMSG = `${RAIZ}/site/apps/web/messages`;
const MOB = `${RAIZ}/site/apps/mobile/i18n/locales`;
const msgWeb = (l) => {
  const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.json`, 'utf8'));
  for (const area of ['cliente', 'oficina', 'misc', 'auth']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.${area}.json`, 'utf8')));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};
const msgApp = (l) => { const j = JSON.parse(fs.readFileSync(`${MOB}/${l}.json`, 'utf8')); return (k) => String(k.split('.').reduce((o, p) => o?.[p], j) ?? `??${k}`); };
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anonCli = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const semear = fs.readFileSync(`${RAIZ}/ferramentas/semear.mjs`, 'utf8');
const W1_EMAIL = 'meister.teste@bipfix.test';
const W1_SENHA = (semear.match(/conta\('meister\.teste@bipfix\.test', '([^']+)'/) || [])[1];
if (!W1_SENHA) throw new Error('oficina de teste nao achada no semear.mjs');
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Priv-' + crypto.randomBytes(6).toString('hex');
const TEL = '+372 5999 1234';
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const contas = new Set(); const sols = new Set(); const emergencias = new Set(); const oficinasCriadas = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => `10.66.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
const arquivosDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.includes(`_${email}`) && Number(f.split('_')[0]) >= depois).sort();
const emailsDe = (email, depois = 0) => arquivosDe(email, depois).filter((f) => f.endsWith('.html')).map((f) => ({ f, html: fs.readFileSync(path.join(EMAILS, f), 'utf8') }));
const icsDe = (htmlArq) => { const a = path.join(EMAILS, htmlArq.replace(/\.html$/, '') + '__bipfix-agendamento.ics'); return fs.existsSync(a) ? fs.readFileSync(a, 'utf8') : null; };
const esperarEmail = async (email, depois, filtro = () => true) => { for (let i = 0; i < 40; i++) { const e = emailsDe(email, depois).filter(filtro).at(-1); if (e) return e; await sleep(300); } return null; };
const icsData = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const MERCADO = { et: '/ee/et', ru: '/ee/ru', en: '/ee/en', it: '/it/it', 'pt-PT': '/pt/pt', pt: '/br/pt' };
const ACIDENTE = { et: '/avarii', ru: '/dtp', en: '/accident', it: '/incidente', 'pt-PT': '/emergencia', pt: '/emergencia' };

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
const lerPerfil = async (sb, id) => (await sb.from('profiles').select('id, nome, telefone, email').eq('id', id)).data || [];
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const contexto = async (largura, extra = {}) => {
  const c = await browser.newContext({ viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500,
    locale: 'et-EE', geolocation: { latitude: 59.437, longitude: 24.745 }, permissions: ['geolocation'], extraHTTPHeaders: { 'x-real-ip': ip() }, ...extra });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const design = async (page, nome) => {
  const t = await page.innerText('body');
  const crua = t.match(/\b(emergencia|oficinaSolicitacaoDetalhe|clienteReagendar|constants|erros|common)\.[a-zA-Z_]+/);
  ok(`${nome}: sem chave sem traducao`, !crua, crua?.[0]);
  const r = await page.evaluate(() => {
    const sw = document.documentElement.scrollWidth - innerWidth;
    const fora = [...document.querySelectorAll('main button, main a, main input, main label')].filter((e) => e.offsetParent)
      .map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && (b.left < -1 || b.right > innerWidth + 1)).length;
    return { sw, fora };
  });
  ok(`${nome}: sem rolagem lateral nem elemento cortado`, r.sw <= 1 && r.fora === 0, JSON.stringify(r));
  return t;
};
const entrarSite = async (ctx, email, s) => {
  const p = await ctx.newPage();
  await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', s);
  await p.click('button[type=submit]'); await p.waitForTimeout(4000);
  return p;
};
const amanha = (n) => { const d = new Date(Date.now() + n * 86400e3); return d.toISOString().slice(0, 10); };
// png 1x1
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pngArq = path.join(OUT, 'dano.png'); fs.writeFileSync(pngArq, PNG);

try {
  // ---------- preparacao: oficina 1 (semeada), oficina 2 (criada aqui), cliente ----------
  const w1 = await sessao(W1_EMAIL, W1_SENHA);
  const w1Id = (await admin.from('profiles').select('id').eq('email', W1_EMAIL).single()).data.id;
  await admin.from('profiles').update({ idioma: 'et' }).eq('id', w1Id); // conta compartilhada: um teste manual pode ter trocado o idioma
  const { data: of1 } = await admin.from('oficinas').select('id, nome_fantasia, profile_id').eq('profile_id', (await admin.from('profiles').select('id').eq('email', W1_EMAIL).single()).data.id).single();
  const w2Email = `priv-of2-${tag}@example.test`;
  const w2Id = await conta(w2Email, senha, { tipo: 'oficina', nome: 'Oficina Dois', idioma: 'et', telefone: '+372 5000 2222' });
  const { data: of2 } = await admin.from('oficinas').insert({ profile_id: w2Id, nome_fantasia: `Teine Töökoda ${tag}`, endereco: 'Pärnu mnt 20', cidade: 'Tallinn', estado: 'Harjumaa', cep: '10141', pais: 'EE', latitude: 59.43, longitude: 24.745, raio_atendimento_km: 30, especialidades: ['mecanica', 'eletrica', 'funilaria', 'pintura', 'colisao', 'pneu', 'manutencao', 'vidros'], ativa: true }).select('id').single();
  oficinasCriadas.add(of2.id);
  const w2 = await sessao(w2Email, senha);
  const cEmail = `priv-cli-${tag}@example.test`;
  const cId = await conta(cEmail, senha, { tipo: 'cliente', nome: 'Cliente Privado', telefone: TEL, idioma: 'en' });
  const cli = await sessao(cEmail, senha);
  const { data: v } = await admin.from('veiculos').insert({ profile_id: cId, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018', placa: `PRV${tag.slice(0, 3).toUpperCase()}` }).select('id').single();
  const { data: sol } = await admin.from('solicitacoes').insert({ cliente_id: cId, veiculo_id: v.id, tipo: 'mecanica', descricao: 'Privacy test: engine noise', urgencia: 'media', endereco: 'Pärnu mnt 10, Tallinn', latitude: 59.433, longitude: 24.746, status: 'aberta' }).select('id, numero').single();
  sols.add(sol.id);

  // ---------- A) antes de orcar ----------
  ok('A: oficina ve o pedido aberto', ((await w1.c.from('solicitacoes').select('id').eq('id', sol.id)).data || []).length === 1);
  ok('A: oficina NAO le o perfil do cliente antes de orcar', (await lerPerfil(w1.c, cId)).length === 0);
  const { data: res1 } = await w1.c.rpc('resumo_clientes', { p_ids: [cId] });
  ok('A: resumo_clientes da o nome e o codigo', res1?.[0]?.nome === 'Cliente Privado' && !!res1?.[0]?.codigo && !('telefone' in (res1?.[0] || {})) && !('email' in (res1?.[0] || {})), JSON.stringify(res1));
  const { data: resFora } = await w2.c.rpc('resumo_clientes', { p_ids: [cId, w2Id, '00000000-0000-0000-0000-000000000000'] });
  ok('A: resumo_clientes nao devolve quem a oficina nao pode ver (so ela mesma e o cliente do pedido visivel)', (resFora || []).every((x) => [cId, w2Id].includes(x.id)), JSON.stringify(resFora));
  const anonimo = anonCli();
  const { data: resAnon, error: eAnon } = await anonimo.rpc('resumo_clientes', { p_ids: [cId] });
  ok('A: sem login resumo_clientes nao responde', !!eAnon || !(resAnon || []).length, eAnon?.message);

  // orcamentos das duas oficinas + chat das duas com o cliente
  const o1 = (await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of1.id, valor_total: 240, prazo_dias: 2, status: 'enviado', validade: amanha(10), garantia_dias: 90 }).select('id').single()).data;
  const { error: eItens } = await admin.from('orcamento_itens').insert([{ orcamento_id: o1.id, descricao: 'Diagnostika', tipo: 'mao_de_obra', valor_unitario: 40, quantidade: 1, valor_total: 40 }, { orcamento_id: o1.id, descricao: 'Mootorikinnitus', tipo: 'peca', valor_unitario: 100, quantidade: 2, valor_total: 200 }]);
  if (eItens) throw new Error('itens do orcamento: ' + eItens.message);
  const slot1 = (await admin.from('orcamento_disponibilidade').insert({ orcamento_id: o1.id, data_checkin: amanha(2), turno: 'manha', data_previsao_entrega: amanha(4) }).select('id').single()).data;
  const slot2 = (await admin.from('orcamento_disponibilidade').insert({ orcamento_id: o1.id, data_checkin: amanha(5), turno: 'tarde', data_previsao_entrega: amanha(6) }).select('id').single()).data;
  const o2 = (await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of2.id, valor_total: 300, prazo_dias: 3, status: 'enviado', validade: amanha(10) }).select('id').single()).data;
  await admin.from('orcamento_disponibilidade').insert({ orcamento_id: o2.id, data_checkin: amanha(3), turno: 'manha', data_previsao_entrega: amanha(5) });
  await admin.from('mensagens').insert([{ solicitacao_id: sol.id, oficina_id: of1.id, remetente_id: cId, texto: 'Hello 1' }, { solicitacao_id: sol.id, oficina_id: of2.id, remetente_id: cId, texto: 'Hello 2' }]);
  ok('A: oficina que orcou e conversou continua sem o contato', (await lerPerfil(w1.c, cId)).length === 0 && (await lerPerfil(w2.c, cId)).length === 0);
  const { data: viaPedido } = await w1.c.from('solicitacoes').select('cliente:profiles!solicitacoes_cliente_id_fkey(telefone, email)').eq('id', sol.id).single();
  ok('A: nem pelo pedido (cliente vem vazio)', !viaPedido?.cliente, JSON.stringify(viaPedido));

  // ---------- C) aceite + e-mail do agendamento ----------
  const t0 = Date.now();
  const ra = await fetch(`${SITE}/api/aceitar-orcamento`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cli.token}` }, body: JSON.stringify({ orcamentoId: o1.id, slotId: slot1.id }) });
  ok('C: cliente aceita o orcamento da oficina 1', ra.status === 200, String(ra.status));
  const { data: ag } = await admin.from('agenda').select('id, data_inicio, aviso_cliente_inicio, aviso_cliente_seq').eq('solicitacao_id', sol.id).eq('oficina_id', of1.id).single();
  const e1 = await esperarEmail(cEmail, t0, (e) => /Booking confirmed/.test(e.html));
  ok('C: e-mail "Booking confirmed" no idioma do cliente com a oficina', !!e1 && e1.html.includes(of1.nome_fantasia), e1?.html.slice(0, 160));
  const h1 = e1?.html || '';
  ok('C: e-mail com endereco + mapa, telefone da oficina, entrega prevista, carro, valor e itens',
    /Address/.test(h1) && /google\.com\/maps\/search/.test(h1) && /tel:\+372/.test(h1) && /Expected ready/.test(h1) && /Toyota Corolla 2018/.test(h1) && /240/.test(h1) && /Diagnostika/.test(h1) && /Mootorikinnitus × 2/.test(h1) && /Warranty: 90 days/.test(h1));
  const gLink = (h1.match(/href="(https:\/\/calendar\.google\.com\/calendar\/render\?[^"]+)"/) || [])[1]?.replace(/&amp;/g, '&');
  const gq = gLink ? new URL(gLink).searchParams : null;
  ok('C: botao Google Calendar com a data certa', !!gq && gq.get('action') === 'TEMPLATE' && gq.get('dates')?.startsWith(icsData(ag.data_inicio)) && /Car drop-off/.test(gq.get('text') || ''), gLink);
  ok('C: link do pedido e o curto /r/<numero> (sem nome de pagina em portugues)', h1.includes(`/r/${sol.numero}"`) && !/\/cliente\//.test(h1));
  const ics1 = e1 ? icsDe(e1.f) : null;
  ok('C: .ics anexo', !!ics1);
  ok('C: .ics com UID do agendamento, SEQUENCE 0, inicio certo e 2 lembretes',
    !!ics1 && ics1.includes(`UID:agenda-${ag.id}@bipfix.com`) && /SEQUENCE:0\r\n/.test(ics1) && ics1.includes(`DTSTART:${icsData(ag.data_inicio)}`) && /TRIGGER:-P1D/.test(ics1) && /TRIGGER:-PT1H/.test(ics1) && /METHOD:REQUEST/.test(ics1));
  ok('C: .ics no formato do padrao (CRLF, linhas <= 75 bytes)', !!ics1 && !/[^\r]\n/.test(ics1) && ics1.split('\r\n').every((l) => Buffer.byteLength(l, 'utf8') <= 75));
  ok('C: agenda marca o aviso (075)', ag.aviso_cliente_inicio && new Date(ag.aviso_cliente_inicio).getTime() === new Date(ag.data_inicio).getTime() && ag.aviso_cliente_seq === 0, JSON.stringify(ag));
  fs.writeFileSync(path.join(OUT, 'agendamento.ics'), ics1 || '');

  // ---------- A) depois do aceite ----------
  const p1 = await lerPerfil(w1.c, cId);
  ok('A: oficina ESCOLHIDA le telefone e e-mail do cliente', p1[0]?.telefone === TEL && p1[0]?.email === cEmail, JSON.stringify(p1));
  ok('A: oficina que PERDEU continua sem o contato', (await lerPerfil(w2.c, cId)).length === 0);
  // auditoria H1: a oficina que perdeu tenta criar agenda no pedido pela API para ganhar o contato
  const { error: eFalsa } = await w2.c.from('agenda').insert({ oficina_id: of2.id, solicitacao_id: sol.id, titulo: 'x', tipo: 'plataforma', status: 'agendado', data_inicio: new Date(Date.now() + 86400e3).toISOString(), data_fim: new Date(Date.now() + 2 * 86400e3).toISOString() });
  ok('A/H1: oficina nao cria agenda ligada a pedido pela API', !!eFalsa, eFalsa?.message);
  const { data: agW2 } = await w2.c.from('agenda').insert({ oficina_id: of2.id, titulo: 'manual', tipo: 'externo', status: 'agendado', data_inicio: new Date(Date.now() + 86400e3).toISOString(), data_fim: new Date(Date.now() + 2 * 86400e3).toISOString() }).select('id').single();
  if (agW2) { await w2.c.from('agenda').update({ solicitacao_id: sol.id }).eq('id', agW2.id); const { data: vv } = await admin.from('agenda').select('solicitacao_id').eq('id', agW2.id).single(); ok('A/H1: nem ligar uma agenda propria ao pedido depois', vv.solicitacao_id === null, JSON.stringify(vv)); await admin.from('agenda').delete().eq('id', agW2.id); }
  ok('A/H1: e continua sem o contato', (await lerPerfil(w2.c, cId)).length === 0);
  // auditoria H2: aviso do navegador da oficina ao cliente (orcamento revisado antes do aceite) continua passando
  const { error: eNot } = await w2.c.from('notificacoes').insert({ profile_id: cId, tipo: 'orcamento_revisado', titulo: 'teste', mensagem: 'teste', dados: { solicitacao_id: sol.id } });
  ok('A/H2: oficina do pedido ainda avisa o cliente pelo navegador', !eNot, eNot?.message);
  const { error: eNotFora } = await w2.c.from('notificacoes').insert({ profile_id: w1Id, tipo: 'x', titulo: 'x', mensagem: 'x' });
  ok('A/H2: mas nao manda aviso para quem nao tem relacao', !!eNotFora);
  const { data: res2 } = await w2.c.rpc('resumo_clientes', { p_ids: [cId] });
  ok('A: oficina que perdeu ainda ve o nome (historico em Encerrados)', res2?.[0]?.nome === 'Cliente Privado');

  // ---------- C) remarcacao pela oficina ----------
  const novoInicio = new Date(new Date(ag.data_inicio).getTime() + 86400e3).toISOString();
  const { error: eUp } = await w1.c.from('agenda').update({ data_inicio: novoInicio }).eq('id', ag.id);
  ok('C: oficina remarca na agenda (com o proprio login)', !eUp, eUp?.message);
  const t1 = Date.now();
  const rv = await fetch(`${SITE}/api/agenda/${ag.id}/avisar-cliente`, { method: 'POST', headers: { Authorization: `Bearer ${w1.token}` } });
  const dv = await rv.json();
  ok('C: aviso de remarcacao enviado', rv.status === 200 && dv.enviado === true, JSON.stringify(dv));
  const e2 = await esperarEmail(cEmail, t1, (e) => /Booking time changed/.test(e.html));
  const ics2 = e2 ? icsDe(e2.f) : null;
  ok('C: e-mail "Booking time changed" com o novo horario', !!e2 && /The time of your booking has changed/.test(e2.html));
  ok('C: mesmo evento (UID igual), SEQUENCE 1, inicio novo', !!ics2 && ics2.includes(`UID:agenda-${ag.id}@bipfix.com`) && /SEQUENCE:1\r\n/.test(ics2) && ics2.includes(`DTSTART:${icsData(novoInicio)}`));
  const rv2 = await (await fetch(`${SITE}/api/agenda/${ag.id}/avisar-cliente`, { method: 'POST', headers: { Authorization: `Bearer ${w1.token}` } })).json();
  ok('C: chamar de novo sem mudar o horario nao manda nada', rv2.enviado === false, JSON.stringify(rv2));
  const rOutra = await fetch(`${SITE}/api/agenda/${ag.id}/avisar-cliente`, { method: 'POST', headers: { Authorization: `Bearer ${w2.token}` } });
  ok('C: outra oficina nao pode chamar (403)', rOutra.status === 403, String(rOutra.status));
  const rSem = await fetch(`${SITE}/api/agenda/${ag.id}/avisar-cliente`, { method: 'POST' });
  ok('C: sem login 401', rSem.status === 401, String(rSem.status));

  // ---------- C) remarcacao pelo cliente na tela "reagendar" (hora local certa) ----------
  {
    const ctx = await contexto(390, { locale: 'en-GB' });
    const p = await entrarSite(ctx, cEmail, senha);
    await p.goto(`${SITE}/ee/en/cliente/reagendar/${ag.id}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);
    await design(p, 'C: tela reagendar (celular, en)');
    const radios = p.locator('input[type=radio]');
    ok('C: reagendar mostra os horarios livres do orcamento', (await radios.count()) >= 1, String(await radios.count()));
    await p.locator(`input[type=radio][value="${slot2.id}"]`).check();
    const t2 = Date.now();
    await p.getByRole('button', { name: msgWeb('en')('clienteReagendar.confirmReschedule') }).click();
    await p.waitForTimeout(3000);
    const { data: ag3 } = await admin.from('agenda').select('data_inicio, aviso_cliente_seq').eq('id', ag.id).single();
    const esperado = new Date(`${amanha(5)}T13:00:00+02:00`).toISOString(); // tarde = 13:00 em Tallinn (EET, UTC+2 em novembro)
    ok('C: horario novo gravado na hora local da oficina (13:00 Tallinn, nao 15:00)', new Date(ag3.data_inicio).toISOString() === esperado, `${ag3.data_inicio} vs ${esperado}`);
    const e3 = await esperarEmail(cEmail, t2, (e) => /Booking time changed/.test(e.html));
    const ics3 = e3 ? icsDe(e3.f) : null;
    ok('C: cliente remarcou -> e-mail com o mesmo evento, SEQUENCE 2', !!ics3 && /SEQUENCE:2\r\n/.test(ics3) && ics3.includes(`DTSTART:${icsData(esperado)}`) && ag3.aviso_cliente_seq === 2);
    await ctx.close();
  }

  // ---------- D) link curto do e-mail da oficina ----------
  const rr = await fetch(`${SITE}/r/${sol.numero}?o=et`, { redirect: 'manual' });
  ok('D: /r/<numero>?o=et leva a pagina de orcar da oficina em estoniano', rr.status === 302 && (rr.headers.get('location') || '').includes(`/ee/et/oficina/enviar-orcamento/${sol.id}`), rr.headers.get('location'));
  const rc = await fetch(`${SITE}/r/${sol.numero}`, { redirect: 'manual' });
  ok('D: /r/<numero> sem o continua indo para o cliente', rc.status === 302 && (rc.headers.get('location') || '').includes(`/cliente/orcamentos/${sol.id}`), rc.headers.get('location'));

  // ---------- B) acidente: com e sem "podem me ligar" ----------
  const acidente = async (email, telefone, podem) => {
    const form = new FormData();
    form.append('dados', JSON.stringify({ nome: `Acidente ${podem ? 'Liga' : 'NaoLiga'}`, email, telefone, idioma: 'et', tipoAcidente: 'outro_causou', descricao: 'teste privacidade', endereco: 'Pärnu mnt 12, Tallinn', latitude: 59.431, longitude: 24.746, oficinasPodemLigar: podem }));
    form.append('fotos', new Blob([PNG], { type: 'image/png' }), 'dano.png');
    const r = await fetch(`${SITE}/api/emergencia`, { method: 'POST', body: form, headers: { 'x-real-ip': ip() } });
    const d = await r.json();
    if (d.id) emergencias.add(d.id);
    if (d.solicitacaoId) sols.add(d.solicitacaoId);
    const { data: em } = await admin.from('emergencias').select('id, profile_id, oficinas_podem_ligar').eq('id', d.id).maybeSingle();
    if (em?.profile_id) contas.add(em.profile_id);
    return { ...d, em };
  };
  const aNao = await acidente(`priv-ac1-${tag}@example.test`, '+372 5888 0001', false);
  const aSim = await acidente(`priv-ac2-${tag}@example.test`, '+372 5888 0002', true);
  const aSemTel = await acidente(`priv-ac3-${tag}@example.test`, '', true);
  ok('B: opcao gravada so quando marcada (e so com telefone)', aNao.em?.oficinas_podem_ligar === false && aSim.em?.oficinas_podem_ligar === true && aSemTel.em?.oficinas_podem_ligar === false, JSON.stringify([aNao.em, aSim.em, aSemTel.em]));
  const { data: notif } = await admin.from('emergencia_oficinas_notificadas').select('emergencia_id').eq('oficina_id', of2.id).in('emergencia_id', [aNao.id, aSim.id]);
  ok('B: oficina 2 foi avisada dos dois acidentes', (notif || []).length === 2, JSON.stringify(notif));
  ok('B: sem a opcao, a oficina avisada NAO le o contato nem os dados do acidente', (await lerPerfil(w2.c, aNao.em.profile_id)).length === 0 && ((await w2.c.from('emergencias').select('id, telefone').eq('id', aNao.id)).data || []).length === 0);
  const { data: telSim } = await w2.c.rpc('telefone_acidente', { p_sol: aSim.solicitacaoId });
  ok('B: com a opcao, a oficina avisada recebe o telefone (so ele)', telSim === '+372 5888 0002', JSON.stringify(telSim));
  ok('B: com a opcao, o perfil inteiro (e-mail) e os dados do acidente continuam fechados', (await lerPerfil(w2.c, aSim.em.profile_id)).length === 0 && ((await w2.c.from('emergencias').select('id').eq('id', aSim.id)).data || []).length === 0);
  const { data: telNao } = await w2.c.rpc('telefone_acidente', { p_sol: aNao.solicitacaoId });
  ok('B: sem a opcao, telefone_acidente nao devolve nada', !telNao, JSON.stringify(telNao));

  // ---------- E) painel da oficina ----------
  {
    const T = msgWeb('et');
    const ctx = await contexto(390);
    const p = await entrarSite(ctx, w2Email, senha);
    await p.goto(`${SITE}/ee/et/oficina/pedidos/${aSim.solicitacaoId}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    const tSim = await design(p, 'E: pedido de acidente com permissao (oficina, celular)');
    const lig = p.getByTestId('ligar-cliente');
    ok('E: botao "Ligar" com o numero e o aviso "o cliente pediu"', (await lig.count()) === 1 && (await lig.innerText()).includes('+372 5888 0002') && tSim.includes(T('oficinaSolicitacaoDetalhe.clientePediuLigar')) && tSim.includes(T('oficinaSolicitacaoDetalhe.ligarCliente')));
    ok('E: link tel: sem espacos', (await p.locator('[data-testid=ligar-cliente] a').getAttribute('href')) === 'tel:+37258880002');
    await p.screenshot({ path: path.join(OUT, 'oficina_acidente_ligar_390.png'), fullPage: true });
    await p.goto(`${SITE}/ee/et/oficina/pedidos/${aNao.solicitacaoId}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    const tNao = await design(p, 'E: pedido de acidente sem permissao');
    ok('E: sem permissao nao ha botao nem numero, mas o nome aparece', (await p.getByTestId('ligar-cliente').count()) === 0 && !tNao.includes('5888 0001') && tNao.includes('Acidente NaoLiga'));
    await p.goto(`${SITE}/ee/et/oficina/pedidos/${sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    const tPerdeu = await p.innerText('body');
    ok('E: oficina que perdeu ve o nome mas nao o telefone', tPerdeu.includes('Cliente Privado') && !tPerdeu.includes('5999 1234') && (await p.getByTestId('ligar-cliente').count()) === 0);
    await p.goto(`${SITE}/ee/et/oficina/mensagens`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    ok('E: lista de mensagens mostra o nome do cliente (sem acesso ao perfil)', (await p.innerText('body')).includes('Cliente Privado'));
    await ctx.close();
    const ctx1 = await contexto(1280);
    const q = await entrarSite(ctx1, W1_EMAIL, W1_SENHA);
    await q.goto(`${SITE}/ee/et/oficina/pedidos/${sol.id}`, { waitUntil: 'networkidle' }); await q.waitForTimeout(2500);
    const tEsc = await design(q, 'E: oficina escolhida (computador)');
    ok('E: oficina escolhida ve "Ligar" com o telefone, sem o aviso de acidente', (await q.getByTestId('ligar-cliente').count()) === 1 && tEsc.includes('5999 1234') && !tEsc.includes(T('oficinaSolicitacaoDetalhe.clientePediuLigar')));
    await q.goto(`${SITE}/ee/et/oficina/mensagens/${sol.id}`, { waitUntil: 'networkidle' }); await q.waitForTimeout(2500);
    ok('E: conversa mostra o nome do cliente', (await q.innerText('body')).includes('Cliente Privado'));
    await ctx1.close();
  }

  // ---------- E) tela do acidente no site: 6 idiomas, celular ----------
  for (const l of ['et', 'ru', 'en', 'it', 'pt-PT', 'pt']) {
    const T = msgWeb(l);
    const ctx = await contexto(390, { locale: l === 'pt' ? 'pt-BR' : l });
    const p = await ctx.newPage();
    const erros = []; p.on('pageerror', (e) => erros.push(e.message));
    await p.goto(`${SITE}${MERCADO[l]}${ACIDENTE[l]}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    await p.locator('input[type=file]:not([capture])').first().setInputFiles(pngArq);
    await p.waitForTimeout(800);
    await p.getByRole('button', { name: T('emergencia.nextBtn'), exact: true }).click();
    await p.locator('#cc5ef-3').fill(`Ac UI ${l}`);
    await p.locator('#cc5ef-4').fill(`priv-ui-${l.toLowerCase()}-${tag}@example.test`);
    await p.getByRole('button', { name: T('emergencia.nextBtn'), exact: true }).click();
    await p.waitForTimeout(800);
    const caixa = p.getByTestId('podem-ligar');
    const cb = caixa.locator('input[type=checkbox]');
    ok(`E[${l}]: opcao aparece no passo final`, (await caixa.count()) === 1 && (await caixa.innerText()).includes(T('emergencia.podemLigar')));
    ok(`E[${l}]: sem telefone fica desligada, com a dica`, (await cb.isDisabled()) && !(await cb.isChecked()) && (await caixa.innerText()).includes(T('emergencia.podemLigarSemTelefone')));
    await p.getByRole('button', { name: T('emergencia.backBtn'), exact: true }).click();
    await p.locator('#cc5ef-5').fill('5123 4567');
    await p.getByRole('button', { name: T('emergencia.nextBtn'), exact: true }).click();
    await p.waitForTimeout(800);
    ok(`E[${l}]: com telefone fica DESMARCADA por padrao e explica`, !(await cb.isDisabled()) && !(await cb.isChecked()) && (await caixa.innerText()).includes(T('emergencia.podemLigarTexto')));
    await cb.check();
    ok(`E[${l}]: marca ao tocar`, await cb.isChecked());
    await design(p, `E[${l}]: passo final do acidente (celular)`);
    await caixa.screenshot({ path: path.join(OUT, `acidente_opcao_${l}.png`) });
    if (l === 'et') {
      // envio de verdade: a escolha chega ao banco
      await p.getByRole('button', { name: T('emergencia.sendBtn'), exact: true }).click();
      let em = null;
      for (let i = 0; i < 30 && !em; i++) { await sleep(500); em = (await admin.from('emergencias').select('id, profile_id, solicitacao_id, oficinas_podem_ligar').eq('email', `priv-ui-et-${tag}@example.test`).maybeSingle()).data; }
      if (em) { emergencias.add(em.id); contas.add(em.profile_id); if (em.solicitacao_id) sols.add(em.solicitacao_id); }
      ok('E[et]: enviado pela tela, a escolha foi gravada', em?.oficinas_podem_ligar === true, JSON.stringify(em));
    }
    ok(`E[${l}]: sem erro de JS`, !erros.length, erros[0]);
    await ctx.close();
  }

  // ---------- E) app (versao web): mesma opcao ----------
  for (const l of ['et', 'ru', 'en']) {
    const TA = msgApp(l);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: l, geolocation: { latitude: 59.437, longitude: 24.745 }, permissions: ['geolocation'] });
    await ctx.addInitScript((x) => { try { localStorage.setItem('idioma', x); } catch {} }, l);
    const p = await ctx.newPage();
    const erros = []; p.on('pageerror', (e) => erros.push(e.message));
    await p.goto(`${APP}/emergencia`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    const op = p.getByTestId('podem-ligar');
    ok(`App[${l}]: opcao aparece`, (await op.count()) === 1 && (await op.innerText()).includes(TA('emergencia.podemLigar')));
    ok(`App[${l}]: sem telefone desligada, com a dica`, (await op.getAttribute('aria-disabled')) === 'true' && (await op.innerText()).includes(TA('emergencia.podemLigarSemTelefone')));
    await p.getByLabel(TA('auth.telefone')).last().fill('5123 4567').catch(() => {});
    await p.waitForTimeout(500);
    ok(`App[${l}]: com telefone liga, desmarcada por padrao`, (await op.getAttribute('aria-disabled')) !== 'true' && (await op.getAttribute('aria-checked')) !== 'true' && (await op.innerText()).includes(TA('emergencia.podemLigarTexto')));
    await op.click(); await p.waitForTimeout(300);
    ok(`App[${l}]: marca ao tocar`, (await op.getAttribute('aria-checked')) === 'true');
    const larg = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(`App[${l}]: sem rolagem lateral`, larg <= 1, String(larg));
    await op.screenshot({ path: path.join(OUT, `app_acidente_opcao_${l}.png`) });
    ok(`App[${l}]: sem erro de JS`, !erros.length, erros[0]);
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
    for (const t of ['agenda', 'mensagens', 'notificacoes', 'solicitacao_fotos', 'orcamentos']) {
      if (t === 'notificacoes') await admin.from(t).delete().eq('dados->>solicitacao_id', id); else await admin.from(t).delete().eq('solicitacao_id', id);
    }
  }
  for (const id of emergencias) { for (const t of ['emergencia_fotos', 'emergencia_oficinas_notificadas', 'emergencia_mensagens', 'emergencia_outro_veiculo']) await admin.from(t).delete().eq('emergencia_id', id); await admin.from('emergencias').update({ solicitacao_id: null }).eq('id', id); }
  for (const id of sols) await admin.from('solicitacoes').delete().eq('id', id);
  for (const id of emergencias) await admin.from('emergencias').delete().eq('id', id);
  for (const id of oficinasCriadas) await admin.from('oficinas').delete().eq('id', id);
  for (const id of contas) { await admin.from('veiculos').delete().eq('profile_id', id); await admin.from('notificacoes').delete().eq('profile_id', id); await admin.from('profiles').delete().eq('id', id); await admin.auth.admin.deleteUser(id).catch(() => {}); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
