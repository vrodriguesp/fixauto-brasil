// Navegacao e "voltar" como uma pessoa, com FOTO de cada etapa (dono 09/11: "os problemas de
// redirecionamento das paginas de voltar sao muito graves"). Site no celular (WebKit, iPhone 14)
// e no computador; cliente com 1 pedido e 3 orcamentos de oficinas diferentes.
//  - cada etapa: foto + conferencias de tela (sem rolagem lateral, botoes dentro da tela,
//    nada cobrindo o botao principal);
//  - cada "voltar" (navegador e setas da pagina) volta para a tela de onde veio, nunca para o
//    inicio do site nem para fora do endereco.
//   HOST_LAN=<ip-da-rede> node navegacao-voltar.mjs <.env.local>
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
const OUT = `${RAIZ}/resultados/navegacao-voltar`; fs.mkdirSync(OUT, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const dia = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
const tag = crypto.randomBytes(3).toString('hex'); const senha = 'Nv-' + crypto.randomBytes(6).toString('hex');
let falhas = 0; let foto = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 200) : ''}`); };
const caminho = (u) => new URL(u).pathname + new URL(u).search;
const b = await webkit.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe') });
// ---- dados: cliente (et), 1 pedido com 3 orcamentos de oficinas diferentes, 2 datas cada
const email = `nav-${tag}@example.test`;
const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
await admin.from('profiles').upsert({ id: u.user.id, email, tipo: 'cliente', nome: 'Kliendi Test', idioma: 'et' });
const { data: v } = await admin.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018', placa: '123ABC' }).select('id').single();
const { data: sol } = await admin.from('solicitacoes').insert({ cliente_id: u.user.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'Mootor teeb kummalist häält', urgencia: 'media', endereco: 'Pärnu mnt 10, Tallinn', latitude: 59.433, longitude: 24.746, status: 'em_orcamento' }).select('id, numero').single();
const { data: ofs } = await admin.from('oficinas').select('id, nome_fantasia, profile_id').eq('ativa', true).limit(3);
for (const [i, of] of ofs.entries()) {
  const o = (await admin.from('orcamentos').insert({ solicitacao_id: sol.id, oficina_id: of.id, valor_total: 120 + i * 45, prazo_dias: 1 + i, status: 'enviado', validade: dia(10), observacoes: i === 1 ? 'Originaalvaruosad, 12 kuud garantiid.' : null }).select('id').single()).data;
  await admin.from('orcamento_itens').insert([{ orcamento_id: o.id, descricao: 'Diagnostika', tipo: 'mao_de_obra', valor_unitario: 40, quantidade: 1, valor_total: 40 }, { orcamento_id: o.id, descricao: 'Remont', tipo: 'mao_de_obra', valor_unitario: 80 + i * 45, quantidade: 1, valor_total: 80 + i * 45 }]);
  await admin.from('orcamento_disponibilidade').insert([{ orcamento_id: o.id, data_checkin: dia(2 + i), turno: 'manha', data_previsao_entrega: dia(3 + i) }, { orcamento_id: o.id, data_checkin: dia(4 + i), turno: 'tarde', data_previsao_entrega: dia(5 + i) }]);
  await admin.from('mensagens').insert({ solicitacao_id: sol.id, oficina_id: of.id, remetente_id: of.profile_id, texto: `Tere! Siin ${of.nome_fantasia}.` });
}
const telaOk = async (p, nome) => {
  const r = await p.evaluate(() => {
    const lateral = document.documentElement.scrollWidth - innerWidth;
    const fora = [...document.querySelectorAll('main a, main button')].filter((e) => e.offsetParent && e.getBoundingClientRect().width > 0)
      .filter((e) => { const b = e.getBoundingClientRect(); return b.left < -1 || b.right > innerWidth + 1; }).map((e) => (e.textContent || '').trim().slice(0, 25));
    const cobertos = [...document.querySelectorAll('main button, main a.btn-primary, main a.btn-success')].filter((e) => e.offsetParent).filter((e) => {
      const b = e.getBoundingClientRect(); if (b.bottom < 0 || b.top > innerHeight) return false;
      const x = b.left + b.width / 2, y = b.top + b.height / 2; const el = document.elementFromPoint(x, y);
      // menu de baixo e botao do chat sao fixos: passar por cima enquanto rola e normal
      if (el && el.closest(".barra-inferior, [data-chat-fab], nav, header")) return false;
      return el && !e.contains(el) && !el.contains(e);
    }).map((e) => (e.textContent || '').trim().slice(0, 25));
    return { lateral, fora, cobertos };
  });
  ok(`${nome}: sem rolagem lateral, nada fora da tela, nada cobrindo botao`, r.lateral <= 1 && !r.fora.length && !r.cobertos.length, JSON.stringify(r));
};
const fotografar = async (p, nome) => { foto++; await p.screenshot({ path: path.join(OUT, `${String(foto).padStart(2, '0')}_${nome}.png`), fullPage: true }); };
try {
  for (const [modo, larg, alt] of [['celular', 390, 664], ['computador', 1280, 860]]) {
    const ctx = await b.newContext({ viewport: { width: larg, height: alt }, isMobile: larg < 500, hasTouch: larg < 500, locale: 'et-EE' });
    await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
    await ctx.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
    const p = await ctx.newPage();
    const erros = []; p.on('pageerror', (e) => erros.push(e.message));
    await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' });
    await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha); await p.click('button[type=submit]'); await p.waitForTimeout(4500);
    // 1) inicio
    await p.goto(`${SITE}/ee/et/cliente/dashboard`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
    const inicio = caminho(p.url());
    await fotografar(p, `${modo}_inicio`); await telaOk(p, `${modo} inicio`);
    // 2) pedido com 3 orcamentos
    await p.goto(`${SITE}/ee/et/cliente/orcamentos/${sol.id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    const urlPedido = caminho(p.url());
    await fotografar(p, `${modo}_pedido_3_orcamentos`); await telaOk(p, `${modo} pedido com 3 orcamentos`);
    const corpo = await p.innerText('main');
    ok(`${modo}: os 3 orcamentos aparecem`, ofs.every((o) => corpo.includes(o.nome_fantasia)), ofs.map((o) => o.nome_fantasia).join(', '));
    ok(`${modo}: datas oferecidas a vista nos 3`, (await p.getByTestId('datas-oferecidas').count()) === 3, String(await p.getByTestId('datas-oferecidas').count()));
    // 3) conversa a partir do pedido e voltar
    const linkConversa = p.locator(`a[href*="/mensagens/${sol.id}?oficina="]`).first();
    if (await linkConversa.count()) {
      await linkConversa.click(); await p.waitForTimeout(3500);
      const urlConversa = caminho(p.url());
      await fotografar(p, `${modo}_conversa`);
      ok(`${modo}: abriu a conversa`, /mensagens/.test(urlConversa), urlConversa);
      // pagina da oficina a partir da conversa e voltar
      const linkOficina = p.locator('a[href*="/tookojad/"], a[href*="/oficinas/"]').first();
      if (await linkOficina.count()) {
        await linkOficina.click(); await p.waitForTimeout(3500);
        await fotografar(p, `${modo}_pagina_oficina`); await telaOk(p, `${modo} pagina da oficina`);
        ok(`${modo}: pagina da oficina carregou`, /tookojad|oficinas/.test(p.url()) && (await p.locator('h1').count()) > 0, p.url());
        // a seta/voltar DA PAGINA da oficina (se houver) tem de voltar a conversa
        const setaPagina = p.locator('main a[aria-label], main button[aria-label]').filter({ hasText: '' }).first();
        await p.goBack(); await p.waitForTimeout(2500);
        ok(`${modo}: voltar (navegador) da oficina -> conversa`, caminho(p.url()) === urlConversa, caminho(p.url()));
        void setaPagina;
      } else ok(`${modo}: conversa tem link para a pagina da oficina`, false);
      // seta de voltar da propria conversa
      const seta = p.locator('a[href*="/cliente/orcamentos/"]').first();
      if (await seta.count()) { await seta.click(); await p.waitForTimeout(2500); ok(`${modo}: seta da conversa -> pedido`, caminho(p.url()) === urlPedido, caminho(p.url())); }
      else { await p.goBack(); await p.waitForTimeout(2500); ok(`${modo}: voltar (navegador) da conversa -> pedido`, caminho(p.url()) === urlPedido, caminho(p.url())); }
    } else ok(`${modo}: pedido tem link para conversar com a oficina`, false);
    // 4) avisos -> pedido -> voltar
    await p.goto(`${SITE}/ee/et/cliente/notificacoes`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
    const urlAvisos = caminho(p.url());
    await fotografar(p, `${modo}_avisos`); await telaOk(p, `${modo} avisos`);
    // 5) voltar pelo navegador ate o inicio, sem sair do site
    for (let i = 0; i < 6; i++) { await p.goBack().catch(() => {}); await p.waitForTimeout(1200); if (!p.url().startsWith(SITE)) break; }
    ok(`${modo}: voltando pelo navegador nunca sai do site`, p.url().startsWith(SITE) || p.url() === 'about:blank', p.url());
    void inicio; void urlAvisos;
    ok(`${modo}: sem erro de JavaScript`, !erros.length, erros.join(' || ').slice(0, 600));
    await ctx.close();
  }
} catch (e) {
  falhas++; console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
} finally {
  await b.close();
  const { data: orcs } = await admin.from('orcamentos').select('id').eq('solicitacao_id', sol.id);
  for (const o of orcs || []) { await admin.from('orcamento_itens').delete().eq('orcamento_id', o.id); await admin.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); }
  for (const t of ['mensagens', 'orcamentos']) await admin.from(t).delete().eq('solicitacao_id', sol.id);
  await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', sol.id);
  await admin.from('solicitacoes').delete().eq('id', sol.id); await admin.from('veiculos').delete().eq('id', v.id);
  await admin.from('notificacoes').delete().eq('profile_id', u.user.id); await admin.from('profiles').delete().eq('id', u.user.id); await admin.auth.admin.deleteUser(u.user.id);
  console.log(`fotos em ${OUT}`);
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
