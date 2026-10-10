// Pecas: pontos do teste do dono (10/10), em producao, pela tela:
//  1 oficina vendedora: comissao de pecas mostra 0% (plataforma isenta), nao 3%
//  2 pedido novo de oficina vizinha aparece SEM recarregar (tempo real, 059)
//  3 "tirar duvida" e voltar: continua na aba Vender (aba no endereco)
//  4 quem pediu edita e cancela o pedido; cancelado some para a vendedora
//   node site-pecas-ux.mjs <.env.local> [SITE]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const SITE = process.argv[3] || 'https://bipfix.com';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const MSG = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/messages';
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8'))));
const tr = (l) => { const m = msgs(l); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
const ET = tr('et');
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 200) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const ofs = [];
const conta = async (nome) => {
  const email = `pux-${contas.length}-${tag}@example.test`; const senha = `Px${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo: 'oficina', nome, email, idioma: 'et' });
  return { id: data.user.id, email, senha };
};
const oficina = async (u, nome, lat, lon, vende) => {
  const { data } = await sb.from('oficinas').insert({ profile_id: u.id, nome_fantasia: nome, endereco: 'x', cidade: 'Tallinn', estado: 'Harju', cep: '1', pais: 'EE', latitude: lat, longitude: lon, ativa: true, vende_pecas: vende, raio_atendimento_km: 30, seguradoras_convencionadas: [] }).select('id').single();
  ofs.push(data.id); return data.id;
};
const b = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const entrar = async (u) => { const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); const p = await c.newPage(); await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]'); await p.waitForTimeout(4500); return p; };
try {
  const uA = await conta('Ostja Töökoda'); const ofA = await oficina(uA, `OSTJA ${tag}`, 59.43, 24.75, false);
  const uB = await conta('Müüja Töökoda'); await oficina(uB, `MÜÜJA ${tag}`, 59.44, 24.76, true);

  // 1 comissao 0%
  const pB = await entrar(uB);
  await pB.goto(`${SITE}/ee/et/oficina/pecas?aba=vender`, { waitUntil: 'networkidle' }); await pB.waitForTimeout(2500);
  ok('3a endereco ?aba=vender abre na aba Vender', (await pB.innerText('body')).includes(ET('oficinaPecas.venderPecasExcedentes')));
  await pB.getByText(ET('oficinaPecas.verMinhaComissao')).click(); await pB.waitForTimeout(2500);
  const tCom = await pB.innerText('body');
  ok('1 comissao de pecas 0% (plataforma isenta), nao 3%', /0[.,]0\s?%/.test(tCom) && !/3[.,]0\s?%/.test(tCom), tCom.match(/\d+[.,]\d\s?%/g)?.join(' '));

  // 2 tempo real
  const desc = `Generaator ${tag}`;
  const { data: cot } = await sb.from('cotacoes_pecas').insert({ oficina_id: ofA, peca_descricao: desc, quantidade: 1, status: 'aberta', fotos: [] }).select('id').single();
  await pB.waitForTimeout(6000);
  ok('2 pedido da oficina vizinha aparece sem recarregar', (await pB.innerText('body')).includes(desc));

  // 3 tirar duvida e voltar
  await pB.locator('div.card').filter({ hasText: desc }).getByRole('link', { name: ET('oficinaPecas.tirarDuvida') }).click(); await pB.waitForTimeout(2500);
  ok('3 abriu a conversa com a oficina', pB.url().includes('/oficina/pecas/conversa'), pB.url());
  await pB.goBack({ waitUntil: 'networkidle' }); await pB.waitForTimeout(2500);
  const tVolta = await pB.innerText('body');
  ok('3 voltou para a aba Vender (nao Comprar)', pB.url().includes('aba=vender') && tVolta.includes(desc), pB.url());

  // 4 editar e cancelar
  const pA = await entrar(uA);
  await pA.goto(`${SITE}/ee/et/oficina/pecas`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(2500);
  const card = pA.locator('div.card').filter({ hasText: desc });
  await card.getByRole('button', { name: ET('oficinaPecas.editarPedido') }).click();
  await card.locator('input.input-field').first().fill(`${desc} 140A`);
  await card.getByRole('button', { name: ET('oficinaPecas.salvarPedido') }).click(); await pA.waitForTimeout(2500);
  let { data: c1 } = await sb.from('cotacoes_pecas').select('peca_descricao, status').eq('id', cot.id).single();
  ok('4 editou o pedido', c1.peca_descricao === `${desc} 140A`, JSON.stringify(c1));
  await pB.waitForTimeout(3000);
  ok('4 vendedora ve a edicao sem recarregar', (await pB.innerText('body')).includes(`${desc} 140A`));
  const card2 = pA.locator('div.card').filter({ hasText: `${desc} 140A` });
  await card2.getByRole('button', { name: ET('oficinaPecas.cancelarPedido') }).click();
  ok('4 cancelar pede confirmacao', (await card2.innerText()).includes(ET('oficinaPecas.confirmarCancelarPedido')));
  await card2.getByRole('button', { name: ET('oficinaPecas.simCancelar') }).click(); await pA.waitForTimeout(2500);
  ({ data: c1 } = await sb.from('cotacoes_pecas').select('status').eq('id', cot.id).single());
  ok('4 pedido cancelado', c1.status === 'cancelada', c1.status);
  await pB.waitForTimeout(4000);
  ok('4 cancelado some para a vendedora (sem recarregar)', !(await pB.innerText('body')).includes(desc));
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 700)); }
finally {
  await b.close();
  for (const o of ofs) { const { data: cs } = await sb.from('cotacoes_pecas').select('id').eq('oficina_id', o); for (const c of cs || []) { await sb.from('cotacoes_pecas_mensagens').delete().eq('cotacao_id', c.id); await sb.from('cotacoes_pecas_respostas').delete().eq('cotacao_id', c.id); } await sb.from('cotacoes_pecas').delete().eq('oficina_id', o); await sb.from('comissao_pecas_config').delete().eq('fornecedor_id', o); await sb.from('comissao_config').delete().eq('oficina_id', o); await sb.from('oficinas').delete().eq('id', o); }
  for (const id of contas) { await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
