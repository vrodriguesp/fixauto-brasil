// Reteste (producao, iPhone 390 px) do lote de 08/10 tarde:
//  1 primeira mensagem da oficina ao cliente gera aviso para o cliente
//  2 orcamento em PDF lido pela IA (itens, garantia)
//  3 orcamento com garantia; entrega pede confirmacao; contagem da garantia no inicio do cliente
//  4 terminado o servico: conversa com a outra oficina some e fecha; com a escolhida continua aberta
//  5 agenda e Hoje (painel 10/10): resumo traduzido; carro na oficina com "Aggiorna fase"
//  6 perfil: oficina nao aprovada ve o aviso; aprovada: botoes dentro da tela e pagina publica sem 404
//   node site-garantia.mjs <.env.local>
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
const contas = []; const sols = []; const ofs = [];
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const celular = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); return c; };
const entrar = async (p, email, senha, pre) => { await p.goto(`${SITE}/${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha); await p.click('button[type=submit]'); await p.waitForTimeout(4000); };
const conta = async (tipo, idioma) => {
  const email = `gar-${tipo}${contas.length}-${tag}@example.test`; const senha = `Gar${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo} ${contas.length}`, email, idioma });
  return { id: data.user.id, email, senha };
};
const sessao = async (c) => { const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data } = await a.auth.signInWithPassword({ email: c.email, password: c.senha }); return { a, token: data.session?.access_token }; };
const dentroDaTela = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1; });

// PDF de orcamento simples (texto), para a IA ler
function pdfOrcamento() {
  const linhas = ['PREVENTIVO N. 118 - Carrozzeria Rossi', 'Paraurti posteriore (ricambio) 1 x 250,00 EUR', 'Verniciatura paraurti 1 x 180,00 EUR', 'Manodopera 3 ore x 40,00 EUR = 120,00 EUR', 'Totale 550,00 EUR', 'Tempi di lavorazione: 3 giorni', 'Garanzia: 12 mesi sulla verniciatura'];
  const conteudo = 'BT /F1 12 Tf 50 780 Td 16 TL ' + linhas.map((l) => `(${l}) '`).join(' ') + ' ET';
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

try {
  const cli = await conta('cliente', 'it'); const ofA = await conta('oficina', 'it'); const ofB = await conta('oficina', 'it');
  const mk = async (u, nome, ativa = true) => (await sb.from('oficinas').insert({ profile_id: u.id, nome_fantasia: nome, endereco: 'Via Roma, 1', cidade: 'Milano', estado: 'MI', cep: '20121', pais: 'IT', latitude: 45.46, longitude: 9.19, ativa, raio_atendimento_km: 50 }).select('id').single()).data.id;
  const idA = await mk(ofA, `GAR A ${tag}`); const idB = await mk(ofB, `GAR B ${tag}`); ofs.push(idA, idB);
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Fiat', fipe_modelo: '500', fipe_ano: '2021' }).select('id').single();
  const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'funilaria', descricao: 'Paraurti posteriore', urgencia: 'media', latitude: 45.46, longitude: 9.19, endereco: 'Milano' }).select('id').single();
  sols.push(s.id);

  // ---- 1) primeira mensagem da oficina B (antes de orcar) -> aviso ao cliente
  const ctxB = await celular(); const pB = await ctxB.newPage();
  await entrar(pB, ofB.email, ofB.senha, 'it');
  await pB.goto(`${SITE}/it/it/oficina/mensagens/${s.id}`, { waitUntil: 'networkidle' }); await pB.waitForTimeout(2500);
  await pB.locator('input[type=text]').last().fill('Buongiorno, il paraurti è solo graffiato?');
  await pB.locator('input[type=text]').last().press('Enter'); await pB.waitForTimeout(4000);
  const { data: n1 } = await sb.from('notificacoes').select('titulo, dados').eq('profile_id', cli.id).eq('tipo', 'nova_mensagem');
  ok('1 cliente avisado da primeira mensagem da oficina', (n1 || []).length >= 1 && n1[0].dados?.oficina_id === idB, JSON.stringify(n1));

  // ---- 2) PDF lido pela IA
  const { token: tA } = await sessao(ofA);
  const fd = new FormData(); fd.append('arquivo', new Blob([pdfOrcamento()], { type: 'application/pdf' }), 'preventivo.pdf'); fd.append('idioma', 'it');
  const rL = await fetch(`${SITE}/api/ler-orcamento`, { method: 'POST', headers: { Authorization: `Bearer ${tA}` }, body: fd });
  const dL = await rL.json().catch(() => ({}));
  ok('2 PDF lido: itens', rL.ok && dL.itens?.length >= 2, `${rL.status} ${dL.itens?.length}`);
  ok('2 PDF lido: garantia de 12 meses e prazo de 3 dias', dL.garantia_dias >= 360 && dL.garantia_dias <= 366 && dL.prazo_dias === 3, `garantia=${dL.garantia_dias} prazo=${dL.prazo_dias}`);

  // ---- 6) perfil: B nao aprovada ve aviso; A aprovada tem botoes na tela e pagina publica
  await sb.from('oficinas').update({ ativa: false }).eq('id', idB);
  await pB.goto(`${SITE}/it/it/oficina/perfil`, { waitUntil: 'networkidle' }); await pB.waitForTimeout(2500);
  ok('6 oficina nao aprovada ve o aviso da pagina publica', /dopo l'approvazione/.test(await pB.innerText('body')));
  const ctxA = await celular(); const pA = await ctxA.newPage();
  await entrar(pA, ofA.email, ofA.senha, 'it');
  await pA.goto(`${SITE}/it/it/oficina/perfil`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(2500);
  const botoes = pA.locator('a[target=_blank], button').filter({ hasText: /pagina pubblica|Condividi/i });
  let todosDentro = (await botoes.count()) >= 2;
  for (let i = 0; i < (await botoes.count()); i++) todosDentro = todosDentro && await dentroDaTela(botoes.nth(i));
  ok('6 botoes "pagina pubblica" e "Condividi" dentro da tela', todosDentro);
  const rPub = await fetch(`${SITE}/it/it/oficinas/${idA}`);
  ok('6 pagina publica abre (sem 404)', rPub.status === 200, rPub.status);

  // ---- 3) orcamento com garantia (180) pela tela, aceite, check-in e entrega com confirmacao
  await pA.goto(`${SITE}/it/it/oficina/enviar-orcamento/${s.id}`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(3000);
  // o mesmo PDF pela tela: a IA preenche os itens
  await pA.locator('input[type=file][accept*="pdf"]').setInputFiles({ name: 'preventivo.pdf', mimeType: 'application/pdf', buffer: pdfOrcamento() });
  await pA.getByText(/Voci compilate dal documento/).waitFor({ timeout: 60000 }).catch(() => {});
  ok('2 tela: itens preenchidos pelo PDF, com aviso para conferir', /Voci compilate dal documento/.test(await pA.innerText('body')));
  await pA.selectOption('#orc-garantia', '180');
  await pA.locator('button[type=submit]').last().click(); await pA.waitForTimeout(5000);
  const { data: o } = await sb.from('orcamentos').select('id, garantia_dias').eq('solicitacao_id', s.id).eq('oficina_id', idA).maybeSingle();
  ok('3 orcamento salvo com garantia de 180 dias', o?.garantia_dias === 180, JSON.stringify(o));
  const { data: n2 } = await sb.from('notificacoes').select('tipo').eq('profile_id', cli.id).eq('tipo', 'novo_orcamento');
  ok('3 cliente avisado do orcamento novo (um aviso so, criado pelo servidor)', (n2 || []).length === 1, JSON.stringify(n2));
  const { data: slot } = await sb.from('orcamento_disponibilidade').select('id').eq('orcamento_id', o.id).limit(1).single();
  const { token: tC } = await sessao(cli);
  await fetch(`${SITE}/api/aceitar-orcamento`, { method: 'POST', headers: { Authorization: `Bearer ${tC}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ orcamentoId: o.id, slotId: slot.id }) });
  const { data: ag } = await sb.from('agenda').select('id').eq('solicitacao_id', s.id).single();
  await fetch(`${SITE}/api/servico`, { method: 'POST', headers: { Authorization: `Bearer ${tA}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'checkin', eventoId: ag.id, antecipar: true }) });

  // ---- 5) agenda: "Fasi" apos o check-in
  await pA.goto(`${SITE}/it/it/oficina/agenda?vista=month`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(3000);
  ok('5 resumo do mes com o servico traduzido (nao "funilaria")', !/funilaria:/.test(await pA.innerText('body')));
  await pA.goto(`${SITE}/it/it/oficina/hoje`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(3000);
  ok('5 Hoje mostra o carro na oficina com "Aggiorna fase"', (await pA.getByTestId('btn-etapa').count()) > 0);

  // pronto para entregar (etapa "concluido") e entrega pela pagina Hoje
  await fetch(`${SITE}/api/servico`, { method: 'POST', headers: { Authorization: `Bearer ${tA}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'etapa', eventoId: ag.id, status: 'concluido' }) });
  await pA.reload({ waitUntil: 'networkidle' }); await pA.waitForTimeout(3000);
  await pA.getByTestId('btn-entregar').first().click(); await pA.waitForTimeout(1200);
  const conf = await pA.getByRole('dialog').innerText().catch(() => '');
  ok('3 entrega pede confirmacao', /Consegnare l'auto al cliente/.test(conf), conf);
  const { data: agAntes } = await sb.from('agenda').select('status').eq('id', ag.id).single();
  ok('3 sem confirmar, nada muda', agAntes.status === 'em_andamento');
  await pA.getByRole('button', { name: /Sì, consegna/ }).click(); await pA.waitForTimeout(5000);
  const { data: solFim } = await sb.from('solicitacoes').select('status').eq('id', s.id).single();
  ok('3 confirmado: servico concluido', solFim.status === 'concluida', solFim.status);

  const ctxC = await celular(); const pC = await ctxC.newPage();
  await entrar(pC, cli.email, cli.senha, 'it');
  await pC.goto(`${SITE}/it/it/cliente/dashboard`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
  const dash = await pC.innerText('body');
  ok('3 inicio do cliente: contagem da garantia', /Garanzie attive/.test(dash) && /mancano 1(79|80) giorni/.test(dash), dash.replace(/\s+/g, ' ').slice(0, 200));
  await pC.screenshot({ path: 'gar-dashboard.png', fullPage: true });

  // ---- 4) conversas depois do servico
  await pC.goto(`${SITE}/it/it/cliente/mensagens`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
  const lista = await pC.innerText('body');
  ok('4 lista: some a oficina nao escolhida, fica a escolhida', lista.includes(`GAR A ${tag}`) && !lista.includes(`GAR B ${tag}`));
  const { a: aC } = await sessao(cli);
  const { data: abertaA } = await aC.rpc('conversa_aberta', { p_sol: s.id, p_of: idA });
  const { data: abertaB } = await aC.rpc('conversa_aberta', { p_sol: s.id, p_of: idB });
  ok('4 conversa com a escolhida aberta (garantia), com a outra fechada', abertaA === true && abertaB === false, `${abertaA} ${abertaB}`);
  const { error: eB } = await aC.from('mensagens').insert({ solicitacao_id: s.id, oficina_id: idB, remetente_id: cli.id, texto: 'ciao' });
  ok('4 nao se escreve mais para a oficina nao escolhida', !!eB);
  await pB.goto(`${SITE}/it/it/oficina/mensagens/${s.id}`, { waitUntil: 'networkidle' }); await pB.waitForTimeout(3000);
  ok('4 oficina nao escolhida ve "Conversazione chiusa"', /Conversazione chiusa/.test(await pB.innerText('body')));
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
