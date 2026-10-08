// Fluxo de PECAS pela tela (celular, producao), limpa tudo no fim:
// loja se cadastra (en) -> confirma -> "em analise"; admin ativa em /admin/pecas;
// loja poe peca no catalogo; oficina (ru) pede cotacao; loja responde;
// oficina fecha o pedido.   node site-pecas.mjs <.env.local>
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
const MSG = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/messages';
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8'))));
const tr = (l) => { const m = msgs(l); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
const EN = tr('en'); const RU = tr('ru');
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 140) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = [];
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const celular = async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, geolocation: { latitude: 59.437, longitude: 24.745 }, permissions: ['geolocation'] });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  return c;
};
const campo = (p, rot) => p.getByLabel(rot, { exact: false }).locator('visible=true').first();
const botao = (p, txt) => p.getByRole('button', { name: txt, exact: false }).locator('visible=true').last();
const entrar = async (ctx, email, senha, pre) => {
  const p = await ctx.newPage();
  await p.goto(`${SITE}/${pre}/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha);
  await p.click('button[type=submit]'); await p.waitForTimeout(4000);
  return p;
};
let lojaId, oficinaId, cotId;
try {
  // loja
  const ctxL = await celular(); const pL = await ctxL.newPage();
  const emailL = `delivered+loja${tag}@resend.dev`; const senhaL = `Lj-${tag}-Senha9`;
  await pL.goto(`${SITE}/en/sign-up?tipo=loja_pecas`, { waitUntil: 'networkidle' });
  await campo(pL, EN('cadastro.labelNomeCompleto')).fill('TEST PARTS STORE');
  await campo(pL, EN('cadastro.labelEmail')).fill(emailL);
  await campo(pL, EN('cadastro.labelSenha')).fill(senhaL);
  await pL.locator('input[type=checkbox]').first().check();
  await botao(pL, EN('cadastro.proximo')).click();
  await campo(pL, EN('cadastro.labelNomeFantasia')).fill(`TEST PARTS ${tag}`);
  await campo(pL, EN('cadastro.labelCnpj')).fill('87654321');
  // endereco em campos (rua, numero, cidade), conferido no mapa
  await pL.locator('#cadastro-end-rua').fill('Peterburi tee');
  await pL.locator('#cadastro-end-rua').press('Escape');
  await pL.locator('#cadastro-end-numero').fill('2');
  await pL.locator('#cadastro-end-cidade').fill('Tallinn');
  await pL.locator('#cadastro-end-cidade').blur(); await pL.waitForTimeout(4000);
  await pL.getByText(EN('cadastro.declaracaoResponsavel')).click();
  await botao(pL, EN('cadastro.criarContaLoja')).click();
  await pL.getByText(EN('cadastro.verifiqueTitulo')).waitFor({ timeout: 20000 }).catch(() => {});
  ok('loja: cadastro -> "check your email"', (await pL.innerText('body')).includes(EN('cadastro.verifiqueTitulo')));
  const { data: pfl } = await sb.from('profiles').select('id').eq('email', emailL).single();
  contas.push(pfl.id);
  const { data: lj } = await sb.from('lojas_pecas').select('id, ativa, pais').eq('profile_id', pfl.id).single();
  lojaId = lj.id;
  ok('loja: nasce inativa, pais EE', lj.ativa === false && lj.pais === 'EE', JSON.stringify(lj));
  const { data: link } = await sb.auth.admin.generateLink({ type: 'magiclink', email: emailL });
  await pL.goto(`${SITE}/en/confirmar-email?token_hash=${encodeURIComponent(link.properties.hashed_token)}`, { waitUntil: 'networkidle' });
  await pL.waitForTimeout(4000);
  ok('loja: confirmou e caiu no painel', pL.url().includes('/en/loja/dashboard'), pL.url());
  ok('loja: aviso "under review"', (await pL.innerText('body')).includes(EN('lojaDashboard.cadastroEmAnalise').slice(0, 30)));

  // admin ativa em /admin/pecas
  const emailA = `pecas-adm-${tag}@example.test`; const senhaA = `Adm-${tag}-Senha9`;
  const { data: ua } = await sb.auth.admin.createUser({ email: emailA, password: senhaA, email_confirm: true });
  contas.push(ua.user.id);
  await sb.from('profiles').insert({ id: ua.user.id, tipo: 'admin', nome: 'TESTE ADMIN', email: emailA, idioma: 'pt' });
  const ctxA = await celular();
  const pA = await entrar(ctxA, emailA, senhaA, 'pt-br');
  await pA.goto(`${SITE}/admin/pecas`, { waitUntil: 'networkidle' });
  await pA.waitForTimeout(2000);
  pA.once('dialog', (d) => d.accept());
  // celular: cartao; computador: tabela - clica no que estiver visivel
  await pA.locator('tr, div.p-4', { hasText: `TEST PARTS ${tag}` }).getByRole('button', { name: 'Ativar', exact: true }).locator('visible=true').first().click();
  await pA.waitForTimeout(3000);
  const { data: lj2 } = await sb.from('lojas_pecas').select('ativa').eq('id', lojaId).single();
  ok('admin: ativou a loja em /admin/pecas', lj2.ativa === true);
  await ctxA.close();

  // catalogo
  await pL.goto(`${SITE}/en/loja/catalogo`, { waitUntil: 'networkidle' });
  await botao(pL, EN('lojaCatalogo.addButton')).click();
  await campo(pL, EN('lojaCatalogo.labelNome')).fill('Brake pads front');
  await campo(pL, EN('lojaCatalogo.labelMarca')).fill('Toyota');
  await campo(pL, EN('lojaCatalogo.labelPreco')).fill('45.90');
  await botao(pL, EN('lojaCatalogo.addConfirmButton')).click();
  await pL.waitForTimeout(3000);
  const { data: cat } = await sb.from('pecas_catalogo').select('id, preco').eq('loja_id', lojaId);
  ok('loja: peca no catalogo', (cat || []).length === 1 && Number(cat[0].preco) === 45.9, JSON.stringify(cat));

  // oficina (ru) pede cotacao
  const emailO = `pecas-ofi-${tag}@example.test`; const senhaO = `Of-${tag}-Senha9`;
  const { data: uo } = await sb.auth.admin.createUser({ email: emailO, password: senhaO, email_confirm: true });
  contas.push(uo.user.id);
  await sb.from('profiles').insert({ id: uo.user.id, tipo: 'oficina', nome: 'TESTE OFICINA PECAS', email: emailO, idioma: 'ru' });
  const { data: of } = await sb.from('oficinas').insert({ profile_id: uo.user.id, nome_fantasia: `ОФИС ${tag}`, endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '1', pais: 'EE', latitude: 59.43, longitude: 24.75, ativa: true }).select('id').single();
  oficinaId = of.id;
  const ctxO = await celular();
  const pO = await entrar(ctxO, emailO, senhaO, 'ru');
  await pO.goto(`${SITE}/ru/oficina/pecas`, { waitUntil: 'networkidle' });
  await botao(pO, RU('oficinaPecas.novaCotacao')).click();
  await campo(pO, RU('oficinaPecas.oQueVocePrecisa')).fill('Тормозные колодки передние');
  await campo(pO, RU('oficinaPecas.marca')).fill('Toyota');
  await campo(pO, RU('oficinaPecas.modelo')).fill('Corolla');
  await botao(pO, RU('oficinaPecas.enviarCotacao')).click();
  await pO.waitForTimeout(3000);
  const { data: cots } = await sb.from('cotacoes_pecas').select('id').eq('oficina_id', oficinaId);
  ok('oficina: pediu cotacao de peca', (cots || []).length === 1);
  cotId = cots?.[0]?.id;

  // loja responde
  await pL.goto(`${SITE}/en/loja/cotacoes`, { waitUntil: 'networkidle' });
  await pL.waitForTimeout(2000);
  ok('loja: ve o pedido da oficina', (await pL.innerText('body')).includes('Тормозные колодки'));
  await botao(pL, EN('lojaCotacoes.responderCotacaoButton')).click();
  await campo(pL, EN('lojaCotacoes.labelPreco')).fill('44');
  await campo(pL, EN('lojaCotacoes.labelPrazo')).fill('2');
  await botao(pL, EN('lojaCotacoes.enviarRespostaButton')).click();
  await pL.waitForTimeout(3000);
  const { data: resp } = await sb.from('cotacoes_pecas_respostas').select('id').eq('cotacao_id', cotId);
  ok('loja: respondeu a cotacao', (resp || []).length === 1);

  // oficina fecha o pedido
  await pO.goto(`${SITE}/ru/oficina/pecas`, { waitUntil: 'networkidle' });
  await pO.waitForTimeout(2500);
  const tO = await pO.innerText('body');
  ok('oficina: ve a resposta com preco em euro', /44/.test(tO) && /€/.test(tO));
  pO.once('dialog', (d) => d.accept());
  await botao(pO, RU('oficinaPecas.confirmarPedidoBtn')).click();
  await pO.waitForTimeout(3000);
  const { data: ped } = await sb.from('pedidos_pecas').select('id, status').eq('cotacao_id', cotId);
  ok('oficina: fechou o pedido de peca', (ped || []).length === 1, JSON.stringify(ped));
  await pO.screenshot({ path: 'pecas-oficina.png', fullPage: true });
  await ctxO.close(); await ctxL.close();
} catch (e) {
  falhas++;
  console.log('FALHA parou no meio:', String(e.message).slice(0, 1200));
} finally {
  await browser.close();
  if (cotId) {
    const { data: peds } = await sb.from('pedidos_pecas').select('id').eq('cotacao_id', cotId);
    for (const p of peds || []) await sb.from('comissao_pecas_lancamento').delete().eq('pedido_id', p.id);
    await sb.from('pedidos_pecas').delete().eq('cotacao_id', cotId);
    await sb.from('cotacao_peca_mensagens').delete().eq('cotacao_id', cotId);
    await sb.from('cotacoes_pecas_respostas').delete().eq('cotacao_id', cotId);
    await sb.from('cotacoes_pecas').delete().eq('id', cotId);
  }
  if (lojaId) { await sb.from('pecas_catalogo').delete().eq('loja_id', lojaId); await sb.from('comissao_pecas_config').delete().eq('fornecedor_id', lojaId); await sb.from('lojas_pecas').delete().eq('id', lojaId); }
  if (oficinaId) await sb.from('oficinas').delete().eq('id', oficinaId);
  for (const id of contas) {
    for (const [t, c] of [['notificacoes', 'profile_id'], ['admin_auditoria', 'admin_id']]) await sb.from(t).delete().eq(c, id);
    await sb.from('profiles').delete().eq('id', id);
    await sb.auth.admin.deleteUser(id);
  }
  console.log(`limpeza ok (${contas.length} contas)`);
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
