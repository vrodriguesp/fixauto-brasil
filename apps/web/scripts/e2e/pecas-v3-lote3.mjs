// E2E LOCAL do lote 3 de pecas ("confianca") com contas de TESTE (interruptor global desligado; a tela nova vale
// pela conta_teste) - Mapa_lote3.md sec. 3-9 + Decisoes_dono_2026-11-17.md (D-1..D-12) + Fable_auditoria_mapa_lote3.md.
// Testes escritos ANTES da implementacao por um autor independente (o Fable estava sem creditos em 17/11);
// contrato em Documentos/Analises/Pecas_lote3_2026-11-17/Contrato_testids_lote3.md. Antes do codigo este script
// FALHA (esperado): rotas 404, colunas/tabelas inexistentes.
//   E.0 migracao 093 | E.2 ciclo: entregue -> Recebi -> avaliacao (edicao 48 h, regex, resposta 1x, denuncia, ocultar)
//   E.3 "nao entregou" (D-4) + D-5 reabrir para as outras ofertas | E.4 cancelamento com motivo pelos dois lados +
//   D-5 vencida -> "pedir de novo" | E.5 P-7 (D-7: retorno E avaliacao; cotacao nova E confirmacao bloqueadas; banner
//   por pedido; o que continua liberado; pecas_p7_minimo; admin) | E.6 lembretes D+1/D+3 pela tarefa com hora simulada
//   (+ 6 idiomas) | E.7 contato ate recebido/entregue + 30 dias (P-13) | E.8 avaliacoes publicas a oficinas E lojas
//   (D-3), nome da autora (D-1), fornecedor_resumo (media NULL < 3), RLS por REST, tela da loja | E.9 3b: alcance
//   "pais", condicao, P-20, nota da fornecedora | E.10 3c push do navegador (PECAS_LOTE3_SEM_PUSH=1 pula) |
//   E.11 itens de qualidade do lote 2 | E.12 i18n | E.13 limite 30/h do marcar-entregue
// Exige TAREFAS_SIMULAR_HORA=1 no .env.local (lembretes com hora injetada) e, para o 3c, WEB_PUSH_URL_TESTE
// (servidor falso que este script sobe). Reinicie o :3100 antes (limites e teto ficam na memoria do processo).
// Ctrl+C limpa. Nao rodar junto com outras suites nem entre 23:55 e 00:05 Europe/Tallinn.
//   node pecas-v3-lote3.mjs [<.env.local>]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { lerEnv, ambienteL3, abrirNavegadores, contador, tradutor, mensagens, pegaChave, IDIOMAS, PREFIXO, SITE, WEB, RAIZ, ENV_PADRAO, siteNoAr, semRolagemLateral, vigiar, entrarPelaTela, ir, visivel, semChaveCrua, botao, PRINTS, sleep, DIA_MS, psql, linksNeutros, tokensNaoTenho, SLUG_NAO_TENHO, pastaEmailsBloqueada, ROTA, PROBLEMAS, CHAVES_I18N_L3, CHAVES_I18N_L3_TEXTO, POLITICAS_INTOCADAS_SQL, POLITICAS_INTOCADAS_MD5, difMin } from './pecas-v3-lote3-lib.mjs';

const env = lerEnv(process.argv[2] || ENV_PADRAO);
if (!(await siteNoAr())) { console.log(`FALHA site local nao responde em ${SITE} - nada rodou (nao inicio o site sozinho)`); process.exit(2); }
const A = ambienteL3(env);
const { ok, fim, tentar } = contador();
const ET = tradutor('et');
const erros = [];
const SEM_PUSH = process.env.PECAS_LOTE3_SEM_PUSH === '1';
const nav = await abrirNavegadores(false);
A.limparAoInterromper(nav.fechar);
const cardCom = (p, texto) => p.getByTestId('cotacao-peca').filter({ hasText: texto });
const formDe = (p, pedidoId) => p.locator(`[data-testid="avaliar-form"][data-pedido="${pedidoId}"]`);
const marcar = (loc) => loc.check({ force: true });
const agoraIso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const esperar = async (fn, cond, n = 30, ms = 300) => { let v; for (let i = 0; i < n; i++) { v = await fn(); if (cond(v)) return v; await sleep(ms); } return v; };
const ped = (id) => (id ? A.pedidoNoBanco(id) : null);
const codigo = (r, status, cod) => r.status === status && (cod === undefined || r.d?.codigo === cod);
const mostra = (r) => `${r.status} ${JSON.stringify(r.d).slice(0, 160)}`;
const semPlaceholder = (s) => !/\?\?[a-zA-Z]|\{[a-zA-Z]+\}|\bundefined\b|\bNaN\b|\bpecas\.[a-zA-Z]/.test(String(s));
// login com folga para o limite do GoTrue local (30 logins / 5 min por IP)
const sessao = async (u) => { for (let i = 0; i < 8; i++) { try { return await A.sessao(u); } catch (e) { if (!/rate|too many|429/i.test(String(e.message))) throw e; console.log('info login limitado pelo GoTrue local: espero 40 s'); await sleep(40000); } } throw new Error(`login ${u.email}: limite do GoTrue`); };
const contatoDe = async (pedidoId, s) => (await A.contato([pedidoId], s.token)).d?.contatos?.[pedidoId] || null;
const linhaRest = async (s, tabela, filtro) => { let q = s.c.from(tabela).select('*'); for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v); const { data, error } = await q; return { linhas: data || [], error }; };
const t0 = Date.now();

try {
  // ======================= E.0: migracao 093 (estatico) =======================
  await tentar('E.0', async () => {
    const col = (t, c) => psql(`select data_type||':'||is_nullable||':'||coalesce(column_default,'') from information_schema.columns where table_schema='public' and table_name='${t}' and column_name='${c}'`);
    const colsP = { v3: 'boolean:YES:', recebido_em: 'timestamp with time zone:YES:', problema: 'text:YES:', problema_em: 'timestamp with time zone:YES:', problema_texto: 'text:YES:', cancelado_por: 'text:YES:', cancelado_motivo: 'text:YES:', cancelado_texto: 'text:YES:', cancelado_em: 'timestamp with time zone:YES:', entregue_em: 'timestamp with time zone:YES:', contato_visivel_ate: 'timestamp with time zone:YES:', lembretes_feedback: 'integer:NO:0', pos_cancelamento: 'text:YES:', nova_cotacao_id: 'uuid:YES:' };
    const difP = Object.entries(colsP).filter(([c, esp]) => col('pedidos_pecas', c) !== esp).map(([c, esp]) => `${c}=${col('pedidos_pecas', c) || 'ausente'} (esperado ${esp})`);
    ok('E.0a pedidos_pecas: 14 colunas novas com os tipos do contrato (todas NULL, sem default; lembretes_feedback int NOT NULL DEFAULT 0)', difP.length === 0, difP.join('; '));
    const chk = psql("select coalesce(string_agg(pg_get_constraintdef(oid), ' | '),'') from pg_constraint where conrelid='pedidos_pecas'::regclass and contype='c'");
    ok("E.0b CHECKs: problema (4), cancelado_por (compradora/fornecedor/admin), motivo (8), pos_cancelamento (2), textos 300/200", ['nao_entregou', 'peca_errada', 'avariada', "'compradora'", "'fornecedor'", "'admin'", 'sem_estoque', 'prazo', 'compradora_pediu', 'comprei_outro', 'carro_saiu', 'erro_pedido', 'reaberta', 'nova_cotacao', '300', '200'].every((s) => chk.includes(s)), chk.slice(0, 400));
    ok('E.0c CHECK de coerencia numa direcao so: cancelado_por IS NULL OR status = cancelado (texto da constraint)', /cancelado_por IS NULL\) OR \(status = 'cancelado'/.test(chk) || /cancelado_por IS NULL OR status = 'cancelado'/.test(chk), chk.slice(0, 300));
    ok('E.0d nova_cotacao_id -> cotacoes_pecas ON DELETE SET NULL', psql("select coalesce(string_agg(confdeltype::text, ','), '') from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum = any(c.conkey) where c.conrelid='pedidos_pecas'::regclass and c.contype='f' and a.attname='nova_cotacao_id'") === 'n');
    ok('E.0e indice parcial pedidos_pecas (oficina_id) WHERE v3', Number(psql("select count(*) from pg_indexes where tablename='pedidos_pecas' and indexdef ilike '%(oficina_id)%' and indexdef ilike '%where%v3%'")) >= 1);
    const colsA = psql("select coalesce(string_agg(column_name, ',' order by column_name),'') from information_schema.columns where table_name='fornecedores_avaliacoes'").split(',');
    const faltaA = ['id', 'pedido_id', 'oficina_id', 'autor_profile_id', 'fornecedor_tipo', 'fornecedor_id', 'nota', 'peca_certa', 'no_prazo', 'nao_entregou', 'comentario', 'resposta', 'resposta_em', 'editavel_ate', 'oculta', 'oculta_motivo', 'oculta_por', 'denunciada_em', 'criado_em', 'atualizado_em'].filter((c) => !colsA.includes(c));
    const chkA = psql("select coalesce(string_agg(pg_get_constraintdef(oid), ' | '),'') from pg_constraint where conrelid=to_regclass('public.fornecedores_avaliacoes')");
    const polA = psql("select coalesce(string_agg(polname||':'||polcmd::text, ','),'') from pg_policy where polrelid=to_regclass('public.fornecedores_avaliacoes')");
    ok('E.0f fornecedores_avaliacoes: colunas do contrato, pedido_id UNIQUE (FK CASCADE), nota 1..5, textos <= 300, RLS ligada com UMA politica (SELECT) e nenhuma de escrita, indice (fornecedor_tipo, fornecedor_id) WHERE NOT oculta', A.tabelaExiste('fornecedores_avaliacoes') && faltaA.length === 0 && /UNIQUE \(pedido_id\)/.test(chkA) && /ON DELETE CASCADE/.test(chkA) && /nota >= 1/.test(chkA) && /nota <= 5/.test(chkA) && /300/.test(chkA) && psql("select relrowsecurity from pg_class where relname='fornecedores_avaliacoes'") === 't' && /^[a-z_]+:r$/.test(polA) && Number(psql("select count(*) from pg_indexes where tablename='fornecedores_avaliacoes' and indexdef ilike '%fornecedor_tipo, fornecedor_id%' and indexdef ilike '%not oculta%'")) >= 1, `faltam=${faltaA.join(',')} | ${polA} | ${chkA.slice(0, 200)}`);
    const fn = (nome) => psql(`select coalesce((select prosecdef::text||':'||provolatile::text||':'||coalesce(array_to_string(proconfig, ';'),'')||':'||has_function_privilege('anon', p.oid, 'execute')::text||':'||has_function_privilege('authenticated', p.oid, 'execute')::text from pg_proc p where proname='${nome}' and pronamespace='public'::regnamespace limit 1), 'ausente')`);
    for (const nome of ['fornecedor_conta_teste', 'fornecedor_resumo', 'oficina_feedback_pecas_pendente']) {
      const f = fn(nome);
      ok(`E.0g funcao ${nome}: SECURITY DEFINER, STABLE, search_path=public, sem EXECUTE para anon/PUBLIC, com EXECUTE para authenticated`, /^true:s:search_path=public(, ?pg_temp)?:false:true$/.test(f), f);
    }
    ok('E.0h plataforma_config.pecas_p7_minimo integer NOT NULL DEFAULT 1 (valor 1)', col('plataforma_config', 'pecas_p7_minimo') === 'integer:NO:1' && psql("select coalesce(to_jsonb(c)->>'pecas_p7_minimo','') from plataforma_config c where id=1") === '1', col('plataforma_config', 'pecas_p7_minimo'));
    const pIns = A.politica('cotacoes_pecas', 'cotacoes_pecas_insert');
    ok('E.0i cotacoes_pecas_insert = a de hoje (dono, ativa) + AND NOT oficina_feedback_pecas_pendente(oficina_id)', /oficina_feedback_pecas_pendente\(oficina_id\)/.test(pIns) && /profile_id = auth\.uid\(\)/.test(pIns) && /ativa/.test(pIns), pIns.slice(0, 300));
    ok('E.0j demais politicas de pecas/oficinas/lojas/notificacoes IDENTICAS (D-12: sem anonimato)', psql(POLITICAS_INTOCADAS_SQL) === POLITICAS_INTOCADAS_MD5, psql(POLITICAS_INTOCADAS_SQL));
    const chkO = psql("select coalesce(string_agg(pg_get_constraintdef(oid), ' | '),'') from pg_constraint where conrelid='oficinas'::regclass and contype='c'");
    const chkR = psql("select coalesce(string_agg(pg_get_constraintdef(oid), ' | '),'') from pg_constraint where conrelid='cotacoes_pecas_respostas'::regclass and contype='c'");
    ok("E.0k 3b: oficinas.pecas_alcance text NULL CHECK ('pais','raio'); cotacoes_pecas_respostas.condicao text NULL CHECK (4 valores)", col('oficinas', 'pecas_alcance') === 'text:YES:' && /pecas_alcance/.test(chkO) && /'raio'/.test(chkO) && col('cotacoes_pecas_respostas', 'condicao') === 'text:YES:' && ['sobra_nova', 'usada_propria', 'recondicionada'].every((v) => chkR.includes(v)), `${col('oficinas', 'pecas_alcance')} ${col('cotacoes_pecas_respostas', 'condicao')}`);
    const chkAv = psql("select coalesce(string_agg(pg_get_constraintdef(oid), ' | '),'') from pg_constraint where conrelid='avisos_email_pecas'::regclass and contype='c'");
    ok("E.0l lote 2: avisos_email_pecas.fornecedor_id uuid NULL; CHECK de motivo aceita 'falha'", col('avisos_email_pecas', 'fornecedor_id') === 'uuid:YES:' && /'falha'/.test(chkAv), chkAv.slice(0, 200));
    ok('E.0m tabelas novas FORA do tempo real (fornecedores_avaliacoes, push_navegador); pedidos_pecas continua', psql("select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename in ('fornecedores_avaliacoes','push_navegador')") === '0' && psql("select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='pedidos_pecas'") === '1');
    if (!SEM_PUSH) {
      const colsN = psql("select coalesce(string_agg(column_name, ',' order by column_name),'') from information_schema.columns where table_name='push_navegador'").split(',');
      ok('E.0n 3c push_navegador: colunas do contrato, endpoint UNIQUE, RLS ligada SEM politica', ['id', 'profile_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'criado_em', 'ultimo_ok', 'ultimo_erro', 'falhas'].every((c) => colsN.includes(c)) && /UNIQUE \(endpoint\)/.test(psql("select coalesce(string_agg(pg_get_constraintdef(oid), ' | '),'') from pg_constraint where conrelid=to_regclass('public.push_navegador')")) && psql("select relrowsecurity from pg_class where relname='push_navegador'") === 't' && psql("select count(*) from pg_policy where polrelid=to_regclass('public.push_navegador')") === '0', colsN.join(','));
    }
    const arqs = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((f) => /^093_.*\.sql$/.test(f));
    let okIdem = arqs.length === 1, saida = arqs.join(',') || 'sem arquivo 093_*.sql';
    if (okIdem) {
      const sql = fs.readFileSync(path.join(RAIZ, 'supabase/migrations', arqs[0]), 'utf8');
      if (/^\s*(COMMIT|END)\s*;/im.test(sql)) { okIdem = false; saida = 'COMMIT/END de topo'; }
      else if (/ADD\s+VALUE/i.test(sql)) { okIdem = false; saida = 'ALTER TYPE ... ADD VALUE (nao roda dentro de psql -1)'; }
      else if (!/lock_timeout/i.test(sql) || !/NOTIFY\s+pgrst/i.test(sql)) { okIdem = false; saida = 'faltam SET LOCAL lock_timeout / NOTIFY pgrst'; }
      else { try { psql(`BEGIN;\n${sql}\nROLLBACK;`); } catch (e) { okIdem = false; saida = String(e.stderr || e.message).slice(0, 300); } }
    }
    ok('E.0o migracao 093 existe (1 arquivo), sem COMMIT, sem ADD VALUE, com lock_timeout e NOTIFY pgrst, idempotente (roda de novo numa transacao desfeita)', okIdem, saida);
    const tipos = fs.readFileSync(path.join(RAIZ, 'packages/shared/types/index.ts'), 'utf8');
    ok('E.0p packages/shared: v3, recebido_em, cancelado_motivo, contato_visivel_ate nos tipos', ['v3', 'recebido_em', 'cancelado_motivo', 'contato_visivel_ate'].every((c) => new RegExp(`\\b${c}\\??:`).test(tipos)));
    const fonte = ['src/app/api/tarefas/feedback-pecas/route.ts', 'src/lib/feedback-pecas.ts'].map((f) => path.join(WEB, f)).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    ok("E.0q a tarefa de lembretes so honra { agora } com process.env.TAREFAS_SIMULAR_HORA === '1' (guarda no fonte)", /TAREFAS_SIMULAR_HORA\s*===\s*'1'/.test(fonte), fonte ? 'guarda nao encontrada' : 'rota/lib feedback-pecas nao existe');
    ok('E.0r TAREFAS_SIMULAR_HORA=1 no .env.local do site', A.temSimulacao, 'acrescente TAREFAS_SIMULAR_HORA=1 ao apps/web/.env.local e reinicie o :3100');
  });

  // ======================= contas =======================
  const dC1 = await A.conta('oficina', 'compradora1', { contaTeste: true }); const ofC1 = await A.oficina(dC1, 'Compradora 1', { km: 0 });
  const dC2 = await A.conta('oficina', 'compradora2', { contaTeste: true }); const ofC2 = await A.oficina(dC2, 'Compradora 2', { km: 0.3, vendePecas: true });
  const dC3 = await A.conta('oficina', 'compradora3', { contaTeste: true }); const ofC3 = await A.oficina(dC3, 'Compradora 3', { km: 0.5 });
  const dC4 = await A.conta('oficina', 'compradora4', { contaTeste: true }); const ofC4 = await A.oficina(dC4, 'Compradora 4', { km: 0.4 });
  const dC5 = await A.conta('oficina', 'oficina-inativa', { contaTeste: true }); const ofC5 = await A.oficina(dC5, 'Oficina inativa', { km: 0.6, ativa: false });
  await A.admin.from('oficinas').update({ cnpj: '12-345-678' }).eq('id', ofC4.id); // P-20: mesmo registro que as lojas de teste (cnpj '12345678')
  const lojas = {};
  for (const k of ['1', '2', '3', '4', '5']) { const d = await A.conta('loja_pecas', `loja${k}`, { contaTeste: true, telefone: `+372 5100 000${k}` }); lojas[k] = { d, lj: await A.loja(d, `Loja ${k}`) }; }
  const [L1, L2, L3, L4, L5] = ['1', '2', '3', '4', '5'].map((k) => lojas[k].lj);
  const dV = await A.conta('oficina', 'vendedora', { contaTeste: true }); const ofV = await A.oficina(dV, 'Vendedora', { km: 2, vendePecas: true });
  const dVp = await A.conta('oficina', 'vendedora-pais', { contaTeste: true }); const ofVp = await A.oficina(dVp, 'Vendedora pais', { km: 200, vendePecas: true });
  const dVr = await A.conta('oficina', 'vendedora-raio', { contaTeste: true }); const ofVr = await A.oficina(dVr, 'Vendedora raio', { km: 200, vendePecas: true });
  const dVi = await A.conta('oficina', 'vendedora-it', { contaTeste: true }); const ofVi = await A.oficina(dVi, 'Vendedora IT', { km: 200, vendePecas: true, pais: 'IT' });
  const temAlcance = A.temColuna('oficinas', 'pecas_alcance');
  if (temAlcance) await A.admin.from('oficinas').update({ pecas_alcance: 'pais' }).in('id', [ofVp.id, ofVi.id]);
  const dReal = await A.conta('oficina', 'compradora-real'); const ofReal = await A.oficina(dReal, 'Compradora real', { km: 0.8 });
  const dLojaReal = await A.conta('loja_pecas', 'loja-real'); const ljReal = await A.loja(dLojaReal, 'Loja real');
  const cli = await A.cliente('motorista', { contaTeste: true });
  const adm = await A.conta('admin', 'admin', { idioma: 'pt' });
  const func1 = await A.funcionario(ofC1, 'funcionario1');
  const func2 = await A.funcionario(ofC2, 'funcionario2');
  const S = {};
  for (const [k, u] of Object.entries({ c1: dC1, c2: dC2, c3: dC3, c4: dC4, c5: dC5, l1: lojas['1'].d, l2: lojas['2'].d, l3: lojas['3'].d, l4: lojas['4'].d, l5: lojas['5'].d, v: dV, real: dReal, ljReal: dLojaReal, cli, adm, f1: func1, f2: func2 })) S[k] = await sessao(u);
  { const e = await A.interruptor(false); ok('E.1 interruptor global desligado para a rodada (contas de teste veem a tela nova pela sessao)', !e && A.interruptorEstado() === false, e?.message); }
  const tem093 = A.tem093();
  if (!tem093) console.log('info 093 ausente (pedidos_pecas.v3 / fornecedores_avaliacoes): os grupos abaixo falham por "feature ausente" - esperado antes da implementacao');
  const resposta = (cot, loja, preco) => A.resposta(cot, loja, { preco });
  let P1 = null, Q2 = null, P2 = null, P3 = null, P4 = null, P6 = null, Q6 = null, avP1 = null, Q9 = null;

  // ======================= E.0b: CHECKs na pratica (service role) =======================
  await tentar('E.0 pratica', async () => {
    const pk = await A.pedidoV3(ofC3, L3, { descricao: 'Check' });
    const { error: e1 } = await A.admin.from('pedidos_pecas').update({ cancelado_por: 'admin' }).eq('id', pk.id);
    ok('E.0s CHECK: cancelado_por preenchido com status confirmado -> 23514', e1?.code === '23514', e1 ? `${e1.code} ${e1.message}` : 'gravou');
    const { error: e2 } = await A.admin.from('pedidos_pecas').update({ status: 'cancelado' }).eq('id', pk.id);
    ok('E.0t ... e status cancelado SEM cancelado_por passa (uma direcao so: admin/corrigir de hoje nao quebra)', !e2, e2?.message);
    const { error: e3 } = await A.admin.from('pedidos_pecas').update({ cancelado_por: 'fornecedor', cancelado_motivo: 'sem_estoque', cancelado_texto: 'x'.repeat(201) }).eq('id', pk.id);
    const { error: e4 } = await A.admin.from('pedidos_pecas').update({ problema: 'quebrou' }).eq('id', pk.id);
    ok('E.0u CHECK: cancelado_texto > 200 e problema fora da lista -> 23514', e3?.code === '23514' && e4?.code === '23514', `${e3?.code} ${e4?.code}`);
  });

  // ======================= E.2: ciclo entregue -> Recebi -> avaliacao =======================
  const ctxD = await nav.contexto('chromium', 1280, A.ip); const pD = await ctxD.newPage(); vigiar(pD, erros, 'E.2 compradora1');
  await tentar('E.2', async () => {
    const Q1 = await A.cotacao(ofC1, 'Ciclo', { urgencia: 'hoje', alvo: 'so_lojas' });
    const r1 = await resposta(Q1, L1, 20);
    const rc = await A.confirmar(r1, S.c1.token);
    P1 = rc.d?.pedidoId || null;
    const j0 = ped(P1);
    ok('E.2a confirmar (compradora de teste) grava v3 = true; contato_visivel_ate NULL antes da entrega; lembretes 0', rc.status === 200 && j0?.v3 === true && j0?.contato_visivel_ate === null && Number(j0?.lembretes_feedback) === 0, JSON.stringify(j0)?.slice(0, 300));
    const tE = Date.now();
    const re = await A.entregue(P1, S.l1);
    const j1 = await esperar(() => ped(P1), (j) => j?.status === 'entregue');
    ok('E.2b marcar-pedido-peca-entregue (v3): entregue_em = agora, contato_visivel_ate = entregue_em + 30 d', re.status === 200 && difMin(j1?.entregue_em, agoraIso()) < 2 && difMin(j1?.contato_visivel_ate, new Date(new Date(j1?.entregue_em).getTime() + 30 * DIA_MS).toISOString()) < 2, JSON.stringify(j1)?.slice(0, 300));
    const mE = await A.esperarEmail(dC1.email, tE, (e) => e.html.includes(Q1.descricao), 40);
    const lk = mE ? linksNeutros(mE.html) : [];
    ok('E.2c e-mail "entregue - recebeu?" a compradora v3 com link neutro /v/ para /oficina/pecas?pedido=<id> (formulario do pedido)', !!mE && lk.some((l) => l.interno === `/oficina/pecas?pedido=${P1}`), mE ? JSON.stringify(lk) : 'sem e-mail');
    await entrarPelaTela(pD, '/ee/et', dC1);
    await ir(pD, '/ee/et/oficina/pecas', 3000);
    const card = cardCom(pD, Q1.descricao);
    ok('E.2d cartao do pedido v3 entregue: "Recebeu a peca?" Sim (pedido-recebi) / Problema (pedido-problema)', await visivel(card.getByTestId('pedido-recebi')) && await visivel(card.getByTestId('pedido-problema')));
    await card.getByTestId('pedido-recebi').click();
    const j2 = await esperar(() => ped(P1), (j) => !!j?.recebido_em);
    ok('E.2e "Recebi" pela tela: recebido_em, status entregue, contato_visivel_ate = recebido_em + 30 d', !!j2?.recebido_em && j2.status === 'entregue' && difMin(j2.contato_visivel_ate, new Date(new Date(j2.recebido_em).getTime() + 30 * DIA_MS).toISOString()) < 2, JSON.stringify(j2)?.slice(0, 300));
    ok('E.2f logo depois: formulario de avaliacao DAQUELE pedido (avaliar-form data-pedido) com estrelas 1-5, peca certa?, no prazo?, comentario', await visivel(formDe(pD, P1)) && (await formDe(pD, P1).locator('[data-testid^="avaliar-nota-"]').count()) === 5 && (await formDe(pD, P1).getByTestId('avaliar-peca-certa-sim').count()) === 1 && (await formDe(pD, P1).getByTestId('avaliar-no-prazo-nao').count()) === 1 && (await formDe(pD, P1).getByTestId('avaliar-comentario').count()) === 1);
    await formDe(pD, P1).getByTestId('avaliar-fechar').click();
    await pD.waitForTimeout(600);
    ok('E.2g "Depois" so fecha: o formulario some e o pedido continua "falta avaliar" (pedido-falta-avaliar)', !(await formDe(pD, P1).isVisible().catch(() => false)) && await visivel(card.getByTestId('pedido-falta-avaliar')));
    const pend = await A.pendentes(S.c1);
    ok(`E.2h GET ${ROTA.pendentes}: P1 listado com falta 'avaliacao', estado 'recebido', bloqueado false (dentro dos 3 dias)`, pend.status === 200 && pend.d?.bloqueado === false && (pend.d?.pedidos || []).some((x) => x.id === P1 && x.falta === 'avaliacao' && x.estado === 'recebido' && x.cotacaoId === Q1.id), mostra(pend));
    await card.getByTestId('pedido-falta-avaliar').click();
    const f = formDe(pD, P1);
    await f.getByTestId('avaliar-nota-4').click();
    await marcar(f.getByTestId('avaliar-peca-certa-sim'));
    await marcar(f.getByTestId('avaliar-no-prazo-nao'));
    await f.getByTestId('avaliar-comentario').fill('Hea pood, aga hilines');
    const tA = Date.now();
    await f.getByTestId('avaliar-enviar').click();
    ok('E.2i enviar -> avaliacao-enviada', await visivel(card.getByTestId('avaliacao-enviada')));
    const av = await esperar(() => A.avaliacaoDoPedido(P1), (x) => !!x);
    avP1 = av?.id || null;
    ok('E.2j fornecedores_avaliacoes: nota 4, peca_certa true, no_prazo false, nao_entregou false, comentario, autora = oficina 1 (dona), fornecedor = loja 1, editavel_ate = criado + 48 h, oculta false', !!av && av.nota === 4 && av.peca_certa === true && av.no_prazo === false && av.nao_entregou === false && av.comentario === 'Hea pood, aga hilines' && av.oficina_id === ofC1.id && av.autor_profile_id === dC1.id && av.fornecedor_tipo === 'loja' && av.fornecedor_id === L1.id && difMin(av.editavel_ate, new Date(new Date(av.criado_em).getTime() + 48 * 3600e3).toISOString()) < 2 && av.oculta === false, JSON.stringify(av)?.slice(0, 300));
    const pend2 = await A.pendentes(S.c1);
    ok('E.2k depois de avaliar, P1 sai de pendentes', pend2.status === 200 && !(pend2.d?.pedidos || []).some((x) => x.id === P1), mostra(pend2));
    const sAv = await A.esperarAviso(lojas['1'].d.id, 'avaliacao_recebida_fornecedor');
    const mAv = await A.esperarEmail(lojas['1'].d.email, tA, (e) => e.html.includes(Q1.descricao) || e.texto.includes(ofC1.nome), 30);
    ok('E.2l loja 1 recebe sino avaliacao_recebida_fornecedor (dados.pedido_id) + e-mail "nova avaliacao"', sAv.some((n) => n.dados?.pedido_id === P1) && !!mAv, `${sAv.length} ${mAv?.assunto || 'sem e-mail'}`);
    await pD.screenshot({ path: `${PRINTS}/lote3-avaliacao-enviada-et-1280.png`, fullPage: true });
    // rotas: idempotencia, dono, equipe
    const rr = await A.recebido(P1, S.c1), rL = await A.recebido(P1, S.l1), rF = await A.recebido(P1, S.f1), rX = await A.recebido(crypto.randomUUID(), S.c1);
    ok('E.2m recebido: 2a chamada 200 (idempotente); loja 403 ACESSO_NEGADO; funcionario da compradora 403 (D-6); id desconhecido 404 NAO_ENCONTRADO', rr.status === 200 && codigo(rL, 403, 'ACESSO_NEGADO') && codigo(rF, 403) && codigo(rX, 404, 'NAO_ENCONTRADO'), [rr, rL, rF, rX].map((x) => `${x.status}:${x.d?.codigo}`).join(' '));
    const a2 = await A.avaliar(P1, S.c1, { nota: 5 }), aF = await A.avaliar(P1, S.f1, { nota: 5 });
    ok('E.2n avaliar de novo (POST) -> 409 JA_AVALIADO; funcionario -> 403', codigo(a2, 409, 'JA_AVALIADO') && codigo(aF, 403), `${a2.status}:${a2.d?.codigo} ${aF.status}`);
    const e1 = await A.editarAvaliacao(P1, S.c1, { nota: 5, comentario: 'Hea pood' });
    ok('E.2o editar (PATCH) dentro de 48 h e sem resposta -> 200; nota 5', e1.status === 200 && (await A.avaliacaoDoPedido(P1))?.nota === 5, mostra(e1));
    const eTel = await A.editarAvaliacao(P1, S.c1, { comentario: 'helista +372 5555 1234' }), eMail = await A.editarAvaliacao(P1, S.c1, { comentario: 'kiri mulle pood@example.com' }), eNota = await A.editarAvaliacao(P1, S.c1, { nota: 6 }), eLongo = await A.editarAvaliacao(P1, S.c1, { comentario: 'y'.repeat(301) });
    ok('E.2p regex de contato no comentario (telefone, e-mail) -> 400 CONTATO_NO_TEXTO; nota 6 -> 400; comentario 301 -> 400; nada gravado', codigo(eTel, 400, 'CONTATO_NO_TEXTO') && codigo(eMail, 400, 'CONTATO_NO_TEXTO') && eNota.status === 400 && eLongo.status === 400 && (await A.avaliacaoDoPedido(P1))?.comentario === 'Hea pood', [eTel, eMail, eNota, eLongo].map((x) => `${x.status}:${x.d?.codigo}`).join(' '));
    const rsL2 = await A.responder(avP1, 'Aitah', S.l2), rsTel = await A.responder(avP1, 'helistage 5555 1234 5', S.l1), rs1 = await A.responder(avP1, 'Aitah, parandame tarneaega', S.l1), rs2 = await A.responder(avP1, 'Veel', S.l1);
    const avR = await A.avaliacaoDoPedido(P1);
    ok('E.2q resposta do fornecedor: outra loja 403; com telefone 400 CONTATO_NO_TEXTO; loja 1 -> 200 (resposta + resposta_em); 2a -> 409 JA_RESPONDIDA', codigo(rsL2, 403) && codigo(rsTel, 400, 'CONTATO_NO_TEXTO') && rs1.status === 200 && avR?.resposta === 'Aitah, parandame tarneaega' && !!avR?.resposta_em && codigo(rs2, 409, 'JA_RESPONDIDA'), [rsL2, rsTel, rs1, rs2].map((x) => `${x.status}:${x.d?.codigo}`).join(' '));
    const eDep = await A.editarAvaliacao(P1, S.c1, { nota: 3 });
    ok('E.2r editar depois da resposta -> 409 FORA_DO_PRAZO (nota continua 5)', codigo(eDep, 409, 'FORA_DO_PRAZO') && (await A.avaliacaoDoPedido(P1))?.nota === 5, mostra(eDep));
    const dnL2 = await A.denunciar(avP1, 'vale', S.l2), dn = await A.denunciar(avP1, 'Ei vasta toele', S.l1);
    const avD = await A.avaliacaoDoPedido(P1);
    ok('E.2s denunciar: outra loja 403; loja avaliada 200 -> denunciada_em, mas NAO oculta sozinha', codigo(dnL2, 403) && dn.status === 200 && !!avD?.denunciada_em && avD?.oculta === false, [dnL2, dn].map(mostra).join(' | '));
    const tAdm = new Date().toISOString();
    const oN = await A.adminAvaliacao(avP1, true, 'teste', S.l1), oA = await A.adminAvaliacao(avP1, true, 'Ofensivo (teste)', S.adm);
    const avO = await A.avaliacaoDoPedido(P1);
    const aud = (await A.admin.from('admin_auditoria').select('id').eq('admin_id', adm.id).gte('created_at', tAdm)).data || [];
    ok(`E.2t ${ROTA.adminAvaliacao}: nao-admin 401/403; admin oculta com motivo -> oculta, oculta_motivo, oculta_por = admin; linha em admin_auditoria`, [401, 403].includes(oN.status) && oA.status === 200 && avO?.oculta === true && avO?.oculta_motivo === 'Ofensivo (teste)' && avO?.oculta_por === adm.id && aud.length >= 1, `${oN.status} ${mostra(oA)} aud=${aud.length}`);
    const v3o = await linhaRest(S.c3, 'fornecedores_avaliacoes', { id: avP1 }), vL1 = await linhaRest(S.l1, 'fornecedores_avaliacoes', { id: avP1 }), vC1 = await linhaRest(S.c1, 'fornecedores_avaliacoes', { id: avP1 }), vAd = await linhaRest(S.adm, 'fornecedores_avaliacoes', { id: avP1 });
    ok('E.2u oculta: outra oficina parceira le 0; o fornecedor le (com oculta_motivo), a autora le, o admin le', v3o.linhas.length === 0 && vL1.linhas.length === 1 && vL1.linhas[0].oculta_motivo === 'Ofensivo (teste)' && vC1.linhas.length === 1 && vAd.linhas.length === 1, [v3o, vL1, vC1, vAd].map((x) => x.linhas.length).join('/'));
    const oB = await A.adminAvaliacao(avP1, false, 'revisado', S.adm);
    ok('E.2v admin desfaz -> outra oficina parceira volta a ler', oB.status === 200 && (await linhaRest(S.c3, 'fornecedores_avaliacoes', { id: avP1 })).linhas.length === 1, mostra(oB));
  });

  // ======================= E.3: "nao entregou" (D-4) + D-5 reabrir =======================
  await tentar('E.3', async () => {
    Q2 = await A.cotacao(ofC1, 'Nao entregou', { urgencia: 'hoje', alvo: 'so_lojas' });
    const r1 = await resposta(Q2, L1, 20), r2 = await resposta(Q2, L2, 18), r3 = await resposta(Q2, L3, 25);
    await A.admin.from('cotacoes_pecas').update({ status: 'respondida' }).eq('id', Q2.id);
    const rc = await A.confirmar(r2, S.c1.token);
    P2 = rc.d?.pedidoId || null;
    if (!P2) throw new Error(`confirmar Q2: ${mostra(rc)}`);
    await ir(pD, '/ee/et/oficina/pecas', 3000);
    const card = cardCom(pD, Q2.descricao);
    const tP = Date.now();
    await card.getByTestId('pedido-problema').click();
    await marcar(card.getByTestId('problema-motivo-nao_entregou'));
    await card.getByTestId('problema-enviar').click();
    const j = await esperar(() => ped(P2), (x) => x?.status === 'cancelado');
    ok("E.3a \"nao entregou\" pela tela (D-4): status cancelado, cancelado_por 'compradora', cancelado_motivo 'nao_entregou', problema 'nao_entregou', problema_em/cancelado_em = agora, contato_visivel_ate = agora", j?.status === 'cancelado' && j.cancelado_por === 'compradora' && j.cancelado_motivo === 'nao_entregou' && j.problema === 'nao_entregou' && difMin(j.problema_em, agoraIso()) < 2 && difMin(j.cancelado_em, agoraIso()) < 2 && difMin(j.contato_visivel_ate, agoraIso()) < 2, JSON.stringify(j)?.slice(0, 300));
    const sP = await A.esperarAviso(lojas['2'].d.id, 'pedido_peca_problema');
    const mP = await A.esperarEmail(lojas['2'].d.email, tP, (e) => e.html.includes(Q2.descricao), 30);
    ok('E.3b loja 2 (fornecedora) recebe sino pedido_peca_problema (dados.pedido_id) + e-mail "problema no pedido"', sP.some((n) => n.dados?.pedido_id === P2) && !!mP, mP?.assunto || 'sem e-mail');
    const sAdm = await A.esperarAviso(adm.id, 'pedido_peca_problema', 20);
    ok('E.3b2 o admin tambem e avisado do "nao entregou" (mesmo tipo pedido_peca_problema, dados.pedido_id) - D-4', sAdm.some((n) => n.dados?.pedido_id === P2), String(sAdm.length));
    const k1 = await contatoDe(P2, S.c1), k2 = await contatoDe(P2, S.l2);
    ok('E.3c contato do pedido cancelado: arquivado nos dois lados (sem telefone nem endereco)', k1?.arquivado === true && !k1?.telefone && !k1?.endereco && k2?.arquivado === true && !k2?.telefone, JSON.stringify({ k1, k2 }));
    await ir(pD, '/ee/et/oficina/pecas', 3000);
    ok('E.3d cartao: pedido-cancelado-info com o motivo (pecas.motivosCancelamento.naoEntregou)', (await card.getByTestId('pedido-cancelado-info').innerText().catch(() => '')).includes(ET('pecas.motivosCancelamento.naoEntregou')));
    ok('E.3e antes de avaliar: sem "reabrir"/"pedir de novo"; o formulario de avaliacao do pedido esta na tela', (await card.getByTestId('pos-cancelamento-reabrir').count()) === 0 && (await card.getByTestId('pos-cancelamento-nova').count()) === 0 && await visivel(formDe(pD, P2)));
    const dAntes = await A.depois(P2, 'reabrir', S.c1);
    ok('E.3f depois-do-cancelamento antes da avaliacao (conta contra o fornecedor) -> 409 AVALIACAO_PENDENTE', codigo(dAntes, 409, 'AVALIACAO_PENDENTE'), mostra(dAntes));
    const pend = await A.pendentes(S.c1);
    ok("E.3g pendentes: P2 com estado 'cancelado' e falta 'avaliacao'", (pend.d?.pedidos || []).some((x) => x.id === P2 && x.estado === 'cancelado' && x.falta === 'avaliacao'), mostra(pend));
    await formDe(pD, P2).getByTestId('avaliar-nota-1').click();
    await formDe(pD, P2).getByTestId('avaliar-enviar').click();
    const av = await esperar(() => A.avaliacaoDoPedido(P2), (x) => !!x);
    ok('E.3h avaliacao do "nao entregou": nota 1, nao_entregou = true (preenchido pelo motivo), fornecedor loja 2', av?.nota === 1 && av?.nao_entregou === true && av?.fornecedor_id === L2.id, JSON.stringify(av)?.slice(0, 200));
    await ir(pD, '/ee/et/oficina/pecas', 3000);
    ok('E.3i avaliado: a tela oferece "Reabrir para as outras ofertas" e "Pedir de novo"', await visivel(card.getByTestId('pos-cancelamento-reabrir')) && await visivel(card.getByTestId('pos-cancelamento-nova')));
    await pD.screenshot({ path: `${PRINTS}/lote3-pos-cancelamento-et-1280.png`, fullPage: true });
    const tR = Date.now();
    await card.getByTestId('pos-cancelamento-reabrir').click();
    const cq = await esperar(() => A.cotacaoNoBanco(Q2.id), (c) => c?.status === 'respondida');
    ok("E.3j reabrir: cotacao fechada -> 'respondida'; pedido pos_cancelamento 'reaberta'", cq?.status === 'respondida' && ped(P2)?.pos_cancelamento === 'reaberta', `${cq?.status} ${ped(P2)?.pos_cancelamento}`);
    const s1 = await A.esperarAviso(lojas['1'].d.id, 'cotacao_peca_reaberta_cancelamento'), s3 = await A.esperarAviso(lojas['3'].d.id, 'cotacao_peca_reaberta_cancelamento');
    await sleep(1000);
    const s2 = await A.avisos(lojas['2'].d.id, 'cotacao_peca_reaberta_cancelamento');
    const m1 = await A.esperarEmail(lojas['1'].d.email, tR, (e) => e.html.includes(Q2.descricao), 20);
    ok('E.3k "voltou a abrir - confirme sua oferta": sino (+ e-mail) as lojas 1 e 3 com oferta; NADA a loja 2 (a que falhou)', s1.some((n) => n.dados?.cotacao_id === Q2.id) && s3.some((n) => n.dados?.cotacao_id === Q2.id) && !s2.some((n) => n.dados?.cotacao_id === Q2.id) && !!m1, `${s1.length}/${s3.length}/${s2.length} ${m1 ? 'email' : 'sem email'}`);
    await ir(pD, '/ee/et/oficina/pecas', 3000);
    const o2 = card.getByTestId('oferta').filter({ hasText: L2.nome }), o3 = card.getByTestId('oferta').filter({ hasText: L3.nome });
    ok('E.3k2 cotacao reaberta (respondida) na tela: a oferta da loja 2 (falhou) SEM "Confirmar"; a da loja 3 COM', (await o2.count()) === 1 && (await botao(o2, ET('oficinaPecas.confirmarPedidoBtn')).count()) === 0 && (await botao(o3, ET('oficinaPecas.confirmarPedidoBtn')).count()) === 1);
    const rL2 = await A.confirmar(r2, S.c1.token);
    ok('E.3l a oferta da loja que falhou nao pode ser escolhida de novo: confirmar -> 409 OFERTA_CANCELADA; cotacao continua respondida', codigo(rL2, 409, 'OFERTA_CANCELADA') && (await A.cotacaoNoBanco(Q2.id))?.status === 'respondida', mostra(rL2));
    const d2 = await A.depois(P2, 'nova_cotacao', S.c1);
    ok('E.3m 2a escolha -> 409 JA_ESCOLHIDO', codigo(d2, 409, 'JA_ESCOLHIDO'), mostra(d2));
    const r3c = await A.confirmar(r3, S.c1.token);
    P3 = r3c.d?.pedidoId || null;
    ok('E.3n confirmar a loja 3 na cotacao reaberta -> 200 (2o pedido na mesma cotacao, v3)', r3c.status === 200 && ped(P3)?.v3 === true, mostra(r3c));
    await ir(pD, '/ee/et/oficina/pecas', 3000);
    const esc = card.getByTestId('oferta-escolhida');
    ok('E.3o o cartao mostra o pedido VIVO (loja 3): oferta-escolhida = loja 3, pedido-cancelar visivel', (await esc.count()) === 1 && (await esc.innerText()).includes(L3.nome) && await visivel(card.getByTestId('pedido-cancelar')), (await card.innerText().catch(() => '')).slice(0, 300));
    const rs = await A.resumoForn(S.c1, 'loja', L2.id);
    ok('E.3p fornecedor_resumo(loja 2): total 1, nao_entregou_n 1, media NULL (< 3 avaliacoes)', !rs.error && Number(rs.linha?.total) === 1 && Number(rs.linha?.nao_entregou_n) === 1 && rs.linha?.media === null, JSON.stringify(rs));
    // D-5 "direto": cancelamento pela compradora (nao conta contra ninguem) -> reabrir SEM avaliar
    const pr = await A.pedidoV3(ofC1, L3, { descricao: 'Reabrir direto', outras: [L4] });
    const cR = await A.cancelar(pr.id, 'carro_saiu', S.c1);
    const dR = await A.depois(pr.id, 'reabrir', S.c1);
    const sR4 = await A.esperarAviso(lojas['4'].d.id, 'cotacao_peca_reaberta_cancelamento', 20);
    const sR3 = await A.avisos(lojas['3'].d.id, 'cotacao_peca_reaberta_cancelamento');
    ok("E.3q D-5 sem avaliacao (cancelado pela compradora): reabrir -> 200, cotacao 'respondida', pos_cancelamento 'reaberta'; aviso a loja 4 (outra oferta), nenhum a loja 3 (a do pedido)", cR.status === 200 && dR.status === 200 && (await A.cotacaoNoBanco(pr.cotacao.id))?.status === 'respondida' && ped(pr.id)?.pos_cancelamento === 'reaberta' && sR4.some((n) => n.dados?.cotacao_id === pr.cotacao.id) && !sR3.some((n) => n.dados?.cotacao_id === pr.cotacao.id), `${mostra(cR)} | ${mostra(dR)}`);
    void r1;
  });

  // ======================= E.4: cancelamentos com motivo + D-5 vencida =======================
  const ctxL = await nav.contexto('chromium', 390, A.ip); const pL = await ctxL.newPage(); vigiar(pL, erros, 'E.4 loja1');
  await tentar('E.4', async () => {
    const pk4 = await A.pedidoV3(ofC1, L1, { descricao: 'Sem estoque' });
    P4 = pk4.id; const desc4 = pk4.descricao;
    await entrarPelaTela(pL, '/ee/et', lojas['1'].d);
    await ir(pL, '/ee/et/loja/pedidos', 3500);
    const row = pL.getByTestId('pedido-loja').filter({ hasText: desc4 });
    const tC = Date.now();
    await row.getByTestId('pedido-cancelar').click();
    await marcar(row.getByTestId('cancelar-motivo-sem_estoque'));
    ok('E.4a a loja ve so os motivos do LADO DELA (sem "comprei noutro lugar")', (await row.getByTestId('cancelar-motivo-comprei_outro').count()) === 0 && (await row.getByTestId('cancelar-motivo-prazo').count()) === 1);
    await row.getByTestId('cancelar-enviar').click();
    const j = await esperar(() => ped(P4), (x) => x?.status === 'cancelado');
    ok("E.4b loja cancela pela tela (sem estoque): cancelado_por 'fornecedor', motivo 'sem_estoque', contato_visivel_ate = agora", j?.cancelado_por === 'fornecedor' && j?.cancelado_motivo === 'sem_estoque' && difMin(j?.contato_visivel_ate, agoraIso()) < 2, JSON.stringify(j)?.slice(0, 300));
    await pL.screenshot({ path: `${PRINTS}/lote3-loja-cancelou-et-390.png`, fullPage: true });
    const sC = await A.esperarAviso(dC1.id, 'pedido_peca_cancelado');
    const mC = await A.esperarEmail(dC1.email, tC, (e) => e.html.includes(desc4), 30);
    ok('E.4c compradora recebe sino pedido_peca_cancelado + e-mail "pedido cancelado"', sC.some((n) => n.dados?.pedido_id === P4) && !!mC, mC?.assunto || 'sem e-mail');
    ok('E.4d cancelamento do fornecedor (exceto "a compradora pediu") conta contra ele: P4 em pendentes, falta avaliacao', ((await A.pendentes(S.c1)).d?.pedidos || []).some((x) => x.id === P4 && x.falta === 'avaliacao'));
    const P5 = (await A.pedidoV3(ofC1, L1, { descricao: 'Compradora pediu' })).id;
    const c5 = await A.cancelar(P5, 'compradora_pediu', S.l1);
    const a5 = await A.avaliar(P5, S.c1, { nota: 1 });
    ok('E.4e "a compradora pediu": 200, sem pendencia e sem avaliacao possivel (409 NAO_AVALIAVEL)', c5.status === 200 && !((await A.pendentes(S.c1)).d?.pedidos || []).some((x) => x.id === P5) && codigo(a5, 409, 'NAO_AVALIAVEL'), `${mostra(c5)} | ${mostra(a5)}`);
    const pk6 = await A.pedidoV3(ofC1, L3, { descricao: 'Comprei noutro' });
    P6 = pk6.id; Q6 = pk6.cotacao;
    await ir(pD, '/ee/et/oficina/pecas', 3000);
    const card6 = cardCom(pD, Q6.descricao);
    await card6.getByTestId('pedido-cancelar').click();
    ok('E.4f a compradora ve so os motivos do lado dela (sem "sem estoque")', (await card6.getByTestId('cancelar-motivo-sem_estoque').count()) === 0 && (await card6.getByTestId('cancelar-motivo-carro_saiu').count()) === 1);
    await marcar(card6.getByTestId('cancelar-motivo-comprei_outro'));
    await card6.getByTestId('cancelar-enviar').click();
    const j6 = await esperar(() => ped(P6), (x) => x?.status === 'cancelado');
    const s6 = await A.esperarAviso(lojas['3'].d.id, 'pedido_peca_cancelado');
    ok("E.4g compradora cancela pela tela (comprei noutro lugar): cancelado_por 'compradora'; loja 3 avisada; sem pendencia; nota da loja 3 intocada (D-10)", j6?.cancelado_por === 'compradora' && j6?.cancelado_motivo === 'comprei_outro' && s6.some((n) => n.dados?.pedido_id === P6) && !((await A.pendentes(S.c1)).d?.pedidos || []).some((x) => x.id === P6) && (await A.avaliacoesDe({ pedido_id: P6 })).length === 0 && Number((await A.resumoForn(S.c1, 'loja', L3.id)).linha?.nao_entregou_n || 0) === 0, JSON.stringify(j6)?.slice(0, 200));
    const P7 = (await A.pedidoV3(ofC1, L1, { descricao: 'Motivo errado' })).id;
    const w1 = await A.cancelar(P7, 'comprei_outro', S.l1), w2 = await A.cancelar(P7, 'sem_estoque', S.c1), w3 = await A.cancelar(P7, 'sem_estoque', S.l3), w4 = await A.cancelar(P7, 'comprei_outro', S.f1), w5 = await A.cancelar(P1, 'comprei_outro', S.c1);
    ok('E.4h motivo do lado errado 400 MOTIVO_INVALIDO (loja e compradora); terceiro 403; funcionario 403 (D-6); pedido entregue 409 JA_ENTREGUE', codigo(w1, 400, 'MOTIVO_INVALIDO') && codigo(w2, 400, 'MOTIVO_INVALIDO') && codigo(w3, 403) && codigo(w4, 403) && codigo(w5, 409, 'JA_ENTREGUE') && ped(P7)?.status === 'confirmado', [w1, w2, w3, w4, w5].map((x) => `${x.status}:${x.d?.codigo}`).join(' '));
    // vendedora (oficina fornecedora) cancela pela aba Vender
    const pk8 = await A.pedidoV3(ofC1, ofV, { tipo: 'oficina', descricao: 'Venda oficina' });
    const ctxV = await nav.contexto('chromium', 390, A.ip); const pV = await ctxV.newPage(); vigiar(pV, erros, 'E.4 vendedora');
    await entrarPelaTela(pV, '/ee/et', dV);
    await ir(pV, '/ee/et/oficina/pecas?aba=vender', 3500);
    const rowV = pV.getByTestId('pedidos-como-fornecedora').locator('div.rounded-lg').filter({ hasText: pk8.descricao }).first();
    ok('E.4i aba Vender: o pedido mostra o NOME da compradora (D-12) e o botao de cancelar com motivo', (await rowV.innerText().catch(() => '')).includes(ofC1.nome) && await visivel(rowV.getByTestId('pedido-cancelar')));
    await rowV.getByTestId('pedido-cancelar').click();
    await marcar(rowV.getByTestId('cancelar-motivo-prazo'));
    await rowV.getByTestId('cancelar-enviar').click();
    const j8 = await esperar(() => ped(pk8.id), (x) => x?.status === 'cancelado');
    ok("E.4j vendedora cancela pela aba Vender (nao consigo no prazo): cancelado_por 'fornecedor', motivo 'prazo'", j8?.cancelado_por === 'fornecedor' && j8?.cancelado_motivo === 'prazo', JSON.stringify(j8)?.slice(0, 200));
    await ctxV.close();
    // D-5: cotacao vencida -> so "pedir de novo"
    await A.admin.from('cotacoes_pecas').update({ expira_em: new Date(Date.now() - 3600e3).toISOString() }).eq('id', Q6.id);
    const dv = await A.depois(P6, 'reabrir', S.c1);
    ok('E.4k D-5 em cotacao vencida: reabrir -> 409 VENCIDA (nada gravado)', codigo(dv, 409, 'VENCIDA') && ped(P6)?.pos_cancelamento === null, mostra(dv));
    await ir(pD, '/ee/et/oficina/pecas', 3000);
    ok('E.4l tela: pos-cancelamento-vencida + "Pedir de novo"; sem "Reabrir"', await visivel(card6.getByTestId('pos-cancelamento-vencida')) && await visivel(card6.getByTestId('pos-cancelamento-nova')) && (await card6.getByTestId('pos-cancelamento-reabrir').count()) === 0);
    await card6.getByTestId('pos-cancelamento-nova').click();
    await pD.waitForURL((u) => u.searchParams.get('repetir') === Q6.id, { timeout: 10000 }).catch(() => {});
    await pD.locator('#c8551-1').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    ok('E.4m "Pedir de novo" -> /oficina/pecas?repetir=<cotacao> com o formulario PRE-PREENCHIDO (descricao)', new URL(pD.url()).searchParams.get('repetir') === Q6.id && (await pD.locator('#c8551-1').inputValue().catch(() => '')) === Q6.descricao, pD.url());
    await botao(pD, ET('oficinaPecas.enviarCotacao')).click();
    const nova = await esperar(async () => (await A.admin.from('cotacoes_pecas').select('id').eq('oficina_id', ofC1.id).eq('peca_descricao', Q6.descricao).neq('id', Q6.id)).data?.[0], (x) => !!x);
    const j6b = await esperar(() => ped(P6), (x) => !!x?.nova_cotacao_id);
    ok("E.4n nova cotacao criada pelo navegador; pedido: pos_cancelamento 'nova_cotacao', nova_cotacao_id = a nova", !!nova && j6b?.pos_cancelamento === 'nova_cotacao' && j6b?.nova_cotacao_id === nova.id, JSON.stringify({ nova, pos: j6b?.pos_cancelamento, n: j6b?.nova_cotacao_id }));
    const d6 = await A.depois(P6, 'reabrir', S.c1);
    ok('E.4o 2a escolha -> 409 JA_ESCOLHIDO', codigo(d6, 409, 'JA_ESCOLHIDO'), mostra(d6));
    await A.avaliar(P4, S.c1, { nota: 2 }); // deixa a compradora 1 sem pendencia
  });

  // ======================= E.5: P-7 (D-7) =======================
  const ctxM = await nav.contexto('chromium', 390, A.ip); const pM = await ctxM.newPage(); vigiar(pM, erros, 'E.5 compradora2');
  await tentar('E.5', async () => {
    const dias = (d) => new Date(Date.now() - d * DIA_MS).toISOString();
    const PA = await A.pedidoV3(ofC2, L1, { status: 'entregue', descricao: 'P7 A', campos: { entregue_em: dias(2), lembretes_feedback: 1 } });
    const pA = await A.pendentes(S.c2);
    ok("E.5a entregue ha 2 dias: pendentes lista PA (falta 'retorno', estado 'entregue', peca e fornecedor), bloqueado false", pA.status === 200 && pA.d?.bloqueado === false && (pA.d?.pedidos || []).some((x) => x.id === PA.id && x.falta === 'retorno' && x.estado === 'entregue' && String(x.peca).includes(PA.descricao) && x.fornecedorNome === L1.nome), mostra(pA));
    await entrarPelaTela(pM, '/ee/et', dC2);
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    ok('E.5b tela: aviso amarelo p7-aviso (antes do bloqueio), sem p7-bloqueio', await visivel(pM.getByTestId('p7-aviso')) && (await pM.getByTestId('p7-bloqueio').count()) === 0);
    const ins = async (rot) => (await S.c2.c.from('cotacoes_pecas').insert({ oficina_id: ofC2.id, peca_descricao: `TESTE-PECAS ${rot} ${A.tag}`, quantidade: 1 }).select('id').single()).error;
    const eA = await ins('P7 dentro dos 3 dias');
    const Qx = await A.cotacao(ofC2, 'P7 confirma livre'); const rx = await resposta(Qx, L3, 10);
    const cx = await A.confirmar(rx, S.c2.token);
    ok('E.5c dentro dos 3 dias: cria (INSERT pela RLS) e confirma (200)', !eA && cx.status === 200, `${eA?.code || ''} ${mostra(cx)}`);
    const PX = cx.d?.pedidoId;
    ok('E.5d pedido so confirmado (sem entrega) nao e pendencia', !((await A.pendentes(S.c2)).d?.pedidos || []).some((x) => x.id === PX));
    await A.atualizarPedido(PA.id, { entregue_em: dias(4), lembretes_feedback: 0 });
    const pB = await A.pendentes(S.c2), eB = await ins('P7 sem lembrete');
    ok('E.5e entregue ha 4 dias SEM lembrete (lembretes_feedback 0): NAO bloqueia (garantia no dado de que houve aviso)', pB.d?.bloqueado === false && !eB, `${mostra(pB)} ${eB?.code || ''}`);
    await A.atualizarPedido(PA.id, { lembretes_feedback: 1 });
    const pC = await A.pendentes(S.c2);
    const rpcDona = await A.pendenteRpc(S.c2, ofC2.id), rpcOutra = await A.pendenteRpc(S.c1, ofC2.id), rpcAnon = await A.anon().rpc('oficina_feedback_pecas_pendente', { p_oficina: ofC2.id });
    ok('E.5f com 1 lembrete e > 3 dias: bloqueado true (desde preenchido); funcao = true para a dona', pC.d?.bloqueado === true && !!pC.d?.desde && rpcDona.valor === true, `${mostra(pC)} rpc=${rpcDona.valor}`);
    ok('E.5g guarda de dono: outra oficina chamando a funcao para a compradora 2 -> false; anon -> sem permissao', rpcOutra.valor === false && !!rpcAnon.error, `${rpcOutra.valor} ${rpcAnon.error?.code}`);
    const pF = await A.pendentes(S.f2);
    ok('E.5h equipe le: funcionario da compradora 2 -> pendentes bloqueado true', pF.status === 200 && pF.d?.bloqueado === true, mostra(pF));
    const eC = await ins('P7 bloqueada');
    ok('E.5i bloqueado: INSERT de cotacao pela RLS -> 42501', eC?.code === '42501', eC ? `${eC.code} ${eC.message}` : 'passou');
    const Qy = await A.cotacao(ofC2, 'P7 confirma bloqueada'); const ry = await resposta(Qy, L3, 11);
    await A.admin.from('cotacoes_pecas').update({ status: 'respondida' }).eq('id', Qy.id);
    const cy = await A.confirmar(ry, S.c2.token);
    ok('E.5j bloqueado: confirmar -> 409 FEEDBACK_PENDENTE com a lista (PA); cotacao continua respondida, nenhum pedido', codigo(cy, 409, 'FEEDBACK_PENDENTE') && (cy.d?.pedidos || []).some((x) => (x.id || x) === PA.id) && (await A.cotacaoNoBanco(Qy.id))?.status === 'respondida' && !(await A.admin.from('pedidos_pecas').select('id').eq('cotacao_id', Qy.id)).data?.length, mostra(cy));
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    const linha = pM.getByTestId(`p7-pedido-${PA.id}`);
    ok('E.5k banner vermelho p7-bloqueio com UMA linha por pedido: p7-pedido-<id> com a peca e o fornecedor', await visivel(pM.getByTestId('p7-bloqueio')) && (await linha.innerText().catch(() => '')).includes(PA.descricao) && (await linha.innerText().catch(() => '')).includes(L1.nome) && (await pM.locator('[data-testid^="p7-pedido-"]').count()) === 1);
    await pM.screenshot({ path: `${PRINTS}/lote3-p7-bloqueio-et-390.png`, fullPage: true });
    ok('E.5l "Confirmar" desabilitado com o texto (p7-confirmar-bloqueado) no cartao da cotacao respondida', await visivel(cardCom(pM, Qy.descricao).getByTestId('p7-confirmar-bloqueado')) && ((await cardCom(pM, Qy.descricao).getByTestId('p7-confirmar-bloqueado').first().isDisabled().catch(() => false)) || (await cardCom(pM, Qy.descricao).getByTestId('p7-confirmar-bloqueado').first().getAttribute('aria-disabled').catch(() => null)) === 'true'));
    const nc = botao(pM, ET('oficinaPecas.novaCotacao'));
    if (await nc.count()) await nc.first().click().catch(() => {});
    ok('E.5m criar bloqueado: p7-criar-bloqueado visivel e sem "Enviar" ativo', await visivel(pM.getByTestId('p7-criar-bloqueado')) && !(await botao(pM, ET('oficinaPecas.enviarCotacao')).isEnabled().catch(() => false)));
    await pM.getByTestId(`p7-avaliar-${PA.id}`).click();
    await pM.waitForTimeout(800);
    const cardA = cardCom(pM, PA.descricao);
    ok('E.5n o botao da linha leva ao pedido certo: "Recebeu?" (falta o retorno) visivel e na tela', await visivel(cardA.getByTestId('pedido-recebi')) && await cardA.getByTestId('pedido-recebi').isVisible());
    // continua liberado com o bloqueio
    const msg = await S.c2.c.from('cotacoes_pecas_mensagens').insert({ cotacao_id: Qy.id, fornecedor_tipo: 'loja', fornecedor_id: L3.id, remetente_id: dC2.id, texto: 'Kas on laos?' });
    const Qv = await A.cotacao(ofC3, 'Compradora 3 precisa', { alvo: 'todos' });
    const vend = await S.c2.c.from('cotacoes_pecas_respostas').insert({ cotacao_id: Qv.id, fornecedor_tipo: 'oficina', oficina_fornecedora_id: ofC2.id, preco: 9, prazo_dias: 1 });
    const canc = await A.cancelar(PX, 'carro_saiu', S.c2);
    ok('E.5o bloqueada ainda conversa (mensagem), VENDE como fornecedora (oferta) e cancela um pedido confirmado', !msg.error && !vend.error && canc.status === 200, `${msg.error?.message || ''} ${vend.error?.message || ''} ${mostra(canc)}`);
    const rA = await A.recebido(PA.id, S.c2);
    const pD2 = await A.pendentes(S.c2);
    ok("E.5p \"Recebi\" sem avaliar: continua BLOQUEADO, agora falta 'avaliacao' (D-7: avaliacao obrigatoria)", rA.status === 200 && pD2.d?.bloqueado === true && (pD2.d?.pedidos || []).some((x) => x.id === PA.id && x.falta === 'avaliacao'), mostra(pD2));
    const fF = await A.recebido(PA.id, S.f2), fA = await A.avaliar(PA.id, S.f2), fC = await A.cancelar(PA.id, 'outro', S.f2);
    ok('E.5q funcionario: recebido / avaliar / cancelar -> 403 (so a dona, D-6)', [fF, fA, fC].every((x) => x.status === 403), [fF, fA, fC].map((x) => x.status).join('/'));
    const aA = await A.avaliar(PA.id, S.c2, { nota: 5 });
    const pE = await A.pendentes(S.c2), eE = await ins('P7 desbloqueada');
    ok('E.5r avaliar desbloqueia NA HORA: bloqueado false e INSERT passa', aA.status === 200 && pE.d?.bloqueado === false && !eE, `${mostra(aA)} ${eE?.code || ''}`);
    // 2 pendentes
    const PB = await A.pedidoV3(ofC2, L1, { status: 'entregue', descricao: 'P7 B', campos: { entregue_em: dias(5), lembretes_feedback: 1 } });
    const PC = await A.pedidoV3(ofC2, L3, { status: 'entregue', descricao: 'P7 C', campos: { entregue_em: dias(6), lembretes_feedback: 2 } });
    await ir(pM, '/ee/et/oficina/pecas', 3000);
    ok('E.5s 2 pendentes: banner com 2 linhas (p7-pedido-B e p7-pedido-C)', await visivel(pM.getByTestId(`p7-pedido-${PB.id}`)) && await visivel(pM.getByTestId(`p7-pedido-${PC.id}`)) && (await pM.locator('[data-testid^="p7-pedido-"]').count()) === 2);
    const ap = await A.adminPedido(PC.id, { cancelar: true }, S.adm), apN = await A.adminPedido(PC.id, { cancelar: true }, S.c2);
    const jC = ped(PC.id);
    ok(`E.5t ${ROTA.adminPedido} cancelar como admin: 200, cancelado_por 'admin', sem pendencia; nao-admin 401/403`, ap.status === 200 && jC?.status === 'cancelado' && jC?.cancelado_por === 'admin' && !((await A.pendentes(S.c2)).d?.pedidos || []).some((x) => x.id === PC.id) && [401, 403].includes(apN.status), `${mostra(ap)} ${apN.status}`);
    const eMin2 = await A.p7Minimo(2);
    const pMin2 = await A.pendentes(S.c2), insMin2 = await ins('P7 minimo 2');
    await A.p7Minimo(1);
    const pMin1 = await A.pendentes(S.c2);
    ok('E.5u pecas_p7_minimo = 2 relaxa (1 pendente -> livre, INSERT passa); de volta a 1 -> bloqueado', !eMin2 && pMin2.d?.bloqueado === false && !insMin2 && pMin1.d?.bloqueado === true, `${eMin2?.message || ''} ${pMin2.d?.bloqueado}/${insMin2?.code || 'ok'}/${pMin1.d?.bloqueado}`);
    const ar = await A.adminPedido(PB.id, { recebido: true }, S.adm);
    ok('E.5v admin "marcar recebido": recebido_em gravado, mas a pendencia continua (falta avaliacao)', ar.status === 200 && !!ped(PB.id)?.recebido_em && (await A.pendentes(S.c2)).d?.bloqueado === true, mostra(ar));
    const ctxA = await nav.contexto('chromium', 1280, A.ip); const pA2 = await ctxA.newPage(); vigiar(pA2, erros, 'E.5 admin');
    await entrarPelaTela(pA2, '/br/pt', adm, '/admin/pecas');
    await ir(pA2, '/admin/pecas', 4000);
    ok('E.5w /admin/pecas: admin-p7-bloqueadas lista a compradora 2; admin-pedidos-problema lista o "nao entregou" (E.3); admin-pedido-recebido existe', (await pA2.getByTestId('admin-p7-bloqueadas').innerText().catch(() => '')).includes(ofC2.nome) && (!Q2 || (await pA2.getByTestId('admin-pedidos-problema').innerText().catch(() => '')).includes(Q2.descricao)) && (await pA2.getByTestId('admin-pedido-recebido').count()) >= 1);
    await pA2.screenshot({ path: `${PRINTS}/lote3-admin-pecas-1280.png`, fullPage: true });
    await ctxA.close();
    const cr = await A.corrigir(PB.id, 'cancelado', S.adm);
    const jB = ped(PB.id);
    ok("E.5x admin/corrigir pedido v3 -> cancelado: 200 (CHECK numa direcao nao quebra), cancelado_por 'admin', cancelado_em e contato_visivel_ate = agora; bloqueio sai", cr.status === 200 && jB?.status === 'cancelado' && jB?.cancelado_por === 'admin' && difMin(jB?.cancelado_em, agoraIso()) < 2 && difMin(jB?.contato_visivel_ate, agoraIso()) < 2 && (await A.pendentes(S.c2)).d?.bloqueado === false, `${mostra(cr)} ${JSON.stringify(jB)?.slice(0, 200)}`);
    const PD = await A.pedidoV3(ofC2, L3, { status: 'entregue', descricao: 'P7 D', campos: { entregue_em: dias(1) } });
    const pr = await A.problema(PD.id, 'peca_errada', S.c2, 'Vale mudel');
    const jD = ped(PD.id);
    const prR = await A.problema(PA.id, 'avariada', S.c2), prX = await A.problema(PD.id, 'quebrou', S.c2);
    ok("E.5y problema 'peca_errada' NAO muda o status (entregue), grava problema/problema_texto e fica pendente de avaliacao; depois de Recebi -> 409 JA_RECEBIDO; problema invalido -> 400 PROBLEMA_INVALIDO", pr.status === 200 && jD?.status === 'entregue' && jD?.problema === 'peca_errada' && jD?.problema_texto === 'Vale mudel' && ((await A.pendentes(S.c2)).d?.pedidos || []).some((x) => x.id === PD.id && x.estado === 'problema' && x.falta === 'avaliacao') && codigo(prR, 409, 'JA_RECEBIDO') && codigo(prX, 400, 'PROBLEMA_INVALIDO'), [pr, prR, prX].map((x) => `${x.status}:${x.d?.codigo}`).join(' '));
    await A.avaliar(PD.id, S.c2, { nota: 2, pecaCerta: false });
  });

  // ======================= E.6: lembretes D+1 e D+3 (tarefa com hora simulada) =======================
  await tentar('E.6', async () => {
    const umaHora = new Date(Date.now() - 3600e3).toISOString();
    const PL1 = await A.pedidoV3(ofC3, L3, { status: 'entregue', descricao: 'Lembrete', campos: { entregue_em: umaHora } });
    const PL2 = await A.pedidoV3(ofC3, L3, { status: 'entregue', descricao: 'Ja avaliado', campos: { entregue_em: umaHora } });
    await A.avaliacaoSemente(PL2, ofC3, dC3, L3, { nota: 4 });
    const PR = await A.pedidoV3(ofReal, ljReal, { status: 'entregue', descricao: 'Real v3', campos: { entregue_em: umaHora } });
    // 6 idiomas: uma compradora por idioma, cada uma com um pedido entregue ha 1 h
    const porIdioma = {};
    for (const l of IDIOMAS) { const d = await A.conta('oficina', `comp-${l}`, { contaTeste: true, idioma: l }); const of = await A.oficina(d, `Comp ${l}`, { km: 0.9 }); porIdioma[l] = { d, p: await A.pedidoV3(of, L3, { status: 'entregue', descricao: `Lembrete ${l}`, campos: { entregue_em: umaHora } }) }; }
    const lem = (id) => Number(ped(id)?.lembretes_feedback);
    const r0 = await A.feedback(agoraIso());
    ok('E.6a tarefa agora (entregue ha 1 h): 200 e nenhum lembrete para PL1', r0.status === 200 && r0.d?.ok === true && lem(PL1.id) === 0, mostra(r0));
    const t1 = Date.now();
    const r1 = await A.feedback(agoraIso(25 * 3600e3));
    const m1 = await A.esperarEmail(dC3.email, t1, (e) => e.html.includes(PL1.descricao), 40);
    const lk = m1 ? linksNeutros(m1.html) : [];
    ok('E.6b D+1: lembretes_feedback 1; e-mail a DONA com a peca, o fornecedor e link neutro direto ao formulario (/oficina/pecas?pedido=<id>)', r1.status === 200 && lem(PL1.id) === 1 && !!m1 && m1.texto.includes(L3.nome) && lk.some((l) => l.interno === `/oficina/pecas?pedido=${PL1.id}`), `${mostra(r1)} lem=${lem(PL1.id)} ${JSON.stringify(lk)}`);
    const sn = (await A.avisos(dC3.id, 'feedback_peca_lembrete')).filter((n) => n.dados?.pedido_id === PL1.id);
    ok('E.6c sino feedback_peca_lembrete com dados.pedido_id', sn.length === 1, String(sn.length));
    ok('E.6d pedido ja avaliado: sem lembrete; pedido v3 de conta REAL com o global desligado: intocado e sem e-mail', lem(PL2.id) === 0 && lem(PR.id) === 0 && A.emailsDe(dReal.email, t1).length === 0);
    const r1b = await A.feedback(agoraIso(25 * 3600e3)), r2 = await A.feedback(agoraIso(49 * 3600e3));
    await sleep(1200);
    ok('E.6e repetir D+1 e chamar em D+2: continua 1, sem e-mail novo', r1b.status === 200 && r2.status === 200 && lem(PL1.id) === 1 && A.emailsDe(dC3.email, t1).filter((e) => e.html.includes(PL1.descricao)).length === 1);
    const t3 = Date.now();
    const r3 = await A.feedback(agoraIso(73 * 3600e3));
    const m3 = await A.esperarEmail(dC3.email, t3, (e) => e.html.includes(PL1.descricao), 40);
    ok('E.6f D+3: lembretes_feedback 2 e 2o e-mail', r3.status === 200 && lem(PL1.id) === 2 && !!m3, mostra(r3));
    const t4 = Date.now();
    await A.feedback(agoraIso(10 * DIA_MS));
    await sleep(1500);
    ok('E.6g maximo 2: em D+10 nada mais', lem(PL1.id) === 2 && A.emailsDe(dC3.email, t4).filter((e) => e.html.includes(PL1.descricao)).length === 0);
    const pt = porIdioma.pt ? A.emailsDe(porIdioma.pt.d.email, t1).find((e) => e.html.includes(porIdioma.pt.p.descricao)) : null;
    for (const l of IDIOMAS) {
      const m = A.emailsDe(porIdioma[l].d.email, t1).find((e) => e.html.includes(porIdioma[l].p.descricao));
      ok(`E.6h lembrete em ${l}: e-mail sem {var}/??/undefined${['et', 'ru'].includes(l) ? ', assunto diferente do PT' : ''}`, !!m && semPlaceholder(m.texto) && semPlaceholder(m.assunto) && (!['et', 'ru'].includes(l) || (!!pt && m.assunto !== pt.assunto)), m ? m.assunto : 'sem e-mail');
    }
  });

  // ======================= E.7: contato ate recebido/entregue + 30 dias (P-13) =======================
  await tentar('E.7', async () => {
    if (!P1) throw new Error('P1 ausente (E.2 falhou)');
    const k0 = await contatoDe(P1, S.c1);
    ok('E.7a dentro da janela: a compradora le o telefone da loja 1', k0?.telefone === '+372 5100 0001' && !k0?.arquivado, JSON.stringify(k0));
    await A.atualizarPedido(P1, { contato_visivel_ate: new Date(Date.now() - 60e3).toISOString() });
    const k1 = await contatoDe(P1, S.c1), k2 = await contatoDe(P1, S.l1);
    ok('E.7b janela vencida: a ROTA recusa pelo dado - { arquivado: true } sem telefone/endereco nos dois lados (REST)', k1?.arquivado === true && !k1?.telefone && !k1?.endereco && k2?.arquivado === true && !k2?.telefone && !k2?.endereco, JSON.stringify({ k1, k2 }));
    await ir(pL, '/ee/et/loja/pedidos', 3500);
    const row = pL.getByTestId('pedido-loja').filter({ hasText: (await A.cotacaoNoBanco(ped(P1).cotacao_id))?.peca_descricao });
    ok('E.7c /loja/pedidos: contato-arquivado na linha e sem o telefone da compradora', await visivel(row.getByTestId('contato-arquivado')) && !(await row.innerText()).includes(dC1.telefone));
    ok('E.7d /loja/pedidos: pedido recebido mostra pedido-recebido-info; o "nao entregou" da loja 2 nao aparece aqui', await visivel(row.getByTestId('pedido-recebido-info')));
    const kc = await A.contato([P1], S.cli.token);
    ok('E.7e motorista (nao e parte) -> contatos vazio', kc.status === 200 && Object.keys(kc.d?.contatos || {}).length === 0, mostra(kc));
  });

  // ======================= E.8: avaliacoes publicas (D-3), nome da autora (D-1), resumo, RLS =======================
  await tentar('E.8', async () => {
    const semente = async (of, autor, forn, nota, pc, np, tipo = 'loja', extra = {}) => { const p = await A.pedidoV3(of, forn, { tipo, status: 'entregue', descricao: `Semente ${nota}`, campos: { entregue_em: new Date().toISOString(), recebido_em: new Date().toISOString() } }); return { p, id: await A.avaliacaoSemente(p, of, autor, forn, { tipo, nota, peca_certa: pc, no_prazo: np, comentario: `Kommentaar ${nota}`, extra }) }; };
    await semente(ofC1, dC1, L4, 5, true, true); await semente(ofC2, dC2, L4, 4, true, false);
    const s3 = await semente(ofC3, dC3, L4, 3, false, true, 'loja', { editavel_ate: new Date(Date.now() - 3600e3).toISOString() });
    await semente(ofC1, dC1, L5, 5, true, true); await semente(ofC3, dC3, L5, 4, true, true);
    const r4 = await A.resumoForn(S.c1, 'loja', L4.id), r5 = await A.resumoForn(S.c1, 'loja', L5.id);
    ok('E.8a fornecedor_resumo(loja 4, 3 avaliacoes): media 4, total 3, % peca certa e % no prazo ~ 66,7, entregues_n 3', !r4.error && Math.abs(Number(r4.linha?.media) - 4) < 0.01 && Number(r4.linha?.total) === 3 && Math.abs(Number(r4.linha?.pct_peca_certa) - 66.67) < 1 && Math.abs(Number(r4.linha?.pct_no_prazo) - 66.67) < 1 && Number(r4.linha?.entregues_n) === 3 && Number(r4.linha?.nao_entregou_n) === 0, JSON.stringify(r4));
    ok('E.8b loja 5 com 2 avaliacoes: media NULL e percentuais NULL (nota so a partir de 3, no banco), total 2', !r5.error && r5.linha?.media === null && r5.linha?.pct_no_prazo === null && Number(r5.linha?.total) === 2, JSON.stringify(r5));
    const vazio = (r) => !r.error ? (!r.linha || r.linha.total == null) : true;
    const rCli = await A.resumoForn(S.cli, 'loja', L4.id), rReal = await A.resumoForn(S.ljReal, 'loja', L4.id), rIn = await A.resumoForn(S.c5, 'loja', L4.id), rL1 = await A.resumoForn(S.l1, 'loja', L4.id), rL4 = await A.resumoForn(S.l4, 'loja', L4.id);
    const { data: dAn, error: eAn } = await A.anon().rpc('fornecedor_resumo', { p_tipo: 'loja', p_id: L4.id });
    ok('E.8c resumo: loja parceira (D-3) e o proprio fornecedor leem (total 3); motorista, conta real (paridade), oficina inativa -> vazio; anon sem permissao', Number(rL1.linha?.total) === 3 && Number(rL4.linha?.total) === 3 && vazio(rCli) && vazio(rReal) && vazio(rIn) && (!!eAn || !dAn || (Array.isArray(dAn) && dAn.length === 0)), JSON.stringify({ rL1: rL1.linha?.total, rL4: rL4.linha?.total, rCli, rReal, rIn, eAn: eAn?.code }).slice(0, 300));
    const ler = async (s) => (await linhaRest(s, 'fornecedores_avaliacoes', { fornecedor_id: L4.id })).linhas.length;
    const n = { c2: await ler(S.c2), l1: await ler(S.l1), f1: await ler(S.f1), real: await ler(S.real), ljReal: await ler(S.ljReal), cli: await ler(S.cli), c5: await ler(S.c5) };
    const { data: anL } = await A.anon().from('fornecedores_avaliacoes').select('id').eq('fornecedor_id', L4.id);
    ok('E.8d RLS por REST (avaliacoes da loja 4): oficina parceira 3, LOJA parceira 3 (D-3), funcionario 3 (equipe le); oficina real 0, loja real 0, motorista 0, oficina inativa 0, anon 0', n.c2 === 3 && n.l1 === 3 && n.f1 === 3 && n.real === 0 && n.ljReal === 0 && n.cli === 0 && n.c5 === 0 && (anL || []).length === 0, JSON.stringify({ ...n, anon: (anL || []).length }));
    const { error: eIns } = await S.c1.c.from('fornecedores_avaliacoes').insert({ pedido_id: P1, oficina_id: ofC1.id, fornecedor_tipo: 'loja', fornecedor_id: L1.id, nota: 5 });
    const { data: upd } = await S.c1.c.from('fornecedores_avaliacoes').update({ nota: 1 }).eq('fornecedor_id', L4.id).eq('oficina_id', ofC1.id).select('id');
    const { data: del } = await S.c1.c.from('fornecedores_avaliacoes').delete().eq('fornecedor_id', L4.id).eq('oficina_id', ofC1.id).select('id');
    ok('E.8e o cliente NAO grava: INSERT 42501, UPDATE e DELETE pela REST nao afetam nenhuma linha', eIns?.code === '42501' && (upd || []).length === 0 && (del || []).length === 0 && (await A.avaliacoesDe({ fornecedor_id: L4.id })).length === 3, `${eIns?.code} upd=${(upd || []).length} del=${(del || []).length}`);
    const ed = await A.editarAvaliacao(s3.p.id, S.c3, { nota: 1 });
    ok('E.8f editar depois de 48 h (editavel_ate no passado) -> 409 FORA_DO_PRAZO', codigo(ed, 409, 'FORA_DO_PRAZO'), mostra(ed));
    // tela da compradora: nota na oferta, "novo no BipFix", lista com o nome da oficina autora (D-1)
    const Q8 = await A.cotacao(ofC1, 'Escolher por nota', { urgencia: 'amanha', alvo: 'so_lojas' });
    await resposta(Q8, L4, 30); await resposta(Q8, L5, 29);
    await A.admin.from('cotacoes_pecas').update({ status: 'respondida' }).eq('id', Q8.id);
    await ir(pD, '/ee/et/oficina/pecas', 3000);
    const card = cardCom(pD, Q8.descricao);
    const o4 = card.locator('[data-testid="oferta"]').filter({ hasText: L4.nome }), o5 = card.locator('[data-testid="oferta"]').filter({ hasText: L5.nome });
    const t4 = await o4.getByTestId('oferta-nota').innerText().catch(() => '');
    ok('E.8g oferta da loja 4: oferta-nota "★ 4,0 (3) · 67 % no prazo"', /4[,.]0/.test(t4) && /\(3\)/.test(t4) && /67\s?%/.test(t4), t4);
    const t5 = await o5.getByTestId('oferta-nota-nova').innerText().catch(() => '');
    ok('E.8h oferta da loja 5 (2 avaliacoes): oferta-nota-nova "Novo no BipFix · 2 entregues", sem oferta-nota', /\b2\b/.test(t5) && (await o5.getByTestId('oferta-nota').count()) === 0, t5);
    await o4.getByTestId('oferta-ver-avaliacoes').click();
    const lista = pD.getByTestId('avaliacoes-lista');
    const itens = lista.getByTestId('avaliacao-item');
    const txt = await lista.innerText().catch(() => '');
    ok('E.8i "ver avaliacoes": 3 avaliacao-item com o NOME DA OFICINA autora (D-1) e o comentario; nunca o nome da pessoa', await visivel(lista) && (await itens.count()) === 3 && [ofC1.nome, ofC2.nome, ofC3.nome].every((x) => txt.includes(x)) && txt.includes('Kommentaar 5') && ![dC1.nome, dC2.nome, dC3.nome].some((x) => txt.includes(x)), txt.slice(0, 300));
    ok('E.8j sem chave crua na lista nem no cartao', semChaveCrua(txt) && semChaveCrua(await card.innerText()));
    await pD.screenshot({ path: `${PRINTS}/lote3-avaliacoes-lista-et-1280.png`, fullPage: true });
    await pD.keyboard.press('Escape').catch(() => {});
    // loja 4: menu + /loja/avaliacoes (responder e denunciar pela tela)
    const ctxL4 = await nav.contexto('chromium', 1280, A.ip); const pL4 = await ctxL4.newPage(); vigiar(pL4, erros, 'E.8 loja4');
    await entrarPelaTela(pL4, '/ee/et', lojas['4'].d);
    await ir(pL4, '/ee/et/loja/dashboard', 2000);
    ok('E.8k menu da loja de teste (1280) tem o link para /loja/avaliacoes', await visivel(pL4.locator('nav a[href$="/loja/avaliacoes"]:visible')));
    await ir(pL4, '/ee/et/loja/avaliacoes', 3000);
    const it = pL4.getByTestId('loja-avaliacoes-item');
    const tl = await pL4.innerText('body');
    ok('E.8l /loja/avaliacoes: loja-avaliacoes-resumo (media 4,0 e 3) + 3 itens com o nome das oficinas autoras', /4[,.]0/.test(await pL4.getByTestId('loja-avaliacoes-resumo').innerText().catch(() => '')) && (await it.count()) === 3 && [ofC1.nome, ofC2.nome, ofC3.nome].every((x) => tl.includes(x)) && semChaveCrua(tl));
    const item5 = it.filter({ hasText: 'Kommentaar 5' }).first();
    await item5.getByTestId('avaliacao-responder').click();
    await item5.getByTestId('avaliacao-resposta-texto').fill('Aitah, tulge jalle');
    await item5.getByTestId('avaliacao-resposta-enviar').click();
    const resp = await esperar(async () => (await A.avaliacoesDe({ fornecedor_id: L4.id })).find((x) => x.comentario === 'Kommentaar 5'), (x) => !!x?.resposta);
    ok('E.8m responder pela tela da loja: resposta gravada (1x: o botao some)', resp?.resposta === 'Aitah, tulge jalle' && (await item5.getByTestId('avaliacao-responder').count()) === 0, JSON.stringify(resp)?.slice(0, 200));
    const item3 = it.filter({ hasText: 'Kommentaar 3' }).first();
    await item3.getByTestId('avaliacao-denunciar').click();
    await item3.getByTestId('avaliacao-denuncia-motivo').fill('Vale info');
    await item3.getByTestId('avaliacao-denuncia-enviar').click();
    const den = await esperar(async () => (await A.avaliacoesDe({ fornecedor_id: L4.id })).find((x) => x.comentario === 'Kommentaar 3'), (x) => !!x?.denunciada_em);
    ok('E.8n denunciar pela tela: denunciada_em gravado, continua visivel (oculta false)', !!den?.denunciada_em && den?.oculta === false);
    await pL4.screenshot({ path: `${PRINTS}/lote3-loja-avaliacoes-et-1280.png`, fullPage: true });
    await ctxL4.close();
  });

  // ======================= E.9: 3b - alcance "pais", condicao, P-20, nota da fornecedora =======================
  await tentar('E.9', async () => {
    Q9 = await A.cotacao(ofC1, 'Alcance pais', { urgencia: 'hoje', alvo: 'todos' });
    const n9 = await A.notificarFornecedores(Q9.id, S.c1.token);
    await A.esperarAviso(dVp.id, 'cotacao_peca_disponivel', 20);
    await sleep(1500);
    const tem = async (d) => (await A.sinoDisponivel(d.id, Q9.id)).length === 1;
    ok("E.9a alcance 'pais': vendedora a 200 km no mesmo pais AVISADA; com alcance NULL (raio 30) a 200 km nao; 'pais' em outro pais (IT) nao; vizinha a 2 km (raio) sim", n9.status === 200 && await tem(dVp) && !(await tem(dVr)) && !(await tem(dVi)) && await tem(dV), JSON.stringify({ n9: n9.d, vp: await tem(dVp), vr: await tem(dVr), vi: await tem(dVi), v: await tem(dV) }));
    const ctxP = await nav.contexto('chromium', 390, A.ip); const pP = await ctxP.newPage(); vigiar(pP, erros, 'E.9 vendedora pais');
    await entrarPelaTela(pP, '/ee/et', dVp);
    await ir(pP, '/ee/et/oficina/pecas?aba=vender', 3500);
    ok("E.9b aba Vender da vendedora 'pais' (200 km) lista a cotacao", (await pP.locator('div.card').filter({ hasText: Q9.descricao }).count()) === 1);
    await ctxP.close();
    const ctxR = await nav.contexto('chromium', 390, A.ip); const pR = await ctxR.newPage(); vigiar(pR, erros, 'E.9 vendedora raio');
    await entrarPelaTela(pR, '/ee/et', dVr);
    await ir(pR, '/ee/et/oficina/pecas?aba=vender', 3500);
    ok('E.9c aba Vender da vendedora com alcance NULL (raio de hoje, 200 km): nao lista', (await pR.locator('div.card').filter({ hasText: Q9.descricao }).count()) === 0);
    await ir(pR, '/ee/et/oficina/perfil', 3000);
    ok("E.9d /oficina/perfil da vendedora: alcance com 'pais' marcado por padrao (N-6) e 'raio' como opcao", (await pR.getByTestId('perfil-pecas-alcance-pais').isChecked().catch(() => false)) && (await pR.getByTestId('perfil-pecas-alcance-raio').count()) === 1);
    await marcar(pR.getByTestId('perfil-pecas-alcance-raio'));
    await botao(pR, ET('oficinaPerfil.salvarAlteracoes')).click();
    const alc = await esperar(() => psql(`select coalesce(pecas_alcance,'') from oficinas where id='${ofVr.id}'`), (v) => v === 'raio');
    ok("E.9e salvar o perfil grava pecas_alcance = 'raio'", alc === 'raio', alc);
    await ctxR.close();
    // condicao (P-23) pela aba Vender da vizinha
    const ctxV = await nav.contexto('chromium', 390, A.ip); const pV = await ctxV.newPage(); vigiar(pV, erros, 'E.9 vendedora');
    await entrarPelaTela(pV, '/ee/et', dV);
    await ir(pV, '/ee/et/oficina/pecas?aba=vender', 3500);
    const cv = pV.locator('div.card').filter({ hasText: Q9.descricao });
    await botao(cv, ET('oficinaPecas.responderCotacao')).click();
    await pV.locator('#c8551-6').fill('15'); await pV.locator('#c8551-7').fill('1');
    await marcar(cv.getByTestId('resposta-condicao-sobra_nova'));
    await botao(cv, ET('oficinaPecas.enviarResposta')).click();
    const rv = await esperar(async () => (await A.admin.from('cotacoes_pecas_respostas').select('*').eq('cotacao_id', Q9.id).eq('oficina_fornecedora_id', ofV.id).maybeSingle()).data, (x) => !!x);
    ok("E.9f vendedora responde com condicao 'sobra nova' -> condicao = 'sobra_nova'", rv?.condicao === 'sobra_nova', JSON.stringify(rv)?.slice(0, 200));
    // nota da fornecedora (3 avaliacoes semeadas)
    for (const [of, d, nota] of [[ofC1, dC1, 5], [ofC2, dC2, 5], [ofC3, dC3, 4]]) { const p = await A.pedidoV3(of, ofV, { tipo: 'oficina', status: 'entregue', descricao: `Venda nota ${nota}`, campos: { recebido_em: new Date().toISOString() } }); await A.avaliacaoSemente(p, of, d, ofV, { tipo: 'oficina', nota }); }
    await ir(pV, '/ee/et/oficina/pecas?aba=vender', 3500);
    const fn = await pV.getByTestId('fornecedora-nota').innerText().catch(() => '');
    ok('E.9g aba Vender: "Sua nota como fornecedora" (fornecedora-nota 4,7 (3)) + avaliacao-item com o nome da oficina autora + avaliacao-responder', /4[,.]7/.test(fn) && /\(3\)/.test(fn) && (await pV.getByTestId('avaliacao-item').count()) >= 3 && (await pV.innerText('body')).includes(ofC2.nome) && (await pV.getByTestId('avaliacao-responder').count()) >= 1, fn);
    await pV.screenshot({ path: `${PRINTS}/lote3-vender-nota-et-390.png`, fullPage: true });
    await ctxV.close();
    await ir(pD, '/ee/et/oficina/pecas', 3000);
    const ov = cardCom(pD, Q9.descricao).locator('[data-testid="oferta"]').filter({ hasText: ofV.nome });
    ok('E.9h compradora ve a condicao na oferta (oferta-condicao = pecas.condicoes.sobraNova)', (await ov.getByTestId('oferta-condicao').innerText().catch(() => '')).includes(ET('pecas.condicoes.sobraNova')));
    // P-20
    const p20 = await A.pedidoV3(ofC4, L1, { status: 'entregue', descricao: 'Mesmo registro', campos: { entregue_em: new Date(Date.now() - 4 * DIA_MS).toISOString(), recebido_em: new Date().toISOString(), lembretes_feedback: 1 } });
    const a20 = await A.avaliar(p20.id, S.c4, { nota: 5 });
    const pend20 = await A.pendentes(S.c4);
    ok('E.9i P-20: compradora com o MESMO codigo de registro da loja (normalizado: "12-345-678" = "12345678") -> 409 MESMO_REGISTRO, nada gravado', codigo(a20, 409, 'MESMO_REGISTRO') && !(await A.avaliacaoDoPedido(p20.id)), mostra(a20));
    ok('E.9j ... e esse pedido NAO prende a compradora no P-7 (nao ha avaliacao possivel)', pend20.status === 200 && pend20.d?.bloqueado === false && !(pend20.d?.pedidos || []).some((x) => x.id === p20.id), mostra(pend20));
    await A.feedback(agoraIso(25 * 3600e3));
    await sleep(1200);
    ok('E.9k par mesmo registro: a tarefa de lembretes tambem o exclui (lembretes_feedback continua 1, nenhum e-mail)', Number(ped(p20.id)?.lembretes_feedback) === 1 && A.emailsDe(dC4.email, t0).every((e) => !e.html.includes(p20.descricao)), String(ped(p20.id)?.lembretes_feedback));
  });

  // ======================= E.10: 3c Web Push do navegador =======================
  if (SEM_PUSH) console.log('info E.10 pulado (PECAS_LOTE3_SEM_PUSH=1): 3c fica para depois (D-11)');
  else await tentar('E.10', async () => {
    const chave = () => { const e = crypto.createECDH('prime256v1'); e.generateKeys(); return { p256dh: e.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') }; };
    const ep = (n = crypto.randomBytes(8).toString('hex')) => `https://fcm.googleapis.com/fcm/send/teste-${A.tag}-${n}`;
    const inscrever = (s, endpoint) => A.api('POST', ROTA.push, { endpoint, keys: chave() }, s.token);
    const linhas = async (filtro) => { let q = A.admin.from('push_navegador').select('*'); for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v); return (await q).data || []; };
    const g0 = await A.api('GET', ROTA.push, undefined, S.l1.token);
    ok('E.10a GET push/navegador -> { ativo: false, publicKey } (chave VAPID publica, base64url)', g0.status === 200 && g0.d?.ativo === false && /^[A-Za-z0-9_-]{80,}$/.test(g0.d?.publicKey || ''), mostra(g0));
    const E1 = ep('a');
    const i1 = await inscrever(S.l1, E1);
    ok('E.10b inscrever (endpoint fcm https) -> 200; linha da loja 1', i1.status === 200 && (await linhas({ endpoint: E1 }))[0]?.profile_id === lojas['1'].d.id, mostra(i1));
    const i2 = await inscrever(S.l2, E1);
    const l2 = await linhas({ endpoint: E1 });
    const gA = await A.api('GET', ROTA.push, undefined, S.l1.token), gB = await A.api('GET', ROTA.push, undefined, S.l2.token);
    ok('E.10c UPSERT por endpoint: a loja 2 entra no mesmo navegador -> a linha PASSA para ela (1 linha); loja 1 ativo false, loja 2 ativo true', i2.status === 200 && l2.length === 1 && l2[0].profile_id === lojas['2'].d.id && gA.d?.ativo === false && gB.d?.ativo === true, JSON.stringify(l2.map((x) => x.profile_id)));
    const bad1 = await A.api('POST', ROTA.push, { endpoint: 'http://fcm.googleapis.com/x', keys: chave() }, S.l3.token), bad2 = await A.api('POST', ROTA.push, { endpoint: 'https://evil.example.com/push/1', keys: chave() }, S.l3.token), anonP = await A.api('POST', ROTA.push, { endpoint: ep('anon'), keys: chave() });
    ok('E.10d http:// e host fora da lista -> 400 ENDPOINT_INVALIDO; sem sessao -> 401', codigo(bad1, 400, 'ENDPOINT_INVALIDO') && codigo(bad2, 400, 'ENDPOINT_INVALIDO') && anonP.status === 401, [bad1, bad2, anonP].map((x) => `${x.status}:${x.d?.codigo}`).join(' '));
    const r5 = []; for (let i = 0; i < 5; i++) r5.push(await inscrever(S.l3, ep(`l3-${i}`)));
    const r6 = await inscrever(S.l3, ep('l3-6'));
    ok('E.10e maximo 5 por perfil: a 6a -> 409 LIMITE_INSCRICOES', r5.every((x) => x.status === 200) && codigo(r6, 409, 'LIMITE_INSCRICOES') && (await linhas({ profile_id: lojas['3'].d.id })).length === 5, mostra(r6));
    const dl = await A.api('DELETE', ROTA.push, { endpoint: E1 }, S.l2.token);
    ok('E.10f DELETE (logout) apaga a inscricao', dl.status === 200 && (await linhas({ endpoint: E1 })).length === 0, mostra(dl));
    // servidor falso
    const urlTeste = env.WEB_PUSH_URL_TESTE || '';
    if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+/.test(urlTeste)) ok('E.10g servidor falso de push (WEB_PUSH_URL_TESTE=http://localhost:<porta>/... no .env.local)', false, 'WEB_PUSH_URL_TESTE ausente: acrescente ao .env.local e reinicie o :3100');
    else {
      const recebidos = []; let responder = 201;
      const srv = http.createServer((q, s) => { let b = ''; q.on('data', (c) => { b += c; }); q.on('end', () => { recebidos.push({ url: q.url, headers: q.headers, t: Date.now() }); s.statusCode = responder; s.end(); }); });
      await new Promise((r) => srv.listen(Number(new URL(urlTeste).port), r));
      try {
        await A.admin.from('push_navegador').delete().eq('profile_id', lojas['3'].d.id); // as 5 do E.10e receberiam push tambem
        const E2 = ep('fake');
        await inscrever(S.l1, E2);
        const n0 = recebidos.length;
        const Qh = await A.cotacao(ofC3, 'Push hoje', { urgencia: 'hoje', alvo: 'so_lojas' });
        await A.notificarFornecedores(Qh.id, S.c3.token);
        await esperar(() => recebidos.length, (n) => n > n0, 30);
        ok('E.10g cotacao "hoje" com e-mail imediato -> 1 POST no servidor falso para a inscricao da loja 1 (TTL, urgency high)', recebidos.length - n0 === 1 && String(recebidos.at(-1)?.headers?.urgency || '') === 'high', `${recebidos.length - n0} ${JSON.stringify(recebidos.at(-1)?.headers || {}).slice(0, 200)}`);
        const n1 = recebidos.length;
        const Qs = await A.cotacao(ofC3, 'Push sem pressa', { urgencia: 'sem_pressa', alvo: 'so_lojas' });
        await A.notificarFornecedores(Qs.id, S.c3.token);
        await sleep(3000);
        ok('E.10h cotacao "sem pressa" (vai ao resumo) -> 0 POST (D-8: nunca o resumo)', recebidos.length === n1, String(recebidos.length - n1));
        responder = 410;
        const Qc = await A.cotacao(ofC3, 'Push confirmado', { alvo: 'so_lojas' }); const rc = await resposta(Qc, L1, 10);
        await A.confirmar(rc, S.c3.token);
        await esperar(async () => (await linhas({ endpoint: E2 })).length, (n) => n === 0, 30);
        ok('E.10i pedido confirmado -> POST; servidor responde 410 -> inscricao apagada', (await linhas({ endpoint: E2 })).length === 0);
      } finally { srv.close(); }
    }
    const sw = await fetch(`${SITE}/sw-avisos.js`).catch(() => null);
    const swTxt = sw?.ok ? await sw.text() : '';
    ok('E.10j /sw-avisos.js: 200 JavaScript, ouve "push" e "notificationclick", SEM "fetch" (nem cache)', !!sw?.ok && /javascript/.test(sw.headers.get('content-type') || '') && /addEventListener\(\s*['"]push['"]/.test(swTxt) && /addEventListener\(\s*['"]notificationclick['"]/.test(swTxt) && !/addEventListener\(\s*['"]fetch['"]/.test(swTxt) && !/caches\./.test(swTxt), `${sw?.status} ${swTxt.length}`);
    if (swTxt) {
      const abertos = []; const ouvintes = {};
      const ctxVm = { self: { addEventListener: (t, f) => { ouvintes[t] = f; }, registration: { showNotification: async () => {} }, location: { origin: SITE } }, clients: { openWindow: async (u) => { abertos.push(u); }, matchAll: async () => [] }, URL, console };
      ctxVm.self.clients = ctxVm.clients;
      ctxVm.addEventListener = ctxVm.self.addEventListener; ctxVm.registration = ctxVm.self.registration; // SW escrito sem "self."
      try { vm.runInNewContext(swTxt, ctxVm, { timeout: 1000 }); } catch { /* segue */ }
      const clicar = async (link) => { const ev = { notification: { data: { link }, close() {} }, waitUntil: (p) => p, action: '' }; try { await ouvintes.notificationclick?.(ev); } catch { /* segue */ } await sleep(50); };
      await clicar('https://evil.example.com/roubar'); await clicar('//evil.example.com/x'); await clicar('/loja/cotacoes');
      ok('E.10k notificationclick: openWindow SO com caminho relativo "/..." (recusa https://evil e //evil)', abertos.length === 1 && /^\/loja\/cotacoes$|\/loja\/cotacoes$/.test(abertos[0]) && !abertos.some((u) => /evil/.test(u)), JSON.stringify(abertos));
    } else ok('E.10k notificationclick so com link relativo', false, 'sw-avisos.js ausente');
    await ir(pL, '/ee/et/loja/perfil', 3000);
    ok('E.10l /loja/perfil (teste): "Avisos no navegador" (push-ligar ou push-estado)', (await pL.getByTestId('push-ligar').count()) + (await pL.getByTestId('push-estado').count()) >= 1);
  });

  // ======================= E.11: itens de qualidade do lote 2 =======================
  await tentar('E.11', async () => {
    if (Q9) {
      const fila = await A.avisosEmail({ cotacao_id: Q9.id });
      const daL1 = fila.find((r) => r.profile_id === lojas['1'].d.id), daV = fila.find((r) => r.profile_id === dV.id);
      ok('E.11a avisos_email_pecas.fornecedor_id gravado nos dois ramos (loja 1 -> id da loja; vendedora -> id da oficina)', daL1?.fornecedor_id === L1.id && daV?.fornecedor_id === ofV.id, JSON.stringify(fila.map((r) => [r.profile_id === lojas['1'].d.id ? 'L1' : r.profile_id === dV.id ? 'V' : '?', r.fornecedor_id])).slice(0, 300));
    } else ok('E.11a fornecedor_id no log', false, 'Q9 ausente (E.9 falhou)');
    const Qsp = await A.cotacao(ofC3, 'Fila fornecedor_id', { urgencia: 'sem_pressa', alvo: 'todos' });
    await A.notificarFornecedores(Qsp.id, S.c3.token);
    const filaSp = await A.avisosEmail({ cotacao_id: Qsp.id });
    const spL1 = filaSp.find((r) => r.profile_id === lojas['1'].d.id), spV = filaSp.find((r) => r.profile_id === dV.id);
    ok("E.11a2 ramo FILA (sem pressa): linhas 'resumo' tambem com fornecedor_id (loja 1 e vendedora)", spL1?.tipo === 'resumo' && spL1?.fornecedor_id === L1.id && spV?.tipo === 'resumo' && spV?.fornecedor_id === ofV.id, JSON.stringify(filaSp.map((r) => [r.tipo, r.fornecedor_id])).slice(0, 300));
    const Qf = await A.cotacao(ofC3, 'Falha de envio', { urgencia: 'hoje', alvo: 'so_lojas' });
    let desbloquear = null;
    try { desbloquear = pastaEmailsBloqueada(A.EMAILS); await A.notificarFornecedores(Qf.id, S.c3.token); await sleep(1500); } finally { desbloquear?.(); }
    const lf = (await A.avisosEmail({ cotacao_id: Qf.id, profile_id: lojas['1'].d.id }))[0];
    ok("E.11b imediato que FALHA vira fila: enviado_em NULL, tipo 'resumo', motivo 'falha' (sai do teto)", !!lf && lf.enviado_em === null && lf.tipo === 'resumo' && lf.motivo === 'falha', JSON.stringify(lf));
    // nao-tenho-email re-checa o alvo (oficina numa cotacao que virou "so lojas")
    if (Q9) {
      // cotacao LIMPA (a vendedora respondeu a Q9 em E.9f: JA_RESPONDEU viria antes da re-checagem do alvo)
      const tQa = Date.now();
      const Qa = await A.cotacao(ofC1, 'Alvo re-checado', { urgencia: 'hoje', alvo: 'todos' });
      await A.notificarFornecedores(Qa.id, S.c1.token);
      const mV = await A.esperarEmail(dV.email, tQa, (e) => e.html.includes(Qa.descricao), 40);
      const tokV = mV ? tokensNaoTenho(mV.html)[0]?.token : null;
      await A.admin.from('cotacoes_pecas').update({ alvo: 'so_lojas' }).eq('id', Qa.id);
      const rt = tokV ? await A.naoTenhoEmail({ k: tokV, acao: 'confirmar' }) : { status: 0, d: { erro: 'sem token da vendedora' } };
      ok('E.11c "nao tenho" por e-mail de OFICINA numa cotacao que virou "so lojas" -> 410 (alvo re-checado), nenhuma dispensa da vendedora', rt.status === 410 && (await A.dispensas(Qa.id)).every((x) => x.fornecedor_id !== ofV.id), mostra(rt));
      const mL = A.emailsDe(lojas['1'].d.email, t0).find((e) => e.html.includes(Q9.descricao));
      const tokL = mL ? tokensNaoTenho(mL.html)[0]?.token : null;
      if (tokL) {
        const r = await A.get302(`/n/${tokL}?o=et`);
        ok('E.11d /n/<token> -> 302 com o token no FRAGMENTO (#k=), nunca na query (?k=) - nao vai ao servidor/nginx', r.status === 302 && r.location.includes(`${SLUG_NAO_TENHO.et}#k=${tokL}`) && !r.location.includes('?k='), r.location);
        const ctxN = await nav.contexto('chromium', 390, A.ip); await ctxN.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'accepted'); } catch {} });
        const urlsAnalytics = [];
        // gtag/js vira um stub que grava a URL no instante em que o analytics carregaria (abortar nao provaria nada); o resto e abortado
        await ctxN.route(/google-analytics|googletagmanager|clarity\.ms|facebook\.(com|net)/, (rt2) => { const u = rt2.request().url(); urlsAnalytics.push(u); if (/gtag\/js/.test(u)) return rt2.fulfill({ contentType: 'application/javascript', body: 'window.__hrefNoLoad = location.href;' }); return rt2.abort(); });
        const pN = await ctxN.newPage(); vigiar(pN, erros, 'E.11 /n');
        await pN.goto(`${SITE}${SLUG_NAO_TENHO.et}#k=${tokL}`, { waitUntil: 'networkidle' }).catch(() => {});
        await pN.waitForTimeout(2500);
        ok('E.11e pagina pelo fragmento: mostra a peca e LIMPA o hash (history.replaceState) antes do analytics; nenhuma chamada de GA/Clarity leva o token', await visivel(pN.getByTestId('nao-tenho-peca')) && !pN.url().includes(tokL) && urlsAnalytics.every((u) => !u.includes(tokL) && !decodeURIComponent(u).includes(tokL)) && !String(await pN.evaluate(() => window.__hrefNoLoad || '').catch(() => '')).includes(tokL), `${pN.url()} analytics=${urlsAnalytics.length} hrefNoLoad=${await pN.evaluate(() => window.__hrefNoLoad || '').catch(() => '?')}`);
        await pN.goto(`${SITE}${SLUG_NAO_TENHO.et}?k=${tokL}`, { waitUntil: 'networkidle' }).catch(() => {});
        await pN.waitForTimeout(1500);
        ok('E.11f link antigo com ?k= (e-mails ja enviados) continua aceito e sai da barra', await visivel(pN.getByTestId('nao-tenho-peca')) && !pN.url().includes(tokL), pN.url());
        await ctxN.close();
      } else ok('E.11d/e/f token da loja 1 no e-mail de Q9', false, 'sem token');
    }
  });

  // ======================= E.12: i18n =======================
  await tentar('E.12', async () => {
    const msgs = Object.fromEntries(IDIOMAS.map((l) => [l, mensagens(l)]));
    const faltam = []; for (const l of IDIOMAS) for (const k of CHAVES_I18N_L3) { const v = pegaChave(msgs[l], k); if (typeof v !== 'string' || !v.trim()) faltam.push(`${l}:${k}`); }
    ok(`E.12a ${CHAVES_I18N_L3.length} chaves novas (pecas.*) nos 6 idiomas, nao vazias`, faltam.length === 0, `${faltam.length} faltando: ${faltam.slice(0, 12).join(', ')}`);
    const iguais = []; for (const l of ['et', 'ru']) for (const k of CHAVES_I18N_L3_TEXTO) { const v = pegaChave(msgs[l], k), p = pegaChave(msgs.pt, k); if (typeof v === 'string' && v === p) iguais.push(`${l}:${k}`); }
    ok('E.12b ET e RU traduzidos de verdade (diferentes do PT)', faltam.length === 0 && iguais.length === 0, iguais.slice(0, 12).join(', '));
    let saida = ''; let okT = true;
    try { saida = execSync('node scripts/checar-traducoes.mjs', { cwd: WEB, stdio: 'pipe' }).toString(); } catch (e) { okT = false; saida = String(e.stdout || e.message); }
    ok('E.12c scripts/checar-traducoes.mjs passa', okT, saida.slice(-300));
    await ir(pD, `${PREFIXO.ru}/oficina/pecas`, 3000);
    ok('E.12d /oficina/pecas em ru sem chave crua (com nota, avaliacoes, cancelados)', semChaveCrua(await pD.innerText('body')) && (await pD.getByTestId('cotacao-peca').count()) > 0);
  });

  // ======================= E.13: limite 30/h no marcar-entregue =======================
  await tentar('E.13', async () => {
    const pr = await A.pedidoV3(ofC3, L5, { descricao: 'Limite' });
    const st = []; for (let i = 0; i < 31; i++) st.push((await A.entregue(pr.id, S.l5)).status);
    ok('E.13a marcar-pedido-peca-entregue: 30 chamadas/h por usuario (200, idempotente); a 31a -> 429', st.slice(0, 30).every((s) => s === 200) && st[30] === 429, st.join(','));
  });

  await ctxD.close(); await ctxL.close(); await ctxM.close();
  ok('sem erro de pagina nos navegadores', erros.length === 0, erros.join(' | '));
} catch (e) {
  ok('excecao geral', false, e?.stack || e?.message);
} finally {
  await nav.fechar();
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  ok('limpeza: nada desta rodada ficou no banco nem na pasta de e-mails; interruptor e pecas_p7_minimo restaurados', errosLimpeza.length === 0 && sobras.length === 0, [...errosLimpeza, ...sobras].join(' | '));
  process.exitCode = fim() ? 1 : 0;
}
