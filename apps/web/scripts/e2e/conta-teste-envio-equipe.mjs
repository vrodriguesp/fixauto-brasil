// Teste de UNIDADE LOCAL do lote 3.2 (18/11), sem site no ar: carrega lib/notifications.ts, lib/email.ts e
// lib/conta-teste-envio.ts com o jiti (TS + alias @/) contra o banco LOCAL e um Resend FALSO deste script.
//   Q  equipe (funcionario ativo) de oficina cuja dona e conta de teste herda a regra: nada sai pelo Resend;
//      funcionario de oficina real, funcionario INATIVO de oficina de teste e conta real continuam recebendo
//   D  sendOrThrow com varios destinatarios: so os de teste saem da lista (misto -> so os reais; todos de
//      teste -> nada, sem erro; lista vazia -> erro); modo local (EMAIL_PASTA_TESTE) grava 1 arquivo por destinatario
// Nada sai para servicos reais (RESEND_BASE_URL = servidor falso). node conta-teste-envio-equipe.mjs [<.env.local>]
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { lerEnv, ambiente, contador, WEB, RAIZ, ENV_PADRAO, sleep } from './pecas-v3-lib.mjs';

const env = lerEnv(process.argv[2] || ENV_PADRAO);
const A = ambiente(env);
const { ok, fim, tentar } = contador();

const emails = [];
const falso = http.createServer((req, res) => {
  let corpo = ''; req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    let j = null; try { j = JSON.parse(corpo); } catch { /* */ }
    if (req.url.startsWith('/emails')) { emails.push({ to: [].concat(j?.to || []).map((x) => String(x).toLowerCase()), toCru: j?.to, subject: j?.subject || '' }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: crypto.randomUUID() })); return; }
    res.writeHead(404); res.end();
  });
});
await new Promise((r) => falso.listen(0, '127.0.0.1', r));
const PF = falso.address().port;

// ambiente do "servidor": banco local + Resend falso (sem pasta de e-mail)
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, RESEND_API_KEY: 're_teste_local_falso', RESEND_BASE_URL: `http://127.0.0.1:${PF}` });
delete process.env.EMAIL_PASTA_TESTE;
const req = createRequire(path.join(RAIZ, 'package.json'));
const criarJiti = req('jiti');
// o jiti 1.x carrega .json pelo require nativo, sem o alias: o "@/" do JSON (i18n/routing.ts) e resolvido aqui
const Modulo = req('node:module');
const resolverOriginal = Modulo._resolveFilename;
Modulo._resolveFilename = function (r, ...resto) { return resolverOriginal.call(this, r.startsWith('@/') ? path.join(WEB, 'src', r.slice(2)) : r, ...resto); };
const carregar = (arq) => criarJiti(path.join(WEB, 'scripts/e2e/x.js'), { alias: { '@': path.join(WEB, 'src'), 'next-intl/routing': path.join(WEB, 'node_modules/next-intl/dist/esm/production/routing.js') }, requireCache: false, interopDefault: true })(path.join(WEB, 'src/lib', arq));
const N = carregar('notifications.ts');
const E = carregar('email.ts');
const C = carregar('conta-teste-envio.ts');
const extras = { funcionarios: [] };
const novos = (antes) => emails.slice(antes);
const html = '<p>teste lote 3.2</p>';
const assunto = () => `TESTE-L32 ${A.tag} ${crypto.randomBytes(2).toString('hex')}`;

try {
  ok('libs carregadas (sendOrThrow exportada, enviarEmail, emailDeContaTeste)', typeof N.sendOrThrow === 'function' && typeof E.enviarEmail === 'function' && typeof C.emailDeContaTeste === 'function');
  const donaT = await A.conta('oficina', 'l32q-dona-teste', { contaTeste: true }); const ofT = await A.oficina(donaT, 'L32Q oficina teste');
  const donaR = await A.conta('oficina', 'l32q-dona-real', { contaTeste: false }); const ofR = await A.oficina(donaR, 'L32Q oficina real');
  const funcionario = async (of, apelido, ativo = true) => {
    const u = await A.conta('oficina', apelido, { contaTeste: false }); // como o convite cria: conta_teste false
    const { data, error } = await A.admin.from('funcionarios').insert({ oficina_id: of.id, profile_id: u.id, nome: u.nome, cargo: 'mecanico', ativo }).select('id').single();
    if (error) throw new Error(`funcionario: ${error.message}`);
    extras.funcionarios.push(data.id);
    return u;
  };
  const fT = await funcionario(ofT, 'l32q-func-teste');
  const fR = await funcionario(ofR, 'l32q-func-real');
  const fI = await funcionario(ofT, 'l32q-func-inativo', false);
  const real = await A.conta('cliente', 'l32q-real', { contaTeste: false });
  const teste2 = await A.conta('cliente', 'l32q-teste2', { contaTeste: true });

  await tentar('Q', async () => {
    ok('Q.1 funcionario ATIVO de oficina de teste (perfil sem conta_teste): emailDeContaTeste e perfilDeContaTeste = true (e-mail em maiusculas tambem)',
      (await C.emailDeContaTeste(fT.email.toUpperCase())) === true && (await C.perfilDeContaTeste(fT.id)) === true);
    ok('Q.2 funcionario de oficina REAL, funcionario INATIVO de oficina de teste e conta real: false',
      (await C.emailDeContaTeste(fR.email)) === false && (await C.perfilDeContaTeste(fR.id)) === false && (await C.emailDeContaTeste(fI.email)) === false && (await C.perfilDeContaTeste(fI.id)) === false && (await C.emailDeContaTeste(real.email)) === false);
    ok('Q.3 dona de teste continua true; endereco sem perfil continua false (convite sai)', (await C.emailDeContaTeste(donaT.email)) === true && (await C.emailDeContaTeste(`ninguem-${A.tag}@example.test`)) === false);
    const a = emails.length;
    const r1 = await E.enviarEmail({ para: fT.email, assunto: assunto(), html });
    const r2 = await E.enviarEmail({ para: fR.email, assunto: assunto(), html });
    const r3 = await E.enviarEmail({ para: fI.email, assunto: assunto(), html });
    await sleep(300);
    const n = novos(a);
    ok('Q.4 enviarEmail: funcionario de oficina de teste -> nada no Resend (responde true); funcionario real e inativo -> chegam',
      r1 === true && r2 === true && r3 === true && !n.some((e) => e.to.includes(fT.email)) && n.some((e) => e.to.includes(fR.email)) && n.some((e) => e.to.includes(fI.email)), JSON.stringify(n.map((e) => e.to)));
  });

  await tentar('D', async () => {
    let a = emails.length;
    await N.sendOrThrow({ from: 'BipFix <noreply@bipfix.com>', to: [real.email, teste2.email], subject: assunto(), html });
    let n = novos(a);
    ok('D.1 lista mista [real, teste]: 1 envio so para o real', n.length === 1 && n[0].to.length === 1 && n[0].to[0] === real.email && Array.isArray(n[0].toCru), JSON.stringify(n));
    a = emails.length;
    await N.sendOrThrow({ from: 'BipFix <noreply@bipfix.com>', to: [teste2.email, donaT.email, fT.email], subject: assunto(), html });
    ok('D.2 lista so de teste (inclui funcionario de oficina de teste): nada sai, sem erro', novos(a).length === 0);
    a = emails.length;
    await N.sendOrThrow({ from: 'BipFix <noreply@bipfix.com>', to: real.email, subject: assunto(), html });
    n = novos(a);
    ok('D.3 1 destinatario (string): igual a antes, to continua string', n.length === 1 && n[0].toCru === real.email, JSON.stringify(n));
    a = emails.length;
    await N.sendOrThrow({ from: 'BipFix <noreply@bipfix.com>', to: [real.email, fR.email, fT.email], subject: assunto(), html });
    n = novos(a);
    ok('D.4 [real, funcionario real, funcionario de oficina de teste]: so os 2 reais', n.length === 1 && n[0].to.length === 2 && n[0].to.includes(real.email) && n[0].to.includes(fR.email), JSON.stringify(n));
    let erro = null; try { await N.sendOrThrow({ from: 'BipFix <noreply@bipfix.com>', to: [], subject: assunto(), html }); } catch (e) { erro = e.message; }
    ok('D.5 lista vazia: erro (como antes, quando o Resend recusava)', !!erro, String(erro));

    // modo local: sem Resend, 1 arquivo por destinatario
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'l32-emails-'));
    delete process.env.RESEND_API_KEY; process.env.EMAIL_PASTA_TESTE = pasta;
    const N2 = carregar('notifications.ts');
    await N2.sendOrThrow({ from: 'BipFix <noreply@bipfix.com>', to: [real.email, teste2.email], subject: assunto(), html });
    const arqs = fs.readdirSync(pasta);
    ok('D.6 modo local (EMAIL_PASTA_TESTE): 1 arquivo para cada destinatario da lista', arqs.length === 2 && arqs.some((f) => f.endsWith(`_${real.email}.html`)) && arqs.some((f) => f.endsWith(`_${teste2.email}.html`)), arqs.join(', '));
    fs.rmSync(pasta, { recursive: true, force: true });
  });
} catch (e) {
  ok('excecao geral', false, e?.stack || e?.message);
} finally {
  falso.close();
  if (extras.funcionarios.length) await A.admin.from('funcionarios').delete().in('id', extras.funcionarios);
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  ok('limpeza', errosLimpeza.length === 0 && sobras.length === 0, [...errosLimpeza, ...sobras].join(' | '));
  process.exitCode = fim() ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200);
}
