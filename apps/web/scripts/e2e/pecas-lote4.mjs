// E2E LOCAL do lote 4 de pecas ("loja visivel": perfil + pagina publica + lista), 18/11.
// Mapa: Documentos/Analises/Pecas_lote4_2026-11-18/Mapa_lote4.md (migracao 094).
//   B  banco: numero da loja (unico, nao muda pelo dono), colunas novas, interruptor proprio
//   P  interruptor DESLIGADO: loja de teste tem pagina (noindex), loja real 404, link curto, slug errado -> 308,
//      idiomas fora da Estonia 404, sem contato no HTML, hreflang so EE
//   R  avaliacoes na pagina: so com >= 3 visiveis; oculta fora; sem nome de quem avaliou; aggregateRating no JSON-LD
//   S  interruptor LIGADO (rota do admin, auditoria): loja real completa indexavel, incompleta noindex, sem
//      pagina_publica 404; renomear -> 308; sitemap (funcao, pelo jiti) so com as indexaveis; desligar -> 404
//   U  perfil da loja: secao so com a pagina liberada; salvar grava as colunas; lista do que falta; 390 px sem
//      transbordo na pagina publica
// Sobe o PROPRIO site em :3102 (PORTA_SITE troca; nunca :3100/:3101) com o build DESTA copia do app.
//   node pecas-lote4.mjs [<.env.local>]
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const PORTA_SITE = Number(process.env.PORTA_SITE || 3102);
if ([3100, 3101].includes(PORTA_SITE)) { console.log('FALHA porta reservada (3100 = servidor de teste do dono, 3101 = revisao do Fable)'); process.exit(2); }
process.env.SITE = `http://localhost:${PORTA_SITE}`;
const L = await import('./pecas-v3-lote3-lib.mjs');
const { lerEnv, ambienteL3, abrirNavegadores, contador, SITE, ENV_PADRAO, WEB, siteNoAr, vigiar, entrarPelaTela, ir, visivel, sleep, psql, DIA_MS } = L;

const env = lerEnv(process.argv[2] || ENV_PADRAO);
if (await siteNoAr()) { console.log(`FALHA ja ha um site em ${SITE} - pare-o antes (este teste sobe o seu)`); process.exit(2); }
const A = ambienteL3(env);
const { ok, fim, tentar } = contador();
const erros = [];

let log = '';
const site = spawn(process.execPath, [path.join(WEB, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORTA_SITE)], { cwd: WEB, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
site.stdout.on('data', (d) => { log += d; }); site.stderr.on('data', (d) => { log += d; });
const parar = () => { try { site.kill(); } catch { /* */ } };
let nav = null;
const pubAntes = psql("select coalesce(to_jsonb(c)->>'lojas_pagina_publica_ativo','') from plataforma_config c where id = 1");
const pubInterruptor = (v) => psql(`update plataforma_config set lojas_pagina_publica_ativo = ${v ? 'true' : 'false'} where id = 1 returning lojas_pagina_publica_ativo`);
process.on('SIGINT', async () => { try { await nav?.fechar(); } catch { /* */ } parar(); if (pubAntes) pubInterruptor(pubAntes === 'true'); await A.limpar(); process.exit(130); });

const get = async (caminho, extra = {}) => {
  try {
    const r = await fetch(`${SITE}${caminho}`, { redirect: 'manual', headers: { 'x-real-ip': A.ip(), ...extra } });
    return { status: r.status, location: r.headers.get('location') || '', html: await r.text() };
  } catch (e) { return { status: 0, location: '', html: String(e?.message || e) }; }
};
const robotsNoindex = (html) => /<meta name="robots" content="[^"]*noindex/.test(html);
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
const slug = (nome) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
const HORARIO = { seg: { aberto: true, inicio: '08:00', fim: '17:00' }, ter: { aberto: true, inicio: '08:00', fim: '17:00' }, sab: { aberto: false, inicio: '', fim: '' } };
const DESCR = 'Varuosad sõiduautodele: pidurid, vedrustus, filtrid ja õlid. Toome Tallinnas kohale samal päeval.';
const completar = async (loja, extra = {}) => {
  const { error } = await A.admin.from('lojas_pecas').update({ descricao: DESCR, categorias: ['freios', 'filtros_oleo'], marcas: ['VW', 'Škoda'], horario_funcionamento: HORARIO, entrega: true, pagina_publica: true, cnpj: 'REG-L4-998877', ...extra }).eq('id', loja.id);
  if (error) throw new Error(`completar loja: ${error.message}`);
  const { data } = await A.admin.from('lojas_pecas').select('numero, nome_fantasia').eq('id', loja.id).single();
  return { ...loja, numero: Number(data.numero), nome: data.nome_fantasia, seg: `${slug(data.nome_fantasia)}-${data.numero}` };
};

try {
  let no = false;
  for (let i = 0; i < 60 && !no; i++) { await sleep(1000); no = await siteNoAr(); }
  ok(`site no ar em ${SITE}`, no, log.slice(-300));
  if (!no) throw new Error('site nao subiu');
  pubInterruptor(false);

  const dT = await A.conta('loja_pecas', 'l4-loja-teste', { contaTeste: true, idioma: 'et', telefone: '+372 5555 1234' });
  const dR = await A.conta('loja_pecas', 'l4-loja-real', { contaTeste: false, idioma: 'et', telefone: '+372 5555 4321' });
  const dR2 = await A.conta('loja_pecas', 'l4-loja-sem-pagina', { contaTeste: false, idioma: 'ru' });
  const dR3 = await A.conta('loja_pecas', 'l4-loja-incompleta', { contaTeste: false, idioma: 'en' });
  const dC = await A.conta('oficina', 'l4-compradora', { contaTeste: true, idioma: 'et' }); const ofC = await A.oficina(dC, 'L4 Compradora Unica', { km: 0 });
  const adm = await A.conta('admin', 'l4-admin', { idioma: 'pt' });
  const T = await completar(await A.loja(dT, 'L4 Loja Teste'));
  const R = await completar(await A.loja(dR, 'L4 Loja Real'));
  const R2 = await completar(await A.loja(dR2, 'L4 Sem Pagina'), { pagina_publica: false });
  const R3 = await completar(await A.loja(dR3, 'L4 Incompleta'), { descricao: 'Curta', horario_funcionamento: null });
  const S = { adm: await A.sessao(adm), dT: await A.sessao(dT), dR: await A.sessao(dR) };

  // ======================= B: banco =======================
  await tentar('B', async () => {
    ok('B.1 numero preenchido, unico, >= 1001', [T, R, R2, R3].every((l) => l.numero >= 1001) && new Set([T, R, R2, R3].map((l) => l.numero)).size === 4, [T, R, R2, R3].map((l) => l.numero).join(','));
    const { error } = await S.dR.c.from('lojas_pecas').update({ numero: 1 }).eq('id', R.id);
    const depois = Number(psql(`select numero from lojas_pecas where id = '${R.id}'`));
    ok('B.2 dono tenta trocar o numero pela API: continua o mesmo', depois === R.numero, `${error?.message || ''} numero=${depois}`);
    const { error: eD } = await S.dR.c.from('lojas_pecas').update({ descricao: 'x'.repeat(601) }).eq('id', R.id);
    ok('B.3 descricao > 600 recusada pelo banco', !!eD, eD?.message);
    ok('B.4 interruptor proprio existe e esta desligado', psql("select lojas_pagina_publica_ativo from plataforma_config where id = 1") === 'f');
  });

  // ======================= P: desligado =======================
  await tentar('P', async () => {
    const p1 = await get(`/ee/et/varuosad/${T.seg}`);
    ok('P.1 loja de TESTE: 200, nome, noindex, data-indexavel=0', p1.status === 200 && p1.html.includes(T.nome) && robotsNoindex(p1.html) && p1.html.includes('data-indexavel="0"'), `${p1.status}`);
    ok('P.2 sem telefone, e-mail nem registro no HTML', !p1.html.includes('5555 1234') && !p1.html.includes(dT.email) && !p1.html.includes('REG-L4-998877'), JSON.stringify({ tel: p1.html.includes('5555 1234'), email: p1.html.includes(dT.email), reg: p1.html.includes('REG-L4-998877') }));
    const pecas3 = { d: p1.html.includes('Toome Tallinnas'), c1: /<li[^>]*>Pidurid<\/li>/.test(p1.html), c2: /<li[^>]*>Filtrid ja õlid<\/li>/.test(p1.html), m: p1.html.includes('VW, Škoda'), e: /data-testid="loja-publica-entrega"[^>]*>🚚 (<!-- -->)?Toob kohale/.test(p1.html), h: p1.html.includes('08:00–17:00'), n: p1.html.includes('Narva') };
    ok('P.3 descricao, categorias (et), marcas, entrega, horario e endereco aparecem', Object.values(pecas3).every(Boolean), JSON.stringify(pecas3) + ' ' + (p1.html.match(/data-testid="loja-publica-entrega"[^<]*</) || [''])[0]);
    const p2 = await get(`/ee/et/varuosad/${R.seg}`);
    ok('P.4 loja REAL com o interruptor desligado: 404', p2.status === 404, `${p2.status}`);
    const p3 = await get(`/ee/et/varuosad/nome-velho-${T.numero}`);
    ok('P.5 nome errado com o numero certo: 308 para o endereco atual', p3.status === 308 && p3.location.endsWith(`/ee/et/varuosad/${T.seg}`), `${p3.status} ${p3.location}`);
    const p4 = await get(`/it/it/ricambi/${T.seg}`); const p4b = await get(`/br/pt/pecas/${T.seg}`);
    ok('P.6 idiomas fora da Estonia (it, pt): 404', p4.status === 404 && p4b.status === 404, `${p4.status} ${p4b.status}`);
    const p5 = await get(`/p/${T.numero}`, { 'accept-language': 'ru-RU,ru;q=0.9' });
    ok('P.7 link curto /p/<numero> (navegador ru): 307 para /ee/ru/zapchasti/<slug>', p5.status === 307 && p5.location.endsWith(`/ee/ru/zapchasti/${T.seg}`), `${p5.status} ${p5.location}`);
    const p6 = await get(`/p/${R.numero}`);
    ok('P.8 link curto de loja real (desligado): 302 para o inicio', p6.status === 302 && !p6.location.includes('varuosad'), `${p6.status} ${p6.location}`);
    const alt = (p1.html.match(/<link[^>]*rel="alternate"[^>]*>/gi) || []).map((l) => (l.match(/hreflang="([^"]+)"/i) || [])[1]).filter(Boolean).sort();
    ok('P.9 hreflang (link alternate) so et-EE/et/ru-EE/en-EE + x-default (sem it/pt)', JSON.stringify(alt) === JSON.stringify(['en-EE', 'et', 'et-EE', 'ru-EE', 'x-default']), alt.join(','));
    const ld = jsonLd(p1.html);
    const loja = ld.find((x) => x['@type'] === 'AutoPartsStore');
    ok('P.10 JSON-LD AutoPartsStore (horario real, geo, sem telefone) + BreadcrumbList', !!loja && loja.openingHoursSpecification?.length === 2 && !!loja.geo && !loja.telephone && ld.some((x) => x['@type'] === 'BreadcrumbList'), JSON.stringify(loja || {}).slice(0, 200));
    const p7 = await get('/ee/en/parts');
    ok('P.11 lista /ee/en/parts: 200, so a loja de teste (sem as reais), noindex', p7.status === 200 && p7.html.includes(T.nome) && !p7.html.includes(R.nome) && !p7.html.includes(R2.nome) && robotsNoindex(p7.html), `${p7.status}`);
    const p8 = await get('/it/it/ricambi');
    ok('P.12 lista no idioma it: 404', p8.status === 404, `${p8.status}`);
  });

  // ======================= R: avaliacoes =======================
  await tentar('R', async () => {
    const entregue = { entregue_em: new Date(Date.now() - DIA_MS).toISOString(), recebido_em: new Date().toISOString() };
    const ped = async (i) => A.pedidoV3(ofC, T, { status: 'entregue', descricao: `L4 aval ${i}`, campos: entregue });
    await A.avaliacaoSemente(await ped(1), ofC, dC, T, { nota: 5, no_prazo: true, comentario: 'Kiire ja korrektne' });
    await A.avaliacaoSemente(await ped(2), ofC, dC, T, { nota: 4, no_prazo: false, comentario: 'Hilines veidi' });
    const r1 = await get(`/ee/et/varuosad/${T.seg}`);
    ok('R.1 com 2 avaliacoes visiveis: sem bloco de avaliacoes e sem aggregateRating', r1.status === 200 && !r1.html.includes('data-testid="loja-publica-avaliacoes"') && !r1.html.includes('Kiire ja korrektne') && !jsonLd(r1.html).some((x) => x.aggregateRating));
    const p3 = await ped(3);
    const av3 = await A.avaliacaoSemente(p3, ofC, dC, T, { nota: 3, no_prazo: true, comentario: 'Keskmine tase L4', extra: { resposta: 'Aitäh tagasiside eest' } });
    await A.avaliacaoSemente(await ped(4), ofC, dC, T, { nota: 1, comentario: 'Peidetud kommentaar', extra: { oculta: true, oculta_motivo: 'teste' } });
    const r2 = await get(`/ee/et/varuosad/${T.seg}`);
    const n = (r2.html.match(/data-testid="loja-publica-avaliacao"/g) || []).length;
    ok('R.2 com 3 visiveis (+1 oculta): bloco com 3 avaliacoes, media 4,0, "3 hinnangut", 67% no prazo', n === 3 && r2.html.includes('4,0 / 5') && r2.html.includes('3 hinnangut') && r2.html.includes('67% õigeaegselt'), `n=${n}`);
    ok('R.3 oculta nao aparece; resposta da loja aparece', !r2.html.includes('Peidetud kommentaar') && r2.html.includes('Aitäh tagasiside eest') && r2.html.includes('Poe vastus'));
    ok('R.4 nome da oficina que avaliou NAO aparece na pagina publica', !r2.html.includes(ofC.nome));
    const agg = jsonLd(r2.html).find((x) => x.aggregateRating)?.aggregateRating;
    ok('R.5 JSON-LD aggregateRating 4.0 / 3, sem review individual', agg?.ratingValue === '4.0' && agg?.ratingCount === 3 && !jsonLd(r2.html).some((x) => x.review), JSON.stringify(agg));
    const { error: eOc } = await A.admin.from('fornecedores_avaliacoes').update({ oculta: true, oculta_motivo: 'teste' }).eq('id', av3);
    const r3 = await get(`/ee/et/varuosad/${T.seg}`);
    ok('R.6 ocultar uma (fica 2 visiveis): bloco some de novo', !r3.html.includes('data-testid="loja-publica-avaliacoes"') && !r3.html.includes('Keskmine tase L4'), JSON.stringify({ eOc: eOc?.message, av3, visiveis: psql(`select count(*) from fornecedores_avaliacoes where fornecedor_id = '${T.id}' and not oculta`), bloco: r3.html.includes('data-testid="loja-publica-avaliacoes"'), kesk: r3.html.includes('Keskmine tase L4') }));
    const r4 = await get(`/ee/ru/zapchasti/${T.seg}`);
    ok('R.7 ru: categorias em russo, titulo com "запчасти"', r4.status === 200 && /<li[^>]*>Тормоза<\/li>/.test(r4.html) && /<title>[^<]*запчасти/.test(r4.html), `${r4.status}`);
  });

  // ======================= S: ligado =======================
  await tentar('S', async () => {
    const v3Antes = psql("select pecas_v3_ativo from plataforma_config where id = 1");
    const n0 = await A.api('PATCH', '/api/admin/lojas-pagina-publica', { ativo: true }, S.dR.token);
    ok('S.1 nao-admin nao liga (401/403)', [401, 403].includes(n0.status), `${n0.status}`);
    const s1 = await A.api('PATCH', '/api/admin/lojas-pagina-publica', { ativo: true }, S.adm.token);
    const aud = psql(`select count(*) from admin_auditoria where admin_id = '${adm.id}' and acao = 'lojas_pagina_publica_ativo'`);
    ok('S.2 admin liga: 200, gravado, auditoria', s1.status === 200 && s1.d?.ativo === true && psql("select lojas_pagina_publica_ativo from plataforma_config where id = 1") === 't' && aud === '1', JSON.stringify(s1));
    ok('S.3 pecas_v3_ativo NAO mudou junto', psql("select pecas_v3_ativo from plataforma_config where id = 1") === v3Antes, v3Antes);
    const r = await get(`/ee/et/varuosad/${R.seg}`);
    ok('S.4 loja real completa: 200, indexavel (sem noindex), data-indexavel=1', r.status === 200 && !robotsNoindex(r.html) && r.html.includes('data-indexavel="1"'), `${r.status}`);
    const r3 = await get(`/ee/en/parts/${R3.seg}`);
    ok('S.5 loja real incompleta: 200 com noindex', r3.status === 200 && robotsNoindex(r3.html), `${r3.status}`);
    const r2 = await get(`/ee/et/varuosad/${R2.seg}`);
    ok('S.6 loja sem pagina_publica: 404', r2.status === 404, `${r2.status}`);
    const lista = await get('/ee/et/varuosad');
    ok('S.7 lista: real completa e incompleta aparecem, sem pagina nao; lista indexavel', lista.html.includes(R.nome) && lista.html.includes(R3.nome) && !lista.html.includes(R2.nome) && !robotsNoindex(lista.html));
    const curto = await get(`/p/${R.numero}`, { 'accept-language': 'et-EE,et;q=0.9,en;q=0.5' });
    ok('S.8 link curto da loja real (et): 307 para /ee/et/varuosad/<slug>', curto.status === 307 && curto.location.endsWith(`/ee/et/varuosad/${R.seg}`), curto.location);
    // sitemap (funcao pelo jiti: o /sitemap.xml do servidor fica em cache por 10 min)
    try {
      const req = createRequire(import.meta.url);
      const criarJiti = req('jiti');
      const Modulo = req('node:module');
      const orig = Modulo._resolveFilename;
      Modulo._resolveFilename = function (r, ...resto) { return orig.call(this, r.startsWith('@/') ? path.join(WEB, 'src', r.slice(2)) : r, ...resto); };
      Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY });
      const jiti = criarJiti(path.join(WEB, 'scripts/e2e/x.js'), { alias: { '@': path.join(WEB, 'src'), 'next-intl/routing': path.join(WEB, 'node_modules/next-intl/dist/esm/production/routing.js') }, requireCache: false, interopDefault: true });
      const sm = await jiti(path.join(WEB, 'src/app/sitemap.ts'))();
      const urls = sm.map((e) => e.url);
      ok('S.9 sitemap: loja real completa nos 3 idiomas EE + lista; sem a de teste, a incompleta e a sem pagina',
        ['et/varuosad', 'ru/zapchasti', 'en/parts'].every((p) => urls.includes(`https://bipfix.com/ee/${p}/${R.seg}`)) && urls.includes('https://bipfix.com/ee/et/varuosad') && !urls.some((u) => u.includes(T.seg) || u.includes(R3.seg) || u.includes(R2.seg)),
        urls.filter((u) => /varuosad|parts|zapchasti/.test(u)).join(' '));
    } catch (e) { ok('S.9 sitemap (funcao)', false, e?.stack || e?.message); }
    // renomear: o endereco antigo leva ao novo
    await A.admin.from('lojas_pecas').update({ nome_fantasia: `${R.nome} Uus` }).eq('id', R.id);
    const novoSeg = `${slug(`${R.nome} Uus`)}-${R.numero}`;
    const ren = await get(`/ee/et/varuosad/${R.seg}`);
    ok('S.10 loja renomeada: endereco antigo -> 308 para o novo', ren.status === 308 && ren.location.endsWith(`/ee/et/varuosad/${novoSeg}`), `${ren.status} ${ren.location}`);
    const s2 = await A.api('PATCH', '/api/admin/lojas-pagina-publica', { ativo: false }, S.adm.token);
    const off = await get(`/ee/et/varuosad/${novoSeg}`);
    ok('S.11 admin desliga: loja real volta a 404 na hora', s2.d?.ativo === false && off.status === 404, `${off.status}`);
  });

  // ======================= U: perfil =======================
  nav = await abrirNavegadores(false);
  await tentar('U', async () => {
    const e0 = await A.api('GET', '/api/loja/pagina-publica', undefined, null);
    const e1 = await A.api('GET', '/api/loja/pagina-publica?l=ru', undefined, S.dT.token);
    ok('U.1 API: sem login 401; loja de teste: liberada, existe, teste, url ru', e0.status === 401 && e1.d?.liberada === true && e1.d?.existe === true && e1.d?.teste === true && e1.d?.url === `/ee/ru/zapchasti/${T.seg}`, JSON.stringify(e1.d));
    const e2 = await A.api('GET', '/api/loja/pagina-publica', undefined, S.dR.token);
    ok('U.2 API: loja real com o interruptor desligado: nao liberada', e2.status === 200 && e2.d?.liberada === false && e2.d?.existe === false, JSON.stringify(e2.d));

    // loja de teste: muda a pagina pela tela
    await A.admin.from('lojas_pecas').update({ descricao: null, categorias: [], marcas: [], horario_funcionamento: null, entrega: false, pagina_publica: false }).eq('id', T.id);
    const ctx = await nav.contexto('chromium', 390, A.ip); const p = await ctx.newPage(); vigiar(p, erros, 'U loja teste');
    await entrarPelaTela(p, '/ee/et', dT);
    await ir(p, '/ee/et/loja/perfil', 3000);
    ok('U.3 loja de teste: secao "Avalik leht" visivel, pagina desligada', await visivel(p.getByTestId('loja-pagina-publica')) && (await p.getByTestId('loja-pagina-publica-estado').innerText()).includes('Leht on peidetud'));
    await p.getByTestId('loja-pagina-publica-mostrar').check();
    const falta = await p.locator('[data-testid="loja-pagina-publica-falta"] li').evaluateAll((els) => els.map((e) => e.getAttribute('data-falta')));
    ok('U.4 ligada sem dados: lista o que falta (descricao, categorias, horario)', ['descricao', 'categorias', 'horario'].every((f) => falta.includes(f)) && !falta.includes('endereco'), falta.join(','));
    await p.getByTestId('loja-pagina-publica-descricao').fill(DESCR);
    await p.locator('[data-categoria="freios"]').locator('xpath=..').click();
    await p.locator('[data-dia="seg"]').check();
    await p.getByTestId('loja-pagina-publica-marcas').fill('Audi, audi, BMW');
    await p.getByTestId('loja-pagina-publica-entrega').check();
    ok('U.5 tudo preenchido: "Leht on täielik"', await visivel(p.getByTestId('loja-pagina-publica-pronta')));
    await p.getByTestId('loja-pagina-publica-salvar').click();
    let linha = null;
    for (let i = 0; i < 30; i++) { await sleep(300); linha = (await A.admin.from('lojas_pecas').select('pagina_publica, descricao, categorias, marcas, entrega, horario_funcionamento').eq('id', T.id).single()).data; if (linha?.pagina_publica) break; }
    ok('U.6 salvar grava: pagina_publica, descricao, categorias, marcas sem repetida, entrega, horario de segunda', linha?.pagina_publica === true && linha.descricao === DESCR && JSON.stringify(linha.categorias) === '["freios"]' && JSON.stringify(linha.marcas) === '["Audi","BMW"]' && linha.entrega === true && linha.horario_funcionamento?.seg?.aberto === true, JSON.stringify(linha));
    await visivel(p.getByTestId('loja-pagina-publica-link'));
    ok('U.7 link "Vaata minu lehte" para a pagina et', (await p.getByTestId('loja-pagina-publica-link').getAttribute('href').catch(() => '')) === `/ee/et/varuosad/${T.seg}`);
    ok('U.8 aviso de conta de teste (nunca vai ao Google)', await visivel(p.getByTestId('loja-pagina-publica-teste')));
    await ir(p, `/ee/et/varuosad/${T.seg}`, 1500);
    const larg = await p.evaluate(() => document.documentElement.scrollWidth);
    ok('U.9 pagina publica em 390 px: sem transbordo horizontal, nome visivel', larg <= 390 && await visivel(p.getByTestId('loja-publica-nome')), `scrollWidth=${larg}`);
    await ctx.close();

    const ctx2 = await nav.contexto('chromium', 390, A.ip); const p2 = await ctx2.newPage(); vigiar(p2, erros, 'U loja real');
    await entrarPelaTela(p2, '/ee/et', dR);
    await ir(p2, '/ee/et/loja/perfil', 3000);
    ok('U.10 loja REAL (pecas v3 e pagina desligadas): sem a secao nova', (await p2.getByTestId('loja-pagina-publica').count()) === 0);
    await ctx2.close();
  });

  ok('nenhum erro de pagina', erros.length === 0, erros.join(' | '));
  ok('sem erro de servidor no log', !/Error:|TypeError|Unhandled/.test(log), log.split('\n').filter((l) => /Error:|TypeError|Unhandled/.test(l)).slice(0, 5).join(' | '));
} catch (e) {
  ok('excecao geral', false, e?.stack || e?.message);
} finally {
  try { await nav?.fechar(); } catch { /* */ }
  parar();
  if (pubAntes) pubInterruptor(pubAntes === 'true');
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  ok('limpeza: nada desta rodada ficou no banco; interruptor da pagina como estava', errosLimpeza.length === 0 && sobras.length === 0 && psql("select coalesce(to_jsonb(c)->>'lojas_pagina_publica_ativo','') from plataforma_config c where id = 1") === pubAntes, [...errosLimpeza, ...sobras].join(' | '));
  process.exitCode = fim() ? 1 : 0;
}
