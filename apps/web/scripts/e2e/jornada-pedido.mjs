// E2E LOCAL da jornada inteira do pedido sem cadastro (dono 06/11), pela tela:
//  A) cliente (site ET, celular) pede sem conta -> codigo -> conta aberta e logado
//  B) oficina (site ET, computador) recebe o aviso, ve o pedido, manda orcamento
//  C) cliente recebe e-mail + aviso e ve o orcamento (site); conversa no chat com a oficina
//  D) cliente aceita escolhendo o horario; oficina ve aceito
//  E) carros: mesma placa nao cria carro; placa diferente cria; sem placa mesmo modelo
//     reaproveita - conferido na tela "Minu sõidukid" do cliente
//  F) app (ET): cliente novo pede no app, oficina orca, o app mostra o orcamento e a conversa
//   node jornada-pedido.mjs <.env.local>
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
const SITE = 'http://localhost:3100';
const APP = 'http://localhost:8090';
const EMAILS = env.EMAIL_PASTA_TESTE;
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/exaustivo';
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const WEBMSG = `${RAIZ}/site/apps/web/messages`;
const MOB = `${RAIZ}/site/apps/mobile/i18n/locales`;
const msgWeb = (l) => {
  const base = JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.json`, 'utf8'));
  for (const area of ['cliente', 'oficina', 'misc', 'auth']) Object.assign(base, JSON.parse(fs.readFileSync(`${WEBMSG}/${l}.${area}.json`, 'utf8')));
  return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], base) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
};
const msgApp = (l) => { const j = JSON.parse(fs.readFileSync(`${MOB}/${l}.json`, 'utf8')); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], j) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
const T = msgWeb('et'); const TA = msgApp('et');
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
// oficina de teste do banco local (ferramentas/semear.mjs); senha lida de la, nunca escrita aqui
const semear = fs.readFileSync(`${RAIZ}/ferramentas/semear.mjs`, 'utf8');
const OFI_EMAIL = 'meister.teste@bipfix.test';
const OFI_SENHA = (semear.match(/conta\('meister\.teste@bipfix\.test', '([^']+)'/) || [])[1];
if (!OFI_SENHA) throw new Error('oficina de teste nao achada no semear.mjs');
const tag = crypto.randomBytes(3).toString('hex');
const senha = 'Jorn-' + crypto.randomBytes(6).toString('hex');
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 200) : ''}`); };
const contas = new Set();
const sols = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ip = () => `10.77.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
const emailsDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort().map((f) => fs.readFileSync(path.join(EMAILS, f), 'utf8'));
const codigoDe = async (email, depois) => { for (let i = 0; i < 40; i++) { const h = emailsDe(email, depois).at(-1); const m = h?.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').match(/(?<![\d#])\d{6}(?!\d)/); if (m) return m[0]; await sleep(300); } return null; };
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const contexto = async (largura, extra = {}) => {
  const c = await browser.newContext({ viewport: { width: largura, height: largura < 500 ? 844 : 900 }, deviceScaleFactor: largura < 500 ? 2 : 1, isMobile: largura < 500, hasTouch: largura < 500,
    locale: 'et-EE', geolocation: { latitude: 59.437, longitude: 24.745 }, permissions: ['geolocation'], extraHTTPHeaders: { 'x-real-ip': ip() }, ...extra });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
// design: nada cortado para fora da tela, sem rolagem lateral, sem chave crua
const design = async (page, nome) => {
  const t = await page.innerText('body');
  const crua = t.match(/\b(pedidoSemConta|cliente[A-Z]\w+|oficina[A-Z]\w+|constants|erros|common)\.[a-zA-Z_]+/);
  ok(`${nome}: sem chave sem traducao`, !crua, crua?.[0]);
  const r = await page.evaluate(() => {
    const sw = document.documentElement.scrollWidth - innerWidth;
    const fora = [...document.querySelectorAll('main button, main a, main input, main select, main textarea')].filter((e) => e.offsetParent)
      .map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && (b.left < -1 || b.right > innerWidth + 1)).length;
    return { sw, fora };
  });
  ok(`${nome}: sem rolagem lateral nem elemento cortado`, r.sw <= 1 && r.fora === 0, JSON.stringify(r));
  return t;
};
const entrarSite = async (ctx, email, s) => {
  const p = await ctx.newPage();
  await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', s);
  await p.click('button[type=submit]'); await p.waitForTimeout(4000);
  return p;
};
// pedido sem cadastro pela tela do site (ate a tela do codigo); devolve o e-mail usado
// marca/modelo: <select> ou campo com lista (desde bf92546 "marca, modelo e ano a vista") - igual ao pedido-exaustivo
async function escolherCarroCampo(page, id, nome, re) {
  const el = page.locator('#' + id);
  await el.waitFor({ state: 'visible', timeout: 20000 });
  if ((await el.evaluate((e) => e.tagName)) === 'SELECT') {
    await page.waitForFunction((e) => e.options.length > 2, await el.elementHandle(), { timeout: 20000 });
    const opc = await el.locator('option').allTextContents();
    await el.selectOption({ label: opc.find((o) => (re || new RegExp('^' + nome + '$')).test(o)) || opc[1] });
    return;
  }
  await page.waitForFunction((e) => !e.getAttribute('aria-busy') || e.getAttribute('aria-busy') === 'false', await el.elementHandle(), { timeout: 20000 }).catch(() => {});
  await el.click(); await el.fill(nome.slice(0, 4));
  const op = page.getByTestId(id + '-lista').getByRole('option', { name: nome, exact: true });
  await op.waitFor({ timeout: 20000 }); await op.click();
}
async function pedidoSite(page, { email, placa, tipo = 'pneu', desc, modelo = /Corolla/ }) {
  await page.goto(`${SITE}/ee/et/paring`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(T(`constants.tiposServico.${tipo}`)) }).first().click();
  await page.getByTestId('passo-detalhe').waitFor();
  await page.locator('#pedido-descricao').fill(desc);
  await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();
  await escolherCarroCampo(page, 'cbbe3-101', 'Toyota');
  await escolherCarroCampo(page, 'cbbe3-102', 'Corolla', modelo);
  await page.getByLabel(T('veiculoForm.labelAno'), { exact: false }).locator('visible=true').first().fill('2017').catch(() => {});
  await page.locator('#pedido-placa').fill(placa || '');
  await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();
  await page.locator('#pedido-endereco').fill('Kesklinn');
  await page.waitForTimeout(2500);
  const sug = page.getByRole('option').first();
  if (await sug.isVisible().catch(() => false)) await sug.click();
  await page.getByRole('button', { name: T('clienteNovaSolicitacao.next'), exact: true }).click();
  await page.getByTestId('passo-contato').waitFor();
  await page.locator('#pedido-nome').fill('Jornada Teste');
  await page.locator('#pedido-email').fill(email);
  // sem senha desde 12/11 (080): a confirmacao e o codigo do e-mail
  await page.getByTestId('quer-sms').check(); // 13/11: celular so com SMS marcado
  await page.locator('#pedido-telefone').fill('5123 4567');
  await page.getByTestId('aceito-termos').check();
  const t0 = Date.now();
  await page.getByRole('button', { name: T('pedidoSemConta.enviarPedido') }).click();
  return t0;
}
// oficina manda orcamento pela tela
async function orcar(pO, solId, valor, item) {
  await pO.goto(`${SITE}/ee/et/oficina/enviar-orcamento/${solId}`, { waitUntil: 'networkidle' });
  await pO.waitForTimeout(2500);
  await pO.locator('input[placeholder="' + T('oficinaEnviarOrcamento.placeholderDescricaoItem') + '"]').first().fill(item);
  await pO.getByLabel(T('oficinaEnviarOrcamento.placeholderValor'), { exact: true }).locator('visible=true').first().fill(String(valor));
  await pO.locator('input[type=date]:not(#cacb1-103)').first().fill(new Date(Date.now() + 86400e3).toISOString().slice(0, 10));
  await pO.waitForTimeout(500);
  await pO.locator('button[type=submit]').locator('visible=true').last().click();
  await pO.waitForTimeout(4000);
  return (await admin.from('orcamentos').select('id, valor_total, status').eq('solicitacao_id', solId)).data || [];
}

try {
  const { data: of } = await admin.from('oficinas').select('id, profile_id').eq('profile_id', (await admin.from('profiles').select('id').eq('email', OFI_EMAIL).single()).data.id).single();
  await admin.from('profiles').update({ idioma: 'et' }).eq('id', of.profile_id); // conta compartilhada: um teste manual pode ter trocado o idioma
  ok('oficina de teste ativa no banco local', !!of);

  // ---------------- A) cliente pede sem conta (site, celular)
  const emailC = `jornada-${tag}@example.test`;
  const ctxC = await contexto(390);
  const pC = await ctxC.newPage();
  const errosC = []; pC.on('pageerror', (e) => errosC.push(e.message));
  const tA = Date.now();
  const t0 = await pedidoSite(pC, { email: emailC, placa: 'JRN 001', desc: `Talverehvid peale ${tag}` });
  await pC.getByTestId('passo-codigo').waitFor({ timeout: 30000 });
  const c1 = await codigoDe(emailC, t0);
  await pC.locator('#pedido-codigo').fill(c1 || '');
  await pC.getByTestId('confirmar-codigo').click();
  await pC.waitForURL(/orcamentos\//, { timeout: 30000 }).catch(() => {});
  await pC.waitForTimeout(2500);
  const cliente = (await admin.from('profiles').select('id, tipo, telefone').eq('email', emailC).maybeSingle()).data;
  if (cliente) contas.add(cliente.id);
  ok('A: conta aberta com sucesso (cliente, telefone com prefixo)', cliente?.tipo === 'cliente' && cliente?.telefone === '+372 5123 4567', JSON.stringify(cliente));
  const sol = (await admin.from('solicitacoes').select('id, numero').eq('cliente_id', cliente?.id).maybeSingle()).data;
  if (sol) sols.add(sol.id);
  ok('A: logado e no pedido', !!sol && pC.url().includes(sol.id), pC.url());
  await design(pC, 'A pedido aberto (cliente)');
  await pC.screenshot({ path: `${OUT}/jornada-A-cliente-pedido.png`, fullPage: true });

  // ---------------- B) oficina recebe e manda orcamento (site, computador)
  const notifO = (await admin.from('notificacoes').select('id').eq('profile_id', of.profile_id).eq('tipo', 'nova_solicitacao').eq('dados->>solicitacao_id', sol?.id)).data || [];
  ok('B: oficina recebeu o aviso do pedido novo', notifO.length === 1);
  { // o e-mail as oficinas sai em segundo plano (auditoria 07/11): espera ate 15 s
    let mO; for (let i = 0; i < 50 && !mO; i++) { mO = emailsDe(OFI_EMAIL, tA).find((h) => h.includes(`/r/${sol?.numero}?o=`)); if (!mO) await sleep(300); }
    ok('B: oficina recebeu e-mail do pedido novo (estoniano, com link para orcar)', !!mO && /assunto: Uus päring: Rehvid/.test(mO) && mO.includes(`/r/${sol?.numero}?o=et`) && !mO.includes('/oficina/'), (mO || '').slice(0, 120));
    // o link curto leva a pagina de orcar no idioma da oficina
    const rr = await fetch(`${SITE}/r/${sol?.numero}?o=et`, { redirect: 'manual' });
    ok('B: link do e-mail leva a pagina de orcar (estoniano)', (rr.headers.get('location') || '').includes(`/ee/et/oficina/enviar-orcamento/${sol?.id}`), rr.headers.get('location')); }
  const ctxO = await contexto(1280);
  const pO = await entrarSite(ctxO, OFI_EMAIL, OFI_SENHA);
  await pO.goto(`${SITE}/ee/et/oficina/solicitacoes`, { waitUntil: 'networkidle' });
  await pO.waitForTimeout(2500);
  const tLista = await design(pO, 'B lista de pedidos (oficina)');
  ok('B: oficina ve o pedido na lista', tLista.includes(`Talverehvid peale ${tag}`));
  await pO.screenshot({ path: `${OUT}/jornada-B-oficina-lista.png`, fullPage: true });
  const tC = Date.now();
  const orcs = await orcar(pO, sol.id, 180, 'Rehvivahetus + tasakaalustamine');
  ok('B: orcamento enviado pela tela', orcs.length === 1, JSON.stringify(orcs));
  await pO.screenshot({ path: `${OUT}/jornada-B-oficina-orcamento.png`, fullPage: true });

  // ---------------- C) cliente recebe aviso/e-mail e ve o orcamento; chat
  const notifC = (await admin.from('notificacoes').select('tipo').eq('profile_id', cliente.id)).data || [];
  ok('C: cliente recebeu aviso do orcamento', notifC.some((n) => /orcamento/.test(n.tipo)), JSON.stringify(notifC.map((n) => n.tipo)));
  ok('C: cliente recebeu e-mail do orcamento', emailsDe(emailC, tC).length > 0);
  await pC.goto(`${SITE}/ee/et/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' });
  await pC.waitForTimeout(2500);
  const tOrc = await design(pC, 'C orcamento (cliente, celular)');
  ok('C: cliente ve o orcamento de 180 EUR', /180/.test(tOrc) && /€/.test(tOrc));
  await pC.screenshot({ path: `${OUT}/jornada-C-cliente-orcamento.png`, fullPage: true });
  // oficina escreve; cliente ve e responde; oficina ve a resposta
  await pO.goto(`${SITE}/ee/et/oficina/mensagens/${sol.id}`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(2500);
  await pO.locator('[data-campo-conversa], input[type=text]').last().fill(`Tere! Kas homme sobib? ${tag}`);
  await pO.locator('[data-campo-conversa], input[type=text]').last().press('Enter'); await pO.waitForTimeout(3000);
  await pC.goto(`${SITE}/ee/et/cliente/mensagens/${sol.id}?oficina=${of.id}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
  const tChat = await design(pC, 'C conversa (cliente, celular)');
  ok('C: cliente ve a mensagem da oficina', tChat.includes(`Kas homme sobib? ${tag}`));
  await pC.locator('[data-campo-conversa], input[type=text]').last().fill(`Sobib, tulen kell 9 ${tag}`);
  await pC.locator('[data-campo-conversa], input[type=text]').last().press('Enter'); await pC.waitForTimeout(3000);
  await pC.screenshot({ path: `${OUT}/jornada-C-cliente-chat.png`, fullPage: true });
  await pO.reload({ waitUntil: 'networkidle' }); await pO.waitForTimeout(2500);
  ok('C: oficina ve a resposta do cliente', (await pO.innerText('body')).includes(`tulen kell 9 ${tag}`));

  // ---------------- D) cliente aceita com horario; oficina ve aceito
  await pC.goto(`${SITE}/ee/et/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(2500);
  await pC.getByRole('button', { name: T('clienteOrcamentoDetalhe.acceptAndSchedule'), exact: false }).locator('visible=true').last().click();
  await pC.waitForTimeout(1500);
  await pC.locator('button').filter({ hasText: /\d{2}:\d{2} - \d{2}:\d{2}/ }).locator('visible=true').first().click();
  await design(pC, 'D escolha do horario (cliente)');
  await pC.screenshot({ path: `${OUT}/jornada-D-cliente-horario.png`, fullPage: true });
  await pC.getByRole('button', { name: T('clienteOrcamentoDetalhe.confirmAppointment'), exact: false }).locator('visible=true').last().click();
  await pC.waitForTimeout(4000);
  const o2 = (await admin.from('orcamentos').select('status').eq('id', orcs[0]?.id).maybeSingle()).data;
  ok('D: orcamento aceito pela tela', o2?.status === 'aceito', o2?.status);
  const notifO2 = (await admin.from('notificacoes').select('tipo').eq('profile_id', of.profile_id).gte('created_at', new Date(tC).toISOString())).data || [];
  ok('D: oficina recebeu aviso do aceite', notifO2.some((n) => /aceit/.test(n.tipo)), JSON.stringify(notifO2.map((n) => n.tipo)));

  // ---------------- E) carros (mesma conta, pedidos sem cadastro com "ja tenho conta")
  const veic = async () => (await admin.from('veiculos').select('placa').eq('profile_id', cliente.id)).data || [];
  ok('E: 1 carro depois do 1o pedido', (await veic()).length === 1, JSON.stringify(await veic()));
  const ctxE = await contexto(390);
  const pE = await ctxE.newPage();
  const pedirComConta = async (placa, desc, modelo) => {
    // conta existente: mesmo fluxo (codigo no e-mail, o pedido entra na conta) desde 12/11
    const tE = await pedidoSite(pE, { email: emailC, placa, desc, tipo: 'mecanica', modelo });
    await pE.getByTestId('passo-codigo').waitFor({ timeout: 30000 });
    await pE.locator('#pedido-codigo').fill((await codigoDe(emailC, tE)) || '');
    await pE.getByTestId('confirmar-codigo').click();
    await pE.waitForURL(/orcamentos\//, { timeout: 30000 }).catch(() => {});
    await pE.waitForTimeout(2000);
    const s = (await admin.from('solicitacoes').select('id').eq('cliente_id', cliente.id).ilike('descricao', `%${desc}%`).maybeSingle()).data;
    if (s) sols.add(s.id);
    await ctxE.clearCookies();
    await pE.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    return s;
  };
  ok('E: mesma placa (escrita "jrn001") -> pedido criado', !!(await pedirComConta('jrn001', `Sama auto ${tag}`)));
  ok('E: mesma placa nao cria carro novo', (await veic()).length === 1, JSON.stringify(await veic()));
  ok('E: placa diferente -> pedido criado', !!(await pedirComConta('XYZ 999', `Teine auto ${tag}`)));
  ok('E: placa diferente cria carro novo', (await veic()).length === 2, JSON.stringify(await veic()));
  ok('E: sem placa, mesmo modelo -> pedido criado', !!(await pedirComConta('', `Ilma numbrita ${tag}`)));
  ok('E: sem placa e mesmo modelo/ano reaproveita', (await veic()).length === 2, JSON.stringify(await veic()));
  // tela "Minu sõidukid" do cliente
  await pC.goto(`${SITE}/ee/et/cliente/veiculos`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(2500);
  const tV = await design(pC, 'E meus veiculos (cliente)');
  ok('E: tela de veiculos mostra os 2 carros', /JRN\s?001/.test(tV) && /XYZ\s?999/.test(tV), tV.slice(0, 200));
  await pC.screenshot({ path: `${OUT}/jornada-E-veiculos.png`, fullPage: true });
  await ctxE.close();

  // ---------------- F) app: cliente novo pede no app; oficina orca; app mostra orcamento e conversa
  const emailApp = `jornada-app-${tag}@example.test`;
  const ctxA = await contexto(390);
  const pA = await ctxA.newPage();
  const clica = async (txt) => pA.getByText(txt, { exact: true }).locator('visible=true').last().click();
  const campo = (rot) => pA.getByLabel(rot, { exact: true }).locator('visible=true').first();
  await pA.goto(APP, { waitUntil: 'networkidle' });
  await pA.getByText(TA('auth.slogan')).waitFor({ timeout: 20000 });
  await clica(TA('auth.pedirSemConta'));
  await pA.getByText(new RegExp(TA('constants.tiposServico.eletrica'))).locator('visible=true').first().click();
  await campo(TA('novaSolicitacao.passoSintomas')).fill(`Aku tühjeneb ${tag}`);
  await clica(TA('pedidoSemConta.next'));
  await campo(TA('veiculos.marca')).click();
  await pA.getByLabel(TA('veiculos.marca'), { exact: true }).locator('visible=true').last().fill('Toyota');
  await pA.waitForTimeout(1500); await pA.getByText('Toyota', { exact: true }).last().click(); await pA.waitForTimeout(800);
  await campo(TA('veiculos.modelo')).click();
  await pA.getByLabel(TA('veiculos.modelo'), { exact: true }).locator('visible=true').last().fill('Yaris');
  await pA.waitForTimeout(2500); await pA.getByText('Yaris', { exact: true }).last().click(); await pA.waitForTimeout(800);
  await campo(TA('veiculos.ano')).fill('2012');
  await clica(TA('pedidoSemConta.next'));
  await pA.waitForTimeout(3500);
  await clica(TA('pedidoSemConta.next'));
  await campo(TA('pedidoSemConta.nome')).fill('App Jornada');
  await campo(TA('pedidoSemConta.email')).fill(emailApp);
  await campo(TA('pedidoSemConta.senha')).fill(senha);
  await campo(TA('pedidoSemConta.telefone')).fill('5555 1234');
  await pA.getByRole('checkbox').locator('visible=true').last().click({ position: { x: 10, y: 10 } });
  const tF = Date.now();
  await clica(TA('pedidoSemConta.enviarPedido'));
  await pA.getByText(TA('pedidoSemConta.codigoTitulo'), { exact: true }).waitFor({ timeout: 30000 });
  const cA = await codigoDe(emailApp, tF);
  await campo(TA('pedidoSemConta.codigoCampo')).fill(cA || '');
  await clica(TA('pedidoSemConta.confirmarEnviar'));
  await pA.waitForURL(/\/solicitacao\//, { timeout: 30000 }).catch(() => {});
  await pA.waitForTimeout(2500);
  const clienteApp = (await admin.from('profiles').select('id, telefone').eq('email', emailApp).maybeSingle()).data;
  if (clienteApp) contas.add(clienteApp.id);
  ok('F: conta aberta pelo app (telefone com prefixo)', clienteApp?.telefone === '+372 5555 1234', JSON.stringify(clienteApp));
  const solA = (await admin.from('solicitacoes').select('id').eq('cliente_id', clienteApp?.id).maybeSingle()).data;
  if (solA) sols.add(solA.id);
  ok('F: app abre o pedido', !!solA && pA.url().includes(solA.id), pA.url());
  const orcsA = await orcar(pO, solA.id, 95, 'Aku vahetus');
  ok('F: oficina orcou o pedido do app', orcsA.length === 1);
  await pO.goto(`${SITE}/ee/et/oficina/mensagens/${solA.id}`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(2500);
  await pO.locator('[data-campo-conversa], input[type=text]').last().fill(`Aku on laos ${tag}`);
  await pO.locator('[data-campo-conversa], input[type=text]').last().press('Enter'); await pO.waitForTimeout(3000);
  await pA.reload({ waitUntil: 'networkidle' }); await pA.waitForTimeout(4000);
  const tAp = await pA.innerText('body');
  ok('F: app mostra o orcamento de 95 EUR', /95/.test(tAp), tAp.slice(0, 200));
  ok('F: app nunca mostra "pedido nao existe"', !tAp.includes(TA('acompanhamento.naoEncontrado')));
  await pA.screenshot({ path: `${OUT}/jornada-F-app-orcamento.png`, fullPage: true });
  await pA.goto(`${APP}/conversa/${solA.id}?oficina=${of.id}`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(4000);
  const tAc = await pA.innerText('body');
  ok('F: app mostra a mensagem da oficina', tAc.includes(`Aku on laos ${tag}`), tAc.slice(0, 200));
  await pA.screenshot({ path: `${OUT}/jornada-F-app-conversa.png`, fullPage: true });
  ok('A-F: sem erro de JS no site do cliente', !errosC.length, errosC.join(' | '));
} catch (e) {
  falhas++;
  console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  for (const id of sols) {
    const { data: o } = await admin.from('orcamentos').select('id').eq('solicitacao_id', id);
    for (const x of o || []) { for (const t of ['orcamento_disponibilidade', 'orcamento_itens', 'agenda']) await admin.from(t).delete().eq('orcamento_id', x.id); }
    for (const t of ['orcamentos', 'mensagens', 'solicitacao_fotos', 'analise_dano']) await admin.from(t).delete().eq('solicitacao_id', id);
    await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', id);
    await admin.from('solicitacoes').delete().eq('id', id);
  }
  for (const id of contas) {
    for (const [t, c] of [['notificacoes', 'profile_id'], ['veiculos', 'profile_id'], ['pedidos_pendentes', 'user_id']]) await admin.from(t).delete().eq(c, id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
