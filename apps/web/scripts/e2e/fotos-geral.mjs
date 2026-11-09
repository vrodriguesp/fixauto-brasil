// FOTOS de todas as funcionalidades do site, com dados de verdade (dono 09/11: "a foto vale para
// todas as funcionalidades do site"). Motor do Safari (WebKit). Para cada tela: foto no celular
// (iPhone 14, 390 px; pagina inteira com menu de baixo/botao do chat escondidos + a 1a tela como
// a pessoa ve) e no computador (1280 px). Depois as fotos sao analisadas uma a uma.
// Cenario: cliente com 5 pedidos - aberto com 3 orcamentos, agendado, em servico, concluido com
// garantia e acidente; oficina (meister) com esses pedidos; admin.
//   HOST_LAN=<ip-da-rede> node fotos-geral.mjs <.env.local> [cliente|oficina|admin|publico]
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
const SO = process.argv[3] || '';
const SITE = `http://${process.env.HOST_LAN || 'localhost'}:3100`;
const RAIZ = 'C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/Documentos/_teste_local';
const OUT = `${RAIZ}/resultados/fotos-geral`; fs.mkdirSync(OUT, { recursive: true });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const semear = fs.readFileSync(`${RAIZ}/ferramentas/semear.mjs`, 'utf8');
const senhaSemente = (email) => (semear.match(new RegExp(`conta\\('${email.replace(/\./g, '\\.')}', '([^']+)'`)) || [])[1];
const W1 = 'meister.teste@bipfix.test'; const W1S = senhaSemente(W1);
const ADM = 'admin.teste@bipfix.test'; const ADMS = senhaSemente(ADM);
const dia = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
const tag = crypto.randomBytes(3).toString('hex'); const senha = 'Ft-' + crypto.randomBytes(6).toString('hex');
const post = async (rota, tok, corpo) => { const r = await fetch(`${SITE}${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, 'x-real-ip': `10.66.${crypto.randomInt(0, 250)}.${crypto.randomInt(1, 250)}` }, body: JSON.stringify(corpo) }); return { s: r.status, d: await r.json().catch(() => ({})) }; };
const registro = [];
const contas = []; const sols = [];

// ---------- cenario ----------
const email = `fotos-${tag}@example.test`;
const { data: u } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true }); contas.push(u.user.id);
await admin.from('profiles').upsert({ id: u.user.id, email, tipo: 'cliente', nome: 'Mari Tamm', telefone: '+372 5555 1234', idioma: 'et' });
const tokCli = (await anon().auth.signInWithPassword({ email, password: senha })).data.session.access_token;
const tokOf = (await anon().auth.signInWithPassword({ email: W1, password: W1S })).data.session.access_token;
const w1Id = (await admin.from('profiles').select('id').eq('email', W1).single()).data.id;
await admin.from('profiles').update({ idioma: 'et' }).eq('id', w1Id);
const { data: of1 } = await admin.from('oficinas').select('id, nome_fantasia, profile_id').eq('profile_id', w1Id).single();
const { data: outras } = await admin.from('oficinas').select('id, nome_fantasia, profile_id').eq('ativa', true).neq('id', of1.id).eq('pais', 'EE').limit(2);
const oficinas = [of1, ...(outras || [])];
const carros = [['Toyota', 'Corolla', '2018', '123ABC'], ['Volkswagen', 'Golf', '2015', '456DEF'], ['Škoda', 'Octavia', '2020', '789GHI'], ['BMW', '320d', '2017', '321JKL'], ['Audi', 'A4', '2019', '654MNO']];
const veic = [];
for (const [ma, mo, an, pl] of carros) veic.push((await admin.from('veiculos').insert({ profile_id: u.user.id, fipe_tipo: 'cars', fipe_marca: ma, fipe_modelo: mo, fipe_ano: an, placa: pl }).select('id').single()).data.id);
const novoPedido = async (i, desc, tipo = 'mecanica') => {
  const { data: s } = await admin.from('solicitacoes').insert({ cliente_id: u.user.id, veiculo_id: veic[i], tipo, descricao: desc, urgencia: 'media', endereco: 'Pärnu mnt 10, Tallinn', latitude: 59.433, longitude: 24.746, status: 'aberta' }).select('id, numero').single();
  sols.push(s.id); return s;
};
const orcar = async (s, of, valor, garantia = null) => {
  const o = (await admin.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: of.id, valor_total: valor, prazo_dias: 2, status: 'enviado', validade: dia(10), garantia_dias: garantia }).select('id').single()).data;
  await admin.from('orcamento_itens').insert([{ orcamento_id: o.id, descricao: 'Diagnostika', tipo: 'mao_de_obra', valor_unitario: 40, quantidade: 1, valor_total: 40 }, { orcamento_id: o.id, descricao: 'Pidurikettad ja -klotsid', tipo: 'peca', valor_unitario: valor - 40, quantidade: 1, valor_total: valor - 40 }]);
  const sl = (await admin.from('orcamento_disponibilidade').insert([{ orcamento_id: o.id, data_checkin: dia(2), turno: 'manha', data_previsao_entrega: dia(3) }, { orcamento_id: o.id, data_checkin: dia(3), turno: 'tarde', data_previsao_entrega: dia(4) }]).select('id')).data;
  await admin.from('mensagens').insert({ solicitacao_id: s.id, oficina_id: of.id, remetente_id: of.profile_id, texto: `Tere! ${of.nome_fantasia}: saame auto ülehomme vastu võtta.` });
  await admin.from('solicitacoes').update({ status: 'em_orcamento' }).eq('id', s.id);
  return { o, sl };
};
const R1 = await novoPedido(0, 'Pidurid kriuksuvad ja rool väriseb pidurdamisel');
for (const [i, of] of oficinas.entries()) await orcar(R1, of, 160 + i * 35);
const R2 = await novoPedido(1, 'Hooldus: õli ja filtrid'); const q2 = await orcar(R2, of1, 189, 180);
await post('/api/aceitar-orcamento', tokCli, { orcamentoId: q2.o.id, slotId: q2.sl[0].id });
const R3 = await novoPedido(2, 'Mootori kontrolltuli põleb'); const q3 = await orcar(R3, of1, 240, 90);
await post('/api/aceitar-orcamento', tokCli, { orcamentoId: q3.o.id, slotId: q3.sl[0].id });
const ag3 = (await admin.from('agenda').select('id').eq('solicitacao_id', R3.id).single()).data;
await post('/api/servico', tokOf, { acao: 'checkin', eventoId: ag3.id, antecipar: true });
await post('/api/servico', tokOf, { acao: 'etapa', eventoId: ag3.id, status: 'diagnostico' });
const R4 = await novoPedido(3, 'Rehvivahetus ja ratta tasakaalustamine', 'pneu'); const q4 = await orcar(R4, of1, 120, 180);
await post('/api/aceitar-orcamento', tokCli, { orcamentoId: q4.o.id, slotId: q4.sl[0].id });
const ag4 = (await admin.from('agenda').select('id').eq('solicitacao_id', R4.id).single()).data;
await admin.from('agenda').update({ status: 'concluido', checkin_em: new Date(Date.now() - 3 * 86400e3).toISOString(), data_fim: new Date(Date.now() - 2 * 86400e3).toISOString(), entregue_em: new Date(Date.now() - 2 * 86400e3).toISOString() }).eq('id', ag4.id);
await admin.from('solicitacoes').update({ status: 'concluida' }).eq('id', R4.id);
// acidente pelo formulario de verdade (API), cliente logado
const fd = new FormData();
fd.append('dados', JSON.stringify({ idioma: 'et', tipoAcidente: 'outro_causou', descricao: 'Tagant sõideti sisse fooris', endereco: 'Narva mnt 5, Tallinn', latitude: 59.437, longitude: 24.76, veiculoId: veic[4] }));
const rA = await fetch(`${SITE}/api/emergencia`, { method: 'POST', headers: { Authorization: `Bearer ${tokCli}`, 'x-real-ip': '10.66.1.1' }, body: fd });
const dA = await rA.json().catch(() => ({}));
const R5 = { id: dA.solicitacaoId }; if (R5.id) sols.push(R5.id);
const emergId = dA.emergenciaId || dA.id;
console.log('cenario:', JSON.stringify({ R1: R1.numero, acidente: rA.status, emergId }));

// ---------- fotos ----------
const b = await webkit.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/webkit-2388/Playwright.exe') });
let n = 0;
const fotografar = async (p, nome, celular) => {
  n++; const base = path.join(OUT, `${String(n).padStart(3, '0')}_${nome}`);
  if (celular) await p.screenshot({ path: `${base}_tela.png` }); // a 1a tela, como a pessoa ve
  await p.addStyleTag({ content: '.barra-inferior, [data-chat-fab], button[aria-label*="hat"][class*="fixed"] { display: none !important; }' }).catch(() => {});
  await p.screenshot({ path: `${base}_inteira.png`, fullPage: true });
};
const sessao = async (emailLogin, senhaLogin, largura) => {
  const ctx = await b.newContext({ viewport: { width: largura, height: largura < 500 ? 664 : 860 }, isMobile: largura < 500, hasTouch: largura < 500, locale: 'et-EE', deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  await ctx.route('**/api/traduzir', (r) => r.fulfill({ json: { traducoes: [] } }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => registro.push(`JS ${p.url()}: ${e.message}`));
  if (emailLogin) {
    await p.goto(`${SITE}/ee/et/login`, { waitUntil: 'networkidle' });
    await p.fill('input[type=email]', emailLogin); await p.fill('input[type=password]', senhaLogin); await p.click('button[type=submit]'); await p.waitForTimeout(4500);
  }
  return { ctx, p };
};
const percorrer = async (papel, emailLogin, senhaLogin, paginas) => {
  for (const [modo, larg] of [['celular', 390], ['computador', 1280]]) {
    const { ctx, p } = await sessao(emailLogin, senhaLogin, larg);
    for (const [nome, rota] of paginas) {
      const r = await p.goto(`${SITE}${rota}`, { waitUntil: 'networkidle' }).catch(() => null);
      await p.waitForTimeout(2500);
      const final = new URL(p.url()).pathname;
      if (!r || r.status() >= 400) registro.push(`${papel} ${modo} ${nome}: HTTP ${r?.status()}`);
      if (/\/login/.test(final) && !/login/.test(rota)) registro.push(`${papel} ${modo} ${nome}: caiu no login`);
      await fotografar(p, `${papel}_${modo}_${nome}`, modo === 'celular');
    }
    await ctx.close();
  }
};
try {
  const cli = [
    ['inicio', '/ee/et/cliente/dashboard'], ['pedidos', '/ee/et/cliente/orcamentos'],
    ['pedido_3_orcamentos', `/ee/et/cliente/orcamentos/${R1.id}`], ['pedido_agendado', `/ee/et/cliente/orcamentos/${R2.id}`],
    ['acompanhamento_em_servico', `/ee/et/cliente/acompanhamento/${R3.id}`], ['pedido_concluido_garantia', `/ee/et/cliente/orcamentos/${R4.id}`],
    ['historico', '/ee/et/cliente/historico'], ['mensagens', '/ee/et/cliente/mensagens'],
    ['conversa', `/ee/et/cliente/mensagens/${R1.id}?oficina=${of1.id}`], ['avisos', '/ee/et/cliente/notificacoes'],
    ['veiculos', '/ee/et/cliente/veiculos'], ['perfil', '/ee/et/cliente/perfil'], ['novo_pedido', '/ee/et/cliente/nova-solicitacao'],
    ['acidente_formulario', '/ee/et/emergencia'], ...(emergId ? [['acidente_pagina', `/ee/et/emergencia/acidente/${emergId}`]] : []),
  ];
  const ofi = [
    ['inicio', '/ee/et/oficina/dashboard'], ['pedidos', '/ee/et/oficina/pedidos'], ['pedidos_respondidos', '/ee/et/oficina/pedidos?aba=respondidos'],
    ['pedido_3_orcamentos', `/ee/et/oficina/pedidos/${R1.id}`], ['orcamento_editar', `/ee/et/oficina/orcamento/${R1.id}`],
    ['pedido_agendado', `/ee/et/oficina/pedidos/${R2.id}`], ['pedido_em_servico', `/ee/et/oficina/pedidos/${R3.id}`],
    ['hoje', '/ee/et/oficina/hoje'], ['agenda_lista', '/ee/et/oficina/agenda?vista=list'], ['agenda_mes', '/ee/et/oficina/agenda?vista=month'],
    ['checkin', '/ee/et/oficina/checkin'], ['carros_em_servico', '/ee/et/oficina/veiculos-em-servico'],
    ['mensagens', '/ee/et/oficina/mensagens'], ['conversa', `/ee/et/oficina/mensagens/${R1.id}`],
    ['pecas', '/ee/et/oficina/pecas'], ['equipe', '/ee/et/oficina/equipe'], ['capacidade', '/ee/et/oficina/capacidade'],
    ['avaliacoes', '/ee/et/oficina/avaliacoes'], ['comissao', '/ee/et/oficina/comissao'], ['perfil', '/ee/et/oficina/perfil'], ['aprender', '/ee/et/oficina/aprender'],
  ];
  const adm = [['inicio', '/admin/dashboard'], ['usuarios', '/admin/usuarios'], ['oficinas', '/admin/oficinas'], ['pedidos', '/admin/solicitacoes'], ['acidentes', '/admin/emergencias'], ['monitoramento', '/admin/monitoramento']];
  const pub = [['inicio', '/ee/et'], ['motoristas', '/ee/et/autojuhtidele'], ['oficinas_landing', '/ee/et/tookodadele'], ['pagina_oficina', `/ee/et/tookojad/${of1.id}`], ['cadastro', '/ee/et/registreeru'], ['login', '/ee/et/login'], ['acidente_sem_conta', '/ee/et/emergencia']];
  if (!SO || SO === 'cliente') await percorrer('cliente', email, senha, cli);
  if (!SO || SO === 'oficina') await percorrer('oficina', W1, W1S, ofi);
  if (!SO || SO === 'admin') await percorrer('admin', ADM, ADMS, adm);
  if (!SO || SO === 'publico') await percorrer('publico', null, null, pub);
} catch (e) {
  registro.push('excecao ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
} finally {
  await b.close();
  for (const id of sols) {
    const { data: orcs } = await admin.from('orcamentos').select('id').eq('solicitacao_id', id);
    for (const o of orcs || []) { await admin.from('orcamento_disponibilidade').delete().eq('orcamento_id', o.id); await admin.from('orcamento_itens').delete().eq('orcamento_id', o.id); }
    const { data: ags } = await admin.from('agenda').select('id').eq('solicitacao_id', id);
    for (const a of ags || []) { await admin.from('agenda_historico').delete().eq('agenda_id', a.id); await admin.from('manutencao_etapas').delete().eq('agenda_id', a.id); }
    for (const t of ['orcamento_revisoes', 'agenda', 'mensagens', 'solicitacao_fotos', 'orcamentos']) await admin.from(t).delete().eq('solicitacao_id', id);
    await admin.from('notificacoes').delete().eq('dados->>solicitacao_id', id);
    await admin.from('solicitacoes').delete().eq('id', id);
  }
  if (emergId) { await admin.from('emergencia_fotos').delete().eq('emergencia_id', emergId); await admin.from('emergencia_oficinas_notificadas').delete().eq('emergencia_id', emergId); await admin.from('emergencias').delete().eq('id', emergId); }
  for (const id of contas) { await admin.from('veiculos').delete().eq('profile_id', id); await admin.from('notificacoes').delete().eq('profile_id', id); await admin.from('profiles').delete().eq('id', id); await admin.auth.admin.deleteUser(id).catch(() => {}); }
  console.log(registro.length ? registro.join('\n') : 'sem erro de carga');
  console.log(`${n} telas fotografadas em ${OUT}`);
}
