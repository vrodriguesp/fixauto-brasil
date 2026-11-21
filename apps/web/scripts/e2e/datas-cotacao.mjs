// E2E LOCAL de "preciso de outra data" sempre visivel, preferencia de horario e recusa com motivo
// (migracao 114, decisoes do dono 21/11; Documentos/Analises/Datas_preferencia_2026-11-21/Relatorio.md):
//  A) API: pedir-datas com datas AINDA validas (motivo nao_sobe) nos 2 modos (padrao dias x parte / data + janela 2 h),
//     regras (padrao vazio, janela curta, duplicado); preferencia (PATCH/DELETE, 401/403/400); recusar (motivo, 403, trava);
//  B) motorista (pt, /br/pt, 390x844): pergunta "quando pode levar o carro" na pagina do pedido -> guardar / mudar;
//     cartao com 3 saidas; folha "preciso de outra data" modo dias da semana -> pendente; voltar xN sem reenvio;
//  C) oficina (pt, 1280x800): selo na lista, cartao "cliente precisa de outra data" com o padrao, "motorista prefere"
//     no pedido e no formulario do orcamento (calendario realcado); manda datas novas -> motorista aceita -> agenda/check-in;
//  D) oficina "nao posso" (pedido modo data + janela) -> motorista avisado (sino + e-mail + chat), cartao volta;
//  E) 72 h sem resposta (cron com hora simulada) -> pendente cai, motorista e oficina avisados, cartao volta;
//  F) aceitar a data original com pedido pendente -> pendente cancelado (aceitou_original), agenda criada;
//  G) recusar com motivo pela tela (dica "pedir outra data" quando o motivo e a data) -> oficina ve o motivo;
//  H) validade: pre-preenchida = ultima data + 7, minimo amanha, mudanca manual; "Valido ate" no cartao;
//  I) ecra de sucesso do pedido logado com a pergunta (guardar e pular), voltar depois;
//  J) 6 linguas: pagina do motorista (3 saidas + folhas) e da oficina sem chave crua nem rolagem lateral;
//  K) limpeza.
//   SITE=http://localhost:3107 node datas-cotacao.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { escolherCheckin } from './ajuda-checkin.mjs';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/site-pecas6/apps/web/package.json')('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3107';
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(SITE)) throw new Error('SITE nao e local');
const EMAILS = env.EMAIL_PASTA_TESTE;
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = process.env.TELAS || `${RAIZ}/resultados/datas-cotacao`;
fs.mkdirSync(OUT, { recursive: true });
const WEBMSG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../messages');
const msgWeb = (l) => {
  const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.json`, 'utf8'));
  for (const area of ['cliente', 'oficina', 'misc', 'auth']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.${area}.json`, 'utf8')));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};
const PREFIXO = { pt: '/br/pt', 'pt-PT': '/pt/pt', en: '/ee/en', et: '/ee/et', ru: '/ee/ru', it: '/it/it' };
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anonCli = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const semear = fs.readFileSync(`${RAIZ}/ferramentas/semear.mjs`, 'utf8');
const W1_EMAIL = 'meister.teste@bipfix.test';
const W1_SENHA = (semear.match(/conta\('meister\.teste@bipfix\.test', '([^']+)'/) || [])[1];
if (!W1_SENHA) throw new Error('oficina de teste nao achada no semear.mjs');
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Dc-' + crypto.randomBytes(6).toString('hex');
let falhas = 0, oks = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; else oks++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 300) : ''}`); };
const contas = new Set(); const sols = new Set(); const oficinasCriadas = new Set();
const ip = () => `10.81.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emailsDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort().map((f) => ({ f, html: fs.readFileSync(path.join(EMAILS, f), 'utf8') }));
const esperarEmail = async (email, depois, filtro = () => true) => { for (let i = 0; i < 40; i++) { const e = emailsDe(email, depois).filter(filtro).at(-1); if (e) return e; await sleep(300); } return null; };
const hojeTallinn = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Tallinn' });
const dia = (n) => { const d = new Date(`${hojeTallinn()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
// proximo dia util (seg-sex) a partir de +n: as datas da oficina caem sempre em dia aberto (horario fixo seg-sab no teste)
const diaUtil = (n) => { let d = dia(n); while (dow(d) === 0) d = dia(++n); return d; };

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
const chamar = async (metodo, rota, token, corpo, extra = {}) => { const r = await fetch(`${SITE}${rota}`, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'x-real-ip': ip(), ...extra }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }); return { status: r.status, d: await r.json().catch(() => ({})) }; };
const post = (rota, token, corpo, extra) => chamar('POST', rota, token, corpo, extra);
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const errosJs = [];
// LARGURA_MOTORISTA / LARGURA_OFICINA trocam 390 / 1280 (ex.: 360 para as telas finais no celular)
const contexto = async (largura0, extra = {}) => {
  const largura = largura0 < 500 ? Number(process.env.LARGURA_MOTORISTA || largura0) : Number(process.env.LARGURA_OFICINA || largura0);
  const c = await browser.newContext({ viewport: { width: largura, height: largura < 500 ? 844 : 800 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500,
    locale: 'pt-BR', extraHTTPHeaders: { 'x-real-ip': ip() }, ...extra });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const CRUA = /\b(novasDatas|oficinaNovasDatas|recusaMotivo|preferencia|clienteOrcamentoDetalhe|oficinaSolicitacaoDetalhe|oficinaPedidos|oficinaEnviarOrcamento|seletorCheckin|erros|constants)\.[a-zA-Z_]+|\?\?[a-zA-Z]/;
const design = async (page, nome, sel = 'main button, main a, main input, main select, main textarea, [role=dialog] button') => {
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
const entrarSite = async (ctx, email, s, pref = '/br/pt') => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errosJs.push(`${pref}: ${e.message}`));
  await p.goto(`${SITE}${pref}/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', s);
  await p.click('button[type=submit]'); await p.waitForTimeout(4000);
  return p;
};
const esperarTeste = async (p, id, ms = 15000) => { try { await p.getByTestId(id).first().waitFor({ timeout: ms }); return true; } catch { return false; } };
const foto = async (p, nome) => { await p.screenshot({ path: path.join(OUT, `${nome}.png`), fullPage: false }).catch(() => {}); };
const fotoInteira = async (p, nome) => { await p.screenshot({ path: path.join(OUT, `${nome}.png`), fullPage: true }).catch(() => {}); };
const T = msgWeb('pt'), TE = msgWeb('et');

const INICIO = Date.now();
const TODO_DIA = Object.fromEntries(['seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map((k) => [k, { aberto: true, inicio: '08:00', fim: '18:00' }]).concat([['dom', { aberto: false }]]));
let horarioW1Antes; let of1Id;
try {
  const w1 = await sessao(W1_EMAIL, W1_SENHA);
  const w1Id = (await admin.from('profiles').select('id').eq('email', W1_EMAIL).single()).data.id;
  await admin.from('profiles').update({ idioma: 'et' }).eq('id', w1Id);
  const { data: of1 } = await admin.from('oficinas').select('id, nome_fantasia, horario_funcionamento').eq('profile_id', w1Id).single();
  of1Id = of1.id; horarioW1Antes = of1.horario_funcionamento ?? null;
  await admin.from('oficinas').update({ horario_funcionamento: TODO_DIA }).eq('id', of1.id);
  const w2Email = `dc-of2-${tag}@example.test`;
  const w2Id = await conta(w2Email, senha, { tipo: 'oficina', nome: 'Oficina Dois', idioma: 'ru', telefone: '+372 5000 4445' });
  const { data: of2 } = await admin.from('oficinas').insert({ profile_id: w2Id, nome_fantasia: `Teine Töökoda ${tag}`, endereco: 'Pärnu mnt 20', cidade: 'Tallinn', estado: 'Harjumaa', cep: '10141', pais: 'EE', latitude: 59.43, longitude: 24.745, raio_atendimento_km: 30, especialidades: ['mecanica', 'eletrica', 'pneu', 'manutencao'], ativa: true, horario_funcionamento: TODO_DIA }).select('id').single();
  oficinasCriadas.add(of2.id);
  const w2 = await sessao(w2Email, senha);

  // pedido com o orcamento da oficina 1 (datas FUTURAS) e o da oficina 2 (data futura)
  const novoPedido = async (n, opc = {}) => {
    const cEmail = `dc-cli${n}-${tag}@example.test`;
    const cId = await conta(cEmail, senha, { tipo: 'cliente', nome: `Cliente ${n}`, telefone: '+372 5999 200' + n, idioma: opc.idioma || 'pt' });
    const { data: v } = await admin.from('veiculos').insert({ profile_id: cId, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018', placa: `DC${n}${tag.slice(0, 3).toUpperCase()}` }).select('id').single();
    const { data: sol } = await admin.from('solicitacoes').insert({ cliente_id: cId, veiculo_id: v.id, tipo: 'mecanica', descricao: `Datas cotacao ${n} ${tag}`, urgencia: opc.urgencia || 'media', endereco: 'Pärnu mnt 10, Tallinn', latitude: 59.433, longitude: 24.746, status: 'em_orcamento' }).select('id, numero').single();
    sols.add(sol.id);
    const d1 = diaUtil(5), d2 = diaUtil(7);
    const o1 = (await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of1.id, valor_total: 300, prazo_dias: 2, status: 'enviado', validade: opc.validade1 || dia(14) }).select('id').single()).data;
    await admin.from('orcamento_itens').insert({ orcamento_id: o1.id, descricao: 'Remont', tipo: 'mao_de_obra', valor_unitario: 300, quantidade: 1, valor_total: 300 });
    const { data: slots } = await admin.from('orcamento_disponibilidade').insert([
      { orcamento_id: o1.id, data_checkin: d1, turno: 'manha', hora_inicio: '09:00', hora_fim: '11:00', data_previsao_entrega: diaUtil(7) },
      { orcamento_id: o1.id, data_checkin: d2, turno: 'tarde', hora_inicio: '14:00', hora_fim: '16:00', data_previsao_entrega: diaUtil(9) },
    ]).select('id, data_checkin');
    const o2 = (await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of2.id, valor_total: 350, prazo_dias: 2, status: 'enviado', validade: dia(14) }).select('id').single()).data;
    await admin.from('orcamento_disponibilidade').insert({ orcamento_id: o2.id, data_checkin: diaUtil(4), turno: 'manha', hora_inicio: '08:00', hora_fim: '10:00', data_previsao_entrega: diaUtil(6) });
    const cli = await sessao(cEmail, senha);
    return { cEmail, cId, cli, sol, o1, o2, s1: slots[0], d1, d2 };
  };
  const pedidoDatas = async (orcId) => (await admin.from('orcamento_pedido_datas').select('*').eq('orcamento_id', orcId).order('created_at', { ascending: false }).limit(1).maybeSingle()).data;
  const cron = async (agora) => post('/api/tarefas/limpar-pendentes', null, agora ? { agora } : {}, { 'x-tarefa-chave': env.TAREFAS_CHAVE });

  // ================= A) regras da API =================
  const A = await novoPedido(1);
  {
    let r = await post(`/api/orcamento/${A.o1.id}/pedir-datas`, A.cli.token, { padrao: { dias: [] } });
    ok('A: padrao sem dias -> SUGESTAO_INVALIDA', r.status === 400 && r.d.codigo === 'SUGESTAO_INVALIDA', JSON.stringify(r));
    r = await post(`/api/orcamento/${A.o1.id}/pedir-datas`, A.cli.token, { padrao: { dias: [1, 9] } });
    ok('A: padrao com dia 9 -> SUGESTAO_INVALIDA', r.status === 400 && r.d.codigo === 'SUGESTAO_INVALIDA', JSON.stringify(r));
    r = await post(`/api/orcamento/${A.o1.id}/pedir-datas`, A.cli.token, { sugestoes: [{ data: diaUtil(3), turno: 'manha', janela: { inicio: '09:00', fim: '09:30' } }] });
    ok('A: janela de 30 min -> SUGESTAO_INVALIDA (1 h a 4 h)', r.status === 400 && r.d.codigo === 'SUGESTAO_INVALIDA', JSON.stringify(r));
    r = await post(`/api/orcamento/${A.o1.id}/pedir-datas`, A.cli.token, { sugestoes: [{ data: diaUtil(3), turno: 'manha', janela: { inicio: '14:00', fim: '16:00' } }] });
    ok('A: datas AINDA validas + janela 14-16 -> aceito (motivo nao_sobe, turno pela janela)', r.status === 200 && r.d.motivo === 'nao_sobe' && r.d.sugestoes?.[0]?.turno === 'tarde', JSON.stringify(r));
    r = await post(`/api/orcamento/${A.o1.id}/pedir-datas`, A.cli.token, { padrao: { dias: [2, 4], partes: ['tarde'] } });
    ok('A: segundo pedido -> PEDIDO_DATAS_PENDENTE', r.status === 409 && r.d.codigo === 'PEDIDO_DATAS_PENDENTE', JSON.stringify(r));
    const pd = await pedidoDatas(A.o1.id);
    ok('A: gravado tipo datas, motivo nao_sobe, janela no jsonb', pd?.status === 'pendente' && pd.tipo === 'datas' && pd.motivo === 'nao_sobe' && pd.sugestoes[0].janela?.inicio === '14:00', JSON.stringify(pd));
    r = await post(`/api/orcamento/${A.o2.id}/pedir-datas`, A.cli.token, { padrao: { dias: [1, 2, 5], partes: ['manha', 'tarde'] } });
    ok('A: outro orcamento, modo padrao (manha+tarde = tanto faz) -> aceito', r.status === 200 && r.d.padrao?.dias?.length === 3 && r.d.padrao.partes.length === 0, JSON.stringify(r));
    // preferencia
    r = await chamar('PATCH', `/api/solicitacoes/${A.sol.id}/preferencia`, null, { dias: [1] });
    ok('A: preferencia sem login -> 401', r.status === 401, JSON.stringify(r));
    r = await chamar('PATCH', `/api/solicitacoes/${A.sol.id}/preferencia`, w2.token, { dias: [1] });
    ok('A: preferencia por outra pessoa -> 403', r.status === 403, JSON.stringify(r));
    r = await chamar('PATCH', `/api/solicitacoes/${A.sol.id}/preferencia`, A.cli.token, { dias: [0, 7] });
    ok('A: preferencia com dias invalidos -> DADOS_INVALIDOS', r.status === 400 && r.d.codigo === 'DADOS_INVALIDOS', JSON.stringify(r));
    r = await chamar('PATCH', `/api/solicitacoes/${A.sol.id}/preferencia`, A.cli.token, {});
    ok('A: preferencia vazia -> DADOS_INVALIDOS', r.status === 400, JSON.stringify(r));
    r = await chamar('PATCH', `/api/solicitacoes/${A.sol.id}/preferencia`, A.cli.token, { dias: [2, 4], partes: ['tarde'], opcao: null });
    const { data: s1 } = await admin.from('solicitacoes').select('preferencia_horario, preferencia_em').eq('id', A.sol.id).single();
    ok('A: preferencia gravada (ter/qui a tarde) com preferencia_em', r.status === 200 && s1.preferencia_horario?.dias?.join() === '2,4' && s1.preferencia_horario.partes[0] === 'tarde' && !!s1.preferencia_em, JSON.stringify(s1));
    r = await chamar('PATCH', `/api/solicitacoes/${A.sol.id}/preferencia`, A.cli.token, { dias: [1, 3], opcao: 'qualquer' });
    ok('A: "qualquer dia util" dispensa a lista de dias', r.status === 200 && r.d.preferencia?.opcao === 'qualquer' && r.d.preferencia.dias.length === 0, JSON.stringify(r));
    r = await chamar('DELETE', `/api/solicitacoes/${A.sol.id}/preferencia`, A.cli.token);
    const { data: s2 } = await admin.from('solicitacoes').select('preferencia_horario').eq('id', A.sol.id).single();
    ok('A: DELETE apaga a preferencia', r.status === 200 && s2.preferencia_horario === null, JSON.stringify(s2));
    // recusar
    r = await post(`/api/orcamento/${A.o2.id}/recusar`, A.cli.token, { motivo: 'caro' });
    ok('A: recusar com motivo invalido -> DADOS_INVALIDOS', r.status === 400, JSON.stringify(r));
    r = await post(`/api/orcamento/${A.o2.id}/recusar`, w2.token, { motivo: 'preco' });
    ok('A: recusar por outra pessoa -> 403', r.status === 403, JSON.stringify(r));
    r = await post(`/api/orcamento/${A.o2.id}/recusar`, A.cli.token, { motivo: 'preco' });
    const { data: o2 } = await admin.from('orcamentos').select('status, recusado_motivo, recusado_em').eq('id', A.o2.id).single();
    const pd2 = await pedidoDatas(A.o2.id);
    ok('A: recusar com motivo preco -> recusado + motivo + pedido de data pendente cancelado (recusou); outrosAtivos = 1', r.status === 200 && r.d.outrosAtivos === 1 && o2.status === 'recusado' && o2.recusado_motivo === 'preco' && !!o2.recusado_em && pd2.status === 'cancelado' && pd2.cancelado_motivo === 'recusou', JSON.stringify({ r, o2, pd2 }));
    r = await post(`/api/orcamento/${A.o2.id}/recusar`, A.cli.token, { motivo: 'outro' });
    ok('A: recusar de novo -> ORCAMENTO_INDISPONIVEL (trava)', r.status === 409 && r.d.codigo === 'ORCAMENTO_INDISPONIVEL', JSON.stringify(r));
    // RLS: cliente nao grava direto o motivo em pedido de outro
    const { error: eRls } = await A.cli.c.from('orcamento_pedido_datas').update({ resposta: 'nao_pode' }).eq('id', pd.id);
    const pdDepois = await pedidoDatas(A.o1.id);
    ok('A: RLS - cliente nao altera orcamento_pedido_datas direto', !!eRls || pdDepois.resposta !== 'nao_pode', eRls?.message);
  }

  // ================= B) motorista pela tela (pt, 390) =================
  const B = await novoPedido(2);
  const tB = Date.now();
  {
    const ctx = await contexto(390);
    const p = await entrarSite(ctx, B.cEmail, senha);
    await p.goto(`${SITE}/br/pt/cliente/orcamentos/${B.sol.id}`, { waitUntil: 'networkidle' });
    ok('B: pergunta "quando voce pode levar o carro" no topo do pedido aberto', await esperarTeste(p, 'preferencia-horario'));
    await design(p, 'B: pedido do motorista com a pergunta (pt, 390)');
    await foto(p, 'motorista_01_pergunta_quando_pode');
    const orc1 = p.locator(`#orc-${B.o1.id}`);
    ok('B: cartao com 3 saidas (aceitar / preciso de outra data / recusar)', (await orc1.getByTestId('aceitar-agendar').count()) === 1 && (await orc1.getByTestId('abrir-pedir-datas').count()) === 1 && (await orc1.getByTestId('abrir-recusar').count()) === 1);
    ok('B: "Valido ate" em letra legivel no cartao', (await orc1.getByTestId('validade-orcamento').innerText()).includes(T('clienteOrcamentoDetalhe.validUntil', { date: '' }).replace(/\s*$/, '').trim().split(' ')[0]));
    const alt = await orc1.getByTestId('abrir-pedir-datas').evaluate((e) => getComputedStyle(e).minHeight);
    ok('B: botao "preciso de outra data" com alvo >= 48 px', parseInt(alt) >= 48, alt);
    // preferencia: ter + qui + tarde -> guardar
    await p.getByTestId('pref-dia-2').click(); await p.getByTestId('pref-dia-4').click(); await p.getByTestId('pref-tarde').click();
    await p.getByTestId('pref-guardar').click();
    ok('B: guardou -> "Guardado" e a linha "quando voce pode levar o carro: ter, qui · a tarde"', await esperarTeste(p, 'preferencia-feito') && /ter.*qui/i.test(await p.getByTestId('preferencia-guardada').innerText()), await p.getByTestId('preferencia-guardada').innerText().catch(() => ''));
    await foto(p, 'motorista_02_preferencia_guardada');
    const { data: sB } = await admin.from('solicitacoes').select('preferencia_horario').eq('id', B.sol.id).single();
    ok('B: preferencia no banco', sB.preferencia_horario?.dias?.join() === '2,4' && sB.preferencia_horario.partes[0] === 'tarde', JSON.stringify(sB));
    await p.getByTestId('preferencia-mudar').click();
    ok('B: "Mudar" reabre as fichas', await esperarTeste(p, 'pref-dias', 5000));
    await p.getByTestId('pref-pular').click();
    ok('B: "Agora nao" fecha e mantem a escolha guardada', await esperarTeste(p, 'preferencia-guardada', 5000));
    // folha "preciso de outra data": modo dias da semana
    await orc1.getByTestId('abrir-pedir-datas').click();
    ok('B: folha "quando te serve?" abre (dialogo, foco no modo)', await esperarTeste(p, 'folha-outra-data') && (await p.locator('[role=dialog]').count()) === 1);
    await p.getByTestId('dia-semana-2').click(); await p.getByTestId('dia-semana-4').click(); await p.getByTestId('parte-manha').click();
    await p.getByTestId('mensagem-datas').fill(`Posso levar antes do trabalho ${tag}`);
    await design(p, 'B: folha modo dias da semana (pt, 390)', '[role=dialog] button, [role=dialog] textarea');
    await foto(p, 'motorista_03_folha_dias_semana');
    await p.getByTestId('modo-data').click();
    const nDias = await p.locator('[data-testid^="dia-20"]').count();
    ok('B: modo data certa lista os proximos dias abertos', nDias >= 8, String(nDias));
    await p.locator('[data-testid^="dia-20"]').nth(1).click();
    const nJan = await p.locator('[data-testid^="chip-20"]').count();
    ok('B: dia escolhido mostra janelas de 2 h (08-10, 10-12...)', nJan >= 3, String(nJan));
    await p.locator('[data-testid^="chip-20"]').nth(1).click();
    await foto(p, 'motorista_04_folha_data_certa');
    await p.getByTestId('modo-dias').click();
    await p.getByTestId('enviar-pedir-datas').click();
    ok('B: enviado -> "pedido enviado a oficina" com o que pediu; data original continua', await esperarTeste(p, 'novas-datas-pendente') && /ter.*qui/i.test(await p.getByTestId('novas-datas-pendente').innerText()) && (await p.getByTestId('novas-datas-pendente').innerText()).includes(T('novasDatas.originalContinua')), await p.getByTestId('novas-datas-pendente').innerText().catch(() => ''));
    ok('B: "aceitar e agendar" continua no cartao com pedido pendente', (await orc1.getByTestId('aceitar-agendar').count()) === 1);
    await foto(p, 'motorista_05_pedido_enviado');
    // voltar xN: nenhum reenvio, nenhuma armadilha
    const urlAntes = p.url();
    for (let i = 0; i < 3; i++) { await p.goBack().catch(() => {}); await p.waitForTimeout(600); }
    const pdB = await pedidoDatas(B.o1.id);
    const { count: nPed } = await admin.from('orcamento_pedido_datas').select('id', { count: 'exact', head: true }).eq('orcamento_id', B.o1.id);
    ok('B: voltar x3 depois de enviar: 1 pedido so, sem reenvio, pagina mudou', nPed === 1 && p.url() !== urlAntes, `${nPed} ${p.url()}`);
    ok('B: pedido gravado tipo padrao (ter/qui de manha), motivo nao_sobe, mensagem', pdB?.status === 'pendente' && pdB.tipo === 'padrao' && pdB.padrao.dias.join() === '2,4' && pdB.padrao.partes[0] === 'manha' && pdB.motivo === 'nao_sobe' && pdB.mensagem === `Posso levar antes do trabalho ${tag}`, JSON.stringify(pdB));
    await ctx.close();
  }
  {
    const { data: nOf } = await admin.from('notificacoes').select('tipo, titulo, mensagem, dados').eq('profile_id', w1Id).eq('dados->>orcamento_id', B.o1.id);
    const n = (nOf || []).find((x) => x.tipo === 'pedido_novas_datas');
    ok('B: oficina avisada em et ("Klient vajab teist aega") com 6 linguas', n?.titulo === 'Klient vajab teist aega' && Object.keys(n.dados?.textos || {}).length === 6 && n.dados.motivo === 'nao_sobe', JSON.stringify(nOf));
    const { data: chat } = await admin.from('mensagens').select('texto, remetente_id').eq('solicitacao_id', B.sol.id).eq('oficina_id', of1.id);
    ok('B: linha no chat (pt): "preciso de outra data" + o que serve + recado', (chat || []).some((m) => m.remetente_id === B.cId && m.texto.includes('outra data') && /ter.*qui/i.test(m.texto) && m.texto.includes(tag)), JSON.stringify(chat));
    const em = await esperarEmail(W1_EMAIL, tB, (e) => e.html.includes('Klient vajab teist aega'));
    ok('B: e-mail a oficina (et) com "Mis kliendile sobib", o recado e o link curto', !!em && em.html.includes('Mis kliendile sobib') && em.html.includes(tag) && em.html.includes(`/r/${B.sol.numero}?o=et&p=1`) && !em.html.includes('/oficina/pedidos'), em?.f);
    ok('B: sem SMS para este evento (regra atual: so orcamento_auto/manual)', (await admin.from('sms_envios').select('id', { count: 'exact', head: true }).eq('solicitacao_id', B.sol.id)).count === 0);
  }

  // ================= C) oficina pela tela (pt, 1280): selo, cartao, preferencia, calendario, manda datas =================
  {
    const ctx = await contexto(1280);
    const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA);
    await p.goto(`${SITE}/br/pt/oficina/pedidos?aba=respondidos`, { waitUntil: 'networkidle' });
    await esperarTeste(p, 'pedido-cartao'); await sleep(1500);
    const cartao = p.locator('[data-testid="pedido-cartao"]', { hasText: `Datas cotacao 2 ${tag}` });
    ok(`C: selo "${T('oficinaNovasDatas.selo')}" na lista`, (await cartao.count()) === 1 && (await cartao.getByTestId('selo-novas-datas').count()) === 1 && (await cartao.innerText()).includes(T('oficinaNovasDatas.selo')), (await cartao.count()) ? await cartao.innerText() : 'sem cartao');
    await cartao.first().evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); await sleep(300);
    await foto(p, 'oficina_01_lista_selo');
    await p.goto(`${SITE}/br/pt/oficina/pedidos/${B.sol.id}`, { waitUntil: 'networkidle' });
    const tem = await esperarTeste(p, 'novas-datas-pedidas');
    const tc = tem ? await p.getByTestId('novas-datas-pedidas').innerText() : '';
    ok('C: cartao "o cliente precisa de outra data" com o padrao (ter, qui · de manha) e o recado', tem && tc.includes(T('oficinaNovasDatas.tituloOutraData')) && (await p.getByTestId('padrao-cliente').count()) === 1 && /ter.*qui/i.test(await p.getByTestId('padrao-cliente').innerText()) && tc.includes(tag), tc);
    ok('C: "motorista prefere: ter, qui · a tarde" no pedido', (await p.getByTestId('preferencia-motorista').count()) >= 1 && /ter.*qui/i.test(await p.getByTestId('preferencia-motorista').first().innerText()), await p.getByTestId('preferencia-motorista').first().innerText().catch(() => ''));
    ok('C: botao "nao posso nessa data" no cartao', (await p.getByTestId('nao-posso-abrir').count()) === 1);
    await design(p, 'C: pedido da oficina (pt, 1280)');
    await foto(p, 'oficina_02_pedido_cartao_outra_data');
    // formulario do orcamento: preferencia + calendario realcado
    await p.goto(`${SITE}/br/pt/oficina/orcamento/${B.sol.id}`, { waitUntil: 'networkidle' });
    await sleep(1500);
    ok('C: formulario do orcamento mostra "motorista prefere"', (await p.getByTestId('preferencia-motorista').count()) >= 1);
    await foto(p, 'oficina_03_formulario_preferencia');
    if (await p.getByTestId('ck-adicionar').count()) {
      await p.getByTestId('ck-adicionar').click(); await esperarTeste(p, 'ck-folha', 8000);
      const pref = await p.locator('[data-testid^="ck-dia-"][data-preferido="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').slice(-10)));
      const todosTerQui = pref.length > 0 && pref.every((d) => [2, 4].includes(new Date(`${d}T12:00:00Z`).getUTCDay()));
      ok('C: calendario realca so tercas e quintas (dias preferidos)', todosTerQui, JSON.stringify(pref.slice(0, 5)));
      const rot = await p.locator('[data-testid^="ck-dia-"][data-preferido="true"]').first().getAttribute('aria-label');
      ok('C: leitor de tela ouve "serve ao motorista" no dia realcado', (rot || '').includes(T('seletorCheckin.diaPreferido')), rot);
      await foto(p, 'oficina_04_calendario_realcado');
      await p.keyboard.press('Escape');
    } else ok('C: formulario com seletor de datas (revisao de orcamento ja enviado)', false, 'sem ck-adicionar');
    // responde com datas novas pela tela do pedido
    await p.goto(`${SITE}/br/pt/oficina/pedidos/${B.sol.id}`, { waitUntil: 'networkidle' });
    await esperarTeste(p, 'novas-datas-pedidas');
    const esc = await escolherCheckin(p, { pre: 'nd', dia: diaUtil(9), faixa: 'manha' });
    await p.getByTestId('nd-enviar').click();
    ok('C: "mandar datas ao cliente" -> feito', await esperarTeste(p, 'novas-datas-feito'));
    const pdC = await pedidoDatas(B.o1.id);
    ok('C: pedido atendido (novas_datas)', pdC.status === 'atendido' && pdC.resposta === 'novas_datas', JSON.stringify(pdC));
    const { data: slots } = await admin.from('orcamento_disponibilidade').select('id, data_checkin, hora_inicio').eq('orcamento_id', B.o1.id).eq('data_checkin', esc.dia);
    ok('C: horario novo gravado no orcamento (mesmo valor, sem revisao)', slots?.length === 1 && (await admin.from('orcamentos').select('valor_total, revisao_numero').eq('id', B.o1.id).single()).data.revisao_numero === 0, JSON.stringify(slots));
    // motorista aceita a data nova -> agenda/check-in como hoje
    const rA = await post('/api/aceitar-orcamento', B.cli.token, { orcamentoId: B.o1.id, slotId: slots[0].id });
    const { data: ag } = await admin.from('agenda').select('status, data_inicio, checkin_ate, oficina_id').eq('solicitacao_id', B.sol.id).eq('status', 'agendado');
    ok('C: motorista aceita a data nova -> agenda criada na oficina com janela de check-in', rA.status === 200 && ag?.length === 1 && ag[0].oficina_id === of1.id && !!ag[0].checkin_ate, JSON.stringify({ rA, ag }));
    await ctx.close();
  }

  // ================= D) oficina "nao posso" =================
  const D = await novoPedido(3);
  const tD = Date.now();
  {
    const r = await post(`/api/orcamento/${D.o1.id}/pedir-datas`, D.cli.token, { sugestoes: [{ data: diaUtil(6), turno: 'manha', janela: { inicio: '10:00', fim: '12:00' } }, { data: diaUtil(8), turno: 'tarde', janela: { inicio: '14:00', fim: '16:00' } }] });
    ok('D: pedido modo data certa com 2 janelas', r.status === 200 && r.d.sugestoes.length === 2, JSON.stringify(r));
    const ctx = await contexto(1280);
    const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA);
    await p.goto(`${SITE}/br/pt/oficina/pedidos/${D.sol.id}`, { waitUntil: 'networkidle' });
    await esperarTeste(p, 'novas-datas-pedidas');
    const s0 = await p.getByTestId('sugestao-0-texto').innerText();
    ok('D: a sugestao mostra a janela escolhida pelo motorista (10:00–12:00)', s0.includes('10:00') && s0.includes('12:00'), s0);
    await p.getByTestId('nao-posso-abrir').click();
    await p.getByTestId('nao-posso-texto').fill(`Esta semana está tudo ocupado ${tag}`);
    await foto(p, 'oficina_05_nao_posso');
    await p.getByTestId('nao-posso-enviar').click();
    ok('D: "nao posso" -> feito', await esperarTeste(p, 'novas-datas-feito') && (await p.getByTestId('novas-datas-feito').innerText()).includes(T('oficinaNovasDatas.feitoNaoPosso')));
    await ctx.close();
    const pd = await pedidoDatas(D.o1.id);
    ok('D: pedido atendido com resposta nao_pode + texto', pd.status === 'atendido' && pd.resposta === 'nao_pode' && pd.resposta_texto?.includes(tag), JSON.stringify(pd));
    const { data: nCli } = await admin.from('notificacoes').select('tipo, titulo, dados').eq('profile_id', D.cId);
    ok('D: motorista avisado (pt: "A oficina nao pode na data pedida")', (nCli || []).some((n) => n.tipo === 'novas_datas_nao_pode' && n.titulo === 'A oficina não pode na data pedida' && Object.keys(n.dados?.textos || {}).length === 6), JSON.stringify(nCli));
    const em = await esperarEmail(D.cEmail, tD, (e) => e.html.includes('não pode na data pedida'));
    ok('D: e-mail ao motorista com o recado e link /r/<numero> (sem slug em portugues)', !!em && em.html.includes(tag) && /\/r\/\d+/.test(em.html) && !em.html.includes('/cliente/orcamentos'), em?.f);
    const { data: chat } = await admin.from('mensagens').select('texto, remetente_id').eq('solicitacao_id', D.sol.id).eq('oficina_id', of1.id);
    ok('D: linha no chat da oficina ("ei saa" em et)', (chat || []).some((m) => m.remetente_id === w1Id && /ei saa/i.test(m.texto)), JSON.stringify(chat));
    const ctx2 = await contexto(390);
    const p2 = await entrarSite(ctx2, D.cEmail, senha);
    await p2.goto(`${SITE}/br/pt/cliente/orcamentos/${D.sol.id}`, { waitUntil: 'networkidle' });
    const orc1 = p2.locator(`#orc-${D.o1.id}`);
    ok('D: cartao do motorista: aviso "a oficina nao pode" + 3 saidas de volta', await esperarTeste(p2, 'novas-datas-nao-pode') && (await orc1.getByTestId('abrir-pedir-datas').count()) === 1 && (await orc1.getByTestId('aceitar-agendar').count()) === 1);
    await foto(p2, 'motorista_06_oficina_nao_pode');
    await p2.getByTestId('novas-datas-nao-pode').getByRole('button').click();
    ok('D: "entendi" fecha o aviso', (await p2.getByTestId('novas-datas-nao-pode').count()) === 0);
    const r2 = await post(`/api/orcamento/${D.o1.id}/pedir-datas`, D.cli.token, { padrao: { dias: [6] } });
    ok('D: pode pedir de novo depois do "nao posso"', r2.status === 200, JSON.stringify(r2));
    await ctx2.close();
  }

  // ================= E) 72 h sem resposta =================
  const E = await novoPedido(4);
  const tE = Date.now();
  {
    const r = await post(`/api/orcamento/${E.o1.id}/pedir-datas`, E.cli.token, { padrao: { dias: [1, 2, 3], partes: ['manha'] } });
    ok('E: pedido pendente', r.status === 200);
    const pd0 = await pedidoDatas(E.o1.id);
    const antes = new Date(Date.now() - 73 * 3600e3).toISOString();
    await admin.from('orcamento_pedido_datas').update({ created_at: antes, lembrete_em: antes }).eq('id', pd0.id);
    const c = await cron();
    ok('E: cron -> semResposta >= 1', c.status === 200 && (c.d.novasDatas?.semResposta || 0) >= 1, JSON.stringify(c));
    const pd = await pedidoDatas(E.o1.id);
    ok('E: pendente cancelado com motivo sem_resposta_72h', pd.status === 'cancelado' && pd.cancelado_motivo === 'sem_resposta_72h' && !!pd.cancelado_em, JSON.stringify(pd));
    const { data: nCli } = await admin.from('notificacoes').select('tipo, titulo').eq('profile_id', E.cId);
    ok('E: motorista avisado ("A oficina nao respondeu")', (nCli || []).some((n) => n.tipo === 'novas_datas_sem_resposta' && n.titulo === 'A oficina não respondeu'), JSON.stringify(nCli));
    const { data: nOf } = await admin.from('notificacoes').select('tipo, titulo, dados').eq('profile_id', w1Id).eq('dados->>orcamento_id', E.o1.id);
    ok('E: oficina avisada (et "Teise aja soov on lõppenud")', (nOf || []).some((n) => n.tipo === 'pedido_novas_datas_cancelado' && n.titulo === 'Teise aja soov on lõppenud'), JSON.stringify(nOf));
    const em = await esperarEmail(E.cEmail, tE, (e) => e.html.includes('não respondeu'));
    ok('E: e-mail ao motorista "a oficina nao respondeu" com link curto', !!em && /\/r\/\d+/.test(em.html), em?.f);
    const c2 = await cron();
    ok('E: segundo cron nao repete', (c2.d.novasDatas?.semResposta || 0) === 0, JSON.stringify(c2.d));
    const ctx = await contexto(390);
    const p = await entrarSite(ctx, E.cEmail, senha);
    await p.goto(`${SITE}/br/pt/cliente/orcamentos/${E.sol.id}`, { waitUntil: 'networkidle' });
    ok('E: cartao do motorista: "a oficina nao respondeu" + pode aceitar a original ou pedir de novo', await esperarTeste(p, 'novas-datas-sem-resposta') && (await p.locator(`#orc-${E.o1.id}`).getByTestId('aceitar-agendar').count()) === 1 && (await p.locator(`#orc-${E.o1.id}`).getByTestId('abrir-pedir-datas').count()) === 1);
    await foto(p, 'motorista_07_oficina_nao_respondeu');
    await ctx.close();
    // orcamento vence com pendente: cron cancela com orcamento_vencido
    const r3 = await post(`/api/orcamento/${E.o1.id}/pedir-datas`, E.cli.token, { padrao: { dias: [5] } });
    await admin.from('orcamentos').update({ validade: dia(-1) }).eq('id', E.o1.id);
    await cron();
    const pd3 = await pedidoDatas(E.o1.id);
    ok('E: orcamento venceu com pedido pendente -> cancelado (orcamento_vencido)', r3.status === 200 && pd3.status === 'cancelado' && pd3.cancelado_motivo === 'orcamento_vencido', JSON.stringify(pd3));
  }

  // ================= F) aceitar a data original com pedido pendente =================
  const F = await novoPedido(5);
  {
    const r = await post(`/api/orcamento/${F.o1.id}/pedir-datas`, F.cli.token, { padrao: { dias: [3] } });
    const r2 = await post(`/api/orcamento/${F.o2.id}/pedir-datas`, F.cli.token, { padrao: { dias: [4] } });
    ok('F: pedidos pendentes nas 2 oficinas', r.status === 200 && r2.status === 200);
    const rA = await post('/api/aceitar-orcamento', F.cli.token, { orcamentoId: F.o1.id, slotId: F.s1.id });
    const pd1 = await pedidoDatas(F.o1.id), pd2 = await pedidoDatas(F.o2.id);
    const { data: ag } = await admin.from('agenda').select('status').eq('solicitacao_id', F.sol.id).eq('status', 'agendado');
    ok('F: aceitou a original -> pendente da oficina escolhida cai (aceitou_original), da outra cai (outra_oficina), agenda criada', rA.status === 200 && pd1.status === 'cancelado' && pd1.cancelado_motivo === 'aceitou_original' && pd2.status === 'cancelado' && pd2.cancelado_motivo === 'outra_oficina' && ag?.length === 1, JSON.stringify({ rA, pd1, pd2 }));
    const { data: nOf2 } = await admin.from('notificacoes').select('tipo').eq('profile_id', w2Id).eq('dados->>orcamento_id', F.o2.id);
    ok('F: a outra oficina e avisada de que nao precisa responder', (nOf2 || []).some((n) => n.tipo === 'pedido_novas_datas_cancelado'), JSON.stringify(nOf2));
    const r3 = await post(`/api/orcamento/${F.o1.id}/pedir-datas`, F.cli.token, { padrao: { dias: [3] } });
    ok('F: depois do aceite nao pede mais -> ORCAMENTO_INDISPONIVEL', r3.status === 409 && r3.d.codigo === 'ORCAMENTO_INDISPONIVEL', JSON.stringify(r3));
  }

  // ================= G) recusar com motivo pela tela =================
  const G = await novoPedido(6);
  {
    const ctx = await contexto(390);
    const p = await entrarSite(ctx, G.cEmail, senha);
    await p.goto(`${SITE}/br/pt/cliente/orcamentos/${G.sol.id}`, { waitUntil: 'networkidle' });
    await esperarTeste(p, 'acoes-orcamento');
    const orc1 = p.locator(`#orc-${G.o1.id}`);
    await orc1.getByTestId('abrir-recusar').click();
    ok('G: folha "por que este orcamento nao serve?" com 5 motivos', await esperarTeste(p, 'folha-recusar') && (await p.locator('[data-testid^="motivo-"]').count()) === 5);
    await p.getByTestId('motivo-data').click();
    ok('G: motivo "a data nao serve" -> dica para pedir outra data', await esperarTeste(p, 'dica-pedir-data', 3000));
    await design(p, 'G: folha da recusa (pt, 390)', '[role=dialog] button');
    await foto(p, 'motorista_08_recusar_motivo');
    await p.getByTestId('recusar-pedir-data').click();
    ok('G: "pedir outra data" fecha a recusa e abre a folha de outra data', await esperarTeste(p, 'folha-outra-data', 5000) && (await p.getByTestId('folha-recusar').count()) === 0);
    await p.keyboard.press('Escape');
    ok('G: Esc fecha a folha', (await p.getByTestId('folha-outra-data').count()) === 0);
    await orc1.getByTestId('abrir-recusar').click();
    await p.getByTestId('motivo-preco').click();
    p.once('dialog', (d) => d.dismiss());
    await p.getByTestId('confirmar-recusar').click();
    await sleep(3000);
    const { data: o1 } = await admin.from('orcamentos').select('status, recusado_motivo').eq('id', G.o1.id).single();
    ok('G: recusado com motivo preco pela tela', o1.status === 'recusado' && o1.recusado_motivo === 'preco', JSON.stringify(o1));
    for (let i = 0; i < 2; i++) { await p.goBack().catch(() => {}); await p.waitForTimeout(500); }
    const { data: o1b } = await admin.from('orcamentos').select('status').eq('id', G.o1.id).single();
    ok('G: voltar x2 depois da recusa: nada muda', o1b.status === 'recusado');
    await ctx.close();
    const ctx2 = await contexto(1280);
    const p2 = await entrarSite(ctx2, W1_EMAIL, W1_SENHA);
    await p2.goto(`${SITE}/br/pt/oficina/pedidos/${G.sol.id}`, { waitUntil: 'networkidle' });
    ok('G: oficina ve "motivo da recusa: preco" no pedido', await esperarTeste(p2, 'recusa-motivo') && (await p2.getByTestId('recusa-motivo').innerText()).includes(T('oficinaSolicitacaoDetalhe.recusaMotivos.preco')), await p2.getByTestId('recusa-motivo').innerText().catch(() => ''));
    await foto(p2, 'oficina_06_motivo_recusa');
    await p2.goto(`${SITE}/br/pt/oficina/pedidos?aba=encerrados`, { waitUntil: 'networkidle' });
    await esperarTeste(p2, 'pedido-cartao'); await sleep(1200);
    const cartao = p2.locator('[data-testid="pedido-cartao"]', { hasText: `Datas cotacao 6 ${tag}` });
    ok('G: lista da oficina mostra "cliente recusou — preco"', (await cartao.count()) === 1 && (await cartao.innerText()).includes(T('oficinaPedidos.recusaMotivos.preco')), (await cartao.count()) ? await cartao.innerText() : 'sem cartao');
    await ctx2.close();
  }

  // ================= H) validade: pre-preenchida = ultima data + 7, minimo amanha, manual =================
  const H = await novoPedido(7);
  {
    await admin.from('orcamentos').delete().eq('id', H.o1.id); // a oficina 1 ainda vai orcar pela tela
    const ctx = await contexto(1280);
    const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA);
    await p.goto(`${SITE}/br/pt/oficina/orcamento/${H.sol.id}`, { waitUntil: 'networkidle' });
    await esperarTeste(p, 'ck-adicionar');
    const minAntes = await p.locator('#cacb1-103').getAttribute('min');
    ok('H: validade minima = amanha (nunca hoje)', minAntes === dia(1), `${minAntes} vs ${dia(1)}`);
    const esc = await escolherCheckin(p, { pre: 'ck', dia: diaUtil(6), faixa: 'manha' });
    await sleep(400);
    const val = await p.locator('#cacb1-103').inputValue();
    const esperado = (() => { const d = new Date(`${esc.dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 7); let y = d.toISOString().slice(0, 10); while (dow(y) === 0) { const e = new Date(`${y}T12:00:00Z`); e.setUTCDate(e.getUTCDate() + 1); y = e.toISOString().slice(0, 10); } return y; })();
    ok('H: validade pre-preenchida = ultima data + 7 (dia aberto)', val === esperado && (await p.getByTestId('validade-auto').count()) === 1, `${val} vs ${esperado}`);
    await p.locator('#cacb1-103').evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); await sleep(300);
    await foto(p, 'oficina_07_validade_prefill');
    await p.locator('#cacb1-103').fill(dia(20));
    ok('H: a oficina muda a validade a mao', (await p.locator('#cacb1-103').inputValue()) === dia(20));
    await ctx.close();
  }

  // ================= I) ecra de sucesso do pedido logado =================
  {
    const cEmail = `dc-cli8-${tag}@example.test`;
    const cId = await conta(cEmail, senha, { tipo: 'cliente', nome: 'Cliente 8', telefone: '+372 5999 2008', idioma: 'pt' });
    await admin.from('veiculos').insert({ profile_id: cId, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Yaris', fipe_ano: '2019', placa: `DC8${tag.slice(0, 3).toUpperCase()}` });
    const ctx = await contexto(390);
    const p = await entrarSite(ctx, cEmail, senha);
    // sem rede externa: sugestoes de endereco e geocodificacao respondidas aqui (o que importa e o ecra de sucesso)
    await ctx.route('**/api/endereco/sugestoes**', (r) => r.fulfill({ json: { sugestoes: [{ rotulo: 'Pärnu mnt 10, Tallinn', latitude: 59.433, longitude: 24.746, paisCodigo: 'EE' }] } }));
    await ctx.route('**/api/geocode**', (r) => r.fulfill({ json: { latitude: 59.433, longitude: 24.746, paisCodigo: 'EE' } }));
    await p.goto(`${SITE}/br/pt/cliente/nova-solicitacao`, { waitUntil: 'networkidle' });
    await sleep(1500);
    // os 5 passos do formulario logado: carro -> tipo -> (foto opcional) -> descricao -> endereco -> enviar
    let chegou = false;
    try {
      const prox = async () => { await p.locator('button.btn-primary', { hasText: T('clienteNovaSolicitacao.next') }).last().click(); await p.waitForTimeout(700); };
      await p.locator('button, label').filter({ hasText: /Toyota|Yaris/ }).first().click(); await p.waitForTimeout(300);
      await prox();
      await p.locator('div.grid.grid-cols-2 > button').first().click(); await p.waitForTimeout(300);
      await prox();
      if (await p.locator('button.btn-primary', { hasText: T('clienteNovaSolicitacao.next') }).count()) await prox(); // passo da foto (opcional)
      const desc = p.locator('textarea').locator('visible=true').first();
      if (await desc.count()) await desc.fill(`Barulho ao frear ${tag}`);
      await prox();
      await p.locator('#caee7-102').fill('Pärnu mnt 10');
      await p.waitForTimeout(1200);
      const op = p.locator('[role=option]').first();
      if (await op.count()) await op.click();
      await p.locator('button.btn-success').last().click();
      chegou = await esperarTeste(p, 'pedido-sucesso', 20000);
    } catch (e) { errosJs.push(`I: ${e.message}`); }
    if (chegou) {
      ok('I: ecra de sucesso com a pergunta (sem redirecionar sozinho)', (await p.getByTestId('preferencia-horario').count()) === 1);
      await foto(p, 'motorista_09_sucesso_pergunta');
      const { data: sol } = await admin.from('solicitacoes').select('id, status').eq('cliente_id', cId).order('created_at', { ascending: false }).limit(1).single();
      sols.add(sol.id);
      ok('I: o pedido ja esta gravado antes de responder', sol?.status === 'aberta' || sol?.status === 'em_orcamento', JSON.stringify(sol));
      await p.getByTestId('pref-qualquer').click(); await p.getByTestId('pref-manha').click();
      await p.getByTestId('pref-guardar').click();
      await sleep(2500);
      const { data: s } = await admin.from('solicitacoes').select('preferencia_horario').eq('id', sol.id).single();
      ok('I: guardou "qualquer dia util · de manha" e seguiu ao painel', s.preferencia_horario?.opcao === 'qualquer' && s.preferencia_horario.partes[0] === 'manha' && /dashboard/.test(p.url()), `${JSON.stringify(s)} ${p.url()}`);
      await p.goBack().catch(() => {}); await p.waitForTimeout(1500);
      ok('I: voltar depois do sucesso nao cai no formulario enviado', !/nova-solicitacao/.test(p.url()), p.url());
    } else {
      ok('I: formulario logado chegou ao ecra de sucesso (caminho automatico)', false, p.url());
    }
    await ctx.close();
  }

  // ================= J) 6 linguas =================
  const J = await novoPedido(9);
  for (const lg of ['et', 'ru', 'en', 'pt-PT', 'it', 'pt']) {
    const ctx = await contexto(390, { locale: lg === 'et' ? 'et-EE' : lg === 'ru' ? 'ru-RU' : lg === 'en' ? 'en-GB' : lg === 'it' ? 'it-IT' : lg === 'pt-PT' ? 'pt-PT' : 'pt-BR' });
    await admin.from('profiles').update({ idioma: lg }).eq('id', J.cId);
    const p = await entrarSite(ctx, J.cEmail, senha, PREFIXO[lg]);
    await p.goto(`${SITE}${PREFIXO[lg]}/cliente/orcamentos/${J.sol.id}`, { waitUntil: 'networkidle' });
    await esperarTeste(p, 'acoes-orcamento');
    await design(p, `J(${lg}): pedido do motorista com 3 saidas`);
    await p.locator(`#orc-${J.o1.id}`).getByTestId('abrir-pedir-datas').click(); await esperarTeste(p, 'folha-outra-data', 5000);
    await design(p, `J(${lg}): folha outra data (dias)`, '[role=dialog] button, [role=dialog] textarea');
    await p.getByTestId('modo-data').click(); await p.locator('[data-testid^="dia-20"]').nth(0).click().catch(() => {});
    await design(p, `J(${lg}): folha outra data (data certa)`, '[role=dialog] button, [role=dialog] textarea');
    await p.keyboard.press('Escape');
    await p.locator(`#orc-${J.o1.id}`).getByTestId('abrir-recusar').click(); await esperarTeste(p, 'folha-recusar', 5000);
    await design(p, `J(${lg}): folha da recusa`, '[role=dialog] button');
    await p.keyboard.press('Escape');
    await ctx.close();
  }
  await post(`/api/orcamento/${J.o1.id}/pedir-datas`, J.cli.token, { padrao: { dias: [1, 5], partes: ['tarde'] } });
  await chamar('PATCH', `/api/solicitacoes/${J.sol.id}/preferencia`, J.cli.token, { dias: [1, 5], partes: ['tarde'] });
  for (const lg of ['et', 'ru', 'en']) {
    const ctx = await contexto(1280, { locale: lg === 'et' ? 'et-EE' : lg === 'ru' ? 'ru-RU' : 'en-GB' });
    const p = await entrarSite(ctx, W1_EMAIL, W1_SENHA, PREFIXO[lg]);
    await p.goto(`${SITE}${PREFIXO[lg]}/oficina/pedidos/${J.sol.id}`, { waitUntil: 'networkidle' });
    await esperarTeste(p, 'novas-datas-pedidas');
    await p.getByTestId('nao-posso-abrir').click().catch(() => {});
    await design(p, `J(${lg}): pedido da oficina com o cartao e "nao posso"`);
    if (lg === 'et') await foto(p, 'oficina_08_et_cartao');
    await ctx.close();
  }
} catch (e) {
  falhas++;
  console.log('FALHA excecao:', e.stack || e.message);
} finally {
  // ================= K) limpeza =================
  try {
    if (of1Id) await admin.from('oficinas').update({ horario_funcionamento: horarioW1Antes }).eq('id', of1Id);
    for (const id of sols) await admin.from('solicitacoes').delete().eq('id', id);
    for (const id of oficinasCriadas) await admin.from('oficinas').delete().eq('id', id);
    for (const id of contas) { await admin.from('notificacoes').delete().eq('profile_id', id); await admin.auth.admin.deleteUser(id).catch(() => null); }
    await admin.from('notificacoes').delete().gte('created_at', new Date(INICIO).toISOString()).in('tipo', ['pedido_novas_datas', 'pedido_novas_datas_cancelado']);
  } catch (e) { console.log('limpeza:', e.message); }
  await browser.close();
  if (errosJs.length) console.log('erros JS:', errosJs.slice(0, 10));
  console.log(`\n${falhas === 0 ? 'TUDO OK' : 'COM FALHAS'}: ${oks} ok, ${falhas} falhas. Telas em ${OUT}`);
  process.exit(falhas ? 1 : 0);
}
