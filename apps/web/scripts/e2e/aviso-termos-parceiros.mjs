// E2E LOCAL do aviso de 30 dias aos parceiros (termos 9.1 / privacidade 3.12; P2B art. 3(2)), 18/11.
// O script testado fica FORA do repositorio: Documentos/_scripts/aviso_termos_pecas_9_1.mjs (AVISO_SCRIPT troca).
//   A  previa (padrao): lista so titulares ativos e reais de oficinas e lojas, 1 linha por dono, lingua da conta
//      (idioma 'pt' padrao fora do Brasil -> lingua do pais), data de vigencia = envio + 30 dias, links por lingua,
//      direito de sair; NADA chega ao Resend
//   E  envio so com --enviar, pelo Resend FALSO deste script (RESEND_BASE_URL), com --so=<email>; registro em
//      envios.jsonl; rodar de novo nao repete
//   G  guardas: banco nao local sem --producao-confirmada para antes de ler; --dias < 30; --enviar com data que nao e
//      hoje; --enviar sem chave
// So banco local. Nenhum site precisa estar no ar.
//   node aviso-termos-parceiros.mjs [<.env.local>]
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { lerEnv, ambiente, contador, ENV_PADRAO, RAIZ } from './pecas-v3-lib.mjs';

const ARQ_ENV = process.argv[2] || ENV_PADRAO;
const env = lerEnv(ARQ_ENV);
const SCRIPT = process.env.AVISO_SCRIPT || path.resolve(RAIZ, '../../_scripts/aviso_termos_pecas_9_1.mjs');
const A = ambiente(env);
const { ok, fim, tentar } = contador();
const SAIDA = fs.mkdtempSync(path.join(os.tmpdir(), 'aviso-termos-'));
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date());
const mais30 = (() => { const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 30); return d.toISOString().slice(0, 10); })();

// Resend falso: guarda cada POST /emails
const recebidos = [];
const falso = http.createServer((req, res) => {
  let corpo = ''; req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    let j = null; try { j = JSON.parse(corpo); } catch { /* */ }
    recebidos.push({ url: req.url, auth: req.headers.authorization, j });
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: crypto.randomUUID() }));
  });
});
await new Promise((r) => falso.listen(0, '127.0.0.1', r));
const RESEND_FALSO = `http://127.0.0.1:${falso.address().port}`;

// spawn assincrono (o Resend falso roda neste mesmo processo: spawnSync travaria o servidor)
const rodar = (extra, envExtra = {}, arq = ARQ_ENV) => new Promise((resolve) => {
  const p = spawn(process.execPath, [SCRIPT, arq, `--saida=${SAIDA}`, ...extra], { env: { ...process.env, RESEND_API_KEY: '', RESEND_BASE_URL: RESEND_FALSO, ...envExtra } });
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  p.on('close', (status) => resolve({ status, out }));
});
const csv = () => fs.readFileSync(path.join(SAIDA, 'destinatarios.csv'), 'utf8');
const previaDe = (email) => {
  const dir = path.join(SAIDA, 'previas');
  for (const f of fs.readdirSync(dir)) { const s = fs.readFileSync(path.join(dir, f), 'utf8'); if (s.startsWith(`<!-- para: ${email} |`)) return { f, s }; }
  return null;
};

try {
  ok('script existe', fs.existsSync(SCRIPT), SCRIPT);
  // contas: reais (conta_teste false) e de teste, ativas e inativas
  const dEt = await A.conta('oficina', 'aviso-of-et', { idioma: 'et' }); const ofEt = await A.oficina(dEt, 'Aviso Of ET');
  const dRu = await A.conta('loja_pecas', 'aviso-loja-ru', { idioma: 'ru' }); const ljRu = await A.loja(dRu, 'Aviso Loja RU');
  const dPt = await A.conta('oficina', 'aviso-of-ptpadrao', { idioma: 'pt' }); await A.oficina(dPt, 'Aviso Of PT padrao', { pais: 'EE' });
  const dBr = await A.conta('oficina', 'aviso-of-br', { idioma: 'pt' }); await A.oficina(dBr, 'Aviso Of BR', { pais: 'BR' });
  const dDois = await A.conta('oficina', 'aviso-dois', { idioma: 'en' }); const ofDois = await A.oficina(dDois, 'Aviso Dois Oficina'); const ljDois = await A.loja(dDois, 'Aviso Dois Loja');
  const dTeste = await A.conta('oficina', 'aviso-teste', { idioma: 'et', contaTeste: true }); await A.oficina(dTeste, 'Aviso Teste');
  const dInat = await A.conta('oficina', 'aviso-inativa', { idioma: 'et' }); await A.oficina(dInat, 'Aviso Inativa', { ativa: false });
  const dPerfilOff = await A.conta('loja_pecas', 'aviso-perfil-off', { idioma: 'et', ativo: false }); await A.loja(dPerfilOff, 'Aviso Perfil Off');
  const dItLoja = await A.conta('loja_pecas', 'aviso-loja-it', { idioma: 'it' }); await A.loja(dItLoja, 'Aviso Loja IT', { pais: 'IT' });

  await tentar('A', async () => {
    const r = await rodar([]);
    ok('A.1 previa (sem flag): sai 0, diz PREVIA, vigencia = hoje + 30 dias', r.status === 0 && /PREVIA \(dry-run, nada enviado\)/.test(r.out) && r.out.includes(`vigencia: ${mais30} (+30 dias)`), r.out);
    ok('A.2 previa: nenhum POST no Resend', recebidos.length === 0, String(recebidos.length));
    const c = csv();
    const linha = (e) => c.split('\n').find((l) => l.includes(`"${e}"`)) || '';
    ok('A.3 inclui os titulares reais ativos (oficina et, loja ru, pt->EE, BR, dono com oficina+loja, loja IT)', [dEt, dRu, dPt, dBr, dDois, dItLoja].every((d) => linha(d.email)), c.split('\n').length);
    ok('A.4 fora: conta de teste, oficina inativa, perfil inativo', [dTeste, dInat, dPerfilOff].every((d) => !c.includes(d.email)));
    ok('A.5 dono com oficina E loja: 1 linha so, com os 2 negocios', c.split('\n').filter((l) => l.includes(dDois.email)).length === 1 && linha(dDois.email).includes(`oficina:${ofDois.nome}`) && linha(dDois.email).includes(`loja:${ljDois.nome}`), linha(dDois.email));
    ok('A.6 lingua: et->et, ru->ru, en->en, it->it, idioma pt padrao + oficina EE -> et, pt + BR -> pt',
      linha(dEt.email).includes('"et";"et"') && linha(dRu.email).includes('"ru";"ru"') && linha(dDois.email).includes('"en";"en"') && linha(dItLoja.email).includes('"it";"it"') && linha(dPt.email).includes('"et";"pt"') && linha(dBr.email).includes('"pt";"pt"'),
      [dEt, dRu, dDois, dItLoja, dPt, dBr].map((d) => linha(d.email).split(';').slice(2, 4).join('/')).join(' '));

    const pRu = previaDe(dRu.email); const pEt = previaDe(dEt.email); const pBr = previaDe(dBr.email); const pEn = previaDe(dDois.email); const pIt = previaDe(dItLoja.email);
    ok('A.7 previa por destinatario gravada com para/assunto/responder', [pRu, pEt, pBr, pEn, pIt].every(Boolean) && pRu.s.includes('| responder: support@bipfix.com'));
    const dataEt = mais30.split('-').reverse().join('.');
    ok('A.8 et: assunto e corpo com a data dd.mm.aaaa, 9.1 e 3.12, links /ee/et/tingimused, /ee/et/privaatsus, /ee/et/kustuta-konto',
      pEt.s.includes(`assunto: BipFix: kasutustingimuste ja privaatsuspoliitika muudatused alates ${dataEt}`) && pEt.s.includes('9.1') && pEt.s.includes('3.12') && ['https://bipfix.com/ee/et/tingimused', 'https://bipfix.com/ee/et/privaatsus', 'https://bipfix.com/ee/et/kustuta-konto'].every((u) => pEt.s.includes(`href="${u}"`)),
      pEt.s.slice(0, 200));
    ok('A.9 ru: links /ee/ru/usloviya, /ee/ru/konfidentsialnost, /ee/ru/udalit-akkaunt e o nome do negocio', ['/ee/ru/usloviya', '/ee/ru/konfidentsialnost', '/ee/ru/udalit-akkaunt'].every((u) => pRu.s.includes(`https://bipfix.com${u}"`)) && pRu.s.includes(ljRu.nome) && pRu.s.includes('Здравствуйте'));
    ok('A.10 BR: Termos de Uso (clausula 7), LGPD, links /br/pt/termos e /br/pt/excluir-conta', pBr.s.includes('cláusula 7') && pBr.s.includes('LGPD') && pBr.s.includes('https://bipfix.com/br/pt/termos"') && pBr.s.includes('https://bipfix.com/br/pt/excluir-conta"'));
    ok('A.11 it: links /it/it/termini e /it/it/elimina-account', pIt.s.includes('https://bipfix.com/it/it/termini"') && pIt.s.includes('https://bipfix.com/it/it/elimina-account"'));
    ok('A.12 en: direito de sair antes da data + contato + bloqueio P-7 + "only active Partners"', /close your account before \d{1,2} \w+ \d{4}/.test(pEn.s) && pEn.s.includes('mailto:support@bipfix.com') && pEn.s.includes('cannot send new parts requests or confirm offers') && pEn.s.includes('only active Partners'));
    ok('A.13 nome do negocio escapado no HTML (sem tag crua)', !/<script/i.test(pEn.s));
    const am = fs.readdirSync(path.join(SAIDA, 'amostras')).sort();
    ok('A.14 uma amostra por lingua (6)', JSON.stringify(am) === JSON.stringify(['en.html', 'et.html', 'it.html', 'pt-PT.html', 'pt.html', 'ru.html']), am.join(','));
    ok('A.15 nenhum envios.jsonl na previa', !fs.existsSync(path.join(SAIDA, 'envios.jsonl')));
  });

  await tentar('E', async () => {
    const r = await rodar(['--enviar', `--so=${dRu.email}`, '--intervalo-ms=0'], { RESEND_API_KEY: 're_falso_teste' });
    ok('E.1 --enviar --so: sai 0, 1 enviado', r.status === 0 && /ENVIO: 1 enviados, 0 falhas/.test(r.out), r.out);
    const e = recebidos.at(-1)?.j || {};
    ok('E.2 Resend falso recebeu 1 POST /emails para a loja ru, com assunto ru, reply_to support@, chave no Authorization', recebidos.length === 1 && recebidos[0].url === '/emails' && recebidos[0].auth === 'Bearer re_falso_teste' && e.to === dRu.email && /^BipFix: изменения/.test(e.subject) && e.reply_to === 'support@bipfix.com', JSON.stringify({ n: recebidos.length, to: e.to, s: e.subject }));
    const linhas = fs.readFileSync(path.join(SAIDA, 'envios.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    ok('E.3 envios.jsonl: 1 linha ok com profile, vigencia e id do Resend', linhas.length === 1 && linhas[0].ok && linhas[0].profile_id === dRu.id && linhas[0].vigencia === mais30 && linhas[0].resend_id, JSON.stringify(linhas));
    const r2 = await rodar(['--enviar', `--so=${dRu.email}`, '--intervalo-ms=0'], { RESEND_API_KEY: 're_falso_teste' });
    ok('E.4 rodar de novo: 0 enviados, 1 ja tinha recebido, nenhum POST novo', r2.status === 0 && /0 enviados, 0 falhas, 1 ja tinham recebido/.test(r2.out) && recebidos.length === 1, r2.out);
    const r3 = await rodar(['--enviar', `--so=${dTeste.email}`, '--intervalo-ms=0'], { RESEND_API_KEY: 're_falso_teste' });
    ok('E.5 --so=<conta de teste>: ninguem na lista, nenhum POST', r3.status === 0 && /destinatarios: 0/.test(r3.out) && recebidos.length === 1, r3.out);
  });

  await tentar('G', async () => {
    const arqProd = path.join(SAIDA, 'env-nao-local');
    fs.writeFileSync(arqProd, 'NEXT_PUBLIC_SUPABASE_URL=https://banco-remoto.invalid\nSUPABASE_SERVICE_ROLE_KEY=x\n');
    const n0 = recebidos.length;
    const g1 = await rodar([], {}, arqProd);
    ok('G.1 banco nao local sem --producao-confirmada: sai 3 antes de ler, com a mensagem', g1.status === 3 && /PARADO: o banco https:\/\/banco-remoto\.invalid nao e o local/.test(g1.out), g1.out);
    const g1b = await rodar(['--enviar'], { RESEND_API_KEY: 're_falso_teste' }, arqProd);
    ok('G.2 idem com --enviar: sai 3, nenhum POST', g1b.status === 3 && recebidos.length === n0, g1b.out);
    const g2 = await rodar(['--dias=29']);
    ok('G.3 --dias=29 recusado (minimo 30)', g2.status === 2 && /--dias precisa ser inteiro >= 30/.test(g2.out), g2.out);
    const g3 = await rodar(['--enviar', '--data-envio=2026-01-01'], { RESEND_API_KEY: 're_falso_teste' });
    ok('G.4 --enviar com data que nao e hoje: recusado', g3.status === 2 && /--enviar so com a data de hoje/.test(g3.out) && recebidos.length === n0, g3.out);
    const g4 = await rodar(['--enviar', `--so=${dEt.email}`]);
    ok('G.5 --enviar sem RESEND_API_KEY: sai 2, nenhum POST', g4.status === 2 && /--enviar sem RESEND_API_KEY/.test(g4.out) && recebidos.length === n0, g4.out);
    const g5 = await rodar(['--enviar', '--dry-run'], { RESEND_API_KEY: 're_falso_teste' });
    ok('G.6 --enviar com --dry-run: recusado', g5.status === 2 && recebidos.length === n0, g5.out);
  });
} catch (e) {
  ok('excecao geral', false, e?.stack || e?.message);
} finally {
  falso.close();
  try { fs.rmSync(SAIDA, { recursive: true, force: true }); } catch { /* */ }
  const errosLimpeza = await A.limpar();
  const sobras = await A.verificarLimpeza();
  ok('limpeza: nada desta rodada ficou no banco nem na pasta temporaria', errosLimpeza.length === 0 && sobras.length === 0 && !fs.existsSync(SAIDA), [...errosLimpeza, ...sobras].join(' | '));
  process.exitCode = fim() ? 1 : 0;
}
