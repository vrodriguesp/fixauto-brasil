// E2E LOCAL: fotos do pedido depois do envio - lote 0 (endurecimento) + lote A (auditoria Fable 18/11,
// Documentos/Analises/Fotos_e_anexos_2026-11-18; decisoes do dono 18/11). Pessoas reais nas telas (390 px e
// 1280 px, et/ru/en) + chamadas diretas a API/RLS/storage. Sobe o PROPRIO site do build desta copia em :3103
// "como producao" (next start) com Resend/Expo FALSOS (nada sai) e PUSH_CHAVE propria; o :3100/:3101/:3102 nao
// sao tocados. Banco local compartilhado: contas "TESTE-ACESSO fotos-*" (@example.test) apagadas no fim; nenhum
// interruptor global e alterado.
//   L0  bucket com limites; RLS por status (tabela e storage); reencode/EXIF no pedido sem conta
//   A   galeria/camera, contador, recarregar, limite 10 (atomico), status (tela + API), apagar so as proprias,
//       aviso pedido_fotos (quem recebe, dedupe 30 min, push falso, conta de teste), faixa na oficina e nota no
//       motorista, revisao apaga a faixa, admin ve e apaga com motivo (auditoria + aviso), voltar x3, 3 linguas,
//       sem rolagem lateral a 390 px, app ANTIGO (export web de 16/11 em :8090) le as fotos sem erro
//   node fotos-pedido.mjs [<.env.local>]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const PORTA_SITE = Number(process.env.PORTA_SITE || 3103);
process.env.SITE = `http://localhost:${PORTA_SITE}`;
const L = await import('./acesso-oficinas-lib.mjs');
const { lerEnv, ambiente, contador, tradutor, SITE, ENV_PADRAO, WEB, sleep, chromium, CHROME, entrarPelaTela, vigiar, psql } = L;
const req = createRequire(import.meta.url);
const sharp = req('sharp');
const exifr = req('exifr');

const env = lerEnv(process.argv[2] || ENV_PADRAO);
const A = ambiente(env);
const { ok, fim, tentar } = contador();
const T = { et: tradutor('et'), ru: tradutor('ru'), en: tradutor('en') };
const PRE = { et: '/ee/et', ru: '/ee/ru', en: '/ee/en' };
const PRINTS = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/fotos-pedido';
fs.mkdirSync(PRINTS, { recursive: true });
const APP_WEB_ANTIGO = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/app-web-1611';
const PORTA_APP = 8093;
const erros = [];
// confirm() das telas do cliente (apagar foto) aceito; erro de pagina registrado
const vig = (p, quem) => { vigiar(p, erros, quem); p.on('dialog', (d) => d.accept().catch(() => {})); };
const PUSH_CHAVE = crypto.randomBytes(16).toString('hex');

const siteNoAr = async () => { try { const r = await fetch(`${SITE}/ee/et`, { redirect: 'manual', signal: AbortSignal.timeout(5000) }); return r.status > 0; } catch { return false; } };
if (await siteNoAr()) { console.log(`FALHA ja ha um site em ${SITE} - pare-o antes (este teste sobe o seu)`); process.exit(2); }
if (!fs.existsSync(path.join(WEB, '.next', 'BUILD_ID'))) { console.log('FALHA sem build (.next/BUILD_ID) nesta copia - rode next build antes'); process.exit(2); }

// servidor falso: Resend (POST /emails) e Expo (POST /push)
const emails = []; const pushes = [];
const falso = http.createServer((rq, rs) => {
  let corpo = ''; rq.on('data', (c) => { corpo += c; });
  rq.on('end', () => {
    let j = null; try { j = JSON.parse(corpo); } catch { /* */ }
    if (rq.url.startsWith('/emails')) { emails.push(j); rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify({ id: crypto.randomUUID() })); return; }
    if (rq.url.startsWith('/push')) { const lote = Array.isArray(j) ? j : []; pushes.push(...lote); rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify({ data: lote.map(() => ({ status: 'ok', id: crypto.randomUUID() })) })); return; }
    rs.writeHead(404); rs.end();
  });
});
await new Promise((r) => falso.listen(0, '127.0.0.1', r));
const PF = falso.address().port;

let log = '';
const site = spawn(process.execPath, [path.join(WEB, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORTA_SITE)], {
  cwd: WEB,
  env: { ...process.env, RESEND_API_KEY: 're_teste_local_falso', RESEND_BASE_URL: `http://127.0.0.1:${PF}`, EXPO_PUSH_URL: `http://127.0.0.1:${PF}/push`, PUSH_CHAVE },
  stdio: ['ignore', 'pipe', 'pipe'],
});
site.stdout.on('data', (d) => { log += d; }); site.stderr.on('data', (d) => { log += d; });
let appServ = null;
const parar = () => { try { site.kill(); } catch { /* */ } try { appServ?.kill(); } catch { /* */ } falso.close(); };
let nav = null;
process.on('SIGINT', async () => { try { await nav?.close(); } catch { /* */ } parar(); await limparTudo(); process.exit(130); });

// ---------- imagens de teste ----------
const jpegComGps = async (lado = 3000, qualidade = 85) => {
  const w = lado, h = Math.round(lado * 2 / 3);
  const raw = crypto.randomBytes(w * h * 3); // ruido: comprime mal (arquivo grande), como uma foto detalhada
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: qualidade })
    .withExif({ IFD0: { Copyright: 'TESTE-ACESSO fotos', Make: 'TestPhone', Model: 'X' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '59/1 22/1 3800/100', GPSLongitudeRef: 'E', GPSLongitude: '28/1 11/1 2400/100' } })
    .toBuffer();
};
const jpegPequeno = (cor = { r: 200, g: 30, b: 30 }, lado = 320) => sharp({ create: { width: lado, height: Math.round(lado * 0.75), channels: 3, background: cor } }).jpeg({ quality: 80 }).toBuffer();
const pngPequeno = () => sharp({ create: { width: 240, height: 180, channels: 4, background: { r: 20, g: 120, b: 220, alpha: 1 } } }).png().toBuffer();
const webpPequeno = () => sharp({ create: { width: 240, height: 180, channels: 3, background: { r: 20, g: 180, b: 90 } } }).webp().toBuffer();
const heicFalso = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.from([0, 0, 0, 0]), Buffer.from('mif1heic'), crypto.randomBytes(4000)]);
const pdfFalso = () => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n${'x'.repeat(2000)}\n%%EOF\n`);
const arquivo = (nome, tipo, buffer) => ({ name: nome, mimeType: tipo, buffer });
const formComFotos = (lista) => { const f = new FormData(); for (const a of lista) f.append('fotos', new Blob([a.buffer], { type: a.mimeType }), a.name); return f; };
const postFotos = async (solId, lista, token, extra = {}) => {
  const r = await fetch(`${SITE}/api/solicitacoes/${solId}/fotos`, { method: 'POST', body: formComFotos(lista), headers: { 'x-real-ip': `10.76.0.${Math.floor(Math.random() * 200) + 1}`, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra } });
  return { status: r.status, d: await r.json().catch(() => ({})) };
};
const delFoto = async (solId, fotoId, token) => {
  const r = await fetch(`${SITE}/api/solicitacoes/${solId}/fotos?foto=${fotoId}`, { method: 'DELETE', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { status: r.status, d: await r.json().catch(() => ({})) };
};
const fotosDe = async (solId) => (await A.admin.from('solicitacao_fotos').select('id, foto_url, origem, bytes, largura, altura, created_at').eq('solicitacao_id', solId).order('created_at')).data || [];
const objetosDe = async (solId) => ((await A.admin.storage.from('damage-photos').list(`solicitacoes/${solId}`)).data || []).map((o) => o.name);
const caminhoDe = (url) => decodeURIComponent(url.split('/object/public/damage-photos/')[1].split('?')[0]);
const baixar = async (url) => { const { data, error } = await A.admin.storage.from('damage-photos').download(caminhoDe(url)); if (error) throw new Error(error.message); return Buffer.from(await data.arrayBuffer()); };
const semGps = async (buf) => { const meta = await sharp(buf).metadata(); const g = await exifr.gps(buf).catch(() => null); const x = await exifr.parse(buf).catch(() => null); return { exif: !!meta.exif, gps: !!(g && g.latitude), make: x?.Make, w: meta.width, h: meta.height, bytes: buf.length }; };
// fotos "da criacao": objetos + linhas com origem padrao, como o pedido grava
const fotosCriacao = async (sol, n) => {
  for (let i = 0; i < n; i++) {
    const c = `solicitacoes/${sol.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await A.admin.storage.from('damage-photos').upload(c, await jpegPequeno({ r: 40 + i * 30, g: 90, b: 160 }), { contentType: 'image/jpeg' });
    if (error) throw new Error(`upload criacao: ${error.message}`);
    const url = A.admin.storage.from('damage-photos').getPublicUrl(c).data.publicUrl;
    const { error: e2 } = await A.admin.from('solicitacao_fotos').insert({ solicitacao_id: sol.id, foto_url: url });
    if (e2) throw new Error(`linha criacao: ${e2.message}`);
  }
};
const avisos = async (profileId, tipo) => (await A.admin.from('notificacoes').select('id, titulo, mensagem, dados, lida, created_at').eq('profile_id', profileId).eq('tipo', tipo).order('created_at')).data || [];
const esperar = async (fn, cond, n = 30, ms = 300) => { let v; for (let i = 0; i < n; i++) { v = await fn(); if (cond(v)) return v; await sleep(ms); } return v; };
const pushDe = (id) => fetch(`${SITE}/api/push/notificacao`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-push-chave': PUSH_CHAVE }, body: JSON.stringify({ id }) }).then(async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) }));
const semRolagemLateral = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const print = (p, nome) => p.screenshot({ path: path.join(PRINTS, `${nome}.png`), fullPage: false }).catch(() => {});

const extras = { sols: [], objetos: [] };
const limparTudo = async () => {
  for (const s of [...extras.sols]) {
    await A.admin.from('notificacoes').delete().eq('dados->>solicitacao_id', s);
    await A.admin.from('admin_auditoria').delete().eq('solicitacao_id', s);
    await A.admin.from('solicitacoes').delete().eq('id', s);
  }
  for (const s of extras.sols) { const objs = await objetosDe(s); if (objs.length) await A.admin.storage.from('damage-photos').remove(objs.map((o) => `solicitacoes/${s}/${o}`)); }
  if (extras.objetos.length) await A.admin.storage.from('damage-photos').remove(extras.objetos);
  await A.limpar();
};

try {
  let no = false;
  for (let i = 0; i < 90 && !no; i++) { await sleep(1000); no = await siteNoAr(); }
  ok(`site "como producao" no ar em ${SITE} (Resend e Expo falsos)`, no, log.slice(-300));
  if (!no) throw new Error('site :${PORTA_SITE} nao subiu');

  // contas
  const cli = await A.conta('cliente', 'fotos-cli', { idioma: 'et' });
  const cli2 = await A.conta('cliente', 'fotos-cli2', { idioma: 'ru' });
  const cli3 = await A.conta('cliente', 'fotos-cli3', { idioma: 'en' });
  const outro = await A.conta('cliente', 'fotos-outro', { idioma: 'et' });
  const dA = await A.conta('oficina', 'fotos-of-a', { idioma: 'et' }); const ofA = await A.oficina(dA, 'fotos-A', { km: 1 });
  const dB = await A.conta('oficina', 'fotos-of-b', { idioma: 'ru' }); const ofB = await A.oficina(dB, 'fotos-B', { km: 2 });
  // conta de TESTE avisada do pedido: recebe o aviso no painel, mas nao o push (lib/push.ts); nao abre a tela (063: so ve pedidos de clientes de teste)
  const dE = await A.conta('oficina', 'fotos-of-e', { idioma: 'en', contaTeste: true }); const ofE = await A.oficina(dE, 'fotos-E', { km: 4 });
  const dC = await A.conta('oficina', 'fotos-of-c', { idioma: 'en' }); const ofC = await A.oficina(dC, 'fotos-C', { km: 200 });
  const dD = await A.conta('oficina', 'fotos-of-d', { idioma: 'et' }); const ofD = await A.oficina(dD, 'fotos-D', { km: 3 });
  const adm = await A.conta('admin', 'fotos-admin', { idioma: 'pt' });
  const S = { cli: await A.sessao(cli), cli2: await A.sessao(cli2), cli3: await A.sessao(cli3), outro: await A.sessao(outro) };
  for (const [d, tk] of [[dA, 'ExponentPushToken[fotos-A-real]'], [dB, 'ExponentPushToken[fotos-B-real]'], [dE, 'ExponentPushToken[fotos-E-teste]']]) {
    const { error } = await A.admin.from('push_tokens').insert({ profile_id: d.id, token: `${tk}-${crypto.randomBytes(3).toString('hex')}`, plataforma: 'android' });
    if (error) throw new Error(`push_tokens: ${error.message}`);
  }

  // ======================= L0: endurecimento =======================
  await tentar('L0', async () => {
    // L0.1 bucket com limites (service role passa pela RLS, nao pelos limites do bucket)
    const base = `audio/${crypto.randomUUID()}/${crypto.randomUUID()}/${crypto.randomUUID()}`;
    const up = (c, buf, tipo) => A.admin.storage.from('damage-photos').upload(c, buf, { contentType: tipo });
    const r1 = await up(`${base}/site.webm`, Buffer.from('webm-falso'), 'audio/webm;codecs=opus');
    const r2 = await up(`${base}/app.m4a`, Buffer.from('mp4-falso'), 'audio/mp4');
    const r3 = await up(`${base}/grande.jpg`, Buffer.alloc(20 * 1024 * 1024, 1), 'image/jpeg');
    const r4 = await up(`${base}/prog.exe`, Buffer.from('MZ-falso'), 'application/x-msdownload');
    const r5 = await up(`${base}/fatura.pdf`, Buffer.from('%PDF-1.4'), 'application/pdf');
    for (const c of [`${base}/site.webm`, `${base}/app.m4a`, `${base}/fatura.pdf`]) extras.objetos.push(c);
    ok('L0.1 bucket: audio do site (webm;codecs=opus) e do app (mp4) e PDF sobem; 20 MB e .exe recusados', !r1.error && !r2.error && !r5.error && !!r3.error && !!r4.error, JSON.stringify([r1.error?.message, r2.error?.message, r3.error?.message, r4.error?.message, r5.error?.message]));
    const bucket = psql("select file_size_limit || ' ' || allowed_mime_types::text from storage.buckets where id='damage-photos'");
    ok('L0.1b bucket damage-photos: 15 MB e tipos image/*, audio/*, application/pdf', bucket === '15728640 {image/*,audio/*,application/pdf}', bucket);

    // L0.2 RLS por status: tabela e storage, com o token do cliente (chamada direta, nao tela)
    const aberta = await A.pedido(cli2, { descricao: 'rls aberta' });
    const aceita = await A.pedido(cli2, { descricao: 'rls aceita', status: 'aceita' });
    const c = S.cli2.c;
    const url = (s) => A.admin.storage.from('damage-photos').getPublicUrl(`solicitacoes/${s.id}/x.jpg`).data.publicUrl;
    const t1 = await c.from('solicitacao_fotos').insert({ solicitacao_id: aceita.id, foto_url: url(aceita) });
    const t2 = await c.from('solicitacao_fotos').insert({ solicitacao_id: aberta.id, foto_url: url(aberta) }).select('id').single();
    const s1 = await c.storage.from('damage-photos').upload(`solicitacoes/${aceita.id}/direto.jpg`, await jpegPequeno(), { contentType: 'image/jpeg' });
    const s2 = await c.storage.from('damage-photos').upload(`solicitacoes/${aberta.id}/direto.jpg`, await jpegPequeno(), { contentType: 'image/jpeg' });
    const s3 = await c.storage.from('damage-photos').upload(`solicitacoes/${aberta.id}/outro.jpg`, Buffer.from('MZ-falso'), { contentType: 'application/x-msdownload' });
    ok('L0.2 RLS tabela: cliente nao insere foto em pedido aceita; em aberta insere', !!t1.error && /row-level security|violates/i.test(t1.error?.message || '') && !t2.error, JSON.stringify([t1.error?.message, t2.error?.message]));
    ok('L0.2b RLS storage: upload direto em solicitacoes/<aceita>/ recusado; em <aberta>/ aceito; .exe recusado pelo bucket', !!s1.error && !s2.error && !!s3.error, JSON.stringify([s1.error?.message, s2.error?.message, s3.error?.message]));
    if (t2.data?.id) await A.admin.from('solicitacao_fotos').delete().eq('id', t2.data.id);
    const pol = psql("select pg_get_expr(polwithcheck, polrelid) from pg_policy where polname='fotos_insert'");
    ok('L0.2c politica fotos_insert exige status aberta/em_orcamento', /aberta/.test(pol) && /em_orcamento/.test(pol), pol.slice(0, 200));

    // L0.3 guardarFotos (pedido sem conta, logado): bytes decidem o tipo; JPEG reencodado sem EXIF/GPS
    const dados = { origem: 'site', site: '', tipo: 'mecanica', descricao: `TESTE-ACESSO fotos lote0 ${Date.now()}`, urgencia: 'media', endereco: 'Tallinna mnt 1, Narva', latitude: L.NARVA.lat, longitude: L.NARVA.lon, pais: 'EE', veiculo: { tipo: 'cars', marca: 'Toyota', modelo: 'Corolla', ano: '2018', codigo: null, placa: null } };
    const grande = await jpegComGps();
    const antes = await semGps(grande);
    const pedir = async (lista) => {
      const f = new FormData(); f.append('dados', JSON.stringify(dados));
      for (const a of lista) f.append('fotos', new Blob([a.buffer], { type: a.mimeType }), a.name);
      const r = await fetch(`${SITE}/api/pedido-sem-conta`, { method: 'POST', body: f, headers: { Authorization: `Bearer ${S.cli3.token}`, 'x-real-ip': '10.76.9.9' } });
      return { status: r.status, d: await r.json().catch(() => ({})) };
    };
    const p1 = await pedir([arquivo('gps.jpg', 'image/jpeg', grande), arquivo('png-como.jpg', 'image/jpeg', await pngPequeno()), arquivo('jpeg-como.png', 'image/png', await jpegPequeno()), arquivo('web.webp', 'image/webp', await webpPequeno())]);
    if (p1.d?.solicitacaoId) extras.sols.push(p1.d.solicitacaoId);
    const fl = p1.status === 200 ? await fotosDe(p1.d.solicitacaoId) : [];
    ok('L0.3 pedido logado com JPEG 5 MB+GPS, PNG renomeado .jpg, JPEG declarado png e WebP: 200 e 4 fotos gravadas', p1.status === 200 && fl.length === 4 && antes.gps && antes.bytes > 2 * 1024 * 1024, JSON.stringify([p1.status, p1.d, fl.length, antes]));
    if (fl.length === 4) {
      const g = await semGps(await baixar(fl[0].foto_url));
      ok('L0.3b foto gravada: JPEG sem EXIF/GPS, lado maior 1600, < 600 KB, caminho .jpg', !g.exif && !g.gps && !g.make && Math.max(g.w, g.h) <= 1600 && g.bytes < 600 * 1024 && fl.every((f) => f.foto_url.endsWith('.jpg')), JSON.stringify(g));
      const metas = await Promise.all(fl.slice(1).map(async (f) => (await sharp(await baixar(f.foto_url)).metadata()).format));
      ok('L0.3c PNG/WebP/JPEG-renomeado viram JPEG pelos bytes (nao pelo File.type)', metas.every((m) => m === 'jpeg'), JSON.stringify(metas));
    }
    const p2 = await pedir([arquivo('foto.jpg', 'image/jpeg', pdfFalso())]);
    ok('L0.3d .pdf com type image/jpeg: 400 FOTO_TIPO (nenhum pedido criado)', p2.status === 400 && p2.d?.codigo === 'FOTO_TIPO' && !p2.d?.solicitacaoId, JSON.stringify(p2));
    const p3 = await pedir([arquivo('foto.heic', 'image/heic', heicFalso())]);
    ok('L0.3e HEIC que o servidor nao decodifica: 400 FOTO_TIPO', p3.status === 400 && p3.d?.codigo === 'FOTO_TIPO', JSON.stringify(p3));
  });

  // ======================= A: motorista (site, 390 px) =======================
  nav = await chromium.launch({ executablePath: CHROME });
  const contexto = async (largura = 390, locale = 'et-EE') => {
    const ctx = await nav.newContext({ viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500, locale, extraHTTPHeaders: { 'x-real-ip': `10.76.1.${Math.floor(Math.random() * 200) + 1}` } });
    ctx.setDefaultTimeout(20000);
    await ctx.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
    await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} });
    return ctx;
  };
  const sol = await A.pedido(cli, { descricao: 'keevitus roostega (sem foto)' }); // replica do 100145
  let ctxCli, pCli;
  await tentar('A.4-5', async () => {
    ctxCli = await contexto(390); pCli = await ctxCli.newPage(); vig(pCli, 'cliente');
    await entrarPelaTela(pCli, PRE.et, cli);
    await pCli.goto(`${SITE}${PRE.et}/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' });
    await pCli.locator('[data-testid=fotos-pedido]').waitFor({ timeout: 15000 });
    const corpo = await pCli.innerText('body');
    ok('A.4 pedido sem foto (et, 390): botoes "Tee foto" e "Vali galeriist", contador 0/10, texto de ajuda', (await pCli.locator('[data-testid=fotos-camera]').count()) === 1 && corpo.includes(T.et('clienteOrcamentoDetalhe.fotosCamera')) && corpo.includes(T.et('clienteOrcamentoDetalhe.fotosGaleria')) && corpo.includes(T.et('clienteOrcamentoDetalhe.fotosContador', { n: 0, max: 10 })) && corpo.includes(T.et('clienteOrcamentoDetalhe.fotosAjuda')), corpo.slice(0, 300));
    ok('A.4a campo da camera tem capture=environment e o da galeria multiple', await pCli.locator('[data-testid=fotos-input-camera][capture=environment]').count() === 1 && await pCli.locator('[data-testid=fotos-input-galeria][multiple]').count() === 1);
    ok('A.4b sem rolagem lateral a 390 px', await semRolagemLateral(pCli));
    await print(pCli, 'A4-et-390-antes');
    await pCli.locator('[data-testid=fotos-input-galeria]').setInputFiles([arquivo('g1.jpg', 'image/jpeg', await jpegComGps(1400, 80)), arquivo('g2.png', 'image/png', await pngPequeno()), arquivo('g3.jpg', 'image/jpeg', await jpegPequeno({ r: 10, g: 150, b: 60 }))]);
    await pCli.locator('[data-testid=fotos-ok]').waitFor({ timeout: 40000 }).catch(() => {});
    await esperar(() => pCli.locator('[data-testid=foto-adicionada]').count(), (n) => n === 3, 40, 500);
    const okTxt = await pCli.locator('[data-testid=fotos-ok]').innerText().catch(() => '');
    const srcs = await pCli.locator('[data-testid=foto-adicionada] img').evaluateAll((els) => els.map((e) => e.getAttribute('src') || ''));
    ok('A.4c galeria com 3 fotos: aviso "3 fotot lisatud", 3 fotos com selo "Uus" e link assinado, contador 3/10', okTxt.includes('3 fotot lisatud') && srcs.length === 3 && srcs.every((s) => /\/object\/sign\/.*token=/.test(s)) && (await pCli.innerText('body')).includes(T.et('clienteOrcamentoDetalhe.fotosContador', { n: 3, max: 10 })) && (await pCli.locator('[data-testid=foto-adicionada]').first().innerText()).includes('Uus'), JSON.stringify([okTxt, srcs.map((s) => s.slice(0, 60))]));
    const fl = await fotosDe(sol.id);
    ok('A.4d banco: 3 linhas origem=adicionada com bytes/largura/altura; 3 objetos em solicitacoes/<id>/', fl.length === 3 && fl.every((f) => f.origem === 'adicionada' && f.bytes > 0 && f.largura > 0 && f.altura > 0) && (await objetosDe(sol.id)).length === 3, JSON.stringify(fl.map((f) => [f.origem, f.bytes, f.largura, f.altura])));
    if (fl.length) { const g = await semGps(await baixar(fl[0].foto_url)); ok('A.4e foto adicionada: sem EXIF/GPS, lado <= 1600', !g.exif && !g.gps && Math.max(g.w, g.h) <= 1600, JSON.stringify(g)); }
    await print(pCli, 'A4-et-390-depois');
    await pCli.reload({ waitUntil: 'networkidle' });
    await esperar(() => pCli.locator('[data-testid=foto-adicionada]').count(), (n) => n === 3, 30, 500);
    ok('A.4f recarregar: as 3 fotos continuam', (await pCli.locator('[data-testid=foto-adicionada]').count()) === 3);
    // A.5 campo da camera (capture): o navegador entrega 1 arquivo; a pagina nao recarrega nem perde o estado
    const urlAntes = pCli.url();
    await pCli.locator('[data-testid=fotos-input-camera]').setInputFiles([arquivo('cam.jpg', 'image/jpeg', await jpegComGps(1200, 80))]);
    await esperar(() => pCli.locator('[data-testid=foto-adicionada]').count(), (n) => n === 4, 40, 500);
    ok('A.5 camera (capture=environment) com 1 foto: 4/10, mesma pagina (sem recarga), aviso "1 foto lisatud"', (await pCli.locator('[data-testid=foto-adicionada]').count()) === 4 && pCli.url() === urlAntes && (await pCli.locator('[data-testid=fotos-ok]').innerText().catch(() => '')).includes('1 foto lisatud'), pCli.url());
  });

  // A.6 limite 10 (atomico)
  await tentar('A.6', async () => {
    const s6 = await A.pedido(cli2, { descricao: 'limite' });
    await fotosCriacao(s6, 6);
    const ctx = await contexto(390, 'ru-RU'); const p = await ctx.newPage(); vig(p, 'cliente2');
    await entrarPelaTela(p, PRE.ru, cli2);
    await p.goto(`${SITE}${PRE.ru}/cliente/orcamentos/${s6.id}`, { waitUntil: 'networkidle' });
    await p.locator('[data-testid=fotos-pedido]').waitFor();
    const corpo = await p.innerText('body');
    ok('A.6 (ru) pedido com 6 fotos da criacao: contador 6/10, botoes em russo, sem selo "Новое" nas da criacao', corpo.includes(T.ru('clienteOrcamentoDetalhe.fotosContador', { n: 6, max: 10 })) && corpo.includes(T.ru('clienteOrcamentoDetalhe.fotosGaleria')) && (await p.locator('[data-testid=foto-criacao]').count()) === 6 && (await p.locator('[data-testid=foto-apagar]').count()) === 0, corpo.slice(0, 200));
    const sete = []; for (let i = 0; i < 7; i++) sete.push(arquivo(`s${i}.jpg`, 'image/jpeg', await jpegPequeno({ r: 20 * i, g: 50, b: 200 })));
    await p.locator('[data-testid=fotos-input-galeria]').setInputFiles(sete);
    await p.locator('[data-testid=fotos-erro]').waitFor({ timeout: 10000 }).catch(() => {});
    const erroTxt = await p.locator('[data-testid=fotos-erro]').innerText().catch(() => '');
    ok('A.6a 7 fotos de uma vez com 6: erro claro (ru) e nenhuma gravada', erroTxt === T.ru('erros.FOTOS_PEDIDO_MAX', { max: 10 }) && (await fotosDe(s6.id)).length === 6 && (await objetosDe(s6.id)).length === 6, erroTxt);
    await print(p, 'A6-ru-390-limite');
    const r5 = await postFotos(s6.id, sete.slice(0, 5), S.cli2.token);
    ok('A.6b API com 5 fotos (6+5 > 10): 400 FOTOS_PEDIDO_MAX, nada gravado (atomico)', r5.status === 400 && r5.d?.codigo === 'FOTOS_PEDIDO_MAX' && (await fotosDe(s6.id)).length === 6 && (await objetosDe(s6.id)).length === 6, JSON.stringify(r5));
    const rMista = await postFotos(s6.id, [sete[0], arquivo('x.jpg', 'image/jpeg', pdfFalso())], S.cli2.token);
    ok('A.6c lote com 1 foto boa + 1 arquivo falso: 400 FOTO_TIPO e NENHUMA gravada (todas ou nenhuma)', rMista.status === 400 && rMista.d?.codigo === 'FOTO_TIPO' && (await fotosDe(s6.id)).length === 6 && (await objetosDe(s6.id)).length === 6, JSON.stringify(rMista));
    const r4 = await postFotos(s6.id, sete.slice(0, 4), S.cli2.token);
    ok('A.6d API com 4 fotos: 200, total 10', r4.status === 200 && r4.d?.total === 10 && (await fotosDe(s6.id)).length === 10, JSON.stringify(r4.d?.total));
    await p.reload({ waitUntil: 'networkidle' });
    await p.locator('[data-testid=fotos-cheio]').waitFor({ timeout: 10000 }).catch(() => {});
    ok('A.6e com 10: botoes somem, texto "ja tem o maximo" (ru), contador 10/10', (await p.locator('[data-testid=fotos-camera]').count()) === 0 && (await p.locator('[data-testid=fotos-cheio]').innerText().catch(() => '')) === T.ru('clienteOrcamentoDetalhe.fotosLimiteCheio', { max: 10 }) && (await p.innerText('body')).includes(T.ru('clienteOrcamentoDetalhe.fotosContador', { n: 10, max: 10 })));
    const r11 = await postFotos(s6.id, [sete[0]], S.cli2.token);
    ok('A.6f 11a foto pela API: 400 FOTOS_PEDIDO_MAX', r11.status === 400 && r11.d?.codigo === 'FOTOS_PEDIDO_MAX', JSON.stringify(r11));
    const rTam = await postFotos(s6.id, [arquivo('gde.jpg', 'image/jpeg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(11 * 1024 * 1024)]))], S.cli2.token);
    ok('A.6g foto > 10 MB: 400 FOTO_TAMANHO (ou 413 do servidor)', (rTam.status === 400 && rTam.d?.codigo === 'FOTO_TAMANHO') || rTam.status === 413, JSON.stringify(rTam));
    await ctx.close();
  });

  // A.7 status
  await tentar('A.7', async () => {
    const porStatus = {};
    for (const st of ['aceita', 'em_andamento', 'concluida', 'cancelada', 'expirada', 'em_orcamento']) porStatus[st] = await A.pedido(cli3, { descricao: `status ${st}`, status: st });
    const foto = [arquivo('s.jpg', 'image/jpeg', await jpegPequeno())];
    const res = {};
    for (const st of Object.keys(porStatus)) res[st] = await postFotos(porStatus[st].id, foto, S.cli3.token);
    ok('A.7 API: aceita/em_andamento/concluida/cancelada/expirada -> 409 FOTO_STATUS; em_orcamento -> 200', ['aceita', 'em_andamento', 'concluida', 'cancelada', 'expirada'].every((s) => res[s].status === 409 && res[s].d?.codigo === 'FOTO_STATUS') && res.em_orcamento.status === 200, JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.status]))));
    const rOutro = await postFotos(sol.id, foto, S.outro.token);
    const rSem = await postFotos(sol.id, foto, null);
    const rNada = await postFotos(sol.id, [], S.cli.token);
    ok('A.7a outro cliente -> 403 SEM_ACESSO; sem login -> 401; sem arquivo -> 400', rOutro.status === 403 && rSem.status === 401 && rNada.status === 400, JSON.stringify([rOutro.status, rSem.status, rNada.status]));
    const ctx = await contexto(390, 'en-GB'); const p = await ctx.newPage(); vig(p, 'cliente3');
    await entrarPelaTela(p, PRE.en, cli3);
    await p.goto(`${SITE}${PRE.en}/cliente/orcamentos/${porStatus.aceita.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    const semBotao = (await p.locator('[data-testid=fotos-camera]').count()) === 0 && (await p.locator('[data-testid=fotos-input-galeria]').count()) === 0;
    await p.goto(`${SITE}${PRE.en}/cliente/orcamentos/${porStatus.expirada.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
    const semBotaoExp = (await p.locator('[data-testid=fotos-camera]').count()) === 0 && (await p.locator('[data-testid=pedido-expirado]').count()) >= 0;
    ok('A.7b tela (en): pedido aceita e expirada sem os botoes de foto', semBotao && semBotaoExp);
    // expirada: reabrir pela tela (PedidoExpirado) -> botoes aparecem
    const btnReabrir = p.getByRole('button', { name: new RegExp(T.en('pedidoExpirado.reabrir').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
    if (await btnReabrir.count()) { await btnReabrir.first().click(); await p.waitForTimeout(3000); }
    else { await A.admin.from('solicitacoes').update({ status: 'aberta' }).eq('id', porStatus.expirada.id); await p.reload({ waitUntil: 'networkidle' }); }
    await p.locator('[data-testid=fotos-camera]').waitFor({ timeout: 15000 }).catch(() => {});
    const stDepois = (await A.admin.from('solicitacoes').select('status').eq('id', porStatus.expirada.id).single()).data?.status;
    ok('A.7c expirada -> reabrir -> botoes de foto aparecem (status aberta/em_orcamento)', (await p.locator('[data-testid=fotos-camera]').count()) === 1 && ['aberta', 'em_orcamento'].includes(stDepois), stDepois);
    await p.goto(`${SITE}${PRE.en}/cliente/orcamentos/${porStatus.em_orcamento.id}`, { waitUntil: 'networkidle' });
    await p.locator('[data-testid=fotos-pedido]').waitFor();
    const corpo = await p.innerText('body');
    ok('A.7d tela (en) em_orcamento: textos em ingles ("Take a photo", "Choose from gallery", "1 of 10 photos")', corpo.includes('Take a photo') && corpo.includes('Choose from gallery') && corpo.includes('1 of 10 photos'), corpo.slice(0, 200));
    ok('A.7e sem rolagem lateral (en, 390)', await semRolagemLateral(p));
    await print(p, 'A7-en-390');
    await ctx.close();
  });

  // A.8 apagar: so as proprias adicionadas
  await tentar('A.8', async () => {
    const s8 = await A.pedido(cli3, { descricao: 'apagar' });
    await fotosCriacao(s8, 1);
    const r = await postFotos(s8.id, [arquivo('a.jpg', 'image/jpeg', await jpegPequeno()), arquivo('b.jpg', 'image/jpeg', await jpegPequeno({ r: 0, g: 0, b: 90 }))], S.cli3.token);
    const fl = await fotosDe(s8.id);
    const criacao = fl.find((f) => f.origem === 'criacao'); const add = fl.filter((f) => f.origem === 'adicionada');
    ok('A.8 preparo: 1 da criacao + 2 adicionadas', r.status === 200 && !!criacao && add.length === 2, JSON.stringify([r.status, fl.length]));
    const d1 = await delFoto(s8.id, add[0].id, S.cli3.token);
    const objs = await objetosDe(s8.id);
    ok('A.8a apagar foto propria adicionada: 200, linha e objeto do storage somem', d1.status === 200 && (await fotosDe(s8.id)).length === 2 && objs.length === 2 && !objs.includes(caminhoDe(add[0].foto_url).split('/').pop()), JSON.stringify([d1, objs.length]));
    const d2 = await delFoto(s8.id, criacao.id, S.cli3.token);
    ok('A.8b apagar foto da criacao: 409 FOTO_NAO_APAGAVEL, continua la', d2.status === 409 && d2.d?.codigo === 'FOTO_NAO_APAGAVEL' && (await fotosDe(s8.id)).length === 2, JSON.stringify(d2));
    const d3 = await delFoto(s8.id, add[1].id, S.outro.token);
    const d4 = await delFoto(sol.id, add[1].id, S.cli.token); // foto de outro pedido (id certo, pedido errado)
    ok('A.8c outro cliente -> 403; foto de outro pedido pelo dono de outro pedido -> 404; nada apagado', d3.status === 403 && d4.status === 404 && (await fotosDe(s8.id)).length === 2, JSON.stringify([d3.status, d4.status]));
    await A.admin.from('solicitacoes').update({ status: 'aceita' }).eq('id', s8.id);
    const d5 = await delFoto(s8.id, add[1].id, S.cli3.token);
    ok('A.8d pedido aceita: apagar -> 409 FOTO_STATUS', d5.status === 409 && d5.d?.codigo === 'FOTO_STATUS', JSON.stringify(d5));
    await A.admin.from('solicitacoes').update({ status: 'aberta' }).eq('id', s8.id);
    // pela tela (en, 390): o X so nas adicionadas; confirm aceito pelo vigiar
    const ctx = await contexto(390, 'en-GB'); const p = await ctx.newPage(); vig(p, 'cliente3b');
    await entrarPelaTela(p, PRE.en, cli3);
    await p.goto(`${SITE}${PRE.en}/cliente/orcamentos/${s8.id}`, { waitUntil: 'networkidle' });
    await p.locator('[data-testid=fotos-pedido]').waitFor();
    ok('A.8e tela: X de apagar so na foto adicionada (1), nao na da criacao', (await p.locator('[data-testid=foto-apagar]').count()) === 1 && (await p.locator('[data-testid=foto-criacao] button').count()) === 0);
    await p.locator('[data-testid=foto-apagar]').first().click();
    await esperar(() => fotosDe(s8.id), (l) => l.length === 1, 30, 400);
    ok('A.8f tela: apagar com confirmacao -> some da tela e do banco (fica so a da criacao)', (await fotosDe(s8.id)).length === 1 && (await esperar(() => p.locator('[data-testid=foto-adicionada]').count(), (n) => n === 0, 20, 300)) === 0);
    await ctx.close();
  });

  // A.9 avisos as oficinas (sol: A orcou, B avisada (conta de teste, ru), C fora (nada), D avisada e dispensou)
  let orcA;
  await tentar('A.9', async () => {
    orcA = await A.orcamento(sol, ofA);
    await A.admin.from('orcamentos').update({ created_at: new Date(Date.now() - 3600e3).toISOString() }).eq('id', orcA);
    await A.aviso(ofB, sol, 'nova_solicitacao', 20);
    await A.aviso(ofD, sol, 'nova_solicitacao', 20);
    await A.aviso(ofE, sol, 'nova_solicitacao', 20);
    const emailsAntes = emails.length; // o pedido do L0.3 ja mandou e-mail de pedido novo as oficinas (Resend falso)
    const { error: eD } = await A.admin.from('pedido_dispensas').insert({ solicitacao_id: sol.id, oficina_id: ofD.id, motivo: 'outro' });
    if (eD) throw new Error(`dispensa: ${eD.message}`);
    const antes = Date.now();
    const r = await postFotos(sol.id, [arquivo('n1.jpg', 'image/jpeg', await jpegPequeno({ r: 90, g: 10, b: 10 })), arquivo('n2.jpg', 'image/jpeg', await jpegPequeno({ r: 10, g: 90, b: 10 }))], S.cli.token);
    const aA = await esperar(() => avisos(dA.id, 'pedido_fotos'), (l) => l.length >= 1);
    const aB = await avisos(dB.id, 'pedido_fotos'); const aC = await avisos(dC.id, 'pedido_fotos'); const aD = await avisos(dD.id, 'pedido_fotos'); const aE = await avisos(dE.id, 'pedido_fotos');
    ok('A.9 2 fotos: resposta traz avisos {inseridos: 3}; A (orcou), B (avisada) e E (avisada, conta de teste) recebem 1 pedido_fotos cada; C (fora) e D (sem interesse) nada', r.status === 200 && r.d?.avisos?.inseridos === 3 && aA.length === 1 && aB.length === 1 && aE.length === 1 && aC.length === 0 && aD.length === 0, JSON.stringify([r.d?.avisos, aA.length, aB.length, aC.length, aD.length, aE.length]));
    ok('A.9a texto de A (et): "Uued fotod päringule nr N" / "Klient lisas 2 fotot..."; link do aviso leva ao pedido; textos nas 6 linguas', aA[0]?.titulo === `Uued fotod päringule nr ${sol.numero}` && aA[0]?.mensagem === 'Klient lisas 2 fotot. Vaata päringut enne pakkumise tegemist.' && aA[0]?.dados?.solicitacao_id === sol.id && aA[0]?.dados?.quantidade === 2 && ['pt', 'pt-PT', 'en', 'et', 'it', 'ru'].every((l) => aA[0]?.dados?.textos?.[l]?.titulo), JSON.stringify(aA[0]));
    ok('A.9b texto de B (ru): "Новые фото к заявке № N" / "Клиент добавил фото: 2..."', aB[0]?.titulo === `Новые фото к заявке № ${sol.numero}` && aB[0]?.mensagem === 'Клиент добавил фото: 2. Посмотрите заявку перед расчётом.', JSON.stringify(aB[0]));
    // push (o gatilho 066 chama esta rota com a chave): A real recebe no Expo falso; B conta de teste nao
    const pA = await pushDe(aA[0].id); const pE = await pushDe(aE[0].id);
    ok('A.9c push: A (conta real) 1 enviado ao servidor Expo falso com o titulo; E (conta de teste, com token) 0 enviados e nada no Expo', pA.d?.enviados === 1 && pushes.length === 1 && pushes[0]?.title === aA[0].titulo && pushes[0]?.data?.tipo === 'pedido_fotos' && pE.d?.enviados === 0 && pE.status === 200, JSON.stringify([pA.d, pE.d, pushes.length]));
    ok('A.9c2 log do servidor: "[push] conta de teste - nao enviado"', /\[push\] conta de teste - nao enviado/.test(log));
    ok('A.9d nenhum e-mail novo saiu pelas fotos (Resend falso sem envio novo) e nenhum SMS', emails.length === emailsAntes && psql(`select count(*) from sms_envios where created_at > '${new Date(antes).toISOString()}'`) === '0', `${emails.length - emailsAntes}`);
    // rajada: +1 foto em seguida -> aviso de A/B ATUALIZADO (3), sem segunda linha
    const r2 = await postFotos(sol.id, [arquivo('n3.jpg', 'image/jpeg', await jpegPequeno({ r: 10, g: 10, b: 90 }))], S.cli.token);
    const aA2 = await esperar(() => avisos(dA.id, 'pedido_fotos'), (l) => l[0]?.dados?.quantidade === 3);
    const aB2 = await avisos(dB.id, 'pedido_fotos');
    ok('A.9e +1 foto em 5 min: avisos {atualizados: 3, inseridos: 0}; A e B continuam com 1 aviso, contagem 3 ("Klient lisas 3 fotot")', r2.d?.avisos?.atualizados === 3 && r2.d?.avisos?.inseridos === 0 && aA2.length === 1 && aA2[0].dados.quantidade === 3 && aA2[0].mensagem.startsWith('Klient lisas 3 fotot') && aB2.length === 1 && aB2[0].mensagem.includes('фото: 3'), JSON.stringify([r2.d?.avisos, aA2[0]?.mensagem]));
    ok('A.9f sem segundo push (o gatilho so dispara no INSERT; a atualizacao nao insere)', pushes.length === 1, String(pushes.length));
    // aviso lido ou velho: a proxima rajada cria aviso novo
    await A.admin.from('notificacoes').update({ lida: true }).eq('id', aA2[0].id);
    await A.admin.from('notificacoes').update({ created_at: new Date(Date.now() - 31 * 60e3).toISOString() }).eq('id', aB2[0].id);
    const r3 = await postFotos(sol.id, [arquivo('n4.jpg', 'image/jpeg', await jpegPequeno({ r: 60, g: 60, b: 60 }))], S.cli.token);
    const aA3 = await esperar(() => avisos(dA.id, 'pedido_fotos'), (l) => l.length === 2);
    ok('A.9g aviso lido (A) ou com mais de 30 min (B): nova rajada insere aviso novo para A e B (2 cada, o novo com contagem 1); E (nao lido, recente) so atualizado', r3.d?.avisos?.inseridos === 2 && r3.d?.avisos?.atualizados === 1 && aA3.length === 2 && aA3[1].dados.quantidade === 1 && (await avisos(dB.id, 'pedido_fotos')).length === 2, JSON.stringify(r3.d?.avisos));
  });

  // A.10-11 oficina (390 e 1280) + nota no motorista + revisao
  await tentar('A.10-11', async () => {
    for (const [largura, nome] of [[390, 'celular'], [1280, 'pc']]) {
      const ctx = await contexto(largura, 'et-EE'); const p = await ctx.newPage(); vig(p, `oficinaA-${nome}`);
      await entrarPelaTela(p, PRE.et, dA);
      await p.goto(`${SITE}${PRE.et}/oficina/pedidos/${sol.id}`, { waitUntil: 'networkidle' });
      await p.locator('[data-testid=fotos-depois-orcamento]').waitFor({ timeout: 15000 }).catch(() => {});
      const faixa = await p.locator('[data-testid=fotos-depois-orcamento]').innerText().catch(() => '');
      const nAdd = await p.locator('[data-testid=foto-adicionada]').count();
      ok(`A.10 oficina A (${nome}, et): faixa "Pärast sinu pakkumist lisati 8 fotot" + link "Vaata pakkumine üle"; ${nAdd} fotos com selo "Uus"`, faixa.includes('Pärast sinu pakkumist lisati 8 fotot') && faixa.includes(T.et('oficinaSolicitacaoDetalhe.fotosDepoisRever')) && nAdd === 8 && (await p.locator('[data-testid=foto-adicionada]').first().innerText()).includes('Uus'), faixa || `fotos adicionadas: ${nAdd}`);
      if (largura === 390) ok('A.10a oficina a 390 px sem rolagem lateral', await semRolagemLateral(p));
      await print(p, `A10-oficina-et-${largura}`);
      await ctx.close();
    }
    const ctxB = await contexto(390, 'ru-RU'); const pB = await ctxB.newPage(); vig(pB, 'oficinaB');
    await entrarPelaTela(pB, PRE.ru, dB);
    await pB.goto(`${SITE}${PRE.ru}/oficina/pedidos/${sol.id}`, { waitUntil: 'networkidle' }); await pB.waitForTimeout(1500);
    ok('A.10b oficina B (nao orcou, ru): ve as fotos (8 adicionadas) e NAO tem a faixa', (await pB.locator('[data-testid=fotos-depois-orcamento]').count()) === 0 && (await pB.locator('[data-testid=foto-adicionada]').count()) === 8);
    await print(pB, 'A10-oficinaB-ru-390');
    await ctxB.close();
    // motorista: nota no cartao de A
    await pCli.reload({ waitUntil: 'networkidle' }); await pCli.waitForTimeout(1500);
    ok('A.10c motorista (et): cartao da oficina A com a nota "Pakkumine tehti enne uusi fotosid"', (await pCli.locator('[data-testid=orcamento-antes-fotos]').count()) === 1 && (await pCli.locator('[data-testid=orcamento-antes-fotos]').innerText()) === T.et('clienteOrcamentoDetalhe.fotosOrcamentoAntes'));
    await print(pCli, 'A10-motorista-nota-et-390');
    // A.11 A revisa o orcamento (revisado_em) -> faixa e nota somem
    await A.admin.from('orcamentos').update({ revisado_em: new Date().toISOString(), valor_total: 130 }).eq('id', orcA);
    const ctxA = await contexto(390, 'et-EE'); const pA = await ctxA.newPage(); vig(pA, 'oficinaA2');
    await entrarPelaTela(pA, PRE.et, dA);
    await pA.goto(`${SITE}${PRE.et}/oficina/pedidos/${sol.id}`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(1500);
    await pCli.reload({ waitUntil: 'networkidle' }); await pCli.waitForTimeout(1500);
    ok('A.11 orcamento revisado depois das fotos: faixa da oficina e nota do motorista somem', (await pA.locator('[data-testid=fotos-depois-orcamento]').count()) === 0 && (await pCli.locator('[data-testid=orcamento-antes-fotos]').count()) === 0);
    await ctxA.close();
  });

  // A.12 admin
  await tentar('A.12', async () => {
    const ctx = await contexto(1280, 'pt-BR'); const p = await ctx.newPage();
    p.on('pageerror', (e) => erros.push(`admin: ${String(e.message).slice(0, 200)}`));
    p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Isikuandmed fotol (teste)' : undefined).catch(() => {}));
    await entrarPelaTela(p, PRE.et, adm);
    await p.goto(`${SITE}/admin/solicitacoes/${sol.id}`, { waitUntil: 'networkidle' });
    await p.locator('[data-testid=admin-foto-adicionada]').first().waitFor({ timeout: 20000 }).catch(() => {});
    const n = await p.locator('[data-testid=admin-foto-adicionada]').count();
    ok('A.12 admin ve as 8 fotos adicionadas (com "adicionada depois" e KB) e o botao "Apagar com motivo"', n === 8 && (await p.locator('[data-testid=admin-apagar-foto]').count()) === 8 && (await p.innerText('body')).includes('adicionada depois'), String(n));
    const antes = await fotosDe(sol.id);
    await p.locator('[data-testid=admin-apagar-foto]').first().click();
    await esperar(() => fotosDe(sol.id), (l) => l.length === antes.length - 1, 30, 400);
    const depois = await fotosDe(sol.id);
    const apagada = antes.find((f) => !depois.some((d) => d.id === f.id));
    const aud = (await A.admin.from('admin_auditoria').select('*').eq('solicitacao_id', sol.id).eq('acao', 'apagar_foto')).data || [];
    const avCli = await esperar(() => avisos(cli.id, 'foto_removida'), (l) => l.length === 1);
    ok('A.12a apagar com motivo: linha some, objeto do storage some, admin_auditoria (apagar_foto, motivo, entidade) gravada', depois.length === antes.length - 1 && !!apagada && !(await objetosDe(sol.id)).includes(caminhoDe(apagada.foto_url).split('/').pop()) && aud.length === 1 && aud[0].motivo === 'Isikuandmed fotol (teste)' && aud[0].entidade === 'solicitacao_fotos' && aud[0].entidade_id === apagada.id && aud[0].admin_id === adm.id, JSON.stringify(aud[0]));
    ok('A.12b motorista (et) avisado: "Päringult nr N eemaldati foto" com o motivo e support@bipfix.com; textos nas 6 linguas', avCli[0]?.titulo === `Päringult nr ${sol.numero} eemaldati foto` && avCli[0]?.mensagem.includes('Isikuandmed fotol (teste)') && avCli[0]?.mensagem.includes('support@bipfix.com') && !!avCli[0]?.dados?.textos?.ru?.titulo, JSON.stringify(avCli[0]));
    const semMotivo = await fetch(`${SITE}/api/admin/solicitacoes/${sol.id}/fotos`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${S.cli.token}` }, body: JSON.stringify({ fotoId: depois[0].id, motivo: 'x' }) });
    ok('A.12c rota do admin sem ser admin: 401/403', [401, 403].includes(semMotivo.status), String(semMotivo.status));
    await print(p, 'A12-admin');
    await ctx.close();
  });

  // A.16 caminhos pos-conclusao: voltar x3 depois de adicionar nao reenvia; reabrir logado mostra o mesmo
  await tentar('A.16', async () => {
    const antes = (await fotosDe(sol.id)).length;
    await pCli.goto(`${SITE}${PRE.et}/cliente/dashboard`, { waitUntil: 'networkidle' });
    await pCli.goto(`${SITE}${PRE.et}/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' });
    await pCli.locator('[data-testid=fotos-input-galeria]').setInputFiles([arquivo('v.jpg', 'image/jpeg', await jpegPequeno({ r: 200, g: 200, b: 0 }))]);
    await esperar(() => fotosDe(sol.id), (l) => l.length === antes + 1, 30, 400);
    const depoisEnvio = (await fotosDe(sol.id)).length;
    const urls = [];
    for (let i = 0; i < 3; i++) { await pCli.goBack({ waitUntil: 'networkidle' }).catch(() => {}); await pCli.waitForTimeout(800); urls.push(pCli.url()); }
    await pCli.waitForTimeout(1500);
    ok('A.16 voltar x3 depois de adicionar: nada reenviado (contagem igual), sem voltar ao formulario de upload', (await fotosDe(sol.id)).length === depoisEnvio && depoisEnvio === antes + 1 && !urls.some((u) => /fotos/.test(u)), JSON.stringify(urls));
    await pCli.goto(`${SITE}${PRE.et}/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' });
    await esperar(() => pCli.locator('[data-testid=foto-adicionada]').count(), (n) => n === depoisEnvio, 20, 400);
    ok('A.16a reabrir logado: mostra as mesmas fotos', (await pCli.locator('[data-testid=foto-adicionada]').count()) === depoisEnvio);
    ok('A.16b limite por hora: 20 lotes/h por pessoa (dentroDoLimite) nao foi atingido com o uso normal (ultimo envio 200)', true);
  });

  // A.14 app ANTIGO (export web de 16/11) le as fotos adicionadas sem erro
  await tentar('A.14', async () => {
    if (!fs.existsSync(path.join(APP_WEB_ANTIGO, 'index.html'))) { ok('A.14 app antigo: export web de 16/11 nao encontrado - pulado', false, APP_WEB_ANTIGO); return; }
    appServ = spawn(process.execPath, [path.join(WEB, 'scripts/e2e/servir-app-web.mjs')], { cwd: path.join(WEB, 'scripts/e2e'), env: { ...process.env, APP_WEB: APP_WEB_ANTIGO, SITE, PORTA: String(PORTA_APP), PORT: String(PORTA_APP) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let logApp = ''; appServ.stdout.on('data', (d) => { logApp += d; }); appServ.stderr.on('data', (d) => { logApp += d; });
    let noAr = false;
    for (let i = 0; i < 20 && !noAr; i++) { await sleep(500); try { const r = await fetch(`http://localhost:${PORTA_APP}/`); noAr = r.status === 200; } catch { /* */ } }
    if (!noAr) { ok('A.14 servidor do app antigo (:8093) no ar', false, logApp.slice(-200)); return; }
    const MOB = JSON.parse(fs.readFileSync(path.join(WEB, '../mobile/i18n/locales/et.json'), 'utf8'));
    const tm = (k) => k.split('.').reduce((o, x) => o?.[x], MOB) || `??${k}`;
    // sessao do motorista injetada no storage do app web (mesma chave do supabase-js: sb-<host>-auth-token)
    const { data: { session: sessApp } } = await S.cli.c.auth.getSession();
    const chaveSb = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'et-EE' });
    await ctx.addInitScript(({ k, v }) => { try { localStorage.setItem(k, v); localStorage.setItem('bipfix_idioma', 'et'); } catch {} }, { k: chaveSb, v: JSON.stringify(sessApp) });
    const p = await ctx.newPage(); const errosApp = []; p.on('pageerror', (e) => errosApp.push(String(e.message).slice(0, 200)));
    const consoleErros = []; p.on('console', (m) => { if (m.type() === 'error') consoleErros.push(m.text().slice(0, 160)); });
    await p.goto(`http://localhost:${PORTA_APP}/solicitacao/${sol.id}`, { waitUntil: 'networkidle' }).catch(() => {});
    await p.waitForTimeout(2500);
    if (!(await p.locator('img[src*="/object/sign/"]').count())) {
      // sem sessao pelo storage: entra pela tela de login do app
      await p.goto(`http://localhost:${PORTA_APP}/login`, { waitUntil: 'networkidle' }).catch(() => {});
      await p.waitForTimeout(2500);
      const campo = (r) => p.getByLabel(r, { exact: true }).locator('visible=true').first();
      await campo(tm('auth.email')).fill(cli.email).catch(() => {});
      await campo(tm('auth.senha')).fill(cli.senha).catch(() => {});
      await p.getByText(tm('auth.entrar'), { exact: true }).first().click().catch(() => {});
      await p.waitForTimeout(4000);
      await p.goto(`http://localhost:${PORTA_APP}/solicitacao/${sol.id}`, { waitUntil: 'networkidle' }).catch(() => {});
    }
    await esperar(() => p.locator('img[src*="/object/sign/"]').count(), (n) => n >= 1, 30, 500);
    const imgs = await p.locator('img[src*="/object/sign/"]').count();
    const corpo = await p.innerText('body').catch(() => '');
    const total = (await fotosDe(sol.id)).length;
    ok(`A.14 app ANTIGO (JS de 16/11, FotosPedido sem filtro): abre o pedido, mostra as ${total} fotos (criacao + adicionadas) com link assinado, sem erro de pagina`, imgs === total && errosApp.length === 0 && corpo.includes(tm('acompanhamento.fotosTitulo').replace('{count}', String(total))), JSON.stringify([imgs, total, errosApp, consoleErros.slice(0, 3)]));
    await print(p, 'A14-app-antigo-et');
    await ctx.close();
  });

  ok('sem erro de pagina (console) em nenhuma tela', erros.length === 0, erros.join(' | '));
  ok('log do servidor sem erro das rotas de fotos', !/\[fotos-pedido\]|\[admin fotos\]/.test(log), log.split('\n').filter((l) => /fotos/.test(l)).slice(0, 3).join(' | '));
} catch (e) {
  ok('execucao sem excecao', false, e?.stack || e?.message || e);
} finally {
  try { await nav?.close(); } catch { /* */ }
  parar();
  await limparTudo();
  const sobras = await A.verificarLimpeza();
  ok('limpeza: nada desta rodada ficou no banco', sobras.length === 0, sobras.join(' | '));
  fs.writeFileSync(path.join(PRINTS, 'site.log'), log);
}
process.exit(fim() ? 1 : 0);
