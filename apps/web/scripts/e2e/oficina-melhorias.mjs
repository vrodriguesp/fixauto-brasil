// E2E LOCAL: pedido do dono 15/11 (Documentos/Analises/Oficina_melhorias_aprender_guias_2026-11-15.md) - migracao 084.
//  V aviso "Novidades" no sino: funcao da 084 cria 1 por dono/admin, de novo = 0; a migracao inteira roda de novo
//    sem duplicar (docker psql); textos nas 6 linguas; sem push (avisar_push pula 'novidades')
//  L Aprender: tema "Check-ini ajad ja kehtivus" (selo Uus, 7 passos, ?tema=), guias PDF (HTTP 200, application/pdf)
//    e video por idioma (idioma da tela primeiro; EN sem arquivo proprio mostra "outra lingua")
//  N cartao "Novidades" em Pedidos: 1 so, sem o convite da recepcao junto; sino com o aviso 1 vez -> Melhorias;
//    "o horario serve" dentro do cartao; fechar fica no banco (recarregar / outro aparelho = some); depois de
//    fechado volta so o convite antigo (nunca dois); oficina sem o aviso = so o convite
//  M Melhorias (360 px): menu, pesquisa salva/edita/recarrega (1 linha por oficina), sugestoes (lista, curta = erro)
//  R RLS: outra oficina, mecanico, anonimo nao leem/gravam; funcionario admin sim; admin da plataforma le tudo;
//    autor/respondido_por do banco; avisos_dispensados so os proprios; funcao do aviso so service role
//  A /admin/melhorias lista respostas e sugestoes
//  S prints 360 px ET e RU (resultados/oficina-melhorias/)
//   node oficina-melhorias.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(SITE)) throw new Error('SITE nao e local');
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MIGRACAO = path.resolve(AQUI, '../../../../supabase/migrations/084_oficina_melhorias.sql');
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/oficina-melhorias';
fs.mkdirSync(OUT, { recursive: true });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const MSG = path.resolve(AQUI, '../../messages');
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8'))));
const tr = (l) => { const m = msgs(l); const f = (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? `{${x}}`); f.raw = (k) => k.split('.').reduce((o, p) => o?.[p], m); return f; };
const ET = tr('et'), RU = tr('ru');
let falhas = 0, oks = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; else oks++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 300) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const oficinas = [];
const CHAVE = 'oficina-2026-11';
const HORARIO = Object.fromEntries(['seg', 'ter', 'qua', 'qui', 'sex'].map((d) => [d, { aberto: true, inicio: '08:00', fim: '18:00' }]).concat([['sab', { aberto: false, inicio: '', fim: '' }], ['dom', { aberto: false, inicio: '', fim: '' }]]));

const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
const browser = await chromium.launch({ executablePath: exe });
const contexto = async (largura = 360) => {
  const movel = largura < 700;
  const c = await browser.newContext({ viewport: { width: largura, height: movel ? 780 : 900 }, deviceScaleFactor: movel ? 2 : 1, isMobile: movel, hasTouch: movel });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const entrar = async (p, u, pre = '/ee/et') => {
  await p.goto(`${SITE}${pre}/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]');
  await p.waitForURL((x) => !x.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {});
  await sleep(1500);
};
const conta = async (tipo, nome, idioma = 'et') => {
  const email = `mel-${tipo}${contas.length}-${tag}@example.test`; const senha = `Mel${tag}Senha9`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.push(data.user.id);
  const { error: e2 } = await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone: '+372 5000 0000' });
  if (e2) throw new Error(e2.message);
  return { id: data.user.id, email, senha };
};
const novaOficina = async (dono, nome) => {
  const { data, error } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: nome, endereco: 'Kesktee 1', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: 59.437, longitude: 24.75, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica'], seguradoras_convencionadas: [], horario_funcionamento: HORARIO }).select('id').single();
  if (error) throw new Error(error.message);
  oficinas.push(data.id);
  return data.id;
};
const logado = async (u) => { const c = anon(); const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.senha }); if (error) throw new Error(error.message); return c; };
const semRolagem = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const visivel = (p, id) => p.getByTestId(id).isVisible().catch(() => false);
const conta2 = (p, id) => p.getByTestId(id).count();
const psql = (sql) => execSync(`docker exec -i supabase_db_bipfix-teste psql -U postgres -v ON_ERROR_STOP=1 -tA`, { input: sql }).toString();
// alvos de toque: cada elemento interativo visivel >= 44 px de altura (e de largura, exceto texto em linha)
const alvosPequenos = (p, seletor) => p.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => {
  const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5;
}).map((e) => `${e.tagName}:${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30)}:${Math.round(e.getBoundingClientRect().height)}`), seletor);
// nada cortado: nenhum elemento do bloco passa da largura da tela
const cortados = (p, seletor) => p.evaluate((sel) => {
  const w = window.innerWidth; const r = [];
  document.querySelectorAll(`${sel} *`).forEach((e) => { const b = e.getBoundingClientRect(); if (b.width > 0 && (b.right > w + 1 || b.left < -1)) r.push(`${e.tagName}.${String(e.className).slice(0, 30)}`); });
  return r;
}, seletor);

try {
  // ---------- contas ----------
  const donoA = await conta('oficina', 'Dono A', 'et');
  const donoB = await conta('oficina', 'Dono B', 'ru');
  const mec = await conta('oficina', 'Mehaanik A', 'et');
  const ger = await conta('oficina', 'Juhataja A', 'et');
  const adm = await conta('admin', 'Admin', 'et');
  const ofA = await novaOficina(donoA, `MELHORIAS A ${tag}`);
  const ofB = await novaOficina(donoB, `MELHORIAS B ${tag}`);
  await sb.from('funcionarios').insert({ oficina_id: ofA, profile_id: mec.id, nome: 'Mehaanik A', cargo: 'mecanico', ativo: true });
  await sb.from('funcionarios').insert({ oficina_id: ofA, profile_id: ger.id, nome: 'Juhataja A', cargo: 'admin', ativo: true });

  // ---------- V: aviso "Novidades" ----------
  const { data: n1, error: eN1 } = await sb.rpc('avisar_novidades_oficinas_2026_11');
  ok('V funcao da 084 cria os avisos (dono A, dono B, funcionario admin A)', !eN1 && n1 >= 3, eN1?.message || n1);
  const { data: n2 } = await sb.rpc('avisar_novidades_oficinas_2026_11');
  ok('V rodar de novo = 0 avisos novos', n2 === 0, n2);
  let migOk = true; try { psql(fs.readFileSync(MIGRACAO, 'utf8')); } catch (e) { migOk = false; console.log(String(e.stderr || e).slice(0, 400)); }
  ok('V migracao 084 inteira roda de novo sem erro', migOk);
  const avisos = async (pid) => (await sb.from('notificacoes').select('id, titulo, mensagem, dados, lida').eq('profile_id', pid).eq('tipo', 'novidades')).data || [];
  const avA = await avisos(donoA.id), avB = await avisos(donoB.id), avG = await avisos(ger.id), avM = await avisos(mec.id), avAdm = await avisos(adm.id);
  ok('V dono A tem 1 aviso so (depois de 2 chamadas + migracao de novo)', avA.length === 1, avA.length);
  ok('V dono B e funcionario admin: 1 cada; mecanico e admin da plataforma: 0', avB.length === 1 && avG.length === 1 && avM.length === 0 && avAdm.length === 0, `${avB.length}/${avG.length}/${avM.length}/${avAdm.length}`);
  ok('V titulo na lingua da conta (et / ru)', avA[0]?.titulo === 'Uut BipFixis' && avB[0]?.titulo === 'Новое в BipFix', `${avA[0]?.titulo} / ${avB[0]?.titulo}`);
  ok('V dados: chave, link Melhorias, textos nas 6 linguas', avA[0]?.dados?.chave === CHAVE && avA[0]?.dados?.link === '/oficina/melhorias'
    && ['pt', 'pt-PT', 'en', 'et', 'ru', 'it'].every((l) => avA[0]?.dados?.textos?.[l]?.titulo && avA[0]?.dados?.textos?.[l]?.mensagem), JSON.stringify(avA[0]?.dados).slice(0, 200));
  const corpoPush = psql("select pg_get_functiondef('avisar_push'::regproc)");
  ok("V avisar_push pula o tipo 'novidades' (sem push no celular)", /NEW\.tipo = 'novidades' THEN RETURN NEW/.test(corpoPush));
  const sem = anon(); await sem.auth.signInWithPassword({ email: donoB.email, password: donoB.senha });
  const { error: eRpc } = await sem.rpc('avisar_novidades_oficinas_2026_11');
  ok('R a funcao do aviso NAO roda pelo navegador (so service role)', !!eRpc, eRpc?.message);

  // oficina criada DEPOIS do deploy: sem aviso -> sem cartao (so o convite)
  const donoC = await conta('oficina', 'Dono C', 'et');
  await novaOficina(donoC, `MELHORIAS C ${tag}`);

  // ---------- L: Aprender ----------
  {
    const c = await contexto(360); const p = await c.newPage();
    await entrar(p, donoA);
    await p.goto(`${SITE}/ee/et/oficina/aprender`, { waitUntil: 'networkidle' }); await sleep(800);
    const botao = p.getByTestId('tema-horarios-checkin');
    ok('L tema novo no Aprender, com o selo "Uus"', await botao.isVisible() && (await botao.innerText()).toLowerCase().includes(ET('tutorialHub.novo').toLowerCase()), await botao.innerText().catch(() => ''));
    await botao.click(); await sleep(300);
    const h2 = await p.locator('h2').filter({ hasText: ET('oficinaAprender.geral.horariosCheckin.titulo') }).count();
    const passos = ET.raw('oficinaAprender.geral.horariosCheckin.passosGuiados');
    const txt = await p.locator('body').innerText();
    ok('L titulo + 7 passos do check-in v2 na tela', h2 === 1 && passos.length === 7 && passos.every((s) => txt.includes(s)), `${h2} ${passos.length}`);
    ok('L passos falam do calendario, "Muu aeg", kehtivus 7 paeva, alerta < 2 h e "Klient kusib uusi aegu"',
      /Muu aeg/.test(txt) && /7 päeva/.test(txt) && /2 tunni/.test(txt) && txt.includes(ET('oficinaNovasDatas.selo')) && txt.includes(ET('seletorCheckin.adicionar')));
    ok('L 360 px: sem rolagem lateral no Aprender', await semRolagem(p));
    await p.goto(`${SITE}/ee/et/oficina/aprender?tema=horarios-checkin`, { waitUntil: 'networkidle' }); await sleep(800);
    ok('L ?tema=horarios-checkin abre o tema direto', (await p.getByTestId('tema-horarios-checkin').getAttribute('aria-pressed')) === 'true');
    // guias
    const links = await p.locator('[data-testid^="guia-"]').evaluateAll((as) => as.map((a) => ({ id: a.dataset.testid, href: a.getAttribute('href'), alvo: a.getAttribute('target') })));
    ok('L guias: PDF ET primeiro, depois RU (tela em ET)', links.map((l) => l.id).join(',') === 'guia-perfil-oficina-et,guia-perfil-oficina-ru', JSON.stringify(links));
    for (const l of links) {
      const r = await fetch(`${SITE}${l.href}`);
      const buf = Buffer.from(await r.arrayBuffer());
      ok(`L ${l.href} responde 200 application/pdf (${Math.round(buf.length / 1024)} KB, comeca com %PDF)`, r.status === 200 && /application\/pdf/.test(r.headers.get('content-type') || '') && buf.length > 100e3 && buf.subarray(0, 4).toString() === '%PDF', `${r.status} ${r.headers.get('content-type')}`);
      ok(`L ${l.id} abre em outra aba`, l.alvo === '_blank');
    }
    const r404 = await fetch(`${SITE}/guias/perfil-oficina-en.pdf`);
    ok('L idioma sem arquivo nao e oferecido (EN = 404 e sem botao)', r404.status === 404 && !links.some((l) => l.id.endsWith('-en')));
    const vids = await p.locator('[data-testid^="video-guia-"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    ok('L video: ET e RU com os links atuais (constante unica)', vids.join(' ') === 'https://youtu.be/WpW58JVM8ic https://youtu.be/e0OpFjdtNsc', vids.join(' '));
    ok('L guias: botoes >= 44 px e nada cortado a 360 px', (await alvosPequenos(p, '[data-testid=guias-oficina] a')).length === 0 && (await cortados(p, '[data-testid=guias-oficina]')).length === 0,
      JSON.stringify([await alvosPequenos(p, '[data-testid=guias-oficina] a'), await cortados(p, '[data-testid=guias-oficina]')]));
    await p.getByTestId('guias-oficina').scrollIntoViewIfNeeded();
    await p.getByTestId('guias-oficina').screenshot({ path: `${OUT}/L_guias_et_360.png` });
    await p.screenshot({ path: `${OUT}/L_aprender_tema_et_360.png`, fullPage: true });
    // RU: RU primeiro; EN: aviso "ainda nao na sua lingua"
    await p.goto(`${SITE}/ee/ru/oficina/aprender?tema=horarios-checkin`, { waitUntil: 'networkidle' }); await sleep(800);
    const ordemRu = await p.locator('[data-testid^="guia-"]').evaluateAll((as) => as.map((a) => a.dataset.testid));
    const txtRu = await p.locator('body').innerText();
    ok('L RU: PDF RU primeiro + tema em russo', ordemRu[0] === 'guia-perfil-oficina-ru' && txtRu.includes(RU('oficinaAprender.geral.horariosCheckin.titulo')) && txtRu.includes(RU('oficinaAprender.guias.titulo')), ordemRu.join(','));
    ok('L RU 360 px: sem rolagem lateral', await semRolagem(p));
    await p.screenshot({ path: `${OUT}/L_aprender_tema_ru_360.png`, fullPage: true });
    await p.goto(`${SITE}/ee/en/oficina/aprender`, { waitUntil: 'networkidle' }); await sleep(800);
    ok('L EN: "not yet in your language" + ET/RU oferecidos', (await p.locator('body').innerText()).includes(tr('en')('oficinaAprender.guias.outraLingua')) && (await p.locator('[data-testid^="guia-"]').count()) === 2);
    await c.close();
  }

  // ---------- N: cartao Novidades + sino ----------
  {
    const c = await contexto(360); const p = await c.newPage();
    await entrar(p, donoA);
    await p.goto(`${SITE}/ee/et/oficina/pedidos`, { waitUntil: 'networkidle' }); await sleep(1500);
    ok('N Pedidos: cartao Novidades aparece 1 vez', (await conta2(p, 'novidades-oficina')) === 1 && await visivel(p, 'novidades-oficina'));
    ok('N convite da recepcao NAO aparece junto (um cartao so)', (await conta2(p, 'convite-recepcao')) === 0);
    const tc = await p.getByTestId('novidades-oficina').innerText();
    ok('N cartao: recepcao + almoco, Melhorias e "como funciona"', tc.includes(ET('novidadesOficina.recepcaoTitulo')) && tc.includes(ET('novidadesOficina.melhoriasTitulo'))
      && tc.includes(ET('conviteRecepcao.preencher')) && tc.includes(ET('conviteRecepcao.serve')) && tc.includes(ET('novidadesOficina.comoFunciona')), tc);
    ok('N links: perfil#recepcao, Melhorias, Aprender?tema', (await p.getByTestId('novidades-perfil').getAttribute('href'))?.endsWith('/oficina/perfil#recepcao')
      && (await p.getByTestId('novidades-melhorias').getAttribute('href'))?.endsWith('/oficina/melhorias')
      && (await p.getByTestId('novidades-aprender').getAttribute('href'))?.endsWith('/oficina/aprender?tema=horarios-checkin'));
    const peq = await alvosPequenos(p, '[data-testid=novidades-oficina] a, [data-testid=novidades-oficina] button');
    ok('N 360 px: alvos do cartao >= 44 px, nada cortado, sem rolagem lateral', peq.length === 0 && (await cortados(p, '[data-testid=novidades-oficina]')).length === 0 && await semRolagem(p), JSON.stringify(peq));
    await p.getByTestId('novidades-oficina').screenshot({ path: `${OUT}/N_cartao_et_360.png` });
    await p.screenshot({ path: `${OUT}/N_pedidos_et_360.png` });
    // sino: aviso 1 vez, leva a Melhorias
    await p.getByRole('button', { name: ET('notificationBell.ariaLabel') }).first().click(); await sleep(800);
    const noSino = await p.getByText('Uut BipFixis', { exact: true }).count();
    ok('N sino: aviso "Uut BipFixis" aparece 1 vez', noSino === 1, noSino);
    await p.screenshot({ path: `${OUT}/N_sino_et_360.png` });
    await p.getByText('Uut BipFixis', { exact: true }).first().click();
    await p.waitForURL(/\/oficina\/melhorias/, { timeout: 15000 }).catch(() => {});
    ok('N tocar no aviso abre Melhorias', /\/oficina\/melhorias/.test(p.url()), p.url());
    // "o horario de funcionamento serve" dentro do cartao
    await p.goto(`${SITE}/ee/et/oficina/pedidos`, { waitUntil: 'networkidle' }); await sleep(1500);
    await p.getByTestId('novidades-serve').click(); await sleep(1500);
    const { data: ofAx } = await sb.from('oficinas').select('recepcao_confirmada_em').eq('id', ofA).single();
    ok('N "Lahtiolekuajad sobivad" no cartao grava recepcao_confirmada_em e o cartao fica (com "tehtud")', !!ofAx?.recepcao_confirmada_em
      && (await p.getByTestId('novidades-oficina').innerText()).includes(ET('novidadesOficina.recepcaoFeita')) && (await conta2(p, 'novidades-serve')) === 0);
    // fechar -> banco
    await p.getByTestId('novidades-fechar').click(); await sleep(1200);
    ok('N fechar: cartao some', (await conta2(p, 'novidades-oficina')) === 0);
    const { data: disp } = await sb.from('avisos_dispensados').select('chave').eq('profile_id', donoA.id);
    ok('N fechar grava avisos_dispensados (banco)', disp?.length === 1 && disp[0].chave === CHAVE, JSON.stringify(disp));
    await p.reload({ waitUntil: 'networkidle' }); await sleep(1500);
    ok('N recarregar: cartao continua fechado e sem convite', (await conta2(p, 'novidades-oficina')) === 0 && (await conta2(p, 'convite-recepcao')) === 0);
    await c.close();
    const c2 = await contexto(1280); const p2 = await c2.newPage();
    await entrar(p2, donoA);
    await p2.goto(`${SITE}/ee/et/oficina/pedidos`, { waitUntil: 'networkidle' }); await sleep(1500);
    ok('N outro aparelho (sem localStorage): cartao continua fechado', (await conta2(p2, 'novidades-oficina')) === 0);
    await c2.close();
  }
  {
    // dono B (RU, recepcao nao respondida): cartao em RU; depois de fechado, num aparelho novo volta SO o convite
    const c = await contexto(360); const p = await c.newPage();
    await entrar(p, donoB, '/ee/ru');
    await p.goto(`${SITE}/ee/ru/oficina/pedidos`, { waitUntil: 'networkidle' }); await sleep(1500);
    ok('N RU: cartao em russo, 1 so, sem convite junto', (await conta2(p, 'novidades-oficina')) === 1 && (await conta2(p, 'convite-recepcao')) === 0
      && (await p.getByTestId('novidades-oficina').innerText()).includes(RU('novidadesOficina.titulo')));
    ok('N RU 360 px: alvos >= 44 px, nada cortado', (await alvosPequenos(p, '[data-testid=novidades-oficina] a, [data-testid=novidades-oficina] button')).length === 0 && (await cortados(p, '[data-testid=novidades-oficina]')).length === 0 && await semRolagem(p));
    await p.getByTestId('novidades-oficina').screenshot({ path: `${OUT}/N_cartao_ru_360.png` });
    await p.screenshot({ path: `${OUT}/N_pedidos_ru_360.png` });
    await p.getByTestId('novidades-fechar').click(); await sleep(1200);
    ok('N RU fechar: nada aparece nesta visita (convite adiado 7 dias junto)', (await conta2(p, 'novidades-oficina')) === 0 && (await conta2(p, 'convite-recepcao')) === 0);
    await c.close();
    const c2 = await contexto(360); const p2 = await c2.newPage();
    await entrar(p2, donoB, '/ee/ru');
    await p2.goto(`${SITE}/ee/ru/oficina/pedidos`, { waitUntil: 'networkidle' }); await sleep(1500);
    ok('N RU aparelho novo: so o convite antigo da recepcao (nunca dois)', (await conta2(p2, 'novidades-oficina')) === 0 && (await conta2(p2, 'convite-recepcao')) === 1);
    await c2.close();
    // dono C (sem aviso): so o convite
    const c3 = await contexto(360); const p3 = await c3.newPage();
    await entrar(p3, donoC);
    await p3.goto(`${SITE}/ee/et/oficina/pedidos`, { waitUntil: 'networkidle' }); await sleep(1500);
    ok('N oficina sem o aviso (nova): sem cartao Novidades, so o convite', (await conta2(p3, 'novidades-oficina')) === 0 && (await conta2(p3, 'convite-recepcao')) === 1);
    await c3.close();
  }

  // ---------- M: Melhorias ----------
  {
    const c = await contexto(360); const p = await c.newPage();
    await entrar(p, donoA);
    await p.goto(`${SITE}/ee/et/oficina/pedidos`, { waitUntil: 'networkidle' }); await sleep(1000);
    await p.locator('button[aria-controls="menu-mobile"]:visible').first().click(); await sleep(500);
    const itemMenu = p.locator('#menu-mobile a[href$="/oficina/melhorias"]');
    ok('M menu do celular tem "Ettepanekud"', (await itemMenu.count()) === 1 && (await itemMenu.innerText()).includes(ET('nav.melhorias')));
    await itemMenu.click(); await p.waitForURL(/\/oficina\/melhorias/, { timeout: 15000 }).catch(() => {}); await sleep(1500);
    ok('M pagina abre com titulo', (await p.locator('h1').innerText()).includes(ET('oficinaMelhorias.titulo')));
    await p.screenshot({ path: `${OUT}/M_melhorias_vazia_et_360.png`, fullPage: true });
    for (const v of ['telefone', 'papel', 'outro']) await p.getByTestId(`p1-${v}`).check();
    await p.getByTestId('p1-outro-texto').fill('Facebooki leht');
    await p.getByTestId('p2-programa_oficina').check(); await p.getByTestId('p2-nome').fill('Autosoft');
    await p.getByTestId('p3-4-8').check(); await p.getByTestId('p4-faixa').check(); await p.getByTestId('p5-sim').check();
    await p.getByTestId('p6').fill('Klientidele tagasi helistamine');
    await p.getByTestId('pesquisa-salvar').click(); await sleep(1500);
    ok('M salvar: "Aitäh" aparece', await visivel(p, 'pesquisa-ok'));
    const linhaPesq = async () => (await sb.from('oficina_pesquisa_calendario').select('*').eq('oficina_id', ofA)).data || [];
    let lp = await linhaPesq();
    ok('M banco: 1 linha com as respostas e respondido_por = dono', lp.length === 1 && lp[0].como_marcam.sort().join(',') === 'outro,papel,telefone' && lp[0].como_marcam_outro === 'Facebooki leht'
      && lp[0].programa === 'programa_oficina' && lp[0].programa_nome === 'Autosoft' && lp[0].carros_dia === '4-8' && lp[0].hora_cliente === 'faixa'
      && lp[0].calendario_externo === 'sim' && lp[0].maior_tempo === 'Klientidele tagasi helistamine' && lp[0].respondido_por === donoA.id, JSON.stringify(lp[0]));
    const criado = lp[0]?.created_at, atual1 = lp[0]?.updated_at;
    await p.reload({ waitUntil: 'networkidle' }); await sleep(1500);
    ok('M recarregar: respostas voltam marcadas', await p.getByTestId('p1-papel').isChecked() && await p.getByTestId('p3-4-8').isChecked() && await p.getByTestId('p5-sim').isChecked()
      && (await p.getByTestId('p2-nome').inputValue()) === 'Autosoft' && (await p.getByTestId('p6').inputValue()) === 'Klientidele tagasi helistamine' && await visivel(p, 'pesquisa-salva-em'));
    ok('M botao vira "Salvesta muudatused"', (await p.getByTestId('pesquisa-salvar').innerText()).includes(ET('oficinaMelhorias.salvarAlteracoes')));
    await p.getByTestId('p1-papel').uncheck(); await p.getByTestId('p5-talvez').check(); await p.getByTestId('p2-google').check();
    await sleep(300);
    ok('M "Milline?" some quando o programa nao pede nome', (await conta2(p, 'p2-nome')) === 0);
    await p.getByTestId('pesquisa-salvar').click(); await sleep(1500);
    lp = await linhaPesq();
    ok('M editar: continua 1 linha, valores novos, nome do programa limpo, created_at igual e updated_at novo', lp.length === 1 && lp[0].como_marcam.sort().join(',') === 'outro,telefone'
      && lp[0].calendario_externo === 'talvez' && lp[0].programa === 'google' && lp[0].programa_nome === null && lp[0].created_at === criado && lp[0].updated_at !== atual1, JSON.stringify(lp[0]));
    await p.reload({ waitUntil: 'networkidle' }); await sleep(1500);
    ok('M recarregar depois de editar: talvez marcado, papel desmarcado', await p.getByTestId('p5-talvez').isChecked() && !(await p.getByTestId('p1-papel').isChecked()));
    // sugestoes
    await p.getByTestId('sugestao-texto').fill('ab'); await p.getByTestId('sugestao-enviar').click(); await sleep(500);
    ok('M sugestao curta: erro, nada gravado', (await p.locator('body').innerText()).includes(ET('oficinaMelhorias.erroCurta')) && ((await sb.from('oficina_sugestoes').select('id').eq('oficina_id', ofA)).data || []).length === 0);
    await p.getByTestId('sugestao-texto').fill('Homsed autod ühel ekraanil'); await p.getByTestId('sugestao-enviar').click(); await sleep(1200);
    ok('M 1a sugestao: "Aitäh" + campo limpo', await visivel(p, 'sugestao-ok') && (await p.getByTestId('sugestao-texto').inputValue()) === '');
    await p.getByTestId('sugestao-texto').fill('SMS kliendile päev enne'); await p.getByTestId('sugestao-enviar').click(); await sleep(1200);
    await p.reload({ waitUntil: 'networkidle' }); await sleep(1500);
    const itens = await p.getByTestId('sugestoes-lista').locator('li').allInnerTexts();
    ok('M lista das sugestoes (recarregada): 2, a mais nova primeiro', itens.length === 2 && itens[0].includes('SMS kliendile') && itens[1].includes('Homsed autod'), JSON.stringify(itens));
    const { data: sgs } = await sb.from('oficina_sugestoes').select('autor_id').eq('oficina_id', ofA);
    ok('M banco: 2 sugestoes com autor = dono', sgs?.length === 2 && sgs.every((s) => s.autor_id === donoA.id));
    ok('M 360 px: sem rolagem lateral e nada cortado', await semRolagem(p) && (await cortados(p, 'main, body > div')).length === 0, JSON.stringify((await cortados(p, 'main, body > div')).slice(0, 5)));
    const peq = await alvosPequenos(p, '[data-testid=pesquisa-calendario] label:has(input), [data-testid=pesquisa-calendario] button, [data-testid=sugestoes] button, a[data-testid^="melhorias-"]');
    ok('M 360 px: opcoes e botoes >= 44 px', peq.length === 0, JSON.stringify(peq));
    await p.screenshot({ path: `${OUT}/M_melhorias_et_360.png`, fullPage: true });
    await p.goto(`${SITE}/ee/ru/oficina/melhorias`, { waitUntil: 'networkidle' }); await sleep(1500);
    ok('M RU: pagina em russo, sem rolagem lateral', (await p.locator('h1').innerText()).includes(RU('oficinaMelhorias.titulo')) && (await p.locator('body').innerText()).includes(RU('oficinaMelhorias.p1.pergunta')) && await semRolagem(p));
    await p.screenshot({ path: `${OUT}/M_melhorias_ru_360.png`, fullPage: true });
    await c.close();
    // mecanico nao usa a pagina
    const c2 = await contexto(360); const p2 = await c2.newPage();
    await entrar(p2, mec);
    await p2.goto(`${SITE}/ee/et/oficina/melhorias`, { waitUntil: 'networkidle' }); await sleep(1500);
    ok('M mecanico: pagina diz que e so para dono/admin (sem formulario)', (await conta2(p2, 'pesquisa-calendario')) === 0 && (await p2.locator('body').innerText()).includes(ET('oficinaMelhorias.soGestor')));
    await c2.close();
  }

  // ---------- R: RLS ----------
  {
    const cB = await logado(donoB);
    const { data: r1 } = await cB.from('oficina_pesquisa_calendario').select('*').eq('oficina_id', ofA);
    const { data: r2 } = await cB.from('oficina_sugestoes').select('*').eq('oficina_id', ofA);
    const { data: r2b } = await cB.from('oficina_sugestoes').select('id');
    ok('R outra oficina (B) nao le a pesquisa nem as sugestoes de A', (r1 || []).length === 0 && (r2 || []).length === 0 && (r2b || []).length === 0, `${r1?.length}/${r2?.length}/${r2b?.length}`);
    const { error: e3 } = await cB.from('oficina_sugestoes').insert({ oficina_id: ofA, texto: 'invasao de B' });
    const { error: e4 } = await cB.from('oficina_pesquisa_calendario').upsert({ oficina_id: ofA, carros_dia: '15+' }, { onConflict: 'oficina_id' });
    await cB.from('oficina_pesquisa_calendario').update({ carros_dia: '15+' }).eq('oficina_id', ofA);
    const { data: aindaA } = await sb.from('oficina_pesquisa_calendario').select('carros_dia').eq('oficina_id', ofA).single();
    ok('R B nao grava sugestao nem pesquisa de A (insert/upsert recusados, update nao muda)', !!e3 && !!e4 && aindaA?.carros_dia === '4-8', `${e3?.message} | ${e4?.message} | ${aindaA?.carros_dia}`);
    const { error: e5 } = await cB.from('oficina_sugestoes').insert({ oficina_id: ofB, texto: 'sugestao propria de B', autor_id: donoA.id });
    const { data: sB } = await sb.from('oficina_sugestoes').select('autor_id').eq('oficina_id', ofB);
    ok('R B grava a propria sugestao; autor vem do banco (nao do navegador)', !e5 && sB?.length === 1 && sB[0].autor_id === donoB.id, e5?.message || JSON.stringify(sB));
    const { error: e6 } = await cB.from('oficina_pesquisa_calendario').insert({ oficina_id: ofB, carros_dia: 'muitos' });
    ok('R valor fora da lista recusado (CHECK)', !!e6);
    const { data: dA } = await cB.from('avisos_dispensados').select('*').eq('profile_id', donoA.id);
    const { error: e7 } = await cB.from('avisos_dispensados').insert({ profile_id: donoA.id, chave: 'x' });
    ok('R avisos_dispensados: B nao le nem grava os de A', (dA || []).length === 0 && !!e7);
    const cM = await logado(mec);
    const { data: m1 } = await cM.from('oficina_pesquisa_calendario').select('*');
    const { data: m2 } = await cM.from('oficina_sugestoes').select('*');
    const { error: m3 } = await cM.from('oficina_sugestoes').insert({ oficina_id: ofA, texto: 'mecanico tenta' });
    ok('R mecanico de A nao le nem grava', (m1 || []).length === 0 && (m2 || []).length === 0 && !!m3);
    const cG = await logado(ger);
    const { data: g1 } = await cG.from('oficina_pesquisa_calendario').select('*').eq('oficina_id', ofA);
    const { data: g2 } = await cG.from('oficina_sugestoes').select('*').eq('oficina_id', ofA);
    const { error: g3 } = await cG.from('oficina_sugestoes').insert({ oficina_id: ofA, texto: 'sugestao do juhataja' });
    ok('R funcionario admin de A le e grava', (g1 || []).length === 1 && (g2 || []).length === 2 && !g3, g3?.message);
    const cAnon = anon();
    const { data: n1x } = await cAnon.from('oficina_pesquisa_calendario').select('*');
    const { data: n2x } = await cAnon.from('oficina_sugestoes').select('*');
    const { error: n3x } = await cAnon.from('oficina_sugestoes').insert({ oficina_id: ofA, texto: 'anonimo' });
    ok('R anonimo nao le nem grava', (n1x || []).length === 0 && (n2x || []).length === 0 && !!n3x);
    const cAdm = await logado(adm);
    const { data: a1 } = await cAdm.from('oficina_pesquisa_calendario').select('oficina_id').in('oficina_id', [ofA, ofB]);
    const { data: a2 } = await cAdm.from('oficina_sugestoes').select('id').in('oficina_id', [ofA, ofB]);
    ok('R admin da plataforma le tudo (A e B)', (a1 || []).length === 1 && (a2 || []).length === 4, `${a1?.length}/${a2?.length}`);
  }

  // ---------- A: /admin/melhorias ----------
  {
    const c = await contexto(1280); const p = await c.newPage();
    await entrar(p, adm);
    await p.goto(`${SITE}/admin/melhorias`, { waitUntil: 'networkidle' }); await sleep(1500);
    const resp = await p.getByTestId('admin-mel-respostas').innerText().catch(() => '');
    ok('A admin: resposta de A listada (nome, "4–8", "Talvez", Google Agenda)', resp.includes(`MELHORIAS A ${tag}`) && resp.includes('4–8') && resp.includes('Talvez') && resp.includes('Google Agenda'), resp.slice(0, 300));
    ok('A menu lateral tem "Melhorias (oficinas)"', (await p.locator('a[href="/admin/melhorias"]').count()) >= 1);
    await p.screenshot({ path: `${OUT}/A_admin_pesquisa_1280.png`, fullPage: true });
    await p.getByTestId('admin-mel-aba-sugestoes').click(); await sleep(500);
    const sug = await p.getByTestId('admin-mel-sugestoes').innerText().catch(() => '');
    ok('A admin: sugestoes de A e B listadas', sug.includes('SMS kliendile') && sug.includes('sugestao propria de B') && sug.includes('sugestao do juhataja'), sug.slice(0, 300));
    await p.screenshot({ path: `${OUT}/A_admin_sugestoes_1280.png`, fullPage: true });
    await c.close();
  }
} catch (e) {
  falhas++; console.log('FALHA execucao -', e?.stack || e);
} finally {
  await browser.close().catch(() => {});
  for (const id of oficinas) { await sb.from('funcionarios').delete().eq('oficina_id', id); await sb.from('oficinas').delete().eq('id', id); }
  for (const id of contas) { await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id).catch(() => {}); }
  console.log(`\n${oks} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
}
