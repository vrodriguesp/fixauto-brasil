// Correcoes do teste do dono no iPhone (08/11 noite), no motor do Safari (WebKit), celular 390:
//  11 trocar a lingua no meio da proposta de nova data: o que foi digitado e o formulario voltam;
//     a lingua da conta muda de verdade;
//  12 previsao antes da nova data: erro especifico na tela (nao "confira os dados");
//  13 previsao de entrega opcional: botao "Limpar";
//  14 avisos com os textos nas 6 linguas; a pagina de avisos mostra a lingua da tela;
//  20 a oficina com a proposta aberta: quando o cliente responde, "o cliente respondeu";
//  21 orcamento recusado: encerrado; "Enviar um orcamento novo" chega ao cliente como novo.
//   HOST_LAN=<ip-da-rede> node correcoes-0811.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { webkit } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local');
const SITE = `http://${process.env.HOST_LAN || 'localhost'}:3100`;
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/correcoes-0811`; fs.mkdirSync(OUT, { recursive: true });
const WEBMSG = `${RAIZ}/site/apps/web/messages`;
const msgWeb = (l) => {
  const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.json`, 'utf8'));
  for (const area of ['cliente', 'oficina', 'misc', 'auth']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.${area}.json`, 'utf8')));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};
const T = msgWeb('et'); const TR = msgWeb('ru');
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const semear = fs.readFileSync(`${RAIZ}/ferramentas/semear.mjs`, 'utf8');
const W1 = 'meister.teste@bipfix.test'; const W1S = (semear.match(/conta\('meister\.teste@bipfix\.test', '([^']+)'/) || [])[1];
const tag = crypto.randomBytes(3).toString('hex'); const senha = 'Cr-' + crypto.randomBytes(6).toString('hex');
const dia = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const post = async (rota, tok, corpo) => { const r = await fetch(`${SITE}${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, 'x-real-ip': `10.77.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}` }, body: JSON.stringify(corpo) }); return { s: r.status, d: await r.json().catch(() => ({})) }; };
const contas = []; const sols = [];
const b = await webkit.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe') });
const ctxNovo = async (locale = 'et-EE') => { const c = await b.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } })); return c; };
const entrar = async (ctx, email, s) => { const p = await ctx.newPage(); await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', s); await p.click('button[type=submit]'); await p.waitForTimeout(4000); return p; };
const w1Id = (await admin.from('profiles').select('id').eq('email', W1).single()).data.id;
const { data: of1 } = await admin.from('oficinas').select('id, nome_fantasia').eq('profile_id', w1Id).single();
await admin.from('profiles').update({ idioma: 'et' }).eq('id', w1Id);
const w1 = (await anon().auth.signInWithPassword({ email: W1, password: W1S })).data.session.access_token;
const novoPedido = async (n) => {
  const email = `corr-${n}-${tag}@example.test`;
  const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true }); contas.push(u.user.id);
  await admin.from('profiles').upsert({ id: u.user.id, email, tipo: 'cliente', nome: `Cliente ${n}`, idioma: 'en' });
  const { data: v } = await admin.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018' }).select('id').single();
  const { data: sol } = await admin.from('solicitacoes').insert({ cliente_id: u.user.id, veiculo_id: v.id, tipo: 'mecanica', descricao: `Correcoes ${n}`, urgencia: 'media', endereco: 'Tallinn', latitude: 59.433, longitude: 24.746, status: 'aberta' }).select('id, numero').single(); sols.push(sol.id);
  const o1 = (await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of1.id, valor_total: 150, prazo_dias: 1, status: 'enviado', validade: dia(10) }).select('id').single()).data;
  await admin.from('orcamento_itens').insert({ orcamento_id: o1.id, descricao: 'Remont', tipo: 'mao_de_obra', valor_unitario: 150, quantidade: 1, valor_total: 150 });
  const s1 = (await admin.from('orcamento_disponibilidade').insert({ orcamento_id: o1.id, data_checkin: dia(3), turno: 'manha', data_previsao_entrega: dia(4) }).select('id').single()).data;
  const cli = (await anon().auth.signInWithPassword({ email, password: senha })).data.session.access_token;
  const ra = await post('/api/aceitar-orcamento', cli, { orcamentoId: o1.id, slotId: s1.id });
  if (ra.s !== 200) throw new Error('aceite ' + ra.s);
  return { email, cId: u.user.id, cli, sol, o1 };
};
try {
  const P = await novoPedido(1);
  // ---------- 12/13/11: proposta de nova data na tela (oficina, celular) ----------
  {
    const ctx = await ctxNovo(); const p = await entrar(ctx, W1, W1S);
    await p.goto(`${SITE}/ee/et/oficina/orcamento/${P.sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    await p.getByTestId('opcao-mudar-data').click(); await p.waitForTimeout(1200);
    await p.locator('#nd-data').fill(dia(6)); await p.locator('#nd-turno').selectOption('tarde');
    await p.locator('#nd-previsao').fill(dia(2));
    await p.getByTestId('serve-sim').check(); await p.locator('#nd-motivo').fill('Varuosa saabub hiljem');
    await p.getByTestId('propor-nova-data').getByRole('button', { name: T('agendaMudanca.enviarProposta') }).click(); await p.waitForTimeout(800);
    ok('12: previsao antes da nova data -> erro especifico na tela', (await p.innerText('body')).includes(T('erros.PREVISAO_ANTES_DA_DATA')));
    ok('13: previsao de entrega com botao "Limpar"', (await p.getByTestId('limpar-previsao').count()) === 1);
    await p.getByTestId('limpar-previsao').click(); await p.waitForTimeout(300);
    ok('13: "Limpar" esvazia a previsao', (await p.locator('#nd-previsao').inputValue()) === '');
    // 11: troca para russo no meio do formulario
    await p.locator('#nd-motivo').fill('Tekst enne keele vahetust');
    await p.evaluate(() => document.querySelector('a[hreflang="ru-EE"]')?.click());
    await p.waitForTimeout(6000);
    ok('11: trocou para a pagina em russo', /\/ee\/ru\//.test(p.url()), p.url());
    ok('11: o formulario de nova data continua aberto', (await p.locator('#nd-motivo').count()) === 1);
    ok('11: o texto digitado voltou', (await p.locator('#nd-motivo').inputValue().catch(() => '')) === 'Tekst enne keele vahetust', await p.locator('#nd-motivo').inputValue().catch(() => '?'));
    ok('11: a data e o turno voltaram', (await p.locator('#nd-data').inputValue().catch(() => '')) === dia(6) && (await p.locator('#nd-turno').inputValue().catch(() => '')) === 'tarde');
    ok('11: a escolha "ainda serve" voltou', await p.getByTestId('serve-sim').isChecked().catch(() => false));
    const { data: pr } = await admin.from('profiles').select('idioma').eq('id', w1Id).single();
    ok('14b: trocar a lingua mudou a lingua da conta (ru)', pr.idioma === 'ru', pr.idioma);
    await p.screenshot({ path: path.join(OUT, 'troca_idioma_ru.png'), fullPage: true });
    await p.getByTestId('propor-nova-data').getByRole('button', { name: TR('agendaMudanca.enviarProposta') }).click(); await p.waitForTimeout(3000);
    ok('11: depois da troca a proposta e enviada', (await admin.from('orcamento_revisoes').select('id').eq('solicitacao_id', P.sol.id).eq('status', 'pendente')).data?.length === 1);
    // 20: o cliente responde com a pagina aberta
    const { data: rev } = await admin.from('orcamento_revisoes').select('id').eq('solicitacao_id', P.sol.id).eq('status', 'pendente').single();
    await post('/api/orcamento-revisao/decidir', P.cli, { revisaoId: rev.id, decisao: 'recusar' });
    await p.waitForTimeout(17000);
    ok('20: com a pagina aberta, aparece "o cliente respondeu" (nao o formulario de valor)', (await p.getByTestId('cliente-respondeu').count()) === 1 && (await p.locator('#motivo-revisao').count()) === 0);
    await ctx.close();
    await admin.from('profiles').update({ idioma: 'et' }).eq('id', w1Id);
  }
  // ---------- 14: aviso gravado nas 6 linguas e mostrado na lingua da tela ----------
  {
    const { data: ns } = await admin.from('notificacoes').select('titulo, dados').eq('profile_id', P.cId).eq('tipo', 'revisao_orcamento').order('created_at', { ascending: false }).limit(1);
    const tx = ns?.[0]?.dados?.textos || {};
    ok('14: aviso da proposta com os textos nas 6 linguas', ['pt', 'pt-PT', 'en', 'et', 'ru', 'it'].every((l) => tx[l]?.titulo), Object.keys(tx).join(','));
    ok('14: titulo gravado na lingua da conta (en)', ns?.[0]?.titulo === tx.en?.titulo, ns?.[0]?.titulo);
    const ctx = await ctxNovo(); const p = await entrar(ctx, P.email, senha);
    await p.goto(`${SITE}/ee/et/cliente/notificacoes`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    const corpo = await p.innerText('main');
    ok('14: a pagina de avisos em ET mostra o aviso em estoniano (nao em ingles)', corpo.includes(tx.et?.titulo || '???') && !corpo.includes(tx.en?.titulo || '???'), corpo.slice(0, 200));
    await ctx.close();
  }
  // ---------- 21: cliente cancela com a oficina -> orcamento encerrado; orcamento NOVO ----------
  {
    const pr = await post(`/api/orcamento-revisao/data`, w1, { orcamentoId: P.o1.id, data: dia(7), turno: 'manha', motivo: 'Uus kuupaev testiks', dataAtualServe: false });
    const rc = await post('/api/orcamento-revisao/decidir', P.cli, { revisaoId: pr.d.revisaoId, decisao: 'cancelar' });
    ok('21: cliente cancelou com a oficina (preparacao)', rc.s === 200, JSON.stringify(rc));
    const ctx = await ctxNovo(); const p = await entrar(ctx, W1, W1S);
    await p.goto(`${SITE}/ee/et/oficina/orcamento/${P.sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    ok('21: orcamento recusado aparece encerrado, sem formulario', (await p.getByTestId('orcamento-recusado').count()) === 1 && (await p.locator('input, textarea').filter({ visible: true }).count()) === 0);
    await p.screenshot({ path: path.join(OUT, 'orcamento_recusado.png'), fullPage: true });
    await p.getByTestId('enviar-orcamento-novo').click(); await p.waitForTimeout(1500);
    const corpo = await p.innerText('main');
    ok('21: "Enviar um orcamento novo" abre o formulario como orcamento novo (nao revisao)', corpo.includes(T('oficinaEnviarOrcamento.enviarOrcamento')) && !corpo.includes(T('oficinaEnviarOrcamento.revisarOrcamento')));
    await ctx.close();
  }
} catch (e) {
  falhas++; console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await b.close();
  await admin.from('profiles').update({ idioma: 'et' }).eq('id', w1Id);
  for (const id of sols) {
    const { data: orcs } = await admin.from('orcamentos').select('id').eq('solicitacao_id', id);
    for (const o of orcs || []) { await admin.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await admin.from('orcamento_itens').delete().eq('orcamento_id', o.id); }
    const { data: ags } = await admin.from('agenda').select('id').eq('solicitacao_id', id);
    for (const a of ags || []) await admin.from('agenda_historico').delete().eq('agenda_id', a.id);
    for (const t of ['orcamento_revisoes', 'agenda', 'mensagens', 'orcamentos']) await admin.from(t).delete().eq('solicitacao_id', id);
    await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', id);
    await admin.from('solicitacoes').delete().eq('id', id);
  }
  for (const id of contas) { await admin.from('veiculos').delete().eq('profile_id', id); await admin.from('notificacoes').delete().eq('profile_id', id); await admin.from('profiles').delete().eq('id', id); await admin.auth.admin.deleteUser(id).catch(() => {}); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
