// APP (versao web do mesmo codigo, tela de celular) - atualizacao de 05/11:
//  1 chat: mensagem da oficina (russo) aparece na lingua do motorista (et) com
//    "Automaatselt tõlgitud · vaata originaali"; tocar mostra o original; a propria nao traduz
//  2 itens do orcamento traduzidos (ru -> et) com um aviso
//  3 aviso de mensagem nova no Inicio com o texto traduzido
//  4 pedido expirado: aparece no Inicio como "aegunud"; na tela do pedido aviso +
//    "Ava päring uuesti" e SEM "Vali see töökoda"; reabrir volta o aceite
//  5 campo de endereco do pedido novo com texto de ajuda
// Usa DeepL de verdade (chave do site local). Pre-requisito: app web em :8090.
//   node app-traducao-expirado.mjs <.env.local>
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
const APP = 'http://localhost:8090';
const MOB = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/site/apps/mobile/i18n/locales';
const txt = (loc) => { const j = JSON.parse(fs.readFileSync(`${MOB}/${loc}.json`, 'utf8')); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], j) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
const ET = txt('et');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; let ofId; const sols = [];
const MSG_RU = `Да, масло 5W-30. Ждём вас в пятницу утром (${tag}).`;
const ITEM_RU = 'Замена масла и масляного фильтра';

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const erros = [];
const esperar = async (fn, ms = 15000) => { const fim = Date.now() + ms; while (Date.now() < fim) { const r = await fn(); if (r) return r; await new Promise((r) => setTimeout(r, 500)); } return null; };
try {
  // ---------- dados
  const email = `app-tr-${tag}@example.test`; const senha = `App${tag}Senha9`;
  const { data: u } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(u.user.id);
  await sb.from('profiles').insert({ id: u.user.id, tipo: 'cliente', nome: 'Teste Traducao App', email, idioma: 'et' });
  const { data: uo } = await sb.auth.admin.createUser({ email: `app-tr-of-${tag}@example.test`, password: senha, email_confirm: true });
  contas.push(uo.user.id);
  await sb.from('profiles').insert({ id: uo.user.id, tipo: 'oficina', nome: 'Oficina RU', email: `app-tr-of-${tag}@example.test`, idioma: 'ru' });
  const { data: of } = await sb.from('oficinas').insert({ profile_id: uo.user.id, nome_fantasia: `Автосервис ${tag}`, endereco: 'x', cidade: 'Tallinn', estado: '-', cep: '1', pais: 'EE', latitude: 59.45, longitude: 24.74, ativa: true }).select('id').single();
  ofId = of.id;
  const { data: v } = await sb.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: 'Microcar', fipe_modelo: 'MC2', fipe_ano: '2008' }).select('id').single();
  const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: u.user.id, veiculo_id: v.id, tipo: 'revisao', descricao: `Õlivahetus ${tag}`, urgencia: 'media', latitude: 59.44, longitude: 24.74, endereco: 'Tallinn', status: 'em_orcamento' }).select('id').single();
  sols.push(s.id);
  const { data: o } = await sb.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: ofId, valor_total: 95, prazo_dias: 1, status: 'enviado', validade: '2030-01-01' }).select('id').single();
  await sb.from('orcamento_itens').insert({ orcamento_id: o.id, tipo: 'mao_de_obra', descricao: ITEM_RU, quantidade: 1, valor_unitario: 95, valor_total: 95 });
  const d1 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_checkin: d1, turno: 'manha', data_previsao_entrega: d1 });
  await sb.from('mensagens').insert({ solicitacao_id: s.id, remetente_id: uo.user.id, oficina_id: ofId, texto: MSG_RU });
  await sb.from('notificacoes').insert({ profile_id: u.user.id, tipo: 'nova_mensagem', titulo: 'Uus sõnum', mensagem: MSG_RU, lida: false, dados: { solicitacao_id: s.id, oficina_id: ofId } });

  // ---------- entrar (celular em estoniano)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'et-EE' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erros.push(String(e.message)));
  await page.goto(APP, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await page.getByLabel(ET('auth.email'), { exact: true }).locator('visible=true').first().fill(email);
  await page.getByLabel(ET('auth.senha'), { exact: true }).locator('visible=true').first().fill(senha);
  await page.getByText(ET('auth.entrar'), { exact: true }).locator('visible=true').last().click();
  await page.waitForTimeout(4000);

  // 3 aviso no Inicio traduzido
  const inicio = await esperar(async () => { const t = await page.innerText('body'); return t.includes(tag) && !t.includes('Ждём') ? t : null; });
  ok('3 aviso de mensagem no Inicio traduzido (sem o russo)', !!inicio, (await page.innerText('body')).slice(0, 300));

  // 1 chat
  await page.goto(`${APP}/conversa/${s.id}?oficina=${ofId}`, { waitUntil: 'networkidle' });
  const chat = await esperar(async () => { const t = await page.innerText('body'); return t.includes(ET('traducao.traduzido')) ? t : null; });
  ok('1 chat: mensagem da oficina traduzida com o aviso', !!chat && !chat.includes('Ждём'), (await page.innerText('body')).slice(0, 300));
  ok('1 chat: o original nao aparece junto (so a traducao)', !!chat && !chat.includes(MSG_RU));
  await page.getByText(ET('traducao.verOriginal')).first().click(); await page.waitForTimeout(500);
  ok('1 chat: "vaata originaali" mostra o russo', (await page.innerText('body')).includes(MSG_RU));
  await page.getByText(ET('traducao.verTraducao')).first().click(); await page.waitForTimeout(500);
  ok('1 chat: "vaata tõlget" volta a traducao', !(await page.innerText('body')).includes(MSG_RU));
  // propria mensagem nao traduz
  await page.locator('textarea, input[placeholder]').last().fill(`Aitäh, näeme reedel ${tag}`);
  await page.getByRole('button', { name: ET('mensagens.enviar'), exact: true }).last().click(); await page.waitForTimeout(2500);
  const comMinha = await page.innerText('body');
  ok('1 chat: a propria mensagem fica como escrita', comMinha.includes(`Aitäh, näeme reedel ${tag}`));
  ok('1 chat: so um aviso de traducao (a propria nao tem)', (comMinha.match(new RegExp(ET('traducao.traduzido'), 'g')) || []).length === 1, comMinha.slice(-300));

  // 2 itens do orcamento
  await page.goto(`${APP}/solicitacao/${s.id}`, { waitUntil: 'networkidle' });
  const tela = await esperar(async () => { const t = await page.innerText('body'); return t.includes(ET('traducao.traduzido')) ? t : null; });
  ok('2 itens do orcamento traduzidos (sem o russo) com aviso', !!tela && !tela.includes(ITEM_RU), (await page.innerText('body')).slice(0, 400));
  ok('2 aceite disponivel com o pedido aberto', (await page.innerText('body')).includes(ET('orcamentos.aceitar')));
  await page.screenshot({ path: 'app-itens-traduzidos.png', fullPage: true });

  // 4 expirado
  await sb.from('solicitacoes').update({ status: 'expirada', expirada_em: new Date().toISOString() }).eq('id', s.id);
  await page.goto(`${APP}/solicitacao/${s.id}`, { waitUntil: 'networkidle' });
  await esperar(async () => (await page.locator('[data-testid="pedido-expirado"]').count()) > 0);
  const exp = await page.innerText('body');
  ok('4 tela do pedido: situacao expirado + botao reabrir', exp.includes(ET('situacao.titulo_expirado')) && exp.includes(ET('pedidoExpirado.reabrir')), exp.slice(0, 300));
  ok('4 sem o aviso repetido (titulo do expirado uma vez so)', (exp.match(new RegExp(ET('situacao.titulo_expirado'), 'g')) || []).length === 1 && !exp.includes(ET('pedidoExpirado.titulo')));
  ok('4 texto com 30 dias e sem chave crua', exp.includes('30 päeva') && !/\{dias\}|pedidoExpirado\./.test(exp));
  ok('4 sem "Vali see töökoda" com o pedido expirado', !exp.includes(ET('orcamentos.aceitar')));
  ok('4 orcamento continua visivel', exp.includes('95'));
  await page.screenshot({ path: 'app-expirado.png', fullPage: true });
  await page.goto(APP, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  const ini = await page.innerText('body');
  ok('4 Inicio mostra o pedido como aegunud (nao "tühistatud")', ini.includes(ET('situacao.titulo_expirado')) && !ini.includes(ET('situacao.titulo_cancelado')), ini.slice(0, 300));
  await page.goto(`${APP}/solicitacao/${s.id}`, { waitUntil: 'networkidle' });
  await esperar(async () => (await page.locator('[data-testid="reabrir-pedido"]').count()) > 0);
  await page.locator('[data-testid="reabrir-pedido"]').click();
  await esperar(async () => (await page.innerText('body')).includes(ET('orcamentos.aceitar')));
  const st = (await sb.from('solicitacoes').select('status').eq('id', s.id).single()).data?.status;
  ok('4 reabrir pelo app: volta a em_orcamento', st === 'em_orcamento', st);
  const depois = await page.innerText('body');
  ok('4 depois de reabrir: aviso some e o aceite volta', !depois.includes(ET('situacao.titulo_expirado')) && depois.includes(ET('orcamentos.aceitar')));

  // 5 endereco com ajuda
  await page.goto(`${APP}/nova-solicitacao`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  ok('5 campo de endereco com texto de ajuda', (await page.locator(`input[placeholder="${ET('novaSolicitacao.enderecoPlaceholder')}"]`).count()) === 1);

  // conta segue o idioma escolhido no app (antes so no login)
  ok('idioma da conta = et', (await sb.from('profiles').select('idioma').eq('id', u.user.id).single()).data?.idioma === 'et');
  ok('sem erros de JavaScript', erros.length === 0, erros.join(' | '));
  await ctx.close();
} catch (e) { ok('parou', false, e.message); } finally {
  await browser.close();
  for (const s of sols) {
    const { data: o } = await sb.from('orcamentos').select('id').eq('solicitacao_id', s);
    for (const x of o || []) { await sb.from('orcamento_itens').delete().eq('orcamento_id', x.id); await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', x.id); await sb.from('agenda').delete().eq('orcamento_id', x.id); }
    for (const t of ['orcamentos', 'mensagens', 'agenda']) await sb.from(t).delete().eq('solicitacao_id', s);
    await sb.from('solicitacoes').delete().eq('id', s);
  }
  if (ofId) await sb.from('oficinas').delete().eq('id', ofId);
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
