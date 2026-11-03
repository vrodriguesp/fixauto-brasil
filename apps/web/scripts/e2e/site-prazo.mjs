// Prazo do conserto claro (dono 03/11: 1o orcamento real saiu com "30 dias"
// para 2 h de trabalho - era a validade lida pela IA no campo do prazo):
//  1 formulario da oficina, 6 linguas x celular/tablet/computador: rotulo novo,
//    frase de ajuda, sem rolagem lateral, rotulo nao estoura a coluna
//  2 aviso amarelo com 30 dias e 2 h; some com 2 dias
//  3 cliente (6 linguas, celular): "Prazo do conserto: N dias" no orcamento
//   node site-prazo.mjs <.env.local> [SITE]
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
const SHOTS = process.argv[4] || '';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const MSG = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/messages';
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8'))));
const tr = (l) => { const m = msgs(l); return (k) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`); };
const PREFIXO = { pt: '/br/pt', 'pt-PT': '/pt/pt', en: '/ee/en', et: '/ee/et', it: '/it/it', ru: '/ee/ru' };
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; let ofId; const sols = [];
const TELAS = { celular: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true }, tablet: { viewport: { width: 768, height: 1024 } }, pc: { viewport: { width: 1366, height: 900 } } };

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const ctxNovo = async (tela) => { const c = await browser.newContext(TELAS[tela]); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} }); await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } })); return c; };
const entrar = async (ctx, u) => { const p = await ctx.newPage(); await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]'); await p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(2000); return p; };
const conta = async (tipo, nome) => {
  const email = `prazo-${tipo}${contas.length}-${tag}@example.test`; const senha = `Pz${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma: 'et', telefone: '+372 5000 0000' });
  return { id: data.user.id, email, senha };
};
const semRolagem = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

try {
  const dono = await conta('oficina', 'Dono Prazo');
  const { data: of, error: eOf } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `PRAZO ${tag}`, endereco: 'Kesktee 1', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: 59.437, longitude: 24.75, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica'], seguradoras_convencionadas: [] }).select('id').single();
  if (eOf) throw new Error(eOf.message);
  ofId = of.id;
  const cli = await conta('cliente', 'Klient Prazo');
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: `Octavia ${tag}`, fipe_ano: '2015', placa: `P${tag}`.toUpperCase() }).select('id').single();
  const { data: sol } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: `teste prazo ${tag}`, urgencia: 'media', status: 'aberta', latitude: 59.44, longitude: 24.76, endereco: 'Kesklinn', pais: 'EE' }).select('id').single();
  sols.push(sol.id);

  // ---------- 1/2 formulario da oficina
  for (const tela of Object.keys(TELAS)) {
    const ctx = await ctxNovo(tela); const p = await entrar(ctx, dono);
    for (const [l, pre] of Object.entries(PREFIXO)) {
      const T = tr(l);
      await p.goto(`${SITE}${pre}/oficina/orcamento/${sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
      const rot = (await p.locator('label[for=cacb1-101]').innerText().catch(() => '')).trim();
      const ajuda = (await p.locator('#cacb1-101-ajuda').innerText().catch(() => '')).trim();
      ok(`${tela} ${l}: rotulo "${T('oficinaEnviarOrcamento.prazoTotalDias')}" + ajuda`, rot === T('oficinaEnviarOrcamento.prazoTotalDias') && ajuda === T('oficinaEnviarOrcamento.prazoTotalDiasAjuda'), `${rot} | ${ajuda}`);
      ok(`${tela} ${l}: sem rolagem lateral`, await semRolagem(p));
      // o rotulo cabe na coluna (nao passa por cima do campo vizinho)
      const caixas = await p.evaluate(() => ['cacb1-101', 'cacb1-102'].map((id) => { const l = document.querySelector(`label[for=${id}]`); const i = document.getElementById(id); const a = l?.getBoundingClientRect(), b = i?.getBoundingClientRect(); return a && b ? { lr: a.right, ir: b.right, lw: l.scrollWidth, cw: l.clientWidth } : null; }));
      ok(`${tela} ${l}: rotulos dentro da coluna`, caixas.every((c) => c && c.lr <= c.ir + 1 && c.lw <= c.cw + 1), JSON.stringify(caixas));
      if (l === 'ru' || (tela === 'celular' && l === 'et')) {
        await p.fill('#cacb1-101', '30'); await p.fill('#cacb1-102', '2'); await p.locator('#cacb1-102').blur(); await p.waitForTimeout(400);
        const aviso = await p.getByTestId('aviso-prazo-longo').innerText().catch(() => '');
        ok(`${tela} ${l}: aviso com 30 dias / 2 h`, aviso.includes('30') && aviso.includes('2'), aviso);
        ok(`${tela} ${l}: com o aviso, sem rolagem lateral`, await semRolagem(p));
        if (SHOTS && l === 'ru') await p.locator('#cacb1-101').scrollIntoViewIfNeeded().then(() => p.screenshot({ path: `${SHOTS}/prazo-${tela}-ru.png` }));
        await p.fill('#cacb1-101', '2'); await p.locator('#cacb1-101').blur(); await p.waitForTimeout(400);
        ok(`${tela} ${l}: aviso some com 2 dias`, !(await p.getByTestId('aviso-prazo-longo').isVisible().catch(() => false)));
      }
    }
    await ctx.close();
  }

  // ---------- 3 cliente
  await sb.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: ofId, status: 'enviado', valor_total: 173.05, prazo_dias: 2, validade: '2030-01-01' });
  await sb.from('solicitacoes').update({ status: 'em_orcamento' }).eq('id', sol.id);
  const ctxC = await ctxNovo('celular'); const pC = await entrar(ctxC, cli);
  for (const [l, pre] of Object.entries(PREFIXO)) {
    const T = tr(l);
    await pC.goto(`${SITE}${pre}/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(1500);
    const txt = await pC.locator('body').innerText();
    const prefixo = T('clienteOrcamentoDetalhe.deadlineDays').split('{')[0].trim();
    ok(`cliente ${l}: "${prefixo} ..."`, txt.includes(prefixo), txt.slice(0, 200));
    ok(`cliente ${l}: sem rolagem lateral`, await semRolagem(pC));
    if (SHOTS && l === 'et') await pC.getByText(prefixo).first().scrollIntoViewIfNeeded().then(() => pC.screenshot({ path: `${SHOTS}/prazo-cliente-et.png` }));
  }
} catch (e) {
  falhas++; console.log('ERRO', e.message);
} finally {
  await browser.close();
  for (const s of sols) { await sb.from('orcamentos').delete().eq('solicitacao_id', s); await sb.from('pedido_vistos').delete().eq('solicitacao_id', s); await sb.from('solicitacoes').delete().eq('id', s); }
  if (ofId) { await sb.from('comissao_config').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
