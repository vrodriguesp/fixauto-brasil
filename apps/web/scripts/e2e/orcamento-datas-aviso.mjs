// E2E LOCAL: datas de check-in do orcamento x horario da oficina (caso real 14/11: YuMotors
// ofereceu so "sabado a tarde", fechada no sabado pelo proprio perfil; o horario venceu no dia).
// Decisoes do dono 14/11: dia FECHADO bloqueia o envio; periodo fora do horario, periodo de hoje
// que acaba em < 2 h e "pelo menos 2 datas" so avisam; sugestao inicial nunca hoje, sempre o
// proximo dia em que a oficina abre; link para o horario no perfil (aba nova).
//  A oficina com sabado fechado, 390 px, et e ru: sugestao inicial = 1o dia aberto depois de hoje;
//    sabado -> erro "fechado" + link do perfil (href e aba nova); sexta a tarde (fecha 12) -> aviso
//    do periodo + link; sexta de manha -> nada
//  B 1 data so num sabado: envio BLOQUEADO com a mensagem e o link (nada gravado); o link abre o
//    perfil numa aba nova no cartao do horario; trocada para segunda -> envia (dica de 2 datas
//    nao bloqueia)
//  C editar: + sexta a tarde (aviso) + sabado (erro) -> bloqueado; sabado -> terca -> revisao enviada
//    com sexta a tarde (aviso nao bloqueia)
//  D outro pedido: 2 e 3 datas em dias abertos -> nenhum aviso nem dica; envio funciona
//  E relogio fixo: seg 09:00 -> sugestao terca de manha; sex 10:00 (sabado fechado) -> segunda;
//    seg 15:30 escolhendo hoje -> tarde + aviso "menos de 2 horas"
//  G resposta a "novas datas" (079): sugestao no 1o dia aberto, sabado = erro + botao desativado, sexta a
//    tarde = aviso e envia; API recusa sabado com DIA_FECHADO; horario mudado no perfil + volta para a aba
//    (visibilitychange) -> o cartao rele o horario e o erro some / volta (auditoria Fable R4)
//  H carro ja na oficina (em_andamento): cartao das datas escondido; editar o orcamento com datas salvas
//    num sabado fechado e no passado NAO bloqueia (nao ha campo para corrigir) e as datas ficam como
//    estavam (auditoria Fable R1)
//  F oficina sem horario_funcionamento: sugestao amanha de manha, nenhum aviso, envio normal
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

  // primeiro dia DEPOIS de hoje em que a oficina abre (manha, se o horario cobre)
  const proxAberto = (hoje) => { let d = somar(hoje, 1); while (!HORARIO[['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][new Date(`${d}T12:00:00Z`).getUTCDay()]].aberto) d = somar(d, 1); return d; };
  const linkOk = async (pg, id, pre) => {
    const l = pg.getByTestId(id);
    const href = await l.getAttribute('href').catch(() => '');
    return (await l.isVisible().catch(() => false)) && href === `${pre}/oficina/perfil#horario-funcionamento` && (await l.getAttribute('target')) === '_blank';
  };

  // ---------- A: erro do dia fechado / aviso do periodo fora do horario, et e ru
  for (const [l, pre] of [['et', '/ee/et'], ['ru', '/ee/ru']]) {
    const T = tr(l);
    await abrir(p, pre, sol1);
    const d0 = await datas(p).first().inputValue();
    ok(`A ${l}: sugestao inicial = 1o dia aberto depois de hoje (${proxAberto(hojeTallinn)}), de manha`, d0 === proxAberto(hojeTallinn) && d0 > hojeTallinn && (await turnos(p, T).first().inputValue()) === 'manha', d0);
    ok(`A ${l}: sugestao inicial sem aviso`, !(await visivel(p, 'aviso-slot-0')));
    ok(`A ${l}: uma data so -> dica "pelo menos 2 datas"`, (await p.getByTestId('dica-mais-datas').innerText().catch(() => '')).includes(T('oficinaEnviarOrcamento.dicaMaisDatas')));
    await datas(p).first().fill(SAB); await p.waitForTimeout(400);
    const av = p.getByTestId('aviso-slot-0');
    const txt = await av.innerText().catch(() => 'sem aviso');
    ok(`A ${l}: sabado -> ERRO "fechado neste dia" (vermelho, role=alert)`, (await av.getAttribute('data-tipo').catch(() => '')) === 'fechado' && txt.includes(T('oficinaEnviarOrcamento.erroDiaFechado')) && (await av.getAttribute('role')) === 'alert' && /red/.test(await av.getAttribute('class')), txt);
    ok(`A ${l}: erro com a dica do perfil + link para o horario (aba nova)`, txt.includes(T('oficinaEnviarOrcamento.dicaHorarioPerfil')) && await linkOk(p, 'link-horario-0', pre), await p.getByTestId('link-horario-0').getAttribute('href').catch(() => 'sem link'));
    ok(`A ${l}: erro ligado ao campo (aria-describedby + aria-invalid)`, (await datas(p).first().getAttribute('aria-describedby')) === 'aviso-slot-0' && (await datas(p).first().getAttribute('aria-invalid')) === 'true');
    ok(`A ${l}: sem rolagem lateral com o erro (390 px)`, await semRolagem(p));
    await av.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/sabado-fechado-${l}-390.png` });
    // sexta: abre 08-12; tarde 13-17 fica fora (so aviso)
    await datas(p).first().fill(SEX); await turnos(p, T).first().selectOption('tarde'); await p.waitForTimeout(400);
    const txt2 = await av.innerText().catch(() => 'sem aviso');
    ok(`A ${l}: sexta a tarde (fecha 12:00) -> aviso amarelo do periodo com o horario`, (await av.getAttribute('data-tipo').catch(() => '')) === 'turno' && txt2.includes(T('oficinaEnviarOrcamento.avisoTurnoForaHorario', { inicio: '08:00', fim: '12:00' })) && /amber/.test(await av.getAttribute('class')), txt2);
    ok(`A ${l}: aviso do periodo com a dica + link do perfil`, txt2.includes(T('oficinaEnviarOrcamento.dicaHorarioPerfil')) && await linkOk(p, 'link-horario-0', pre));
    if (l === 'et') { await av.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/sexta-tarde-${l}-390.png` }); }
    await turnos(p, T).first().selectOption('manha'); await p.waitForTimeout(300);
    ok(`A ${l}: sexta de manha -> sem aviso`, !(await visivel(p, 'aviso-slot-0')));
  }

  // ---------- B: 1 data so num sabado: bloqueado; trocada para segunda: envia
  {
    const T = tr('et');
    await abrir(p, '/ee/et', sol1);
    await itens(p, T);
    await datas(p).first().fill(SAB); await p.waitForTimeout(300);
    await p.getByTestId('enviar-orcamento').click(); await p.waitForTimeout(2500);
    const erro = await p.getByTestId('erro-dia-fechado').innerText().catch(() => '');
    ok('B: envio com data em dia fechado BLOQUEADO com a mensagem', erro.includes(T('oficinaEnviarOrcamento.erroDiaFechadoEnvio')), erro || 'sem mensagem');
    ok('B: mensagem do envio com o link do horario', await linkOk(p, 'link-horario-envio', '/ee/et'));
    ok('B: nada gravado', !(await disp(sol1)).o);
    ok('B: sem rolagem lateral com a mensagem', await semRolagem(p));
    await p.getByTestId('erro-dia-fechado').evaluate((e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/envio-bloqueado-et-390.png` });
    // o link abre o perfil numa aba nova, no cartao do horario; o orcamento continua preenchido aqui
    const [aba] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }), p.getByTestId('link-horario-envio').click()]);
    await aba.waitForLoadState('networkidle').catch(() => {}); await aba.waitForTimeout(2500);
    const naTela = await aba.evaluate(() => { const r = document.getElementById('horario-funcionamento')?.getBoundingClientRect(); return r ? r.top >= -5 && r.top < window.innerHeight / 2 : false; });
    ok('B: link abre o perfil em aba nova com o horario de funcionamento na tela', aba.url().includes('/ee/et/oficina/perfil#horario-funcionamento') && naTela, aba.url());
    await aba.screenshot({ path: `${OUT}/perfil-horario-et-390.png` });
    await aba.close();
    ok('B: o orcamento continua preenchido na aba original', (await datas(p).first().inputValue()) === SAB && (await p.getByPlaceholder(T('oficinaEnviarOrcamento.placeholderDescricaoItem')).first().inputValue()) === 'Õlivahetus');
    await datas(p).first().fill(SEG); await p.waitForTimeout(300);
    ok('B: trocada para segunda -> erro some, dica de 2 datas continua', !(await visivel(p, 'erro-dia-fechado')) && !(await visivel(p, 'aviso-slot-0')) && (await visivel(p, 'dica-mais-datas')));
    await p.getByTestId('dica-mais-datas').evaluate((e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/uma-data-dica-et-390.png` });
    await enviar(p);
    const r = await disp(sol1);
    ok('B: envio com 1 data (dia aberto) funciona - a dica nao bloqueia', !!r.o && Number(r.o.valor_total) === 60 && r.d.length === 1 && r.d[0].data_checkin === SEG, JSON.stringify(r));
    ok('B: sem erro de envio na tela', !(await visivel(p, 'erro-envio-orcamento')));
  }

  // ---------- C: editar: + sexta a tarde (aviso) + sabado (erro) -> bloqueado; sabado -> terca -> enviado
  {
    const T = tr('ru');
    await abrir(p, '/ee/ru', sol1);
    ok('C ru: editando, a data salva (segunda) sem aviso', (await datas(p).first().inputValue()) === SEG && !(await visivel(p, 'aviso-slot-0')));
    await p.getByText(T('oficinaEnviarOrcamento.adicionarDataDisponivel')).click(); await datas(p).nth(1).fill(SEX); await turnos(p, T).nth(1).selectOption('tarde');
    await p.waitForTimeout(300);
    ok('C ru: 2 dias diferentes -> dica some; sexta a tarde com aviso', !(await visivel(p, 'dica-mais-datas')) && (await p.getByTestId('aviso-slot-1').getAttribute('data-tipo').catch(() => '')) === 'turno');
    await p.getByText(T('oficinaEnviarOrcamento.adicionarDataDisponivel')).click(); await datas(p).nth(2).fill(SAB);
    await p.waitForTimeout(300);
    ok('C ru: sabado com erro', (await p.getByTestId('aviso-slot-2').getAttribute('data-tipo').catch(() => '')) === 'fechado');
    await p.getByTestId('enviar-orcamento').click(); await p.waitForTimeout(2500);
    const erro = await p.getByTestId('erro-dia-fechado').innerText().catch(() => '');
    ok('C ru: revisao com sabado BLOQUEADA (mensagem em ru)', erro.includes(T('oficinaEnviarOrcamento.erroDiaFechadoEnvio')), erro || 'sem mensagem');
    ok('C: a revisao nao foi gravada (continua so a segunda)', (await disp(sol1)).d.length === 1);
    ok('C ru: sem rolagem lateral (390 px)', await semRolagem(p));
    await p.getByTestId('erro-dia-fechado').evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/envio-bloqueado-ru-390.png` });
    await datas(p).nth(2).fill(TER); await turnos(p, T).nth(2).selectOption('tarde'); await p.waitForTimeout(300);
    ok('C ru: sabado -> terca: erro some, aviso da sexta continua', !(await visivel(p, 'erro-dia-fechado')) && !(await visivel(p, 'aviso-slot-2')) && (await visivel(p, 'aviso-slot-1')));
    await enviar(p);
    const r = await disp(sol1);
    ok('C: revisao enviada com as 3 datas (sexta a tarde nao bloqueia)', r.d.length === 3 && r.d.map((x) => x.data_checkin).join(',') === [SEG, SEX, TER].sort().join(','), JSON.stringify(r));
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

  // ---------- E: relogio fixo (horario de inverno em Tallinn = UTC+2)
  {
    const T = tr('et');
    const seg = proximo(1, somar(hojeTallinn, 7));
    const sex = somar(seg, 4);
    const sol3 = await novoPedido(cli, v.id, 3);
    const ctxE = await celular(); const pE = await ctxE.newPage();
    await entrar(pE, dono);
    const sugestao = async () => [await datas(pE).first().inputValue(), await turnos(pE, T).first().inputValue()].join(' ');
    // relogio falso: a rede nunca fica parada (networkidle), espera o formulario
    await pE.clock.install({ time: new Date(`${seg}T07:00:00Z`) }); // seg 09:00
    await abrir(pE, '/ee/et', sol3, 'domcontentloaded'); await pE.waitForTimeout(2000);
    ok('E: seg 09:00 -> sugestao terca de manha (nunca hoje)', (await sugestao()) === `${somar(seg, 1)} manha`, await sugestao());
    await pE.clock.setSystemTime(new Date(`${sex}T08:00:00Z`)); // sex 10:00, sabado e domingo fechados
    await abrir(pE, '/ee/et', sol3, 'domcontentloaded'); await pE.waitForTimeout(2000);
    ok('E: sex 10:00 (sabado fechado) -> sugestao segunda de manha', (await sugestao()) === `${somar(sex, 3)} manha`, await sugestao());
    await pE.clock.setSystemTime(new Date(`${seg}T13:30:00Z`)); // seg 15:30
    await abrir(pE, '/ee/et', sol3, 'domcontentloaded'); await pE.waitForTimeout(2000);
    ok('E: seg 15:30 -> sugestao terca de manha', (await sugestao()) === `${somar(seg, 1)} manha`, await sugestao());
    await datas(pE).first().fill(seg); await pE.waitForTimeout(400);
    const av = pE.getByTestId('aviso-slot-0');
    ok('E: hoje escolhido a mao -> tarde + aviso "menos de 2 horas" (sem link do perfil)', (await turnos(pE, T).first().inputValue()) === 'tarde' && (await av.getAttribute('data-tipo').catch(() => '')) === 'acaba-logo' && (await av.innerText().catch(() => '')).includes(T('oficinaEnviarOrcamento.avisoTurnoAcabaLogo', { horas: 2 })) && !(await visivel(pE, 'link-horario-0')), await av.innerText().catch(() => 'sem aviso'));
    await av.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); await pE.waitForTimeout(300);
    await pE.screenshot({ path: `${OUT}/hoje-acaba-logo-et-390.png` });
    await ctxE.close();
  }
  // ---------- G: resposta a "novas datas" (079) com as mesmas regras + servidor recusa dia fechado
  {
    const T = tr('et');
    const sol5 = await novoPedido(cli, v.id, 5);
    await sb.from('solicitacoes').update({ status: 'em_orcamento' }).eq('id', sol5);
    const { data: o5, error: eO5 } = await sb.from('orcamentos').insert({ solicitacao_id: sol5, oficina_id: ofId, status: 'enviado', valor_total: 80, prazo_dias: 1, validade: somar(hojeTallinn, 30) }).select('id').single();
    if (eO5) throw new Error(eO5.message);
    await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o5.id, data_checkin: somar(hojeTallinn, -2), turno: 'manha', data_previsao_entrega: somar(hojeTallinn, -1) });
    const { error: ePd } = await sb.from('orcamento_pedido_datas').insert({ orcamento_id: o5.id, solicitacao_id: sol5, oficina_id: ofId, cliente_id: cli.id, status: 'pendente', sugestoes: [] });
    if (ePd) throw new Error(ePd.message);
    // servidor: dia fechado recusado mesmo sem a tela (DIA_FECHADO)
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { data: sess } = await anon.auth.signInWithPassword({ email: dono.email, password: dono.senha });
    const rApi = await fetch(`${SITE}/api/orcamento/${o5.id}/novas-datas`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess?.session?.access_token}` }, body: JSON.stringify({ horarios: [{ data: SAB, turno: 'manha' }] }) });
    const bApi = await rApi.json().catch(() => ({}));
    ok('G API: novas datas num sabado fechado -> 400 DIA_FECHADO', rApi.status === 400 && bApi.codigo === 'DIA_FECHADO', `${rApi.status} ${JSON.stringify(bApi)}`);
    ok('G: texto do erro DIA_FECHADO existe nos 6 idiomas', ['et', 'ru', 'en', 'it', 'pt-PT', 'pt'].every((l) => !tr(l)('erros.DIA_FECHADO').startsWith('??')));
    const ctxG = await celular(); const pG = await ctxG.newPage();
    await entrar(pG, dono);
    await pG.goto(`${SITE}/ee/et/oficina/pedidos/${sol5}`, { waitUntil: 'networkidle' });
    await pG.getByTestId('novas-datas-pedidas').waitFor({ timeout: 20000 }).catch(() => {});
    ok('G: cartao "novas datas" aberto', await visivel(pG, 'novas-datas-pedidas'));
    ok(`G: sugestao inicial = 1o dia aberto depois de hoje (${proxAberto(hojeTallinn)}), manha`, (await pG.getByTestId('nd-data-0').inputValue()) === proxAberto(hojeTallinn) && (await pG.getByTestId('nd-turno-0').inputValue()) === 'manha', await pG.getByTestId('nd-data-0').inputValue());
    await pG.getByTestId('nd-data-0').fill(SAB); await pG.waitForTimeout(400);
    const avG = pG.getByTestId('nd-aviso-0');
    ok('G: sabado -> erro "fechado" + link do horario', (await avG.getAttribute('data-tipo').catch(() => '')) === 'fechado' && (await avG.innerText().catch(() => '')).includes(T('oficinaEnviarOrcamento.erroDiaFechado')) && await linkOk(pG, 'nd-link-horario-0', '/ee/et'));
    ok('G: com dia fechado o botao enviar fica desativado', await pG.getByTestId('nd-enviar').isDisabled());
    ok('G: sem rolagem lateral (390 px)', await semRolagem(pG));
    await avG.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); await pG.waitForTimeout(300);
    await pG.screenshot({ path: `${OUT}/novas-datas-sabado-et-390.png` });
    // R4: a oficina abre o sabado no perfil (outra aba) e volta: o cartao rele o horario sem recarregar
    await sb.from('oficinas').update({ horario_funcionamento: { ...HORARIO, sab: { aberto: true, inicio: '08:00', fim: '18:00' } } }).eq('id', ofId);
    await pG.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await pG.waitForTimeout(1500);
    ok('G R4: sabado aberto no perfil + volta para a aba -> erro some, botao ativa, data mantida', !(await visivel(pG, 'nd-aviso-0')) && await pG.getByTestId('nd-enviar').isEnabled() && (await pG.getByTestId('nd-data-0').inputValue()) === SAB, await avG.innerText().catch(() => 'sem aviso'));
    await sb.from('oficinas').update({ horario_funcionamento: HORARIO }).eq('id', ofId);
    await pG.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await pG.waitForTimeout(1500);
    ok('G R4: sabado fechado de novo + volta -> erro volta e o botao desativa', (await avG.getAttribute('data-tipo').catch(() => '')) === 'fechado' && await pG.getByTestId('nd-enviar').isDisabled());
    await pG.getByTestId('nd-data-0').fill(SEX); await pG.getByTestId('nd-turno-0').selectOption('tarde'); await pG.waitForTimeout(400);
    ok('G: sexta a tarde -> aviso do periodo (nao bloqueia)', (await avG.getAttribute('data-tipo').catch(() => '')) === 'turno' && await pG.getByTestId('nd-enviar').isEnabled());
    await pG.getByTestId('nd-enviar').click();
    await pG.getByTestId('novas-datas-feito').waitFor({ timeout: 15000 }).catch(() => {});
    const { data: sl5 } = await sb.from('orcamento_disponibilidade').select('data_checkin, turno, origem').eq('orcamento_id', o5.id).gte('data_checkin', hojeTallinn);
    ok('G: enviada a sexta a tarde (aviso nao bloqueia)', (await visivel(pG, 'novas-datas-feito')) && sl5?.length === 1 && sl5[0].data_checkin === SEX && sl5[0].turno === 'tarde' && sl5[0].origem === 'oficina', JSON.stringify(sl5));
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
    ok('H: em_andamento -> "veiculo ja na oficina" e nenhum campo de data', (await pH.getByText(T('oficinaEnviarOrcamento.veiculoJaNaOficina')).isVisible().catch(() => false)) && (await datas(pH).count()) === 0);
    await valor.fill('90');
    await enviar(pH);
    const r = await disp(sol6);
    ok('H: edicao enviada mesmo com datas salvas num sabado fechado e no passado', !!r.o && Number(r.o.valor_total) === 90 && r.o.revisao_numero === 1, JSON.stringify(r));
    ok('H: sem erro na tela (dia fechado / envio)', !(await visivel(pH, 'erro-dia-fechado')) && !(await visivel(pH, 'erro-envio-orcamento')));
    ok('H: datas salvas regravadas como estavam', r.d.map((x) => `${x.data_checkin} ${x.turno}`).join(',') === `${PASSADO} manha,${SAB} manha`, JSON.stringify(r.d));
    await ctxH.close();
  }

  // ---------- F: oficina sem horario_funcionamento: amanha de manha, nenhum aviso de horario, envio normal
  {
    const T = tr('et');
    await sb.from('oficinas').update({ horario_funcionamento: null }).eq('id', ofId);
    const sol4 = await novoPedido(cli, v.id, 4);
    const ctxF = await celular(); const pF = await ctxF.newPage();
    await entrar(pF, dono);
    await abrir(pF, '/ee/et', sol4);
    ok(`F sem horario: sugestao = amanha (${somar(hojeTallinn, 1)}) de manha`, (await datas(pF).first().inputValue()) === somar(hojeTallinn, 1) && (await turnos(pF, T).first().inputValue()) === 'manha', await datas(pF).first().inputValue());
    await itens(pF, T);
    await datas(pF).first().fill(SAB); await pF.getByText(T('oficinaEnviarOrcamento.adicionarDataDisponivel')).click(); await datas(pF).nth(1).fill(SEX); await turnos(pF, T).nth(1).selectOption('tarde');
    await pF.waitForTimeout(400);
    ok('F sem horario: sabado e sexta a tarde sem aviso nem erro', !(await visivel(pF, 'aviso-slot-0')) && !(await visivel(pF, 'aviso-slot-1')));
    await enviar(pF);
    const r = await disp(sol4);
    ok('F sem horario: envio funciona', r.d.length === 2 && !(await visivel(pF, 'erro-dia-fechado')), JSON.stringify(r));
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
