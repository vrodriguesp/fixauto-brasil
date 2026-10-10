// Quadro da agenda (producao), feito pela tela como a oficina usaria:
//  1 a oficina escolhe a visao Quadro; fica salva ao voltar
//  2 linhas por mecanico (com carga/limite) e "sem mecanico"; barras dos carros
//  3 elevadores: cadastra 2 pela tela; carro A no Elevador 1 (toque, celular)
//  4 carro B (chega amanha) planejado no Elevador 1 -> SEM falso conflito
//    (conflito agora e por hora, ver site-quadro-hora.mjs); arrastar B para o
//    Elevador 2 (computador)
//  5 arrastar carro A para o mecanico 1 (computador) -> historico
//  6 as visoes se comunicam: outro aparelho aberto ve a troca sem recarregar
//    (tempo real), e o Dia mostra o elevador no cartao
//  7 mecanico com acesso: escolhe o elevador do carro dele; nao troca mecanico
//  8 enderecos antigos (Distribuicao, Capacidade) levam ao Quadro
//  9 Quadro nos 6 idiomas: sem chave crua, pagina sem rolagem lateral
//   node site-quadro.mjs <.env.local> [SITE]
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
const PT = tr('pt');
const PREFIXO = { pt: '/br/pt', 'pt-PT': '/pt/pt', en: '/ee/en', et: '/ee/et', it: '/it/it', ru: '/ee/ru' };
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 200) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; let ofId; const sols = []; const ags = [];
const dia = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.toISOString().slice(0, 10)}T12:00:00Z`; };

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const ctxNovo = async (largo) => { const c = await browser.newContext(largo ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); return c; };
const entrar = async (ctx, u, idioma = 'pt') => { const p = await ctx.newPage(); await p.goto(`${SITE}${PREFIXO[idioma]}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]'); await p.waitForTimeout(4000); return p; };
const conta = async (tipo, nome, idioma = 'pt') => {
  const email = `quadro-${tipo}${contas.length}-${tag}@example.test`; const senha = `Qd${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma });
  return { id: data.user.id, email, senha };
};
const abrirQuadro = async (p, idioma = 'pt') => { await p.goto(`${SITE}${PREFIXO[idioma]}/oficina/agenda?vista=quadro`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000); };
const barra = (p, placa) => p.locator('button[title*="' + placa + '"]').first();

try {
  // ---------- dados: oficina, 2 mecanicos (um com acesso), cliente, 2 carros agendados + 1 interno
  const dono = await conta('oficina', 'TESTE DONO QUADRO');
  const { data: of } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `QUADRO ${tag}`, endereco: 'Av Paulista 1', cidade: 'São Paulo', estado: 'SP', cep: '01310-100', pais: 'BR', latitude: -23.56, longitude: -46.65, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica'] }).select('id').single();
  ofId = of.id;
  const mecU = await conta('oficina', 'Carla Mecânica');
  const { data: m1 } = await sb.from('funcionarios').insert({ oficina_id: ofId, nome: 'Bruno Mecânico', cargo: 'mecanico', ativo: true, acesso_portal: false, capacidade_maxima: 1 }).select('id').single();
  const { data: m2 } = await sb.from('funcionarios').insert({ oficina_id: ofId, profile_id: mecU.id, nome: 'Carla Mecânica', cargo: 'mecanico', ativo: true, acesso_portal: true, primeiro_login: false, capacidade_maxima: 3 }).select('id').single();
  const cli = await conta('cliente', 'Cliente Quadro');
  const carro = async (placa, modelo, ini, fim, status, func) => {
    const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Fiat', fipe_modelo: modelo, fipe_ano: '2020', placa }).select('id').single();
    const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'quadro', urgencia: 'media', latitude: -23.56, longitude: -46.65, endereco: 'SP', status: status === 'em_andamento' ? 'em_andamento' : 'aceita' }).select('id').single();
    sols.push(s.id);
    const { data: a, error } = await sb.from('agenda').insert({ oficina_id: ofId, solicitacao_id: s.id, titulo: `Mecânica - ${placa}`, data_inicio: dia(ini), data_fim: dia(fim), data_fim_prevista: dia(fim), tipo: 'plataforma', status, cor: '#3B82F6', funcionario_id: func || null, ...(status === 'em_andamento' ? { checkin_em: dia(ini) } : {}) }).select('id').single();
    if (error) throw new Error('agenda: ' + error.message);
    ags.push(a.id); return a.id;
  };
  const agA = await carro(`QA${tag.slice(0, 3)}1`.toUpperCase(), 'Uno', 0, 3, 'em_andamento', null);
  const agB = await carro(`QB${tag.slice(0, 3)}2`.toUpperCase(), 'Palio', 1, 4, 'agendado', m2.id);
  const agC = await carro(`QC${tag.slice(0, 3)}3`.toUpperCase(), 'Toro', -6, -1, 'em_andamento', m1.id); // prazo estourado
  const placaA = `QA${tag.slice(0, 3)}1`.toUpperCase(), placaB = `QB${tag.slice(0, 3)}2`.toUpperCase(), placaC = `QC${tag.slice(0, 3)}3`.toUpperCase();

  // ---------- 1/2 visao Quadro escolhida e salva
  const ctxM = await ctxNovo(false); const pM = await entrar(ctxM, dono);
  await pM.goto(`${SITE}/br/pt/oficina/agenda`, { waitUntil: 'networkidle' }); await pM.waitForTimeout(2500);
  await pM.getByRole('button', { name: PT('oficinaAgenda.viewQuadro'), exact: true }).click(); await pM.waitForTimeout(1500);
  await pM.reload({ waitUntil: 'networkidle' }); await pM.waitForTimeout(2500);
  let txt = await pM.innerText('body');
  ok('1 Quadro escolhido continua depois de recarregar', txt.includes(PT('oficinaAgenda.quadroVerPor')));
  ok('2 linhas dos mecanicos e "sem mecanico"', txt.includes('Bruno Mecânico') && txt.includes('Carla Mecânica') && txt.includes(PT('oficinaAgenda.quadroSemMecanico')));
  ok('2 carga/limite do mecanico (Bruno 1 / 1)', /1 na oficina\s*\/\s*1/.test(txt), txt.match(/\d+ na oficina[^\n]*/g)?.join(' | '));
  ok('2 barras dos 3 carros', (await barra(pM, placaA).count()) && (await barra(pM, placaB).count()) && (await barra(pM, placaC).count()));
  ok('2 prazo estourado avisado', txt.includes(PT('oficinaAgenda.quadroAlertaPrazo')));
  ok('2 pagina sem rolagem lateral (so o quadro rola)', await pM.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await pM.screenshot({ path: 'quadro-mecanico-celular.png', fullPage: true });

  // ---------- 3 elevadores pela tela
  await pM.getByRole('button', { name: PT('oficinaAgenda.quadroPorElevador'), exact: true }).click(); await pM.waitForTimeout(800);
  ok('3 sem elevadores: explica onde cadastrar', (await pM.innerText('body')).includes(PT('oficinaAgenda.quadroSemElevadoresDono').slice(0, 30)));
  await pM.getByRole('button', { name: PT('oficinaAgenda.quadroGerenciarElevadores') }).first().click();
  for (const n of ['Elevador 1', 'Elevador 2']) { await pM.locator('#quadro-box-nome').fill(n); await pM.getByRole('button', { name: PT('oficinaAgenda.quadroAdicionarElevador'), exact: true }).click(); await pM.waitForTimeout(1800); }
  const { data: bxs } = await sb.from('oficina_boxes').select('id, nome').eq('oficina_id', ofId).order('nome');
  ok('3 dois elevadores cadastrados pela tela', (bxs || []).length === 2, JSON.stringify(bxs));
  await pM.getByRole('button', { name: PT('oficinaAgenda.quadroFechar') }).last().click(); await pM.waitForTimeout(1500);
  txt = await pM.innerText('body');
  ok('3 linhas dos elevadores e disponibilidade', txt.includes('Elevador 1') && txt.includes('Elevador 2') && txt.includes(PT('oficinaAgenda.quadroElevadoresLivres', { total: 2 })));
  // carro A no Elevador 1 (toque + escolher)
  await barra(pM, placaA).click(); await pM.waitForTimeout(600);
  await pM.getByLabel(PT('oficinaAgenda.quadroPostoAtual')).selectOption({ label: `Elevador 1 — ${PT('oficinaAgenda.quadroTipoBox.elevador')}` }); await pM.waitForTimeout(2500);
  await pM.getByRole('button', { name: PT('oficinaAgenda.quadroFechar') }).last().click();
  const e1 = bxs.find((b) => b.nome === 'Elevador 1').id, e2 = bxs.find((b) => b.nome === 'Elevador 2').id;
  let { data: a1 } = await sb.from('agenda').select('box_id').eq('id', agA).single();
  ok('3 carro A no Elevador 1 (celular, toque)', a1.box_id === e1);
  const { data: hist } = await sb.from('agenda_historico').select('acao').eq('agenda_id', agA);
  ok('3 troca de elevador no historico', (hist || []).some((h) => h.acao === 'elevador'), JSON.stringify(hist));
  const { data: oc1 } = await sb.from('posto_ocupacoes').select('box_id, real, fim').eq('agenda_id', agA);
  ok('3 carro em servico no elevador = ocupacao real aberta (057)', (oc1 || []).length === 1 && oc1[0].real && !oc1[0].fim && oc1[0].box_id === e1, JSON.stringify(oc1));

  // ---------- 4 conflito e arrastar (computador)
  const ctxD = await ctxNovo(true); const pD = await entrar(ctxD, dono);
  await abrirQuadro(pD);
  await pD.getByRole('button', { name: PT('oficinaAgenda.quadroPorElevador'), exact: true }).click(); await pD.waitForTimeout(800);
  await barra(pD, placaB).click(); await pD.waitForTimeout(500);
  await pD.getByLabel(PT('oficinaAgenda.quadroPostoPlanejado')).selectOption({ label: `Elevador 1 — ${PT('oficinaAgenda.quadroTipoBox.elevador')}` }); await pD.waitForTimeout(2500);
  await pD.getByRole('button', { name: PT('oficinaAgenda.quadroFechar') }).last().click(); await pD.waitForTimeout(1500);
  const { data: bPlan } = await sb.from('agenda').select('box_id').eq('id', agB).single();
  ok('4 carro agendado com posto planejado (Elevador 1)', bPlan.box_id === e1, bPlan.box_id);
  ok('4 sem falso conflito: A hoje e B amanha no mesmo elevador', !(await pD.locator('button.ring-red-600').count()));
  const linhaE2 = pD.locator('div.flex.border-b', { has: pD.locator('p', { hasText: /^Elevador 2$/ }) }).locator('div.relative').first();
  await barra(pD, placaB).dragTo(linhaE2); await pD.waitForTimeout(3000);
  const { data: b2 } = await sb.from('agenda').select('box_id').eq('id', agB).single();
  ok('4 arrastou B para o Elevador 2 (computador)', b2.box_id === e2, b2.box_id);
  await pD.screenshot({ path: 'quadro-elevador-computador.png', fullPage: true });

  // ---------- 5 arrastar para mecanico
  await pD.getByRole('button', { name: PT('oficinaAgenda.quadroPorMecanico'), exact: true }).click(); await pD.waitForTimeout(800);
  const linhaBruno = pD.locator('div.flex.border-b', { has: pD.locator('p', { hasText: /^Bruno Mecânico$/ }) }).locator('div.relative').first();
  await barra(pD, placaA).dragTo(linhaBruno); await pD.waitForTimeout(3000);
  ({ data: a1 } = await sb.from('agenda').select('funcionario_id').eq('id', agA).single());
  ok('5 arrastou A para o Bruno (computador)', a1.funcionario_id === m1.id);
  ok('5 Bruno acima do limite avisado (2 carros, limite 1)', (await pD.innerText('body')).includes(PT('oficinaAgenda.quadroAlertaMecanicoLimite')));

  // ---------- 6 tempo real e visao Dia
  await pM.getByRole('button', { name: PT('oficinaAgenda.quadroPorMecanico'), exact: true }).click(); await pM.waitForTimeout(3000);
  const naLinhaBruno = await pM.locator('div.flex.border-b', { has: pM.locator('p', { hasText: /^Bruno Mecânico$/ }) }).locator(`button[title*="${placaA}"]`).count();
  ok('6 outro aparelho ve a troca sem recarregar (tempo real)', naLinhaBruno === 1);
  await barra(pM, placaA).click(); await pM.waitForTimeout(500);
  await pM.getByRole('button', { name: PT('oficinaAgenda.quadroAbrirDia') }).click(); await pM.waitForTimeout(1500);
  txt = await pM.innerText('body');
  ok('6 "abrir no dia" leva ao Dia com o elevador no cartao', txt.includes('🛗 Elevador 1'), txt.slice(0, 300));

  // ---------- 7 mecanico com acesso
  const ctxMec = await ctxNovo(false); const pMec = await entrar(ctxMec, mecU);
  await abrirQuadro(pMec);
  await pMec.getByRole('button', { name: PT('oficinaAgenda.quadroPorElevador'), exact: true }).click(); await pMec.waitForTimeout(800);
  ok('7 mecanico ve so o carro dele', (await barra(pMec, placaB).count()) === 1 && (await barra(pMec, placaA).count()) === 0);
  await barra(pMec, placaB).click(); await pMec.waitForTimeout(500);
  ok('7 mecanico nao troca o mecanico', await pMec.getByLabel(PT('oficinaAgenda.quadroTrocarMecanico')).isDisabled());
  await pMec.getByLabel(PT('oficinaAgenda.quadroPostoPlanejado')).selectOption({ label: PT('oficinaAgenda.quadroSemElevador') }); await pMec.waitForTimeout(2500);
  const { data: b3 } = await sb.from('agenda').select('box_id').eq('id', agB).single();
  ok('7 mecanico tira o carro dele do elevador', b3.box_id === null);
  const tokMec = (await createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: mecU.email, password: mecU.senha })).data.session.access_token;
  const rFura = await fetch(`${SITE}/api/servico`, { method: 'POST', headers: { Authorization: `Bearer ${tokMec}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'elevador', eventoId: agA, boxId: e2 }) });
  ok('7 mecanico NAO mexe no elevador de carro de outro', rFura.status === 403, rFura.status);
  await ctxMec.close();

  // ---------- 8 enderecos antigos
  for (const antigo of ['distribuicao', 'capacidade']) {
    await pD.goto(`${SITE}/br/pt/oficina/${antigo}`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(2500);
    ok(`8 /oficina/${antigo} leva ao Quadro`, pD.url().includes('/oficina/agenda?vista=quadro') && (await pD.innerText('body')).includes(PT('oficinaAgenda.quadroVerPor')), pD.url());
  }
  const menu = await pD.locator('header, nav').first().innerHTML();
  ok('8 menu sem Distribuicao/Capacidade', !/oficina\/(distribuicao|capacidade)/.test(menu));

  // ---------- 9 seis idiomas
  for (const l of ['pt-PT', 'en', 'et', 'it', 'ru']) {
    await sb.from('profiles').update({ idioma: l }).eq('id', dono.id);
    const T = tr(l);
    await abrirQuadro(pM, l);
    const t9 = await pM.innerText('body');
    ok(`9 Quadro em ${l}: textos do idioma, sem chave crua`, t9.includes(T('oficinaAgenda.quadroVerPor')) && !/oficinaAgenda\.|quadroEstado\.|\?\?/.test(t9), t9.slice(0, 160));
    ok(`9 Quadro em ${l}: pagina sem rolagem lateral`, await pM.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  await ctxM.close(); await ctxD.close();
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 800)); }
finally {
  await browser.close();
  for (const a of ags) { await sb.from('agenda_historico').delete().eq('agenda_id', a); await sb.from('manutencao_etapas').delete().eq('agenda_id', a); await sb.from('posto_ocupacoes').delete().eq('agenda_id', a); }
  await sb.from('agenda').delete().eq('oficina_id', ofId);
  for (const s of sols) await sb.from('solicitacoes').delete().eq('id', s);
  if (ofId) { await sb.from('oficina_boxes').delete().eq('oficina_id', ofId); await sb.from('funcionarios').delete().eq('oficina_id', ofId); await sb.from('comissao_config').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
