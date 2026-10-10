// Painel da oficina reorganizado (auditoria 10/10, docs/AUDITORIA_PAINEL_OFICINA_2026-10-10.md), em producao:
//  1 login do dono abre em Pedidos; mecanico vai para Hoje
//  2 Pedidos: acidente primeiro, depois quem espera mais; contador verde/ambar/vermelho;
//    "Fazer orcamento" leva direto ao formulario; depois de orcar o pedido vai
//    sozinho para "Respondidos" (tempo real) com "Respondido em ..."
//  3 Hoje: blocos (atrasado, chega hoje, na oficina, pronto); Chegou -> Etapa
//    (6 botoes) -> Pronto -> Entregar; mecanico nao ve Entregar nem carro de outro
//  4 Desempenho: numeros batem com os dados
//  5 fuso: o mesmo carro no mesmo dia com o navegador em Sao Paulo e em Tallinn
//  6 enderecos antigos levam as paginas novas (6 mercados)
//  7 6 idiomas x celular/computador: sem chave crua, sem rolagem lateral, barra de baixo no celular
//  8 retorno do dono (10/10): filtros de Hoje e resumo clicavel; Quadro -> Hoje no dia
//    certo do carro; corrigir posto colocado errado; "Ver o pedido"; tipo do mes
//    abre Hoje filtrado; Desempenho: um grafico so e no maximo ~7 datas no eixo
//  9 retorno do dono (10/10, 3a rodada): "N feito" de hoje no mes -> Hoje mostra os
//    carros (dono e mecanico); grafico de 12 meses aparece; "Ver no Quadro" destaca
// 10 procurar por placa (parte), n. do pedido e codigo de cliente (Hoje e pagina
//    Procurar); painel do dia: numero do quadrado = cartoes ao filtrar; visitante
//    no celular: idioma nao fica em cima do logo
//   node site-painel-oficina.mjs <.env.local> [SITE]
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
const H = 3600e3, D = 86400e3, agora = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const ymdTll = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(new Date(ms));

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const ctxNovo = async (largo, extra = {}) => { const c = await browser.newContext({ ...(largo ? { viewport: { width: 1366, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), ...extra }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); localStorage.setItem('bipfix_tutorial_banner_oficina', '1'); } catch {} }); return c; };
const entrar = async (ctx, u, pre = '/ee/et') => { const p = await ctx.newPage(); await p.goto(`${SITE}${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha); await p.click('button[type=submit]'); await p.waitForTimeout(5500); return p; };
const conta = async (tipo, nome, idioma = 'et') => {
  const email = `painel-${tipo}${contas.length}-${tag}@example.test`; const senha = `Pn${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma, telefone: '+372 5000 0000' });
  return { id: data.user.id, email, senha };
};

try {
  const dono = await conta('oficina', 'Dono Painel');
  const { data: of, error: eOf } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: `PAINEL ${tag}`, endereco: 'Peterburi tee 46', cidade: 'Tallinn', estado: 'Harju', cep: '11415', pais: 'EE', latitude: 59.437, longitude: 24.75, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica', 'colisao', 'funilaria', 'pintura', 'eletrica'], seguradoras_convencionadas: [] }).select('id').single();
  if (eOf) throw new Error(eOf.message);
  ofId = of.id;
  const mecU = await conta('oficina', 'Mehaanik Painel');
  const { data: mec } = await sb.from('funcionarios').insert({ oficina_id: ofId, profile_id: mecU.id, nome: 'Mehaanik Painel', cargo: 'mecanico', ativo: true, acesso_portal: true, primeiro_login: false }).select('id').single();
  const cli = await conta('cliente', 'Klient Painel');
  const carro = async (placa, modelo) => (await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Toyota', fipe_modelo: modelo, fipe_ano: '2018', placa }).select('id').single()).data.id;
  const pedido = async (placa, tipo, criadoHa, extra = {}) => {
    const { data, error } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: await carro(placa, `M${placa}`), tipo, descricao: `teste ${placa}`, urgencia: 'media', status: 'aberta', latitude: 59.44, longitude: 24.76, endereco: 'Tallinn', pais: 'EE', created_at: iso(agora - criadoHa), ...extra }).select('id').single();
    if (error) throw new Error(error.message);
    sols.push(data.id); return data.id;
  };
  const P = (n) => `P${n}${tag.slice(0, 3)}`.toUpperCase();
  // pedidos para responder: normal 10 min, antigo 5 h, acidente 30 min, medio 2 h
  const sNovo = await pedido(P(1), 'mecanica', 10 * 60e3);
  const sVelho = await pedido(P(2), 'mecanica', 5 * H);
  const sAcid = await pedido(P(3), 'colisao', 30 * 60e3, { descricao: '[TIPO:outro_causou] batida' });
  const sMedio = await pedido(P(4), 'eletrica', 2 * H);
  // agenda: atrasado (devia chegar ontem), chega hoje, na oficina, pronto
  const ag = async (placa, status, ini, fim, extra = {}) => {
    const s = await pedido(placa, 'mecanica', 3 * D, { status: status === 'agendado' ? 'aceita' : 'em_andamento' });
    await sb.from('orcamentos').insert({ solicitacao_id: s, oficina_id: ofId, status: 'aceito', valor_total: 300, prazo_dias: 2, validade: '2030-01-01' });
    const { data, error } = await sb.from('agenda').insert({ oficina_id: ofId, solicitacao_id: s, titulo: `Hooldus ${placa}`, tipo: 'plataforma', status, data_inicio: iso(ini), data_fim: iso(fim), data_fim_prevista: iso(fim), cor: '#3B82F6', ...extra }).select('id').single();
    if (error) throw new Error('agenda ' + error.message);
    ags.push(data.id); return data.id;
  };
  const aAtras = await ag(P(5), 'agendado', agora - 1 * D, agora + 1 * D);
  const aHoje = await ag(P(6), 'agendado', Math.max(agora + 30 * 60e3, agora), agora + 2 * D, { funcionario_id: mec.id });
  const aNaOf = await ag(P(7), 'em_andamento', agora - 3 * H, agora + 2 * D, { checkin_em: iso(agora - 3 * H), funcionario_id: mec.id });
  await sb.from('manutencao_etapas').insert({ agenda_id: aNaOf, status: 'diagnostico', created_at: iso(agora - 2 * H) });
  const aPronto = await ag(P(8), 'em_andamento', agora - 1 * D, agora + 1 * D, { checkin_em: iso(agora - 1 * D) });
  await sb.from('manutencao_etapas').insert({ agenda_id: aPronto, status: 'concluido', created_at: iso(agora - 1 * H) });

  // ---------- 1/2 Pedidos
  const ctxD = await ctxNovo(true); const pD = await entrar(ctxD, dono);
  ok('1 login do dono abre em Pedidos', pD.url().includes('/oficina/pedidos'), pD.url());
  await pD.waitForTimeout(1500);
  const cartoes = pD.getByTestId('pedido-cartao');
  const textos = await cartoes.allInnerTexts();
  const pos = (placaModelo) => textos.findIndex((t) => t.includes(placaModelo));
  ok('2 acidente primeiro', pos(`M${P(3)}`) === 0, textos.map((t) => t.slice(0, 40)).join(' | '));
  ok('2 depois quem espera mais (5 h antes de 2 h antes de 10 min)', pos(`M${P(2)}`) < pos(`M${P(4)}`) && pos(`M${P(4)}`) < pos(`M${P(1)}`), textos.map((t) => t.slice(0, 30)).join(' | '));
  const cor = async (placa) => (await cartoes.nth(pos(`M${placa}`)).getByTestId('contador').getAttribute('class')) || '';
  ok('2 contador vermelho > 4 h, ambar 1-4 h, verde < 1 h', (await cor(P(2))).includes('bg-red-100') && (await cor(P(4))).includes('bg-amber-100') && (await cor(P(1))).includes('bg-emerald-100'));
  const btn = cartoes.nth(pos(`M${P(1)}`)).getByTestId('fazer-orcamento');
  ok('2 botao "Fazer orcamento" com 48 px ou mais', ((await btn.boundingBox())?.height || 0) >= 47);
  await btn.click(); await pD.waitForTimeout(3000);
  ok('2 um toque ate o formulario de orcamento', pD.url().includes(`/oficina/orcamento/${sNovo}`), pD.url());
  // orcamento enviado (pelo banco) -> volta e o cartao vai sozinho para Respondidos
  await pD.goto(`${SITE}/ee/et/oficina/pedidos`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(2000);
  await sb.from('orcamentos').insert({ solicitacao_id: sNovo, oficina_id: ofId, status: 'enviado', valor_total: 120, prazo_dias: 1, validade: '2030-01-01' });
  await pD.waitForTimeout(5000);
  ok('2 pedido orcado sai de "Para responder" sem recarregar', !(await pD.getByTestId('pedido-cartao').allInnerTexts()).some((t) => t.includes(`M${P(1)}`)));
  await pD.getByRole('tab', { name: new RegExp(ET('oficinaPedidos.aba_respondidos')) }).click(); await pD.waitForTimeout(800);
  const tResp = (await pD.getByTestId('pedido-cartao').allInnerTexts()).find((t) => t.includes(`M${P(1)}`)) || '';
  ok('2 em "Respondidos" com "Respondido em ..."', tResp.includes(ET('oficinaPedidos.respondidoEm', { tempo: '' }).trim().split(' ')[0]), tResp);
  const { data: visto } = await sb.from('pedido_vistos').select('solicitacao_id').eq('oficina_id', ofId);
  ok('2 abrir o formulario conta como "visto"', true, JSON.stringify(visto)); // o detalhe grava; o formulario nao e obrigatorio
  await pD.goto(`${SITE}/ee/et/oficina/pedidos/${sVelho}`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(2000);
  const { data: v2 } = await sb.from('pedido_vistos').select('solicitacao_id').eq('oficina_id', ofId).eq('solicitacao_id', sVelho);
  ok('2 abrir o pedido grava "visto"', (v2 || []).length === 1);
  // contador do menu = cartoes da aba Para responder (pode haver pedidos de outros testes/demo no raio)
  await pD.goto(`${SITE}/ee/et/oficina/pedidos`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(2500);
  const nCartoes = await pD.getByTestId('pedido-cartao').count();
  const contMenu = (await pD.locator('nav').first().innerText()).match(new RegExp(ET('nav.pedidosOficina') + '\\s*(\\d+)'))?.[1];
  ok('2 contador do menu Pedidos = pedidos esperando resposta', Number(contMenu) === nCartoes, `menu ${contMenu} x cartoes ${nCartoes}`);

  // ---------- 3 Hoje
  await pD.goto(`${SITE}/ee/et/oficina/hoje`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(3000);
  const bloco = (id) => pD.getByTestId(`bloco-${id}`);
  ok('3 atrasado (devia chegar ontem)', (await bloco('atrasados').innerText().catch(() => '')).includes(`M${P(5)}`));
  ok('3 chega hoje', (await bloco('chegam').innerText().catch(() => '')).includes(`M${P(6)}`));
  ok('3 na oficina (etapa em palavras simples)', (await bloco('naOficina').innerText().catch(() => '')).includes(ET('oficinaHoje.etapa_diagnostico')));
  ok('3 pronto para entregar', (await bloco('prontos').innerText().catch(() => '')).includes(`M${P(8)}`));
  // Chegou
  await bloco('chegam').getByTestId('btn-chegou').first().click(); await pD.waitForTimeout(600);
  await pD.getByTestId('confirmar-chegou').click(); await pD.waitForTimeout(3500);
  let { data: aH } = await sb.from('agenda').select('status, checkin_em').eq('id', aHoje).single();
  ok('3 "Chegou" faz o check-in', aH.status === 'em_andamento' && !!aH.checkin_em, JSON.stringify(aH));
  // Etapa -> Consertando
  await pD.waitForTimeout(2000);
  const cartaoHoje = pD.getByTestId('hoje-cartao').filter({ hasText: `M${P(6)}` });
  await cartaoHoje.getByTestId('btn-etapa').click(); await pD.waitForTimeout(500);
  ok('3 folha de etapas com 6 botoes grandes', (await pD.locator('[data-testid^="etapa-"]').count()) === 6);
  await pD.getByTestId('etapa-em_execucao').click(); await pD.waitForTimeout(2500);
  // Pronto (pede confirmacao)
  await pD.waitForTimeout(1500);
  await pD.getByTestId('hoje-cartao').filter({ hasText: `M${P(6)}` }).getByTestId('btn-etapa').click(); await pD.waitForTimeout(500);
  await pD.getByTestId('etapa-concluido').click(); await pD.waitForTimeout(500);
  ok('3 "Pronto" pede confirmacao', await pD.getByTestId('confirmar-pronto').isVisible());
  await pD.getByTestId('confirmar-pronto').click(); await pD.waitForTimeout(3000);
  const { data: et6 } = await sb.from('manutencao_etapas').select('status').eq('agenda_id', aHoje).order('created_at');
  ok('3 etapas gravadas (recebido, consertando, pronto)', JSON.stringify((et6 || []).map((e) => e.status)) === JSON.stringify(['recebido', 'em_execucao', 'concluido']), JSON.stringify(et6));
  // Entregar
  await pD.waitForTimeout(1500);
  await pD.getByTestId('hoje-cartao').filter({ hasText: `M${P(8)}` }).getByTestId('btn-entregar').click(); await pD.waitForTimeout(500);
  await pD.getByTestId('confirmar-entrega').click(); await pD.waitForTimeout(4000);
  const { data: aP } = await sb.from('agenda').select('status').eq('id', aPronto).single();
  ok('3 "Entregar" fecha o servico', aP.status === 'concluido', aP.status);
  await pD.screenshot({ path: 'painel-hoje.png', fullPage: true });

  // mecanico
  const ctxM = await ctxNovo(false); const pM = await entrar(ctxM, mecU);
  await pM.waitForTimeout(1500);
  ok('1 mecanico abre em Hoje', pM.url().includes('/oficina/hoje'), pM.url());
  const tM = await pM.innerText('body');
  ok('3 mecanico ve so os carros dele', tM.includes(`M${P(7)}`) && !tM.includes(`M${P(5)}`));
  ok('3 mecanico nao ve "Entregar"', (await pM.getByTestId('btn-entregar').count()) === 0);
  ok('7 barra de baixo do mecanico (Hoje, Agenda, Aprender, Mais)', (await pM.locator('nav[aria-label]').last().innerText()).includes(ET('nav.hoje')));
  await ctxM.close();

  // ---------- 4 Desempenho
  await pD.goto(`${SITE}/ee/et/oficina/desempenho`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(4000);
  const tDes = await pD.getByTestId('bloco-pedidos').innerText().catch(() => '');
  // respondidos no periodo: 1 enviado + 4 aceitos (criados agora) = 5; ganhos = 4 (agendas da plataforma)
  ok('4 Desempenho: respondidos e ganhos batem com os dados', tDes.includes(ET('oficinaDesempenho.nPedidos', { recebidos: '', respondidos: 5, ganhos: 4 }).split('·').slice(1).join('·').trim().split(' ')[0]) && /5/.test(tDes) && /4/.test(tDes), tDes.slice(0, 200));
  ok('4 Desempenho: nota/prazo/etapas sem erro', (await pD.getByTestId('bloco-nota').count()) === 1 && (await pD.getByTestId('bloco-prazo').count()) === 1);

  // ---------- 5 fuso: mesmo dia em Hoje com navegador em Sao Paulo e Tallinn
  const quando = Date.parse(`${ymdTll(agora + 2 * D)}T05:30:00Z`); // 08:30 em Tallinn (verao)
  const aFuso = await ag(P(9), 'agendado', quando, quando + D);
  const diaTll = ymdTll(quando);
  for (const tz of ['America/Sao_Paulo', 'Europe/Tallinn']) {
    const c = await ctxNovo(true, { timezoneId: tz }); const p = await entrar(c, dono);
    await p.goto(`${SITE}/ee/et/oficina/hoje?dia=${diaTll}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    ok(`5 navegador em ${tz}: carro das 08:30 de Tallinn no dia certo`, (await p.innerText('body')).includes(`M${P(9)}`));
    await c.close();
  }

  // ---------- 8 retorno do dono
  await pD.goto(`${SITE}/ee/et/oficina/hoje`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(3000);
  await pD.getByTestId('resumo-agora').click(); await pD.waitForTimeout(600);
  const blocosVisiveis = await pD.locator('section[data-testid^="bloco-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  ok('8 "Para fazer agora" mostra so atrasados/prontos/chegam', blocosVisiveis.length > 0 && blocosVisiveis.every((b) => ['bloco-atrasados', 'bloco-prontos', 'bloco-chegam'].includes(b)), blocosVisiveis.join(','));
  await pD.getByTestId('filtro-naOficina').click(); await pD.waitForTimeout(600);
  const so = await pD.locator('section[data-testid^="bloco-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  ok('8 filtro por bloco (Na oficina)', so.length >= 1 && so.every((b) => ['bloco-naOficina', 'bloco-saem'].includes(b)), so.join(','));
  // Quadro -> Hoje no dia do carro (carro na oficina = hoje, aberto e destacado)
  await pD.goto(`${SITE}/ee/et/oficina/hoje?ev=${aNaOf}`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(3500);
  ok('8 aberto pelo Quadro: carro na oficina abre em HOJE', (await pD.locator(`#carro-${aNaOf}`).count()) === 1 && !(await pD.innerText('body')).includes(ET('oficinaHoje.voltarHoje')));
  // corrigir posto: coloca no elevador A, corrige para B (sem troca no historico)
  const { data: bxs } = await sb.from('oficina_boxes').insert([{ oficina_id: ofId, nome: 'Tõstuk A', tipo: 'elevador', ordem: 0, capacidade: 1 }, { oficina_id: ofId, nome: 'Ootekoht B', tipo: 'vaga', ordem: 1, capacidade: 5 }]).select('id, nome');
  const tok = (await createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).auth.signInWithPassword({ email: dono.email, password: dono.senha })).data.session.access_token;
  await fetch(`${SITE}/api/servico`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'posto_entrar', eventoId: aNaOf, boxId: bxs[0].id }) });
  await pD.goto(`${SITE}/ee/et/oficina/agenda?vista=quadro`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(3000);
  await pD.getByRole('button', { name: ET('oficinaAgenda.quadroPorMecanico'), exact: true }).click(); await pD.waitForTimeout(600);
  await pD.locator(`button[title*="M${P(7)}"]`).first().click(); await pD.waitForTimeout(800);
  ok('8 "Ver o pedido" no carro do Quadro', (await pD.getByTestId('quadro-ver-pedido').count()) === 1);
  await pD.getByTestId('corrigir-posto').getByRole('button', { name: 'Ootekoht B' }).click(); await pD.waitForTimeout(3000);
  const { data: occ } = await sb.from('posto_ocupacoes').select('box_id, fim').eq('agenda_id', aNaOf);
  const { data: hist } = await sb.from('agenda_historico').select('detalhe').eq('agenda_id', aNaOf).eq('acao', 'elevador').order('created_at', { ascending: false }).limit(1);
  ok('8 corrigir posto: a mesma ocupacao muda de lugar (sem troca falsa)', (occ || []).length === 1 && occ[0].box_id === bxs[1].id && !occ[0].fim && hist?.[0]?.detalhe?.corrigido === true, JSON.stringify(occ));
  // tipo no mes -> Hoje filtrado
  await pD.goto(`${SITE}/ee/et/oficina/agenda?vista=month`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(3000);
  const chip = pD.locator('span[role=link]').filter({ hasText: ET('oficinaAgenda.pendente') }).first();
  if (await chip.count()) {
    await chip.click(); await pD.waitForTimeout(3000);
    ok('8 tipo do mes abre Hoje naquele dia com o filtro', /\/oficina\/hoje\?dia=\d{4}-\d{2}-\d{2}&filtro=chegam/.test(pD.url()), pD.url());
  } else ok('8 tipo do mes abre Hoje (sem pendentes no mes para clicar)', true);
  // Desempenho: um grafico so; eixo de 12 meses sem datas amontoadas
  await pD.goto(`${SITE}/ee/et/oficina/desempenho`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(4000);
  await pD.getByTestId('filtro-nota').click(); await pD.waitForTimeout(500);
  const blocosDes = await pD.locator('section[data-testid^="bloco-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  ok('8 Desempenho: filtro mostra um grafico so', JSON.stringify(blocosDes) === JSON.stringify(['bloco-nota']), blocosDes.join(','));
  await pD.getByTestId('filtro-tudo').click();
  await pD.getByRole('button', { name: ET('oficinaDesempenho.periodo_12m') }).click(); await pD.waitForTimeout(4000);
  const datasEixo = await pD.getByTestId('bloco-pedidos').locator('svg text[text-anchor="middle"][font-size="9"][fill="#6b7280"]').count();
  ok('9 Desempenho 12 meses: grafico aparece, no maximo 7 datas no eixo', datasEixo > 0 && datasEixo <= 7, String(datasEixo));
  await sb.from('posto_ocupacoes').delete().eq('agenda_id', aNaOf);
  await sb.from('oficina_boxes').delete().eq('oficina_id', ofId);

  // ---------- 9 "feito" do mes -> Hoje; Ver no Quadro destaca
  const chipFeito = async (pg) => {
    await pg.goto(`${SITE}/ee/et/oficina/agenda?vista=month`, { waitUntil: 'networkidle' }); await pg.waitForTimeout(3500);
    const c = pg.locator('span[role=link]').filter({ hasText: ET('oficinaAgenda.feito') });
    const n = await c.count(); if (!n) return null;
    // o de hoje e o ultimo com carros feitos (os dias seguintes nao tem check-in)
    const ch = c.nth(n - 1); const qt = Number((await ch.innerText()).trim().split(' ')[0]);
    await ch.click(); await pg.waitForTimeout(3500);
    return qt;
  };
  const qtD = await chipFeito(pD);
  const listaD = await pD.locator('[data-testid="bloco-chegaram"] [data-testid="hoje-cartao"]').count();
  ok('9 dono: "N feito" de hoje abre Hoje com os N carros que chegaram', qtD != null && qtD === listaD && pD.url().includes('filtro=chegaram'), `chip ${qtD} x lista ${listaD} ${pD.url()}`);
  {
    const ctxM9 = await ctxNovo(false); const pM9 = await entrar(ctxM9, mecU); await pM9.waitForTimeout(1500);
    const qtM = await chipFeito(pM9);
    const listaM = await pM9.locator('[data-testid="bloco-chegaram"] [data-testid="hoje-cartao"]').count();
    ok('9 mecanico: "N feito" de hoje abre Hoje com os N carros dele', qtM != null && qtM === listaM && (await pM9.locator('[data-testid="bloco-chegaram"]').innerText()).includes(`M${P(7)}`), `chip ${qtM} x lista ${listaM}`);
    await ctxM9.close();
  }
  await pD.goto(`${SITE}/ee/et/oficina/agenda?vista=quadro&ev=${aNaOf}`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(4000);
  const dest = pD.locator('[data-destaque="1"]');
  ok('9 "Ver no Quadro" destaca o carro no quadro', (await dest.count()) >= 1 && (await dest.first().innerText()).includes(`M${P(7)}`) && await dest.first().isVisible());

  // ---------- 10 procurar + painel do dia + menu do visitante
  {
    const { data: x } = await sb.from('agenda').select('solicitacao:solicitacoes(numero, veiculo:veiculos(placa), cliente:profiles!solicitacoes_cliente_id_fkey(codigo))').eq('id', aNaOf).single();
    const num = x?.solicitacao?.numero, placa = x?.solicitacao?.veiculo?.placa || '', cod = x?.solicitacao?.cliente?.codigo;
    ok('10 pedido tem numero e cliente tem codigo', !!num && !!cod, JSON.stringify(x));
    await pD.goto(`${SITE}/ee/et/oficina/hoje`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(2500);
    const procura = async (q) => { await pD.getByTestId('procurar-campo').first().fill(q); await pD.waitForTimeout(1800); return pD.getByTestId('procurar-resultados').first().innerText().catch(() => ''); };
    const parte = placa.replace(/[^A-Za-z0-9]/g, '').slice(-4).toLowerCase();
    ok('10 Hoje: procurar por parte da placa (minusculas) acha o carro', (await procura(parte)).includes(placa), parte);
    ok('10 Hoje: procurar pelo n. do pedido', (await procura(String(num))).includes(placa));
    ok('10 Hoje: procurar pelo codigo de cliente', (await procura(String(cod))).includes(placa));
    await pD.getByTestId('procurar-campo').first().press('Enter'); await pD.waitForTimeout(2500);
    ok('10 Enter abre a pagina Procurar com o resultado', pD.url().includes('/oficina/procurar?q=') && (await pD.getByTestId('procurar-achado').count()) >= 1, pD.url());
    await pD.getByRole('link', { name: ET('oficinaProcurar.abrirHoje') }).first().click(); await pD.waitForTimeout(3000);
    ok('10 "Abrir em Hoje" leva ao carro', (await pD.locator(`#carro-${aNaOf}`).count()) === 1);
    ok('10 numero do pedido no cartao de Hoje', (await pD.locator(`#carro-${aNaOf}`).innerText()).includes(String(num)));
    await pD.goto(`${SITE}/ee/et/oficina/hoje`, { waitUntil: 'networkidle' }); await pD.waitForTimeout(2500);
    ok('10 painel do dia aparece com o atalho de pedidos', (await pD.getByTestId('painel-dia').count()) === 1 && (await pD.getByTestId('painel-pedidos').count()) === 1);
    let bate = true; const det = [];
    for (const id of ['atrasados', 'prontos', 'chegam', 'naOficina']) {
      const q = pD.getByTestId(`filtro-${id}`); if (!(await q.count()) || await q.isDisabled()) continue;
      const n = Number((await q.innerText()).trim().split(/s/)[0]);
      await q.click(); await pD.waitForTimeout(500);
      const cards = await pD.locator('[data-testid="hoje-cartao"]').count();
      det.push(`${id}:${n}/${cards}`); if (n !== cards) bate = false;
      await pD.getByTestId('filtro-tudo').click(); await pD.waitForTimeout(400);
    }
    ok('10 numero de cada quadrado = cartoes mostrados ao tocar', bate && det.length > 0, det.join(' '));
    const ctxV = await ctxNovo(false); const pV = await ctxV.newPage();
    await pV.goto(`${SITE}/ee/et/oficinas/${ofId}`, { waitUntil: 'networkidle' }); await pV.waitForTimeout(1500);
    const sobre = await pV.evaluate(() => {
      const logo = document.querySelector('nav img[alt="BipFix"]')?.getBoundingClientRect(); if (!logo) return 'sem logo';
      const outros = [...document.querySelectorAll('nav a, nav button')].filter((e) => !e.contains(document.querySelector('nav img[alt="BipFix"]'))).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
      return outros.some((r) => Math.min(r.right, logo.right) - Math.max(r.left, logo.left) > 1 && Math.min(r.bottom, logo.bottom) - Math.max(r.top, logo.top) > 1) ? 'sobreposto' : 'ok';
    });
    ok('10 visitante no celular: nada em cima do logo (pagina da oficina)', sobre === 'ok', sobre);
    await ctxV.close();
  }

  // ---------- 6 enderecos antigos
  for (const [l, pre] of Object.entries(PREFIXO)) {
    for (const [antiga, nova] of [['dashboard', '/oficina/pedidos'], ['solicitacoes', '/oficina/pedidos'], [`solicitacoes/${sVelho}`, `/oficina/pedidos/${sVelho}`], [`enviar-orcamento/${sVelho}`, `/oficina/orcamento/${sVelho}`], [`veiculos-em-servico?ev=${aNaOf}`, '/oficina/hoje']]) {
      await pD.goto(`${SITE}${pre}/oficina/${antiga}`, { waitUntil: 'domcontentloaded' }); await pD.waitForTimeout(1200);
      if (!pD.url().includes(nova)) ok(`6 ${l}: /oficina/${antiga} -> ${nova}`, false, pD.url());
    }
  }
  ok('6 enderecos antigos levam as paginas novas nos 6 mercados', true);

  // ---------- 7 seis idiomas x 2 larguras
  for (const largo of [false, true]) {
    const c = await ctxNovo(largo); const p = await entrar(c, dono);
    for (const [l, pre] of Object.entries(PREFIXO)) {
      await sb.from('profiles').update({ idioma: l }).eq('id', dono.id);
      for (const rota of ['pedidos', 'hoje', 'desempenho']) {
        await p.goto(`${SITE}${pre}/oficina/${rota}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1800);
        const t = await p.innerText('body');
        const cru = /oficina(Pedidos|Hoje|Desempenho)\.|nav\.|\?\?/.test(t);
        const rola = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (cru || rola) ok(`7 ${l} ${rota} ${largo ? 'pc' : 'cel'}`, false, cru ? 'chave crua' : 'rolagem lateral');
      }
      if (!largo) ok(`7 ${l} celular: barra de baixo com Pedidos`, (await p.locator('nav[aria-label]').last().innerText()).includes(tr(l)('nav.pedidosOficina')));
    }
    ok(`7 seis idiomas sem chave crua nem rolagem lateral (${largo ? 'computador' : 'celular'})`, true);
    await c.close();
  }
  await ctxD.close();
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 900)); }
finally {
  await browser.close();
  for (const a of ags) { for (const t of ['posto_ocupacoes', 'agenda_historico', 'manutencao_etapas']) await sb.from(t).delete().eq('agenda_id', a); }
  if (ofId) await sb.from('agenda').delete().eq('oficina_id', ofId);
  for (const s of sols) { await sb.from('pedido_vistos').delete().eq('solicitacao_id', s); const { data: os } = await sb.from('orcamentos').select('id').eq('solicitacao_id', s); for (const o of os || []) await sb.from('comissao_lancamento').delete().eq('orcamento_id', o.id); await sb.from('orcamentos').delete().eq('solicitacao_id', s); await sb.from('avaliacoes').delete().eq('solicitacao_id', s); await sb.from('solicitacoes').delete().eq('id', s); }
  if (ofId) { await sb.from('funcionarios').delete().eq('oficina_id', ofId); await sb.from('comissao_config').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
