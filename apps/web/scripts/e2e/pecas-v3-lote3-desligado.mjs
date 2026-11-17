// E2E LOCAL do lote 3 de pecas ("confianca") com o interruptor DESLIGADO: com plataforma_config.pecas_v3_ativo
// = false e contas REAIS tudo continua igual a hoje (Mapa_lote3.md sec. 9 "DESLIGADO" + Fable_auditoria_mapa_lote3.md
// sec. 2 e 9). Testes escritos ANTES da implementacao por um autor independente (o Fable estava sem creditos em
// 17/11); contrato em Documentos/Analises/Pecas_lote3_2026-11-17/Contrato_testids_lote3.md.
//   M0 interruptor, esquema e politicas RLS intocadas (D-12) | M1 cotacao pela tela de hoje: e-mails/sinos = referencia
//      (lote 2: e-mail loja + sino; NOVA: e-mail da oficina vendedora, paraLoja=false)
//   M2 loja responde: e-mail/sino "respondida" = referencia (lote 2) | M3 confirmar: e-mail = referencia (lote 2) + NOVA
//      referencia do sino pedido_peca_confirmado; pedido sem v3 | M4 loja marca entregue pela tela de hoje: NOVAS referencias
//      do e-mail e do sino "pedido entregue"; telas sem nenhum testid novo
//   M5 rotas novas em pedido de hoje (v3 NULL): 409 NAO_V3, nada gravado; contato com telefone (NULL = sempre)
//   M6 P-7 nunca vale para conta real: pedido antigo entregue ha 30 dias sem avaliacao -> cria e confirma
//   M7 aba Vender da vendedora real como hoje (nome da compradora, D-12) + pedido como fornecedora
//   M8 loja real nao ve nada novo (menu, /loja/avaliacoes, perfis, RLS, resumo) | M9 [NOVO] provider lazy
//   M10 global ligado -> pedido real v3 -> global desligado: cria e confirma; tarefa de lembretes nao toca conta real
// Os checks [NOVO] exigem o lote 3 e falham no codigo de hoje (esperado); TODOS os outros passam hoje e depois.
// Referencias em resultados/pecas-v3/: as 5 do lote 2 so sao COMPARADAS (nunca regravadas aqui); as 4 novas
// (referencia-email-pedido-entregue.html, -sino-pedido-entregue.json, -sino-pedido-confirmado.json,
// -email-cotacao-oficina.html) sao gravadas SO com PECAS_V3_GRAVAR_REFERENCIA=1 e SO no codigo de hoje (sem 093).
// Ctrl+C limpa. Nao rodar junto com outras suites nem entre 23:55 e 00:05 Europe/Tallinn. Reinicie o :3100 antes
// (teto diario de e-mails e limites de taxa ficam na memoria do processo).
//   node pecas-v3-lote3-desligado.mjs [<.env.local>]
import { lerEnv, ambienteL3, abrirNavegadores, contador, tradutor, SITE, ENV_PADRAO, siteNoAr, semRolagemLateral, vigiar, entrarPelaTela, ir, visivel, semChaveCrua, botao, normalizarEmail, normalizarSino, semTestidsNovosL3, compararReferenciaL3, REFERENCIA_EMAIL, REFERENCIA_EMAIL_PEDIDO, REFERENCIA_EMAIL_RESPONDIDA, REFERENCIA_SINO_DISPONIVEL, REFERENCIA_SINO_RESPONDIDA, REF_L3, PRINTS, sleep, horasAtras, DIA_MS, psql, POLITICAS_INTOCADAS_SQL, POLITICAS_INTOCADAS_MD5, TIPOS_SINO_L3, ROTA, podeGravarReferencia } from './pecas-v3-lote3-lib.mjs';

const env = lerEnv(process.argv[2] || ENV_PADRAO);
if (!(await siteNoAr())) { console.log(`FALHA site local nao responde em ${SITE} - nada rodou (nao inicio o site sozinho)`); process.exit(2); }
const A = ambienteL3(env);
const { ok, fim, tentar } = contador();
const ET = tradutor('et');
const erros = [];
const nav = await abrirNavegadores(false);
A.limparAoInterromper(nav.fechar);
const cardCom = (p, texto) => p.getByTestId('cotacao-peca').filter({ hasText: texto });
const cartaoLoja = (p, texto) => p.locator('div.card').filter({ hasText: texto });
const semNovos = async (p, opts) => { const n = await semTestidsNovosL3(p, opts); return { vazio: n.length === 0, lista: n.join(',') }; };
const chaves = (o) => JSON.stringify(Object.keys(o || {}).sort());
const gravando = process.env.PECAS_V3_GRAVAR_REFERENCIA === '1';
if (gravando) console.log(`info PECAS_V3_GRAVAR_REFERENCIA=1: grava as 4 referencias NOVAS do lote 3 (${podeGravarReferencia() ? 'codigo de hoje: permitido' : 'RECUSADO: a 093 ja existe'}); as 5 do lote 2 so sao comparadas`);
const t0 = Date.now();

try {
  // ======================= M0: interruptor, esquema, politicas =======================
  { const e = await A.interruptor(false); ok('M0a interruptor global pecas_v3_ativo = false', !e && A.interruptorEstado() === false, e?.message); }
  const tem = { v3: A.temColuna('pedidos_pecas', 'v3'), contato: A.temColuna('pedidos_pecas', 'contato_visivel_ate'), entregueEm: A.temColuna('pedidos_pecas', 'entregue_em'), lembretes: A.temColuna('pedidos_pecas', 'lembretes_feedback'), aval: A.tabelaExiste('fornecedores_avaliacoes'), push: A.tabelaExiste('push_navegador'), fP7: psql("select count(*) from pg_proc where proname='oficina_feedback_pecas_pendente'") !== '0', fResumo: psql("select count(*) from pg_proc where proname='fornecedor_resumo'") !== '0' };
  console.log(`info M0 esquema: ${Object.entries(tem).map(([k, v]) => `${k}=${v}`).join(' ')}; TAREFAS_SIMULAR_HORA=${A.temSimulacao}`);
  { const md5 = psql(POLITICAS_INTOCADAS_SQL); ok('M0b politicas RLS de cotacoes/respostas/mensagens/dispensas/placa/pedidos/fornecedores_contato/oficinas/lojas/notificacoes IDENTICAS as de hoje (D-12: so cotacoes_pecas_insert muda)', md5 === POLITICAS_INTOCADAS_MD5, `${md5} (esperado ${POLITICAS_INTOCADAS_MD5})`); }
  ok('M0c nenhum valor novo no enum de status do pedido (confirmado/entregue/cancelado)', psql("select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_attribute a on a.atttypid=t.oid where a.attrelid='pedidos_pecas'::regclass and a.attname='status'") === 'confirmado,entregue,cancelado');

  // ======================= contas =======================
  const dReal = await A.conta('oficina', 'compradora-real'); const ofReal = await A.oficina(dReal, 'Compradora real', { km: 0 });
  const dLojaReal = await A.conta('loja_pecas', 'loja-real', { telefone: '+372 5000 1111' }); const ljReal = await A.loja(dLojaReal, 'Loja real');
  const dVendReal = await A.conta('oficina', 'vendedora-real', { telefone: '+372 5000 2222' }); const ofVendReal = await A.oficina(dVendReal, 'Vendedora real', { km: 2, vendePecas: true });
  const dTeste = await A.conta('oficina', 'compradora-teste', { contaTeste: true }); const ofTeste = await A.oficina(dTeste, 'Compradora teste', { km: 0.7 });
  const dLojaTeste = await A.conta('loja_pecas', 'loja-teste', { contaTeste: true }); const ljTeste = await A.loja(dLojaTeste, 'Loja teste');
  const func = await A.funcionario(ofReal, 'funcionario-real');
  const sReal = await A.sessao(dReal), sLojaReal = await A.sessao(dLojaReal), sVendReal = await A.sessao(dVendReal), sTeste = await A.sessao(dTeste), sLojaTeste = await A.sessao(dLojaTeste), sFunc = await A.sessao(func);
  const PECA = `Esipiduriklotsid ${A.tag}`;
  let cotId = null, pedA = null, pedB = null;

  // ======================= M1: cotacao pela tela de hoje (390 + 1280) =======================
  const ctxD = await nav.contexto('chromium', 1280, A.ip); const pD = await ctxD.newPage(); vigiar(pD, erros, 'M1 1280');
  const ctxM = await nav.contexto('chromium', 390, A.ip); const pM = await ctxM.newPage(); vigiar(pM, erros, 'M1 390');
  await tentar('M1', async () => {
    for (const [p, rotulo] of [[pD, '1280'], [pM, '390']]) {
      await entrarPelaTela(p, '/ee/et', dReal);
      await ir(p, '/ee/et/oficina/pecas', 2500);
      const n0 = await semNovos(p);
      ok(`M1a ${rotulo} /oficina/pecas (sem cotacao) sem NENHUM testid novo (lotes 1-3: P-7, avaliacao, recebi...)`, n0.vazio, n0.lista);
      await botao(p, ET('oficinaPecas.novaCotacao')).click();
      await p.locator('#c8551-1').waitFor();
      const n = await semNovos(p);
      ok(`M1b ${rotulo} formulario de hoje sem testid novo (nem p7-criar-bloqueado) e sem chave crua`, n.vazio && semChaveCrua(await p.innerText('body')) && await semRolagemLateral(p), n.lista);
    }
    await ctxD.close();
    await pM.locator('#c8551-1').fill(PECA);
    await pM.locator('#c8551-2').fill('Volkswagen'); await pM.locator('#c8551-3').fill('Passat'); await pM.locator('#c8551-4').fill('2012');
    await pM.locator('#c8551-5').fill('2');
    await pM.locator('#peca-detalhes').fill('Esiketaste läbimõõt 312 mm.');
    await botao(pM, ET('oficinaPecas.enviarCotacao')).click();
    let cot = null; for (let i = 0; i < 40 && !cot; i++) { cot = (await A.admin.from('cotacoes_pecas').select('*').eq('oficina_id', ofReal.id).eq('peca_descricao', PECA).maybeSingle()).data; if (!cot) await sleep(300); }
    cotId = cot?.id || null;
    ok('M1c cotacao gravada pela tela de hoje (urgencia NULL, aberta)', !!cot && cot.status === 'aberta' && cot.urgencia == null, JSON.stringify(cot)?.slice(0, 200));
    const m = await A.esperarEmail(dLojaReal.email, t0, (e) => e.html.includes(PECA), 60);
    ok('M1d loja real recebe o e-mail imediato', !!m, m?.assunto);
    if (m) compararReferenciaL3(ok, 'M1e e-mail "cotacao nova" para LOJA (lote 2)', REFERENCIA_EMAIL, normalizarEmail(m.html, A.tag));
    const aL = await A.esperarAviso(dLojaReal.id, 'cotacao_peca_disponivel');
    if (aL[0]) compararReferenciaL3(ok, 'M1f sino cotacao_peca_disponivel (lote 2)', REFERENCIA_SINO_DISPONIVEL, normalizarSino(aL[0], A.tag)); else ok('M1f sino da loja real', false, 'sem sino');
    const mV = await A.esperarEmail(dVendReal.email, t0, (e) => e.html.includes(PECA), 40);
    ok('M1g oficina vendedora real (2 km, raio 30) recebe e-mail + sino como hoje', !!mV && (await A.sinoDisponivel(dVendReal.id, cotId)).length === 1, mV?.assunto);
    if (mV) compararReferenciaL3(ok, 'M1h e-mail "cotacao nova" para OFICINA vendedora (paraLoja=false, caminho que o alcance "pais" toca)', REF_L3.emailCotacaoOficina, normalizarEmail(mV.html, A.tag));
  });

  // ======================= M2: loja responde pela tela de hoje =======================
  const ctxL = await nav.contexto('chromium', 390, A.ip); const pL = await ctxL.newPage(); vigiar(pL, erros, 'M2 loja');
  await tentar('M2', async () => {
    const t2 = Date.now();
    await entrarPelaTela(pL, '/ee/et', dLojaReal);
    await ir(pL, '/ee/et/loja/cotacoes', 3000);
    const c = cartaoLoja(pL, PECA);
    await botao(c, ET('lojaCotacoes.responderCotacaoButton')).click();
    const n0 = await semNovos(pL);
    ok('M2a /loja/cotacoes com o formulario aberto: sem condicao da peca nem nada novo', (await pL.locator('#c40f3-1').isVisible()) && n0.vazio, n0.lista);
    await pL.locator('#c40f3-1').fill('40'); await pL.locator('#c40f3-2').fill('1');
    await botao(c, ET('lojaCotacoes.enviarRespostaButton')).click();
    let resp = null; for (let i = 0; i < 40 && !resp; i++) { resp = (await A.admin.from('cotacoes_pecas_respostas').select('*').eq('cotacao_id', cotId).eq('loja_id', ljReal.id).maybeSingle()).data; if (!resp) await sleep(300); }
    const jr = resp ? A.linhaJson('cotacoes_pecas_respostas', resp.id) : null;
    ok('M2b oferta gravada (40), condicao NULL quando a coluna existe', !!jr && Number(jr.preco) === 40 && (!('condicao' in jr) || jr.condicao === null), JSON.stringify(jr)?.slice(0, 200));
    const m = await A.esperarEmail(dReal.email, t2, (e) => e.html.includes(PECA), 60);
    if (m) compararReferenciaL3(ok, 'M2c e-mail "cotacao respondida" (lote 2)', REFERENCIA_EMAIL_RESPONDIDA, normalizarEmail(m.html, A.tag)); else ok('M2c e-mail "cotacao respondida"', false, 'sem e-mail');
    const aR = await A.esperarAviso(dReal.id, 'cotacao_peca_respondida');
    if (aR[0]) compararReferenciaL3(ok, 'M2d sino cotacao_peca_respondida (lote 2)', REFERENCIA_SINO_RESPONDIDA, normalizarSino(aR[0], A.tag)); else ok('M2d sino respondida', false, 'sem sino');
  });

  // ======================= M3: confirmar (rota de hoje) =======================
  await tentar('M3', async () => {
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    const n0 = await semNovos(pM);
    ok('M3a cartao com a oferta: sem nota do fornecedor (oferta-nota/-nova), sem condicao, sem p7-confirmar-bloqueado', (await cardCom(pM, PECA).getByTestId('oferta').count()) === 1 && n0.vazio, n0.lista);
    const t3 = Date.now();
    const respId = (await A.admin.from('cotacoes_pecas_respostas').select('id').eq('cotacao_id', cotId).eq('loja_id', ljReal.id).single()).data?.id;
    const r = await A.confirmar(respId, sReal.token);
    pedA = r.d?.pedidoId || null;
    const jp = pedA ? A.pedidoNoBanco(pedA) : null;
    ok('M3b confirmar -> 200, pedido confirmado (quantidade 2, total 80), v3 NULL quando a coluna existe', r.status === 200 && !!jp && jp.status === 'confirmado' && Number(jp.preco_total) === 80 && (!('v3' in jp) || jp.v3 === null), JSON.stringify({ r: r.d, jp }).slice(0, 300));
    const mL = await A.esperarEmail(dLojaReal.email, t3, (e) => /80[,.]00/.test(e.html), 40);
    if (mL) compararReferenciaL3(ok, 'M3c e-mail "pedido confirmado" (lote 1/2)', REFERENCIA_EMAIL_PEDIDO, normalizarEmail(mL.html, A.tag)); else ok('M3c e-mail pedido confirmado', false, 'sem e-mail');
    const aC = (await A.esperarAviso(dLojaReal.id, 'pedido_peca_confirmado')).filter((n) => n.dados?.pedido_id === pedA);
    ok('M3d sino pedido_peca_confirmado: 1 linha, dados.{cotacao_id, link, pedido_id, textos} sem chave nova', aC.length === 1 && chaves(aC[0].dados) === JSON.stringify(['cotacao_id', 'link', 'pedido_id', 'textos']) && aC[0].dados.link === '/loja/pedidos', JSON.stringify(aC[0]?.dados)?.slice(0, 200));
    if (aC[0]) compararReferenciaL3(ok, 'M3e sino pedido_peca_confirmado', REF_L3.sinoPedidoConfirmado, normalizarSino(aC[0], A.tag));
  });

  // ======================= M4: loja marca entregue pela tela de hoje =======================
  await tentar('M4', async () => {
    await ir(pL, '/ee/et/loja/pedidos', 3500);
    const row = pL.getByTestId('pedido-loja').filter({ hasText: PECA });
    const n0 = await semNovos(pL);
    ok('M4a /loja/pedidos (loja real): linha de hoje com o telefone da compradora, sem pedido-cancelar/contato-arquivado/recebido/problema', (await row.count()) === 1 && (await row.innerText()).includes(dReal.telefone) && n0.vazio, n0.lista);
    await pL.screenshot({ path: `${PRINTS}/lote3-desligado-loja-pedidos-et-390.png`, fullPage: true });
    const t4 = Date.now();
    await botao(row, ET('lojaPedidos.marcarEntregueButton')).click();
    let jp = null; for (let i = 0; i < 30; i++) { jp = A.pedidoNoBanco(pedA); if (jp?.status === 'entregue') break; await sleep(300); }
    ok('M4b pedido entregue (rota de hoje); contato_visivel_ate continua NULL (pedido de hoje = telefone sempre), lembretes 0', jp?.status === 'entregue' && (!('contato_visivel_ate' in jp) || jp.contato_visivel_ate === null) && (!('lembretes_feedback' in jp) || Number(jp.lembretes_feedback) === 0), JSON.stringify(jp)?.slice(0, 300));
    const m = await A.esperarEmail(dReal.email, t4, (e) => e.html.includes(PECA), 40);
    ok('M4c compradora real recebe o e-mail "pedido entregue" (sem "Recebeu? Sim/Problema")', !!m, m?.assunto);
    if (m) compararReferenciaL3(ok, 'M4d e-mail "pedido entregue"', REF_L3.emailPedidoEntregue, normalizarEmail(m.html, A.tag));
    const aE = (await A.esperarAviso(dReal.id, 'pedido_peca_entregue')).filter((n) => n.dados?.pedido_id === pedA);
    ok('M4e sino pedido_peca_entregue: 1 linha, dados.{pedido_id, textos} (sem chave nova)', aE.length === 1 && chaves(aE[0].dados) === JSON.stringify(['pedido_id', 'textos']), JSON.stringify(aE[0]?.dados)?.slice(0, 200));
    if (aE[0]) compararReferenciaL3(ok, 'M4f sino pedido_peca_entregue', REF_L3.sinoPedidoEntregue, normalizarSino(aE[0], A.tag));
    await ir(pL, '/ee/et/loja/pedidos', 2500);
    const n1 = await semNovos(pL);
    ok('M4g /loja/pedidos depois de entregue: como hoje, sem elemento novo', n1.vazio && (await pL.getByTestId('pedido-loja').filter({ hasText: PECA }).innerText()).includes(dReal.telefone), n1.lista);
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    const card = cardCom(pM, PECA);
    const n2 = await semNovos(pM);
    ok('M4h cartao da compradora real: "entregue", oferta escolhida + contato; SEM recebi/problema/avaliar/p7 (pedido de hoje)', (await card.getByTestId('cotacao-status').innerText().catch(() => '')).trim() === ET('oficinaPecas.entregue') && (await card.getByTestId('oferta-escolhida').count()) === 1 && (await card.getByTestId('contato-fornecedor').innerText().catch(() => '')).includes('5000 1111') && n2.vazio, n2.lista);
    await pM.screenshot({ path: `${PRINTS}/lote3-desligado-cartao-entregue-et-390.png`, fullPage: true });
  });

  // ======================= M5: rotas novas em pedido de hoje (v3 NULL) =======================
  await tentar('M5', async () => {
    // 2o pedido real, so confirmado
    const cotB = await A.cotacao(ofReal, 'Confirmado real');
    const respB = await A.resposta(cotB, ljReal, { preco: 15 });
    const rB = await A.confirmar(respB, sReal.token);
    pedB = rB.d?.pedidoId || null;
    if (!pedB) throw new Error(`confirmar pedido B: ${JSON.stringify(rB)}`);
    const nao = (r) => r.status === 409 && r.d?.codigo === 'NAO_V3';
    const r1 = await A.recebido(pedA, sReal);
    ok(`[NOVO] M5a POST ${ROTA.recebido} (dona) em pedido de hoje -> 409 NAO_V3`, nao(r1), `${r1.status} ${JSON.stringify(r1.d).slice(0, 120)}`);
    const r2 = await A.problema(pedB, 'nao_entregou', sReal);
    ok(`[NOVO] M5b POST ${ROTA.problema} nao_entregou (dona) em pedido de hoje -> 409 NAO_V3`, nao(r2), `${r2.status} ${JSON.stringify(r2.d).slice(0, 120)}`);
    const r3 = await A.cancelar(pedB, 'comprei_outro', sReal), r4 = await A.cancelar(pedB, 'sem_estoque', sLojaReal);
    ok(`[NOVO] M5c POST ${ROTA.cancelar} em pedido de hoje -> 409 NAO_V3 pelos dois lados (compradora e loja real)`, nao(r3) && nao(r4), `${r3.status}/${r4.status}`);
    const r5 = await A.depois(pedB, 'reabrir', sReal);
    ok(`[NOVO] M5d POST ${ROTA.depois} em pedido de hoje -> 409 NAO_V3`, nao(r5), `${r5.status} ${JSON.stringify(r5.d).slice(0, 120)}`);
    const r6 = await A.avaliar(pedA, sReal, { nota: 2 });
    ok(`[NOVO] M5e POST ${ROTA.avaliar} em pedido de hoje -> 409 NAO_V3`, nao(r6), `${r6.status} ${JSON.stringify(r6.d).slice(0, 120)}`);
    const r7 = await A.pendentes(sReal);
    ok(`[NOVO] M5f GET ${ROTA.pendentes} (conta real, global off) -> 200 { bloqueado: false, pedidos: [] }`, r7.status === 200 && r7.d?.bloqueado === false && Array.isArray(r7.d?.pedidos) && r7.d.pedidos.length === 0, `${r7.status} ${JSON.stringify(r7.d).slice(0, 160)}`);
    // nada gravado (vale hoje e depois)
    const ja = A.pedidoNoBanco(pedA), jb = A.pedidoNoBanco(pedB);
    const limpo = (j) => ['recebido_em', 'problema', 'cancelado_por', 'cancelado_motivo', 'pos_cancelamento'].every((k) => !(k in j) || j[k] === null);
    ok('M5g nada gravado pelas tentativas: pedido A entregue, B confirmado, sem recebido/problema/cancelado_*', ja?.status === 'entregue' && jb?.status === 'confirmado' && limpo(ja) && limpo(jb), JSON.stringify({ a: ja?.status, b: jb?.status }));
    if (tem.aval) ok('M5h fornecedores_avaliacoes: 0 linhas desta conta real', (await A.avaliacoesDe({ oficina_id: ofReal.id })).length === 0);
    else ok('M5h fornecedores_avaliacoes ainda nao existe (esquema de hoje): nada a conferir', true);
    const cC = await A.contato([pedA, pedB], sReal.token), cL = await A.contato([pedA, pedB], sLojaReal.token);
    ok('M5i contato-pedido-peca (v3 NULL = sempre): compradora ve o telefone da loja e a loja o da compradora, nos 2 pedidos, sem "arquivado"', cC.status === 200 && [pedA, pedB].every((id) => cC.d.contatos?.[id]?.telefone === '+372 5000 1111' && !cC.d.contatos[id].arquivado) && [pedA, pedB].every((id) => cL.d.contatos?.[id]?.telefone === dReal.telefone && !cL.d.contatos[id].arquivado), JSON.stringify({ cC: cC.d, cL: cL.d }).slice(0, 300));
  });

  // ======================= M6: P-7 nunca vale para conta real =======================
  await tentar('M6', async () => {
    // pedido A: entregue "ha 30 dias", sem avaliacao, sem lembrete
    const dias30 = new Date(Date.now() - 30 * DIA_MS).toISOString();
    const campos = { created_at: dias30, ...(tem.entregueEm ? { entregue_em: dias30 } : {}) };
    await A.atualizarPedido(pedA, campos);
    const { data: ins, error: eI } = await sReal.c.from('cotacoes_pecas').insert({ oficina_id: ofReal.id, peca_descricao: `TESTE-PECAS P7 real REST ${A.tag}`, quantidade: 1 }).select('id').single();
    ok('M6a conta real com pedido antigo entregue ha 30 dias SEM avaliacao: INSERT de cotacao pela RLS passa', !eI && !!ins, eI ? `${eI.code} ${eI.message}` : '');
    const cotC = await A.cotacao(ofReal, 'P7 real confirma');
    const respC = await A.resposta(cotC, ljReal, { preco: 12 });
    const rC = await A.confirmar(respC, sReal.token);
    ok('M6b ... e CONFIRMA uma oferta (200, sem FEEDBACK_PENDENTE)', rC.status === 200 && !!rC.d?.pedidoId, `${rC.status} ${JSON.stringify(rC.d).slice(0, 160)}`);
    if (tem.fP7) { const r = await A.pendenteRpc(sReal, ofReal.id); ok('M6c oficina_feedback_pecas_pendente(conta real) = false', !r.error && r.valor === false, r.error?.message || String(r.valor)); }
    else ok('M6c funcao P-7 ainda nao existe (esquema de hoje): nada a conferir', true);
    // pela tela: botao de criar e de confirmar como hoje
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    const n = await semNovos(pM);
    ok('M6d tela da compradora real: sem p7-aviso/p7-bloqueio, botao "nova cotacao" de hoje', n.vazio && await visivel(botao(pM, ET('oficinaPecas.novaCotacao'))), n.lista);
  });

  // ======================= M7: aba Vender da vendedora real =======================
  const ctxV = await nav.contexto('chromium', 390, A.ip); const pV = await ctxV.newPage(); vigiar(pV, erros, 'M7 vendedora');
  await tentar('M7', async () => {
    // cotacao ABERTA da compradora real (a do M1 ja fechou) e um pedido ganho pela vendedora
    const cotAberta = await A.cotacao(ofReal, 'Aberta para vender');
    const cotW = await A.cotacao(ofReal, 'Venda oficina real');
    const respW = await A.resposta(cotW, ofVendReal, { tipo: 'oficina', preco: 25 });
    const rW = await A.confirmar(respW, sReal.token);
    const pedW = rW.d?.pedidoId || null;
    ok('M7a compradora real confirma a oferta da oficina vendedora real (200)', rW.status === 200 && !!pedW, JSON.stringify(rW).slice(0, 160));
    await entrarPelaTela(pV, '/ee/et', dVendReal);
    await ir(pV, '/ee/et/oficina/pecas?aba=vender', 3500);
    const cv = cartaoLoja(pV, cotAberta.descricao);
    const link = await cv.locator('a[href*="compradoraNome="]').first().getAttribute('href').catch(() => '');
    ok('M7b aba Vender: cartao da cotacao com o NOME da compradora (D-12: sem anonimato) e o link "tirar duvida" com compradoraNome=', (await cv.count()) === 1 && (await cv.innerText()).includes(ofReal.nome) && decodeURIComponent(link || '').includes(ofReal.nome), link);
    const lista = pV.getByTestId('pedidos-como-fornecedora');
    const row = lista.locator('div.rounded-lg').filter({ hasText: cotW.descricao });
    ok('M7c "meus pedidos como fornecedora": pedido com o nome e o telefone da compradora (como hoje)', (await row.count()) >= 1 && (await row.first().innerText()).includes(ofReal.nome) && (await row.first().innerText()).includes(dReal.telefone), (await lista.innerText().catch(() => '')).slice(0, 200));
    await botao(cv, ET('oficinaPecas.responderCotacao')).click().catch(() => {});
    const n = await semNovos(pV);
    ok('M7d aba Vender (formulario de resposta aberto): sem condicao (resposta-condicao-*), sem fornecedora-nota, sem pedido-cancelar', n.vazio, n.lista);
    await pV.screenshot({ path: `${PRINTS}/lote3-desligado-vender-et-390.png`, fullPage: true });
    await botao(row.first(), ET('oficinaPecas.marcarEntregue')).click();
    let st = null; for (let i = 0; i < 30; i++) { st = A.pedidoNoBanco(pedW)?.status; if (st === 'entregue') break; await sleep(300); }
    ok('M7e vendedora marca entregue pela tela de hoje -> entregue', st === 'entregue', st);
    const { data: lida } = await sVendReal.c.from('cotacoes_pecas').select('id, oficina_id').eq('id', cotAberta.id);
    ok('M7f REST: a vendedora real continua lendo a cotacao aberta da compradora real, com oficina_id (D-12)', (lida || []).length === 1 && lida[0].oficina_id === ofReal.id, JSON.stringify(lida));
  });
  await ctxV.close();

  // ======================= M8: loja real nao ve nada novo =======================
  await tentar('M8', async () => {
    const ctxL2 = await nav.contexto('chromium', 1280, A.ip); const pL2 = await ctxL2.newPage(); vigiar(pL2, erros, 'M8 loja 1280');
    await entrarPelaTela(pL2, '/ee/et', dLojaReal);
    await ir(pL2, '/ee/et/loja/pedidos', 3000);
    ok('M8a menu da loja real (1280) sem link para /loja/avaliacoes', (await pL2.locator('nav a[href$="/loja/avaliacoes"]').count()) === 0);
    await ir(pL2, '/ee/et/loja/avaliacoes', 2500);
    const n1 = await semNovos(pL2);
    ok('M8b /loja/avaliacoes com a loja real: nenhum loja-avaliacoes-* nem avaliacao-* (tela nova so ligada)', n1.vazio, n1.lista);
    await ir(pL2, '/ee/et/loja/perfil', 2500);
    const n2 = await semNovos(pL2);
    ok('M8c /loja/perfil (loja real): sem push-*, sem alcance', (await pL2.locator('#c9a81-3').count()) === 1 && n2.vazio, n2.lista);
    await ir(pL2, '/ee/et/loja/cotacoes', 2500);
    const n3 = await semNovos(pL2);
    ok('M8d /loja/cotacoes (loja real): sem nota de fornecedor nem nada novo', n3.vazio, n3.lista);
    await ctxL2.close();
    await ir(pM, '/ee/et/oficina/perfil', 2500);
    const n4 = await semNovos(pM);
    ok('M8e /oficina/perfil (compradora real): sem perfil-pecas-alcance-*, sem push-*', (await pM.locator('#c83a1-9').count()) === 1 && n4.vazio, n4.lista);
    // ancora: 1 avaliacao de TESTE semeada (sem ela, 0 linhas sairia igual com uma RLS aberta)
    if (tem.aval && tem.v3) { const pT = await A.pedidoV3(ofTeste, ljTeste, { status: 'entregue', descricao: 'Avaliacao de teste', campos: { entregue_em: new Date().toISOString() } }); await A.avaliacaoSemente(pT, ofTeste, dTeste, ljTeste, { nota: 5 }); }
    if (tem.aval) {
      const { data: d0 } = await sTeste.c.from('fornecedores_avaliacoes').select('id').eq('fornecedor_id', ljTeste.id);
      const { data: d1, error: e1 } = await sLojaReal.c.from('fornecedores_avaliacoes').select('id');
      const { data: d2, error: e2 } = await sReal.c.from('fornecedores_avaliacoes').select('id');
      ok('M8f REST fornecedores_avaliacoes: a oficina de TESTE le a avaliacao semeada (ancora, 1); loja real e oficina real leem 0 (paridade)', (d0 || []).length === 1 && !e1 && !e2 && (d1 || []).length === 0 && (d2 || []).length === 0, `teste=${(d0 || []).length} ${(d1 || []).length}/${(d2 || []).length} ${e1?.message || ''}${e2?.message || ''}`);
    } else ok('M8f fornecedores_avaliacoes ainda nao existe: nada a conferir', true);
    if (tem.fResumo) { const r0 = await A.resumoForn(sLojaTeste, 'loja', ljTeste.id); const r = await A.resumoForn(sLojaReal, 'loja', ljTeste.id); ok('M8g fornecedor_resumo(loja de TESTE): pela propria loja de teste total 1 (ancora); pela loja real -> vazio (paridade conta_teste)', Number(r0.linha?.total) === 1 && !r.error && (!r.linha || r.linha.total == null || Number(r.linha.total) === 0), JSON.stringify(r)); }
    else ok('M8g fornecedor_resumo ainda nao existe: nada a conferir', true);
    // paridade: cotacao de teste nao chega a loja real
    const cotT = await A.cotacao(ofTeste, 'Cotacao de TESTE');
    const t8 = Date.now();
    const rn = await A.notificarFornecedores(cotT.id, sTeste.token);
    await A.esperarAviso(dLojaTeste.id, 'cotacao_peca_disponivel', 20);
    await sleep(1500);
    ok('M8h paridade: cotacao de teste avisa a loja de teste e NAO a loja real (sino/e-mail)', rn.status === 200 && (await A.sinoDisponivel(dLojaTeste.id, cotT.id)).length === 1 && (await A.sinoDisponivel(dLojaReal.id, cotT.id)).length === 0 && A.emailsDe(dLojaReal.email, t8).length === 0);
    if (tem.push) { const { count } = await A.admin.from('push_navegador').select('id', { count: 'exact', head: true }).in('profile_id', [dReal.id, dLojaReal.id, dVendReal.id]); ok('M8i push_navegador: 0 linhas das contas reais', count === 0, String(count)); }
    else ok('M8i push_navegador ainda nao existe (3c): nada a conferir', true);
  });

  // ======================= M9: [NOVO] provider lazy: 1 GET /api/pecas-v3 por sessao (contas reais tambem) =======================
  await tentar('M9', async () => {
    const ctxP = await nav.contexto('chromium', 1280, A.ip); const pP = await ctxP.newPage(); vigiar(pP, erros, 'M9');
    await entrarPelaTela(pP, '/ee/et', dLojaReal);
    let n = 0; pP.on('request', (q) => { if (/\/api\/pecas-v3(\?|$)/.test(q.url())) n++; });
    await ir(pP, '/ee/et/loja/dashboard', 2000);
    const noDashboard = n;
    for (const destino of ['/loja/cotacoes', '/loja/pedidos', '/loja/catalogo', '/loja/cotacoes']) {
      await pP.locator(`nav a[href$="${destino}"]:visible`).first().click();
      await pP.waitForURL((u) => u.pathname.endsWith(destino), { timeout: 15000 }).catch(() => {});
      await pP.waitForLoadState('networkidle').catch(() => {});
      await pP.waitForTimeout(800);
    }
    ok('[NOVO] M9a PecasV3Provider lazy no layout: 0 pedidos no /loja/dashboard e no MAXIMO 1 GET /api/pecas-v3 navegando pelo menu (cotacoes -> pedidos -> catalogo -> cotacoes)', noDashboard === 0 && n === 1, `dashboard=${noDashboard} total=${n}`);
    ok('M9b depois da navegacao a tela de cotacoes da loja real continua a de hoje', (await semTestidsNovosL3(pP)).length === 0);
    await ctxP.close();
  });

  // ======================= M10: global ligado -> pedido real v3 -> global desligado =======================
  await tentar('M10', async () => {
    const cotOn = await A.cotacao(ofReal, 'Global ligado');
    const respOn = await A.resposta(cotOn, ljReal, { preco: 30 });
    { const e = await A.interruptor(true); if (e) throw new Error('ligar global: ' + e.message); }
    let pedOn = null;
    try {
      const r = await A.confirmar(respOn, sReal.token);
      pedOn = r.d?.pedidoId || null;
      const jp = pedOn ? A.pedidoNoBanco(pedOn) : null;
      ok('[NOVO] M10a global LIGADO: confirmar de conta real grava v3 = true', !!jp && jp.v3 === true, JSON.stringify(jp)?.slice(0, 200));
      if (pedOn && tem.v3 && tem.entregueEm && tem.lembretes) {
        const dias5 = new Date(Date.now() - 5 * DIA_MS).toISOString();
        await A.atualizarPedido(pedOn, { status: 'entregue', entregue_em: dias5, lembretes_feedback: 1 });
        const { error: eOn } = await sReal.c.from('cotacoes_pecas').insert({ oficina_id: ofReal.id, peca_descricao: `TESTE-PECAS bloqueada com global ${A.tag}`, quantidade: 1 }).select('id').single();
        ok('[NOVO] M10b ancora: com o global LIGADO o mesmo pedido (entregue ha 5 dias, 1 lembrete, sem avaliacao) BLOQUEIA o INSERT (42501)', eOn?.code === '42501', eOn ? `${eOn.code} ${eOn.message}` : 'passou');
      } else ok('[NOVO] M10b ancora do bloqueio com o global ligado (exige v3/entregue_em/lembretes_feedback da 093)', false, 'colunas da 093 ausentes');
    } finally {
      const e = await A.interruptor(false);
      ok('M10c global DESLIGADO de novo', !e && A.interruptorEstado() === false, e?.message);
    }
    const { data: ins, error: eI } = await sReal.c.from('cotacoes_pecas').insert({ oficina_id: ofReal.id, peca_descricao: `TESTE-PECAS depois do global ${A.tag}`, quantidade: 1 }).select('id').single();
    ok('M10d global desligado: o pedido real v3 pendente NAO bloqueia - INSERT de cotacao passa', !eI && !!ins, eI ? `${eI.code} ${eI.message}` : '');
    const cotD = await A.cotacao(ofReal, 'Depois do global');
    const respD = await A.resposta(cotD, ljReal, { preco: 11 });
    const rD = await A.confirmar(respD, sReal.token);
    ok('M10e ... e CONFIRMA (200, sem FEEDBACK_PENDENTE)', rD.status === 200 && !!rD.d?.pedidoId, `${rD.status} ${JSON.stringify(rD.d).slice(0, 160)}`);
    // o unico dado real com a marca v3: depois do liga/desliga as telas de hoje continuam (decide o interruptor, nao o dado)
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    const nK = await semNovos(pM);
    const cardOn = cardCom(pM, cotOn.descricao);
    ok('M10k tela da compradora REAL com o pedido v3 (entregue, 1 lembrete quando a 093 existe) e global OFF: cartao de hoje, sem recebi/problema/avaliar/p7', (await cardOn.count()) === 1 && nK.vazio && (!pedOn || !tem.v3 || (await cardOn.getByTestId('cotacao-status').innerText().catch(() => '')).trim() === ET('oficinaPecas.entregue')), nK.lista);
    await ir(pL, '/ee/et/loja/pedidos', 3000);
    const nL = await semNovos(pL);
    ok('M10l /loja/pedidos da loja REAL com o mesmo pedido v3: sem pedido-cancelar/contato-arquivado/recebido-info, telefone da compradora como hoje', nL.vazio && (await pL.getByTestId('pedido-loja').filter({ hasText: cotOn.descricao }).innerText().catch(() => '')).includes(dReal.telefone), nL.lista);
    const pd = await A.pendentes(sReal);
    ok(`[NOVO] M10f GET ${ROTA.pendentes} com o global desligado -> { bloqueado: false, pedidos: [] } (mesmo com o pedido real v3 pendente)`, pd.status === 200 && pd.d?.bloqueado === false && Array.isArray(pd.d?.pedidos) && pd.d.pedidos.length === 0, `${pd.status} ${JSON.stringify(pd.d).slice(0, 160)}`);
    if (tem.fP7) { const r = await A.pendenteRpc(sReal, ofReal.id); ok('M10g oficina_feedback_pecas_pendente(conta real, global off) = false', !r.error && r.valor === false, r.error?.message || String(r.valor)); }
    else ok('M10g funcao P-7 ainda nao existe: nada a conferir', true);
    // tarefa de lembretes: nao toca conta real com o global desligado
    const t10 = Date.now();
    const agora = A.temSimulacao ? new Date(Date.now() + 2 * DIA_MS).toISOString() : undefined;
    const rf = await A.feedback(agora);
    ok(`[NOVO] M10h POST ${ROTA.feedback} com a chave -> 200 { ok: true, lembretes: n }`, rf.status === 200 && rf.d?.ok === true && Number.isInteger(rf.d?.lembretes), `${rf.status} ${JSON.stringify(rf.d).slice(0, 160)}`);
    const rf403 = await A.feedback(agora, 'chave-errada');
    ok(`[NOVO] M10i ${ROTA.feedback} com chave errada -> 403`, rf403.status === 403, String(rf403.status));
    await sleep(1500);
    const jOn = pedOn ? A.pedidoNoBanco(pedOn) : null;
    ok('M10j tarefa de lembretes com o global desligado: nenhum e-mail/sino de lembrete para a compradora real; lembretes_feedback intocado', A.emailsDe(dReal.email, t10).length === 0 && (await A.avisos(dReal.id, 'feedback_peca_lembrete')).length === 0 && (!jOn || !('lembretes_feedback' in jOn) || Number(jOn.lembretes_feedback) === 1), JSON.stringify({ lembretes: jOn?.lembretes_feedback }));
  });

  // ======================= M11: nada novo chegou as contas reais =======================
  await tentar('M11', async () => {
    const { data: ns } = await A.admin.from('notificacoes').select('tipo').in('profile_id', [dReal.id, dLojaReal.id, dVendReal.id, func.id]);
    const novos = (ns || []).filter((n) => TIPOS_SINO_L3.includes(n.tipo)).map((n) => n.tipo);
    ok('M11a contas reais (compradora, loja, vendedora, funcionario): nenhum sino de tipo novo do lote 3', novos.length === 0, novos.join(','));
    const r = await A.pendentes(sFunc);
    ok(`[NOVO] M11b GET ${ROTA.pendentes} pelo funcionario da compradora real -> 200 bloqueado false (equipe le)`, r.status === 200 && r.d?.bloqueado === false, `${r.status} ${JSON.stringify(r.d).slice(0, 120)}`);
  });

  await ctxM.close(); await ctxL.close();
  ok('sem erro de pagina nos navegadores', erros.length === 0, erros.join(' | '));
} catch (e) {
  ok('excecao geral', false, e?.stack || e?.message);
} finally {
  await nav.fechar();
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  ok('limpeza: nada desta rodada ficou no banco nem na pasta de e-mails; interruptor restaurado', errosLimpeza.length === 0 && sobras.length === 0, [...errosLimpeza, ...sobras].join(' | '));
  process.exitCode = fim() ? 1 : 0;
}
