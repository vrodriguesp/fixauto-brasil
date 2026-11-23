// E2E LOCAL dos lembretes ao motorista (migracao 115; decisoes do dono 21-23/11; Documentos/Analises/Lembretes_2026-11-23):
// banco local + cron limpar-pendentes com hora SIMULADA ({agora}, so com TAREFAS_SIMULAR_HORA=1) + e-mails e SMS em pasta.
//  S1 nao_decidiu: +23 h nada; +25 h as 08:30 Tallinn nada (fora da janela); +26 h as 09:30 -> 1 e-mail com os 2 orcamentos; passada seguinte 0
//  S2 dedupe: 2 chamadas ao mesmo tempo -> 1 e-mail, 1 linha
//  S3 vencem + o unico SMS (pasta); sms_avisos=false -> pulado/sem_sms_no_pedido; passada seguinte 0
//  S4 venceram 1 vez; SMS continua 1
//  S5 paradas: cancelado / aceito / recusou todos / pediu outra data / escreveu a oficina -> nada (controle recebe)
//  S6 antigo (1.o orcamento antes de lembretes_cliente_desde) -> nada; conta de teste -> pulado/conta_teste, nenhum ficheiro
//  S7 vespera do check-in: marcado ontem -> envia (sem link de pausa); marcado hoje -> nao; pedido PAUSADO -> envia na mesma
//  S8 pausa: /r/<n>?s=&l= -> 302 -> pagina sem token na barra; abrir nao grava; botao pausa; cron respeita; retomar; token invalido 410 +
//     pagina "link ja nao funciona" com "Ver pedido"; one-click POST 200 / numero errado 404; prints 390 px PT/ET/RU
//  limpeza (e lembretes_cliente_desde de volta)
//   SITE=http://localhost:3108 node scripts/e2e/lembretes-clientes.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/site-pecas6/apps/web/package.json')('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado');
const SITE = process.env.SITE || 'http://localhost:3108';
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(SITE)) throw new Error('SITE nao e local');
if (env.TAREFAS_SIMULAR_HORA !== '1') throw new Error('precisa de TAREFAS_SIMULAR_HORA=1 no .env.local do site');
const EMAILS = env.EMAIL_PASTA_TESTE; const SMSP = env.SMS_PASTA_TESTE;
if (!EMAILS || !SMSP) throw new Error('precisa de EMAIL_PASTA_TESTE e SMS_PASTA_TESTE');
const TELAS = process.env.TELAS || 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/Analises/Lembretes_2026-11-23/telas';
fs.mkdirSync(TELAS, { recursive: true }); fs.mkdirSync(SMSP, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tag = crypto.randomBytes(3).toString('hex');
let falhas = 0, oks = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; else oks++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(typeof x === 'string' ? x : JSON.stringify(x)).replace(/\s+/g, ' ').slice(0, 400) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = 3600e3;
const iso = (t) => new Date(t).toISOString();
const Z = (s) => Date.parse(s);
const contas = new Set(); const sols = new Set(); const ofs = new Set();
const emailsDe = (email) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`)).sort().map((f) => fs.readFileSync(path.join(EMAILS, f), 'utf8'));
const lembretesDe = (email) => emailsDe(email).filter((h) => /data-lembrete="/.test(h));
const tipoDe = (h) => (h.match(/data-lembrete="(\w+)"/) || [])[1];
// so os SMS desta execucao (a pasta guarda os de execucoes anteriores): sid = teste-<ms>-xxxx
const INICIO = Date.now();
const smsDe = (fone) => fs.readdirSync(SMSP).filter((f) => f.endsWith(`_${fone}.json`) && Number((f.match(/^teste-(\d+)-/) || [])[1]) >= INICIO);
const linhas = async (solId) => (await admin.from('lembretes_cliente').select('tipo, canal, status, motivo, orcamento_ids').eq('solicitacao_id', solId)).data || [];
const cron = async (agora) => {
  const r = await fetch(`${SITE}/api/tarefas/limpar-pendentes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tarefa-chave': env.TAREFAS_CHAVE }, body: JSON.stringify({ agora: iso(agora) }) });
  const d = await r.json().catch(() => ({}));
  falhasCron += Number(d?.clientes?.falhas || 0) + (r.status === 200 ? 0 : 1);
  return { status: r.status, d };
};
let falhasCron = 0;
const TODO_DIA = Object.fromEntries(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map((k) => [k, { aberto: true, inicio: '08:00', fim: '18:00' }]));

async function conta(email, perfil) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'Lc-' + crypto.randomBytes(8).toString('hex'), email_confirm: true });
  if (error) throw new Error(error.message);
  contas.add(data.user.id);
  const { error: e2 } = await admin.from('profiles').upsert({ id: data.user.id, email, ...perfil });
  if (e2) throw new Error(e2.message);
  return data.user.id;
}
async function oficina(n) {
  const pid = await conta(`lc-of${n}-${tag}@example.test`, { tipo: 'oficina', nome: `Dono ${n}`, idioma: 'et' });
  const { data, error } = await admin.from('oficinas').insert({ profile_id: pid, nome_fantasia: `Töökoda ${n} ${tag}`, endereco: `Pärnu mnt ${n}0`, cidade: 'Tallinn', estado: 'Harjumaa', cep: '10141', pais: 'EE', latitude: 59.43, longitude: 24.745, raio_atendimento_km: 30, especialidades: ['mecanica'], ativa: true, horario_funcionamento: TODO_DIA }).select('id, profile_id').single();
  if (error) throw new Error(error.message);
  ofs.add(data.id);
  return data;
}
let OF1, OF2;
/** pedido com orcamentos: orcs = [{ of, criado (ms), slots: [[data, ini, fim]], validade, status }] */
async function pedido(nome, { idioma = 'pt', sms = true, fone = null, contaTeste = false, status = 'em_orcamento', orcs = [] } = {}) {
  const email = `lc-${nome}-${tag}@example.test`;
  const cId = await conta(email, { tipo: 'cliente', nome: `Cliente ${nome}`, idioma, telefone: fone, ...(contaTeste ? { conta_teste: true } : {}) });
  const { data: v } = await admin.from('veiculos').insert({ profile_id: cId, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018', placa: `LC${crypto.randomBytes(2).toString('hex').toUpperCase()}` }).select('id').single();
  const { data: sol, error } = await admin.from('solicitacoes').insert({ cliente_id: cId, veiculo_id: v.id, tipo: 'mecanica', descricao: `Lembretes ${nome} ${tag}`, urgencia: 'media', endereco: 'Pärnu mnt 10, Tallinn', latitude: 59.433, longitude: 24.746, status, pais: 'EE', sms_avisos: sms }).select('id, numero').single();
  if (error) throw new Error(error.message);
  sols.add(sol.id);
  const o = [];
  for (const x of orcs) {
    const { data: q, error: eq } = await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: x.of.id, valor_total: x.valor || 300, prazo_dias: 2, status: x.status || 'enviado', validade: x.validade || '2026-12-28', created_at: iso(x.criado) }).select('id').single();
    if (eq) throw new Error(eq.message);
    if (x.slots?.length) {
      const { error: es } = await admin.from('orcamento_disponibilidade').insert(x.slots.map(([d, i, f]) => ({ orcamento_id: q.id, data_checkin: d, turno: i < '12:00' ? 'manha' : 'tarde', hora_inicio: i, hora_fim: f, data_previsao_entrega: d })));
      if (es) throw new Error(es.message);
    }
    o.push(q);
  }
  return { email, cId, sol, o };
}
const fechar = async (...ps) => { for (const p of ps) await admin.from('solicitacoes').update({ status: 'cancelada' }).eq('id', p.sol.id); };
const LONGE = [['2026-12-24', '09:00', '11:00'], ['2026-12-25', '14:00', '16:00']];

const { data: cfgAntes } = await admin.from('plataforma_config').select('lembretes_cliente_desde, sms_ativo').eq('id', 1).single();
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
try {
  // so os dados deste teste entram (os orcamentos daqui sao de dezembro); volta no fim
  await admin.from('plataforma_config').update({ lembretes_cliente_desde: '2026-12-01T00:00:00Z', sms_ativo: true }).eq('id', 1);
  OF1 = await oficina(1); OF2 = await oficina(2);

  // ===== S1 nao_decidiu + janela + dedupe =====
  const QA = Z('2026-12-02T05:30:00Z'); // 07:30 Tallinn
  const A = await pedido('a', { orcs: [{ of: OF1, criado: QA, slots: LONGE }, { of: OF2, criado: QA + 0.5 * H, slots: [LONGE[1]], valor: 280 }] });
  let r = await cron(QA + 23 * H);
  ok('S1 resposta do cron com as chaves de sempre + clientes', r.status === 200 && ['apagados', 'lembretes', 'mudancas', 'novasDatas', 'clientes'].every((k) => k in r.d), r.d);
  ok('S1 +23 h: nada', lembretesDe(A.email).length === 0);
  r = await cron(QA + 25 * H); // 08:30 Tallinn
  ok('S1 +25 h as 08:30 Tallinn: nada (fora da janela, segurado)', lembretesDe(A.email).length === 0 && r.d.clientes?.foraJanela >= 1, r.d.clientes);
  const B = await pedido('b', { orcs: [{ of: OF1, criado: QA + 3 * H, slots: LONGE }] }); // fica com 23 h na passada seguinte
  r = await cron(QA + 26 * H); // 09:30 Tallinn
  let la = lembretesDe(A.email);
  ok('S1 +26 h as 09:30: 1 e-mail nao_decidiu', la.length === 1 && tipoDe(la[0]) === 'nao_decidiu', la.map(tipoDe));
  ok('S1 o e-mail junta os 2 orcamentos', (la[0]?.match(/data-orcamento="1"/g) || []).length === 2);
  ok('S1 List-Unsubscribe + one-click no cabecalho e link de pausa no corpo', /List-Unsubscribe: <http[^>]+\/r\/\d+\?s=[A-Za-z0-9_-]{43}&l=pt>/.test(la[0] || '') && /List-Unsubscribe-Post: List-Unsubscribe=One-Click/.test(la[0] || '') && /data-link="pausar"/.test(la[0] || ''));
  ok('S1 pedido B com 23 h (dentro da janela): nada', lembretesDe(B.email).length === 0);
  r = await cron(QA + 27 * H);
  ok('S1 passada seguinte: nenhum e-mail a mais', lembretesDe(A.email).length === 1);
  const lA = await linhas(A.sol.id);
  ok('S1 registro: 1 linha nao_decidiu/email/enviado com os 2 orcamentos', lA.length === 1 && lA[0].tipo === 'nao_decidiu' && lA[0].status === 'enviado' && lA[0].orcamento_ids.length === 2, lA);
  await fechar(A, B);

  // ===== S2 dedupe com 2 passadas ao mesmo tempo =====
  const C = await pedido('c', { orcs: [{ of: OF1, criado: Z('2026-12-03T08:00:00Z'), slots: LONGE }] });
  await Promise.all([cron(Z('2026-12-04T09:00:00Z')), cron(Z('2026-12-04T09:00:00Z'))]);
  ok('S2 duas passadas simultaneas: 1 e-mail', lembretesDe(C.email).length === 1, lembretesDe(C.email).length);
  ok('S2 uma linha so', (await linhas(C.sol.id)).length === 1);
  await fechar(C);

  // ===== S3 vencem + SMS =====
  const QD = Z('2026-12-04T08:00:00Z');
  const D = await pedido('d', { fone: '+372 5555 0101', orcs: [{ of: OF1, criado: QD, slots: [['2026-12-06', '14:00', '16:00']], validade: '2026-12-10' }] });
  const E = await pedido('e', { fone: '+372 5555 0102', sms: false, orcs: [{ of: OF1, criado: QD, slots: [['2026-12-06', '14:00', '16:00']], validade: '2026-12-10' }] });
  await cron(QD + 24 * H); // ultimo horario termina em 30 h
  const lD = lembretesDe(D.email);
  ok('S3 prazo em 30 h: 1 e-mail vencem', lD.length === 1 && tipoDe(lD[0]) === 'vencem', lD.map(tipoDe));
  ok('S3 SMS do lembrete na pasta (1)', smsDe('37255550101').length === 1);
  const txt = smsDe('37255550101').map((f) => JSON.parse(fs.readFileSync(path.join(SMSP, f), 'utf8')).texto)[0] || '';
  ok('S3 texto do SMS com o link curto /r/<n>', txt.includes(`/r/${D.sol.numero}`) && /BipFix/.test(txt), txt);
  const { data: smsRows } = await admin.from('sms_envios').select('tipo, status').eq('solicitacao_id', D.sol.id);
  ok('S3 sms_envios tipo lembrete_cliente enviado', smsRows?.length === 1 && smsRows[0].tipo === 'lembrete_cliente' && smsRows[0].status === 'enviado', smsRows);
  const lDr = await linhas(D.sol.id);
  ok('S3 nao_decidiu marcado coberto (nunca sai)', lDr.some((x) => x.tipo === 'nao_decidiu' && x.status === 'pulado' && x.motivo === 'coberto_vencem'), lDr);
  const lEr = await linhas(E.sol.id);
  ok('S3 sms_avisos=false: e-mail sai, SMS pulado/sem_sms_no_pedido, nenhum ficheiro', lembretesDe(E.email).length === 1 && lEr.some((x) => x.canal === 'sms' && x.status === 'pulado' && x.motivo === 'sem_sms_no_pedido') && smsDe('37255550102').length === 0, lEr);
  await cron(QD + 25 * H);
  ok('S3 passada seguinte: 0 e-mail e 0 SMS a mais', lembretesDe(D.email).length === 1 && lembretesDe(E.email).length === 1 && smsDe('37255550101').length === 1);

  // ===== S4 venceram =====
  await cron(Z('2026-12-06T15:00:00Z')); // 17:00 Tallinn, o horario acabou as 16:00
  const lD2 = lembretesDe(D.email);
  ok('S4 todos passaram: venceram', lD2.length === 2 && tipoDe(lD2[1]) === 'venceram', lD2.map(tipoDe));
  await cron(Z('2026-12-06T16:00:00Z'));
  ok('S4 venceram so 1 vez; SMS continua 1', lembretesDe(D.email).length === 2 && smsDe('37255550101').length === 1);
  await fechar(D, E);

  // ===== S5 paradas =====
  const QF = Z('2026-12-07T06:00:00Z'); const RF = Z('2026-12-08T08:00:00Z');
  const base = () => ({ orcs: [{ of: OF1, criado: QF, slots: LONGE }] });
  const F1 = await pedido('f1', { ...base(), status: 'cancelada' });
  const F2 = await pedido('f2', { orcs: [{ of: OF1, criado: QF, slots: LONGE, status: 'aceito' }, { of: OF2, criado: QF, slots: LONGE }] });
  const F3 = await pedido('f3', { orcs: [{ of: OF1, criado: QF, slots: LONGE, status: 'recusado' }] });
  const F4 = await pedido('f4', base());
  await admin.from('orcamento_pedido_datas').insert({ orcamento_id: F4.o[0].id, solicitacao_id: F4.sol.id, oficina_id: OF1.id, cliente_id: F4.cId, status: 'pendente', sugestoes: [], tipo: 'padrao', padrao: { dias: [1], partes: [] }, motivo: 'nao_sobe' });
  const F5 = await pedido('f5', base());
  const { error: eMsg } = await admin.from('mensagens').insert({ solicitacao_id: F5.sol.id, remetente_id: F5.cId, texto: 'Tere, kas teisipäeval saab?', oficina_id: OF1.id, created_at: iso(QF + H) });
  const F6 = await pedido('f6', { idioma: 'et', ...base() });
  // S6 antigo + conta de teste
  const G = await pedido('g', { orcs: [{ of: OF1, criado: Z('2026-11-30T08:00:00Z'), slots: LONGE }, { of: OF2, criado: QF, slots: LONGE }] });
  const HT = await pedido('h', { contaTeste: true, ...base() });
  await cron(RF);
  ok('S5 controle (sem acao): nao_decidiu', lembretesDe(F6.email).length === 1);
  ok('S5 pedido cancelado: nada', lembretesDe(F1.email).length === 0);
  ok('S5 aceitou um orcamento: nada', lembretesDe(F2.email).length === 0);
  ok('S5 recusou todos: nada', lembretesDe(F3.email).length === 0);
  ok('S5 pediu outra data: nada', lembretesDe(F4.email).length === 0);
  ok('S5 escreveu a oficina: nada', !eMsg && lembretesDe(F5.email).length === 0, eMsg?.message);
  ok('S6 1.o orcamento antes do inicio (antigo): nada, nenhuma linha', lembretesDe(G.email).length === 0 && (await linhas(G.sol.id)).length === 0);
  const lH = await linhas(HT.sol.id);
  ok('S6 conta de teste: nenhum ficheiro, linha pulado/conta_teste', emailsDe(HT.email).length === 0 && lH.length === 1 && lH[0].status === 'pulado' && lH[0].motivo === 'conta_teste', lH);
  await fechar(F2, F3, F4, F5, G, HT);

  // ===== S8 pausa (com o e-mail do F6, em ET) =====
  const tokF6 = (lembretesDe(F6.email)[0].match(/\?s=([A-Za-z0-9_-]{43})/) || [])[1];
  const n6 = F6.sol.numero;
  let g = await fetch(`${SITE}/r/${n6}?s=${tokF6}&l=et`, { redirect: 'manual' });
  const loc = g.headers.get('location') || '';
  ok('S8 /r/<n>?s=&l=et -> 302 para /ee/et/meeldetuletused com o token no fragmento', g.status === 302 && /\/ee\/et\/meeldetuletused#k=[A-Za-z0-9_-]{43}&n=\d+$/.test(loc), `${g.status} ${loc}`);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  // banner de cookies ja respondido (como nos outros e2e); a primeira visita real ve o banner por cima, como em todo o site
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  const p = await ctx.newPage(); const errosJs = []; p.on('pageerror', (e) => errosJs.push(e.message));
  await p.goto(`${SITE}/r/${n6}?s=${tokF6}&l=et`, { waitUntil: 'networkidle' });
  await p.getByTestId('lembretes-pergunta').waitFor({ timeout: 15000 }).catch(() => {});
  ok('S8 pagina ET: pergunta visivel, token fora da barra', await p.getByTestId('lembretes-pergunta').isVisible().catch(() => false) && !p.url().includes('#k=') && !p.url().includes(tokF6), p.url());
  const sem = async () => p.evaluate(() => ({ sw: document.documentElement.scrollWidth - window.innerWidth, botoes: Array.from(document.querySelectorAll('[data-testid^="lembretes-"]')).filter((b) => b.tagName === 'BUTTON' || b.tagName === 'A').map((b) => Math.round(b.getBoundingClientRect().height)) }));
  let m = await sem();
  ok('S8 390 px: sem rolagem lateral, botoes >= 44 px', m.sw <= 1 && m.botoes.length >= 2 && m.botoes.every((h) => h >= 44), m);
  await p.screenshot({ path: `${TELAS}/pausa_et_390.png` });
  const pausado = async () => !!(await admin.from('solicitacoes').select('lembretes_pausados_em').eq('id', F6.sol.id).single()).data.lembretes_pausados_em;
  ok('S8 abrir a pagina NAO pausa', !(await pausado()));
  await p.getByTestId('lembretes-pausar').click();
  await p.getByTestId('lembretes-pausado').waitFor({ timeout: 10000 }).catch(() => {});
  ok('S8 botao: pausado na tela e no banco', await p.getByTestId('lembretes-pausado').isVisible().catch(() => false) && await pausado());
  await p.screenshot({ path: `${TELAS}/pausa_et_390_feito.png` });
  // F6: o unico horario termina 25/12 16:00 -> "vencem" devido a partir de 23/12 ~16:00; com pausa nada sai
  await cron(Z('2026-12-24T08:00:00Z'));
  ok('S8 pausado: o cron nao manda o vencem', lembretesDe(F6.email).length === 1);
  await p.getByTestId('lembretes-retomar').click();
  await p.getByTestId('lembretes-ligado').waitFor({ timeout: 10000 }).catch(() => {});
  ok('S8 retomar: ligado na tela e no banco', await p.getByTestId('lembretes-ligado').isVisible().catch(() => false) && !(await pausado()));
  await cron(Z('2026-12-24T09:00:00Z'));
  const l6 = lembretesDe(F6.email);
  ok('S8 depois de retomar: vencem sai', l6.length === 2 && tipoDe(l6[1]) === 'vencem', l6.map(tipoDe));
  for (const [l, pref] of [['pt', '/br/pt/lembretes'], ['ru', '/ee/ru/napominaniya']]) {
    const p2 = await ctx.newPage(); p2.on('pageerror', (e) => errosJs.push(e.message));
    await p2.goto(`${SITE}/r/${n6}?s=${tokF6}&l=${l}`, { waitUntil: 'networkidle' });
    await p2.getByTestId('lembretes-pergunta').waitFor({ timeout: 15000 }).catch(() => {});
    const t = await p2.evaluate(() => document.body.innerText);
    ok(`S8 pagina ${l}: ${pref}, pergunta, sem chave crua`, p2.url().endsWith(pref) && await p2.getByTestId('lembretes-pergunta').isVisible().catch(() => false) && !/lembretesCliente\.|\{numero\}/.test(t), p2.url());
    const m2 = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`S8 pagina ${l} 390 px sem rolagem lateral`, m2 <= 1, m2);
    await p2.screenshot({ path: `${TELAS}/pausa_${l}_390.png` });
    await p2.close();
  }
  // token invalido
  const falso = 'x'.repeat(43);
  let a = await fetch(`${SITE}/api/lembretes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: falso, acao: 'ver', n: String(n6) }) });
  ok('S8 API com token invalido -> 410 LINK_INVALIDO', a.status === 410 && (await a.json()).codigo === 'LINK_INVALIDO');
  a = await fetch(`${SITE}/api/lembretes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: tokF6, acao: 'ver', n: '999' }) });
  ok('S8 API com o numero de outro pedido -> 410', a.status === 410);
  const p3 = await ctx.newPage();
  await p3.goto(`${SITE}/r/${n6}?s=${falso}&l=pt`, { waitUntil: 'networkidle' });
  await p3.getByTestId('lembretes-invalido').waitFor({ timeout: 15000 }).catch(() => {});
  const href = await p3.getByTestId('lembretes-ver-pedido').getAttribute('href').catch(() => null);
  ok('S8 pagina com token invalido: "link ja nao funciona" + Ver pedido (/r/<n>)', await p3.getByTestId('lembretes-invalido').isVisible().catch(() => false) && href === `/r/${n6}`, href);
  await p3.screenshot({ path: `${TELAS}/pausa_pt_390_invalido.png` });
  const ver = await fetch(`${SITE}${href}`, { redirect: 'manual' });
  ok('S8 "Ver pedido" leva ao pedido (302, link vivo)', ver.status === 302 && /\/cliente\/orcamentos\//.test(ver.headers.get('location') || ''), ver.headers.get('location'));
  // one-click
  let oc = await fetch(`${SITE}/r/${n6}?s=${tokF6}&l=et`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
  ok('S8 one-click (RFC 8058) -> 200 e pausado', oc.status === 200 && await pausado(), oc.status);
  oc = await fetch(`${SITE}/r/${Number(n6) + 1}?s=${tokF6}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
  ok('S8 one-click com numero errado -> 404 (ou 302 sem pedido)', [404].includes(oc.status), oc.status);
  oc = await fetch(`${SITE}/r/${n6}?s=${tokF6}`, { method: 'POST', body: 'x=1' });
  ok('S8 POST sem o corpo one-click -> 400', oc.status === 400, oc.status);
  ok('S8 sem erro de JavaScript nas paginas', errosJs.length === 0, errosJs);
  await ctx.close();
  await fechar(F6);

  // ===== S7 vespera do check-in =====
  const agendado = async (nome, criado, pausar = false) => {
    const P = await pedido(nome, { status: 'aceita', orcs: [{ of: OF1, criado: criado - 24 * H, slots: [['2026-12-10', '09:00', '11:00']], status: 'aceito' }] });
    const { error: ea } = await admin.from('agenda').insert({ oficina_id: OF1.id, solicitacao_id: P.sol.id, titulo: 'Toyota Corolla', data_inicio: '2026-12-10T07:00:00Z', data_fim: '2026-12-10T16:00:00Z', checkin_ate: '2026-12-10T09:00:00Z', tipo: 'plataforma', status: 'agendado', created_at: iso(criado) });
    if (ea) throw new Error(ea.message);
    if (pausar) await admin.from('solicitacoes').update({ lembretes_pausados_em: iso(criado) }).eq('id', P.sol.id);
    return P;
  };
  const I1 = await agendado('i1', Z('2026-12-08T08:00:00Z'));
  const I2 = await agendado('i2', Z('2026-12-09T06:30:00Z'));
  const I3 = await agendado('i3', Z('2026-12-08T09:00:00Z'), true);
  await cron(Z('2026-12-09T08:00:00Z')); // 10:00 Tallinn, vespera de 10/12
  const c1 = lembretesDe(I1.email);
  ok('S7 marcado ontem para amanha: checkin', c1.length === 1 && tipoDe(c1[0]) === 'checkin', c1.map(tipoDe));
  ok('S7 checkin sem link de pausa e sem List-Unsubscribe', c1[0] && !/data-link="pausar"/.test(c1[0]) && !/List-Unsubscribe/.test(c1[0]));
  ok('S7 marcado hoje para amanha: nada', lembretesDe(I2.email).length === 0);
  const c3 = lembretesDe(I3.email);
  ok('S7 pedido com lembretes PAUSADOS: checkin sai na mesma (aviso da marcacao)', c3.length === 1 && tipoDe(c3[0]) === 'checkin', c3.map(tipoDe));
  await cron(Z('2026-12-09T09:00:00Z'));
  ok('S7 passada seguinte: checkin nao repete', lembretesDe(I1.email).length === 1 && lembretesDe(I3.email).length === 1);
  // um print do e-mail do check-in e do nao_decidiu reais (PT)
  const cx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const pe = await cx.newPage();
  await pe.setContent(c1[0]); await pe.screenshot({ path: `${TELAS}/email_real_checkin_pt_390.png`, fullPage: true });
  await pe.setContent(la[0]); await pe.screenshot({ path: `${TELAS}/email_real_nao_decidiu_pt_390.png`, fullPage: true });
  await cx.close();
  await fechar(I1, I2, I3);
  ok('cron: nenhuma falha interna em todas as passadas (consultas, envios)', falhasCron === 0, falhasCron);
} catch (e) {
  falhas++; console.error('ERRO', e);
} finally {
  await browser.close().catch(() => {});
  // limpeza
  const ids = Array.from(sols);
  if (ids.length) {
    await admin.from('agenda').delete().in('solicitacao_id', ids);
    await admin.from('mensagens').delete().in('solicitacao_id', ids);
    await admin.from('orcamento_pedido_datas').delete().in('solicitacao_id', ids);
    await admin.from('sms_envios').delete().in('solicitacao_id', ids);
    await admin.from('notificacoes').delete().in('dados->>solicitacao_id', ids);
    const { data: os } = await admin.from('orcamentos').select('id').in('solicitacao_id', ids);
    const oids = (os || []).map((o) => o.id);
    if (oids.length) { await admin.from('orcamento_disponibilidade').delete().in('orcamento_id', oids); await admin.from('orcamentos').delete().in('id', oids); }
    await admin.from('solicitacoes').delete().in('id', ids);
  }
  for (const id of ofs) await admin.from('oficinas').delete().eq('id', id);
  for (const id of contas) { await admin.from('veiculos').delete().eq('profile_id', id); await admin.auth.admin.deleteUser(id).catch(() => {}); }
  if (cfgAntes) await admin.from('plataforma_config').update({ lembretes_cliente_desde: cfgAntes.lembretes_cliente_desde, sms_ativo: cfgAntes.sms_ativo }).eq('id', 1);
  const { count } = await admin.from('lembretes_cliente').select('id', { count: 'exact', head: true }).in('solicitacao_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  console.log(`limpeza: ${ids.length} pedidos, ${contas.size} contas; linhas de lembrete restantes: ${count}`);
  console.log(`\n${oks} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
}
