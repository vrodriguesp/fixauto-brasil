// O cliente cancela o proprio pedido (dono 09/11, item 52), motor do Safari (WebKit), celular 390:
//  - pedido com 2 orcamentos: "Cancelar pedido" -> confirmacao na tela com motivo -> cancelado;
//    banco (status, motivo), as 2 oficinas avisadas (textos nas 6 linguas), sem aceitar/recusar
//    nos orcamentos, o pedido some da lista da oficina;
//  - "Reabrir pedido" -> volta a em_orcamento com os orcamentos;
//  - carro ja na oficina (check-in) -> a API recusa (409 CARRO_NA_OFICINA).
//   HOST_LAN=<ip-da-rede> node cancelar-pedido.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { webkit } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local');
const SITE = process.env.SITE || `http://${process.env.HOST_LAN || 'localhost'}:3100`;
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/cancelar-pedido`; fs.mkdirSync(OUT, { recursive: true });
const WEBMSG = `${RAIZ}/site/apps/web/messages`;
const msgWeb = (l) => {
  const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.json`, 'utf8'));
  for (const area of ['cliente', 'oficina', 'misc', 'auth']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.${area}.json`, 'utf8')));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};
const T = msgWeb('et');
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const semear = fs.readFileSync(`${RAIZ}/ferramentas/semear.mjs`, 'utf8');
const W1 = 'meister.teste@bipfix.test'; const W1S = (semear.match(/conta\('meister\.teste@bipfix\.test', '([^']+)'/) || [])[1];
const tag = crypto.randomBytes(3).toString('hex'); const senha = 'Cp-' + crypto.randomBytes(6).toString('hex');
const dia = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const post = async (rota, tok, corpo = {}) => { const r = await fetch(`${SITE}${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, 'x-real-ip': `10.78.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}` }, body: JSON.stringify(corpo) }); return { s: r.status, d: await r.json().catch(() => ({})) }; };
const contas = []; const sols = []; const oficinasCriadas = [];
const b = await webkit.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe') });
const ctxNovo = async () => { const c = await b.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'et-EE' }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } })); return c; };
const entrar = async (ctx, email, s) => { const p = await ctx.newPage(); await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', s); await p.click('button[type=submit]'); await p.waitForTimeout(4000); return p; };
try {
  const w1Id = (await admin.from('profiles').select('id').eq('email', W1).single()).data.id;
  await admin.from('profiles').update({ idioma: 'et' }).eq('id', w1Id);
  const { data: of1 } = await admin.from('oficinas').select('id, profile_id').eq('profile_id', w1Id).single();
  const w1 = (await anon().auth.signInWithPassword({ email: W1, password: W1S })).data.session.access_token;
  // segunda oficina so para o teste
  const e2 = `canc-of2-${tag}@example.test`;
  const { data: u2 } = await admin.auth.admin.createUser({ email: e2, password: senha, email_confirm: true }); contas.push(u2.user.id);
  await admin.from('profiles').upsert({ id: u2.user.id, email: e2, tipo: 'oficina', nome: 'Oficina Dois', idioma: 'ru' });
  const { data: of2 } = await admin.from('oficinas').insert({ profile_id: u2.user.id, nome_fantasia: `Teine ${tag}`, endereco: 'Pärnu mnt 20', cidade: 'Tallinn', estado: 'Harjumaa', cep: '10141', pais: 'EE', latitude: 59.43, longitude: 24.745, raio_atendimento_km: 30, especialidades: ['mecanica'], ativa: true }).select('id').single();
  oficinasCriadas.push(of2.id);
  const novoPedido = async (n) => {
    const email = `canc-cli${n}-${tag}@example.test`;
    const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true }); contas.push(u.user.id);
    await admin.from('profiles').upsert({ id: u.user.id, email, tipo: 'cliente', nome: `Cliente ${n}`, idioma: 'et' });
    const { data: v } = await admin.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018' }).select('id').single();
    const { data: sol } = await admin.from('solicitacoes').insert({ cliente_id: u.user.id, veiculo_id: v.id, tipo: 'mecanica', descricao: `Cancelar ${n}`, urgencia: 'media', endereco: 'Tallinn', latitude: 59.433, longitude: 24.746, status: 'em_orcamento' }).select('id, numero').single(); sols.push(sol.id);
    const orcs = [];
    for (const ofi of [of1, of2]) {
      const o = (await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: ofi.id, valor_total: 150, prazo_dias: 1, status: 'enviado', validade: dia(10) }).select('id').single()).data;
      await admin.from('orcamento_itens').insert({ orcamento_id: o.id, descricao: 'Remont', tipo: 'mao_de_obra', valor_unitario: 150, quantidade: 1, valor_total: 150 });
      const s1 = (await admin.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_checkin: dia(3), turno: 'manha', data_previsao_entrega: dia(4) }).select('id').single()).data;
      orcs.push({ ...o, slot: s1.id });
    }
    const cli = (await anon().auth.signInWithPassword({ email, password: senha })).data.session.access_token;
    return { email, cId: u.user.id, cli, sol, orcs };
  };

  // ---------- 1) cancelar pela tela, com motivo ----------
  const P = await novoPedido(1);
  {
    const ctx = await ctxNovo(); const p = await entrar(ctx, P.email, senha);
    await p.goto(`${SITE}/ee/et/cliente/orcamentos/${P.sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    ok('1: botao "Cancelar pedido" no pedido', (await p.getByTestId('cancelar-pedido').count()) === 1);
    await p.getByTestId('cancelar-pedido').click(); await p.waitForTimeout(500);
    const dlg = await p.getByTestId('confirmar-cancelamento').innerText().catch(() => '');
    ok('1: confirmacao na tela (sem confirm do navegador), com motivos', dlg.includes(T('clienteOrcamentoDetalhe.cancelamento.titulo')) && dlg.includes(T('clienteOrcamentoDetalhe.cancelamento.motivos.outra_oficina')), dlg);
    await p.screenshot({ path: path.join(OUT, 'confirmar_390.png'), fullPage: true });
    await p.getByTestId('motivo-outra_oficina').click();
    await p.getByTestId('confirmar-cancelar-pedido').click(); await p.waitForTimeout(3500);
    ok('1: aviso "pedido cancelado" com "Reabrir pedido"', (await p.getByTestId('pedido-cancelado').count()) === 1 && (await p.getByTestId('reabrir-pedido-cancelado').count()) === 1);
    ok('1: sem aceitar/recusar nos orcamentos do pedido cancelado', !(await p.innerText('main')).includes(T('clienteOrcamentoDetalhe.acceptAndSchedule')));
    await p.screenshot({ path: path.join(OUT, 'cancelado_390.png'), fullPage: true });
    const { data: s } = await admin.from('solicitacoes').select('status, motivo_cancelamento, cancelada_em').eq('id', P.sol.id).single();
    ok('1: banco: cancelada, com motivo e hora', s.status === 'cancelada' && s.motivo_cancelamento === 'outra_oficina' && !!s.cancelada_em, JSON.stringify(s));
    const { data: ns } = await admin.from('notificacoes').select('profile_id, titulo, mensagem, dados').eq('tipo', 'pedido_cancelado').eq('dados->>solicitacao_id', P.sol.id);
    const tx = ns?.[0]?.dados?.textos || {};
    ok('1: as 2 oficinas avisadas', new Set((ns || []).map((n) => n.profile_id)).size === 2, JSON.stringify((ns || []).map((n) => n.titulo)));
    ok('1: aviso com os textos nas 6 linguas e o motivo', ['pt', 'pt-PT', 'en', 'et', 'ru', 'it'].every((l) => tx[l]?.titulo) && /teise töökoja|другой автосервис/i.test(JSON.stringify(ns)), JSON.stringify(ns?.[0]?.mensagem));
    ok('1: oficina russa avisada em russo', (ns || []).some((n) => n.profile_id === u2.user.id && /отменил/.test(n.titulo)), JSON.stringify(ns));
    // a oficina nao ve mais o pedido
    const cw = await ctxNovo(); const pw = await entrar(cw, W1, W1S);
    let aparece = false;
    for (const aba of ['responder', 'respondidos', 'encerrados']) {
      await pw.goto(`${SITE}/ee/et/oficina/pedidos?aba=${aba}`, { waitUntil: 'networkidle' }); await pw.waitForTimeout(2500);
      if ((await pw.innerText('main')).includes(String(P.sol.numero))) aparece = true;
    }
    ok('1: o pedido cancelado some da lista da oficina', !aparece);
    await cw.close();
    // ---------- 2) reabrir ----------
    await p.getByTestId('reabrir-pedido-cancelado').click(); await p.waitForTimeout(3500);
    const { data: s2 } = await admin.from('solicitacoes').select('status, motivo_cancelamento, reaberta_em').eq('id', P.sol.id).single();
    ok('2: reabrir volta a "em_orcamento" (os orcamentos voltam)', s2.status === 'em_orcamento' && !s2.motivo_cancelamento && !!s2.reaberta_em, JSON.stringify(s2));
    ok('2: a tela volta a mostrar aceitar nos orcamentos', (await p.innerText('main')).includes(T('clienteOrcamentoDetalhe.acceptAndSchedule')));
    const { data: nr } = await admin.from('notificacoes').select('profile_id').eq('tipo', 'pedido_reaberto').eq('dados->>solicitacao_id', P.sol.id);
    ok('2: oficinas com orcamento avisadas da reabertura', (nr || []).length === 2, JSON.stringify(nr));
    await ctx.close();
  }
  // ---------- 3) regras da API ----------
  {
    const Q = await novoPedido(2);
    const outro = await post(`/api/solicitacoes/${Q.sol.id}/cancelar`, P.cli, {});
    ok('3: outra pessoa nao cancela (403)', outro.s === 403, JSON.stringify(outro));
    const ra = await post('/api/aceitar-orcamento', Q.cli, { orcamentoId: Q.orcs[0].id, slotId: Q.orcs[0].slot });
    const { data: ag } = await admin.from('agenda').select('id').eq('solicitacao_id', Q.sol.id).single();
    await fetch(`${SITE}/api/servico`, { method: 'POST', headers: { Authorization: `Bearer ${w1}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'checkin', eventoId: ag.id, antecipar: true }) });
    const rc = await post(`/api/solicitacoes/${Q.sol.id}/cancelar`, Q.cli, { motivo: 'desisti' });
    ok('3: carro ja na oficina -> 409 CARRO_NA_OFICINA', ra.s === 200 && rc.s === 409 && rc.d.codigo === 'CARRO_NA_OFICINA', JSON.stringify([ra.s, rc]));
    const R = await novoPedido(3);
    const ra2 = await post('/api/aceitar-orcamento', R.cli, { orcamentoId: R.orcs[0].id, slotId: R.orcs[0].slot });
    const rc2 = await post(`/api/solicitacoes/${R.sol.id}/cancelar`, R.cli, { motivo: 'resolvido' });
    const { data: ag2 } = await admin.from('agenda').select('status').eq('solicitacao_id', R.sol.id).single();
    const { data: hist } = await admin.from('agenda_historico').select('acao').eq('acao', 'cancelado_cliente').in('agenda_id', (await admin.from('agenda').select('id').eq('solicitacao_id', R.sol.id)).data.map((a) => a.id));
    ok('3: agendado e ainda sem carro: cancela, agenda cancelada com historico', ra2.s === 200 && rc2.s === 200 && ag2.status === 'cancelado' && (hist || []).length === 1, JSON.stringify([rc2, ag2, hist]));
    const rr = await post(`/api/solicitacoes/${R.sol.id}/reabrir`, R.cli, {});
    const { data: s3 } = await admin.from('solicitacoes').select('status').eq('id', R.sol.id).single();
    ok('3: reabrir depois de agendado: volta a receber orcamentos', rr.s === 200 && ['em_orcamento', 'aberta'].includes(s3.status), JSON.stringify([rr, s3]));
  }
} catch (e) {
  falhas++; console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await b.close();
  for (const id of sols) {
    const { data: orcs } = await admin.from('orcamentos').select('id').eq('solicitacao_id', id);
    for (const o of orcs || []) { await admin.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await admin.from('orcamento_itens').delete().eq('orcamento_id', o.id); }
    const { data: ags } = await admin.from('agenda').select('id').eq('solicitacao_id', id);
    for (const a of ags || []) { await admin.from('agenda_historico').delete().eq('agenda_id', a.id); await admin.from('manutencao_etapas').delete().eq('agenda_id', a.id); }
    for (const t of ['orcamento_revisoes', 'agenda', 'mensagens', 'orcamentos']) await admin.from(t).delete().eq('solicitacao_id', id);
    await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', id);
    await admin.from('solicitacoes').delete().eq('id', id);
  }
  for (const id of oficinasCriadas) await admin.from('oficinas').delete().eq('id', id);
  for (const id of contas) { await admin.from('veiculos').delete().eq('profile_id', id); await admin.from('notificacoes').delete().eq('profile_id', id); await admin.from('profiles').delete().eq('id', id); await admin.auth.admin.deleteUser(id).catch(() => {}); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
