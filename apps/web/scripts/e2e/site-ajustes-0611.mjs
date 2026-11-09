// Ajustes da noite de 05/11 (commit 53b7fc1), nas telas reais do site local:
// 1) formulario de orcamento abre com 1 dia / 2 h (antes 5 dias / 40 h)
// 2) contador "Pedidos" do menu cai NA HORA depois de enviar o orcamento (antes so em ate 60 s)
// 3) agenda (mes) comeca na segunda, et e ru, computador e celular
// 4) /api/log-error nao grava erro do navegador do Facebook / extensao; grava erro nosso
//   node site-ajustes-0611.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = 'http://localhost:3100';
const MSG = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../messages');
const textos = (l) => ({ ...JSON.parse(fs.readFileSync(path.join(MSG, `${l}.json`), 'utf8')), ...JSON.parse(fs.readFileSync(path.join(MSG, `${l}.oficina.json`), 'utf8')) });
const ET = textos('et'), RU = textos('ru');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x !== '' && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 200) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const sols = []; let ofId;
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const erros = [];
const contexto = async (largura) => {
  const c = await browser.newContext(largura < 500 ? { viewport: { width: largura, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: largura, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_agenda_vista', 'month'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const entrar = async (ctx, email, senha, pre) => {
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(`${SITE}/${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha);
  await p.click('button[type=submit]'); await p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 }).catch(() => {}); return p;
};
const conta = async (tipo, idioma) => {
  const email = `aj-${tipo}${contas.length}-${tag}@example.test`; const senha = `Aj${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo.toUpperCase()} ${contas.length}`, email, idioma });
  return { id: data.user.id, email, senha };
};
// numero no contador "Pedidos" (texto do badge com aria-label "{n} ... ootab vastust"), ou 0 sem badge
const contador = (p) => p.evaluate(() => {
  const b = [...document.querySelectorAll('span[aria-label]')].find((e) => / ootab vastust$/.test(e.getAttribute('aria-label')) && e.offsetParent);
  return b ? Number(b.textContent.trim()) : 0;
});
try {
  const cli = await conta('cliente', 'et'); const ofi = await conta('oficina', 'et');
  const { data: of } = await sb.from('oficinas').insert({ profile_id: ofi.id, nome_fantasia: `AJ SHOP ${tag}`, endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '1', pais: 'EE', latitude: 59.43, longitude: 24.75, ativa: true, especialidades: ['mecanica'] }).select('id').single();
  ofId = of.id;
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2015' }).select('id').single();
  for (const d of ['Õlivahetus', 'Pidurid kriuksuvad']) {
    const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: `${d} ${tag}`, urgencia: 'media', latitude: 59.43, longitude: 24.75, endereco: 'Tallinn' }).select('id').single();
    sols.push(s.id);
  }

  // 1 + 2) computador, oficina em estoniano
  const ctx = await contexto(1280); const p = await entrar(ctx, ofi.email, ofi.senha, 'ee/et');
  await p.goto(`${SITE}/ee/et/oficina/pedidos`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  const antes = await contador(p);
  ok('2 contador "Pedidos" conta os 2 pedidos novos (ha outros no banco local)', antes >= 2, antes);
  await p.goto(`${SITE}/ee/et/oficina/orcamento/${sols[0]}`, { waitUntil: 'networkidle' });
  await p.locator('#cacb1-101').waitFor({ timeout: 15000 });
  ok('1 prazo total vem 1 dia', (await p.inputValue('#cacb1-101')) === '1', await p.inputValue('#cacb1-101'));
  ok('1 tempo de execucao vem 2 h', (await p.inputValue('#cacb1-102')) === '2', await p.inputValue('#cacb1-102'));
  ok('1 sem aviso de prazo longo', (await p.locator('[data-testid="aviso-prazo-longo"]').count()) === 0);
  await p.locator(`input[placeholder="${ET.oficinaEnviarOrcamento.placeholderDescricaoItem}"]`).first().fill('Õli ja filter');
  await p.getByLabel(ET.oficinaEnviarOrcamento.placeholderValor, { exact: true }).locator('visible=true').first().fill('95');
  await p.locator('input[type=date]:not(#cacb1-103)').first().fill(new Date(Date.now() + 86400e3).toISOString().slice(0, 10));
  await p.waitForTimeout(400);
  const t0 = Date.now();
  await p.locator('button[type=submit]').locator('visible=true').last().click();
  let depois = antes;
  while (Date.now() - t0 < 15000) { await p.waitForTimeout(500); depois = await contador(p); if (depois === antes - 1) break; }
  const seg = Math.round((Date.now() - t0) / 1000);
  ok(`2 contador cai de ${antes} para ${antes - 1} logo depois de enviar (${seg} s; antes ate 60 s)`, depois === antes - 1 && seg <= 10, `${depois} em ${seg}s`);
  const { data: orc } = await sb.from('orcamentos').select('prazo_dias, tempo_execucao_horas, valor_total').eq('solicitacao_id', sols[0]).single();
  ok('1 orcamento gravado com 1 dia / 2 h / 95', orc?.prazo_dias === 1 && Number(orc?.tempo_execucao_horas) === 2 && Number(orc?.valor_total) === 95, JSON.stringify(orc));

  // 3) agenda: semana comeca na segunda
  const agenda = async (pg, M, rot) => {
    await pg.goto(`${SITE}/${rot}/oficina/agenda`, { waitUntil: 'networkidle' }); await pg.waitForTimeout(2500);
    const info = await pg.evaluate(() => {
      // grade do mes: grid-cols-7 ou, desde 08/11 (cabe no celular), grid-cols-[repeat(7,minmax(0,1fr))]
      const g = [...document.querySelectorAll('.grid')].filter((e) => /(^|\s)grid-cols-(7|\[repeat\(7)/.test(e.className));
      if (g.length < 2) return null;
      const cab = [...g[0].children].map((e) => e.textContent.trim());
      const casas = [...g[1].children]; const vazias = casas.findIndex((e) => e.textContent.trim() !== '');
      return { cab, vazias, primeiroDia: casas[vazias]?.textContent.trim().slice(0, 2) };
    });
    const a = M.oficinaAgenda;
    const hoje = new Date(); const esperado = (new Date(hoje.getFullYear(), hoje.getMonth(), 1).getDay() + 6) % 7;
    ok(`3 agenda ${rot}: cabecalho seg..dom`, info && info.cab.join(' ') === [1, 2, 3, 4, 5, 6, 0].map((i) => a['dia' + i]).join(' '), info?.cab.join(' '));
    ok(`3 agenda ${rot}: dia 1 na coluna certa (${esperado} casas vazias)`, info && info.vazias === esperado && /^1/.test(info.primeiroDia), JSON.stringify(info));
    ok(`3 agenda ${rot}: sem rolagem lateral`, await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  };
  await agenda(p, ET, 'ee/et');
  await p.screenshot({ path: 'ajustes-agenda-et-1280.png' });
  await ctx.close();
  await sb.from('profiles').update({ idioma: 'ru' }).eq('id', ofi.id);
  const ctxR = await contexto(390); const pR = await entrar(ctxR, ofi.email, ofi.senha, 'ee/ru');
  await agenda(pR, RU, 'ee/ru');
  await pR.screenshot({ path: 'ajustes-agenda-ru-390.png' });
  await ctxR.close();

  // 4) /api/log-error
  const enviar = (mensagem, stack) => fetch(`${SITE}/api/log-error`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagem, stack, url: `${SITE}/teste-${tag}` }) });
  await enviar(`Error invoking postMessage: Java object is gone ${tag}`, 'at sendDataToNative (iabjs://navigation_performance_logger_android:1:11722)');
  await enviar(`func sseError not found ${tag}`, 'at Object.<anonymous> (chrome-extension://abc/inpage.js:253:4574)');
  await enviar(`TypeError: nosso erro ${tag}`, 'at Lista (http://localhost:3100/_next/static/chunks/app/page.js:1:2)');
  await new Promise((r) => setTimeout(r, 1500));
  const { data: gravados } = await sb.from('app_errors').select('id, mensagem').like('mensagem', `%${tag}%`);
  ok('4 erro do Facebook / extensao NAO gravado', !(gravados || []).some((g) => /Java object|sseError/.test(g.mensagem)), JSON.stringify(gravados));
  ok('4 erro nosso continua gravado', (gravados || []).some((g) => /nosso erro/.test(g.mensagem)), JSON.stringify(gravados));
  for (const g of gravados || []) await sb.from('app_errors').delete().eq('id', g.id);

  ok('sem erros de JavaScript nas telas', erros.length === 0, erros.join(' | '));
} catch (e) { ok('parou', false, e.message); } finally {
  await browser.close();
  for (const solId of sols) {
    const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', solId);
    for (const o of orcs || []) { for (const t of ['orcamento_disponibilidade', 'orcamento_itens']) await sb.from(t).delete().eq('orcamento_id', o.id); await sb.from('agenda').delete().eq('orcamento_id', o.id); }
    for (const t of ['mensagens', 'agenda', 'orcamentos', 'notificacoes_pedido', 'pedido_vistos', 'pedido_dispensas']) await sb.from(t).delete().eq('solicitacao_id', solId);
    await sb.from('solicitacoes').delete().eq('id', solId);
  }
  if (ofId) { await sb.from('agenda').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { for (const [t, c] of [['veiculos', 'profile_id'], ['notificacoes', 'profile_id']]) await sb.from(t).delete().eq(c, id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
