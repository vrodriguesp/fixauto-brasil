// Reteste no APP (versao web do mesmo codigo, tela de iPhone) dos pontos do
// teste do dono no iPhone em 09/10 (docs/TESTE_IPHONE_2026-10-09.md):
//  14 conta em estoniano, aparelho em portugues: em que idioma o app abre
//  12 "novo pedido" com um servico concluido sem avaliacao: mostra o aviso
//     para avaliar (nao fica carregando)
//   2 pedido do acidente: a foto aparece; seguro e numero do sinistro editaveis
//   6 conversa: mandar mensagem e voltar nao da erro
//   5 mensagem nova da oficina: a bolinha da aba aparece sem reabrir o app
//  11 app em segundo plano recebe aviso; ao voltar o aviso aparece
// Pre-requisito: app web servido em :8090 (servir-app-web.mjs).
//   node app-teste-dono.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const APP = 'http://localhost:8090';
const SITE = 'https://bipfix.com';
const MOB = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/mobile/i18n/locales';
const txt = (loc) => { const j = JSON.parse(fs.readFileSync(`${MOB}/${loc}.json`, 'utf8')); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], j) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
const ET = txt('et'); const PT = txt('pt');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; let ofId; const sols = []; const ems = [];
const TLL = { lat: 59.4444, lon: 24.7357 };

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const erros = [];
try {
  // ---------- dados
  const email = `app-dono-${tag}@example.test`; const senha = `App${tag}Senha9`;
  const { data: u } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(u.user.id);
  await sb.from('profiles').insert({ id: u.user.id, tipo: 'cliente', nome: 'Teste Dono App', email, idioma: 'et' });
  const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const tok = (await a.auth.signInWithPassword({ email, password: senha })).data.session.access_token;
  const { data: uo } = await sb.auth.admin.createUser({ email: `app-dono-of-${tag}@example.test`, password: senha, email_confirm: true });
  contas.push(uo.user.id);
  await sb.from('profiles').insert({ id: uo.user.id, tipo: 'oficina', nome: 'Oficina Teste', email: `app-dono-of-${tag}@example.test`, idioma: 'et' });
  const { data: of } = await sb.from('oficinas').insert({ profile_id: uo.user.id, nome_fantasia: `Kere ${tag}`, endereco: 'x', cidade: 'Tallinn', estado: '-', cep: '1', pais: 'EE', latitude: TLL.lat + 0.01, longitude: TLL.lon, ativa: true, raio_atendimento_km: 30, especialidades: ['colisao', 'funilaria'] }).select('id').single();
  ofId = of.id;
  // acidente aberto com foto (rota real)
  const fd = new FormData();
  fd.append('dados', JSON.stringify({ tipoAcidente: 'outro_causou', descricao: 'Batida lateral - farol quebrado', latitude: TLL.lat, longitude: TLL.lon, endereco: 'Tööstuse 5, Tallinn', idioma: 'et', veiculoInfo: { marca: 'Honda', modelo: 'Civic' } }));
  fd.append('fotos', new Blob([fs.readFileSync('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/public/apple-touch-icon.png')], { type: 'image/png' }), 'dano.png');
  const r = await fetch(`${SITE}/api/emergencia`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: fd });
  const d = await r.json(); const solA = d.solicitacaoId; sols.push(solA); ems.push(d.id);
  ok('dados: acidente com foto criado', !!solA, JSON.stringify(d));
  // servico concluido sem avaliacao (outro pedido)
  const { data: v } = await sb.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: 'Fiat', fipe_modelo: 'Uno', fipe_ano: '2019' }).select('id').single();
  const { data: s2 } = await sb.from('solicitacoes').insert({ cliente_id: u.user.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'antigo', urgencia: 'media', latitude: TLL.lat, longitude: TLL.lon, endereco: 'Tallinn', status: 'concluida' }).select('id').single();
  sols.push(s2.id);
  await sb.from('orcamentos').insert({ solicitacao_id: s2.id, oficina_id: ofId, valor_total: 100, prazo_dias: 1, status: 'aceito', validade: '2030-01-01' });

  // ---------- 14 idioma
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erros.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.goto(APP, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  ok('14 antes de entrar: app no idioma do aparelho (pt)', (await page.innerText('body')).includes(PT('auth.entrar')));
  await page.getByLabel(PT('auth.email'), { exact: true }).locator('visible=true').first().fill(email);
  await page.getByLabel(PT('auth.senha'), { exact: true }).locator('visible=true').first().fill(senha);
  await page.getByText(PT('auth.entrar'), { exact: true }).locator('visible=true').last().click();
  await page.waitForTimeout(5000);
  const tInicio = await page.innerText('body');
  const emEt = tInicio.includes(ET('tabs.inicio')) || tInicio.includes(ET('tabs.mensagens'));
  console.log(`info 14: depois de entrar o app esta em ${emEt ? 'ESTONIANO (idioma da conta)' : 'outro idioma'}`);

  // ---------- 12 novo pedido
  erros.length = 0;
  await page.goto(`${APP}/nova-solicitacao`, { waitUntil: 'networkidle' }); await page.waitForTimeout(6000);
  const tNovo = await page.innerText('body');
  ok('12 novo pedido com avaliacao pendente: mostra o aviso para avaliar (nao fica carregando)', tNovo.includes(ET('avaliacao.bloqueio').slice(0, 25)), tNovo.slice(0, 200));

  // ---------- 2 foto e seguro
  await page.goto(`${APP}/solicitacao/${solA}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(6000);
  const fotoOk = await page.evaluate(() => [...document.images].some((i) => i.naturalWidth > 0 && /damage-photos/.test(i.src)));
  ok('2 foto do acidente aparece (link assinado)', fotoOk);
  ok('2 secao "seguro e pagamento" com Editar', (await page.innerText('body')).includes(ET('seguro.secaoTitulo')));
  await page.getByText(ET('seguro.editar'), { exact: true }).locator('visible=true').first().click(); await page.waitForTimeout(500);
  await page.getByText(ET('seguro.opcao_seguro_terceiro'), { exact: true }).locator('visible=true').first().click();
  await page.getByLabel(ET('seguro.labelSeguradora'), { exact: true }).locator('visible=true').first().fill('If Kindlustus');
  await page.getByLabel(ET('seguro.labelSinistro'), { exact: true }).locator('visible=true').first().fill('KA-998877');
  await page.getByText(ET('common.salvar'), { exact: true }).locator('visible=true').last().click(); await page.waitForTimeout(4000);
  const { data: sx } = await sb.from('solicitacoes').select('pagamento_reparo, seguradora, sinistro_numero').eq('id', solA).single();
  ok('2 seguro e numero do sinistro salvos pelo app', sx.pagamento_reparo === 'seguro_terceiro' && sx.seguradora === 'If Kindlustus' && sx.sinistro_numero === 'KA-998877', JSON.stringify(sx));

  // ---------- 6 conversa e voltar
  erros.length = 0;
  await page.goto(`${APP}/solicitacao/${solA}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
  await page.goto(`${APP}/conversa/${solA}?oficina=${ofId}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
  const caixa = page.locator('textarea, input[type=text]').locator('visible=true').last();
  await caixa.fill('Tere, kas homme sobib?'); await caixa.press('Enter'); await page.waitForTimeout(3000);
  await page.goBack(); await page.waitForTimeout(3000);
  const tVolta = await page.innerText('body');
  const errosVolta = erros.filter((e) => !/favicon|404|ResizeObserver|DevTools/i.test(e));
  ok('6 voltar da conversa sem erro', !/Something went wrong|Uncaught|Error:/i.test(tVolta) && errosVolta.length === 0, errosVolta.join(' | ') || tVolta.slice(0, 150));

  // ---------- 5 bolinha de mensagem nova
  await page.goto(APP, { waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
  const contaBadge = () => page.evaluate(() => [...document.querySelectorAll('[role="tablist"] *, [role="tab"] *')].map((e) => e.textContent?.trim()).filter((t) => /^\d+$/.test(t || '')).join(','));
  const antes = await contaBadge();
  await sb.from('mensagens').insert({ solicitacao_id: solA, oficina_id: ofId, remetente_id: uo.user.id, texto: 'Jah, homme kell 9 sobib.' });
  await page.waitForTimeout(5000);
  const depois = await contaBadge();
  ok('5 bolinha da aba aparece/atualiza com a mensagem nova, sem reabrir', depois !== antes && depois.length > 0, `antes "${antes}" depois "${depois}"`);

  // ---------- 11 aviso chegando com o app em segundo plano
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(1500);
  await sb.from('notificacoes').insert({ profile_id: u.user.id, tipo: 'servico_atualizado', titulo: 'Remondi uuendus', mensagem: 'Honda Civic: töös', dados: { solicitacao_id: solA } });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(3500);
  ok('11 ao voltar ao app, o aviso que chegou fora aparece', (await page.innerText('body')).includes('Remondi uuendus'));
  await page.screenshot({ path: 'app-dono-aviso.png' });
  await ctx.close();
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 700)); }
finally {
  await browser.close();
  for (const s of sols) {
    const { data: o } = await sb.from('orcamentos').select('id').eq('solicitacao_id', s);
    for (const x of o || []) { await sb.from('orcamento_itens').delete().eq('orcamento_id', x.id); }
    for (const t of ['orcamentos', 'mensagens', 'solicitacao_fotos', 'avaliacoes']) await sb.from(t).delete().eq('solicitacao_id', s);
    await sb.from('emergencias').update({ solicitacao_id: null }).eq('solicitacao_id', s);
    await sb.from('solicitacoes').delete().eq('id', s);
  }
  for (const e of ems) { for (const t of ['emergencia_oficinas_notificadas', 'emergencia_fotos']) await sb.from(t).delete().eq('emergencia_id', e); await sb.from('emergencias').delete().eq('id', e); }
  if (ofId) await sb.from('oficinas').delete().eq('id', ofId);
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
