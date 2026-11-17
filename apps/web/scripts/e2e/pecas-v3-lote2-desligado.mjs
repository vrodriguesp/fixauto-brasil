// E2E LOCAL do lote 2 de pecas com o interruptor DESLIGADO (fase C do plano, Fable_auditoria_mapa_lote2.md
// secao 8): com plataforma_config.pecas_v3_ativo = false e contas REAIS tudo continua igual ao lote 1 /
// hoje: DOM sem nenhum testid novo (lotes 1 e 2), os 3 e-mails (cotacao nova, cotacao respondida, pedido
// confirmado) e os 2 sinos (cotacao_peca_disponivel, cotacao_peca_respondida) byte a byte com as referencias,
// urgencia NULL, fila so com 'imediato', tokens "nao tenho" inexistentes, resumo = 0, vencer = 0.
// Roda tambem no codigo de hoje (30d939b) como linha de base: so os checks [NOVO] podem falhar la
// (rotas novas e as mudancas que o contrato faz independente do interruptor: RLS da oficina em
// fornecedores_contato, "reabrir" para expirada sem v3, erro inline ao responder, timeout do hook).
//   L0 interruptor | L1 DOM da tela de criar (1280 + 390) | L2 cotacao pela tela de hoje: e-mail + sino = referencia
//   L3 loja responde pela tela de hoje: e-mail "cotacao respondida" + sino = referencia (gravados na 1a rodada)
//   L4 cartao da compradora + confirmar (quantidade = pedida) + e-mail "pedido confirmado" = referencia
//   L5 perfis e pagina do pedido do motorista sem elementos novos | L6 [NOVO] tarefa de resumo = 0; vencer = 0
//   L7 [NOVO] /n/<token> 302 + 410 sem escrever | L8 [NOVO] seguranca/qualidade independente do interruptor
//   L9 paridade: loja real nao recebe nada (sino, e-mail, fila, token) de cotacao de teste
// Referencias em resultados/pecas-v3/: gravadas SO com PECAS_V3_GRAVAR_REFERENCIA=1 (codigo de hoje);
// sem o arquivo e sem a variavel o check FALHA. Ctrl+C limpa. Nao rodar junto com as outras suites,
// nem entre 23:55 e 00:05 Europe/Tallinn (o teto diario de e-mails vira a meia-noite de Tallinn).
//   node pecas-v3-lote2-desligado.mjs [<.env.local>]
import { lerEnv, ambienteL2, abrirNavegadores, contador, tradutor, SITE, ENV_PADRAO, siteNoAr, semRolagemLateral, vigiar, entrarPelaTela, ir, visivel, semChaveCrua, botao, normalizarEmail, normalizarSino, compararReferencia, semTestidsNovosL2, REFERENCIA_EMAIL, REFERENCIA_EMAIL_PEDIDO, REFERENCIA_EMAIL_RESPONDIDA, REFERENCIA_SINO_DISPONIVEL, REFERENCIA_SINO_RESPONDIDA, PRINTS, sleep, horasAtras, DIA_MS, psql, tallinnEmUtc, proximoDiaUtilTallinn, slotDe, SLUG_NAO_TENHO, ROTA_RESUMO, ROTA_NAO_TENHO_EMAIL, ROTA_TAREFA } from './pecas-v3-lote2-lib.mjs';

const env = lerEnv(process.argv[2] || ENV_PADRAO);
if (!(await siteNoAr())) { console.log(`FALHA site local nao responde em ${SITE} - nada rodou (nao inicio o site sozinho)`); process.exit(2); }
const A = ambienteL2(env);
const { ok, fim, tentar } = contador();
const ET = tradutor('et');
const erros = [];
const nav = await abrirNavegadores(false);
A.limparAoInterromper(nav.fechar);
const cardCom = (p, texto) => p.getByTestId('cotacao-peca').filter({ hasText: texto });
const cartaoLoja = (p, texto) => p.locator('div.card').filter({ hasText: texto });
const dentro7d = (iso) => !!iso && Math.abs(new Date(iso) - (Date.now() + 7 * DIA_MS)) < 3600e3;
const semNovos = async (p) => { const n = await semTestidsNovosL2(p); return { vazio: n.length === 0, lista: n.join(',') }; };

try {
  // ======================= L0: interruptor e esquema =======================
  { const e = await A.interruptor(false); ok('L0 interruptor global pecas_v3_ativo = false', !e && A.interruptorEstado() === false, e?.message); }
  const tem = { urgencia: A.colunaExiste('cotacoes_pecas', 'urgencia'), dispensas: A.tabelaExiste('cotacoes_pecas_dispensas'), avisos: A.tabelaExiste('avisos_email_pecas'), links: A.tabelaExiste('pecas_links_email'), ofertada: A.colunaExiste('cotacoes_pecas_respostas', 'quantidade_ofertada') };
  console.log(`info L0 esquema: urgencia=${tem.urgencia} dispensas=${tem.dispensas} avisos_email=${tem.avisos} links_email=${tem.links} quantidade_ofertada=${tem.ofertada}; TAREFAS_SIMULAR_HORA=${A.temSimulacao}`);
  if (tem.urgencia) ok("L0b cotacoes_pecas.urgencia SEM default (a tela de hoje grava NULL = imediato)", psql("select coalesce(column_default,'') from information_schema.columns where table_name='cotacoes_pecas' and column_name='urgencia'") === '');
  ok('L0c cotacoes_pecas sem solicitacao_id (cortado: pre-preenchimento so pela URL)', !A.colunaExiste('cotacoes_pecas', 'solicitacao_id'));

  // ======================= contas =======================
  const dReal = await A.conta('oficina', 'compradora-real'); const ofReal = await A.oficina(dReal, 'Compradora real', { km: 0 });
  const dLojaReal = await A.conta('loja_pecas', 'loja-real', { telefone: '+372 5000 1111' }); const ljReal = await A.loja(dLojaReal, 'Loja real');
  const dVendReal = await A.conta('oficina', 'vendedora-real'); await A.oficina(dVendReal, 'Vendedora real', { km: 2, vendePecas: true });
  const dTeste = await A.conta('oficina', 'compradora-teste', { contaTeste: true }); const ofTeste = await A.oficina(dTeste, 'Compradora teste', { km: 0.7 });
  const dLojaTeste = await A.conta('loja_pecas', 'loja-teste', { contaTeste: true }); await A.loja(dLojaTeste, 'Loja teste');
  const cliReal = await A.cliente('motorista-real'); const sol = await A.solicitacao(cliReal, { placa: 'TA1234' });
  const func = await A.funcionario(ofReal, 'funcionario-real');
  const sReal = await A.sessao(dReal), sLojaReal = await A.sessao(dLojaReal), sTeste = await A.sessao(dTeste), sFunc = await A.sessao(func);
  const PECA = `Esipiduriklotsid ${A.tag}`;
  let cotId = null, cot3 = null;

  // ======================= L1: tela de criar = hoje (1280 e 390) =======================
  const ctxD = await nav.contexto('chromium', 1280, A.ip); const pD = await ctxD.newPage(); vigiar(pD, erros, 'L1 1280');
  const ctxM = await nav.contexto('chromium', 390, A.ip); const pM = await ctxM.newPage(); vigiar(pM, erros, 'L1 390');
  await tentar('L1', async () => {
    for (const [p, rotulo] of [[pD, '1280'], [pM, '390']]) {
      await entrarPelaTela(p, '/ee/et', dReal);
      await ir(p, '/ee/et/oficina/pecas', 2500);
      await botao(p, ET('oficinaPecas.novaCotacao')).click();
      await p.locator('#c8551-1').waitFor();
      const faltam = []; for (const s of ['#c8551-1', '#c8551-2', '#c8551-3', '#c8551-4', '#c8551-5', '#peca-detalhes', '#peca-fotos']) if (!(await p.locator(s).isVisible().catch(() => false))) faltam.push(s);
      const n = await semNovos(p);
      ok(`L1a ${rotulo} formulario de hoje completo e sem NENHUM testid novo (lotes 1 e 2: urgencia, IVA, nao tenho...)`, faltam.length === 0 && n.vazio, `${faltam.join(',')} ${n.lista}`);
      ok(`L1b ${rotulo} sem chave crua, sem rolagem lateral`, semChaveCrua(await p.innerText('body')) && await semRolagemLateral(p));
    }
    await pD.screenshot({ path: `${PRINTS}/lote2-desligado-criar-et-1280.png`, fullPage: true });
  });
  await ctxD.close();

  // ======================= L2: cotacao pela tela de hoje -> e-mail e sino = referencia =======================
  const t0 = Date.now();
  await tentar('L2', async () => {
    await pM.locator('#c8551-1').fill(PECA);
    await pM.locator('#c8551-2').fill('Volkswagen');
    await pM.locator('#c8551-3').fill('Passat');
    await pM.locator('#c8551-4').fill('2012');
    await pM.locator('#c8551-5').fill('2');
    await pM.locator('#peca-detalhes').fill('Esiketaste läbimõõt 312 mm.');
    await botao(pM, ET('oficinaPecas.enviarCotacao')).click();
    let cot = null; for (let i = 0; i < 40 && !cot; i++) { cot = (await A.admin.from('cotacoes_pecas').select('*').eq('oficina_id', ofReal.id).maybeSingle()).data; if (!cot) await sleep(300); }
    cotId = cot?.id || null;
    ok('L2a cotacao gravada pela tela de hoje (quantidade 2, aberta, expira em 7 dias)', !!cot && Number(cot.quantidade) === 2 && cot.status === 'aberta' && dentro7d(cot.expira_em), JSON.stringify(cot));
    const j = cotId ? A.linhaJson('cotacoes_pecas', cotId) : null;
    ok('L2b urgencia IS NULL (quando a coluna existe) = "nao informada" = imediato', !!j && (!('urgencia' in j) || j.urgencia === null), JSON.stringify(j?.urgencia));
    const m = await A.esperarEmail(dLojaReal.email, t0, (e) => e.html.includes(PECA), 60);
    ok('L2c loja real recebe o e-mail imediato do pedido novo', !!m, m?.assunto);
    if (m) {
      compararReferencia(ok, 'L2d e-mail "cotacao nova" (unidade un)', REFERENCIA_EMAIL, normalizarEmail(m.html, A.tag));
      ok('L2e e-mail de hoje sem botao "Nao tenho" (nenhum link /n/<token>), sem urgencia, sem slug em portugues', !/\/n\/[A-Za-z0-9_-]{43}/.test(m.html) && !/href="[^"]*\/(loja|oficina)\//.test(m.html) && /<strong>Kogus:<\/strong> 2<\/p>/.test(m.html));
    }
    const aL = await A.esperarAviso(dLojaReal.id, 'cotacao_peca_disponivel');
    ok('L2f sino da loja: 1 linha, dados.{cotacao_id, link, textos} sem chave extra (sem urgencia/reaberta), link /loja/cotacoes', aL.length === 1 && aL[0].dados?.cotacao_id === cotId && aL[0].dados?.link === '/loja/cotacoes' && JSON.stringify(Object.keys(aL[0].dados).sort()) === JSON.stringify(['cotacao_id', 'link', 'textos']) && Object.keys(aL[0].dados.textos || {}).length === 6, JSON.stringify(aL[0]?.dados).slice(0, 200));
    if (aL[0]) compararReferencia(ok, 'L2g sino cotacao_peca_disponivel', REFERENCIA_SINO_DISPONIVEL, normalizarSino(aL[0], A.tag));
    const aV = await A.esperarAviso(dVendReal.id, 'cotacao_peca_disponivel');
    const mV = await A.esperarEmail(dVendReal.email, t0, (e) => e.html.includes(PECA), 20);
    ok('L2h vizinha que vende recebe sino + e-mail imediato (= hoje)', aV.length === 1 && !!mV);
    if (tem.avisos) {
      const fila = await A.avisosEmail({ cotacao_id: cotId });
      const daLoja = fila.find((r) => r.profile_id === dLojaReal.id);
      ok("L2i avisos_email_pecas: linha da loja real tipo 'imediato', motivo NULL, enviado_em preenchido; NENHUMA 'resumo'", !!daLoja && daLoja.tipo === 'imediato' && daLoja.motivo === null && !!daLoja.enviado_em && fila.every((r) => r.tipo === 'imediato'), JSON.stringify(fila).slice(0, 300));
    } else ok('L2i avisos_email_pecas ainda nao existe (esquema de hoje): nada a conferir', true);
    if (tem.links) ok('L2j pecas_links_email: nenhum token para conta real com o global desligado', (await A.tokensEmail({ cotacao_id: cotId })).length === 0);
    else ok('L2j pecas_links_email ainda nao existe (esquema de hoje): nada a conferir', true);
    await pM.waitForTimeout(1200);
    const n = await semNovos(pM);
    ok('L2k cartao da compradora como hoje ("Kogus: 2"), sem elementos novos', (await cardCom(pM, PECA).count()) === 1 && /Kogus:\s*2\b/.test(await cardCom(pM, PECA).innerText()) && n.vazio, n.lista);
    // aba Vender da vizinha real: cartao de hoje, sem "nao tenho"/quantidade ofertada/IVA
    const ctxV = await nav.contexto('chromium', 390, A.ip); const pV = await ctxV.newPage(); vigiar(pV, erros, 'L2l vizinha');
    await entrarPelaTela(pV, '/ee/et', dVendReal);
    await ir(pV, '/ee/et/oficina/pecas?aba=vender', 3500);
    const cv = cartaoLoja(pV, PECA);
    await botao(cv, ET('oficinaPecas.responderCotacao')).click().catch(() => {});
    const nV = await semNovos(pV);
    ok('L2l aba Vender da vizinha real (formulario de resposta aberto): cartao de hoje, sem NENHUM testid novo', (await cv.count()) === 1 && (await pV.locator('#c8551-6').isVisible().catch(() => false)) && nV.vazio, nV.lista);
    await pV.screenshot({ path: `${PRINTS}/lote2-desligado-vender-et-390.png`, fullPage: true });
    await ctxV.close();
  });

  // ======================= L3: loja responde pela tela de hoje -> e-mail "respondida" + sino = referencia =======================
  const ctxL = await nav.contexto('chromium', 390, A.ip); const pL = await ctxL.newPage(); vigiar(pL, erros, 'L3 loja');
  const t3 = Date.now();
  await tentar('L3', async () => {
    await entrarPelaTela(pL, '/ee/et', dLojaReal);
    await ir(pL, '/ee/et/loja/cotacoes', 3000);
    const c = cartaoLoja(pL, PECA);
    await botao(c, ET('lojaCotacoes.responderCotacaoButton')).click();
    const n0 = await semNovos(pL);
    ok('L3a /loja/cotacoes com o formulario de resposta aberto: preco e prazo de hoje, sem "nao tenho", quantidade ofertada, usada, previa do IVA', (await pL.locator('#c40f3-1').isVisible()) && (await pL.locator('#c40f3-2').isVisible()) && n0.vazio, n0.lista);
    await pL.screenshot({ path: `${PRINTS}/lote2-desligado-loja-responder-et-390.png`, fullPage: true });
    await pL.locator('#c40f3-1').fill('40');
    await pL.locator('#c40f3-2').fill('1');
    await botao(c, ET('lojaCotacoes.enviarRespostaButton')).click();
    let resp = null; for (let i = 0; i < 40 && !resp; i++) { resp = (await A.admin.from('cotacoes_pecas_respostas').select('*').eq('cotacao_id', cotId).eq('loja_id', ljReal.id).maybeSingle()).data; if (!resp) await sleep(300); }
    ok('L3b oferta gravada (40, 1 dia)', !!resp && Number(resp.preco) === 40 && resp.prazo_dias === 1, JSON.stringify(resp));
    const jr = resp ? A.linhaJson('cotacoes_pecas_respostas', resp.id) : null;
    ok('L3c colunas novas da oferta (quando existem) NULL: quantidade_ofertada, iva_pct, iva_modo', !!jr && ['quantidade_ofertada', 'iva_pct', 'iva_modo'].every((k) => !(k in jr) || jr[k] === null), JSON.stringify(jr));
    let st = null; for (let i = 0; i < 30; i++) { st = (await A.cotacaoNoBanco(cotId))?.status; if (st === 'respondida') break; await sleep(300); }
    ok("L3d cotacao 'respondida' (rota marcar-cotacao-respondida)", st === 'respondida', st);
    const m = await A.esperarEmail(dReal.email, t3, (e) => e.html.includes(PECA), 60);
    ok('L3e compradora recebe o e-mail "cotacao respondida" com 40,00', !!m && /40[,.]00/.test(m.texto), m?.assunto);
    if (m) {
      compararReferencia(ok, 'L3f e-mail "cotacao respondida" (oferta sem IVA/quantidade)', REFERENCIA_EMAIL_RESPONDIDA, normalizarEmail(m.html, A.tag));
      ok('L3g e-mail "respondida" sem linha de IVA/oferta parcial e sem slug em portugues', !/IVA|VAT|KM\b|käibemaks|НДС|sem IVA|parcial|partial|osaline/i.test(m.texto) && !/href="[^"]*\/(loja|oficina)\//.test(m.html), m.texto.slice(0, 200));
    }
    const aR = await A.esperarAviso(dReal.id, 'cotacao_peca_respondida');
    ok('L3h sino cotacao_peca_respondida: 1 linha, dados.{cotacao_id, textos}, textos nas 6 linguas', aR.length === 1 && aR[0].dados?.cotacao_id === cotId && JSON.stringify(Object.keys(aR[0].dados).sort()) === JSON.stringify(['cotacao_id', 'textos']) && Object.keys(aR[0].dados.textos || {}).length === 6, JSON.stringify(aR[0]?.dados).slice(0, 200));
    if (aR[0]) compararReferencia(ok, 'L3i sino cotacao_peca_respondida', REFERENCIA_SINO_RESPONDIDA, normalizarSino(aR[0], A.tag));
    await ir(pL, '/ee/et/loja/cotacoes', 2500);
    const n1 = await semNovos(pL);
    ok('L3j /loja/cotacoes depois de responder: "voce respondeu", sem elementos novos', (await cartaoLoja(pL, PECA).innerText()).includes('40') && n1.vazio, n1.lista);
  });

  // ======================= L4: cartao da compradora, confirmar e e-mail "pedido confirmado" = referencia =======================
  await tentar('L4', async () => {
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    const card = cardCom(pM, PECA);
    const n0 = await semNovos(pM);
    ok('L4a cartao com a oferta (40 €) como hoje: sem oferta-iva, oferta-parcial, "N nao tem"', (await card.getByTestId('oferta').count()) === 1 && /40/.test(await card.innerText()) && n0.vazio, n0.lista);
    const t4 = Date.now();
    const respId = (await A.admin.from('cotacoes_pecas_respostas').select('id').eq('cotacao_id', cotId).eq('loja_id', ljReal.id).single()).data?.id;
    const r = await A.confirmar(respId, sReal.token);
    const ped = (await A.admin.from('pedidos_pecas').select('preco_total, quantidade').eq('cotacao_id', cotId).maybeSingle()).data;
    ok('L4b confirmar: pedido com quantidade = a pedida (2, sem quantidade_ofertada) e total 80', r.status === 200 && !!ped && Number(ped.quantidade) === 2 && Number(ped.preco_total) === 80, JSON.stringify({ r: r.d, ped }));
    const mL = await A.esperarEmail(dLojaReal.email, t4, (e) => /80[,.]00/.test(e.html), 40);
    ok('L4c loja recebe o e-mail "pedido confirmado" com total 80 e telefone do perfil da compradora', !!mL && mL.texto.includes(dReal.telefone), mL?.assunto);
    if (mL) compararReferencia(ok, 'L4d e-mail "pedido confirmado" (sem telefone comercial)', REFERENCIA_EMAIL_PEDIDO, normalizarEmail(mL.html, A.tag));
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    const n1 = await semNovos(pM);
    ok('L4e cartao fechado com oferta escolhida + contato (= hoje), sem elementos novos', (await card.getByTestId('oferta-escolhida').count()) === 1 && (await card.getByTestId('contato-fornecedor').count()) === 1 && n1.vazio, n1.lista);
    await pM.screenshot({ path: `${PRINTS}/lote2-desligado-cartao-fechado-et-390.png`, fullPage: true });
  });

  // ======================= L5: perfis e pagina do pedido do motorista =======================
  await tentar('L5', async () => {
    await ir(pL, '/ee/et/loja/perfil', 2500);
    const nL = await semNovos(pL);
    ok('L5a /loja/perfil (loja real): telefone do perfil (#c9a81-3) e nada de IVA/regime de margem/telefone comercial', (await pL.locator('#c9a81-3').count()) === 1 && nL.vazio, nL.lista);
    await ir(pM, '/ee/et/oficina/perfil', 2500);
    const nO = await semNovos(pM);
    ok('L5b /oficina/perfil (compradora real): #c83a1-9 e nada novo', (await pM.locator('#c83a1-9').count()) === 1 && nO.vazio, nO.lista);
    await ir(pM, `/ee/et/oficina/pedidos/${sol.id}`, 3000);
    const nP = await semNovos(pM);
    ok('L5c /oficina/pedidos/<id> do motorista: pagina de hoje com a placa (TA1234) e SEM "pedir peca"', (await pM.getByTestId('numero-pedido').count()) === 1 && (await pM.innerText('body')).includes('TA1234') && nP.vazio, nP.lista);
    await pM.screenshot({ path: `${PRINTS}/lote2-desligado-pedido-motorista-et-390.png`, fullPage: true });
  });

  // ======================= L6: tarefas (resumo e vencer) nao mexem em contas reais =======================
  await tentar('L6', async () => {
    const quando = tallinnEmUtc(proximoDiaUtilTallinn(), '10:53');
    const t6 = Date.now();
    const r = await A.resumo(quando);
    ok(`[NOVO] L6a POST ${ROTA_RESUMO} com a chave (agora = proximo dia util 10:53 Tallinn) -> 200 {ok:true, resumos:0${A.temSimulacao ? `, slot:'${slotDe(proximoDiaUtilTallinn(), 10)}'` : ''}}`, r.status === 200 && r.d.ok === true && r.d.resumos === 0 && (!A.temSimulacao || r.d.slot === slotDe(proximoDiaUtilTallinn(), 10)), JSON.stringify(r));
    if (!A.temSimulacao) console.log('info L6a TAREFAS_SIMULAR_HORA nao esta no .env.local: o slot depende da hora real (so ok/resumos conferidos)');
    ok('[NOVO] L6b chave errada -> 403; sem chave -> 403', (await A.resumo(quando, 'chave-errada')).status === 403 && (await A.api('POST', ROTA_RESUMO, {})).status === 403);
    await sleep(1500);
    ok('L6c nenhum e-mail de resumo para a loja real', A.emailsDe(dLojaReal.email, t6).length === 0);
    cot3 = await A.cotacao(ofReal, 'Vencida real', { expira_em: horasAtras(2) });
    const rv = await A.tarefa();
    ok(`L6d ${ROTA_TAREFA} com global desligado: cotacao real vencida continua aberta (expiradas 0)`, rv.status === 200 && rv.d.expiradas === 0 && (await A.cotacaoNoBanco(cot3.id))?.status === 'aberta', JSON.stringify(rv));
  });

  // ======================= L7: link "nao tenho" com token qualquer: 302 e 410 sem escrever =======================
  await tentar('L7', async () => {
    const k = 'A'.repeat(43);
    const r1 = await A.get302(`/n/${k}?o=et`);
    ok(`[NOVO] L7a GET /n/<token>?o=et -> 302 para ${SLUG_NAO_TENHO.et}#k=<token>`, r1.status === 302 && r1.location.includes(`${SLUG_NAO_TENHO.et}#k=${k}`), `${r1.status} ${r1.location}`);
    const r2 = await A.get302(`/n/${k}`);
    ok('[NOVO] L7b sem ?o= -> 302 para a pagina em ingles (padrao)', r2.status === 302 && r2.location.includes(`${SLUG_NAO_TENHO.en}#k=${k}`), `${r2.status} ${r2.location}`);
    const v1 = await A.naoTenhoEmail({ k: 'abc', acao: 'ver' }), v2 = await A.naoTenhoEmail({ k, acao: 'ver' }), v3 = await A.naoTenhoEmail({ k, acao: 'confirmar' }), v4 = await A.naoTenhoEmail({ k, acao: 'xyz' });
    ok(`[NOVO] L7c POST ${ROTA_NAO_TENHO_EMAIL}: formato errado 410 LINK_INVALIDO; token desconhecido: ver 410, confirmar 410; acao desconhecida 410`, [v1, v2, v3, v4].every((x) => x.status === 410 && x.d.codigo === 'LINK_INVALIDO'), [v1, v2, v3, v4].map((x) => x.status).join('/'));
    const ctxN = await nav.contexto('chromium', 390, A.ip); const pN = await ctxN.newPage(); vigiar(pN, erros, 'L7');
    await pN.goto(`${SITE}/n/${k}?o=et`, { waitUntil: 'networkidle' }).catch(() => {});
    await pN.waitForTimeout(1500);
    ok('[NOVO] L7d pagina do link invalido (ET): estado nao-tenho-invalido, token fora da barra, sem chave crua, noindex', await visivel(pN.getByTestId('nao-tenho-invalido')) && !pN.url().includes(k) && semChaveCrua(await pN.innerText('body')) && (await pN.locator('meta[name="robots"][content*="noindex"]').count()) >= 1, pN.url());
    await pN.screenshot({ path: `${PRINTS}/lote2-desligado-n-invalido-et-390.png`, fullPage: true });
    await ctxN.close();
    if (tem.dispensas) ok('L7e nada gravado em cotacoes_pecas_dispensas', (await A.dispensas(cotId)).length === 0 && (await A.dispensas(cot3.id)).length === 0);
    else ok('L7e cotacoes_pecas_dispensas ainda nao existe: nada a conferir', true);
  });

  // ======================= L8: [NOVO] independente do interruptor =======================
  await tentar('L8', async () => {
    const { error: eF } = await sFunc.c.from('fornecedores_contato').insert({ fornecedor_tipo: 'oficina', fornecedor_id: ofReal.id, telefone: '+372 600 0000' });
    ok('[NOVO] L8a funcionario da oficina NAO grava o telefone comercial (fornecedores_contato so pelo dono: 42501)', !!eF && eF.code === '42501', eF ? `${eF.code} ${eF.message}` : 'gravou');
    if (!eF) await A.admin.from('fornecedores_contato').delete().eq('fornecedor_tipo', 'oficina').eq('fornecedor_id', ofReal.id); // esquema de hoje deixou passar: limpa para o dono
    const { error: eD } = await sReal.c.from('fornecedores_contato').insert({ fornecedor_tipo: 'oficina', fornecedor_id: ofReal.id, telefone: '+372 600 0001' });
    ok('L8b o dono continua gravando', !eD, eD?.message);
    // "reabrir" para expirada aparece mesmo sem v3 (global desligado depois de ligado)
    const { error: eX } = await A.admin.from('cotacoes_pecas').update({ status: 'expirada' }).eq('id', cot3.id);
    if (eX) throw new Error('expirada: ' + eX.message);
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    const card = cardCom(pM, cot3.descricao);
    const outrosNovos = (await semTestidsNovosL2(pM)).filter((t) => t !== 'cotacao-reabrir');
    ok('[NOVO] L8c cotacao real "expirada" com o global desligado: badge pecas.expirada e botao reabrir (sem outro elemento novo)', (await card.getByTestId('cotacao-status').innerText().catch(() => '')).trim() === ET('pecas.expirada') && await visivel(card.getByTestId('cotacao-reabrir')) && outrosNovos.length === 0, `${(await card.innerText().catch(() => '')).slice(0, 120)} ${outrosNovos.join(',')}`);
    await card.getByTestId('cotacao-reabrir').click().catch(() => {});
    let c = null; for (let i = 0; i < 30; i++) { c = await A.cotacaoNoBanco(cot3.id); if (c?.status !== 'expirada') break; await sleep(300); }
    ok("[NOVO] L8d reabrir funciona sem v3: volta a 'aberta', reaberta_vezes 1", c?.status === 'aberta' && c?.reaberta_vezes === 1, JSON.stringify(c));
    // preco 0 -> erro inline, formulario fica (cotacao aberta propria, para a base tambem chegar aqui)
    const cot4 = await A.cotacao(ofReal, 'Preco zero');
    await ir(pL, '/ee/et/loja/cotacoes', 3000);
    const cl = cartaoLoja(pL, cot4.descricao);
    await botao(cl, ET('lojaCotacoes.responderCotacaoButton')).click();
    await pL.locator('#c40f3-1').fill('0');
    await pL.locator('#c40f3-2').fill('1');
    await botao(cl, ET('lojaCotacoes.enviarRespostaButton')).click();
    await pL.waitForTimeout(2500);
    const erroResp = pL.getByTestId('resposta-erro');
    ok('[NOVO] L8e oferta com preco 0 (CHECK recusa): erro inline resposta-erro e o formulario continua aberto', await visivel(erroResp, 2000) && (await erroResp.innerText()).trim().length > 0 && semChaveCrua(await erroResp.innerText()) && (await pL.locator('#c40f3-1').isVisible()), (await pL.innerText('body')).slice(0, 120));
    ok('L8f nenhuma oferta gravada com preco 0', (await A.admin.from('cotacoes_pecas_respostas').select('id', { count: 'exact', head: true }).eq('cotacao_id', cot4.id).eq('loja_id', ljReal.id)).count === 0);
    // timeout do hook: /api/pecas-v3 travado -> tela de hoje em ate 8 s (hoje: esqueleto eterno)
    const ctxT = await nav.contexto('chromium', 390, A.ip); const pT = await ctxT.newPage(); vigiar(pT, erros, 'L8g');
    await entrarPelaTela(pT, '/ee/et', dReal);
    let tReq = 0; // o timeout de 8 s do hook conta a partir do pedido, nao do goto
    await ctxT.route('**/api/pecas-v3*', async (r) => { tReq = tReq || Date.now(); await sleep(15000); await r.abort().catch(() => {}); });
    await pT.goto(`${SITE}/ee/et/oficina/pecas`, { waitUntil: 'domcontentloaded' });
    // o botao "nova cotacao" aparece antes da resposta; o FORMULARIO (de hoje ou novo) so depois dela
    await botao(pT, ET('oficinaPecas.novaCotacao')).click({ timeout: 15000 });
    const apareceu = await pT.locator('#c8551-1').waitFor({ state: 'visible', timeout: 10500 }).then(() => true, () => false);
    const demorou = tReq ? (Date.now() - tReq) / 1000 : -1;
    const formAntigo = apareceu && (await pT.getByTestId('cotacao-tipo-carro').count()) === 0;
    ok('[NOVO] L8g /api/pecas-v3 travado: o formulario de hoje aparece entre 7 e 9,8 s depois do pedido (timeout do hook), nunca o novo', apareceu && formAntigo && demorou >= 7 && demorou < 9.8, `formulario=${apareceu} antigo=${formAntigo} ${demorou.toFixed(1)}s depois do pedido${tReq ? '' : ' (pedido nao interceptado)'}`);
    await ctxT.unroute('**/api/pecas-v3*');
    await ctxT.close();
  });

  // ======================= L9: paridade - loja real nao recebe nada de cotacao de teste =======================
  await tentar('L9', async () => {
    const cotT = await A.cotacao(ofTeste, 'Cotacao de TESTE');
    const t9 = Date.now();
    const n = await A.notificarFornecedores(cotT.id, sTeste.token);
    await A.esperarAviso(dLojaTeste.id, 'cotacao_peca_disponivel', 20);
    await sleep(1500);
    ok('L9a notificar-fornecedores da cotacao de teste -> 200; loja de TESTE recebe (ancora)', n.status === 200 && (await A.sinoDisponivel(dLojaTeste.id, cotT.id)).length === 1, JSON.stringify(n));
    ok('L9b loja REAL: sem sino e sem e-mail da cotacao de teste', (await A.sinoDisponivel(dLojaReal.id, cotT.id)).length === 0 && A.emailsDe(dLojaReal.email, t9).length === 0);
    if (tem.avisos) ok('L9c loja REAL: sem linha em avisos_email_pecas para a cotacao de teste', (await A.avisosEmail({ cotacao_id: cotT.id })).every((r) => r.profile_id !== dLojaReal.id));
    else ok('L9c avisos_email_pecas ainda nao existe: nada a conferir', true);
    if (tem.links) ok('L9d loja REAL: sem token em pecas_links_email para a cotacao de teste', (await A.tokensEmail({ cotacao_id: cotT.id })).every((r) => r.profile_id !== dLojaReal.id));
    else ok('L9d pecas_links_email ainda nao existe: nada a conferir', true);
    if (tem.dispensas) { const { error } = await A.inserirDispensa(sLojaReal, cotT.id, 'loja', ljReal.id); ok('L9e loja REAL nao consegue "nao tenho" numa cotacao de teste (RLS via cotacoes_pecas: 42501)', error?.code === '42501', error ? `${error.code} ${error.message}` : 'gravou'); }
    else ok('L9e cotacoes_pecas_dispensas ainda nao existe: nada a conferir', true);
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
