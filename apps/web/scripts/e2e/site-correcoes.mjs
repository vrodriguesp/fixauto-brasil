// Reteste no SITE (producao, tela de iPhone 390 px) de cada ponto do teste do
// dono em 03/10/2026:
//  1 menu da oficina nao volta para "entrar" ao trocar de conta no mesmo navegador
//  2 sair em outro aparelho nao derruba o login deste (aceitar orcamento continua)
//  3 sininho de notificacoes cabe na tela
//  4 lista de pedidos: selos e botao dentro da tela; "Vedi / modifica" apos orcar
//  5 pagina do pedido: cabecalho alinhado, orcamento enviado visivel
//  6 orcamento: hoje so periodos ainda nao vencidos
//  7 cliente: horarios vencidos nao aparecem
//  8 acabei de bater: dicas pelo PAIS do acidente (ingles + Italia -> CAI)
//  9 pedido do acidente sem "[TIPO:...]", carro completado pelo cliente
// 10 carro do acidente: escolhido / informado / sem dados (servidor)
// 11 aviso de nova mensagem pelo servidor (usado pelo app)
//   node site-correcoes.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const SITE = 'https://bipfix.com';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 220) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const sols = []; const ofs = []; const ems = [];
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const celular = async (extra = {}) => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, ...extra }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); return c; };
const entrar = async (p, email, senha, pre) => { await p.goto(`${SITE}/${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha); await p.click('button[type=submit]'); await p.waitForTimeout(4000); };
const conta = async (tipo, idioma) => {
  const email = `cor-${tipo}${contas.length}-${tag}@example.test`; const senha = `Cor${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo} ${contas.length}`, email, idioma });
  return { id: data.user.id, email, senha };
};
const sessao = async (c) => { const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data } = await a.auth.signInWithPassword({ email: c.email, password: c.senha }); return { a, token: data.session?.access_token }; };
const semSobraLateral = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const dentroDaTela = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1; });
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAF0lEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

try {
  const cli = await conta('cliente', 'it'); const ofi = await conta('oficina', 'it'); const adm = await conta('admin', 'pt');
  const { data: of } = await sb.from('oficinas').insert({ profile_id: ofi.id, nome_fantasia: `COR SHOP ${tag}`, endereco: 'Via Roma 1', cidade: 'Milano', estado: 'Lombardia', cep: '20121', pais: 'IT', latitude: 45.4642, longitude: 9.19, ativa: true, raio_atendimento_km: 50 }).select('id').single();
  ofs.push(of.id);
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Fiat', fipe_modelo: 'Panda', fipe_ano: '2019', placa: 'AB123CD' }).select('id').single();
  const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'funilaria', descricao: 'Graffio sulla portiera, lato guida, con una descrizione abbastanza lunga da andare a capo', urgencia: 'media', latitude: 45.4642, longitude: 9.19, endereco: 'Via Torino 10, Milano', pagamento_reparo: 'seguro_proprio', seguradora: 'Generali' }).select('id').single();
  sols.push(s.id);

  // ---- 1) troca de conta no mesmo navegador + menu da oficina
  const ctxO = await celular(); const pO = await ctxO.newPage();
  // como no iPhone: cliente e oficina no mesmo Safari, sai de um e entra no outro
  await entrar(pO, cli.email, cli.senha, 'it');
  await pO.goto(`${SITE}/it/cliente/dashboard`, { waitUntil: 'networkidle' });
  await pO.getByRole('button', { name: /^Esci$/ }).first().click(); await pO.waitForTimeout(3000);
  ok('1 saiu da conta cliente', !(await pO.context().cookies()).some((c) => /auth-token/.test(c.name) && c.value), (await pO.context().cookies()).map((c) => c.name).join(','));
  await entrar(pO, ofi.email, ofi.senha, 'it');
  for (let i = 0; i < 2; i++) {
    await pO.getByRole('button', { name: 'Menu' }).click(); await pO.waitForTimeout(600);
    await pO.locator('nav a', { hasText: /^Richieste$/ }).last().click(); await pO.waitForTimeout(3500);
  }
  ok('1 menu "Richieste" abre a lista (nao a tela de entrar), 2 vezes seguidas', pO.url().includes('/oficina/solicitacoes') && !pO.url().includes('/login'), pO.url());

  // ---- 3) sininho
  const sino = pO.getByRole('button', { name: /notific/i }).first();
  await sino.click(); await pO.waitForTimeout(800);
  const painel = pO.locator('div.fixed.inset-x-3, div.sm\\:absolute').filter({ has: pO.locator('span.font-semibold') }).first();
  ok('3 painel de notificacoes dentro da tela', await dentroDaTela(painel).catch(() => false));
  await pO.screenshot({ path: 'cor-sininho.png' });
  await sino.click();

  // ---- 4) lista de pedidos antes de orcar
  await pO.goto(`${SITE}/it/oficina/solicitacoes`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(3000);
  const card = pO.locator('a.card', { hasText: 'Fiat Panda' }).first();
  ok('4 pedido aparece com o selo do seguro', (await card.innerText()).includes('🛡️'));
  ok('4 lista sem nada saindo pela lateral', await semSobraLateral(pO));
  ok('4 botao "Invia preventivo" dentro da tela', await dentroDaTela(card.locator('span.btn-primary')));
  await pO.screenshot({ path: 'cor-lista-antes.png', fullPage: true });

  // ---- 6) orcamento: periodos de hoje (relogio do navegador fixado)
  const ctxQ = await celular(); const pQ = await ctxQ.newPage();
  await entrar(pQ, ofi.email, ofi.senha, 'it');
  await pQ.clock.setFixedTime(new Date().setHours(15, 0, 0, 0));
  await pQ.goto(`${SITE}/it/oficina/enviar-orcamento/${s.id}`, { waitUntil: 'load' }); await pQ.locator('input[type=date]').first().waitFor(); await pQ.waitForTimeout(1500);
  const hoje = iso(new Date());
  const dataSlot = await pQ.locator('input[type=date]').first().inputValue();
  const turnoSlot = await pQ.locator('select[aria-label*="/"]').first().inputValue();
  const manhaDesligada = await pQ.locator('select[aria-label*="/"] option[value=manha]').first().isDisabled();
  ok('6 as 15h: comeca hoje a tarde e a manha de hoje fica bloqueada', dataSlot === hoje && turnoSlot === 'tarde' && manhaDesligada, `${dataSlot} ${turnoSlot} manhaBloq=${manhaDesligada}`);
  ok('6 data minima = hoje', (await pQ.locator('input[type=date]').first().getAttribute('min')) === hoje);
  await pQ.clock.setFixedTime(new Date().setHours(18, 0, 0, 0));
  await pQ.reload({ waitUntil: 'load' }); await pQ.locator('input[type=date]').first().waitFor(); await pQ.waitForTimeout(1500);
  const amanha = iso(new Date(Date.now() + 86400000));
  ok('6 as 18h: comeca amanha de manha', (await pQ.locator('input[type=date]').first().inputValue()) === amanha && (await pQ.locator('select[aria-label*="/"]').first().inputValue()) === 'manha');
  await pQ.screenshot({ path: 'cor-orcamento-horarios.png', fullPage: true });
  await ctxQ.close();

  // orcamento enviado (com um horario vencido e um valido) para os passos 4/5/7
  const { data: o } = await sb.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: of.id, valor_total: 320, prazo_dias: 2, status: 'enviado', validade: '2030-01-01' }).select('id').single();
  await sb.from('orcamento_itens').insert({ orcamento_id: o.id, descricao: 'Verniciatura portiera', tipo: 'mao_de_obra', quantidade: 1, valor_unitario: 320, valor_total: 320 });
  const ontem = iso(new Date(Date.now() - 86400000)), depois = iso(new Date(Date.now() + 2 * 86400000));
  await sb.from('orcamento_disponibilidade').insert([
    { orcamento_id: o.id, data_checkin: ontem, turno: 'manha', data_previsao_entrega: ontem },
    { orcamento_id: o.id, data_checkin: depois, turno: 'tarde', data_previsao_entrega: depois },
  ]);
  await pO.reload({ waitUntil: 'networkidle' }); await pO.waitForTimeout(3000);
  const card2 = pO.locator('a.card', { hasText: 'Fiat Panda' }).first();
  const txt2 = await card2.innerText();
  ok('4 depois de orcar: "Vedi / modifica preventivo" e selo "Preventivo inviato"', /Vedi \/ modifica preventivo/.test(txt2) && /Preventivo inviato/.test(txt2), txt2.replace(/\s+/g, ' '));
  ok('4 lista sem sobra lateral com os 4 selos', await semSobraLateral(pO));
  await pO.screenshot({ path: 'cor-lista-depois.png', fullPage: true });

  // ---- 5) pagina do pedido
  await card2.click(); await pO.waitForTimeout(3000);
  const corpo5 = await pO.innerText('body');
  ok('5 pagina do pedido mostra "Il tuo preventivo" com o item', /Il tuo preventivo/.test(corpo5) && corpo5.includes('Verniciatura portiera'));
  ok('5 botoes "Vedi preventivo" e "Modifica preventivo"', /Vedi preventivo/.test(corpo5) && /Modifica preventivo/.test(corpo5));
  ok('5 cabecalho sem sobra lateral', await semSobraLateral(pO));
  await pO.screenshot({ path: 'cor-pedido.png', fullPage: true });

  // ---- 7 + 2) cliente: horario vencido some; outro aparelho sai e o aceite continua
  const ctxC = await celular(); const pC = await ctxC.newPage();
  await entrar(pC, cli.email, cli.senha, 'it');
  const ctxC2 = await celular(); const pC2 = await ctxC2.newPage();
  await entrar(pC2, cli.email, cli.senha, 'it');
  await pC2.goto(`${SITE}/it/cliente/dashboard`, { waitUntil: 'networkidle' });
  await pC2.getByRole('button', { name: /^Esci$/ }).first().click(); await pC2.waitForTimeout(3000);
  await pC.goto(`${SITE}/it/cliente/orcamentos/${s.id}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
  await pC.getByRole('button', { name: /Accetta e programma/ }).last().click(); await pC.waitForTimeout(1000);
  const horarios = pC.locator('button').filter({ hasText: /\d{2}:\d{2} - \d{2}:\d{2}/ });
  ok('7 so o horario ainda valido aparece (o de ontem some)', (await horarios.count()) === 1);
  await horarios.first().click();
  await pC.getByRole('button', { name: /Conferma appuntamento/ }).last().click(); await pC.waitForTimeout(5000);
  const { data: o2 } = await sb.from('orcamentos').select('status').eq('id', o.id).single();
  ok('2 aceitou mesmo depois de sair da conta em outro aparelho', o2.status === 'aceito', o2.status);

  // ---- 8 + 9) acabei de bater em ingles, na Italia
  const ctxE = await celular({ geolocation: { latitude: 45.4642, longitude: 9.19 }, permissions: ['geolocation'] });
  const pE = await ctxE.newPage();
  await entrar(pE, cli.email, cli.senha, 'en');
  await pE.goto(`${SITE}/en/emergencia`, { waitUntil: 'networkidle' }); await pE.waitForTimeout(2500);
  await pE.locator('input[type=file]').first().setInputFiles({ name: 'dano.png', mimeType: 'image/png', buffer: PNG });
  await pE.waitForTimeout(1500);
  await pE.getByRole('button', { name: 'Next' }).click(); await pE.waitForTimeout(3500);
  const passo3 = await pE.innerText('body');
  await pE.getByRole('button', { name: /Send to repair shops/ }).click(); await pE.waitForTimeout(9000);
  const fim = await pE.innerText('body');
  ok('8 ingles + acidente na Italia: dica da CAI (3 dias), nao da Estonia', /CAI/.test(fim) && /3 days/.test(fim) && !/avarii|liikluskindlustus/i.test(fim + passo3), fim.slice(0, 200).replace(/\s+/g, ' '));
  await pE.screenshot({ path: 'cor-acidente-italia.png', fullPage: true });
  const { data: solAc } = await sb.from('solicitacoes').select('id, descricao, veiculo_id, emergencia_id').eq('cliente_id', cli.id).not('emergencia_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (solAc) { sols.push(solAc.id); ems.push(solAc.emergencia_id); }
  ok('9 cliente com 1 carro e nada escolhido: o pedido usa esse carro', solAc?.veiculo_id === v.id, JSON.stringify(solAc));
  if (solAc) {
    await pC.goto(`${SITE}/it/cliente/orcamentos/${solAc.id}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
    const tela9 = await pC.innerText('body');
    ok('9 pagina do pedido sem "[TIPO:"', !tela9.includes('[TIPO:'));
    await pC.getByRole('button', { name: /Modifica richiesta/ }).click(); await pC.waitForTimeout(600);
    await pC.fill('#ep-desc', 'Urto sul paraurti posteriore');
    await pC.getByRole('button', { name: /^Salva$/ }).click(); await pC.waitForTimeout(3000);
    const { data: d9 } = await sb.from('solicitacoes').select('descricao').eq('id', solAc.id).single();
    ok('9 descricao editada mantendo a marca interna', d9.descricao.startsWith('[TIPO:') && d9.descricao.includes('Urto sul paraurti'), d9.descricao);
  }

  // ---- 10) servidor: carro do acidente
  const cli2 = await conta('cliente', 'en');
  const { token } = await sessao(cli2);
  const enviar = async (dados) => {
    const fd = new FormData(); fd.append('dados', JSON.stringify({ idioma: 'en', tipoAcidente: 'outro_causou', endereco: 'Milano', latitude: 45.46, longitude: 9.19, ...dados }));
    const r = await fetch(`${SITE}/api/emergencia`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    const j = await r.json(); if (j.solicitacaoId) { sols.push(j.solicitacaoId); ems.push(j.id); }
    const { data } = await sb.from('solicitacoes').select('veiculo:veiculos(id, fipe_marca, fipe_modelo, placa), descricao').eq('id', j.solicitacaoId).single();
    return data;
  };
  const r1 = await enviar({ placa: 'EE-123', veiculoInfo: { marca: 'Skoda', modelo: 'Octavia' } });
  ok('10 carro informado no acidente vira carro cadastrado', r1?.veiculo?.fipe_marca === 'Skoda' && r1.veiculo.placa === 'EE-123', JSON.stringify(r1));
  ok('10 descricao sem texto padrao em portugues', r1?.descricao === '[TIPO:outro_causou]', r1?.descricao);
  const { data: v2 } = await sb.from('veiculos').insert({ profile_id: cli2.id, fipe_tipo: 'cars', fipe_marca: 'BMW', fipe_modelo: 'X1', fipe_ano: '2020' }).select('id').single();
  const r2 = await enviar({ veiculoId: v2.id });
  ok('10 carro escolhido na lista e usado', r2?.veiculo?.id === v2.id);
  const r3 = await enviar({});
  ok('10 dois carros e nenhum escolhido: carro "a completar" (nao pega o primeiro)', r3?.veiculo && !r3.veiculo.fipe_marca && r3.veiculo.id !== v2.id, JSON.stringify(r3?.veiculo));

  // ---- 11) aviso de nova mensagem (app)
  const { a: aCli } = await sessao(cli);
  const { data: m } = await aCli.from('mensagens').insert({ solicitacao_id: s.id, oficina_id: of.id, remetente_id: cli.id, texto: 'Ciao, arrivo domani' }).select('id').single();
  const { token: tCli } = await sessao(cli);
  const rAv = await fetch(`${SITE}/api/avisar-mensagem`, { method: 'POST', headers: { Authorization: `Bearer ${tCli}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagemId: m.id }) });
  const { data: nOf } = await sb.from('notificacoes').select('titulo, mensagem').eq('profile_id', ofi.id).eq('tipo', 'nova_mensagem');
  ok('11 oficina avisada da mensagem do app (em italiano)', rAv.ok && (nOf || []).some((n) => n.titulo === 'Nuovo messaggio' && n.mensagem.includes('arrivo')), JSON.stringify(nOf));
  const { token: tOf } = await sessao(ofi);
  const rFalso = await fetch(`${SITE}/api/avisar-mensagem`, { method: 'POST', headers: { Authorization: `Bearer ${tOf}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagemId: m.id }) });
  ok('11 so quem enviou pede o aviso', rFalso.status === 403);
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 700)); }
finally {
  await browser.close();
  for (const sid of sols) {
    const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', sid);
    for (const o of orcs || []) for (const t of ['orcamento_disponibilidade', 'orcamento_itens']) await sb.from(t).delete().eq('orcamento_id', o.id);
    for (const t of ['mensagens', 'agenda', 'orcamentos', 'solicitacao_fotos', 'analise_dano']) await sb.from(t).delete().eq('solicitacao_id', sid);
    await sb.from('solicitacoes').update({ emergencia_id: null }).eq('id', sid);
  }
  for (const eid of ems) for (const t of ['emergencia_fotos', 'emergencia_mensagens', 'emergencia_outro_veiculo', 'emergencia_oficinas_notificadas']) await sb.from(t).delete().eq('emergencia_id', eid);
  for (const eid of ems) await sb.from('emergencias').delete().eq('id', eid);
  for (const sid of sols) await sb.from('solicitacoes').delete().eq('id', sid);
  for (const oid of ofs) { await sb.from('agenda').delete().eq('oficina_id', oid); await sb.from('oficinas').delete().eq('id', oid); }
  for (const id of contas) { for (const [t, c] of [['veiculos', 'profile_id'], ['notificacoes', 'profile_id']]) await sb.from(t).delete().eq(c, id); await sb.from('emergencias').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
