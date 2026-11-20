// "Oficinas avisadas" + SMS do admin as oficinas que nao abriram o pedido (dono 20/11).
//  - a lista traz so as oficinas avisadas deste pedido, com abriu / orcou / sem interesse / telefone certos
//  - "SMS para quem nao abriu" pega so: nao abriu, sem orcamento, sem "sem interesse", com telefone, ativa, conta real
//  - texto no idioma da oficina (et / ru / en), sem dado do cliente; link <site sem www>/r/<numero>?o=<idioma>
//  - trava de 12 h por oficina e pedido; conta de teste nunca recebe (fica "pulado" no registro)
//  - nao-admin 401/403; o numero do pedido aparece no bloco; a confirmacao e na pagina (sem window.confirm)
//  - pedido encerrado: todos os botoes desligados
// Ambiente local: SMS sem Twilio vira arquivo em SMS_PASTA_TESTE (lib/notifications.ts).
//   SITE=http://localhost:3107 node admin-sms-oficinas.mjs <.env.local>
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
const PASTA = env.SMS_PASTA_TESTE;
if (!PASTA) throw new Error('SMS_PASTA_TESTE nao configurado: o teste nao pode mandar SMS de verdade');
if (env.TWILIO_ACCOUNT_SID || env.TWILIO_AUTH_TOKEN) throw new Error('Twilio configurada no .env.local: parado para nao mandar SMS de verdade');
const LINK_BASE = (env.SMS_LINK_BASE || env.NEXT_PUBLIC_SITE_URL || '').replace('://www.', '://').replace(/\/$/, '');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0, oks = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; else oks++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 300) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const ofs = []; const sols = [];
const prefixoTel = String(100 + crypto.randomInt(900)); // 5 + 3 aleatorios + 4 = numero estoniano de 8 digitos, unico por rodada
const tel = (i) => `5${prefixoTel}${String(i).padStart(4, '0')}`;
const smsPara = (numero) => (fs.existsSync(PASTA) ? fs.readdirSync(PASTA) : []).filter((f) => f.endsWith(`_${numero}.json`))
  .map((f) => JSON.parse(fs.readFileSync(path.join(PASTA, f), 'utf8')));

const conta = async (tipo, idioma, extra = {}) => {
  const email = `smsof-${tipo}${contas.length}-${tag}@example.test`; const senha = `Smo${tag}Senha9`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.push(data.user.id);
  const { error: e2 } = await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo} ${idioma}`, email, idioma, ...extra });
  if (e2) throw new Error(e2.message);
  return { id: data.user.id, email, senha };
};
const oficina = async (dono, nome, ativa = true) => {
  const { data, error } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `SMSOF ${nome} ${tag}`, endereco: 'Narva mnt 5', cidade: 'Tallinn', estado: 'Harju', cep: '10117', pais: 'EE', latitude: 59.43, longitude: 24.76, ativa, raio_atendimento_km: 20, especialidades: ['funilaria'] }).select('id').single();
  if (error) throw new Error(error.message);
  ofs.push(data.id); return data.id;
};
const token = async (c) => { const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data, error } = await a.auth.signInWithPassword({ email: c.email, password: c.senha }); if (error) throw new Error(error.message); return data.session.access_token; };
const api = async (metodo, rota, corpo, tk) => {
  const r = await fetch(`${SITE}${rota}`, { method: metodo, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};

let browser;
try {
  const adm = await conta('admin', 'pt');
  const cli = await conta('cliente', 'et', { telefone: '+372 5999 9999' });
  // A: et, nao abriu (formato nacional) · H: ru, nao abriu (com +372) · J: en (perfil 'pt' -> en), nao abriu
  // B: abriu · C: orcou · D: sem interesse · E: sem telefone · F: inativa · G: conta de teste · I: NAO avisada
  const def = {
    A: ['et', tel(1)], H: ['ru', `+372 ${tel(8)}`], J: ['pt', tel(10)],
    B: ['ru', tel(2)], C: ['et', tel(3)], D: ['et', tel(4)], E: ['et', null], F: ['et', tel(6)], G: ['et', tel(7)], I: ['et', tel(9)],
  };
  const O = {}, P = {};
  for (const [k, [idioma, t]] of Object.entries(def)) {
    P[k] = await conta('oficina', idioma, { telefone: t, conta_teste: k === 'G' });
    O[k] = await oficina(P[k], k, k !== 'F');
  }
  const nomeDe = Object.fromEntries(Object.entries(O).map(([k, v]) => [v, k]));
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: 'Octavia', fipe_ano: '2017', placa: `SM${tag.slice(0, 4).toUpperCase()}` }).select('id').single();
  const { data: sol, error: eSol } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'funilaria', descricao: `SMS oficinas ${tag}: Kriimustus uksel`, urgencia: 'media', endereco: 'Narva mnt 7, Tallinn', pais: 'EE', latitude: 59.43, longitude: 24.76, status: 'aberta' }).select('id, numero').single();
  if (eSol) throw new Error(eSol.message);
  sols.push(sol.id);
  const N = sol.numero;
  for (const k of ['A', 'H', 'J', 'B', 'C', 'D', 'E', 'F', 'G']) {
    await sb.from('notificacoes').insert({ profile_id: P[k].id, tipo: 'nova_solicitacao', titulo: 'Uus päring', mensagem: 'teste', dados: { solicitacao_id: sol.id } });
  }
  await sb.from('pedido_vistos').insert({ solicitacao_id: sol.id, oficina_id: O.B });
  const { error: eOrc } = await sb.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: O.C, valor_total: 120, prazo_dias: 2, validade: new Date(Date.now() + 10 * 86400e3).toISOString().slice(0, 10) });
  if (eOrc) throw new Error(`orcamento: ${eOrc.message}`);
  await sb.from('pedido_dispensas').insert({ solicitacao_id: sol.id, oficina_id: O.D, motivo: 'longe' });

  const tkAdm = await token(adm), tkCli = await token(cli), tkOf = await token(P.A);
  const rota = `/api/admin/solicitacoes/${sol.id}/sms-oficinas`;

  // ---------- acesso ----------
  const semLogin = [await api('GET', rota), await api('POST', rota, { modo: 'uma', oficinaIds: [O.A] })];
  ok('sem login: GET e POST = 401', semLogin.every((r) => r.status === 401), semLogin.map((r) => r.status));
  const naoAdm = [await api('GET', rota, undefined, tkCli), await api('POST', rota, { modo: 'uma', oficinaIds: [O.A] }, tkCli), await api('GET', rota, undefined, tkOf), await api('POST', rota, { modo: 'nao_abriu', oficinaIds: [O.A] }, tkOf)];
  ok('cliente e oficina (nao-admin): 401/403 nos dois metodos', naoAdm.every((r) => r.status === 401 || r.status === 403), naoAdm.map((r) => r.status));
  ok('nao-admin nao recebe telefone nem lista', naoAdm.every((r) => !r.j.oficinas));
  ok('nenhum SMS saiu nas chamadas sem permissao', smsPara(`372${tel(1)}`).length === 0);

  // ---------- lista ----------
  const g = await api('GET', rota, undefined, tkAdm);
  ok('admin: GET 200', g.status === 200, g.status);
  ok('GET traz o numero do pedido', g.j.numero === N, g.j.numero);
  const lin = Object.fromEntries((g.j.oficinas || []).map((o) => [nomeDe[o.oficina_id], o]));
  ok('lista = as 9 avisadas (a I, nao avisada, fica fora)', Object.keys(lin).sort().join() === 'A,B,C,D,E,F,G,H,J', Object.keys(lin).sort().join());
  ok('B: abriu (vistoEm) e nao entra no "nao abriu"', !!lin.B?.vistoEm && lin.B.naoAbriu === false && lin.B.bloqueio === null);
  ok('A: nao abriu, sem bloqueio, entra no "nao abriu"', lin.A?.vistoEm === null && lin.A.naoAbriu === true && lin.A.bloqueio === null);
  ok('C: orcamento + bloqueio "orcou"', !!lin.C?.orcamento && lin.C.bloqueio === 'orcou' && !lin.C.naoAbriu);
  ok('D: sem interesse + bloqueio "dispensou"', !!lin.D?.dispensa && lin.D.bloqueio === 'dispensou' && !lin.D.naoAbriu);
  ok('E: sem telefone + bloqueio "sem_telefone"', lin.E?.telefone === false && lin.E.bloqueio === 'sem_telefone');
  ok('F: inativa + bloqueio "inativa"', lin.F?.ativa === false && lin.F.bloqueio === 'inativa');
  ok('G: conta de teste fora do "nao abriu"', lin.G?.contaTeste === true && lin.G.naoAbriu === false);
  ok('telefone so com o final (3 digitos) na resposta', lin.A?.telefoneFinal === tel(1).slice(-3) && !JSON.stringify(g.j).includes(tel(1)), lin.A?.telefoneFinal);
  ok('idiomas: A et, H ru, J en (pt -> en)', lin.A?.idioma === 'et' && lin.H?.idioma === 'ru' && lin.J?.idioma === 'en', [lin.A?.idioma, lin.H?.idioma, lin.J?.idioma]);
  const alvo = (g.j.oficinas || []).filter((o) => o.naoAbriu).map((o) => nomeDe[o.oficina_id]).sort().join();
  ok('"SMS para quem nao abriu" mira so A, H, J', alvo === 'A,H,J', alvo);

  // ---------- tela: numero visivel, confirmacao na pagina, envio em lote ----------
  const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');
  browser = await chromium.launch({ executablePath: exe });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  const dialogos = [];
  const p = await ctx.newPage();
  p.on('dialog', (d) => { dialogos.push(d.message()); d.dismiss().catch(() => {}); });
  await p.goto(`${SITE}/br/pt/login?voltar=${encodeURIComponent(`/admin/solicitacoes/${sol.id}`)}`, { waitUntil: 'networkidle' });
  await p.locator('#c0862-2').fill(adm.email);
  await p.locator('#login-senha').fill(adm.senha);
  await p.locator('form:has(#login-senha) button[type=submit]').click();
  await p.waitForURL((x) => !/\/login/.test(x.pathname), { timeout: 30000 }).catch(() => {});
  if (!p.url().includes(`/admin/solicitacoes/${sol.id}`)) await p.goto(`${SITE}/admin/solicitacoes/${sol.id}`, { waitUntil: 'networkidle' });
  const bloco = p.locator('[data-testid=admin-oficinas-avisadas]');
  await bloco.locator('[data-testid=avisada-oficina]').first().waitFor({ timeout: 30000 }).catch(() => {});
  ok('tela: bloco "Oficinas avisadas" com o numero do pedido', (await bloco.locator('[data-testid=avisadas-numero]').textContent().catch(() => '')) === String(N));
  ok('tela: numero do pedido no topo continua', (await p.locator('[data-testid=admin-detalhe-numero]').textContent().catch(() => '')).includes(String(N)));
  ok('tela: 9 linhas', (await bloco.locator('[data-testid=avisada-oficina]').count()) === 9);
  ok('tela: botao individual da C (orcou) desligado com motivo', await bloco.locator(`[data-oficina="${O.C}"] [data-testid=sms-uma]`).isDisabled() && /já orçou/.test(await bloco.locator(`[data-oficina="${O.C}"] [data-testid=sms-bloqueio]`).textContent()));
  await bloco.locator('[data-testid=sms-nao-abriu]').click();
  const conf = bloco.locator('[data-testid=sms-confirmar]');
  await conf.waitFor({ timeout: 5000 }).catch(() => {});
  ok('tela: confirmacao na pagina lista 3 oficinas', (await conf.locator('li').count()) === 3);
  const textos = await conf.locator('[data-testid=sms-texto]').allTextContents();
  ok('tela: previa mostra o texto com o link do pedido', textos.length === 3 && textos.every((t) => t.includes(`/r/${N}?o=`)), textos);
  ok('nada saiu antes de confirmar', smsPara(`372${tel(1)}`).length === 0);
  await conf.locator('[data-testid=sms-confirmar-enviar]').click();
  await bloco.locator('[data-testid=sms-resultado]').waitFor({ timeout: 20000 }).catch(() => {});
  const res = await bloco.locator('[data-testid=sms-resultado] li').allTextContents();
  ok('tela: resultado "SMS enviado" x3', res.length === 3 && res.every((t) => t.includes('SMS enviado')), res);
  ok('tela: nenhum window.confirm/alert', dialogos.length === 0, dialogos);
  await p.screenshot({ path: path.resolve(PASTA, `../resultados/admin-sms-oficinas-${tag}.png`), fullPage: true }).catch(() => {});

  // ---------- textos e links ----------
  const esperado = {
    A: [`372${tel(1)}`, `BipFix: uus päring ootab teie hinnapakkumist: ${LINK_BASE}/r/${N}?o=et`],
    H: [`372${tel(8)}`, `BipFix: новая заявка ждёт вашей цены: ${LINK_BASE}/r/${N}?o=ru`],
    J: [`372${tel(10)}`, `BipFix: a new request is waiting for your quote: ${LINK_BASE}/r/${N}?o=en`],
  };
  for (const [k, [num, texto]] of Object.entries(esperado)) {
    const s = smsPara(num);
    ok(`${k}: exatamente 1 SMS para +${num.slice(0, 3)}…`, s.length === 1, s.length);
    ok(`${k}: texto exato no idioma dela`, s[0]?.texto === texto, s[0]?.texto);
    ok(`${k}: sem dado do cliente nem slug em portugues`, !!s[0] && !/Kriimustus|Narva|Skoda|SM[A-F0-9]{4}|oficina|orcamento|cliente/i.test(s[0].texto), s[0]?.texto);
  }
  ok('link sem "www" e com o numero do pedido', !LINK_BASE.includes('://www.') && smsPara(`372${tel(1)}`)[0]?.texto.endsWith(`/r/${N}?o=et`));
  ok('RU cabe em 1 SMS (<= 70 caracteres UCS-2 com link de producao)', `BipFix: новая заявка ждёт вашей цены: https://bipfix.com/r/${N}?o=ru`.length <= 70, `BipFix: новая заявка ждёт вашей цены: https://bipfix.com/r/${N}?o=ru`.length);
  const rr = await fetch(`${SITE}/r/${N}?o=et`, { redirect: 'manual' });
  ok('o link leva a pagina de orcar da oficina (et)', rr.status === 302 && (rr.headers.get('location') || '').includes(`/oficina/enviar-orcamento/${sol.id}`), rr.headers.get('location'));
  const { data: linhas } = await sb.from('sms_envios').select('profile_id, tipo, status, enviado_por, telefone_final').eq('solicitacao_id', sol.id);
  const enviados = (linhas || []).filter((l) => l.status === 'enviado');
  ok('sms_envios: 3 linhas oficina_manual enviadas pelo admin', enviados.length === 3 && enviados.every((l) => l.tipo === 'oficina_manual' && l.enviado_por === adm.id), JSON.stringify(linhas));
  ok('sms_envios: so o final do telefone', enviados.every((l) => /^\d{3}$/.test(l.telefone_final || '')));

  // ---------- trava das 12 h ----------
  const g2 = await api('GET', rota, undefined, tkAdm);
  const l2 = Object.fromEntries((g2.j.oficinas || []).map((o) => [nomeDe[o.oficina_id], o]));
  ok('12 h: A agora bloqueada (sms_recente, com liberaEm) e fora do "nao abriu"', l2.A?.bloqueio === 'sms_recente' && !!l2.A.liberaEm && !l2.A.naoAbriu, JSON.stringify(l2.A));
  ok('12 h: ultimo SMS da A aparece como enviado', l2.A?.ultimoSms?.status === 'enviado');
  ok('12 h: "nao abriu" agora vazio', (g2.j.oficinas || []).filter((o) => o.naoAbriu).length === 0);
  const rep = await api('POST', rota, { modo: 'uma', oficinaIds: [O.A] }, tkAdm);
  ok('12 h: 2o SMS para a A e recusado pelo servidor', rep.status === 200 && rep.j.resultados?.[0]?.status === 'pulado' && rep.j.resultados[0].motivo === 'sms_recente', JSON.stringify(rep.j));
  ok('12 h: nenhum arquivo novo para a A', smsPara(`372${tel(1)}`).length === 1);
  // 13 h depois libera
  await sb.from('sms_envios').update({ created_at: new Date(Date.now() - 13 * 3600e3).toISOString() }).eq('solicitacao_id', sol.id).eq('profile_id', P.A.id);
  const g3 = await api('GET', rota, undefined, tkAdm);
  const l3 = Object.fromEntries((g3.j.oficinas || []).map((o) => [nomeDe[o.oficina_id], o]));
  ok('depois de 13 h a A volta a poder receber', l3.A?.bloqueio === null && l3.A.naoAbriu === true, JSON.stringify(l3.A));

  // ---------- lote nao passa quem abriu/orcou; individual para quem abriu passa ----------
  const lote = await api('POST', rota, { modo: 'nao_abriu', oficinaIds: [O.B, O.C, O.D, O.G] }, tkAdm);
  const mot = Object.fromEntries((lote.j.resultados || []).map((r) => [nomeDe[r.oficina_id], `${r.status}:${r.motivo}`]));
  ok('lote com B/C/D/G forjado: ninguem recebe (abriu / orcou / dispensou / conta_teste)', mot.B === 'pulado:abriu' && mot.C === 'pulado:orcou' && mot.D === 'pulado:dispensou' && mot.G === 'pulado:conta_teste', JSON.stringify(mot));
  ok('nenhum SMS para B, C, D, G', [2, 3, 4, 7].every((i) => smsPara(`372${tel(i)}`).length === 0));
  const indB = await api('POST', rota, { modo: 'uma', oficinaIds: [O.B] }, tkAdm);
  ok('individual para a B (abriu, sem orcamento) sai, em russo', indB.j.resultados?.[0]?.status === 'enviado' && smsPara(`372${tel(2)}`)[0]?.texto.includes('?o=ru'), JSON.stringify(indB.j));
  const dois = await api('POST', rota, { modo: 'uma', oficinaIds: [O.A, O.H] }, tkAdm);
  ok('individual com 2 oficinas = 400', dois.status === 400, dois.status);

  // ---------- conta de teste ----------
  const t = await api('POST', rota, { modo: 'uma', oficinaIds: [O.G] }, tkAdm);
  ok('conta de teste: individual fica "pulado: conta_teste"', t.j.resultados?.[0]?.status === 'pulado' && t.j.resultados[0].motivo === 'conta_teste', JSON.stringify(t.j));
  ok('conta de teste: nenhum arquivo de SMS', smsPara(`372${tel(7)}`).length === 0);
  const { data: lg } = await sb.from('sms_envios').select('status, motivo').eq('solicitacao_id', sol.id).eq('profile_id', P.G.id);
  ok('conta de teste: tentativa registrada em sms_envios (pulado)', (lg || []).length >= 1 && lg.every((l) => l.status === 'pulado' && l.motivo === 'conta_teste'), JSON.stringify(lg));

  // ---------- auditoria e pedido encerrado ----------
  const { count: aud } = await sb.from('admin_auditoria').select('id', { count: 'exact', head: true }).eq('solicitacao_id', sol.id).eq('acao', 'sms_oficinas');
  ok('auditoria registra os envios', (aud || 0) >= 4, aud);
  await sb.from('solicitacoes').update({ status: 'cancelada' }).eq('id', sol.id);
  const g4 = await api('GET', rota, undefined, tkAdm);
  ok('pedido encerrado: todos bloqueados (pedido_fechado)', (g4.j.oficinas || []).length === 9 && g4.j.oficinas.every((o) => o.bloqueio === 'pedido_fechado' && !o.naoAbriu));
  const fech = await api('POST', rota, { modo: 'uma', oficinaIds: [O.A] }, tkAdm);
  ok('pedido encerrado: envio recusado', fech.j.resultados?.[0]?.motivo === 'pedido_fechado' && smsPara(`372${tel(1)}`).length === 1, JSON.stringify(fech.j));
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 700)); }
finally {
  await browser?.close().catch(() => {});
  for (const id of sols) {
    for (const t of ['orcamentos', 'pedido_dispensas', 'pedido_vistos', 'sms_envios', 'admin_auditoria']) await sb.from(t).delete().eq('solicitacao_id', id);
    await sb.from('notificacoes').delete().eq('dados->>solicitacao_id', id);
    await sb.from('solicitacoes').delete().eq('id', id);
  }
  for (const oid of ofs) await sb.from('oficinas').delete().eq('id', oid);
  for (const id of contas) {
    await sb.from('veiculos').delete().eq('profile_id', id);
    await sb.from('admin_auditoria').delete().eq('admin_id', id);
    await sb.from('notificacoes').delete().eq('profile_id', id);
    await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id);
  }
  for (const f of (fs.existsSync(PASTA) ? fs.readdirSync(PASTA) : []).filter((f) => f.includes(`_3725${prefixoTel}`))) fs.unlinkSync(path.join(PASTA, f));
  console.log(`\n${oks} ok, ${falhas} falha(s)\n${falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S)`}`);
  process.exit(falhas ? 1 : 0);
}
