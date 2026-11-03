// Traducao automatica (dono 03/11): pedido em estoniano, oficina em russo.
//  1 oficina RU: descricao do pedido (lista, detalhe, formulario) em russo,
//    com "показать оригинал" que volta ao estoniano
//  2 cliente ET: item e observacao do orcamento (escritos em russo) em estoniano
//  3 chat: mensagem do cliente traduzida para a oficina; a propria nao
//  4 cache: o mesmo texto nao vai de novo ao DeepL (fica em traducoes)
//  5 sem login: /api/traduzir responde 401
// Gasta poucos caracteres do DeepL (precisa de DEEPL_API_KEY no .env.local).
//   node site-traducao.mjs <.env.local> [SITE]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.argv[3] || 'http://localhost:3100';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const MSG = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/messages';
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8'))));
const tr = (l) => { const m = msgs(l); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
const RU = tr('ru'); const ET = tr('et');
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; let ofId; const sols = [];
const cirilico = /[А-Яа-яЁё]{4,}/;
// textos com o tag para nao cair no cache de rodadas anteriores
const DESC = `Tagumine parem pidurisadul vajab vahetamist ja rattad tuleb tasakaalustada (${tag}).`;
const ITEM = `Замена заднего тормозного суппорта ${tag}`;
const OBS = `Запчасть будет готова через два дня, цена включает работу (${tag}).`;
const CHAT_CLI = `Kas saate auto homme hommikul vastu võtta? (${tag})`;
const CHAT_OF = `Да, приезжайте в девять утра (${tag}).`;
const DESC_RU = `Скрипят задние тормоза, нужно поменять колодки и диски (${tag}).`;

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const ctxNovo = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} }); return c; };
const entrar = async (ctx, u, pre) => { const p = await ctx.newPage(); await p.goto(`${SITE}${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]'); await p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(2500); return p; };
const conta = async (tipo, nome, idioma) => {
  const email = `trad-${tipo}${contas.length}-${tag}@example.test`; const senha = `Tr${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone: '+372 5000 0000' });
  return { id: data.user.id, email, senha };
};
const esperarTexto = async (p, teste, ms = 20000) => { for (let t = 0; t < ms; t += 1000) { const txt = await p.locator('body').innerText().catch(() => ''); if (teste(txt)) return txt; await p.waitForTimeout(1000); } return p.locator('body').innerText().catch(() => ''); };

try {
  // ---------- 5 sem login
  const r401 = await fetch(`${SITE}/api/traduzir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lingua: 'ru', textos: ['tere'] }) });
  ok('5 /api/traduzir sem login = 401', r401.status === 401, r401.status);

  const dono = await conta('oficina', 'Dono Trad', 'ru');
  const { data: of, error: eOf } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `TRAD ${tag}`, endereco: 'Kesktee 1', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: 59.437, longitude: 24.75, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica'], seguradoras_convencionadas: [] }).select('id').single();
  if (eOf) throw new Error(eOf.message);
  ofId = of.id;
  const cli = await conta('cliente', 'Klient Trad', 'et');
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: `Superb ${tag}`, fipe_ano: '2007', placa: `T${tag}`.toUpperCase() }).select('id').single();
  const { data: sol, error: eS } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: DESC, urgencia: 'media', status: 'aberta', latitude: 59.44, longitude: 24.76, endereco: 'Kesklinn', pais: 'EE' }).select('id').single();
  if (eS) throw new Error(eS.message);
  sols.push(sol.id);

  // ---------- 1 oficina RU
  const ctxO = await ctxNovo(); const pO = await entrar(ctxO, dono, '/ee/ru');
  await pO.goto(`${SITE}/ee/ru/oficina/pedidos`, { waitUntil: 'networkidle' });
  let txt = await esperarTexto(pO, (t) => t.includes(`Superb ${tag}`) && t.includes('🌐'));
  const cartao = (await pO.getByTestId('pedido-cartao').allInnerTexts()).find((t) => t.includes(`Superb ${tag}`)) || '';
  ok('1 lista: descricao em russo com 🌐', cartao.includes('🌐') && cirilico.test(cartao) && !cartao.includes('pidurisadul'), cartao.slice(0, 200));
  await pO.goto(`${SITE}/ee/ru/oficina/pedidos/${sol.id}`, { waitUntil: 'networkidle' });
  txt = await esperarTexto(pO, (t) => t.includes(RU('traducao.verOriginal')));
  ok('1 detalhe: traduzido e com "показать оригинал"', txt.includes(RU('traducao.verOriginal')) && !txt.includes('pidurisadul'), txt.slice(0, 300));
  ok('1 detalhe: diz a lingua de origem (эстонский)', /эстонск/i.test(txt), txt.match(/Автоматический[^\n]*/)?.[0]);
  await pO.getByRole('button', { name: RU('traducao.verOriginal') }).first().click(); await pO.waitForTimeout(500);
  txt = await pO.locator('body').innerText();
  ok('1 "показать оригинал" mostra o estoniano', txt.includes('pidurisadul') && txt.includes(RU('traducao.verTraducao')));
  await pO.goto(`${SITE}/ee/ru/oficina/orcamento/${sol.id}`, { waitUntil: 'networkidle' });
  txt = await esperarTexto(pO, (t) => t.includes(RU('traducao.verOriginal')));
  ok('1 formulario do orcamento: descricao traduzida', txt.includes(RU('traducao.verOriginal')) && !txt.includes('pidurisadul'));

  // ---------- 4 cache
  const { data: cache } = await sb.from('traducoes').select('alvo, origem, traducao').eq('alvo', 'RU').ilike('traducao', `%${tag}%`);
  ok('4 traducao guardada uma vez (ET -> RU)', (cache || []).length === 1 && cache[0].origem === 'ET', JSON.stringify(cache));

  // ---------- 6 mesma lingua: pedido em russo para oficina russa nem vai ao DeepL (lib/lingua-provavel.ts)
  const { data: v2 } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: `Octavia ${tag}`, fipe_ano: '2010', placa: `U${tag}`.toUpperCase() }).select('id').single();
  const { data: sol2, error: eS2 } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v2.id, tipo: 'mecanica', descricao: DESC_RU, urgencia: 'media', status: 'aberta', latitude: 59.44, longitude: 24.76, endereco: 'Kesklinn', pais: 'EE' }).select('id').single();
  if (eS2) throw new Error(eS2.message);
  sols.push(sol2.id);
  await pO.goto(`${SITE}/ee/ru/oficina/pedidos`, { waitUntil: 'networkidle' });
  await esperarTexto(pO, (t) => t.includes(`Octavia ${tag}`));
  await pO.waitForTimeout(2000);
  const cartaoRu = (await pO.getByTestId('pedido-cartao').allInnerTexts()).find((t) => t.includes(`Octavia ${tag}`)) || '';
  ok('6 pedido ja em russo: aparece como foi escrito, sem 🌐', cartaoRu.includes(DESC_RU.slice(0, 30)) && !cartaoRu.includes('🌐'), cartaoRu.slice(0, 200));
  const hashRu = crypto.createHash('sha256').update(`RU\n${DESC_RU}`).digest('hex');
  const { count: nMesma } = await sb.from('traducoes').select('hash', { count: 'exact', head: true }).eq('hash', hashRu);
  ok('6 mesma lingua nem foi ao DeepL (nada guardado)', !nMesma);

  // ---------- 2 cliente ET ve o orcamento em estoniano
  const { data: orc, error: eO } = await sb.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: ofId, status: 'enviado', valor_total: 250, prazo_dias: 2, validade: '2030-01-01', observacoes: OBS }).select('id').single();
  if (eO) throw new Error(eO.message);
  await sb.from('orcamento_itens').insert({ orcamento_id: orc.id, descricao: ITEM, tipo: 'mao_de_obra', quantidade: 1, valor_unitario: 250, valor_total: 250 });
  await sb.from('solicitacoes').update({ status: 'em_orcamento' }).eq('id', sol.id);
  const ctxC = await ctxNovo(); const pC = await entrar(ctxC, cli, '/ee/et');
  await pC.goto(`${SITE}/ee/et/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' });
  txt = await esperarTexto(pC, (t) => t.includes(ET('traducao.verOriginal')) && t.includes('🌐'));
  ok('2 cliente: observacao em estoniano com "vaata originaali"', txt.includes(ET('traducao.verOriginal')) && !txt.includes('Запчасть будет'), txt.slice(0, 300));
  ok('2 cliente: item do orcamento em estoniano (🌐)', txt.includes('🌐') && !txt.includes('Замена заднего'), txt.slice(0, 300));
  ok('2 cliente: a propria descricao NAO e traduzida', txt.includes('pidurisadul'));

  // ---------- 3 chat
  await sb.from('mensagens').insert([
    { solicitacao_id: sol.id, oficina_id: ofId, remetente_id: cli.id, texto: CHAT_CLI, tipo: 'texto' },
    { solicitacao_id: sol.id, oficina_id: ofId, remetente_id: dono.id, texto: CHAT_OF, tipo: 'texto' },
  ]);
  await pO.goto(`${SITE}/ee/ru/oficina/mensagens/${sol.id}`, { waitUntil: 'networkidle' });
  txt = await esperarTexto(pO, (t) => t.includes(CHAT_OF) && t.includes(RU('traducao.verOriginal')));
  ok('3 oficina: mensagem do cliente traduzida', !txt.includes('homme hommikul') && txt.includes(RU('traducao.verOriginal')), txt.slice(-300));
  ok('3 oficina: a propria mensagem fica como escreveu', txt.includes(CHAT_OF));
  const { count: nRu } = await sb.from('traducoes').select('hash', { count: 'exact', head: true }).eq('alvo', 'RU').eq('traducao', CHAT_OF);
  ok('3 a propria mensagem nem vai ao DeepL', !nRu);
} catch (e) {
  falhas++; console.log('ERRO', e.message);
} finally {
  await browser.close();
  for (const s of sols) {
    await sb.from('mensagens').delete().eq('solicitacao_id', s);
    const { data: os } = await sb.from('orcamentos').select('id').eq('solicitacao_id', s);
    for (const o of os || []) await sb.from('orcamento_itens').delete().eq('orcamento_id', o.id);
    await sb.from('orcamentos').delete().eq('solicitacao_id', s);
    await sb.from('pedido_vistos').delete().eq('solicitacao_id', s);
    await sb.from('solicitacoes').delete().eq('id', s);
  }
  if (ofId) { await sb.from('comissao_config').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
