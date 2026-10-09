// Reteste (producao, iPhone 390 px) do lote de 08/10 noite:
//  1 garantia digitada a mao no orcamento ("Altro")
//  2 orcamento recusado: a conversa com essa oficina fecha; aceito outro: idem
//  3 cliente ve o orcamento com itens, link da oficina e o escolhido em destaque
//  4 "Concluso" pede dupla confirmacao e avisa o cliente para buscar o carro
//  5 etapas sem chave crua (constants.statusManutencao...Desc)
//  6 5 dias em "concluso" sem entrega -> entregue sozinho (agendador do servidor)
//  7 avaliacao obrigatoria: aviso no inicio, pedido novo bloqueado ate avaliar
//  8 pagina publica: estrelas e numero de avaliacoes dentro da tela
//   node site-conclusao.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const SITE = 'https://bipfix.com';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 240) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const sols = []; const ofs = [];
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const celular = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); return c; };
const entrar = async (p, email, senha, pre) => { await p.goto(`${SITE}/${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha); await p.click('button[type=submit]'); await p.waitForTimeout(4000); };
const conta = async (tipo, idioma) => {
  const email = `concl-${tipo}${contas.length}-${tag}@example.test`; const senha = `Con${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo} ${contas.length}`, email, idioma });
  return { id: data.user.id, email, senha };
};
const sessao = async (c) => { const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data } = await a.auth.signInWithPassword({ email: c.email, password: c.senha }); return { a, token: data.session?.access_token }; };
const api = (token, rota, corpo) => fetch(`${SITE}${rota}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
const semRolagemLateral = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

try {
  const cli = await conta('cliente', 'it'); const ofA = await conta('oficina', 'it'); const ofB = await conta('oficina', 'it');
  const mk = async (u, nome) => (await sb.from('oficinas').insert({ profile_id: u.id, nome_fantasia: nome, endereco: 'Via Roma, 1', cidade: 'Milano', estado: 'MI', cep: '20121', pais: 'IT', latitude: 45.46, longitude: 9.19, ativa: true, raio_atendimento_km: 50, avaliacao_media: 4.6, total_avaliacoes: 128 }).select('id').single()).data.id;
  const idA = await mk(ofA, `Autofficina Concl A ${tag}`); const idB = await mk(ofB, `Concl B ${tag}`); ofs.push(idA, idB);
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Fiat', fipe_modelo: 'Panda', fipe_ano: '2020' }).select('id').single();
  const { a: aC, token: tC } = await sessao(cli);
  const { data: s, error: es } = await aC.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'Rumore ai freni', urgencia: 'media', latitude: 45.46, longitude: 9.19, endereco: 'Milano' }).select('id').single();
  if (es) throw es;
  sols.push(s.id);

  // oficina B orca (pela sessao dela) com itens
  const { a: aB } = await sessao(ofB);
  const { data: oB } = await aB.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: idB, valor_total: 300, prazo_dias: 2, tempo_execucao_horas: 8, observacoes: '[COMISSAO:absorver:0]', validade: dia(15), garantia_dias: 90 }).select('id').single();
  await aB.from('orcamento_itens').insert({ orcamento_id: oB.id, descricao: 'Pastiglie', tipo: 'peca', quantidade: 1, valor_unitario: 300, valor_total: 300 });
  await aB.from('mensagens').insert({ solicitacao_id: s.id, oficina_id: idB, remetente_id: ofB.id, texto: 'Ciao' });

  // 1 oficina A: orcamento pela tela, garantia digitada (45 dias)
  const { a: aA, token: tA } = await sessao(ofA);
  const ctxA = await celular(); const pA = await ctxA.newPage();
  await entrar(pA, ofA.email, ofA.senha, 'it');
  await pA.goto(`${SITE}/it/it/oficina/enviar-orcamento/${s.id}`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(3000);
  await pA.selectOption('#orc-garantia', 'outra');
  ok('1 "Altro" abre o campo dos dias', await pA.locator('#orc-garantia-dias').isVisible());
  await pA.fill('#orc-garantia-dias', '45');
  ok('1 o seletor continua em "Altro" com o numero digitado', (await pA.locator('#orc-garantia').inputValue()) === 'outra');
  // o resto do orcamento pelo banco (itens/horarios), garantia vem da tela -> confere o estado da tela
  const valorTela = await pA.locator('#orc-garantia-dias').inputValue();
  ok('1 campo guarda 45', valorTela === '45', valorTela);
  const { data: oA } = await aA.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: idA, valor_total: 420, prazo_dias: 2, tempo_execucao_horas: 6, observacoes: '[COMISSAO:absorver:0]', validade: dia(15), garantia_dias: Number(valorTela) }).select('id').single();
  await aA.from('orcamento_itens').insert([
    { orcamento_id: oA.id, descricao: 'Dischi freno anteriori', tipo: 'peca', quantidade: 2, valor_unitario: 120, valor_total: 240 },
    { orcamento_id: oA.id, descricao: 'Manodopera', tipo: 'mao_de_obra', quantidade: 1, valor_unitario: 180, valor_total: 180 },
  ]);
  const { data: slA } = await aA.from('orcamento_disponibilidade').insert({ orcamento_id: oA.id, data_checkin: dia(1), turno: 'tarde', data_previsao_entrega: dia(3) }).select('id').single();

  // 2 recusado fecha a conversa
  await aC.from('orcamentos').update({ status: 'recusado' }).eq('id', oB.id);
  const { data: abB1 } = await aC.rpc('conversa_aberta', { p_sol: s.id, p_of: idB });
  ok('2 orcamento recusado: conversa com essa oficina fechada', abB1 === false, abB1);
  const { error: eMsgB } = await aB.from('mensagens').insert({ solicitacao_id: s.id, oficina_id: idB, remetente_id: ofB.id, texto: 'Ma perché?' });
  ok('2 oficina recusada nao escreve mais', !!eMsgB);
  const rAc = await api(tC, '/api/aceitar-orcamento', { orcamentoId: oA.id, slotId: slA.id });
  ok('2 cliente aceita o orcamento A', rAc.ok, rAc.status);

  // 3 tela do cliente: itens, link da oficina, escolhido em destaque
  const ctxC = await celular(); const pC = await ctxC.newPage();
  await entrar(pC, cli.email, cli.senha, 'it');
  await pC.goto(`${SITE}/it/it/cliente/orcamentos/${s.id}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
  const tela = await pC.innerText('body');
  ok('3 orcamento escolhido em destaque', /Preventivo scelto/.test(tela));
  ok('3 itens do orcamento visiveis', /Dischi freno anteriori/.test(tela) && /Manodopera/.test(tela));
  ok('3 garantia do vendedor visivel (45 giorni)', /45 giorni/.test(tela));
  ok('3 link para a pagina da oficina', (await pC.getByRole('link', { name: /Vedi l'officina/ }).count()) > 0);
  ok('3 sem rolagem lateral', await semRolagemLateral(pC));
  await pC.screenshot({ path: 'concl-orcamento.png', fullPage: true });
  await pC.goto(`${SITE}/it/it/cliente/mensagens`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3500);
  const lista = await pC.innerText('body');
  ok('2 lista de mensagens: so a oficina escolhida', lista.includes(`Concl A ${tag}`) && !lista.includes(`Concl B ${tag}`));
  await pC.goto(`${SITE}/it/it/cliente/mensagens/${s.id}?oficina=${idA}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(2500);
  ok('3 conversa tem o link da oficina', (await pC.getByRole('link', { name: /Vedi l'officina/ }).count()) > 0);

  // 4 + 5 concluso com dupla confirmacao
  const { data: ag } = await sb.from('agenda').select('id').eq('solicitacao_id', s.id).single();
  await api(tA, '/api/servico', { acao: 'checkin', eventoId: ag.id, antecipar: true });
  await pA.goto(`${SITE}/it/it/oficina/veiculos-em-servico?ev=${ag.id}&etapa=1`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(3500);
  const sel = pA.locator('select').filter({ has: pA.locator('option[value=concluido]') }).first();
  const opcoes = await sel.locator('option').allInnerTexts();
  ok('5 etapas sem chave crua', opcoes.length >= 8 && !opcoes.some((o) => /constants\.|Desc\b/.test(o)), opcoes.join(' | '));
  await sel.selectOption('concluido');
  await pA.getByRole('button', { name: /^Salva$/ }).click(); await pA.waitForTimeout(1200);
  const caixa = await pA.locator('[role=alertdialog]').innerText().catch(() => '');
  ok('4 concluso pede confirmacao', /avvisa subito il cliente/.test(caixa) && /5 giorni/.test(caixa), caixa);
  const { data: et0 } = await sb.from('manutencao_etapas').select('status').eq('agenda_id', ag.id);
  ok('4 sem confirmar nada e gravado', !(et0 || []).some((e) => e.status === 'concluido'));
  await pA.getByRole('button', { name: /Sì, avvisa il cliente/ }).click(); await pA.waitForTimeout(5000);
  const { data: et1 } = await sb.from('manutencao_etapas').select('id, status').eq('agenda_id', ag.id);
  ok('4 confirmado: etapa concluso gravada', (et1 || []).some((e) => e.status === 'concluido'));
  const { data: nP } = await sb.from('notificacoes').select('titulo, mensagem').eq('profile_id', cli.id).eq('titulo', 'La tua auto è pronta');
  ok('4 cliente avisado para ritirare', (nP || []).length === 1 && /ritirarla/.test(nP[0].mensagem) && /Via Roma/.test(nP[0].mensagem), JSON.stringify(nP));

  // 6 5 dias sem entrega -> entregue pelo agendador
  const etC = et1.find((e) => e.status === 'concluido');
  // tudo como se fosse 6 dias atras (o check-in tambem grava "Ricevuto")
  await sb.from('manutencao_etapas').update({ created_at: new Date(Date.now() - 7 * 86400000).toISOString() }).eq('agenda_id', ag.id).neq('id', etC.id);
  await sb.from('manutencao_etapas').update({ created_at: new Date(Date.now() - 6 * 86400000).toISOString() }).eq('id', etC.id);
  const saida = execSync('ssh root@204.168.139.154 /root/entregas-automaticas.sh', { encoding: 'utf8' });
  ok('6 agendador roda', /"ok":true/.test(saida), saida);
  const { data: agF } = await sb.from('agenda').select('status, data_fim').eq('id', ag.id).single();
  const { data: sF } = await sb.from('solicitacoes').select('status').eq('id', s.id).single();
  const { data: hF } = await sb.from('agenda_historico').select('acao, detalhe').eq('agenda_id', ag.id);
  ok('6 entregue sozinho: servico fechado', agF.status === 'concluido' && !!agF.data_fim && sF.status === 'concluida', `${agF.status} ${sF.status}`);
  ok('6 historico marca entrega automatica', (hF || []).some((h) => h.detalhe?.automatica === true), JSON.stringify(hF));

  // 7 avaliacao obrigatoria
  const { data: pend } = await aC.rpc('tem_avaliacao_pendente', { p_cliente: cli.id });
  ok('7 avaliacao pendente', pend === true);
  const { error: eNovo } = await aC.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'altro', urgencia: 'media', latitude: 45.46, longitude: 9.19, endereco: 'Milano' });
  ok('7 banco recusa pedido novo sem avaliar', !!eNovo);
  await pC.goto(`${SITE}/it/it/cliente/dashboard`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3500);
  const dash = await pC.innerText('body');
  ok('7 inicio: aviso para avaliar', new RegExp(`Valuta Autofficina Concl A ${tag}`).test(dash), dash.replace(/\s+/g, ' ').slice(0, 300));
  ok('7 inicio: contagem da garantia (45 dias)', /Garanzie attive/.test(dash) && /mancano 4[45] giorni/.test(dash));
  ok('7 inicio sem rolagem lateral', await semRolagemLateral(pC));
  await pC.screenshot({ path: 'concl-dashboard.png', fullPage: true });
  await pC.goto(`${SITE}/it/it/cliente/nova-solicitacao`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3500);
  const nova = await pC.innerText('body');
  ok('7 pedido novo bloqueado com link para avaliar e para o acidente', /Manca la tua recensione/.test(nova) && (await pC.getByRole('link', { name: /Ho avuto un incidente/ }).count()) > 0);
  await pC.getByRole('link', { name: /Valuta ora/ }).click(); await pC.waitForTimeout(3500);
  ok('7 "Valuta ora" leva a avaliacao', /Valuta|valutazione/i.test(await pC.locator('#avaliar').innerText().catch(() => '')));
  await aC.from('avaliacoes').insert({ solicitacao_id: s.id, oficina_id: idA, cliente_id: cli.id, nota: 5, comentario: 'Ottimo' });
  const { data: s2, error: eNovo2 } = await aC.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'altro', urgencia: 'media', latitude: 45.46, longitude: 9.19, endereco: 'Milano' }).select('id').single();
  if (s2) sols.push(s2.id);
  ok('7 depois de avaliar o pedido novo passa', !eNovo2, eNovo2?.message);

  // 8 pagina publica
  const pP = await (await celular()).newPage();
  await pP.goto(`${SITE}/it/it/oficinas/${idA}`, { waitUntil: 'networkidle' }); await pP.waitForTimeout(1500);
  const cont = pP.getByText(/recension/i).first();
  const dentro = await cont.evaluate((e) => { const r = e.getBoundingClientRect(); return r.right <= window.innerWidth + 1; }).catch(() => false);
  ok('8 pagina publica: numero de avaliacoes dentro da tela', dentro);
  ok('8 pagina publica sem rolagem lateral', await semRolagemLateral(pP));
  await pP.screenshot({ path: 'concl-publica.png' });
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 700)); }
finally {
  await browser.close();
  for (const sid of sols) {
    const { data: ags } = await sb.from('agenda').select('id').eq('solicitacao_id', sid);
    for (const a of ags || []) for (const t of ['manutencao_etapas', 'agenda_historico']) await sb.from(t).delete().eq('agenda_id', a.id);
    const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', sid);
    for (const o of orcs || []) { for (const t of ['orcamento_disponibilidade', 'orcamento_itens', 'comissao_lancamento']) await sb.from(t).delete().eq('orcamento_id', o.id); }
    for (const t of ['mensagens', 'agenda', 'orcamentos', 'avaliacoes']) await sb.from(t).delete().eq('solicitacao_id', sid);
    await sb.from('solicitacoes').delete().eq('id', sid);
  }
  for (const oid of ofs) { await sb.from('agenda').delete().eq('oficina_id', oid); await sb.from('comissao_config').delete().eq('oficina_id', oid); await sb.from('oficinas').delete().eq('id', oid); }
  for (const id of contas) { for (const [t, c] of [['veiculos', 'profile_id'], ['notificacoes', 'profile_id']]) await sb.from(t).delete().eq(c, id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
