// E2E LOCAL do e-mail "a oficina te escreveu" ao motorista (dono 24/11; mig 116). So banco LOCAL (Docker) e
// e-mails gravados em pasta (EMAIL_PASTA_TESTE, sem RESEND): nada sai para servicos reais.
// Casos: oficina escreve 2x -> 1 e-mail (trava 3 h) e o link abre o chat dela (of=); motorista escreve -> 0;
// pedido cancelado -> 0; funcionario da oficina -> 1; quem paga (acidente) -> link de quem paga (g=1&of=);
// envio falhou -> trava solta e a proxima mensagem manda; conta de teste -> 0; depois de 3 h -> manda de novo;
// link antigo /r/<n>?c=1 sem "of" igual a antes.
//   SITE=http://localhost:3109 node scripts/e2e/email-mensagem-oficina.mjs [<.env.local>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const req = createRequire(import.meta.url);
const { createClient } = req('@supabase/supabase-js');
const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arqEnv = process.argv[2] || path.join(WEB, '.env.local');
const env = Object.fromEntries(fs.readFileSync(arqEnv, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco nao e o local - parado');
if (!env.EMAIL_PASTA_TESTE || env.RESEND_API_KEY) throw new Error('TESTE LOCAL: precisa de EMAIL_PASTA_TESTE e nenhuma RESEND_API_KEY');
const SITE = process.env.SITE || 'http://localhost:3109';
const EMAILS = env.EMAIL_PASTA_TESTE;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = crypto.randomBytes(3).toString('hex');
const senha = `Msg-${crypto.randomBytes(5).toString('hex')}A1`;

let oks = 0, falhas = 0; const tabela = [];
const ok = (nome, cond, info = '') => { if (cond) oks++; else falhas++; console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}${cond ? '' : ` - ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); return !!cond; };
const caso = (nome, passou, prova) => { tabela.push({ caso: nome, resultado: passou ? 'PASS' : 'FAIL', prova }); };

const criado = { contas: [], sols: [], veics: [], ofs: [] };
const conta = async (tipo, apelido, { idioma = 'et', contaTeste = false } = {}) => {
  const email = `teste-msg-${apelido}-${tag}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(`createUser ${apelido}: ${error.message}`);
  criado.contas.push(data.user.id);
  const { error: e2 } = await admin.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE-MSG ${apelido}`, email, idioma, telefone: '+372 5000 0001', conta_teste: contaTeste, senha_definida: true, ativo: true, termos_aceitos_em: new Date().toISOString() });
  if (e2) throw new Error(`profile ${apelido}: ${e2.message}`);
  const c = anon(); const { data: s, error: e3 } = await c.auth.signInWithPassword({ email, password: senha });
  if (e3) throw new Error(`login ${apelido}: ${e3.message}`);
  return { id: data.user.id, email, token: s.session.access_token };
};
const HORARIO = Object.fromEntries(['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map((d) => [d, { aberto: true, inicio: '08:00', fim: '18:00' }]));
const oficina = async (dono, apelido) => {
  const { data, error } = await admin.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `TESTE-MSG ${apelido} ${tag}`, endereco: 'Test tee', numero: '1', cidade: 'Narva', estado: 'Ida-Virumaa', cep: '20308', pais: 'EE', latitude: 59.377, longitude: 28.19, raio_atendimento_km: 30, especialidades: ['mecanica'], ativa: true, seguradoras_convencionadas: [], horario_funcionamento: HORARIO }).select('id, nome_fantasia').single();
  if (error) throw new Error(`oficina ${apelido}: ${error.message}`);
  criado.ofs.push(data.id); return data;
};
const pedido = async (cliente, status = 'em_orcamento') => {
  const { data: v, error: ev } = await admin.from('veiculos').insert({ profile_id: cliente.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018', placa: `TM${crypto.randomBytes(2).toString('hex').toUpperCase()}` }).select('id').single();
  if (ev) throw new Error(`veiculo: ${ev.message}`);
  criado.veics.push(v.id);
  const { data, error } = await admin.from('solicitacoes').insert({ cliente_id: cliente.id, veiculo_id: v.id, tipo: 'mecanica', descricao: `TESTE-MSG ${tag}`, urgencia: 'media', endereco: 'Tallinna mnt 1, Narva', latitude: 59.377, longitude: 28.19, pais: 'EE', status }).select('id, numero').single();
  if (error) throw new Error(`solicitacao: ${error.message}`);
  criado.sols.push(data.id); return data;
};
const escrever = async (sol, of, remetente, { pagador = null, tipo = 'texto' } = {}) => {
  const { data, error } = await admin.from('mensagens').insert({ solicitacao_id: sol.id, oficina_id: of.id, remetente_id: remetente.id, texto: `segredo-${tag}`, ...(pagador ? { pagador_id: pagador.id } : {}), ...(tipo === 'audio' ? { tipo: 'audio', audio_url: 'x', audio_duracao_segundos: 3 } : {}) }).select('id').single();
  if (error) throw new Error(`mensagem: ${error.message}`);
  const r = await fetch(`${SITE}/api/avisar-mensagem`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${remetente.token}` }, body: JSON.stringify({ mensagemId: data.id }) });
  return r.status;
};
const arq = (email) => `_${email.replace(/[^a-z0-9@._-]/gi, '_')}.html`;
const emailsDe = (email) => (fs.existsSync(EMAILS) && fs.statSync(EMAILS).isDirectory() ? fs.readdirSync(EMAILS) : []).filter((f) => f.endsWith(arq(email))).sort();
const ler = (f) => fs.readFileSync(path.join(EMAILS, f), 'utf8');
const linhas = async (sol) => (await admin.from('emails_mensagem_cliente').select('oficina_id, profile_id, ultimo_em').eq('solicitacao_id', sol.id)).data || [];
const hrefBotao = (html) => ((html.match(/<a href="([^"]+)" data-botao="pedido"/) || [])[1] || '').replace(/&amp;/g, '&');
const redirecionar = async (url) => { const u = new URL(url); const r = await fetch(`${SITE}${u.pathname}${u.search}`, { redirect: 'manual' }); return r.headers.get('location') || ''; };

try {
  const dono = await conta('oficina', 'dono');
  const of = await oficina(dono, 'A');
  const func = await conta('oficina', 'func');
  { const { error } = await admin.from('funcionarios').insert({ profile_id: func.id, oficina_id: of.id, cargo: 'mecanico', ativo: true }); if (error) throw new Error(`funcionario: ${error.message}`); }
  const mot = await conta('cliente', 'mot');

  // 1. oficina escreve 2x -> 1 e-mail, 1 linha; link abre o chat dela
  {
    const sol = await pedido(mot);
    const s1 = await escrever(sol, of, dono); const s2 = await escrever(sol, of, dono, { tipo: 'audio' });
    await sleep(300);
    const mails = emailsDe(mot.email); const rows = await linhas(sol);
    const html = mails[0] ? ler(mails[0]) : '';
    const href = hrefBotao(html);
    const p1 = ok('1: rota 200 nas 2 mensagens', s1 === 200 && s2 === 200, { s1, s2 });
    const p2 = ok('1: exatamente 1 e-mail ao motorista', mails.length === 1, mails);
    const p3 = ok('1: 1 linha na trava', rows.length === 1, rows);
    const p4 = ok('1: assunto com oficina e numero (et)', html.includes(`kirjutas sulle päringu ${sol.numero} kohta`) && html.includes(of.nome_fantasia), html.slice(0, 200));
    const p5 = ok('1: sem o texto da mensagem', !html.includes(`segredo-${tag}`));
    const p6 = ok('1: link curto com token, c=1 e of=<oficina>', new RegExp(`/r/${sol.numero}\\?k=[A-Za-z0-9_-]{43}&c=1&of=${of.id}$`).test(href), href);
    const loc = href ? await redirecionar(href) : '';
    // pagina "ver pedido" com o nome traduzido (/ee/et/vaata-paringut)
    const p7 = ok('1: /r repassa of para ver-pedido', /\/ee\/et\/[a-z-]+\?k=[A-Za-z0-9_-]{43}&c=1&of=/.test(loc) && loc.endsWith(`of=${of.id}`), loc);
    caso('Workshop writes 2x (text + audio) -> 1 e-mail', p1 && p2 && p3 && p4 && p5 && p6 && p7, `${mails.join(', ')} | rows=${rows.length} | href=${href.replace(/k=[^&]+/, 'k=<token>')} -> ${loc.replace(/k=[^&]+/, 'k=<token>')}`);

    // 2. motorista escreve (mesmo pedido) -> 0 e-mail (nem a oficina nem ele)
    const s3 = await escrever(sol, of, mot); await sleep(300);
    const p8 = ok('2: motorista escreve: rota 200', s3 === 200, s3);
    const p9 = ok('2: nenhum e-mail novo (motorista e dono da oficina)', emailsDe(mot.email).length === 1 && emailsDe(dono.email).length === 0);
    const p10 = ok('2: trava igual (1 linha)', (await linhas(sol)).length === 1);
    caso('Driver writes -> 0 e-mails', p8 && p9 && p10, `driver files=${emailsDe(mot.email).length} (unchanged), workshop files=${emailsDe(dono.email).length}`);

    // 8. depois de 3 h a trava libera (move ultimo_em para tras)
    await admin.from('emails_mensagem_cliente').update({ ultimo_em: new Date(Date.now() - 3 * 3600e3 - 60e3).toISOString() }).eq('solicitacao_id', sol.id);
    await escrever(sol, of, dono); await sleep(300);
    const p11 = ok('8: depois de 3 h: 2.o e-mail', emailsDe(mot.email).length === 2, emailsDe(mot.email));
    caso('After 3 h -> next e-mail allowed', p11, `driver files=${emailsDe(mot.email).length}`);
  }

  // 3. pedido cancelado -> 0
  {
    const mot3 = await conta('cliente', 'cancel');
    const sol = await pedido(mot3, 'cancelada');
    const s = await escrever(sol, of, dono); await sleep(300);
    const p = ok('3: pedido cancelado: 0 e-mail, 0 linha', s === 200 && emailsDe(mot3.email).length === 0 && (await linhas(sol)).length === 0);
    caso('Cancelled request -> 0', p, `status=${s}, files=${emailsDe(mot3.email).length}, rows=${(await linhas(sol)).length}`);
  }

  // 4. funcionario escreve -> 1
  {
    const mot4 = await conta('cliente', 'func-dest');
    const sol = await pedido(mot4);
    const s = await escrever(sol, of, func); await sleep(300);
    const mails = emailsDe(mot4.email);
    const p = ok('4: funcionario: 1 e-mail', s === 200 && mails.length === 1 && (await linhas(sol)).length === 1, { s, mails });
    caso('Employee sender -> 1', p, `${mails.join(', ')} | rows=${(await linhas(sol)).length}`);
  }

  // 5. quem paga (acidente) -> link de quem paga
  {
    const mot5 = await conta('cliente', 'dono-acid');
    const pag = await conta('cliente', 'pagador', { idioma: 'ru' });
    const sol = await pedido(mot5, 'aceita');
    const { error: eo } = await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of.id, valor_total: 100, prazo_dias: 1, status: 'aceito', validade: '2030-01-01' });
    if (eo) throw new Error(`orcamento: ${eo.message}`);
    const s = await escrever(sol, of, dono, { pagador: pag }); await sleep(300);
    const mails = emailsDe(pag.email);
    const html = mails[0] ? ler(mails[0]) : '';
    const href = hrefBotao(html);
    const loc = href ? await redirecionar(href) : '';
    const p1 = ok('5: quem paga: 1 e-mail (ru) e nenhum ao dono do pedido', s === 200 && mails.length === 1 && html.includes('Новое сообщение от') && emailsDe(mot5.email).length === 0, { s, mails });
    const p2 = ok('5: link de quem paga', href === `${env.NEXT_PUBLIC_SITE_URL}/r/${sol.numero}?c=1&g=1&of=${of.id}&l=ru` && !href.includes('/cliente/'), href);
    const p3 = ok('5: /r leva ao chat de quem paga com a oficina', loc.includes(`?oficina=${of.id}&pagador=1`) && loc.includes('/ee/ru/'), loc);
    // link antigo sem "of" (agendamento): igual a antes - oficina do orcamento aceito
    const antigo = await redirecionar(`${SITE}/r/${sol.numero}?c=1`);
    const p4 = ok('5: link antigo /r/<n>?c=1 sem of: chat com a oficina aceita, sem pagador', antigo.endsWith(`?oficina=${of.id}`), antigo);
    caso('Payer conversation -> payer link', p1 && p2 && p3 && p4, `${mails.join(', ')} | href=${href} -> ${loc} | old link -> ${antigo}`);
  }

  // 6. envio falhou -> trava solta, proxima mensagem manda
  {
    const mot6 = await conta('cliente', 'falha');
    const sol = await pedido(mot6);
    const guardada = `${EMAILS}__guardada_${tag}`;
    fs.renameSync(EMAILS, guardada); fs.writeFileSync(EMAILS, 'bloqueio do teste'); // mkdir da pasta falha -> enviarEmail lanca
    let s1, rows1;
    try { s1 = await escrever(sol, of, dono); await sleep(300); rows1 = (await linhas(sol)).length; } finally { fs.rmSync(EMAILS, { force: true }); fs.renameSync(guardada, EMAILS); }
    const p1 = ok('6: envio falhou: rota 200 (chat nao quebra) e trava solta (0 linha)', s1 === 200 && rows1 === 0, { s1, rows1 });
    const s2 = await escrever(sol, of, dono); await sleep(300);
    const mails = emailsDe(mot6.email);
    const p2 = ok('6: proxima mensagem manda (1 e-mail, 1 linha)', s2 === 200 && mails.length === 1 && (await linhas(sol)).length === 1, { s2, mails });
    caso('Send failure -> throttle row removed, next message retries', p1 && p2, `fail: status=${s1}, rows=${rows1}; retry: ${mails.join(', ')}, rows=${(await linhas(sol)).length}`);
  }

  // 7. conta de teste -> 0
  {
    const mot7 = await conta('cliente', 'contateste', { contaTeste: true });
    const sol = await pedido(mot7);
    const s = await escrever(sol, of, dono); await sleep(300);
    const p = ok('7: conta de teste: 0 e-mail, 0 linha', s === 200 && emailsDe(mot7.email).length === 0 && (await linhas(sol)).length === 0);
    caso('Test account -> 0', p, `status=${s}, files=${emailsDe(mot7.email).length}, rows=${(await linhas(sol)).length}`);
  }
} catch (e) {
  ok('excecao', false, e?.stack || e?.message || e);
} finally {
  // limpeza (so banco local): mensagens/orcamentos/trava caem com o pedido; e-mails desta rodada
  const del = async (t, c, v) => { if (v.length) { const { error } = await admin.from(t).delete().in(c, v); if (error) console.log(`limpar ${t}: ${error.message}`); } };
  await del('mensagens', 'solicitacao_id', criado.sols);
  await del('orcamentos', 'solicitacao_id', criado.sols);
  await del('emails_mensagem_cliente', 'solicitacao_id', criado.sols);
  await del('links_acesso', 'solicitacao_id', criado.sols);
  await del('notificacoes', 'profile_id', criado.contas);
  await del('solicitacoes', 'id', criado.sols);
  await del('veiculos', 'id', criado.veics);
  await del('funcionarios', 'oficina_id', criado.ofs);
  await del('oficinas', 'id', criado.ofs);
  await del('profiles', 'id', criado.contas);
  for (const id of criado.contas) await admin.auth.admin.deleteUser(id);
  const resto = fs.existsSync(EMAILS) ? fs.readdirSync(EMAILS).filter((f) => f.includes(tag)) : [];
  console.log('\nCASOS:'); for (const c of tabela) console.log(`${c.resultado} | ${c.caso} | ${c.prova}`);
  for (const f of resto) fs.rmSync(path.join(EMAILS, f), { force: true });
  console.log(`\n${oks} ok, ${falhas} falha(s); e-mails desta rodada apagados: ${resto.length}`);
  process.exit(falhas ? 1 : 0);
}
