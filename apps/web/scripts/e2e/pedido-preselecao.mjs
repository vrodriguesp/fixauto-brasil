// E2E LOCAL da pre-selecao do servico pelo link do anuncio (Google Ads, dono 25/11):
//   ?servico=<tipo de TIPOS_SERVICO> -> abre ja no passo 2 com o tipo escolhido; ?tema=ulevaatus|hooldus -> dica
//   no alto do passo 2; valor invalido/ausente = exatamente como antes. Celular (390x844 e 360x640).
//   (a) /ee/et/paring sem parametro: como antes e envia um pedido completo (banco local, e-mail na pasta)
//   (b) ?servico=revisao&tema=ulevaatus (+ utm): dica, passo 2, tipo revisao, envia -> solicitacoes.tipo=revisao
//   (c) /ee/ru/zayavka?servico=vidros (+ tema=hooldus: dica RU)
//   (d) ?servico=xyz = sem parametro
//   (e) utm_* ficam na URL em todos os passos e entram no percurso da visita (VisitTracker) como antes
//   (f) voltar do passo pre-selecionado nao prende (Back xN sai da pagina; depois de enviar, painel uma vez e sai)
//   funil: 'servico_prefill' uma vez por pedido, 'servico' so com o toque num cartao
//   SITE=http://localhost:3150 node pedido-preselecao.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const { createClient } = req('@supabase/supabase-js');
const pw = req('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
if (!env.EMAIL_PASTA_TESTE) throw new Error('TESTE LOCAL: sem EMAIL_PASTA_TESTE os e-mails sairiam de verdade - parado');
const SITE = process.env.SITE || 'http://localhost:3100';
const EMAILS = env.EMAIL_PASTA_TESTE;
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/pedido-preselecao';
fs.mkdirSync(OUT, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0; let oks = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; else oks++; console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}${extra ? ' - ' + String(extra).replace(/\s+/g, ' ').slice(0, 240) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
let ipN = 1;
const ip = () => `10.79.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
const contas = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MSG = new URL('../../messages/', import.meta.url);
const ler = (l) => Object.assign({}, ...['', '.cliente', '.auth'].map((a) => JSON.parse(fs.readFileSync(new URL(`${l}${a}.json`, MSG), 'utf8'))));
const M = { et: ler('et'), ru: ler('ru') };
const CAMINHO = { et: '/ee/et/paring', ru: '/ee/ru/zayavka' };
const UTM = (c) => `utm_source=google&utm_medium=cpc&utm_campaign=${c}&utm_term=teste&utm_content=123`;
const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
const browser = await pw.chromium.launch({ executablePath: exe });
const etapa = (p) => p.locator('.pedido-pagina').getAttribute('data-etapa').catch(() => null);
const edasi = (p, passo) => p.getByTestId(`passo-${passo}`).getByTestId('edasi');
const codigoDe = async (email, depois) => {
  for (let i = 0; i < 40; i++) {
    const arq = fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email.replace(/[^a-z0-9@._-]/gi, '_')}.html`) && Number(f.split('_')[0]) >= depois).sort();
    if (arq.length) {
      const txt = fs.readFileSync(path.join(EMAILS, arq.at(-1)), 'utf8').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
      const m = txt.match(/(?<![\d#])\d{6}(?!\d)/);
      if (m) return m[0];
    }
    await sleep(300);
  }
  return null;
};
async function carroCampo(p, id, nome, re) {
  const el = p.locator('#' + id);
  await el.waitFor({ state: 'visible', timeout: 20000 });
  await el.click(); await el.fill(nome.slice(0, 4));
  const op = p.getByTestId(id + '-lista').getByRole('option', { name: re || nome, exact: !re });
  await op.first().waitFor({ timeout: 20000 }); await op.first().click();
}
let nFoto = 0;
const foto = async (p, nome) => { nFoto++; await p.screenshot({ path: path.join(OUT, `${String(nFoto).padStart(2, '0')}_${nome.replace(/[^\w-]+/g, '_')}.png`) }); };
const cabe = async (p) => p.evaluate(() => ({ alt: document.documentElement.scrollHeight, tela: innerHeight, larg: document.documentElement.scrollWidth - innerWidth }));

async function contexto(l, w, h, { consent = 'denied' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: l === 'et' ? 'et-EE' : 'ru-RU', extraHTTPHeaders: { 'x-real-ip': ip() } });
  await ctx.addInitScript((c) => { try { if (!localStorage.getItem('bipfix_cookie_consent')) localStorage.setItem('bipfix_cookie_consent', c); } catch {} }, consent);
  const funil = [];
  // registra a etapa e repassa ao /api/funil de verdade (banco local), para conferir a lista do servidor
  await ctx.route('**/api/funil', async (r) => { try { funil.push(JSON.parse(r.request().postData() || '{}').etapa); } catch {} await r.continue(); });
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  const respostas = []; p.on('response', (r) => { if (r.url().startsWith(SITE) && r.status() >= 500) respostas.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  return { ctx, p, funil, erros, respostas };
}

// do passo 2 (ja com texto) ate o fim; devolve a solicitacao gravada
async function terminar(p, l, nome, email) {
  const tn = M[l].clienteNovaSolicitacao;
  const urlEntrada = p.url();
  await edasi(p, 'detalhe').click();
  await p.getByTestId('passo-fotos').waitFor();
  await edasi(p, 'fotos').click(); // "Jatka ilma fotota"
  await p.getByTestId('passo-carro').waitFor({ state: 'visible' });
  await carroCampo(p, 'cbbe3-101', 'Toyota');
  await carroCampo(p, 'cbbe3-102', 'Corolla', /Corolla/);
  await p.locator('#cbbe3-103').fill('2015');
  await p.locator('#pedido-placa').fill('123ABC');
  ok(`${nome}: (e) URL do passo do carro = a de entrada (utm/servico intactos)`, p.url() === urlEntrada, p.url());
  await edasi(p, 'carro').click();
  await p.getByTestId('passo-local').waitFor();
  await p.locator('#pedido-endereco').fill(l === 'et' ? 'Lasnamäe' : 'Ласнамяэ');
  await p.waitForTimeout(2000);
  const sug = p.getByRole('option').first();
  if (await sug.isVisible().catch(() => false)) { await sug.click(); await p.waitForTimeout(800); }
  await edasi(p, 'local').click();
  await p.getByTestId('passo-contato').waitFor();
  const urlContato = p.url();
  await p.locator('#pedido-nome').fill('TESTE AUTOMATICO');
  await p.locator('#pedido-email').fill(email);
  await p.getByTestId('aceito-termos').check();
  const t0 = Date.now();
  await edasi(p, 'contato').click();
  await p.getByTestId('passo-codigo').waitFor({ timeout: 40000 });
  const c = await codigoDe(email, t0);
  ok(`${nome}: e-mail do codigo gravado na pasta local (nao enviado)`, !!c);
  const pend = (await admin.from('pedidos_pendentes').select('user_id').ilike('email', email).maybeSingle()).data;
  if (pend) contas.add(pend.user_id);
  await p.locator('#pedido-codigo').fill(c || '');
  await p.getByTestId('confirmar-codigo').click();
  const criar = await p.getByTestId('criar-senha').waitFor({ timeout: 40000 }).then(() => true, () => false);
  ok(`${nome}: codigo -> "crie a sua senha"`, criar, p.url());
  await p.getByTestId('criar-senha-agora-nao').click();
  await p.waitForURL(/orcamentos\//, { timeout: 30000 }).catch(() => {});
  const sol = (await admin.from('solicitacoes').select('id, numero, tipo, descricao').eq('cliente_id', pend?.user_id || '00000000-0000-0000-0000-000000000000').maybeSingle()).data;
  ok(`${nome}: pedido aberto logado (/cliente/orcamentos/<id>)`, !!sol && p.url().includes(`/cliente/orcamentos/${sol.id}`), p.url());
  await p.waitForTimeout(1500);
  // Back xN depois de enviar: painel uma vez e sai (18/11) - nunca reabre os passos
  const v2 = [];
  for (let i = 0; i < 8; i++) {
    await p.goBack({ timeout: 8000 }).catch(() => {}); await p.waitForTimeout(1500);
    v2.push(p.url().startsWith(SITE) ? new URL(p.url()).pathname + new URL(p.url()).search : p.url());
    if (!p.url().startsWith(SITE) || !/paring|zayavka|cliente/.test(p.url())) break;
  }
  ok(`${nome}: (f) Back xN depois do pedido -> painel e sai, sem reabrir os passos`, /\/cliente\/dashboard/.test(v2[0] || '') && !(await p.locator('.pedido-pagina').count()), v2.join(' > '));
  return { sol, urlContato, tn };
}

try {
  // ---------- curl: o middleware passa a query nas rotas localizadas (sem redirecionar nem tirar parametro) ----------
  for (const u of [`/ee/et/paring?servico=revisao&tema=ulevaatus&${UTM('motoristas_search_ulevaatus_et')}`, `/ee/ru/zayavka?servico=vidros&${UTM('motoristas_search_klaas_ru')}`]) {
    const r = await fetch(SITE + u, { redirect: 'manual', headers: { 'x-real-ip': ip() } });
    const html = await r.text();
    ok(`(e) GET ${u.split('&utm')[0]}: 200 sem redirecionar e ja renderiza o passo 2 no servidor`, r.status === 200 && /data-etapa="detalhe"/.test(html), `${r.status} ${r.headers.get('location') || ''}`);
  }
  {
    const r = await fetch(SITE + `/ee/et/paring?servico=revisao&tema=ulevaatus`, { headers: { 'x-real-ip': ip() } });
    ok('(b) SSR: dica do tema no HTML do servidor (ET)', (await r.text()).includes(M.et.pedidoSemConta.temaUlevaatus));
    const r2 = await fetch(SITE + `/ee/et/paring?servico=xyz`, { headers: { 'x-real-ip': ip() } });
    ok('(d) SSR: servico=xyz renderiza o passo 1 como sem parametro', /data-etapa="servico"/.test(await r2.text()));
  }

  // ---------- (a) sem parametro: como antes, envio completo ----------
  {
    const l = 'et'; const ps = M[l].pedidoSemConta; const nome = '(a) ET 390 sem parametro';
    const { ctx, p, funil, erros, respostas } = await contexto(l, 390, 844);
    await p.goto(SITE + '/ee/et', { waitUntil: 'domcontentloaded' });
    await p.goto(SITE + CAMINHO[l], { waitUntil: 'networkidle' });
    ok(`${nome}: abre no passo 1, 8 cartoes, nenhum marcado, sem dica`, (await etapa(p)) === 'servico' && (await p.getByTestId('passo-servico').locator('button').count()) === 8 && (await p.getByTestId('passo-servico').locator('button[aria-pressed=true]').count()) === 0 && (await p.getByTestId('tema-dica').count()) === 0);
    ok(`${nome}: subtitulo "${ps.subtitulo}" e barra 1/6`, (await p.innerText('main')).includes(ps.subtitulo) && (await p.getByTestId('progresso').innerText()).includes(ps.passoDe.replace('{n}', '1').replace('{total}', '6')));
    await foto(p, nome + ' 1');
    await p.getByTestId('passo-servico').locator('button').nth(3).click(); // Mehaanika
    await p.getByTestId('passo-detalhe').waitFor();
    ok(`${nome}: cartao -> passo 2 sem dica de tema`, (await p.getByTestId('tema-dica').count()) === 0);
    await p.locator('#pedido-descricao').fill('Kriuksub pidurdamisel');
    const { sol } = await terminar(p, l, nome, `pre-a-${tag}@example.test`);
    ok(`${nome}: banco: tipo mecanica`, sol?.tipo === 'mecanica', JSON.stringify(sol));
    ok(`${nome}: funil abriu + servico (toque) e SEM servico_prefill`, funil.includes('abriu') && funil.filter((e) => e === 'servico').length === 1 && !funil.includes('servico_prefill'), funil.join(','));
    ok(`${nome}: sem erro de JS / 5xx`, !erros.length && !respostas.length, [...erros, ...respostas].join(' | '));
    await ctx.close();
  }

  // ---------- (b) + (e) + (f): ?servico=revisao&tema=ulevaatus com utm, cookies aceitos (percurso da visita) ----------
  {
    const l = 'et'; const ps = M[l].pedidoSemConta; const nome = '(b) ET 390 revisao+ulevaatus';
    const { ctx, p, funil, erros, respostas } = await contexto(l, 390, 844, { consent: 'accepted' });
    // ja tinha aberto o formulario antes (rascunho vazio, sem tipo): a pre-selecao do link vale mesmo assim
    await p.goto(SITE + CAMINHO[l], { waitUntil: 'networkidle' });
    await p.waitForTimeout(500);
    await p.goto(SITE + '/ee/et', { waitUntil: 'domcontentloaded' });
    const URL_AD = `${SITE}${CAMINHO[l]}?servico=revisao&tema=ulevaatus&${UTM('motoristas_search_ulevaatus_et')}`;
    await p.goto(URL_AD, { waitUntil: 'networkidle' });
    await p.waitForTimeout(600);
    ok(`${nome}: abre no passo 2 (detalhe), barra 2/6`, (await etapa(p)) === 'detalhe' && (await p.getByTestId('progresso').innerText()).includes(ps.passoDe.replace('{n}', '2').replace('{total}', '6')), await etapa(p));
    ok(`${nome}: tipo = ${M[l].constants.tiposServicoMotorista?.revisao || M[l].constants.tiposServico?.revisao}`, (await p.getByTestId('detalhe-tipo').innerText()).includes(M[l].constants.tiposServicoMotorista?.revisao || M[l].constants.tiposServico?.revisao), await p.getByTestId('detalhe-tipo').innerText());
    ok(`${nome}: dica "${ps.temaUlevaatus.slice(0, 30)}..."`, (await p.getByTestId('tema-dica').innerText()) === ps.temaUlevaatus);
    ok(`${nome}: caixa de texto vazia (nada pre-escrito) e chips de Hooldus`, (await p.locator('#pedido-descricao').inputValue()) === '' && (await p.getByTestId('chip-servico').count()) > 0);
    const c1 = await cabe(p);
    ok(`${nome}: cabe sem rolar a 390x844`, c1.alt <= c1.tela + 1 && c1.larg <= 0, JSON.stringify(c1));
    await foto(p, nome + ' 2');
    ok(`${nome}: (e) URL intacta com utm_campaign`, p.url() === URL_AD, p.url());
    const visita = await p.evaluate(() => JSON.parse(sessionStorage.getItem('bipfix_visita') || 'null'));
    ok(`${nome}: (e) percurso da visita grava a URL com utm_campaign e servico`, !!visita?.paginas?.some((x) => x.p.includes('utm_campaign=motoristas_search_ulevaatus_et') && x.p.includes('servico=revisao')), JSON.stringify(visita?.paginas?.map((x) => x.p)));
    ok(`${nome}: funil servico_prefill + detalhe, sem 'servico' (nao tocou cartao)`, funil.includes('servico_prefill') && funil.includes('detalhe') && !funil.includes('servico'), funil.join(','));
    // (f) voltar: Edasi -> fotos; Back -> passo 2 com a dica; Back -> sai da pagina (volta a home), nao prende
    await p.locator('#pedido-descricao').fill('Käsipidur ei hoia');
    await edasi(p, 'detalhe').click(); await p.getByTestId('passo-fotos').waitFor();
    ok(`${nome}: (e) URL ainda com utm no passo 3`, p.url() === URL_AD, p.url());
    await p.goBack(); await p.waitForTimeout(600);
    ok(`${nome}: (f) Back do passo 3 -> passo 2 com texto e dica`, (await etapa(p)) === 'detalhe' && (await p.locator('#pedido-descricao').inputValue()) === 'Käsipidur ei hoia' && (await p.getByTestId('tema-dica').count()) === 1, await etapa(p));
    await p.goBack(); await p.waitForTimeout(1200);
    ok(`${nome}: (f) Back do passo 2 sai da pagina (volta a home)`, !p.url().includes('paring'), p.url());
    await p.goForward(); await p.waitForTimeout(1500);
    ok(`${nome}: avancar volta ao passo 2 com o texto (rascunho)`, (await etapa(p)) === 'detalhe' && (await p.locator('#pedido-descricao').inputValue()) === 'Käsipidur ei hoia', await etapa(p));
    // Tagasi da tela: cartoes com Hooldus marcado; Back dali sai da pagina; cartao de novo -> passo 2
    await p.getByTestId('passo-detalhe').getByRole('button', { name: M[l].clienteNovaSolicitacao.back, exact: true }).click(); await p.waitForTimeout(500);
    ok(`${nome}: (f) Tagasi -> passo 1 com o cartao Hooldus marcado`, (await etapa(p)) === 'servico' && (await p.getByTestId('passo-servico').locator('button[aria-pressed=true]').count()) === 1);
    await p.getByTestId('passo-servico').locator('button[aria-pressed=true]').click(); await p.getByTestId('passo-detalhe').waitFor();
    await p.goBack(); await p.waitForTimeout(600);
    ok(`${nome}: (f) cartao -> passo 2 -> Back volta ao passo 1`, (await etapa(p)) === 'servico');
    await p.goBack(); await p.waitForTimeout(1200);
    ok(`${nome}: (f) Back do passo 1 sai da pagina`, !p.url().includes('paring'), p.url());
    await p.goForward(); await p.waitForTimeout(1500);
    if ((await etapa(p)) === 'servico') { await p.getByTestId('passo-servico').locator('button[aria-pressed=true]').click(); await p.getByTestId('passo-detalhe').waitFor(); }
    ok(`${nome}: de volta ao passo 2 com o texto`, (await etapa(p)) === 'detalhe' && (await p.locator('#pedido-descricao').inputValue()) === 'Käsipidur ei hoia', await etapa(p));
    const { sol } = await terminar(p, l, nome, `pre-b-${tag}@example.test`);
    ok(`${nome}: banco: tipo revisao e a descricao escrita pela pessoa`, sol?.tipo === 'revisao' && (sol?.descricao || '').includes('Käsipidur ei hoia'), JSON.stringify(sol));
    ok(`${nome}: funil servico_prefill uma vez (voltas nao inflam)`, funil.filter((e) => e === 'servico_prefill').length === 1 && funil.filter((e) => e === 'detalhe').length === 1, funil.join(','));
    // logado: o link do anuncio leva ao pedido normal (como /paring sem parametro)
    await p.goto(URL_AD, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
    ok(`${nome}: logado -> link do anuncio vai ao pedido normal`, !/paring/.test(p.url()), p.url());
    ok(`${nome}: sem erro de JS / 5xx`, !erros.length && !respostas.length, [...erros, ...respostas].join(' | '));
    await ctx.close();
  }

  // ---------- (b) 360x640: cabe sem rolar com a dica; hooldus ----------
  for (const [l, tema, w, h] of [['et', 'ulevaatus', 360, 640], ['et', 'hooldus', 360, 640], ['ru', 'ulevaatus', 360, 640], ['ru', 'hooldus', 390, 844]]) {
    const ps = M[l].pedidoSemConta; const nome = `(b) ${l.toUpperCase()} ${w}x${h} revisao+${tema}`;
    const { ctx, p, erros } = await contexto(l, w, h);
    await p.goto(`${SITE}${CAMINHO[l]}?servico=revisao&tema=${tema}`, { waitUntil: 'networkidle' });
    const chave = tema === 'ulevaatus' ? 'temaUlevaatus' : 'temaHooldus';
    ok(`${nome}: passo 2 com a dica "${ps[chave].slice(0, 28)}..."`, (await etapa(p)) === 'detalhe' && (await p.getByTestId('tema-dica').innerText()) === ps[chave]);
    const c = await cabe(p);
    ok(`${nome}: cabe sem rolar`, c.alt <= c.tela + 1 && c.larg <= 0, JSON.stringify(c));
    const btn = await p.evaluate(() => { const b = document.querySelector('[data-testid="passo-detalhe"] [data-testid="edasi"]').getBoundingClientRect(); return b.bottom <= innerHeight + 3; });
    ok(`${nome}: Edasi dentro da tela`, btn);
    ok(`${nome}: sem erro de JS`, !erros.length, erros.join(' | '));
    await foto(p, nome);
    await ctx.close();
  }

  // ---------- (c) RU vidros ----------
  {
    const l = 'ru'; const ps = M[l].pedidoSemConta; const nome = '(c) RU 390 vidros';
    const { ctx, p, funil, erros, respostas } = await contexto(l, 390, 844);
    await p.goto(SITE + '/ee/ru', { waitUntil: 'domcontentloaded' });
    const URL_AD = `${SITE}${CAMINHO[l]}?servico=vidros&${UTM('motoristas_search_klaas_ru')}`;
    await p.goto(URL_AD, { waitUntil: 'networkidle' });
    ok(`${nome}: passo 2, tipo Стекла, titulo "${ps.detalheTituloFoto}", sem dica (sem tema)`, (await etapa(p)) === 'detalhe' && (await p.getByTestId('detalhe-tipo').innerText()).includes('🪟') && (await p.locator('[data-testid=passo-detalhe] h2').innerText()) === ps.detalheTituloFoto && (await p.getByTestId('tema-dica').count()) === 0, await p.getByTestId('detalhe-tipo').innerText());
    ok(`${nome}: exemplo de vidro no placeholder`, (await p.locator('#pedido-descricao').getAttribute('placeholder')) === ps.exemploVidro);
    await foto(p, nome);
    await p.locator('#pedido-descricao').fill('Скол на лобовом стекле');
    await edasi(p, 'detalhe').click(); await p.getByTestId('passo-fotos').waitFor();
    ok(`${nome}: segue para as fotos; URL intacta`, (await etapa(p)) === 'fotos' && p.url() === URL_AD, p.url());
    await p.goBack(); await p.waitForTimeout(500); await p.goBack(); await p.waitForTimeout(1200);
    ok(`${nome}: (f) Back x2 sai da pagina`, !p.url().includes('zayavka'), p.url());
    ok(`${nome}: funil servico_prefill`, funil.includes('servico_prefill') && !funil.includes('servico'), funil.join(','));
    ok(`${nome}: sem erro de JS / 5xx`, !erros.length && !respostas.length, [...erros, ...respostas].join(' | '));
    await ctx.close();
  }

  // ---------- rascunho com OUTRO tipo vence o link (nao perde o que a pessoa ja fez) ----------
  {
    const l = 'et'; const nome = 'rascunho mecanica + link revisao';
    const { ctx, p } = await contexto(l, 390, 844);
    await p.goto(SITE + CAMINHO[l], { waitUntil: 'networkidle' });
    await p.getByTestId('passo-servico').locator('button').nth(3).click(); await p.getByTestId('passo-detalhe').waitFor();
    await p.locator('#pedido-descricao').fill('Mootor müriseb'); await p.waitForTimeout(400);
    await p.goto(`${SITE}${CAMINHO[l]}?servico=revisao&tema=hooldus`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    ok(`${nome}: fica o rascunho (mecanica, texto)`, (await etapa(p)) === 'detalhe' && (await p.locator('#pedido-descricao').inputValue()) === 'Mootor müriseb' && (await p.getByTestId('detalhe-tipo').innerText()).includes('⚙️'), await p.getByTestId('detalhe-tipo').innerText());
    await ctx.close();
  }

  // ---------- rascunho SEM nada da pessoa nao vence o link (revisao 25/11) ----------
  // 1o anuncio (mecanica+ulevaatus) aberto e abandonado -> 2o anuncio (revisao+hooldus) mostra revisao + dica hooldus;
  // so tocou num cartao (eletrica) e saiu -> o link vence; depois de escrever, o rascunho volta a vencer.
  {
    const l = 'et'; const nome = 'rascunho vazio + link';
    const { ctx, p } = await contexto(l, 390, 844);
    await p.goto(`${SITE}${CAMINHO[l]}?servico=mecanica&tema=ulevaatus`, { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
    await p.goto(`${SITE}${CAMINHO[l]}?servico=revisao&tema=hooldus`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    ok(`${nome}: 2o anuncio vence o rascunho do 1o (revisao + dica hooldus)`, (await etapa(p)) === 'detalhe' && (await p.getByTestId('detalhe-tipo').innerText()).includes('🔧') && (await p.getByTestId('tema-dica').innerText()) === M.et.pedidoSemConta.temaHooldus, await p.getByTestId('detalhe-tipo').innerText());
    await p.goto(SITE + CAMINHO[l], { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
    ok(`${nome}: sem parametro, o rascunho do link (revisao, passo 2) continua valendo`, (await etapa(p)) === 'detalhe' && (await p.getByTestId('detalhe-tipo').innerText()).includes('🔧'), await etapa(p));
    await p.getByTestId('passo-detalhe').getByRole('button', { name: M.et.clienteNovaSolicitacao.back }).click(); await p.getByTestId('passo-servico').waitFor();
    await p.getByTestId('passo-servico').locator('button').nth(4).click(); await p.getByTestId('passo-detalhe').waitFor(); await p.waitForTimeout(400);
    await p.goto(`${SITE}${CAMINHO[l]}?servico=pneu`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    ok(`${nome}: so tocou num cartao (eletrica) e saiu -> link (pneu) vence`, (await etapa(p)) === 'detalhe' && (await p.getByTestId('detalhe-tipo').innerText()).includes('🛞'), await p.getByTestId('detalhe-tipo').innerText());
    await p.getByTestId('chip-servico').first().click(); await p.waitForTimeout(400);
    await p.goto(`${SITE}${CAMINHO[l]}?servico=revisao&tema=hooldus`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    ok(`${nome}: com um chip marcado, o rascunho (pneu) vence o link`, (await etapa(p)) === 'detalhe' && (await p.getByTestId('detalhe-tipo').innerText()).includes('🛞') && (await p.getByTestId('chip-servico').locator('[aria-pressed=true], [aria-checked=true]').count()) >= 0, await p.getByTestId('detalhe-tipo').innerText());
    await ctx.close();
  }

  // ---------- (d) servico invalido = sem parametro ----------
  for (const q of ['servico=xyz', 'servico=', 'servico=REVISAO', 'servico=xyz&tema=nada', 'servico=constructor&tema=constructor', 'servico=toString']) {
    const l = 'et'; const nome = `(d) ?${q}`;
    const { ctx, p, funil, erros } = await contexto(l, 390, 844);
    await p.goto(`${SITE}${CAMINHO[l]}?${q}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
    ok(`${nome}: passo 1, 8 cartoes, nenhum marcado, sem dica, funil so 'abriu'`, (await etapa(p)) === 'servico' && (await p.getByTestId('passo-servico').locator('button').count()) === 8 && (await p.getByTestId('passo-servico').locator('button[aria-pressed=true]').count()) === 0 && (await p.getByTestId('tema-dica').count()) === 0 && funil.join(',') === 'abriu', funil.join(','));
    ok(`${nome}: sem erro de JS`, !erros.length, erros.join(' | '));
    await ctx.close();
  }

  // ---------- funil: o servidor aceita 'servico_prefill' (banco local) ----------
  {
    const dia = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Tallinn' });
    const antes = (await admin.from('funil_contagem').select('total').eq('dia', dia).eq('funil', 'pedido_site').eq('etapa', 'servico_prefill').maybeSingle()).data?.total || 0;
    await fetch(SITE + '/api/funil', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': ip() }, body: JSON.stringify({ funil: 'pedido_site', etapa: 'servico_prefill' }) });
    const depois = (await admin.from('funil_contagem').select('total').eq('dia', dia).eq('funil', 'pedido_site').eq('etapa', 'servico_prefill').maybeSingle()).data?.total || 0;
    ok(`/api/funil grava servico_prefill no banco local (${antes} -> ${depois})`, depois === antes + 1);
  }
} catch (e) {
  falhas++;
  console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  for (const id of contas) {
    const { data: sols } = await admin.from('solicitacoes').select('id').eq('cliente_id', id);
    for (const s of sols || []) { await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', s.id); await admin.from('solicitacao_fotos').delete().eq('solicitacao_id', s.id); }
    await admin.from('solicitacoes').delete().eq('cliente_id', id);
    await admin.from('veiculos').delete().eq('profile_id', id);
    await admin.from('pedidos_pendentes').delete().eq('user_id', id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`fotos em ${OUT}`);
  console.log(`${oks} ok, ${falhas} falha(s)`);
  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
}
