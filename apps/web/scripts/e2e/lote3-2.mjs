// E2E LOCAL do lote 3.2 (18/11):
//   C  aviso da decisao do admin sobre uma avaliacao de fornecedor (veredito Fable dos termos, ajuste C):
//      ocultar / trocar o motivo / mostrar de novo -> sino + e-mail a autora (dona da compradora) e ao dono do
//      fornecedor, com o motivo e como contestar; idioma de cada conta; sem aviso quando nada muda; equipe nao
//      recebe; contas de TESTE: sino sim, e-mail NAO sai pelo Resend
//   R  "pedir de novo" (?repetir=) sem pedido cancelado a vincular: depois do envio o parametro sai da barra e o F5
//      nao reabre o formulario
//   L  /loja/avaliacoes: loja real com o interruptor desligado volta ao painel (antes: pagina so com o titulo);
//      loja de teste continua vendo a tela
// Como: sobe um 2o site do MESMO build em :3101 "como producao" - RESEND_API_KEY falsa + RESEND_BASE_URL (variavel do
// SDK do Resend) e EXPO_PUSH_URL apontando para um servidor falso deste script. Nada sai para servicos reais. O :3100
// nao e tocado. Exige `next build` feito NESTA copia do app (rode o script da copia que tem o build).
//   node lote3-2.mjs [<.env.local>]
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const PORTA_SITE = 3101;
process.env.SITE = `http://localhost:${PORTA_SITE}`;
const L = await import('./pecas-v3-lote3-lib.mjs');
const { lerEnv, ambienteL3, abrirNavegadores, contador, tradutor, SITE, ENV_PADRAO, WEB, siteNoAr, vigiar, entrarPelaTela, ir, visivel, sleep, DIA_MS, IDIOMAS } = L;

const env = lerEnv(process.argv[2] || ENV_PADRAO);
if (await siteNoAr()) { console.log(`FALHA ja ha um site em ${SITE} - pare-o antes (este teste sobe o seu)`); process.exit(2); }
const A = ambienteL3(env);
const { ok, fim, tentar } = contador();
const ET = tradutor('et');
const erros = [];

// servidor falso: Resend (POST /emails) e Expo (POST /push)
const emails = [];
const falso = http.createServer((req, res) => {
  let corpo = ''; req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    let j = null; try { j = JSON.parse(corpo); } catch { /* */ }
    if (req.url.startsWith('/emails')) { emails.push({ to: [].concat(j?.to || []).map((x) => String(x).toLowerCase()), subject: j?.subject || '', html: j?.html || '', replyTo: [].concat(j?.reply_to || j?.replyTo || []) }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: crypto.randomUUID() })); return; }
    if (req.url.startsWith('/push')) { const lote = Array.isArray(j) ? j : []; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: lote.map(() => ({ status: 'ok', id: crypto.randomUUID() })) })); return; }
    res.writeHead(404); res.end();
  });
});
await new Promise((r) => falso.listen(0, '127.0.0.1', r));
const PF = falso.address().port;

let log = '';
const site = spawn(process.execPath, [path.join(WEB, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORTA_SITE)], {
  cwd: WEB,
  env: { ...process.env, RESEND_API_KEY: 're_teste_local_falso', RESEND_BASE_URL: `http://127.0.0.1:${PF}`, EXPO_PUSH_URL: `http://127.0.0.1:${PF}/push` },
  stdio: ['ignore', 'pipe', 'pipe'],
});
site.stdout.on('data', (d) => { log += d; }); site.stderr.on('data', (d) => { log += d; });
const parar = () => { try { site.kill(); } catch { /* */ } falso.close(); };
let nav = null;
process.on('SIGINT', async () => { try { await nav?.fechar(); } catch { /* */ } parar(); await A.limpar(); process.exit(130); });

const para = (email) => emails.filter((e) => e.to.includes(email.toLowerCase()));
const esperar = async (fn, cond, n = 30, ms = 300) => { let v; for (let i = 0; i < n; i++) { v = await fn(); if (cond(v)) return v; await sleep(ms); } return v; };
const sinos = (profileId, tipo) => A.avisos(profileId, tipo);
const descricaoNoForm = (p) => p.locator('#c8551-1').inputValue({ timeout: 1500 }).catch(() => null); // null = formulario fechado

try {
  let no = false;
  for (let i = 0; i < 60 && !no; i++) { await sleep(1000); no = await siteNoAr(); }
  ok(`site "como producao" no ar em ${SITE} (Resend e Expo falsos)`, no, log.slice(-300));
  if (!no) throw new Error('site :3101 nao subiu');
  { const e = await A.interruptor(false); ok('interruptor global desligado', !e && A.interruptorEstado() === false, e?.message); }

  // contas: par de TESTE (et / ru) e par REAL (en / it, fornecedor = oficina que vende)
  const dC = await A.conta('oficina', 'l32-compradora', { contaTeste: true, idioma: 'et' }); const ofC = await A.oficina(dC, 'L32 Compradora', { km: 0 });
  const dL = await A.conta('loja_pecas', 'l32-loja', { contaTeste: true, idioma: 'ru' }); const LT = await A.loja(dL, 'L32 Loja');
  const func = await A.funcionario(ofC, 'l32-funcionario', { cargo: 'admin' });
  const dR = await A.conta('oficina', 'l32-compradora-real', { contaTeste: false, idioma: 'en' }); const ofR = await A.oficina(dR, 'L32 Compradora real', { km: 0 });
  const dV = await A.conta('oficina', 'l32-vendedora-real', { contaTeste: false, idioma: 'it' }); const ofV = await A.oficina(dV, 'L32 Vendedora real', { km: 1, vendePecas: true });
  const dLR = await A.conta('loja_pecas', 'l32-loja-real', { contaTeste: false, idioma: 'et' }); const LR = await A.loja(dLR, 'L32 Loja real');
  const adm = await A.conta('admin', 'l32-admin', { idioma: 'pt' });
  const S = { adm: await A.sessao(adm), dC: await A.sessao(dC) };
  const entregue = { entregue_em: new Date(Date.now() - DIA_MS).toISOString(), recebido_em: new Date().toISOString() };

  // ======================= C: aviso da decisao =======================
  await tentar('C', async () => {
    const PT = await A.pedidoV3(ofC, LT, { status: 'entregue', descricao: 'Aviso teste', campos: entregue });
    const avT = await A.avaliacaoSemente(PT, ofC, dC, LT, { nota: 1, comentario: 'Halb' });
    const PR = await A.pedidoV3(ofR, ofV, { tipo: 'oficina', status: 'entregue', descricao: 'Aviso real', campos: entregue });
    const avR = await A.avaliacaoSemente(PR, ofR, dR, ofV, { tipo: 'oficina', nota: 2, comentario: 'Bad' });

    const r0 = await A.adminAvaliacao(avT, true, 'x', S.dC);
    const r0b = await A.adminAvaliacao(avT, true, '', S.adm);
    ok('C.0 nao-admin 401/403; admin sem motivo ao ocultar 400 MOTIVO_OBRIGATORIO; nenhum sino', [401, 403].includes(r0.status) && r0b.status === 400 && r0b.d?.codigo === 'MOTIVO_OBRIGATORIO' && (await sinos(dC.id, 'avaliacao_ocultada')).length === 0, `${r0.status} ${r0b.status}`);

    // par de TESTE: ocultar
    const motivo1 = 'Solvav sisu (test)';
    const r1 = await A.adminAvaliacao(avT, true, motivo1, S.adm);
    const sC = await A.esperarAviso(dC.id, 'avaliacao_ocultada'); const sL = await A.esperarAviso(dL.id, 'avaliacao_ocultada');
    ok('C.1 ocultar: 200, avisados 2, avaliacao oculta com o motivo', r1.status === 200 && r1.d?.avisados === 2 && (await A.avaliacaoDoPedido(PT.id))?.oculta === true, JSON.stringify(r1));
    const c1 = sC[0];
    ok('C.2 autora (dona da compradora, et): sino "Hinnang peidetud" com o motivo, a loja, a peca e support@bipfix.com; link para o pedido',
      sC.length === 1 && c1.titulo === 'Hinnang peidetud' && c1.mensagem.includes(motivo1) && c1.mensagem.includes(LT.nome) && c1.mensagem.includes(PT.descricao) && c1.mensagem.includes('support@bipfix.com') && c1.dados?.link === `/oficina/pecas?pedido=${PT.id}` && c1.dados?.avaliacao_id === avT,
      JSON.stringify(c1));
    ok('C.3 sino com os textos nas 6 linguas (dados.textos), todos com o motivo e o contato', IDIOMAS.every((l) => c1?.dados?.textos?.[l]?.mensagem?.includes(motivo1) && c1.dados.textos[l].mensagem.includes('support@bipfix.com')), JSON.stringify(c1?.dados?.textos || {}).slice(0, 300));
    ok('C.4 dono da loja (ru): sino "Оценка скрыта" com o motivo; link /loja/avaliacoes', sL.length === 1 && sL[0].titulo === 'Оценка скрыта' && sL[0].mensagem.includes(motivo1) && sL[0].mensagem.includes(ofC.nome) && sL[0].dados?.link === '/loja/avaliacoes', JSON.stringify(sL[0]));
    await sleep(800);
    ok('C.5 equipe da compradora (funcionario) NAO recebe sino', (await sinos(func.id, 'avaliacao_ocultada')).length === 0);
    ok('C.6 contas de TESTE: nenhum e-mail chegou ao Resend (nem autora nem loja)', para(dC.email).length === 0 && para(dL.email).length === 0, JSON.stringify(emails.map((e) => e.to)));

    // mesma decisao de novo: nada muda, ninguem e avisado; trocar o motivo avisa de novo
    const r2 = await A.adminAvaliacao(avT, true, motivo1, S.adm);
    await sleep(800);
    ok('C.7 ocultar de novo com o mesmo motivo: 200, avisados 0, nenhum sino novo', r2.status === 200 && r2.d?.avisados === 0 && (await sinos(dC.id, 'avaliacao_ocultada')).length === 1 && (await sinos(dL.id, 'avaliacao_ocultada')).length === 1, JSON.stringify(r2));
    const motivo2 = 'Isikuandmed (test)';
    const r3 = await A.adminAvaliacao(avT, true, motivo2, S.adm);
    const sC3 = await esperar(() => sinos(dC.id, 'avaliacao_ocultada'), (l) => l.length >= 2);
    ok('C.8 trocar o motivo de uma oculta: avisados 2, sino novo com o motivo novo', r3.d?.avisados === 2 && sC3.length === 2 && sC3[1].mensagem.includes(motivo2), JSON.stringify(r3));

    // mostrar de novo
    const r4 = await A.adminAvaliacao(avT, false, '', S.adm);
    const mC = await A.esperarAviso(dC.id, 'avaliacao_mostrada'); const mL = await A.esperarAviso(dL.id, 'avaliacao_mostrada');
    ok('C.9 mostrar de novo: avisados 2; sinos "Hinnang on jälle nähtav" (et) e "Оценка снова видна" (ru) com o contato, sem "Põhjus"',
      r4.d?.avisados === 2 && (await A.avaliacaoDoPedido(PT.id))?.oculta === false && mC[0]?.titulo === 'Hinnang on jälle nähtav' && mL[0]?.titulo === 'Оценка снова видна' && mC[0].mensagem.includes('support@bipfix.com') && !mC[0].mensagem.includes('Põhjus'),
      JSON.stringify([mC[0], mL[0]]));
    const r5 = await A.adminAvaliacao(avT, false, '', S.adm);
    ok('C.10 mostrar uma que ja esta visivel: avisados 0', r5.status === 200 && r5.d?.avisados === 0, JSON.stringify(r5));
    ok('C.11 contas de TESTE: continuam sem nenhum e-mail no Resend', para(dC.email).length === 0 && para(dL.email).length === 0 && para(func.email).length === 0);

    // par REAL: e-mail pelo Resend (falso), na lingua de cada conta, com motivo escapado e o contato
    const motivoR = 'Contains <b>phone</b> & insults';
    const r6 = await A.adminAvaliacao(avR, true, motivoR, S.adm);
    const eR = await esperar(async () => para(dR.email), (l) => l.length >= 1); const eV = await esperar(async () => para(dV.email), (l) => l.length >= 1);
    const ok1 = eR[0] || {}; const ok2 = eV[0] || {};
    ok('C.12 real: avisados 2; e-mail a autora (en) "Rating hidden: <peca>" e ao fornecedor (it) "Valutazione nascosta: <peca>"', r6.d?.avisados === 2 && eR.length === 1 && eV.length === 1 && ok1.subject === `Rating hidden: ${PR.descricao}` && ok2.subject === `Valutazione nascosta: ${PR.descricao}`, JSON.stringify([ok1.subject, ok2.subject, r6]));
    ok('C.13 e-mail: motivo escapado ("&lt;b&gt;"), texto de contestar com mailto:support@bipfix.com, responder-para support@bipfix.com',
      [ok1, ok2].every((e) => (e.html || '').includes('Contains &lt;b&gt;phone&lt;/b&gt; &amp; insults') && !(e.html || '').includes('<b>phone</b>') && (e.html || '').includes('mailto:support@bipfix.com') && e.replyTo?.includes('support@bipfix.com')),
      JSON.stringify([ok1.replyTo, ok2.replyTo, (ok1.html || '').slice(0, 200)]));
    ok('C.14 e-mail en: "reply to this email" + nomes das duas partes; it: "Se non sei d\'accordo"', (ok1.html || '').includes('reply to this email') && (ok1.html || '').includes(ofR.nome) && (ok1.html || '').includes(ofV.nome) && (ok2.html || '').includes("Se non sei d'accordo"));
    const sV = await A.esperarAviso(dV.id, 'avaliacao_ocultada');
    ok('C.15 real: fornecedor oficina recebe o sino (it "Valutazione nascosta") com link para a aba Vender', sV[0]?.titulo === 'Valutazione nascosta' && sV[0]?.dados?.link === '/oficina/pecas?aba=vender', JSON.stringify(sV[0]));
    const r7 = await A.adminAvaliacao(avR, false, 'Revisto', S.adm);
    const eR2 = await esperar(async () => para(dR.email), (l) => l.length >= 2);
    ok('C.16 real: mostrar de novo com motivo -> e-mail "Rating visible again" com "Reason: Revisto"', r7.d?.avisados === 2 && eR2[1]?.subject === `Rating visible again: ${PR.descricao}` && (eR2[1]?.html || '').includes('Reason: Revisto'), JSON.stringify(eR2.map((e) => e.subject)));
    ok('C.17 log do servidor: "[email] conta de teste - nao enviado" e nenhum endereco de conta de teste', /\[email\] conta de teste - nao enviado/.test(log) && ![dC.email, dL.email].some((e) => log.toLowerCase().includes(e)));
    ok('C.18 sem erro do aviso no log', !/aviso da decisao/.test(log), log.split('\n').filter((l) => /aviso da decisao/.test(l)).join(' | '));
  });

  nav = await abrirNavegadores(false);
  // ======================= R: ?repetir= sem pedido cancelado =======================
  await tentar('R', async () => {
    const cot = await A.cotacao(ofC, 'Repetir sem cancelado', { urgencia: 'hoje' });
    const ctx = await nav.contexto('chromium', 390, A.ip); const p = await ctx.newPage(); vigiar(p, erros, 'R dona');
    await entrarPelaTela(p, '/ee/et', dC);
    await ir(p, `/ee/et/oficina/pecas?repetir=${cot.id}`, 3500);
    const pre = await descricaoNoForm(p);
    ok('R.1 link ?repetir= de cotacao sem pedido cancelado: formulario aberto pre-preenchido', pre === cot.descricao, `form=${pre}`);
    const antes = ((await A.admin.from('cotacoes_pecas').select('id').eq('oficina_id', ofC.id)).data || []).length;
    await p.getByRole('button', { name: ET('oficinaPecas.enviarCotacao') }).click();
    const depois = await esperar(async () => ((await A.admin.from('cotacoes_pecas').select('id').eq('oficina_id', ofC.id)).data || []).length, (n) => n > antes);
    await sleep(1200);
    ok('R.2 envio: cotacao criada e ?repetir= fora da barra', depois === antes + 1 && !new URL(p.url()).searchParams.get('repetir'), p.url());
    await p.reload({ waitUntil: 'networkidle' }).catch(() => {}); await sleep(2500);
    ok('R.3 F5 depois do envio: formulario NAO reabre preenchido', (await descricaoNoForm(p)) !== cot.descricao, `form=${await descricaoNoForm(p)}`);
    await ctx.close();
  });

  // ======================= L: /loja/avaliacoes =======================
  await tentar('L', async () => {
    const ctx = await nav.contexto('chromium', 390, A.ip); const p = await ctx.newPage(); vigiar(p, erros, 'L loja real');
    await entrarPelaTela(p, '/ee/et', dLR);
    await ir(p, '/ee/et/loja/avaliacoes', 1000);
    await p.waitForURL((u) => u.pathname.endsWith('/loja/dashboard'), { timeout: 10000 }).catch(() => {});
    ok('L.1 loja REAL (interruptor desligado) em /loja/avaliacoes volta para /loja/dashboard', new URL(p.url()).pathname === '/ee/et/loja/dashboard', p.url());
    ok('L.2 loja real: nenhum loja-avaliacoes-* na pagina', (await p.locator('[data-testid^="loja-avaliacoes"]').count()) === 0);
    await ctx.close();
    const ctx2 = await nav.contexto('chromium', 390, A.ip); const p2 = await ctx2.newPage(); vigiar(p2, erros, 'L loja teste');
    await entrarPelaTela(p2, '/ee/ru', dL);
    await ir(p2, '/ee/ru/loja/avaliacoes', 3000);
    ok('L.3 loja de TESTE: fica em /loja/avaliacoes com o resumo e a lista', new URL(p2.url()).pathname === '/ee/ru/loja/avaliacoes' && await visivel(p2.getByTestId('loja-avaliacoes-resumo')), p2.url());
    await ctx2.close();
  });

  ok('nenhum erro de pagina', erros.length === 0, erros.join(' | '));
} catch (e) {
  ok('excecao geral', false, e?.stack || e?.message);
} finally {
  try { await nav?.fechar(); } catch { /* */ }
  parar();
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  ok('limpeza: nada desta rodada ficou no banco', errosLimpeza.length === 0 && sobras.length === 0, [...errosLimpeza, ...sobras].join(' | '));
  process.exitCode = fim() ? 1 : 0;
}
