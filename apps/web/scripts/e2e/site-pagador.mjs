// Acidente em que o OUTRO motorista causou (ele paga o reparo), pelo SITE no
// celular (producao): o cliente (it) aceita o orcamento; o responsavel pelo
// pagamento (pt) ganha uma conversa particular com a oficina (et); a oficina
// alterna "Cliente" / "Quem paga"; ninguem le a conversa do outro.
//   node site-pagador.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const SITE = 'https://bipfix.com';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 200) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; let solId, ofId, emId;
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const celular = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); return c; };
const entrar = async (ctx, email, senha, pre) => { const p = await ctx.newPage(); await p.goto(`${SITE}/${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha); await p.click('button[type=submit]'); await p.waitForTimeout(4000); return p; };
const conta = async (tipo, idioma) => {
  const email = `pag-${tipo}${contas.length}-${tag}@example.test`; const senha = `Pag${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo.toUpperCase()} ${contas.length}`, email, idioma });
  return { id: data.user.id, email, senha };
};
const sessao = async (c) => { const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); await a.auth.signInWithPassword({ email: c.email, password: c.senha }); return a; };
try {
  const cli = await conta('cliente', 'it'); const pag = await conta('cliente', 'pt'); const ofi = await conta('oficina', 'et'); const intruso = await conta('cliente', 'en');
  const { data: of } = await sb.from('oficinas').insert({ profile_id: ofi.id, nome_fantasia: `PAG SHOP ${tag}`, endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '1', pais: 'EE', latitude: 59.43, longitude: 24.75, ativa: true }).select('id').single();
  ofId = of.id;
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Yaris', fipe_ano: '2018' }).select('id').single();
  const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'funilaria', descricao: 'pag test', urgencia: 'media', latitude: 59.43, longitude: 24.75, endereco: 'Tallinn' }).select('id').single();
  solId = s.id;
  const { data: em, error: eEm } = await sb.from('emergencias').insert({ profile_id: cli.id, nome: 'Cliente Teste', email: cli.email, telefone: '+3725550000', endereco: 'Tallinn', latitude: 59.43, longitude: 24.75, descricao: 'batida [TIPO:outro_causou]', solicitacao_id: solId }).select('id').single();
  if (!em) throw new Error('emergencia: ' + JSON.stringify(eEm));
  emId = em.id;
  await sb.from('solicitacoes').update({ emergencia_id: emId }).eq('id', solId);
  await sb.from('emergencia_outro_veiculo').insert({ emergencia_id: emId, nome: 'Outro Motorista', email: pag.email, placa: 'XYZ123' });
  const { data: o } = await sb.from('orcamentos').insert({ solicitacao_id: solId, oficina_id: ofId, valor_total: 450, prazo_dias: 2, status: 'enviado', validade: '2030-01-01' }).select('id').single();
  const d1 = new Date(Date.now() + 86400000).toISOString().slice(0, 10), d2 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_checkin: d1, turno: 'manha', data_previsao_entrega: d2 });

  // 1) cliente aceita pelo site
  const ctxC = await celular(); const pC = await entrar(ctxC, cli.email, cli.senha, 'it');
  await pC.goto(`${SITE}/it/it/cliente/orcamentos/${solId}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
  await pC.getByRole('button', { name: /Accetta e programma/ }).last().click(); await pC.waitForTimeout(1000);
  await pC.locator('button').filter({ hasText: /\d{2}:\d{2} - \d{2}:\d{2}/ }).first().click();
  await pC.getByRole('button', { name: /Conferma appuntamento/ }).last().click(); await pC.waitForTimeout(6000);
  const { data: auto } = await sb.from('mensagens').select('oficina_id, pagador_id').eq('solicitacao_id', solId);
  ok('aceite abre a conversa particular de quem paga', (auto || []).some((m) => m.pagador_id === pag.id && m.oficina_id === ofId), JSON.stringify(auto));
  const { data: nPag } = await sb.from('notificacoes').select('dados').eq('profile_id', pag.id);
  ok('quem paga recebe aviso apontando para a conversa dele', (nPag || []).some((n) => n.dados?.pagador_id === pag.id && n.dados?.oficina_id === ofId), JSON.stringify(nPag));

  // 2) quem paga: lista, abre e escreve
  const ctxP = await celular(); const pP = await entrar(ctxP, pag.email, pag.senha, 'pt-br');
  await pP.goto(`${SITE}/br/pt/cliente/mensagens`, { waitUntil: 'networkidle' }); await pP.waitForTimeout(3500);
  ok('quem paga ve a oficina na lista de mensagens', (await pP.innerText('body')).includes(`PAG SHOP ${tag}`));
  await pP.locator('a', { hasText: `PAG SHOP ${tag}` }).first().click(); await pP.waitForTimeout(3500);
  const telaP = await pP.innerText('body');
  ok('quem paga le a conversa (antes nao conseguia)', pP.url().includes('pagador=1') && /Pagamento do reparo/.test(telaP), pP.url());
  ok('cabecalho sem "carregando"', !/Carregando|Loading/i.test(telaP.split('\n').slice(0, 10).join(' ')));
  await pP.locator('input[type=text]').last().fill('Ola, posso pagar por transferencia?');
  await pP.locator('input[type=text]').last().press('Enter'); await pP.waitForTimeout(3500);
  const { data: mP } = await sb.from('mensagens').select('pagador_id, oficina_id').eq('solicitacao_id', solId).eq('remetente_id', pag.id);
  ok('mensagem de quem paga gravada na conversa dele', (mP || []).length === 1 && mP[0].pagador_id === pag.id && mP[0].oficina_id === ofId);

  // 3) oficina: abas Cliente / Quem paga
  const ctxO = await celular(); const pO = await entrar(ctxO, ofi.email, ofi.senha, 'et');
  await pO.goto(`${SITE}/ee/et/oficina/mensagens/${solId}`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(3500);
  ok('oficina ve as abas Cliente e Quem paga', !!(await pO.getByRole('tab', { name: /Remondi eest maksja/ }).count()));
  ok('aba Cliente nao mostra a conversa de quem paga', !(await pO.innerText('body')).includes('transferencia'));
  await pO.getByRole('tab', { name: /Remondi eest maksja/ }).click(); await pO.waitForTimeout(3000);
  ok('aba Quem paga mostra a mensagem dele', (await pO.innerText('body')).includes('transferencia'));
  await pO.locator('input[type=text]').last().fill('Jah, pangaülekanne sobib.');
  await pO.locator('input[type=text]').last().press('Enter'); await pO.waitForTimeout(4500);
  const { data: mO } = await sb.from('mensagens').select('pagador_id').eq('solicitacao_id', solId).eq('remetente_id', ofi.id).ilike('texto', '%pangaülekanne%');
  ok('resposta da oficina foi para quem paga', (mO || []).length === 1 && mO[0].pagador_id === pag.id);
  ok('quem paga recebe a resposta na hora', (await pP.innerText('body')).includes('pangaülekanne'));
  const { data: nPag2 } = await sb.from('notificacoes').select('dados').eq('profile_id', pag.id).eq('tipo', 'nova_mensagem');
  ok('quem paga e avisado da resposta', (nPag2 || []).length >= 1);

  // 4) separacao
  const aCli = await sessao(cli);
  const { data: vCli } = await aCli.from('mensagens').select('pagador_id').eq('solicitacao_id', solId);
  ok('cliente nao le a conversa de quem paga', (vCli || []).every((m) => m.pagador_id === null), JSON.stringify(vCli));
  const aPag = await sessao(pag);
  const { data: vPag } = await aPag.from('mensagens').select('pagador_id').eq('solicitacao_id', solId);
  ok('quem paga nao le a conversa do cliente', (vPag || []).length >= 2 && vPag.every((m) => m.pagador_id === pag.id), JSON.stringify(vPag));
  const aInt = await sessao(intruso);
  const { error: eInt } = await aInt.from('mensagens').insert({ solicitacao_id: solId, oficina_id: ofId, pagador_id: intruso.id, remetente_id: intruso.id, texto: 'intruso' });
  ok('estranho nao abre conversa de pagamento', !!eInt);
  const { data: vInt } = await aInt.from('mensagens').select('id').eq('solicitacao_id', solId);
  ok('estranho nao le nada', (vInt || []).length === 0);
  await pC.goto(`${SITE}/it/it/cliente/mensagens/${solId}?oficina=${ofId}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
  ok('tela do cliente nao mostra a conversa de quem paga', !(await pC.innerText('body')).includes('transferencia'));
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 600)); }
finally {
  await browser.close();
  if (solId) {
    const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', solId);
    for (const o of orcs || []) { await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await sb.from('agenda').delete().eq('orcamento_id', o.id); }
    for (const t of ['mensagens', 'agenda', 'orcamentos']) await sb.from(t).delete().eq('solicitacao_id', solId);
    await sb.from('solicitacoes').update({ emergencia_id: null }).eq('id', solId);
  }
  if (emId) { await sb.from('emergencia_mensagens').delete().eq('emergencia_id', emId); await sb.from('emergencia_outro_veiculo').delete().eq('emergencia_id', emId); await sb.from('emergencias').delete().eq('id', emId); }
  if (solId) await sb.from('solicitacoes').delete().eq('id', solId);
  if (ofId) { await sb.from('agenda').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { for (const [t, c] of [['veiculos', 'profile_id'], ['notificacoes', 'profile_id']]) await sb.from(t).delete().eq(c, id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
