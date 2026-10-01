// Conversa pelo SITE no celular (producao): cada oficina tem a sua conversa com
// o cliente (A em et, B em pt), uma nao ve a da outra, tempo real; confere banco, tela e o caso "token vencido"
// (login parado > 1 h, como no iPhone): aceitar orcamento continua funcionando.
//   node site-mensagens.mjs <.env.local>
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
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 160) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; let solId, ofId, of2Id;
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const celular = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); return c; };
const entrar = async (ctx, email, senha, pre) => { const p = await ctx.newPage(); await p.goto(`${SITE}/${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha); await p.click('button[type=submit]'); await p.waitForTimeout(4000); return p; };
const conta = async (tipo, idioma) => {
  const email = `msg-${tipo}-${tag}@example.test`; const senha = `Msg${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo.toUpperCase()}`, email, idioma });
  return { id: data.user.id, email, senha };
};
try {
  const cli = await conta('cliente', 'it'); const ofi = await conta('oficina', 'et'); const ofi2 = await conta('oficina', 'pt');
  const { data: of } = await sb.from('oficinas').insert({ profile_id: ofi.id, nome_fantasia: `MSG SHOP ${tag}`, endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '1', pais: 'EE', latitude: 59.43, longitude: 24.75, ativa: true }).select('id').single();
  ofId = of.id;
  const { data: of2 } = await sb.from('oficinas').insert({ profile_id: ofi2.id, nome_fantasia: `OUTRA SHOP ${tag}`, endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '1', pais: 'EE', latitude: 59.43, longitude: 24.75, ativa: true }).select('id').single();
  of2Id = of2.id;
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Yaris', fipe_ano: '2018' }).select('id').single();
  const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'msg test', urgencia: 'media', latitude: 59.43, longitude: 24.75, endereco: 'Tallinn' }).select('id').single();
  solId = s.id;

  // oficina A, ainda sem orcamento, tira uma duvida
  const ctxO = await celular(); const pO = await entrar(ctxO, ofi.email, ofi.senha, 'et');
  await pO.goto(`${SITE}/et/oficina/mensagens/${solId}`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(2500);
  const t0 = await pO.innerText('body');
  ok('nome do cliente nao fica em "carregando"', !/Laadimine|Carregando|Loading/i.test(t0.split('\n').slice(0, 12).join(' ')));
  const box = pO.locator('input[type=text]').last();
  ok('campo com 16px (sem zoom do iPhone)', (await box.evaluate((e) => getComputedStyle(e).fontSize)) === '16px');
  await box.fill('Tere, kas pidurid kriuksuvad?');
  await box.press('Enter'); await pO.waitForTimeout(3000);
  const { data: mA } = await sb.from('mensagens').select('oficina_id').eq('solicitacao_id', solId).eq('remetente_id', ofi.id);
  ok('oficina escreve ANTES de orcar', (mA || []).length === 1 && mA[0].oficina_id === ofId);

  // oficina B: conversa propria, nao ve a da A
  const ctxO2 = await celular(); const pO2 = await entrar(ctxO2, ofi2.email, ofi2.senha, 'pt-br');
  await pO2.goto(`${SITE}/pt-br/oficina/mensagens/${solId}`, { waitUntil: 'networkidle' }); await pO2.waitForTimeout(2500);
  ok('oficina B nao ve a conversa da A (tela)', !(await pO2.innerText('body')).includes('kriuksuvad'));
  await pO2.locator('input[type=text]').last().fill('Ola, posso ver o carro amanha.');
  await pO2.locator('input[type=text]').last().press('Enter'); await pO2.waitForTimeout(3000);
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email: ofi2.email, password: ofi2.senha });
  const { data: vistoB } = await anon.from('mensagens').select('texto, oficina_id').eq('solicitacao_id', solId);
  ok('oficina B nao le a conversa da A (banco)', (vistoB || []).length === 1 && vistoB[0].oficina_id === of2Id, JSON.stringify(vistoB));
  const { error: eFura } = await anon.from('mensagens').insert({ solicitacao_id: solId, oficina_id: ofId, remetente_id: ofi2.id, texto: 'fura' });
  ok('oficina B nao escreve na conversa da A', !!eFura);
  await anon.auth.signOut();

  // cliente: duas conversas separadas
  const ctxC = await celular(); const pC = await entrar(ctxC, cli.email, cli.senha, 'it');
  await pC.goto(`${SITE}/it/cliente/mensagens`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
  const lista = await pC.innerText('body');
  ok('cliente ve as duas oficinas na lista', lista.includes(`MSG SHOP ${tag}`) && lista.includes(`OUTRA SHOP ${tag}`));
  await pC.goto(`${SITE}/it/cliente/mensagens/${solId}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
  ok('sem oficina no link: cliente escolhe com quem falar', /Con quale officina/.test(await pC.innerText('body')));
  await pC.getByRole('button', { name: `MSG SHOP ${tag}` }).click(); await pC.waitForTimeout(2500);
  const conversaA = await pC.innerText('body');
  ok('conversa A mostra so a oficina A', conversaA.includes('kriuksuvad') && !conversaA.includes('posso ver o carro'));
  const boxC = pC.locator('input[type=text]').last();
  await boxC.fill('Si, un po. Perfetto, arrivo alle 9.');
  await boxC.press('Enter'); await pC.waitForTimeout(4000);
  const { data: m2 } = await sb.from('mensagens').select('oficina_id').eq('solicitacao_id', solId).eq('remetente_id', cli.id);
  ok('resposta do cliente foi para a oficina A', (m2 || []).length === 1 && m2[0].oficina_id === ofId);
  ok('oficina A recebe na hora, sem recarregar', (await pO.innerText('body')).includes('arrivo alle 9'));
  ok('oficina B nao recebe a resposta', !(await pO2.innerText('body')).includes('arrivo alle 9'));
  ok('campo de mensagem dentro da tela', await boxC.evaluate((e) => e.getBoundingClientRect().bottom <= window.innerHeight));
  await pC.screenshot({ path: 'msg-cliente.png' });

  // orcamento da oficina A, para o teste de login vencido
  const { data: o } = await sb.from('orcamentos').insert({ solicitacao_id: solId, oficina_id: ofId, valor_total: 99, prazo_dias: 1, status: 'enviado', validade: '2030-01-01' }).select('id').single();
  const d1 = new Date(Date.now() + 86400000).toISOString().slice(0, 10), d2 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_checkin: d1, turno: 'manha', data_previsao_entrega: d2 });

  // login vencido (como o iPhone depois de um tempo parado): estraga o cookie e aceita o orcamento
  const cks = await ctxC.cookies();
  const authCk = cks.filter((c) => /auth-token/.test(c.name));
  ok('achou o cookie de login', authCk.length > 0);
  // token de acesso trocado por um invalido e marcado como vencido; o refresh token continua valido
  for (const ck of authCk) {
    let v = decodeURIComponent(ck.value);
    const b64 = v.startsWith('base64-');
    let j; try { j = JSON.parse(b64 ? Buffer.from(v.slice(7), 'base64').toString() : v); } catch { j = null; }
    if (!j || !j.access_token) continue;
    j.access_token = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.x'; j.expires_at = 1;
    const nv = b64 ? 'base64-' + Buffer.from(JSON.stringify(j)).toString('base64') : JSON.stringify(j);
    await ctxC.addCookies([{ ...ck, value: nv }]);
  }
  await pC.goto(`${SITE}/it/cliente/orcamentos/${solId}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
  const nome = await pC.innerText('body');
  if (/Accetta e programma/.test(nome)) {
    await pC.getByRole('button', { name: /Accetta e programma/ }).last().click(); await pC.waitForTimeout(1000);
    await pC.locator('button').filter({ hasText: /\d{2}:\d{2} - \d{2}:\d{2}/ }).first().click();
    await pC.getByRole('button', { name: /Conferma appuntamento/ }).last().click(); await pC.waitForTimeout(4000);
    const { data: o2 } = await sb.from('orcamentos').select('status').eq('id', o.id).single();
    ok('aceitou mesmo com o cookie vencido (login renovado)', o2.status === 'aceito', o2.status);
  } else {
    ok('pagina do orcamento abriu sem o cookie', false, nome.slice(0, 120));
  }
  await ctxO.close(); await ctxO2.close(); await ctxC.close();
} catch (e) { falhas++; console.log('FALHA parou:', String(e.message).slice(0, 400)); }
finally {
  await browser.close();
  if (solId) {
    const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', solId);
    for (const o of orcs || []) { await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await sb.from('agenda').delete().eq('orcamento_id', o.id); }
    for (const t of ['orcamentos', 'mensagens', 'agenda']) await sb.from(t).delete().eq('solicitacao_id', solId);
    await sb.from('solicitacoes').delete().eq('id', solId);
  }
  for (const oid of [ofId, of2Id].filter(Boolean)) { await sb.from('agenda').delete().eq('oficina_id', oid); await sb.from('oficinas').delete().eq('id', oid); }
  for (const id of contas) { for (const [t, c] of [['veiculos', 'profile_id'], ['notificacoes', 'profile_id']]) await sb.from(t).delete().eq(c, id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
