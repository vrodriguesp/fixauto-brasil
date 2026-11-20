// Suporte: arquivar / excluir conversa vazia (dono 20/11, recomendacao Fable, migracao 112).
//  A excluir vazia: "Nova conversa" por engano -> botao Excluir -> some; iniciar de novo cria outra (nova=true);
//    com mensagem (usuario OU so do admin): sem botao, DELETE 409 e nada apagado; DELETE duplo -> 404
//  B arquivar: sai de Ativas, aparece em Arquivadas (n), nao lidas zeradas, menu do admin nao conta;
//    ?arquivadas=1 sobrevive ao F5; Desarquivar volta
//  C volta sozinha: oficina logada escreve / visitante escreve / admin responde / admin inicia de novo
//    (desarquivada=true); o historico inteiro continua para o admin
//  D seguranca: sem login 401, oficina/cliente 403 em PATCH/DELETE/GET ?arquivadas; anon/authenticated
//    nao leem nem mudam suporte_conversas nem chamam suporte_excluir_vazia; cada um so ve a propria conversa
//  E celular 390: lista com abas e botoes sem rolagem lateral
// So no banco local; SITE local.
//   SITE=http://localhost:3108 node suporte-arquivar.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const { createClient } = req('@supabase/supabase-js');
const { chromium } = req('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(SITE)) throw new Error('SITE nao e local');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PRINTS = process.env.PRINTS || 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/suporte-arquivar';
fs.mkdirSync(PRINTS, { recursive: true });
let falhas = 0; let total = 0;
const ok = (n, c, x = '') => { total++; if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 240) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const conversas = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const conta = async (tipo, nome, idioma) => {
  const email = `sarq-${tipo}${contas.length}-${tag}@example.test`; const senha = `Sa${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone: '+372 5000 0000', termos_aceitos_em: new Date().toISOString(), termos_versao: '2026-09-30' });
  const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await a.auth.signInWithPassword({ email, password: senha });
  const { data: { session } } = await a.auth.getSession();
  return { id: data.user.id, email, senha, token: session?.access_token, cliente: a };
};
const api = (caminho, { token, metodo = 'GET', corpo, headers = {} } = {}) => fetch(`${SITE}${caminho}`, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: corpo ? JSON.stringify(corpo) : undefined });
const lista = async (adm, arq = false) => (await (await api(`/api/admin/suporte${arq ? '?arquivadas=1' : ''}`, { token: adm.token })).json());
const naLista = async (adm, id, arq = false) => (await lista(adm, arq)).conversas.find((c) => c.id === id) || null;
const menu = async (adm) => (await (await api('/api/admin/suporte', { token: adm.token, metodo: 'POST' })).json()).naoLidas;
const linha = async (id) => (await sb.from('suporte_conversas').select('*').eq('id', id).maybeSingle()).data;
const nMsgs = async (id) => (await sb.from('suporte_mensagens').select('id', { count: 'exact', head: true }).eq('conversa_id', id)).count;

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const TELAS = { celular: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, pc: { viewport: { width: 1366, height: 900 } } };
const ctxNovo = async (tela) => { const c = await browser.newContext(TELAS[tela]); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); return c; };
const entrar = async (ctx, u) => { const p = await ctx.newPage(); await p.goto(`${SITE}/br/pt/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]'); await p.waitForURL((x) => !x.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(2000); return p; };
const iniciar = async (adm, profileId) => (await api('/api/admin/suporte/iniciar', { token: adm.token, metodo: 'POST', corpo: { profileId } })).json();

try {
  const adm = await conta('admin', 'Admin Arquivo', 'pt');
  const ofi = await conta('oficina', `Jost Teste ${tag}`, 'et');
  const cli = await conta('cliente', `Olga Arquivo ${tag}`, 'ru');
  const ofi2 = await conta('oficina', `Mart Arquivo ${tag}`, 'et');

  // ---------- A excluir conversa vazia
  const ctxA = await ctxNovo('pc'); const pA = await entrar(ctxA, adm);
  pA.on('dialog', (d) => d.accept());
  await pA.goto(`${SITE}/admin/suporte?profile=${ofi.id}`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(2500);
  const { data: cVazia } = await sb.from('suporte_conversas').select('id').eq('profile_id', ofi.id).maybeSingle();
  ok('A.1 "Nova conversa" por engano cria a conversa vazia', !!cVazia);
  if (cVazia) conversas.push(cVazia.id);
  ok('A.2 conversa vazia: botao Excluir visivel', await pA.getByTestId('suporte-excluir').isVisible().catch(() => false));
  ok('A.2 conversa vazia: botao Arquivar visivel', await pA.getByTestId('suporte-arquivar').isVisible().catch(() => false));
  await pA.screenshot({ path: `${PRINTS}/a-vazia-pc.png` });
  await pA.getByTestId('suporte-excluir').click(); await pA.waitForTimeout(2000);
  ok('A.3 Excluir: conversa apagada do banco', !(await linha(cVazia?.id)));
  ok('A.3 Excluir: aviso "Conversa vazia excluida." na lista', (await pA.getByTestId('suporte-aviso-lista').innerText().catch(() => '')).includes('excluída'));
  ok('A.3 Excluir: some da lista', !(await pA.getByTestId('suporte-conversa').filter({ hasText: `Jost Teste ${tag}` }).count()));
  const ini2 = await iniciar(adm, ofi.id);
  ok('A.4 iniciar de novo com a mesma conta cria outra (nova=true)', ini2.nova === true && ini2.conversaId && ini2.conversaId !== cVazia?.id, JSON.stringify(ini2));
  conversas.push(ini2.conversaId);
  ok('A.4 a nova conversa vazia vem com vazia=true na lista', (await naLista(adm, ini2.conversaId))?.vazia === true);
  // so mensagem do admin: ja nao e vazia
  await api(`/api/admin/suporte/${ini2.conversaId}`, { token: adm.token, metodo: 'POST', corpo: { texto: 'Tere! Test message', traduzir: false } });
  const rDel1 = await api(`/api/admin/suporte/${ini2.conversaId}`, { token: adm.token, metodo: 'DELETE' });
  ok('A.5 so com mensagem do admin: DELETE 409 TEM_MENSAGENS', rDel1.status === 409 && (await rDel1.json()).codigo === 'TEM_MENSAGENS');
  ok('A.5 conversa e mensagem continuam no banco', !!(await linha(ini2.conversaId)) && (await nMsgs(ini2.conversaId)) === 1);
  ok('A.5 lista: vazia=false', (await naLista(adm, ini2.conversaId))?.vazia === false);
  await pA.goto(`${SITE}/admin/suporte`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(1500);
  await pA.getByTestId('suporte-conversa').filter({ hasText: `Jost Teste ${tag}` }).click(); await pA.waitForTimeout(2000);
  ok('A.6 com mensagem: sem botao Excluir na tela, Arquivar sim', !(await pA.getByTestId('suporte-excluir').count()) && await pA.getByTestId('suporte-arquivar').isVisible());
  // conversa so com mensagem da pessoa
  const rU = await api('/api/suporte', { token: cli.token, metodo: 'POST', corpo: { acao: 'enviar', texto: 'Здравствуйте, вопрос', idioma: 'ru' } });
  const { data: cC } = await sb.from('suporte_conversas').select('id').eq('profile_id', cli.id).maybeSingle();
  if (cC) conversas.push(cC.id);
  ok('A.7 cliente escreveu pelo balao', rU.ok && !!cC);
  const antesC = await nMsgs(cC.id);
  const rDel2 = await api(`/api/admin/suporte/${cC.id}`, { token: adm.token, metodo: 'DELETE' });
  ok('A.7 com mensagem da pessoa: DELETE 409 e nada apagado', rDel2.status === 409 && (await nMsgs(cC.id)) === antesC && !!(await linha(cC.id)));
  // DELETE duplo de uma vazia
  const ofiV = await conta('oficina', `Vazia ${tag}`, 'et');
  const iniV = await iniciar(adm, ofiV.id); conversas.push(iniV.conversaId);
  const [d1, d2] = await Promise.all([api(`/api/admin/suporte/${iniV.conversaId}`, { token: adm.token, metodo: 'DELETE' }), api(`/api/admin/suporte/${iniV.conversaId}`, { token: adm.token, metodo: 'DELETE' })]);
  const st = [d1.status, d2.status].sort().join(',');
  ok('A.8 DELETE duplo (duas abas): 200 + 404, nunca 500', st === '200,404', st);
  ok('A.8 DELETE de id inexistente: 404', (await api(`/api/admin/suporte/${crypto.randomUUID()}`, { token: adm.token, metodo: 'DELETE' })).status === 404);
  // corrida: mensagem da pessoa e DELETE ao mesmo tempo -> nunca some mensagem
  const iniR = await iniciar(adm, ofi2.id); conversas.push(iniR.conversaId);
  const [rMsg, rDelR] = await Promise.all([
    api('/api/suporte', { token: ofi2.token, metodo: 'POST', corpo: { acao: 'enviar', texto: 'Tere, kiire küsimus', idioma: 'et' } }),
    api(`/api/admin/suporte/${iniR.conversaId}`, { token: adm.token, metodo: 'DELETE' }),
  ]);
  const { data: cR } = await sb.from('suporte_conversas').select('id').eq('profile_id', ofi2.id).maybeSingle();
  if (cR && !conversas.includes(cR.id)) conversas.push(cR.id);
  const msgsR = cR ? await nMsgs(cR.id) : 0;
  ok('A.9 corrida DELETE x mensagem: ou a mensagem ficou (DELETE 409) ou a conversa saiu antes e a mensagem falhou/foi para conversa nova',
    (rDelR.status === 409 && rMsg.ok && msgsR >= 1) || (rDelR.status === 200 && (!rMsg.ok || msgsR >= 1)), `del=${rDelR.status} msg=${rMsg.status} msgs=${msgsR}`);
  const { count: orfas } = await sb.from('suporte_mensagens').select('id', { count: 'exact', head: true }).in('conversa_id', [iniR.conversaId]);
  ok('A.9 nenhuma mensagem perdida/orfa', rDelR.status === 409 ? orfas >= 1 : true);

  // ---------- B arquivar
  const cAntes = await linha(cC.id);
  ok('B.0 cliente: conversa com 1+ nao lida do admin', cAntes.nao_lidas_admin >= 1);
  const menuAntes = await menu(adm);
  const totArqAntes = (await lista(adm)).totalArquivadas;
  await pA.goto(`${SITE}/admin/suporte`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(1500);
  await pA.getByTestId('suporte-conversa').filter({ hasText: `Olga Arquivo ${tag}` }).click(); await pA.waitForTimeout(1500);
  await pA.getByTestId('suporte-arquivar').click(); await pA.waitForTimeout(2000);
  const cArq = await linha(cC.id);
  ok('B.1 Arquivar: arquivada_em gravado, nao_lidas_admin 0', !!cArq.arquivada_em && cArq.nao_lidas_admin === 0);
  ok('B.1 Arquivar: aviso na lista', (await pA.getByTestId('suporte-aviso-lista').innerText().catch(() => '')).includes('arquivada'));
  ok('B.2 sai de Ativas', !(await naLista(adm, cC.id)) && !(await pA.getByTestId('suporte-conversa').filter({ hasText: `Olga Arquivo ${tag}` }).count()));
  const lArq = await lista(adm, true);
  ok('B.3 aparece em Arquivadas, total +1', !!lArq.conversas.find((c) => c.id === cC.id) && lArq.totalArquivadas === totArqAntes + 1, `${lArq.totalArquivadas} vs ${totArqAntes}`);
  ok('B.4 menu do admin deixa de contar as nao lidas dela', (await menu(adm)) === menuAntes - cAntes.nao_lidas_admin, `${menuAntes} -> ${await menu(adm)}`);
  ok('B.5 dados intactos (mensagens)', (await nMsgs(cC.id)) === antesC);
  await pA.getByTestId('suporte-aba-arquivadas').click(); await pA.waitForTimeout(2000);
  ok('B.6 aba Arquivadas: endereco ?arquivadas=1', pA.url().includes('arquivadas=1'));
  ok('B.6 aba mostra (n) e a conversa com o chip "arquivada"', /Arquivadas \(\d+\)/.test(await pA.getByTestId('suporte-aba-arquivadas').innerText()) && await pA.getByTestId('suporte-conversa').filter({ hasText: `Olga Arquivo ${tag}` }).getByTestId('suporte-chip-arquivada').isVisible());
  await pA.reload({ waitUntil: 'networkidle' }); await pA.waitForTimeout(2000);
  ok('B.7 F5 fica em Arquivadas', pA.url().includes('arquivadas=1') && (await pA.getByTestId('suporte-aba-arquivadas').getAttribute('aria-selected')) === 'true' && await pA.getByTestId('suporte-conversa').filter({ hasText: `Olga Arquivo ${tag}` }).isVisible());
  await pA.screenshot({ path: `${PRINTS}/b-arquivadas-pc.png` });
  await pA.getByTestId('suporte-conversa').filter({ hasText: `Olga Arquivo ${tag}` }).click(); await pA.waitForTimeout(2000);
  const bolhas = await pA.locator('section[aria-label^="Conversa com"] p.whitespace-pre-wrap').count();
  ok('B.8 conversa arquivada aberta: historico inteiro visivel (uma bolha por mensagem)', bolhas === antesC, `${bolhas} vs ${antesC}`);
  ok('B.8 arquivada: Desarquivar visivel, sem Excluir', await pA.getByTestId('suporte-desarquivar').isVisible() && !(await pA.getByTestId('suporte-excluir').count()));
  await pA.getByTestId('suporte-desarquivar').click(); await pA.waitForTimeout(2000);
  ok('B.9 Desarquivar: volta para Ativas', !(await linha(cC.id)).arquivada_em && !!(await naLista(adm, cC.id)));
  ok('B.10 PATCH com acao invalida 400; id inexistente 404', (await api(`/api/admin/suporte/${cC.id}`, { token: adm.token, metodo: 'PATCH', corpo: { acao: 'apagar' } })).status === 400
    && (await api(`/api/admin/suporte/${crypto.randomUUID()}`, { token: adm.token, metodo: 'PATCH', corpo: { acao: 'arquivar' } })).status === 404);

  // ---------- C volta sozinha
  const arquivarApi = (id) => api(`/api/admin/suporte/${id}`, { token: adm.token, metodo: 'PATCH', corpo: { acao: 'arquivar' } });
  // C.1 oficina logada escreve pelo balao (tela)
  await arquivarApi(ini2.conversaId);
  ok('C.1 oficina arquivada', !!(await linha(ini2.conversaId)).arquivada_em);
  const ctxO = await ctxNovo('celular'); const pO = await entrar(ctxO, ofi);
  await pO.goto(`${SITE}/ee/et`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(1500);
  await pO.getByTestId('chat-suporte-botao').click(); await pO.waitForTimeout(2000);
  ok('C.1 oficina ve a mensagem do admin mesmo arquivada (lado dela nada muda)', (await pO.getByTestId('conversa-lista').innerText()).includes('Test message'));
  await pO.locator('#suporte-texto').fill('Tere, mul on küsimus'); await pO.getByTestId('chat-suporte-enviar').click(); await pO.waitForTimeout(2500);
  const c1 = await linha(ini2.conversaId);
  const l1 = await naLista(adm, ini2.conversaId);
  ok('C.1 oficina escreveu: volta para Ativas com nao lida', !c1.arquivada_em && !!l1 && l1.naoLidas >= 1, JSON.stringify({ arq: c1.arquivada_em, l1: !!l1 }));
  ok('C.1 admin ve o historico inteiro (admin + oficina)', (await (await api(`/api/admin/suporte/${ini2.conversaId}`, { token: adm.token })).json()).mensagens.filter((m) => m.autor !== 'auto').length === 2);
  // C.2 visitante
  const rIni = await api('/api/suporte', { metodo: 'POST', corpo: { acao: 'iniciar', nome: `Visitante ${tag}`, email: `sarq-vis-${tag}@example.test`, consentimento: true, idioma: 'en' }, headers: { 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}` } });
  const vis = await rIni.json(); if (vis.conversaId) conversas.push(vis.conversaId);
  await api('/api/suporte', { metodo: 'POST', corpo: { acao: 'enviar', texto: 'Hello, first question', idioma: 'en', c: vis.conversaId, t: vis.token } });
  await arquivarApi(vis.conversaId);
  ok('C.2 visitante arquivado', !!(await linha(vis.conversaId))?.arquivada_em);
  await api('/api/suporte', { metodo: 'POST', corpo: { acao: 'enviar', texto: 'Hello again', idioma: 'en', c: vis.conversaId, t: vis.token } });
  ok('C.2 visitante escreveu: volta para Ativas', !(await linha(vis.conversaId)).arquivada_em && !!(await naLista(adm, vis.conversaId)));
  // C.3 admin responde
  await arquivarApi(cC.id);
  await api(`/api/admin/suporte/${cC.id}`, { token: adm.token, metodo: 'POST', corpo: { texto: 'Olá, resposta', traduzir: false } });
  ok('C.3 admin respondeu: desarquivada', !(await linha(cC.id)).arquivada_em);
  // C.4 admin inicia de novo com a conta arquivada
  await arquivarApi(cC.id);
  const ini4 = await iniciar(adm, cli.id);
  ok('C.4 iniciar com conta arquivada: mesma conversa, desarquivada=true', ini4.conversaId === cC.id && ini4.nova === false && ini4.desarquivada === true && !(await linha(cC.id)).arquivada_em, JSON.stringify(ini4));
  // C.5 pela tela: estando em Arquivadas, "?profile=" leva para Ativas com a conversa aberta e aviso
  await arquivarApi(cC.id);
  await pA.goto(`${SITE}/admin/suporte?arquivadas=1`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(1500);
  await pA.goto(`${SITE}/admin/suporte?profile=${cli.id}`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(3000);
  ok('C.5 "Escrever" numa conta arquivada: conversa aberta e aviso "voltou para Ativas"', (await pA.locator('[role=status]').allInnerTexts()).join(' ').includes('voltou para Ativas') && await pA.getByTestId('suporte-arquivar').isVisible());
  // C.6 a pessoa: GET do balao nunca mostra arquivada_em nem muda nada
  const gC = await (await api('/api/suporte', { token: cli.token })).json();
  ok('C.6 balao do cliente: so a propria conversa, sem campo de arquivo', gC.conversa?.id === cC.id && !JSON.stringify(gC).includes('arquivad'));

  // ---------- D seguranca
  for (const [n, t, esperado] of [['sem login', null, 401], ['oficina', ofi.token, 403], ['cliente', cli.token, 403]]) {
    ok(`D.1 ${n}: PATCH arquivar ${esperado}`, (await api(`/api/admin/suporte/${cC.id}`, { token: t, metodo: 'PATCH', corpo: { acao: 'arquivar' } })).status === esperado);
    ok(`D.1 ${n}: DELETE ${esperado}`, (await api(`/api/admin/suporte/${cC.id}`, { token: t, metodo: 'DELETE' })).status === esperado);
    ok(`D.1 ${n}: GET ?arquivadas=1 ${esperado}`, (await api('/api/admin/suporte?arquivadas=1', { token: t })).status === esperado);
  }
  ok('D.1 conversa intacta depois das tentativas', !!(await linha(cC.id)) && (await nMsgs(cC.id)) >= antesC);
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  for (const [n, c] of [['anon', anon], ['cliente logado', cli.cliente]]) {
    const { data: sel } = await c.from('suporte_conversas').select('id').eq('id', cC.id);
    ok(`D.2 ${n}: nao le suporte_conversas`, !sel || sel.length === 0);
    await c.from('suporte_conversas').update({ arquivada_em: new Date().toISOString() }).eq('id', cC.id);
    ok(`D.2 ${n}: nao arquiva pelo banco`, !(await linha(cC.id)).arquivada_em);
    const { error: eRpc } = await c.rpc('suporte_excluir_vazia', { p_id: iniR.conversaId });
    ok(`D.2 ${n}: nao chama suporte_excluir_vazia`, !!eRpc);
  }
  const gO = await (await api('/api/suporte', { token: ofi.token })).json();
  ok('D.3 oficina ve so a propria conversa', gO.conversa?.id === ini2.conversaId);
  const gOutra = await api('/api/suporte', { headers: { 'x-suporte-conversa': cC.id, 'x-suporte-chave': 'x'.repeat(48) } });
  ok('D.3 sem chave valida nao le a conversa de outro (404)', gOutra.status === 404);

  // ---------- E celular
  const ctxM = await ctxNovo('celular'); const pM = await entrar(ctxM, adm);
  await pM.goto(`${SITE}/admin/suporte`, { waitUntil: 'networkidle' }); await pM.waitForTimeout(2000);
  const larg = await pM.evaluate(() => document.documentElement.scrollWidth);
  ok('E.1 celular: abas visiveis e sem rolagem lateral', larg <= 392 && await pM.getByTestId('suporte-aba-arquivadas').isVisible(), `scrollWidth=${larg}`);
  await pM.getByTestId('suporte-conversa').filter({ hasText: `Olga Arquivo ${tag}` }).click(); await pM.waitForTimeout(2000);
  const larg2 = await pM.evaluate(() => document.documentElement.scrollWidth);
  ok('E.2 celular: conversa aberta com Arquivar visivel e sem rolagem lateral', larg2 <= 392 && await pM.getByTestId('suporte-arquivar').isVisible(), `scrollWidth=${larg2}`);
  await pM.screenshot({ path: `${PRINTS}/e-conversa-celular.png` });
  await ctxM.close(); await ctxO.close(); await ctxA.close();
} catch (e) {
  ok('excecao', false, e.stack || e.message);
} finally {
  await browser.close();
  for (const c of conversas) await sb.from('suporte_conversas').delete().eq('id', c);
  for (const id of contas) { await sb.from('suporte_conversas').delete().eq('profile_id', id); await sb.from('presenca').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(`\n${total - falhas}/${total} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
}
