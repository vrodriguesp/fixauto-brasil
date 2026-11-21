// Acidente B1 (auditoria Fable 16/11 e 21/11): oficina AVISADA e nao escolhida nao ve
// o outro motorista, a conversa entre os dois motoristas nem os orcamentos das
// concorrentes. So a oficina ESCOLHIDA (orcamento aceito) tem o papel 'oficina', e
// mesmo ela recebe so o orcamento dela, sem `outro` e sem `mensagens`. O sininho
// da oficina abre o pedido dela; link antigo da pagina do acidente leva ao pedido.
// Quem registrou (codigo e login), o outro motorista e o admin continuam como antes.
// Link da LKF certo (https://avarii.lkf.ee) nos 6 idiomas (site e app).
//   SITE=http://localhost:3108 node acidente-privacidade.mjs <.env.local>
// So no banco LOCAL; apaga tudo no fim.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(AQUI, '../..');
const req = createRequire(path.join(WEB, 'package.json'));
const { createClient } = req('@supabase/supabase-js');
const { chromium } = req('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3108';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0, total = 0;
const ok = (n, c, x = '') => { total++; if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 240) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const senha = `Acp${tag}Senha9`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const ip = () => `10.${crypto.randomInt(100, 250)}.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
// Kuressaare (Saaremaa): longe das oficinas de teste de Tallinn
const LAT = 58.2528, LON = 22.4869;
const contas = []; const oficinas = []; let emId = null, solId = null, emSemPedido = null;

const conta = async (tipo, nome, idioma = 'et') => {
  const email = `acp-${tipo}${contas.length}-${tag}@example.test`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw error;
  contas.push(data.user.id);
  await sb.from('profiles').upsert({ id: data.user.id, tipo, nome, email, idioma, telefone: '+372 5' + crypto.randomInt(1000000, 9999999) });
  return { id: data.user.id, email };
};
const oficina = async (dono, nome, telefone) => {
  await sb.from('profiles').update({ telefone }).eq('id', dono.id);
  const { data, error } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: nome, endereco: 'Tallinna 1', cidade: 'Kuressaare', estado: 'Saare', cep: '93815', pais: 'EE', latitude: LAT + 0.01, longitude: LON + 0.01, ativa: true }).select('id').single();
  if (error) throw error;
  oficinas.push(data.id);
  return data.id;
};
const token = async (email) => {
  const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await a.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return data.session.access_token;
};
const ler = async (headers, id = emId) => {
  const r = await fetch(`${SITE}/api/emergencia/${id}`, { headers, cache: 'no-store' });
  return { status: r.status, d: await r.json().catch(() => ({})) };
};
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

let browser;
try {
  // ---- pessoas ----
  const dono1 = await conta('oficina', 'Dono Escolhida');
  const dono2 = await conta('oficina', 'Dono Avisada');
  const mecanico = await conta('oficina', 'Mecanico Escolhida');
  const intruso = await conta('cliente', 'Intruso');
  const W1 = await oficina(dono1, `ESCOLHIDA ${tag}`, '+372 5111 0001');
  const W2 = await oficina(dono2, `AVISADA ${tag}`, '+372 5222 0002');
  await sb.from('funcionarios').insert({ profile_id: mecanico.id, oficina_id: W1, cargo: 'mecanico', ativo: true });

  // ---- A registra o acidente pelo site (sem login), como na vida real ----
  const emailA = `acp-mota-${tag}@example.test`, emailB = `acp-motb-${tag}@example.test`;
  const f = new FormData();
  f.append('dados', JSON.stringify({ nome: 'Motorista A', email: emailA, telefone: '+372 5333 0003', idioma: 'et', tipoAcidente: 'outro_causou', descricao: `kokkupõrge ${tag}`, endereco: 'Kuressaare, Tallinna 5', latitude: LAT, longitude: LON }));
  f.append('fotos', new Blob([png], { type: 'image/png' }), 'dano.png');
  const rA = await fetch(`${SITE}/api/emergencia`, { method: 'POST', body: f, headers: { 'x-real-ip': ip() } });
  const dA = await rA.json();
  emId = dA.id; solId = dA.solicitacaoId;
  ok('A registra o acidente (pedido criado, oficinas avisadas)', rA.status === 200 && !!emId && !!solId && dA.oficinasNotificadas >= 2, JSON.stringify(dA));
  const { data: pA } = await sb.from('profiles').select('id').eq('email', emailA).maybeSingle();
  if (pA) { contas.push(pA.id); await sb.auth.admin.updateUserById(pA.id, { password: senha }); }

  const { data: avisadas } = await sb.from('emergencia_oficinas_notificadas').select('oficina_id').eq('emergencia_id', emId);
  ok('as duas oficinas de teste foram avisadas', [W1, W2].every((w) => (avisadas || []).some((a) => a.oficina_id === w)), JSON.stringify(avisadas));
  const { data: nW2 } = await sb.from('notificacoes').select('tipo, dados').eq('profile_id', dono2.id);
  const avisoAcid = (nW2 || []).find((n) => n.tipo === 'emergencia');
  ok('aviso "acidente perto" da oficina traz o id do pedido (sininho -> pedido)', avisoAcid?.dados?.solicitacao_id === solId && avisoAcid?.dados?.emergencia_id === emId, JSON.stringify(avisoAcid?.dados && { ...avisoAcid.dados, textos: undefined }));

  // ---- A registra o outro motorista B e os dois conversam ----
  const fo = new FormData();
  fo.append('dados', JSON.stringify({ nome: 'Motorista B', telefone: '+372 5444 0004', email: emailB, placa: '444BBB', idioma: 'et', observacoes: 'segredo do B' }));
  const rO = await fetch(`${SITE}/api/emergencia/${emId}/outro-veiculo`, { method: 'POST', body: fo, headers: { 'x-emergencia-token': dA.token, 'x-real-ip': ip() } });
  ok('A registra o outro motorista B', rO.status === 200, rO.status);
  const { data: ov } = await sb.from('emergencia_outro_veiculo').select('profile_id').eq('emergencia_id', emId).single();
  if (ov?.profile_id) { contas.push(ov.profile_id); await sb.auth.admin.updateUserById(ov.profile_id, { password: senha }); }
  const mA = await fetch(`${SITE}/api/emergencia/${emId}/mensagens`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-emergencia-token': dA.token }, body: JSON.stringify({ texto: `mensagem privada A ${tag}` }) });
  const tB = await token(emailB);
  const mB = await fetch(`${SITE}/api/emergencia/${emId}/mensagens`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer(tB) }, body: JSON.stringify({ texto: `mensagem privada B ${tag}` }) });
  ok('A e B trocam mensagens', mA.status === 200 && mB.status === 200, `${mA.status}/${mB.status}`);

  // ---- as duas oficinas orcam ----
  const { data: o1 } = await sb.from('orcamentos').insert({ solicitacao_id: solId, oficina_id: W1, valor_total: 700, prazo_dias: 3, status: 'enviado', validade: '2030-01-01' }).select('id').single();
  const { data: o2 } = await sb.from('orcamentos').insert({ solicitacao_id: solId, oficina_id: W2, valor_total: 650, prazo_dias: 2, status: 'enviado', validade: '2030-01-01' }).select('id').single();
  const t1 = await token(dono1.email), t2 = await token(dono2.email), tM = await token(mecanico.email), tI = await token(intruso.email);

  // antes do aceite: nenhuma oficina le o acidente (so o pedido dela)
  const antes1 = await ler(bearer(t1));
  ok('ANTES do aceite: oficina que orcou -> 403 com o pedido dela', antes1.status === 403 && antes1.d.pedido === solId && !('outro' in antes1.d) && !('mensagens' in antes1.d) && !('orcamentos' in antes1.d), JSON.stringify(antes1));
  await sb.from('orcamentos').update({ status: 'aceito' }).eq('id', o1.id);
  await sb.from('orcamentos').update({ status: 'recusado' }).eq('id', o2.id);

  // ---- oficina avisada, nao escolhida ----
  const r2 = await ler(bearer(t2));
  const s2 = JSON.stringify(r2.d);
  ok('oficina avisada e NAO escolhida -> 403', r2.status === 403, r2.status);
  ok('... a resposta so leva ao pedido dela', r2.d.pedido === solId && Object.keys(r2.d).sort().join() === 'error,pedido', s2);
  ok('... sem outro motorista, conversa ou orcamentos', !/444BBB|Motorista B|5444|segredo do B|mensagem privada|ESCOLHIDA|5111/.test(s2), s2);

  // ---- acidente que ficou SEM pedido (falha ao criar veiculo/pedido; veredito Fable M-1) ----
  // a oficina avisada vai ao painel de pedidos, nunca a um link morto
  {
    const { data: base } = await sb.from('emergencias').select('*').eq('id', emId).single();
    const { id: _i, solicitacao_id: _s, created_at: _c, updated_at: _u, ...resto } = base;
    const { data: semPed, error: eSP } = await sb.from('emergencias').insert({ ...resto, solicitacao_id: null }).select('id').single();
    if (eSP) throw new Error('acidente sem pedido: ' + eSP.message);
    emSemPedido = semPed.id;
    await sb.from('emergencia_oficinas_notificadas').insert({ emergencia_id: emSemPedido, oficina_id: W2 });
    const rSP = await ler(bearer(t2), emSemPedido);
    ok('acidente sem pedido: oficina avisada -> 403 que leva ao painel', rSP.status === 403 && rSP.d.painel === true && !rSP.d.pedido && Object.keys(rSP.d).sort().join() === 'error,painel', JSON.stringify(rSP));
    const rSPi = await ler(bearer(t1), emSemPedido);
    ok('... oficina NAO avisada desse acidente -> 403 sem nada', rSPi.status === 403 && !rSPi.d.painel && !rSPi.d.pedido, JSON.stringify(rSPi));
  }

  // ---- oficina escolhida (dono e funcionario) ----
  for (const [quem, t] of [['dono', t1], ['funcionario ativo', tM]]) {
    const r = await ler(bearer(t)); const s = JSON.stringify(r.d);
    ok(`oficina ESCOLHIDA (${quem}) -> 200 papel oficina`, r.status === 200 && r.d.papel === 'oficina', `${r.status} ${r.d.papel}`);
    ok(`... sem outro motorista e sem a conversa A-B (${quem})`, r.d.outro === null && Array.isArray(r.d.mensagens) && r.d.mensagens.length === 0 && !/444BBB|5444|segredo do B|mensagem privada/.test(s), s.slice(0, 300));
    ok(`... so o orcamento dela, nada da concorrente (${quem})`, (r.d.orcamentos || []).length === 1 && r.d.orcamentos[0].id === o1.id && !/AVISADA|5222/.test(s), JSON.stringify(r.d.orcamentos));
    ok(`... continua vendo o acidente, o carro e o seguro (${quem})`, r.d.emergencia?.id === emId && r.d.emergencia?.solicitacao_id === solId && !!r.d.seguro, JSON.stringify({ e: r.d.emergencia?.endereco, seguro: r.d.seguro }));
  }
  // funcionario desligado perde o acesso
  await sb.from('funcionarios').update({ ativo: false }).eq('profile_id', mecanico.id);
  const rMx = await ler(bearer(tM));
  ok('funcionario desligado -> 403', rMx.status === 403, rMx.status);

  // ---- motoristas e outros ----
  const rTok = await ler({ 'x-emergencia-token': dA.token });
  ok('A pelo codigo do navegador: tudo como antes (B, conversa, 2 orcamentos, seguro)', rTok.status === 200 && rTok.d.papel === 'proprietario' && rTok.d.outro?.placa === '444BBB' && rTok.d.mensagens.length === 2 && rTok.d.orcamentos.length === 2 && !!rTok.d.seguro, `${rTok.status} ${rTok.d.papel} ${rTok.d.mensagens?.length} ${rTok.d.orcamentos?.length}`);
  const rAL = await ler(bearer(await token(emailA)));
  ok('A logado: tudo como antes', rAL.status === 200 && rAL.d.papel === 'proprietario' && rAL.d.outro?.placa === '444BBB' && rAL.d.orcamentos.length === 2, `${rAL.status} ${rAL.d.papel}`);
  const rB = await ler(bearer(tB));
  ok('B logado: ve o acidente, a conversa e os orcamentos, sem o seguro de A', rB.status === 200 && rB.d.papel === 'outro' && rB.d.mensagens.length === 2 && rB.d.orcamentos.length === 2 && rB.d.seguro === null, `${rB.status} ${rB.d.papel} ${rB.d.mensagens?.length}`);
  const rI = await ler(bearer(tI));
  ok('cliente sem relacao -> 403 sem pedido', rI.status === 403 && !rI.d.pedido, JSON.stringify(rI));
  const rN = await ler({});
  ok('sem login e sem codigo -> 403', rN.status === 403 && !rN.d.pedido, JSON.stringify(rN));
  // a avisada nao escreve na conversa dos motoristas
  const m2 = await fetch(`${SITE}/api/emergencia/${emId}/mensagens`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...bearer(t2) }, body: JSON.stringify({ texto: 'oi' }) });
  ok('oficina avisada nao escreve na conversa A-B', m2.status === 403, m2.status);

  // ---- navegador: sininho e pagina do acidente ----
  browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
  const celular = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } })); return c; };
  const entrar = async (ctx, email) => { const p = await ctx.newPage(); await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha); await p.click('button[type=submit]'); await p.waitForTimeout(4500); return p; };
  const pedidoUrl = new RegExp(`/ee/et/[^/]+/[^/]+/${solId}`);

  const ctx2 = await celular(); const p2 = await entrar(ctx2, dono2.email);
  // 1) link antigo / salvo da pagina do acidente -> pedido dela
  await p2.goto(`${SITE}/ee/et/avarii/teade/${emId}`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(3500);
  const tela2 = await p2.innerText('body');
  ok('avisada abrindo a pagina do acidente cai no pedido dela', p2.url().includes(`/oficina/pedidos/${solId}`) || pedidoUrl.test(p2.url()), p2.url());
  ok('... o pedido abre (descricao do acidente) e nao mostra B nem a conversa', tela2.includes(`kokkupõrge ${tag}`) && !/444BBB|Motorista B|mensagem privada/.test(tela2), tela2.slice(0, 300));
  await p2.screenshot({ path: path.join(process.env.OUT || AQUI, `acp-avisada-pedido-${tag}.png`) }).catch(() => {});
  await p2.goto(`${SITE}/ee/et/avarii/teade/${emSemPedido}`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(3500);
  ok('acidente sem pedido: avisada abrindo o link cai no painel de pedidos (nao em link morto)', !p2.url().includes('/avarii/') && /\/ee\/et\/[^/]+\/[^/]+\/?$/.test(new URL(p2.url()).pathname), p2.url());
  // 2) sininho: aviso novo (com o pedido) e um aviso antigo (so o acidente)
  await sb.from('notificacoes').update({ lida: true }).eq('profile_id', dono2.id);
  // titulo marcado (a tela usa dados.textos na lingua dela); o resto do aviso fica como o servidor gravou
  const { data: novo } = await sb.from('notificacoes').select('id, dados').eq('profile_id', dono2.id).eq('tipo', 'emergencia').single();
  const textos = Object.fromEntries(Object.entries(novo.dados.textos || {}).map(([l, x]) => [l, { ...x, titulo: `AVISO NOVO ${tag}` }]));
  await sb.from('notificacoes').update({ lida: false, titulo: `AVISO NOVO ${tag}`, created_at: new Date().toISOString(), dados: { ...novo.dados, textos } }).eq('id', novo.id);
  const { data: antigo } = await sb.from('notificacoes').insert({ profile_id: dono2.id, tipo: 'emergencia', titulo: `AVISO ANTIGO ${tag}`, mensagem: 'antigo', dados: { emergencia_id: emId } }).select('id').single();
  for (const titulo of [`AVISO NOVO ${tag}`, `AVISO ANTIGO ${tag}`]) {
    await p2.goto(`${SITE}/ee/et/oficina/dashboard`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(3000);
    await p2.getByRole('button', { name: 'Teated' }).first().click(); await p2.waitForTimeout(800);
    const item = p2.locator('button', { hasText: titulo }).first();
    const tem = (await item.count()) > 0;
    if (tem) { await item.click(); await p2.waitForTimeout(4500); }
    const t = tem ? await p2.innerText('body') : '';
    ok(`sininho "${titulo.split(' ').slice(0, 2).join(' ')}" abre o pedido da oficina`, tem && p2.url().includes(`/oficina/pedidos/${solId}`) && t.includes(`kokkupõrge ${tag}`), `${tem} ${p2.url()}`);
  }
  await ctx2.close();

  // 3) escolhida na pagina do acidente: sem B e sem a conversa
  const ctx1 = await celular(); const p1 = await entrar(ctx1, dono1.email);
  await p1.goto(`${SITE}/ee/et/avarii/teade/${emId}`, { waitUntil: 'networkidle' }); await p1.waitForTimeout(3500);
  const tela1 = await p1.innerText('body');
  ok('escolhida abre a pagina do acidente (fica nela)', p1.url().includes(`/avarii/teade/${emId}`) && !/Logi sisse, et/.test(tela1), p1.url());
  ok('... sem placa/telefone de B, sem conversa, sem a concorrente', !/444BBB|5444|mensagem privada|AVISADA/.test(tela1), tela1.slice(0, 300));
  await ctx1.close();

  // 4) A (codigo) e B (login) na pagina: como antes
  const ctxA = await celular(); const pAa = await ctxA.newPage();
  await pAa.goto(`${SITE}/ee/et/avarii/teade/${emId}`, { waitUntil: 'networkidle' });
  await pAa.evaluate(([i, t]) => localStorage.setItem(`bipfix_emergencia_${i}`, t), [emId, dA.token]);
  await pAa.reload({ waitUntil: 'networkidle' }); await pAa.waitForTimeout(3000);
  ok('pagina de A (codigo) mostra B', (await pAa.innerText('body')).includes('444BBB'));
  await ctxA.close();
  const ctxB = await celular(); const pB = await entrar(ctxB, emailB);
  await pB.goto(`${SITE}/ee/et/avarii/teade/${emId}`, { waitUntil: 'networkidle' }); await pB.waitForTimeout(3500);
  ok('pagina de B (logado) abre o acidente', pB.url().includes(`/avarii/teade/${emId}`) && (await pB.innerText('body')).includes('444BBB'), pB.url());
  await ctxB.close();
  const ctxI = await celular(); const pI = await entrar(ctxI, intruso.email);
  await pI.goto(`${SITE}/ee/et/avarii/teade/${emId}`, { waitUntil: 'networkidle' }); await pI.waitForTimeout(3000);
  ok('cliente sem relacao continua vendo "so participantes" (sem redirecionar)', pI.url().includes(`/avarii/teade/${emId}`) && !/444BBB/.test(await pI.innerText('body')), pI.url());
  await ctxI.close();
  if (antigo?.id) await sb.from('notificacoes').delete().eq('id', antigo.id);
} catch (e) {
  falhas++; console.log('ERRO', e.stack || e.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  // ---- link da LKF nos 6 idiomas (site e app) ----
  const ROOT = path.resolve(WEB, '../..');
  for (const l of ['et', 'ru', 'en', 'pt', 'pt-PT', 'it']) {
    const web = JSON.parse(fs.readFileSync(path.join(WEB, `messages/${l}.misc.json`), 'utf8'));
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, `apps/mobile/i18n/locales/${l}.json`), 'utf8'));
    const achar = (o) => { let r = null; JSON.stringify(o, (k, v) => { if (k === 'passo_registro_ee') r = v; return v; }); return r; };
    const w = achar(web), a = achar(app);
    ok(`LKF ${l}: site e app com https://avarii.lkf.ee`, !!w && !!a && w.includes('https://avarii.lkf.ee') && a.includes('https://avarii.lkf.ee') && !/lkk/.test(w + a), `${w} | ${a}`);
  }
  // ---- limpeza ----
  try {
    if (emSemPedido) {
      await sb.from('emergencia_oficinas_notificadas').delete().eq('emergencia_id', emSemPedido);
      const { error: eSP2 } = await sb.from('emergencias').delete().eq('id', emSemPedido);
      if (eSP2) console.log('limpeza acidente sem pedido:', eSP2.message);
    }
    if (emId) {
      const { data: e } = await sb.from('emergencias').select('solicitacao_id').eq('id', emId).maybeSingle();
      const sid = e?.solicitacao_id || solId;
      await sb.from('notificacoes').delete().eq('dados->>emergencia_id', emId);
      if (sid) await sb.from('notificacoes').delete().eq('dados->>solicitacao_id', sid);
      await sb.from('emergencia_mensagens').delete().eq('emergencia_id', emId);
      await sb.from('emergencia_oficinas_notificadas').delete().eq('emergencia_id', emId);
      const { data: ovs } = await sb.from('emergencia_outro_veiculo').select('id').eq('emergencia_id', emId);
      for (const o of ovs || []) await sb.from('emergencia_outro_veiculo_fotos').delete().eq('outro_veiculo_id', o.id);
      await sb.from('emergencia_outro_veiculo').delete().eq('emergencia_id', emId);
      await sb.from('emergencia_fotos').delete().eq('emergencia_id', emId);
      for (const pasta of [`emergencia/${emId}`, `emergencia/${emId}/outro`]) {
        const { data: objs } = await sb.storage.from('damage-photos').list(pasta);
        const arqs = (objs || []).filter((o) => o.id);
        if (arqs.length) await sb.storage.from('damage-photos').remove(arqs.map((o) => `${pasta}/${o.name}`));
      }
      if (sid) {
        const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', sid);
        for (const o of orcs || []) await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id);
        await sb.from('mensagens').delete().eq('solicitacao_id', sid);
        await sb.from('agenda').delete().eq('solicitacao_id', sid);
        await sb.from('orcamentos').delete().eq('solicitacao_id', sid);
        await sb.from('solicitacao_fotos').delete().eq('solicitacao_id', sid);
        await sb.from('emergencias').update({ solicitacao_id: null }).eq('id', emId);
        const { error: eS } = await sb.from('solicitacoes').delete().eq('id', sid);
        if (eS) console.log('limpeza pedido:', eS.message);
      }
      const { error: eE } = await sb.from('emergencias').delete().eq('id', emId);
      if (eE) console.log('limpeza acidente:', eE.message);
    }
    for (const id of oficinas) { await sb.from('funcionarios').delete().eq('oficina_id', id); const { error } = await sb.from('oficinas').delete().eq('id', id); if (error) console.log('limpeza oficina:', error.message); }
    for (const id of [...new Set(contas)]) {
      await sb.from('notificacoes').delete().eq('profile_id', id);
      await sb.from('veiculos').delete().eq('profile_id', id);
      const { error } = await sb.from('profiles').delete().eq('id', id);
      if (error) console.log('limpeza perfil:', error.message);
      await sb.auth.admin.deleteUser(id);
    }
    const { count: sobra } = await sb.from('profiles').select('id', { count: 'exact', head: true }).like('email', `acp-%-${tag}@example.test`);
    console.log(`limpeza: acidente, ${oficinas.length} oficinas e ${new Set(contas).size} contas apagados; sobrou ${sobra ?? '?'} perfil(is)`);
  } catch (e) { console.log('limpeza ERRO', e.message); }
}
console.log(falhas === 0 ? `TUDO CERTO (${total}/0)` : `${falhas} FALHA(S) de ${total}`);
process.exit(falhas ? 1 : 0);
