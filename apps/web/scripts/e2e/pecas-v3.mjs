// E2E LOCAL do lote 1 de pecas com o interruptor LIGADO (fase D do plano de regressao,
// Fable_auditoria_mapa_lote1.md secao 6 - os 10 grupos - e contrato da secao 7).
// Interruptor GLOBAL desligado: as contas compradoras/fornecedoras sao `conta_teste` e por isso
// veem a tela nova (pecasV3Ativo = plataforma_config.pecas_v3_ativo OR profiles.conta_teste).
// Contas reais entram so para a paridade teste/real e para o interruptor global (D.8).
// Antes da implementacao este script FALHA (esperado). Nomes: Contrato_testids_lote1.md.
//   D.0 migracao 091 | D.1 sem_carro 4,5 litro so_lojas (WebKit 390) + gate antes de renderizar + carro com placa (Chromium 1280)
//   D.2 placa pela rota (regras a/b/c, 404 indistinto, nunca em e-mail/sino) | D.3 expiracao (chamada mista) + reabrir (teto 3, sem re-aviso)
//   D.4 trigger + RLS 42501 | D.5 quantidade numeric (4,5 x 10 = 45) | D.6 telefone comercial so no pedido
//   D.7 paridade teste/real nos dois sentidos (RLS, rotas de mensagem/confirmar/avisar, realtime) + avisar com expira_em vencido
//   D.8 GET /api/pecas-v3 + interruptor do admin com auditoria | D.9 i18n 6 idiomas sem chave crua
// Ctrl+C limpa o que criou antes de sair. Nao rodar junto com pecas-v3-desligado.mjs (mesma pasta de e-mails e mesmo interruptor).
//   node pecas-v3.mjs [<.env.local>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { lerEnv, ambiente, abrirNavegadores, contador, tradutor, mensagens, pegaChave, IDIOMAS, PREFIXO, SITE, WEB, RAIZ, ENV_PADRAO, siteNoAr, semRolagemLateral, vigiar, entrarPelaTela, ir, visivel, semChaveCrua, PRINTS, sleep, horasAtras, DIA_MS, psql, botao, quantidadeComUnidade, UNIDADES, CHAVES_I18N, CHAVES_I18N_TEXTO, TIPO_AVISO_EXPIRADA, ROTA_PLACA, ROTA_REABRIR, ROTA_TAREFA, ROTA_INTERRUPTOR, ROTA_ADMIN_INTERRUPTOR } from './pecas-v3-lib.mjs';

const env = lerEnv(process.argv[2] || ENV_PADRAO);
if (!(await siteNoAr())) { console.log(`FALHA site local nao responde em ${SITE} - nada rodou (nao inicio o site sozinho)`); process.exit(2); }
const A = ambiente(env);
const { ok, fim, tentar } = contador();
const ET = tradutor('et');
const erros = [];
const nav = await abrirNavegadores(true);
A.limparAoInterromper(nav.fechar);
const cardCom = (p, texto) => p.getByTestId('cotacao-peca').filter({ hasText: texto });
const cartaoLoja = (p, texto) => p.locator('div.card').filter({ hasText: texto });
const dentro7d = (iso) => !!iso && Math.abs(new Date(iso) - (Date.now() + 7 * DIA_MS)) < 3600e3;
const semPlaca = (s) => !/123\s?ABC/i.test(String(s));
const u1ToS = (e) => (e ? `${e.code} ${e.message}` : 'passou');
const t0 = Date.now();

try {
  // ======================= D.0: migracao 091 =======================
  await tentar('D.0', async () => {
    const cols = psql("select string_agg(column_name||':'||data_type||':'||coalesce(column_default,''), ',' order by column_name) from information_schema.columns where table_schema='public' and table_name='cotacoes_pecas' and column_name in ('tipo','unidade','quantidade','expira_em','alvo','enviar_placa','reaberta_vezes')");
    ok('D.0a cotacoes_pecas: tipo (carro), unidade (un), quantidade numeric, expira_em (+7 dias), alvo (todos), enviar_placa (true), reaberta_vezes (0)', /tipo:text:'carro'/.test(cols) && /unidade:text:'un'/.test(cols) && /quantidade:numeric/.test(cols) && /expira_em:timestamp with time zone:\(now\(\) \+ '7 days'/.test(cols) && /alvo:text:'todos'/.test(cols) && /enviar_placa:boolean:true/.test(cols) && /reaberta_vezes:integer:0/.test(cols), cols);
    ok('D.0b pedidos_pecas.quantidade numeric', /numeric/.test(psql("select data_type from information_schema.columns where table_name='pedidos_pecas' and column_name='quantidade'")));
    ok("D.0c enum status_cotacao_peca tem 'expirada'", A.enumTem('expirada'));
    ok('D.0d cotacoes_pecas_placa existe, com RLS e CHECK ^[A-Z0-9]{2,12}$', A.tabelaExiste('cotacoes_pecas_placa') && psql("select relrowsecurity from pg_class where relname='cotacoes_pecas_placa'") === 't' && Number(psql("select count(*) from pg_constraint where conrelid='cotacoes_pecas_placa'::regclass and contype='c' and pg_get_constraintdef(oid) like '%[A-Z0-9]{2,12}%'")) >= 1);
    ok('D.0e cotacoes_pecas_placa FORA da publicacao realtime', psql("select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='cotacoes_pecas_placa'") === '0');
    const pk = psql("select pg_get_constraintdef(oid) from pg_constraint where conrelid='fornecedores_contato'::regclass and contype='p'");
    ok('D.0f fornecedores_contato (fornecedor_tipo, fornecedor_id, telefone) com RLS e PK composta', A.tabelaExiste('fornecedores_contato') && psql("select relrowsecurity from pg_class where relname='fornecedores_contato'") === 't' && /fornecedor_tipo, fornecedor_id/.test(pk), pk);
    const tel = psql("select string_agg(table_name||'.'||column_name, ',') from information_schema.columns where table_schema='public' and table_name in ('lojas_pecas','oficinas') and column_name like 'telefone%'");
    ok('D.0g nada de telefone em lojas_pecas/oficinas (tabelas publicas)', tel === '', tel);
    ok('D.0h plataforma_config.pecas_v3_ativo boolean default false', /boolean:false/.test(psql("select data_type||':'||column_default from information_schema.columns where table_name='plataforma_config' and column_name='pecas_v3_ativo'")));
    const chk = psql("select string_agg(pg_get_constraintdef(oid), ' | ') from pg_constraint where conrelid='cotacoes_pecas_respostas'::regclass and contype='c'");
    ok('D.0i CHECKs em cotacoes_pecas_respostas: preco > 0 e prazo_dias 0..365', /preco > \(?0/.test(chk) && /prazo_dias/.test(chk) && /365/.test(chk), chk);
    const chkQ = psql("select string_agg(pg_get_constraintdef(oid), ' | ') from pg_constraint where conrelid='cotacoes_pecas'::regclass and contype='c'");
    ok('D.0j CHECKs em cotacoes_pecas: quantidade > 0 e <= 9999, tipo, unidade, alvo, reaberta_vezes 0..3', /quantidade/.test(chkQ) && /9999/.test(chkQ) && /sem_carro/.test(chkQ) && /litro/.test(chkQ) && /so_lojas/.test(chkQ) && /reaberta_vezes/.test(chkQ), chkQ);
    const trg = psql("select pg_get_triggerdef(oid) from pg_trigger where tgname='trg_proteger_cotacao_peca' and tgrelid='cotacoes_pecas'::regclass");
    ok('D.0k trigger trg_proteger_cotacao_peca BEFORE INSERT OR UPDATE em cotacoes_pecas (proteger_cotacao_peca)', /BEFORE INSERT OR UPDATE/.test(trg) && /proteger_cotacao_peca\(\)/.test(trg), trg);
    const pSel = A.politica('cotacoes_pecas', 'cotacoes_pecas_select'), pIns = A.politica('cotacoes_pecas', 'cotacoes_pecas_insert'), pResp = A.politica('cotacoes_pecas_respostas', 'cotacoes_respostas_insert'), pMsg = A.politica('cotacoes_pecas_mensagens', 'pecas_mensagens_insert');
    ok('D.0l cotacoes_pecas_select com paridade conta_teste e alvo', /conta_teste/.test(pSel) && /alvo/.test(pSel), pSel.slice(0, 200));
    ok('D.0m cotacoes_pecas_insert exige oficina ativa', /ativa/.test(pIns), pIns.slice(0, 200));
    ok('D.0n cotacoes_respostas_insert: fornecedor ativo, vende_pecas, status aberta/respondida, alvo, paridade', /ativa/.test(pResp) && /vende_pecas/.test(pResp) && /status/.test(pResp) && /alvo/.test(pResp) && /conta_teste/.test(pResp), pResp.slice(0, 300));
    ok('D.0o pecas_mensagens_insert: fornecedor ativo, alvo, paridade', /ativa/.test(pMsg) && /alvo/.test(pMsg) && /conta_teste/.test(pMsg), pMsg.slice(0, 300));
    const comExpira = psql("select string_agg(polrelid::regclass::text || '.' || polname, ',') from pg_policy where polrelid::regclass::text in ('cotacoes_pecas','cotacoes_pecas_respostas','cotacoes_pecas_mensagens','cotacoes_pecas_placa','pedidos_pecas','fornecedores_contato') and (coalesce(pg_get_expr(polqual, polrelid), '') || ' ' || coalesce(pg_get_expr(polwithcheck, polrelid), '')) like '%expira_em%'");
    ok('D.0p NENHUMA politica das 6 tabelas de pecas usa expira_em (validade so pelo status)', comExpira === '', comExpira);
    const arqs = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((f) => /^091_.*\.sql$/.test(f));
    let okIdem = arqs.length === 1, saida = arqs.join(',') || 'sem arquivo 091_*.sql';
    if (okIdem) {
      const sql = fs.readFileSync(path.join(RAIZ, 'supabase/migrations', arqs[0]), 'utf8');
      // COMMIT/END de topo dentro do nosso BEGIN...ROLLBACK comitaria em silencio: o teste recusa antes de rodar
      if (/^\s*(COMMIT|END)\s*;/im.test(sql)) { okIdem = false; saida = 'COMMIT/END de topo no arquivo: o rollback do teste nao desfaria (o deploy aplica com psql -1)'; }
      else { try { psql(`BEGIN;\n${sql}\nROLLBACK;`); } catch (e) { okIdem = false; saida = String(e.stderr || e.message).slice(0, 300); } }
    }
    ok('D.0q migracao 091 existe, sem COMMIT de topo, e e idempotente (roda de novo numa transacao desfeita)', okIdem, saida);
    const tipos = fs.readFileSync(path.join(RAIZ, 'packages/shared/types/index.ts'), 'utf8');
    ok("D.0r packages/shared StatusCotacaoPeca inclui 'expirada'", /StatusCotacaoPeca\s*=\s*[^;]*'expirada'/.test(tipos));
  });

  // ======================= contas =======================
  const dComp = await A.conta('oficina', 'compradora', { contaTeste: true, telefone: '+372 5000 0100' }); const ofComp = await A.oficina(dComp, 'Compradora', { km: 0 });
  const dComp2 = await A.conta('oficina', 'compradora2', { contaTeste: true }); const ofComp2 = await A.oficina(dComp2, 'Compradora 2', { km: 0.3 });
  const dLoja1 = await A.conta('loja_pecas', 'loja1', { contaTeste: true, telefone: '+372 5000 0201' }); const lj1 = await A.loja(dLoja1, 'Loja 1');
  const dLoja2 = await A.conta('loja_pecas', 'loja2', { contaTeste: true, telefone: '+372 5000 0202' }); const lj2 = await A.loja(dLoja2, 'Loja 2');
  const dLojaInat = await A.conta('loja_pecas', 'loja-inativa', { contaTeste: true }); const ljInat = await A.loja(dLojaInat, 'Loja inativa', { ativa: false });
  const dLojaIT = await A.conta('loja_pecas', 'loja-italia', { contaTeste: true, idioma: 'it' }); await A.loja(dLojaIT, 'Loja Italia', { pais: 'IT' });
  const dVend = await A.conta('oficina', 'vendedora', { contaTeste: true }); const ofVend = await A.oficina(dVend, 'Vendedora', { km: 2, vendePecas: true });
  const dLojaReal = await A.conta('loja_pecas', 'loja-real'); const ljReal = await A.loja(dLojaReal, 'Loja real');
  const dVendReal = await A.conta('oficina', 'vendedora-real'); await A.oficina(dVendReal, 'Vendedora real', { km: 2.5, vendePecas: true });
  const dReal = await A.conta('oficina', 'compradora-real'); const ofReal = await A.oficina(dReal, 'Compradora real', { km: 0.6 });
  const adm = await A.conta('admin', 'admin', { idioma: 'pt' });
  const S = {};
  for (const [k, u] of Object.entries({ comp: dComp, comp2: dComp2, lj1: dLoja1, lj2: dLoja2, ljInat: dLojaInat, ljIT: dLojaIT, vend: dVend, ljReal: dLojaReal, vendReal: dVendReal, real: dReal, adm })) S[k] = await A.sessao(u);
  { const e = await A.interruptor(false); ok('D.0s interruptor global desligado para a rodada (contas de teste veem a tela nova pela sessao)', !e && A.interruptorEstado() === false, e?.message); }
  const OLEO = `Mootoriõli 5W-30 ${A.tag}`;
  const PECA = `Esipiduriklotsid ${A.tag}`;
  let cotOleo = null, cotPeca = null, pedPeca = null, pedOleo = null, respOleoLj2 = null, cotD = null, cX = null;
  // inputs com testid podem ser sr-only com rotulo estilizado: existencia por count(), marcar com force, estado por isChecked()
  const existe = async (p, t) => (await p.getByTestId(t).count()) === 1;
  const marcar = (p, t) => p.getByTestId(t).check({ force: true });

  // ======================= D.1: sem_carro, 4,5 litro, so lojas (WebKit 390) =======================
  const ctxW = await nav.contexto('webkit', 390, A.ip); const pW = await ctxW.newPage(); vigiar(pW, erros, 'D.1 webkit');
  const t1 = Date.now();
  await tentar('D.1', async () => {
    await entrarPelaTela(pW, '/ee/et', dComp);
    await ir(pW, '/ee/et/oficina/pecas', 2500);
    await botao(pW, ET('oficinaPecas.novaCotacao')).click();
    await pW.getByTestId('cotacao-tipo-carro').waitFor({ state: 'attached' });
    const faltam = [];
    for (const t of ['cotacao-tipo-carro', 'cotacao-tipo-sem-carro', 'cotacao-quantidade', 'cotacao-unidade', 'cotacao-placa', 'cotacao-ocultar-placa', 'cotacao-alvo-todos', 'cotacao-alvo-so-lojas']) if (!(await existe(pW, t))) faltam.push(t);
    for (const t of ['cotacao-validade-aviso', 'cotacao-placa-dica']) if (!(await pW.getByTestId(t).isVisible().catch(() => false))) faltam.push(t);
    ok('D.1a WebKit 390: formulario novo com tipo, quantidade, unidade, placa, ocultar placa, enviar a (inputs presentes) e "vale 7 dias" + dica da placa (visiveis)', faltam.length === 0, faltam.join(','));
    const opcoes = await pW.getByTestId('cotacao-unidade').locator('option').evaluateAll((os) => os.map((o) => o.value));
    ok('D.1b unidades = un, jogo, par, litro, kg, metro, caixa (valores do select)', JSON.stringify(opcoes) === JSON.stringify(UNIDADES), opcoes.join(','));
    ok('D.1c padroes: tipo carro, alvo todos, placa enviada (ocultar desmarcado)', await pW.getByTestId('cotacao-tipo-carro').isChecked() && await pW.getByTestId('cotacao-alvo-todos').isChecked() && !(await pW.getByTestId('cotacao-ocultar-placa').isChecked()));
    await marcar(pW, 'cotacao-tipo-sem-carro');
    ok('D.1d "sem carro": marca/modelo/ano e placa somem', await pW.getByTestId('cotacao-tipo-sem-carro').isChecked() && !(await pW.locator('#c8551-2').isVisible().catch(() => false)) && !(await pW.getByTestId('cotacao-placa').isVisible().catch(() => false)));
    await pW.locator('#c8551-1').fill(OLEO);
    await pW.getByTestId('cotacao-quantidade').fill('4.5');
    await pW.getByTestId('cotacao-unidade').selectOption('litro');
    await marcar(pW, 'cotacao-alvo-so-lojas');
    ok('D.1e sem rolagem lateral com o formulario novo aberto (WebKit 390)', await semRolagemLateral(pW));
    await pW.screenshot({ path: `${PRINTS}/ligado-criar-sem-carro-et-webkit-390.png`, fullPage: true });
    await botao(pW, ET('oficinaPecas.enviarCotacao')).click();
    let c = null; for (let i = 0; i < 40 && !c; i++) { c = (await A.admin.from('cotacoes_pecas').select('*').eq('oficina_id', ofComp.id).eq('peca_descricao', OLEO).maybeSingle()).data; if (!c) await sleep(300); }
    cotOleo = c ? { id: c.id, descricao: OLEO } : null;
    ok('D.1f cotacao gravada: tipo sem_carro, quantidade 4.5, unidade litro, alvo so_lojas, enviar_placa true, sem carro, aberta, expira em 7 dias, 0 reaberturas', !!c && c.tipo === 'sem_carro' && Number(c.quantidade) === 4.5 && c.unidade === 'litro' && c.alvo === 'so_lojas' && c.enviar_placa === true && !c.fipe_marca && c.status === 'aberta' && dentro7d(c.expira_em) && c.reaberta_vezes === 0, JSON.stringify(c));
    ok('D.1g sem linha em cotacoes_pecas_placa (sem carro)', !!c && (await A.admin.from('cotacoes_pecas_placa').select('cotacao_id', { count: 'exact', head: true }).eq('cotacao_id', c.id)).count === 0);
    await pW.waitForTimeout(1500);
    const card = cardCom(pW, OLEO);
    const qv = await card.getByTestId('cotacao-quantidade-valor').innerText().catch(() => '');
    ok('D.1h cartao da compradora: "4,5 <litro>" inteiro (cotacao-quantidade-valor), "expira em" (cotacao-expira-em) com numero', quantidadeComUnidade(qv, '4[,.]5', ET('pecas.unidades.litro')) && /\d/.test(await card.getByTestId('cotacao-expira-em').innerText().catch(() => '')), `"${qv}" rotulo="${ET('pecas.unidades.litro')}"`);
    ok('D.1i cartao sem chave crua', semChaveCrua(await card.innerText().catch(() => '??')));
    await pW.screenshot({ path: `${PRINTS}/ligado-cartao-sem-carro-et-webkit-390.png`, fullPage: true });
    // avisos: so lojas (teste, ativas, mesmo pais)
    const a1 = await A.esperarAviso(dLoja1.id, 'cotacao_peca_disponivel', 60);
    ok('D.1j loja 1 recebe sino com "4,5" e cotacao_id', a1.length === 1 && /4[,.]5/.test(a1[0].mensagem) && a1[0].dados?.cotacao_id === cotOleo?.id, a1[0]?.mensagem);
    ok('D.1k loja 2 recebe sino', (await A.esperarAviso(dLoja2.id, 'cotacao_peca_disponivel', 20)).length === 1);
    const m1 = await A.esperarEmail(dLoja1.email, t1, (e) => e.html.includes(OLEO), 40);
    const linhaQ = (m1?.html.match(/<strong>Kogus:<\/strong>[^<]*<\/p>/) || [''])[0];
    ok('D.1l e-mail da loja 1: "Kogus: 4,5 <unidade>" e SEM linha de veiculo', !!m1 && /<strong>Kogus:<\/strong> 4[,.]5 \S+<\/p>/.test(m1.html) && !/<strong>Sõiduk:/.test(m1.html), linhaQ);
    await sleep(2000);
    ok('D.1m "so lojas": a oficina vendedora vizinha NAO recebe sino nem e-mail', (await A.avisos(dVend.id, 'cotacao_peca_disponivel')).length === 0 && A.emailsDe(dVend.email, t1).length === 0);
    ok('D.1n loja inativa, loja de outro pais e fornecedores REAIS nao recebem nada', [dLojaInat, dLojaIT, dLojaReal, dVendReal].every((d) => A.emailsDe(d.email, t1).length === 0) && (await A.avisos(dLojaInat.id, 'cotacao_peca_disponivel')).length === 0 && (await A.avisos(dLojaIT.id, 'cotacao_peca_disponivel')).length === 0 && (await A.avisos(dLojaReal.id, 'cotacao_peca_disponivel')).length === 0 && (await A.avisos(dVendReal.id, 'cotacao_peca_disponivel')).length === 0);
    // a vendedora nem le a cotacao (RLS alvo)
    ok('D.1o select direto da vendedora na cotacao "so lojas" = 0 linhas', ((await S.vend.c.from('cotacoes_pecas').select('id').eq('id', cotOleo?.id || '00000000-0000-0000-0000-000000000000')).data || []).length === 0);
  });
  await ctxW.close(); await nav.fecharWebkit(); // WebKit so no fluxo de criar: libera memoria

  // ======================= D.1b: gate antes de renderizar + carro com placa (Chromium 1280) =======================
  const ctxD = await nav.contexto('chromium', 1280, A.ip); const pD = await ctxD.newPage(); vigiar(pD, erros, 'D.1b 1280');
  const t2 = Date.now();
  await tentar('D.1b', async () => {
    await entrarPelaTela(pD, '/ee/et', dComp);
    // gate: com /api/pecas-v3 atrasado 3 s, em nenhum momento a tela de hoje (#c8551-1 sem cotacao-tipo-carro)
    // pode aparecer - nem por meio segundo (auditoria do mapa §3)
    await ctxD.route('**/api/pecas-v3*', async (r) => { await sleep(3000); await r.continue(); });
    await pD.goto(`${SITE}/ee/et/oficina/pecas`, { waitUntil: 'domcontentloaded' });
    await botao(pD, ET('oficinaPecas.novaCotacao')).click({ timeout: 15000 });
    let vazouTelaAntiga = false, amostras = 0;
    const fimJanela = Date.now() + 2500;
    while (Date.now() < fimJanela) {
      const antigo = (await pD.locator('#c8551-1').count()) > 0, novo = (await pD.getByTestId('cotacao-tipo-carro').count()) > 0;
      if (antigo && !novo) vazouTelaAntiga = true;
      amostras++;
      await sleep(100);
    }
    const apareceu = await pD.getByTestId('cotacao-tipo-carro').waitFor({ state: 'attached', timeout: 10000 }).then(() => true, () => false);
    await ctxD.unroute('**/api/pecas-v3*');
    ok('D.1b0 gate: com /api/pecas-v3 atrasado, a tela de hoje nunca aparece antes da nova (formulario so depois da resposta)', !vazouTelaAntiga && apareceu && (await pD.locator('#c8551-1').count()) === 1, `vazou=${vazouTelaAntiga} apareceu=${apareceu} amostras=${amostras}`);
    await pD.locator('#c8551-1').fill(PECA);
    await pD.locator('#c8551-2').fill('Volkswagen');
    await pD.locator('#c8551-3').fill('Passat');
    await pD.locator('#c8551-4').fill('2012');
    await pD.getByTestId('cotacao-quantidade').fill('2');
    await pD.getByTestId('cotacao-placa').fill('123 abc');
    const dica = await pD.getByTestId('cotacao-placa-dica').innerText();
    const ajuda = await pD.getByTestId('cotacao-ocultar-placa-ajuda').innerText().catch(() => '');
    ok('D.1p dica "nao escreva a placa na descricao" e rotulo do "ocultar" explicam que o escolhido recebe depois da confirmacao', dica.trim().length > 0 && ajuda.trim().length > 0 && semChaveCrua(dica + ajuda), `${dica} | ${ajuda}`.slice(0, 200));
    await pD.screenshot({ path: `${PRINTS}/ligado-criar-carro-et-1280.png`, fullPage: true });
    await botao(pD, ET('oficinaPecas.enviarCotacao')).click();
    let c = null; for (let i = 0; i < 40 && !c; i++) { c = (await A.admin.from('cotacoes_pecas').select('*').eq('oficina_id', ofComp.id).eq('peca_descricao', PECA).maybeSingle()).data; if (!c) await sleep(300); }
    cotPeca = c ? { id: c.id, descricao: PECA } : null;
    ok('D.1q cotacao com carro: tipo carro, quantidade 2, unidade un, alvo todos, enviar_placa true', !!c && c.tipo === 'carro' && Number(c.quantidade) === 2 && c.unidade === 'un' && c.alvo === 'todos' && c.enviar_placa === true && c.fipe_marca === 'Volkswagen', JSON.stringify(c));
    const pl = c ? (await A.admin.from('cotacoes_pecas_placa').select('placa').eq('cotacao_id', c.id).maybeSingle()).data : null;
    ok('D.1r placa gravada em cotacoes_pecas_placa normalizada: "123 abc" -> "123ABC"', pl?.placa === '123ABC', JSON.stringify(pl));
    await pD.waitForTimeout(1500);
    const card = cardCom(pD, PECA);
    ok('D.1s cartao da compradora mostra a propria placa (cotacao-placa-valor) e "expira em"', (await card.getByTestId('cotacao-placa-valor').innerText().catch(() => '')).includes('123ABC') && (await card.getByTestId('cotacao-expira-em').count()) === 1);
    const m1 = await A.esperarEmail(dLoja1.email, t2, (e) => e.html.includes(PECA), 40);
    ok('D.1t e-mail com unidade "un": linha IDENTICA a de hoje (<strong>Kogus:</strong> 2</p>) e veiculo', !!m1 && /<strong>Kogus:<\/strong> 2<\/p>/.test(m1.html) && /<strong>Sõiduk:<\/strong> Volkswagen Passat 2012<\/p>/.test(m1.html), (m1?.html.match(/<strong>Kogus:<\/strong>[^<]*<\/p>/) || [''])[0]);
    const aV = await A.esperarAviso(dVend.id, 'cotacao_peca_disponivel', 30);
    ok('D.1u "lojas e oficinas" (alvo todos): a vendedora vizinha recebe sino (link aba=vender)', aV.length === 1 && aV[0].dados?.link === '/oficina/pecas?aba=vender');
  });

  // ======================= lojas e vizinha veem a cotacao (celular) =======================
  const ctxL1 = await nav.contexto('chromium', 390, A.ip); const pL1 = await ctxL1.newPage(); vigiar(pL1, erros, 'loja1');
  const ctxV = await nav.contexto('chromium', 390, A.ip); const pV = await ctxV.newPage(); vigiar(pV, erros, 'vendedora');
  await tentar('D.1c', async () => {
    await entrarPelaTela(pL1, '/ee/et', dLoja1);
    await ir(pL1, '/ee/et/loja/cotacoes', 3500);
    const co = cartaoLoja(pL1, OLEO);
    const qv = await co.getByTestId('cotacao-quantidade-valor').innerText().catch(() => '');
    ok('D.1v /loja/cotacoes: "4,5 <litro>" inteiro, selo "sem carro", sem linha de veiculo, sem placa', (await co.count()) === 1 && quantidadeComUnidade(qv, '4[,.]5', ET('pecas.unidades.litro')) && (await co.getByTestId('cotacao-sem-carro').count()) === 1 && !/Sõiduk:/.test(await co.innerText()) && (await co.getByTestId('cotacao-placa-valor').count()) === 0, `"${qv}"`);
    const cp = cartaoLoja(pL1, PECA);
    let placaUi = ''; for (let i = 0; i < 20 && !placaUi.includes('123ABC'); i++) { placaUi = await cp.getByTestId('cotacao-placa-valor').innerText().catch(() => ''); if (!placaUi.includes('123ABC')) await sleep(300); }
    ok('D.1w /loja/cotacoes: a placa da cotacao com carro aparece num campo proprio carregado pela rota (cotacao-placa-valor = 123ABC)', placaUi.includes('123ABC'), placaUi);
    ok('D.1x /loja/cotacoes sem chave crua e sem rolagem lateral', semChaveCrua(await pL1.innerText('body')) && await semRolagemLateral(pL1));
    await pL1.screenshot({ path: `${PRINTS}/ligado-loja-cotacoes-et-390.png`, fullPage: true });
    await entrarPelaTela(pV, '/ee/et', dVend);
    await ir(pV, '/ee/et/oficina/pecas?aba=vender', 3500);
    ok('D.1y aba Vender da vizinha: ve a cotacao com carro (com a placa pela rota) e NAO ve a "so lojas"', (await cartaoLoja(pV, PECA).count()) === 1 && (await cartaoLoja(pV, OLEO).count()) === 0 && (await cartaoLoja(pV, PECA).getByTestId('cotacao-placa-valor').innerText().catch(() => '')).includes('123ABC'));
    await pV.screenshot({ path: `${PRINTS}/ligado-vender-et-390.png`, fullPage: true });
  });
  await ctxV.close(); // a vizinha so e vista aqui

  // ======================= D.2: placa pela rota =======================
  await tentar('D.2', async () => {
    const id = cotPeca?.id; if (!id) throw new Error('sem cotacao com carro');
    const r = async (s) => A.placa(id, s?.token);
    const e = (x) => `${x.status} ${JSON.stringify(x.d)}`;
    const rc = await r(S.comp); ok(`D.2a GET ${ROTA_PLACA}: compradora -> 200 {placa:"123ABC"}`, rc.status === 200 && rc.d.placa === '123ABC', e(rc));
    const rl = await r(S.lj1); ok('D.2b loja ativa do mesmo pais (teste) -> 200', rl.status === 200 && rl.d.placa === '123ABC', e(rl));
    const rv = await r(S.vend); ok('D.2c oficina vendedora ativa (alvo todos) -> 200', rv.status === 200 && rv.d.placa === '123ABC', e(rv));
    const ri = await r(S.ljInat); ok('D.2d loja INATIVA -> 404', ri.status === 404 && !ri.d.placa, e(ri));
    const rit = await r(S.ljIT); ok('D.2e loja de OUTRO PAIS -> 404', rit.status === 404 && !rit.d.placa, e(rit));
    const r2 = await r(S.comp2); ok('D.2f outra oficina compradora (nao vende) -> 404', r2.status === 404 && !r2.d.placa, e(r2));
    const rr = await r(S.ljReal); ok('D.2g loja REAL (paridade) -> 404', rr.status === 404 && !rr.d.placa, e(rr));
    const rvr = await r(S.vendReal); ok('D.2h vendedora REAL (paridade) -> 404', rvr.status === 404 && !rvr.d.placa, e(rvr));
    const r0 = await r(null); ok('D.2i sem sessao -> 401', r0.status === 401, e(r0));
    const rp = await A.api('GET', ROTA_PLACA, undefined, S.comp.token); ok('D.2j sem ?cotacao= -> 400', rp.status === 400, e(rp));
    const rp2 = await A.placa('abc', S.comp.token); ok('D.2j2 ?cotacao= que nao e uuid -> 400', rp2.status === 400, e(rp2));
    const rx = await A.placa(crypto.randomUUID(), S.comp.token); ok('D.2k cotacao inexistente -> 404 (indistinto)', rx.status === 404, e(rx));
    const rs = await A.placa(cotOleo.id, S.comp.token); ok('D.2l cotacao sem_carro -> 404 ate para a compradora', rs.status === 404, e(rs));
    // ocultar: a compradora muda enviar_placa (coluna de conteudo, UPDATE pela RLS) e a rota corta na hora
    const { error: eu } = await S.comp.c.from('cotacoes_pecas').update({ enviar_placa: false }).eq('id', id);
    ok('D.2m compradora marca "nao mostrar a placa" (enviar_placa = false pela sessao dela)', !eu && (await A.cotacaoNoBanco(id))?.enviar_placa === false, eu?.message);
    const rl2 = await r(S.lj1), rv2 = await r(S.vend), rc2 = await r(S.comp);
    ok('D.2n oculta: loja 404, vendedora 404, compradora 200 (retroativo, nada ficou no cliente)', rl2.status === 404 && rv2.status === 404 && rc2.status === 200, `${rl2.status}/${rv2.status}/${rc2.status}`);
    await ir(pL1, '/ee/et/loja/cotacoes', 3500);
    ok('D.2o /loja/cotacoes depois de ocultar: o cartao continua listado, mas sem cotacao-placa-valor', (await cartaoLoja(pL1, PECA).count()) === 1 && (await cartaoLoja(pL1, PECA).getByTestId('cotacao-placa-valor').count()) === 0);
    // ofertas das 2 lojas (RLS) e confirmacao da loja 1 -> (c) o escolhido ve sempre
    const { data: o1, error: eo1 } = await S.lj1.c.from('cotacoes_pecas_respostas').insert({ cotacao_id: id, fornecedor_tipo: 'loja', loja_id: lj1.id, preco: 40, prazo_dias: 1 }).select('id').single();
    const { data: o2, error: eo2 } = await S.lj2.c.from('cotacoes_pecas_respostas').insert({ cotacao_id: id, fornecedor_tipo: 'loja', loja_id: lj2.id, preco: 45, prazo_dias: 2 }).select('id').single();
    ok('D.2p lojas 1 e 2 ofertam pela sessao delas (RLS cotacoes_respostas_insert)', !eo1 && !eo2 && !!o1 && !!o2, `${eo1?.message} ${eo2?.message}`);
    await A.marcarRespondida(id, S.lj1.token);
    const t3 = Date.now();
    const rconf = await A.confirmar(o1.id, S.comp.token);
    ok('D.2q compradora confirma a loja 1 -> 200', rconf.status === 200 && !!rconf.d.pedidoId, e(rconf));
    pedPeca = rconf.d.pedidoId || null;
    const rl3 = await r(S.lj1), rl4 = await r(S.lj2), rv3 = await r(S.vend);
    ok('D.2r fechada: a loja ESCOLHIDA ve a placa mesmo oculta (c); a outra que ofertou 404; vendedora 404', rl3.status === 200 && rl3.d.placa === '123ABC' && rl4.status === 404 && rv3.status === 404, `${rl3.status}/${rl4.status}/${rv3.status}`);
    // tabela da placa: so a compradora
    ok('D.2s select direto da loja 1 em cotacoes_pecas_placa = 0 linhas (RLS so da compradora)', ((await S.lj1.c.from('cotacoes_pecas_placa').select('placa')).data || []).length === 0);
    ok('D.2t a compradora le a propria linha', ((await S.comp.c.from('cotacoes_pecas_placa').select('placa').eq('cotacao_id', id)).data || []).length === 1);
    const { error: ei } = await S.comp2.c.from('cotacoes_pecas_placa').insert({ cotacao_id: cotOleo.id, placa: 'XX1234' });
    ok('D.2u outra oficina NAO insere placa para cotacao alheia', !!ei, ei?.message || 'inseriu');
    cX = await A.cotacao(ofComp, 'Placa formato'); // aberta/todos: serve de ancora nas listas da loja (D.3f)
    const { error: ef } = await S.comp.c.from('cotacoes_pecas_placa').insert({ cotacao_id: cX.id, placa: 'ab 12-cd' });
    ok('D.2v placa fora do formato (minuscula/espaco/hifen) recusada pelo CHECK; a tela normaliza antes', !!ef, ef?.message || 'inseriu');
    const { error: ef2 } = await S.comp.c.from('cotacoes_pecas_placa').insert({ cotacao_id: cX.id, placa: 'AB12CD' });
    ok('D.2w placa normalizada pela compradora e aceita', !ef2, ef2?.message);
    // vazamento
    const mails = A.emailsDesde(t0);
    const vazou = mails.filter((m) => !semPlaca(m.html)).map((m) => m.f);
    ok(`D.2x NENHUM e-mail desta rodada (${mails.length}) contem a placa`, mails.length > 0 && vazou.length === 0, vazou.join(','));
    const { data: avs } = await A.admin.from('notificacoes').select('tipo, titulo, mensagem, dados').in('profile_id', A.criado.contas);
    const vazouSino = (avs || []).filter((n) => !semPlaca(JSON.stringify(n)));
    ok(`D.2y NENHUM aviso (${(avs || []).length}) traz a placa em titulo/mensagem/dados`, (avs || []).length > 0 && vazouSino.length === 0, String(JSON.stringify(vazouSino[0]) ?? '').slice(0, 200));
    const mConf = await A.esperarEmail(dLoja1.email, t3, (ee) => /40[,.]00|80[,.]00/.test(ee.html), 30);
    ok('D.2z e-mail "pedido confirmado" ao escolhido sem a placa (contato pela rota, nao pelo e-mail)', !!mConf && semPlaca(mConf.html), mConf?.assunto);
  });

  // ======================= D.3: expiracao e reabrir =======================
  const ctxM = await nav.contexto('chromium', 390, A.ip); const pM = await ctxM.newPage(); vigiar(pM, erros, 'D.3 compradora 390');
  await tentar('D.3', async () => {
    const id = cotOleo?.id; if (!id) throw new Error('sem cotacao sem carro');
    const { data: o2, error: eo } = await S.lj2.c.from('cotacoes_pecas_respostas').insert({ cotacao_id: id, fornecedor_tipo: 'loja', loja_id: lj2.id, preco: 10, prazo_dias: 2 }).select('id').single();
    if (eo) throw new Error('oferta loja 2: ' + eo.message);
    respOleoLj2 = o2.id;
    await A.marcarRespondida(id, S.lj2.token);
    ok('D.3a (preparo) cotacao sem carro respondida pela loja 2', (await A.cotacaoNoBanco(id))?.status === 'respondida');
    const { error: ex } = await A.admin.from('cotacoes_pecas').update({ expira_em: horasAtras(1) }).eq('id', id);
    if (ex) throw new Error('expira_em: ' + ex.message);
    // chamada MISTA: na mesma rodada da tarefa ha uma cotacao REAL vencida (global desligado) - so a de teste expira
    const cotRealVencida = await A.cotacao(ofReal, 'Real vencida', { expira_em: horasAtras(1) });
    const r1 = await A.tarefa();
    ok(`D.3b POST ${ROTA_TAREFA} -> 200 ok, expiradas === 1 (so a cotacao de TESTE; a real vencida fica, por cotacao)`, r1.status === 200 && r1.d.ok === true && r1.d.expiradas === 1 && (await A.cotacaoNoBanco(cotRealVencida.id))?.status === 'aberta', JSON.stringify(r1));
    ok("D.3c status 'expirada'", (await A.cotacaoNoBanco(id))?.status === 'expirada');
    const av = await A.esperarAviso(dComp.id, TIPO_AVISO_EXPIRADA, 20);
    const textos = av[0]?.dados?.textos || {};
    ok(`D.3d sino "${TIPO_AVISO_EXPIRADA}" para a dona: dados.cotacao_id, link /oficina/pecas, textos nas 6 linguas`, av.length === 1 && av[0].dados?.cotacao_id === id && av[0].dados?.link === '/oficina/pecas' && IDIOMAS.every((l) => textos[l]?.titulo && textos[l]?.mensagem) && av[0].titulo && av[0].mensagem, JSON.stringify(av[0]).slice(0, 300));
    ok('D.3e a vencida some da lista da loja (select aberta/respondida = 0) e a loja nao consegue ofertar', ((await S.lj1.c.from('cotacoes_pecas').select('id').eq('id', id).in('status', ['aberta', 'respondida'])).data || []).length === 0 && !!(await S.lj1.c.from('cotacoes_pecas_respostas').insert({ cotacao_id: id, fornecedor_tipo: 'loja', loja_id: lj1.id, preco: 9, prazo_dias: 1 })).error);
    await ir(pL1, '/ee/et/loja/cotacoes', 3000);
    ok('D.3f /loja/cotacoes nao lista a vencida (e continua listando a aberta "Placa formato" - ancora)', (await cartaoLoja(pL1, cX?.descricao || '\u0000').count()) === 1 && (await cartaoLoja(pL1, OLEO).count()) === 0);
    const r2 = await A.tarefa();
    ok('D.3g tarefa de novo -> expiradas 0 e sem 2o sino (dedupe tipo + cotacao)', r2.status === 200 && r2.d.expiradas === 0 && (await A.avisos(dComp.id, TIPO_AVISO_EXPIRADA)).length === 1, JSON.stringify(r2));
    const rc = await A.confirmar(respOleoLj2, S.comp.token);
    ok('D.3h confirmar oferta de cotacao expirada -> 409 JA_FECHADA', rc.status === 409 && rc.d.codigo === 'JA_FECHADA', JSON.stringify(rc));
    // tela da compradora: expirada + reabrir
    await entrarPelaTela(pM, '/ee/et', dComp);
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    const card = cardCom(pM, OLEO);
    const badge = (await card.getByTestId('cotacao-status').innerText().catch(() => '')).trim();
    ok('D.3i cartao: badge pecas.expirada, botao reabrir, SEM confirmar/editar/cancelar', badge === ET('pecas.expirada') && await visivel(card.getByTestId('cotacao-reabrir')) && (await botao(card, ET('oficinaPecas.confirmarPedidoBtn')).count()) === 0 && (await botao(card, ET('oficinaPecas.editarPedido')).count()) === 0, badge);
    await pM.screenshot({ path: `${PRINTS}/ligado-expirada-et-390.png`, fullPage: true });
    // "sem re-aviso": o numero de avisos cotacao_peca_disponivel desta cotacao (lojas 1 e 2) nao muda ao reabrir
    const avisosDisp = async () => (await A.admin.from('notificacoes').select('id', { count: 'exact', head: true }).eq('tipo', 'cotacao_peca_disponivel').eq('dados->>cotacao_id', id)).count || 0;
    const nAntes = await avisosDisp(); const tR = Date.now();
    await card.getByTestId('cotacao-reabrir').click();
    let c = null; for (let i = 0; i < 30; i++) { c = await A.cotacaoNoBanco(id); if (c?.status !== 'expirada') break; await sleep(300); }
    ok("D.3j reabrir pela tela: volta a 'respondida' (tem oferta valida), expira_em = +7 dias, reaberta_vezes 1", c?.status === 'respondida' && dentro7d(c?.expira_em) && c?.reaberta_vezes === 1, JSON.stringify(c));
    await pM.waitForTimeout(1500);
    ok('D.3k cartao volta ao badge "respondida" e a oferta volta a ter "confirmar"', (await card.getByTestId('cotacao-status').innerText()).trim() === ET('oficinaPecas.respondida') && (await botao(card, ET('oficinaPecas.confirmarPedidoBtn')).count()) >= 1);
    ok('D.3k2 reabrir pela tela NAO re-avisa as lojas (mesmo numero de sinos cotacao_peca_disponivel, sem e-mail novo)', nAntes >= 2 && (await avisosDisp()) === nAntes && A.emailsDe(dLoja1.email, tR).length === 0 && A.emailsDe(dLoja2.email, tR).length === 0, `antes=${nAntes} depois=${await avisosDisp()}`);
    ok('D.3l a loja volta a ver a cotacao (select = 1)', ((await S.lj1.c.from('cotacoes_pecas').select('id').eq('id', id).in('status', ['aberta', 'respondida'])).data || []).length === 1);
    const rr1 = await A.reabrir(id, S.comp.token);
    ok(`D.3m POST ${ROTA_REABRIR} em cotacao nao expirada -> 409 NAO_EXPIRADA`, rr1.status === 409 && rr1.d.codigo === 'NAO_EXPIRADA', JSON.stringify(rr1));
    await A.admin.from('cotacoes_pecas').update({ status: 'expirada', reaberta_vezes: 3 }).eq('id', id);
    const rr2 = await A.reabrir(id, S.comp.token);
    ok('D.3n 4a reabertura (reaberta_vezes = 3) -> 409 TETO_REABERTURAS', rr2.status === 409 && rr2.d.codigo === 'TETO_REABERTURAS' && (await A.cotacaoNoBanco(id))?.status === 'expirada', JSON.stringify(rr2));
    await A.admin.from('cotacoes_pecas').update({ reaberta_vezes: 1 }).eq('id', id);
    const rr3 = await A.reabrir(id, S.comp2.token), rr4 = await A.reabrir(id, S.lj1.token), rr5 = await A.reabrir(id, null), rr6 = await A.reabrir(crypto.randomUUID(), S.comp.token);
    ok('D.3o reabrir por outra oficina 403 SEM_ACESSO; por loja 403; sem sessao 401; inexistente 404', rr3.status === 403 && rr3.d.codigo === 'SEM_ACESSO' && rr4.status === 403 && rr5.status === 401 && rr6.status === 404, `${rr3.status}/${rr4.status}/${rr5.status}/${rr6.status}`);
    const nAntes7 = await avisosDisp(); const tR7 = Date.now();
    const rr7 = await A.reabrir(id, S.comp.token);
    ok('D.3p reabrir pela rota (dona) -> 200 {status:"respondida", reabertaVezes:2, expiraEm +7d}', rr7.status === 200 && rr7.d.status === 'respondida' && rr7.d.reabertaVezes === 2 && dentro7d(rr7.d.expiraEm) && (await A.cotacaoNoBanco(id))?.status === 'respondida', JSON.stringify(rr7));
    await sleep(1500);
    ok('D.3p2 reabrir pela rota NAO re-avisa (sinos cotacao_peca_disponivel iguais, sem e-mail)', (await avisosDisp()) === nAntes7 && A.emailsDe(dLoja1.email, tR7).length === 0 && A.emailsDe(dLoja2.email, tR7).length === 0, `antes=${nAntes7} depois=${await avisosDisp()}`);
    // sem oferta -> volta a 'aberta'
    const cC = await A.cotacao(ofComp, 'Sem oferta vencida', { expira_em: horasAtras(1) });
    const r3 = await A.tarefa();
    const rr8 = await A.reabrir(cC.id, S.comp.token);
    ok("D.3q cotacao sem oferta: tarefa expira (sino) e reabrir volta a 'aberta'", r3.d.expiradas >= 1 && rr8.status === 200 && rr8.d.status === 'aberta' && (await A.cotacaoNoBanco(cC.id))?.status === 'aberta' && (await A.avisos(dComp.id, TIPO_AVISO_EXPIRADA)).length === 2, JSON.stringify(rr8));
    ok('D.3r nenhum e-mail de expiracao contem placa; sino de expiracao sem placa', A.emailsDesde(t0).every((m) => semPlaca(m.html)) && (await A.avisos(dComp.id, TIPO_AVISO_EXPIRADA)).every((n) => semPlaca(JSON.stringify(n))));
  });

  // ======================= D.4: trigger + RLS (42501) =======================
  await tentar('D.4', async () => {
    const ins = (campos) => S.comp.c.from('cotacoes_pecas').insert({ oficina_id: ofComp.id, peca_descricao: `Forjada ${A.tag}`, quantidade: 1, ...campos }).select('id, status, created_at').single();
    const { data: i1, error: e1 } = await ins({ status: 'fechada' });
    ok("D.4a INSERT status 'fechada' -> gravada 'aberta'", !e1 && i1?.status === 'aberta', e1?.message || JSON.stringify(i1));
    const { data: i2, error: e2 } = await ins({ expira_em: '2099-01-01T00:00:00Z', reaberta_vezes: 99, created_at: '2020-01-01T00:00:00Z' });
    const j2 = i2 ? A.linhaJson('cotacoes_pecas', i2.id) : null;
    ok('D.4b INSERT com expira_em 2099 / reaberta_vezes 99 / created_at 2020 -> +7 dias, 0, agora', !e2 && !!j2 && dentro7d(j2.expira_em) && j2.reaberta_vezes === 0 && Math.abs(new Date(j2.created_at) - Date.now()) < 120e3, e2?.message || JSON.stringify(j2));
    const id = i1?.id; if (!id) throw new Error('sem cotacao forjada');
    const upd = (campos) => S.comp.c.from('cotacoes_pecas').update(campos).eq('id', id);
    const { error: u1 } = await upd({ status: 'fechada' });
    ok("D.4c UPDATE status 'fechada' -> 42501", u1?.code === '42501', u1ToS(u1));
    const { error: u1b } = await upd({ status: 'expirada' });
    ok("D.4d UPDATE status 'expirada' pelo cliente -> 42501", u1b?.code === '42501', u1ToS(u1b));
    const jA = A.linhaJson('cotacoes_pecas', id);
    const { error: u2 } = await upd({ expira_em: '2099-01-01T00:00:00Z', reaberta_vezes: 2, oficina_id: ofComp2.id, peca_descricao: `Forjada editada ${A.tag}` });
    const jB = A.linhaJson('cotacoes_pecas', id);
    ok('D.4e UPDATE expira_em/reaberta_vezes/oficina_id -> mantidos em silencio; peca_descricao muda', !u2 && jA.expira_em === jB.expira_em && jA.reaberta_vezes === jB.reaberta_vezes && jB.oficina_id === ofComp.id && /editada/.test(jB.peca_descricao), u2?.message || JSON.stringify({ jA, jB }).slice(0, 300));
    const { error: u3 } = await upd({ quantidade: 4.5, unidade: 'litro', tipo: 'sem_carro', alvo: 'so_lojas', enviar_placa: false });
    const jC = A.linhaJson('cotacoes_pecas', id);
    ok('D.4f UPDATE das colunas de conteudo novas (quantidade decimal, unidade, tipo, alvo, enviar_placa) -> ok', !u3 && Number(jC.quantidade) === 4.5 && jC.unidade === 'litro' && jC.tipo === 'sem_carro' && jC.alvo === 'so_lojas' && jC.enviar_placa === false, u3?.message || JSON.stringify(jC));
    const { error: u4 } = await upd({ quantidade: 0 });
    const { error: u4b } = await upd({ unidade: 'tonelada' });
    ok('D.4g quantidade 0 e unidade fora da lista -> recusadas (CHECK)', !!u4 && !!u4b, `${u4?.message} / ${u4b?.message}`);
    const { error: u5 } = await upd({ status: 'cancelada' });
    ok("D.4h aberta -> cancelada pelo cliente -> ok", !u5 && (await A.cotacaoNoBanco(id))?.status === 'cancelada', u5?.message);
    const { error: u6 } = await upd({ status: 'aberta' });
    ok("D.4i cancelada -> aberta -> 42501", u6?.code === '42501', u1ToS(u6));
    // fornecedores
    const resp = (s, cot, linha) => s.c.from('cotacoes_pecas_respostas').insert({ cotacao_id: cot, preco: 10, prazo_dias: 1, ...linha });
    const msg = (s, cot, linha) => s.c.from('cotacoes_pecas_mensagens').insert({ cotacao_id: cot, remetente_id: s.user.id, texto: 'teste', ...linha });
    const { error: f1 } = await resp(S.lj1, id, { fornecedor_tipo: 'loja', loja_id: lj1.id });
    ok('D.4j loja oferta em cotacao cancelada -> recusada', !!f1, f1?.message || 'gravou');
    cotD = await A.cotacao(ofComp, 'Aberta todos D');
    await A.admin.from('oficinas').update({ vende_pecas: true }).eq('id', ofComp.id);
    const { error: f2 } = await resp(S.comp, cotD.id, { fornecedor_tipo: 'oficina', oficina_fornecedora_id: ofComp.id });
    ok('D.4k oficina (mesmo vendendo) NAO oferta na propria cotacao', !!f2, f2?.message || 'gravou');
    await A.admin.from('oficinas').update({ vende_pecas: false }).eq('id', ofComp.id);
    const { error: f3 } = await resp(S.lj1, cotD.id, { fornecedor_tipo: 'loja', loja_id: lj1.id, preco: 0 });
    ok('D.4l preco 0 -> recusado', !!f3, f3?.message || 'gravou');
    const { error: f4 } = await resp(S.lj1, cotD.id, { fornecedor_tipo: 'loja', loja_id: lj1.id, prazo_dias: 400 });
    ok('D.4m prazo 400 -> recusado', !!f4, f4?.message || 'gravou');
    const { error: f5 } = await resp(S.ljInat, cotD.id, { fornecedor_tipo: 'loja', loja_id: ljInat.id });
    const { error: f6 } = await msg(S.ljInat, cotD.id, { fornecedor_tipo: 'loja', fornecedor_id: ljInat.id });
    ok('D.4n loja INATIVA nao oferta nem escreve', !!f5 && !!f6, `${f5?.message || 'ofertou'} / ${f6?.message || 'escreveu'}`);
    const { error: f7 } = await resp(S.vend, cotOleo.id, { fornecedor_tipo: 'oficina', oficina_fornecedora_id: ofVend.id });
    const { error: f8 } = await msg(S.vend, cotOleo.id, { fornecedor_tipo: 'oficina', fornecedor_id: ofVend.id });
    ok('D.4o vendedora em cotacao "so lojas" nao oferta nem escreve', !!f7 && !!f8, `${f7?.message || 'ofertou'} / ${f8?.message || 'escreveu'}`);
    const { error: f9 } = await resp(S.comp2, cotD.id, { fornecedor_tipo: 'oficina', oficina_fornecedora_id: ofComp2.id });
    ok('D.4p oficina ativa SEM vende_pecas nao oferta', !!f9, f9?.message || 'gravou');
    const { error: f10 } = await resp(S.ljReal, cotD.id, { fornecedor_tipo: 'loja', loja_id: ljReal.id });
    ok('D.4q loja REAL nao oferta em cotacao de TESTE (paridade na escrita)', !!f10, f10?.message || 'gravou');
    const { error: f11 } = await msg(S.lj1, cotOleo.id, { fornecedor_tipo: 'loja', fornecedor_id: lj1.id });
    const { error: f12 } = await resp(S.vend, cotD.id, { fornecedor_tipo: 'oficina', oficina_fornecedora_id: ofVend.id });
    const { error: f13 } = await msg(S.vend, cotD.id, { fornecedor_tipo: 'oficina', fornecedor_id: ofVend.id });
    ok('D.4r legitimos: loja escreve na "so lojas"; vendedora oferta e escreve na "todos"', !f11 && !f12 && !f13, `${f11?.message} / ${f12?.message} / ${f13?.message}`);
    const { error: f14 } = await msg(S.comp, cotD.id, { fornecedor_tipo: 'loja', fornecedor_id: lj1.id });
    ok('D.4s legitimo: a compradora escreve para qualquer fornecedor da cotacao', !f14, f14?.message);
  });

  // ======================= D.6 (parte 1): telefone comercial da compradora antes da confirmacao =======================
  await tentar('D.6a', async () => {
    const { error } = await S.comp.c.from('fornecedores_contato').insert({ fornecedor_tipo: 'oficina', fornecedor_id: ofComp.id, telefone: '+372 700 0001' });
    ok('D.6a oficina grava o proprio telefone comercial em fornecedores_contato (RLS do dono)', !error, error?.message);
    const ctxP = await nav.contexto('chromium', 390, A.ip); const pP = await ctxP.newPage(); vigiar(pP, erros, 'D.6 loja perfil');
    await entrarPelaTela(pP, '/ee/et', dLoja1);
    await ir(pP, '/ee/et/loja/perfil', 2500);
    const campo = pP.getByTestId('perfil-telefone-comercial');
    ok('D.6b /loja/perfil tem o campo "telefone comercial" (perfil-telefone-comercial)', await visivel(campo));
    await campo.fill('+372 600 1234');
    await botao(pP, ET('lojaPerfil.salvarButton')).click();
    let row = null; for (let i = 0; i < 30 && !row; i++) { row = (await A.admin.from('fornecedores_contato').select('telefone').eq('fornecedor_tipo', 'loja').eq('fornecedor_id', lj1.id).maybeSingle()).data; if (!row) await sleep(300); }
    ok('D.6c salvar grava fornecedores_contato (loja, id, "+372 600 1234")', row?.telefone === '+372 600 1234', JSON.stringify(row));
    await pP.screenshot({ path: `${PRINTS}/ligado-loja-perfil-telefone-et-390.png`, fullPage: true });
    await ir(pP, '/ee/et/loja/perfil', 2500);
    ok('D.6d ao reabrir o perfil o telefone comercial vem preenchido', (await pP.getByTestId('perfil-telefone-comercial').inputValue().catch(() => '')) === '+372 600 1234');
    await ctxP.close();
    ok('D.6e loja 2 e compradora nao leem o telefone da loja 1 (select = so a propria linha)', ((await S.lj2.c.from('fornecedores_contato').select('*')).data || []).length === 0 && ((await S.comp.c.from('fornecedores_contato').select('*')).data || []).every((r) => r.fornecedor_id === ofComp.id));
    const { error: e1 } = await S.comp2.c.from('fornecedores_contato').insert({ fornecedor_tipo: 'loja', fornecedor_id: lj1.id, telefone: '+372 1' });
    const { error: e2 } = await S.comp2.c.from('fornecedores_contato').insert({ fornecedor_tipo: 'oficina', fornecedor_id: ofVend.id, telefone: '+372 1' });
    ok('D.6f ninguem grava telefone para fornecedor alheio', !!e1 && !!e2, `${e1?.message || 'gravou'} / ${e2?.message || 'gravou'}`);
    const { error: e3 } = await S.vend.c.from('fornecedores_contato').insert({ fornecedor_tipo: 'oficina', fornecedor_id: ofVend.id, telefone: '+372 600 9999' });
    ok('D.6g oficina vendedora grava o proprio (telefone de fornecimento)', !e3, e3?.message);
    const { error: e4 } = await S.vend.c.from('fornecedores_contato').update({ telefone: '+372 ' + '9'.repeat(40) }).eq('fornecedor_id', ofVend.id);
    ok('D.6h telefone com mais de 30 caracteres -> recusado (CHECK)', !!e4, e4?.message || 'gravou');
    await ir(pD, '/ee/et/oficina/perfil', 2500);
    ok('D.6i /oficina/perfil (interruptor ligado) tem o campo perfil-telefone-comercial', await visivel(pD.getByTestId('perfil-telefone-comercial')));
  });
  await ctxD.close(); // ultimo uso do contexto de 1280 da compradora

  // ======================= D.5: quantidade numeric (4,5 x 10 = 45) =======================
  await tentar('D.5', async () => {
    const id = cotOleo?.id; if (!id || !respOleoLj2) throw new Error('sem cotacao/oferta');
    const t5 = Date.now();
    const r = await A.confirmar(respOleoLj2, S.comp.token);
    ok('D.5a confirmar 4,5 litro x 10,00 -> 200', r.status === 200 && !!r.d.pedidoId, JSON.stringify(r));
    pedOleo = r.d.pedidoId || null;
    const ped = pedOleo ? (await A.admin.from('pedidos_pecas').select('preco_total, quantidade, status').eq('id', pedOleo).maybeSingle()).data : null;
    ok('D.5b pedidos_pecas: preco_total 45.00, quantidade 4.5', !!ped && Number(ped.preco_total) === 45 && Number(ped.quantidade) === 4.5, JSON.stringify(ped));
    const m = await A.esperarEmail(dLoja2.email, t5, (e) => /45[,.]00/.test(e.html), 40);
    ok('D.5c e-mail "pedido confirmado" da loja 2: total 45 e telefone COMERCIAL da compradora (+372 700 0001)', !!m && m.texto.includes('+372 700 0001') && !m.texto.includes(dComp.telefone), m?.assunto);
    const ctxL2 = await nav.contexto('chromium', 390, A.ip); const pL2 = await ctxL2.newPage(); vigiar(pL2, erros, 'D.5 loja2');
    await entrarPelaTela(pL2, '/ee/et', dLoja2);
    await ir(pL2, '/ee/et/loja/pedidos', 3500);
    const linha = pL2.getByTestId('pedido-loja').filter({ hasText: OLEO });
    const txt = await linha.innerText().catch(() => '');
    ok('D.5d /loja/pedidos mostra 4,5 (nao 4 nem 5) e o telefone comercial da compradora pela rota', (await linha.count()) === 1 && /(?<![\d,.])4[,.]5(?![\d,.])/.test(txt) && txt.includes('+372 700 0001'), txt.slice(0, 200));
    await pL2.screenshot({ path: `${PRINTS}/ligado-loja-pedidos-et-390.png`, fullPage: true });
    await ctxL2.close();
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    const card = cardCom(pM, OLEO);
    const esc = card.getByTestId('oferta-escolhida');
    ok('D.5e cartao da compradora: oferta escolhida com total na unidade (oferta-total com 45) e contato = telefone do perfil da loja 2 (sem comercial)', (await esc.count()) === 1 && /45/.test(await esc.getByTestId('oferta-total').innerText().catch(() => '')) && (await card.getByTestId('contato-fornecedor').innerText().catch(() => '')).includes(dLoja2.telefone));
    const ctxA = await nav.contexto('chromium', 1280, A.ip); const pA = await ctxA.newPage(); vigiar(pA, erros, 'D.5 admin');
    await entrarPelaTela(pA, '/br/pt', adm, '/admin/pecas');
    await ir(pA, '/admin/pecas', 4000);
    ok('D.5f /admin/pecas mostra "× 4,5" (ou 4.5) no pedido', /×\s*4[,.]5\b/.test(await pA.innerText('body')));
    await pA.screenshot({ path: `${PRINTS}/ligado-admin-pecas-1280.png`, fullPage: true });
    await ctxA.close();
  });

  // ======================= D.6 (parte 2): contato so no pedido confirmado =======================
  await tentar('D.6b', async () => {
    if (!pedPeca || !pedOleo) throw new Error('sem pedidos');
    const c1 = await A.contato([pedPeca, pedOleo], S.comp.token);
    ok('D.6j contato-pedido-peca (compradora): loja 1 = telefone COMERCIAL (+372 600 1234); loja 2 = telefone do perfil', c1.status === 200 && c1.d.contatos?.[pedPeca]?.telefone === '+372 600 1234' && c1.d.contatos?.[pedOleo]?.telefone === dLoja2.telefone, JSON.stringify(c1.d));
    const c2 = await A.contato([pedOleo], S.lj2.token);
    ok('D.6k contato-pedido-peca (loja 2): compradora = telefone COMERCIAL dela (+372 700 0001)', c2.status === 200 && c2.d.contatos?.[pedOleo]?.telefone === '+372 700 0001', JSON.stringify(c2.d));
    const c3 = await A.contato([pedPeca], S.lj2.token);
    ok('D.6l quem nao e parte do pedido nao recebe contato', c3.status === 200 && Object.keys(c3.d.contatos || {}).length === 0, JSON.stringify(c3.d));
    const card = cardCom(pM, cotD?.descricao || '');
    ok('D.6m cotacao aberta (sem pedido): nenhum contato de fornecedor no cartao da compradora', cotD && (await card.count()) === 1 && (await card.getByTestId('contato-fornecedor').count()) === 0);
    const cardP = cardCom(pM, PECA);
    ok('D.6n cartao da cotacao fechada com a loja 1: contato mostra o telefone comercial', (await cardP.getByTestId('contato-fornecedor').innerText().catch(() => '')).includes('+372 600 1234'));
  });

  // ======================= D.7: paridade teste/real nos dois sentidos =======================
  await tentar('D.7', async () => {
    const ve = async (s, id) => ((await s.c.from('cotacoes_pecas').select('id').eq('id', id)).data || []).length === 1;
    const cotReal = await A.cotacao(ofReal, 'Cotacao real'); // aberta/todos, dona real: ancora das listas reais
    ok('D.7a loja REAL e vendedora REAL nao leem cotacao de TESTE aberta (alvo todos); leem a real', !(await ve(S.ljReal, cotD.id)) && !(await ve(S.vendReal, cotD.id)) && (await ve(S.ljReal, cotReal.id)) && (await ve(S.vendReal, cotReal.id)));
    const ctxR = await nav.contexto('chromium', 390, A.ip); const pR = await ctxR.newPage(); vigiar(pR, erros, 'D.7 loja real');
    await entrarPelaTela(pR, '/ee/et', dLojaReal);
    await ir(pR, '/ee/et/loja/cotacoes', 3000);
    ok('D.7b /loja/cotacoes da loja real lista a cotacao real (ancora) e nada de teste', (await cartaoLoja(pR, cotReal.descricao).count()) === 1 && (await cartaoLoja(pR, cotD.descricao).count()) === 0 && (await cartaoLoja(pR, OLEO).count()) === 0);
    await ctxR.close();
    // positivo da rota de mensagem (par legitimo de teste): loja 1 -> compradora em cotD avisa (sino) e e-mail
    const t7 = Date.now();
    const { data: m0, error: em0 } = await A.admin.from('cotacoes_pecas_mensagens').insert({ cotacao_id: cotD.id, fornecedor_tipo: 'loja', fornecedor_id: lj1.id, remetente_id: dLoja1.id, texto: 'loja 1 -> compradora' }).select('id').single();
    if (em0) throw new Error('msg: ' + em0.message);
    const n0 = await A.notificarMensagem(m0.id, S.lj1.token);
    const aMsg = await A.esperarAviso(dComp.id, 'mensagem_peca', 20);
    const mMsg = await A.esperarEmail(dComp.email, t7, (m) => m.texto.includes(lj1.nome), 20);
    ok('D.7b2 notificar-mensagem-peca entre contas de TESTE -> 200 avisado:true; 1 sino mensagem_peca para a compradora (com cotacao_id) e e-mail com o nome da loja', n0.status === 200 && n0.d.avisado === true && aMsg.length === 1 && aMsg[0].dados?.cotacao_id === cotD.id && !!mMsg, `${JSON.stringify(n0)} sinos=${aMsg.length} email=${mMsg?.assunto || 'nenhum'}`);
    // mensagem de teste -> real (linha gravada pela service role, a RLS ja barra o cliente): a rota nao avisa
    const { data: m1, error: em1 } = await A.admin.from('cotacoes_pecas_mensagens').insert({ cotacao_id: cotD.id, fornecedor_tipo: 'loja', fornecedor_id: ljReal.id, remetente_id: dComp.id, texto: 'teste -> real' }).select('id').single();
    if (em1) throw new Error('msg: ' + em1.message);
    const n1 = await A.notificarMensagem(m1.id, S.comp.token);
    await sleep(1500);
    ok('D.7c notificar-mensagem-peca de compradora TESTE para loja REAL -> 200 avisado:false; sem sino e sem e-mail para a loja real', n1.status === 200 && n1.d.avisado === false && (await A.avisos(dLojaReal.id, 'mensagem_peca')).length === 0 && A.emailsDe(dLojaReal.email, t7).length === 0, JSON.stringify(n1));
    // inverso: cotacao real, loja de teste
    ok('D.7d loja de TESTE nao le cotacao REAL', !(await ve(S.lj1, cotReal.id)));
    await ir(pL1, '/ee/et/loja/cotacoes', 3000);
    ok('D.7e /loja/cotacoes da loja de teste lista a de teste (ancora) e nao lista a cotacao real', (await cartaoLoja(pL1, cotD.descricao).count()) === 1 && (await cartaoLoja(pL1, cotReal.descricao).count()) === 0);
    const n3 = await A.notificarFornecedores(cotReal.id, S.real.token);
    await A.esperarAviso(dLojaReal.id, 'cotacao_peca_disponivel', 20);
    await sleep(1500);
    ok('D.7f notificar-fornecedores da cotacao real (aberta): loja de teste e vendedora de teste nao recebem; loja real recebe', n3.status === 200 && (await A.avisos(dLoja1.id, 'cotacao_peca_disponivel')).filter((n) => n.dados?.cotacao_id === cotReal.id).length === 0 && (await A.avisos(dVend.id, 'cotacao_peca_disponivel')).filter((n) => n.dados?.cotacao_id === cotReal.id).length === 0 && (await A.avisos(dLojaReal.id, 'cotacao_peca_disponivel')).filter((n) => n.dados?.cotacao_id === cotReal.id).length === 1, JSON.stringify(n3));
    const { data: m2 } = await A.admin.from('cotacoes_pecas_mensagens').insert({ cotacao_id: cotReal.id, fornecedor_tipo: 'loja', fornecedor_id: lj1.id, remetente_id: dLoja1.id, texto: 'real <- teste' }).select('id').single();
    const n2 = await A.notificarMensagem(m2.id, S.lj1.token);
    await sleep(1500);
    ok('D.7g mensagem de loja TESTE em cotacao REAL -> avisado:false; compradora real sem sino/e-mail', n2.status === 200 && n2.d.avisado === false && (await A.avisos(dReal.id, 'mensagem_peca')).length === 0 && A.emailsDe(dReal.email, t7).length === 0, JSON.stringify(n2));
    const rid = await A.resposta(cotReal, lj1, { preco: 20, prazo: 1 });
    const rc = await A.confirmar(rid, S.real.token);
    await sleep(1500);
    ok('D.7h confirmar (compradora real) com oferta de loja de TESTE: pedido gravado, mas SEM sino/e-mail para a loja de teste (paridade)', rc.status === 200 && (await A.avisos(dLoja1.id, 'pedido_peca_confirmado')).filter((n) => n.dados?.cotacao_id === cotReal.id).length === 0 && A.emailsDe(dLoja1.email, t7).length === 0, JSON.stringify(rc));
    // notificar-fornecedores com expira_em no passado: ninguem e avisado
    const cotVencida = await A.cotacao(ofComp, 'Vencida sem aviso', { expira_em: horasAtras(1) });
    const tV = Date.now();
    const nV = await A.notificarFornecedores(cotVencida.id, S.comp.token);
    await sleep(1500);
    const sinosV = (await A.admin.from('notificacoes').select('id', { count: 'exact', head: true }).eq('tipo', 'cotacao_peca_disponivel').eq('dados->>cotacao_id', cotVencida.id)).count || 0;
    ok('D.7i notificar-fornecedores de cotacao com expira_em no passado -> 200, 0 lojas e 0 oficinas avisadas, nenhum sino nem e-mail', nV.status === 200 && nV.d.lojasNotificadas === 0 && nV.d.oficinasNotificadas === 0 && sinosV === 0 && A.emailsDe(dLoja1.email, tV).length === 0 && A.emailsDe(dVend.email, tV).length === 0, JSON.stringify(nV));
    // realtime: a RLS da cotacoes_pecas_select vale para postgres_changes - a loja REAL nao recebe o INSERT de teste
    const assinar = (c, nome) => new Promise((res) => {
      let n = 0;
      const ch = c.channel(`rt-${nome}-${A.tag}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cotacoes_pecas' }, () => n++);
      const timer = setTimeout(() => res({ ch, conta: () => n, assinou: false }), 10000);
      ch.subscribe((st) => { if (st === 'SUBSCRIBED') { clearTimeout(timer); res({ ch, conta: () => n, assinou: true }); } });
    });
    const rtReal = await assinar(S.ljReal.c, 'real'), rtTeste = await assinar(S.lj1.c, 'teste');
    await A.cotacao(ofComp, 'Realtime');
    await sleep(3000);
    ok('D.7j realtime: loja REAL nao recebe o evento da cotacao de teste (0); loja de teste recebe (1, ancora)', rtReal.assinou && rtTeste.assinou && rtReal.conta() === 0 && rtTeste.conta() === 1, `assinou=${rtReal.assinou}/${rtTeste.assinou} eventos real=${rtReal.conta()} teste=${rtTeste.conta()}`);
    await S.ljReal.c.removeChannel(rtReal.ch).catch(() => {}); await S.lj1.c.removeChannel(rtTeste.ch).catch(() => {});
  });

  // ======================= D.8: GET /api/pecas-v3 e interruptor do admin =======================
  await tentar('D.8', async () => {
    const g = async (s) => A.pecasV3(s?.token);
    const g0 = await g(null); ok(`D.8a GET ${ROTA_INTERRUPTOR} sem sessao -> 401`, g0.status === 401, JSON.stringify(g0));
    ok('D.8b global desligado: conta real false; contas de teste (oficina e loja) true; loja real false', (await g(S.real)).d.ativo === false && (await g(S.comp)).d.ativo === true && (await g(S.lj1)).d.ativo === true && (await g(S.ljReal)).d.ativo === false);
    const cotReal2 = await A.cotacao(ofReal, 'Real aberta antiga', { expira_em: horasAtras(48) });
    const antes = (await A.admin.from('admin_auditoria').select('id', { count: 'exact', head: true }).eq('admin_id', adm.id)).count || 0;
    const p1 = await A.adminInterruptor(true, S.adm.token);
    ok(`D.8c PATCH ${ROTA_ADMIN_INTERRUPTOR} {ativo:true} -> 200 {ativo:true}; banco true`, p1.status === 200 && p1.d.ativo === true && A.interruptorEstado() === true, JSON.stringify(p1));
    const { data: aud } = await A.admin.from('admin_auditoria').select('entidade, entidade_id, acao, antes, depois').eq('admin_id', adm.id).order('created_at', { ascending: false }).limit(1);
    ok("D.8d linha de auditoria: entidade plataforma_config, entidade_id NULL (a coluna e uuid), acao pecas_v3_ativo, antes false -> depois true", (aud || []).length === 1 && aud[0].entidade === 'plataforma_config' && aud[0].entidade_id === null && aud[0].acao === 'pecas_v3_ativo' && aud[0].antes?.pecas_v3_ativo === false && aud[0].depois?.pecas_v3_ativo === true, JSON.stringify(aud));
    const c2 = await A.cotacaoNoBanco(cotReal2.id);
    ok('D.8e ao ligar, expira_em das abertas/respondidas estendido para >= agora + 7 dias (ninguem expira na hora seguinte)', new Date(c2.expira_em) - Date.now() > 7 * DIA_MS - 300e3, c2.expira_em);
    ok('D.8f global ligado: conta real e loja real -> true', (await g(S.real)).d.ativo === true && (await g(S.ljReal)).d.ativo === true);
    const r1 = await A.tarefa();
    ok('D.8g tarefa logo depois de ligar: a real estendida NAO expira', r1.status === 200 && (await A.cotacaoNoBanco(cotReal2.id))?.status === 'aberta', JSON.stringify(r1));
    await A.admin.from('cotacoes_pecas').update({ expira_em: horasAtras(1) }).eq('id', cotReal2.id);
    const r2 = await A.tarefa();
    ok('D.8h com o global ligado a tarefa expira cotacao REAL vencida e avisa a dona', r2.status === 200 && r2.d.expiradas >= 1 && (await A.cotacaoNoBanco(cotReal2.id))?.status === 'expirada' && (await A.esperarAviso(dReal.id, TIPO_AVISO_EXPIRADA, 10)).length === 1, JSON.stringify(r2));
    const p2 = await A.adminInterruptor(false, S.adm.token);
    const depois = (await A.admin.from('admin_auditoria').select('id', { count: 'exact', head: true }).eq('admin_id', adm.id)).count || 0;
    ok('D.8i PATCH {ativo:false} -> 200; 2 linhas de auditoria; conta real volta a false', p2.status === 200 && p2.d.ativo === false && depois - antes === 2 && (await g(S.real)).d.ativo === false, JSON.stringify(p2));
    const p3 = await A.adminInterruptor('sim', S.adm.token), p4 = await A.adminInterruptor(true, S.comp.token), p5 = await A.adminInterruptor(true, null);
    ok('D.8j ativo nao booleano 400; nao admin 403; sem sessao 401; banco continua false', p3.status === 400 && p4.status === 403 && p5.status === 401 && A.interruptorEstado() === false, `${p3.status}/${p4.status}/${p5.status}`);
    const gA = await A.api('GET', ROTA_ADMIN_INTERRUPTOR, undefined, S.adm.token);
    ok(`D.8k GET ${ROTA_ADMIN_INTERRUPTOR} -> {ativo:false}`, gA.status === 200 && gA.d.ativo === false, JSON.stringify(gA));
    // tela do admin
    const ctxA = await nav.contexto('chromium', 1280, A.ip); const pA = await ctxA.newPage(); vigiar(pA, erros, 'D.8 admin');
    await entrarPelaTela(pA, '/br/pt', adm, '/admin/pecas');
    await ir(pA, '/admin/pecas', 4000);
    const sw = pA.getByTestId('pecas-v3-interruptor');
    ok('D.8l /admin/pecas: interruptor (role switch) visivel, aria-checked=false', await visivel(sw) && (await sw.getAttribute('aria-checked')) === 'false');
    await sw.click();
    let ligado = false; for (let i = 0; i < 30 && !ligado; i++) { ligado = A.interruptorEstado() === true; if (!ligado) await sleep(300); }
    ok('D.8m clicar liga no banco e grava auditoria (3a linha)', ligado && ((await A.admin.from('admin_auditoria').select('id', { count: 'exact', head: true }).eq('admin_id', adm.id)).count || 0) - antes === 3);
    await pA.waitForTimeout(800);
    ok('D.8n aria-checked=true depois do clique', (await sw.getAttribute('aria-checked')) === 'true');
    await pA.screenshot({ path: `${PRINTS}/ligado-admin-interruptor-1280.png`, fullPage: true });
    await sw.click();
    let desligado = false; for (let i = 0; i < 30 && !desligado; i++) { desligado = A.interruptorEstado() === false; if (!desligado) await sleep(300); }
    ok('D.8o clicar de novo desliga', desligado);
    await ctxA.close();
  });

  // ======================= D.9: i18n nos 6 idiomas =======================
  await tentar('D.9', async () => {
    const todas = Object.fromEntries(IDIOMAS.map((l) => [l, mensagens(l)]));
    const faltam = [];
    for (const l of IDIOMAS) for (const k of CHAVES_I18N) { const v = pegaChave(todas[l], k); if (typeof v !== 'string' || !v.trim()) faltam.push(`${l}:${k}`); }
    ok(`D.9a as ${CHAVES_I18N.length} chaves novas (namespace pecas.*) nos 6 idiomas, nao vazias`, faltam.length === 0, faltam.join(', '));
    const iguais = CHAVES_I18N_TEXTO.filter((k) => pegaChave(todas.et, k) === pegaChave(todas.pt, k) || pegaChave(todas.ru, k) === pegaChave(todas.pt, k));
    ok('D.9b ET e RU traduzidos de verdade (nenhuma chave de texto igual ao PT)', iguais.length === 0, iguais.join(', '));
    ok('D.9c pecas.expiraEm usa {dias} (ICU) nos 6 idiomas', IDIOMAS.every((l) => /\{dias/.test(String(pegaChave(todas[l], 'pecas.expiraEm')))), IDIOMAS.map((l) => pegaChave(todas[l], 'pecas.expiraEm')).join(' | '));
    let saida = '', okChk = true;
    try { saida = execSync(`node "${path.join(WEB, 'scripts/checar-traducoes.mjs')}"`, { cwd: WEB }).toString(); } catch (e) { okChk = false; saida = String(e.stdout || e.message); }
    ok('D.9d checar-traducoes.mjs passa', okChk, saida.slice(-300));
    // varredura das 2 telas nos 6 idiomas (celular) com cotacao sem carro aberta
    const cS = await A.cotacao(ofComp, 'Varredura sem carro', { tipo: 'sem_carro', quantidade: 2.5, unidade: 'kg', fipe_marca: null, fipe_modelo: null, fipe_ano: null });
    const ctxI = await nav.contexto('chromium', 390, A.ip); const pI = await ctxI.newPage(); vigiar(pI, erros, 'D.9 oficina');
    await entrarPelaTela(pI, '/ee/et', dComp);
    const ctxJ = await nav.contexto('chromium', 390, A.ip); const pJ = await ctxJ.newPage(); vigiar(pJ, erros, 'D.9 loja');
    await entrarPelaTela(pJ, '/ee/et', dLoja1);
    for (const l of IDIOMAS) {
      const T = tradutor(l);
      await ir(pI, `${PREFIXO[l]}/oficina/pecas`, 2500);
      await botao(pI, T('oficinaPecas.novaCotacao')).click().catch(() => {});
      await pI.getByTestId('cotacao-tipo-carro').waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
      const corpoO = await pI.innerText('body');
      const cardS = cardCom(pI, cS.descricao);
      const qvS = await cardS.getByTestId('cotacao-quantidade-valor').innerText().catch(() => '');
      ok(`D.9e [${l}] /oficina/pecas (formulario novo + cartao sem carro 2,5 kg): sem chave crua, "2,5 <kg>" inteiro, sem rolagem lateral`, semChaveCrua(corpoO) && (await pI.getByTestId('cotacao-unidade').count()) === 1 && quantidadeComUnidade(qvS, '2[,.]5', T('pecas.unidades.kg')) && await semRolagemLateral(pI), (corpoO.match(/\?\?[a-zA-Z.]+|\bpecas\.[a-zA-Z.]+|undefined|\{dias\}/g)?.join(',') || '') + ` qv="${qvS}"`);
      if (l === 'ru' || l === 'et') await pI.screenshot({ path: `${PRINTS}/ligado-oficina-pecas-${l}-390.png`, fullPage: true });
      await ir(pJ, `${PREFIXO[l]}/loja/cotacoes`, 2500);
      const corpoL = await pJ.innerText('body');
      const cardL = cartaoLoja(pJ, cS.descricao);
      ok(`D.9f [${l}] /loja/cotacoes (cartao sem carro): sem chave crua, selo "sem carro" traduzido, sem rolagem lateral`, semChaveCrua(corpoL) && (await cardL.getByTestId('cotacao-sem-carro').innerText().catch(() => '')).trim() === T('pecas.semCarro') && await semRolagemLateral(pJ), corpoL.match(/\?\?[a-zA-Z.]+|\bpecas\.[a-zA-Z.]+|undefined/g)?.join(',') || '');
      if (l === 'ru') await pJ.screenshot({ path: `${PRINTS}/ligado-loja-cotacoes-${l}-390.png`, fullPage: true });
    }
    await ctxI.close(); await ctxJ.close();
  });

  await ctxL1.close(); await ctxM.close(); // ctxW/WebKit, ctxV e ctxD ja fechados no ultimo uso
  ok('sem erro de pagina nos navegadores', erros.length === 0, erros.join(' | '));
} catch (e) {
  ok('excecao geral', false, e?.stack || e?.message);
} finally {
  await nav.fechar();
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  ok('limpeza: nada desta rodada ficou no banco nem na pasta de e-mails; interruptor global restaurado', errosLimpeza.length === 0 && sobras.length === 0, [...errosLimpeza, ...sobras].join(' | '));
  process.exitCode = fim() ? 1 : 0;
}
