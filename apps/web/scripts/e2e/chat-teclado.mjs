// Conversas do site no padrao unico (dono 09/11, itens 32/33/41/42/46/47), no motor do Safari
// (WebKit), celular 390x664. O teclado de verdade nao abre no teste: ele e simulado trocando a
// area visivel (window.visualViewport falso: altura/offsetTop + eventos resize/scroll), que e
// exatamente o que o iPhone faz quando o teclado abre e fecha.
// Confere: cabecalho sempre a vista, caixa de escrever dentro da area visivel, pagina nao rola,
// sem menu de baixo, enviar nao tira o foco nem muda a altura da caixa, mensagem aparece na hora,
// teclado fecha sem buraco, aviso "nova mensagem" lendo mensagens antigas, suporte igual, e o
// campo de um formulario vai para o meio da area visivel quando o teclado abre.
//   HOST_LAN=<ip-da-rede> node chat-teclado.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { webkit } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local');
const SITE = `http://${process.env.HOST_LAN || 'localhost'}:3100`;
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/chat-teclado`; fs.mkdirSync(OUT, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tag = crypto.randomBytes(3).toString('hex'); const senha = 'Ct-' + crypto.randomBytes(6).toString('hex');
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 240) : ''}`); };
const b = await webkit.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe') });
// area visivel falsa: __teclado(true, offsetTop) encolhe para 55% (teclado aberto); __teclado(false) volta
const VV_FALSO = () => {
  const ev = new EventTarget();
  const st = { aberto: false, top: 0 };
  const vv = {
    get height() { return st.aberto ? Math.round(window.innerHeight * 0.55) : window.innerHeight; },
    get width() { return window.innerWidth; },
    get offsetTop() { return st.aberto ? st.top : 0; },
    offsetLeft: 0, pageLeft: 0, get pageTop() { return window.scrollY + (st.aberto ? st.top : 0); }, scale: 1,
    addEventListener: (...a) => ev.addEventListener(...a), removeEventListener: (...a) => ev.removeEventListener(...a), dispatchEvent: (e) => ev.dispatchEvent(e),
  };
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
  window.__teclado = (aberto, top = 0) => { st.aberto = aberto; st.top = top; ev.dispatchEvent(new Event('resize')); ev.dispatchEvent(new Event('scroll')); };
};
const novoCtx = async (largura = 390) => {
  const c = await b.newContext({ viewport: { width: largura, height: largura < 500 ? 664 : 900 }, isMobile: largura < 500, hasTouch: largura < 500, locale: 'en-GB' });
  await c.addInitScript(VV_FALSO);
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const entrar = async (ctx, email, s) => { const p = await ctx.newPage(); await p.goto(`${SITE}/ee/en/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', s); await p.click('button[type=submit]'); await p.waitForTimeout(4000); return p; };
// medidas da conversa presa a tela
const medir = (p) => p.evaluate(() => {
  const c = document.querySelector('[data-conversa]');
  const v = window.visualViewport;
  const campo = c?.querySelector('[data-campo-conversa]');
  const cab = c?.firstElementChild;
  const barra = document.querySelector('.barra-inferior');
  const lista = c?.querySelector('[data-testid=conversa-lista]');
  return {
    vvTop: v.offsetTop, vvAltura: v.height,
    conversaTop: c ? Math.round(c.getBoundingClientRect().top) : null, conversaAltura: c ? Math.round(c.getBoundingClientRect().height) : null,
    cabecalhoTop: cab ? Math.round(cab.getBoundingClientRect().top) : null,
    campoFundo: campo ? Math.round(campo.getBoundingClientRect().bottom) : null, campoAltura: campo ? Math.round(campo.getBoundingClientRect().height) : null,
    campoLetra: campo ? parseFloat(getComputedStyle(campo).fontSize) : null,
    rolagemPagina: window.scrollY,
    barraVisivel: !!barra && getComputedStyle(barra).display !== 'none' && barra.getBoundingClientRect().height > 0,
    emConversa: document.body.classList.contains('em-conversa'),
    listaNoFim: lista ? lista.scrollHeight - lista.scrollTop - lista.clientHeight < 40 : null,
    foco: document.activeElement?.hasAttribute?.('data-campo-conversa') || false,
  };
});
const contas = []; const sols = [];
try {
  // ---------- preparacao: cliente + oficina + conversa com 14 mensagens ----------
  const conta = async (tipo, extra = {}) => {
    const email = `chat-${tipo}-${tag}@example.test`;
    const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true }); contas.push(u.user.id);
    await admin.from('profiles').upsert({ id: u.user.id, email, tipo, nome: `Chat ${tipo}`, idioma: 'en', ...extra });
    return { id: u.user.id, email };
  };
  const cli = await conta('cliente');
  const ofc = await conta('oficina');
  const { data: of } = await admin.from('oficinas').insert({ profile_id: ofc.id, nome_fantasia: `Chat Töökoda ${tag}`, endereco: 'Pärnu mnt 20', cidade: 'Tallinn', estado: 'Harjumaa', cep: '10141', pais: 'EE', latitude: 59.43, longitude: 24.745, raio_atendimento_km: 30, especialidades: ['mecanica'], ativa: true }).select('id').single();
  const { data: v } = await admin.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018' }).select('id').single();
  const { data: sol } = await admin.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'Chat teclado', urgencia: 'media', endereco: 'Tallinn', latitude: 59.43, longitude: 24.74, status: 'em_orcamento' }).select('id').single(); sols.push(sol.id);
  await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of.id, valor_total: 100, prazo_dias: 1, status: 'enviado' });
  await admin.from('mensagens').insert(Array.from({ length: 14 }, (_, i) => ({ solicitacao_id: sol.id, oficina_id: of.id, remetente_id: i % 2 ? cli.id : ofc.id, texto: `Message number ${i + 1} of the keyboard test`, lida: true })));

  // ---------- cliente, celular ----------
  {
    const ctx = await novoCtx(); const p = await entrar(ctx, cli.email, senha);
    await p.goto(`${SITE}/ee/en/cliente/mensagens/${sol.id}?oficina=${of.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3500);
    const a = await medir(p);
    ok('Abre presa a tela: sem menu de baixo, cabecalho no topo, caixa dentro da tela', a.emConversa && !a.barraVisivel && a.cabecalhoTop >= 0 && a.campoFundo <= 664 && a.rolagemPagina === 0, JSON.stringify(a));
    ok('Abre na ultima mensagem', a.listaNoFim === true, JSON.stringify(a));
    ok('Caixa de escrever com 16 px (sem zoom no iPhone)', a.campoLetra >= 16, String(a.campoLetra));
    const campo = p.locator('[data-campo-conversa]');
    await campo.click();
    await p.evaluate(() => window.__teclado(true, 0)); await p.waitForTimeout(400);
    const t1 = await medir(p);
    ok('Teclado aberto: a conversa encolhe junto, cabecalho e caixa a vista, pagina parada', t1.conversaAltura === t1.vvAltura && t1.cabecalhoTop >= t1.vvTop && t1.campoFundo <= t1.vvTop + t1.vvAltura && t1.rolagemPagina === 0, JSON.stringify(t1));
    await p.screenshot({ path: path.join(OUT, 'cliente_teclado_aberto.png') });
    await p.keyboard.type('Hello, is the car ready?', { delay: 20 });
    const antes = await medir(p);
    await p.getByTestId('conversa-enviar').click(); await p.waitForTimeout(300);
    const depois = await medir(p);
    const lista = await p.getByTestId('conversa-lista').innerText();
    ok('Enviar: a mensagem aparece na hora', lista.includes('Hello, is the car ready?'));
    ok('Enviar: o campo continua com o foco (teclado nao fecha)', depois.foco, JSON.stringify(depois));
    ok('Enviar: a caixa nao muda de altura e a pagina nao pula', depois.campoAltura === antes.campoAltura && depois.rolagemPagina === 0 && depois.campoFundo <= depois.vvTop + depois.vvAltura, JSON.stringify({ antes, depois }));
    await p.waitForTimeout(2500);
    ok('Mensagem confirmada (sem "sending")', !(await p.getByTestId('conversa-lista').innerText()).includes('sending'));
    // iPhone com a pagina "deslocada" (offsetTop > 0): a conversa acompanha
    await p.evaluate(() => window.__teclado(true, 120)); await p.waitForTimeout(300);
    const t2 = await medir(p);
    ok('Area visivel deslocada (offsetTop 120): a conversa acompanha o topo visivel', t2.conversaTop === 120 && t2.cabecalhoTop >= 120 && t2.campoFundo <= 120 + t2.vvAltura, JSON.stringify(t2));
    // fecha o teclado (tocar na lista)
    await p.getByTestId('conversa-lista').click({ position: { x: 20, y: 20 } }); await p.evaluate(() => window.__teclado(false)); await p.waitForTimeout(400);
    const f1 = await medir(p);
    ok('Tocar na lista fecha o teclado (campo sem foco)', !f1.foco, JSON.stringify(f1));
    ok('Teclado fechado: volta a tela cheia, caixa colada embaixo, sem buraco', f1.conversaAltura === 664 && f1.campoFundo <= 664 && f1.campoFundo >= 664 - 70 && f1.rolagemPagina === 0 && !f1.barraVisivel, JSON.stringify(f1));
    await p.screenshot({ path: path.join(OUT, 'cliente_teclado_fechado.png') });
    // lendo mensagens antigas: mensagem nova nao puxa para baixo, aparece o aviso
    await p.getByTestId('conversa-lista').evaluate((l) => { l.scrollTop = 0; }); await p.waitForTimeout(300);
    await admin.from('mensagens').insert({ solicitacao_id: sol.id, oficina_id: of.id, remetente_id: ofc.id, texto: 'New reply from the shop' });
    await p.waitForTimeout(4000);
    const noTopo = await p.getByTestId('conversa-lista').evaluate((l) => l.scrollTop < 50);
    ok('Lendo mensagens antigas: a nova nao puxa a lista para baixo', noTopo);
    ok('Aparece o aviso "nova mensagem"', (await p.getByTestId('nova-mensagem').count()) === 1);
    if (await p.getByTestId('nova-mensagem').count()) { await p.getByTestId('nova-mensagem').click(); await p.waitForTimeout(800); }
    ok('Tocar no aviso leva ao fim e ele some', (await medir(p)).listaNoFim === true && (await p.getByTestId('nova-mensagem').count()) === 0);
    await ctx.close();
  }
  // ---------- oficina, celular (mesmo padrao do outro lado) ----------
  {
    const ctx = await novoCtx(); const p = await entrar(ctx, ofc.email, senha);
    await p.goto(`${SITE}/ee/en/oficina/mensagens/${sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3500);
    await p.locator('[data-campo-conversa]').click(); await p.evaluate(() => window.__teclado(true, 0)); await p.waitForTimeout(300);
    await p.keyboard.type('Yes, ready tomorrow', { delay: 20 });
    const antes = await medir(p);
    await p.getByTestId('conversa-enviar').click(); await p.waitForTimeout(300);
    const d = await medir(p);
    ok('Oficina: presa a tela, sem menu de baixo', d.emConversa && !d.barraVisivel && d.cabecalhoTop >= d.vvTop, JSON.stringify(d));
    ok('Oficina: enviar mantem o foco e a altura da caixa, pagina parada', d.foco && d.campoAltura === antes.campoAltura && d.rolagemPagina === 0, JSON.stringify({ antes, d }));
    await ctx.close();
  }
  // ---------- suporte (cliente logado), celular ----------
  {
    const ctx = await novoCtx(); const p = await entrar(ctx, cli.email, senha);
    await p.goto(`${SITE}/ee/en/cliente/dashboard`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    await p.getByTestId('chat-suporte-botao').click(); await p.waitForTimeout(1500);
    await p.evaluate(() => window.__teclado(true, 0)); await p.waitForTimeout(300);
    const s1 = await medir(p);
    ok('Suporte: janela presa a area visivel, cabecalho (X) a vista, pagina parada', s1.conversaAltura === s1.vvAltura && s1.cabecalhoTop >= s1.vvTop && s1.rolagemPagina === 0 && !s1.barraVisivel, JSON.stringify(s1));
    await p.locator('#suporte-texto').click(); await p.keyboard.type('Test question from the keyboard test', { delay: 15 });
    const antes = await medir(p);
    await p.getByTestId('chat-suporte-enviar').click(); await p.waitForTimeout(300);
    const s2 = await medir(p);
    ok('Suporte: mensagem aparece na hora, foco e altura da caixa mantidos', (await p.getByTestId('chat-suporte-janela').innerText()).includes('Test question from the keyboard test') && s2.foco && s2.campoAltura === antes.campoAltura, JSON.stringify({ antes, s2 }));
    await p.screenshot({ path: path.join(OUT, 'suporte_teclado.png') });
    await ctx.close();
  }
  // ---------- computador: nada muda ----------
  {
    const ctx = await novoCtx(1280); const p = await entrar(ctx, cli.email, senha);
    await p.goto(`${SITE}/ee/en/cliente/mensagens/${sol.id}?oficina=${of.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    const pos = await p.evaluate(() => ({ fixo: getComputedStyle(document.querySelector('[data-conversa]')).position, emConversa: document.body.classList.contains('em-conversa') }));
    ok('Computador: conversa normal (nao fica presa), sem modo celular', pos.fixo !== 'fixed' && !pos.emConversa, JSON.stringify(pos));
    await ctx.close();
  }
  // ---------- item 47: campo de formulario vai para o meio da area visivel ----------
  {
    const ctx = await novoCtx(); const p = await ctx.newPage();
    // /registreeru sem ?tipo= mostra so a escolha cliente/oficina (sem campos): vai direto ao do cliente
    await p.goto(`${SITE}/ee/et/registreeru?tipo=cliente`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    const campos = p.locator('main input[type=text]:visible, main input[type=email]:visible, main input[type=tel]:visible');
    const n = await campos.count();
    ok('47: formulario de cadastro com campos para testar', n > 0, String(n));
    const c = campos.nth(Math.max(0, n - 1));
    await c.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, 250)); // campo perto do fim da tela
    await c.focus(); await p.evaluate(() => window.__teclado(true, 0)); await p.waitForTimeout(1200);
    const r = await c.evaluate((e) => { const b = e.getBoundingClientRect(); const v = window.visualViewport; return { topo: Math.round(b.top), fundo: Math.round(b.bottom), vvFundo: v.offsetTop + v.height, foco: document.activeElement === e }; });
    ok('47: com o teclado aberto o campo fica na area visivel, sem perder o foco', r.topo >= 0 && r.fundo <= r.vvFundo && r.foco, JSON.stringify(r));
    await ctx.close();
  }
} catch (e) {
  falhas++; console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await b.close();
  for (const id of sols) {
    for (const t of ['mensagens', 'orcamentos']) await admin.from(t).delete().eq('solicitacao_id', id);
    await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', id);
    await admin.from('solicitacoes').delete().eq('id', id);
  }
  for (const id of contas) {
    const { data: conv } = await admin.from('suporte_conversas').select('id').eq('profile_id', id);
    for (const c of conv || []) { await admin.from('suporte_mensagens').delete().eq('conversa_id', c.id); await admin.from('suporte_conversas').delete().eq('id', c.id); }
    await admin.from('oficinas').delete().eq('profile_id', id);
    await admin.from('veiculos').delete().eq('profile_id', id); await admin.from('notificacoes').delete().eq('profile_id', id);
    await admin.from('profiles').delete().eq('id', id); await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
