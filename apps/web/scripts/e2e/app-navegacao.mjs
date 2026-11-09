// App (versao web) no motor do Safari (WebKit), iPhone 14 (390x664). Itens do dono 09/11:
//  54 pagina da oficina DENTRO do app e "voltar" volta a conversa (nunca sai para o site);
//  55 conversa: com o teclado aberto o cabecalho (oficina) continua a vista e a caixa tambem;
//  56 conversa encerrada (servico terminado, sem garantia): so leitura, sem caixa de escrever;
//  49/51 Inicio: todos os pedidos ativos no mesmo nivel, acidente em vermelho; a tela inteira rola;
//  52 botao "Cancelar pedido" no pedido aberto; varios orcamentos: a tela do pedido rola ate o fim.
// Fotos de cada etapa em resultados/app-navegacao/.
//   HOST_LAN=<ip-da-rede> node app-navegacao.mjs <.env.local>
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
const APP = `http://${process.env.HOST_LAN || 'localhost'}:8090`;
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/app-navegacao`; fs.mkdirSync(OUT, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const dia = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const email = `appnav-${tag}@example.test`; const senha = 'An-' + crypto.randomBytes(6).toString('hex');
const sols = []; let uid = null; let foto = 0;
const shot = async (p, nome) => p.screenshot({ path: path.join(OUT, `${String(++foto).padStart(2, '0')}_${nome}.png`) }).catch(() => {});

// teclado de mentira: a area visivel (visualViewport) encolhe como no iPhone
const tecladoFalso = () => {
  const alvo = new EventTarget();
  // largura/altura lidas na hora (no inicio da pagina o Safari ainda nao aplicou o ajuste de celular)
  let frac = 1;
  const vv = { offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1, get width() { return innerWidth; }, get height() { return Math.round(innerHeight * frac); } };
  for (const k of ['addEventListener', 'removeEventListener', 'dispatchEvent']) vv[k] = alvo[k].bind(alvo);
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
  window.__teclado = (f, topo = 0) => { frac = f; vv.offsetTop = topo; alvo.dispatchEvent(new Event('resize')); alvo.dispatchEvent(new Event('scroll')); };
};

const b = await webkit.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe') });
try {
  // ---------- dados: cliente, carro, pedido com 3 orcamentos, acidente aberto e pedido terminado sem garantia ----------
  const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true }); uid = u.user.id;
  await admin.from('profiles').upsert({ id: uid, email, tipo: 'cliente', nome: 'Cliente Navegacao', idioma: 'et' });
  const { data: v } = await admin.from('veiculos').insert({ profile_id: uid, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: 'Corolla', fipe_ano: '2018', placa: `NV${tag.slice(0, 4).toUpperCase()}` }).select('id').single();
  await admin.from('veiculos').insert({ profile_id: uid, fipe_tipo: 'cars', fipe_marca: '', fipe_modelo: '', fipe_ano: '', placa: `SO${tag.slice(0, 4).toUpperCase()}` });
  const { data: ofs } = await admin.from('oficinas').select('id, nome_fantasia, profile_id').eq('ativa', true).limit(3);
  if ((ofs || []).length < 3) throw new Error('preciso de 3 oficinas ativas no banco local');
  const novoSol = async (extra) => { const { data } = await admin.from('solicitacoes').insert({ cliente_id: uid, veiculo_id: v.id, tipo: 'mecanica', descricao: 'Navegacao do app', urgencia: 'media', endereco: 'Tallinn', latitude: 59.43, longitude: 24.74, status: 'em_orcamento', ...extra }).select('id').single(); sols.push(data.id); return data.id; };
  const sol = await novoSol({});
  for (const [i, of] of ofs.entries()) {
    const o = (await admin.from('orcamentos').insert({ solicitacao_id: sol, oficina_id: of.id, valor_total: 120 + i * 35, prazo_dias: 1 + i, status: 'enviado', validade: dia(10) }).select('id').single()).data;
    await admin.from('orcamento_itens').insert([1, 2, 3].map((k) => ({ orcamento_id: o.id, descricao: `Töö ${k}`, tipo: 'mao_de_obra', valor_unitario: 40, quantidade: 1, valor_total: 40 })));
    await admin.from('orcamento_disponibilidade').insert([{ orcamento_id: o.id, data_checkin: dia(2 + i), turno: 'manha', data_previsao_entrega: dia(3 + i) }, { orcamento_id: o.id, data_checkin: dia(3 + i), turno: 'tarde', data_previsao_entrega: dia(4 + i) }]);
  }
  await admin.from('mensagens').insert(Array.from({ length: 10 }, (_, k) => ({ solicitacao_id: sol, oficina_id: ofs[0].id, remetente_id: k % 2 ? uid : ofs[0].profile_id, texto: `Sõnum ${k + 1}` })));
  const acid = await novoSol({ tipo: 'colisao', descricao: '[TIPO:colisao] Avarii parklas', status: 'aberta' });
  // terminado ha 30 dias, sem garantia: conversa encerrada
  const fim = await novoSol({ status: 'concluida' });
  const oFim = (await admin.from('orcamentos').insert({ solicitacao_id: fim, oficina_id: ofs[0].id, valor_total: 90, prazo_dias: 1, status: 'aceito', validade: dia(10), garantia_dias: 0 }).select('id').single()).data;
  const quando = new Date(Date.now() - 30 * 86400e3).toISOString();
  await admin.from('agenda').insert({ oficina_id: ofs[0].id, solicitacao_id: fim, titulo: 'Navegacao', data_inicio: quando, data_fim: quando, status: 'concluido', tipo: 'plataforma' });
  await admin.from('mensagens').insert({ solicitacao_id: fim, oficina_id: ofs[0].id, remetente_id: ofs[0].profile_id, texto: 'Auto on valmis' });

  const ctx = await b.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'et-EE' });
  await ctx.addInitScript(() => { try { localStorage.setItem('idioma', 'et'); } catch {} });
  await ctx.addInitScript(tecladoFalso);
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(`${APP}/login`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  await p.locator('input:visible').nth(0).fill(email); await p.locator('input:visible').nth(1).fill(senha); await p.keyboard.press('Enter'); await p.waitForTimeout(5000);

  // ---------- Inicio: todos os pedidos no mesmo nivel, acidente em vermelho, tela inteira rola ----------
  await p.goto(`${APP}/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(4000);
  const nCartoes = await p.getByTestId('cartao-pedido').count(); const nAcid = await p.getByTestId('cartao-pedido-acidente').count();
  ok('49: Inicio com cada pedido ativo no seu cartao (2 + acidente)', nCartoes >= 1 && nAcid === 1, `normais ${nCartoes}, acidente ${nAcid}`);
  await shot(p, 'inicio');
  const rolagem = await p.evaluate(() => [...document.querySelectorAll('div')].filter((d) => /auto|scroll/.test(getComputedStyle(d).overflowY) && d.scrollHeight > d.clientHeight + 5).map((d) => ({ h: d.clientHeight, c: d.scrollHeight }))[0] || null);
  ok('50: Inicio rola numa area so, da altura da tela', !rolagem || rolagem.h >= 500, JSON.stringify(rolagem));

  // ---------- pedido com 3 orcamentos ----------
  await p.goto(`${APP}/solicitacao/${sol}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(4000);
  await shot(p, 'pedido_3_orcamentos_topo');
  const area = await p.evaluate(() => { const d = [...document.querySelectorAll('div')].filter((x) => /auto|scroll/.test(getComputedStyle(x).overflowY) && x.scrollHeight > x.clientHeight + 5).sort((a, b2) => b2.scrollHeight - a.scrollHeight)[0]; if (!d) return null; d.scrollTop = d.scrollHeight; return { h: d.clientHeight, c: d.scrollHeight, topo: d.scrollTop }; });
  await p.waitForTimeout(500);
  ok('57: pedido com 3 orcamentos rola ate o fim', !!area && area.topo > 0, JSON.stringify(area));
  await shot(p, 'pedido_3_orcamentos_fim');
  ok('52: botao "Cancelar pedido" no pedido aberto', (await p.getByTestId('cancelar-pedido').count()) === 1);
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].find((x) => /auto|scroll/.test(getComputedStyle(x).overflowY) && x.scrollHeight > x.clientHeight + 5); if (d) d.scrollTop = 0; });

  // ---------- conversa pelo pedido: teclado, cabecalho, pagina da oficina, voltar ----------
  await p.getByTestId('conversar-oficina-orcamento').first().click(); await p.waitForTimeout(4000);
  ok('55: abriu a conversa no app', /\/conversa\//.test(p.url()) && p.url().startsWith(APP), p.url());
  const medir = () => p.evaluate(() => {
    const cab = document.querySelector('[data-testid="conversa-cabecalho"]')?.getBoundingClientRect();
    const campo = [...document.querySelectorAll('textarea, input')].find((e) => e.offsetParent)?.getBoundingClientRect();
    const vv = window.visualViewport;
    return { vvTopo: vv.offsetTop, vvAltura: vv.height, cabTopo: cab ? Math.round(cab.top) : null, cabFundo: cab ? Math.round(cab.bottom) : null, campoFundo: campo ? Math.round(campo.bottom) : null, rolagemPagina: scrollY };
  });
  const a0 = await medir();
  ok('55: cabecalho da conversa no alto e caixa de escrever dentro da tela', a0.cabTopo !== null && a0.cabTopo >= 0 && a0.campoFundo !== null && a0.campoFundo <= a0.vvAltura + 1, JSON.stringify(a0));
  await shot(p, 'conversa');
  await p.locator('textarea:visible, input:visible').first().click();
  await p.evaluate(() => window.__teclado(0.55)); await p.waitForTimeout(600);
  const a1 = await medir();
  ok('55: teclado aberto: cabecalho continua a vista e a caixa acima do teclado', a1.cabTopo !== null && a1.cabTopo >= a1.vvTopo && a1.cabFundo <= a1.vvTopo + a1.vvAltura && a1.campoFundo <= a1.vvTopo + a1.vvAltura + 1 && a1.rolagemPagina === 0, JSON.stringify(a1));
  await shot(p, 'conversa_teclado');
  await p.evaluate(() => window.__teclado(0.55, 120)); await p.waitForTimeout(400);
  const a2 = await medir();
  ok('55: area visivel deslocada: cabecalho acompanha o topo visivel', a2.cabTopo === a2.vvTopo, JSON.stringify(a2));
  await p.evaluate(() => window.__teclado(1, 0)); await p.waitForTimeout(400);
  await p.getByTestId('conversa-ver-oficina').click(); await p.waitForTimeout(3500);
  ok('54: pagina da oficina abre DENTRO do app (mesmo endereco)', p.url().startsWith(APP) && /\/oficina\//.test(p.url()) && (await p.getByTestId('tela-oficina').count()) === 1, p.url());
  await shot(p, 'oficina_no_app');
  await p.goBack(); await p.waitForTimeout(2500);
  ok('54: voltar da oficina volta para a conversa', /\/conversa\//.test(p.url()) && p.url().startsWith(APP), p.url());
  await p.goBack(); await p.waitForTimeout(2500);
  ok('voltar da conversa volta para o pedido', /\/solicitacao\//.test(p.url()) && p.url().startsWith(APP), p.url());

  // ---------- conversa encerrada ----------
  await p.goto(`${APP}/conversa/${fim}?oficina=${ofs[0].id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(4000);
  ok('56: conversa encerrada: aviso e sem caixa de escrever', (await p.getByTestId('conversa-encerrada').count()) === 1 && (await p.locator('textarea:visible').count()) === 0);
  await shot(p, 'conversa_encerrada');
  await p.goto(`${APP}/solicitacao/${fim}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(4000);
  ok('56: no pedido terminado o botao diz "conversa (encerrada)"', /suletud|encerrad|closed|закрыт|chiusa/i.test(await p.getByTestId('botao-conversa').innerText().catch(() => '')), await p.getByTestId('botao-conversa').innerText().catch(() => ''));

  // ---------- Meus veiculos: sem o carro so com placa ----------
  await p.goto(`${APP}/veiculos`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  const tv = await p.innerText('body');
  ok('carro so com placa nao aparece em "Meus veiculos"', tv.includes('Toyota') && !tv.includes(`SO${tag.slice(0, 4).toUpperCase()}`), tv.slice(0, 200));
  await shot(p, 'meus_veiculos');
  ok('sem erro de JavaScript', !erros.length, erros[0]);
  await ctx.close();
} catch (e) {
  falhas++; console.log('FALHA excecao', (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
} finally {
  await b.close();
  for (const id of sols) {
    const { data: orcs } = await admin.from('orcamentos').select('id').eq('solicitacao_id', id);
    for (const o of orcs || []) { await admin.from('orcamento_itens').delete().eq('orcamento_id', o.id); await admin.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); }
    for (const t of ['agenda', 'mensagens', 'orcamentos']) await admin.from(t).delete().eq('solicitacao_id', id);
    await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', id);
    await admin.from('solicitacoes').delete().eq('id', id);
  }
  if (uid) { await admin.from('veiculos').delete().eq('profile_id', uid); await admin.from('notificacoes').delete().eq('profile_id', uid); await admin.from('profiles').delete().eq('id', uid); await admin.auth.admin.deleteUser(uid).catch(() => {}); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
