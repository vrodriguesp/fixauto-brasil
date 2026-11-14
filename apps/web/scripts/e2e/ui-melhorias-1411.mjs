// E2E LOCAL das melhorias de UI do fluxo do motorista (analise Fable 14/11):
//  #1 orcamento do cliente: "3 h"/"3 ч" (nunca "3h" fixo em et/ru)
//  #3 e-mail ET "novo orcamento" com prazo 1 -> "1 päev" (nao "1 päeva"); EN "1 day";
//     mensagem de chat do sistema "Tähtaeg: 1 päev."; garantia de 1 dia no card
//  #4 aba de baixo = nome da pagina de notificacoes (RU "Уведомления", EN "Notifications"...), cabendo na coluna a 390/360 px
//  #5 pagina publica: media e selo "resposta rapida" so com 3+ orcamentos (dono 14/11); decimal do idioma ("2,5 ч")
//  #6 botao de enviar do chat com o icone novo (Heroicons v2)
//  + sem rolagem lateral a 360 e 390 px nas telas tocadas
//   node ui-melhorias-1411.mjs <.env.local>
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
const SITE = process.env.SITE || 'http://localhost:3100';
const EMAILS = env.EMAIL_PASTA_TESTE;
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/ui-1411';
fs.mkdirSync(OUT, { recursive: true });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PREFIXO = { et: '/ee/et', ru: '/ee/ru', en: '/ee/en', it: '/it/it', 'pt-PT': '/pt/pt', pt: '/br/pt' };
const ICONE_NOVO = 'M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12';
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 240) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; let ofId; const sols = []; const extras = [];
const ip = () => `10.98.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}`;
const emailsDe = (email, depois = 0) => fs.readdirSync(EMAILS).filter((f) => f.endsWith(`_${email}.html`) && Number(f.split('_')[0]) >= depois).sort()
  .map((f) => fs.readFileSync(path.join(EMAILS, f), 'utf8'));
const textoEmail = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const celular = async (largura) => {
  const c = await browser.newContext({ viewport: { width: largura, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const entrar = async (ctx, u) => {
  const p = await ctx.newPage();
  await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]');
  await p.waitForURL((x) => !x.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(2000);
  return p;
};
const conta = async (tipo, nome, idioma, telefone = null) => {
  const email = `ui1411-${tipo}${contas.length}-${tag}@example.test`; const senha = `Ui${tag}Senha9`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone });
  return { id: data.user.id, email, senha };
};
const semRolagem = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

try {
  // ---------- dados: oficina antiga (cadastro ha 10 dias), pedido de 2,5 h atras, orcamento agora
  const dono = await conta('oficina', 'Dono UI', 'et', '+372 5000 0001');
  const { data: of, error: eOf } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `UI1411 ${tag}`, endereco: 'Kesktee 1', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: 59.437, longitude: 24.75, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica'], seguradoras_convencionadas: [] }).select('id').single();
  if (eOf) throw new Error(eOf.message);
  ofId = of.id;
  await sb.from('oficinas').update({ created_at: new Date(Date.now() - 10 * 86400e3).toISOString() }).eq('id', ofId);
  const cli = await conta('cliente', 'Klient UI', 'et');
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: `Octavia ${tag}`, fipe_ano: '2015', placa: `U${tag}`.toUpperCase() }).select('id').single();
  const pedidoEm = new Date(Date.now() - 2.5 * 3600e3).toISOString();
  const { data: sol, error: eSol } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: `teste ui ${tag}`, urgencia: 'media', status: 'em_orcamento', latitude: 59.44, longitude: 24.76, endereco: 'Kesklinn', pais: 'EE', created_at: pedidoEm }).select('id').single();
  if (eSol) throw new Error(eSol.message);
  sols.push(sol.id);
  const { data: orc, error: eOrc } = await sb.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: ofId, status: 'enviado', valor_total: 120, prazo_dias: 1, tempo_execucao_horas: 3, garantia_dias: 1, validade: '2030-01-01' }).select('id, created_at').single();
  if (eOrc) throw new Error(eOrc.message);

  // ---------- #3 e-mail ET (prazo 1) + mensagem de chat do sistema (idioma da oficina: et)
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: lOf } = await anon.auth.signInWithPassword({ email: dono.email, password: dono.senha });
  const notificar = async () => fetch(`${SITE}/api/notificar-orcamento`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lOf.session.access_token}`, 'x-real-ip': ip() }, body: JSON.stringify({ orcamentoId: orc.id }) });
  let t0 = Date.now();
  let r = await notificar();
  ok('notificar-orcamento (ET) 200', r.status === 200, String(r.status));
  await new Promise((s) => setTimeout(s, 1500));
  let html = emailsDe(cli.email, t0).at(-1) || '';
  let txt = textoEmail(html);
  ok('e-mail ET: "Remondi kestus: 1 päev"', /Remondi kestus: 1 päev\b/.test(txt) && !/1 päeva/.test(txt), txt.match(/Remondi kestus:[^<]{0,20}/)?.[0] || txt.slice(0, 200));
  // (a mensagem de chat do sistema "Tähtaeg: 1 päev." so sai no fluxo de acidente - coberta em scripts/teste-plural-dias.ts)
  // EN: mesmo orcamento, cliente em ingles
  await sb.from('profiles').update({ idioma: 'en' }).eq('id', cli.id);
  t0 = Date.now();
  r = await notificar();
  await new Promise((s) => setTimeout(s, 1500));
  txt = textoEmail(emailsDe(cli.email, t0).at(-1) || '');
  ok('e-mail EN: "Repair time: 1 day"', r.status === 200 && /Repair time: 1 day\b(?!s)/.test(txt), `${r.status} ${txt.match(/Repair time:[^<]{0,20}/)?.[0] || txt.slice(0, 200)}`);
  await sb.from('profiles').update({ idioma: 'et' }).eq('id', cli.id);

  // ---------- telas do cliente (360 e 390 px)
  for (const largura of [390, 360]) {
    const ctx = await celular(largura);
    const p = await entrar(ctx, cli);
    const erros = []; p.on('pageerror', (e) => erros.push(e.message));
    // #1 orcamento: "3 h"/"3 ч"/"3h" (en), garantia 1 dia no singular
    const esperado = { et: { h: '3 h', gar: 'Garantii: 1 päev alates' }, ru: { h: '3 ч', gar: 'Гарантия: 1 дн.' }, en: { h: '3h', gar: 'Warranty: 1 day from' } };
    for (const [l, e] of Object.entries(esperado)) {
      await p.goto(`${SITE}${PREFIXO[l]}/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
      const t = await p.innerText('body');
      ok(`${largura} ${l} orcamento: tempo de execucao "${e.h}"`, t.includes(e.h) && (l === 'en' || !/\b3h\b/.test(t)), t.match(/.{0,30}\b3\s?(h|ч)\b.{0,10}/)?.[0] || t.slice(0, 200));
      ok(`${largura} ${l} orcamento: garantia "${e.gar}"`, t.includes(e.gar) && !/1 päeva|1 days\b/.test(t), t.match(/(Garantii|Гарантия|Warranty):[^\n]{0,40}/)?.[0]);
      ok(`${largura} ${l} orcamento: sem rolagem lateral`, await semRolagem(p));
      if (largura === 390 && l !== 'en') await p.screenshot({ path: `${OUT}/orcamento-${l}-${largura}.png`, fullPage: true });
    }
    // #4 aba de baixo: RU "Уведомления"; em todos os idiomas cada rotulo cabe na sua coluna, em uma linha
    for (const l of Object.keys(PREFIXO)) {
      await p.goto(`${SITE}${PREFIXO[l]}/cliente/dashboard`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
      const abas = await p.evaluate(() => [...document.querySelectorAll('nav.barra-inferior a, nav.barra-inferior button')].map((a) => {
        const el = a.querySelector('[data-rotulo]') || a;
        const no = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
        if (!no) return null;
        const rg = document.createRange(); rg.selectNodeContents(no);
        const rt = rg.getBoundingClientRect(); const ra = a.getBoundingClientRect();
        return { texto: no.textContent.trim(), href: a.getAttribute('href') || '', cabe: rt.left >= ra.left - 0.5 && rt.right <= ra.right + 0.5, linhas: rg.getClientRects().length, w: Math.round(rt.width), col: Math.round(ra.width), l: rt.left, r: rt.right };
      }).filter(Boolean));
      const AVISOS = { et: 'Teated', ru: 'Уведомления', en: 'Notifications', it: 'Notifiche', 'pt-PT': 'Notificações', pt: 'Notificações' };
      ok(`${largura} ${l} aba de baixo: "${AVISOS[l]}" (= titulo da pagina de notificacoes)`, abas.some((a) => a.href.endsWith('/cliente/notificacoes') && a.texto === AVISOS[l]), JSON.stringify(abas));
      ok(`${largura} ${l} aba de baixo: 5 rotulos, cada um dentro da coluna e em uma linha`, abas.length === 5 && abas.every((a) => a.cabe && a.linhas === 1), JSON.stringify(abas));
      const vaos = abas.slice(1).map((a, i) => Math.round((a.l - abas[i].r) * 10) / 10);
      ok(`${largura} ${l} aba de baixo: rotulos vizinhos nao encostam (>= 3 px)`, vaos.every((g) => g >= 3), JSON.stringify(vaos));
      ok(`${largura} ${l} inicio: sem rolagem lateral`, await semRolagem(p));
    }
    await p.goto(`${SITE}/ee/ru/cliente/dashboard`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    await p.locator('nav.barra-inferior').screenshot({ path: `${OUT}/aba-ru-${largura}.png` });
    // #6 chat: icone novo no botao de enviar
    await p.goto(`${SITE}/ee/ru/cliente/mensagens/${sol.id}?oficina=${ofId}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
    await p.locator('textarea').last().fill('Здравствуйте');
    const botao = p.getByTestId('conversa-enviar');
    await botao.waitFor({ timeout: 10000 });
    const d = await botao.locator('svg path').getAttribute('d');
    ok(`${largura} ru chat: botao enviar com o icone novo`, d?.startsWith(ICONE_NOVO), d);
    ok(`${largura} ru chat: botao com nome acessivel`, !!(await botao.getAttribute('aria-label')));
    ok(`${largura} ru chat: sem rolagem lateral`, await semRolagem(p));
    await p.screenshot({ path: `${OUT}/chat-ru-${largura}.png` });
    ok(`${largura} cliente: sem erro de JS`, !erros.length, erros.join(' | '));
    await ctx.close();
  }

  // ---------- #5 pagina publica (sem login): amostra minima de 3 orcamentos (dono 14/11) e decimal do idioma.
  // Uma oficina por cenario: a pagina tem revalidate = 60 (cache), entao cada uma e aberta so depois dos dados prontos.
  const oficinaCom = async (nome, horas) => {
    const d = await conta('oficina', `Dono ${nome}`, 'et');
    const { data: o, error } = await sb.from('oficinas').insert({ profile_id: d.id, nome_fantasia: `${nome} ${tag}`, endereco: 'Kesktee 2', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: 59.437, longitude: 24.75, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica'], seguradoras_convencionadas: [] }).select('id').single();
    if (error) throw new Error(error.message);
    extras.push(o.id);
    await sb.from('oficinas').update({ created_at: new Date(Date.now() - 10 * 86400e3).toISOString() }).eq('id', o.id);
    for (const h of horas) {
      const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: `teste ui ${nome} ${tag}`, urgencia: 'media', status: 'em_orcamento', latitude: 59.44, longitude: 24.76, endereco: 'Kesklinn', pais: 'EE', created_at: new Date(Date.now() - h * 3600e3).toISOString() }).select('id').single();
      sols.push(s.id);
      await sb.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: o.id, status: 'enviado', valor_total: 50, prazo_dias: 2, validade: '2030-01-01' });
    }
    return o.id;
  };
  const TXT = { ru: { media: 'Среднее время ответа', selo: 'Быстрый ответ' }, et: { media: 'Keskmine vastamisaeg', selo: 'Kiire vastus' }, en: { media: 'Average response time', selo: 'Fast Response' } };
  const cenarios = [
    // a oficina principal tem 1 orcamento (2,5 h): sem media e sem selo
    { nome: '1 orcamento', id: ofId, media: null, selo: false },
    { nome: '3 orcamentos de 2,5 h', id: await oficinaCom('UI3A', [2.5, 2.5, 2.5]), media: { ru: '2,5 ч', et: '2,5 h', en: '2.5h' }, selo: false },
    { nome: '3 orcamentos de 1,5 h', id: await oficinaCom('UI3B', [1.5, 1.5, 1.5]), media: { ru: '1,5 ч', et: '1,5 h', en: '1.5h' }, selo: true },
  ];
  for (const largura of [390, 360]) {
    const ctx = await celular(largura);
    const p = await ctx.newPage();
    for (const c of cenarios) {
      for (const l of ['ru', 'et', 'en']) {
        await p.goto(`${SITE}${PREFIXO[l]}/oficinas/${c.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
        const t = await p.innerText('body');
        const linha = t.match(new RegExp(`${TXT[l].media}[^\n]*`))?.[0] || '';
        if (c.media) ok(`${largura} ${l} publica (${c.nome}): tempo medio "${c.media[l]}"`, linha.includes(c.media[l]), linha || t.slice(0, 300));
        else ok(`${largura} ${l} publica (${c.nome}): sem tempo medio`, !linha, linha);
        ok(`${largura} ${l} publica (${c.nome}): selo "${TXT[l].selo}" ${c.selo ? 'aparece' : 'nao aparece'}`, t.includes(TXT[l].selo) === c.selo);
        ok(`${largura} ${l} publica (${c.nome}): sem rolagem lateral`, await semRolagem(p));
        if (largura === 390 && l === 'ru') await p.screenshot({ path: `${OUT}/publica-ru-${c.nome.replace(/[^a-z0-9]+/gi, '-')}.png` });
      }
    }
    await ctx.close();
  }
} catch (e) {
  falhas++; console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await browser.close();
  for (const s of sols) {
    await sb.from('mensagens').delete().eq('solicitacao_id', s);
    await sb.from('notificacoes').delete().eq('dados->>solicitacao_id', s);
    await sb.from('orcamentos').delete().eq('solicitacao_id', s);
    await sb.from('pedido_vistos').delete().eq('solicitacao_id', s);
    await sb.from('solicitacoes').delete().eq('id', s);
  }
  for (const o of [ofId, ...extras].filter(Boolean)) { await sb.from('comissao_config').delete().eq('oficina_id', o); await sb.from('oficinas').delete().eq('id', o); }
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id).catch(() => {}); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
