// Reteste no SITE (producao, iPhone 390 px, oficina em italiano) do teste do
// dono em 08/10/2026:
//  1 mecanico sem acesso ao portal (so nome)
//  2 check-in de carro agendado para daqui a 2 dias: aviso + confirmacao;
//    pedido do cliente vai para "em andamento" e o cliente e avisado
//  3 etapa registrada "a nome di" um mecanico; cliente avisado da etapa
//  4 atribuir mecanico fica no historico; descricao sem "[TIPO:"
//  5 remover mecanico que ja trabalhou: so desativa (historico fica)
//  6 foto do acidente visivel para a oficina ANTES do aceite
//  7 analise de IA responde (ou mensagem clara se o Google estiver ocupado)
//  8 endereco: rua + civico conferidos no mapa e salvos
//  9 seguradoras convenzionate: salvas e selo no orcamento do cliente
// 10 tempo para abrir as paginas da oficina (capacita incluida)
//   node site-servico.mjs <.env.local>
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
const contas = []; const sols = []; let ofId, emId;
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const celular = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); return c; };
const entrar = async (p, email, senha, pre) => { await p.goto(`${SITE}/${pre}/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha); await p.click('button[type=submit]'); await p.waitForTimeout(4000); };
const conta = async (tipo, idioma) => {
  const email = `srv-${tipo}${contas.length}-${tag}@example.test`; const senha = `Srv${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo} ${contas.length}`, email, idioma });
  return { id: data.user.id, email, senha };
};
const sessao = async (c) => { const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data } = await a.auth.signInWithPassword({ email: c.email, password: c.senha }); return { a, token: data.session?.access_token }; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAF0lEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

try {
  const cli = await conta('cliente', 'pt'); const ofi = await conta('oficina', 'it');
  const { data: of } = await sb.from('oficinas').insert({ profile_id: ofi.id, nome_fantasia: `SRV SHOP ${tag}`, endereco: 'x', cidade: 'Milano', estado: 'MI', cep: '20121', pais: 'IT', latitude: 45.4642, longitude: 9.19, ativa: true, raio_atendimento_km: 50 }).select('id').single();
  ofId = of.id;
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Fiat', fipe_modelo: 'Tipo', fipe_ano: '2020', placa: 'GG111HH' }).select('id').single();
  // pedido de acidente com foto (como no "acabei de bater")
  const { data: em } = await sb.from('emergencias').insert({ profile_id: cli.id, nome: 'Cli', email: cli.email, telefone: '1', endereco: 'Milano', latitude: 45.46, longitude: 9.19, descricao: '[TIPO:outro_causou] Batida lateral' }).select('id').single();
  emId = em.id;
  const caminhoFoto = `emergencia/${em.id}/${crypto.randomUUID()}.png`;
  await sb.storage.from('damage-photos').upload(caminhoFoto, PNG, { contentType: 'image/png' });
  const urlFoto = sb.storage.from('damage-photos').getPublicUrl(caminhoFoto).data.publicUrl;
  const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'colisao', descricao: '[TIPO:outro_causou] Batida lateral', urgencia: 'alta', latitude: 45.46, longitude: 9.19, endereco: 'Milano', emergencia_id: em.id, pagamento_reparo: 'seguro_terceiro', seguradora: 'Generali Italia' }).select('id').single();
  sols.push(s.id);
  await sb.from('emergencias').update({ solicitacao_id: s.id }).eq('id', em.id);
  await sb.from('solicitacao_fotos').insert({ solicitacao_id: s.id, foto_url: urlFoto });

  const ctxO = await celular(); const pO = await ctxO.newPage();
  await entrar(pO, ofi.email, ofi.senha, 'it');

  // ---- 6) foto antes do aceite
  await pO.goto(`${SITE}/it/oficina/solicitacoes/${s.id}`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(3500);
  const fotoOk = await pO.locator('img[alt]').evaluateAll((imgs) => imgs.some((i) => i.src.includes('damage-photos') && i.complete && i.naturalWidth > 0));
  ok('6 foto do acidente aparece para a oficina antes do aceite', fotoOk);
  ok('4 pagina do pedido sem "[TIPO:"', !(await pO.innerText('body')).includes('[TIPO:'));

  // ---- 7) analise de IA
  const { token: tOf } = await sessao(ofi);
  const rIa = await fetch(`${SITE}/api/analisar-dano`, { method: 'POST', headers: { Authorization: `Bearer ${tOf}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ solicitacao_id: s.id }) });
  const dIa = await rIa.json().catch(() => ({}));
  ok('7 IA analisa (ou responde com codigo claro se ocupada)', (rIa.ok && dIa.analise) || dIa.codigo === 'IA_OCUPADA', `${rIa.status} ${JSON.stringify(dIa).slice(0, 160)}`);

  // ---- 9) seguradoras + 8) endereco no perfil
  await pO.goto(`${SITE}/it/oficina/perfil`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(3000);
  await pO.getByRole('button', { name: /^Generali$/ }).click();
  await pO.fill('#oficina-end-rua', 'Via Torino'); await pO.waitForTimeout(400);
  await pO.locator('#oficina-end-rua').press('Escape');
  await pO.fill('#oficina-end-numero', '10');
  await pO.fill('#oficina-end-cep', '');
  await pO.fill('#oficina-end-cidade', 'Milano');
  await pO.locator('#oficina-end-cidade').blur(); await pO.waitForTimeout(4000);
  const statusEnd = await pO.locator('p[role=status]').first().innerText().catch(() => '');
  ok('8 endereco com civico conferido no mapa', /Indirizzo trovato sulla mappa|civico non è sulla mappa/.test(statusEnd), statusEnd);
  await pO.screenshot({ path: 'srv-perfil-endereco.png', fullPage: true });
  await pO.getByRole('button', { name: /Salva Modifiche/ }).click(); await pO.waitForTimeout(3500);
  const { data: ofDb } = await sb.from('oficinas').select('endereco, numero, latitude, longitude, seguradoras_convencionadas').eq('id', ofId).single();
  ok('8 endereco salvo "Via Torino, 10" com posicao de Milano', ofDb.endereco === 'Via Torino, 10' && ofDb.numero === '10' && Math.abs(ofDb.latitude - 45.46) < 0.05, JSON.stringify(ofDb));
  ok('9 seguradora convenzionata salva', (ofDb.seguradoras_convencionadas || []).includes('Generali'), JSON.stringify(ofDb.seguradoras_convencionadas));

  // orcamento com horario daqui a 2 dias, aceito pelo cliente
  const { data: o } = await sb.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: ofId, valor_total: 800, prazo_dias: 3, status: 'enviado', validade: '2030-01-01' }).select('id').single();
  const d2 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), d5 = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const { data: slot } = await sb.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_checkin: d2, turno: 'manha', data_previsao_entrega: d5 }).select('id').single();
  const ctxC = await celular(); const pC = await ctxC.newPage();
  await entrar(pC, cli.email, cli.senha, 'pt-br');
  await pC.goto(`${SITE}/pt-br/cliente/orcamentos/${s.id}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
  ok('9 cliente ve "Conveniada com Generali Italia" no orcamento', /Conveniada com Generali Italia/.test(await pC.innerText('body')));
  const { token: tCli } = await sessao(cli);
  const rAc = await fetch(`${SITE}/api/aceitar-orcamento`, { method: 'POST', headers: { Authorization: `Bearer ${tCli}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ orcamentoId: o.id, slotId: slot.id }) });
  ok('aceite do orcamento', rAc.ok, rAc.status);

  // ---- 1) mecanico sem acesso ao portal
  await pO.goto(`${SITE}/it/oficina/equipe`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(2500);
  await pO.locator('button.btn-primary').first().click(); await pO.waitForTimeout(800);
  await pO.fill('#cdcf5-1', 'Marco Rossi');
  await pO.getByRole('button', { name: /^Registra$/ }).click(); await pO.waitForTimeout(3000);
  const { data: mec } = await sb.from('funcionarios').select('id, nome, profile_id, acesso_portal').eq('oficina_id', ofId).maybeSingle();
  ok('1 mecanico cadastrado so com nome (sem login)', mec?.nome === 'Marco Rossi' && !mec.profile_id && mec.acesso_portal === false, JSON.stringify(mec));
  ok('1 lista mostra "Senza accesso al portale"', /Senza accesso al portale/.test(await pO.innerText('body')));

  // ---- 2) check-in de carro agendado para daqui a 2 dias
  await pO.goto(`${SITE}/it/oficina/veiculos-em-servico`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(3000);
  await pO.getByRole('button', { name: /^Tutti$/ }).click(); await pO.waitForTimeout(800);
  await pO.getByRole('button', { name: /^Check-in$/ }).first().click(); await pO.waitForTimeout(2500);
  const aviso = await pO.locator('[role=alert]').first().innerText().catch(() => '');
  ok('2 aviso de check-in antecipado com a data', /prenotata per il/.test(aviso), aviso);
  await pO.screenshot({ path: 'srv-checkin-aviso.png', fullPage: true });
  await pO.getByRole('button', { name: /fai il check-in adesso/ }).click(); await pO.waitForTimeout(3500);
  const { data: ag } = await sb.from('agenda').select('id, status, data_inicio').eq('solicitacao_id', s.id).single();
  const { data: solDb } = await sb.from('solicitacoes').select('status').eq('id', s.id).single();
  ok('2 check-in feito, entrada passa a ser hoje', ag.status === 'em_andamento' && new Date(ag.data_inicio) <= new Date(), JSON.stringify(ag));
  ok('2 pedido do cliente fica "em andamento"', solDb.status === 'em_andamento', solDb.status);
  const { data: nCli } = await sb.from('notificacoes').select('titulo, mensagem').eq('profile_id', cli.id).eq('tipo', 'servico_atualizado');
  ok('2 cliente avisado (em portugues) que o carro chegou', (nCli || []).some((n) => n.titulo === 'Seu carro chegou à oficina'), JSON.stringify(nCli));

  // ---- 4) descricao limpa e 3) etapa em nome do mecanico
  await pO.getByRole('button', { name: /^Tutti$/ }).click(); await pO.waitForTimeout(800);
  await pO.locator('div.card', { hasText: 'Fiat Tipo' }).first().locator('div.cursor-pointer').first().click(); await pO.waitForTimeout(2000);
  ok('4 "Servizio" sem "[TIPO:"', !(await pO.innerText('body')).includes('[TIPO:'));
  await pO.getByRole('button', { name: /^\+ Fase$/ }).first().click(); await pO.waitForTimeout(800);
  await pO.locator('select').filter({ has: pO.locator('option[value=diagnostico]') }).first().selectOption('diagnostico');
  await pO.locator('select[aria-label="Fatto da"]').selectOption(mec.id);
  await pO.getByRole('button', { name: /^Salva$/ }).first().click(); await pO.waitForTimeout(3500);
  const { data: et } = await sb.from('manutencao_etapas').select('status, funcionario_id').eq('agenda_id', ag.id).eq('status', 'diagnostico').maybeSingle();
  ok('3 etapa registrada a nome do mecanico', et?.funcionario_id === mec.id, JSON.stringify(et));
  const { data: nCli2 } = await sb.from('notificacoes').select('mensagem').eq('profile_id', cli.id).eq('tipo', 'servico_atualizado');
  ok('3 cliente avisado da etapa ("Em diagnóstico")', (nCli2 || []).some((n) => /Em diagnóstico/.test(n.mensagem)), JSON.stringify(nCli2));

  // ---- 4) atribuir mecanico -> historico
  const { a: aOf } = await sessao(ofi);
  const rAt = await fetch(`${SITE}/api/servico`, { method: 'POST', headers: { Authorization: `Bearer ${tOf}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'atribuir', eventoId: ag.id, funcionarioId: mec.id }) });
  const { data: hist } = await aOf.from('agenda_historico').select('acao').eq('agenda_id', ag.id);
  ok('4 historico: check-in antecipado + etapa + atribuido', rAt.ok && ['checkin_antecipado', 'etapa', 'atribuido'].every((x) => (hist || []).some((h) => h.acao === x)), JSON.stringify(hist));
  await pO.reload({ waitUntil: 'networkidle' }); await pO.waitForTimeout(2500);
  await pO.screenshot({ path: 'srv-em-servico.png', fullPage: true });

  // cliente ve "em andamento" e as etapas
  await pC.goto(`${SITE}/pt-br/cliente/acompanhamento/${s.id}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(3000);
  const telaCli = await pC.innerText('body');
  ok('2 cliente ve o check-in e a etapa no acompanhamento', /Recebido/.test(telaCli) && /diagnóstico/i.test(telaCli), telaCli.replace(/\s+/g, ' ').slice(0, 200));

  // ---- 5) remover mecanico que ja trabalhou
  const rDel = await fetch(`${SITE}/api/funcionarios`, { method: 'DELETE', headers: { Authorization: `Bearer ${tOf}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: mec.id }) });
  const dDel = await rDel.json();
  const { data: mec2 } = await sb.from('funcionarios').select('ativo').eq('id', mec.id).maybeSingle();
  ok('5 mecanico com historico so e desativado', dDel.desativado === true && mec2?.ativo === false, JSON.stringify(dDel));

  // ---- 10) tempo das paginas da oficina
  for (const pag of ['dashboard', 'solicitacoes', 'veiculos-em-servico', 'agenda', 'capacidade', 'distribuicao', 'equipe', 'perfil']) {
    const t0 = Date.now();
    await pO.goto(`${SITE}/it/oficina/${pag}`, { waitUntil: 'domcontentloaded' });
    await pO.waitForFunction(() => !document.querySelector('.animate-pulse') && document.querySelector('h1'), null, { timeout: 30000 }).catch(() => {});
    const ms = Date.now() - t0;
    ok(`10 ${pag} abre em ${ms} ms`, ms < 6000);
  }
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 700)); }
finally {
  await browser.close();
  for (const sid of sols) {
    const { data: ags } = await sb.from('agenda').select('id').eq('solicitacao_id', sid);
    for (const a of ags || []) { for (const t of ['manutencao_etapas', 'agenda_historico']) await sb.from(t).delete().eq('agenda_id', a.id); }
    const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', sid);
    for (const o of orcs || []) for (const t of ['orcamento_disponibilidade', 'orcamento_itens']) await sb.from(t).delete().eq('orcamento_id', o.id);
    for (const t of ['mensagens', 'agenda', 'orcamentos', 'solicitacao_fotos', 'analise_dano']) await sb.from(t).delete().eq('solicitacao_id', sid);
    await sb.from('solicitacoes').update({ emergencia_id: null }).eq('id', sid);
  }
  if (emId) { await sb.from('emergencias').delete().eq('id', emId); }
  for (const sid of sols) await sb.from('solicitacoes').delete().eq('id', sid);
  if (ofId) { await sb.from('agenda').delete().eq('oficina_id', ofId); await sb.from('funcionarios').delete().eq('oficina_id', ofId); await sb.from('oficinas').delete().eq('id', ofId); }
  for (const id of contas) { for (const [t, c] of [['veiculos', 'profile_id'], ['notificacoes', 'profile_id']]) await sb.from(t).delete().eq(c, id); await sb.from('emergencias').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
