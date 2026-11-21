// E2E LOCAL do botao "Pedir peca" no pedido do motorista com interruptor proprio e minimo de lojas (21/11, migracao 113).
// Mapa: Documentos/Analises/Pecas_botao_pedido_2026-11-21/Mapa.md. Regra: lib/pecas-botao-pedido.ts.
//   R regra pela rota (GET /api/pecas-v3?botao=1) | U tela do pedido (botao, sem piscar, fluxo antigo) | A admin | C sem as colunas | L limpeza
// Contagens em pais 'LV' (nenhuma loja la no banco local): numeros exatos, sem depender das lojas EE que ja existem.
// Sobe o PROPRIO site em :3107 (PORTA_SITE troca; nunca :3100-:3105) com o build DESTA copia do app.
//   node pecas-botao-pedido.mjs [<.env.local>]
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const PORTA_SITE = Number(process.env.PORTA_SITE || 3107);
if ([3100, 3101, 3102, 3103, 3104, 3105].includes(PORTA_SITE)) { console.log('FALHA porta reservada (3100-3105 sao de outros servidores)'); process.exit(2); }
process.env.SITE = `http://localhost:${PORTA_SITE}`;
const L = await import('./pecas-v3-lote3-lib.mjs');
const { lerEnv, ambienteL3, abrirNavegadores, contador, SITE, ENV_PADRAO, WEB, siteNoAr, vigiar, entrarPelaTela, ir, visivel, sleep, psql, semChaveCrua, botao, tradutor } = L;

const env = lerEnv(process.argv[2] || ENV_PADRAO);
if (await siteNoAr()) { console.log(`FALHA ja ha um site em ${SITE} - pare-o antes (este teste sobe o seu)`); process.exit(2); }
const A = ambienteL3(env);
const { ok, fim, tentar } = contador();
const erros = [];
const ET = tradutor('et');

let log = '';
const site = spawn(process.execPath, [path.join(WEB, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORTA_SITE)], { cwd: WEB, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
site.stdout.on('data', (d) => { log += d; }); site.stderr.on('data', (d) => { log += d; });
const parar = () => { try { site.kill(); } catch { /* */ } };
let nav = null;

const cfg = (c) => psql(`select coalesce(to_jsonb(c)->>'${c}','') from plataforma_config c where id = 1`);
const antes = { v3: cfg('pecas_v3_ativo'), botao: cfg('pecas_botao_pedido_ativo'), min: cfg('pecas_botao_min_lojas') };
if (antes.botao === '' || antes.min === '') { console.log('FALHA migracao 113 nao aplicada no banco local (pecas_botao_pedido_ativo / pecas_botao_min_lojas)'); parar(); process.exit(2); }
const setV3 = (v) => psql(`update plataforma_config set pecas_v3_ativo = ${v} where id = 1 returning pecas_v3_ativo`);
const setBotao = (v) => psql(`update plataforma_config set pecas_botao_pedido_ativo = ${v} where id = 1 returning pecas_botao_pedido_ativo`);
const setMin = (n) => psql(`update plataforma_config set pecas_botao_min_lojas = ${n} where id = 1 returning pecas_botao_min_lojas`);
let colunasRenomeadas = false;
const devolverColunas = () => {
  if (!colunasRenomeadas) return;
  psql("alter table plataforma_config rename column x_pecas_botao_pedido_ativo to pecas_botao_pedido_ativo; alter table plataforma_config rename column x_pecas_botao_min_lojas to pecas_botao_min_lojas; notify pgrst, 'reload schema';");
  colunasRenomeadas = false;
};
const restaurar = () => {
  devolverColunas();
  if (antes.v3) setV3(antes.v3 === 'true');
  setBotao(antes.botao === 'true');
  setMin(Number(antes.min));
};
process.on('SIGINT', async () => { try { await nav?.fechar(); } catch { /* */ } parar(); restaurar(); await A.limpar(); process.exit(130); });

const rotaBotao = (u) => u.pathname === '/api/pecas-v3' && u.searchParams.get('botao') === '1';
const botaoApi = (s) => A.api('GET', '/api/pecas-v3?botao=1', undefined, s?.token);
const resposta = async (s) => { const r = await botaoApi(s); return { status: r.status, ativo: r.d?.ativo, botao: r.d?.botaoPedido, d: r.d }; };

try {
  let no = false;
  for (let i = 0; i < 60 && !no; i++) { await sleep(1000); no = await siteNoAr(); }
  ok(`site no ar em ${SITE}`, no, log.slice(-300));
  if (!no) throw new Error('site nao subiu');
  setV3(true); setBotao(false); setMin(3);

  // ---- contas (LV para contar exato; EE para a tela com pedido do motorista) ----
  const dOfLV = await A.conta('oficina', 'bp-of-lv'); const ofLV = await A.oficina(dOfLV, 'BP Oficina LV', { pais: 'LV' });
  const dOfLVt = await A.conta('oficina', 'bp-of-lv-teste', { contaTeste: true }); const ofLVt = await A.oficina(dOfLVt, 'BP Oficina LV Teste', { pais: 'LV' });
  const realLV = [];
  for (const n of [1, 2]) { const d = await A.conta('loja_pecas', `bp-loja-lv${n}`); realLV.push(await A.loja(d, `BP Loja LV ${n}`, { pais: 'LV' })); }
  const testeLV = [];
  for (const n of [1, 2, 3]) { const d = await A.conta('loja_pecas', `bp-loja-lv-t${n}`, { contaTeste: true }); testeLV.push(await A.loja(d, `BP Loja LV Teste ${n}`, { pais: 'LV' })); }
  // nao contam: loja inativa e loja de conta desativada (o aviso tambem as pula)
  const dInat = await A.conta('loja_pecas', 'bp-loja-lv-inativa'); await A.loja(dInat, 'BP Loja LV Inativa', { pais: 'LV', ativa: false });
  const dDesat = await A.conta('loja_pecas', 'bp-loja-lv-desat', { ativo: false }); await A.loja(dDesat, 'BP Loja LV Desativada', { pais: 'LV' });
  const funcLV = await A.funcionario(ofLVt, 'bp-func-lv-teste');
  const adm = await A.conta('admin', 'bp-admin', { idioma: 'pt' });
  const S = { ofLV: await A.sessao(dOfLV), ofLVt: await A.sessao(dOfLVt), func: await A.sessao(funcLV) };

  // ======================= R: regra pela rota =======================
  await tentar('R', async () => {
    const semParam = await A.api('GET', '/api/pecas-v3', undefined, S.ofLV.token);
    ok('R.0 GET /api/pecas-v3 sem ?botao: resposta de sempre ({ ativo } so)', semParam.status === 200 && JSON.stringify(Object.keys(semParam.d)) === '["ativo"]' && semParam.d.ativo === true, JSON.stringify(semParam));
    const anon = await A.api('GET', '/api/pecas-v3?botao=1');
    ok('R.0b sem login: 401', anon.status === 401, String(anon.status));
    let r = await resposta(S.ofLV);
    ok('R.1 oficina real, v3 ligado, interruptor do botao DESLIGADO (2 lojas reais LV, min 3): botaoPedido false', r.status === 200 && r.ativo === true && r.botao === false, JSON.stringify(r.d));
    setBotao(true);
    r = await resposta(S.ofLV);
    ok('R.2 interruptor ligado + 2 lojas reais (min 3): false (3 lojas de teste, 1 inativa e 1 de conta desativada nao contam)', r.botao === false, JSON.stringify(r.d));
    setMin(2);
    r = await resposta(S.ofLV);
    ok('R.2b o mesmo com min 2: true (o minimo vem do banco)', r.botao === true, JSON.stringify(r.d));
    setMin(3);
    const d3 = await A.conta('loja_pecas', 'bp-loja-lv3'); realLV.push(await A.loja(d3, 'BP Loja LV 3', { pais: 'LV' }));
    r = await resposta(S.ofLV);
    ok('R.3 3 lojas reais LV (min 3): true', r.botao === true, JSON.stringify(r.d));
    setMin(0);
    r = await resposta(S.ofLV);
    ok('R.3b min 0: true', r.botao === true, JSON.stringify(r.d));
    setMin(4);
    r = await resposta(S.ofLV);
    ok('R.3c min 4 com 3 lojas: false', r.botao === false, JSON.stringify(r.d));
    setMin(3);
    setV3(false);
    r = await resposta(S.ofLV);
    ok('R.4 v3 global DESLIGADO (oficina real): false mesmo com o interruptor do botao ligado e 3 lojas', r.ativo === false && r.botao === false, JSON.stringify(r.d));
    setV3(true);
    setBotao(false);
    r = await resposta(S.ofLVt);
    ok('R.5 oficina de TESTE com o interruptor desligado e 3 lojas de teste LV: true (paridade)', r.ativo === true && r.botao === true, JSON.stringify(r.d));
    await A.admin.from('lojas_pecas').update({ ativa: false }).eq('id', testeLV[2].id);
    r = await resposta(S.ofLVt);
    ok('R.5b oficina de teste com so 2 lojas de teste (as 3 reais LV nao contam para ela): false', r.botao === false, JSON.stringify(r.d));
    await A.admin.from('lojas_pecas').update({ ativa: true }).eq('id', testeLV[2].id);
    setV3(false);
    r = await resposta(S.ofLVt);
    ok('R.5c oficina de teste com o v3 global desligado: v3 vale (conta de teste) e o botao tambem', r.ativo === true && r.botao === true, JSON.stringify(r.d));
    setV3(true);
    r = await resposta(S.func);
    ok('R.6 funcionario da oficina de teste: false (so a dona cria cotacao - RLS 093 - e dispara o aviso)', r.status === 200 && r.botao === false, JSON.stringify(r.d));
    await A.admin.from('oficinas').update({ ativa: false }).eq('id', ofLVt.id);
    r = await resposta(S.ofLVt);
    ok('R.7 oficina inativa: false', r.botao === false, JSON.stringify(r.d));
    await A.admin.from('oficinas').update({ ativa: true }).eq('id', ofLVt.id);
    setBotao(true);
    await A.admin.from('profiles').update({ conta_teste: true }).eq('id', realLV[0].dono.id);
    r = await resposta(S.ofLV);
    ok('R.8 loja real que vira conta de teste deixa de contar para a oficina real (2 reais): false', r.botao === false, JSON.stringify(r.d));
    await A.admin.from('profiles').update({ conta_teste: false }).eq('id', realLV[0].dono.id);
    setBotao(false);
  });

  // ======================= U: tela do pedido do motorista =======================
  nav = await abrirNavegadores(false);
  await tentar('U', async () => {
    // EE: oficina real (as lojas reais EE do banco local contam: o numero e lido antes) e oficina de teste com 3 lojas de teste
    const dOfR = await A.conta('oficina', 'bp-of-ee'); const ofR = await A.oficina(dOfR, 'BP Oficina EE', { km: 0 });
    const dOfT = await A.conta('oficina', 'bp-of-ee-teste', { contaTeste: true }); const ofT = await A.oficina(dOfT, 'BP Oficina EE Teste', { km: 0 });
    for (const n of [1, 2, 3]) { const d = await A.conta('loja_pecas', `bp-loja-ee-t${n}`, { contaTeste: true }); await A.loja(d, `BP Loja EE Teste ${n}`); }
    const cliR = await A.cliente('bp-motorista'); const solR = await A.solicitacao(cliR, { placa: 'BP1234' });
    const cliT = await A.cliente('bp-motorista-teste', { contaTeste: true }); const solT = await A.solicitacao(cliT, { placa: 'TB5678' });
    const reaisEE = Number(psql("select count(*) from lojas_pecas l join profiles p on p.id = l.profile_id where l.ativa and l.pais = 'EE' and p.ativo and not p.conta_teste"));
    console.log(`   lojas reais EE no banco local: ${reaisEE}`);
    setMin(Math.min(50, Math.max(1, reaisEE)));

    const ctx = await nav.contexto('chromium', 390, A.ip); const p = await ctx.newPage(); vigiar(p, erros, 'U real 390');
    await entrarPelaTela(p, '/ee/et', dOfR);
    setBotao(false);
    await ir(p, `/ee/et/oficina/pedidos/${solR.id}`, 3000);
    const pagOk = (await p.innerText('body')).includes('Toyota');
    ok('U.1 oficina real, interruptor do botao desligado (v3 ligado): pagina do pedido abre e SEM botao pedir-peca', pagOk && (await p.getByTestId('pedir-peca').count()) === 0);
    setBotao(true);
    await ir(p, `/ee/et/oficina/pedidos/${solR.id}`, 3000);
    ok(`U.2 interruptor ligado e min = ${Math.max(1, reaisEE)} (lojas reais EE): botao visivel`, reaisEE >= 1 && await visivel(p.getByTestId('pedir-peca')), `reaisEE=${reaisEE}`);
    setMin(Math.min(50, reaisEE + 1));
    await ir(p, `/ee/et/oficina/pedidos/${solR.id}`, 3000);
    ok('U.3 min = lojas + 1: botao some', (await p.getByTestId('pedir-peca').count()) === 0);
    setMin(Math.min(50, Math.max(1, reaisEE)));
    setV3(false);
    await ir(p, `/ee/et/oficina/pedidos/${solR.id}`, 3000);
    ok('U.4 v3 global desligado: sem botao (interruptor do botao ligado e lojas suficientes)', (await p.getByTestId('pedir-peca').count()) === 0);
    setV3(true);
    // sem piscar: com a resposta atrasada 2,5 s o botao nao aparece antes; erro da rota = escondido
    await p.route(rotaBotao, async (rt) => { await sleep(2500); await rt.continue().catch(() => {}); });
    await p.goto(`${SITE}/ee/et/oficina/pedidos/${solR.id}`, { waitUntil: 'domcontentloaded' });
    await p.getByText('Toyota').first().waitFor({ timeout: 15000 }).catch(() => {});
    const antesDaResposta = await p.getByTestId('pedir-peca').count();
    const depois = await visivel(p.getByTestId('pedir-peca'), 10000);
    ok('U.5 sem piscar: a pagina desenha sem o botao enquanto a resposta nao chega, e o botao entra depois', antesDaResposta === 0 && depois, `antes=${antesDaResposta} depois=${depois}`);
    await p.unroute(rotaBotao);
    await p.route(rotaBotao, (rt) => rt.fulfill({ status: 500, json: { error: 'x' } }));
    await ir(p, `/ee/et/oficina/pedidos/${solR.id}`, 3000);
    ok('U.6 erro da rota: botao escondido (tela de hoje)', (await p.getByTestId('pedir-peca').count()) === 0);
    await p.unroute(rotaBotao);
    await ctx.close();

    // conta de teste: interruptor desligado, 3 lojas de teste EE -> botao; clique abre o formulario com o carro
    setBotao(false); setMin(3);
    const ctxT = await nav.contexto('chromium', 390, A.ip); const pT = await ctxT.newPage(); vigiar(pT, erros, 'U teste 390');
    await entrarPelaTela(pT, '/ee/et', dOfT);
    await ir(pT, `/ee/et/oficina/pedidos/${solT.id}`, 3000);
    const btn = pT.getByTestId('pedir-peca');
    ok('U.7 oficina de teste (interruptor desligado, 3 lojas de teste EE): botao visivel, sem chave crua', await visivel(btn) && semChaveCrua(await btn.innerText()));
    await btn.click();
    await pT.waitForURL((u) => /\/oficina\/pecas/.test(u.pathname) && u.searchParams.get('solicitacao') === solT.id, { timeout: 15000 }).catch(() => {});
    await pT.locator('#c8551-1').waitFor({ timeout: 15000 }).catch(() => {});
    ok('U.8 fluxo antigo: abre /oficina/pecas?solicitacao=<id> com marca, modelo, ano e placa do pedido', pT.url().includes(`solicitacao=${solT.id}`) && (await pT.locator('#c8551-2').inputValue()) === 'Toyota' && (await pT.locator('#c8551-3').inputValue()) === 'Corolla' && (await pT.locator('#c8551-4').inputValue()) === '2018' && (await pT.getByTestId('cotacao-placa').inputValue()) === 'TB5678', pT.url());
    await pT.locator('#c8551-1').fill(`Botao pedido ${A.tag}`);
    await botao(pT, ET('oficinaPecas.enviarCotacao')).click();
    let c = null; for (let i = 0; i < 40 && !c; i++) { c = (await A.admin.from('cotacoes_pecas').select('id, fipe_marca').eq('oficina_id', ofT.id).eq('peca_descricao', `Botao pedido ${A.tag}`).maybeSingle()).data; if (!c) await sleep(300); }
    ok('U.9 cotacao criada com o carro do pedido', !!c && c.fipe_marca === 'Toyota', JSON.stringify(c));
    await pT.screenshot({ path: 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/pecas-botao-pedido-form-et-390.png', fullPage: true }).catch(() => {});
    await ctxT.close();
  });

  // ======================= A: admin =======================
  await tentar('A', async () => {
    setBotao(false); setMin(3);
    const ctxA = await nav.contexto('chromium', 1280, A.ip); const pa = await ctxA.newPage(); vigiar(pa, erros, 'A admin');
    await entrarPelaTela(pa, '/ee/et', adm);
    const rq = pa.context().request;
    const g = await (await rq.get(`${SITE}/api/admin/pecas-botao-pedido`)).json();
    ok('A.1 GET admin: desligado, min 3, LV com 3 lojas reais (inativa, desativada e de teste fora)', g.ativo === false && g.minLojas === 3 && g.lojasReaisPorPais?.LV === 3, JSON.stringify(g));
    await ir(pa, '/admin/pecas', 3000);
    const bloco = pa.getByTestId('pecas-botao-pedido-bloco');
    const linha = await pa.getByTestId('pecas-botao-lojas-por-pais').innerText().catch(() => '');
    ok('A.2 /admin/pecas: bloco "Botão Pedir peça no pedido do motorista" com a linha "Lojas ativas reais por país: ... LV 3"', await visivel(bloco) && (await bloco.innerText()).includes('Botão Pedir peça no pedido do motorista') && /Lojas ativas reais por país:.*LV 3/.test(linha), linha);
    await pa.getByTestId('pecas-botao-pedido-interruptor').click();
    let on = ''; for (let i = 0; i < 20 && on !== 't'; i++) { await sleep(300); on = psql('select pecas_botao_pedido_ativo from plataforma_config where id = 1'); }
    ok('A.3 clicar no interruptor liga (banco) e o botao mostra "Ligado"', on === 't' && /Ligado/.test(await pa.getByTestId('pecas-botao-pedido-interruptor').innerText()));
    const aud = psql(`select antes::text || ' ' || depois::text from admin_auditoria where admin_id = '${adm.id}' and acao = 'pecas_botao_pedido' order by created_at desc limit 1`);
    ok('A.4 auditoria com antes/depois', /"pecas_botao_pedido_ativo": false/.test(aud) && /"pecas_botao_pedido_ativo": true/.test(aud), aud);
    await pa.getByTestId('pecas-botao-min').fill('5');
    await pa.getByTestId('pecas-botao-min-salvar').click();
    let mn = ''; for (let i = 0; i < 20 && mn !== '5'; i++) { await sleep(300); mn = psql('select pecas_botao_min_lojas from plataforma_config where id = 1'); }
    ok('A.5 minimo 5 salvo pela tela (banco) e auditado', mn === '5' && Number(psql(`select count(*) from admin_auditoria where admin_id = '${adm.id}' and acao = 'pecas_botao_pedido'`)) === 2);
    await pa.getByTestId('pecas-botao-min').fill('51');
    await pa.getByTestId('pecas-botao-min-salvar').click();
    await pa.waitForTimeout(800);
    ok('A.6 tela recusa 51 (mensagem) e nada muda', psql('select pecas_botao_min_lojas from plataforma_config where id = 1') === '5' && (await pa.locator('[role="alert"]').count()) > 0);
    const inval = [];
    for (const v of [51, -1, 2.5, '3']) inval.push((await rq.patch(`${SITE}/api/admin/pecas-botao-pedido`, { data: { minLojas: v } })).status());
    inval.push((await rq.patch(`${SITE}/api/admin/pecas-botao-pedido`, { data: { ativo: 'sim' } })).status());
    inval.push((await rq.patch(`${SITE}/api/admin/pecas-botao-pedido`, { data: {} })).status());
    ok('A.7 API recusa 51, -1, 2.5, "3", ativo nao booleano e corpo vazio (400)', inval.every((s) => s === 400), inval.join(','));
    const naoAdm = await A.api('PATCH', '/api/admin/pecas-botao-pedido', { ativo: false }, S.ofLV.token);
    const naoAdmG = await A.api('GET', '/api/admin/pecas-botao-pedido', undefined, S.ofLV.token);
    const anonA = await A.api('GET', '/api/admin/pecas-botao-pedido');
    ok('A.8 oficina e anonimo: sem acesso (401/403) e nada muda', [naoAdm.status, naoAdmG.status, anonA.status].every((s) => s === 401 || s === 403) && psql('select pecas_botao_pedido_ativo from plataforma_config where id = 1') === 't', `${naoAdm.status} ${naoAdmG.status} ${anonA.status}`);
    const cons = psql("select count(*) from pg_constraint where conname = 'plataforma_config_pecas_botao_min_lojas_check'");
    let eCheck = ''; try { psql('update plataforma_config set pecas_botao_min_lojas = 51 where id = 1'); } catch (e) { eCheck = String(e.message || e); }
    ok('A.9 CHECK do banco (0-50) segura gravacao direta', cons === '1' && /check/i.test(eCheck) && psql('select pecas_botao_min_lojas from plataforma_config where id = 1') === '5', eCheck.slice(0, 120));
    await ctxA.close();
    setBotao(false); setMin(3);
  });

  // ======================= C: build novo antes da migracao (colunas ausentes) =======================
  await tentar('C', async () => {
    psql("alter table plataforma_config rename column pecas_botao_pedido_ativo to x_pecas_botao_pedido_ativo; alter table plataforma_config rename column pecas_botao_min_lojas to x_pecas_botao_min_lojas; notify pgrst, 'reload schema';");
    colunasRenomeadas = true;
    await sleep(1500);
    const rR = await resposta(S.ofLV); const rT = await resposta(S.ofLVt);
    const g = await A.api('GET', '/api/admin/pecas-botao-pedido', undefined, (await A.sessao(adm)).token);
    ok('C.1 sem as colunas: oficina real (3 lojas, v3 ligado) false; oficina de teste (3 lojas de teste, min padrao 3) true; admin le desligado/3', rR.status === 200 && rR.botao === false && rT.botao === true && g.status === 200 && g.d.ativo === false && g.d.minLojas === 3, `${JSON.stringify(rR.d)} ${JSON.stringify(rT.d)} ${JSON.stringify(g.d)}`);
    devolverColunas();
    await sleep(1500);
    const de = await resposta(S.ofLVt);
    ok('C.2 colunas de volta: rota responde normal', de.status === 200 && de.botao === true, JSON.stringify(de.d));
  });

  ok('nenhum erro de pagina no navegador', erros.length === 0, erros.slice(0, 5).join(' | '));
} catch (e) {
  ok(`excecao: ${e.message}`, false, String(e.stack || '').slice(0, 400));
} finally {
  try { await nav?.fechar(); } catch { /* */ }
  parar();
  restaurar();
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  const volta = cfg('pecas_v3_ativo') === antes.v3 && cfg('pecas_botao_pedido_ativo') === antes.botao && cfg('pecas_botao_min_lojas') === antes.min;
  const lv = psql("select count(*) from lojas_pecas where pais = 'LV'") + '/' + psql("select count(*) from oficinas where pais = 'LV'");
  ok('L limpeza: contas, oficinas, lojas, pedidos e cotacoes desta rodada apagados; interruptores e minimo de volta', errosLimpeza.length === 0 && sobras.length === 0 && volta && lv === '0/0', `${errosLimpeza.join(' | ')} ${sobras.join(' | ')} volta=${volta} lv=${lv}`);
  try { fs.mkdirSync('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados', { recursive: true }); fs.writeFileSync('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/pecas-botao-pedido-ultimo-log-site.txt', log.slice(-20000)); } catch { /* */ }
  process.exitCode = fim() ? 1 : 0;
}
