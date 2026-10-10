// Parte educativa (producao), nos 6 idiomas:
//  1 Guia da Oficina e Guia do Motorista: secoes novas (postos/visao Hora,
//    monitoramento, capacidade; garantia abre o pedido), sem "vidros", sem chave crua
//  2 Aprender (oficina): modulo do Quadro novo, passos da visao Hora e do perfil
//  3 Aprender (loja): regra das cotacoes do mesmo pais
//  4 menu "Mais" no computador tem o Check-in manual (o tutorial manda ir la)
//   node site-educacao.mjs <.env.local> [SITE]
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
const PREFIXO = { pt: '/br/pt', 'pt-PT': '/pt/pt', en: '/ee/en', et: '/ee/et', it: '/it/it', ru: '/ee/ru' };
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 200) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const extras = [];
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const contem = (txt, s) => norm(txt).includes(norm(s).slice(0, 60));
const cru = (t) => /\b(oficinaAprender|lojaAprender|docsOficina|docsCliente|nav)\.|\?\?/.test(t);

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const conta = async (tipo, idioma) => {
  const email = `edu-${tipo}-${tag}@example.test`; const senha = `Ed${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `Teste Edu ${tipo}`, email, idioma });
  const base = { profile_id: data.user.id, nome_fantasia: `EDU ${tag}`, endereco: 'Tööstuse 5', cidade: 'Tallinn', estado: 'Harju', cep: '10416', ativa: true };
  if (tipo === 'oficina') { const { data: o } = await sb.from('oficinas').insert({ ...base, pais: 'EE', latitude: 59.44, longitude: 24.72, raio_atendimento_km: 30, especialidades: ['mecanica'] }).select('id').single(); extras.push(['oficinas', o.id]); }
  if (tipo === 'loja_pecas') { const { data: lj } = await sb.from('lojas_pecas').insert({ ...base, pais: 'EE' }).select('id').single(); extras.push(['lojas_pecas', lj.id]); }
  return { email, senha };
};
const entrar = async (ctx, u) => { const p = await ctx.newPage(); await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]'); await p.waitForTimeout(4500); return p; };

try {
  // ---------- 1 guias (publicos)
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  const p = await ctx.newPage();
  for (const [l, pre] of Object.entries(PREFIXO)) {
    const m = msgs(l);
    await p.goto(`${SITE}${pre}/docs/oficina`, { waitUntil: 'networkidle' });
    const tO = await p.evaluate(() => document.body.textContent || '');
    const itens = m.docsOficina.secoes[4].itens;
    ok(`1 Guia da Oficina ${l}: postos/visao Hora, monitoramento, capacidade`, [itens[4], itens[5], itens[6]].every((i) => contem(tO, i.label) && contem(tO, i.desc)), itens.map((i) => i.label).join(' | '));
    ok(`1 Guia da Oficina ${l}: acidente so para carroceria`, contem(tO, m.docsOficina.secoes[1].texto));
    await p.goto(`${SITE}${pre}/docs/cliente`, { waitUntil: 'networkidle' });
    const tC = await p.evaluate(() => document.body.textContent || '');
    ok(`1 Guia do Motorista ${l}: garantia abre o pedido`, contem(tC, m.docsCliente.secoes[7].itens[0].desc));
    ok(`1 guias ${l}: sem chave crua e sem "vidros" nos servicos`, !cru(tO + tC) && !/vidros e outros|vidros etc|glass and more|klaas ja muu/i.test(tO + tC));
  }

  // ---------- 2 Aprender da oficina + 4 menu Mais
  const of = await conta('oficina', 'et');
  const pO = await entrar(ctx, of);
  for (const [l, pre] of Object.entries(PREFIXO)) {
    const m = msgs(l);
    await sb.from('profiles').update({ idioma: l }).eq('email', of.email);
    await pO.goto(`${SITE}${pre}/oficina/aprender`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(2000);
    const titulo = m.oficinaAprender.geral.distribuicao.titulo;
    await pO.getByText(titulo, { exact: false }).first().click().catch(() => {});
    await pO.waitForTimeout(800);
    const t2 = await pO.evaluate(() => document.body.textContent || '');
    ok(`2 Aprender ${l}: modulo do Quadro novo`, contem(t2, titulo), titulo);
    ok(`2 Aprender ${l}: passo da visao Hora`, contem(t2, m.oficinaAprender.geral.distribuicao.passosGuiados[3]), t2.slice(0, 200));
    ok(`2 Aprender ${l}: sem chave crua`, !cru(t2));
    // 4 menu Mais (computador)
    await pO.getByRole('button', { name: m.nav.mais }).first().click(); await pO.waitForTimeout(400);
    ok(`4 menu Mais ${l}: tem ${m.nav.checkinManual}`, (await pO.getByRole('link', { name: m.nav.checkinManual }).count()) > 0);
    await pO.keyboard.press('Escape');
  }

  // ---------- 3 Aprender da loja
  const lj = await conta('loja_pecas', 'et');
  const ctxL = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const pL = await entrar(ctxL, lj);
  for (const [l, pre] of Object.entries(PREFIXO)) {
    const m = msgs(l);
    await sb.from('profiles').update({ idioma: l }).eq('email', lj.email);
    await pL.goto(`${SITE}${pre}/loja/aprender`, { waitUntil: 'networkidle' }); await pL.waitForTimeout(1500);
    await pL.getByText(m.lojaAprender.modulos.perfil.titulo, { exact: false }).first().click().catch(() => {});
    await pL.waitForTimeout(600);
    const t3 = await pL.evaluate(() => document.body.textContent || '');
    ok(`3 Aprender da loja ${l}: cotacoes do mesmo pais`, contem(t3, m.lojaAprender.modulos.perfil.resumo), t3.slice(0, 200));
  }
  await ctx.close(); await ctxL.close();
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 800)); }
finally {
  await browser.close();
  for (const [t, id] of extras) { await sb.from('comissao_config').delete().eq('oficina_id', id); await sb.from(t).delete().eq('id', id); }
  for (const id of contas) { await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
