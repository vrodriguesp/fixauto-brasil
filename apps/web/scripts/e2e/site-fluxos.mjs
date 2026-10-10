// Fluxos do SITE feitos pela tela, como pessoas (celular 390 px, producao):
// 1) oficina se cadastra (et) com sugestao de endereco e declaracao -> confirma
//    -> painel "em analise" + % do perfil -> escreve descricao
// 2) admin entra pela tela (it) e ATIVA a oficina em /admin/oficinas
// 3) cliente se cadastra (it) -> confirma -> cadastra veiculo e cria pedido
// 4) oficina ve o pedido e manda orcamento pela tela (item, valor, data)
// 5) cliente aceita o orcamento escolhendo a data
// Limpa tudo no fim.   node site-fluxos.mjs <.env.local>
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
const ET = tr('et'); const IT = tr('it');
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 140) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = [];
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const celularBase = () => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, geolocation: { latitude: 59.437, longitude: 24.745 }, permissions: ['geolocation'] });
// Fecha o aviso de cookies (fica fixo embaixo e cobre botoes no celular), como uma pessoa faria
const semCookies = async (ctx) => { await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); };
const celular = async () => { const c = await celularBase(); await semCookies(c); return c; };
const campo = (p, rot) => p.getByLabel(rot, { exact: false }).locator('visible=true').first();
const botao = (p, txt) => p.getByRole('button', { name: txt, exact: false }).locator('visible=true').last();
const confirmar = async (ctx, email, pre) => {
  const { data } = await sb.auth.admin.generateLink({ type: 'magiclink', email });
  const p = await ctx.newPage();
  await p.goto(`${SITE}/${pre}/confirmar-email?token_hash=${encodeURIComponent(data.properties.hashed_token)}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(4000);
  return p;
};
const escolherSugestao = async (p, rotulo, texto, contem) => {
  const c = campo(p, rotulo);
  await c.click();
  await c.pressSequentially(texto, { delay: 40 });
  const s = p.getByRole('option').filter({ hasText: contem }).first();
  await s.waitFor({ timeout: 10000 }).catch(() => {});
  const visivel = await s.isVisible().catch(() => false);
  if (visivel) await s.click();
  return visivel;
};

let oficinaId, solId;
try {
  // ---------- 1) oficina (et)
  const ctxO = await celular(); const pO = await ctxO.newPage();
  const emailO = `delivered+ofi${tag}@resend.dev`; const senhaO = `Of-${tag}-Senha9`;
  await pO.goto(`${SITE}/ee/et/registreeru?tipo=oficina`, { waitUntil: 'networkidle' });
  await campo(pO, ET('cadastro.labelNomeCompleto')).fill('TESTE FLUXO OFICINA');
  await campo(pO, ET('cadastro.labelEmail')).fill(emailO);
  await campo(pO, ET('cadastro.labelTelefone')).fill('+37255552222');
  await campo(pO, ET('cadastro.labelSenha')).fill(senhaO);
  await pO.locator('input[type=checkbox]').first().check();
  await botao(pO, ET('cadastro.proximo')).click();
  await campo(pO, ET('cadastro.labelNomeFantasia')).fill(`TESTE FLUXO ${tag}`);
  await campo(pO, ET('cadastro.labelCnpj')).fill('12345678');
  // endereco em campos (rua, numero, cidade), conferido no mapa
  await pO.locator('#cadastro-end-rua').fill('Pärnu mnt');
  await pO.locator('#cadastro-end-rua').press('Escape');
  await pO.locator('#cadastro-end-numero').fill('10');
  await pO.locator('#cadastro-end-cidade').fill('Tallinn');
  await pO.locator('#cadastro-end-cidade').blur(); await pO.waitForTimeout(4000);
  ok('oficina: endereco com numero conferido no mapa', /Aadress leitud kaardilt|majanumbrit kaardil pole/.test(await pO.locator('p[role=status]').first().innerText().catch(() => '')));
  await pO.getByText(ET('constants.tiposServico.mecanica'), { exact: true }).first().click();
  await pO.getByText(ET('cadastro.declaracaoResponsavel')).click();
  await botao(pO, ET('cadastro.criarContaOficina')).click();
  await pO.getByText(ET('cadastro.verifiqueTitulo')).waitFor({ timeout: 20000 }).catch(() => {});
  ok('oficina: tela "confira seu e-mail"', (await pO.innerText('body')).includes(ET('cadastro.verifiqueTitulo')));
  const { data: pf } = await sb.from('profiles').select('id').eq('email', emailO).single();
  contas.push(pf.id);
  const { data: of } = await sb.from('oficinas').select('id, ativa, latitude, cidade').eq('profile_id', pf.id).single();
  oficinaId = of.id;
  ok('oficina: nasce inativa, na posicao escolhida', of.ativa === false && Math.abs(of.latitude - 59.43) < 0.05 && of.cidade === 'Tallinn');
  const pD = await confirmar(ctxO, emailO, 'et');
  const tD = await pD.innerText('body');
  ok('oficina: confirmou e caiu no painel (Pedidos)', pD.url().includes('/ee/et/oficina/pedidos'), pD.url());
  ok('oficina: aviso "em analise"', tD.includes(ET('oficinaDashboard.cadastroEmAnalise').slice(0, 30)));
  ok('oficina: medidor de perfil', tD.includes(ET('oficinaDashboard.perfilTitulo', { pct: '' }).split('{')[0].trim().slice(0, 12)));
  await pD.screenshot({ path: 'fluxo-oficina-painel.png', fullPage: true });
  await pD.goto(`${SITE}/ee/et/oficina/perfil`, { waitUntil: 'networkidle' });
  await pD.waitForTimeout(2000);
  ok('oficina: perfil cabe na tela do celular', (await pD.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
  await campo(pD, ET('oficinaPerfil.descricaoLabel')).fill('Pereettevõte aastast 2005. Kere- ja värvitööd, asendusauto ja hinnapakkumine 24 tunni jooksul. Test.');
  await botao(pD, ET('oficinaPerfil.salvarAlteracoes')).click();
  await pD.waitForTimeout(3000);
  const { data: of2 } = await sb.from('oficinas').select('descricao').eq('id', oficinaId).single();
  ok('oficina: descricao salva', (of2.descricao || '').startsWith('Pereettevõte'));

  // ---------- 2) admin ativa pela tela
  const emailA = `fluxo-adm-${tag}@example.test`; const senhaA = `Adm-${tag}-Senha9`;
  const { data: ua } = await sb.auth.admin.createUser({ email: emailA, password: senhaA, email_confirm: true });
  contas.push(ua.user.id);
  await sb.from('profiles').insert({ id: ua.user.id, tipo: 'admin', nome: 'TESTE ADMIN', email: emailA, idioma: 'it' });
  const ctxA = await celular(); const pA = await ctxA.newPage();
  await pA.goto(`${SITE}/it/it/login`, { waitUntil: 'networkidle' });
  await pA.fill('input[type=email]', emailA); await pA.fill('input[type=password]', senhaA);
  await pA.click('button[type=submit]'); await pA.waitForTimeout(4000);
  await pA.goto(`${SITE}/admin/oficinas`, { waitUntil: 'networkidle' });
  ok('admin: lista de oficinas abre (sem 404)', pA.url().endsWith('/admin/oficinas') && (await pA.innerText('body')).includes(`TESTE FLUXO ${tag}`));
  pA.once('dialog', (d) => d.accept());
  // celular: cartao; computador: tabela - clica no que estiver visivel
  await pA.locator('tr, div.bg-slate-800', { hasText: `TESTE FLUXO ${tag}` }).getByRole('button', { name: 'Ativar', exact: true }).locator('visible=true').first().click();
  await pA.waitForTimeout(3000);
  const { data: of3 } = await sb.from('oficinas').select('ativa').eq('id', oficinaId).single();
  ok('admin: ativou a oficina pela tela', of3.ativa === true);
  await ctxA.close();

  // ---------- 3) cliente (it)
  const ctxC = await celular(); const pC = await ctxC.newPage();
  const emailC = `delivered+cli${tag}@resend.dev`; const senhaC = `Cl-${tag}-Senha9`;
  await pC.goto(`${SITE}/it/it/registrati?tipo=cliente`, { waitUntil: 'networkidle' });
  await campo(pC, IT('cadastro.labelNomeCompleto')).fill('TESTE FLUXO CLIENTE');
  await campo(pC, IT('cadastro.labelEmail')).fill(emailC);
  await campo(pC, IT('cadastro.labelSenha')).fill(senhaC);
  await pC.locator('input[type=checkbox]').first().check();
  await botao(pC, IT('cadastro.criarConta')).click();
  await pC.getByText(IT('cadastro.verifiqueTitulo')).waitFor({ timeout: 20000 }).catch(() => {});
  ok('cliente: tela "confira seu e-mail"', (await pC.innerText('body')).includes(IT('cadastro.verifiqueTitulo')));
  const { data: pc } = await sb.from('profiles').select('id').eq('email', emailC).single();
  contas.push(pc.id);
  const pC2 = await confirmar(ctxC, emailC, 'it');
  ok('cliente: confirmou e caiu no painel', pC2.url().includes('/it/it/cliente/dashboard'), pC2.url());

  await pC2.goto(`${SITE}/it/it/cliente/nova-solicitacao`, { waitUntil: 'networkidle' });
  await pC2.waitForTimeout(1500);
  await botao(pC2, IT('clienteNovaSolicitacao.registerVehicle')).click();
  const marca = campo(pC2, IT('veiculoForm.labelMarca'));
  await marca.waitFor({ timeout: 15000 });
  await pC2.waitForFunction(() => document.querySelectorAll('select option').length > 5, null, { timeout: 15000 }).catch(() => {});
  await marca.selectOption({ label: 'Toyota' });
  const modelo = campo(pC2, IT('veiculoForm.labelModelo'));
  await pC2.waitForTimeout(2500);
  const opcoes = await modelo.locator('option').allTextContents();
  await modelo.selectOption({ label: opcoes.find((o) => /Corolla/.test(o)) || opcoes[1] });
  await campo(pC2, IT('veiculoForm.labelAno')).fill('2019').catch(async () => { await campo(pC2, IT('veiculoForm.labelAno')).selectOption({ index: 1 }); });
  await botao(pC2, IT('clienteNovaSolicitacao.addAndContinue')).click();
  await pC2.waitForTimeout(2500);
  const { data: vs } = await sb.from('veiculos').select('id').eq('profile_id', pc.id);
  ok('cliente: veiculo cadastrado pela tela', (vs || []).length === 1);
  const txtPedido = await pC2.innerText('body');
  ok('cliente: formulario sem texto sem traducao', !/veiculoForm\.|clienteNovaSolicitacao\./.test(txtPedido));
  await botao(pC2, IT('clienteNovaSolicitacao.next')).click();
  await pC2.getByText(IT('constants.tiposServico.mecanica'), { exact: true }).first().click();
  await botao(pC2, IT('clienteNovaSolicitacao.next')).click();
  await pC2.waitForTimeout(800);
  // passo 3 (fotos/detalhes) e 4 (descricao)
  await botao(pC2, IT('clienteNovaSolicitacao.next')).click();
  await pC2.waitForTimeout(800);
  const desc = pC2.locator('textarea').locator('visible=true').first();
  if (await desc.count()) await desc.fill('Test: rumore ai freni anteriori');
  await botao(pC2, IT('clienteNovaSolicitacao.next')).click();
  await pC2.waitForTimeout(800);
  ok('cliente: sugestao de endereco no pedido', await escolherSugestao(pC2, IT('clienteNovaSolicitacao.addressLabel'), 'Viru väljak 4', /Tallinn/));
  await pC2.screenshot({ path: 'fluxo-cliente-pedido.png', fullPage: true });
  await pC2.locator('button.btn-success').locator('visible=true').first().click();
  await pC2.waitForTimeout(5000);
  const { data: sols } = await sb.from('solicitacoes').select('id').eq('cliente_id', pc.id);
  ok('cliente: pedido criado pela tela (erro de seguranca do banco corrigido)', (sols || []).length === 1);
  solId = sols?.[0]?.id;
  const tErr = await pC2.innerText('body');
  ok('cliente: nenhum erro tecnico na tela', !/row-level|violates|policy|solicitacoes/.test(tErr));

  // ---------- 4) oficina manda orcamento pela tela
  if (solId) {
    await pD.goto(`${SITE}/ee/et/oficina/solicitacoes`, { waitUntil: 'networkidle' });
    await pD.waitForTimeout(2000);
    ok('oficina: ve o pedido na lista', (await pD.innerText('body')).includes('Test: rumore'));
    await pD.goto(`${SITE}/ee/et/oficina/enviar-orcamento/${solId}`, { waitUntil: 'networkidle' });
    await pD.waitForTimeout(2000);
    await pD.locator('input[placeholder="' + ET('oficinaEnviarOrcamento.placeholderDescricaoItem') + '"]').first().fill('Piduriklotsid + töö');
    const valor = pD.getByLabel(ET('oficinaEnviarOrcamento.placeholderValor'), { exact: true }).locator('visible=true');
    await valor.first().fill('150');
    await pD.screenshot({ path: 'fluxo-oficina-orcamento.png', fullPage: true });
    await pD.locator('button[type=submit]').locator('visible=true').last().click();
    await pD.waitForTimeout(4000);
    const { data: orcs } = await sb.from('orcamentos').select('id, valor_total, status').eq('solicitacao_id', solId);
    ok('oficina: orcamento enviado pela tela', (orcs || []).length === 1, JSON.stringify(orcs));

    // ---------- 5) cliente aceita
    if (orcs?.length) {
      await pC2.goto(`${SITE}/it/it/cliente/orcamentos/${solId}`, { waitUntil: 'networkidle' });
      await pC2.waitForTimeout(2500);
      await pC2.screenshot({ path: 'fluxo-cliente-orcamento.png', fullPage: true });
      const tO = await pC2.innerText('body');
      ok('cliente: tipo do item e urgencia traduzidos', tO.includes(IT('constants.tiposItem.mao_de_obra')) && !/mao_de_obra|Mao De_obra/i.test(tO));
      ok('cliente: ve o orcamento de 150 EUR', /150/.test(tO) && /€/.test(tO));
      await botao(pC2, IT('clienteOrcamentoDetalhe.acceptAndSchedule')).click();
      await pC2.waitForTimeout(1500);
      ok('cliente: pede para escolher a data', (await pC2.innerText('body')).includes(IT('clienteOrcamentoDetalhe.chooseCheckinDate')));
      // primeiro horario oferecido pela oficina (botao logo depois do titulo da escolha)
      await pC2.locator('button').filter({ hasText: /\d{2}:\d{2} - \d{2}:\d{2}/ }).locator('visible=true').first().click();
      await botao(pC2, IT('clienteOrcamentoDetalhe.confirmAppointment')).click();
      await pC2.waitForTimeout(4000);
      const { data: o2 } = await sb.from('orcamentos').select('status').eq('id', orcs[0].id).single();
      ok('cliente: aceitou o orcamento pela tela', o2.status === 'aceito', o2.status);
    }
  }
  await ctxO.close(); await ctxC.close();
} catch (e) {
  falhas++;
  console.log('FALHA parou no meio:', String(e.message).slice(0, 1500));
} finally {
  await browser.close();
  if (solId) {
    const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', solId);
    for (const o of orcs || []) { await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await sb.from('orcamento_itens').delete().eq('orcamento_id', o.id); await sb.from('agenda').delete().eq('orcamento_id', o.id); }
    for (const t of ['orcamentos', 'mensagens', 'solicitacao_fotos', 'analise_dano']) await sb.from(t).delete().eq('solicitacao_id', solId);
    await sb.from('solicitacoes').delete().eq('id', solId);
  }
  if (oficinaId) { await sb.from('comissao_config').delete().eq('oficina_id', oficinaId); await sb.from('oficinas').delete().eq('id', oficinaId); }
  for (const id of contas) {
    for (const [t, c] of [['notificacoes', 'profile_id'], ['veiculos', 'profile_id'], ['admin_auditoria', 'admin_id']]) await sb.from(t).delete().eq(c, id);
    await sb.from('profiles').delete().eq('id', id);
    await sb.auth.admin.deleteUser(id);
  }
  console.log(`limpeza ok (${contas.length} contas)`);
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
