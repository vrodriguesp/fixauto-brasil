// E2E LOCAL cruzado da release "vidro + fotos" (18/11): o que acontece quando as DUAS mudancas se encontram.
//   X.1 pedido Klaasid (vidros) SEM foto -> so oficinas com Klaasid (e a sem especialidade) no raio sao avisadas;
//       o motorista adiciona fotos depois (POST /api/solicitacoes/[id]/fotos) -> aviso 'pedido_fotos' SO para essas
//       mesmas oficinas (kere/mecanica/longe: nada); 2a rajada -> mesmo aviso atualizado (dedupe), nenhuma linha nova;
//       a oficina de vidros ve as fotos "Uus" na tela do pedido; o motorista ve o contador n/10.
//   X.2 pedido "Muu / ei tea" (outro) + fotos adicionadas -> todas as oficinas no raio avisadas UMA vez; longe: nada.
//   X.3 app ANTIGO (export web de 15/11, sem 'vidros' na grade) le o pedido de vidros COM fotos adicionadas sem erro.
// Corre contra um site ja no ar (SITE, ex.: http://localhost:3104) com o banco LOCAL. Apaga tudo no fim.
//   node release-cruzado.mjs [<.env.local>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const L = await import('./pecas-v3-lib.mjs');
const { lerEnv, contador, tradutor, abrirNavegadores, SITE, ENV_PADRAO, WEB, siteNoAr, sleep, perto, createClient } = L;
const { entrarPelaTela } = await import('./acesso-oficinas-lib.mjs');
const req = createRequire(import.meta.url);
const sharp = req('sharp');

const env = lerEnv(process.argv[2] || ENV_PADRAO);
if (!(await siteNoAr())) { console.log(`FALHA sem site em ${SITE}`); process.exit(2); }
const { ok, fim, tentar } = contador();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const tag = crypto.randomBytes(3).toString('hex');
const SENHA = `Cruz-${crypto.randomBytes(5).toString('hex')}A1`;
let ipN = 1;
const ip = () => `10.83.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
const criado = { contas: new Set(), oficinas: new Set(), emails: new Set() };
const T = { et: tradutor('et') };
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/release-vidro-fotos';
fs.mkdirSync(OUT, { recursive: true });
const esperar = async (fn, cond, n = 40, ms = 300) => { let v; for (let i = 0; i < n; i++) { v = await fn(); if (cond(v)) return v; await sleep(ms); } return v; };

const HORARIO = Object.fromEntries(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map((d) => [d, { aberto: true, inicio: '08:00', fim: '18:00' }]));
async function conta(tipo, apelido, { idioma = 'et' } = {}) {
  const email = `cruz-${apelido}-${tag}@example.test`.toLowerCase();
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
  if (error) throw new Error(`createUser ${apelido}: ${error.message}`);
  criado.contas.add(data.user.id); criado.emails.add(email);
  const { error: e2 } = await admin.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE-CRUZ ${apelido}`, email, idioma, telefone: '+372 5000 0002', conta_teste: false, senha_definida: true, ativo: true, termos_aceitos_em: new Date().toISOString() });
  if (e2) throw new Error(`profile ${apelido}: ${e2.message}`);
  return { id: data.user.id, email, senha: SENHA, idioma, apelido };
}
async function oficina(dono, apelido, especialidades, { km = 1, raio = 30 } = {}) {
  const p = perto(km);
  const nome = `TESTE-CRUZ ${apelido} ${tag}`;
  const { data, error } = await admin.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: nome, endereco: `${apelido} tee`, numero: '1', cidade: 'Narva', estado: 'Ida-Virumaa', cep: '20308', pais: 'EE', latitude: p.lat, longitude: p.lon, raio_atendimento_km: raio, especialidades, ativa: true, seguradoras_convencionadas: [], horario_funcionamento: HORARIO }).select('id').single();
  if (error) throw new Error(`oficina ${apelido}: ${error.message}`);
  criado.oficinas.add(data.id);
  return { id: data.id, dono, nome, especialidades, apelido };
}
const sessao = async (u) => { const c = anon(); const { data, error } = await c.auth.signInWithPassword({ email: u.email, password: u.senha }); if (error) throw new Error(`login ${u.email}: ${error.message}`); return { c, token: data.session.access_token }; };

// pedido pela API (o mesmo que a tela manda), SEM foto, com a sessao da conta
async function pedidoApi(cli, tipo, { km = 0 } = {}) {
  const p = perto(km);
  const form = new FormData();
  form.append('dados', JSON.stringify({ origem: 'site', idioma: cli.idioma, nome: 'TESTE-CRUZ', email: cli.email, telefone: '', aceitouTermos: true, tipo, descricao: `TESTE-CRUZ ${tipo} ${tag}`, urgencia: 'media', endereco: `Narva ${km}`, latitude: p.lat, longitude: p.lon, pais: 'EE', veiculo: { tipo: 'cars', marca: 'Skoda', modelo: 'Octavia', ano: '2016', codigo: null, placa: '123ABC' } }));
  const r = await fetch(`${SITE}/api/pedido-sem-conta`, { method: 'POST', body: form, headers: { 'x-real-ip': ip(), Authorization: `Bearer ${cli.token}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.solicitacaoId) throw new Error(`pedidoApi ${tipo}: ${r.status} ${JSON.stringify(d)}`);
  return d.solicitacaoId;
}
const avisosDe = async (solId, tipo) => (await admin.from('notificacoes').select('id, profile_id, titulo, mensagem, dados, lida').eq('tipo', tipo).eq('dados->>solicitacao_id', solId)).data || [];
const esperarAvisos = async (solId, tipo, n) => esperar(() => avisosDe(solId, tipo), (a) => a.length >= n, 30);
const jpeg = (w, h, cor) => sharp({ create: { width: w, height: h, channels: 3, background: cor } }).jpeg({ quality: 85 }).toBuffer();
async function adicionarFotos(cli, solId, n) {
  const form = new FormData();
  for (let i = 0; i < n; i++) form.append('fotos', new Blob([await jpeg(900 + i, 700, { r: 40 * i, g: 120, b: 200 })], { type: 'image/jpeg' }), `foto-${i}.jpg`);
  const r = await fetch(`${SITE}/api/solicitacoes/${solId}/fotos`, { method: 'POST', body: form, headers: { 'x-real-ip': ip(), Authorization: `Bearer ${cli.token}` } });
  return { status: r.status, d: await r.json().catch(() => ({})) };
}
const nomesDe = (lista, ofs) => [...new Set(lista.map((a) => ofs.find((o) => o.dono.id === a.profile_id)?.apelido || '?'))].sort().join(',');

let nav = null; let appWeb = null;
try {
  // ---------------- cenario ----------------
  const cli = await conta('cliente', 'motorista');
  Object.assign(cli, await sessao(cli));
  const donos = {};
  for (const a of ['vidro', 'kere', 'mec', 'todas', 'longe']) donos[a] = await conta('oficina', a, { idioma: a === 'kere' ? 'ru' : 'et' });
  const OF = [
    await oficina(donos.vidro, 'vidro', ['vidros']),
    await oficina(donos.kere, 'kere', ['colisao', 'funilaria']),
    await oficina(donos.mec, 'mec', ['mecanica']),
    await oficina(donos.todas, 'todas', []),
    await oficina(donos.longe, 'longe', ['vidros'], { km: 60, raio: 20 }),
  ];
  const of = (a) => OF.find((o) => o.apelido === a);

  // ---------------- X.1 Klaasid sem foto -> fotos depois ----------------
  let solVidro = null;
  await tentar('X.1', async () => {
    solVidro = await pedidoApi(cli, 'vidros');
    const novos = await esperarAvisos(solVidro, 'nova_solicitacao', 2);
    ok('X.1a pedido Klaasid sem foto: avisados = todas,vidro', nomesDe(novos, OF) === 'todas,vidro', nomesDe(novos, OF));
    const { count: c0 } = await admin.from('solicitacao_fotos').select('id', { count: 'exact', head: true }).eq('solicitacao_id', solVidro);
    ok('X.1b pedido criado sem nenhuma foto', c0 === 0, `fotos=${c0}`);
    const { data: s } = await admin.from('solicitacoes').select('tipo, status').eq('id', solVidro).single();
    ok("X.1c banco: tipo 'vidros', status aberta", s?.tipo === 'vidros' && s?.status === 'aberta', JSON.stringify(s));

    const r1 = await adicionarFotos(cli, solVidro, 2);
    ok('X.1d motorista adiciona 2 fotos -> 200 com 2 fotos (origem adicionada)', r1.status === 200 && r1.d.fotos?.length === 2 && r1.d.fotos.every((f) => f.origem === 'adicionada'), `${r1.status} ${JSON.stringify(r1.d).slice(0, 200)}`);
    ok('X.1e resposta: avisos inseridos = 2 (vidro e todas)', r1.d.avisos?.inseridos === 2 && r1.d.avisos?.atualizados === 0, JSON.stringify(r1.d.avisos));
    const f1 = await esperarAvisos(solVidro, 'pedido_fotos', 2);
    ok("X.1f aviso 'pedido_fotos' SO para todas,vidro (kere, mec e longe: nada)", nomesDe(f1, OF) === 'todas,vidro' && f1.length === 2, `${nomesDe(f1, OF)} n=${f1.length}`);
    const av = f1.find((a) => a.profile_id === donos.vidro.id);
    ok('X.1g texto et do aviso da oficina de vidros com o numero e "2"', !!av && /Uued fotod/.test(av.titulo) && /2 fotot/.test(av.mensagem), `${av?.titulo} | ${av?.mensagem}`);
    const { data: fotos } = await admin.from('solicitacao_fotos').select('origem, bytes, largura, altura').eq('solicitacao_id', solVidro);
    ok('X.1h banco: 2 fotos adicionadas, reencodadas (<= 1600 px, bytes gravados)', fotos?.length === 2 && fotos.every((f) => f.origem === 'adicionada' && f.largura <= 1600 && f.bytes > 0), JSON.stringify(fotos));

    // 2a rajada: dedupe (mesmo aviso, contagem somada, nenhuma linha nova)
    const r2 = await adicionarFotos(cli, solVidro, 1);
    ok('X.1i 2a rajada: 200, avisos atualizados = 2, inseridos = 0', r2.status === 200 && r2.d.avisos?.atualizados === 2 && r2.d.avisos?.inseridos === 0, `${r2.status} ${JSON.stringify(r2.d.avisos)}`);
    const f2 = await avisosDe(solVidro, 'pedido_fotos');
    ok('X.1j continua 1 aviso por oficina (2 no total), contagem 3', f2.length === 2 && f2.every((a) => Number(a.dados?.quantidade) === 3 && /3 fotot|3 photo|3 foto/.test(a.mensagem)), f2.map((a) => `${a.dados?.quantidade}:${a.mensagem}`).join(' | '));
    const novos2 = await avisosDe(solVidro, 'nova_solicitacao');
    ok('X.1k adicionar fotos NAO reenvia o pedido (nova_solicitacao continua 2)', novos2.length === 2, `n=${novos2.length}`);
    const { data: semEmail } = await admin.from('notificacoes').select('tipo').eq('dados->>solicitacao_id', solVidro).not('tipo', 'in', '("nova_solicitacao","pedido_fotos")');
    ok('X.1l nenhum outro tipo de aviso gerado', !semEmail?.length, JSON.stringify(semEmail));
  });

  // ---------------- X.2 "Muu / ei tea" + fotos ----------------
  let solOutro = null;
  await tentar('X.2', async () => {
    solOutro = await pedidoApi(cli, 'outro');
    const novos = await esperarAvisos(solOutro, 'nova_solicitacao', 4);
    ok('X.2a pedido "Muu / ei tea": avisados = kere,mec,todas,vidro (longe nao)', nomesDe(novos, OF) === 'kere,mec,todas,vidro', nomesDe(novos, OF));
    const r = await adicionarFotos(cli, solOutro, 2);
    ok('X.2b motorista adiciona 2 fotos -> 200, avisos inseridos = 4', r.status === 200 && r.d.avisos?.inseridos === 4, `${r.status} ${JSON.stringify(r.d.avisos)}`);
    const f = await esperarAvisos(solOutro, 'pedido_fotos', 4);
    ok("X.2c 'pedido_fotos' para kere,mec,todas,vidro, UMA vez cada; longe: nada", nomesDe(f, OF) === 'kere,mec,todas,vidro' && f.length === 4, `${nomesDe(f, OF)} n=${f.length}`);
    const ru = f.find((a) => a.profile_id === donos.kere.id);
    ok('X.2d aviso da oficina kere (ru) no idioma dela', !!ru && /Новые фото/.test(ru.titulo), ru?.titulo);
    ok('X.2e rotulo da oficina no aviso do pedido novo e o curto "Muu" (nao "Muu / ei tea")', novos.some((a) => a.profile_id === donos.vidro.id && /^Muu - /.test(a.mensagem)) , novos.find((a) => a.profile_id === donos.vidro.id)?.mensagem);
  });

  // ---------------- X.1 pelas telas: oficina de vidros e motorista ----------------
  await tentar('X.T', async () => {
    nav = await abrirNavegadores(false);
    const ctx = await nav.contexto('chromium', 390, ip);
    const erros = [];
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)));
    p.on('dialog', (d) => d.accept().catch(() => {}));
    await entrarPelaTela(p, '/ee/et', donos.vidro);
    await p.goto(`${SITE}/ee/et/oficina/pedidos/${solVidro}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);
    const add = await p.locator('[data-testid=foto-adicionada]').count();
    const texto = await p.evaluate(() => document.body.innerText);
    ok('X.T1 oficina de vidros abre o pedido Klaasid: 3 fotos "Uus" (adicionadas) e o numero do pedido (a tela da oficina nao repete o tipo)', add === 3 && /nr\s*\d+/.test(texto), `adicionadas=${add}`);
    ok('X.T1b a oficina de vidros tem exatamente 1 aviso pedido_fotos deste pedido (abrir o pedido pode marca-lo lido)', (await admin.from('notificacoes').select('id').eq('profile_id', donos.vidro.id).eq('tipo', 'pedido_fotos').eq('dados->>solicitacao_id', solVidro)).data?.length === 1);
    ok('X.T1c sem rolagem lateral a 390 px', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await p.screenshot({ path: `${OUT}/XT1-oficina-vidro-et-390.png`, fullPage: true }).catch(() => {});
    await p.close();

    const ctx2 = await nav.contexto('chromium', 390, ip);
    const p2 = await ctx2.newPage();
    p2.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)));
    await entrarPelaTela(p2, '/ee/et', cli);
    await p2.goto(`${SITE}/ee/et/cliente/orcamentos/${solVidro}`, { waitUntil: 'networkidle' });
    await p2.waitForTimeout(1500);
    const cont = await p2.locator('[data-testid=fotos-contador]').innerText().catch(() => '');
    const t2 = await p2.evaluate(() => document.body.innerText);
    ok('X.T2 motorista ve o pedido Klaasid com 3 fotos (3/10), botoes camera/galeria e X nas adicionadas', /3\s*\/\s*10/.test(cont) && (await p2.locator('[data-testid=fotos-camera]').count()) === 1 && (await p2.locator('[data-testid=foto-apagar]').count()) === 3, `contador="${cont}"`);
    await p2.goto(`${SITE}/ee/et/cliente/orcamentos/${solOutro}`, { waitUntil: 'networkidle' });
    await p2.waitForTimeout(1200);
    const t3 = await p2.evaluate(() => document.body.innerText);
    ok('X.T3 pedido "outro" no painel do motorista: 2 fotos adicionadas com X', (await p2.locator('[data-testid=foto-adicionada]').count()) === 2 && (await p2.locator('[data-testid=foto-apagar]').count()) === 2);
    // o painel/lista do motorista nao repete o tipo (mostra a descricao) - o rotulo "Klaasid"/"Muu / ei tea" e
    // coberto pelo categoria-vidro (grade, resumo, retomar, acompanhamento, historico); aqui: os 2 pedidos na lista
    await p2.goto(`${SITE}/ee/et/cliente/dashboard`, { waitUntil: 'networkidle' });
    await p2.waitForTimeout(1200);
    const th = await p2.evaluate(() => document.body.innerText);
    ok('X.T2b painel do motorista lista os 2 pedidos desta rodada (vidros e outro) sem erro', (th.match(/TESTE-CRUZ (vidros|outro)/g) || []).length >= 2, th.slice(0, 200));
    await p2.screenshot({ path: `${OUT}/XT3-motorista-outro-et-390.png`, fullPage: true }).catch(() => {});
    ok('X.T sem erro de JS nas telas', !erros.length, erros.join(' | '));
    ok('X.T sem chave crua de traducao', !/\?\?[a-zA-Z]|clienteOrcamentoDetalhe\.|oficinaPedidos\./.test(t2 + t3 + texto));
    await p2.close();
  });

  // ---------------- X.3 app ANTIGO le o pedido de vidros com fotos adicionadas ----------------
  await tentar('X.3', async () => {
    const dir = path.join(WEB, 'scripts/e2e/app-web');
    if (!fs.existsSync(path.join(dir, 'index.html'))) { ok('X.3 export antigo do app em scripts/e2e/app-web', false, 'nao encontrado'); return; }
    // copia do apps/web sem assets/node_modules (robocopy /XD node_modules): as fontes do app viram index.html e o
    // expo-font rejeita com "NetworkError: A network error occurred." em toda pagina (falso X.3, 19/11)
    if (!fs.existsSync(path.join(dir, 'assets/node_modules'))) { ok('X.3 export antigo completo (fontes em app-web/assets/node_modules) - copie a pasta inteira', false, 'assets/node_modules ausente'); return; }
    appWeb = spawn(process.execPath, [path.join(WEB, 'scripts/e2e/servir-app-web.mjs')], { env: { ...process.env, SITE, APP_WEB: dir }, stdio: 'ignore' });
    const no = await esperar(async () => { try { return (await fetch('http://localhost:8090/', { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } }, (v) => v, 30, 500);
    if (!no) { ok('X.3 servidor do app antigo (:8090) no ar', false); return; }
    // sessao injetada no storage do app (mesma tecnica do fotos-pedido.mjs A.14: sb-<host>-auth-token)
    const { data: s } = await anon().auth.signInWithPassword({ email: cli.email, password: cli.senha });
    const chaveSb = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
    const ctx = await nav.contexto('chromium', 390, ip);
    await ctx.addInitScript(({ k, v }) => { try { localStorage.setItem(k, v); localStorage.setItem('bipfix_idioma', 'et'); } catch {} }, { k: chaveSb, v: JSON.stringify(s.session) });
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(String(e.message).slice(0, 200)));
    await p.goto(`http://localhost:8090/solicitacao/${solVidro}`, { waitUntil: 'networkidle' }).catch(() => {}); await p.waitForTimeout(3000);
    const t = await p.evaluate(() => document.body.innerText);
    const imgs = await p.locator('img[src*="damage-photos"]').count();
    ok('X.3 app antigo abre o pedido de vidros com as fotos adicionadas (numero do pedido, sem chave crua, sem erro JS; a tela antiga nao mostra o tipo)', /nr\s*\d+/.test(t) && !/constants\.|acompanhamento\.|\?\?/.test(t) && !erros.length, `imgs=${imgs} erros=${erros.join('|')} ${t.slice(0, 120)}`);
    ok('X.3b app antigo mostra as 3 fotos (link assinado)', imgs === 3, `imgs=${imgs}`);
    await p.screenshot({ path: `${OUT}/X3-app-antigo-vidros.png`, fullPage: true }).catch(() => {});
    await p.close();
  });
} finally {
  try { await nav?.fechar(); } catch { /* */ }
  try { appWeb?.kill(); } catch { /* */ }
  const erros = [];
  const del = async (t, col, val, op = 'eq') => { const q = admin.from(t).delete(); const { error } = await (op === 'in' ? q.in(col, val) : q.eq(col, val)); if (error && !/does not exist|Could not find/.test(error.message)) erros.push(`${t}: ${error.message}`); };
  for (const e of criado.emails) { const { data } = await admin.from('profiles').select('id').ilike('email', e).maybeSingle(); if (data) criado.contas.add(data.id); const { data: pend } = await admin.from('pedidos_pendentes').select('user_id').ilike('email', e); for (const x of pend || []) criado.contas.add(x.user_id); }
  const contas = [...criado.contas]; const ofs = [...criado.oficinas];
  const { data: sols } = contas.length ? await admin.from('solicitacoes').select('id').in('cliente_id', contas) : { data: [] };
  const solIds = (sols || []).map((s) => s.id);
  if (solIds.length) {
    const { data: fotos } = await admin.from('solicitacao_fotos').select('foto_url').in('solicitacao_id', solIds);
    const MARCA = '/storage/v1/object/public/damage-photos/';
    const caminhos = (fotos || []).map((f) => { const i = f.foto_url.indexOf(MARCA); return i >= 0 ? decodeURIComponent(f.foto_url.slice(i + MARCA.length).split('?')[0]) : null; }).filter(Boolean);
    if (caminhos.length) await admin.storage.from('damage-photos').remove(caminhos).then(() => {}, () => {});
    const { data: orcs } = await admin.from('orcamentos').select('id').in('solicitacao_id', solIds);
    const orcIds = (orcs || []).map((o) => o.id);
    if (orcIds.length) { for (const t of ['orcamento_disponibilidade', 'orcamento_itens']) await del(t, 'orcamento_id', orcIds, 'in'); }
    for (const t of ['agenda', 'mensagens', 'pedido_dispensas', 'pedido_convites', 'solicitacao_fotos', 'analise_dano', 'sms_envios', 'admin_auditoria_pedido']) await del(t, 'solicitacao_id', solIds, 'in');
    if (orcIds.length) await del('orcamentos', 'id', orcIds, 'in');
    for (const s of solIds) await del('notificacoes', 'dados->>solicitacao_id', s);
    await del('solicitacoes', 'id', solIds, 'in');
  }
  for (const id of contas) { await del('notificacoes', 'profile_id', id); await del('veiculos', 'profile_id', id); await del('pedidos_pendentes', 'user_id', id); await del('codigos_login', 'user_id', id); await del('links_acesso', 'user_id', id); }
  if (ofs.length) { await del('funcionarios', 'oficina_id', ofs, 'in'); await del('pedido_dispensas', 'oficina_id', ofs, 'in'); await del('oficinas', 'id', ofs, 'in'); }
  for (const id of contas) { await del('profiles', 'id', id); const { error } = await admin.auth.admin.deleteUser(id); if (error && !/not found/i.test(error.message)) erros.push(`auth ${id}: ${error.message}`); }
  const sobra = contas.length ? (await admin.from('profiles').select('id', { count: 'exact', head: true }).in('id', contas)).count : 0;
  ok('limpeza: nada desta rodada ficou no banco', !erros.length && !sobra, `${erros.join(' | ')} sobra=${sobra}`);
  const falhas = fim();
  process.exit(falhas ? 1 : 0);
}
