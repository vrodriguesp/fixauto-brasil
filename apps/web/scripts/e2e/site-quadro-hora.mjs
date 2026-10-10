// Quadro profissional (migracao 057, docs/PROJETO_QUADRO_OFICINA_2026-10-09.md),
// oficina em Tallinn, tela em estoniano (e varredura dos 6 idiomas):
//  1 tempo REAL x PREVISTO: carro que entrou e saiu hoje e pintado so hoje;
//    previsto aparece tracejado; prazo estourado com a parte vermelha
//  2 postos por hora (API): colocar, conflito, reservar, mover, cancelar,
//    vaga de espera com varios carros, validacoes
//  3 entrega e cancelamento fecham ocupacoes e apagam reservas (gatilho)
//  4 mecanico so mexe nos carros dele; a tela nao grava carimbos nem ocupacoes
//  5 visao Hora pela tela (computador): status do posto, reserva clicando no
//    horario livre, tempo real em outro aparelho
//  6 visao Hora no celular: carros sem posto primeiro; editar reserva pela folha
//  7 capacidade geral (Perfil) e alerta no Quadro; monitoramento (tempos e
//    carro parado)
//  8 check-in manual "o carro ja esta aqui" faz o check-in de verdade
//  9 seis idiomas: visao Hora sem chave crua e sem rolagem da pagina
//   node site-quadro-hora.mjs <.env.local> [SITE]
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
const tr = (l) => { const m = msgs(l); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); };
const ET = tr('et');
const PREFIXO = { pt: '/br/pt', 'pt-PT': '/pt/pt', en: '/ee/en', et: '/ee/et', it: '/it/it', ru: '/ee/ru' };
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; let ofId; const sols = []; const ags = [];
const H = 3600e3;
const em = (ms) => new Date(Date.now() + ms).toISOString();
const dia = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.toISOString().slice(0, 10)}T09:00:00Z`; };
const diaTallinn = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date(iso));

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const ctxNovo = async (largo) => { const c = await browser.newContext(largo ? { viewport: { width: 1366, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_agenda_vista', 'quadro'); } catch {} }); return c; };
const entrar = async (ctx, u, idioma = 'et') => { const p = await ctx.newPage(); await p.goto(`${SITE}${PREFIXO[idioma]}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]'); await p.waitForTimeout(4500); return p; };
const conta = async (tipo, nome, idioma = 'et') => {
  const email = `qhora-${tipo}${contas.length}-${tag}@example.test`; const senha = `Qh${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma });
  return { id: data.user.id, email, senha };
};
const token = async (u) => (await createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: u.email, password: u.senha })).data.session.access_token;
const api = async (tok, corpo) => { const r = await fetch(`${SITE}/api/servico`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }); return { status: r.status, d: await r.json().catch(() => ({})) }; };
const abrirQuadro = async (p, idioma = 'et') => { await p.goto(`${SITE}${PREFIXO[idioma]}/oficina/agenda?vista=quadro`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000); };
const ocup = async (ag) => (await sb.from('posto_ocupacoes').select('*').eq('agenda_id', ag).order('created_at')).data || [];

try {
  // ---------- dados
  const dono = await conta('oficina', 'TESTE DONO HORA');
  const { data: of, error: eOf } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `HORA ${tag}`, endereco: 'Tööstuse 5', cidade: 'Tallinn', estado: 'Harju', cep: '10416', pais: 'EE', latitude: 59.44, longitude: 24.72, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica', 'eletrica'] }).select('id').single();
  if (eOf) throw new Error('oficina: ' + eOf.message);
  ofId = of.id;
  const mecU = await conta('oficina', 'Mart Mehaanik');
  const { data: mec } = await sb.from('funcionarios').insert({ oficina_id: ofId, profile_id: mecU.id, nome: 'Mart Mehaanik', cargo: 'mecanico', ativo: true, acesso_portal: true, primeiro_login: false, capacidade_maxima: 3 }).select('id').single();
  const cli = await conta('cliente', 'Klient Hora');
  const { data: bx } = await sb.from('oficina_boxes').insert([
    { oficina_id: ofId, nome: 'Tõstuk 1', tipo: 'elevador', ordem: 0 },
    { oficina_id: ofId, nome: 'Tõstuk 2', tipo: 'elevador', ordem: 1 },
    { oficina_id: ofId, nome: 'Ootekoht', tipo: 'vaga', ordem: 2, capacidade: 20 },
  ]).select('id, nome');
  const T1 = bx.find((b) => b.nome === 'Tõstuk 1').id, T2 = bx.find((b) => b.nome === 'Tõstuk 2').id, OO = bx.find((b) => b.nome === 'Ootekoht').id;
  const carro = async (placa, ini, fim, status, extra = {}) => {
    const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Škoda', fipe_modelo: 'Octavia', fipe_ano: '2019', placa }).select('id').single();
    const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'hora', urgencia: 'media', latitude: 59.44, longitude: 24.72, endereco: 'Tallinn', status: status === 'em_andamento' ? 'em_andamento' : 'aceita' }).select('id').single();
    sols.push(s.id);
    const { data: a, error } = await sb.from('agenda').insert({ oficina_id: ofId, solicitacao_id: s.id, titulo: `Hooldus - ${placa}`, data_inicio: ini, data_fim: fim, data_fim_prevista: fim, tipo: 'plataforma', status, cor: '#3B82F6', ...extra }).select('id').single();
    if (error) throw new Error('agenda: ' + error.message);
    ags.push(a.id); return a.id;
  };
  const P = (n) => `H${n}${tag.slice(0, 3)}`.toUpperCase();
  const R1 = await carro(P(1), dia(-1), dia(1), 'agendado'); // vai entrar e sair hoje
  const R2 = await carro(P(2), dia(-5), dia(-1), 'em_andamento', { checkin_em: dia(-5) }); // prazo estourado
  const R3 = await carro(P(3), dia(2), dia(4), 'agendado');
  const R4 = await carro(P(4), dia(0), dia(2), 'em_andamento', { checkin_em: em(-2 * H), funcionario_id: mec.id });
  const R5 = await carro(P(5), dia(0), dia(1), 'em_andamento', { checkin_em: em(-5 * H) }); // parado
  const tokDono = await token(dono); const tokMec = await token(mecU);

  // ---------- 1 tempo real x previsto
  let r = await api(tokDono, { acao: 'checkin', eventoId: R1 });
  ok('1 check-in do R1 (previsto ontem)', r.status === 200, JSON.stringify(r));
  r = await api(tokDono, { acao: 'etapa', eventoId: R1, status: 'entregue' });
  ok('1 entrega do R1 no mesmo dia', r.status === 200, JSON.stringify(r));
  const { data: a1 } = await sb.from('agenda').select('status, checkin_em, entregue_em, data_inicio_prevista, data_fim_prevista').eq('id', R1).single();
  const hojeTll = diaTallinn(new Date().toISOString());
  ok('1 carimbos reais gravados (check-in e entrega hoje)', a1.status === 'concluido' && diaTallinn(a1.checkin_em) === hojeTll && diaTallinn(a1.entregue_em) === hojeTll, JSON.stringify(a1));
  ok('1 previsto preservado (entrada de ontem)', diaTallinn(a1.data_inicio_prevista) === diaTallinn(dia(-1)), a1.data_inicio_prevista);

  const ctxD = await ctxNovo(true); const pD = await entrar(ctxD, dono);
  await abrirQuadro(pD);
  await pD.getByRole('button', { name: ET('oficinaAgenda.quadroPorMecanico'), exact: true }).click(); await pD.waitForTimeout(800);
  const b1 = pD.locator(`button[title*="${P(1)}"]`).first();
  const w1 = (await b1.boundingBox())?.width || 0;
  ok('1 R1 pintado so hoje (1 dia de largura)', w1 > 40 && w1 < 60, `largura ${w1}`);
  ok('1 titulo traz previsto e real', /Planeeritud .*Tegelik /.test(await b1.getAttribute('title') || ''), await b1.getAttribute('title'));
  const tracejados = await pD.locator('div.border-dashed.border-gray-400').count();
  ok('1 previsto tracejado aparece (difere do real)', tracejados >= 1, tracejados);
  ok('1 prazo estourado: parte vermelha na barra do R2', (await pD.locator(`button[title*="${P(2)}"] span.bg-red-600`).count()) === 1);
  let txt = await pD.innerText('body');
  ok('1 alerta de prazo estourado', txt.includes(ET('oficinaAgenda.quadroAlertaPrazo')));
  await pD.getByLabel(ET('oficinaAgenda.quadroMostrarPrevisto')).uncheck(); await pD.waitForTimeout(500);
  ok('1 "mostrar previsto" desligado esconde o tracejado', (await pD.locator('div.border-dashed.border-gray-400').count()) === 0);
  await pD.getByLabel(ET('oficinaAgenda.quadroMostrarPrevisto')).check();
  await pD.screenshot({ path: 'quadro-real-previsto.png', fullPage: true });

  // ---------- 2 postos por hora (API)
  r = await api(tokDono, { acao: 'posto_entrar', eventoId: R2, boxId: T1 });
  ok('2 R2 entra no Tõstuk 1 agora', r.status === 200, JSON.stringify(r));
  let { data: ag2 } = await sb.from('agenda').select('box_id').eq('id', R2).single();
  ok('2 agenda.box_id acompanha o posto atual (cache)', ag2.box_id === T1, ag2.box_id);
  r = await api(tokDono, { acao: 'posto_reservar', eventoId: R4, boxId: T1, inicio: em(5 * 60e3), fim: em(65 * 60e3) });
  ok('2 reservar o Tõstuk 1 enquanto o R2 esta nele: recusado', r.status === 409 && r.d.codigo === 'CONFLITO_POSTO' && (r.d.ocupadoPor || []).length === 1, JSON.stringify(r));
  r = await api(tokDono, { acao: 'posto_reservar', eventoId: R4, boxId: T1, inicio: em(3 * H), fim: em(4 * H), observacao: 'sidur' });
  ok('2 reservar mais tarde no Tõstuk 1: aceito', r.status === 200, JSON.stringify(r));
  r = await api(tokDono, { acao: 'posto_reservar', eventoId: R3, boxId: T1, inicio: em(3.5 * H), fim: em(5 * H) });
  ok('2 reserva que cruza outra reserva: recusada', r.status === 409, JSON.stringify(r));
  r = await api(tokDono, { acao: 'posto_reservar', eventoId: R3, boxId: T1, inicio: em(-3 * H), fim: em(-2 * H) });
  ok('2 reserva no passado: recusada', r.status === 400 && r.d.codigo === 'HORARIO_INVALIDO', JSON.stringify(r));
  r = await api(tokDono, { acao: 'posto_reservar', eventoId: R3, boxId: T2, inicio: em(2 * H), fim: em(15 * H) });
  ok('2 reserva de mais de 12 h: recusada', r.status === 400, JSON.stringify(r));
  let o4 = (await ocup(R4)).find((o) => !o.real);
  r = await api(tokDono, { acao: 'posto_mover', ocupacaoId: o4.id, boxId: T2 });
  o4 = (await ocup(R4)).find((o) => !o.real);
  ok('2 mover a reserva para o Tõstuk 2', r.status === 200 && o4.box_id === T2, JSON.stringify(r));
  r = await api(tokDono, { acao: 'posto_entrar', eventoId: R2, boxId: OO });
  const o2 = await ocup(R2);
  ok('2 R2 vai para a vaga de espera: sai do elevador (1 ocupacao aberta so)', r.status === 200 && o2.filter((o) => !o.fim).length === 1 && o2.find((o) => o.box_id === T1)?.fim, JSON.stringify(o2.map((o) => [o.box_id === T1 ? 'T1' : 'OO', !!o.fim])));
  r = await api(tokDono, { acao: 'posto_entrar', eventoId: R5, boxId: OO });
  ok('2 vaga de espera aceita varios carros', r.status === 200, JSON.stringify(r));
  r = await api(tokDono, { acao: 'posto_sair', eventoId: R5 });
  const { data: ag5 } = await sb.from('agenda').select('box_id').eq('id', R5).single();
  ok('2 tirar do posto: ocupacao fecha e box_id volta a vazio', r.status === 200 && ag5.box_id === null && (await ocup(R5)).every((o) => o.fim), ag5.box_id);
  r = await api(tokDono, { acao: 'posto_entrar', eventoId: R3, boxId: T1 });
  ok('2 carro ainda agendado nao entra no posto (faca o check-in)', r.status === 409 && r.d.codigo === 'SEM_CHECKIN', JSON.stringify(r));

  // ---------- 3 entrega e cancelamento (gatilho)
  r = await api(tokDono, { acao: 'posto_reservar', eventoId: R2, boxId: T2, inicio: em(6 * H), fim: em(7 * H) });
  ok('3 reserva futura do R2 criada', r.status === 200, JSON.stringify(r));
  r = await api(tokDono, { acao: 'etapa', eventoId: R2, status: 'entregue' });
  const o2b = await ocup(R2);
  ok('3 entrega fecha a ocupacao aberta e apaga a reserva futura', r.status === 200 && o2b.every((o) => o.fim) && !o2b.some((o) => !o.real), JSON.stringify(o2b.map((o) => [o.real, !!o.fim])));
  r = await api(tokDono, { acao: 'elevador', eventoId: R3, boxId: T2 });
  ok('3 posto planejado do carro agendado (R3)', r.status === 200, JSON.stringify(r));
  r = await api(tokDono, { acao: 'posto_reservar', eventoId: R3, boxId: T2, inicio: em(9 * H), fim: em(10 * H) });
  await sb.from('agenda').update({ status: 'cancelado' }).eq('id', R3);
  ok('3 cancelamento apaga as reservas futuras', r.status === 200 && (await ocup(R3)).length === 0, JSON.stringify(await ocup(R3)));

  // ---------- 4 permissoes e protecao do banco
  const R6 = await carro(P(6), dia(0), dia(1), 'em_andamento', { checkin_em: em(-3 * H) }); // de ninguem; parado ha 3 h
  r = await api(tokMec, { acao: 'posto_reservar', eventoId: R6, boxId: T1, inicio: em(8 * H), fim: em(9 * H) });
  ok('4 mecanico NAO reserva para carro de outro', r.status === 403, JSON.stringify(r));
  r = await api(tokMec, { acao: 'posto_entrar', eventoId: R4, boxId: T1 });
  ok('4 mecanico coloca o carro dele no elevador', r.status === 200, JSON.stringify(r));
  const aDono = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await aDono.auth.signInWithPassword({ email: dono.email, password: dono.senha });
  const { error: eIns } = await aDono.from('posto_ocupacoes').insert({ oficina_id: ofId, box_id: T2, agenda_id: R6, inicio: new Date().toISOString(), real: true });
  ok('4 a tela nao grava ocupacao direto no banco', !!eIns, eIns?.message);
  const { error: eCar } = await aDono.from('agenda').update({ checkin_em: dia(-9) }).eq('id', R6);
  ok('4 a tela nao altera o carimbo de check-in', !!eCar, eCar?.message);
  const { data: lidos } = await aDono.from('posto_ocupacoes').select('id').eq('oficina_id', ofId);
  ok('4 o dono le as ocupacoes da oficina dele', (lidos || []).length > 0);
  const aCli = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await aCli.auth.signInWithPassword({ email: cli.email, password: cli.senha });
  const { data: lidosCli } = await aCli.from('posto_ocupacoes').select('id').eq('oficina_id', ofId);
  ok('4 outra conta nao le as ocupacoes da oficina', (lidosCli || []).length === 0);

  // ---------- 5 visao Hora pela tela (computador)
  await pD.getByRole('button', { name: ET('oficinaAgenda.quadroPorHora'), exact: true }).click(); await pD.waitForTimeout(1500);
  txt = await pD.innerText('body');
  ok('5 linhas dos postos com o tipo explicado', txt.includes('Tõstuk 1') && txt.includes('Ootekoht') && txt.includes(ET('oficinaAgenda.quadroTipoBox.vaga')));
  ok('5 status do Tõstuk 1: ocupado pelo R4', (await pD.getByTestId('status-Tõstuk 1').innerText()).startsWith(ET('oficinaAgenda.horaOcupadoDesde', { carro: '', hora: '' }).split('·')[0].trim()), await pD.getByTestId('status-Tõstuk 1').innerText());
  ok('5 linha de agora (vermelha)', (await pD.locator('div.bg-red-500.w-0\\.5').count()) > 0);
  ok('5 carro na oficina sem posto aparece (R6)', txt.includes(ET('oficinaAgenda.horaSemPosto')) && (await pD.locator(`button[title*="${P(6)}"]`).count()) > 0);
  const ctxD2 = await ctxNovo(true); const pD2 = await entrar(ctxD2, dono);
  await abrirQuadro(pD2); await pD2.getByRole('button', { name: ET('oficinaAgenda.quadroPorHora'), exact: true }).click(); await pD2.waitForTimeout(1500);
  const linhaT1 = pD.locator('div.flex.border-b', { has: pD.locator('p', { hasText: /^Tõstuk 1$/ }) }).locator('div.relative').first();
  const caixa = await linhaT1.boundingBox();
  await linhaT1.click({ position: { x: caixa.width - 30, y: 10 } }); await pD.waitForTimeout(700);
  ok('5 clicar no horario livre abre a reserva', await pD.getByRole('dialog').isVisible());
  const opts = await pD.getByRole('dialog').locator('select').first().locator('option').allInnerTexts();
  const alvo6 = opts.find((o) => o.includes(P(6)));
  ok('5 carros na oficina para reservar (inclui o R6)', !!alvo6, opts.join(' | '));
  if (alvo6) await pD.getByRole('dialog').locator('select').first().selectOption({ label: alvo6 });
  await pD.getByRole('dialog').getByRole('button', { name: ET('oficinaAgenda.horaReservar'), exact: true }).click(); await pD.waitForTimeout(2500);
  const res6 = (await ocup(R6)).filter((o) => !o.real && o.box_id === T1);
  ok('5 reserva feita pela tela gravada (Tõstuk 1)', res6.length === 1, JSON.stringify(await ocup(R6)));
  await pD2.waitForTimeout(2500);
  ok('5 outro aparelho ve a reserva sem recarregar (tempo real)', (await pD2.locator(`button[title*="${P(6)}"]`).filter({ hasText: '◷' }).count()) > 0);
  await pD.screenshot({ path: 'quadro-hora-computador.png', fullPage: true });
  await ctxD2.close();

  // ---------- 6 celular
  await sb.from('posto_ocupacoes').update({ fim: new Date().toISOString() }).eq('agenda_id', R4).is('fim', null); // R4 sem posto agora
  const ctxM = await ctxNovo(false); const pM = await entrar(ctxM, dono);
  await abrirQuadro(pM); await pM.getByRole('button', { name: ET('oficinaAgenda.quadroPorHora'), exact: true }).click(); await pM.waitForTimeout(2000);
  const ySem = (await pM.getByText(ET('oficinaAgenda.horaSemPosto')).first().boundingBox())?.y ?? 9e9;
  const yT1 = (await pM.locator('p', { hasText: /^Tõstuk 1$/ }).first().boundingBox())?.y ?? 0;
  ok('6 no celular, "na oficina, sem posto" vem antes dos postos', ySem < yT1, `${ySem} x ${yT1}`);
  ok('6 pagina sem rolagem lateral (so o quadro rola)', await pM.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await pM.locator(`button[title*="${P(6)}"]`).filter({ hasText: '◷' }).first().click(); await pM.waitForTimeout(600);
  ok('6 tocar na reserva abre a folha de edicao', (await pM.getByRole('dialog').innerText()).includes(ET('oficinaAgenda.horaEditarReserva')));
  await pM.getByRole('dialog').locator('select').nth(1).selectOption({ value: '120' }); // duracao
  await pM.getByRole('dialog').getByRole('button', { name: ET('oficinaAgenda.horaSalvar'), exact: true }).click(); await pM.waitForTimeout(2500);
  const r6b = (await ocup(R6)).find((o) => !o.real);
  ok('6 duracao alterada pela folha (2 h)', r6b && Math.round((Date.parse(r6b.fim) - Date.parse(r6b.inicio)) / 60e3) === 120, JSON.stringify(r6b));
  await pM.screenshot({ path: 'quadro-hora-celular.png', fullPage: true });

  // ---------- 7 capacidade geral e monitoramento
  await pD.goto(`${SITE}/ee/et/oficina/perfil`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(2500);
  await pD.getByLabel(ET('oficinaPerfil.capacidadeTotalRotulo')).fill('2');
  await pD.getByText(ET('oficinaPerfil.monitoramentoTitulo')).click();
  await pD.getByRole('button', { name: ET('oficinaPerfil.salvarAlteracoes') }).click(); await pD.waitForTimeout(3000);
  let { data: ofv } = await sb.from('oficinas').select('capacidade_total, monitoramento_ativo').eq('id', ofId).single();
  ok('7 perfil grava limite geral (2) e liga o monitoramento', ofv.capacidade_total === 2 && ofv.monitoramento_ativo === true, JSON.stringify(ofv));
  await abrirQuadro(pD);
  await pD.getByRole('button', { name: ET('oficinaAgenda.quadroPorMecanico'), exact: true }).click(); await pD.waitForTimeout(800);
  txt = await pD.innerText('body');
  ok('7 alerta: oficina acima do limite', txt.includes(ET('oficinaAgenda.quadroAlertaAcimaLimite', { total: 2 })), txt.slice(0, 300));
  ok('7 alerta: carro parado sem motivo (R6, 3 h)', txt.includes(ET('oficinaAgenda.quadroAlertaParados', { horas: 2 })));
  await pD.locator(`button[title*="${P(4)}"]`).first().click(); await pD.waitForTimeout(600);
  const mon = await pD.getByTestId('quadro-monitoramento').innerText().catch(() => '');
  ok('7 folha do carro com os tempos (na oficina ~2 h)', mon.includes(ET('oficinaAgenda.monNaOficina')) && /2 h/.test(mon), mon);
  await pD.getByRole('button', { name: ET('oficinaAgenda.quadroFechar') }).last().click();
  await pD.goto(`${SITE}/ee/et/oficina/perfil`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(2500);
  await pD.getByLabel(ET('oficinaPerfil.capacidadeTotalRotulo')).fill('');
  await pD.getByRole('button', { name: ET('oficinaPerfil.salvarAlteracoes') }).click(); await pD.waitForTimeout(3000);
  ({ data: ofv } = await sb.from('oficinas').select('capacidade_total').eq('id', ofId).single());
  ok('7 apagar o limite = sem limite (campo deixa apagar)', ofv.capacidade_total === null, JSON.stringify(ofv));

  // ---------- 8 check-in manual "ja esta aqui"
  await pD.goto(`${SITE}/ee/et/oficina/checkin`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(2000);
  await pD.fill('#c7917-1', `Klient ${tag}`); await pD.fill('#c7917-4', 'Volvo'); await pD.fill('#c7917-5', `V60${tag}`);
  await pD.getByRole('button', { name: tr('et')('constants.tiposServico.mecanica') }).first().click();
  ok('8 opcao "o carro ja esta aqui" marcada para hoje', await pD.getByLabel(ET('oficinaCheckin.carroJaAqui')).isChecked());
  await pD.locator('button[type=submit]').click(); await pD.waitForTimeout(3500);
  const { data: man } = await sb.from('agenda').select('id, status, checkin_em').eq('oficina_id', ofId).ilike('titulo', `%V60${tag}%`).maybeSingle();
  if (man) ags.push(man.id);
  ok('8 carro de balcao ja entra "na oficina" com check-in real', man?.status === 'em_andamento' && !!man?.checkin_em, JSON.stringify(man));

  // ---------- 9 seis idiomas na visao Hora
  for (const l of ['pt', 'pt-PT', 'en', 'it', 'ru', 'et']) {
    const T = tr(l);
    await sb.from('profiles').update({ idioma: l }).eq('id', dono.id);
    await abrirQuadro(pM, l);
    await pM.getByRole('button', { name: T('oficinaAgenda.quadroPorHora'), exact: true }).click(); await pM.waitForTimeout(1200);
    const t9 = await pM.innerText('body');
    ok(`9 Hora em ${l}: textos do idioma, sem chave crua`, t9.includes(T('oficinaAgenda.quadroPostos')) && !/oficinaAgenda\.|quadroEstado\.|quadroTipoBox|\?\?/.test(t9), t9.slice(0, 160));
    ok(`9 Hora em ${l}: pagina sem rolagem lateral`, await pM.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  await ctxM.close(); await ctxD.close();
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 900)); }
finally {
  await browser.close();
  for (const a of ags) { await sb.from('posto_ocupacoes').delete().eq('agenda_id', a); await sb.from('agenda_historico').delete().eq('agenda_id', a); await sb.from('manutencao_etapas').delete().eq('agenda_id', a); }
  if (ofId) await sb.from('agenda').delete().eq('oficina_id', ofId);
  for (const s of sols) { await sb.from('avaliacoes').delete().eq('solicitacao_id', s); await sb.from('solicitacoes').delete().eq('id', s); }
  if (ofId) { await sb.from('oficina_boxes').delete().eq('oficina_id', ofId); await sb.from('funcionarios').delete().eq('oficina_id', ofId); await sb.from('comissao_lancamento').delete().eq('oficina_id', ofId); await sb.from('comissao_config').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
