// E2E LOCAL do lote 5 de pecas (catalogo v3, promocoes, Shop das oficinas, "pedir"/"pedir de novo", editor do Shop), 20/11.
// Mapa: Documentos/Analises/Pecas_lote5_2026-11-20/Mapa_lote5.md; contrato: Contrato_testids_lote5.md (migracoes 104-106).
//   B banco/RLS | S tudo desligado (contas reais) | T contas de teste | A admin/editor | L limpeza
// Sobe o PROPRIO site em :3106 (PORTA_SITE troca; nunca :3100-:3105) com o build DESTA copia do app.
//   node pecas-lote5.mjs [<.env.local>]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const PORTA_SITE = Number(process.env.PORTA_SITE || 3106);
if ([3100, 3101, 3102, 3103, 3104, 3105].includes(PORTA_SITE)) { console.log('FALHA porta reservada (3100-3105 sao de outros servidores)'); process.exit(2); }
process.env.SITE = `http://localhost:${PORTA_SITE}`;
const L = await import('./pecas-v3-lote3-lib.mjs');
const { lerEnv, ambienteL3, abrirNavegadores, contador, SITE, ENV_PADRAO, WEB, siteNoAr, vigiar, entrarPelaTela, ir, visivel, sleep, psql, semRolagemLateral, semChaveCrua, tradutor, POLITICAS_INTOCADAS_SQL, POLITICAS_INTOCADAS_MD5 } = L;
const req = createRequire(path.join(WEB, 'package.json'));
const sharp = req('sharp');

const env = lerEnv(process.argv[2] || ENV_PADRAO);
if (await siteNoAr()) { console.log(`FALHA ja ha um site em ${SITE} - pare-o antes (este teste sobe o seu)`); process.exit(2); }
const A = ambienteL3(env);
const { ok, fim, tentar } = contador();
const erros = [];
const ET = tradutor('et');
const RU = tradutor('ru');

let log = '';
const site = spawn(process.execPath, [path.join(WEB, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORTA_SITE)], { cwd: WEB, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
site.stdout.on('data', (d) => { log += d; }); site.stderr.on('data', (d) => { log += d; });
const parar = () => { try { site.kill(); } catch { /* */ } };
let nav = null;

const shopAntes = psql("select coalesce(to_jsonb(c)->>'pecas_shop_ativo','') from plataforma_config c where id = 1");
const v3Antes = psql("select coalesce(to_jsonb(c)->>'pecas_v3_ativo','') from plataforma_config c where id = 1");
const versoesAntes = new Set(psql("select coalesce(string_agg(id::text, ','), '') from shop_pagina_versoes").split(',').filter(Boolean));
const publicadaAntes = psql("select coalesce((select id::text from shop_pagina_versoes where estado = 'publicada' limit 1), '')");
const caminhosBanner = [];
const shopInterruptor = (v) => psql(`update plataforma_config set pecas_shop_ativo = ${v ? 'true' : 'false'} where id = 1 returning pecas_shop_ativo`);
const v3Interruptor = (v) => psql(`update plataforma_config set pecas_v3_ativo = ${v ? 'true' : 'false'} where id = 1 returning pecas_v3_ativo`);
const restaurar = async () => {
  if (shopAntes) shopInterruptor(shopAntes === 'true');
  if (v3Antes) v3Interruptor(v3Antes === 'true');
  const novas = psql("select coalesce(string_agg(id::text, ','), '') from shop_pagina_versoes").split(',').filter((x) => x && !versoesAntes.has(x));
  if (novas.length) psql(`delete from shop_pagina_versoes where id in (${novas.map((x) => `'${x}'`).join(',')})`);
  if (publicadaAntes) psql(`update shop_pagina_versoes set estado = 'publicada' where id = '${publicadaAntes}'`);
  if (caminhosBanner.length) await A.admin.storage.from('shop-pagina').remove(caminhosBanner).catch(() => {});
};
process.on('SIGINT', async () => { try { await nav?.fechar(); } catch { /* */ } parar(); await restaurar(); await A.limpar(); process.exit(130); });

const get = async (caminho, extra = {}) => {
  try {
    const r = await fetch(`${SITE}${caminho}`, { redirect: 'manual', headers: { 'x-real-ip': A.ip(), ...extra } });
    return { status: r.status, location: r.headers.get('location') || '', texto: await r.text() };
  } catch (e) { return { status: 0, location: '', texto: String(e?.message || e) }; }
};
const shopApi = (s, q = '') => A.api('GET', `/api/pecas/shop${q}`, undefined, s?.token);
const pedir = (s, corpo) => A.api('POST', '/api/pecas/pedir', corpo, s?.token);
const novosTestids = ['shop-vitrine', 'link-shop', 'link-shop-faixa', 'cotacao-pedido-direto', 'pedir-de-novo-loja', 'catalogo-campos-v3', 'link-promocoes', 'catalogo-v3-aviso', 'catalogo-item-v3'];
const semNovos = async (p) => { const achados = []; for (const t of novosTestids) if (await p.locator(`[data-testid="${t}"]`).count()) achados.push(t); return achados; };
const item = async (loja, campos = {}) => {
  const { data, error } = await A.admin.from('pecas_catalogo').insert({ loja_id: loja.id, nome: `TESTE-PECAS item ${A.tag}`, preco: 10, quantidade_estoque: 5, visibilidade: 'oficinas', ...campos }).select('id, nome, preco').single();
  if (error) throw new Error(`item: ${error.message}`);
  return data;
};
const promo = async (loja, campos = {}) => {
  const { data, error } = await A.admin.from('promocoes_pecas').insert({ loja_id: loja.id, titulo: `TESTE-PECAS promo ${A.tag}`, preco: 8, unidade: 'un', ...campos }).select('id, titulo, preco').single();
  if (error) throw new Error(`promo: ${error.message}`);
  return data;
};
const status404 = async (p, url) => { const r = await p.goto(`${SITE}${url}`, { waitUntil: 'networkidle' }).catch(() => null); await p.waitForTimeout(500); return r ? r.status() : 0; };

try {
  let no = false;
  for (let i = 0; i < 60 && !no; i++) { await sleep(1000); no = await siteNoAr(); }
  ok(`site no ar em ${SITE}`, no, log.slice(-300));
  if (!no) throw new Error('site nao subiu');
  shopInterruptor(false); v3Interruptor(false);

  // contas: reais (interruptor desligado = tela de hoje) e de teste (veem o novo), em paridade
  const dOfR = await A.conta('oficina', 'l5-of-real'); const ofR = await A.oficina(dOfR, 'L5 Oficina Real', { km: 0 });
  const dLjR = await A.conta('loja_pecas', 'l5-loja-real'); const ljR = await A.loja(dLjR, 'L5 Loja Real');
  const dOfT = await A.conta('oficina', 'l5-of-teste', { contaTeste: true }); const ofT = await A.oficina(dOfT, 'L5 Oficina Teste', { km: 0 });
  const dLjT = await A.conta('loja_pecas', 'l5-loja-teste', { contaTeste: true }); const ljT = await A.loja(dLjT, 'L5 Loja Teste');
  const dLjT2 = await A.conta('loja_pecas', 'l5-loja-teste2', { contaTeste: true, idioma: 'ru' }); const ljT2 = await A.loja(dLjT2, 'L5 Loja Teste Dois');
  const dLjIT = await A.conta('loja_pecas', 'l5-loja-it', { contaTeste: true }); const ljIT = await A.loja(dLjIT, 'L5 Loja Italia', { pais: 'IT' });
  const adm = await A.conta('admin', 'l5-admin', { idioma: 'pt' });
  const S = { ofR: await A.sessao(dOfR), ljR: await A.sessao(dLjR), ofT: await A.sessao(dOfT), ljT: await A.sessao(dLjT), ljT2: await A.sessao(dLjT2) };

  // ======================= B: banco =======================
  await tentar('B', async () => {
    ok('B.1a interruptor pecas_shop_ativo existe e esta desligado', psql("select pecas_shop_ativo from plataforma_config where id = 1") === 'f');
    const restr = psql("select string_agg(polname, ',' order by polname) from pg_policy where polname like '%\\_lote5' and not polpermissive");
    ok('B.1b 5 politicas RESTRITIVAS *_lote5', restr === 'cotacoes_pecas_alvo_lote5,cotacoes_respostas_alvo_lote5,pecas_catalogo_delete_oculto_lote5,pecas_mensagens_alvo_lote5,promocoes_pecas_delete_oculta_lote5', restr);
    const md5 = psql(POLITICAS_INTOCADAS_SQL);
    ok('B.1c politicas PERMISSIVAS de pecas iguais as de producao (M0b)', md5 === POLITICAS_INTOCADAS_MD5, md5);
    const rls = psql("select string_agg(relname || '=' || relrowsecurity, ',' order by relname) from pg_class where relname in ('promocoes_pecas','shop_pagina_versoes')");
    ok('B.1d RLS ligada nas tabelas novas', rls === 'promocoes_pecas=true,shop_pagina_versoes=true', rls);
    const iA = await item(ljT, { visibilidade: 'oficinas' }); const pA = await promo(ljT);
    await A.admin.from('shop_pagina_versoes').insert({ estado: 'rascunho', conteudo: { textos: {} }, nota: `teste ${A.tag}` });
    const an = A.anon();
    const [c1, c2, c3] = await Promise.all([an.from('pecas_catalogo').select('id, preco').eq('id', iA.id), an.from('promocoes_pecas').select('id').eq('id', pA.id), an.from('shop_pagina_versoes').select('id').limit(5)]);
    ok('B.2 anon (REST) nao le pecas_catalogo, promocoes_pecas nem shop_pagina_versoes', ![c1, c2, c3].some((x) => (x.data || []).length), [c1, c2, c3].map((x) => `${(x.data || []).length}:${x.error?.code || ''}`).join(' '));
    const [o1, o2, o3, o4] = await Promise.all([S.ljT2.c.from('pecas_catalogo').select('id').eq('id', iA.id), S.ljT2.c.from('promocoes_pecas').select('id').eq('id', pA.id), S.ofT.c.from('pecas_catalogo').select('id').eq('id', iA.id), S.ofT.c.from('shop_pagina_versoes').select('id').limit(5)]);
    ok('B.3 outra loja e oficina (logadas) nao leem catalogo/promocoes alheios nem as versoes do editor', ![o1, o2, o3, o4].some((x) => (x.data || []).length));
    const { data: dono } = await S.ljT.c.from('pecas_catalogo').select('id').eq('id', iA.id);
    ok('B.3b a loja dona le o proprio item', (dono || []).length === 1);
    const { data: novo, error: eNovo } = await S.ljT.c.from('pecas_catalogo').insert({ loja_id: ljT.id, nome: `TESTE-PECAS sem vis ${A.tag}`, preco: 5 }).select('id, visibilidade, oculto').single();
    ok('B.4 item novo sem visibilidade = interno', !eNovo && novo?.visibilidade === 'interno', eNovo?.message || novo?.visibilidade);
    await S.ljT.c.from('pecas_catalogo').update({ oculto: true, oculto_motivo: 'eu' }).eq('id', novo.id);
    ok('B.5a loja nao grava oculto', psql(`select oculto from pecas_catalogo where id = '${novo.id}'`) === 'f');
    await A.admin.from('pecas_catalogo').update({ oculto: true, oculto_motivo: 'teste admin' }).eq('id', novo.id);
    await S.ljT.c.from('pecas_catalogo').delete().eq('id', novo.id);
    ok('B.5b item oculto pelo admin NAO se apaga pela loja', psql(`select count(*) from pecas_catalogo where id = '${novo.id}'`) === '1');
    await S.ljT.c.from('pecas_catalogo').update({ oculto: false }).eq('id', novo.id);
    ok('B.5c loja nao "desoculta"', psql(`select oculto from pecas_catalogo where id = '${novo.id}'`) === 't');
    const { error: ePz } = await S.ljT.c.from('pecas_catalogo').insert({ loja_id: ljT.id, nome: 'x', preco: 0 });
    ok('B.5d preco 0 recusado pelo banco', !!ePz, ePz?.message);
    // promocoes
    const base = { loja_id: ljT.id, titulo: `TESTE-PECAS p ${A.tag}`, preco: 10, visibilidade: 'oficinas' };
    const d1 = []; for (let i = 0; i < 3; i++) d1.push(await S.ljT.c.from('promocoes_pecas').insert({ ...base, destaque: true }).select('id').single());
    const d4 = await S.ljT.c.from('promocoes_pecas').insert({ ...base, destaque: true }).select('id').single();
    ok('B.6a 3 destaques aceitos, o 4o recusado', d1.every((x) => !x.error) && !!d4.error, `${d1.map((x) => x.error?.message || 'ok').join(',')} | ${d4.error?.message}`);
    const e30 = await S.ljT.c.from('promocoes_pecas').insert({ ...base, valido_ate: new Date(Date.now() + 32 * 86400e3).toISOString() });
    const eAnt = await S.ljT.c.from('promocoes_pecas').insert({ ...base, preco_anterior: 9 });
    const ePub = await S.ljT.c.from('promocoes_pecas').insert({ ...base, visibilidade: 'publico', preco_anterior: 12 });
    const eItem = await S.ljT.c.from('promocoes_pecas').insert({ ...base, item_id: (await item(ljT2)).id });
    ok('B.6b validade > 30 dias, preco anterior <= preco, publica com preco anterior sem os 30 dias, item de outra loja: recusados', !!e30.error && !!eAnt.error && !!ePub.error && !!eItem.error, [e30, eAnt, ePub, eItem].map((x) => x.error?.message || 'ACEITO').join(' | '));
    const { data: pOc } = await S.ljT.c.from('promocoes_pecas').insert({ ...base, oculta: true }).select('id, oculta').single();
    ok('B.6c loja nao cria promocao ja oculta (gatilho)', pOc?.oculta === false);
    const eOutra = await S.ljT2.c.from('promocoes_pecas').insert({ ...base });
    ok('B.6d loja nao cria promocao em nome de outra loja', !!eOutra.error, eOutra.error?.message);
    // teto de 50 ativas (as ja criadas contam)
    const ja = Number(psql(`select count(*) from promocoes_pecas where loja_id = '${ljT.id}' and not oculta and valido_ate > now()`));
    for (let i = ja; i < 50; i++) await A.admin.from('promocoes_pecas').insert({ ...base, titulo: `TESTE-PECAS teto ${i} ${A.tag}` });
    const e51 = await S.ljT.c.from('promocoes_pecas').insert({ ...base, titulo: 'a 51a' });
    ok('B.7 teto de 50 promocoes ativas por loja (a 51a recusada)', !!e51.error && Number(psql(`select count(*) from promocoes_pecas where loja_id = '${ljT.id}' and not oculta and valido_ate > now()`)) === 50, e51.error?.message);
    psql(`delete from promocoes_pecas where loja_id = '${ljT.id}'`);
    // cotacao de 1 fornecedor so pelo servidor
    const eU = await S.ofT.c.from('cotacoes_pecas').insert({ oficina_id: ofT.id, peca_descricao: 'x', alvo: 'fornecedor_unico', fornecedor_alvo_tipo: 'loja', fornecedor_alvo_id: ljT.id });
    const eU2 = await S.ofT.c.from('cotacoes_pecas').insert({ oficina_id: ofT.id, peca_descricao: 'x', preco_referencia: 1 });
    ok('B.8a usuario NAO cria cotacao de 1 fornecedor nem grava os campos novos', !!eU.error && !!eU2.error, `${eU.error?.message} | ${eU2.error?.message}`);
    const cot = await A.cotacao(ofT, 'B8', { alvo: 'todos' });
    const eU3 = await S.ofT.c.from('cotacoes_pecas').update({ alvo: 'fornecedor_unico' }).eq('id', cot.id);
    await S.ofT.c.from('cotacoes_pecas').update({ fornecedor_alvo_id: ljT.id, preco_referencia: 5 }).eq('id', cot.id);
    const depois = A.linhaJson('cotacoes_pecas', cot.id);
    ok('B.8b usuario NAO muda o alvo nem os campos novos', !!eU3.error && depois.alvo === 'todos' && depois.fornecedor_alvo_id === null && depois.preco_referencia === null, `${eU3.error?.message} ${JSON.stringify({ a: depois.alvo, f: depois.fornecedor_alvo_id })}`);
    // ON DELETE SET NULL do item: gatilho deixa passar
    const iDel = await item(ljT);
    const { data: cU } = await A.admin.from('cotacoes_pecas').insert({ oficina_id: ofT.id, peca_descricao: `TESTE-PECAS SN ${A.tag}`, alvo: 'fornecedor_unico', fornecedor_alvo_tipo: 'loja', fornecedor_alvo_id: ljT.id, catalogo_item_id: iDel.id, origem: 'shop' }).select('id').single();
    A.criado.cotacoes.push(cU.id);
    const { error: eDel } = await S.ljT.c.from('pecas_catalogo').delete().eq('id', iDel.id);
    ok('B.9 loja apaga item ja pedido: item sai e a cotacao fica com catalogo_item_id nulo', !eDel && A.linhaJson('cotacoes_pecas', cU.id).catalogo_item_id === null && psql(`select count(*) from pecas_catalogo where id = '${iDel.id}'`) === '0', eDel?.message);
    psql(`delete from cotacoes_pecas where id = '${cU.id}'`);
  });

  // dados do Shop: lojas de teste (2) e real, Italia, itens de cada visibilidade, promocoes
  const iOf = await item(ljT, { nome: `TESTE-PECAS Pastilhas dianteiras ${A.tag}`, preco: 42.5, codigo: 'P85020', unidade: 'jogo', visibilidade: 'oficinas' });
  const iInt = await item(ljT, { nome: `TESTE-PECAS Interno ${A.tag}`, preco: 1, visibilidade: 'interno' });
  const iOleo = await item(ljT2, { nome: `TESTE-PECAS Oleo 5W-30 ${A.tag}`, preco: 7.9, unidade: 'litro', especificacao: 'VW 507 00', visibilidade: 'oficinas' });
  const iReal = await item(ljR, { nome: `TESTE-PECAS Real ${A.tag}`, preco: 3, visibilidade: 'oficinas' });
  const iIt = await item(ljIT, { nome: `TESTE-PECAS Italia ${A.tag}`, preco: 3, visibilidade: 'oficinas' });
  const iOc = await item(ljT2, { nome: `TESTE-PECAS Oculto ${A.tag}`, preco: 2, visibilidade: 'oficinas' });
  await A.admin.from('pecas_catalogo').update({ oculto: true, oculto_motivo: 'teste' }).eq('id', iOc.id);
  const promos = []; for (let i = 0; i < 4; i++) promos.push(await promo(ljT2, { titulo: `TESTE-PECAS Promo ${i} ${A.tag}`, preco: 20 + i, destaque: i === 3 }));

  // ======================= S: desligado (contas reais) =======================
  nav = await abrirNavegadores(false);
  await tentar('S', async () => {
    const s1 = await shopApi(S.ofR); const s1e = await shopApi(S.ofR, '?estado=1');
    const antes = Number(psql(`select count(*) from cotacoes_pecas where oficina_id = '${ofR.id}'`));
    const s1p = await pedir(S.ofR, { itemId: iReal.id, quantidade: 1 });
    ok('S.1 oficina real: /api/pecas/shop 404, estado ativo=false, pedir 404 sem gravar', s1.status === 404 && s1e.status === 200 && s1e.d.ativo === false && s1p.status === 404 && Number(psql(`select count(*) from cotacoes_pecas where oficina_id = '${ofR.id}'`)) === antes, `${s1.status} ${JSON.stringify(s1e.d)} ${s1p.status}`);
    const sAnon = await A.api('GET', '/api/pecas/shop', undefined, null);
    ok('S.1b sem login: 401', sAnon.status === 401, `${sAnon.status}`);
    const ctx = await nav.contexto('chromium', 390, A.ip); const p = await ctx.newPage(); vigiar(p, erros, 'S-oficina');
    await entrarPelaTela(p, '/ee/et', dOfR);
    ok('S.2a /ee/et/oficina/shop para oficina real: 404', (await status404(p, '/ee/et/oficina/shop')) === 404);
    await ir(p, '/ee/et/oficina/pecas', 2500);
    ok('S.2b /oficina/pecas sem nada novo (link Shop, etiquetas)', (await semNovos(p)).length === 0, (await semNovos(p)).join(','));
    await ctx.close();
    const ctxL = await nav.contexto('chromium', 390, A.ip); const pl = await ctxL.newPage(); vigiar(pl, erros, 'S-loja');
    await entrarPelaTela(pl, '/ee/et', dLjR);
    ok('S.3a /ee/et/loja/promocoes para loja real: 404', (await status404(pl, '/ee/et/loja/promocoes')) === 404);
    await ir(pl, '/ee/et/loja/catalogo', 2000);
    await pl.getByRole('button', { name: ET('lojaCatalogo.addButton') }).first().click().catch(() => {});
    await pl.waitForTimeout(800);
    ok('S.3b /loja/catalogo da loja real: formulario de hoje (sem campos v3, sem link de promocoes)', (await semNovos(pl)).length === 0 && (await pl.locator('#c50c4-1').count()) === 1, (await semNovos(pl)).join(','));
    await ctxL.close();
    const s4 = await A.api('GET', '/api/pecas/shop-imagem?c=banners/00000000-0000-0000-0000-000000000000.jpg', undefined, S.ofR.token);
    ok('S.4 /api/pecas/shop-imagem para oficina real: 404', s4.status === 404, `${s4.status}`);
    const sm = await get('/sitemap.xml');
    ok('S.5 sitemap sem /oficina/shop', sm.status === 200 && !/oficina\/shop|\/shop</.test(sm.texto), `${sm.status}`);
  });

  // ======================= T: contas de teste =======================
  await tentar('T', async () => {
    const t1 = await shopApi(S.ofT);
    const ids = (t1.d.resultados || []).map((x) => x.id);
    ok('T.1a oficina de teste: Shop 200', t1.status === 200, `${t1.status}`);
    ok('T.1b so itens "oficinas" de lojas de TESTE do pais (nem interno, nem real, nem Italia, nem oculto)', ids.includes(iOf.id) && ids.includes(iOleo.id) && !ids.includes(iInt.id) && !ids.includes(iReal.id) && !ids.includes(iIt.id) && !ids.includes(iOc.id), ids.length);
    const prs = (t1.d.resultados || []).filter((x) => x.tipo === 'promocao');
    ok('T.1c ate 3 promocoes por loja, a em destaque entre elas, promocoes antes dos itens', prs.length === 3 && prs.some((x) => x.id === promos[3].id) && t1.d.resultados[0].tipo === 'promocao', prs.map((x) => x.nome).join(','));
    ok('T.1d sem telefone/e-mail/registro da loja no JSON', !JSON.stringify(t1.d).includes(dLjT.email) && !JSON.stringify(t1.d).includes('12345678') && !JSON.stringify(t1.d).includes('5000 0001'));
    const t1q = await shopApi(S.ofT, `?q=${encodeURIComponent('5W-30')}`);
    ok('T.1e busca "5W-30" acha o oleo e nao as pastilhas', (t1q.d.resultados || []).some((x) => x.id === iOleo.id) && !(t1q.d.resultados || []).some((x) => x.id === iOf.id), (t1q.d.resultados || []).length);
    const t1p = await shopApi(S.ofT, '?promocoes=1');
    ok('T.1f "so promocoes"', (t1p.d.resultados || []).length > 0 && (t1p.d.resultados || []).every((x) => x.tipo === 'promocao'));
    const lojaT = await shopApi(S.ljT);
    ok('T.1g loja (nao oficina) no Shop: 404', lojaT.status === 404, `${lojaT.status}`);

    // navegador 390 px: pedir pelo Shop
    const ctx = await nav.contexto('chromium', 390, A.ip); const p = await ctx.newPage(); vigiar(p, erros, 'T-oficina');
    await entrarPelaTela(p, '/ee/et', dOfT);
    await ir(p, '/ee/et/oficina/pecas', 2500);
    ok('T.2a faixa e link do Shop na aba Pecas (conta de teste)', await visivel(p.locator('[data-testid="link-shop"]')));
    await p.locator('[data-testid="link-shop"]').click();
    await p.waitForURL(/\/oficina\/shop/, { timeout: 15000 }).catch(() => {});
    ok('T.2b Shop abre: vitrine, titulo padrao (et), busca, chip', await visivel(p.locator('[data-testid="shop-vitrine"]')) && (await p.locator('[data-testid="shop-titulo"]').textContent())?.includes(ET('pecasL5.shopTitulo')) && (await p.locator('[data-testid="shop-so-promocoes"]').getAttribute('aria-pressed')) === 'false');
    await p.locator('[data-testid="shop-busca"]').fill('Pastilhas');
    await p.waitForTimeout(1500);
    const card = p.locator(`[data-testid="shop-resultado"][data-id="${iOf.id}"]`);
    ok('T.2c busca acha o item; preco colado a unidade ("/ kmpl")', await visivel(card) && /42,50\s*€\s*\/\s*kmpl/.test((await card.locator('[data-testid="shop-preco"]').textContent()) || ''), (await card.locator('[data-testid="shop-preco"]').textContent().catch(() => '')));
    ok('T.2d 390 px sem rolagem lateral; sem chave crua', (await semRolagemLateral(p)) && semChaveCrua(await p.locator('main, body').first().innerText()));
    await card.locator('[data-testid="shop-pedir"]').click();
    const dlg = p.locator('[data-testid="pedir-dialogo"]');
    ok('T.2e <dialog> aberto (modal), foco dentro', await visivel(dlg) && await p.evaluate(() => { const d = document.querySelector('dialog[data-testid="pedir-dialogo"]'); return !!d && d.open && d.contains(document.activeElement); }));
    await dlg.getByRole('button', { name: ET('pecasL5.mais') }).click();
    ok('T.2f stepper: 1 -> 2; total estimado 85,00', (await dlg.locator('[data-testid="pedir-quantidade"]').inputValue()) === '2' && /85,00/.test(await dlg.locator('[data-testid="pedir-total"]').textContent()));
    await dlg.locator('[data-testid="pedir-observacao"]').fill('Esimesed piduriklotsid');
    await dlg.locator('[data-testid="pedir-enviar"]').click();
    ok('T.2g confirmacao "Pedido enviado a <loja>" no dialogo', await visivel(dlg.locator('[data-testid="pedir-ok"]'), 15000) && (await dlg.innerText()).includes(ljT.nome));
    const cot = (await A.admin.from('cotacoes_pecas').select('*').eq('oficina_id', ofT.id).eq('origem', 'shop').order('created_at', { ascending: false }).limit(1)).data?.[0];
    if (cot) A.criado.cotacoes.push(cot.id);
    ok('T.3a cotacao: fornecedor_unico para a loja do item, item ligado, preco_referencia 85, qtd 2, jogo, sem placa, aberta, 7 dias', !!cot && cot.alvo === 'fornecedor_unico' && cot.fornecedor_alvo_id === ljT.id && cot.catalogo_item_id === iOf.id && Number(cot.preco_referencia) === 85 && Number(cot.quantidade) === 2 && cot.unidade === 'jogo' && cot.enviar_placa === false && cot.status === 'aberta' && Math.abs(Date.parse(cot.expira_em) - Date.now() - 7 * 86400e3) < 3600e3 && psql(`select count(*) from cotacoes_pecas_placa where cotacao_id = '${cot?.id}'`) === '0', JSON.stringify(cot || {}).slice(0, 300));
    const avT = await A.esperarAviso(dLjT.id, 'cotacao_peca_disponivel');
    const avT2 = await A.avisos(dLjT2.id, 'cotacao_peca_disponivel');
    ok('T.3b sino SO para a loja-alvo (a outra loja de teste nada)', avT.some((a) => a.dados?.cotacao_id === cot?.id) && !avT2.some((a) => a.dados?.cotacao_id === cot?.id), `${avT.length} ${avT2.length}`);
    await dlg.locator('[data-testid="pedir-ver"]').click();
    await p.waitForURL(/\/oficina\/pecas/, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(2500);
    ok('T.3c "Ver meu pedido" leva a aba Pecas com a etiqueta "Pedido direto" e o preco do catalogo', await visivel(p.locator(`#cotacao-${cot?.id} [data-testid="cotacao-pedido-direto"]`)) && /85,00/.test(await p.locator(`#cotacao-${cot?.id} [data-testid="cotacao-pedido-direto"]`).innerText()));
    await p.goBack().catch(() => {}); await p.waitForTimeout(1500);
    ok('T.3d Voltar nao reabre o dialogo nem cria 2a cotacao', Number(psql(`select count(*) from cotacoes_pecas where oficina_id = '${ofT.id}' and origem = 'shop'`)) === 1 && !(await p.locator('dialog[open]').count()));

    // loja nao-alvo
    const { data: v2 } = await S.ljT2.c.from('cotacoes_pecas').select('id').eq('id', cot.id);
    const r2 = await S.ljT2.c.from('cotacoes_pecas_respostas').insert({ cotacao_id: cot.id, fornecedor_tipo: 'loja', loja_id: ljT2.id, preco: 1, prazo_dias: 1 });
    const m2 = await S.ljT2.c.from('cotacoes_pecas_mensagens').insert({ cotacao_id: cot.id, fornecedor_tipo: 'loja', fornecedor_id: ljT2.id, remetente_id: dLjT2.id, texto: 'oi' });
    ok('T.4 loja NAO-alvo: nao ve (RLS), nao responde, nao escreve na conversa', !(v2 || []).length && !!r2.error && !!m2.error, `${(v2 || []).length} ${r2.error?.message} ${m2.error?.message}`);
    const pl2 = await A.placa(cot.id, S.ljT2.token);
    ok('T.4b placa para loja nao-alvo: 404', pl2.status === 404, `${pl2.status}`);

    // loja-alvo responde pela tela, oficina confirma
    const ctxL = await nav.contexto('chromium', 390, A.ip); const pl = await ctxL.newPage(); vigiar(pl, erros, 'T-loja');
    await entrarPelaTela(pl, '/ee/et', dLjT);
    await ir(pl, '/ee/et/loja/cotacoes', 2500);
    const cartao = pl.locator('.card', { hasText: cot.peca_descricao.slice(0, 30) }).first();
    ok('T.5a loja-alvo ve a cotacao com a etiqueta "Pedido direto do seu catalogo"', await visivel(cartao.locator('[data-testid="cotacao-pedido-direto-loja"]')));
    await cartao.getByRole('button', { name: ET('lojaCotacoes.responderCotacaoButton') }).first().click().catch(() => {});
    await pl.waitForTimeout(800);
    ok('T.5b preco pre-preenchido com o preco do catalogo (85)', (await pl.locator('#c40f3-1').inputValue().catch(() => '')) === '85');
    await pl.locator('#c40f3-1').fill('84');
    await pl.getByRole('button', { name: ET('lojaCotacoes.enviarRespostaButton') }).click().catch(() => {});
    await pl.waitForTimeout(2500);
    const resp = (await A.admin.from('cotacoes_pecas_respostas').select('id, preco').eq('cotacao_id', cot.id).eq('loja_id', ljT.id)).data?.[0];
    ok('T.5c oferta gravada (84)', Number(resp?.preco) === 84, JSON.stringify(resp || {}));
    await ctxL.close();
    const conf = resp ? await A.confirmar(resp.id, S.ofT.token) : { status: 0 };
    const ped = (await A.admin.from('pedidos_pecas').select('id, status, loja_id').eq('cotacao_id', cot.id)).data?.[0];
    ok('T.5d oficina confirma a oferta: pedido criado com a loja', conf.status === 200 && ped?.loja_id === ljT.id, `${conf.status} ${JSON.stringify(conf.d).slice(0, 120)}`);

    // pedir de novo
    if (ped) await A.admin.from('pedidos_pecas').update({ status: 'entregue', entregue_em: new Date().toISOString() }).eq('id', ped.id);
    await ir(p, '/ee/et/oficina/pecas', 3000);
    const bt = p.locator(`#cotacao-${cot.id} [data-testid="pedir-de-novo-loja"]`);
    ok('T.6a "Pedir de novo a <loja>" no pedido entregue', await visivel(bt) && (await bt.innerText()).includes(ljT.nome));
    await bt.click(); await p.waitForTimeout(3000);
    const nova = (await A.admin.from('cotacoes_pecas').select('*').eq('oficina_id', ofT.id).eq('origem', 'pedir_de_novo')).data?.[0];
    if (nova) A.criado.cotacoes.push(nova.id);
    ok('T.6b nova cotacao pedir_de_novo para a mesma loja, mesma peca/qtd, sem placa', !!nova && nova.fornecedor_alvo_id === ljT.id && nova.peca_descricao === cot.peca_descricao && Number(nova.quantidade) === 2 && nova.enviar_placa === false && psql(`select count(*) from cotacoes_pecas_placa where cotacao_id = '${nova?.id}'`) === '0', JSON.stringify(nova || {}).slice(0, 200));
    ok('T.6c a nova cotacao aparece com a etiqueta "Pedido de novo"', await visivel(p.locator(`#cotacao-${nova?.id} [data-testid="cotacao-pedido-direto"]`)));
    await ctx.close();

    // teto por par
    const res = []; for (let i = 0; i < 3; i++) res.push(await pedir(S.ofT, { itemId: iOf.id, quantidade: 1 }));
    const abertas = Number(psql(`select count(*) from cotacoes_pecas where oficina_id = '${ofT.id}' and fornecedor_alvo_id = '${ljT.id}' and status in ('aberta','respondida')`));
    ok('T.7 teto de 3 cotacoes abertas por par oficina-loja: a que passaria do teto -> 409 LIMITE_PAR', res.some((x) => x.status === 409 && x.d.error === 'LIMITE_PAR') && abertas === 3, `${res.map((x) => x.status).join(',')} abertas=${abertas}`);
    for (const r of res) if (r.d.cotacaoId) A.criado.cotacoes.push(r.d.cotacaoId);
    // oculto pelo admin e "interno": pedir 404
    const po = await pedir(S.ofT, { itemId: iOc.id, quantidade: 1 }); const pi = await pedir(S.ofT, { itemId: iInt.id, quantidade: 1 }); const pr = await pedir(S.ofT, { itemId: iReal.id, quantidade: 1 });
    ok('T.8 pedir item oculto, interno ou de loja real (paridade): 404', po.status === 404 && pi.status === 404 && pr.status === 404, `${po.status} ${pi.status} ${pr.status}`);
    const pq = await pedir(S.ofT, { itemId: iOleo.id, quantidade: 0 }); const pq2 = await pedir(S.ofT, { itemId: iOleo.id, promocaoId: promos[0].id });
    ok('T.8b quantidade 0 usa 1 (ok) ou recusa; duas origens: 400', [200, 400].includes(pq.status) && pq2.status === 400, `${pq.status} ${pq2.status}`);
    if (pq.d.cotacaoId) A.criado.cotacoes.push(pq.d.cotacaoId);

    // tela da loja: catalogo v3 e promocoes
    const ctxC = await nav.contexto('chromium', 390, A.ip); const pc = await ctxC.newPage(); vigiar(pc, erros, 'T-catalogo');
    await entrarPelaTela(pc, '/ee/et', dLjT2);
    await ir(pc, '/ee/et/loja/catalogo', 2500);
    ok('T.9a catalogo com a tela nova: aviso e link Promocoes', await visivel(pc.locator('[data-testid="catalogo-v3-aviso"]')) && await visivel(pc.locator('[data-testid="link-promocoes"]')));
    await pc.getByRole('button', { name: ET('lojaCatalogo.addButton') }).first().click();
    await pc.locator('#c50c4-1').fill(`TESTE-PECAS Filtro de oleo ${A.tag}`);
    await pc.locator('#c50c4-6').fill('12.5');
    await pc.locator('[data-testid="catalogo-codigo"]').fill('OC 90');
    await pc.locator('[data-testid="catalogo-visibilidade"]').selectOption('oficinas');
    await pc.getByRole('button', { name: ET('lojaCatalogo.addConfirmButton') }).click();
    await pc.waitForTimeout(2000);
    const novoItem = (await A.admin.from('pecas_catalogo').select('codigo, visibilidade').eq('loja_id', ljT2.id).ilike('nome', '%Filtro de oleo%')).data?.[0];
    ok('T.9b item gravado com codigo e visibilidade oficinas', novoItem?.codigo === 'OC 90' && novoItem?.visibilidade === 'oficinas', JSON.stringify(novoItem || {}));
    ok('T.9c item oculto pelo admin mostra o aviso com o motivo', await visivel(pc.locator('[data-testid="catalogo-item-oculto"]')));
    await pc.getByRole('button', { name: ET('lojaCatalogo.addButton') }).first().click();
    await pc.locator('#c50c4-1').fill('x'); await pc.locator('#c50c4-6').fill('0.00');
    await pc.getByRole('button', { name: ET('lojaCatalogo.addConfirmButton') }).click().catch(() => {});
    await pc.waitForTimeout(1500);
    ok('T.9d preco 0: aviso de erro, formulario continua aberto', await visivel(pc.locator('[data-testid="catalogo-erro"]')));
    await pc.locator('[data-testid="link-promocoes"]').click();
    await pc.waitForURL(/\/loja\/promocoes/, { timeout: 15000 }).catch(() => {});
    ok('T.9e promocoes: contador com 1 destaque de 3', await visivel(pc.locator('[data-testid="promo-contador"]')) && /1\/3/.test(await pc.locator('[data-testid="promo-contador"]').innerText()));
    await pc.locator('[data-testid="promo-nova"]').click();
    await pc.locator('[data-testid="promo-titulo"]').fill(`TESTE-PECAS Nova promo ${A.tag}`);
    await pc.locator('[data-testid="promo-preco"]').fill('9,90');
    await pc.locator('[data-testid="promo-preco-anterior"]').fill('12');
    await pc.locator('[data-testid="promo-destaque"]').check();
    await pc.locator('[data-testid="promo-salvar"]').click();
    await pc.waitForTimeout(2000);
    ok('T.9f promocao criada pela tela (destaque, 9,90 e preco anterior 12)', Number(psql(`select count(*) from promocoes_pecas where loja_id = '${ljT2.id}' and titulo like '%Nova promo%' and destaque and preco = 9.90 and preco_anterior = 12`)) === 1);
    await A.admin.from('promocoes_pecas').update({ destaque: true }).eq('id', promos[0].id);
    await pc.reload({ waitUntil: 'networkidle' }); await pc.waitForTimeout(1500);
    await pc.locator(`[data-testid="promo-linha"][data-id="${promos[1].id}"] [data-testid="promo-alternar-destaque"]`).click();
    await pc.waitForTimeout(1500);
    ok('T.9g 4o destaque pela tela: mensagem de erro (et)', await visivel(pc.locator('[data-testid="promo-erro"]')) && (await pc.locator('[data-testid="promo-erro"]').innerText()).includes(ET('pecasL5.erroPromo.destaques')));
    ok('T.9h 390 px sem rolagem lateral nas promocoes', await semRolagemLateral(pc));
    await ctxC.close();
  });

  // ======================= A: admin / editor =======================
  await tentar('A', async () => {
    const ctxA = await nav.contexto('chromium', 1280, A.ip); const pa = await ctxA.newPage(); vigiar(pa, erros, 'A-admin');
    await entrarPelaTela(pa, '/ee/et', adm);
    const ctxO = await nav.contexto('chromium', 1280, A.ip); const po = await ctxO.newPage(); vigiar(po, erros, 'A-oficina');
    await entrarPelaTela(po, '/ee/et', dOfT);
    const rq = (pg) => pg.context().request;
    // A.1 permissoes
    const n1 = await rq(po).get(`${SITE}/api/admin/shop-pagina`); const n2 = await rq(po).put(`${SITE}/api/admin/shop-pagina`, { data: { acao: 'publicar', conteudo: {} } });
    const n3 = await fetch(`${SITE}/api/admin/shop-pagina`).then((r) => r.status);
    const fd0 = new FormData(); fd0.append('arquivo', new Blob([Buffer.from('oi')]), 'a.jpg');
    const n4 = await rq(po).post(`${SITE}/api/admin/shop-pagina/imagem`, { multipart: { arquivo: { name: 'a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('oi') } } });
    ok('A.1a nao-admin (oficina) e sem login: editor 401/403 (GET, PUT, imagem)', [401, 403].includes(n1.status()) && [401, 403].includes(n2.status()) && [401, 403].includes(n3) && [401, 403].includes(n4.status()), `${n1.status()} ${n2.status()} ${n3} ${n4.status()}`);
    const { data: rest } = await S.ofT.c.from('shop_pagina_versoes').insert({ estado: 'publicada', conteudo: {} }).select('id');
    ok('A.1b oficina NAO grava versao pelo REST', !(rest || []).length);
    // A.2/A.3 rascunho, publicar, fallback e limpeza
    const destaquesMuitos = Array.from({ length: 15 }, () => ({ tipo: 'item', id: iOf.id })).concat([{ tipo: 'item', id: iOleo.id }, { tipo: 'promocao', id: promos[3].id }, { tipo: 'item', id: iReal.id }, { tipo: 'nada', id: 'x' }]);
    const sujo = { textos: { et: { titulo: '<b>Varuosad</b> otse kauplustest', subtitulo: 'x'.repeat(400), blocos: [{ titulo: 'Kuidas tellida', texto: 'Vali toode ja vajuta Telli.' }, {}, {}, {}, {}, {}] }, en: { titulo: 'Parts straight from shops', seoTitulo: 'Shop' } }, banner: '../../etc/passwd', destaques: destaquesMuitos };
    const r1 = await rq(pa).put(`${SITE}/api/admin/shop-pagina`, { data: { acao: 'rascunho', conteudo: sujo } });
    const j1 = await r1.json().catch(() => ({}));
    const c1 = j1.conteudo || {};
    ok('A.3 conteudo limpo no servidor: HTML fica texto, subtitulo cortado em 300, blocos vazios fora, banner invalido descartado, destaques sem repeticao e validos', r1.status() === 200 && c1.textos?.et?.titulo === '<b>Varuosad</b> otse kauplustest' && c1.textos.et.subtitulo.length === 300 && c1.textos.et.blocos.length === 1 && c1.banner === null && c1.destaques.length === 4, JSON.stringify(c1).slice(0, 300));
    const ctxT = await nav.contexto('chromium', 390, A.ip); const pt = await ctxT.newPage(); vigiar(pt, erros, 'A-shop');
    await entrarPelaTela(pt, '/ee/et', dOfT);
    await ir(pt, '/ee/et/oficina/shop', 2000);
    ok('A.2a rascunho NAO aparece no Shop (titulo padrao)', (await pt.locator('[data-testid="shop-titulo"]').innerText()) === ET('pecasL5.shopTitulo'));
    const r2 = await rq(pa).put(`${SITE}/api/admin/shop-pagina`, { data: { acao: 'publicar', conteudo: c1 } });
    await ir(pt, '/ee/et/oficina/shop', 2000);
    const titulo = await pt.locator('[data-testid="shop-titulo"]').innerText();
    ok('A.2b publicado: titulo (com <b> como texto, sem tag) e bloco no Shop', r2.status() === 200 && titulo === '<b>Varuosad</b> otse kauplustest' && (await pt.locator('[data-testid="shop-titulo"] b').count()) === 0 && await visivel(pt.locator('[data-testid="shop-bloco"]')));
    const dIds = await pt.locator('[data-testid="shop-destaque"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
    ok('A.2c destaques na ordem do editor, sem o item da loja real (paridade)', dIds[0] === iOf.id && dIds.includes(iOleo.id) && dIds.includes(promos[3].id) && !dIds.includes(iReal.id), dIds.join(','));
    ok('A.2d etiqueta "Destaque BipFix" (et)', (await pt.locator('[data-testid="shop-destaque"]').first().innerText()).includes(ET('pecasL5.destaqueBipfix')));
    await ir(pt, '/ee/ru/oficina/shop', 2000);
    ok('A.2e ru sem texto: titulo cai para EN; subtitulo (so em et) cai para ET', (await pt.locator('[data-testid="shop-titulo"]').innerText()) === 'Parts straight from shops' && (await pt.locator('[data-testid="shop-subtitulo"]').innerText()).startsWith('xxx'));
    ok('A.2f 390 px sem rolagem lateral com o conteudo publicado', await semRolagemLateral(pt));
    // A.4 upload
    const comExif = await sharp({ create: { width: 1800, height: 700, channels: 3, background: '#3355aa' } }).jpeg().withMetadata({ exif: { IFD0: { Make: 'TESTE-GPS-MARCA', Model: 'TESTE-MODELO' } } }).toBuffer();
    const png = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#aa3355' } }).png().toBuffer();
    const up = (buf, nome, tipo) => rq(pa).post(`${SITE}/api/admin/shop-pagina/imagem`, { multipart: { arquivo: { name: nome, mimeType: tipo, buffer: buf } } });
    const u1 = await up(comExif, 'banner.jpg', 'image/jpeg'); const j1u = await u1.json().catch(() => ({}));
    if (j1u.caminho) caminhosBanner.push(j1u.caminho);
    const baixado = j1u.caminho ? Buffer.from(await (await A.admin.storage.from('shop-pagina').download(j1u.caminho)).data.arrayBuffer()) : Buffer.alloc(0);
    const meta = baixado.length ? await sharp(baixado).metadata() : {};
    ok('A.4a JPEG com EXIF: gravado como JPEG sem EXIF, lado maior 1600', u1.status() === 200 && /^banners\/[0-9a-f-]{36}\.jpg$/.test(j1u.caminho || '') && meta.format === 'jpeg' && !meta.exif && !baixado.includes(Buffer.from('TESTE-GPS-MARCA')) && meta.width === 1600, `${u1.status()} ${JSON.stringify({ f: meta.format, exif: !!meta.exif, w: meta.width })}`);
    const u2 = await up(png, 'b.png', 'image/png'); const j2u = await u2.json().catch(() => ({})); if (j2u.caminho) caminhosBanner.push(j2u.caminho);
    const u3 = await up(Buffer.from('MZ fake exe content here'), 'virus.jpg', 'image/jpeg'); const j3u = await u3.json().catch(() => ({}));
    const u4 = await up(Buffer.alloc(9 * 1024 * 1024, 1), 'grande.jpg', 'image/jpeg'); const j4u = await u4.json().catch(() => ({}));
    ok('A.4b PNG aceito (vira JPEG); texto com nome .jpg -> FOTO_TIPO; 9 MB -> FOTO_TAMANHO', u2.status() === 200 && /\.jpg$/.test(j2u.caminho || '') && u3.status() === 400 && j3u.codigo === 'FOTO_TIPO' && u4.status() === 400 && j4u.codigo === 'FOTO_TAMANHO', `${u2.status()} ${u3.status()}:${j3u.codigo} ${u4.status()}:${j4u.codigo}`);
    // A.5 imagem servida
    const cam = encodeURIComponent(j1u.caminho || '');
    const i1 = await A.api('GET', `/api/pecas/shop-imagem?c=${cam}`, undefined, S.ofT.token).catch(() => ({ status: 0 }));
    const i1r = await fetch(`${SITE}/api/pecas/shop-imagem?c=${cam}`, { redirect: 'manual', headers: { Authorization: `Bearer ${S.ofT.token}` } });
    const i2 = await fetch(`${SITE}/api/pecas/shop-imagem?c=${cam}`, { redirect: 'manual', headers: { Authorization: `Bearer ${S.ofR.token}` } });
    const i3 = await fetch(`${SITE}/api/pecas/shop-imagem?c=${cam}`, { redirect: 'manual' });
    const i4 = await fetch(`${SITE}/api/pecas/shop-imagem?c=${encodeURIComponent('../segredo.jpg')}`, { redirect: 'manual', headers: { Authorization: `Bearer ${S.ofT.token}` } });
    ok('A.5 imagem: oficina de teste 302 (URL assinada); oficina real 404; sem login 404; caminho invalido 404', i1r.status === 302 && /token=/.test(i1r.headers.get('location') || '') && i2.status === 404 && i3.status === 404 && i4.status === 404, `${i1r.status} ${i2.status} ${i3.status} ${i4.status} ${i1.status}`);
    const anonImg = await A.anon().storage.from('shop-pagina').download(j1u.caminho || 'x');
    ok('A.5b anon nao baixa do bucket privado pelo Storage', !anonImg.data, anonImg.error?.message);
    // A.6 restaurar
    const g = await (await rq(pa).get(`${SITE}/api/admin/shop-pagina`)).json();
    const antiga = (g.versoes || []).find((v) => v.estado === 'rascunho');
    const pubAntes2 = g.publicada?.id;
    const rs = await rq(pa).post(`${SITE}/api/admin/shop-pagina/restaurar`, { data: { versaoId: antiga?.id } });
    const g2 = await (await rq(pa).get(`${SITE}/api/admin/shop-pagina`)).json();
    ok('A.6 restaurar cria um RASCUNHO novo; a publicada continua a mesma; historico lista as versoes', rs.status() === 200 && g2.rascunho.estado === 'rascunho' && g2.publicada?.id === pubAntes2 && g2.versoes.length >= 3, `${rs.status()} ${g2.rascunho.estado}`);
    // A.7 tela do editor
    await ir(pa, '/admin/shop-pagina', 2500);
    ok('A.7a editor abre: estado do Shop (desligado), abas de idioma, previa', await visivel(pa.locator('[data-testid="sp-estado-shop"]')) && (await pa.locator('[data-testid="sp-estado-shop"]').innerText()).includes('DESLIGADO') && await visivel(pa.locator('[data-testid="sp-previa"]')));
    await pa.locator('[data-testid="sp-titulo"]').fill('Uus pealkiri eelvaates');
    await pa.waitForTimeout(500);
    ok('A.7b previa mostra o titulo digitado; situacao "nao salvas"', (await pa.locator('[data-testid="sp-previa"] [data-testid="shop-titulo"]').innerText()) === 'Uus pealkiri eelvaates' && (await pa.locator('[data-testid="sp-situacao"]').innerText()).includes('não salvas'));
    await pa.locator('[data-testid="sp-previa-1280"]').click();
    const w1280 = await pa.locator('[data-testid="sp-previa"]').evaluate((e) => e.getBoundingClientRect().width);
    await pa.locator('[data-testid="sp-previa-390"]').click();
    const w390 = await pa.locator('[data-testid="sp-previa"]').evaluate((e) => e.getBoundingClientRect().width);
    ok('A.7c previa 1280 e 390 de largura', Math.round(w1280) === 1280 && Math.round(w390) === 390, `${w1280} ${w390}`);
    await pa.locator('[data-testid="sp-idioma-ru"]').click();
    let txtRu = ''; for (let i = 0; i < 20 && !txtRu.includes(RU('pecasL5.pedir')); i++) { await pa.waitForTimeout(300); txtRu = await pa.locator('[data-testid="sp-previa"]').innerText(); }
    ok('A.7d aba ru: previa com os rotulos ru (botao Pedir em ru) e o titulo et pelo fallback', txtRu.includes(RU('pecasL5.pedir')) && txtRu.includes('Uus pealkiri eelvaates'), txtRu.slice(0, 200));
    await pa.locator('[data-testid="sp-idioma-et"]').click();
    await pa.locator('[data-testid="sp-publicar"]').click();
    await pa.waitForTimeout(2500);
    ok('A.7e publicar pelo botao (confirmacao aceita): mensagem e Shop com o titulo novo', (await pa.locator('[data-testid="sp-msg"]').innerText().catch(() => '')).includes('Publicado'));
    await ir(pt, '/ee/et/oficina/shop', 1500);
    ok('A.7f Shop mostra o titulo publicado pelo editor', (await pt.locator('[data-testid="shop-titulo"]').innerText()) === 'Uus pealkiri eelvaates');
    ok('A.7g auditoria da publicacao', Number(psql(`select count(*) from admin_auditoria where admin_id = '${adm.id}' and acao = 'publicar_shop_pagina'`)) >= 2);
    // A.8 /admin/pecas: interruptor e moderacao
    await ir(pa, '/admin/pecas', 3000);
    ok('A.8a bloco Shop em /admin/pecas (desligado)', await visivel(pa.locator('[data-testid="admin-shop-estado"]')) && (await pa.locator('[data-testid="admin-shop-estado"]').innerText()).includes('desligado'));
    const m1 = await rq(pa).patch(`${SITE}/api/admin/pecas-shop`, { data: { tipo: 'item', id: iOleo.id, oculto: true, motivo: 'teste moderacao' } });
    const m0 = await rq(pa).patch(`${SITE}/api/admin/pecas-shop`, { data: { tipo: 'item', id: iOleo.id, oculto: true } });
    ok('A.8b ocultar com motivo (auditoria); sem motivo 400', m1.status() === 200 && m0.status() === 400 && psql(`select oculto_motivo from pecas_catalogo where id = '${iOleo.id}'`) === 'teste moderacao' && Number(psql(`select count(*) from admin_auditoria where admin_id = '${adm.id}' and acao = 'ocultar' and entidade_id = '${iOleo.id}'`)) === 1);
    const t8 = await shopApi(S.ofT);
    ok('A.8c item oculto sai do Shop', !(t8.d.resultados || []).some((x) => x.id === iOleo.id));
    const naoAdm = await rq(po).patch(`${SITE}/api/admin/pecas-shop`, { data: { chave: 'shop', ativo: true } });
    ok('A.8d oficina nao liga o Shop (401/403)', [401, 403].includes(naoAdm.status()) && psql('select pecas_shop_ativo from plataforma_config where id = 1') === 'f', `${naoAdm.status()}`);
    // A.9 ligado de verdade
    const on = await rq(pa).patch(`${SITE}/api/admin/pecas-shop`, { data: { chave: 'shop', ativo: true } });
    const soShop = await shopApi(S.ofR);
    v3Interruptor(true);
    const comV3 = await shopApi(S.ofR);
    ok('A.9a Shop ligado sem v3: oficina real 404; com v3 tambem ligado: 200 (so lojas reais)', on.status() === 200 && soShop.status === 404 && comV3.status === 200 && (comV3.d.resultados || []).some((x) => x.id === iReal.id) && !(comV3.d.resultados || []).some((x) => x.id === iOf.id), `${on.status()} ${soShop.status} ${comV3.status}`);
    ok('A.9b auditoria do interruptor', Number(psql(`select count(*) from admin_auditoria where admin_id = '${adm.id}' and acao = 'pecas_shop_ativo'`)) === 1);
    const off = await rq(pa).patch(`${SITE}/api/admin/pecas-shop`, { data: { chave: 'shop', ativo: false } });
    v3Interruptor(false);
    const deNovo = await shopApi(S.ofR);
    ok('A.9c desligar: oficina real volta a 404', off.status() === 200 && deNovo.status === 404, `${deNovo.status}`);
    await ctxA.close(); await ctxO.close(); await ctxT.close();
  });

  ok('nenhum erro de pagina no navegador', erros.length === 0, erros.slice(0, 5).join(' | '));
} catch (e) {
  ok(`excecao: ${e.message}`, false, String(e.stack || '').slice(0, 400));
} finally {
  try { await nav?.fechar(); } catch { /* */ }
  parar();
  await restaurar();
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  ok('L limpeza: contas, lojas, cotacoes, versoes do editor e banners desta rodada apagados; interruptores de volta', errosLimpeza.length === 0 && sobras.length === 0 && psql("select coalesce(to_jsonb(c)->>'pecas_shop_ativo','') from plataforma_config c where id = 1") === shopAntes, `${errosLimpeza.join(' | ')} ${sobras.join(' | ')}`);
  try { fs.writeFileSync('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/pecas5/lote5-ultimo-log-site.txt', log.slice(-20000)); } catch { /* */ }
  fim();
}
