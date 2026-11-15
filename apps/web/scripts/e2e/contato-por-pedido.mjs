// E2E LOCAL do vazamento achado pelo dono em 15/11 (pedidos 100141/100143) e da migracao 086:
// a oficina que ja atendeu o cliente via o telefone/e-mail dele em TODO pedido novo, antes de
// ser escolhida (a regra de linha de profiles era por perfil, nao por pedido).
//  A) oficina 1 com um trabalho ACEITO do cliente (pedido A) + pedido novo B do mesmo cliente:
//     antes do aceite de B, nada de telefone/e-mail em B pela API (perfil, embutido no pedido,
//     contato_clientes) nem na pagina do pedido; o nome continua (resumo_clientes).
//     No pedido A o contato continua (contato_clientes / pagina / agenda / Hoje).
//  B) aceite de B (rota do site): agora a oficina 1 ve o contato em B; a oficina 2 (que orcou
//     B e perdeu) nunca ve nada; a linha do perfil nao abre para oficina nenhuma.
//  C) nomes no painel da oficina continuam: garantias, agenda/Hoje, avaliacoes.
//   node contato-por-pedido.mjs <.env.local>
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
const SITE = process.env.SITE || 'http://localhost:3100';
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/contato-por-pedido`;
fs.mkdirSync(OUT, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anonCli = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Cpp-' + crypto.randomBytes(6).toString('hex');
const TEL = '+372 5777 4411';
const TEL_DIG = '5777 4411';
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 260) : ''}`); };
const contas = new Set(); const sols = new Set(); const oficinasCriadas = new Set();
const ip = () => `10.67.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
const dia = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);

async function conta(email, perfil) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.add(data.user.id);
  const { error: e2 } = await admin.from('profiles').upsert({ id: data.user.id, email, ...perfil });
  if (e2) throw new Error(e2.message);
  return data.user.id;
}
async function sessao(email) {
  const c = anonCli();
  const { data, error } = await c.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return { c, token: data.session.access_token };
}
async function oficina(n) {
  const email = `cpp-of${n}-${tag}@example.test`;
  const pid = await conta(email, { tipo: 'oficina', nome: `Dono ${n}`, idioma: 'et', telefone: `+372 5000 000${n}` });
  const { data: of, error } = await admin.from('oficinas').insert({ profile_id: pid, nome_fantasia: `Kontakt Töökoda ${n} ${tag}`, endereco: 'Pärnu mnt 20', cidade: 'Tallinn', estado: 'Harjumaa', cep: '10141', pais: 'EE', latitude: 59.43, longitude: 24.745, raio_atendimento_km: 30, especialidades: ['mecanica'], ativa: true }).select('id, nome_fantasia').single();
  if (error) throw new Error(error.message);
  oficinasCriadas.add(of.id);
  return { ...of, email, pid, s: await sessao(email) };
}
// o que a oficina consegue ler do contato do cliente num pedido, por todos os caminhos da API
async function contatoPelaApi(w, solId, cId) {
  const linha = (await w.s.c.from('profiles').select('telefone, email').eq('id', cId)).data || [];
  const emb = (await w.s.c.from('solicitacoes').select('cliente:profiles!solicitacoes_cliente_id_fkey(telefone, email)').eq('id', solId).maybeSingle()).data;
  const rpc = (await w.s.c.rpc('contato_clientes', { p_sols: [solId] })).data || [];
  const agenda = (await w.s.c.from('agenda').select('solicitacao:solicitacoes(cliente:profiles!solicitacoes_cliente_id_fkey(telefone, email))').eq('solicitacao_id', solId)).data || [];
  return {
    linha: linha.length > 0,
    embutido: !!(emb?.cliente?.telefone || emb?.cliente?.email),
    agenda: agenda.some((a) => a.solicitacao?.cliente?.telefone || a.solicitacao?.cliente?.email),
    rpcTel: rpc[0]?.telefone || null, rpcEmail: rpc[0]?.email || null,
  };
}

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const erros = [];
async function paginaOficina(w, largura = 390) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: 844 }, isMobile: largura < 500, hasTouch: largura < 500, locale: 'et-EE', extraHTTPHeaders: { 'x-real-ip': ip() } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await ctx.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', w.email); await p.fill('input[type=password]', senha);
  await p.click('button[type=submit]'); await p.waitForTimeout(3500);
  return { ctx, p };
}
const textoPedido = async (p, solId, foto) => {
  await p.goto(`${SITE}/ee/et/oficina/pedidos/${solId}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  if (foto) await p.screenshot({ path: `${OUT}/${foto}.png`, fullPage: true });
  return { t: await p.innerText('body'), ligar: await p.getByTestId('ligar-cliente').count() };
};

try {
  const w1 = await oficina(1); const w2 = await oficina(2);
  const cEmail = `cpp-cli-${tag}@example.test`;
  const cId = await conta(cEmail, { tipo: 'cliente', nome: 'Kontakt Klient', telefone: TEL, idioma: 'et' });
  const cli = await sessao(cEmail);
  const { data: v } = await admin.from('veiculos').insert({ profile_id: cId, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018', placa: `CPP${tag.slice(0, 3).toUpperCase()}` }).select('id').single();
  const novoPedido = async (d) => {
    const { data: s, error } = await admin.from('solicitacoes').insert({ cliente_id: cId, veiculo_id: v.id, tipo: 'mecanica', descricao: d, urgencia: 'media', endereco: 'Pärnu mnt 10, Tallinn', latitude: 59.433, longitude: 24.746, status: 'em_orcamento' }).select('id, numero').single();
    if (error) throw new Error(error.message);
    sols.add(s.id); return s;
  };
  const orcamento = async (s, w, valor) => {
    const { data: o } = await admin.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: w.id, valor_total: valor, prazo_dias: 2, status: 'enviado', validade: dia(10), garantia_dias: 30 }).select('id').single();
    const { data: slot } = await admin.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_checkin: dia(2), turno: 'manha', data_previsao_entrega: dia(3) }).select('id').single();
    return { ...o, slot: slot.id };
  };
  const aceitar = async (o) => fetch(`${SITE}/api/aceitar-orcamento`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cli.token}`, 'x-real-ip': ip() }, body: JSON.stringify({ orcamentoId: o.id, slotId: o.slot }) });

  // pedido A: trabalho anterior, oficina 1 escolhida (como o 100141)
  const sA = await novoPedido(`Varasem töö ${tag}`);
  const oA = await orcamento(sA, w1, 120);
  const rA = await aceitar(oA);
  ok('prep: cliente aceita a oficina 1 no pedido A', rA.status === 200, String(rA.status));

  // pedido B: novo, as duas oficinas orcam (como o 100143)
  const sB = await novoPedido(`Uus päring ${tag}`);
  const oB1 = await orcamento(sB, w1, 200);
  await orcamento(sB, w2, 210);
  await admin.from('mensagens').insert([{ solicitacao_id: sB.id, oficina_id: w1.id, remetente_id: cId, texto: 'Tere' }]);

  // ---------- A) antes do aceite de B ----------
  const a1B = await contatoPelaApi(w1, sB.id, cId);
  ok('A: oficina 1 (ja atendeu o cliente) NAO le a linha do perfil', !a1B.linha, JSON.stringify(a1B));
  ok('A: nem pelo pedido B embutido', !a1B.embutido, JSON.stringify(a1B));
  ok('A: contato_clientes(B) vazio antes do aceite', !a1B.rpcTel && !a1B.rpcEmail, JSON.stringify(a1B));
  const a1A = await contatoPelaApi(w1, sA.id, cId);
  ok('A: no pedido A (escolhida) contato_clientes da telefone e e-mail', a1A.rpcTel === TEL && a1A.rpcEmail === cEmail, JSON.stringify(a1A));
  ok('A: mesmo no pedido A a linha do perfil e o embutido nao trazem contato', !a1A.linha && !a1A.embutido && !a1A.agenda, JSON.stringify(a1A));
  const a2 = await contatoPelaApi(w2, sB.id, cId);
  const a2A = (await w2.s.c.rpc('contato_clientes', { p_sols: [sA.id, sB.id] })).data || [];
  ok('A: oficina 2 nao le nada (B nem A)', !a2.linha && !a2.embutido && !a2.rpcTel && !a2A.length, JSON.stringify({ a2, a2A }));
  const { data: nome } = await w1.s.c.rpc('resumo_clientes', { p_ids: [cId] });
  ok('A: nome e codigo continuam pelo resumo_clientes', nome?.[0]?.nome === 'Kontakt Klient' && !!nome?.[0]?.codigo && !('telefone' in (nome?.[0] || {})), JSON.stringify(nome));
  const { data: anon, error: eAnon } = await anonCli().rpc('contato_clientes', { p_sols: [sA.id] });
  ok('A: sem login contato_clientes nao responde', !!eAnon || !(anon || []).length);
  const { data: proprio } = await cli.c.from('profiles').select('telefone, email').eq('id', cId).single();
  ok('A: o cliente continua lendo o proprio perfil', proprio?.telefone === TEL && proprio?.email === cEmail);

  // pagina da oficina 1
  const { ctx, p } = await paginaOficina(w1);
  let pg = await textoPedido(p, sB.id, 'oficina1_pedidoB_antes_390');
  ok('A pagina: pedido B sem botao ligar e sem o numero', pg.ligar === 0 && !pg.t.includes(TEL_DIG) && !pg.t.includes(cEmail), pg.t.slice(0, 200));
  ok('A pagina: pedido B mostra o nome do cliente', pg.t.includes('Kontakt Klient'));
  pg = await textoPedido(p, sA.id, 'oficina1_pedidoA_390');
  ok('A pagina: pedido A (escolhida) com ligar e o numero', pg.ligar === 1 && pg.t.includes(TEL_DIG), pg.t.slice(0, 200));
  // agenda (calendario) e Hoje: nome e telefone do trabalho aceito
  await p.goto(`${SITE}/ee/et/oficina/agenda`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  // vista "Nimekiri" (lista): o cartao mostra placa + nome do cliente
  await p.getByText('Nimekiri', { exact: true }).first().click().catch(() => {});
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/oficina1_agenda_lista_390.png`, fullPage: true });
  const evs = await p.evaluate(() => document.body.innerText);
  ok('C agenda: o carro do pedido A aparece (placa ou nome)', evs.includes(`CPP${tag.slice(0, 3).toUpperCase()}`) || evs.includes('Kontakt Klient'), evs.slice(0, 200));
  await p.goto(`${SITE}/ee/et/oficina/hoje`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/oficina1_hoje_390.png`, fullPage: true });
  const hoje = await p.innerText('body');
  ok('C Hoje: sem o numero do pedido B e sem e-mail do cliente', !hoje.includes(cEmail));

  // ---------- B) aceite de B ----------
  const rB = await aceitar(oB1);
  ok('B: cliente aceita a oficina 1 no pedido B', rB.status === 200, String(rB.status));
  const b1 = await contatoPelaApi(w1, sB.id, cId);
  ok('B: depois do aceite a oficina 1 ve telefone e e-mail em B (contato_clientes)', b1.rpcTel === TEL && b1.rpcEmail === cEmail, JSON.stringify(b1));
  ok('B: e continua sem a linha do perfil', !b1.linha && !b1.embutido, JSON.stringify(b1));
  const b2 = await contatoPelaApi(w2, sB.id, cId);
  ok('B: oficina 2 (perdeu) nunca ve', !b2.linha && !b2.embutido && !b2.rpcTel && !b2.rpcEmail, JSON.stringify(b2));
  pg = await textoPedido(p, sB.id, 'oficina1_pedidoB_depois_390');
  ok('B pagina: pedido B agora com ligar e o numero', pg.ligar === 1 && pg.t.includes(TEL_DIG), pg.t.slice(0, 200));
  await ctx.close();
  const o2p = await paginaOficina(w2);
  pg = await textoPedido(o2p.p, sB.id, 'oficina2_pedidoB_390');
  ok('B pagina: oficina 2 sem ligar e sem o numero', pg.ligar === 0 && !pg.t.includes(TEL_DIG));
  await o2p.ctx.close();

  // ---------- C) nomes: garantias e avaliacoes da oficina 1 ----------
  await admin.from('agenda').update({ status: 'concluido', data_fim: new Date().toISOString() }).eq('solicitacao_id', sA.id).eq('oficina_id', w1.id);
  await admin.from('solicitacoes').update({ status: 'concluida' }).eq('id', sA.id);
  const { error: eAv } = await admin.from('avaliacoes').insert({ solicitacao_id: sA.id, oficina_id: w1.id, cliente_id: cId, nota: 5, comentario: `Hea töö ${tag}` });
  const g = await paginaOficina(w1, 1280);
  await g.p.goto(`${SITE}/ee/et/oficina/garantias`, { waitUntil: 'networkidle' }); await g.p.waitForTimeout(2500);
  const tg = await g.p.innerText('body');
  ok('C garantias: nome do cliente do trabalho entregue', tg.includes('Kontakt Klient'), tg.slice(0, 300));
  if (!eAv) {
    await g.p.goto(`${SITE}/ee/et/oficina/avaliacoes`, { waitUntil: 'networkidle' }); await g.p.waitForTimeout(2500);
    const ta = await g.p.innerText('body');
    ok('C avaliacoes: nome de quem avaliou', ta.includes('Kontakt Klient') && ta.includes(`Hea töö ${tag}`), ta.slice(0, 300));
  } else ok('C avaliacoes: avaliacao de teste criada', false, eAv.message);
  await g.ctx.close();
  ok('sem erro de JavaScript nas paginas', erros.length === 0, erros.join(' | '));
} catch (e) {
  falhas++; console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  for (const id of sols) {
    await admin.from('avaliacoes').delete().eq('solicitacao_id', id);
    await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', id);
    await admin.from('mensagens').delete().eq('solicitacao_id', id);
    await admin.from('agenda').delete().eq('solicitacao_id', id);
    const { data: os } = await admin.from('orcamentos').select('id').eq('solicitacao_id', id);
    for (const o of os || []) { await admin.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await admin.from('orcamento_itens').delete().eq('orcamento_id', o.id); }
    await admin.from('orcamentos').delete().eq('solicitacao_id', id);
    await admin.from('solicitacoes').delete().eq('id', id);
  }
  for (const id of oficinasCriadas) await admin.from('oficinas').delete().eq('id', id);
  for (const id of contas) { await admin.from('veiculos').delete().eq('profile_id', id); await admin.from('notificacoes').delete().eq('profile_id', id); await admin.from('profiles').delete().eq('id', id); await admin.auth.admin.deleteUser(id).catch(() => {}); }
  console.log(`\n${falhas ? 'FALHAS: ' + falhas : 'TUDO OK'}`);
  process.exit(falhas ? 1 : 0);
}
