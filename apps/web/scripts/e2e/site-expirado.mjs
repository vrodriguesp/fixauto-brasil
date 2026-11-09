// Pedido expirado nas telas reais (auditoria 05/11): cliente (et) ve o aviso e
// NAO ve aceitar/recusar ate reabrir; oficina (ru) nao muda o orcamento (aviso no
// lugar do formulario, sem botao "Muuda/Изменить"); depois de reabrir tudo volta.
// Celular e computador, sem rolagem lateral, sem erro de JS.
//   node site-expirado.mjs <.env.local>
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
import { fileURLToPath } from 'node:url';
const MSG = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../messages');
const textos = (l) => ({ ...JSON.parse(fs.readFileSync(path.join(MSG, `${l}.json`), 'utf8')), ...JSON.parse(fs.readFileSync(path.join(MSG, `${l}.cliente.json`), 'utf8')), ...JSON.parse(fs.readFileSync(path.join(MSG, `${l}.oficina.json`), 'utf8')) });
const ET = textos('et'), RU = textos('ru');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 200) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; let solId, ofId;
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const erros = [];
const contexto = async (largura) => {
  const c = await browser.newContext(largura < 500 ? { viewport: { width: largura, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: largura, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  return c;
};
const entrar = async (ctx, email, senha, pre) => {
  const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(`${SITE}/${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha);
  await p.click('button[type=submit]'); await p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 }).catch(() => {}); return p;
};
const conta = async (tipo, idioma) => {
  const email = `exp-${tipo}${contas.length}-${tag}@example.test`; const senha = `Exp${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo.toUpperCase()} ${contas.length}`, email, idioma });
  return { id: data.user.id, email, senha };
};
const semRolagem = async (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const aceitar = (p, M) => p.getByRole('button', { name: M.clienteOrcamentoDetalhe.acceptAndSchedule });
const recusar = (p, M) => p.getByRole('button', { name: M.clienteOrcamentoDetalhe.refuse, exact: true });
try {
  const cli = await conta('cliente', 'et'); const ofi = await conta('oficina', 'ru');
  const { data: of } = await sb.from('oficinas').insert({ profile_id: ofi.id, nome_fantasia: `EXP SHOP ${tag}`, endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '1', pais: 'EE', latitude: 59.43, longitude: 24.75, ativa: true, especialidades: ['mecanica'] }).select('id').single();
  ofId = of.id;
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Microcar', fipe_modelo: 'MC2', fipe_ano: '2008' }).select('id').single();
  const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: `Variaator ei tööta ${tag}`, urgencia: 'media', latitude: 59.43, longitude: 24.75, endereco: 'Tallinn' }).select('id').single();
  solId = s.id;
  const { data: o } = await sb.from('orcamentos').insert({ solicitacao_id: solId, oficina_id: ofId, valor_total: 180, prazo_dias: 1, status: 'enviado', validade: '2030-01-01' }).select('id').single();
  const d1 = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_checkin: d1, turno: 'manha', data_previsao_entrega: d1 });
  await sb.from('solicitacoes').update({ status: 'expirada', expirada_em: new Date().toISOString() }).eq('id', solId);

  // 1) cliente, celular e computador
  for (const largura of [390, 1280]) {
    const ctx = await contexto(largura); const p = await entrar(ctx, cli.email, cli.senha, 'ee/et');
    await p.goto(`${SITE}/ee/et/cliente/orcamentos/${solId}`, { waitUntil: 'networkidle' });
    await p.locator('[data-testid="pedido-expirado"]').waitFor({ timeout: 15000 }).catch(() => {});
    ok(`1 cliente ${largura}px: aviso de pedido expirado`, await p.locator('[data-testid="pedido-expirado"]').isVisible());
    ok(`1 cliente ${largura}px: orcamento continua visivel`, /180/.test(await p.innerText('body')));
    ok(`1 cliente ${largura}px: sem "aceitar" com pedido expirado`, (await aceitar(p, ET).count()) === 0);
    ok(`1 cliente ${largura}px: sem "recusar" com pedido expirado`, (await recusar(p, ET).count()) === 0);
    ok(`1 cliente ${largura}px: sem rolagem lateral`, await semRolagem(p));
    await p.screenshot({ path: `expirado-cliente-${largura}.png`, fullPage: true });
    if (largura === 1280) {
      await p.click('[data-testid="reabrir-pedido"]');
      await aceitar(p, ET).first().waitFor({ timeout: 15000 }).catch(() => {});
      const st = (await sb.from('solicitacoes').select('status').eq('id', solId).single()).data?.status;
      ok('2 cliente reabre: pedido volta a em_orcamento', st === 'em_orcamento', st);
      ok('2 depois de reabrir: aviso some', !(await p.locator('[data-testid="pedido-expirado"]').isVisible()));
      ok('2 depois de reabrir: "aceitar" e "recusar" voltam', (await aceitar(p, ET).count()) >= 1 && (await recusar(p, ET).count()) >= 1);
    }
    await ctx.close();
  }

  // 3) oficina (ru): expirado de novo -> nao muda o orcamento; reaberto -> muda
  await sb.from('solicitacoes').update({ status: 'expirada', expirada_em: new Date().toISOString() }).eq('id', solId);
  const ctxO = await contexto(390); const pO = await entrar(ctxO, ofi.email, ofi.senha, 'ee/ru');
  await pO.goto(`${SITE}/ee/ru/oficina/pedidos/${solId}`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(2500);
  ok('3 oficina: pagina do pedido sem "Изменить смету"', (await pO.getByRole('link', { name: RU.oficinaSolicitacaoDetalhe.modificarOrcamento }).count()) === 0);
  ok('3 oficina: pagina do pedido sem link para o formulario', (await pO.locator(`a[href*="/oficina/orcamento/${solId}"]`).count()) === 0);
  await pO.goto(`${SITE}/ee/ru/oficina/orcamento/${solId}`, { waitUntil: 'networkidle' });
  await pO.locator('[data-testid="orcamento-encerrado"]').waitFor({ timeout: 15000 }).catch(() => {});
  const aviso = await pO.locator('[data-testid="orcamento-encerrado"]').innerText().catch(() => '');
  ok('3 oficina: formulario trocado pelo aviso de expirado (ru)', aviso.includes(RU.oficinaEnviarOrcamento.orcamentoFechadoExpirado.slice(0, 30)), aviso);
  ok('3 oficina: sem chave crua no aviso', !/oficinaEnviarOrcamento|orcamentoFechado/.test(aviso));
  ok('3 oficina: sem rolagem lateral', await semRolagem(pO));
  await pO.screenshot({ path: 'expirado-oficina-390.png', fullPage: true });
  await sb.from('solicitacoes').update({ status: 'em_orcamento', expirada_em: null, reaberta_em: new Date().toISOString() }).eq('id', solId);
  await pO.goto(`${SITE}/ee/ru/oficina/orcamento/${solId}`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(3000);
  ok('4 reaberto: oficina volta a ver o formulario', (await pO.locator('[data-testid="orcamento-encerrado"]').count()) === 0 && (await pO.locator('input, textarea').count()) > 2);
  await ctxO.close();
  ok('sem erros de JavaScript', erros.length === 0, erros.join(' | '));
} catch (e) { ok('parou', false, e.message); } finally {
  await browser.close();
  if (solId) {
    const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', solId);
    for (const o of orcs || []) { await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await sb.from('agenda').delete().eq('orcamento_id', o.id); }
    for (const t of ['mensagens', 'agenda', 'orcamentos', 'notificacoes_pedido', 'pedido_vistos']) await sb.from(t).delete().eq('solicitacao_id', solId);
    await sb.from('solicitacoes').delete().eq('id', solId);
  }
  if (ofId) { await sb.from('agenda').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { for (const [t, c] of [['veiculos', 'profile_id'], ['notificacoes', 'profile_id']]) await sb.from(t).delete().eq(c, id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
