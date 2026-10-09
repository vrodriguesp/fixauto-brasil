// E2E por MERCADO e IDIOMA (producao, celular 390 px), feito pela tela como
// pessoas usariam. Contas, oficinas e lojas de teste em 4 paises; limpa tudo.
//  Estonia (Tallinn): oficina et + oficina ru + loja; clientes ru, en e um
//    italiano morando em Tallinn (idioma da tela != pais)
//  Italia (Milao): 2 oficinas it + loja; cliente it
//  Portugal (Lisboa): oficina pt-PT; cliente pt-PT
//  Brasil (Sao Paulo): oficina pt; cliente pt
// Para cada cenario: cliente cria o pedido pela tela (GPS do pais) -> so as
// oficinas daquele lugar recebem o aviso, no idioma de cada dono -> oficina
// manda orcamento pela tela -> cliente ve na moeda certa -> conversa nos dois
// sentidos (cada um no seu idioma) -> aceita escolhendo o horario -> check-in
// e etapas -> revisao de preco aprovada pela tela -> concluido -> entregue ->
// avaliacao pela tela. Pecas: oficina pede cotacao, so a loja do mesmo pais
// ve, responde, oficina fecha. No fim: todos os avisos no idioma de quem le.
//   node site-mercados.mjs <.env.local> [mercados=EE,IT,PT,BR]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const SO = (process.argv[3] || 'EE,IT,PT,BR').split(',');
const SITE = 'https://bipfix.com';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const MSG = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/messages';
const msgs = (l) => Object.assign({}, ...['', '.cliente', '.oficina', '.loja', '.auth', '.misc'].map((a) => JSON.parse(fs.readFileSync(`${MSG}/${l}${a}.json`, 'utf8'))));
const T = {}; const tr = (l) => (T[l] ||= (() => { const m = msgs(l); return (k, v = {}) => String(k.split('.').reduce((o, p) => o?.[p], m) ?? `??${k}`).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''); })());
const PREFIXO = { pt: '/br/pt', 'pt-PT': '/pt/pt', en: '/ee/en', et: '/ee/et', it: '/it/it', ru: '/ee/ru' };
const MOEDA = { EE: '€', IT: '€', PT: '€', BR: 'R$' };

let falhas = 0; const resumo = [];
const ok = (n, c, x = '') => { if (!c) { falhas++; resumo.push(n); } console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x && !c ? ' - ' + String(x).replace(/\s+/g, ' ').slice(0, 220) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const oficinas = []; const lojas = []; const sols = []; const veics = [];

// Idioma provavel de um texto curto (avisos): conta palavras tipicas
const MARCAS = {
  ru: /[а-яё]/i,
  et: /[äöü]|\b(sinu|uus|töökoda|hinnapakkumi\w*|teade|on|ja|kinnita\w*|valmis|remondi|uuendus)\b/i,
  it: /\b(il|la|le|di|del|della|per|tuo|tua|nuov[oa]|preventivo|officina|è|pronta?|aggiornamento|riparazione|recensione)\b/i,
  en: /\b(the|your|new|quote|request|garage|is|has|ready|car|repair|update|review|workshop)\b/i,
  pt: /[çã]|\b(o|seu|sua|novo|nova|orçamento|oficina|pedido|carro|está|foi|conserto|reparação|avaliação)\b/i,
};
const idiomaDe = (txt) => {
  if (MARCAS.ru.test(txt)) return 'ru';
  const pont = Object.fromEntries(['et', 'it', 'en', 'pt'].map((l) => [l, (String(txt).match(new RegExp(MARCAS[l].source, 'gi')) || []).length]));
  return Object.entries(pont).sort((a, b) => b[1] - a[1])[0][0];
};
const grupo = (l) => (l === 'pt-PT' ? 'pt' : l);

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const celular = async (geo, fuso) => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, geolocation: geo, permissions: ['geolocation'], timezoneId: fuso });
  await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  return c;
};
const entrar = async (ctx, u) => {
  const p = await ctx.newPage();
  await p.goto(`${SITE}${PREFIXO[u.idioma]}/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', u.email); await p.fill('input[type=password]', u.senha);
  await p.click('button[type=submit]'); await p.waitForTimeout(4000);
  return p;
};
const botao = (p, txt) => p.getByRole('button', { name: txt, exact: false }).locator('visible=true').last();
const api = async (u, rota, corpo) => {
  const r = await fetch(`${SITE}${rota}`, { method: 'POST', headers: { Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  return { status: r.status, ok: r.ok, json: await r.json().catch(() => ({})) };
};
const semTransbordo = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const semChaveCrua = (txt) => !/\b[a-z]+[A-Z]\w*\.[a-z]\w+\b|\?\?[a-z]/.test(txt.replace(/https?:\S+/g, ''));

async function conta(tipo, idioma, nome) {
  const email = `merc-${tipo}${contas.length}-${tag}@example.test`; const senha = `Merc${tag}Senha9`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) throw new Error('conta: ' + error.message);
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome, email, idioma });
  const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await a.auth.signInWithPassword({ email, password: senha });
  return { id: data.user.id, email, senha, idioma, nome, token: s.session.access_token };
}
async function oficina(dono, nome, cidade, pais, lat, lon) {
  const { data, error } = await sb.from('oficinas').insert({ profile_id: dono.id, nome_fantasia: nome, endereco: 'Rua Teste 1', cidade, estado: '-', cep: '00000', pais, latitude: lat, longitude: lon, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica', 'funilaria'] }).select('id').single();
  if (error) throw new Error('oficina: ' + error.message);
  oficinas.push(data.id); return data.id;
}
async function loja(dono, nome, cidade, pais, lat, lon) {
  const { data, error } = await sb.from('lojas_pecas').insert({ profile_id: dono.id, nome_fantasia: nome, endereco: 'Rua Teste 2', cidade, estado: '-', cep: '00000', pais, latitude: lat, longitude: lon, raio_atendimento_km: 50, ativa: true }).select('id').single();
  if (error) throw new Error('loja: ' + error.message);
  lojas.push(data.id); return data.id;
}
async function carro(cli, marca, modelo) {
  const { data } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: marca, fipe_modelo: modelo, fipe_ano: '2019', placa: `T${tag}`.slice(0, 7).toUpperCase() }).select('id').single();
  veics.push(data.id); return data.id;
}

// ---------- pedido pela tela do cliente
async function criarPedido(pC, cli, mk, descricao) {
  const t = tr(cli.idioma); const pre = PREFIXO[cli.idioma];
  await pC.goto(`${SITE}${pre}/cliente/nova-solicitacao`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(2500);
  await pC.locator('button', { hasText: 'Corolla' }).first().click();
  await botao(pC, t('clienteNovaSolicitacao.next')).click(); await pC.waitForTimeout(600);
  await pC.getByText(t('constants.tiposServico.mecanica'), { exact: true }).first().click();
  await botao(pC, t('clienteNovaSolicitacao.next')).click(); await pC.waitForTimeout(600);
  await botao(pC, t('clienteNovaSolicitacao.next')).click(); await pC.waitForTimeout(600);
  const desc = pC.locator('textarea').locator('visible=true').first();
  if (await desc.count()) await desc.fill(descricao);
  await botao(pC, t('clienteNovaSolicitacao.next')).click(); await pC.waitForTimeout(800);
  const campoEnd = pC.locator('#caee7-102');
  await campoEnd.click(); await campoEnd.pressSequentially(mk.endereco, { delay: 35 });
  const sug = pC.getByRole('option').filter({ hasText: mk.cidadeSug }).first();
  await sug.waitFor({ timeout: 10000 }).catch(() => {});
  const pegou = await sug.isVisible().catch(() => false);
  if (pegou) await sug.click(); else await campoEnd.press('Escape').catch(() => {});
  const txt = await pC.innerText('body');
  ok(`${mk.cod} pedido (${cli.idioma}): tela sem chave crua`, semChaveCrua(txt), txt.match(/\b[a-z]+[A-Z]\w*\.[a-z]\w+\b/)?.[0]);
  ok(`${mk.cod} pedido (${cli.idioma}): cabe no celular`, await semTransbordo(pC));
  await pC.locator('button.btn-success').locator('visible=true').first().click();
  await pC.waitForTimeout(6000);
  const { data } = await sb.from('solicitacoes').select('id, latitude, longitude, endereco').eq('cliente_id', cli.id).order('created_at', { ascending: false }).limit(1);
  const s = data?.[0];
  ok(`${mk.cod} pedido (${cli.idioma}): criado pela tela`, !!s);
  if (s) {
    sols.push(s.id);
    const perto = Math.abs(s.latitude - mk.lat) < 0.3 && Math.abs(s.longitude - mk.lon) < 0.3;
    ok(`${mk.cod} pedido: local no pais certo (nao Sao Paulo por engano)`, perto, `${s.latitude},${s.longitude} ${s.endereco}`);
  }
  return s?.id;
}

// ---------- orcamento pela tela da oficina
async function orcar(pO, dono, solId, valor, item) {
  const t = tr(dono.idioma);
  await pO.goto(`${SITE}${PREFIXO[dono.idioma]}/oficina/enviar-orcamento/${solId}`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(2500);
  await pO.locator(`input[placeholder="${t('oficinaEnviarOrcamento.placeholderDescricaoItem')}"]`).first().fill(item);
  await pO.locator('input[type=number]').locator('visible=true').first().fill(String(valor));
  ok(`orcamento (${dono.idioma}): formulario cabe no celular`, await semTransbordo(pO));
  await pO.locator('button[type=submit]').locator('visible=true').last().click(); await pO.waitForTimeout(4500);
  const { data } = await sb.from('orcamentos').select('id, valor_total').eq('solicitacao_id', solId).eq('oficina_id', dono.oficinaId);
  return data?.[0];
}

// ---------- conversa (cada lado no seu idioma)
async function conversar(pC, cli, pO, dono, solId, frasesC, frasesO, mk) {
  const pre = PREFIXO[cli.idioma];
  await pC.goto(`${SITE}${pre}/cliente/mensagens/${solId}?oficina=${dono.oficinaId}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(2500);
  await pO.goto(`${SITE}${PREFIXO[dono.idioma]}/oficina/mensagens/${solId}`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(2500);
  const bc = pC.locator('input[type=text]').last(); await bc.fill(frasesC); await bc.press('Enter'); await pC.waitForTimeout(3500);
  ok(`${mk} conversa: oficina (${dono.idioma}) recebe a mensagem do cliente (${cli.idioma}) na hora`, (await pO.innerText('body')).includes(frasesC.slice(0, 15)));
  const bo = pO.locator('input[type=text]').last(); await bo.fill(frasesO); await bo.press('Enter'); await pO.waitForTimeout(3500);
  ok(`${mk} conversa: cliente recebe a resposta da oficina na hora`, (await pC.innerText('body')).includes(frasesO.slice(0, 15)));
  ok(`${mk} conversa: tela do cliente sem chave crua e dentro do celular`, semChaveCrua(await pC.innerText('body')) && await semTransbordo(pC));
}

// ---------- aceitar pela tela
async function aceitar(pC, cli, solId, nomeOficina) {
  const t = tr(cli.idioma);
  await pC.goto(`${SITE}${PREFIXO[cli.idioma]}/cliente/orcamentos/${solId}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
  const bloco = pC.locator('div', { hasText: nomeOficina }).filter({ has: pC.getByRole('button', { name: t('clienteOrcamentoDetalhe.acceptAndSchedule') }) }).last();
  await bloco.getByRole('button', { name: t('clienteOrcamentoDetalhe.acceptAndSchedule') }).first().click(); await pC.waitForTimeout(1200);
  await pC.locator('button').filter({ hasText: /\d{2}:\d{2} - \d{2}:\d{2}/ }).locator('visible=true').first().click();
  await botao(pC, t('clienteOrcamentoDetalhe.confirmAppointment')).click(); await pC.waitForTimeout(4500);
}

// ---------- servico ate a avaliacao
async function servico(pC, cli, dono, solId, orc, mk, valorRevisado) {
  const t = tr(cli.idioma);
  const { data: ag } = await sb.from('agenda').select('id, status').eq('solicitacao_id', solId).eq('oficina_id', dono.oficinaId).maybeSingle();
  ok(`${mk} agenda criada no aceite`, !!ag);
  if (!ag) return;
  ok(`${mk} check-in`, (await api(dono, '/api/servico', { acao: 'checkin', eventoId: ag.id, antecipar: true })).ok);
  ok(`${mk} etapa "em execucao"`, (await api(dono, '/api/servico', { acao: 'etapa', eventoId: ag.id, status: 'em_execucao' })).ok);
  // revisao de preco: oficina propoe, cliente aprova pela tela
  const itens = [{ descricao: 'Extra', tipo: 'peca', quantidade: 1, valor_unitario: valorRevisado - 50 }, { descricao: 'Labor', tipo: 'mao_de_obra', quantidade: 1, valor_unitario: 50 }];
  const rv = await api(dono, '/api/orcamento-revisao', { orcamentoId: orc.id, motivo: 'Teste: dano escondido encontrado', itens });
  ok(`${mk} oficina propoe revisao`, rv.ok, JSON.stringify(rv.json));
  await pC.goto(`${SITE}${PREFIXO[cli.idioma]}/cliente/orcamentos/${solId}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3500);
  const tRev = await pC.innerText('body');
  ok(`${mk} cliente (${cli.idioma}) ve a revisao com aprovar/recusar no seu idioma`, tRev.includes(t('revisaoOrcamento.aprovar')) && tRev.includes(t('revisaoOrcamento.recusar')), tRev.slice(0, 200));
  ok(`${mk} revisao na moeda do pais (${MOEDA[mk.slice(0, 2)]})`, tRev.includes(MOEDA[mk.slice(0, 2)]));
  await pC.getByRole('button', { name: t('revisaoOrcamento.aprovar') }).first().click(); await pC.waitForTimeout(3500);
  const { data: o2 } = await sb.from('orcamentos').select('valor_total, valor_original, revisao_numero').eq('id', orc.id).single();
  ok(`${mk} revisao aprovada: novo valor, original guardado`, Number(o2.valor_total) === valorRevisado && Number(o2.valor_original) === Number(orc.valor_total) && o2.revisao_numero === 1, JSON.stringify(o2));
  ok(`${mk} etapa "concluido" (cliente avisado para buscar)`, (await api(dono, '/api/servico', { acao: 'etapa', eventoId: ag.id, status: 'concluido' })).ok);
  ok(`${mk} etapa "entregue"`, (await api(dono, '/api/servico', { acao: 'etapa', eventoId: ag.id, status: 'entregue' })).ok);
  // avaliacao pela tela
  await pC.goto(`${SITE}${PREFIXO[cli.idioma]}/cliente/orcamentos/${solId}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3500);
  await pC.getByRole('radio', { name: '5/5' }).first().click().catch(() => {});
  const ta = pC.locator('textarea').locator('visible=true').first();
  if (await ta.count()) await ta.fill('Teste: ottimo / suurepärane / отлично');
  await botao(pC, t('clienteOrcamentoDetalhe.sendReview')).click().catch(() => {});
  await pC.waitForTimeout(3500);
  const { data: av } = await sb.from('avaliacoes').select('nota').eq('solicitacao_id', solId);
  ok(`${mk} cliente avaliou pela tela (5 estrelas)`, (av || []).length === 1 && av[0].nota === 5, JSON.stringify(av));
  const { data: of } = await sb.from('oficinas').select('avaliacao_media, total_avaliacoes').eq('id', dono.oficinaId).single();
  dono.avaliacoes = (dono.avaliacoes || 0) + 1;
  ok(`${mk} media da oficina atualizada (${dono.avaliacoes} avaliacao/oes)`, Number(of.avaliacao_media) === 5 && of.total_avaliacoes === dono.avaliacoes, JSON.stringify(of));
}

// ---------- pecas: so a loja do mesmo pais ve
async function pecas(pO, dono, lojaDono, outraLojaDono, ctxL, ctxL2, mk, preco) {
  const t = tr(dono.idioma); const tl = tr(lojaDono.idioma);
  await pO.goto(`${SITE}${PREFIXO[dono.idioma]}/oficina/pecas`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(2000);
  await botao(pO, t('oficinaPecas.novaCotacao')).click();
  const desc = `PECA-${mk}-${tag}`;
  await pO.getByLabel(t('oficinaPecas.oQueVocePrecisa'), { exact: false }).locator('visible=true').first().fill(desc);
  await pO.getByLabel(t('oficinaPecas.marca'), { exact: false }).locator('visible=true').first().fill('Toyota');
  await pO.getByLabel(t('oficinaPecas.modelo'), { exact: false }).locator('visible=true').first().fill('Corolla');
  await botao(pO, t('oficinaPecas.enviarCotacao')).click(); await pO.waitForTimeout(3500);
  const { data: cot } = await sb.from('cotacoes_pecas').select('id').eq('oficina_id', dono.oficinaId).eq('peca_descricao', desc).maybeSingle();
  ok(`${mk} pecas: oficina (${dono.idioma}) pediu cotacao pela tela`, !!cot);
  if (!cot) return;
  const pL = await entrar(ctxL, lojaDono);
  await pL.goto(`${SITE}${PREFIXO[lojaDono.idioma]}/loja/cotacoes`, { waitUntil: 'networkidle' }); await pL.waitForTimeout(2500);
  ok(`${mk} pecas: loja do mesmo pais (${lojaDono.idioma}) ve o pedido`, (await pL.innerText('body')).includes(desc));
  if (outraLojaDono) {
    const pL2 = await entrar(ctxL2, outraLojaDono);
    await pL2.goto(`${SITE}${PREFIXO[outraLojaDono.idioma]}/loja/cotacoes`, { waitUntil: 'networkidle' }); await pL2.waitForTimeout(2500);
    ok(`${mk} pecas: loja de OUTRO pais nao ve o pedido`, !(await pL2.innerText('body')).includes(desc));
    await pL2.close();
  }
  const cartao = pL.locator('div', { hasText: desc }).filter({ has: pL.getByRole('button', { name: tl('lojaCotacoes.responderCotacaoButton') }) }).last();
  await cartao.getByRole('button', { name: tl('lojaCotacoes.responderCotacaoButton') }).first().click();
  await pL.getByLabel(tl('lojaCotacoes.labelPreco'), { exact: false }).locator('visible=true').first().fill(String(preco));
  await pL.getByLabel(tl('lojaCotacoes.labelPrazo'), { exact: false }).locator('visible=true').first().fill('2');
  await botao(pL, tl('lojaCotacoes.enviarRespostaButton')).click(); await pL.waitForTimeout(3500);
  const { data: resp } = await sb.from('cotacoes_pecas_respostas').select('id').eq('cotacao_id', cot.id);
  ok(`${mk} pecas: loja respondeu pela tela`, (resp || []).length === 1);
  await pO.goto(`${SITE}${PREFIXO[dono.idioma]}/oficina/pecas`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(2500);
  const tO = await pO.innerText('body');
  ok(`${mk} pecas: oficina ve a resposta na moeda do pais`, tO.includes(String(preco)) && tO.includes(MOEDA[mk.slice(0, 2)]), tO.slice(0, 160));
  pO.once('dialog', (d) => d.accept());
  await botao(pO, t('oficinaPecas.confirmarPedidoBtn')).click(); await pO.waitForTimeout(3500);
  const { data: ped } = await sb.from('pedidos_pecas').select('id, status').eq('cotacao_id', cot.id);
  ok(`${mk} pecas: oficina fechou o pedido`, (ped || []).length === 1, JSON.stringify(ped));
  await pL.close();
}

// ---------- avisos no idioma de quem le
async function conferirAvisos(u, rotulo) {
  const { data } = await sb.from('notificacoes').select('titulo, mensagem, dados').eq('profile_id', u.id);
  const minhas = (data || []).filter((n) => !n.dados?.solicitacao_id || sols.includes(n.dados.solicitacao_id));
  // idioma pelo TITULO (a mensagem pode citar texto do usuario, ex. o comentario da avaliacao)
  const texto = (n) => (Object.keys(MARCAS).some((l) => MARCAS[l].test(n.titulo)) ? n.titulo : `${n.titulo} ${n.mensagem}`);
  const errados = minhas.filter((n) => grupo(idiomaDe(texto(n))) !== grupo(u.idioma));
  ok(`avisos de ${rotulo} (${u.idioma}): ${minhas.length} avisos, todos no idioma certo`, minhas.length > 0 && errados.length === 0,
    errados.map((n) => `[${idiomaDe(texto(n))}] ${n.titulo}`).join(' | ') || 'nenhum aviso');
}

const MERCADOS = {
  EE: { cod: 'EE', cidade: 'Tallinn', lat: 59.437, lon: 24.745, fuso: 'Europe/Tallinn', endereco: 'Viru väljak 4', cidadeSug: /Tallinn/ },
  IT: { cod: 'IT', cidade: 'Milano', lat: 45.4642, lon: 9.19, fuso: 'Europe/Rome', endereco: 'Piazza del Duomo 1', cidadeSug: /Milano/ },
  PT: { cod: 'PT', cidade: 'Lisboa', lat: 38.7223, lon: -9.1393, fuso: 'Europe/Lisbon', endereco: 'Praça do Comércio', cidadeSug: /Lisboa/ },
  BR: { cod: 'BR', cidade: 'São Paulo', lat: -23.5614, lon: -46.6559, fuso: 'America/Sao_Paulo', endereco: 'Avenida Paulista 1000', cidadeSug: /São Paulo/ },
};

try {
  // ---------- pessoas e empresas de teste
  const P = {};
  const mkOf = async (k, idioma, nome, m) => { P[k] = await conta('oficina', idioma, `TESTE ${k}`); P[k].oficinaId = await oficina(P[k], `${nome} ${tag}`, m.cidade, m.cod, m.lat, m.lon); P[k].nomeOficina = `${nome} ${tag}`; };
  const mkLoja = async (k, idioma, m) => { P[k] = await conta('loja_pecas', idioma, `TESTE ${k}`); P[k].lojaId = await loja(P[k], `PEÇAS ${k} ${tag}`, m.cidade, m.cod, m.lat, m.lon); };
  const mkCli = async (k, idioma) => { P[k] = await conta('cliente', idioma, `TESTE ${k}`); await carro(P[k], 'Toyota', 'Corolla'); };
  const M = MERCADOS;
  await mkOf('ofET', 'et', 'Autoremont Kesklinn', M.EE); await mkOf('ofRU', 'ru', 'Автосервис Ласнамяэ', M.EE);
  await mkOf('ofIT1', 'it', 'Officina Duomo', M.IT); await mkOf('ofIT2', 'it', 'Autofficina Navigli', M.IT);
  await mkOf('ofPT', 'pt-PT', 'Oficina Baixa', M.PT); await mkOf('ofBR', 'pt', 'Oficina Paulista', M.BR);
  await mkLoja('ljEE', 'en', M.EE); await mkLoja('ljIT', 'it', M.IT);
  await mkCli('cliRU', 'ru'); await mkCli('cliEN', 'en'); await mkCli('cliITee', 'it'); await mkCli('cliIT', 'it'); await mkCli('cliPT', 'pt-PT'); await mkCli('cliBR', 'pt');
  console.log(`contas de teste criadas (${contas.length}), oficinas ${oficinas.length}, lojas ${lojas.length}`);

  const cenarios = [
    { m: M.EE, cli: 'cliITee', ofs: ['ofET', 'ofRU'], escolhe: 'ofRU', fora: ['ofIT1', 'ofBR'], valores: [220, 200], rev: 260,
      frases: { cli: 'Ciao, quanto tempo serve per i freni?', ofET: 'Tere! Pidurid saab valmis ühe päevaga.', ofRU: 'Здравствуйте! Тормоза сделаем за один день.' } },
    { m: M.EE, cli: 'cliRU', ofs: ['ofRU'], escolhe: 'ofRU', fora: ['ofPT'], valores: [150], rev: 190,
      frases: { cli: 'Добрый день, можно в пятницу?', ofRU: 'Да, в пятницу в 9:00 подойдёт.' } },
    { m: M.EE, cli: 'cliEN', ofs: ['ofET'], escolhe: 'ofET', fora: ['ofIT2'], valores: [175], rev: 210,
      frases: { cli: 'Hi, do you have the parts in stock?', ofET: 'Tere! Jah, osad on laos.' } },
    { m: M.IT, cli: 'cliIT', ofs: ['ofIT1', 'ofIT2'], escolhe: 'ofIT2', fora: ['ofET', 'ofPT'], valores: [180, 165], rev: 240,
      frases: { cli: 'Buongiorno, si può fare sabato?', ofIT1: 'Buongiorno! Sabato mattina va bene.', ofIT2: 'Certo, sabato alle 9.' } },
    { m: M.PT, cli: 'cliPT', ofs: ['ofPT'], escolhe: 'ofPT', fora: ['ofBR', 'ofET'], valores: [130], rev: 170,
      frases: { cli: 'Bom dia, consegue ver o carro amanhã?', ofPT: 'Bom dia! Amanhã às 9h pode trazer.' } },
    { m: M.BR, cli: 'cliBR', ofs: ['ofBR'], escolhe: 'ofBR', fora: ['ofPT', 'ofIT1'], valores: [450], rev: 600,
      frases: { cli: 'Oi, dá pra fazer hoje à tarde?', ofBR: 'Opa! Pode trazer às 14h.' } },
  ].filter((c) => SO.includes(c.m.cod));

  for (const c of cenarios) {
    const cli = P[c.cli]; const mk = `${c.m.cod}/${cli.idioma}`;
    console.log(`\n=== ${mk}: cliente ${cli.idioma} em ${c.m.cidade}; oficinas ${c.ofs.map((k) => P[k].idioma).join('+')}`);
    const ctxC = await celular({ latitude: c.m.lat, longitude: c.m.lon }, c.m.fuso);
    const pC = await entrar(ctxC, cli);
    const solId = await criarPedido(pC, cli, c.m, `Teste ${mk}: rumore freni / pidurid / тормоза`);
    if (!solId) { await ctxC.close(); continue; }
    await new Promise((r) => setTimeout(r, 3000));
    // avisos de pedido novo: so as oficinas do lugar
    const { data: nots } = await sb.from('notificacoes').select('profile_id, titulo').eq('tipo', 'nova_solicitacao').in('profile_id', [...c.ofs, ...c.fora].map((k) => P[k].id)).eq('dados->>solicitacao_id', solId);
    for (const k of c.ofs) ok(`${mk} aviso de pedido novo chegou a ${P[k].nomeOficina} (${P[k].idioma})`, (nots || []).some((n) => n.profile_id === P[k].id));
    for (const k of c.fora) ok(`${mk} oficina de outro lugar (${P[k].nomeOficina}) NAO recebe o aviso`, !(nots || []).some((n) => n.profile_id === P[k].id));

    const ctxs = []; const pags = {}; const orcs = {};
    for (const [i, k] of c.ofs.entries()) {
      const d = P[k];
      const ctxO = await celular({ latitude: c.m.lat, longitude: c.m.lon }, c.m.fuso); ctxs.push(ctxO);
      const pO = await entrar(ctxO, d); pags[k] = pO;
      await pO.goto(`${SITE}${PREFIXO[d.idioma]}/oficina/solicitacoes`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(2500);
      const lista = await pO.innerText('body');
      ok(`${mk} ${d.nomeOficina} (${d.idioma}) ve o pedido na lista`, lista.includes(`Teste ${mk}`));
      ok(`${mk} lista da oficina (${d.idioma}) sem chave crua e dentro do celular`, semChaveCrua(lista) && await semTransbordo(pO));
      orcs[k] = await orcar(pO, d, solId, c.valores[i], `Piduriklotsid / pastiglie / колодки ${i + 1}`);
      ok(`${mk} ${d.nomeOficina} mandou orcamento pela tela`, !!orcs[k]);
    }
    for (const k of c.fora) {
      const d = P[k];
      const ctxF = await celular({ latitude: MERCADOS[d.idioma === 'pt' ? 'BR' : d.idioma === 'pt-PT' ? 'PT' : d.idioma === 'it' ? 'IT' : 'EE'].lat, longitude: 0 }, 'UTC');
      const pF = await entrar(ctxF, d);
      await pF.goto(`${SITE}${PREFIXO[d.idioma]}/oficina/solicitacoes`, { waitUntil: 'networkidle' }); await pF.waitForTimeout(2500);
      ok(`${mk} oficina de outro pais (${d.nomeOficina}) NAO ve o pedido na lista`, !(await pF.innerText('body')).includes(`Teste ${mk}`));
      await ctxF.close();
    }
    // cliente ve os orcamentos na moeda certa
    await pC.goto(`${SITE}${PREFIXO[cli.idioma]}/cliente/orcamentos/${solId}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
    const tOrc = await pC.innerText('body');
    ok(`${mk} cliente (${cli.idioma}) ve ${c.ofs.length} orcamento(s) na moeda ${MOEDA[c.m.cod]}`, c.ofs.every((k) => tOrc.includes(P[k].nomeOficina)) && tOrc.includes(MOEDA[c.m.cod]), tOrc.slice(0, 200));
    ok(`${mk} tela de orcamentos sem chave crua e dentro do celular`, semChaveCrua(tOrc) && await semTransbordo(pC));
    // conversa com cada oficina
    for (const k of c.ofs) await conversar(pC, cli, pags[k], P[k], solId, `${c.frases.cli} (${k})`, c.frases[k], mk);
    // aceita uma
    const escolhida = P[c.escolhe];
    await aceitar(pC, cli, solId, escolhida.nomeOficina);
    const { data: oAc } = await sb.from('orcamentos').select('status').eq('id', orcs[c.escolhe].id).single();
    ok(`${mk} cliente aceitou ${escolhida.nomeOficina} pela tela`, oAc.status === 'aceito', oAc.status);
    if (oAc.status === 'aceito') await servico(pC, cli, escolhida, solId, orcs[c.escolhe], mk, c.rev);
    for (const x of ctxs) await x.close();
    await ctxC.close();
  }

  // ---------- pecas por pais
  if (SO.includes('EE') || SO.includes('IT')) {
    console.log('\n=== pecas');
    const par = [['ofET', 'ljEE', 'ljIT', 'EE', 44], ['ofIT1', 'ljIT', 'ljEE', 'IT', 39]].filter((x) => SO.includes(x[3]));
    for (const [o, l, outra, cod, preco] of par) {
      const m = MERCADOS[cod];
      const cO = await celular({ latitude: m.lat, longitude: m.lon }, m.fuso); const cL = await celular({ latitude: m.lat, longitude: m.lon }, m.fuso); const cL2 = await celular({ latitude: 0, longitude: 0 }, 'UTC');
      const pO = await entrar(cO, P[o]);
      await pecas(pO, P[o], P[l], SO.includes(outra === 'ljEE' ? 'EE' : 'IT') ? P[outra] : null, cL, cL2, `${cod}/${P[o].idioma}`, preco);
      await cO.close(); await cL.close(); await cL2.close();
    }
  }

  // ---------- avisos no idioma de cada um
  console.log('\n=== avisos (idioma de quem le)');
  const participantes = new Set(cenarios.flatMap((c) => [c.cli, ...c.ofs]));
  for (const k of Object.keys(P)) if (participantes.has(k)) await conferirAvisos(P[k], k);
} catch (e) {
  falhas++; resumo.push('parou: ' + e.message);
  console.log('FALHA parou:', String(e.stack).slice(0, 900));
} finally {
  await browser.close();
  // ---------- limpeza
  for (const sid of sols) {
    const { data: ags } = await sb.from('agenda').select('id').eq('solicitacao_id', sid);
    for (const a of ags || []) { await sb.from('manutencao_etapas').delete().eq('agenda_id', a.id); await sb.from('agenda_historico').delete().eq('agenda_id', a.id); }
    await sb.from('agenda').delete().eq('solicitacao_id', sid);
    const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', sid);
    for (const o of orcs || []) for (const t of ['orcamento_itens', 'orcamento_disponibilidade', 'comissao_lancamento', 'orcamento_revisoes']) await sb.from(t).delete().eq('orcamento_id', o.id);
    for (const t of ['avaliacoes', 'mensagens', 'orcamentos', 'solicitacao_fotos', 'analise_dano']) await sb.from(t).delete().eq('solicitacao_id', sid);
    await sb.from('solicitacoes').delete().eq('id', sid);
  }
  for (const oid of oficinas) {
    const { data: cots } = await sb.from('cotacoes_pecas').select('id').eq('oficina_id', oid);
    for (const c of cots || []) { await sb.from('pedidos_pecas').delete().eq('cotacao_id', c.id); await sb.from('cotacoes_pecas_respostas').delete().eq('cotacao_id', c.id); }
    await sb.from('cotacoes_pecas').delete().eq('oficina_id', oid);
    await sb.from('agenda').delete().eq('oficina_id', oid); await sb.from('comissao_config').delete().eq('oficina_id', oid);
    await sb.from('oficinas').delete().eq('id', oid);
  }
  for (const lid of lojas) { await sb.from('pecas_catalogo').delete().eq('loja_id', lid); await sb.from('lojas_pecas').delete().eq('id', lid); }
  for (const vid of veics) await sb.from('veiculos').delete().eq('id', vid);
  for (const id of contas) {
    for (const [t, c] of [['notificacoes', 'profile_id'], ['veiculos', 'profile_id']]) await sb.from(t).delete().eq(c, id);
    await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id);
  }
  const sobra = (await sb.from('profiles').select('id').like('email', `%${tag}@example.test`)).data || [];
  console.log(`\nlimpeza: ${contas.length} contas, ${oficinas.length} oficinas, ${lojas.length} lojas, ${sols.length} pedidos; sobrou ${sobra.length}`);
  console.log(falhas ? `${falhas} FALHA(S):\n - ${resumo.join('\n - ')}` : 'TUDO OK');
}
