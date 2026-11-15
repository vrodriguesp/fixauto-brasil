// E2E LOCAL: triagem do pedido no admin (Lote 2, migracao 085; Documentos/Analises/Fable_mapa_mudancas_pedido_triagem_2026-11-15.md, 5.2)
// + as 4 decisoes do dono de 15/11.
//  M  migracao 085 roda de novo sem erro (idempotente)
//  P  pedido P (Revisoes, Valga) criado pelo fluxo automatico: so A (Revisoes, 3 km) recebe o aviso
//  1-3 PATCH .../tipo: muda para Eletrico, auditoria, NENHUM aviso/e-mail, acesso mantido de A (decisao 1);
//      401/403 nas 4 rotas; 400 tipo invalido; 409 acidente, concluido, mesmo tipo
//  4-7 avisar: preview = [B]; confirmar avisa so B (sino 6 linguas + e-mail); de novo nao duplica; lista mudou = 409
//  8   oficinas: estados, compativel, [TESTE]; so o MESMO PAIS (decisao 3: Valka/LV fica fora); inativa fora; ?q=
//  9-11 convidar: D (outro tipo) e E (60 km) recebem pedido_convite + e-mail; teste x real / outro pais / inativa = 400;
//      de novo = pulada; quem ja recebeu (A) = pulada (nunca 2 avisos do mesmo pedido)
//  U  admin 1366 px: os 3 cartoes, historico, confirmacao NA PAGINA (sem window.confirm), convite pela tela (G)
//  12-15,R convidada (D, E) ve fotos/carro, conta no menu, orca e dispensa; nao convidada (N, L) nao; A (acesso
//      mantido) ve; T (teste) nao ve nem com convite gravado direto no banco
//  16-17 oficina D 360 px ET/RU: selo "convidada" na lista e no pedido, sino com o convite -> pedido; A sem selo
//  C  cobrar inclui a convidada que nao orcou (decisao 4: convidada = oficina como as outras)
//  T  teto 50 (decisao 2): 52 oficinas de Eletrico em Parnu; aviso na previa, avisa as 50 mais perto, as 2 que
//     sobram ficam para a proxima previa; 51 esperados = 400 (pela tela do admin)
//   node admin-triagem-pedido.mjs <.env.local>
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
const MIGRACAO = path.resolve(AQUI, '../../../../supabase/migrations/085_pedido_tipo_e_convites.sql');
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/admin-triagem';
fs.mkdirSync(OUT, { recursive: true });
const PASTA_EMAIL = env.EMAIL_PASTA_TESTE;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const MSG = path.resolve(AQUI, '../../messages');
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => { try { return JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8')); } catch { return {}; } }));
const tr = (l) => { const m = msgs(l); return (k) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`); };
const ET = tr('et'), RU = tr('ru');
let falhas = 0, oks = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; else oks++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 300) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const oficinas = []; const sols = []; const emergs = [];
const psql = (sql) => execSync('docker exec -i supabase_db_bipfix-teste psql -U postgres -v ON_ERROR_STOP=1 -1 -tA', { input: sql }).toString();
const HORARIO = Object.fromEntries(['seg', 'ter', 'qua', 'qui', 'sex'].map((d) => [d, { aberto: true, inicio: '08:00', fim: '18:00' }]).concat([['sab', { aberto: false, inicio: '', fim: '' }], ['dom', { aberto: false, inicio: '', fim: '' }]]));
const dia = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);

const conta = async (tipo, nome, idioma = 'et', contaTeste = false) => {
  const email = `tri-${tipo}${contas.length}-${tag}@example.test`; const senha = `Tri${tag}Senha9`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.push(data.user.id);
  const { error: e2 } = await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone: '+372 5000 0000', conta_teste: contaTeste });
  if (e2) throw new Error(e2.message);
  return { id: data.user.id, email, senha };
};
const novaOficina = async (dono, nome, { lat, lon, esp, ativa = true, pais = 'EE', cidade = 'Valga' }) => {
  const { data, error } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: nome, endereco: `${nome} tee 1`, cidade, estado: 'Valgamaa', cep: '68203', pais, latitude: lat, longitude: lon, ativa, raio_atendimento_km: 30, especialidades: esp, seguradoras_convencionadas: [], horario_funcionamento: HORARIO }).select('id').single();
  if (error) throw new Error(error.message);
  oficinas.push(data.id);
  return data.id;
};
const sessao = async (u) => { const c = anon(); const { data, error } = await c.auth.signInWithPassword({ email: u.email, password: u.senha }); if (error) throw new Error(error.message); return { c, token: data.session.access_token }; };
const api = async (metodo, rota, corpo, token) => {
  const r = await fetch(`${SITE}${rota}`, { method: metodo, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};
const avisosDe = async (pid, solId, tipo) => {
  let q = sb.from('notificacoes').select('id, tipo, titulo, mensagem, dados').eq('profile_id', pid).eq('dados->>solicitacao_id', solId);
  if (tipo) q = q.eq('tipo', tipo);
  return (await q).data || [];
};
const totalAvisos = async (solId) => (await sb.from('notificacoes').select('id', { count: 'exact', head: true }).eq('dados->>solicitacao_id', solId)).count;
// e-mails do ambiente local viram arquivos (lib/email.ts): <!-- para: x | assunto: y -->
const emails = (desde, para) => (PASTA_EMAIL && fs.existsSync(PASTA_EMAIL) ? fs.readdirSync(PASTA_EMAIL).filter((f) => f.endsWith('.html')) : [])
  .map((f) => ({ f, t: fs.statSync(path.join(PASTA_EMAIL, f)).mtimeMs })).filter((x) => x.t >= desde)
  .map((x) => { const cab = fs.readFileSync(path.join(PASTA_EMAIL, x.f), 'utf8').slice(0, 400); const m = cab.match(/para: (.*?) \| assunto: (.*?)( \||\s*-->)/); return m ? { para: m[1], assunto: m[2] } : null; })
  .filter((x) => x && (!para || para.includes(x.para)));

const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
const browser = await chromium.launch({ executablePath: exe });
const dialogos = [];
const contexto = async (largura) => {
  const movel = largura < 700;
  const c = await browser.newContext({ viewport: { width: largura, height: movel ? 780 : 900 }, deviceScaleFactor: movel ? 2 : 1, isMobile: movel, hasTouch: movel });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  c.on('page', (p) => p.on('dialog', (d) => { dialogos.push(d.message()); d.dismiss().catch(() => {}); }));
  return c;
};
const entrar = async (p, u, pre = '/ee/et') => {
  await p.goto(`${SITE}${pre}/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]');
  await p.waitForURL((x) => !x.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {});
  await sleep(1500);
};
const semRolagem = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const ROTAS = (id) => [['PATCH', `/api/admin/solicitacoes/${id}/tipo`, { tipo: 'mecanica' }], ['GET', `/api/admin/solicitacoes/${id}/avisar`], ['POST', `/api/admin/solicitacoes/${id}/avisar`, { esperados: [] }],
  ['GET', `/api/admin/solicitacoes/${id}/oficinas`], ['POST', `/api/admin/solicitacoes/${id}/convidar`, { oficinaIds: [] }]];

// Valga (EE), na fronteira com Valka (LV): 0,009 grau de latitude ~ 1 km
const VALGA = { lat: 57.7769, lon: 26.0473 };
const perto = (km, dLon = 0) => ({ lat: VALGA.lat + km * 0.009, lon: VALGA.lon + dLon });

try {
  // ---------- M: migracao idempotente ----------
  let migOk = true; try { psql(fs.readFileSync(MIGRACAO, 'utf8')); } catch (e) { migOk = false; console.log(String(e.stderr || e).slice(0, 400)); }
  ok('M migracao 085 inteira roda de novo sem erro', migOk);
  ok('M minha_oficina_atende tem o OR oficina_convidada', /OR oficina_convidada\(p_sol\)/.test(psql("select pg_get_functiondef('minha_oficina_atende'::regproc)")));

  // ---------- contas e oficinas ----------
  const adm = await conta('admin', 'Vitor Triagem', 'pt');
  const cli = await conta('cliente', 'Kadri Triagem', 'et');
  const outroCli = await conta('cliente', 'Mari Triagem', 'et');
  const dA = await conta('oficina', 'Dono A', 'et'), dB = await conta('oficina', 'Dono B', 'et'), dD = await conta('oficina', 'Dono D', 'et');
  const dE = await conta('oficina', 'Dono E', 'ru'), dT = await conta('oficina', 'Dono T', 'et', true), dX = await conta('oficina', 'Dono X', 'et');
  const dN = await conta('oficina', 'Dono N', 'et'), dL = await conta('oficina', 'Dono L', 'et'), dG = await conta('oficina', 'Dono G', 'et');
  const A = await novaOficina(dA, `TRI Hooldus A ${tag}`, { ...perto(3), esp: ['revisao'] });
  const B = await novaOficina(dB, `TRI Elekter B ${tag}`, { ...perto(-3), esp: ['eletrica'] });
  const D = await novaOficina(dD, `TRI Rehvid D ${tag}`, { ...perto(5), esp: ['pneu'] });
  const E = await novaOficina(dE, `TRI Kere E ${tag}`, { ...perto(60), esp: ['funilaria'], cidade: 'Otepää' });
  const T = await novaOficina(dT, `TRI Elekter T ${tag} (TEST)`, { ...perto(2), esp: ['eletrica'] });
  const X = await novaOficina(dX, `TRI Elekter X ${tag}`, { ...perto(2.5), esp: ['eletrica'], ativa: false });
  const N = await novaOficina(dN, `TRI Rehvid N ${tag}`, { ...perto(3, 0.01), esp: ['pneu'] });
  const L = await novaOficina(dL, `TRI Valka L ${tag}`, { lat: 57.775, lon: 26.017, esp: ['pneu'], pais: 'LV', cidade: 'Valka' });
  const G = await novaOficina(dG, `TRI Mehaanika G ${tag}`, { ...perto(4), esp: ['mecanica'] });
  const nome = { [A]: 'A', [B]: 'B', [D]: 'D', [E]: 'E', [T]: 'T', [X]: 'X', [N]: 'N', [L]: 'L', [G]: 'G' };
  const tAdm = (await sessao(adm)).token, sCli = await sessao(cli), tOutro = (await sessao(outroCli)).token;

  // ---------- P: pedido pelo fluxo automatico ----------
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: 'Octavia', fipe_ano: '2017', placa: `TR${tag.slice(0, 4).toUpperCase()}` }).select('id').single();
  const novoPedido = async (extra) => {
    const { data, error } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'revisao', descricao: `Triagem ${tag}: esitulede poleerimine ja pirn vahetada`, urgencia: 'media', endereco: 'Kesk 1, Valga', pais: 'EE', latitude: VALGA.lat, longitude: VALGA.lon, status: 'aberta', ...extra }).select('id, numero').single();
    if (error) throw new Error(error.message);
    sols.push(data.id); return data;
  };
  const P = await novoPedido({});
  await sb.from('solicitacao_fotos').insert({ solicitacao_id: P.id, foto_url: `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/damage-photos/solicitacoes/${P.id}/x.jpg` });
  const rCriado = await api('POST', '/api/pedido-criado', { solicitacaoId: P.id }, sCli.token);
  ok('P pedido-criado (fluxo automatico) responde 200', rCriado.status === 200, JSON.stringify(rCriado));
  const avA0 = await avisosDe(dA.id, P.id, 'nova_solicitacao');
  const outros0 = (await Promise.all([dB, dD, dE, dT, dX, dN, dL, dG].map((d) => avisosDe(d.id, P.id)))).map((x) => x.length);
  ok('P aviso automatico: so A (Revisoes, 3 km) recebe 1 aviso; B/D/E/T/X/N/L/G nenhum', avA0.length === 1 && outros0.every((n) => n === 0), `${avA0.length} ${outros0}`);

  // ---------- 2: so admin ----------
  let semLogin = true, cliente403 = true; const det = [];
  for (const [m, r, b] of ROTAS(P.id)) {
    const a = await api(m, r, b); const c = await api(m, r, b, tOutro);
    if (a.status !== 401) { semLogin = false; det.push(`${m} ${r} sem login ${a.status}`); }
    if (c.status !== 403) { cliente403 = false; det.push(`${m} ${r} cliente ${c.status}`); }
  }
  ok('2 as 5 chamadas (tipo, avisar GET/POST, oficinas, convidar) sem login = 401', semLogin, det.join('; '));
  ok('2 as 5 chamadas como cliente comum = 403', cliente403, det.join('; '));
  const { data: pAinda } = await sb.from('solicitacoes').select('tipo').eq('id', P.id).single();
  ok('2 nada mudou depois das chamadas recusadas (tipo continua revisao)', pAinda.tipo === 'revisao', pAinda.tipo);

  // ---------- 3: validacao ----------
  const rXyz = await api('PATCH', `/api/admin/solicitacoes/${P.id}/tipo`, { tipo: 'xyz' }, tAdm);
  ok('3 tipo invalido = 400', rXyz.status === 400, JSON.stringify(rXyz));
  const { data: em } = await sb.from('emergencias').insert({ nome: 'Kadri', email: cli.email, endereco: 'Kesk 1, Valga' }).select('id').single();
  emergs.push(em.id);
  const PAc = await novoPedido({ tipo: 'colisao', emergencia_id: em.id });
  const rAc = await api('PATCH', `/api/admin/solicitacoes/${PAc.id}/tipo`, { tipo: 'mecanica' }, tAdm);
  ok('3 pedido de acidente (emergencia_id) nao muda de tipo = 409', rAc.status === 409 && (await sb.from('solicitacoes').select('tipo').eq('id', PAc.id).single()).data.tipo === 'colisao', JSON.stringify(rAc));
  const PConc = await novoPedido({ status: 'concluida' });
  const rConc = await api('PATCH', `/api/admin/solicitacoes/${PConc.id}/tipo`, { tipo: 'mecanica' }, tAdm);
  ok('3 pedido concluido = 409', rConc.status === 409, JSON.stringify(rConc));
  const rIgual = await api('PATCH', `/api/admin/solicitacoes/${P.id}/tipo`, { tipo: 'revisao' }, tAdm);
  ok('3 mesmo tipo = 409', rIgual.status === 409, JSON.stringify(rIgual));

  // ---------- 1: mudar o tipo nao avisa ninguem ----------
  const avisosAntes = await totalAvisos(P.id);
  const t0 = Date.now();
  const rTipo = await api('PATCH', `/api/admin/solicitacoes/${P.id}/tipo`, { tipo: 'eletrica', motivo: 'cliente quer trocar a lampada' }, tAdm);
  ok('1 PATCH tipo eletrica = 200, avisadas 0, acesso mantido 1', rTipo.status === 200 && rTipo.j.avisadas === 0 && rTipo.j.acessoMantido === 1, JSON.stringify(rTipo));
  const { data: pTipo } = await sb.from('solicitacoes').select('tipo').eq('id', P.id).single();
  ok('1 solicitacoes.tipo = eletrica', pTipo.tipo === 'eletrica', pTipo.tipo);
  const { data: aud1 } = await sb.from('admin_auditoria').select('acao, antes, depois, motivo, admin_id').eq('solicitacao_id', P.id).eq('acao', 'mudar_tipo');
  ok('1 admin_auditoria mudar_tipo (antes revisao, depois eletrica, acesso_mantido [A], motivo, admin)', aud1?.length === 1 && aud1[0].antes?.tipo === 'revisao' && aud1[0].depois?.tipo === 'eletrica'
    && JSON.stringify(aud1[0].depois?.acesso_mantido) === JSON.stringify([A]) && aud1[0].motivo === 'cliente quer trocar a lampada' && aud1[0].admin_id === adm.id, JSON.stringify(aud1));
  await sleep(3000);
  ok('1 nenhuma linha nova em notificacoes do pedido', (await totalAvisos(P.id)) === avisosAntes, `${avisosAntes} -> ${await totalAvisos(P.id)}`);
  const emTipo = emails(t0).filter((x) => x.para.includes(tag));
  ok('1 nenhum e-mail enviado ao mudar o tipo', emTipo.length === 0, JSON.stringify(emTipo));
  const { data: convA } = await sb.from('pedido_convites').select('oficina_id, origem').eq('solicitacao_id', P.id);
  ok("1 decisao 1: A (ja recebeu) ganha acesso origem 'tipo_alterado', sem aviso", convA?.length === 1 && convA[0].oficina_id === A && convA[0].origem === 'tipo_alterado', JSON.stringify(convA));

  // ---------- 4: preview ----------
  const rPrev = await api('GET', `/api/admin/solicitacoes/${P.id}/avisar`, undefined, tAdm);
  const seriam = (rPrev.j.seriam || []).map((o) => o.oficina_id);
  ok('4 preview: seriam = [B] (D outro tipo, E longe, T teste, X inativa, N/L pneu)', rPrev.status === 200 && seriam.length === 1 && seriam[0] === B, `${rPrev.status} ${seriam.map((i) => nome[i] || i)}`);
  const jaA = (rPrev.j.jaReceberam || []).find((x) => x.oficina_id === A);
  ok("4 preview: jaReceberam tem A com motivo 'aviso'", jaA?.motivo === 'aviso', JSON.stringify(rPrev.j.jaReceberam));
  ok('4 preview: teto 50, total 1, foraDoTeto 0', rPrev.j.teto === 50 && rPrev.j.total === 1 && rPrev.j.foraDoTeto === 0, JSON.stringify({ t: rPrev.j.teto, n: rPrev.j.total, f: rPrev.j.foraDoTeto }));

  // ---------- 5: confirmar ----------
  const t5 = Date.now();
  const rAv = await api('POST', `/api/admin/solicitacoes/${P.id}/avisar`, { esperados: [B] }, tAdm);
  ok('5 confirmar [B] = 200, avisadas 1', rAv.status === 200 && rAv.j.avisadas === 1, JSON.stringify(rAv));
  const avB = await avisosDe(dB.id, P.id, 'nova_solicitacao');
  ok('5 B tem 1 nova_solicitacao com textos et/ru (sino nas linguas)', avB.length === 1 && avB[0].dados?.textos?.et?.titulo === 'Uus päring!' && !!avB[0].dados?.textos?.ru?.titulo && Object.keys(avB[0].dados?.textos || {}).length === 6, JSON.stringify(avB[0]?.dados).slice(0, 200));
  ok('5 A continua com 1 aviso', (await avisosDe(dA.id, P.id)).length === 1);
  const { data: aud5 } = await sb.from('admin_auditoria').select('depois').eq('solicitacao_id', P.id).eq('acao', 'avisar_tipo_novo');
  ok('5 admin_auditoria avisar_tipo_novo com oficinas [B]', aud5?.length === 1 && JSON.stringify(aud5[0].depois?.oficinas) === JSON.stringify([B]) && aud5[0].depois?.tipo === 'eletrica', JSON.stringify(aud5));
  let emB = []; for (let i = 0; i < 10 && !emB.length; i++) { await sleep(500); emB = emails(t5, dB.email); }
  ok('5 e-mail de pedido novo para B (ET)', emB.length === 1 && emB[0].assunto.startsWith('Uus päring'), JSON.stringify(emB));

  // ---------- 6-7: sem duplicata, lista mudou ----------
  const rDup = await api('POST', `/api/admin/solicitacoes/${P.id}/avisar`, { esperados: [B] }, tAdm);
  ok('6 confirmar [B] de novo = 409 com a lista nova vazia (B ja recebeu)', rDup.status === 409 && Array.isArray(rDup.j.seriam) && rDup.j.seriam.length === 0, JSON.stringify(rDup).slice(0, 200));
  const rVazio = await api('POST', `/api/admin/solicitacoes/${P.id}/avisar`, { esperados: [] }, tAdm);
  ok('6 confirmar a lista nova (vazia) = 200, avisadas 0', rVazio.status === 200 && rVazio.j.avisadas === 0, JSON.stringify(rVazio));
  ok('6 B continua com 1 aviso so', (await avisosDe(dB.id, P.id)).length === 1);
  const r409 = await api('POST', `/api/admin/solicitacoes/${P.id}/avisar`, { esperados: [B, D] }, tAdm);
  ok('7 esperados [B, D] diferente do atual = 409, nada enviado', r409.status === 409 && (await avisosDe(dD.id, P.id)).length === 0, JSON.stringify(r409).slice(0, 200));
  const rMuitos = await api('POST', `/api/admin/solicitacoes/${P.id}/avisar`, { esperados: Array.from({ length: 51 }, () => crypto.randomUUID()) }, tAdm);
  ok('7 mais de 50 esperados = 400', rMuitos.status === 400, JSON.stringify(rMuitos));

  // ---------- 8: lista de oficinas ----------
  const rOf = await api('GET', `/api/admin/solicitacoes/${P.id}/oficinas`, undefined, tAdm);
  const lin = Object.fromEntries((rOf.j.oficinas || []).map((o) => [o.oficina_id, o]));
  ok('8 D: compativel=false, estado livre', lin[D]?.compativel === false && lin[D]?.estado === 'livre', JSON.stringify(lin[D]));
  ok('8 A e B: estado avisada', lin[A]?.estado === 'avisada' && lin[B]?.estado === 'avisada', `${lin[A]?.estado} ${lin[B]?.estado}`);
  ok('8 T: conta_teste=true, mesmaConta=false', lin[T]?.conta_teste === true && lin[T]?.mesmaConta === false, JSON.stringify(lin[T]));
  ok('8 decisao 3: L (Valka, LV, 1,8 km) NAO aparece; pais do pedido EE', !lin[L] && rOf.j.pais === 'EE' && rOf.j.paisGravado === true, `${!!lin[L]} ${rOf.j.pais}`);
  ok('8 X (inativa) nao aparece; E (60 km) aparece fora do raio', !lin[X] && lin[E]?.dentroDoRaio === false && lin[E]?.km > 55, JSON.stringify(lin[E]));
  const kms = (rOf.j.oficinas || []).map((o) => o.km ?? 9e9);
  ok('8 ordenada da mais perto para a mais longe', kms.every((k, i) => i === 0 || kms[i - 1] <= k), kms.join(','));
  const todasEE = (rOf.j.oficinas || []).every((o) => (o.pais || '').toUpperCase() === 'EE');
  ok('8 todas as oficinas listadas sao do mesmo pais (EE)', todasEE);
  const rQ = await api('GET', `/api/admin/solicitacoes/${P.id}/oficinas?q=${encodeURIComponent(`rehvid d ${tag}`)}`, undefined, tAdm);
  ok('8 ?q= filtra por nome (sem diferenca de maiusculas)', rQ.j.oficinas?.length === 1 && rQ.j.oficinas[0].oficina_id === D, JSON.stringify(rQ.j.oficinas?.map((o) => o.nome)));
  const rQL = await api('GET', `/api/admin/solicitacoes/${P.id}/oficinas?q=valka`, undefined, tAdm);
  ok('8 decisao 3: procurar "Valka" tambem nao traz a oficina da Letonia', (rQL.j.oficinas || []).every((o) => o.oficina_id !== L), JSON.stringify(rQL.j.oficinas?.map((o) => o.nome)));

  // ---------- 9-11: convidar ----------
  const t9 = Date.now();
  const rConv = await api('POST', `/api/admin/solicitacoes/${P.id}/convidar`, { oficinaIds: [D, E] }, tAdm);
  ok('9 convidar [D, E] = 200, convidadas 2', rConv.status === 200 && rConv.j.convidadas === 2, JSON.stringify(rConv));
  const { data: cv } = await sb.from('pedido_convites').select('oficina_id, origem, convidado_por').eq('solicitacao_id', P.id).in('oficina_id', [D, E]);
  ok("9 pedido_convites D e E (origem admin, convidado_por admin)", cv?.length === 2 && cv.every((c) => c.origem === 'admin' && c.convidado_por === adm.id), JSON.stringify(cv));
  const avD = await avisosDe(dD.id, P.id), avE = await avisosDe(dE.id, P.id);
  ok("9 D e E com 1 aviso 'pedido_convite' cada (ET / RU na lingua da conta, 6 linguas em dados)", avD.length === 1 && avE.length === 1 && avD[0].tipo === 'pedido_convite' && avE[0].tipo === 'pedido_convite'
    && avD[0].titulo === 'BipFix saatis sulle päringu' && avE[0].titulo === 'BipFix отправил вам заявку' && avD[0].dados?.convite === true && Object.keys(avD[0].dados?.textos || {}).length === 6, JSON.stringify([avD[0]?.titulo, avE[0]?.titulo]));
  const { data: aud9 } = await sb.from('admin_auditoria').select('depois').eq('solicitacao_id', P.id).eq('acao', 'convidar_oficinas');
  ok('9 admin_auditoria convidar_oficinas com [D, E]', aud9?.length === 1 && [D, E].every((id) => aud9[0].depois?.oficinas?.includes(id)), JSON.stringify(aud9));
  let emD = []; for (let i = 0; i < 12 && emD.length < 1; i++) { await sleep(500); emD = emails(t9, dD.email); }
  const emE = emails(t9, dE.email);
  ok('9 e-mail de convite proprio para D (ET) e E (RU)', emD.length === 1 && emD[0].assunto.startsWith('BipFix saatis sulle päringu') && emE.length === 1 && emE[0].assunto.startsWith('BipFix отправил вам заявку'), JSON.stringify([emD, emE]));
  for (const [id, quem, m] of [[T, 'T (conta de teste)', 'conta_teste'], [L, 'L (Letonia)', 'outro_pais'], [X, 'X (inativa)', 'inativa']]) {
    const r = await api('POST', `/api/admin/solicitacoes/${P.id}/convidar`, { oficinaIds: [id] }, tAdm);
    const { count } = await sb.from('pedido_convites').select('oficina_id', { count: 'exact', head: true }).eq('solicitacao_id', P.id).eq('oficina_id', id);
    ok(`10 convidar ${quem} = 400 (${m}), nada gravado`, r.status === 400 && r.j.erros?.[0]?.motivo === m && count === 0, JSON.stringify(r));
  }
  const rMisto = await api('POST', `/api/admin/solicitacoes/${P.id}/convidar`, { oficinaIds: [G, T] }, tAdm);
  ok('10 lista com 1 invalida (G + T) = 400 e G tambem NAO e convidada', rMisto.status === 400 && (await avisosDe(dG.id, P.id)).length === 0, JSON.stringify(rMisto).slice(0, 200));
  const rDe = await api('POST', `/api/admin/solicitacoes/${P.id}/convidar`, { oficinaIds: [D] }, tAdm);
  ok("11 convidar D de novo = convidadas 0, puladas [D ja_convidada], sem aviso novo", rDe.status === 200 && rDe.j.convidadas === 0 && rDe.j.puladas?.[0]?.id === D && rDe.j.puladas[0].motivo === 'ja_convidada' && (await avisosDe(dD.id, P.id)).length === 1, JSON.stringify(rDe));
  const rJa = await api('POST', `/api/admin/solicitacoes/${P.id}/convidar`, { oficinaIds: [A, B] }, tAdm);
  ok('11 convidar A e B (ja receberam o aviso) = puladas, nenhum segundo aviso', rJa.status === 200 && rJa.j.convidadas === 0 && rJa.j.puladas?.length === 2 && (await avisosDe(dA.id, P.id)).length === 1 && (await avisosDe(dB.id, P.id)).length === 1, JSON.stringify(rJa));
  const r21 = await api('POST', `/api/admin/solicitacoes/${P.id}/convidar`, { oficinaIds: Array.from({ length: 21 }, () => crypto.randomUUID()) }, tAdm);
  ok('11 mais de 20 por vez = 400', r21.status === 400, JSON.stringify(r21));

  // ---------- U: tela do admin (1366) ----------
  {
    const c = await contexto(1366); const p = await c.newPage();
    const errosJs = []; p.on('pageerror', (e) => errosJs.push(e.message));
    await entrar(p, adm);
    await p.goto(`${SITE}/admin/solicitacoes/${P.id}`, { waitUntil: 'networkidle' }); await sleep(2000);
    ok('U os 3 cartoes da triagem aparecem', await p.getByTestId('triagem-tipo').isVisible() && await p.getByTestId('triagem-avisar').isVisible() && await p.getByTestId('triagem-convidar').isVisible());
    ok('U cabecalho mostra o tipo atual (Eletrico)', (await p.getByTestId('tipo-atual').innerText()).includes('Elétrico'));
    const hist = await p.getByTestId('historico-tipo').innerText().catch(() => '');
    ok('U historico: Revisoes -> Eletrico, nome do admin', hist.includes('Revisões') && hist.includes('Elétrico') && hist.includes('Vitor Triagem'), hist);
    await p.getByTestId('ver-quem').click(); await sleep(1500);
    const prev = await p.getByTestId('preview-aviso').innerText().catch(() => '');
    ok('U "Ver quem seria avisado": ninguem novo; ja receberam A e B', (await p.getByTestId('preview-vazio').count()) === 1 && prev.includes(`TRI Hooldus A ${tag}`) && prev.includes(`TRI Elekter B ${tag}`), prev);
    ok('U "Confirmar e avisar 0" desabilitado', await p.getByTestId('confirmar-aviso').isDisabled());
    const lista = await p.getByTestId('lista-oficinas').innerText().catch(() => '');
    ok('U lista: selos "não tem este tipo", "já convidada", "já recebeu", [TESTE]; sem Valka', lista.includes('não tem este tipo') && lista.includes('já convidada') && lista.includes('já recebeu') && lista.includes('[TESTE]') && !lista.includes(`TRI Valka L ${tag}`), lista.slice(0, 400));
    ok('U checkbox de T (teste) e de D (ja convidada) desabilitados', await p.locator(`[data-oficina="${T}"] input`).isDisabled() && await p.locator(`[data-oficina="${D}"] input`).isDisabled());
    await p.getByTestId('busca-oficina').fill(`Mehaanika G ${tag}`); await sleep(1200);
    ok('U busca (300 ms) acha G', (await p.getByTestId('lista-oficinas').innerText()).includes(`TRI Mehaanika G ${tag}`));
    await p.locator(`[data-oficina="${G}"] input`).check(); await sleep(200);
    await p.getByTestId('enviar-escolhidas').click(); await sleep(400);
    ok('U confirmacao na pagina (caixa com o nome), nada enviado ainda', (await p.getByTestId('confirmar-convite-caixa').innerText()).includes(`TRI Mehaanika G ${tag}`) && (await avisosDe(dG.id, P.id)).length === 0);
    await p.getByTestId('triagem').screenshot({ path: `${OUT}/U_triagem_confirmar_1366.png` });
    await p.getByTestId('confirmar-convite').click(); await sleep(2500);
    const mc = await p.getByTestId('msg-convite').innerText().catch(() => '');
    ok('U "Sim, enviar": G convidada pela tela, 1 aviso pedido_convite', mc.includes('Enviado para 1') && (await avisosDe(dG.id, P.id, 'pedido_convite')).length === 1, mc);
    await p.getByTestId('busca-oficina').fill(''); await sleep(1500);
    const cartaoConv = (await p.getByTestId('admin-convites').innerText()).toLowerCase(); // titulo em maiusculas pelo CSS
    ok('U cartao "Convidadas pela BipFix (3)" (D, E, G) e acesso mantido 1', cartaoConv.includes('convidadas pela bipfix (3)') && cartaoConv.includes('1 com acesso mantido') && [`rehvid d ${tag}`, `kere e ${tag}`, `mehaanika g ${tag}`].every((n) => cartaoConv.includes(n)), cartaoConv);
    await p.getByTestId('triagem').screenshot({ path: `${OUT}/U_triagem_P_1366.png` });
    await p.screenshot({ path: `${OUT}/U_admin_pedido_P_1366.png`, fullPage: true });
    // pedido de acidente: tipo travado com explicacao
    await p.goto(`${SITE}/admin/solicitacoes/${PAc.id}`, { waitUntil: 'networkidle' }); await sleep(1500);
    ok('U acidente: select do tipo desabilitado com explicacao', await p.getByTestId('tipo-select').isDisabled() && (await p.getByTestId('triagem-tipo').innerText()).includes('acidente'));
    ok('U sem window.confirm/alert na triagem', dialogos.length === 0, dialogos.join(' | '));
    ok('U sem erro de JS', errosJs.length === 0, errosJs[0]);
    await c.close();
  }

  // ---------- 12-15, R: acesso pelo banco ----------
  const sD = await sessao(dD), sE = await sessao(dE), sN = await sessao(dN), sL = await sessao(dL), sA = await sessao(dA), sT = await sessao(dT);
  const ve = async (s) => ((await s.c.from('solicitacoes').select('id').eq('id', P.id)).data || []).length;
  // ---------- 16-17: tela da oficina convidada (antes de ela orcar) ----------
  // ET com D (conta et), RU com E (conta ru): as duas convidadas, cada uma na lingua da conta
  for (const [lg, TT, pre, dono, quem] of [['et', ET, '/ee/et', dD, 'D'], ['ru', RU, '/ee/ru', dE, 'E']]) {
    const c = await contexto(360); const p = await c.newPage();
    const errosJs = []; p.on('pageerror', (e) => errosJs.push(e.message));
    await entrar(p, dono, pre);
    await p.goto(`${SITE}${pre}/oficina/pedidos`, { waitUntil: 'networkidle' }); await sleep(2500);
    const cartao = p.getByTestId('pedido-cartao').filter({ hasText: `${P.numero}` });
    ok(`16(${lg}) ${quem} (convidada) ve o cartao de P em "Para responder"`, (await cartao.count()) === 1, await p.locator('main').innerText().catch(() => ''));
    const selo = await cartao.getByTestId('selo-convidada').innerText().catch(() => '');
    ok(`16(${lg}) selo "${TT('oficinaPedidos.convidada')}" no cartao`, selo.includes(TT('oficinaPedidos.convidada')), selo);
    ok(`16(${lg}) botao de orcamento no cartao`, (await cartao.getByTestId('fazer-orcamento').count()) === 1);
    ok(`16(${lg}) 360 px sem rolagem lateral`, await semRolagem(p));
    await cartao.screenshot({ path: `${OUT}/${quem}_cartao_convidada_${lg}_360.png` });
    await p.screenshot({ path: `${OUT}/${quem}_pedidos_${lg}_360.png` });
    // sino: o convite na lingua da tela -> pedido
    const tituloConvite = lg === 'et' ? 'BipFix saatis sulle päringu' : 'BipFix отправил вам заявку';
    await p.getByRole('button', { name: TT('notificationBell.ariaLabel') }).first().click(); await sleep(900);
    ok(`17(${lg}) sino: aviso "${tituloConvite}"`, (await p.getByText(tituloConvite, { exact: true }).count()) === 1);
    await p.screenshot({ path: `${OUT}/${quem}_sino_${lg}_360.png` });
    await p.getByText(tituloConvite, { exact: true }).first().click();
    await p.waitForURL(new RegExp(`/oficina/pedidos/${P.id}`), { timeout: 15000 }).catch(() => {});
    ok(`17(${lg}) tocar no aviso abre o pedido`, p.url().includes(`/oficina/pedidos/${P.id}`), p.url());
    await sleep(2000);
    const det = await p.getByTestId('convidada-detalhe').innerText().catch(() => '');
    ok(`16(${lg}) pedido: selo + texto da convidada`, det.includes(TT('oficinaSolicitacaoDetalhe.convidada')) && det.includes(TT('oficinaSolicitacaoDetalhe.convidadaTexto')), det);
    ok(`16(${lg}) pedido: botao "${TT('oficinaSolicitacaoDetalhe.enviarOrcamento')}"`, (await p.getByRole('link', { name: TT('oficinaSolicitacaoDetalhe.enviarOrcamento') }).count()) >= 1);
    ok(`16(${lg}) pedido 360 px sem rolagem lateral`, await semRolagem(p));
    await p.screenshot({ path: `${OUT}/${quem}_pedido_${lg}_360.png` });
    ok(`16(${lg}) sem erro de JS`, errosJs.length === 0, errosJs[0]);
    await c.close();
  }
  {
    // A: acesso mantido (tipo_alterado), sem selo de convidada
    const c = await contexto(360); const p = await c.newPage();
    await entrar(p, dA);
    await p.goto(`${SITE}/ee/et/oficina/pedidos`, { waitUntil: 'networkidle' }); await sleep(2500);
    const cartao = p.getByTestId('pedido-cartao').filter({ hasText: `${P.numero}` });
    ok('15 A (tipo antigo) continua vendo P na lista, SEM selo de convidada', (await cartao.count()) === 1 && (await cartao.getByTestId('selo-convidada').count()) === 0);
    await p.screenshot({ path: `${OUT}/A_pedidos_acesso_mantido_et_360.png` });
    await c.close();
  }

  ok('12 D (convidada, outro tipo) le P', (await ve(sD)) === 1);
  ok('12 D le as fotos e o carro do pedido', ((await sD.c.from('solicitacao_fotos').select('id').eq('solicitacao_id', P.id)).data || []).length === 1
    && ((await sD.c.from('veiculos').select('id').eq('id', v.id)).data || []).length === 1);
  const { data: ppr } = await sD.c.rpc('pedidos_para_responder');
  ok('12 D: pedidos_para_responder conta P (total 1)', ppr?.total === 1, JSON.stringify(ppr));
  const { data: q1, error: eQ1 } = await sD.c.from('orcamentos').insert({ solicitacao_id: P.id, oficina_id: D, valor_total: 45, prazo_dias: 1, validade: dia(10) }).select('id').single();
  ok('12 D orca (insert em orcamentos pela RLS)', !eQ1 && !!q1?.id, eQ1?.message);
  const { error: eDisp } = await sD.c.from('pedido_dispensas').insert({ solicitacao_id: P.id, oficina_id: D, motivo: 'outro' });
  ok('12 D pode marcar "sem interesse" (pedido_dispensas)', !eDisp, eDisp?.message);
  await sb.from('pedido_dispensas').delete().eq('solicitacao_id', P.id).eq('oficina_id', D);
  ok('13 E (convidada, 60 km) le P', (await ve(sE)) === 1);
  const { error: eQ2 } = await sE.c.from('orcamentos').insert({ solicitacao_id: P.id, oficina_id: E, valor_total: 60, prazo_dias: 2, validade: dia(10) });
  ok('13 E orca', !eQ2, eQ2?.message);
  ok('14 N (Rehvid, 3 km, nao convidada) NAO le P', (await ve(sN)) === 0);
  const { error: eQ3 } = await sN.c.from('orcamentos').insert({ solicitacao_id: P.id, oficina_id: N, valor_total: 50, prazo_dias: 1, validade: dia(10) });
  ok('14 N NAO consegue orcar (RLS)', !!eQ3, 'inseriu');
  ok('14 L (Letonia, nao convidada) NAO le P', (await ve(sL)) === 0);
  ok('15 A (acesso mantido) le P', (await ve(sA)) === 1);
  const { data: cA } = await sA.c.from('pedido_convites').select('oficina_id, origem').eq('solicitacao_id', P.id);
  ok("15 A le so o proprio convite (origem tipo_alterado)", cA?.length === 1 && cA[0].oficina_id === A && cA[0].origem === 'tipo_alterado', JSON.stringify(cA));
  const { error: eIns } = await sA.c.from('pedido_convites').insert({ solicitacao_id: P.id, oficina_id: N });
  ok('R oficina NAO grava convite pelo navegador', !!eIns, 'inseriu');
  ok('R anonimo nao le pedido_convites', ((await anon().from('pedido_convites').select('oficina_id').eq('solicitacao_id', P.id)).data || []).length === 0);
  // dupla trava teste x real: mesmo com o convite gravado direto no banco, T nao ve o pedido real
  await sb.from('pedido_convites').insert({ solicitacao_id: P.id, oficina_id: T, origem: 'admin' });
  ok('R T (conta de teste) com convite gravado direto no banco continua SEM ver o pedido real (oficina_convidada)', (await ve(sT)) === 0);
  await sb.from('pedido_convites').delete().eq('solicitacao_id', P.id).eq('oficina_id', T);

  // ---------- C: cobrar inclui a convidada que nao orcou ----------
  const rCob = await api('POST', `/api/admin/solicitacoes/${P.id}/cobrar`, undefined, tAdm);
  ok('C cobrar: G (convidada, mecanica, sem orcamento) e cobrada; D e E (ja orcaram) nao', rCob.status === 200 && (await avisosDe(dG.id, P.id, 'cobranca_admin_solicitacao')).length === 1
    && (await avisosDe(dD.id, P.id, 'cobranca_admin_solicitacao')).length === 0 && (await avisosDe(dE.id, P.id, 'cobranca_admin_solicitacao')).length === 0, JSON.stringify(rCob));

  // ---------- T: teto de 50 (Parnu, 52 oficinas de Eletrico) ----------
  {
    const PARNU = { lat: 58.3859, lon: 24.4971 };
    const muitas = [];
    for (let i = 0; i < 52; i++) {
      const d = await conta('oficina', `Dono Teto ${i}`, i % 2 ? 'ru' : 'et');
      const id = await novaOficina(d, `TRI Teto ${String(i).padStart(2, '0')} ${tag}`, { lat: PARNU.lat + (i + 1) * 0.0009, lon: PARNU.lon, esp: ['eletrica'], cidade: 'Pärnu' });
      muitas.push({ id, profile: d.id });
    }
    const P2 = await novoPedido({ tipo: 'pneu', endereco: 'Rüütli 1, Pärnu', latitude: PARNU.lat, longitude: PARNU.lon });
    const c = await contexto(1366); const p = await c.newPage();
    const errosJs = []; p.on('pageerror', (e) => errosJs.push(e.message));
    await entrar(p, adm);
    await p.goto(`${SITE}/admin/solicitacoes/${P2.id}`, { waitUntil: 'networkidle' }); await sleep(2000);
    await p.getByTestId('tipo-select').selectOption('eletrica');
    await p.getByTestId('salvar-tipo').click(); await sleep(300);
    ok('T "Salvar tipo" abre a confirmacao na pagina (nada salvo ainda)', await p.getByTestId('confirmar-tipo-caixa').isVisible() && (await sb.from('solicitacoes').select('tipo').eq('id', P2.id).single()).data.tipo === 'pneu');
    await p.getByTestId('confirmar-tipo').click(); await sleep(2500);
    const mt = await p.getByTestId('msg-tipo').innerText().catch(() => '');
    ok('T tipo salvo pela tela: "Nenhuma oficina foi avisada" e 0 avisos no banco', mt.includes('Nenhuma oficina foi avisada') && (await sb.from('solicitacoes').select('tipo').eq('id', P2.id).single()).data.tipo === 'eletrica' && (await totalAvisos(P2.id)) === 0, mt);
    await p.getByTestId('ver-quem').click(); await sleep(2500);
    const teto = await p.getByTestId('aviso-teto').innerText().catch(() => '');
    ok('T previa: aviso claro do limite (52 combinam, 50 mais proximas, 2 de fora)', teto.includes('52') && teto.includes('50') && teto.includes('2 ficam de fora'), teto);
    ok('T previa: "Confirmar e avisar 50 oficinas"', (await p.getByTestId('preview-n').innerText()) === '50' && (await p.getByTestId('confirmar-aviso').innerText()).includes('50'));
    const naTela = await p.locator('[data-testid=preview-lista] li').evaluateAll((els) => els.map((e) => e.getAttribute('data-oficina')));
    const esperado50 = muitas.slice(0, 50).map((m) => m.id);
    ok('T previa = as 50 mais proximas, em ordem de distancia', JSON.stringify(naTela) === JSON.stringify(esperado50), `${naTela.length}`);
    await p.getByTestId('triagem-avisar').screenshot({ path: `${OUT}/T_previa_teto_1366.png` });
    await p.getByTestId('confirmar-aviso').click(); await sleep(3000);
    const ma = await p.getByTestId('msg-aviso').innerText().catch(() => '');
    ok('T confirmar: "Avisadas 50 oficinas" e "2 ficaram de fora"', ma.includes('Avisadas 50 oficinas') && ma.includes('2 ficaram de fora'), ma.slice(0, 200));
    const { data: av2 } = await sb.from('notificacoes').select('profile_id').eq('dados->>solicitacao_id', P2.id).eq('tipo', 'nova_solicitacao');
    const enviados = new Set((av2 || []).map((x) => x.profile_id));
    ok('T banco: exatamente 50 avisos, para as 50 da previa (envio = previa)', av2?.length === 50 && enviados.size === 50 && muitas.slice(0, 50).every((m) => enviados.has(m.profile)), `${av2?.length}`);
    await p.screenshot({ path: `${OUT}/T_admin_pedido_P2_1366.png`, fullPage: true });
    const r2 = await api('GET', `/api/admin/solicitacoes/${P2.id}/avisar`, undefined, tAdm);
    ok('T proxima previa: so as 2 que sobraram, sem aviso de limite', r2.j.seriam?.length === 2 && r2.j.foraDoTeto === 0 && r2.j.seriam.map((o) => o.oficina_id).join() === muitas.slice(50).map((m) => m.id).join(), JSON.stringify(r2.j).slice(0, 200));
    ok('T sem window.confirm/alert e sem erro de JS', dialogos.length === 0 && errosJs.length === 0, `${dialogos.join('|')} ${errosJs[0] || ''}`);
    await c.close();
  }
} catch (e) {
  falhas++; console.log('FALHA execucao -', e?.stack || e);
} finally {
  await browser.close().catch(() => {});
  await sleep(1500);
  for (const id of sols) {
    for (const t of ['orcamentos', 'pedido_dispensas', 'pedido_vistos', 'pedido_convites', 'solicitacao_fotos', 'mensagens']) await sb.from(t).delete().eq('solicitacao_id', id);
    await sb.from('admin_auditoria').delete().eq('solicitacao_id', id);
    await sb.from('notificacoes').delete().eq('dados->>solicitacao_id', id);
    await sb.from('solicitacoes').delete().eq('id', id);
  }
  for (const id of emergs) await sb.from('emergencias').delete().eq('id', id);
  for (const id of oficinas) await sb.from('oficinas').delete().eq('id', id);
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('admin_auditoria').delete().eq('admin_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id).catch(() => {}); }
  console.log(`\n${oks} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
}
