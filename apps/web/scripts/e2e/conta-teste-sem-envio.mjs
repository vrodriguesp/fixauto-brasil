// E2E LOCAL do lote 3.1 (dono 18/11): conta de teste (profiles.conta_teste) NAO recebe e-mail (Resend), push do
// app (Expo) nem SMS (Twilio); conta real recebe igual a antes.
// Como: sobe um 2o site do MESMO build em :3101 "como producao" - RESEND_API_KEY falsa + RESEND_BASE_URL (variavel do
// proprio SDK do Resend) e EXPO_PUSH_URL apontando para um servidor falso deste script; chaves Twilio falsas so para o
// caminho da conta de teste (que tem de parar ANTES da Twilio - o caminho da conta real nao e chamado: iria a
// api.twilio.com). Nada sai para servicos reais. O :3100 (EMAIL_PASTA_TESTE) nao e tocado.
// Exige `next build` feito. node conta-teste-sem-envio.mjs [<.env.local>]
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { lerEnv, ambiente, contador, WEB, ENV_PADRAO, sleep } from './pecas-v3-lib.mjs';

const env = lerEnv(process.argv[2] || ENV_PADRAO);
const PORTA_SITE = 3101;
const SITE2 = `http://localhost:${PORTA_SITE}`;
const A = ambiente(env);
const { ok, fim, tentar } = contador();

// servidor falso: Resend (POST /emails) e Expo (POST /push)
const emails = []; const pushes = [];
const falso = http.createServer((req, res) => {
  let corpo = ''; req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    let j = null; try { j = JSON.parse(corpo); } catch { /* */ }
    if (req.url.startsWith('/emails')) { emails.push({ to: [].concat(j?.to || []), subject: j?.subject || '' }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: crypto.randomUUID() })); return; }
    if (req.url.startsWith('/push')) { const lote = Array.isArray(j) ? j : []; pushes.push(...lote); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: lote.map(() => ({ status: 'ok', id: crypto.randomUUID() })) })); return; }
    res.writeHead(404); res.end();
  });
});
await new Promise((r) => falso.listen(0, '127.0.0.1', r));
const PF = falso.address().port;
const PUSH_CHAVE = crypto.randomBytes(16).toString('hex');

let log = '';
const site = spawn(process.execPath, [path.join(WEB, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORTA_SITE)], {
  cwd: WEB,
  env: { ...process.env, RESEND_API_KEY: 're_teste_local_falso', RESEND_BASE_URL: `http://127.0.0.1:${PF}`, EXPO_PUSH_URL: `http://127.0.0.1:${PF}/push`, PUSH_CHAVE, TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000', TWILIO_AUTH_TOKEN: 'teste-local-falso' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
site.stdout.on('data', (d) => { log += d; }); site.stderr.on('data', (d) => { log += d; });
const parar = () => { try { site.kill(); } catch { /* */ } falso.close(); };
process.on('SIGINT', async () => { parar(); await A.limpar(); process.exit(130); });

let ipN = 1; const ip = () => `10.79.0.${ipN++}`;
const api = async (metodo, rota, corpo, extra = {}) => {
  try { const r = await fetch(`${SITE2}${rota}`, { method: metodo, headers: { 'Content-Type': 'application/json', 'x-real-ip': ip(), ...extra }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }); return { status: r.status, d: await r.json().catch(() => ({})) }; } catch (e) { return { status: 0, d: { erro: String(e?.message || e) } }; }
};
const extras = { veiculos: [], solicitacoes: [], tokens: [], avisos: [] };

try {
  let no = false;
  for (let i = 0; i < 60 && !no; i++) { await sleep(1000); try { no = (await fetch(`${SITE2}/ee/et`, { redirect: 'manual' })).status > 0; } catch { /* */ } }
  ok(`site "como producao" no ar em ${SITE2} (Resend e Expo falsos)`, no, log.slice(-300));
  if (!no) throw new Error('site :3101 nao subiu');

  const teste = await A.conta('cliente', 'envio-teste', { contaTeste: true });
  const real = await A.conta('cliente', 'envio-real', { contaTeste: false });
  const paraTeste = (lista) => lista.filter((e) => e.to.some((t) => t.toLowerCase() === teste.email));
  const paraReal = (lista) => lista.filter((e) => e.to.some((t) => t.toLowerCase() === real.email));

  // 1) lib/email.ts (enviarEmail): recuperar senha
  await tentar('E1', async () => {
    const a = await api('POST', '/api/esqueci-senha', { email: real.email });
    const b = await api('POST', '/api/esqueci-senha', { email: teste.email.toUpperCase() });
    await sleep(2500);
    ok('E1.a recuperar senha: as 2 rotas respondem 200 (nada muda para quem pede)', a.status === 200 && b.status === 200, `${a.status} ${b.status}`);
    ok('E1.b conta REAL: 1 e-mail chegou ao Resend (falso)', paraReal(emails).length === 1, JSON.stringify(emails.map((e) => e.subject)));
    ok('E1.c conta de TESTE (e-mail em maiusculas): nenhum e-mail ao Resend', paraTeste(emails).length === 0);
    ok('E1.d log "[email] conta de teste - nao enviado" sem o endereco', /\[email\] conta de teste - nao enviado/.test(log) && !log.toLowerCase().includes(teste.email), log.split('\n').filter((l) => /\[email\]/.test(l)).join(' | ').slice(0, 300));
  });

  // 2) lib/notifications.ts (sendOrThrow): cotacao de peca respondida -> e-mail a compradora
  await tentar('E2', async () => {
    const dLoja = await A.conta('loja_pecas', 'envio-loja', { contaTeste: false }); const lj = await A.loja(dLoja, 'Envio loja');
    const ofTeste = await A.oficina(await A.conta('oficina', 'envio-of-teste', { contaTeste: true }), 'Envio oficina teste');
    const ofReal = await A.oficina(await A.conta('oficina', 'envio-of-real', { contaTeste: false }), 'Envio oficina real');
    const sL = await A.sessao(dLoja);
    const antes = emails.length;
    for (const of of [ofReal, ofTeste]) {
      const cot = await A.cotacao(of, 'Envio');
      await A.resposta(cot, lj, { preco: 12 });
      const r = await api('POST', '/api/marcar-cotacao-respondida', { cotacaoId: cot.id }, { Authorization: `Bearer ${sL.token}` });
      ok(`E2.a marcar-cotacao-respondida (${of === ofReal ? 'real' : 'teste'}) -> 200`, r.status === 200, JSON.stringify(r).slice(0, 200));
    }
    await sleep(2500);
    const novos = emails.slice(antes);
    ok('E2.b compradora REAL: 1 e-mail "cotacao respondida" ao Resend', novos.filter((e) => e.to.includes(ofReal.dono.email)).length === 1, JSON.stringify(novos));
    ok('E2.c compradora de TESTE: nenhum e-mail', novos.filter((e) => e.to.includes(ofTeste.dono.email)).length === 0, JSON.stringify(novos));
  });

  // 3) push do app (Expo)
  await tentar('P', async () => {
    const res = {};
    for (const [k, u] of [['real', real], ['teste', teste]]) {
      const token = `ExponentPushToken[l31-${k}-${A.tag}]`;
      const { data: t, error: et } = await A.admin.from('push_tokens').insert({ profile_id: u.id, token, plataforma: 'android' }).select('id').single();
      if (et) throw new Error(`push_tokens: ${et.message}`);
      extras.tokens.push(t.id);
      const { data: n, error: en } = await A.admin.from('notificacoes').insert({ profile_id: u.id, tipo: 'sistema', titulo: `TESTE L31 ${A.tag}`, mensagem: 'teste' }).select('id').single();
      if (en) throw new Error(`notificacoes: ${en.message}`);
      extras.avisos.push(n.id);
      res[k] = { token, r: await api('POST', '/api/push/notificacao', { id: n.id }, { 'x-push-chave': PUSH_CHAVE }) };
    }
    await sleep(500);
    ok('P.a conta REAL: push enviado (1 mensagem para o token dela na Expo falsa)', res.real.r.d?.enviados === 1 && pushes.filter((m) => m.to === res.real.token).length === 1, JSON.stringify(res.real.r));
    ok('P.b conta de TESTE: nenhum push (enviados 0, nada na Expo falsa), token mantido', res.teste.r.status === 200 && res.teste.r.d?.enviados === 0 && pushes.filter((m) => m.to === res.teste.token).length === 0, JSON.stringify(res.teste.r));
  });

  // 4) SMS (Twilio): so o caminho da conta de teste (o da real iria a api.twilio.com)
  await tentar('S', async () => {
    const adm = await A.conta('admin', 'envio-admin', { idioma: 'pt' });
    const sA = await A.sessao(adm);
    const { data: v, error: ev } = await A.admin.from('veiculos').insert({ profile_id: teste.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018', placa: `TS${crypto.randomBytes(2).toString('hex').toUpperCase()}` }).select('id').single();
    if (ev) throw new Error(`veiculo: ${ev.message}`);
    extras.veiculos.push(v.id);
    const { data: sol, error: es } = await A.admin.from('solicitacoes').insert({ cliente_id: teste.id, veiculo_id: v.id, tipo: 'mecanica', descricao: `TESTE-L31 sms ${A.tag}`, urgencia: 'media', endereco: 'Tallinn', latitude: 59.43, longitude: 24.75, pais: 'EE', status: 'aberta' }).select('id, numero').single();
    if (es) throw new Error(`solicitacao: ${es.message}`);
    extras.solicitacoes.push(sol.id);
    const r = await api('POST', '/api/admin/sms', { numero: sol.numero }, { Authorization: `Bearer ${sA.token}` });
    const linhas = (await A.admin.from('sms_envios').select('id').eq('solicitacao_id', sol.id)).data || [];
    ok("S.a SMS manual para pedido de conta de TESTE: 422 { status 'pulado', motivo 'conta_teste' } sem chamar a Twilio, nada em sms_envios", r.status === 422 && r.d?.status === 'pulado' && r.d?.motivo === 'conta_teste' && linhas.length === 0, JSON.stringify(r));
  });

  ok('nenhum endereco de conta de teste no log do servidor', !log.toLowerCase().includes(teste.email));
} catch (e) {
  ok('excecao geral', false, e?.stack || e?.message);
} finally {
  parar();
  const del = async (t, ids) => { if (ids.length) await A.admin.from(t).delete().in('id', ids); };
  if (extras.solicitacoes.length) { await A.admin.from('admin_auditoria').delete().in('solicitacao_id', extras.solicitacoes); await A.admin.from('sms_envios').delete().in('solicitacao_id', extras.solicitacoes); }
  await del('solicitacoes', extras.solicitacoes); await del('veiculos', extras.veiculos);
  await del('push_tokens', extras.tokens); await del('notificacoes', extras.avisos);
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  ok('limpeza', errosLimpeza.length === 0 && sobras.length === 0, [...errosLimpeza, ...sobras].join(' | '));
  process.exitCode = fim() ? 1 : 0;
}
