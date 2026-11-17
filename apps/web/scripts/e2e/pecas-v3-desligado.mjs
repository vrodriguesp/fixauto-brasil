// E2E LOCAL do lote 1 de pecas com o interruptor DESLIGADO (fase C do plano de regressao,
// Fable_auditoria_mapa_lote1.md secao 6): com plataforma_config.pecas_v3_ativo = false e uma
// compradora REAL (conta_teste = false) as telas, rotas e e-mails de hoje ficam IGUAIS.
// Roda tambem no codigo de hoje (60d3c75, esquema sem a 091) como linha de base: so os checks
// com prefixo [NOVO] podem falhar la (L1.6 seguranca + paridade teste/real + rotas novas,
// que o contrato muda independente do interruptor).
//   C0 interruptor | C1 DOM da tela de criar sem controles novos (1280 + 390)
//   C2 cotacao pela tela de hoje (quantidade inteira, padroes das colunas novas)
//   C3 e-mail/sino de hoje (unidade 'un' identica + diff com a referencia) | C4 listas da loja e da vizinha
//   C10/C11 oferta + confirmar + contato (= hoje) | C5 editar/cancelar de hoje passam na trigger
//   C6 [NOVO] oficina inativa nao cria + erro inline | C7 [NOVO] tarefa de expiracao = 0 com interruptor desligado
//   C8 [NOVO] trigger/RLS | C9 [NOVO] paridade teste/real | C12 [NOVO] GET /api/pecas-v3 | C13 sem telefone publico
//   C14 [NOVO] badge de status desconhecido ('expirada') na tela de hoje
// Referencia do e-mail: resultados/pecas-v3/referencia-email-cotacao-un.html (gravada na 1a rodada
// no codigo de hoje; nas seguintes o HTML normalizado tem de ser identico; PECAS_V3_GRAVAR_REFERENCIA=1 regrava).
//   node pecas-v3-desligado.mjs [<.env.local>]
import fs from 'node:fs';
import { lerEnv, ambiente, abrirNavegadores, contador, tradutor, SITE, ENV_PADRAO, siteNoAr, semRolagemLateral, vigiar, entrarPelaTela, ir, visivel, semTestidsNovos, semChaveCrua, normalizarEmail, REFERENCIA_EMAIL, PRINTS, sleep, horasAtras, DIA_MS, psql, ROTA_TAREFA, ROTA_INTERRUPTOR } from './pecas-v3-lib.mjs';

const env = lerEnv(process.argv[2] || ENV_PADRAO);
if (!(await siteNoAr())) { console.log(`FALHA site local nao responde em ${SITE} - nada rodou (nao inicio o site sozinho)`); process.exit(2); }
const A = ambiente(env);
const { ok, fim, tentar } = contador();
const ET = tradutor('et');
const erros = [];
const nav = await abrirNavegadores(false);
const cardCom = (p, texto) => p.getByTestId('cotacao-peca').filter({ hasText: texto });
const cartaoLoja = (p, texto) => p.locator('div.card').filter({ hasText: texto });
const dentro7d = (iso) => !!iso && Math.abs(new Date(iso) - (Date.now() + 7 * DIA_MS)) < 3600e3;

try {
  // ======================= C0: interruptor global desligado =======================
  const temInterruptor = A.colunaExiste('plataforma_config', 'pecas_v3_ativo');
  if (temInterruptor) { const e = await A.interruptor(false); ok('C0 interruptor global pecas_v3_ativo = false', !e && A.interruptorEstado() === false, e?.message); }
  else console.log('info C0 plataforma_config.pecas_v3_ativo ainda nao existe (esquema de hoje): interruptor considerado desligado');
  const temExpira = A.colunaExiste('cotacoes_pecas', 'expira_em');
  const temExpirada = A.enumTem('expirada');

  // ======================= contas =======================
  const dReal = await A.conta('oficina', 'compradora-real'); const ofReal = await A.oficina(dReal, 'Compradora real', { km: 0 });
  const dInat = await A.conta('oficina', 'compradora-inativa'); const ofInat = await A.oficina(dInat, 'Compradora inativa', { km: 0.5, ativa: false });
  const dTeste = await A.conta('oficina', 'compradora-teste', { contaTeste: true }); const ofTeste = await A.oficina(dTeste, 'Compradora teste', { km: 0.7 });
  const dLojaReal = await A.conta('loja_pecas', 'loja-real', { telefone: '+372 5000 1111' }); const ljReal = await A.loja(dLojaReal, 'Loja real');
  const dLojaTeste = await A.conta('loja_pecas', 'loja-teste', { contaTeste: true }); await A.loja(dLojaTeste, 'Loja teste');
  const dVendReal = await A.conta('oficina', 'vendedora-real'); await A.oficina(dVendReal, 'Vendedora real', { km: 2, vendePecas: true });
  const adm = await A.conta('admin', 'admin', { idioma: 'pt' });
  const sReal = await A.sessao(dReal), sInat = await A.sessao(dInat), sTeste = await A.sessao(dTeste), sLojaReal = await A.sessao(dLojaReal), sLojaTeste = await A.sessao(dLojaTeste), sVendReal = await A.sessao(dVendReal), sAdm = await A.sessao(adm);
  const PECA = `Esipiduriklotsid ${A.tag}`;
  let cotId = null;

  // ======================= C1: tela de criar = hoje (1280 e 390) =======================
  const ctxD = await nav.contexto('chromium', 1280, A.ip); const pD = await ctxD.newPage(); vigiar(pD, erros, 'C1 1280');
  const ctxM = await nav.contexto('chromium', 390, A.ip); const pM = await ctxM.newPage(); vigiar(pM, erros, 'C1 390');
  await tentar('C1', async () => {
    for (const [p, rotulo] of [[pD, '1280'], [pM, '390']]) {
      await entrarPelaTela(p, '/ee/et', dReal);
      await ir(p, '/ee/et/oficina/pecas', 2500);
      await p.getByRole('button', { name: ET('oficinaPecas.novaCotacao') }).click();
      await p.locator('#c8551-1').waitFor();
      const antigos = ['#c8551-1', '#c8551-2', '#c8551-3', '#c8551-4', '#c8551-5', '#peca-detalhes', '#peca-fotos'];
      const faltam = []; for (const s of antigos) if (!(await p.locator(s).isVisible().catch(() => false))) faltam.push(s);
      ok(`C1a ${rotulo} formulario de hoje (descricao, marca, modelo, ano, quantidade, detalhes, fotos)`, faltam.length === 0, faltam.join(','));
      const novos = await semTestidsNovos(p);
      ok(`C1b ${rotulo} nenhum controle novo no DOM (tipo, unidade, placa, enviar a, vale 7 dias...)`, novos.length === 0, novos.join(','));
      const corpo = await p.innerText('body');
      ok(`C1c ${rotulo} sem chave de traducao crua na tela`, semChaveCrua(corpo), corpo.slice(0, 200));
      ok(`C1d ${rotulo} sem rolagem lateral`, await semRolagemLateral(p));
      await p.screenshot({ path: `${PRINTS}/desligado-criar-et-${rotulo}.png`, fullPage: true });
    }
  });

  // ======================= C2: cotacao pela tela de hoje (celular) =======================
  const t0 = Date.now();
  await tentar('C2', async () => {
    await pM.locator('#c8551-1').fill(PECA);
    await pM.locator('#c8551-2').fill('Volkswagen');
    await pM.locator('#c8551-3').fill('Passat');
    await pM.locator('#c8551-4').fill('2012');
    await pM.locator('#c8551-5').fill('2');
    await pM.locator('#peca-detalhes').fill('Esiketaste läbimõõt 312 mm.');
    await pM.getByRole('button', { name: ET('oficinaPecas.enviarCotacao') }).click();
    let cot = null;
    for (let i = 0; i < 40 && !cot; i++) { cot = (await A.admin.from('cotacoes_pecas').select('*').eq('oficina_id', ofReal.id).maybeSingle()).data; if (!cot) await sleep(300); }
    cotId = cot?.id || null;
    ok('C2a cotacao gravada pela tela de hoje: quantidade 2 (numero), status aberta, carro', !!cot && Number(cot.quantidade) === 2 && cot.status === 'aberta' && cot.fipe_marca === 'Volkswagen', JSON.stringify(cot));
    const j = cotId ? A.linhaJson('cotacoes_pecas', cotId) : null;
    const padroes = j && (!('tipo' in j) || j.tipo === 'carro') && (!('unidade' in j) || j.unidade === 'un') && (!('alvo' in j) || j.alvo === 'todos') && (!('enviar_placa' in j) || j.enviar_placa === true) && (!('reaberta_vezes' in j) || j.reaberta_vezes === 0) && (!('expira_em' in j) || dentro7d(j.expira_em));
    ok('C2b colunas novas (quando existem) com os padroes de hoje: carro, un, todos, placa enviada, 0 reaberturas, expira em 7 dias', !!padroes, JSON.stringify(j));
    await pM.waitForTimeout(1500);
    const card = cardCom(pM, PECA);
    ok('C2c cartao da compradora como hoje: "Kogus: 2", sem controles novos', (await card.count()) === 1 && /Kogus:\s*2\b/.test(await card.innerText()) && (await semTestidsNovos(pM)).length === 0, (await card.innerText().catch(() => '')).slice(0, 200));
    await pM.screenshot({ path: `${PRINTS}/desligado-cartao-et-390.png`, fullPage: true });
  });

  // ======================= C3: e-mail e sino de hoje =======================
  await tentar('C3', async () => {
    const m = await A.esperarEmail(dLojaReal.email, t0, (e) => e.html.includes(PECA), 60);
    ok('C3a loja real recebe o e-mail do pedido novo', !!m, m?.assunto);
    const html = m?.html || '';
    ok('C3b linha da quantidade IDENTICA a de hoje (<strong>Kogus:</strong> 2</p>, sem unidade)', /<strong>Kogus:<\/strong> 2<\/p>/.test(html), (html.match(/<strong>Kogus:<\/strong>[^<]*<\/p>/) || [''])[0]);
    ok('C3c linha do veiculo como hoje e sem "placa"/"reg" no e-mail', /<strong>Sõiduk:<\/strong> Volkswagen Passat 2012<\/p>/.test(html) && !/placa|matr[ií]cula|reg\.?\s*nr|license plate/i.test(m?.texto || ''), (html.match(/<strong>Sõiduk:<\/strong>[^<]*<\/p>/) || [''])[0]);
    // diff com a referencia (HTML normalizado): gravada na 1a rodada (codigo de hoje)
    if (m) {
      const norm = normalizarEmail(html, A.tag);
      if (!fs.existsSync(REFERENCIA_EMAIL) || process.env.PECAS_V3_GRAVAR_REFERENCIA === '1') {
        fs.writeFileSync(REFERENCIA_EMAIL, norm);
        console.log(`info C3d referencia do e-mail gravada em ${REFERENCIA_EMAIL} (linha de base) - nas proximas rodadas e comparada`);
        ok('C3d e-mail da cotacao (unidade un) = referencia (gravada agora)', true);
      } else {
        const ref = fs.readFileSync(REFERENCIA_EMAIL, 'utf8');
        let detalhe = '';
        if (ref !== norm) { let i = 0; while (i < ref.length && ref[i] === norm[i]) i++; detalhe = `difere a partir de ${i}: ref="${ref.slice(i, i + 120)}" agora="${norm.slice(i, i + 120)}"`; }
        ok('C3d e-mail da cotacao (unidade un) IDENTICO a referencia (ignorando ids, datas e links)', ref === norm, detalhe);
      }
    }
    const aL = await A.esperarAviso(dLojaReal.id, 'cotacao_peca_disponivel');
    ok('C3e sino da loja real como hoje (link /loja/cotacoes, textos nas 6 linguas, sem placa em dados)', aL.length === 1 && aL[0].dados?.link === '/loja/cotacoes' && aL[0].dados?.cotacao_id === cotId && Object.keys(aL[0].dados?.textos || {}).length === 6 && !/placa/i.test(JSON.stringify(aL[0].dados)), JSON.stringify(aL[0]?.dados).slice(0, 200));
    const aV = await A.esperarAviso(dVendReal.id, 'cotacao_peca_disponivel');
    const mV = await A.esperarEmail(dVendReal.email, t0, (e) => e.html.includes(PECA), 20);
    ok('C3f oficina vizinha que vende recebe sino + e-mail (alvo padrao = todos = hoje)', aV.length === 1 && aV[0].dados?.link === '/oficina/pecas?aba=vender' && !!mV, `${aV.length} ${mV?.assunto}`);
    await sleep(1500);
    ok('C3g loja de TESTE nao recebe nada de compradora real (separacao de hoje)', (await A.avisos(dLojaTeste.id, 'cotacao_peca_disponivel')).length === 0 && A.emailsDe(dLojaTeste.email, t0).length === 0);
  });

  // ======================= C4: listas da loja e da vizinha = hoje =======================
  const ctxL = await nav.contexto('chromium', 390, A.ip); const pL = await ctxL.newPage(); vigiar(pL, erros, 'C4 loja');
  await tentar('C4', async () => {
    await entrarPelaTela(pL, '/ee/et', dLojaReal);
    await ir(pL, '/ee/et/loja/cotacoes', 3000);
    const c = cartaoLoja(pL, PECA);
    ok('C4a /loja/cotacoes: cartao com "Kogus: 2" e "Sõiduk: Volkswagen Passat 2012", sem elementos novos', (await c.count()) === 1 && /Kogus:\s*2\b/.test(await c.innerText()) && /Sõiduk:\s*Volkswagen Passat 2012/.test(await c.innerText()) && (await semTestidsNovos(pL)).length === 0, (await c.innerText().catch(() => '')).slice(0, 200));
    ok('C4b /loja/cotacoes sem chave crua e sem rolagem lateral', semChaveCrua(await pL.innerText('body')) && await semRolagemLateral(pL));
    await pL.screenshot({ path: `${PRINTS}/desligado-loja-cotacoes-et-390.png`, fullPage: true });
    const ctxV = await nav.contexto('chromium', 390, A.ip); const pV = await ctxV.newPage(); vigiar(pV, erros, 'C4 vizinha');
    await entrarPelaTela(pV, '/ee/et', dVendReal);
    await ir(pV, '/ee/et/oficina/pecas?aba=vender', 3500);
    const cv = cartaoLoja(pV, PECA);
    ok('C4c aba Vender da vizinha: cartao como hoje ("Kogus: 2"), sem elementos novos', (await cv.count()) === 1 && /Kogus:\s*2\b/.test(await cv.innerText()) && (await semTestidsNovos(pV)).length === 0, (await cv.innerText().catch(() => '')).slice(0, 200));
    await pV.screenshot({ path: `${PRINTS}/desligado-vender-et-390.png`, fullPage: true });
    await ctxV.close();
  });

  // ======================= C10/C11: oferta, confirmar e contato = hoje =======================
  await tentar('C10', async () => {
    if (!cotId) throw new Error('sem cotacao');
    const respId = await A.resposta({ id: cotId }, ljReal, { preco: 40, prazo: 1 });
    const t1 = Date.now();
    const r = await A.confirmar(respId, sReal.token);
    ok('C10a confirmar pela rota (compradora real) -> 200', r.status === 200 && r.d.success === true, JSON.stringify(r));
    const ped = (await A.admin.from('pedidos_pecas').select('id, preco_total, quantidade, status, loja_id').eq('cotacao_id', cotId).maybeSingle()).data;
    ok('C11a pedido com total 2 x 40 = 80 e quantidade 2 (inteira continua inteira)', !!ped && Number(ped.preco_total) === 80 && Number(ped.quantidade) === 2 && ped.loja_id === ljReal.id, JSON.stringify(ped));
    ok('C11b cotacao fechada', (await A.cotacaoNoBanco(cotId))?.status === 'fechada');
    const ct = await A.contato([ped?.id], sReal.token);
    ok('C10b contato do fornecedor = telefone do PERFIL da loja (sem telefone comercial cadastrado = hoje)', ct.status === 200 && ct.d.contatos?.[ped?.id]?.telefone === dLojaReal.telefone, JSON.stringify(ct.d));
    const ctL = await A.contato([ped?.id], sLojaReal.token);
    ok('C10c contato da compradora para a loja = telefone do perfil da compradora', ctL.status === 200 && ctL.d.contatos?.[ped?.id]?.telefone === dReal.telefone, JSON.stringify(ctL.d));
    const mL = await A.esperarEmail(dLojaReal.email, t1, (e) => /80[,.]00/.test(e.html), 40);
    ok('C10d e-mail "pedido confirmado" da loja como hoje: total 80, telefone do perfil da compradora', !!mL && mL.texto.includes(dReal.telefone), mL?.assunto);
    await ir(pL, '/ee/et/loja/pedidos', 3000);
    const linha = pL.getByTestId('pedido-loja').filter({ hasText: PECA });
    ok('C10e /loja/pedidos lista o pedido com o telefone da compradora (= hoje)', (await linha.count()) === 1 && (await linha.innerText()).includes(dReal.telefone) && (await semTestidsNovos(pL)).length === 0, (await linha.innerText().catch(() => '')).slice(0, 200));
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    const card = cardCom(pM, PECA);
    ok('C10f compradora ve a oferta escolhida e o contato (= hoje)', (await card.getByTestId('oferta-escolhida').count()) === 1 && (await card.getByTestId('contato-fornecedor').count()) === 1 && (await card.innerText()).includes(dLojaReal.telefone));
  });

  // ======================= C5: editar e cancelar de hoje passam na trigger =======================
  await tentar('C5', async () => {
    const PECA2 = `Generaator ${A.tag}`;
    const c2 = await A.cotacao(ofReal, 'Generaator', { peca_descricao: PECA2, quantidade: 1 });
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    const card = cardCom(pM, PECA2);
    await card.getByRole('button', { name: ET('oficinaPecas.editarPedido') }).click();
    const qtd = card.locator('input[inputmode="numeric"]');
    await qtd.fill('3');
    await card.getByRole('button', { name: ET('oficinaPecas.salvarPedido') }).click();
    let c = null; for (let i = 0; i < 30; i++) { c = await A.cotacaoNoBanco(c2.id); if (Number(c?.quantidade) === 3) break; await sleep(300); }
    ok('C5a "editar" de hoje (UPDATE direto de quantidade/descricao) continua funcionando', Number(c?.quantidade) === 3 && c?.status === 'aberta', JSON.stringify(c));
    const jAntes = A.linhaJson('cotacoes_pecas', c2.id);
    await card.getByRole('button', { name: ET('oficinaPecas.cancelarPedido') }).click();
    await card.getByRole('button', { name: ET('oficinaPecas.simCancelar') }).click();
    for (let i = 0; i < 30; i++) { c = await A.cotacaoNoBanco(c2.id); if (c?.status === 'cancelada') break; await sleep(300); }
    ok('C5b "cancelar" de hoje (UPDATE status = cancelada) continua funcionando', c?.status === 'cancelada', JSON.stringify(c));
    const jDepois = A.linhaJson('cotacoes_pecas', c2.id);
    ok('C5c campos de controle (oficina_id, created_at, expira_em, reaberta_vezes) intactos depois do editar/cancelar', !!jAntes && !!jDepois && ['oficina_id', 'created_at', 'expira_em', 'reaberta_vezes'].every((k) => jAntes[k] === jDepois[k]), JSON.stringify({ jAntes, jDepois }).slice(0, 300));
    await pM.waitForTimeout(1000);
    ok('C5d cartao cancelado como hoje: badge "Tühistatud", sem editar/cancelar', (await card.getByTestId('cotacao-status').innerText()).trim() === ET('oficinaPecas.cancelada') && (await card.getByRole('button', { name: ET('oficinaPecas.editarPedido') }).count()) === 0);
  });

  // ======================= C6: [NOVO] oficina inativa nao cria cotacao =======================
  await tentar('C6', async () => {
    const ctxI = await nav.contexto('chromium', 390, A.ip); const pI = await ctxI.newPage(); vigiar(pI, erros, 'C6');
    await entrarPelaTela(pI, '/ee/et', dInat);
    await ir(pI, '/ee/et/oficina/pecas', 2500);
    await pI.getByRole('button', { name: ET('oficinaPecas.novaCotacao') }).click();
    await pI.locator('#c8551-1').fill(`Inativa ${A.tag}`);
    await pI.getByRole('button', { name: ET('oficinaPecas.enviarCotacao') }).click();
    await pI.waitForTimeout(4000);
    const { count } = await A.admin.from('cotacoes_pecas').select('id', { count: 'exact', head: true }).eq('oficina_id', ofInat.id);
    ok('[NOVO] C6a oficina INATIVA nao cria cotacao pela tela (RLS cotacoes_pecas_insert exige oficinas.ativa)', count === 0, `linhas: ${count}`);
    const erroInline = pI.getByTestId('cotacao-erro-criar');
    ok('[NOVO] C6b a tela mostra o erro inline (testid cotacao-erro-criar) em vez de limpar o formulario em silencio', await visivel(erroInline, 3000) && semChaveCrua(await erroInline.innerText().catch(() => '')) && (await erroInline.innerText().catch(() => '')).trim().length > 0);
    await pI.screenshot({ path: `${PRINTS}/desligado-inativa-erro-et-390.png`, fullPage: true });
    await ctxI.close();
    const { error } = await sInat.c.from('cotacoes_pecas').insert({ oficina_id: ofInat.id, peca_descricao: `Inativa API ${A.tag}`, quantidade: 1 });
    ok('[NOVO] C6c pela API (chave publica) o INSERT da inativa e recusado com 42501', !!error && error.code === '42501', error ? `${error.code} ${error.message}` : 'inseriu');
  });

  // ======================= C7: [NOVO] tarefa de expiracao nao mexe em nada com o interruptor desligado =======================
  let cot3 = null;
  await tentar('C7', async () => {
    cot3 = await A.cotacao(ofReal, 'Vencida real', { quantidade: 1, ...(temExpira ? { expira_em: horasAtras(2) } : {}) });
    ok('C7a (preparo) cotacao real com expira_em no passado' + (temExpira ? '' : ' (coluna ainda nao existe: so a cotacao)'), !!cot3?.id);
    const r = await A.tarefa();
    ok(`[NOVO] C7b POST ${ROTA_TAREFA} com x-tarefa-chave -> 200 {ok:true, expiradas:0} (interruptor desligado, dona real)`, r.status === 200 && r.d.ok === true && r.d.expiradas === 0, JSON.stringify(r));
    ok('C7c a cotacao real vencida continua aberta (a validade nao vale para quem nao ve "vale 7 dias")', (await A.cotacaoNoBanco(cot3.id))?.status === 'aberta');
    ok('C7d nenhum sino de expiracao para a compradora real', (await A.avisos(dReal.id, 'cotacao_peca_expirada')).length === 0);
    const r2 = await A.tarefa('chave-errada');
    ok('[NOVO] C7e chave errada -> 403', r2.status === 403, JSON.stringify(r2));
    const r3 = await A.api('POST', ROTA_TAREFA, {});
    ok('[NOVO] C7f sem chave -> 403', r3.status === 403, JSON.stringify(r3));
  });

  // ======================= C8: [NOVO] trigger + RLS (anon-key com a sessao da dona) =======================
  await tentar('C8', async () => {
    const { data: i1, error: e1 } = await sReal.c.from('cotacoes_pecas').insert({ oficina_id: ofReal.id, peca_descricao: `Forjada status ${A.tag}`, quantidade: 1, status: 'fechada' }).select('id, status').single();
    ok("[NOVO] C8a INSERT com status 'fechada' pelo cliente -> gravada como 'aberta' (trigger forca no INSERT)", !e1 && i1?.status === 'aberta', e1?.message || JSON.stringify(i1));
    const { data: i2, error: e2 } = await sReal.c.from('cotacoes_pecas').insert({ oficina_id: ofReal.id, peca_descricao: `Forjada expira ${A.tag}`, quantidade: 1, expira_em: '2099-01-01T00:00:00Z', reaberta_vezes: 99 }).select('id').single();
    const j2 = i2 ? A.linhaJson('cotacoes_pecas', i2.id) : null;
    ok('[NOVO] C8b INSERT com expira_em 2099 e reaberta_vezes 99 -> ignorados (expira em 7 dias, 0 reaberturas)', !e2 && !!j2 && dentro7d(j2.expira_em) && j2.reaberta_vezes === 0, e2?.message || JSON.stringify(j2));
    const alvo = i1?.id;
    if (alvo) {
      const { error: u1 } = await sReal.c.from('cotacoes_pecas').update({ status: 'fechada' }).eq('id', alvo);
      ok("[NOVO] C8c UPDATE status -> 'fechada' pelo cliente -> 42501", !!u1 && u1.code === '42501', u1 ? `${u1.code} ${u1.message}` : 'passou');
      const jA = A.linhaJson('cotacoes_pecas', alvo);
      const { error: u2 } = await sReal.c.from('cotacoes_pecas').update({ expira_em: '2099-01-01T00:00:00Z', reaberta_vezes: 2, peca_descricao: `Forjada status editada ${A.tag}` }).eq('id', alvo);
      const jB = A.linhaJson('cotacoes_pecas', alvo);
      ok('[NOVO] C8d UPDATE de expira_em/reaberta_vezes -> mantidos em silencio; peca_descricao muda', !u2 && !!jA && !!jB && jA.expira_em === jB.expira_em && jA.reaberta_vezes === jB.reaberta_vezes && /editada/.test(jB.peca_descricao), u2?.message || JSON.stringify({ jA, jB }).slice(0, 300));
      const { error: u3 } = await sReal.c.from('cotacoes_pecas').update({ oficina_id: ofTeste.id }).eq('id', alvo);
      ok('[NOVO] C8e UPDATE de oficina_id -> mantido (a cotacao continua da dona)', !u3 && A.linhaJson('cotacoes_pecas', alvo)?.oficina_id === ofReal.id, u3?.message);
      const { error: u4 } = await sReal.c.from('cotacoes_pecas').update({ status: 'cancelada' }).eq('id', alvo);
      ok("C8f aberta -> cancelada pelo cliente continua permitido", !u4 && (await A.cotacaoNoBanco(alvo))?.status === 'cancelada', u4?.message);
      const { error: u5 } = await sReal.c.from('cotacoes_pecas').update({ status: 'aberta' }).eq('id', alvo);
      ok("[NOVO] C8g cancelada -> aberta pelo cliente -> 42501", !!u5 && u5.code === '42501' && (await A.cotacaoNoBanco(alvo))?.status === 'cancelada', u5 ? `${u5.code} ${u5.message}` : 'passou');
    }
    // CHECKs das respostas (fornecedor ativo e legitimo): preco 0 e prazo 400 recusados.
    // No esquema de hoje o INSERT passa: apaga-se a linha entre as tentativas (indice unico por fornecedor)
    const limparOferta = () => A.admin.from('cotacoes_pecas_respostas').delete().eq('cotacao_id', cot3.id).eq('loja_id', ljReal.id);
    const { error: r0 } = await sLojaReal.c.from('cotacoes_pecas_respostas').insert({ cotacao_id: cot3.id, fornecedor_tipo: 'loja', loja_id: ljReal.id, preco: 0, prazo_dias: 1 });
    ok('[NOVO] C8h oferta com preco 0 -> recusada (CHECK preco > 0)', !!r0, r0?.message || 'gravou');
    await limparOferta();
    const { error: r1 } = await sLojaReal.c.from('cotacoes_pecas_respostas').insert({ cotacao_id: cot3.id, fornecedor_tipo: 'loja', loja_id: ljReal.id, preco: 10, prazo_dias: 400 });
    ok('[NOVO] C8i oferta com prazo 400 dias -> recusada (CHECK 0..365)', !!r1, r1?.message || 'gravou');
    await limparOferta();
    const { error: r2 } = await sLojaReal.c.from('cotacoes_pecas_respostas').insert({ cotacao_id: cot3.id, fornecedor_tipo: 'loja', loja_id: ljReal.id, preco: 10, prazo_dias: 1 });
    ok('C8j oferta legitima da loja real continua passando', !r2, r2?.message);
  });

  // ======================= C9: [NOVO] paridade teste/real na leitura =======================
  await tentar('C9', async () => {
    const cotTeste = await A.cotacao(ofTeste, 'Cotacao de TESTE', { quantidade: 1 });
    const ve = async (s, id) => ((await s.c.from('cotacoes_pecas').select('id').eq('id', id)).data || []).length === 1;
    ok('[NOVO] C9a loja REAL nao le cotacao de compradora de TESTE (select direto = 0)', !(await ve(sLojaReal, cotTeste.id)));
    ok('[NOVO] C9b oficina vendedora REAL nao le cotacao de TESTE', !(await ve(sVendReal, cotTeste.id)));
    ok('[NOVO] C9c loja de TESTE nao le cotacao REAL', !(await ve(sLojaTeste, cot3.id)));
    ok('C9d loja REAL continua lendo cotacao REAL; dona de teste le a propria; admin le as duas', (await ve(sLojaReal, cot3.id)) && (await ve(sTeste, cotTeste.id)) && (await ve(sAdm, cotTeste.id)) && (await ve(sAdm, cot3.id)));
    await ir(pL, '/ee/et/loja/cotacoes', 3000);
    ok('[NOVO] C9e /loja/cotacoes da loja real NAO lista a cotacao de teste', (await cartaoLoja(pL, cotTeste.descricao).count()) === 0 && (await cartaoLoja(pL, cot3.descricao).count()) === 1);
  });

  // ======================= C12: [NOVO] GET /api/pecas-v3 =======================
  await tentar('C12', async () => {
    const r0 = await A.pecasV3(null);
    ok(`[NOVO] C12a GET ${ROTA_INTERRUPTOR} sem sessao -> 401`, r0.status === 401, JSON.stringify(r0));
    const r1 = await A.pecasV3(sReal.token);
    ok('[NOVO] C12b conta real com interruptor global desligado -> {ativo:false}', r1.status === 200 && r1.d.ativo === false, JSON.stringify(r1));
    const r2 = await A.pecasV3(sTeste.token);
    ok('[NOVO] C12c conta de teste -> {ativo:true} (interruptor por sessao)', r2.status === 200 && r2.d.ativo === true, JSON.stringify(r2));
  });

  // ======================= C13: sem telefone em tabela publica =======================
  await tentar('C13', async () => {
    const cols = psql("select string_agg(table_name||'.'||column_name, ',') from information_schema.columns where table_schema='public' and table_name in ('lojas_pecas','oficinas') and column_name in ('telefone_comercial','telefone_fornecimento','telefone')");
    ok('C13 lojas_pecas/oficinas (SELECT USING true) sem coluna de telefone (vai para fornecedores_contato)', cols === '', cols);
  });

  // ======================= C14: [NOVO] badge de status desconhecido na tela de hoje =======================
  await tentar('C14', async () => {
    if (!temExpirada) { ok("[NOVO] C14a enum status_cotacao_peca tem 'expirada'", false, 'enum sem expirada (esquema de hoje)'); return; }
    const { error } = await A.admin.from('cotacoes_pecas').update({ status: 'expirada' }).eq('id', cot3.id);
    ok('[NOVO] C14a (preparo) service role grava status expirada', !error, error?.message);
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    const card = cardCom(pM, cot3.descricao);
    const badge = (await card.getByTestId('cotacao-status').innerText().catch(() => '')).trim();
    ok("[NOVO] C14b tela de hoje com cotacao 'expirada': badge = pecas.expirada (fallback), nao 'Tühistatud', sem editar/cancelar", badge === ET('pecas.expirada') && badge !== ET('oficinaPecas.cancelada') && (await card.getByRole('button', { name: ET('oficinaPecas.editarPedido') }).count()) === 0, badge);
    ok('[NOVO] C14c com o interruptor desligado NAO aparece o botao reabrir (tela de hoje)', (await card.getByTestId('cotacao-reabrir').count()) === 0);
  });

  await ctxD.close(); await ctxM.close(); await ctxL.close();
  ok('sem erro de pagina nos navegadores', erros.length === 0, erros.join(' | '));
} catch (e) {
  ok('excecao geral', false, e?.stack || e?.message);
} finally {
  await nav.fechar();
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  ok('limpeza: nada desta rodada ficou no banco nem na pasta de e-mails', errosLimpeza.length === 0 && sobras.length === 0, [...errosLimpeza, ...sobras].join(' | '));
  process.exitCode = fim() ? 1 : 0;
}
