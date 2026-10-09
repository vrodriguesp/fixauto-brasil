// Reteste (producao, celular 390 px, em estoniano) do lote de 08/10 noite 2:
//  1 transcricao de audio em estoniano (audio real do iPhone, .mp4)
//  2 pedido do "acabei de bater" aparece como acidente/ocorrencia, nao "colisao"
//  3 veiculos em servico: caixas cabem; "pronto para retirar" = Concluso; entregue some
//  4 campos de data (check-in e orcamento) dentro da tela
//  5 avaliacao pendente: o formulario de pedido novo nao aparece
//   node site-estonia.mjs <.env.local> [mensagemIdDeAudioEstoniano]
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
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 240) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const sols = []; const ofs = []; const arquivos = [];
const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
const celular = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'et-EE' }); await c.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} }); return c; };
const entrar = async (p, email, senha) => { await p.goto(`${SITE}/et/login`, { waitUntil: 'networkidle' }); await p.fill('input[type=email]', email); await p.fill('input[type=password]', senha); await p.click('button[type=submit]'); await p.waitForTimeout(4000); };
const conta = async (tipo) => {
  const email = `est-${tipo}${contas.length}-${tag}@example.test`; const senha = `Est${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TEST ${tipo}`, email, idioma: 'et' });
  return { id: data.user.id, email, senha };
};
const sessao = async (c) => { const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data } = await a.auth.signInWithPassword({ email: c.email, password: c.senha }); return { a, token: data.session?.access_token }; };
const api = (token, rota, corpo) => fetch(`${SITE}${rota}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
const semRolagemLateral = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const dentro = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1; });
const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

try {
  const cli = await conta('cliente'); const of = await conta('oficina');
  const { data: o } = await sb.from('oficinas').insert({ profile_id: of.id, nome_fantasia: `Töökoda ${tag}`, endereco: 'Narva mnt 5', cidade: 'Tallinn', estado: 'Harju', cep: '10117', pais: 'EE', latitude: 59.437, longitude: 24.75, ativa: true, raio_atendimento_km: 50 }).select('id').single();
  ofs.push(o.id);
  const { data: v } = await sb.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Skoda', fipe_modelo: 'Octavia', fipe_ano: '2019' }).select('id').single();
  // 2 pedido como o "acabei de bater" grava (pneu furado, sem outro veiculo)
  const { data: s } = await sb.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'colisao', descricao: '[TIPO:sem_outro] Rehv purunes', urgencia: 'alta', latitude: 59.437, longitude: 24.75, endereco: 'Tallinn', pais: 'EE' }).select('id').single();
  sols.push(s.id);
  const ctxO = await celular(); const pO = await ctxO.newPage();
  await entrar(pO, of.email, of.senha);
  await pO.goto(`${SITE}/et/oficina/solicitacoes`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(3500);
  const lista = await pO.innerText('body');
  // "Kokkupõrge" continua no filtro de tipos; no cartao do pedido vem a ocorrencia
  const cartao = await pO.locator('.badge').allInnerTexts();
  ok('2 oficina ve "Juhtum teel (teist sõidukit polnud)" e nao "Kokkupõrge" no pedido', cartao.some((b) => /Juhtum teel/.test(b)) && !cartao.some((b) => /Kokkupõrge/.test(b)), cartao.join(' | '));

  // 1 transcricao: copia um audio real em estoniano para a conversa do teste
  const origem = process.argv[3];
  if (origem) {
    const { data: m0 } = await sb.from('mensagens').select('audio_url').eq('id', origem).single();
    const cam0 = decodeURIComponent(m0.audio_url.split('/damage-photos/')[1]);
    const { data: blob } = await sb.storage.from('damage-photos').download(cam0);
    const cam = `audio/${s.id}/${o.id}/teste-${tag}.mp4`; arquivos.push(cam);
    await sb.storage.from('damage-photos').upload(cam, Buffer.from(await blob.arrayBuffer()), { contentType: 'video/mp4' });
    const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/damage-photos/${cam}`;
    const { data: m } = await sb.from('mensagens').insert({ solicitacao_id: s.id, oficina_id: o.id, remetente_id: cli.id, tipo: 'audio', audio_url: url, texto: '' }).select('id').single();
    const { token: tO } = await sessao(of);
    const r = await api(tO, '/api/transcrever-audio', { mensagemId: m.id });
    const d = await r.json().catch(() => ({}));
    ok('1 audio estoniano transcrito em estoniano ("Tere, see on test")', r.ok && /tere/i.test(d.transcricao || '') && /see on/i.test(d.transcricao || ''), `${r.status} ${JSON.stringify(d)}`);
  }

  // orcamento, aceite e check-in
  const { a: aO, token: tO } = await sessao(of);
  await pO.goto(`${SITE}/et/oficina/enviar-orcamento/${s.id}`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(3000);
  const datas = pO.locator('input[type=date]');
  let todas = (await datas.count()) > 0;
  for (let i = 0; i < (await datas.count()); i++) todas = todas && await dentro(datas.nth(i));
  ok('4 orcamento: campos de data dentro da tela', todas);
  ok('2 orcamento: titulo com a ocorrencia', /Juhtum teel/.test(await pO.innerText('body')));
  const { data: orc } = await aO.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: o.id, valor_total: 120, prazo_dias: 1, tempo_execucao_horas: 2, observacoes: '[COMISSAO:absorver:0]', validade: dia(10), garantia_dias: 30 }).select('id').single();
  await aO.from('orcamento_itens').insert({ orcamento_id: orc.id, descricao: 'Rehvi vahetus', tipo: 'mao_de_obra', quantidade: 1, valor_unitario: 120, valor_total: 120 });
  const { data: sl } = await aO.from('orcamento_disponibilidade').insert({ orcamento_id: orc.id, data_checkin: dia(1), turno: 'manha', data_previsao_entrega: dia(2) }).select('id').single();
  const { token: tC } = await sessao(cli);
  await api(tC, '/api/aceitar-orcamento', { orcamentoId: orc.id, slotId: sl.id });
  const { data: ag } = await sb.from('agenda').select('id').eq('solicitacao_id', s.id).single();
  await api(tO, '/api/servico', { acao: 'checkin', eventoId: ag.id, antecipar: true });

  // 3 em servico -> concluso -> entregue
  const caixas = async () => { await pO.goto(`${SITE}/et/oficina/veiculos-em-servico`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(3500); };
  await caixas();
  const nums = async () => pO.locator('button.card p.text-2xl').allInnerTexts();
  ok('3 sem rolagem lateral', await semRolagemLateral(pO));
  const rot = pO.getByText('Valmis kättesaamiseks', { exact: true });
  const caixa = pO.locator('button.card').filter({ has: rot });
  const cabe = await rot.evaluate((e) => { const b = e.closest('button').getBoundingClientRect(); const r = e.getBoundingClientRect(); return r.right <= b.right + 0.5 && r.left >= b.left - 0.5; }).catch(() => false);
  ok('3 "Valmis kättesaamiseks" dentro da caixa', cabe);
  await pO.screenshot({ path: 'est-caixas.png' });
  let n = await nums();
  ok('3 depois do check-in: 1 em servico, 0 pronto', n[1] === '1' && n[2] === '0', n.join(','));
  await api(tO, '/api/servico', { acao: 'etapa', eventoId: ag.id, status: 'concluido' });
  await caixas(); n = await nums();
  ok('3 concluso: 0 em servico, 1 pronto para retirar', n[1] === '0' && n[2] === '1', n.join(','));
  await api(tO, '/api/confirmar-entrega', { eventoId: ag.id });
  await caixas(); n = await nums();
  const corpo = await pO.innerText('body');
  ok('3 entregue: some da tela (0 e 0, nada na lista)', n[1] === '0' && n[2] === '0' && !corpo.includes('Octavia'), n.join(',') + ' ' + corpo.includes('Octavia'));
  ok('3 caixa existe', (await caixa.count()) === 1);

  // 4 check-in avulso
  await pO.goto(`${SITE}/et/oficina/checkin`, { waitUntil: 'networkidle' }); await pO.waitForTimeout(3000);
  const dc = pO.locator('input[type=date]');
  let dentroC = (await dc.count()) > 0;
  for (let i = 0; i < (await dc.count()); i++) dentroC = dentroC && await dentro(dc.nth(i));
  ok('4 check-in: campos de data dentro da tela', dentroC);
  ok('4 check-in sem rolagem lateral', await semRolagemLateral(pO));
  await pO.screenshot({ path: 'est-checkin.png', fullPage: true });

  // 5 avaliacao pendente: o formulario nao aparece nem por um instante
  const ctxC = await celular(); const pC = await ctxC.newPage();
  await entrar(pC, cli.email, cli.senha);
  let formVisto = false;
  pC.on('framenavigated', () => {});
  await pC.goto(`${SITE}/et/cliente/nova-solicitacao`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 20; i++) { if ((await pC.locator('h1').allInnerTexts()).some((h) => /taotlus|päring/i.test(h) && !/hinnang/i.test(h))) formVisto = true; if ((await pC.getByText(/Sinu hinnang on puudu/).count()) > 0) break; await pC.waitForTimeout(300); }
  ok('5 pedido novo bloqueado (aviso de avaliacao)', (await pC.getByText(/Sinu hinnang on puudu/).count()) > 0);
  ok('5 formulario nao apareceu antes do aviso', !formVisto);
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 700)); }
finally {
  await browser.close();
  if (arquivos.length) await sb.storage.from('damage-photos').remove(arquivos);
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
