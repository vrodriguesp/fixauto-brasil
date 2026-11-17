// E2E LOCAL do lote 2 de pecas com o interruptor LIGADO (fase D do plano, Fable_auditoria_mapa_lote2.md
// secao 8, blocos D.1-D.12; contrato final da mesma auditoria + Contrato_testids_lote2.md).
// Interruptor GLOBAL desligado: as contas sao `conta_teste` (tela nova pela sessao); contas reais so para
// a paridade e para o global ligado->desligado (D.10). Antes da implementacao este script FALHA (esperado).
//   D.0 migracao 092 | D.1 urgencia: hoje/amanha = e-mail imediato com "nao tenho"; sem pressa = so sino + fila
//   D.2 teto de 30 imediatos por loja por dia (Tallinn) | D.3 resumo: slots, exclusoes, reserva/falha, limpeza, DST
//   D.4 "nao tenho" pelo painel (RLS) | D.5 "nao tenho" pelo e-mail (/n/<token>, ver nao age, uso unico, 410/409/429)
//   D.6 IVA por oferta (registrado / nao registrado / margem / sem perfil) | D.7 quantidade ofertada
//   D.8 reabrir re-avisa so quem nao respondeu nem dispensou | D.9 "pedir peca" pre-preenche pela URL
//   D.10 L2.6 (tarefa de vencer com 600 reais + 1 teste; global on->off; funcionario; placa normalizada)
//   D.11 paridade | D.12 i18n (6 idiomas: chaves, pagina /n, e-mails imediato e resumo)
// Exige TAREFAS_SIMULAR_HORA=1 no .env.local do site (hora injetada na tarefa de resumo).
// Ctrl+C limpa (e restaura a pasta de e-mails se estiver bloqueada). Nao rodar junto com as outras suites
// (mesma pasta de e-mails e mesmo interruptor) nem entre 23:55 e 00:05 Europe/Tallinn (teto diario vira a meia-noite).
//   node pecas-v3-lote2.mjs [<.env.local>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { lerEnv, ambienteL2, abrirNavegadores, contador, tradutor, mensagens, pegaChave, IDIOMAS, PREFIXO, SITE, WEB, RAIZ, ENV_PADRAO, siteNoAr, semRolagemLateral, vigiar, entrarPelaTela, ir, visivel, semChaveCrua, botao, PRINTS, sleep, horasAtras, DIA_MS, psql, semTestidsNovosL2, CHAVES_I18N_L2, CHAVES_I18N_L2_TEXTO, URGENCIAS, MOTIVOS_NAO_TENHO, TETO_IMEDIATOS_DIA, SLUG_NAO_TENHO, ROTA_RESUMO, ROTA_NAO_TENHO_EMAIL, ROTA_REABRIR, ROTA_TAREFA, TOKEN_RE, tokensNaoTenho, linksNeutros, semSlugPortugues, tallinnEmUtc, meiaNoiteTallinn, proximoDiaUtilTallinn, slotDe, pastaEmailsBloqueada } from './pecas-v3-lote2-lib.mjs';

const env = lerEnv(process.argv[2] || ENV_PADRAO);
if (!(await siteNoAr())) { console.log(`FALHA site local nao responde em ${SITE} - nada rodou (nao inicio o site sozinho)`); process.exit(2); }
const A = ambienteL2(env);
const { ok, fim, tentar } = contador();
const ET = tradutor('et');
const erros = [];
const nav = await abrirNavegadores(true);
A.limparAoInterromper(nav.fechar);
const cardCom = (p, texto) => p.getByTestId('cotacao-peca').filter({ hasText: texto });
const cartaoLoja = (p, texto) => p.locator('div.card').filter({ hasText: texto });
const PLACA = '123ABC';
// as 3 placas da rodada: Q1 (123ABC), pedido do motorista de teste (TA1234, entra na cotacao "Pelo pedido"), motorista real (RE9999)
const semPlaca = (s) => !/123\s?ABC|TA\s?1234|RE\s?9999/i.test(String(s));
const semPlaceholder = (s) => !/\?\?[a-zA-Z]|\{[a-zA-Z]+\}|\bundefined\b|\bNaN\b|\bpecas\.[a-zA-Z]/.test(String(s));
const t0 = Date.now();
const DIA1 = proximoDiaUtilTallinn(new Date(), 1);
const DIA2 = proximoDiaUtilTallinn(new Date(), 2);
const emailDe = (d, depois, texto, tentativas = 40) => A.esperarEmail(d.email, depois, (e) => e.html.includes(texto), tentativas);

try {
  // ======================= D.0: migracao 092 =======================
  await tentar('D.0', async () => {
    const urg = psql("select data_type||':'||is_nullable||':'||coalesce(column_default,'') from information_schema.columns where table_name='cotacoes_pecas' and column_name='urgencia'");
    const chkC = psql("select string_agg(pg_get_constraintdef(oid), ' | ') from pg_constraint where conrelid='cotacoes_pecas'::regclass and contype='c'");
    ok("D.0a cotacoes_pecas.urgencia text NULL SEM default, CHECK (NULL ou hoje/amanha/sem_pressa)", urg === 'text:YES:' && /urgencia/.test(chkC) && /sem_pressa/.test(chkC) && /IS NULL/.test(chkC), `${urg} | ${chkC.slice(0, 200)}`);
    ok('D.0b cotacoes_pecas SEM solicitacao_id', !A.colunaExiste('cotacoes_pecas', 'solicitacao_id'));
    const colsR = psql("select string_agg(column_name||':'||data_type, ',' order by column_name) from information_schema.columns where table_name='cotacoes_pecas_respostas' and column_name in ('quantidade_ofertada','iva_pct','iva_modo')");
    const chkR = psql("select string_agg(conname||'='||pg_get_constraintdef(oid), ' | ') from pg_constraint where conrelid='cotacoes_pecas_respostas'::regclass and contype='c'");
    ok('D.0c respostas: quantidade_ofertada numeric, iva_pct numeric, iva_modo text + CHECKs (9999, 100, margem) + respostas_iva_coerente', /iva_modo:text/.test(colsR) && /iva_pct:numeric/.test(colsR) && /quantidade_ofertada:numeric/.test(colsR) && /9999/.test(chkR) && /100/.test(chkR) && /margem/.test(chkR) && /respostas_iva_coerente=/.test(chkR), `${colsR} | ${chkR.slice(0, 300)}`);
    const colsF = psql("select string_agg(table_name||'.'||column_name||':'||data_type||':'||coalesce(column_default,''), ',' order by 1) from information_schema.columns where table_name in ('lojas_pecas','oficinas') and column_name in ('iva_registrado','iva_pct','regime_margem_usadas')");
    ok('D.0d lojas_pecas e oficinas: iva_registrado boolean, iva_pct numeric, regime_margem_usadas boolean default false', ['lojas_pecas', 'oficinas'].every((t) => colsF.includes(`${t}.iva_registrado:boolean`) && colsF.includes(`${t}.iva_pct:numeric`) && colsF.includes(`${t}.regime_margem_usadas:boolean:false`)), colsF);
    const pkD = psql("select pg_get_constraintdef(oid) from pg_constraint where conrelid='cotacoes_pecas_dispensas'::regclass and contype='p'");
    const polD = psql("select string_agg(polname||':'||polcmd, ',' order by polname) from pg_policy where polrelid='cotacoes_pecas_dispensas'::regclass");
    const chkD = psql("select string_agg(pg_get_constraintdef(oid), ' | ') from pg_constraint where conrelid='cotacoes_pecas_dispensas'::regclass and contype='c'");
    ok('D.0e cotacoes_pecas_dispensas: PK (cotacao_id, fornecedor_tipo, fornecedor_id), RLS, politicas select/insert/delete (sem update), CHECK motivo/origem, indice profile_id, fora do realtime, sem visto_em', A.tabelaExiste('cotacoes_pecas_dispensas') && /cotacao_id, fornecedor_tipo, fornecedor_id/.test(pkD) && psql("select relrowsecurity from pg_class where relname='cotacoes_pecas_dispensas'") === 't' && /cotacoes_pecas_dispensas_select:r/.test(polD) && /cotacoes_pecas_dispensas_insert:a/.test(polD) && /cotacoes_pecas_dispensas_delete:d/.test(polD) && !/:w/.test(polD) && /sem_estoque/.test(chkD) && /'email'/.test(chkD) && Number(psql("select count(*) from pg_indexes where tablename='cotacoes_pecas_dispensas' and indexdef ilike '%(profile_id)%'")) >= 1 && psql("select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename in ('cotacoes_pecas_dispensas','avisos_email_pecas','pecas_links_email')") === '0' && !A.colunaExiste('cotacoes_pecas_dispensas', 'visto_em'), `${pkD} | ${polD} | ${chkD.slice(0, 200)}`);
    const colsA = psql("select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_name='avisos_email_pecas'");
    const uniA = psql("select string_agg(pg_get_constraintdef(oid), ' | ') from pg_constraint where conrelid='avisos_email_pecas'::regclass and contype='u'");
    const chkA = psql("select string_agg(pg_get_constraintdef(oid), ' | ') from pg_constraint where conrelid='avisos_email_pecas'::regclass and contype='c'");
    ok('D.0f avisos_email_pecas: colunas do contrato (+ reaberta int default 0), UNIQUE (profile_id, cotacao_id, reaberta), tipo imediato/resumo, motivo sem_pressa/teto (sem fora_do_horario), RLS SEM politica', A.tabelaExiste('avisos_email_pecas') && ['id', 'profile_id', 'cotacao_id', 'fornecedor_tipo', 'tipo', 'motivo', 'criado_em', 'enviado_em', 'slot', 'tentativas', 'erro', 'reaberta'].every((c) => colsA.split(',').includes(c)) && /\(profile_id, cotacao_id, reaberta\)/.test(uniA) && /resumo/.test(chkA) && /teto/.test(chkA) && !/fora_do_horario/.test(chkA) && psql("select relrowsecurity from pg_class where relname='avisos_email_pecas'") === 't' && psql("select count(*) from pg_policy where polrelid='avisos_email_pecas'::regclass") === '0', `${colsA} | ${uniA} | ${chkA}`);
    const colsL = psql("select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_name='pecas_links_email'");
    ok('D.0g pecas_links_email: colunas do contrato, token_hash UNIQUE, indice expira_em, RLS SEM politica', A.tabelaExiste('pecas_links_email') && ['id', 'token_hash', 'profile_id', 'cotacao_id', 'fornecedor_tipo', 'fornecedor_id', 'expira_em', 'usado_em', 'criado_em'].every((c) => colsL.split(',').includes(c)) && Number(psql("select count(*) from pg_indexes where tablename='pecas_links_email' and indexdef ilike '%token_hash%' and indexdef ilike '%unique%'")) >= 1 && Number(psql("select count(*) from pg_indexes where tablename='pecas_links_email' and indexdef ilike '%expira_em%'")) >= 1 && psql("select relrowsecurity from pg_class where relname='pecas_links_email'") === 't' && psql("select count(*) from pg_policy where polrelid='pecas_links_email'::regclass") === '0', colsL);
    const pI = A.politica('fornecedores_contato', 'fornecedores_contato_insert'), pU = A.politica('fornecedores_contato', 'fornecedores_contato_update');
    ok('D.0h fornecedores_contato_insert/update: ramo da oficina pelo dono (profile_id = auth.uid()), sem minhas_oficinas()', /profile_id/.test(pI) && !/minhas_oficinas/.test(pI) && /profile_id/.test(pU) && !/minhas_oficinas/.test(pU), `${pI.slice(0, 160)} | ${pU.slice(0, 160)}`);
    ok('D.0i nada de push_inscricoes', !A.tabelaExiste('push_inscricoes'));
    const fontesTarefa = ['src/app/api/tarefas/resumo-cotacoes-pecas/route.ts', 'src/lib/resumo-cotacoes-pecas.ts'].map((f) => path.join(WEB, f)).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    ok("D.0i2 a tarefa de resumo so honra { agora } com process.env.TAREFAS_SIMULAR_HORA === '1' (guarda estatica no fonte)", /TAREFAS_SIMULAR_HORA\s*===\s*'1'/.test(fontesTarefa), fontesTarefa ? 'guarda nao encontrada no fonte' : 'rota/lib do resumo nao existe');
    const arqs = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((f) => /^092_.*\.sql$/.test(f));
    let okIdem = arqs.length === 1, saida = arqs.join(',') || 'sem arquivo 092_*.sql';
    if (okIdem) {
      const sql = fs.readFileSync(path.join(RAIZ, 'supabase/migrations', arqs[0]), 'utf8');
      if (/^\s*(COMMIT|END)\s*;/im.test(sql)) { okIdem = false; saida = 'COMMIT/END de topo: o rollback do teste nao desfaria'; }
      else { try { psql(`BEGIN;\n${sql}\nROLLBACK;`); } catch (e) { okIdem = false; saida = String(e.stderr || e.message).slice(0, 300); } }
    }
    ok('D.0j migracao 092 existe, sem COMMIT de topo, idempotente (roda de novo numa transacao desfeita)', okIdem, saida);
    const tipos = fs.readFileSync(path.join(RAIZ, 'packages/shared/types/index.ts'), 'utf8');
    ok('D.0k packages/shared: urgencia, quantidade_ofertada, iva_modo nos tipos', /urgencia\??:/.test(tipos) && /quantidade_ofertada\??:/.test(tipos) && /iva_modo\??:/.test(tipos));
    ok('D.0l TAREFAS_SIMULAR_HORA=1 no .env.local (hora injetada so no ambiente local)', A.temSimulacao, 'acrescente TAREFAS_SIMULAR_HORA=1 ao apps/web/.env.local e reinicie o site :3100');
  });

  // ======================= contas =======================
  const dComp = await A.conta('oficina', 'compradora', { contaTeste: true }); const ofComp = await A.oficina(dComp, 'Compradora', { km: 0 });
  const dComp2 = await A.conta('oficina', 'compradora2', { contaTeste: true }); const ofComp2 = await A.oficina(dComp2, 'Compradora 2', { km: 0.3 });
  const dComp3 = await A.conta('oficina', 'compradora3', { contaTeste: true }); const ofComp3 = await A.oficina(dComp3, 'Compradora 3', { km: 0.5 });
  const dComp4 = await A.conta('oficina', 'compradora4', { contaTeste: true }); const ofComp4 = await A.oficina(dComp4, 'Compradora 4', { km: 0.4 }); // so para o teto (limite 20/h da rota por compradora)
  const dLoja1 = await A.conta('loja_pecas', 'loja1', { contaTeste: true }); const lj1 = await A.loja(dLoja1, 'Loja 1');
  const dLoja2 = await A.conta('loja_pecas', 'loja2', { contaTeste: true }); const lj2 = await A.loja(dLoja2, 'Loja 2');
  const dLoja3 = await A.conta('loja_pecas', 'loja3', { contaTeste: true }); const lj3 = await A.loja(dLoja3, 'Loja 3');
  const dLojaInat = await A.conta('loja_pecas', 'loja-inativa', { contaTeste: true }); const ljInat = await A.loja(dLojaInat, 'Loja inativa', { ativa: false });
  const dVend = await A.conta('oficina', 'vendedora', { contaTeste: true }); const ofVend = await A.oficina(dVend, 'Vendedora', { km: 2, vendePecas: true });
  const dLojaReal = await A.conta('loja_pecas', 'loja-real'); const ljReal = await A.loja(dLojaReal, 'Loja real');
  const dReal = await A.conta('oficina', 'compradora-real'); const ofReal = await A.oficina(dReal, 'Compradora real', { km: 0.6 });
  const cliTeste = await A.cliente('motorista-teste', { contaTeste: true }); const solTeste = await A.solicitacao(cliTeste, { placa: 'TA1234' });
  const cliReal = await A.cliente('motorista-real'); const solReal = await A.solicitacao(cliReal, { placa: 'RE9999' });
  const func = await A.funcionario(ofComp, 'funcionario');
  const S = {};
  for (const [k, u] of Object.entries({ comp: dComp, comp2: dComp2, comp3: dComp3, comp4: dComp4, lj1: dLoja1, lj2: dLoja2, lj3: dLoja3, ljInat: dLojaInat, vend: dVend, ljReal: dLojaReal, real: dReal, func })) S[k] = await A.sessao(u);
  { const e = await A.interruptor(false); ok('D.0s interruptor global desligado para a rodada (contas de teste veem a tela nova pela sessao)', !e && A.interruptorEstado() === false, e?.message); }
  const PECA1 = `Esipiduriklotsid ${A.tag}`, PECA2 = `Õhufilter ${A.tag}`, PECA3 = `Generaator ${A.tag}`;
  let Q1 = null, Q2 = null, Q3 = null, tokQ1lj1 = null, tokQ1lj3 = null, tokQ3lj2 = null, tokQ3lj3 = null, tokQ2lj1 = null, R1 = null, R2 = null;
  const quoteHoje = async (of, desc, extra = {}) => A.cotacao(of, desc, { urgencia: 'hoje', alvo: 'so_lojas', ...extra });
  const resposta = (s, cot, loja, extra = {}) => s.c.from('cotacoes_pecas_respostas').insert({ cotacao_id: cot.id, fornecedor_tipo: 'loja', loja_id: loja.id, preco: 10, prazo_dias: 1, ...extra });
  const marcar = (p, t) => p.getByTestId(t).check({ force: true });

  // ======================= D.1: urgencia =======================
  const ctxW = await nav.contexto('webkit', 390, A.ip); const pW = await ctxW.newPage(); vigiar(pW, erros, 'D.1 webkit');
  const t1 = Date.now();
  await tentar('D.1', async () => {
    await entrarPelaTela(pW, '/ee/et', dComp);
    await ir(pW, '/ee/et/oficina/pecas', 2500);
    await botao(pW, ET('oficinaPecas.novaCotacao')).click();
    await pW.getByTestId('cotacao-tipo-carro').waitFor({ state: 'attached' });
    ok('D.1a formulario novo com os 3 radios de urgencia (cotacao-urgencia-hoje/amanha/sem-pressa), padrao "sem pressa"', (await pW.getByTestId('cotacao-urgencia-hoje').count()) === 1 && (await pW.getByTestId('cotacao-urgencia-amanha').count()) === 1 && (await pW.getByTestId('cotacao-urgencia-sem-pressa').count()) === 1 && await pW.getByTestId('cotacao-urgencia-sem-pressa').isChecked() && !(await pW.getByTestId('cotacao-urgencia-hoje').isChecked()));
    await pW.locator('#c8551-1').fill(PECA1);
    await pW.locator('#c8551-2').fill('Volkswagen'); await pW.locator('#c8551-3').fill('Passat'); await pW.locator('#c8551-4').fill('2012');
    await pW.getByTestId('cotacao-quantidade').fill('2');
    await pW.getByTestId('cotacao-placa').fill('123 abc');
    await marcar(pW, 'cotacao-alvo-so-lojas'); // a vendedora (2 km, vende) nao entra em Q1
    await marcar(pW, 'cotacao-urgencia-hoje');
    ok('D.1b WebKit 390 sem rolagem lateral com urgencia', await semRolagemLateral(pW));
    await pW.screenshot({ path: `${PRINTS}/lote2-criar-urgencia-et-webkit-390.png`, fullPage: true });
    await botao(pW, ET('oficinaPecas.enviarCotacao')).click();
    let c = null; for (let i = 0; i < 40 && !c; i++) { c = (await A.admin.from('cotacoes_pecas').select('*').eq('oficina_id', ofComp.id).eq('peca_descricao', PECA1).maybeSingle()).data; if (!c) await sleep(300); }
    Q1 = c ? { id: c.id, descricao: PECA1, expira_em: c.expira_em } : null;
    ok("D.1c cotacao gravada com urgencia 'hoje' (carro, 2 un, placa)", !!c && c.urgencia === 'hoje' && c.tipo === 'carro' && (await A.admin.from('cotacoes_pecas_placa').select('placa').eq('cotacao_id', c.id).maybeSingle()).data?.placa === PLACA, JSON.stringify(c));
    const m1 = await emailDe(dLoja1, t1, PECA1, 60);
    const toks = m1 ? tokensNaoTenho(m1.html) : [];
    ok('D.1d loja 1 recebe o e-mail IMEDIATO com urgencia (data-campo="urgencia"), "aberta ate" (data-campo="aberta-ate") e UM botao "Nao tenho" /n/<43>?o=et (data-campo="nao-tenho"); sem placa; sem slug em portugues', !!m1 && /data-campo="urgencia"/.test(m1.html) && /data-campo="aberta-ate"/.test(m1.html) && /data-campo="nao-tenho"/.test(m1.html) && toks.length === 1 && toks[0].idioma === 'et' && TOKEN_RE.test(toks[0].token) && semPlaca(m1.html) && semSlugPortugues(m1.html), m1 ? `tokens=${toks.length}` : 'sem e-mail');
    tokQ1lj1 = toks[0]?.token || null;
    const tk = tokQ1lj1 ? await A.tokenNoBanco(tokQ1lj1) : null;
    ok('D.1e pecas_links_email: token preso a (loja 1, Q1), expira_em = expira_em da cotacao, usado_em NULL (hash sha256("naotenho:" + token))', !!tk && tk.profile_id === dLoja1.id && tk.cotacao_id === Q1?.id && tk.fornecedor_tipo === 'loja' && tk.fornecedor_id === lj1.id && !tk.usado_em && Math.abs(new Date(tk.expira_em) - new Date(Q1?.expira_em)) < 120e3, JSON.stringify(tk));
    const fila = await A.avisosEmail({ cotacao_id: Q1?.id });
    const l1 = fila.find((r) => r.profile_id === dLoja1.id);
    ok("D.1f avisos_email_pecas: lojas 1-3 com tipo 'imediato', motivo NULL, enviado_em preenchido; vendedora nao (so lojas)", !!l1 && l1.tipo === 'imediato' && l1.motivo === null && !!l1.enviado_em && [dLoja2.id, dLoja3.id].every((id) => fila.some((r) => r.profile_id === id && r.tipo === 'imediato')) && !fila.some((r) => r.profile_id === dVend.id), JSON.stringify(fila).slice(0, 300));
    const m3 = await emailDe(dLoja3, t1, PECA1, 20);
    tokQ1lj3 = m3 ? tokensNaoTenho(m3.html)[0]?.token || null : null;
    ok('D.1g cada loja recebe o PROPRIO token (loja 3 diferente da loja 1)', !!tokQ1lj3 && tokQ1lj3 !== tokQ1lj1);
    const n1 = await A.notificarFornecedores(Q1.id, S.comp.token);
    ok('D.1h chamar notificar-fornecedores de novo: resposta de hoje + emailsImediatos/naFila (0 e 0: ninguem avisado 2x)', n1.status === 200 && n1.d.success === true && n1.d.emailsImediatos === 0 && n1.d.naFila === 0 && (await A.tokensEmail({ cotacao_id: Q1.id })).length === 3, JSON.stringify(n1));
  });
  await ctxW.close(); await nav.fecharWebkit();

  const ctxD = await nav.contexto('chromium', 1280, A.ip); const pD = await ctxD.newPage(); vigiar(pD, erros, 'D.1 1280');
  await tentar('D.1b', async () => {
    await entrarPelaTela(pD, '/ee/et', dComp);
    await ir(pD, '/ee/et/oficina/pecas', 2500);
    await botao(pD, ET('oficinaPecas.novaCotacao')).click();
    await pD.getByTestId('cotacao-tipo-carro').waitFor({ state: 'attached' });
    await pD.locator('#c8551-1').fill(PECA2);
    await marcar(pD, 'cotacao-tipo-sem-carro');
    await pD.getByTestId('cotacao-quantidade').fill('1');
    await marcar(pD, 'cotacao-alvo-so-lojas');
    const t2 = Date.now();
    await botao(pD, ET('oficinaPecas.enviarCotacao')).click();
    let c = null; for (let i = 0; i < 40 && !c; i++) { c = (await A.admin.from('cotacoes_pecas').select('*').eq('oficina_id', ofComp.id).eq('peca_descricao', PECA2).maybeSingle()).data; if (!c) await sleep(300); }
    Q2 = c ? { id: c.id, descricao: PECA2 } : null;
    ok("D.1i cotacao 'sem pressa' (padrao da tela) gravada com urgencia 'sem_pressa'", !!c && c.urgencia === 'sem_pressa', JSON.stringify(c?.urgencia));
    const a1 = await A.esperarAviso(dLoja1.id, 'cotacao_peca_disponivel', 40);
    ok('D.1j sino sempre imediato: loja 1 tem o sino de Q2', a1.some((n) => n.dados?.cotacao_id === Q2?.id));
    await sleep(3000);
    const fila = await A.avisosEmail({ cotacao_id: Q2?.id });
    ok("D.1k 'sem pressa': NENHUM e-mail, linha na fila tipo 'resumo' motivo 'sem_pressa' enviado_em NULL para as 3 lojas, nenhum token", A.emailsDe(dLoja1.email, t2).length === 0 && A.emailsDe(dLoja2.email, t2).length === 0 && [dLoja1.id, dLoja2.id, dLoja3.id].every((id) => fila.some((r) => r.profile_id === id && r.tipo === 'resumo' && r.motivo === 'sem_pressa' && r.enviado_em === null)) && (await A.tokensEmail({ cotacao_id: Q2?.id })).length === 0, JSON.stringify(fila).slice(0, 300));
    await pD.waitForTimeout(1200);
    ok('D.1l cartao da compradora: sem chave crua; urgencia visivel (texto pecas.urgencias.semPressa)', semChaveCrua(await cardCom(pD, PECA2).innerText()) && (await cardCom(pD, PECA2).innerText()).includes(ET('pecas.urgencias.semPressa')));
    Q3 = await A.cotacao(ofComp, PECA3, { peca_descricao: PECA3, urgencia: 'amanha', alvo: 'so_lojas' });
    const t3 = Date.now();
    const n3 = await A.notificarFornecedores(Q3.id, S.comp.token);
    const m2 = await emailDe(dLoja2, t3, PECA3, 40);
    tokQ3lj2 = m2 ? tokensNaoTenho(m2.html)[0]?.token || null : null;
    const m3b = await emailDe(dLoja3, t3, PECA3, 20);
    tokQ3lj3 = m3b ? tokensNaoTenho(m3b.html)[0]?.token || null : null;
    ok("D.1m 'amanha' = imediato: emailsImediatos 3, naFila 0, e-mail com token para as lojas 2 e 3, linhas 'imediato'", n3.status === 200 && n3.d.emailsImediatos === 3 && n3.d.naFila === 0 && !!tokQ3lj2 && !!tokQ3lj3 && (await A.avisosEmail({ cotacao_id: Q3.id })).every((r) => r.tipo === 'imediato' && !!r.enviado_em), JSON.stringify(n3));
    // dois cliques ao mesmo tempo (ON CONFLICT na fila): cada loja e avisada uma vez
    const QC = await quoteHoje(ofComp3, 'Dois cliques');
    const tC = Date.now();
    const [ca, cb] = await Promise.all([A.notificarFornecedores(QC.id, S.comp3.token), A.notificarFornecedores(QC.id, S.comp3.token)]);
    await emailDe(dLoja1, tC, QC.descricao, 30);
    await sleep(1500);
    ok('D.1n duas chamadas concorrentes: emailsImediatos somam 3, 3 linhas na fila, 1 e-mail por loja, 3 tokens', ca.status === 200 && cb.status === 200 && ca.d.emailsImediatos + cb.d.emailsImediatos === 3 && (await A.avisosEmail({ cotacao_id: QC.id })).length === 3 && [dLoja1, dLoja2, dLoja3].every((d) => A.emailsDe(d.email, tC).filter((m) => m.html.includes(QC.descricao)).length === 1) && (await A.tokensEmail({ cotacao_id: QC.id })).length === 3, JSON.stringify({ a: ca.d, b: cb.d }));
  });

  // ======================= D.2: teto de 30 imediatos por loja por dia =======================
  let QT = []; let QTeto = null;
  await tentar('D.2', async () => {
    const imediatosHoje = async (id) => (await A.avisosEmail({ profile_id: id, tipo: 'imediato' })).filter((r) => r.enviado_em && new Date(r.enviado_em) >= new Date(meiaNoiteTallinn())).length;
    const antes = await imediatosHoje(dLoja1.id);
    let ultimo = null;
    for (let i = 0; i < 31; i++) {
      const of = i < 16 ? ofComp4 : ofComp2; // 16 + 15: nenhuma compradora chega ao limite de 20/h da rota
      const q = await quoteHoje(of, `Teto ${String(i + 1).padStart(2, '0')}`);
      QT.push(q);
      ultimo = await A.notificarFornecedores(q.id, (i < 16 ? S.comp4 : S.comp2).token);
      if (ultimo.status !== 200) throw new Error(`notificar ${i + 1}: ${JSON.stringify(ultimo)}`);
    }
    QTeto = QT[QT.length - 1];
    const dep = await imediatosHoje(dLoja1.id);
    const teto = (await A.avisosEmail({ profile_id: dLoja1.id, motivo: 'teto' }));
    ok(`D.2a 31 cotacoes 'hoje' + as ${antes} de D.1: loja 1 fica em exatamente ${TETO_IMEDIATOS_DIA} e-mails imediatos no dia (Tallinn); o resto vai para a fila com motivo 'teto'`, dep === TETO_IMEDIATOS_DIA && teto.length === antes + 31 - TETO_IMEDIATOS_DIA && teto.every((r) => r.tipo === 'resumo' && r.enviado_em === null), `imediatos=${dep} teto=${teto.length}`);
    ok("D.2b a ultima chamada: emailsImediatos 0, naFila 3 (as 3 lojas no teto); sem e-mail nem token para a loja 1", ultimo.d.emailsImediatos === 0 && ultimo.d.naFila === 3 && (await A.tokensEmail({ cotacao_id: QTeto.id })).every((r) => r.profile_id !== dLoja1.id) && A.emailsDe(dLoja1.email, t0).every((m) => !m.html.includes(QTeto.descricao)), JSON.stringify(ultimo.d));
    ok('D.2c sino continua imediato mesmo no teto (loja 1 tem o sino da ultima)', (await A.sinoDisponivel(dLoja1.id, QTeto.id)).length === 1);
    // a contagem e por dia de Tallinn: os 30 imediatos "de ontem" nao contam
    const ontem = new Date(new Date(meiaNoiteTallinn()).getTime() - 60e3).toISOString();
    const { error: eO } = await A.admin.from('avisos_email_pecas').update({ enviado_em: ontem }).eq('profile_id', dLoja1.id).eq('tipo', 'imediato');
    if (eO) throw new Error('ontem: ' + eO.message);
    const qA = await quoteHoje(ofComp, 'Dia seguinte A');
    const nA = await A.notificarFornecedores(qA.id, S.comp.token);
    ok("D.2d com os 30 imediatos datados de ontem (23:59 Tallinn): a loja 1 volta a receber imediato; lojas 2 e 3 continuam no teto (emailsImediatos 1, naFila 2)", nA.d.emailsImediatos === 1 && nA.d.naFila === 2 && (await A.avisosEmail({ cotacao_id: qA.id, profile_id: dLoja1.id }))[0]?.tipo === 'imediato', JSON.stringify(nA.d));
    const hoje0 = new Date(new Date(meiaNoiteTallinn()).getTime() + 60e3).toISOString();
    await A.admin.from('avisos_email_pecas').update({ enviado_em: hoje0 }).eq('profile_id', dLoja1.id).eq('tipo', 'imediato').eq('enviado_em', ontem);
    const qB = await quoteHoje(ofComp, 'Dia seguinte B');
    const nB = await A.notificarFornecedores(qB.id, S.comp.token);
    ok("D.2e datados de hoje 00:01 Tallinn: loja 1 de novo no teto (emailsImediatos 0, naFila 3)", nB.d.emailsImediatos === 0 && nB.d.naFila === 3 && (await A.avisosEmail({ cotacao_id: qB.id, profile_id: dLoja1.id }))[0]?.motivo === 'teto', JSON.stringify(nB.d));
    // urgencia NULL (tela de hoje) = imediato SEM teto, mesmo com as lojas no teto e a dona conta de teste
    const qN = await A.cotacao(ofComp3, 'Sem urgencia', { alvo: 'so_lojas' });
    const tN = Date.now();
    const nN = await A.notificarFornecedores(qN.id, S.comp3.token);
    const mN = await emailDe(dLoja1, tN, qN.descricao, 30);
    const lN = (await A.avisosEmail({ cotacao_id: qN.id, profile_id: dLoja1.id }))[0];
    ok("D.2f urgencia NULL com as lojas no teto: e-mail imediato de hoje (sem /n/, sem data-campo), linha 'imediato' motivo NULL enviado_em, 0 tokens, emailsImediatos 3", nN.d.emailsImediatos === 3 && nN.d.naFila === 0 && !!mN && !/\/n\/[A-Za-z0-9_-]{43}/.test(mN.html) && !/data-campo=/.test(mN.html) && lN?.tipo === 'imediato' && lN?.motivo === null && !!lN?.enviado_em && (await A.tokensEmail({ cotacao_id: qN.id })).length === 0, JSON.stringify({ nN: nN.d, lN }));
    // zera o teto das 3 lojas para o resto da rodada (os imediatos passam a contar como de ontem)
    const { error: eZ } = await A.admin.from('avisos_email_pecas').update({ enviado_em: ontem }).in('profile_id', [dLoja1.id, dLoja2.id, dLoja3.id]).eq('tipo', 'imediato');
    ok('D.2g (preparo) imediatos das 3 lojas datados de ontem: teto zerado para os grupos seguintes', !eZ, eZ?.message);
  });

  // ======================= D.3: resumo =======================
  await tentar('D.3', async () => {
    if (!A.temSimulacao) { ok('D.3 resumo com hora injetada', false, 'TAREFAS_SIMULAR_HORA=1 ausente no .env.local do site - bloco pulado'); return; }
    // 4 pendentes extras (sem pressa) que SAEM do resumo entre a fila e o slot: cancelada, vencida, dispensada, respondida
    const E = [];
    for (const n of ['Sai cancelada', 'Sai vencida', 'Sai dispensada', 'Sai respondida']) { const q = await A.cotacao(ofComp3, n, { urgencia: 'sem_pressa', alvo: 'so_lojas' }); E.push(q); await A.notificarFornecedores(q.id, S.comp3.token); }
    await A.admin.from('cotacoes_pecas').update({ status: 'cancelada' }).eq('id', E[0].id);
    await A.admin.from('cotacoes_pecas').update({ status: 'expirada' }).eq('id', E[1].id);
    const { error: eDisp } = await A.inserirDispensa(S.lj1, E[2].id, 'loja', lj1.id, { motivo: 'sem_estoque' });
    const { error: eResp } = await resposta(S.lj1, E[3], lj1);
    ok('D.3a (preparo) loja 1 dispensa uma e responde outra pela RLS', !eDisp && !eResp, `${eDisp?.message} ${eResp?.message}`);
    // limpeza na mesma tarefa: linha de 100 dias e token vencido ha 2 dias
    // (loja inativa: nunca avisada, logo o par (profile, cotacao) e novo e o UNIQUE nao recusa)
    const { data: velho, error: eVelho } = await A.admin.from('avisos_email_pecas').insert({ profile_id: dLojaInat.id, cotacao_id: E[0].id, fornecedor_tipo: 'loja', tipo: 'imediato', criado_em: new Date(Date.now() - 100 * DIA_MS).toISOString(), enviado_em: new Date(Date.now() - 100 * DIA_MS).toISOString() }).select('id').maybeSingle();
    const { data: tokVelho, error: eTokVelho } = await A.admin.from('pecas_links_email').insert({ token_hash: crypto.randomBytes(32).toString('hex'), profile_id: dLojaInat.id, cotacao_id: E[0].id, fornecedor_tipo: 'loja', fornecedor_id: ljInat.id, expira_em: new Date(Date.now() - 2 * DIA_MS).toISOString() }).select('id').maybeSingle();
    ok('D.3a2 (preparo) linha de 100 dias e token vencido ha 2 dias gravados', !!velho && !!tokVelho, `${eVelho?.message || ''} ${eTokVelho?.message || ''}`);
    const pend = (await A.avisosEmail({ profile_id: dLoja1.id, enviado_em: null })).map((r) => r.cotacao_id);
    const t3 = Date.now();
    const r1 = await A.resumo(tallinnEmUtc(DIA1, '10:53'));
    ok(`D.3b POST ${ROTA_RESUMO} terca/dia util 10:53 Tallinn -> {ok:true, slot:'${slotDe(DIA1, 10)}', resumos>=3}`, r1.status === 200 && r1.d.ok === true && r1.d.slot === slotDe(DIA1, 10) && r1.d.resumos >= 3, JSON.stringify(r1));
    const m1 = await A.esperarEmail(dLoja1.email, t3, () => true, 30);
    const listadas = m1 ? [...m1.html.matchAll(/data-cotacao="([0-9a-f-]{36})"/g)].map((x) => x[1]) : [];
    const esperadas = pend.filter((id) => !E.map((e) => e.id).includes(id));
    ok('D.3c 1 e-mail de resumo para a loja 1 com TODAS as pendentes validas (>= 4: Q2 + 3 do teto + qB; data-cotacao por linha) e NENHUMA das 4 que sairam', !!m1 && esperadas.length >= 4 && esperadas.every((id) => listadas.includes(id)) && E.every((e) => !listadas.includes(e.id)) && new Set(listadas).size === listadas.length, `listadas=${listadas.length} esperadas=${esperadas.length}`);
    ok('D.3d resumo: um token "nao tenho" por cotacao listada, botao "Ver cotacoes" neutro (/v/ -> /loja/cotacoes), sem placa, sem foto, sem slug em portugues', !!m1 && tokensNaoTenho(m1.html).length === listadas.length && linksNeutros(m1.html).some((l) => l.interno === '/loja/cotacoes') && semPlaca(m1.html) && !/<img/i.test(m1.html.replace(/<img[^>]*alt="BipFix"[^>]*>/, '')) && semSlugPortugues(m1.html), m1?.assunto);
    const linhas = await A.avisosEmail({ profile_id: dLoja1.id });
    ok(`D.3e linhas enviadas: enviado_em preenchido e slot '${slotDe(DIA1, 10)}'; as 4 que sairam: enviado_em preenchido e erro 'saiu:...'`, esperadas.every((id) => linhas.find((r) => r.cotacao_id === id)?.enviado_em && linhas.find((r) => r.cotacao_id === id)?.slot === slotDe(DIA1, 10)) && E.every((e) => { const l = linhas.find((r) => r.cotacao_id === e.id); return !!l?.enviado_em && /^saiu:/.test(l?.erro || ''); }), JSON.stringify(linhas.filter((r) => E.some((e) => e.id === r.cotacao_id)).map((r) => r.erro)));
    const r2 = await A.resumo(tallinnEmUtc(DIA1, '10:58'));
    ok('D.3f 2a chamada no mesmo slot: resumos 0 e nenhum e-mail novo', r2.status === 200 && r2.d.resumos === 0 && A.emailsDe(dLoja1.email, t3).length === 1, JSON.stringify(r2));
    ok('D.3g limpeza na mesma tarefa: linha de 100 dias e token vencido ha 2 dias apagados', !!velho && !!tokVelho && (await A.admin.from('avisos_email_pecas').select('id').eq('id', velho.id)).data?.length === 0 && (await A.admin.from('pecas_links_email').select('id').eq('id', tokVelho.id)).data?.length === 0);
    // falha de envio: reserva desfeita, tentativas + 1; depois envia (bloco proprio: o rename da pasta pode falhar no Windows)
    const E5 = await A.cotacao(ofComp3, 'Falha de envio', { urgencia: 'sem_pressa', alvo: 'so_lojas' });
    await A.notificarFornecedores(E5.id, S.comp3.token);
    const comPastaBloqueada = async (fn) => { const desbloquear = pastaEmailsBloqueada(A.EMAILS); try { return await fn(); } finally { desbloquear(); } };
    try {
      const rF = await comPastaBloqueada(() => A.resumo(tallinnEmUtc(DIA1, '12:53')));
      const lF = (await A.avisosEmail({ cotacao_id: E5.id, profile_id: dLoja1.id }))[0];
      ok('D.3h e-mail falhando (pasta bloqueada): slot 12 roda, a linha volta a enviado_em NULL com tentativas 1 e erro preenchido', rF?.status === 200 && !!lF && lF.enviado_em === null && lF.tentativas === 1 && !!lF.erro, JSON.stringify({ rF: rF?.d, lF }));
    } catch (e) { ok('D.3h e-mail falhando (pasta bloqueada)', false, e?.message); }
    const t3b = Date.now();
    const rG = await A.resumo(tallinnEmUtc(DIA1, '14:53'));
    const lG = (await A.avisosEmail({ cotacao_id: E5.id, profile_id: dLoja1.id }))[0];
    ok('D.3i slot 14: envia (enviado_em preenchido, tentativas continua 1), e-mail da loja 1 lista a cotacao', rG.d.resumos >= 1 && !!lG?.enviado_em && lG.tentativas === 1 && !!(await emailDe(dLoja1, t3b, E5.descricao, 20)), JSON.stringify({ rG: rG.d, lG }));
    // desistencia: 3 falhas seguidas -> desiste (enviado_em preenchido, erro sem 'saiu:'), e o slot seguinte nao envia
    const E6 = await A.cotacao(ofComp3, 'Desiste em 3', { urgencia: 'sem_pressa', alvo: 'so_lojas' });
    await A.notificarFornecedores(E6.id, S.comp3.token);
    try {
      for (const h of ['10:53', '12:53', '14:53']) await comPastaBloqueada(() => A.resumo(tallinnEmUtc(DIA2, h)));
      const l6 = (await A.avisosEmail({ cotacao_id: E6.id, profile_id: dLoja1.id }))[0];
      const t6 = Date.now();
      const r6 = await A.resumo(tallinnEmUtc(DIA2, '16:53'));
      await sleep(1000);
      ok("D.3i2 3 falhas seguidas: tentativas 3, desiste (enviado_em preenchido, erro sem 'saiu:'); o slot 16 nao a envia", !!l6 && l6.tentativas === 3 && !!l6.enviado_em && !!l6.erro && !/^saiu:/.test(l6.erro) && r6.status === 200 && A.emailsDe(dLoja1.email, t6).every((m) => !m.html.includes(E6.descricao)), JSON.stringify({ l6, r6: r6.d }));
    } catch (e) { ok('D.3i2 desistencia em 3 tentativas', false, e?.message); }
    // slots e DST (sem pendentes: so o slot)
    const v = async (iso) => (await A.resumo(iso)).d.slot ?? null;
    ok('D.3j slots: sabado 10:53 -> null; dia util 09:53 -> null; segunda 08:53 -> HH 08 (diario)', (await v(tallinnEmUtc('2026-11-21', '10:53'))) === null && (await v(tallinnEmUtc(DIA2, '09:53'))) === null && (await v(tallinnEmUtc('2026-11-23', '08:53'))) === '2026-11-23-08', 'ver resposta');
    ok('D.3k DST: 2026-01-20 06:53Z (08:53 EET) -> 2026-01-20-08; 2026-07-21 05:53Z (08:53 EEST) -> 2026-07-21-08; 2026-07-21 06:53Z (09:53) -> null', (await v('2026-01-20T06:53:00Z')) === '2026-01-20-08' && (await v('2026-07-21T05:53:00Z')) === '2026-07-21-08' && (await v('2026-07-21T06:53:00Z')) === null);
    ok('D.3l por cotacao: loja REAL sem linha na fila e sem e-mail de resumo (so contas de teste nesta rodada)', (await A.avisosEmail({ profile_id: dLojaReal.id })).length === 0 && A.emailsDe(dLojaReal.email, t0).length === 0);
    tokQ2lj1 = tokensNaoTenho(m1?.html || '').find((x) => x) ? (m1.html.match(new RegExp(`data-cotacao="${Q2.id}"[\\s\\S]*?/n/([A-Za-z0-9_-]{43})\\?o=`)) || [])[1] || null : null;
  });

  // ======================= D.4: "nao tenho" pelo painel =======================
  const ctxL2 = await nav.contexto('chromium', 390, A.ip); const pL2 = await ctxL2.newPage(); vigiar(pL2, erros, 'D.4 loja2');
  await tentar('D.4', async () => {
    await entrarPelaTela(pL2, '/ee/et', dLoja2);
    await ir(pL2, '/ee/et/loja/cotacoes', 3500);
    const c = cartaoLoja(pL2, PECA1);
    ok('D.4a /loja/cotacoes: cartao com botao "nao tenho" (cotacao-nao-tenho)', (await c.count()) === 1 && (await c.getByTestId('cotacao-nao-tenho').count()) === 1);
    await c.getByTestId('cotacao-nao-tenho').click();
    await c.getByTestId('cotacao-nao-tenho-motivo').selectOption('sem_estoque');
    await c.getByTestId('cotacao-nao-tenho-confirmar').click();
    let d = []; for (let i = 0; i < 30 && !d.length; i++) { d = (await A.dispensas(Q1.id)).filter((r) => r.profile_id === dLoja2.id); if (!d.length) await sleep(300); }
    ok("D.4b linha em cotacoes_pecas_dispensas: (Q1, loja, loja 2), profile loja 2, motivo sem_estoque, origem 'painel'", d.length === 1 && d[0].fornecedor_tipo === 'loja' && d[0].fornecedor_id === lj2.id && d[0].motivo === 'sem_estoque' && d[0].origem === 'painel', JSON.stringify(d));
    await ir(pL2, '/ee/et/loja/cotacoes', 3000);
    ok('D.4c a cotacao some da lista da loja 2 (outras continuam - ancora PECA3)', (await cartaoLoja(pL2, PECA1).count()) === 0 && (await cartaoLoja(pL2, PECA3).count()) === 1);
    await ir(pD, '/ee/et/oficina/pecas', 3000);
    const cc = cardCom(pD, PECA1);
    const cont = await cc.getByTestId('cotacao-nao-tem-contagem').innerText().catch(() => '');
    ok('D.4d compradora ve "1 fornecedor nao tem" (cotacao-nao-tem-contagem) sem chave crua', /\b1\b/.test(cont) && semChaveCrua(cont) && cont.trim().length > 1, cont);
    const n = await A.notificarFornecedores(Q1.id, S.comp.token);
    ok('D.4e avisar de novo: ninguem re-avisado (dedupe + dispensa; a prova da dispensa no re-aviso e D.8e)', n.d.emailsImediatos === 0 && (await A.sinoDisponivel(dLoja2.id, Q1.id)).length === 1);
    const { error: e1 } = await S.lj3.c.from('cotacoes_pecas_dispensas').insert({ cotacao_id: Q1.id, fornecedor_tipo: 'loja', fornecedor_id: lj2.id, profile_id: dLoja2.id, origem: 'painel' });
    ok('D.4f loja 3 NAO insere dispensa em nome da loja 2 (42501)', e1?.code === '42501', e1 ? `${e1.code} ${e1.message}` : 'inseriu');
    await S.lj3.c.from('cotacoes_pecas_dispensas').delete().eq('cotacao_id', Q1.id).eq('fornecedor_id', lj2.id);
    ok('D.4g loja 3 NAO apaga a linha da loja 2; loja 3 nem a le (select = 0); a compradora le (conta)', (await A.dispensas(Q1.id)).some((r) => r.profile_id === dLoja2.id) && ((await S.lj3.c.from('cotacoes_pecas_dispensas').select('*').eq('cotacao_id', Q1.id)).data || []).length === 0 && ((await S.comp.c.from('cotacoes_pecas_dispensas').select('motivo').eq('cotacao_id', Q1.id)).data || []).length === 1);
    const { error: eDel } = await S.lj2.c.from('cotacoes_pecas_dispensas').delete().eq('cotacao_id', Q1.id).eq('fornecedor_id', lj2.id);
    ok('D.4h a propria loja desfaz (DELETE pela RLS) e a cotacao volta a lista', !eDel && (await A.dispensas(Q1.id)).every((r) => r.profile_id !== dLoja2.id) && (await (async () => { await ir(pL2, '/ee/et/loja/cotacoes', 3000); return (await cartaoLoja(pL2, PECA1).count()) === 1; })()), eDel?.message);
    const { error: eRe } = await A.inserirDispensa(S.lj2, Q1.id, 'loja', lj2.id, { motivo: 'sem_estoque' });
    ok('D.4i (preparo) loja 2 dispensa de novo pela RLS', !eRe, eRe?.message);
    const { error: eI } = await A.inserirDispensa(S.ljInat, Q1.id, 'loja', ljInat.id);
    const { error: eV } = await S.vend.c.from('cotacoes_pecas_dispensas').insert({ cotacao_id: Q1.id, fornecedor_tipo: 'oficina', fornecedor_id: ofVend.id, profile_id: dVend.id, origem: 'painel' });
    const { error: eR } = await A.inserirDispensa(S.ljReal, Q1.id, 'loja', ljReal.id);
    ok('D.4j loja inativa, vendedora em "so lojas" e loja REAL nao dispensam (RLS via cotacoes_pecas: 42501)', eI?.code === '42501' && eV?.code === '42501' && eR?.code === '42501', `${eI?.code || 'inativa gravou'} / ${eV?.code || 'vend gravou'} / ${eR?.code || 'real gravou'}`);
    const { error: eM } = await A.inserirDispensa(S.lj3, Q1.id, 'loja', lj3.id, { motivo: 'xyz' });
    ok('D.4k motivo fora da lista recusado (CHECK 23514)', eM?.code === '23514', eM ? `${eM.code} ${eM.message}` : 'gravou');
    // ramo da oficina vendedora (fornecedor_tipo 'oficina'): positivo pela RLS numa cotacao "lojas e oficinas"
    const QV = await A.cotacao(ofComp, 'Vendedora dispensa', { urgencia: 'hoje', alvo: 'todos' });
    await A.notificarFornecedores(QV.id, S.comp.token);
    const { error: eVd } = await S.vend.c.from('cotacoes_pecas_dispensas').insert({ cotacao_id: QV.id, fornecedor_tipo: 'oficina', fornecedor_id: ofVend.id, profile_id: dVend.id, origem: 'painel', motivo: 'nao_trabalho' });
    ok("D.4l oficina vendedora dispensa pela RLS (fornecedor_tipo 'oficina'); a compradora le a linha", !eVd && ((await S.comp.c.from('cotacoes_pecas_dispensas').select('fornecedor_tipo').eq('cotacao_id', QV.id)).data || []).some((r) => r.fornecedor_tipo === 'oficina'), eVd?.message);
    const ctxVd = await nav.contexto('chromium', 390, A.ip); const pVd = await ctxVd.newPage(); vigiar(pVd, erros, 'D.4 vendedora');
    await entrarPelaTela(pVd, '/ee/et', dVend);
    await ir(pVd, '/ee/et/oficina/pecas?aba=vender', 3500);
    ok('D.4m aba Vender da vendedora: a dispensada some; o cartao de outra cotacao "todos" tem o botao cotacao-nao-tenho', (await cartaoLoja(pVd, QV.descricao).count()) === 0 && (await pVd.getByTestId('cotacao-nao-tenho').count()) >= 1, String(await pVd.getByTestId('cotacao-nao-tenho').count()));
    await ctxVd.close();
  });
  await ctxL2.close();

  // ======================= D.5: "nao tenho" pelo e-mail =======================
  const ctxN = await nav.contexto('chromium', 390, A.ip); const pN = await ctxN.newPage(); vigiar(pN, erros, 'D.5 /n');
  await tentar('D.5', async () => {
    const k = tokQ1lj1; if (!k) throw new Error('sem token da loja 1 (D.1)');
    for (const l of IDIOMAS) {
      const r = await A.get302(`/n/${k}?o=${encodeURIComponent(l)}`);
      ok(`D.5a GET /n/<token>?o=${l} -> 302 ${SLUG_NAO_TENHO[l]}?k=<token>`, r.status === 302 && r.location.includes(`${SLUG_NAO_TENHO[l]}?k=${k}`), `${r.status} ${r.location}`);
    }
    await pN.goto(`${SITE}/n/${k}?o=et`, { waitUntil: 'networkidle' }).catch(() => {});
    await pN.getByTestId('nao-tenho-peca').waitFor({ timeout: 15000 });
    ok('D.5b pagina (sem login, ET): nome da peca, botao confirmar, motivo opcional, token fora da barra, noindex, sem chave crua, sem rolagem lateral', (await pN.getByTestId('nao-tenho-peca').innerText()).includes(PECA1) && await visivel(pN.getByTestId('nao-tenho-confirmar')) && (await pN.getByTestId('nao-tenho-motivo').count()) === 1 && !pN.url().includes(k) && (await pN.locator('meta[name="robots"][content*="noindex"]').count()) >= 1 && semChaveCrua(await pN.innerText('body')) && await semRolagemLateral(pN), pN.url());
    await pN.screenshot({ path: `${PRINTS}/lote2-nao-tenho-et-390.png`, fullPage: true });
    ok('D.5c abrir NAO age: token usado_em NULL e nenhuma dispensa da loja 1', !(await A.tokenNoBanco(k))?.usado_em && (await A.dispensas(Q1.id)).every((r) => r.profile_id !== dLoja1.id));
    const ver = await A.postCru(ROTA_NAO_TENHO_EMAIL, { k, acao: 'ver' });
    ok("D.5d 'ver' -> 200 com SO as chaves {aberta, jaDispensou, jaRespondeu, peca, vencido}; peca = descricao; nada da compradora/carro/placa", ver.status === 200 && JSON.stringify(Object.keys(ver.d).sort()) === JSON.stringify(['aberta', 'jaDispensou', 'jaRespondeu', 'peca', 'vencido']) && ver.d.peca === PECA1 && ver.d.aberta === true && ver.d.vencido === false && !JSON.stringify(ver.d).includes(ofComp.nome) && semPlaca(JSON.stringify(ver.d)) && !/Volkswagen/.test(JSON.stringify(ver.d)), JSON.stringify(ver.d));
    const r302 = await A.get302(`/n/${k}?o=et`);
    ok("D.5d2 cabecalhos: a API responde Cache-Control no-store e sem Set-Cookie; o 302 de /n/ tambem nao poe cookie", /no-store/.test(ver.cacheControl) && !ver.setCookie && !r302.setCookie, `api=${ver.cacheControl}|${ver.setCookie} 302=${r302.setCookie}`);
    // fornecedor inativo e paridade sao re-checados ao confirmar (loja 3 desativada / virada real por instantes): 410 sem gastar
    await A.admin.from('lojas_pecas').update({ ativa: false }).eq('id', lj3.id);
    const cIn = await A.naoTenhoEmail({ k: tokQ1lj3, acao: 'confirmar' });
    await A.admin.from('lojas_pecas').update({ ativa: true }).eq('id', lj3.id);
    await A.admin.from('profiles').update({ conta_teste: false }).eq('id', dLoja3.id);
    const cPar = await A.naoTenhoEmail({ k: tokQ1lj3, acao: 'confirmar' });
    await A.admin.from('profiles').update({ conta_teste: true }).eq('id', dLoja3.id);
    ok('D.5d3 confirmar com a loja INATIVA -> 410; com paridade quebrada (loja real x cotacao de teste) -> 410; token nao gasto', cIn.status === 410 && cPar.status === 410 && !(await A.tokenNoBanco(tokQ1lj3))?.usado_em && (await A.dispensas(Q1.id)).every((r) => r.profile_id !== dLoja3.id), `${cIn.status} ${cPar.status}`);
    await pN.getByTestId('nao-tenho-motivo').selectOption('nao_trabalho');
    await pN.getByTestId('nao-tenho-confirmar').click();
    await pN.getByTestId('nao-tenho-feito').waitFor({ timeout: 15000 });
    const d1 = (await A.dispensas(Q1.id)).find((r) => r.profile_id === dLoja1.id);
    ok("D.5e confirmar pela pagina: dispensa (loja 1, origem 'email', motivo nao_trabalho) e token gasto (usado_em)", !!d1 && d1.origem === 'email' && d1.motivo === 'nao_trabalho' && !!(await A.tokenNoBanco(k))?.usado_em, JSON.stringify(d1));
    const c2 = await A.naoTenhoEmail({ k, acao: 'confirmar' }), v2 = await A.naoTenhoEmail({ k, acao: 'ver' });
    ok('D.5f 2o confirmar -> 410 LINK_INVALIDO; ver de token gasto -> 200 vencido:true com a peca', c2.status === 410 && c2.d.codigo === 'LINK_INVALIDO' && v2.status === 200 && v2.d.vencido === true && v2.d.peca === PECA1, `${c2.status} ${JSON.stringify(v2.d)}`);
    // o corpo nao decide nada: cotacaoId trocado
    const c3 = await A.naoTenhoEmail({ k: tokQ1lj3, acao: 'confirmar', cotacaoId: Q2.id, fornecedorId: lj2.id });
    ok('D.5g token da loja 3 para Q1 com cotacaoId/fornecedorId trocados no corpo -> dispensa em Q1 para a loja 3 (corpo ignorado)', c3.status === 200 && c3.d.ok === true && (await A.dispensas(Q1.id)).some((r) => r.profile_id === dLoja3.id && r.origem === 'email') && (await A.dispensas(Q2.id)).every((r) => r.profile_id !== dLoja3.id), JSON.stringify(c3));
    // vencido / cotacao fechada / ja respondeu
    const tk3 = await A.tokenNoBanco(tokQ3lj3);
    await A.admin.from('pecas_links_email').update({ expira_em: horasAtras(1) }).eq('id', tk3.id);
    const c4 = await A.naoTenhoEmail({ k: tokQ3lj3, acao: 'confirmar' }), v4 = await A.naoTenhoEmail({ k: tokQ3lj3, acao: 'ver' });
    ok('D.5h token vencido: confirmar 410 LINK_INVALIDO; ver 200 vencido:true', c4.status === 410 && c4.d.codigo === 'LINK_INVALIDO' && v4.status === 200 && v4.d.vencido === true, `${c4.status} ${JSON.stringify(v4.d)}`);
    await A.admin.from('cotacoes_pecas').update({ status: 'cancelada' }).eq('id', Q3.id);
    const c5 = await A.naoTenhoEmail({ k: tokQ3lj2, acao: 'confirmar' }), v5 = await A.naoTenhoEmail({ k: tokQ3lj2, acao: 'ver' });
    ok('D.5i cotacao cancelada: confirmar 410 COTACAO_FECHADA (token nao gasto); ver aberta:false', c5.status === 410 && c5.d.codigo === 'COTACAO_FECHADA' && !(await A.tokenNoBanco(tokQ3lj2))?.usado_em && v5.d.aberta === false, `${c5.status} ${JSON.stringify(c5.d)} ${JSON.stringify(v5.d)}`);
    if (tokQ2lj1) {
      const { error: eR } = await resposta(S.lj1, Q2, lj1);
      const c6 = await A.naoTenhoEmail({ k: tokQ2lj1, acao: 'confirmar' }), v6 = await A.naoTenhoEmail({ k: tokQ2lj1, acao: 'ver' });
      ok('D.5j depois de ofertar: confirmar 409 JA_RESPONDEU; ver jaRespondeu:true', !eR && c6.status === 409 && c6.d.codigo === 'JA_RESPONDEU' && v6.d.jaRespondeu === true, `${eR?.message} ${c6.status} ${JSON.stringify(c6.d)}`);
    } else ok('D.5j depois de ofertar: 409 JA_RESPONDEU', false, 'sem token de Q2 no resumo da loja 1 (D.3)');
    const ipFixo = '10.79.1.1';
    let r429 = null; for (let i = 0; i < 31; i++) { const r = await A.naoTenhoEmail({ k: 'A'.repeat(43), acao: 'ver' }, ipFixo); if (r.status === 429) { r429 = i + 1; break; } }
    ok('D.5k 31 chamadas/h do mesmo IP -> 429 (limite por IP)', r429 !== null && r429 <= 31, `429 na chamada ${r429}`);
    // token de OFICINA vendedora (fornecedor_tipo 'oficina') pelo e-mail: confirmar grava a dispensa da oficina
    const QV2 = await A.cotacao(ofComp, 'Vendedora pelo e-mail', { urgencia: 'hoje', alvo: 'todos' });
    const tV = Date.now();
    await A.notificarFornecedores(QV2.id, S.comp.token);
    const mV = await emailDe(dVend, tV, QV2.descricao, 40);
    const kV = mV ? tokensNaoTenho(mV.html)[0]?.token : null;
    const cV = kV ? await A.naoTenhoEmail({ k: kV, acao: 'confirmar', motivo: 'outro' }) : { status: 0, d: {} };
    const dV = (await A.dispensas(QV2.id)).find((r) => r.fornecedor_tipo === 'oficina');
    ok("D.5l vendedora recebe e-mail imediato com token; confirmar -> 200 e dispensa (oficina, ofVend, origem 'email', motivo outro); token gasto", !!kV && cV.status === 200 && cV.d.ok === true && !!dV && dV.fornecedor_id === ofVend.id && dV.profile_id === dVend.id && dV.origem === 'email' && dV.motivo === 'outro' && !!(await A.tokenNoBanco(kV))?.usado_em, `${JSON.stringify(cV)} ${JSON.stringify(dV)}`);
  });

  // ======================= D.6: IVA por oferta =======================
  const ctxL1 = await nav.contexto('chromium', 390, A.ip); const pL1 = await ctxL1.newPage(); vigiar(pL1, erros, 'D.6 loja1');
  await tentar('D.6', async () => {
    await entrarPelaTela(pL1, '/ee/et', dLoja1);
    await ir(pL1, '/ee/et/loja/perfil', 2500);
    ok('D.6a /loja/perfil: perfil-iva-registrado presente; regime de margem so aparece depois de marcar "registrado"', (await pL1.getByTestId('perfil-iva-registrado').count()) === 1 && !(await pL1.getByTestId('perfil-regime-margem').isVisible().catch(() => false)));
    await marcar(pL1, 'perfil-iva-registrado');
    ok('D.6b ao marcar: perfil-iva-pct sugerido 24 (EE) e perfil-regime-margem visivel (desmarcado)', /^24([.,]00?)?$/.test(await pL1.getByTestId('perfil-iva-pct').inputValue()) && await visivel(pL1.getByTestId('perfil-regime-margem')) && !(await pL1.getByTestId('perfil-regime-margem').isChecked()), await pL1.getByTestId('perfil-iva-pct').inputValue().catch(() => ''));
    await botao(pL1, ET('lojaPerfil.salvarButton')).click();
    let lj = null; for (let i = 0; i < 30; i++) { lj = (await A.admin.from('lojas_pecas').select('iva_registrado, iva_pct, regime_margem_usadas').eq('id', lj1.id).single()).data; if (lj?.iva_registrado) break; await sleep(300); }
    ok('D.6c salvar grava lojas_pecas.iva_registrado true, iva_pct 24, regime false', lj?.iva_registrado === true && Number(lj?.iva_pct) === 24 && lj?.regime_margem_usadas === false, JSON.stringify(lj));
    await pL1.screenshot({ path: `${PRINTS}/lote2-loja-perfil-iva-et-390.png`, fullPage: true });
    R1 = await A.cotacao(ofComp3, 'IVA registrado', { quantidade: 2, alvo: 'so_lojas', urgencia: 'hoje' });
    await A.notificarFornecedores(R1.id, S.comp3.token);
    await ir(pL1, '/ee/et/loja/cotacoes', 3500);
    const c = cartaoLoja(pL1, R1.descricao);
    await botao(c, ET('lojaCotacoes.responderCotacaoButton')).click();
    ok('D.6d formulario de resposta novo: resposta-quantidade (padrao = pedida 2), previa do IVA; sem resposta-usada (regime desligado)', (await c.getByTestId('resposta-quantidade').inputValue()) === '2' && (await c.getByTestId('resposta-usada').count()) === 0);
    await pL1.locator('#c40f3-1').fill('124');
    await pL1.locator('#c40f3-2').fill('1');
    await pL1.waitForTimeout(400);
    const previa = await c.getByTestId('resposta-iva-previa').innerText().catch(() => '');
    ok('D.6e previa: 124 x 2 = 248 e "sem IVA ~ 200,00 (24 %)"', /248[,.]00/.test(previa) && /200[,.]00/.test(previa) && /24/.test(previa) && semChaveCrua(previa), previa);
    const tR = Date.now();
    await botao(c, ET('lojaCotacoes.enviarRespostaButton')).click();
    let r = null; for (let i = 0; i < 40 && !r; i++) { r = (await A.admin.from('cotacoes_pecas_respostas').select('*').eq('cotacao_id', R1.id).eq('loja_id', lj1.id).maybeSingle()).data; if (!r) await sleep(300); }
    ok("D.6f oferta gravada com snapshot: iva_modo 'registrado', iva_pct 24, quantidade_ofertada 2 ou NULL (= pedida)", !!r && r.iva_modo === 'registrado' && Number(r.iva_pct) === 24 && (r.quantidade_ofertada === null || Number(r.quantidade_ofertada) === 2), JSON.stringify(r));
    const mB = await emailDe(dComp3, tR, R1.descricao, 40);
    ok('D.6g e-mail "cotacao respondida" a compradora com a linha do IVA (200,00 e 24)', !!mB && /200[,.]00/.test(mB.texto) && /24/.test(mB.texto) && /248[,.]00/.test(mB.texto), mB?.texto.slice(0, 200));
    await A.admin.from('lojas_pecas').update({ iva_registrado: false, iva_pct: null }).eq('id', lj2.id);
    const { error: e2 } = await resposta(S.lj2, R1, lj2, { preco: 100, iva_modo: 'nao_registrado', iva_pct: null });
    await A.admin.from('lojas_pecas').update({ iva_registrado: true, iva_pct: 24, regime_margem_usadas: true }).eq('id', lj3.id);
    const { error: e3 } = await resposta(S.lj3, R1, lj3, { preco: 90, iva_modo: 'margem', iva_pct: null });
    ok('D.6h lojas 2 (nao registrada) e 3 (regime de margem) ofertam com o proprio snapshot', !e2 && !e3, `${e2?.message} ${e3?.message}`);
    const ctxC3 = await nav.contexto('chromium', 1280, A.ip); const pC3 = await ctxC3.newPage(); vigiar(pC3, erros, 'D.6 compradora3');
    await entrarPelaTela(pC3, '/ee/et', dComp3);
    await ir(pC3, '/ee/et/oficina/pecas', 3500);
    const card = cardCom(pC3, R1.descricao);
    const of1 = card.getByTestId('oferta').filter({ hasText: lj1.nome }), of2 = card.getByTestId('oferta').filter({ hasText: lj2.nome }), of3 = card.getByTestId('oferta').filter({ hasText: lj3.nome });
    const iva1 = await of1.getByTestId('oferta-iva').innerText().catch(() => ''), iva2 = await of2.getByTestId('oferta-iva').innerText().catch(() => ''), iva3 = await of3.getByTestId('oferta-iva').innerText().catch(() => '');
    ok('D.6i compradora: loja 1 -> total 248,00 + "sem IVA ~ 200,00 (24 %)"', /248[,.]00/.test(await of1.getByTestId('oferta-total').innerText().catch(() => '')) && /200[,.]00/.test(iva1) && /24/.test(iva1) && semChaveCrua(iva1), iva1);
    ok('D.6j loja 2 -> "IVA nao aplicavel" (pecas.ivaNaoAplicavel), sem linha "sem IVA"', iva2.trim() === ET('pecas.ivaNaoAplicavel').trim(), iva2);
    ok('D.6k loja 3 (peca usada) -> "IVA nao dedutivel - regime de margem" (pecas.ivaMargem), SEM "sem IVA"', iva3.trim() === ET('pecas.ivaMargem').trim() && !/\d+[,.]\d\d/.test(iva3), iva3);
    await pC3.screenshot({ path: `${PRINTS}/lote2-ofertas-iva-et-1280.png`, fullPage: true });
    R2 = await A.cotacao(ofComp3, 'IVA sem perfil', { quantidade: 1, alvo: 'todos' });
    const { error: eV } = await S.vend.c.from('cotacoes_pecas_respostas').insert({ cotacao_id: R2.id, fornecedor_tipo: 'oficina', oficina_fornecedora_id: ofVend.id, preco: 50, prazo_dias: 1 });
    await ir(pC3, '/ee/et/oficina/pecas', 3000);
    ok('D.6l fornecedor sem IVA no perfil (vendedora): oferta so com o preco, sem oferta-iva (= hoje)', !eV && (await cardCom(pC3, R2.descricao).getByTestId('oferta').count()) === 1 && (await cardCom(pC3, R2.descricao).getByTestId('oferta-iva').count()) === 0, eV?.message);
    await ctxC3.close();
    const { error: k1 } = await resposta(S.lj1, R2, lj1, { iva_modo: 'registrado', iva_pct: null });
    const { error: k2 } = await resposta(S.lj1, R2, lj1, { iva_modo: 'margem', iva_pct: 24 });
    const { error: k3 } = await S.lj1.c.from('lojas_pecas').update({ iva_pct: 150 }).eq('id', lj1.id);
    const { error: k4 } = await resposta(S.lj2, R2, lj2, { iva_modo: 'nao_registrado', iva_pct: 24 });
    ok("D.6m CHECKs (23514): registrado sem pct, margem com pct, nao_registrado com pct e iva_pct 150 no perfil -> recusados", k1?.code === '23514' && k2?.code === '23514' && k3?.code === '23514' && k4?.code === '23514', `${k1?.code || 'k1 passou'} / ${k2?.code || 'k2 passou'} / ${k3?.code || 'k3 passou'} / ${k4?.code || 'k4 passou'}`);
    // arredondamento 10 / 1,24 = 8,06
    await ir(pL1, '/ee/et/loja/cotacoes', 3500);
    const c2 = cartaoLoja(pL1, R2.descricao);
    await botao(c2, ET('lojaCotacoes.responderCotacaoButton')).click();
    await pL1.locator('#c40f3-1').fill('10');
    await pL1.waitForTimeout(400);
    ok('D.6n previa com 10,00 a 24 %: "sem IVA ~ 8,06"', /8[,.]06/.test(await c2.getByTestId('resposta-iva-previa').innerText().catch(() => '')));
    await botao(c2, ET('lojaCotacoes.cancelarButton')).click().catch(() => {});
  });

  // ======================= D.7: quantidade ofertada =======================
  await tentar('D.7', async () => {
    const S1 = await A.cotacao(ofComp3, 'Parcial', { quantidade: 4, alvo: 'so_lojas', urgencia: 'hoje' });
    await ir(pL1, '/ee/et/loja/cotacoes', 3500);
    const c = cartaoLoja(pL1, S1.descricao);
    await botao(c, ET('lojaCotacoes.responderCotacaoButton')).click();
    ok('D.7a resposta-quantidade vem com a pedida (4)', (await c.getByTestId('resposta-quantidade').inputValue()) === '4');
    await c.getByTestId('resposta-quantidade').fill('2');
    await pL1.locator('#c40f3-1').fill('10'); await pL1.locator('#c40f3-2').fill('1');
    const tS = Date.now();
    await botao(c, ET('lojaCotacoes.enviarRespostaButton')).click();
    let r = null; for (let i = 0; i < 40 && !r; i++) { r = (await A.admin.from('cotacoes_pecas_respostas').select('*').eq('cotacao_id', S1.id).eq('loja_id', lj1.id).maybeSingle()).data; if (!r) await sleep(300); }
    ok('D.7b oferta com quantidade_ofertada 2', !!r && Number(r.quantidade_ofertada) === 2, JSON.stringify(r));
    const mS = await emailDe(dComp3, tS, S1.descricao, 40);
    ok('D.7b2 e-mail "cotacao respondida" a compradora: total pela ofertada (20,00) e linha "oferta parcial" (2 ... 4)', !!mS && /20[,.]00/.test(mS.texto) && /\b2\b[\s\S]*\b4\b/.test(mS.texto.replace(/20[,.]00/g, '')), mS?.texto.slice(0, 200));
    const ctxC3 = await nav.contexto('chromium', 390, A.ip); const pC3 = await ctxC3.newPage(); vigiar(pC3, erros, 'D.7 compradora3');
    await entrarPelaTela(pC3, '/ee/et', dComp3);
    await ir(pC3, '/ee/et/oficina/pecas', 3500);
    const of = cardCom(pC3, S1.descricao).getByTestId('oferta');
    const parcial = await of.getByTestId('oferta-parcial').innerText().catch(() => '');
    ok('D.7c compradora: "oferta parcial: 2 de 4" (oferta-parcial) e total 20,00 (pela ofertada)', /\b2\b/.test(parcial) && /\b4\b/.test(parcial) && semChaveCrua(parcial) && /20[,.]00/.test(await of.getByTestId('oferta-total').innerText().catch(() => '')), parcial);
    await pC3.screenshot({ path: `${PRINTS}/lote2-oferta-parcial-et-390.png`, fullPage: true });
    await ctxC3.close();
    const rc = await A.confirmar(r.id, S.comp3.token);
    const ped = rc.d.pedidoId ? (await A.admin.from('pedidos_pecas').select('quantidade, preco_total').eq('id', rc.d.pedidoId).single()).data : null;
    ok('D.7d confirmar: pedidos_pecas.quantidade 2 (a ofertada) e preco_total 20.00', rc.status === 200 && !!ped && Number(ped.quantidade) === 2 && Number(ped.preco_total) === 20, JSON.stringify({ rc: rc.d, ped }));
    await ir(pL1, '/ee/et/loja/pedidos', 3000);
    const linha = pL1.getByTestId('pedido-loja').filter({ hasText: S1.descricao });
    ok('D.7e /loja/pedidos mostra o pedido com quantidade 2 e total 20,00', (await linha.count()) === 1 && /20[,.]00/.test(await linha.innerText()) && /(?<![\d,.])2(?![\d,.])/.test(await linha.innerText()), (await linha.innerText().catch(() => '')).slice(0, 160));
    const S2 = await A.cotacao(ofComp3, 'Parcial teto', { quantidade: 4, alvo: 'so_lojas' });
    await ir(pL1, '/ee/et/loja/cotacoes', 3500);
    const c2 = cartaoLoja(pL1, S2.descricao);
    await botao(c2, ET('lojaCotacoes.responderCotacaoButton')).click();
    await c2.getByTestId('resposta-quantidade').fill('9');
    await pL1.locator('#c40f3-1').fill('10'); await pL1.locator('#c40f3-2').fill('1');
    await botao(c2, ET('lojaCotacoes.enviarRespostaButton')).click();
    let r2 = null; for (let i = 0; i < 30 && !r2; i++) { r2 = (await A.admin.from('cotacoes_pecas_respostas').select('quantidade_ofertada').eq('cotacao_id', S2.id).eq('loja_id', lj1.id).maybeSingle()).data; if (!r2) await sleep(300); }
    ok('D.7f ofertada acima da pedida (9 > 4): a tela limita a 4 (gravado 4 ou NULL = pedida)', !!r2 && (r2.quantidade_ofertada === null || Number(r2.quantidade_ofertada) === 4), JSON.stringify(r2));
  });
  await ctxL1.close();

  // ======================= D.8: reabrir re-avisa so quem nao respondeu nem dispensou =======================
  await tentar('D.8', async () => {
    const T1 = await quoteHoje(ofComp, 'Reabrir');
    const tA = Date.now();
    const n0 = await A.notificarFornecedores(T1.id, S.comp.token);
    ok('D.8a (preparo) 3 lojas avisadas', n0.status === 200 && (await A.sinoDisponivel(dLoja3.id, T1.id)).length === 1, JSON.stringify(n0.d));
    const { error: e1 } = await resposta(S.lj1, T1, lj1);
    const { error: e2 } = await A.inserirDispensa(S.lj2, T1.id, 'loja', lj2.id);
    if (e1 || e2) throw new Error(`preparo: ${e1?.message} ${e2?.message}`);
    await A.admin.from('cotacoes_pecas').update({ expira_em: horasAtras(1) }).eq('id', T1.id);
    const rv = await A.tarefa();
    ok('D.8b (preparo) tarefa vence a cotacao', rv.d.expiradas >= 1 && (await A.cotacaoNoBanco(T1.id))?.status === 'expirada');
    const tokAntes = (await A.tokensEmail({ cotacao_id: T1.id, profile_id: dLoja3.id })).length;
    const tR = Date.now();
    const rr = await A.reabrir(T1.id, S.comp.token);
    ok(`D.8c POST ${ROTA_REABRIR} -> 200 {status:'respondida', reabertaVezes:1, avisados:1}`, rr.status === 200 && rr.d.status === 'respondida' && rr.d.reabertaVezes === 1 && rr.d.avisados === 1, JSON.stringify(rr));
    const s3 = await A.esperarAviso(dLoja3.id, 'cotacao_peca_disponivel', 20);
    const novo3 = s3.filter((n) => n.dados?.cotacao_id === T1.id);
    const m3 = await emailDe(dLoja3, tR, T1.descricao, 30);
    const log3 = await A.avisosEmail({ cotacao_id: T1.id, profile_id: dLoja3.id });
    const ultimoEnvio3 = Math.max(0, ...log3.map((r) => +new Date(r.enviado_em || 0)));
    ok("D.8d loja 3 (nao respondeu nem dispensou): 2o sino com dados.reaberta = '1' + e-mail imediato (hoje) com token NOVO, e o re-aviso LOGADO na fila (linha reaberta 1, enviado_em >= agora: conta no teto)", novo3.length === 2 && novo3.some((n) => n.dados?.reaberta === '1') && !!m3 && tokensNaoTenho(m3.html).length === 1 && (await A.tokensEmail({ cotacao_id: T1.id, profile_id: dLoja3.id })).length === tokAntes + 1 && log3.length === 2 && log3.some((r) => r.reaberta === 1 && r.tipo === 'imediato') && ultimoEnvio3 >= tR - 1000, `sinos=${novo3.length} email=${!!m3} log=${JSON.stringify(log3.map((r) => [r.reaberta, r.tipo, r.enviado_em]))}`);
    ok('D.8e loja 1 (respondeu) e loja 2 (dispensou): nenhum sino novo, nenhum e-mail', (await A.sinoDisponivel(dLoja1.id, T1.id)).length === 1 && (await A.sinoDisponivel(dLoja2.id, T1.id)).length === 1 && A.emailsDe(dLoja1.email, tR).length === 0 && A.emailsDe(dLoja2.email, tR).length === 0);
    const { error: e3 } = await A.inserirDispensa(S.lj3, T1.id, 'loja', lj3.id);
    await A.admin.from('cotacoes_pecas').update({ expira_em: horasAtras(1) }).eq('id', T1.id);
    await A.tarefa();
    const rr2 = await A.reabrir(T1.id, S.comp.token);
    ok('D.8f reabrir sem ninguem elegivel (todos responderam ou dispensaram): 200 avisados 0, reabertaVezes 2', !e3 && rr2.status === 200 && rr2.d.avisados === 0 && rr2.d.reabertaVezes === 2, JSON.stringify(rr2));
    ok('D.8g e-mails desta rodada ate aqui: nenhum contem a placa', A.emailsDesde(t0).every((m) => semPlaca(m.html)));
  });

  // ======================= D.9: "pedir peca" pre-preenche pela URL =======================
  const ctxM = await nav.contexto('chromium', 390, A.ip); const pM = await ctxM.newPage(); vigiar(pM, erros, 'D.9 compradora 390');
  await tentar('D.9', async () => {
    await entrarPelaTela(pM, '/ee/et', dComp);
    await ir(pM, `/ee/et/oficina/pedidos/${solTeste.id}`, 3000);
    const btn = pM.getByTestId('pedir-peca');
    ok('D.9a /oficina/pedidos/<id> (pedido de teste com carro): botao "pedir peca" (pedir-peca) visivel, sem chave crua', await visivel(btn) && semChaveCrua(await btn.innerText()));
    await btn.click();
    await pM.waitForURL((u) => /\/oficina\/pecas/.test(u.pathname) && u.searchParams.get('solicitacao') === solTeste.id, { timeout: 15000 }).catch(() => {});
    await pM.locator('#c8551-1').waitFor({ timeout: 15000 });
    ok('D.9b abre /oficina/pecas?solicitacao=<id> com o formulario pre-preenchido: marca, modelo, ano e placa do pedido', pM.url().includes(`solicitacao=${solTeste.id}`) && (await pM.locator('#c8551-2').inputValue()) === 'Toyota' && (await pM.locator('#c8551-3').inputValue()) === 'Corolla' && (await pM.locator('#c8551-4').inputValue()) === '2018' && (await pM.getByTestId('cotacao-placa').inputValue()) === 'TA1234', pM.url());
    await pM.locator('#c8551-1').fill(`Pelo pedido ${A.tag}`);
    await botao(pM, ET('oficinaPecas.enviarCotacao')).click();
    let c = null; for (let i = 0; i < 40 && !c; i++) { c = (await A.admin.from('cotacoes_pecas').select('id, fipe_marca').eq('oficina_id', ofComp.id).eq('peca_descricao', `Pelo pedido ${A.tag}`).maybeSingle()).data; if (!c) await sleep(300); }
    ok('D.9c cotacao criada com o carro do pedido e a placa TA1234 em cotacoes_pecas_placa (sem solicitacao_id)', !!c && c.fipe_marca === 'Toyota' && (await A.admin.from('cotacoes_pecas_placa').select('placa').eq('cotacao_id', c.id).maybeSingle()).data?.placa === 'TA1234');
    await pM.screenshot({ path: `${PRINTS}/lote2-pedir-peca-et-390.png`, fullPage: true });
    await ir(pM, `/ee/et/oficina/pecas?solicitacao=${solReal.id}`, 3000);
    if (!(await pM.locator('#c8551-1').isVisible().catch(() => false))) await botao(pM, ET('oficinaPecas.novaCotacao')).click().catch(() => {});
    await pM.locator('#c8551-1').waitFor({ timeout: 10000 }).catch(() => {});
    ok('D.9d pedido que a oficina NAO ve (RLS: motorista real x oficina de teste): formulario vazio, sem erro', (await pM.locator('#c8551-2').inputValue().catch(() => 'x')) === '' && (await pM.getByTestId('cotacao-placa').inputValue().catch(() => 'x')) === '' && (await pM.getByTestId('cotacao-erro-criar').count()) === 0 && !/RE9999/.test(await pM.innerText('body')));
  });

  // ======================= D.10: L2.6 =======================
  await tentar('D.10', async () => {
    // tarefa de vencer: 600 reais vencidas + 1 de teste -> expiradas 1 (o lote de 500 nao engole a de teste)
    const lote = Array.from({ length: 600 }, (_, i) => ({ oficina_id: ofReal.id, peca_descricao: `TESTE-PECAS massa ${i} ${A.tag}`, quantidade: 1, expira_em: horasAtras(3 + i / 100) }));
    for (let i = 0; i < lote.length; i += 200) { const { error } = await A.admin.from('cotacoes_pecas').insert(lote.slice(i, i + 200)); if (error) throw new Error('massa: ' + error.message); }
    const cT = await A.cotacao(ofComp3, 'Vencida de teste no meio', { expira_em: horasAtras(1) });
    const rv = await A.tarefa();
    ok('D.10a 600 cotacoes reais vencidas (global off) + 1 de teste: expiradas 1 numa chamada e a de teste venceu', rv.status === 200 && rv.d.expiradas === 1 && (await A.cotacaoNoBanco(cT.id))?.status === 'expirada', JSON.stringify(rv));
    await A.admin.from('cotacoes_pecas').delete().eq('oficina_id', ofReal.id).like('peca_descricao', `TESTE-PECAS massa %`);
    // global ligado -> desligado: cotacao real expirada continua com "reabrir"
    await A.interruptor(true);
    const cR = await A.cotacao(ofReal, 'Real expirada com global', { expira_em: horasAtras(1) });
    const rv2 = await A.tarefa();
    await A.interruptor(false);
    ok('D.10b (preparo) com o global ligado a real vence; global de volta a desligado', rv2.d.expiradas >= 1 && (await A.cotacaoNoBanco(cR.id))?.status === 'expirada' && A.interruptorEstado() === false);
    const ctxR = await nav.contexto('chromium', 390, A.ip); const pR = await ctxR.newPage(); vigiar(pR, erros, 'D.10 real');
    await entrarPelaTela(pR, '/ee/et', dReal);
    await ir(pR, '/ee/et/oficina/pecas', 3000);
    const card = cardCom(pR, cR.descricao);
    ok('D.10c compradora REAL (tela de hoje) ve a expirada com o botao reabrir', await visivel(card.getByTestId('cotacao-reabrir')));
    await card.getByTestId('cotacao-reabrir').click();
    let c = null; for (let i = 0; i < 30; i++) { c = await A.cotacaoNoBanco(cR.id); if (c?.status !== 'expirada') break; await sleep(300); }
    ok("D.10d reabrir funciona sem v3: 'aberta', reaberta_vezes 1", c?.status === 'aberta' && c?.reaberta_vezes === 1, JSON.stringify(c));
    await ctxR.close();
    // resumo por cotacao com o global DESLIGADO e conta REAL: a linha fica pendente; so sai com o global ligado
    if (A.temSimulacao) {
      const cotRp = await A.cotacao(ofReal, 'Real sem pressa', { urgencia: 'sem_pressa', alvo: 'so_lojas' });
      const { error: eRp } = await A.admin.from('avisos_email_pecas').insert({ profile_id: dLojaReal.id, cotacao_id: cotRp.id, fornecedor_tipo: 'loja', tipo: 'resumo', motivo: 'sem_pressa' });
      const tRp = Date.now();
      const rOff = await A.resumo(tallinnEmUtc(DIA2, '10:53'));
      const lOff = (await A.avisosEmail({ cotacao_id: cotRp.id, profile_id: dLojaReal.id }))[0];
      await sleep(1000);
      ok('D.10d2 global DESLIGADO: linha de resumo de conta REAL continua pendente e a loja real nao recebe e-mail', !eRp && rOff.status === 200 && !!lOff && lOff.enviado_em === null && A.emailsDe(dLojaReal.email, tRp).length === 0, `${eRp?.message || ''} ${JSON.stringify({ rOff: rOff.d, lOff })}`);
      await A.interruptor(true);
      const rOn = await A.resumo(tallinnEmUtc(DIA2, '12:53'));
      await A.interruptor(false);
      const lOn = (await A.avisosEmail({ cotacao_id: cotRp.id, profile_id: dLojaReal.id }))[0];
      const mRp = await emailDe(dLojaReal, tRp, cotRp.descricao, 20);
      ok('D.10d3 global LIGADO: a mesma linha sai no slot seguinte (enviado_em preenchido) com 1 e-mail a loja real; global restaurado', rOn.status === 200 && !!lOn?.enviado_em && !!mRp && A.interruptorEstado() === false, JSON.stringify({ rOn: rOn.d, lOn }));
    } else ok('D.10d2 paridade do resumo com o global desligado', false, 'TAREFAS_SIMULAR_HORA=1 ausente');
    // funcionario: sem telefone comercial (campo e RLS)
    const ctxF = await nav.contexto('chromium', 390, A.ip); const pF = await ctxF.newPage(); vigiar(pF, erros, 'D.10 funcionario');
    await entrarPelaTela(pF, '/ee/et', func);
    await ir(pF, '/ee/et/oficina/perfil', 3000);
    const { error: eF } = await S.func.c.from('fornecedores_contato').upsert({ fornecedor_tipo: 'oficina', fornecedor_id: ofComp.id, telefone: '+372 600 0002' }, { onConflict: 'fornecedor_tipo,fornecedor_id' });
    ok('D.10e funcionario (conta de teste): a pagina do perfil carregou (#c83a1-9), sem campo perfil-telefone-comercial, upsert recusado (42501)', (await pF.locator('#c83a1-9').count()) === 1 && (await pF.getByTestId('perfil-telefone-comercial').count()) === 0 && eF?.code === '42501', eF ? `${eF.code} ${eF.message}` : 'gravou');
    await ctxF.close();
    // placa normalizada no campo
    await ir(pM, '/ee/et/oficina/pecas', 2500);
    await botao(pM, ET('oficinaPecas.novaCotacao')).click();
    await pM.getByTestId('cotacao-placa').waitFor({ timeout: 10000 });
    await pM.getByTestId('cotacao-placa').fill('д123 ab');
    await pM.locator('#c8551-1').click();
    await pM.waitForTimeout(300);
    ok('D.10f placa "д123 ab" vira "123AB" no proprio campo ao sair dele', (await pM.getByTestId('cotacao-placa').inputValue()) === '123AB', await pM.getByTestId('cotacao-placa').inputValue());
  });
  await ctxM.close(); await ctxD.close();

  // ======================= D.11: paridade =======================
  await tentar('D.11', async () => {
    const cots = (await A.admin.from('cotacoes_pecas').select('id').in('oficina_id', [ofComp.id, ofComp2.id, ofComp3.id])).data.map((c) => c.id);
    const fila = (await A.avisosEmail({ profile_id: dLojaReal.id })).filter((r) => cots.includes(r.cotacao_id));
    const toks = (await A.tokensEmail({ profile_id: dLojaReal.id })).filter((r) => cots.includes(r.cotacao_id));
    ok('D.11a loja REAL: nenhuma linha em avisos_email_pecas nem em pecas_links_email para cotacoes de teste', fila.length === 0 && toks.length === 0, `fila=${fila.length} tokens=${toks.length}`);
    ok('D.11b loja REAL nao le dispensas de cotacoes de teste (select = 0) e nao recebeu e-mail algum nesta rodada', ((await S.ljReal.c.from('cotacoes_pecas_dispensas').select('*')).data || []).length === 0 && A.emailsDe(dLojaReal.email, t0).length === 0);
    const { error } = await A.inserirDispensa(S.ljReal, Q2.id, 'loja', ljReal.id);
    ok('D.11c loja REAL nao dispensa cotacao de teste (RLS 42501)', error?.code === '42501', error ? `${error.code} ${error.message}` : 'gravou');
    console.log('info D.11 Varuosamees: nao existe no banco local; em producao conferir count(*) = 0 em cotacoes_pecas e cotacoes_pecas_dispensas com o JWT dela (fase E)');
  });

  // ======================= D.12: i18n =======================
  await tentar('D.12', async () => {
    const todas = Object.fromEntries(IDIOMAS.map((l) => [l, mensagens(l)]));
    const faltam = [];
    for (const l of IDIOMAS) for (const k of CHAVES_I18N_L2) { const v = pegaChave(todas[l], k); if (typeof v !== 'string' || !v.trim()) faltam.push(`${l}:${k}`); }
    ok(`D.12a as ${CHAVES_I18N_L2.length} chaves novas do lote 2 (pecas.*) nos 6 idiomas, nao vazias`, faltam.length === 0, faltam.join(', '));
    const iguais = CHAVES_I18N_L2_TEXTO.filter((k) => pegaChave(todas.et, k) === pegaChave(todas.pt, k) || pegaChave(todas.ru, k) === pegaChave(todas.pt, k));
    ok('D.12b ET e RU traduzidos de verdade', iguais.length === 0, iguais.join(', '));
    ok('D.12c pecas.naoTemContagem e pecas.ofertaParcial com variaveis ({n}; {ofertada} e {pedida})', IDIOMAS.every((l) => /\{n\b/.test(String(pegaChave(todas[l], 'pecas.naoTemContagem'))) && /\{ofertada\}/.test(String(pegaChave(todas[l], 'pecas.ofertaParcial'))) && /\{pedida\}/.test(String(pegaChave(todas[l], 'pecas.ofertaParcial')))));
    let saida = '', okChk = true;
    try { saida = execSync(`node "${path.join(WEB, 'scripts/checar-traducoes.mjs')}"`, { cwd: WEB }).toString(); } catch (e) { okChk = false; saida = String(e.stdout || e.message); }
    ok('D.12d checar-traducoes.mjs passa', okChk, saida.slice(-300));
    // pagina /n nos 6 idiomas com um token valido (ver nao gasta)
    const QL = await quoteHoje(ofComp3, 'Idiomas pagina');
    await A.notificarFornecedores(QL.id, S.comp3.token);
    const mL = await emailDe(dLoja2, t0, QL.descricao, 30);
    const kL = mL ? tokensNaoTenho(mL.html)[0]?.token : null;
    for (const l of IDIOMAS) {
      await pN.goto(`${SITE}/n/${kL}?o=${encodeURIComponent(l)}`, { waitUntil: 'networkidle' }).catch(() => {});
      const okPag = await pN.getByTestId('nao-tenho-peca').waitFor({ timeout: 10000 }).then(() => true, () => false);
      const corpo = await pN.innerText('body');
      ok(`D.12e [${l}] pagina "nao tenho" no slug traduzido: peca visivel, sem chave crua, sem rolagem lateral`, okPag && pN.url().includes(SLUG_NAO_TENHO[l]) && (await pN.getByTestId('nao-tenho-peca').innerText()).includes(QL.descricao) && semChaveCrua(corpo) && await semRolagemLateral(pN), `${pN.url()} ${corpo.match(/\?\?[a-zA-Z.]+|\bpecas\.[a-zA-Z.]+|undefined/g)?.join(',') || ''}`);
      if (l === 'ru') await pN.screenshot({ path: `${PRINTS}/lote2-nao-tenho-ru-390.png`, fullPage: true });
    }
    // e-mails imediato e resumo em 6 idiomas (uma loja por idioma)
    const lojasL = {};
    for (const l of IDIOMAS) { const d = await A.conta('loja_pecas', `loja-${l.toLowerCase()}`, { contaTeste: true, idioma: l }); lojasL[l] = { d, lj: await A.loja(d, `Loja ${l}`) }; }
    const QI = await quoteHoje(ofComp3, 'Idiomas imediato');
    const tI = Date.now();
    await A.notificarFornecedores(QI.id, S.comp3.token);
    for (const l of IDIOMAS) {
      const m = await emailDe(lojasL[l].d, tI, QI.descricao, 40);
      const toks = m ? tokensNaoTenho(m.html) : [];
      ok(`D.12f [${l}] e-mail imediato: sem chave/variavel crua, urgencia + "aberta ate", 1 token com ?o=${l}, sem placa`, !!m && semPlaceholder(m.texto) && /data-campo="urgencia"/.test(m.html) && /data-campo="aberta-ate"/.test(m.html) && toks.length === 1 && toks[0].idioma === l && semPlaca(m.html), m?.assunto);
    }
    const QR = await A.cotacao(ofComp3, 'Idiomas resumo', { urgencia: 'sem_pressa', alvo: 'so_lojas' });
    await A.notificarFornecedores(QR.id, S.comp3.token);
    const tRs = Date.now();
    const rs = await A.resumo(tallinnEmUtc(DIA1, '16:53'));
    for (const l of IDIOMAS) {
      const m = await A.esperarEmail(lojasL[l].d.email, tRs, (e) => e.html.includes(`data-cotacao="${QR.id}"`), 30);
      ok(`D.12g [${l}] e-mail de resumo: lista a cotacao, sem chave/variavel crua, token com ?o=${l}, link neutro`, rs.d.resumos >= 6 && !!m && semPlaceholder(m.texto) && tokensNaoTenho(m.html).some((x) => x.idioma === l) && linksNeutros(m.html).length >= 1, m?.assunto || JSON.stringify(rs.d));
    }
  });
  await ctxN.close();

  ok('sem erro de pagina nos navegadores', erros.length === 0, erros.join(' | '));
  ok('NENHUM e-mail desta rodada contem a placa', A.emailsDesde(t0).every((m) => semPlaca(m.html)));
} catch (e) {
  ok('excecao geral', false, e?.stack || e?.message);
} finally {
  await nav.fechar();
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  ok('limpeza: nada desta rodada ficou no banco nem na pasta de e-mails; interruptor restaurado', errosLimpeza.length === 0 && sobras.length === 0, [...errosLimpeza, ...sobras].join(' | '));
  process.exitCode = fim() ? 1 : 0;
}
