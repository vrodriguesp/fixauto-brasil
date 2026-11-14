// E2E LOCAL: datas de check-in do orcamento x horario da oficina (caso real 14/11: YuMotors
// ofereceu so "sabado a tarde", fechada no sabado pelo proprio perfil; o horario venceu no dia).
// Tudo so aviso - enviar continua possivel (dono 14/11).
//  A oficina com sabado fechado, 390 px, et e ru: data no sabado -> aviso "fechado neste dia";
//    sexta a tarde (fecha as 12) -> aviso do periodo; sugestao inicial nunca cai em dia fechado
//  B uma data so -> dica "pelo menos 2 datas em dias diferentes"; envio com 1 data num dia
//    fechado funciona (orcamento + disponibilidade gravados)
//  C editar o orcamento: o aviso aparece na data ja salva; com mais 2 dias abertos a dica some
//    e a revisao e enviada
//  D outro pedido: 2 e 3 datas em dias abertos -> nenhum aviso nem dica; envio funciona
//  E relogio fixo (seg 15:30 Tallinn): sugestao inicial pula a tarde de hoje (acaba em < 2 h)
//    e, escolhida a tarde de hoje, aparece o aviso "acaba em menos de 2 horas"
//  + sem rolagem lateral a 390 px
//   node orcamento-datas-aviso.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
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
const turnos = (p, T) => p.locator(`select[aria-label="${T('oficinaEnviarOrcamento.manhaHorario')} / ${T('oficinaEnviarOrcamento.tardeHorario')}"]`);
const visivel = (p, id) => p.getByTestId(id).isVisible().catch(() => false);
const abrir = async (p, pre, solId, waitUntil = 'networkidle') => {
  await p.goto(`${SITE}${pre}/oficina/orcamento/${solId}`, { waitUntil });
  await datas(p).first().waitFor({ timeout: 20000 }).catch(() => {});
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
  const { data: d } = await sb.from('orcamento_disponibilidade').select('data_checkin, turno').eq('orcamento_id', o.id).order('data_checkin');
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

  // ---------- A: aviso do dia fechado / periodo fora do horario, et e ru
  for (const [l, pre] of [['et', '/ee/et'], ['ru', '/ee/ru']]) {
    const T = tr(l);
    await abrir(p, pre, sol1);
    const d0 = await datas(p).first().inputValue();
    const dow0 = new Date(`${d0}T12:00:00Z`).getUTCDay();
    ok(`A ${l}: sugestao inicial (${d0}) num dia em que a oficina abre`, d0 && dow0 !== 0 && dow0 !== 6, d0);
    ok(`A ${l}: sugestao inicial sem aviso`, !(await visivel(p, 'aviso-slot-0')));
    ok(`A ${l}: uma data so -> dica "pelo menos 2 datas"`, (await p.getByTestId('dica-mais-datas').innerText().catch(() => '')).includes(T('oficinaEnviarOrcamento.dicaMaisDatas')));
    await datas(p).first().fill(SAB); await p.waitForTimeout(400);
    const av = p.getByTestId('aviso-slot-0');
    ok(`A ${l}: sabado -> aviso "fechado neste dia"`, (await av.getAttribute('data-tipo').catch(() => '')) === 'fechado' && (await av.innerText().catch(() => '')).includes(T('oficinaEnviarOrcamento.avisoDiaFechado')), await av.innerText().catch(() => 'sem aviso'));
    ok(`A ${l}: aviso ligado ao campo (aria-describedby)`, (await datas(p).first().getAttribute('aria-describedby')) === 'aviso-slot-0');
    ok(`A ${l}: aviso nao bloqueia - botao enviar ativo`, await p.getByTestId('enviar-orcamento').isEnabled());
    ok(`A ${l}: sem rolagem lateral com o aviso (390 px)`, await semRolagem(p));
    await av.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/sabado-fechado-${l}-390.png` });
    // sexta: abre 08-12; tarde 13-17 fica fora
    await datas(p).first().fill(SEX); await turnos(p, T).first().selectOption('tarde'); await p.waitForTimeout(400);
    ok(`A ${l}: sexta a tarde (fecha 12:00) -> aviso do periodo com o horario`, (await av.getAttribute('data-tipo').catch(() => '')) === 'turno' && (await av.innerText().catch(() => '')).includes(T('oficinaEnviarOrcamento.avisoTurnoForaHorario', { inicio: '08:00', fim: '12:00' })), await av.innerText().catch(() => 'sem aviso'));
    if (l === 'et') { await av.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/sexta-tarde-${l}-390.png` }); }
    await turnos(p, T).first().selectOption('manha'); await p.waitForTimeout(300);
    ok(`A ${l}: sexta de manha -> sem aviso`, !(await visivel(p, 'aviso-slot-0')));
  }

  // ---------- B: 1 data so, num sabado fechado: envia mesmo assim
  {
    const T = tr('et');
    await abrir(p, '/ee/et', sol1);
    await itens(p, T);
    await datas(p).first().fill(SAB); await p.waitForTimeout(300);
    ok('B: aviso + dica visiveis antes de enviar', (await visivel(p, 'aviso-slot-0')) && (await visivel(p, 'dica-mais-datas')));
    await p.getByTestId('dica-mais-datas').evaluate((e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/uma-data-dica-et-390.png` });
    await enviar(p);
    const r = await disp(sol1);
    ok('B: envio com 1 data num dia fechado funciona (orcamento gravado)', !!r.o && Number(r.o.valor_total) === 60, JSON.stringify(r));
    ok('B: disponibilidade gravada = o sabado escolhido', r.d.length === 1 && r.d[0].data_checkin === SAB, JSON.stringify(r.d));
    ok('B: sem erro de envio na tela', !(await visivel(p, 'erro-envio-orcamento')));
  }

  // ---------- C: editar: aviso na data salva; +2 dias abertos -> dica some; revisao enviada
  {
    const T = tr('ru');
    await abrir(p, '/ee/ru', sol1);
    ok('C ru: editando, a data salva (sabado) ja mostra o aviso', (await datas(p).first().inputValue()) === SAB && (await p.getByTestId('aviso-slot-0').getAttribute('data-tipo').catch(() => '')) === 'fechado');
    await p.getByText(T('oficinaEnviarOrcamento.adicionarDataDisponivel')).click(); await datas(p).nth(1).fill(SEG);
    await p.waitForTimeout(300);
    ok('C ru: 2 dias diferentes (um fechado) -> dica some', !(await visivel(p, 'dica-mais-datas')));
    await p.getByText(T('oficinaEnviarOrcamento.adicionarDataDisponivel')).click(); await datas(p).nth(2).fill(TER); await turnos(p, T).nth(2).selectOption('tarde');
    await p.waitForTimeout(300);
    ok('C ru: so a data fechada tem aviso', (await visivel(p, 'aviso-slot-0')) && !(await visivel(p, 'aviso-slot-1')) && !(await visivel(p, 'aviso-slot-2')));
    ok('C ru: sem rolagem lateral (390 px)', await semRolagem(p));
    await enviar(p);
    const r = await disp(sol1);
    ok('C: revisao enviada com as 3 datas', r.d.length === 3 && r.d.map((x) => x.data_checkin).join(',') === [SAB, SEG, TER].sort().join(','), JSON.stringify(r));
  }

  // ---------- D: 2 e 3 datas em dias abertos: nada de aviso nem dica; envio funciona
  {
    const T = tr('et');
    await abrir(p, '/ee/et', sol2);
    await itens(p, T);
    await datas(p).first().fill(SEG); await turnos(p, T).first().selectOption('manha');
    await p.getByText(T('oficinaEnviarOrcamento.adicionarDataDisponivel')).click(); await datas(p).nth(1).fill(TER); await turnos(p, T).nth(1).selectOption('tarde');
    await p.waitForTimeout(300);
    ok('D: 2 datas em dias abertos diferentes -> sem dica', !(await visivel(p, 'dica-mais-datas')));
    ok('D: 2 datas -> sem aviso', !(await visivel(p, 'aviso-slot-0')) && !(await visivel(p, 'aviso-slot-1')));
    await p.getByText(T('oficinaEnviarOrcamento.adicionarDataDisponivel')).click(); await datas(p).nth(2).fill(QUA);
    await p.waitForTimeout(300);
    ok('D: 3 datas em dias abertos -> nenhum aviso nem dica', (await p.locator('[data-testid^=aviso-slot-], [data-testid=dica-mais-datas]').count()) === 0);
    await datas(p).nth(2).evaluate((e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/tres-datas-sem-aviso-et-390.png` });
    // duas datas no mesmo dia contam como um dia so
    await datas(p).nth(1).fill(SEG); await datas(p).nth(2).fill(SEG); await turnos(p, T).nth(1).selectOption('tarde'); await p.waitForTimeout(300);
    ok('D: 3 periodos no mesmo dia -> dica volta (1 dia so)', await visivel(p, 'dica-mais-datas'));
    await datas(p).nth(1).fill(TER); await datas(p).nth(2).fill(QUA); await p.waitForTimeout(300);
    await enviar(p);
    const r = await disp(sol2);
    ok('D: envio com 3 datas em dias abertos funciona', r.d.length === 3, JSON.stringify(r));
  }
  await ctx.close();

  // ---------- E: relogio fixo segunda 15:30 em Tallinn (tarde acaba em < 2 h)
  {
    const T = tr('et');
    const seg = proximo(1, somar(hojeTallinn, 7));
    const sol3 = await novoPedido(cli, v.id, 3);
    const ctxE = await celular(); const pE = await ctxE.newPage();
    await entrar(pE, dono);
    const instante = new Date(`${seg}T13:30:00Z`); // 15:30 EET (inverno)
    await pE.clock.install({ time: instante });
    // relogio falso: a rede nunca fica parada (networkidle), espera o formulario
    await abrir(pE, '/ee/et', sol3, 'domcontentloaded'); await pE.waitForTimeout(2000);
    const ter = somar(seg, 1);
    const d0 = await datas(pE).first().inputValue(); const t0 = await turnos(pE, T).first().inputValue();
    ok(`E: as 15:30 a sugestao inicial pula a tarde de hoje -> ${ter} manha`, d0 === ter && t0 === 'manha', `${d0} ${t0}`);
    await datas(pE).first().fill(seg); await pE.waitForTimeout(400);
    const av = pE.getByTestId('aviso-slot-0');
    ok('E: hoje a tarde (acaba em 1,5 h) -> aviso "menos de 2 horas"', (await turnos(pE, T).first().inputValue()) === 'tarde' && (await av.getAttribute('data-tipo').catch(() => '')) === 'acaba-logo' && (await av.innerText().catch(() => '')).includes(T('oficinaEnviarOrcamento.avisoTurnoAcabaLogo', { horas: 2 })), await av.innerText().catch(() => 'sem aviso'));
    await av.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); await pE.waitForTimeout(300);
    await pE.screenshot({ path: `${OUT}/hoje-acaba-logo-et-390.png` });
    await ctxE.close();
  }
} catch (e) {
  falhas++; console.log('ERRO', e.message);
} finally {
  await browser.close();
  for (const s of sols) {
    const { data: os } = await sb.from('orcamentos').select('id').eq('solicitacao_id', s);
    for (const o of os || []) { await sb.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await sb.from('orcamento_itens').delete().eq('orcamento_id', o.id); }
    await sb.from('mensagens').delete().eq('solicitacao_id', s);
    await sb.from('orcamentos').delete().eq('solicitacao_id', s); await sb.from('pedido_vistos').delete().eq('solicitacao_id', s); await sb.from('solicitacoes').delete().eq('id', s);
  }
  if (ofId) { await sb.from('comissao_config').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
