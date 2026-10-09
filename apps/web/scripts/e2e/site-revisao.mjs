// Revisao de orcamento ACEITO (migracao 049) - producao.
//  1 oficina propoe (motivo obrigatorio; nao muda o aceito; 1 pendente por vez)
//  2 cliente aprova -> valor novo, valor_original guardado, revisao_numero +1
//  3 nova proposta -> cliente recusa -> vale o valor anterior
//  4 nova proposta -> cliente recusa e retira -> agenda/pedido cancelados
//  5 seguranca: cliente nao propoe; oficina nao decide; outro cliente nao decide; decidir 2x
//  6 tela do cliente (390 px) mostra a proposta com os 3 botoes
//   node site-revisao.mjs <.env.local>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/vitor/Documents/Sites - Progetos/fixauto-brasil/apps/web/package.json');
const { createClient } = req('@supabase/supabase-js');
const { chromium } = createRequire(import.meta.url)('playwright-core');
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split(String.fromCharCode(10)).filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
const SITE = 'https://bipfix.com';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
let falhas = 0;
const ok = (n, c, x = '') => { if (!c) falhas++; console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${x ? ' - ' + String(x).slice(0, 200) : ''}`); };
const tag = crypto.randomBytes(3).toString('hex');
const contas = []; const sols = []; const ofs = [];
const conta = async (tipo) => {
  const email = `rev-${tipo}${contas.length}-${tag}@example.test`; const senha = `Rev${tag}Senha9`;
  const { data } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
  contas.push(data.user.id);
  await sb.from('profiles').insert({ id: data.user.id, tipo, nome: `TESTE ${tipo}`, email, idioma: 'it' });
  const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await a.auth.signInWithPassword({ email, password: senha });
  return { id: data.user.id, a, token: s.session.access_token, email, senha };
};
const api = (token, rota, corpo) => fetch(`${SITE}${rota}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const itens = (v) => [{ descricao: 'Pastiglie freno', tipo: 'peca', quantidade: 1, valor_unitario: v - 100 }, { descricao: 'Manodopera', tipo: 'mao_de_obra', quantidade: 1, valor_unitario: 100 }];

async function cenario(cli, of, idOf) {
  const { data: v } = await cli.a.from('veiculos').insert({ profile_id: cli.id, fipe_tipo: 'cars', fipe_marca: 'Fiat', fipe_modelo: 'Panda', fipe_ano: '2020' }).select('id').single();
  const { data: s } = await cli.a.from('solicitacoes').insert({ cliente_id: cli.id, veiculo_id: v.id, tipo: 'mecanica', descricao: 'freni', urgencia: 'media', latitude: 59.43, longitude: 24.75, endereco: 'Tallinn' }).select('id').single();
  sols.push(s.id);
  const { data: o } = await of.a.from('orcamentos').insert({ solicitacao_id: s.id, oficina_id: idOf, valor_total: 300, prazo_dias: 2, tempo_execucao_horas: 4, validade: dia(10), garantia_dias: 30 }).select('id').single();
  await of.a.from('orcamento_itens').insert({ orcamento_id: o.id, descricao: 'Pastiglie', tipo: 'peca', quantidade: 1, valor_unitario: 300, valor_total: 300 });
  const { data: sl } = await of.a.from('orcamento_disponibilidade').insert({ orcamento_id: o.id, data_checkin: dia(1), turno: 'tarde', data_previsao_entrega: dia(3) }).select('id').single();
  const r = await api(cli.token, '/api/aceitar-orcamento', { orcamentoId: o.id, slotId: sl.id });
  return { solId: s.id, orcId: o.id, aceito: r.ok };
}

const browser = await chromium.launch({ executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1223/chrome-win64/chrome.exe') });
try {
  const cli = await conta('cliente'); const outroCli = await conta('cliente'); const of = await conta('oficina');
  const { data: o } = await sb.from('oficinas').insert({ profile_id: of.id, nome_fantasia: `REV ${tag}`, endereco: 'Narva mnt 5', cidade: 'Tallinn', estado: 'Harju', cep: '10117', pais: 'EE', latitude: 59.43, longitude: 24.75, ativa: true, raio_atendimento_km: 30, especialidades: ['mecanica'] }).select('id').single();
  ofs.push(o.id);

  // 1 + 2
  const c1 = await cenario(cli, of, o.id);
  ok('aceite inicial', c1.aceito);
  let r = await api(of.token, '/api/orcamento-revisao', { orcamentoId: c1.orcId, motivo: 'x', itens: itens(450) });
  ok('1 motivo curto recusado', r.status === 400);
  r = await api(cli.token, '/api/orcamento-revisao', { orcamentoId: c1.orcId, motivo: 'tentativa do cliente', itens: itens(450) });
  ok('5 cliente NAO propoe revisao', r.status === 403, r.status);
  r = await api(of.token, '/api/orcamento-revisao', { orcamentoId: c1.orcId, motivo: 'Dischi consumati oltre il limite', itens: itens(450), prazoDias: 3 });
  const d1 = await r.json();
  ok('1 oficina propoe revisao', r.ok && d1.revisaoId, JSON.stringify(d1));
  let { data: orc } = await sb.from('orcamentos').select('valor_total, status').eq('id', c1.orcId).single();
  ok('1 orcamento aceito NAO muda antes da decisao', Number(orc.valor_total) === 300 && orc.status === 'aceito');
  r = await api(of.token, '/api/orcamento-revisao', { orcamentoId: c1.orcId, motivo: 'Seconda proposta', itens: itens(500) });
  ok('1 so uma proposta pendente por vez', r.status === 409);
  const { data: n1 } = await sb.from('notificacoes').select('titulo').eq('profile_id', cli.id).eq('tipo', 'revisao_orcamento');
  ok('1 cliente avisado (italiano)', (n1 || []).some((n) => /revisione del preventivo/.test(n.titulo)), JSON.stringify(n1));

  // 6 tela do cliente
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'it-IT' });
  await ctx.addInitScript(() => { try { localStorage.setItem('bipfix_cookie_consent', 'denied'); } catch {} });
  const p = await ctx.newPage();
  await p.goto(`${SITE}/it/login`, { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', cli.email); await p.fill('input[type=password]', cli.senha); await p.click('button[type=submit]'); await p.waitForTimeout(4000);
  await p.goto(`${SITE}/it/cliente/orcamentos/${c1.solId}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  const corpo = await p.innerText('body');
  ok('6 tela mostra a proposta e os 3 botoes', /ha proposto una revisione/.test(corpo) && /Approva il nuovo importo/.test(corpo) && /mantieni l'originale/.test(corpo) && /ritira l'auto/i.test(corpo), corpo.replace(/\s+/g, ' ').slice(0, 200));
  ok('6 mostra +50%', /\+50%/.test(corpo));
  ok('6 sem rolagem lateral', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await p.screenshot({ path: 'revisao-cliente.png', fullPage: true });

  r = await api(of.token, '/api/orcamento-revisao/decidir', { revisaoId: d1.revisaoId, decisao: 'aprovar' });
  ok('5 oficina NAO decide pelo cliente', r.status === 403);
  r = await api(outroCli.token, '/api/orcamento-revisao/decidir', { revisaoId: d1.revisaoId, decisao: 'aprovar' });
  ok('5 outro cliente NAO decide', r.status === 403);
  await p.getByRole('button', { name: /Approva il nuovo importo/ }).click(); await p.waitForTimeout(3000);
  ok('2 cliente aprova pela tela', /Revisione approvata/.test(await p.innerText('body')));
  ({ data: orc } = await sb.from('orcamentos').select('valor_total, valor_original, revisao_numero, prazo_dias').eq('id', c1.orcId).single());
  ok('2 valor novo, original guardado, revisao +1, prazo novo', Number(orc.valor_total) === 450 && Number(orc.valor_original) === 300 && orc.revisao_numero === 1 && orc.prazo_dias === 3, JSON.stringify(orc));
  const { data: its } = await sb.from('orcamento_itens').select('descricao').eq('orcamento_id', c1.orcId);
  ok('2 itens trocados pelos da proposta', (its || []).length === 2);
  r = await api(cli.token, '/api/orcamento-revisao/decidir', { revisaoId: d1.revisaoId, decisao: 'recusar' });
  ok('5 decidir de novo e recusado', r.status === 409);
  const { data: nOf } = await sb.from('notificacoes').select('titulo').eq('profile_id', of.id).eq('tipo', 'revisao_orcamento_decidida');
  ok('2 oficina avisada da aprovacao', (nOf || []).length >= 1);

  // 3 recusar: segue o valor anterior
  r = await api(of.token, '/api/orcamento-revisao', { orcamentoId: c1.orcId, motivo: 'Altro pezzo da sostituire', itens: itens(600) });
  const d2 = await r.json();
  r = await api(cli.token, '/api/orcamento-revisao/decidir', { revisaoId: d2.revisaoId, decisao: 'recusar' });
  ({ data: orc } = await sb.from('orcamentos').select('valor_total, revisao_numero').eq('id', c1.orcId).single());
  ok('3 recusada: segue o valor aprovado antes (450)', r.ok && Number(orc.valor_total) === 450 && orc.revisao_numero === 1, JSON.stringify(orc));

  // 4 recusar e retirar
  const c2 = await cenario(cli, of, o.id);
  r = await api(of.token, '/api/orcamento-revisao', { orcamentoId: c2.orcId, motivo: 'Danno nascosto alla sospensione', itens: itens(900) });
  const d3 = await r.json();
  r = await api(cli.token, '/api/orcamento-revisao/decidir', { revisaoId: d3.revisaoId, decisao: 'retirar' });
  const { data: ag } = await sb.from('agenda').select('status').eq('solicitacao_id', c2.solId);
  const { data: s2 } = await sb.from('solicitacoes').select('status').eq('id', c2.solId).single();
  const { data: com } = await sb.from('comissao_lancamento').select('id').eq('orcamento_id', c2.orcId);
  ok('4 retirar: agenda e pedido cancelados, sem comissao', r.ok && (ag || []).every((a) => a.status === 'cancelado') && s2.status === 'cancelada' && !(com || []).length, `${JSON.stringify(ag)} ${s2.status}`);
  const { data: hist } = await sb.from('orcamento_revisoes').select('status').eq('oficina_id', o.id);
  ok('monitoramento: historico das propostas por oficina', (hist || []).map((h) => h.status).sort().join(',') === 'aprovada,recusada,retirada', JSON.stringify(hist));
  // RLS: cliente le as proprias revisoes; outro cliente nao
  const { data: ver1 } = await cli.a.from('orcamento_revisoes').select('id').eq('solicitacao_id', c1.solId);
  const { data: ver2 } = await outroCli.a.from('orcamento_revisoes').select('id').eq('solicitacao_id', c1.solId);
  const { error: eIns } = await cli.a.from('orcamento_revisoes').insert({ orcamento_id: c1.orcId, solicitacao_id: c1.solId, oficina_id: o.id, numero: 9, valor_anterior: 1, valor_novo: 2, motivo: 'forjado' });
  ok('5 RLS: dono le, outro nao, ninguem grava direto', (ver1 || []).length === 2 && !(ver2 || []).length && !!eIns);
} catch (e) { falhas++; console.log('FALHA parou:', String(e.stack).slice(0, 600)); }
finally {
  await browser.close();
  for (const sid of sols) {
    const { data: ags } = await sb.from('agenda').select('id').eq('solicitacao_id', sid);
    for (const a of ags || []) { await sb.from('manutencao_etapas').delete().eq('agenda_id', a.id); await sb.from('agenda_historico').delete().eq('agenda_id', a.id); }
    await sb.from('agenda').delete().eq('solicitacao_id', sid);
    const { data: orcs } = await sb.from('orcamentos').select('id').eq('solicitacao_id', sid);
    for (const x of orcs || []) { for (const t of ['orcamento_itens', 'orcamento_disponibilidade', 'comissao_lancamento', 'orcamento_revisoes']) await sb.from(t).delete().eq('orcamento_id', x.id); }
    await sb.from('mensagens').delete().eq('solicitacao_id', sid);
    await sb.from('orcamentos').delete().eq('solicitacao_id', sid);
    await sb.from('solicitacoes').delete().eq('id', sid);
  }
  for (const oid of ofs) { await sb.from('agenda').delete().eq('oficina_id', oid); await sb.from('comissao_config').delete().eq('oficina_id', oid); await sb.from('oficinas').delete().eq('id', oid); }
  for (const id of contas) { await sb.from('veiculos').delete().eq('profile_id', id); await sb.from('notificacoes').delete().eq('profile_id', id); await sb.from('profiles').delete().eq('id', id); await sb.auth.admin.deleteUser(id); }
  console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
}
