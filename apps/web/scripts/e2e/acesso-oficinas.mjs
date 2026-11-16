// E2E LOCAL do lote "acesso direto das oficinas pelo e-mail + lembrete" (17/11) - COMPORTAMENTO NOVO.
// Contrato: Documentos/Analises/Acesso_oficinas_2026-11-17/Fable_auditoria_mapa.md, secao 6 (lista final);
// ids dos testes em Plano_testes.md (N-*) + auditoria dos testes (Fable_auditoria_testes.md).
// Antes da implementacao este script FALHA (esperado).
//   N-B migracao 089 | N-A login em modo oficina + menu sem links de motorista (Chromium 390/1280, WebKit)
//   N-C e-mail de pedido novo e de convite com o link direto + "nao tenho interesse" | N-D /r/<n>?o=&k=
//   N-E abrir nao gasta; "ver"; ja logado | N-F toque entra e abre /oficina/orcamento; modo pela finalidade
//   N-G vencido, dois toques, inativa, dono errado, dono desativado, pedido fechado
//   N-I "nao tenho interesse" pelo e-mail (API + WebKit 390) + telas "ja orcou" e "ja dispensou"
//   N-J lembrete: quem recebe / quem fica de fora (12 h, 48 h por par, 24 h por oficina), e-mail por oficina
//       (global) e por pedido, auditoria, rota cobrar apagada
//   N-K historico de contato por oficina no admin (API + tela) + fluxo do admin com caixas de selecao
//   N-T traducoes
// Cria contas @example.test (TESTE-ACESSO ...) e apaga tudo no fim.
//   node acesso-oficinas.mjs [<.env.local>]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { lerEnv, ambiente, abrirNavegadores, contador, tradutor, mensagens, IDIOMAS, SITE, WEB, TOKEN_RE, psql, semRolagemLateral, vigiar, entrarPelaTela, PRINTS, sleep, horasAtras, ENV_PADRAO, semLinksMotorista, comLinksMotorista, semLinksMotoristaHtml } from './acesso-oficinas-lib.mjs';

const env = lerEnv(process.argv[2] || ENV_PADRAO);
const A = ambiente(env);
const { ok, fim, tentar } = contador();
const ET = tradutor('et'), RU = tradutor('ru');
const erros = [];
const nav = await abrirNavegadores(true);
const CAMINHO_VER = { et: '/ee/et/vaata-paringut', ru: '/ee/ru/prosmotr-zayavki', en: '/ee/en/view-request' };
const linksDoEmail = (mail, numero) => {
  const ls = A.linksDe(mail?.html || '').filter((l) => l.includes(`/r/${numero}?`));
  const abrir = ls.find((l) => /[?&]k=/.test(l) && !/[?&]d=1/.test(l));
  const nao = ls.find((l) => /[?&]k=/.test(l) && /[?&]d=1/.test(l));
  return { abrir, nao, k: abrir && new URL(abrir).searchParams.get('k'), kNao: nao && new URL(nao).searchParams.get('k') };
};
const caminho = (url) => url.replace(/^https?:\/\/[^/]+/, '');
const visivel = (loc, ms = 8000) => loc.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
const dispensaDe = async (sol, of) => (await A.admin.from('pedido_dispensas').select('*').eq('solicitacao_id', sol.id).eq('oficina_id', of.id).maybeSingle()).data;

try {
  // ======================= dados =======================
  const cli = await A.conta('cliente', 'cliente', { idioma: 'et' });
  const adm = await A.conta('admin', 'admin', { idioma: 'pt' });
  const sA = await A.sessao(adm);
  const P = await A.pedido(cli, { tipo: 'mecanica', descricao: 'principal' });
  const dono = {}; const W = {};
  for (const [n, idioma] of [['W1', 'et'], ['W2', 'ru'], ['W3', 'en'], ['W4', 'it'], ['W5', 'pt'], ['W6', 'pt-PT'], ['W9', 'et'], ['W11', 'et'], ['W12', 'et']]) {
    dono[n] = await A.conta('oficina', n.toLowerCase(), { idioma }); W[n] = await A.oficina(dono[n], n, { km: 1 + Number(n.slice(1)) * 0.3, esp: ['mecanica'] });
  }
  // W8: perfil admin dono de uma oficina (nunca recebe link); W10: dono desativado desde o inicio (idem);
  // W12: dono sem e-mail (sino registra sem_email); donoNovo: conta sem oficina (troca de dono em N-G4)
  dono.W8 = await A.conta('admin', 'w8admin', { idioma: 'et' }); W.W8 = await A.oficina(dono.W8, 'W8 admin', { km: 2, esp: ['mecanica'] });
  dono.W10 = await A.conta('oficina', 'w10', { idioma: 'et', ativo: false }); W.W10 = await A.oficina(dono.W10, 'W10 dono inativo', { km: 2.2, esp: ['mecanica'] });
  { const { error: e12 } = await A.admin.from('profiles').update({ email: '' }).eq('id', dono.W12.id); if (e12) throw new Error('W12 sem e-mail: ' + e12.message); } // profiles.email e NOT NULL: '' = sem e-mail
  const donoNovo = await A.conta('oficina', 'dono-novo', { idioma: 'et' });
  const dInv = await A.conta('oficina', 'winv', { idioma: 'ru' }); const Winv = await A.oficina(dInv, 'Winv convidada', { km: 60, esp: ['eletrica'] });
  const P2 = await A.pedido(cli, { tipo: 'mecanica', descricao: 'vai fechar' });
  const dono7 = await A.conta('oficina', 'w7', { idioma: 'et' }); const W7 = await A.oficina(dono7, 'W7 fechado', { km: 1, esp: ['mecanica'] });

  // ======================= N-B: migracao 089 =======================
  await tentar('N-B', async () => {
    const cols = psql("select string_agg(column_name || ':' || data_type || ':' || coalesce(column_default,''), ',' order by column_name) from information_schema.columns where table_name='links_acesso' and column_name in ('oficina_id','finalidade','visto_em')");
    ok('N-B1 links_acesso tem oficina_id (uuid), finalidade (text, default cliente) e visto_em', /finalidade:text:'cliente'/.test(cols) && /oficina_id:uuid/.test(cols) && /visto_em:timestamp/.test(cols), cols);
    const fn = psql("select pg_get_function_result('link_acesso_usar'::regproc)");
    ok('N-B2 link_acesso_usar devolve oficina_id e finalidade', /oficina_id uuid/.test(fn) && /finalidade text/.test(fn), fn);
    const perm = psql("select string_agg(grantee, ',') from information_schema.routine_privileges where routine_name='link_acesso_usar'");
    ok('N-B3 link_acesso_usar so para service_role (REVOKE/GRANT refeitos depois do DROP)', /service_role/.test(perm) && !/\bauthenticated\b/.test(perm) && !/\banon\b/.test(perm), perm);
    const chk = psql("select count(*) from pg_constraint where conrelid='links_acesso'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%finalidade%oficina_id%'");
    ok('N-B4 CHECK de coerencia finalidade x oficina_id', Number(chk) >= 1, chk);
    const orig = psql("select coalesce(column_default,'') from information_schema.columns where table_name='pedido_dispensas' and column_name='origem'");
    ok("N-B5 pedido_dispensas.origem (default 'painel')", /painel/.test(orig), orig);
    // to_jsonb: a consulta roda mesmo antes da coluna existir (hoje -> tudo 'cliente')
    const antigas = psql("select count(*) from links_acesso l where coalesce(to_jsonb(l)->>'finalidade','cliente') <> 'cliente' and (to_jsonb(l)->>'oficina_id') is null");
    ok('N-B6 linhas antigas continuam finalidade=cliente', antigas === '0', antigas);
    const idx = psql("select count(*) from pg_indexes where tablename='links_acesso' and indexdef ilike '%(oficina_id, solicitacao_id)%'");
    ok('N-B7 indice links_acesso (oficina_id, solicitacao_id)', Number(idx) >= 1, idx);
    const chkFin = psql("select count(*) from pg_constraint where conrelid='links_acesso'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%finalidade%' and pg_get_constraintdef(oid) ilike '%''cliente''%' and pg_get_constraintdef(oid) ilike '%''oficina''%' and pg_get_constraintdef(oid) not ilike '%oficina_id%'");
    ok("N-B8 CHECK finalidade IN ('cliente','oficina')", Number(chkFin) >= 1, chkFin);
    const chkOrig = psql("select count(*) from pg_constraint where conrelid='pedido_dispensas'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%origem%' and pg_get_constraintdef(oid) ilike '%''email''%'");
    ok("N-B9 CHECK pedido_dispensas.origem IN ('painel','email')", Number(chkOrig) >= 1, chkOrig);
    // idempotente: o arquivo roda de novo sem erro (numa transacao desfeita; o deploy aplica com -1)
    const arq = path.resolve(WEB, '../../supabase/migrations/089_link_acesso_oficina.sql');
    let okB10 = fs.existsSync(arq), saidaB10 = okB10 ? '' : 'arquivo nao existe';
    if (okB10) { try { psql(`BEGIN;\n${fs.readFileSync(arq, 'utf8')}\nROLLBACK;`); } catch (e) { okB10 = false; saidaB10 = String(e.stderr || e.message); } }
    ok('N-B10 089 e idempotente (roda de novo sem erro, transacao desfeita)', okB10, saidaB10);
  });

  // ======================= N-A: login em modo oficina + menu =======================
  await tentar('N-A', async () => {
    const voltar = `/ee/ru/oficina/enviar-orcamento/${P.id}?n=${P.numero}`;
    for (const [motor, largura] of [['chromium', 390], ['chromium', 1280], ['webkit', 390]]) {
      const ctx = await nav.contexto(motor, largura, A.ip);
      const p = await ctx.newPage(); vigiar(p, erros, `N-A ${motor}`);
      await p.goto(`${SITE}/ee/ru/login?voltar=${encodeURIComponent(voltar)}`, { waitUntil: 'networkidle' });
      const rotulo = `${motor} ${largura}`;
      const caixa = p.getByTestId('login-oficina-aviso');
      ok(`N-A1 ${rotulo} caixa "entre na conta da oficina" com o numero ${P.numero}`, await visivel(caixa) && (await caixa.innerText().catch(() => '')).includes(String(P.numero)));
      ok(`N-A2 ${rotulo} cabecalho sem "Узнать цену"/"Статьи"/"Автосервисам"`, await semLinksMotorista(p, RU), (await p.locator('nav').first().innerText()).slice(0, 120));
      const corpo = await p.innerText('body');
      ok(`N-A3 ${rotulo} logo, idioma e "Войти" continuam`, (await p.locator('img[alt="BipFix"]').count()) >= 1 && corpo.includes(RU('nav.entrar')));
      ok(`N-A4 ${rotulo} "receber codigo" visivel com a dica`, await p.getByTestId('login-receber-codigo').isVisible() && await visivel(p.getByTestId('login-oficina-codigo-dica'), 3000));
      ok(`N-A5 ${rotulo} formulario de senha continua (e-mail + senha + Войти)`, await p.locator('#c0862-2').isVisible() && await p.locator('#login-senha').isVisible());
      ok(`N-A6 ${rotulo} sem rolagem lateral`, await semRolagemLateral(p));
      await p.screenshot({ path: `${PRINTS}/login-oficina-ru-${motor}-${largura}.png`, fullPage: true });
      await ctx.close();
    }
    // chegando pelo link antigo (sem token): /r/<n>?o=ru -> login ja em modo oficina com o numero
    const ctx = await nav.contexto('chromium', 390, A.ip);
    const p = await ctx.newPage(); vigiar(p, erros, 'N-A7');
    await p.goto(`${SITE}/r/${P.numero}?o=ru`, { waitUntil: 'networkidle' });
    await p.waitForURL(/\/login/, { timeout: 20000 }).catch(() => {});
    ok('N-A7 /r/<n>?o=ru sem sessao -> login em modo oficina com "pedido <n>"', p.url().includes('/ee/ru/login') && await visivel(p.getByTestId('login-oficina-aviso')) && (await p.getByTestId('login-oficina-aviso').innerText().catch(() => '')).includes(String(P.numero)), p.url());
    // login comum (sem voltar) e cadastro: sem a caixa, mas tambem sem links de motorista (decisao 1.3 B)
    await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' });
    ok('N-A8 login sem ?voltar: sem caixa de oficina e sem links de motorista no cabecalho', (await p.getByTestId('login-oficina-aviso').count()) === 0 && await semLinksMotorista(p, ET));
    await p.goto(`${SITE}/ee/et/registreeru`, { waitUntil: 'networkidle' });
    ok('N-A9 cadastro: sem links de motorista no cabecalho', await semLinksMotorista(p, ET));
    await p.goto(`${SITE}/ee/et`, { waitUntil: 'networkidle' });
    ok('N-A10 home: os 3 links de motorista continuam no cabecalho', await comLinksMotorista(p, ET));
    // "modo oficina" so para /oficina(/|$): o perfil publico /oficinas/... nao conta (bug do middleware 10/10)
    await p.goto(`${SITE}/ee/et/login?voltar=${encodeURIComponent('/ee/et/oficinas/abc')}`, { waitUntil: 'networkidle' });
    ok('N-A11 voltar=/oficinas/... (perfil publico): sem a caixa de oficina', !(await visivel(p.getByTestId('login-oficina-aviso'), 2500)));
    await p.goto(`${SITE}/ee/et/login?voltar=${encodeURIComponent('/ee/et/oficina/pedidos')}`, { waitUntil: 'networkidle' });
    const semN = await visivel(p.getByTestId('login-oficina-aviso')) ? await p.getByTestId('login-oficina-aviso').innerText() : '';
    ok('N-A12 voltar=/oficina/pedidos (sem numero): caixa com o titulo sem numero (nada de "undefined"/"{n}")', semN.length > 0 && !/undefined|\{n\}|null/.test(semN), semN.slice(0, 120));
    await p.goto(`${SITE}/ee/et/login?voltar=${encodeURIComponent(`/ee/et/oficina/enviar-orcamento/${P.id}?n=abc<b>x`)}`, { waitUntil: 'networkidle' });
    const nRuim = await visivel(p.getByTestId('login-oficina-aviso')) ? await p.getByTestId('login-oficina-aviso').innerText() : '';
    ok('N-A13 n fora do formato (so digitos): caixa sem o valor (nunca interpolado)', nRuim.length > 0 && !/abc|<b>/.test(nRuim), nRuim.slice(0, 120));
    await ctx.close();
    // todas as paginas de conta, no HTML do servidor (decisao pelo pathname, sem salto de layout):
    // sem os links de motorista ja na primeira pintura; traduzidas tambem (vali-konto, loo-parool)
    const paginas = [['/ee/et/login', ET], ['/ee/ru/login', RU], ['/ee/et/registreeru', ET], ['/ee/et/vali-konto', ET], ['/ee/et/loo-parool', ET], ['/ee/et/reset-password', ET], ['/ee/et/definir-senha', ET], [`${CAMINHO_VER.et}`, ET]];
    const falhas = [];
    for (const [pg, tr] of paginas) {
      const r = await fetch(`${SITE}${pg}`, { redirect: 'manual', headers: { 'x-real-ip': A.ip() } });
      if (r.status >= 300 && r.status < 400) continue; // pagina que exige algo (token, sessao): nao e o caso aqui
      if (r.status !== 200) { falhas.push(`${pg}: ${r.status}`); continue; }
      if (!semLinksMotoristaHtml(await r.text(), tr)) falhas.push(`${pg}: com links`);
    }
    ok('N-A14 HTML do servidor das paginas de conta (login/cadastro/escolher-tipo/criar-senha/reset/definir-senha/ver-pedido): sem links de motorista', falhas.length === 0, falhas.join(' | '));
    const navbar = fs.readFileSync(path.join(WEB, 'src/components/layout/Navbar.tsx'), 'utf8');
    ok('N-A15 Navbar.tsx decide pelo pathname: sem useSearchParams (regressao 1.3 - Suspense/CLS)', !/useSearchParams/.test(navbar) && /ver-pedido/.test(navbar));
  });

  // ======================= N-C: e-mails com o link direto =======================
  const mails = {}; const tok = {};
  await tentar('N-C', async () => {
    const prev = await A.api('GET', `/api/admin/solicitacoes/${P.id}/avisar`, undefined, sA.token);
    const ids = (prev.d.seriam || []).map((o) => o.oficina_id);
    ok('N-C0 previa do aviso inclui as oficinas de teste', ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W8', 'W9', 'W10', 'W11', 'W12'].every((n) => ids.includes(W[n].id)) && !ids.includes(Winv.id), JSON.stringify(ids));
    const t0 = Date.now();
    const env1 = await A.api('POST', `/api/admin/solicitacoes/${P.id}/avisar`, { esperados: ids }, sA.token);
    ok('N-C1 confirmar e avisar -> 200', env1.status === 200 && env1.d.avisadas === ids.length, JSON.stringify(env1.d));
    for (const n of ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W9', 'W8', 'W10', 'W11']) {
      mails[n] = await A.esperarEmail(dono[n].email, t0, (e) => /\/r\/\d+\?o=/.test(e.html), 80);
      tok[n] = linksDoEmail(mails[n], P.numero);
    }
    const w1 = tok.W1;
    ok('N-C2 e-mail de pedido novo (ET): botao /r/<n>?o=et&k=<43> e link "nao tenho interesse" = mesmo token + &d=1', !!w1.abrir && w1.abrir.includes(`/r/${P.numero}?o=et&k=`) && TOKEN_RE.test(w1.k || '') && !!w1.nao && w1.kNao === w1.k, JSON.stringify(w1));
    const l1 = w1.k && await A.linha(w1.k);
    ok('N-C3 links_acesso: finalidade oficina, oficina_id W1, user = dono, 72 h, nao usado/visto', !!l1 && l1.finalidade === 'oficina' && l1.oficina_id === W.W1.id && l1.user_id === dono.W1.id && !l1.usado_em && !l1.visto_em && Math.abs((new Date(l1.expira_em) - Date.now()) / 3600e3 - 72) < 1, JSON.stringify(l1));
    ok('N-C4 e-mails RU/EN/IT/PT/PT-PT tambem com os dois links no idioma (o=<idioma>)', ['W2', 'W3', 'W4', 'W5', 'W6'].every((n) => tok[n].abrir && tok[n].nao && tok[n].abrir.includes(`?o=${encodeURIComponent(dono[n].idioma)}&k=`)), JSON.stringify(Object.fromEntries(['W2', 'W3', 'W4', 'W5', 'W6'].map((n) => [n, tok[n].abrir]))));
    ok('N-C5 e-mail ET sem promessa de tempo e sem "tasuta" (tom do dono 07/11)', !!mails.W1 && !/tasuta|\b\d+\s*(min|tund)/i.test(mails.W1.texto));
    ok('N-C6 oficina cujo perfil e admin: e-mail SEM token (link de hoje)', !!mails.W8 && !tok.W8.abrir && A.linksDe(mails.W8.html).some((l) => l.includes(`/r/${P.numero}?o=et`) && !/[?&]k=/.test(l)), mails.W8 && A.linksDe(mails.W8.html).join(' '));
    const tokens = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W9', 'W11'].map((n) => tok[n].k);
    ok('N-C7 um token por oficina (todos diferentes)', tokens.every(Boolean) && new Set(tokens).size === tokens.length);
    // convite da BipFix (085): mesmo e-mail base -> tambem com os dois links
    const t1 = Date.now();
    const conv = await A.api('POST', `/api/admin/solicitacoes/${P.id}/convidar`, { oficinaIds: [Winv.id], motivo: 'TESTE-ACESSO convite' }, sA.token);
    ok('N-C8 convidar -> 200', conv.status === 200, JSON.stringify(conv.d));
    mails.Winv = await A.esperarEmail(dInv.email, t1, (e) => /\/r\/\d+\?o=/.test(e.html), 60);
    tok.Winv = linksDoEmail(mails.Winv, P.numero);
    const lInv = tok.Winv.k && await A.linha(tok.Winv.k);
    ok('N-C9 e-mail do convite (RU) com link direto + "nao tenho interesse", token da oficina convidada', !!tok.Winv.abrir && tok.Winv.abrir.includes(`/r/${P.numero}?o=ru&k=`) && !!tok.Winv.nao && !!lInv && lInv.finalidade === 'oficina' && lInv.oficina_id === Winv.id, JSON.stringify(tok.Winv));
    // registro do e-mail no sino (A: "o e-mail saiu?")
    const sino = (await A.admin.from('notificacoes').select('dados').eq('profile_id', dono.W1.id).eq('dados->>solicitacao_id', P.id).eq('tipo', 'nova_solicitacao').maybeSingle()).data;
    ok("N-C10 sino nova_solicitacao guarda dados.email = 'enviado' (+ email_em)", sino?.dados?.email === 'enviado' && !isNaN(Date.parse(sino?.dados?.email_em || '')), JSON.stringify(sino?.dados));
    ok('N-C11 dono do perfil desativado (W10): e-mail SEM token (link de hoje)', !!mails.W10 && !tok.W10.abrir && A.linksDe(mails.W10.html).some((l) => l.includes(`/r/${P.numero}?o=et`) && !/[?&]k=/.test(l)), mails.W10 && A.linksDe(mails.W10.html).join(' '));
    const sino12 = (await A.admin.from('notificacoes').select('dados').eq('profile_id', dono.W12.id).eq('dados->>solicitacao_id', P.id).eq('tipo', 'nova_solicitacao').maybeSingle()).data;
    ok("N-C12 dono sem e-mail (W12): sino com dados.email = 'sem_email' e nenhum link gerado", sino12?.dados?.email === 'sem_email' && (await A.admin.from('links_acesso').select('id', { count: 'exact', head: true }).eq('oficina_id', W.W12.id)).count === 0, JSON.stringify(sino12?.dados));
  });

  // ======================= N-D: /r/<n>?o=<idioma>&k= =======================
  await tentar('N-D', async () => {
    const k = tok.W1?.k || 'x'.repeat(43);
    const r = await A.get302(`/r/${P.numero}?o=et&k=${k}`);
    ok('N-D1 /r/<n>?o=et&k= -> 302 ver-pedido (ET) com k e marca de oficina (o=1 ou of=1)', r.status === 302 && r.location.includes(`${CAMINHO_VER.et}?k=${k}`) && /[&?]o(f)?=1/.test(r.location), r.location);
    const r2 = await A.get302(`/r/${P.numero}?o=ru&k=${tok.W2?.k || k}&d=1`);
    ok('N-D2 ...&d=1 -> ver-pedido (RU) com d=1', r2.status === 302 && r2.location.includes(CAMINHO_VER.ru) && /[&?]d=1/.test(r2.location), r2.location);
    const r3 = await A.get302(`/r/${P.numero}?o=et`);
    ok('N-D3 sem k: /oficina/enviar-orcamento/<id>?n=<numero> (como hoje + numero)', r3.status === 302 && r3.location.includes(`/ee/et/oficina/enviar-orcamento/${P.id}`) && r3.location.includes(`n=${P.numero}`), r3.location);
    const r4 = await A.get302(`/r/${P.numero}?o=et&k=abc`);
    ok('N-D4 k com formato errado: ignora o k (enviar-orcamento), nao vai ao ver-pedido', r4.status === 302 && r4.location.includes('/oficina/enviar-orcamento/') && !r4.location.includes('vaata-paringut'), r4.location);
    const r5 = await A.get302(`/r/${P.numero}?o=et&k=${k}&p=1`);
    ok('N-D5 o+k vence o ramo p=1 (novas datas): vai ao ver-pedido', r5.status === 302 && r5.location.includes(`${CAMINHO_VER.et}?k=${k}`), r5.location);
  });

  // ======================= N-E: abrir nao gasta; "ver"; ja logado =======================
  await tentar('N-E', async () => {
    const k = tok.W1?.k; if (!k) throw new Error('sem token de W1');
    const pg = await fetch(`${SITE}${CAMINHO_VER.et}?k=${k}&o=1`, { headers: { 'x-real-ip': A.ip() } });
    const html = await pg.text();
    ok('N-E1 pagina ver-pedido (oficina) abre 200, noindex, sem links de motorista no HTML do servidor', pg.status === 200 && /noindex/.test(html) && semLinksMotoristaHtml(html, ET), String(pg.status));
    let l = await A.linha(k);
    ok('N-E2 abrir a pagina (GET) nao gasta nem marca visto', !l.usado_em && !l.visto_em, JSON.stringify(l));
    const ver = await A.linkAcesso({ k, acao: 'ver' });
    ok('N-E3 "ver": finalidade oficina, nome da oficina, numero, carro, aberto, sem orcamento/dispensa', ver.status === 200 && ver.d.finalidade === 'oficina' && ver.d.oficina?.nome === W.W1.nome && String(ver.d.numero) === String(P.numero) && String(ver.d.carro || '').includes('Toyota') && 'tipo' in ver.d && ver.d.aberto === true && ver.d.jaOrcou === false && !ver.d.dispensa && ver.d.solicitacaoId === P.id && ver.d.jaLogado !== true, JSON.stringify(ver.d));
    const txt = JSON.stringify(ver.d);
    ok('N-E4 "ver" nao vaza e-mail/telefone/endereco completo do cliente', !txt.includes(cli.email) && !txt.includes('5000 0000') && !txt.includes('Tallinna mnt 1') && !txt.includes(cli.nome), txt);
    l = await A.linha(k);
    ok('N-E5 "ver" marca visto_em e nao gasta', !!l.visto_em && !l.usado_em, JSON.stringify(l));
    ok('N-E6 token inexistente -> 410', (await A.linkAcesso({ k: 'A'.repeat(43), acao: 'ver' })).status === 410);
    // ja logado como o dono (sessao Bearer): "ver" avisa; "entrar" devolve o destino sem gastar o token
    const s9 = await A.sessao(dono.W9);
    const v9 = await A.api('POST', '/api/link-acesso', { k: tok.W9.k, acao: 'ver' }, s9.token);
    ok('N-E7 "ver" com a sessao do dono: jaLogado', v9.status === 200 && v9.d.jaLogado === true, JSON.stringify(v9.d));
    const e9 = await A.api('POST', '/api/link-acesso', { k: tok.W9.k, acao: 'entrar' }, s9.token);
    ok('N-E8 "entrar" com a sessao do dono: jaLogado + destino /oficina/orcamento/<id>, sem tokenHash, token NAO gasto', e9.status === 200 && e9.d.jaLogado === true && String(e9.d.destino || '').includes(`/oficina/orcamento/${P.id}`) && !e9.d.tokenHash && !(await A.linha(tok.W9.k)).usado_em, JSON.stringify(e9.d));
  });

  // ======================= N-F: toque entra e abre o pedido (Chromium 390) =======================
  await tentar('N-F', async () => {
    const k = tok.W1?.k; if (!k) throw new Error('sem token de W1');
    const ctx = await nav.contexto('chromium', 390, A.ip);
    const p = await ctx.newPage(); vigiar(p, erros, 'N-F');
    await p.goto(`${SITE}/r/${P.numero}?o=et&k=${k}`, { waitUntil: 'networkidle' });
    const cartao = p.getByTestId('ver-pedido-oficina');
    await cartao.waitFor();
    const t = await cartao.innerText();
    ok('N-F1 cartao da oficina: nome, numero, tipo; botao principal e "nao tenho interesse"', t.includes(W.W1.nome) && t.includes(String(P.numero)) && await p.getByTestId('ver-pedido-entrar').isVisible() && await p.getByTestId('ver-pedido-dispensar').isVisible(), t.slice(0, 200));
    ok('N-F2 token fora da barra; cabecalho sem links de motorista; sem rolagem lateral', !p.url().includes('k=') && await semLinksMotorista(p, ET) && await semRolagemLateral(p), p.url());
    await p.screenshot({ path: `${PRINTS}/ver-pedido-oficina-et-chromium-390.png`, fullPage: true });
    ok('N-F3 ainda nao gastou (so abriu)', !(await A.linha(k)).usado_em);
    await p.getByTestId('ver-pedido-entrar').click();
    await p.waitForURL(/oficina\/orcamento\//, { timeout: 30000 }).catch(() => {});
    ok('N-F4 toque -> logado em /ee/et/oficina/orcamento/<id> (sem passar pelo login)', p.url().includes(`/ee/et/oficina/orcamento/${P.id}`), p.url());
    const formOrc = await visivel(p.getByTestId('enviar-orcamento'), 15000) || await visivel(p.getByTestId('enviar-orcamento-novo'), 1000);
    ok('N-F5 pagina de orcar carregou para a oficina (botao de enviar orcamento)', formOrc);
    ok('N-F6 token gasto', !!(await A.linha(k)).usado_em);
    ok('N-F7 "entrar" de novo -> 410', (await A.linkAcesso({ k, acao: 'entrar' })).status === 410);
    const dG = await A.linkAcesso({ k, acao: 'dispensar', motivo: 'nao_faz' });
    ok('N-F7b token gasto: "dispensar" -> 410 e nada gravado', dG.status === 410 && !(await dispensaDe(P, W.W1)), JSON.stringify(dG));
    await p.goto(`${SITE}/r/${P.numero}?o=et&k=${k}`, { waitUntil: 'networkidle' });
    await p.waitForURL(/oficina\/orcamento\//, { timeout: 20000 }).catch(() => {});
    ok('N-F8 ja logado como o dono: o link (gasto) vai direto ao pedido', p.url().includes(`/oficina/orcamento/${P.id}`) && (await p.getByTestId('ver-pedido-oficina').count()) === 0, p.url());
    await ctx.close();
    // o modo da tela vem de `finalidade` (resposta de "ver"), nao de ?o=1 na URL (contrato 2.6)
    const ctx2 = await nav.contexto('chromium', 390, A.ip);
    const p2 = await ctx2.newPage(); vigiar(p2, erros, 'N-F9');
    await p2.goto(`${SITE}${CAMINHO_VER.et}?k=${tok.W11.k}`, { waitUntil: 'networkidle' });
    ok('N-F9 token de OFICINA sem ?o=1: cartao da oficina mesmo assim', await visivel(p2.getByTestId('ver-pedido-oficina')) && (await p2.getByTestId('ver-pedido-ola').count()) === 0);
    const kc = await A.linkDireto(cli, P);
    await p2.goto(`${SITE}${CAMINHO_VER.et}?k=${kc}&o=1`, { waitUntil: 'networkidle' });
    ok('N-F10 token de CLIENTE com ?o=1: tela do cliente (nunca a da oficina)', await visivel(p2.getByTestId('ver-pedido-ola')) && (await p2.getByTestId('ver-pedido-oficina').count()) === 0 && (await p2.getByTestId('ver-pedido-dispensar').count()) === 0);
    await ctx2.close();
  });

  // ======================= N-G: casos de borda do token =======================
  await tentar('N-G', async () => {
    // vencido (72 h): a data e vencida no banco (o prazo de 72 h em si e conferido em N-C3)
    const k3 = tok.W3?.k; if (!k3) throw new Error('sem token de W3');
    await A.admin.from('links_acesso').update({ expira_em: horasAtras(1) }).eq('token_hash', (await A.linha(k3)).token_hash);
    const v3 = await A.linkAcesso({ k: k3, acao: 'ver' }), e3 = await A.linkAcesso({ k: k3, acao: 'entrar' });
    ok('N-G1 vencido: ver 410 e entrar 410 (LINK_INVALIDO, finalidade oficina, solicitacaoId) sem gastar', v3.status === 410 && e3.status === 410 && [v3, e3].every((r) => r.d.codigo === 'LINK_INVALIDO' && r.d.finalidade === 'oficina' && r.d.solicitacaoId === P.id) && !(await A.linha(k3)).usado_em, JSON.stringify({ v3: v3.d, e3: e3.d }));
    const d3 = await A.linkAcesso({ k: k3, acao: 'dispensar', motivo: 'nao_faz' });
    ok('N-G1d vencido: dispensar 410 e nada gravado', d3.status === 410 && !(await dispensaDe(P, W.W3)), JSON.stringify(d3));
    const ctx = await nav.contexto('webkit', 390, A.ip);
    const p = await ctx.newPage(); vigiar(p, erros, 'N-G1');
    await p.goto(`${SITE}/r/${P.numero}?o=en&k=${k3}`, { waitUntil: 'networkidle' });
    await p.getByTestId('ver-pedido-invalido').waitFor();
    ok('N-G1b vencido (WebKit): tela com "Entrar" (login em modo oficina) e "receber codigo"; sem rolagem lateral', await p.getByTestId('ver-pedido-entrar-login').isVisible() && await p.getByTestId('ver-pedido-codigo').isVisible() && await semRolagemLateral(p));
    await p.screenshot({ path: `${PRINTS}/ver-pedido-vencido-en-webkit-390.png`, fullPage: true });
    await p.getByTestId('ver-pedido-entrar-login').click();
    await p.waitForURL(/\/login/, { timeout: 20000 }).catch(() => {});
    ok('N-G1c "Entrar" leva ao login em modo oficina com volta ao pedido', p.url().includes('/ee/en/login') && decodeURIComponent(p.url()).includes(`/oficina/orcamento/${P.id}`) && await visivel(p.getByTestId('login-oficina-aviso')), p.url());
    await p.goto(`${SITE}/r/${P.numero}?o=en&k=${k3}`, { waitUntil: 'networkidle' });
    await p.getByTestId('ver-pedido-invalido').waitFor();
    await p.getByTestId('ver-pedido-codigo').click();
    await p.waitForURL(/\/login/, { timeout: 20000 }).catch(() => {});
    ok('N-G1e "receber codigo" leva ao login ja em codigo=1, com volta ao pedido e em modo oficina', p.url().includes('/ee/en/login') && /codigo=1/.test(p.url()) && decodeURIComponent(p.url()).includes(`/oficina/orcamento/${P.id}`) && await visivel(p.getByTestId('login-codigo-email')) && await visivel(p.getByTestId('login-oficina-aviso')), p.url());
    await ctx.close();
    // dois toques ao mesmo tempo
    const k4 = tok.W4?.k;
    const dois = await Promise.all([A.linkAcesso({ k: k4, acao: 'entrar' }), A.linkAcesso({ k: k4, acao: 'entrar' })]);
    const ganhou = dois.find((r) => r.status === 200);
    ok('N-G2 dois "entrar" ao mesmo tempo: um 200, um 410', dois.filter((r) => r.status === 200).length === 1 && dois.filter((r) => r.status === 410).length === 1, dois.map((r) => r.status).join('/'));
    ok('N-G2b o 200 traz tokenHash, finalidade oficina, solicitacaoId e destino /oficina/orcamento/<id>', !!ganhou && !!ganhou.d.tokenHash && ganhou.d.finalidade === 'oficina' && ganhou.d.solicitacaoId === P.id && String(ganhou.d.destino || '').includes(`/oficina/orcamento/${P.id}`), JSON.stringify(ganhou?.d));
    // oficina desativada depois do e-mail
    const k5 = tok.W5?.k;
    await A.admin.from('oficinas').update({ ativa: false }).eq('id', W.W5.id);
    const g5 = await A.linkAcesso({ k: k5, acao: 'entrar' });
    ok('N-G3 oficina inativa: entrar 403 SEM_ACESSO sem gastar; ver 403; dispensar 403 sem gravar', g5.status === 403 && g5.d.codigo === 'SEM_ACESSO' && !(await A.linha(k5)).usado_em && (await A.linkAcesso({ k: k5, acao: 'ver' })).status === 403 && (await A.linkAcesso({ k: k5, acao: 'dispensar', motivo: 'nao_faz' })).status === 403 && !(await dispensaDe(P, W.W5)), JSON.stringify(g5));
    const ctx5 = await nav.contexto('chromium', 390, A.ip);
    const p5 = await ctx5.newPage(); vigiar(p5, erros, 'N-G3');
    await p5.goto(`${SITE}/r/${P.numero}?o=pt&k=${k5}`, { waitUntil: 'networkidle' });
    ok('N-G3b oficina inativa na tela: "link invalido" generico (nao entra, nao dispensa)', await visivel(p5.getByTestId('ver-pedido-invalido')) && (await p5.getByTestId('ver-pedido-oficina').count()) === 0);
    await ctx5.close();
    // dono trocado depois do e-mail (oficinas.profile_id != links_acesso.user_id). oficinas.profile_id e UNIQUE:
    // o novo dono precisa ser uma conta SEM oficina (donoNovo), senao o update falha em silencio
    const k6 = tok.W6?.k;
    const { error: eG4 } = await A.admin.from('oficinas').update({ profile_id: donoNovo.id }).eq('id', W.W6.id);
    const g6 = await A.linkAcesso({ k: k6, acao: 'entrar' });
    ok('N-G4 dono da oficina mudou: entrar 403 sem gastar', !eG4 && g6.status === 403 && !(await A.linha(k6)).usado_em, JSON.stringify({ eG4: eG4?.message, g6 }));
    // dono desativado (profiles.ativo = false) depois do e-mail
    const k11 = tok.W11?.k;
    await A.admin.from('profiles').update({ ativo: false }).eq('id', dono.W11.id);
    const g11 = await A.linkAcesso({ k: k11, acao: 'entrar' });
    ok('N-G6 dono desativado depois do e-mail: ver 403, entrar 403 SEM_ACESSO sem gastar', g11.status === 403 && g11.d.codigo === 'SEM_ACESSO' && (await A.linkAcesso({ k: k11, acao: 'ver' })).status === 403 && !(await A.linha(k11)).usado_em, JSON.stringify(g11));
    // pedido fechado depois do e-mail (P2 -> W7)
    const prev = await A.api('GET', `/api/admin/solicitacoes/${P2.id}/avisar`, undefined, sA.token);
    const ids = (prev.d.seriam || []).map((o) => o.oficina_id).filter((id) => id === W7.id);
    const t0 = Date.now();
    await A.api('POST', `/api/admin/solicitacoes/${P2.id}/avisar`, { esperados: (prev.d.seriam || []).map((o) => o.oficina_id) }, sA.token);
    const m7 = await A.esperarEmail(dono7.email, t0, (e) => /\/r\/\d+\?o=/.test(e.html), 80);
    const k7 = linksDoEmail(m7, P2.numero).k;
    ok('N-G5a W7 recebeu o e-mail do pedido 2 com token', !!k7 && ids.length === 1, m7?.assunto);
    const { error: eSt } = await A.admin.from('solicitacoes').update({ status: 'cancelada' }).eq('id', P2.id);
    if (eSt) console.log('N-G5 status cancelada: ' + eSt.message);
    const v7 = await A.linkAcesso({ k: k7, acao: 'ver' });
    ok('N-G5b pedido fechado: "ver" diz aberto=false', v7.status === 200 && v7.d.aberto === false, JSON.stringify(v7.d));
    const e7 = await A.linkAcesso({ k: k7, acao: 'entrar' });
    ok('N-G5c pedido fechado: entrar 410 PEDIDO_FECHADO, token NAO gasto, sem sessao', e7.status === 410 && e7.d.codigo === 'PEDIDO_FECHADO' && !e7.d.tokenHash && !(await A.linha(k7)).usado_em, JSON.stringify(e7));
    const d7 = await A.linkAcesso({ k: k7, acao: 'dispensar', motivo: 'nao_faz' });
    ok('N-G5d pedido fechado: dispensar 410 e nada gravado', d7.status === 410 && !(await dispensaDe(P2, W7)), JSON.stringify(d7));
    const ctx7 = await nav.contexto('chromium', 390, A.ip);
    const p7 = await ctx7.newPage(); vigiar(p7, erros, 'N-G5');
    await p7.goto(`${SITE}/r/${P2.numero}?o=et&k=${k7}`, { waitUntil: 'networkidle' });
    ok('N-G5e tela "pedido encerrado" com botao Entrar; sem rolagem lateral', await visivel(p7.getByTestId('ver-pedido-fechado')) && await p7.getByTestId('ver-pedido-entrar-login').isVisible() && await semRolagemLateral(p7));
    await p7.screenshot({ path: `${PRINTS}/ver-pedido-fechado-et-390.png`, fullPage: true });
    await p7.getByTestId('ver-pedido-entrar-login').click();
    await p7.waitForURL(/\/login/, { timeout: 20000 }).catch(() => {});
    ok('N-G5f "Entrar" do pedido encerrado: login em modo oficina com voltar=/oficina/pedidos', p7.url().includes('/ee/et/login') && decodeURIComponent(p7.url()).includes('/oficina/pedidos') && await visivel(p7.getByTestId('login-oficina-aviso')), p7.url());
    await ctx7.close();
  });

  // ======================= N-I: "nao tenho interesse" pelo e-mail =======================
  await tentar('N-I', async () => {
    const k = tok.W2?.k; if (!k) throw new Error('sem token de W2');
    const disp = () => dispensaDe(P, W.W2);
    await fetch(`${SITE}${CAMINHO_VER.ru}?k=${k}&o=1&d=1`, { headers: { 'x-real-ip': A.ip() } });
    await A.linkAcesso({ k, acao: 'ver' });
    ok('N-I1 abrir o link &d=1 e "ver" nao gravam dispensa', !(await disp()));
    ok('N-I2 dispensar sem motivo / motivo invalido -> 400', (await A.linkAcesso({ k, acao: 'dispensar' })).status === 400 && (await A.linkAcesso({ k, acao: 'dispensar', motivo: 'xyz' })).status === 400);
    const d1 = await A.linkAcesso({ k, acao: 'dispensar', motivo: 'nao_faz', comentario: 'TESTE-ACESSO pelo e-mail' });
    let row = await disp();
    ok("N-I3 dispensar grava pedido_dispensas (nao_faz, comentario, autor = dono, origem 'email')", d1.status === 200 && d1.d.ok === true && d1.d.dispensa?.motivo === 'nao_faz' && !!row && row.motivo === 'nao_faz' && row.comentario === 'TESTE-ACESSO pelo e-mail' && row.autor_id === dono.W2.id && row.origem === 'email', JSON.stringify({ d1, row }));
    ok('N-I4 dispensar NAO gasta o token', !(await A.linha(k)).usado_em);
    const d2 = await A.linkAcesso({ k, acao: 'dispensar', motivo: 'longe' });
    row = await disp();
    ok('N-I5 de novo (idempotente): 200, uma linha so, motivo atualizado', d2.status === 200 && row?.motivo === 'longe' && (await A.admin.from('pedido_dispensas').select('motivo', { count: 'exact', head: true }).eq('solicitacao_id', P.id).eq('oficina_id', W.W2.id)).count === 1);
    const d2b = await A.linkAcesso({ k, acao: 'dispensar', motivo: 'longe', comentario: 'x'.repeat(600) });
    row = await disp();
    ok('N-I5b comentario de 600 caracteres: 400 ou gravado cortado em 500', d2b.status === 400 || (d2b.status === 200 && (row?.comentario || '').length <= 500), `${d2b.status} ${(row?.comentario || '').length}`);
    const v = await A.linkAcesso({ k, acao: 'ver' });
    ok('N-I6 "ver" mostra a dispensa', v.status === 200 && v.d.dispensa?.motivo === 'longe', JSON.stringify(v.d));
    const u = await A.linkAcesso({ k, acao: 'desfazer' });
    ok('N-I7 desfazer apaga a linha (200) sem gastar', u.status === 200 && !(await disp()) && !(await A.linha(k)).usado_em);
    ok('N-I7b desfazer de novo (sem linha): 200, idempotente', (await A.linkAcesso({ k, acao: 'desfazer' })).status === 200);
    // pela tela (WebKit 390): o link do e-mail abre ja na escolha do motivo
    const ctx = await nav.contexto('webkit', 390, A.ip);
    const p = await ctx.newPage(); vigiar(p, erros, 'N-I');
    await p.goto(`${SITE}${caminho(tok.W2.nao)}`, { waitUntil: 'networkidle' });
    await p.getByTestId('dispensar-form').waitFor();
    ok('N-I8 WebKit: formulario do motivo ja aberto; nada gravado ainda; sem rolagem lateral', !(await disp()) && await semRolagemLateral(p));
    await p.screenshot({ path: `${PRINTS}/ver-pedido-dispensar-ru-webkit-390.png`, fullPage: true });
    await p.getByTestId('motivo-sem_agenda').check();
    await p.getByTestId('confirmar-dispensa').click();
    await p.getByTestId('ver-pedido-dispensado').waitFor();
    row = await disp();
    ok('N-I9 confirmar -> "obrigado" + Desfazer + Abrir o pedido; linha sem_agenda origem email', row?.motivo === 'sem_agenda' && row?.origem === 'email' && await p.getByTestId('ver-pedido-desfazer').isVisible() && await p.getByTestId('ver-pedido-entrar').isVisible(), JSON.stringify(row));
    await p.screenshot({ path: `${PRINTS}/ver-pedido-dispensado-ru-webkit-390.png`, fullPage: true });
    const textoRu = await p.innerText('main').catch(() => p.innerText('body'));
    ok('N-I10 textos em russo (cirilico presente, sem portugues na tela)', /[а-яё]/i.test(textoRu) && !/orçamento|pedido|interesse/i.test(textoRu), textoRu.slice(0, 120));
    await ctx.close();
    // ja orcou -> 409 (W9); na tela: "voce ja enviou orcamento" + "Abrir o pedido", sem "nao tenho interesse"
    await A.orcamento(P, W.W9);
    const d9 = await A.linkAcesso({ k: tok.W9.k, acao: 'dispensar', motivo: 'nao_faz' });
    ok('N-I11 oficina que ja orcou: dispensar 409 JA_ORCOU; "ver" diz jaOrcou', d9.status === 409 && d9.d.codigo === 'JA_ORCOU' && (await A.linkAcesso({ k: tok.W9.k, acao: 'ver' })).d.jaOrcou === true, JSON.stringify(d9));
    const ctx9 = await nav.contexto('chromium', 390, A.ip);
    const p9 = await ctx9.newPage(); vigiar(p9, erros, 'N-I11');
    await p9.goto(`${SITE}${caminho(tok.W9.abrir)}`, { waitUntil: 'networkidle' });
    ok('N-I11b tela "ja orcou": aviso + "Abrir o pedido", sem "nao tenho interesse"; sem rolagem lateral', await visivel(p9.getByTestId('ver-pedido-ja-orcou')) && await p9.getByTestId('ver-pedido-entrar').isVisible() && (await p9.getByTestId('ver-pedido-dispensar').count()) === 0 && await semRolagemLateral(p9));
    await p9.screenshot({ path: `${PRINTS}/ver-pedido-ja-orcou-et-390.png`, fullPage: true });
    await ctx9.close();
    // convidada fora do raio: dispensa pelo convite (oficina_convidada)
    const kI = tok.Winv?.k;
    const dI = await A.linkAcesso({ k: kI, acao: 'dispensar', motivo: 'longe' });
    ok('N-I12 oficina convidada (fora do raio): dispensar pelo e-mail funciona', dI.status === 200 && !!(await dispensaDe(P, Winv)), JSON.stringify(dI));
    // ja dispensou e abre o link de novo (sem d=1): texto + Desfazer + Abrir; "Desfazer" pela tela apaga
    const ctxI = await nav.contexto('chromium', 390, A.ip);
    const pI = await ctxI.newPage(); vigiar(pI, erros, 'N-I12');
    await pI.goto(`${SITE}${caminho(tok.Winv.abrir)}`, { waitUntil: 'networkidle' });
    ok('N-I12b tela "ja dispensou" (RU): Desfazer + Abrir o pedido, sem o formulario; sem rolagem lateral', await visivel(pI.getByTestId('ver-pedido-desfazer')) && await pI.getByTestId('ver-pedido-entrar').isVisible() && (await pI.getByTestId('dispensar-form').count()) === 0 && await semRolagemLateral(pI));
    await pI.screenshot({ path: `${PRINTS}/ver-pedido-ja-dispensou-ru-390.png`, fullPage: true });
    await pI.getByTestId('ver-pedido-desfazer').click();
    let sumiu = false; for (let i = 0; i < 25 && !sumiu; i++) { sumiu = !(await dispensaDe(P, Winv)); if (!sumiu) await sleep(300); }
    ok('N-I12c "Desfazer" pela tela apaga a linha e volta a oferecer "nao tenho interesse"; token nao gasto', sumiu && await visivel(pI.getByTestId('ver-pedido-dispensar')) && !(await A.linha(kI)).usado_em);
    await ctxI.close();
    await A.linkAcesso({ k: kI, acao: 'dispensar', motivo: 'longe' }); // de volta, para o historico (N-K5)
  });

  // ======================= N-J: lembrete =======================
  const P3 = await A.pedido(cli, { tipo: 'mecanica', descricao: 'lembrete' });
  const P4 = await A.pedido(cli, { tipo: 'mecanica', descricao: 'lembrete dois' });
  const P6 = await A.pedido(cli, { tipo: 'mecanica', descricao: 'ninguem avisado' });
  const L = {}; const dL = {};
  const nova = async (n, opts, idioma = 'et', cOpts = {}) => { dL[n] = await A.conta('oficina', n.toLowerCase(), { idioma, ...cOpts }); L[n] = await A.oficina(dL[n], n, opts); };
  await tentar('N-J dados', async () => {
    await nova('L1', { km: 1 }); await A.aviso(L.L1, P3, 'nova_solicitacao', 20); await A.aviso(L.L1, P4, 'nova_solicitacao', 20);
    await nova('L2', { km: 1 }); await A.aviso(L.L2, P3); await A.orcamento(P3, L.L2);
    await nova('L3', { km: 1 }); await A.aviso(L.L3, P3); await A.admin.from('pedido_dispensas').insert({ solicitacao_id: P3.id, oficina_id: L.L3.id, motivo: 'longe' });
    await nova('L4', { km: 1 }); // nunca recebeu
    await nova('L5', { km: 1, ativa: false }); await A.aviso(L.L5, P3);
    await nova('L6', { km: 1 }, 'et', { contaTeste: true }); await A.aviso(L.L6, P3);
    await nova('L7', { km: 1 }); await A.aviso(L.L7, P3); await A.aviso(L.L7, P3, 'cobranca_admin_solicitacao', 10);
    await nova('L8', { km: 1 }); await A.aviso(L.L8, P3, 'nova_solicitacao', 2);
    await nova('L9', { km: 1 }); await A.aviso(L.L9, P3); { const { error: e9 } = await A.admin.from('profiles').update({ email: '' }).eq('id', dL.L9.id); if (e9) throw new Error('L9 sem e-mail: ' + e9.message); }
    await nova('L10', { km: 60 }); await A.aviso(L.L10, P3); // fora do raio, nao convidada
    await nova('L11', { km: 60, esp: ['eletrica'] }, 'ru'); await A.admin.from('pedido_convites').insert({ solicitacao_id: P3.id, oficina_id: L.L11.id, convidado_por: adm.id, origem: 'admin' }); await A.aviso(L.L11, P3, 'pedido_convite', 20);
    await nova('L12', { km: 1 }, 'et', { ativo: false }); await A.aviso(L.L12, P3);
    await nova('L13', { km: 1 }, 'en'); await A.aviso(L.L13, P3);
    await nova('L14', { km: 1 }, 'it'); await A.aviso(L.L14, P3);
    await nova('L15', { km: 1 }, 'pt'); await A.aviso(L.L15, P3);
    await nova('L16', { km: 1 }, 'pt-PT'); await A.aviso(L.L16, P3);
    // bordas das janelas: 12 h depois do aviso (L17), 48 h depois do ultimo lembrete do par (L18),
    // 24 h por oficina contando lembrete de OUTRO pedido (L19 fora, L20 dentro)
    await nova('L17', { km: 1 }); await A.aviso(L.L17, P3, 'nova_solicitacao', 13);
    await nova('L18', { km: 1 }); await A.aviso(L.L18, P3, 'nova_solicitacao', 60); await A.aviso(L.L18, P3, 'cobranca_admin_solicitacao', 50);
    await nova('L19', { km: 1 }); await A.aviso(L.L19, P3, 'nova_solicitacao', 20); await A.aviso(L.L19, P4, 'nova_solicitacao', 20); await A.aviso(L.L19, P4, 'cobranca_admin_solicitacao', 10);
    await nova('L20', { km: 1 }); await A.aviso(L.L20, P3, 'nova_solicitacao', 20); await A.aviso(L.L20, P4, 'nova_solicitacao', 40); await A.aviso(L.L20, P4, 'cobranca_admin_solicitacao', 30);
  });
  await tentar('N-J', async () => {
    const g = await A.api('GET', `/api/admin/solicitacoes/${P3.id}/lembrar`, undefined, sA.token);
    const recebem = (g.d.recebem || []).map((o) => o.oficina_id);
    const fora = Object.fromEntries((g.d.ficamFora || []).map((o) => [o.oficina_id, o.motivo]));
    ok('N-J1 previa do lembrete -> 200 com numero do pedido', g.status === 200 && String(g.d.numero) === String(P3.numero), JSON.stringify(g.d).slice(0, 300));
    const esperados = ['L1', 'L11', 'L13', 'L14', 'L15', 'L16', 'L17', 'L18', 'L20'];
    ok('N-J2 recebem: L1 (avisada ha 20 h), L11 (convidada), L13-L16 (idiomas), L17, L18, L20 - e so elas', esperados.every((n) => recebem.includes(L[n].id)) && recebem.length === esperados.length, JSON.stringify(recebem.map((id) => Object.keys(L).find((n) => L[n].id === id) || id)));
    ok('N-J2b recebem traz e-mail, idioma e ultimo aviso de cada oficina', recebem.length > 0 && (g.d.recebem || []).every((o) => o.email && o.idioma && !isNaN(Date.parse(o.ultimoAviso || ''))), JSON.stringify(g.d.recebem?.[0]));
    ok('N-J3 fora: L2 orcou', fora[L.L2.id] === 'orcou', fora[L.L2.id]);
    ok('N-J4 fora: L3 dispensou', fora[L.L3.id] === 'dispensou', fora[L.L3.id]);
    ok('N-J5 fora: L4 nunca recebeu (nem aparece)', !recebem.includes(L.L4.id) && !(L.L4.id in fora));
    ok('N-J6 fora: L5 inativa', fora[L.L5.id] === 'inativa', fora[L.L5.id]);
    ok('N-J7 fora: L6 conta de teste (cliente real)', fora[L.L6.id] === 'conta_teste', fora[L.L6.id]);
    ok('N-J8 fora: L7 lembrada ha 10 h (< 48 h)', fora[L.L7.id] === 'lembrada_recente', fora[L.L7.id]);
    ok('N-J9 fora: L8 avisada ha 2 h (< 12 h)', fora[L.L8.id] === 'aviso_recente', fora[L.L8.id]);
    ok('N-J10 fora: L9 sem e-mail', fora[L.L9.id] === 'sem_email', fora[L.L9.id]);
    ok('N-J11 fora: L10 ja nao atende (fora do raio, nao convidada)', fora[L.L10.id] === 'nao_atende', fora[L.L10.id]);
    ok('N-J12 fora: L12 dono desativado', fora[L.L12.id] === 'dono_inativo', fora[L.L12.id]);
    ok('N-J12b fora: L19 lembrada ha 10 h por OUTRO pedido (1 lembrete por oficina a cada 24 h)', fora[L.L19.id] === 'lembrada_recente' && !recebem.includes(L.L19.id), fora[L.L19.id]);
    const fechado = await A.api('GET', `/api/admin/solicitacoes/${P2.id}/lembrar`, undefined, sA.token);
    ok('N-J13 pedido fechado: previa recusa (409 ou bloqueado)', fechado.status === 409 || !!fechado.d.bloqueado, `${fechado.status} ${JSON.stringify(fechado.d).slice(0, 120)}`);
    const fechadoPost = await A.api('POST', `/api/admin/solicitacoes/${P2.id}/lembrar`, { oficinaIds: [W7.id] }, sA.token);
    ok('N-J13b pedido fechado: POST 409 e nenhum sino', fechadoPost.status === 409 && (await A.admin.from('notificacoes').select('id', { count: 'exact', head: true }).eq('dados->>solicitacao_id', P2.id).eq('tipo', 'cobranca_admin_solicitacao')).count === 0, `${fechadoPost.status}`);
    ok('N-J13c id invalido -> 400/404', [400, 404].includes((await A.api('GET', '/api/admin/solicitacoes/abc/lembrar', undefined, sA.token)).status));
    ok('N-J14 POST com oficina fora da lista -> 409, nada enviado', (await A.api('POST', `/api/admin/solicitacoes/${P3.id}/lembrar`, { oficinaIds: [L.L2.id] }, sA.token)).status === 409 && (await A.admin.from('notificacoes').select('id', { count: 'exact', head: true }).eq('dados->>solicitacao_id', P3.id).eq('tipo', 'cobranca_admin_solicitacao').eq('profile_id', dL.L2.id)).count === 0);

    // global ("Lembretes de hoje"): um e-mail por oficina com todos os pedidos pendentes
    const gg = await A.api('GET', '/api/admin/lembretes', undefined, sA.token);
    const ofs = gg.d.oficinas || [];
    const l1 = ofs.find((o) => o.oficina_id === L.L1.id);
    ok('N-J15 previa global agrupa por oficina: L1 com P3 e P4', gg.status === 200 && !!l1 && [P3.id, P4.id].every((id) => (l1.pedidos || []).some((p) => p.solicitacao_id === id)), JSON.stringify(l1));
    // (os tres exigem a previa (200, com oficinas): sem isso passariam de graca com a lista vazia)
    const previaGlobalOk = gg.status === 200 && ofs.length > 0;
    ok('N-J16 previa global: L4 (nunca recebeu) nao aparece', previaGlobalOk && !ofs.some((o) => o.oficina_id === L.L4.id));
    ok('N-J16b previa global: nenhum par de pedido fechado (P2) nem de pedido sem oficina avisada (P6)', previaGlobalOk && !ofs.some((o) => (o.pedidos || []).some((p) => p.solicitacao_id === P2.id || p.solicitacao_id === P6.id)), JSON.stringify(ofs.map((o) => o.pedidos?.map((p) => p.numero))));
    ok('N-J16c previa global: L19 (lembrada ha 10 h) sem P3 marcado', previaGlobalOk && !ofs.some((o) => o.oficina_id === L.L19.id && (o.pedidos || []).some((p) => p.solicitacao_id === P3.id)));
    const t0 = Date.now();
    const pg = await A.api('POST', '/api/admin/lembretes', { oficinaIds: [L.L1.id] }, sA.token);
    const e1 = (pg.d.enviados || []).find((o) => o.oficina_id === L.L1.id);
    ok('N-J17 envio global -> 200, L1 com os 2 pedidos e e-mail enviado', pg.status === 200 && !!e1 && e1.email === 'enviado' && [P3.numero, P4.numero].every((n) => (e1.pedidos || []).map(String).includes(String(n))), JSON.stringify(pg.d).slice(0, 300));
    const mL1 = await A.esperarEmail(dL.L1.email, t0, (e) => /\/r\/\d+\?o=/.test(e.html), 60);
    const lk3 = linksDoEmail(mL1, P3.numero), lk4 = linksDoEmail(mL1, P4.numero);
    ok('N-J18 UM e-mail para L1 com os dois pedidos, cada um com "abrir" (k) e "nao tenho interesse" (k&d=1), tokens diferentes', !!mL1 && A.emailsDe(dL.L1.email, t0).length === 1 && !!lk3.abrir && !!lk3.nao && !!lk4.abrir && !!lk4.nao && lk3.k !== lk4.k && lk3.kNao === lk3.k && mL1.texto.includes(String(P3.numero)) && mL1.texto.includes(String(P4.numero)), mL1 && A.linksDe(mL1.html).join(' '));
    const r3 = lk3.k && await A.linha(lk3.k);
    ok('N-J19 tokens do lembrete: finalidade oficina, 72 h, presos a oficina e pedido', !!r3 && r3.finalidade === 'oficina' && r3.oficina_id === L.L1.id && r3.solicitacao_id === P3.id && r3.user_id === dL.L1.id && Math.abs((new Date(r3.expira_em) - Date.now()) / 3600e3 - 72) < 1, JSON.stringify(r3));
    const sinos = (await A.admin.from('notificacoes').select('dados, tipo').eq('profile_id', dL.L1.id).eq('tipo', 'cobranca_admin_solicitacao')).data || [];
    ok("N-J20 sino cobranca_admin_solicitacao por pedido (2), com lembrete=true e email='enviado'", sinos.length === 2 && sinos.every((s) => s.dados?.lembrete === true && s.dados?.email === 'enviado') && new Set(sinos.map((s) => s.dados.solicitacao_id)).size === 2, JSON.stringify(sinos));
    ok('N-J21 e-mail do lembrete (ET): sem promessa de tempo, sem "tasuta"; assunto com "2"', !!mL1 && !/\b\d+\s*(min|tund|minut)/i.test(mL1.texto) && !/tasuta/i.test(mL1.texto) && /\b2\b/.test(mL1.assunto), mL1?.assunto);
    // responder-para (3.6): o e-mail local registra "| responder: <ADMIN_NOTIFICATION_EMAIL>" no cabecalho
    ok('N-J21b lembrete com responder-para = ADMIN_NOTIFICATION_EMAIL (cabecalho do e-mail local)', !env.ADMIN_NOTIFICATION_EMAIL || (!!mL1 && mL1.responder.toLowerCase() === env.ADMIN_NOTIFICATION_EMAIL.toLowerCase()), mL1?.cab);
    const g2 = await A.api('GET', `/api/admin/solicitacoes/${P3.id}/lembrar`, undefined, sA.token);
    const fora2 = Object.fromEntries((g2.d.ficamFora || []).map((o) => [o.oficina_id, o.motivo]));
    ok('N-J22 depois do envio, L1 fica de fora (lembrada_recente) na previa do pedido', fora2[L.L1.id] === 'lembrada_recente' && !(g2.d.recebem || []).some((o) => o.oficina_id === L.L1.id), fora2[L.L1.id]);

    // por pedido: 5 oficinas em 5 idiomas + as 3 das bordas, um e-mail cada
    const t1 = Date.now();
    const porIdioma = ['L11', 'L13', 'L14', 'L15', 'L16'];
    const ids = [...porIdioma, 'L17', 'L18', 'L20'].map((n) => L[n].id);
    const pp = await A.api('POST', `/api/admin/solicitacoes/${P3.id}/lembrar`, { oficinaIds: ids }, sA.token);
    ok('N-J23 envio por pedido -> 200, 8 enviadas com e-mail', pp.status === 200 && (pp.d.enviados || []).length === 8 && pp.d.enviados.every((e) => e.email === 'enviado'), JSON.stringify(pp.d).slice(0, 300));
    const assuntos = [];
    for (const n of porIdioma) {
      const m = await A.esperarEmail(dL[n].email, t1, (e) => /\/r\/\d+\?o=/.test(e.html), 60);
      const lk = linksDoEmail(m, P3.numero);
      assuntos.push(m?.assunto || '');
      ok(`N-J24 ${n} (${dL[n].idioma}): e-mail com numero (no assunto e no texto), abrir (o=${dL[n].idioma}) e nao tenho interesse`, !!m && m.assunto.includes(String(P3.numero)) && m.texto.includes(String(P3.numero)) && !!lk.abrir && lk.abrir.includes(`?o=${encodeURIComponent(dL[n].idioma)}&k=`) && !!lk.nao && lk.kNao === lk.k, m?.assunto);
    }
    ok('N-J25 assuntos em idiomas diferentes (>= 4 distintos entre ru/en/it/pt/pt-PT)', new Set(assuntos.filter(Boolean)).size >= 4, assuntos.join(' | '));
    const aud = (await A.admin.from('admin_auditoria').select('acao, depois, admin_id').eq('solicitacao_id', P3.id).eq('acao', 'lembrar_oficinas')).data || [];
    ok('N-J26 admin_auditoria lembrar_oficinas (admin, oficinas)', aud.length >= 1 && aud.every((a) => a.admin_id === adm.id) && JSON.stringify(aud).includes(L.L13.id), JSON.stringify(aud).slice(0, 300));
    const aud4 = (await A.admin.from('admin_auditoria').select('acao').eq('solicitacao_id', P4.id).eq('acao', 'lembrar_oficinas')).data || [];
    ok('N-J26b envio global tambem audita por pedido (P4)', aud4.length >= 1);
    const g3 = await A.api('GET', `/api/admin/solicitacoes/${P3.id}/lembrar`, undefined, sA.token);
    ok('N-J27 segunda previa: ninguem recebe (todos lembrada_recente)', g3.status === 200 && (g3.d.recebem || []).length === 0, JSON.stringify(g3.d.recebem));
    const pp2 = await A.api('POST', `/api/admin/solicitacoes/${P3.id}/lembrar`, { oficinaIds: [L.L13.id] }, sA.token);
    ok('N-J28 reenviar a quem acabou de receber -> 409/ignorada, sem e-mail novo', (pp2.status === 409 || (pp2.d.enviados || []).length === 0) && A.emailsDe(dL.L13.email, t1).length === 1);
    // "nao tenho interesse" pelo lembrete tira a oficina da proxima rodada
    const mL13 = A.emailsDe(dL.L13.email, t1)[0];
    const lk13 = linksDoEmail(mL13, P3.numero);
    const dd = await A.linkAcesso({ k: lk13.k, acao: 'dispensar', motivo: 'nao_faz' });
    await A.admin.from('notificacoes').update({ created_at: horasAtras(60) }).eq('profile_id', dL.L13.id).eq('tipo', 'cobranca_admin_solicitacao');
    const g4 = await A.api('GET', `/api/admin/solicitacoes/${P3.id}/lembrar`, undefined, sA.token);
    const fora4 = Object.fromEntries((g4.d.ficamFora || []).map((o) => [o.oficina_id, o.motivo]));
    ok('N-J29 dispensou pelo lembrete: fica de fora como "dispensou" mesmo passadas 48 h', dd.status === 200 && fora4[L.L13.id] === 'dispensou', JSON.stringify({ dd: dd.status, m: fora4[L.L13.id] }));
    // a rota antiga "cobrar" (caixa de 40 km, sem dispensas) sai do ar
    ok('N-J30 POST /cobrar (admin) -> 404: rota apagada', (await A.api('POST', `/api/admin/solicitacoes/${P3.id}/cobrar`, {}, sA.token)).status === 404);
  });

  // ======================= N-K: historico de contato por oficina no admin + fluxo da tela =======================
  // P5: pedido so para o fluxo do admin pela tela (previa com caixas -> desmarcar -> enviar -> resultado)
  const P5 = await A.pedido(cli, { tipo: 'mecanica', descricao: 'admin tela' });
  const M = {}; const dM = {};
  for (const [n, idioma] of [['M1', 'et'], ['M2', 'et'], ['M3', 'ru']]) { dM[n] = await A.conta('oficina', n.toLowerCase(), { idioma }); M[n] = await A.oficina(dM[n], n, { km: 1 + Number(n[1]) * 0.2 }); await A.aviso(M[n], P5, 'nova_solicitacao', 20); }
  await A.orcamento(P5, M.M2);
  await tentar('N-K', async () => {
    const r = await A.api('GET', `/api/admin/solicitacoes/${P.id}`, undefined, sA.token);
    const por = Object.fromEntries((r.d.contatos || []).map((c) => [c.oficina_id, c]));
    const tipos = (id) => (por[id]?.eventos || []).map((e) => e.tipo);
    ok('N-K1 GET admin/solicitacoes/<id> devolve contatos por oficina (com nome)', r.status === 200 && Array.isArray(r.d.contatos) && r.d.contatos.length >= 3 && r.d.contatos.every((c) => c.oficina_id && c.nome && Array.isArray(c.eventos)), JSON.stringify(r.d.contatos || r.d).slice(0, 300));
    const evW1 = por[W.W1.id]?.eventos || [];
    ok('N-K2 W1: avisada, link_enviado, link_visto, link_entrou (com datas, em ordem)', ['avisada', 'link_enviado', 'link_visto', 'link_entrou'].every((t) => tipos(W.W1.id).includes(t)) && evW1.every((e) => !isNaN(Date.parse(e.em))) && evW1.every((e, i) => i === 0 || Date.parse(evW1[i - 1].em) <= Date.parse(e.em)), JSON.stringify(por[W.W1.id]));
    ok('N-K3 W2: avisada, link_visto, dispensou pelo e-mail (detalhe com motivo)', tipos(W.W2.id).includes('avisada') && tipos(W.W2.id).includes('link_visto') && tipos(W.W2.id).includes('dispensou') && /sem_agenda|email/i.test(JSON.stringify(por[W.W2.id]?.eventos.filter((e) => e.tipo === 'dispensou'))), JSON.stringify(por[W.W2.id]));
    ok('N-K4 W9: orcou', tipos(W.W9.id).includes('orcou'), JSON.stringify(por[W.W9.id]));
    ok('N-K5 Winv: convidada + dispensou', tipos(Winv.id).includes('convidada') && tipos(Winv.id).includes('dispensou'), JSON.stringify(por[Winv.id]));
    ok('N-K6 avisada traz se o e-mail saiu', /enviado/.test(JSON.stringify((por[W.W1.id]?.eventos || []).find((e) => e.tipo === 'avisada') || {})));
    const r3 = await A.api('GET', `/api/admin/solicitacoes/${P3.id}`, undefined, sA.token);
    const por3 = Object.fromEntries((r3.d.contatos || []).map((c) => [c.oficina_id, c]));
    ok('N-K7 P3: L1 lembrada (e-mail enviado), L11 convidada + lembrada, L2 orcou, L3 dispensou (painel)', (por3[L.L1.id]?.eventos || []).some((e) => e.tipo === 'lembrada' && /enviado/.test(JSON.stringify(e))) && (por3[L.L11.id]?.eventos || []).some((e) => e.tipo === 'convidada') && (por3[L.L11.id]?.eventos || []).some((e) => e.tipo === 'lembrada') && (por3[L.L2.id]?.eventos || []).some((e) => e.tipo === 'orcou') && (por3[L.L3.id]?.eventos || []).some((e) => e.tipo === 'dispensou'), JSON.stringify(por3).slice(0, 400));
    // tela do admin (1366): quadro do pedido principal
    const ctx = await nav.contexto('chromium', 1366, A.ip);
    const p = await ctx.newPage(); vigiar(p, erros, 'N-K');
    await entrarPelaTela(p, '/br/pt', adm, `/admin/solicitacoes/${P.id}`);
    await p.waitForURL(/\/admin\/solicitacoes\//, { timeout: 30000 }).catch(() => {});
    await p.getByTestId('admin-contatos-oficinas').waitFor();
    const quadro = p.getByTestId('admin-contatos-oficinas');
    ok('N-K8 quadro "contato com as oficinas" com o numero do pedido', (await quadro.innerText()).includes(String(P.numero)));
    const linhaW1 = quadro.locator(`[data-testid="contato-oficina"][data-oficina="${W.W1.id}"]`);
    ok('N-K9 linha de W1 com eventos avisada / link_entrou', (await linhaW1.locator('[data-evento="avisada"]').count()) >= 1 && (await linhaW1.locator('[data-evento="link_entrou"]').count()) >= 1);
    const linhaW2 = quadro.locator(`[data-testid="contato-oficina"][data-oficina="${W.W2.id}"]`);
    ok('N-K10 linha de W2 com "dispensou" e o motivo', (await linhaW2.locator('[data-evento="dispensou"]').count()) >= 1 && /sem_agenda|Vabu|agenda/i.test(await linhaW2.innerText()));
    await p.screenshot({ path: `${PRINTS}/admin-contatos-1366.png`, fullPage: true });
    await p.getByTestId('lembrar-oficinas').click();
    await p.getByTestId('lembrar-previa').waitFor();
    const previa = await p.getByTestId('lembrar-previa').innerText();
    ok('N-K11 botao "Lembrar oficinas" abre a previa com quem fica de fora (W2 dispensou, W9 orcou)', previa.includes(W.W2.nome) && previa.includes(W.W9.nome), previa.slice(0, 300));
    ok('N-K12 texto antigo "40 km"/"nunca receberam" sumiu', !/40 km|nunca receberam/.test(await p.innerText('body')));
    await p.screenshot({ path: `${PRINTS}/admin-lembrar-previa-1366.png`, fullPage: true });
    // fluxo completo pela tela (P5): previa com caixas marcadas -> desmarcar M3 -> enviar -> so M1 recebe
    await p.goto(`${SITE}/admin/solicitacoes/${P5.id}`, { waitUntil: 'networkidle' });
    await p.getByTestId('lembrar-oficinas').click();
    const previa5 = p.getByTestId('lembrar-previa');
    await previa5.waitFor();
    const linhas = previa5.locator('[data-testid="lembrar-oficina"]');
    const caixas = previa5.locator('[data-testid="lembrar-oficina"] input[type="checkbox"]');
    ok('N-K13 previa de P5: 2 oficinas com caixa marcada (M1, M3); M2 de fora como "orcou"', (await linhas.count()) === 2 && (await caixas.count()) === 2 && (await caixas.evaluateAll((els) => els.every((e) => e.checked))) && (await previa5.innerText()).includes(M.M2.nome) && (await previa5.locator(`[data-testid="lembrar-oficina"][data-oficina="${M.M2.id}"]`).count()) === 0, (await previa5.innerText()).slice(0, 300));
    await previa5.locator(`[data-testid="lembrar-oficina"][data-oficina="${M.M3.id}"] input[type="checkbox"]`).uncheck();
    const t5 = Date.now();
    await p.getByTestId('lembrar-confirmar').click();
    await p.getByTestId('lembrar-resultado').waitFor({ timeout: 30000 });
    const mM1 = await A.esperarEmail(dM.M1.email, t5, (e) => /\/r\/\d+\?o=/.test(e.html), 60);
    const lkM1 = linksDoEmail(mM1, P5.numero);
    ok('N-K14 enviar: resultado na tela; e-mail de lembrete a M1 (ET) com abrir + nao tenho interesse', (await p.getByTestId('lembrar-resultado').innerText()).includes(M.M1.nome) && !!mM1 && !!lkM1.abrir && !!lkM1.nao, mM1?.assunto);
    ok('N-K15 M3 desmarcada: sem e-mail e sem sino', A.emailsDe(dM.M3.email, t5).length === 0 && (await A.admin.from('notificacoes').select('id', { count: 'exact', head: true }).eq('profile_id', dM.M3.id).eq('tipo', 'cobranca_admin_solicitacao')).count === 0);
    const r5 = await A.api('GET', `/api/admin/solicitacoes/${P5.id}`, undefined, sA.token);
    const por5 = Object.fromEntries((r5.d.contatos || []).map((c) => [c.oficina_id, c]));
    ok('N-K16 historico de P5: M1 lembrada (e-mail enviado), M3 so avisada', (por5[M.M1.id]?.eventos || []).some((e) => e.tipo === 'lembrada' && /enviado/.test(JSON.stringify(e))) && !(por5[M.M3.id]?.eventos || []).some((e) => e.tipo === 'lembrada'), JSON.stringify(por5).slice(0, 300));
    await p.screenshot({ path: `${PRINTS}/admin-lembrar-resultado-1366.png`, fullPage: true });
    // global pela tela (/admin/solicitacoes -> "Lembretes de hoje"): so a previa, sem enviar
    await p.goto(`${SITE}/admin/solicitacoes`, { waitUntil: 'networkidle' });
    await p.getByTestId('lembretes-hoje').click();
    const previaG = p.getByTestId('lembretes-previa');
    await previaG.waitFor({ timeout: 30000 });
    const linhaM3 = previaG.locator(`[data-testid="lembretes-oficina"][data-oficina="${M.M3.id}"]`);
    ok('N-K17 "Lembretes de hoje": previa por oficina com M3 (caixa marcada) e o numero de P5; M1 (lembrada agora) sem caixa', (await linhaM3.count()) === 1 && (await linhaM3.locator('input[type="checkbox"]').isChecked()) && (await linhaM3.innerText()).includes(String(P5.numero)) && (await previaG.locator(`[data-testid="lembretes-oficina"][data-oficina="${M.M1.id}"]`).count()) === 0, (await previaG.innerText()).slice(0, 300));
    await p.screenshot({ path: `${PRINTS}/admin-lembretes-hoje-1366.png`, fullPage: true });
    await ctx.close();
  });

  // ======================= N-T: traducoes =======================
  await tentar('N-T', async () => {
    const chaves = ['login.oficinaTitulo', 'login.oficinaTituloSemNumero', 'login.oficinaTexto', 'login.oficinaCodigo',
      'verPedido.oficinaTitulo', 'verPedido.oficinaTexto', 'verPedido.oficinaAbrir', 'verPedido.oficinaNaoInteresse', 'verPedido.oficinaJaOrcou', 'verPedido.oficinaJaDispensou', 'verPedido.oficinaDispensado', 'verPedido.oficinaDesfazer', 'verPedido.oficinaFechadoTitulo', 'verPedido.oficinaFechadoTexto', 'verPedido.oficinaInvalidoTexto', 'verPedido.entrar'];
    const pega = (m, k) => k.split('.').reduce((o, p) => o?.[p], m);
    const faltam = [];
    const todas = Object.fromEntries(IDIOMAS.map((l) => [l, mensagens(l)]));
    for (const l of IDIOMAS) for (const k of chaves) if (typeof pega(todas[l], k) !== 'string' || !pega(todas[l], k).trim()) faltam.push(`${l}:${k}`);
    ok('N-T1 as 16 chaves novas (contrato item 13) nos 6 idiomas, nao vazias', faltam.length === 0, faltam.join(', '));
    let saida = '', okChk = true;
    try { saida = execSync(`node "${path.join(WEB, 'scripts/checar-traducoes.mjs')}"`, { cwd: WEB }).toString(); } catch (e) { okChk = false; saida = String(e.stdout || e.message); }
    ok('N-T2 checar-traducoes.mjs passa', okChk, saida.slice(-300));
    const et = todas.et, ru = todas.ru;
    const txt = JSON.stringify([et.login, et.verPedido, ru.login, ru.verPedido].map((x) => x && Object.fromEntries(Object.entries(x).filter(([k]) => k.startsWith('oficina')))));
    ok('N-T3 ET/RU sem "tasuta"/"бесплатно" e sem promessa de tempo', !/tasuta|бесплатно|\b\d+\s*(min|tund|минут|час)/i.test(txt), txt.slice(0, 200));
    const iguais = chaves.filter((k) => pega(todas.et, k) === pega(todas.pt, k) || pega(todas.ru, k) === pega(todas.pt, k));
    ok('N-T4 ET e RU traduzidos de verdade (nenhuma chave nova igual ao PT)', iguais.length === 0, iguais.join(', '));
  });

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
