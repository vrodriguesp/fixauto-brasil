// E2E LOCAL do lote 3.1 (18/11), contas de TESTE (tela nova de pecas pela conta_teste, global desligado):
//   R  "pedir de novo" (?repetir=): voltar limpa o formulario e desfaz o vinculo com o pedido cancelado;
//      avancar volta a preencher; envio depois do voltar NAO grava a escolha D-5; envio certo grava 1 vez;
//      depois de terminar: voltar varias vezes e reabrir o link de entrada logado nao gravam nada de novo
//   F  banner P-7 para a equipe (funcionario): sem o botao "avaliar", com a linha "so a dona avalia" (et/ru);
//      a dona continua com o botao
//   N  funil: pedido sem conta conta cada passo 1 vez (voltar/avancar/recarregar nao inflam);
//      cadastro de oficina nao conta "abriu" ao voltar (popstate e documento back_forward), conta ao abrir de novo
// Reinicie o :3100 antes. Ctrl+C limpa.
//   node lote3-1.mjs [<.env.local>]
import { lerEnv, ambienteL3, abrirNavegadores, contador, tradutor, SITE, ENV_PADRAO, siteNoAr, vigiar, entrarPelaTela, ir, visivel, sleep, DIA_MS } from './pecas-v3-lote3-lib.mjs';

const env = lerEnv(process.argv[2] || ENV_PADRAO);
if (!(await siteNoAr())) { console.log(`FALHA site local nao responde em ${SITE}`); process.exit(2); }
const A = ambienteL3(env);
const { ok, fim, tentar } = contador();
const ET = tradutor('et');
const RU = tradutor('ru');
const erros = [];
const nav = await abrirNavegadores(false);
A.limparAoInterromper(nav.fechar);
const cardCom = (p, texto) => p.getByTestId('cotacao-peca').filter({ hasText: texto });
const esperar = async (fn, cond, n = 30, ms = 300) => { let v; for (let i = 0; i < n; i++) { v = await fn(); if (cond(v)) return v; await sleep(ms); } return v; };
const ped = (id) => A.pedidoNoBanco(id);
const cotacoesDe = async (ofId) => (await A.admin.from('cotacoes_pecas').select('id, peca_descricao').eq('oficina_id', ofId)).data || [];
const descricaoNoForm = (p) => p.locator('#c8551-1').inputValue({ timeout: 1500 }).catch(() => null); // null = formulario fechado

try {
  const dC = await A.conta('oficina', 'l31-compradora', { contaTeste: true }); const ofC = await A.oficina(dC, 'L31 Compradora', { km: 0 });
  const dL = await A.conta('loja_pecas', 'l31-loja', { contaTeste: true }); const L = await A.loja(dL, 'L31 Loja');
  const func = await A.funcionario(ofC, 'l31-funcionario', { cargo: 'admin' });
  { const e = await A.interruptor(false); ok('interruptor global desligado (tela nova pela conta de teste)', !e && A.interruptorEstado() === false, e?.message); }

  // ======================= R: pedir de novo + voltar =======================
  const ctxD = await nav.contexto('chromium', 390, A.ip); const pD = await ctxD.newPage(); vigiar(pD, erros, 'R dona');
  const chamadasDepois = []; pD.on('request', (r) => { if (r.url().includes('/api/pedido-peca/depois-do-cancelamento')) chamadasDepois.push(r.postData() || ''); });
  await tentar('R', async () => {
    // cancelado pela compradora (D-10: sem avaliacao pendente) -> a tela oferece "pedir de novo"
    const P = await A.pedidoV3(ofC, L, { status: 'cancelado', descricao: 'Repetir', campos: { cancelado_por: 'compradora', cancelado_motivo: 'comprei_outro', cancelado_em: new Date().toISOString() } });
    await entrarPelaTela(pD, '/ee/et', dC);
    await ir(pD, '/ee/et/oficina/pecas', 3000);
    const card = cardCom(pD, P.descricao);
    ok('R.0 cancelado pela compradora: "Pedir de novo" na tela', await visivel(card.getByTestId('pos-cancelamento-nova')));
    await card.getByTestId('pos-cancelamento-nova').click();
    await pD.waitForURL((u) => u.searchParams.get('repetir') === P.cotacao.id, { timeout: 10000 }).catch(() => {});
    await pD.locator('#c8551-1').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    ok('R.1 pedir de novo: ?repetir= na barra e formulario pre-preenchido', new URL(pD.url()).searchParams.get('repetir') === P.cotacao.id && (await descricaoNoForm(pD)) === P.descricao, pD.url());
    await pD.goBack(); await sleep(1200);
    ok('R.2 voltar: ?repetir= sai da barra e o formulario fecha vazio', !new URL(pD.url()).searchParams.get('repetir') && ((await descricaoNoForm(pD)) ?? '') === '', `${pD.url()} form=${await descricaoNoForm(pD)}`);
    await pD.goForward(); await sleep(1200);
    ok('R.3 avancar: ?repetir= volta e o formulario e pre-preenchido de novo', new URL(pD.url()).searchParams.get('repetir') === P.cotacao.id && (await descricaoNoForm(pD)) === P.descricao, `${pD.url()} form=${await descricaoNoForm(pD)}`);
    await pD.goBack(); await sleep(1200);
    ok('R.4 voltar de novo: formulario fechado', ((await descricaoNoForm(pD)) ?? '') === '');
    // cotacao nova "do zero" depois do voltar: NAO pode gravar a escolha D-5 no pedido cancelado
    await pD.getByRole('button', { name: ET('oficinaPecas.novaCotacao') }).first().click();
    await pD.locator('#c8551-1').waitFor({ state: 'visible', timeout: 8000 });
    ok('R.5 "+ nova cotacao" depois do voltar abre o formulario VAZIO', (await descricaoNoForm(pD)) === '');
    const outra = `TESTE-PECAS L31 outra ${A.tag}`;
    await pD.locator('#c8551-1').fill(outra);
    const nDepoisAntes = chamadasDepois.length;
    await pD.getByRole('button', { name: ET('oficinaPecas.enviarCotacao') }).click();
    const criada = await esperar(() => cotacoesDe(ofC.id), (l) => l.some((c) => c.peca_descricao === outra));
    await sleep(1500);
    ok('R.6 envio depois do voltar: cotacao criada, pedido cancelado SEM escolha (pos_cancelamento null, nova_cotacao_id null), nenhuma chamada a depois-do-cancelamento',
      criada.some((c) => c.peca_descricao === outra) && ped(P.id)?.pos_cancelamento === null && ped(P.id)?.nova_cotacao_id === null && chamadasDepois.length === nDepoisAntes,
      JSON.stringify({ pos: ped(P.id)?.pos_cancelamento, chamadas: chamadasDepois.length - nDepoisAntes }));
    // agora o caminho certo: pedir de novo -> enviar -> grava 1 vez
    await ir(pD, '/ee/et/oficina/pecas', 3000);
    await cardCom(pD, P.descricao).getByTestId('pos-cancelamento-nova').click();
    await pD.locator('#c8551-1').waitFor({ state: 'visible', timeout: 10000 });
    await pD.getByRole('button', { name: ET('oficinaPecas.enviarCotacao') }).click();
    const j = await esperar(() => ped(P.id), (x) => !!x?.nova_cotacao_id);
    const nova = (await cotacoesDe(ofC.id)).filter((c) => c.peca_descricao === P.descricao && c.id !== P.cotacao.id);
    ok("R.7 pedir de novo + enviar: pos_cancelamento 'nova_cotacao', nova_cotacao_id = a nova (1 cotacao nova)", j?.pos_cancelamento === 'nova_cotacao' && nova.length === 1 && j?.nova_cotacao_id === nova[0].id, JSON.stringify({ pos: j?.pos_cancelamento, n: nova.length }));
    ok('R.8 depois do envio: ?repetir= fora da barra, formulario fechado', !new URL(pD.url()).searchParams.get('repetir') && ((await descricaoNoForm(pD)) ?? '') === '', pD.url());
    // licao de 18/11: depois de terminar, voltar varias vezes e reabrir a entrada logado
    const nCot = (await cotacoesDe(ofC.id)).length; const nCh = chamadasDepois.length;
    const visitas = [];
    for (let i = 0; i < 4; i++) {
      await pD.goBack({ timeout: 8000 }).catch(() => {}); await sleep(1300);
      visitas.push(pD.url().startsWith(SITE) ? new URL(pD.url()).pathname + new URL(pD.url()).search : pD.url());
      if (!pD.url().startsWith(SITE)) break;
    }
    ok('R.9 voltar 4x depois do envio: nenhum formulario com a peca, nenhuma cotacao nova, nenhuma chamada nova, escolha intacta',
      (await cotacoesDe(ofC.id)).length === nCot && chamadasDepois.length === nCh && ped(P.id)?.nova_cotacao_id === nova[0]?.id && (await descricaoNoForm(pD)) !== P.descricao, visitas.join(' > '));
    await ir(pD, `/ee/et/oficina/pecas?repetir=${P.cotacao.id}`, 3000);
    const pre = await descricaoNoForm(pD);
    if (pre !== null) { await pD.getByRole('button', { name: ET('oficinaPecas.enviarCotacao') }).click(); await sleep(2500); }
    ok('R.10 reabrir o link ?repetir= logado (escolha ja feita): envio nao chama depois-do-cancelamento e a escolha nao muda', chamadasDepois.length === nCh && ped(P.id)?.nova_cotacao_id === nova[0]?.id && ped(P.id)?.pos_cancelamento === 'nova_cotacao', `form=${pre} chamadas=${chamadasDepois.length - nCh}`);
  });

  // ======================= F: banner P-7 para a equipe =======================
  await tentar('F', async () => {
    const PA = await A.pedidoV3(ofC, L, { status: 'entregue', descricao: 'P7 equipe', campos: { entregue_em: new Date(Date.now() - 4 * DIA_MS).toISOString(), lembretes_feedback: 1 } });
    await ir(pD, '/ee/et/oficina/pecas', 3000);
    ok('F.1 dona: banner p7-bloqueio com o botao avaliar e sem a linha "so a dona"', await visivel(pD.getByTestId('p7-bloqueio')) && await visivel(pD.getByTestId(`p7-avaliar-${PA.id}`)) && (await pD.getByTestId('p7-so-dona').count()) === 0);
    for (const [idioma, T] of [['et', ET], ['ru', RU]]) {
      const ctxF = await nav.contexto('chromium', 390, A.ip, { locale: idioma === 'ru' ? 'ru-RU' : 'et-EE' }); const pF = await ctxF.newPage(); vigiar(pF, erros, `F funcionario ${idioma}`);
      await entrarPelaTela(pF, `/ee/${idioma}`, func);
      await ir(pF, `/ee/${idioma}/oficina/pecas`, 3500);
      const linha = pF.getByTestId(`p7-pedido-${PA.id}`);
      const so = await pF.getByTestId('p7-so-dona').innerText().catch(() => '');
      ok(`F.2 funcionario (${idioma}): ve o banner e a linha do pedido, SEM o botao avaliar, com "${T('pecas.p7.soDona')}"`,
        await visivel(pF.getByTestId('p7-bloqueio')) && (await linha.innerText().catch(() => '')).includes(PA.descricao) && (await pF.getByTestId(`p7-avaliar-${PA.id}`).count()) === 0 && so === T('pecas.p7.soDona'), `so="${so}" url=${pF.url()}`);
      ok(`F.3 funcionario (${idioma}): sem rolagem lateral`, await pF.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await pF.screenshot({ path: `C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/pecas-v3/lote3-1-p7-equipe-${idioma}-390.png`, fullPage: true }).catch(() => {});
      await ctxF.close();
    }
  });
  await ctxD.close();

  // ======================= N: funil (sem banco: /api/funil interceptado) =======================
  await tentar('N', async () => {
    const ctx = await nav.contexto('chromium', 390, A.ip);
    const funil = [];
    await ctx.route('**/api/funil', async (r) => { try { const b = JSON.parse(r.request().postData() || '{}'); funil.push(`${b.funil}:${b.etapa}`); } catch {} await r.fulfill({ status: 200, body: '{"ok":true}' }); });
    const p = await ctx.newPage(); vigiar(p, erros, 'N funil');
    const n = (x) => funil.filter((f) => f === x).length;
    await p.goto(`${SITE}/ee/et/paring`, { waitUntil: 'networkidle' }); await sleep(800);
    await p.getByRole('button', { name: ET('constants.tiposServico.mecanica') }).first().click();
    await p.getByTestId('passo-detalhe').waitFor();
    await p.locator('#pedido-descricao').fill(`Test ${A.tag}`);
    await p.getByTestId('passo-detalhe').getByRole('button', { name: ET('clienteNovaSolicitacao.next'), exact: true }).click();
    await p.getByTestId('passo-carro').waitFor(); await sleep(600);
    const ida = JSON.stringify(funil);
    ok('N.1 pedido: abriu, servico, detalhe e carro contados 1 vez cada na ida', ['abriu', 'servico', 'detalhe', 'carro'].every((e) => n(`pedido_site:${e}`) === 1), ida);
    await p.goBack(); await sleep(900); // carro -> detalhe
    await p.goForward(); await sleep(900); // detalhe -> carro
    await p.goBack(); await sleep(900); await p.goBack(); await sleep(900); // -> servico
    ok('N.2 voltar/avancar entre os passos ate o 1o', await visivel(p.getByTestId('passo-servico')), p.url());
    await p.getByRole('button', { name: ET('constants.tiposServico.mecanica') }).first().click();
    await p.getByTestId('passo-detalhe').waitFor();
    await p.getByTestId('passo-detalhe').getByRole('button', { name: ET('clienteNovaSolicitacao.next'), exact: true }).click();
    await p.getByTestId('passo-carro').waitFor(); await sleep(600);
    await p.reload({ waitUntil: 'networkidle' }); await sleep(1200); // rascunho volta no passo do carro
    for (let i = 0; i < 3; i++) { await p.goBack().catch(() => {}); await sleep(900); }
    ok('N.3 pedido: depois de voltar/avancar/escolher de novo/recarregar/voltar 3x, cada passo continua contado 1 vez (abriu 1)', ['abriu', 'servico', 'detalhe', 'carro'].every((e) => n(`pedido_site:${e}`) === 1), JSON.stringify(funil));
    await ctx.close();

    // cadastro de oficina: "abriu"
    const ctx2 = await nav.contexto('chromium', 390, A.ip);
    const f2 = [];
    await ctx2.route('**/api/funil', async (r) => { try { const b = JSON.parse(r.request().postData() || '{}'); f2.push(`${b.funil}:${b.etapa}`); } catch {} await r.fulfill({ status: 200, body: '{"ok":true}' }); });
    const q = await ctx2.newPage(); vigiar(q, erros, 'N cadastro');
    const abriu = () => f2.filter((x) => x === 'cadastro_site:abriu').length;
    await q.goto(`${SITE}/ee/et/registreeru?tipo=oficina`, { waitUntil: 'networkidle' }); await sleep(1500);
    ok('N.4 cadastro: abrir conta "abriu" 1 vez', abriu() === 1, JSON.stringify(f2));
    // navegacao no site (Next) e voltar: popstate
    await q.evaluate(() => { const a = document.querySelector('a[href$="/ee/et"], a[href="/ee/et/"]'); if (a) a.click(); else window.location.href = '/ee/et'; });
    await q.waitForURL((u) => !u.pathname.includes('registreeru'), { timeout: 10000 }).catch(() => {}); await sleep(1500);
    await q.goBack(); await sleep(2000);
    ok('N.5 cadastro: sair pelo site e voltar nao conta outro "abriu"', q.url().includes('registreeru') && abriu() === 1, `${q.url()} ${JSON.stringify(f2)}`);
    // documento inteiro: sai do site e volta (back_forward)
    await q.goto('about:blank'); await sleep(500);
    await q.goBack({ waitUntil: 'networkidle' }).catch(() => {}); await sleep(2000);
    ok('N.6 cadastro: sair do site e voltar (back_forward) nao conta outro "abriu"', q.url().includes('registreeru') && abriu() === 1, `${q.url()} ${JSON.stringify(f2)}`);
    for (let i = 0; i < 3; i++) { await q.goBack().catch(() => {}); await sleep(800); await q.goForward().catch(() => {}); await sleep(1200); }
    ok('N.7 cadastro: voltar/avancar 3x nao conta "abriu"', abriu() === 1, JSON.stringify(f2));
    await q.goto(`${SITE}/ee/et/registreeru?tipo=oficina`, { waitUntil: 'networkidle' }); await sleep(1500);
    ok('N.8 cadastro: abrir de novo pelo endereco (navegacao nova) conta "abriu" (2)', abriu() === 2, JSON.stringify(f2));
    await ctx2.close();
  });

  ok('sem erro de pagina nos navegadores', erros.length === 0, erros.join(' | '));
} catch (e) {
  ok('excecao geral', false, e?.stack || e?.message);
} finally {
  await nav.fechar();
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  ok('limpeza: nada desta rodada ficou no banco', errosLimpeza.length === 0 && sobras.length === 0, [...errosLimpeza, ...sobras].join(' | '));
  process.exitCode = fim() ? 1 : 0;
}
