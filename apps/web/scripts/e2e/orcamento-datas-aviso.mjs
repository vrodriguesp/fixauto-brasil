// E2E LOCAL: datas de check-in do orcamento x horario da oficina - CHECK-IN V2 (decisoes finais do dono 14/11 noite,
// Documentos/Analises/Checkin_v2_decisoes_finais_2026-11-14.md). Caso real 14/11: YuMotors ofereceu so "sabado a tarde",
// fechada no sabado pelo proprio perfil. Agora: datas vazias e obrigatorias, mini calendario com dias passados/fechados
// DESATIVADOS, faixas do perfil; dia fechado salvo (revisao/API) continua erro que bloqueia.
//  A calendario et/ru: vazio, realce do 1o dia aberto, sabado desativado, sexta 08-12 so com faixas da manha, legenda+link
//  B revisao com data salva num sabado fechado: erro na linha + envio bloqueado + link do perfil (aba nova); troca -> envia
//  C ru: 2 faixas no mesmo dia = 1 dia (dica); validade pre-preenchida (P5, 19/11); envio com 3 janelas
//  E relogio fixo: hoje so faixas que nao acabaram, aviso < 2 h, depois do fechamento hoje desativado, realce na segunda
//  G novas datas (079): mesmo seletor; sabado desativado; API DIA_FECHADO (turno e janela) e < 30 min; R4 rele o perfil
//  H em_andamento: datas salvas invalidas nao bloqueiam (R1)
//  F sem horario_funcionamento: padrao 006 (domingo desativado, sabado 08-12)
//   node orcamento-datas-aviso.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { escolherCheckin } from './ajuda-checkin.mjs';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
if (!/localhost|127.0.0.1/.test(env.NEXT_PUBLIC_SUPABASE_URL || '')) throw new Error('TESTE LOCAL: o banco configurado nao e o local - parado para nao tocar a producao');
const SITE = process.env.SITE || 'http://localhost:3100';
const OUT = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local/resultados/datas-aviso';
fs.mkdirSync(OUT, { recursive: true });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
// textos desta copia (as chaves novas ainda nao estao no repositorio principal)
const MSG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../messages');
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8'))));
const tr = (l) => { const m = msgs(l); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? `{${x}}`); };
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 240) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; let ofId; const sols = [];

// dias no fuso de Tallinn
const hojeTallinn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date());
const somar = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const proximo = (dow, depois = hojeTallinn) => { let d = somar(depois, 1); while (new Date(`${d}T12:00:00Z`).getUTCDay() !== dow) d = somar(d, 1); return d; };
const SAB = proximo(6), SEX = proximo(5), SEG = proximo(1), TER = proximo(2), QUA = proximo(3);
const HORARIO = {
  seg: { aberto: true, inicio: '08:00', fim: '18:00' }, ter: { aberto: true, inicio: '08:00', fim: '18:00' },
  qua: { aberto: true, inicio: '08:00', fim: '18:00' }, qui: { aberto: true, inicio: '08:00', fim: '18:00' },
  sex: { aberto: true, inicio: '08:00', fim: '12:00' }, sab: { aberto: false, inicio: '', fim: '' }, dom: { aberto: false, inicio: '', fim: '' },
};

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const celular = async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} });
  await c.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  return c;
};
const entrar = async (p, u) => {
  await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]');
  await p.waitForURL((x) => !x.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(2000);
};
const conta = async (tipo, nome) => {
  const email = `datas-${tipo}${contas.length}-${tag}@example.test`; const senha = `Dt${tag}Senha9`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error(error.message);
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma: 'et', telefone: '+372 5000 0000' });
  return { id: data.user.id, email, senha };
};
const semRolagem = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const datas = (p) => p.locator('input[type=date]:not(#cacb1-103)');
const visivel = (p, id) => p.getByTestId(id).isVisible().catch(() => false);
const texto = (p, id) => p.getByTestId(id).innerText().catch(() => '');
// mini calendario: avanca ate o mes do dia (a folha precisa estar aberta)
const irAoDia = async (p, ymd, pre = 'ck') => { for (let i = 0; i < 5 && !(await p.getByTestId(`${pre}-dia-${ymd}`).count()); i++) { await p.getByTestId(`${pre}-mes-seguinte`).click(); await p.waitForTimeout(120); } };
const abrir = async (p, pre, solId, waitUntil = 'networkidle') => {
  await p.goto(`${SITE}${pre}/oficina/orcamento/${solId}`, { waitUntil });
  await p.getByTestId('ck-adicionar').or(p.getByTestId('orcamento-encerrado')).first().waitFor({ timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
};
const novoPedido = async (cli, vId, n) => {
  const { data: sol, error } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: vId, tipo: 'mecanica', descricao: `teste datas ${n} ${tag}`, urgencia: 'media', status: 'aberta', latitude: 59.44, longitude: 24.76, endereco: 'Kesklinn', pais: 'EE' }).select('id').single();
  if (error) throw new Error(error.message);
  sols.push(sol.id);
  return sol.id;
};
const itens = async (p, T) => {
  await p.getByPlaceholder(T('oficinaEnviarOrcamento.placeholderDescricaoItem')).first().fill('Õlivahetus');
  await p.getByPlaceholder(T('oficinaEnviarOrcamento.placeholderValor')).first().fill('60');
};
const enviar = async (p) => { await p.getByTestId('enviar-orcamento').click(); await p.waitForTimeout(4500); };
const disp = async (solId) => {
  const { data: o } = await sb.from('orcamentos').select('id, valor_total, revisao_numero').eq('solicitacao_id', solId).eq('oficina_id', ofId).maybeSingle();
  if (!o) return { o: null, d: [] };
  const { data: d } = await sb.from('orcamento_disponibilidade').select('data_checkin, turno, hora_inicio, hora_fim').eq('orcamento_id', o.id).order('data_checkin');
  return { o, d: d || [] };
};

try {
  console.log(`hoje ${hojeTallinn} | sab ${SAB} sex ${SEX} seg ${SEG} ter ${TER} qua ${QUA}`);
  const dono = await conta('oficina', 'Dono Datas');
  const { data: of, error: eOf } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `DATAS ${tag}`, endereco: 'Kesktee 1', cidade: 'Tallinn', estado: 'Harju', cep: '10111', pais: 'EE', latitude: 59.437, longitude: 24.75, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica'], seguradoras_convencionadas: [], horario_funcionamento: HORARIO }).select('id').single();
  if (eOf) throw new Error(eOf.message);
  ofId = of.id;
  const cli = await conta('cliente', 'Klient Datas');
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: `Octavia ${tag}`, fipe_ano: '2015', placa: `D${tag}`.toUpperCase() }).select('id').single();
  const sol1 = await novoPedido(cli, v.id, 1);
  const sol2 = await novoPedido(cli, v.id, 2);

  const ctx = await celular(); const p = await ctx.newPage();
  await entrar(p, dono);

  // primeiro dia DEPOIS de hoje em que a oficina abre (manha, se o horario cobre)
  const proxAberto = (hoje) => { let d = somar(hoje, 1); while (!HORARIO[['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][new Date(`${d}T12:00:00Z`).getUTCDay()]].aberto) d = somar(d, 1); return d; };
  const linkOk = async (pg, id, pre) => {
    const l = pg.getByTestId(id);
    const href = await l.getAttribute('href').catch(() => '');
    return (await l.isVisible().catch(() => false)) && href === `${pre}/oficina/perfil#horario-funcionamento` && (await l.getAttribute('target')) === '_blank';
  };

  // ---------- A: calendario (check-in v2): vazio, proximo dia aberto realcado, sabado/domingo desativados,
  //            sexta (fecha 12:00) so com faixas da manha; legenda + link do perfil (aba nova); et e ru
  for (const [l, pre] of [['et', '/ee/et'], ['ru', '/ee/ru']]) {
    const T = tr(l);
    await abrir(p, pre, sol1);
    ok(`A ${l}: datas comecam vazias (nada pre-escolhido)`, (await p.getByTestId('ck-linha-0').count()) === 0 && (await p.getByTestId('ck-adicionar').innerText()).includes(T('seletorCheckin.adicionar').replace('+ ', '')));
    await p.getByTestId('ck-adicionar').click(); await p.waitForTimeout(300);
    const pa = proxAberto(hojeTallinn);
    await irAoDia(p, pa);
    ok(`A ${l}: 1o dia aberto depois de hoje (${pa}) so realcado`, (await p.getByTestId(`ck-dia-${pa}`).getAttribute('data-estado')) === 'realce');
    await irAoDia(p, SAB);
    ok(`A ${l}: sabado fechado DESATIVADO (caso 14/11)`, await p.getByTestId(`ck-dia-${SAB}`).isDisabled() && (await p.getByTestId(`ck-dia-${SAB}`).getAttribute('aria-disabled')) === 'true');
    const leg = await p.getByTestId('ck-folha').innerText();
    ok(`A ${l}: legenda dos dias cinza + link do perfil em aba nova`, leg.includes(T('seletorCheckin.legenda')) && (await p.getByTestId('ck-link-perfil').getAttribute('href')) === `${pre}/oficina/perfil#horario-funcionamento` && (await p.getByTestId('ck-link-perfil').getAttribute('target')) === '_blank');
    await irAoDia(p, SEX);
    await p.getByTestId(`ck-dia-${SEX}`).click(); await p.waitForTimeout(300);
    const chips = await p.locator('[data-testid^="ck-faixa-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    ok(`A ${l}: sexta 08-12 -> so 08-10 e 10-12 (nada de tarde)`, JSON.stringify(chips) === JSON.stringify(['ck-faixa-0800-1000', 'ck-faixa-1000-1200']), JSON.stringify(chips));
    ok(`A ${l}: sem rolagem lateral (390 px)`, await semRolagem(p));
    await p.screenshot({ path: `${OUT}/calendario-${l}-390.png` });
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  }

  // ---------- B: caso real 14/11 na revisao: orcamento salvo com 1 data num SABADO fechado (a tarde) -> erro na linha
  //            + envio bloqueado com o link do perfil (aba nova, o orcamento fica); troca por segunda -> envia
  {
    const T = tr('et');
    const { data: oB } = await sb.from('orcamentos').insert({ solicitacao_id: sol2, oficina_id: ofId, status: 'enviado', valor_total: 60, prazo_dias: 1, validade: somar(SAB, 3) }).select('id').single();
    await sb.from('orcamento_itens').insert({ orcamento_id: oB.id, descricao: 'Õlivahetus', tipo: 'mao_de_obra', quantidade: 1, valor_unitario: 60, valor_total: 60 });
    await sb.from('orcamento_disponibilidade').insert({ orcamento_id: oB.id, data_checkin: SAB, turno: 'tarde', data_previsao_entrega: somar(SAB, 1) });
    await sb.from('solicitacoes').update({ status: 'em_orcamento' }).eq('id', sol2);
    await abrir(p, '/ee/et', sol2);
    const av = p.getByTestId('ck-aviso-0');
    const txt = await av.innerText().catch(() => 'sem aviso');
    ok('B: data salva num sabado fechado (linha antiga 13-17) -> ERRO na linha', (await texto(p, 'ck-linha-0-texto')).includes('13:00–17:00') && (await av.getAttribute('data-tipo').catch(() => '')) === 'fechado' && txt.includes(T('oficinaEnviarOrcamento.erroDiaFechado')) && (await av.getAttribute('role')) === 'alert', txt);
    await p.getByTestId('enviar-orcamento').click(); await p.waitForTimeout(2500);
    const erro = await p.getByTestId('erro-dia-fechado').innerText().catch(() => '');
    ok('B: envio BLOQUEADO com a mensagem e o link do horario', erro.includes(T('oficinaEnviarOrcamento.erroDiaFechadoEnvio')) && await linkOk(p, 'link-horario-envio', '/ee/et'), erro || 'sem mensagem');
    ok('B: nada regravado', (await disp(sol2)).o.revisao_numero === 0);
    const [aba] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }), p.getByTestId('link-horario-envio').click()]);
    await aba.waitForLoadState('networkidle').catch(() => {}); await aba.waitForTimeout(2500);
    ok('B: link abre o perfil em aba nova no horario', aba.url().includes('/ee/et/oficina/perfil#horario-funcionamento'), aba.url());
    await aba.close();
    await p.getByTestId('ck-remover-0').click(); await p.waitForTimeout(200);
    await escolherCheckin(p, { dia: SEG, faixa: '0800-1000' });
    await p.locator('#cacb1-103').fill(somar(SEG, 7));
    ok('B: trocada para segunda -> erro some; 1 dia so -> dica', !(await visivel(p, 'erro-dia-fechado')) && !(await visivel(p, 'ck-aviso-0')) && await visivel(p, 'dica-mais-datas'));
    await enviar(p);
    const r = await disp(sol2);
    ok('B: revisao enviada com segunda 08-10 (a dica nao bloqueia)', r.o.revisao_numero === 1 && r.d.length === 1 && r.d[0].data_checkin === SEG && r.d[0].hora_inicio === '08:00:00', JSON.stringify(r));
  }

  // ---------- C: ru, 3 datas (2 no mesmo dia contam como 1), dica some com 2 dias; envio
  {
    const T = tr('ru');
    await abrir(p, '/ee/ru', sol1);
    await itens(p, T);
    await escolherCheckin(p, { dia: SEG, faixa: 'manha' });
    await escolherCheckin(p, { dia: SEG, faixa: 'tarde' });
    ok('C ru: 2 faixas no mesmo dia -> dica continua (1 dia so)', await visivel(p, 'dica-mais-datas'));
    await escolherCheckin(p, { dia: TER, faixa: 'tarde' });
    ok('C ru: dias diferentes -> sem dica e sem aviso', !(await visivel(p, 'dica-mais-datas')) && (await p.locator('[data-testid^=ck-aviso-]').count()) === 0);
    // P5 (dono 19/11): a validade e pre-preenchida com ultima data valida + 7 assim que ha datas (antes ficava vazia
    // e vermelha ao enviar)
    ok('C ru: validade pre-preenchida = ultima data + 7 (P5)', (await p.locator('#cacb1-103').inputValue()) === somar(TER, 7) && (await visivel(p, 'validade-auto')), await p.locator('#cacb1-103').inputValue());
    await enviar(p);
    const r = await disp(sol1);
    ok('C: enviado com as 3 janelas', r.d.length === 3 && r.d.every((x) => x.hora_inicio && x.hora_fim), JSON.stringify(r));
  }
  await ctx.close();

  // ---------- E: relogio fixo (inverno em Tallinn = UTC+2): hoje so com faixa que nao acabou; aviso < 2 h; depois do
  //            fechamento hoje fica desativado; sex 10:00 -> realce na segunda
  {
    const seg = proximo(1, somar(hojeTallinn, 7));
    const sex = somar(seg, 4);
    const sol3 = await novoPedido(cli, v.id, 3);
    const ctxE = await celular(); const pE = await ctxE.newPage();
    await entrar(pE, dono);
    await pE.clock.install({ time: new Date(`${seg}T13:30:00Z`) }); // seg 15:30
    await abrir(pE, '/ee/et', sol3, 'domcontentloaded'); await pE.waitForTimeout(1500);
    await pE.getByTestId('ck-adicionar').click(); await irAoDia(pE, seg);
    await pE.getByTestId(`ck-dia-${seg}`).click(); await pE.waitForTimeout(300);
    const chips = await pE.locator('[data-testid^="ck-faixa-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    ok('E: seg 15:30 -> hoje so 14-16 e 16-18', JSON.stringify(chips) === JSON.stringify(['ck-faixa-1400-1600', 'ck-faixa-1600-1800']), JSON.stringify(chips));
    await pE.getByTestId('ck-faixa-1400-1600').click(); await pE.waitForTimeout(300);
    const av = pE.getByTestId('ck-aviso-0');
    ok('E: janela de hoje que acaba em < 2 h -> aviso (sem bloquear)', (await av.getAttribute('data-tipo').catch(() => '')) === 'acaba-logo', await av.innerText().catch(() => 'sem aviso'));
    await pE.screenshot({ path: `${OUT}/hoje-acaba-logo-et-390.png` });
    await pE.clock.setSystemTime(new Date(`${seg}T16:30:00Z`)); // seg 18:30
    await abrir(pE, '/ee/et', sol3, 'domcontentloaded'); await pE.waitForTimeout(1500);
    await pE.getByTestId('ck-adicionar').click(); await irAoDia(pE, seg);
    ok('E: seg 18:30 -> hoje desativado (nenhuma faixa)', await pE.getByTestId(`ck-dia-${seg}`).isDisabled());
    await pE.keyboard.press('Escape');
    await pE.clock.setSystemTime(new Date(`${sex}T08:00:00Z`)); // sex 10:00
    await abrir(pE, '/ee/et', sol3, 'domcontentloaded'); await pE.waitForTimeout(1500);
    await pE.getByTestId('ck-adicionar').click(); await irAoDia(pE, somar(sex, 3));
    ok('E: sex 10:00 (sabado fechado) -> realce na segunda', (await pE.getByTestId(`ck-dia-${somar(sex, 3)}`).getAttribute('data-estado')) === 'realce');
    await ctxE.close();
  }

  // ---------- G: resposta a "novas datas" (079): mesmo seletor; sabado desativado; servidor recusa sabado
  //            (DIA_FECHADO); perfil mudado em outra aba + volta -> o calendario rele o horario (R4)
  {
    const T = tr('et');
    const sol5 = await novoPedido(cli, v.id, 5);
    await sb.from('solicitacoes').update({ status: 'em_orcamento' }).eq('id', sol5);
    const { data: o5 } = await sb.from('orcamentos').insert({ solicitacao_id: sol5, oficina_id: ofId, status: 'enviado', valor_total: 80, prazo_dias: 1, validade: somar(hojeTallinn, 30) }).select('id').single();
    await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o5.id, data_checkin: somar(hojeTallinn, -2), turno: 'manha', data_previsao_entrega: somar(hojeTallinn, -1) });
    await sb.from('orcamento_pedido_datas').insert({ orcamento_id: o5.id, solicitacao_id: sol5, oficina_id: ofId, cliente_id: cli.id, status: 'pendente', sugestoes: [] });
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { data: sess } = await anon.auth.signInWithPassword({ email: dono.email, password: dono.senha });
    const api = async (corpo) => { const r = await fetch(`${SITE}/api/orcamento/${o5.id}/novas-datas`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess?.session?.access_token}` }, body: JSON.stringify(corpo) }); return { s: r.status, b: await r.json().catch(() => ({})) }; };
    let r = await api({ horarios: [{ data: SAB, turno: 'manha' }] });
    ok('G API: sabado fechado (so turno, cliente antigo) -> 400 DIA_FECHADO', r.s === 400 && r.b.codigo === 'DIA_FECHADO', JSON.stringify(r));
    r = await api({ horarios: [{ data: SAB, hora_inicio: '09:00', hora_fim: '10:00' }] });
    ok('G API: sabado fechado com janela -> 400 DIA_FECHADO', r.s === 400 && r.b.codigo === 'DIA_FECHADO', JSON.stringify(r));
    r = await api({ horarios: [{ data: SEG, hora_inicio: '09:00', hora_fim: '09:20' }] });
    ok('G API: janela < 30 min -> 400', r.s === 400, JSON.stringify(r));
    const ctxG = await celular(); const pG = await ctxG.newPage();
    await entrar(pG, dono);
    await pG.goto(`${SITE}/ee/et/oficina/pedidos/${sol5}`, { waitUntil: 'networkidle' });
    await pG.getByTestId('novas-datas-pedidas').waitFor({ timeout: 20000 }).catch(() => {});
    ok('G: cartao "novas datas" com as linhas vazias', await visivel(pG, 'novas-datas-pedidas') && (await pG.getByTestId('nd-linha-0').count()) === 0);
    await pG.getByTestId('nd-adicionar').click(); await irAoDia(pG, SAB, 'nd');
    ok('G: sabado desativado no calendario das novas datas', await pG.getByTestId(`nd-dia-${SAB}`).isDisabled());
    await pG.keyboard.press('Escape');
    await sb.from('oficinas').update({ horario_funcionamento: { ...HORARIO, sab: { aberto: true, inicio: '08:00', fim: '18:00' } } }).eq('id', ofId);
    await pG.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await pG.waitForTimeout(1500);
    await pG.getByTestId('nd-adicionar').click(); await irAoDia(pG, SAB, 'nd');
    ok('G R4: sabado aberto no perfil + volta -> sabado escolhivel sem recarregar', await pG.getByTestId(`nd-dia-${SAB}`).isEnabled());
    await pG.keyboard.press('Escape');
    await sb.from('oficinas').update({ horario_funcionamento: HORARIO }).eq('id', ofId);
    await pG.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await pG.waitForTimeout(1500);
    await escolherCheckin(pG, { pre: 'nd', dia: SEX, faixa: '1000-1200' });
    await pG.getByTestId('nd-enviar').click();
    await pG.getByTestId('novas-datas-feito').waitFor({ timeout: 15000 }).catch(() => {});
    const { data: sl5 } = await sb.from('orcamento_disponibilidade').select('data_checkin, turno, hora_inicio, hora_fim, origem').eq('orcamento_id', o5.id).gte('data_checkin', hojeTallinn);
    ok('G: enviada sexta 10-12 com a janela', (await visivel(pG, 'novas-datas-feito')) && sl5?.length === 1 && sl5[0].data_checkin === SEX && sl5[0].hora_inicio === '10:00:00' && sl5[0].hora_fim === '12:00:00' && sl5[0].origem === 'oficina', JSON.stringify(sl5));
    await ctxG.close();
  }

  // ---------- H: em_andamento (cartao das datas escondido): datas salvas invalidas nao bloqueiam (R1)
  {
    const T = tr('et');
    const sol6 = await novoPedido(cli, v.id, 6);
    await sb.from('solicitacoes').update({ status: 'em_andamento' }).eq('id', sol6);
    const { data: o6, error: eO6 } = await sb.from('orcamentos').insert({ solicitacao_id: sol6, oficina_id: ofId, status: 'enviado', valor_total: 60, prazo_dias: 1, validade: somar(hojeTallinn, 30) }).select('id').single();
    if (eO6) throw new Error(eO6.message);
    await sb.from('orcamento_itens').insert({ orcamento_id: o6.id, descricao: 'Õlivahetus', tipo: 'mao_de_obra', quantidade: 1, valor_unitario: 60, valor_total: 60 });
    const PASSADO = somar(hojeTallinn, -3);
    await sb.from('orcamento_disponibilidade').insert([
      { orcamento_id: o6.id, data_checkin: PASSADO, turno: 'manha', data_previsao_entrega: somar(PASSADO, 1) },
      { orcamento_id: o6.id, data_checkin: SAB, turno: 'manha', data_previsao_entrega: somar(SAB, 1) },
    ]);
    const ctxH = await celular(); const pH = await ctxH.newPage();
    await entrar(pH, dono);
    await pH.goto(`${SITE}/ee/et/oficina/orcamento/${sol6}`, { waitUntil: 'networkidle' });
    const valor = pH.getByPlaceholder(T('oficinaEnviarOrcamento.placeholderValor')).first();
    await valor.waitFor({ timeout: 20000 }).catch(() => {}); await pH.waitForTimeout(1500);
    ok('H: em_andamento -> "veiculo ja na oficina" e nenhum seletor de data', (await pH.getByText(T('oficinaEnviarOrcamento.veiculoJaNaOficina')).isVisible().catch(() => false)) && (await pH.getByTestId('ck-adicionar').count()) === 0);
    await valor.fill('90');
    await enviar(pH);
    const r = await disp(sol6);
    ok('H: edicao enviada mesmo com datas salvas num sabado fechado e no passado', !!r.o && Number(r.o.valor_total) === 90 && r.o.revisao_numero === 1, JSON.stringify(r));
    ok('H: sem erro na tela (dia fechado / envio / validade)', !(await visivel(pH, 'erro-dia-fechado')) && !(await visivel(pH, 'erro-envio-orcamento')) && !(await visivel(pH, 'erro-validade')));
    ok('H: datas salvas regravadas (dia e turno iguais)', r.d.map((x) => `${x.data_checkin} ${x.turno}`).join(',') === `${PASSADO} manha,${SAB} manha`, JSON.stringify(r.d));
    await ctxH.close();
  }

  // ---------- F: oficina sem horario_funcionamento: padrao da migracao 006 (domingo desativado, sabado 08-12)
  {
    const T = tr('et');
    await sb.from('oficinas').update({ horario_funcionamento: null }).eq('id', ofId);
    const sol4 = await novoPedido(cli, v.id, 4);
    const ctxF = await celular(); const pF = await ctxF.newPage();
    await entrar(pF, dono);
    await abrir(pF, '/ee/et', sol4);
    await itens(pF, T);
    await pF.getByTestId('ck-adicionar').click(); await irAoDia(pF, somar(SAB, 1));
    ok('F sem horario: domingo desativado (padrao 006)', await pF.getByTestId(`ck-dia-${somar(SAB, 1)}`).isDisabled());
    await pF.getByTestId(`ck-dia-${SAB}`).click(); await pF.waitForTimeout(300);
    const chips = await pF.locator('[data-testid^="ck-faixa-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    ok('F sem horario: sabado 08-12 (padrao 006)', JSON.stringify(chips) === JSON.stringify(['ck-faixa-0800-1000', 'ck-faixa-1000-1200']), JSON.stringify(chips));
    await pF.getByTestId('ck-faixa-1000-1200').click(); await pF.waitForTimeout(300);
    await pF.locator('#cacb1-103').fill(somar(SAB, 7));
    ok('F sem horario: sem aviso nem erro na linha', !(await visivel(pF, 'ck-aviso-0')));
    await enviar(pF);
    const r = await disp(sol4);
    ok('F sem horario: envio funciona', r.d.length === 1 && r.d[0].data_checkin === SAB, JSON.stringify(r));
    await ctxF.close();
  }
} catch (e) {
  falhas++; console.log('ERRO', e.message);
} finally {
  await browser.close();
  for (const s of sols) {
    const { data: os } = await sb.from('orcamentos').select('id').eq('solicitacao_id', s);
    await sb.from('orcamento_pedido_datas').delete().eq('solicitacao_id', s);
    for (const o of os || []) { await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await sb.from('orcamento_itens').delete().eq('orcamento_id', o.id); }
    await sb.from('mensagens').delete().eq('solicitacao_id', s);
    await sb.from('orcamentos').delete().eq('solicitacao_id', s); await sb.from('pedido_vistos').delete().eq('solicitacao_id', s); await sb.from('solicitacoes').delete().eq('id', s);
  }
  if (ofId) { await sb.from('comissao_config').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
