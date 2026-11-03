// Retorno do dono 03/11 com a primeira oficina real:
//  1 comissao escondida da oficina: /oficina/comissao manda para Pedidos;
//    Pecas nao mostra mais "minha comissao como fornecedora"
//  2 pedido "outro" aparece para oficina de mecanica/pneu (antes nao aparecia)
//  3 perfil: campo Complemento grava sem desfazer a posicao no mapa e aparece
//    na pagina publica; numero aceita "6a"
//   node site-oficina-nova.mjs <.env.local> [SITE]
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
const RU = tr('ru');
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; let ofId; const sols = [];

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const ctxNovo = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} }); return c; };
const entrar = async (ctx, u, pre = '/ee/ru') => { const p = await ctx.newPage(); await p.goto(`${SITE}${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]'); await p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(2500); return p; };
const conta = async (tipo, nome, idioma = 'ru') => {
  const email = `nova-${tipo}${contas.length}-${tag}@example.test`; const senha = `Nv${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone: '+372 5000 0000' });
  return { id: data.user.id, email, senha };
};

try {
  const dono = await conta('oficina', 'Dono Nova');
  const { data: of, error: eOf } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `NOVA ${tag}`, endereco: 'Kesktee tn., HOOLDUSKESKUS', numero: 'HOOLDUSKESKUS', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: 59.43477, longitude: 24.83606, ativa: true, raio_atendimento_km: 30, especialidades: ['revisao', 'mecanica', 'pneu', 'eletrica'], seguradoras_convencionadas: [] }).select('id').single();
  if (eOf) throw new Error(eOf.message);
  ofId = of.id;
  const cli = await conta('cliente', 'Klient Nova', 'et');
  const pedido = async (placa, tipo) => {
    const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: `M${placa}`, fipe_ano: '2016', placa }).select('id').single();
    const { data, error } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo, descricao: `teste ${placa}`, urgencia: 'media', status: 'aberta', latitude: 59.437, longitude: 24.75, endereco: 'Kesklinn', pais: 'EE' }).select('id').single();
    if (error) throw new Error(error.message);
    sols.push(data.id); return data.id;
  };
  const P = (n) => `N${n}${tag.slice(0, 3)}`.toUpperCase();
  const sOutro = await pedido(P(1), 'outro');
  const sPintura = await pedido(P(2), 'pintura');

  // ---------- 2 "outro" para todas (regra do banco, com a sessao da oficina)
  const sbOf = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  await sbOf.auth.signInWithPassword({ email: dono.email, password: dono.senha });
  const { data: vistos } = await sbOf.from('solicitacoes').select('id').in('id', [sOutro, sPintura]);
  const ids = (vistos || []).map((x) => x.id);
  ok('2 banco: oficina de mecanica ve pedido "outro"', ids.includes(sOutro), JSON.stringify(ids));
  ok('2 banco: e continua sem ver pedido de pintura', !ids.includes(sPintura), JSON.stringify(ids));

  const ctx = await ctxNovo(); const p = await entrar(ctx, dono);
  await p.goto(`${SITE}/ee/ru/oficina/pedidos`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  const cartoes = (await p.getByTestId('pedido-cartao').allInnerTexts()).join(' | ');
  ok('2 tela: pedido "outro" na lista de Pedidos', cartoes.includes(`M${P(1)}`), cartoes.slice(0, 200));
  ok('2 tela: pedido de pintura fora da lista', !cartoes.includes(`M${P(2)}`));

  // ---------- 1 comissao escondida
  await p.goto(`${SITE}/ee/ru/oficina/comissao`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  ok('1 /oficina/comissao leva para Pedidos', p.url().includes('/oficina/pedidos'), p.url());
  await p.goto(`${SITE}/ee/ru/oficina/pecas`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  const pecas = await p.locator('main').innerText().catch(() => '');
  ok('1 Pecas sem "minha comissao como fornecedora"', !pecas.includes(RU('oficinaPecas.verMinhaComissao')) && !pecas.includes('Моя комиссия'), pecas.slice(0, 120));
  const menu = await p.locator('nav').first().innerText().catch(() => '');
  ok('1 menu sem comissao', !/комисси/i.test(menu), menu.slice(0, 200));

  // ---------- 3 complemento
  await p.goto(`${SITE}/ee/ru/oficina/perfil`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  const comp = p.locator('#oficina-end-complemento');
  ok('3 campo Complemento no perfil (russo)', await comp.isVisible().catch(() => false));
  const rotulo = await p.locator('label[for=oficina-end-complemento]').innerText().catch(() => '');
  ok('3 rotulo traduzido', rotulo === RU('enderecoEstruturado.complemento'), rotulo);
  await p.fill('#oficina-end-numero', '6a');
  await p.locator('#oficina-end-numero').blur();
  await p.waitForTimeout(4000);
  await comp.fill('HOOLDUSKESKUS TEST');
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: RU('oficinaPerfil.salvarAlteracoes') }).click();
  let o;
  for (let i = 0; i < 20; i++) { await p.waitForTimeout(750); ({ data: o } = await sb.from('oficinas').select('endereco, numero, complemento, latitude').eq('id', ofId).single()); if (o.complemento) break; }
  ok('3 grava numero "6a" e complemento', o.numero === '6a' && o.endereco === 'Kesktee tn., 6a' && o.complemento === 'HOOLDUSKESKUS TEST', JSON.stringify(o));
  ok('3 posicao no mapa continua gravada', o.latitude != null, JSON.stringify(o));
  // so o complemento mudando nao apaga a posicao
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  ok('3 perfil reabre com o complemento', (await comp.inputValue().catch(() => '')) === 'HOOLDUSKESKUS TEST');
  await comp.fill('HOOLDUSKESKUS TEST, 2 этаж');
  await p.getByRole('button', { name: RU('oficinaPerfil.salvarAlteracoes') }).click();
  for (let i = 0; i < 20; i++) { await p.waitForTimeout(750); ({ data: o } = await sb.from('oficinas').select('complemento, latitude').eq('id', ofId).single()); if (o.complemento?.includes('этаж')) break; }
  ok('3 mudar so o complemento nao apaga a posicao', o.complemento?.includes('этаж') && o.latitude != null, JSON.stringify(o));
  const pub = await ctx.newPage();
  await pub.goto(`${SITE}/ee/ru/avtoservisy/${ofId}`, { waitUntil: 'networkidle' }); await pub.waitForTimeout(1500);
  const txt = await pub.locator('body').innerText();
  ok('3 pagina publica mostra endereco e complemento', txt.includes('Kesktee tn., 6a') && txt.includes('HOOLDUSKESKUS TEST, 2 этаж'), txt.slice(0, 200));
} catch (e) {
  falhas++; console.log('ERRO', e.message);
} finally {
  await browser.close();
  for (const s of sols) { await sb.from('pedido_vistos').delete().eq('solicitacao_id', s); await sb.from('solicitacoes').delete().eq('id', s); }
  if (ofId) { await sb.from('comissao_config').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
